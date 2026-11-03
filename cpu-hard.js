/* Schach v4 – Computer Schwer.
   Schnittstelle: CPUHard.chooseMove({ state, legalMoves, engine, history? })

   Eigene, vollständig offline lauffähige Schach-KI. Iterative Vertiefung
   (bis zu 6 Halbzüge), Alpha-Beta mit Principal-Variation-Suche,
   Transpositionstabelle, Schlagzug-Ruhesuche, Killer-/History-Heuristik,
   selektive Zugreduktion und Stellungsbewertung (Material, Entwicklung,
   Bauernstruktur, Freibauern, Königssicherheit). Ein Zeit- und Knotenbudget
   begrenzt die synchrone Suche, damit sie auch lokal per file:// funktioniert.

   Die ChessCore-Engine erzeugt und prüft sämtliche legalen Züge.
*/
(function (root) {
  'use strict';

  const VALUE = Object.freeze({ p: 100, n: 325, b: 340, r: 520, q: 980, k: 0, '.': 0 });
  const MATE = 1000000;
  const INF = 2000000;
  const MAX_DEPTH = 6;
  const MAX_TIME_MS = 1350;
  const MAX_NODES = 70000;
  const STOP = Symbol('Schach Schwer: Suchbudget erschöpft');
  const PIECE = p => VALUE[(p || '.').toLowerCase()] || 0;
  const on = i => i >= 0 && i < 128 && !(i & 0x88);
  const colorOf = p => p === '.' ? 0 : p === p.toUpperCase() ? 1 : -1;
  const center = (r, f) => 7 - (Math.abs(f - 3.5) + Math.abs(r - 3.5));
  const isCapture = (s, m) => m.flag === 'ep' || s.board[m.to] !== '.';
  const moveEquals = (a, b) => !!a && !!b && a.from === b.from && a.to === b.to && a.promotion === b.promotion;
  const moveId = m => m.from * 128 + m.to + (m.promotion ? m.promotion.charCodeAt(0) * 16384 : 0);
  const transpositionKey = s => s.board.join('') + '/' + s.turn + '/' + s.castling + '/' + s.ep + '/' + s.halfmove;
  const repetitionKey = s => s.board.join('') + '/' + s.turn + '/' + s.castling + '/' + s.ep;

  // Positive Werte bewerten die Seite am Zug positiv. Keine externe Engine.
  function evaluate(s) {
    const board = s.board;
    const pawnFiles = [new Int8Array(8), new Int8Array(8)];
    const enemyPawnFront = [new Int8Array(8).fill(8), new Int8Array(8).fill(-1)];
    const bishops = [0, 0];
    const pawns = [];
    let nonPawnMaterial = 0;
    let score = 0;

    for (let i = 0; i < 128; i++) {
      if (i & 0x88) { i += 7; continue; }
      const p = board[i];
      if (p === '.') continue;
      const col = colorOf(p), side = col === 1 ? 0 : 1;
      const type = p.toLowerCase();
      const rank = i >> 4, file = i & 7;
      if (type === 'p') {
        pawnFiles[side][file]++;
        pawns.push([i, side]);
        if (side === 0) enemyPawnFront[1][file] = Math.max(enemyPawnFront[1][file], rank);
        else enemyPawnFront[0][file] = Math.min(enemyPawnFront[0][file], rank);
      } else if (type === 'b') bishops[side]++;
      if (type !== 'p' && type !== 'k') nonPawnMaterial += VALUE[type];
    }

    // 0 = Eröffnung/Mittelspiel, 1 = Endspiel.
    const endgame = 1 - Math.min(1, nonPawnMaterial / 5200);
    for (let i = 0; i < 128; i++) {
      if (i & 0x88) { i += 7; continue; }
      const p = board[i];
      if (p === '.') continue;
      const type = p.toLowerCase();
      const col = colorOf(p);
      const side = col === 1 ? 0 : 1;
      const rank = i >> 4, file = i & 7;
      const advance = col === 1 ? 6 - rank : rank - 1;
      const home = col === 1 ? 7 : 0;
      const c = center(rank, file);
      let bonus = 0;
      switch (type) {
        case 'p':
          bonus = advance * 8 + c * 5;
          if (file >= 2 && file <= 5) bonus += 7;
          // Bauernkette, die den Bauern von hinten deckt.
          for (const df of [-1, 1]) {
            const supporter = i + 16 * col + df;
            if (on(supporter) && board[supporter] === p) bonus += 9;
          }
          break;
        case 'n':
          bonus = c * (15 - endgame * 2) + (rank === home ? -28 : 9);
          if (advance >= 2 && advance <= 4) bonus += 7;
          break;
        case 'b':
          bonus = c * 8 + (rank === home ? -16 : 13);
          break;
        case 'r':
          bonus = advance * 2 + (advance === 5 ? 20 : 0);
          if (pawnFiles[side][file] === 0) bonus += pawnFiles[1 - side][file] === 0 ? 25 : 13;
          break;
        case 'q':
          bonus = c * 2 - (s.fullmove < 11 && rank !== home ? 14 : 0);
          break;
        case 'k': {
          const frontRank = rank - col;
          let shield = 0;
          if (frontRank >= 0 && frontRank < 8) {
            for (let f = Math.max(0, file - 1); f <= Math.min(7, file + 1); f++) {
              if (board[frontRank * 16 + f] === (col === 1 ? 'P' : 'p')) shield += 15;
            }
          }
          const safeFile = file === 6 || file === 2 ? 44 : 0;
          const middlegame = -c * 15 + (rank === home ? safeFile : -13) + shield;
          const ending = c * 16 + advance * 3;
          bonus = (1 - endgame) * middlegame + endgame * ending;
          break;
        }
      }
      score += col * (VALUE[type] + bonus);
    }

    // Strukturschwächen und Freibauern.
    for (let f = 0; f < 8; f++) {
      for (let side = 0; side <= 1; side++) {
        const count = pawnFiles[side][f];
        if (count >= 2) score += (side === 0 ? -1 : 1) * 17 * (count - 1);
      }
    }
    for (const [i, side] of pawns) {
      const file = i & 7, rank = i >> 4;
      const advance = side === 0 ? 6 - rank : rank - 1;
      const sign = side === 0 ? 1 : -1;
      const own = pawnFiles[side];
      if ((file === 0 || !own[file - 1]) && (file === 7 || !own[file + 1])) score -= sign * 12;
      let passed = true;
      for (let f = Math.max(0, file - 1); f <= Math.min(7, file + 1); f++) {
        if (side === 0 && enemyPawnFront[0][f] < rank) passed = false;
        if (side === 1 && enemyPawnFront[1][f] > rank) passed = false;
      }
      if (passed) score += sign * (15 + (advance * advance * (3 + endgame * 3)));
    }
    if (bishops[0] >= 2) score += 32;
    if (bishops[1] >= 2) score -= 32;
    return Math.round(score * s.turn) + 7; // Kleiner Tempobonus.
  }

  function chooseMove({ state, legalMoves, engine, history }) {
    if (!legalMoves || !legalMoves.length) return null;
    if (legalMoves.length === 1) return legalMoves[0];

    const start = Date.now();
    const tt = new Map();
    const killers = [];
    const moveHistory = new Map();
    const repetitions = new Map();
    if (Array.isArray(history)) {
      for (const past of history) {
        const key = repetitionKey(past);
        repetitions.set(key, (repetitions.get(key) || 0) + 1);
      }
    } else {
      repetitions.set(repetitionKey(state), 1);
    }
    let nodes = 0;
    let best = legalMoves[0];
    let principal = null;

    function tick() {
      nodes++;
      if (nodes >= MAX_NODES || ((nodes & 63) === 0 && Date.now() - start >= MAX_TIME_MS)) throw STOP;
    }

    function movePriority(s, move, hashMove, ply) {
      if (moveEquals(move, hashMove)) return 20000000;
      const attacker = PIECE(s.board[move.from]);
      const victim = move.flag === 'ep' ? 100 : PIECE(s.board[move.to]);
      if (victim) return 900000 + victim * 20 - attacker;
      if (move.promotion) return 910000 + PIECE(move.promotion) * 12;
      if (killers[ply] && moveEquals(move, killers[ply][0])) return 750000;
      if (killers[ply] && moveEquals(move, killers[ply][1])) return 740000;
      return (moveHistory.get(moveId(move)) || 0) + (move.flag === 'castle' ? 1000 : 0);
    }
    function ordered(s, moves, hashMove, ply) {
      return moves.slice().sort((a, b) => movePriority(s, b, hashMove, ply) - movePriority(s, a, hashMove, ply));
    }
    function saveKiller(move, ply, depth) {
      const pair = killers[ply] || (killers[ply] = [null, null]);
      if (!moveEquals(pair[0], move)) { pair[1] = pair[0]; pair[0] = move; }
      const id = moveId(move);
      moveHistory.set(id, Math.min(100000, (moveHistory.get(id) || 0) + depth * depth * 8));
    }
    function scoreForTable(value, ply) {
      return value > MATE - 10000 ? value + ply : value < -MATE + 10000 ? value - ply : value;
    }
    function scoreFromTable(value, ply) {
      return value > MATE - 10000 ? value - ply : value < -MATE + 10000 ? value + ply : value;
    }

    function quiescence(s, alpha, beta, ply, remaining) {
      tick();
      if (s.halfmove >= 150 || engine.insufficientMaterial(s)) return 0;
      const check = engine.inCheck(s);
      const standing = evaluate(s);
      if (!check) {
        if (standing >= beta) return standing;
        if (standing > alpha) alpha = standing;
      }
      const moves = engine.legal(s);
      if (!moves.length) return check ? -MATE + ply : 0;
      if (remaining <= -2 || (remaining <= 0 && !check)) return check ? standing - 75 : alpha;
      const tacticals = check ? moves : moves.filter(m => isCapture(s, m) || m.promotion);
      for (const move of ordered(s, tacticals, null, ply)) {
        // Delta-Pruning nur für gewöhnliche Schläge ohne Schachzwang.
        if (!check && !move.promotion) {
          const gain = move.flag === 'ep' ? 100 : PIECE(s.board[move.to]);
          if (standing + gain + 190 < alpha) continue;
        }
        const score = -quiescence(engine.apply(s, move), -beta, -alpha, ply + 1, remaining - 1);
        if (score >= beta) return score;
        if (score > alpha) alpha = score;
      }
      return alpha;
    }

    function search(s, depth, alpha, beta, ply) {
      tick();
      if (s.halfmove >= 150 || engine.insufficientMaterial(s)) return 0;
      const repetition = repetitionKey(s);
      if ((repetitions.get(repetition) || 0) >= 2) return 0;
      if (depth <= 0) return quiescence(s, alpha, beta, ply, 3);
      const originalAlpha = alpha;
      const key = transpositionKey(s);
      const cached = tt.get(key);
      if (cached && cached.depth >= depth) {
        const value = scoreFromTable(cached.value, ply);
        if (cached.bound === 'exact') return value;
        if (cached.bound === 'lower' && value >= beta) return value;
        if (cached.bound === 'upper' && value <= alpha) return value;
      }
      const moves = engine.legal(s);
      if (!moves.length) return engine.inCheck(s) ? -MATE + ply : 0;
      const check = engine.inCheck(s);
      const sorted = ordered(s, moves, cached && cached.move, ply);
      let bestValue = -INF;
      let bestMove = sorted[0];
      repetitions.set(repetition, (repetitions.get(repetition) || 0) + 1);
      try {
        for (let i = 0; i < sorted.length; i++) {
          const move = sorted[i];
          const next = engine.apply(s, move);
          const quiet = !isCapture(s, move) && !move.promotion;
          const givesCheck = quiet && depth >= 3 && i >= 5 && engine.inCheck(next);
          let score;
          // Späte, unauffällige Züge zunächst verkürzt prüfen; interessante
          // Varianten werden sofort wieder mit voller Tiefe analysiert.
          if (depth >= 3 && i >= 5 && quiet && !check && !givesCheck) {
            score = -search(next, depth - 2, -alpha - 1, -alpha, ply + 1);
            if (score > alpha) score = -search(next, depth - 1, -alpha - 1, -alpha, ply + 1);
          } else if (i > 0) {
            score = -search(next, depth - 1, -alpha - 1, -alpha, ply + 1);
          } else {
            score = -search(next, depth - 1, -beta, -alpha, ply + 1);
          }
          // Principal Variation Search: nach Nullfenster-Treffer nachrechnen.
          if (i > 0 && score > alpha && score < beta) {
            score = -search(next, depth - 1, -beta, -alpha, ply + 1);
          }
          if (score > bestValue) { bestValue = score; bestMove = move; }
          if (score > alpha) alpha = score;
          if (alpha >= beta) {
            if (quiet) saveKiller(move, ply, depth);
            break;
          }
        }
      } finally {
        const count = repetitions.get(repetition) - 1;
        if (!count) repetitions.delete(repetition);
        else repetitions.set(repetition, count);
      }
      const bound = bestValue <= originalAlpha ? 'upper' : bestValue >= beta ? 'lower' : 'exact';
      if (tt.size < 65000 || tt.has(key)) {
        tt.set(key, { depth, value: scoreForTable(bestValue, ply), bound, move: bestMove });
      }
      return bestValue;
    }

    // Der letzte VOLLSTÄNDIG berechnete Tiefendurchlauf zählt.
    for (let depth = 1; depth <= MAX_DEPTH; depth++) {
      const rows = [];
      const candidates = ordered(state, legalMoves, principal, 0);
      let alpha = -INF;
      try {
        for (let i = 0; i < candidates.length; i++) {
          const move = candidates[i];
          const next = engine.apply(state, move);
          // Volles Suchfenster am Wurzelknoten: exakte Bewertung aller
          // möglichen Züge, keine Auswahl anhand bloßer Schranken.
          const value = -search(next, depth - 1, -INF, INF, 1);
          rows.push({ move, value });
          if (value > alpha) alpha = value;
        }
        rows.sort((a, b) => b.value - a.value);
        if (rows.length) {
          best = rows[0].move;
          principal = best;
          if (rows[0].value >= MATE - 100) break; // forciertes Matt gefunden.
        }
      } catch (error) {
        if (error !== STOP) throw error;
        break;
      }
      if (Date.now() - start >= MAX_TIME_MS * .85) break;
    }
    return best;
  }

  root.CPUHard = Object.freeze({ chooseMove });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CPUHard;
})(typeof window !== 'undefined' ? window : globalThis);
