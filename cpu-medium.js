/* Schach v3 – mittlerer Computergegner.
   Schnittstelle: CPUMedium.chooseMove({ state, legalMoves, engine })

   Sucht mit iterativer Vertiefung bis zu drei Halbzüge voraus.
   Alpha-Beta-Pruning, Schlagzug-Suche und eine Stellungsbewertung helfen,
   einfache Drohungen zu erkennen, Material zu schützen und sich zu entwickeln.
   Ein festes Zeit-/Knotenbudget hält die lokale Browserpartie reaktionsfähig.
   Schachregeln und legale Züge kommen ausschließlich aus chess-engine.js.
*/
(function (root) {
  'use strict';

  const VALUE = Object.freeze({ p: 100, n: 325, b: 340, r: 510, q: 940, k: 20000, '.': 0 });
  const MATE = 100000;
  const INF = 1000000;
  const MAX_TIME_MS = 520;
  const MAX_NODES = 14000;
  const ABORT = Symbol('search budget reached');
  const value = piece => VALUE[(piece || '.').toLowerCase()] || 0;

  // Positive Werte sind gut für die am Zug befindliche Farbe.
  function evaluate(state) {
    let score = 0;
    let nonPawnMaterial = 0;
    for (let i = 0; i < 128; i++) {
      if (i & 0x88) { i += 7; continue; }
      const piece = state.board[i];
      if (piece === '.') continue;
      const type = piece.toLowerCase();
      if (type !== 'p' && type !== 'k') nonPawnMaterial += VALUE[type];
    }
    const endgame = nonPawnMaterial < 2300;
    for (let i = 0; i < 128; i++) {
      if (i & 0x88) { i += 7; continue; }
      const piece = state.board[i];
      if (piece === '.') continue;
      const color = piece === piece.toUpperCase() ? 1 : -1;
      const type = piece.toLowerCase();
      const rank = i >> 4;
      const file = i & 7;
      const centrality = 3.5 - (Math.abs(file - 3.5) + Math.abs(rank - 3.5)) / 2;
      const forward = color === 1 ? 6 - rank : rank - 1;
      const home = color === 1 ? 7 : 0;
      let bonus = 0;

      if (type === 'p') {
        bonus = forward * 9 + centrality * 9;
        if (file >= 2 && file <= 5) bonus += 7;
      } else if (type === 'n') {
        bonus = centrality * 23 + (rank !== home ? 10 : -8);
      } else if (type === 'b') {
        bonus = centrality * 13 + (rank !== home ? 12 : -5);
      } else if (type === 'r') {
        bonus = forward * 2 + (rank === (color === 1 ? 1 : 6) ? 13 : 0);
      } else if (type === 'q') {
        bonus = centrality * 4;
        if (state.fullmove < 9 && rank !== home) bonus -= 16;
      } else if (type === 'k') {
        if (endgame) bonus = centrality * 23;
        else {
          bonus = (rank === home && (file === 6 || file === 2) ? 36 : 0) - centrality * 13;
          // Eine Bauernreihe vor dem König ist in der Eröffnung wertvoll.
          const shieldRank = rank - color;
          if (shieldRank >= 0 && shieldRank <= 7) {
            for (let f = Math.max(0, file - 1); f <= Math.min(7, file + 1); f++) {
              if (state.board[shieldRank * 16 + f] === (color === 1 ? 'P' : 'p')) bonus += 9;
            }
          }
        }
      }
      score += color * (VALUE[type] + bonus);
    }
    return score * state.turn;
  }

  function isCapture(state, move) {
    return move.flag === 'ep' || state.board[move.to] !== '.';
  }

  // Gute Schläge zuerst prüfen, damit Alpha-Beta mehr Zweige abschneiden kann.
  function orderScore(state, move) {
    const piece = state.board[move.from];
    const victim = move.flag === 'ep' ? 'p' : state.board[move.to];
    let score = victim !== '.' ? value(victim) * 12 - value(piece) : 0;
    if (move.promotion) score += value(move.promotion) * 11;
    if (move.flag === 'castle') score += 70;
    const rank = move.to >> 4;
    const file = move.to & 7;
    score += 5 * (3.5 - (Math.abs(file - 3.5) + Math.abs(rank - 3.5)) / 2);
    return score;
  }

  function ordered(state, moves) {
    return moves.map(move => ({ move, priority: orderScore(state, move) }))
      .sort((a, b) => b.priority - a.priority)
      .map(item => item.move);
  }

  function chooseMove({ state, legalMoves, engine }) {
    if (!legalMoves || legalMoves.length === 0) return null;
    if (legalMoves.length === 1) return legalMoves[0];

    const rootMoves = ordered(state, legalMoves);
    const deadline = Date.now() + MAX_TIME_MS;
    let nodes = 0;
    let best = rootMoves[0];
    let previousScores = null;

    function tick() {
      nodes++;
      // Periodische Budget-Prüfung statt teurer Uhrabfrage an jedem Knoten.
      if (nodes > MAX_NODES || ((nodes & 31) === 0 && Date.now() >= deadline)) throw ABORT;
    }

    // Ruhesuche: gezielt Schläge prüfen, um das unmittelbare Übersehen
    // einer Rücknahme am Suchhorizont zu vermeiden.
    function quiescence(s, alpha, beta, remaining, ply) {
      tick();
      if (s.halfmove >= 150) return 0;
      const checked = engine.inCheck(s);
      const standing = evaluate(s);
      if (!checked) {
        if (standing >= beta) return standing;
        if (standing > alpha) alpha = standing;
        if (remaining === 0) return standing;
      }
      const all = engine.legal(s);
      if (all.length === 0) return checked ? -MATE + ply : 0;
      if (remaining === 0) return standing;
      const candidates = checked ? all : all.filter(m => isCapture(s, m) || m.promotion);
      if (!candidates.length) return alpha;
      // Nur die aussichtsreichsten Schlagfolgen: begrenzt die Suchzeit.
      for (const move of ordered(s, candidates).slice(0, 10)) {
        const score = -quiescence(engine.apply(s, move), -beta, -alpha, remaining - 1, ply + 1);
        if (score >= beta) return score;
        if (score > alpha) alpha = score;
      }
      return alpha;
    }

    function search(s, depth, alpha, beta, ply) {
      tick();
      if (s.halfmove >= 150) return 0;
      if (depth === 0) return quiescence(s, alpha, beta, 2, ply);
      const moves = engine.legal(s);
      if (moves.length === 0) return engine.inCheck(s) ? -MATE + ply : 0;
      if (engine.insufficientMaterial(s)) return 0;
      let bestScore = -INF;
      for (const move of ordered(s, moves)) {
        const score = -search(engine.apply(s, move), depth - 1, -beta, -alpha, ply + 1);
        if (score > bestScore) bestScore = score;
        if (score > alpha) alpha = score;
        if (alpha >= beta) break;
      }
      return bestScore;
    }

    // Schon die vollständig berechnete Zweizug-Suche verhindert viele
    // direkte Einsteller. Die Dreizug-Suche wird nur bei genug Zeit genutzt.
    for (const depth of [2, 3]) {
      const ranked = [];
      try {
        const sequence = previousScores
          ? rootMoves.slice().sort((a, b) => (previousScores.get(engine.uci(b)) || -INF) -
                                          (previousScores.get(engine.uci(a)) || -INF))
          : rootMoves;
        // Volles Suchfenster für jeden Wurzelzug: auch nahezu gleich gute
        // Alternativen werden exakt bewertet statt als Alpha-Beta-Schranke.
        for (const move of sequence) {
          const score = -search(engine.apply(state, move), depth - 1, -INF, INF, 1);
          ranked.push({ move, score });
        }
        ranked.sort((a, b) => b.score - a.score);
        previousScores = new Map(ranked.map(result => [engine.uci(result.move), result.score]));
        // Bei nahezu gleicher Bewertung etwas Abwechslung, nie absichtlich
        // um Material zu verschenken.
        const choices = ranked.filter(item => item.score >= ranked[0].score - 12);
        best = choices[Math.floor(Math.random() * choices.length)].move;
      } catch (error) {
        if (error !== ABORT) throw error;
        break; // Nur ein vollständig durchsuchter Suchtiefen-Durchlauf zählt.
      }
    }
    return best;
  }

  root.CPUMedium = Object.freeze({ chooseMove });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CPUMedium;
})(typeof window !== 'undefined' ? window : globalThis);
