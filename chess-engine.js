/* Schach v4 — kleine, unabhängige Schach-Engine (0x88-Brett).
   Enthält vollständige legale Zugprüfung einschließlich Rochade, en passant,
   Umwandlung, Schach, Matt, Patt und FIDE-Remisregeln. Keine Bibliotheken nötig. */
(function (root) {
  'use strict';

  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const GLYPHS = Object.freeze({
    K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
    k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '\u265F\uFE0E', '.': ''
  });
  const DIRECTIONS = {
    n: [-33, -31, -18, -14, 14, 18, 31, 33],
    b: [-17, -15, 15, 17],
    r: [-16, -1, 1, 16],
    k: [-17, -16, -15, -1, 1, 15, 16, 17]
  };
  DIRECTIONS.q = [...DIRECTIONS.b, ...DIRECTIONS.r];
  const ROOK_RIGHTS = { 119: 1, 112: 2, 7: 4, 0: 8 };

  function isOnBoard(i) { return i >= 0 && i < 128 && !(i & 0x88); }
  function side(piece) {
    return !piece || piece === '.' ? 0 : piece === piece.toUpperCase() ? 1 : -1;
  }
  function square(i) { return 'abcdefgh'[i & 7] + (8 - (i >> 4)); }
  function index(name) { return (8 - Number(name[1])) * 16 + 'abcdefgh'.indexOf(name[0]); }
  function uci(move) { return square(move.from) + square(move.to) + (move.promotion || ''); }

  function parseFen(fen) {
    const parts = fen.trim().split(/\s+/);
    if (parts.length !== 6) throw new Error('Ungültige FEN.');
    const ranks = parts[0].split('/');
    if (ranks.length !== 8 || !/^[wb]$/.test(parts[1]) ||
        !/^(?:-|K?Q?k?q?)$/.test(parts[2]) ||
        !/^(?:-|[a-h][36])$/.test(parts[3])) throw new Error('Ungültige FEN.');
    const board = Array(128).fill('.');
    ranks.forEach((rank, row) => {
      let col = 0;
      for (const ch of rank) {
        if (/^[1-8]$/.test(ch)) col += Number(ch);
        else {
          if (!/^[prnbqkPRNBQK]$/.test(ch) || col >= 8) throw new Error('Ungültige FEN-Reihe.');
          board[row * 16 + col++] = ch;
        }
      }
      if (col !== 8) throw new Error('Ungültige FEN-Reihe.');
    });
    if (board.filter(p => p === 'K').length !== 1 || board.filter(p => p === 'k').length !== 1)
      throw new Error('Jede Farbe benötigt genau einen König.');
    const castling = (parts[2].includes('K') ? 1 : 0) |
                     (parts[2].includes('Q') ? 2 : 0) |
                     (parts[2].includes('k') ? 4 : 0) |
                     (parts[2].includes('q') ? 8 : 0);
    const halfmove = Number(parts[4]);
    const fullmove = Number(parts[5]);
    if (!Number.isInteger(halfmove) || halfmove < 0 || !Number.isInteger(fullmove) || fullmove < 1)
      throw new Error('Ungültige FEN-Zugzähler.');
    return { board, turn: parts[1] === 'w' ? 1 : -1, castling,
      ep: parts[3] === '-' ? -1 : index(parts[3]), halfmove, fullmove };
  }
  const initialState = () => parseFen(START_FEN);

  // Ist das Feld aus Sicht der gegebenen Farbe angegriffen? (unabhängig von Schachgeboten)
  function isSquareAttacked(state, target, byColor) {
    for (let from = 0; from < 128; from++) {
      if (!isOnBoard(from) || side(state.board[from]) !== byColor) continue;
      const type = state.board[from].toLowerCase();
      if (type === 'p') {
        if (target === from - 16 * byColor - 1 || target === from - 16 * byColor + 1) return true;
        continue;
      }
      for (const direction of DIRECTIONS[type]) {
        for (let to = from + direction; isOnBoard(to); to += direction) {
          if (to === target) return true;
          if (state.board[to] !== '.' || type === 'n' || type === 'k') break;
        }
      }
    }
    return false;
  }

  function inCheck(state, color = state.turn) {
    return isSquareAttacked(state, state.board.indexOf(color === 1 ? 'K' : 'k'), -color);
  }

  // Jeder Zug erzeugt einen vollständigen neuen Zustand. Undo stellt damit auch
  // Rochaderechte, en-passant-Feld und Zugzähler exakt wieder her.
  function apply(state, move) {
    const { from, to, promotion, flag = '' } = move;
    const board = state.board.slice();
    const piece = board[from];
    const captured = board[to];
    let castling = state.castling;
    board[from] = '.';
    board[to] = promotion ? (state.turn === 1 ? promotion.toUpperCase() : promotion) : piece;
    if (flag === 'ep') board[to + 16 * state.turn] = '.';
    if (flag === 'castle') {
      const rookFrom = to > from ? from + 3 : from - 4;
      const rookTo = to > from ? from + 1 : from - 1;
      board[rookTo] = board[rookFrom];
      board[rookFrom] = '.';
    }
    if (piece === 'K') castling &= ~3;
    if (piece === 'k') castling &= ~12;
    if (piece.toLowerCase() === 'r') castling &= ~(ROOK_RIGHTS[from] || 0);
    if (captured.toLowerCase() === 'r') castling &= ~(ROOK_RIGHTS[to] || 0);
    const pawnMove = piece.toLowerCase() === 'p';
    return {
      board,
      turn: -state.turn,
      castling,
      ep: pawnMove && Math.abs(to - from) === 32 ? (to + from) / 2 : -1,
      halfmove: pawnMove || captured !== '.' || flag === 'ep' ? 0 : state.halfmove + 1,
      fullmove: state.fullmove + (state.turn === -1 ? 1 : 0)
    };
  }

  function pseudoLegal(state) {
    const moves = [];
    const board = state.board;
    for (let from = 0; from < 128; from++) {
      if (!isOnBoard(from) || side(board[from]) !== state.turn) continue;
      const type = board[from].toLowerCase();
      const add = (to, flag = '') => {
        if (board[to].toLowerCase() === 'k') return; // Könige werden nicht geschlagen
        if (type === 'p' && ((to >> 4) === 0 || (to >> 4) === 7)) {
          for (const promotion of ['q', 'r', 'b', 'n']) moves.push({ from, to, promotion, flag });
        } else moves.push({ from, to, promotion: '', flag });
      };
      if (type === 'p') {
        const next = from - 16 * state.turn;
        if (isOnBoard(next) && board[next] === '.') {
          add(next);
          const jump = next - 16 * state.turn;
          if ((from >> 4) === (state.turn === 1 ? 6 : 1) && board[jump] === '.') add(jump);
        }
        for (const delta of [-1, 1]) {
          const to = next + delta;
          if (!isOnBoard(to)) continue;
          if (side(board[to]) === -state.turn) add(to);
          else if (to === state.ep && board[to] === '.' &&
                   board[to + 16 * state.turn] === (state.turn === 1 ? 'p' : 'P')) add(to, 'ep');
        }
      } else {
        for (const direction of DIRECTIONS[type]) {
          for (let to = from + direction; isOnBoard(to); to += direction) {
            if (side(board[to]) === state.turn) break;
            add(to);
            if (board[to] !== '.' || type === 'n' || type === 'k') break;
          }
        }
        const home = state.turn === 1 ? 116 : 4;
        const rook = state.turn === 1 ? 'R' : 'r';
        const rights = state.turn === 1 ? [1, 2] : [4, 8];
        if (type === 'k' && from === home && !inCheck(state)) {
          if ((state.castling & rights[0]) && board[from + 3] === rook &&
              board[from + 1] === '.' && board[from + 2] === '.' &&
              !isSquareAttacked(state, from + 1, -state.turn) &&
              !isSquareAttacked(state, from + 2, -state.turn)) add(from + 2, 'castle');
          if ((state.castling & rights[1]) && board[from - 4] === rook &&
              board[from - 1] === '.' && board[from - 2] === '.' && board[from - 3] === '.' &&
              !isSquareAttacked(state, from - 1, -state.turn) &&
              !isSquareAttacked(state, from - 2, -state.turn)) add(from - 2, 'castle');
        }
      }
    }
    return moves;
  }

  function legal(state) { return pseudoLegal(state).filter(move => !inCheck(apply(state, move), state.turn)); }

  function san(state, move) {
    const type = state.board[move.from].toUpperCase();
    const captured = state.board[move.to] !== '.' || move.flag === 'ep';
    let text = '';
    if (move.flag === 'castle') text = move.to > move.from ? 'O-O' : 'O-O-O';
    else {
      if (type !== 'P') {
        text = type;
        const alternatives = legal(state).filter(m => m.from !== move.from && m.to === move.to &&
          state.board[m.from] === state.board[move.from]);
        if (alternatives.length) {
          const sameFile = alternatives.some(m => (m.from & 7) === (move.from & 7));
          const sameRank = alternatives.some(m => (m.from >> 4) === (move.from >> 4));
          text += !sameFile ? square(move.from)[0] : !sameRank ? square(move.from)[1] : square(move.from);
        }
      } else if (captured) text = square(move.from)[0];
      text += (captured ? 'x' : '') + square(move.to) + (move.promotion ? '=' + move.promotion.toUpperCase() : '');
    }
    const after = apply(state, move);
    if (inCheck(after)) text += legal(after).length ? '+' : '#';
    return text;
  }

  function positionKey(state) {
    // En passant zählt nur dann zum Stellungsmerkmal, wenn ein legaler Schlagzug existiert.
    const effectiveEp = state.ep >= 0 && legal(state).some(m => m.flag === 'ep') ? state.ep : -1;
    return state.board.join('') + ':' + state.turn + ':' + state.castling + ':' + effectiveEp;
  }

  function insufficientMaterial(state) {
    const pieces = [];
    for (let i = 0; i < 128; i++) {
      if (!isOnBoard(i)) continue;
      const type = state.board[i].toLowerCase();
      if (type !== '.' && type !== 'k') pieces.push({ type, colorOfSquare: ((i >> 4) + (i & 7)) % 2 });
    }
    return pieces.length === 0 ||
      (pieces.length === 1 && ['n', 'b'].includes(pieces[0].type)) ||
      (pieces.every(p => p.type === 'b') && new Set(pieces.map(p => p.colorOfSquare)).size === 1);
  }

  function status(history, claimedDraw = '') {
    const state = history[history.length - 1];
    if (claimedDraw) return { finished: true, type: 'draw', title: 'Remis', description: claimedDraw, claim: '' };
    const moves = legal(state);
    if (moves.length === 0) {
      if (inCheck(state)) {
        return { finished: true, type: 'mate', winner: -state.turn, title: 'Schachmatt',
          description: (state.turn === 1 ? 'Schwarz' : 'Weiß') + ' gewinnt die Partie.', claim: '' };
      }
      return { finished: true, type: 'draw', title: 'Patt', description: 'Keine legalen Züge mehr. Die Partie endet remis.', claim: '' };
    }
    if (insufficientMaterial(state)) return { finished: true, type: 'draw', title: 'Remis', description: 'Unzureichendes Mattmaterial.', claim: '' };
    const signature = positionKey(state);
    const repetitions = history.filter(s => positionKey(s) === signature).length;
    if (state.halfmove >= 150) return { finished: true, type: 'draw', title: 'Remis', description: '75-Züge-Regel.', claim: '' };
    if (repetitions >= 5) return { finished: true, type: 'draw', title: 'Remis', description: 'Fünffache Stellungswiederholung.', claim: '' };
    return { finished: false, type: inCheck(state) ? 'check' : 'playing', title: '', description: '',
      claim: repetitions >= 3 ? 'Dreifache Stellungswiederholung' : state.halfmove >= 100 ? '50-Züge-Regel' : '' };
  }

  const ChessCore = Object.freeze({
    START_FEN, GLYPHS, parseFen, initialState, side, square, index, uci,
    isOnBoard, isSquareAttacked, inCheck, apply, legal, san,
    positionKey, insufficientMaterial, status
  });
  root.ChessCore = ChessCore;
  if (typeof module !== 'undefined' && module.exports) module.exports = ChessCore;
})(typeof window !== 'undefined' ? window : globalThis);
