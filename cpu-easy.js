/* Schach v3 – leichter Computergegner.
   Die gesamte Computer-Taktik liegt ausschließlich hier.
   Schnittstelle: CPUEasy.chooseMove({ state, legalMoves, engine })
   Die Engine prüft die Legalität; diese Datei bewertet nur zulässige Züge.

   Diese KI sucht keinen tiefen Variantenbaum. Sie bevorzugt einfache Schläge,
   Entwicklung und gelegentliche Schachgebote, macht aber bewusst Fehler.
*/
(function (root) {
  'use strict';

  const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000, '.': 0 };
  const value = piece => VALUE[(piece || '.').toLowerCase()] || 0;
  const randomBetween = (low, high) => low + Math.random() * (high - low);

  function rateMove(state, move, engine) {
    const piece = state.board[move.from];
    const type = piece.toLowerCase();
    const captured = move.flag === 'ep' ? 'p' : state.board[move.to];
    const toFile = move.to & 7;
    const toRank = move.to >> 4;
    const fromRank = move.from >> 4;
    const after = engine.apply(state, move);
    let score = randomBetween(-68, 68);

    // Offensichtliche Materialgewinne, mit absichtlich unvollkommener Gewichtung.
    if (captured !== '.') score += value(captured) * 0.76 - value(piece) * 0.08;
    if (move.promotion) score += value(move.promotion) * 0.92;
    if (move.flag === 'castle') score += 45;

    // Mitte und Figurenentwicklung sind etwas besser als ziellose Züge.
    const center = 3.5 - (Math.abs(toFile - 3.5) + Math.abs(toRank - 3.5)) / 2;
    score += center * (type === 'p' || type === 'n' ? 15 : 8);
    if (['n', 'b'].includes(type) && (fromRank === 0 || fromRank === 7)) score += 24;
    if (type === 'q' && (fromRank === 0 || fromRank === 7) && state.fullmove < 7) score -= 23;

    // Einfache 1-Zug-Taktik, aber kein tiefer Suchalgorithmus.
    if (engine.inCheck(after)) {
      score += 60;
      if (!engine.legal(after).length) score += 10000; // Matt in einem Zug
    }
    const inDanger = engine.isSquareAttacked(after, move.to, after.turn);
    if (inDanger) {
      const defended = engine.isSquareAttacked(after, move.to, -after.turn);
      score -= value(piece) * (defended ? 0.25 : 0.48);
      if (captured !== '.') score += Math.min(95, value(captured) * 0.16);
    }
    if (type === 'k' && move.flag !== 'castle' && state.fullmove < 14) score -= 45;
    return score;
  }

  function chooseMove({ state, legalMoves, engine }) {
    if (!legalMoves || legalMoves.length === 0) return null;
    if (legalMoves.length === 1) return legalMoves[0];

    // Ein leichter Gegner nimmt gelegentlich auch einen schwachen Zufallszug.
    if (Math.random() < 0.12) return legalMoves[Math.floor(Math.random() * legalMoves.length)];

    const ranked = legalMoves.map(move => ({ move, score: rateMove(state, move, engine) }))
      .sort((a, b) => b.score - a.score);
    const candidates = ranked.slice(0, Math.min(5, ranked.length))
      .filter(entry => entry.score >= ranked[0].score - 135);
    const weights = candidates.map((entry, index) => Math.exp((entry.score - ranked[0].score) / 55) * (1 - index * 0.07));
    let pick = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
    for (let i = 0; i < candidates.length; i++) {
      pick -= weights[i];
      if (pick <= 0) return candidates[i].move;
    }
    return candidates[0].move;
  }

  root.CPUEasy = Object.freeze({ chooseMove });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CPUEasy;
})(typeof window !== 'undefined' ? window : globalThis);
