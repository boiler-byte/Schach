/* Schach v4 — Startmenü, freie Spielerwahl, Zuschauerbetrieb, Animationen und Audio.
   Schachregeln: chess-engine.js    CPU-Taktik: cpu-easy.js / cpu-medium.js / cpu-hard.js
   Läuft ohne Server, Accounts, Internet oder externe Bibliotheken. */
(function () {
  'use strict';
  const C = window.ChessCore;
  const CPUS = { easy: window.CPUEasy, medium: window.CPUMedium, hard: window.CPUHard };
  if (!C || !CPUS.easy || !CPUS.medium || !CPUS.hard) throw new Error('Schach: Engine oder Computer-Modul fehlt.');

  const $ = id => document.getElementById(id);
  const board = $('board');
  const animationLayer = $('animationLayer');
  const promotionOverlay = $('promotionOverlay');
  const moveList = $('movesList');
  const STORAGE = 'schach-v4-game';
  const SETTINGS_STORAGE = 'schach-v4-settings';
  const LEGACY_STORAGE = ['schach-v3-game', 'schach-v2-game', 'schach-v1-game'];
  const LEGACY_SETTINGS_STORAGE = ['schach-v3-settings', 'schach-v2-settings', 'schach-v1-settings'];
  const VALID_CONTROLLERS = ['human', 'easy', 'medium', 'hard'];
  const CONTROLLER_NAMES = { human: 'Spieler', easy: 'Computer Leicht', medium: 'Computer Mittel', hard: 'Computer Schwer' };
  const LEVEL_NAMES = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer' };
  const PIECE_NAMES = { k: 'König', q: 'Dame', r: 'Turm', b: 'Läufer', n: 'Springer', p: 'Bauer' };
  const PROMOTION_NAMES = { q: 'Dame', r: 'Turm', b: 'Läufer', n: 'Springer' };
  const ORDER_OF_CAPTURES = { q: 0, r: 1, b: 2, n: 3, p: 4 };
  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

  const game = {
    players: { white: 'human', black: 'human' },
    screen: 'menu',
    hasGame: false,
    paused: false,
    stepOnce: false,
    sound: true,
    flipped: false,
    history: [C.initialState()],
    records: [],
    selected: -1,
    promotionMoves: null,
    claimedDraw: '',
    thinking: false
  };
  const setup = { white: 'human', black: 'human' };
  const statusCache = { state: null, length: 0, claim: '', result: null };
  let cpuGeneration = 0;
  let cpuTimer = null;
  let dragSource = -1;
  let dropHandled = false;
  let animationTimers = [];
  let audioContext = null;

  function current() { return game.history[game.history.length - 1]; }
  function gameStatus() {
    const state = current();
    if (statusCache.state !== state || statusCache.length !== game.history.length || statusCache.claim !== game.claimedDraw) {
      statusCache.state = state;
      statusCache.length = game.history.length;
      statusCache.claim = game.claimedDraw;
      statusCache.result = C.status(game.history, game.claimedDraw);
    }
    return statusCache.result;
  }
  const controllerFor = color => game.players[color === 1 ? 'white' : 'black'];
  const bothComputers = () => game.players.white !== 'human' && game.players.black !== 'human';
  function isHumanTurn() { return controllerFor(current().turn) === 'human'; }
  function canMove() { return game.screen === 'game' && !game.thinking && !game.promotionMoves && !gameStatus().finished && isHumanTurn(); }
  const normalizeController = value => VALID_CONTROLLERS.includes(value) ? value : 'human';
  function normalizePlayers(saved) {
    if (saved && saved.players) return {
      white: normalizeController(saved.players.white),
      black: normalizeController(saved.players.black)
    };
    // v1/v2-Modus auf das freie Spielermodell abbilden.
    return saved && saved.mode === 'cpu' ?
      { white: 'human', black: saved.difficulty === 'medium' ? 'medium' : 'easy' } :
      { white: 'human', black: 'human' };
  }
  function storageRead(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
  }
  function storageWrite(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* im Privatmodus optional */ }
  }
  function readLegacy(keys) {
    for (const key of keys) {
      const result = storageRead(key);
      if (result) return result;
    }
    return null;
  }
  function saveSettings() {
    storageWrite(SETTINGS_STORAGE, { sound: game.sound, setup: { ...setup } });
  }
  function save() {
    storageWrite(STORAGE, {
      active: game.hasGame,
      players: { ...game.players },
      flipped: game.flipped,
      paused: game.paused,
      moves: game.records.map(r => r.uci),
      claimedDraw: game.claimedDraw
    });
    saveSettings();
  }
  function restore() {
    const settings = storageRead(SETTINGS_STORAGE) || readLegacy(LEGACY_SETTINGS_STORAGE);
    if (settings && typeof settings.sound === 'boolean') game.sound = settings.sound;
    const saved = storageRead(STORAGE) || readLegacy(LEGACY_STORAGE);
    if (saved && Array.isArray(saved.moves) && saved.active !== false) {
      game.players = normalizePlayers(saved);
      game.flipped = saved.flipped === true;
      game.paused = saved.paused === true && bothComputers();
      const history = [C.initialState()];
      const records = [];
      for (const rawMove of saved.moves.slice(0, 700)) {
        if (typeof rawMove !== 'string') break;
        const before = history[history.length - 1];
        if (C.status(history).finished) break;
        const move = C.legal(before).find(m => C.uci(m) === rawMove);
        if (!move) break;
        records.push(recordMove(before, move));
        history.push(C.apply(before, move));
      }
      game.history = history;
      game.records = records;
      const stateStatus = C.status(history);
      if (stateStatus.claim && saved.claimedDraw === stateStatus.claim + '.') game.claimedDraw = saved.claimedDraw;
      game.hasGame = true;
    }
    const chosen = settings && settings.setup ? settings.setup : (game.hasGame ? game.players : null);
    if (chosen) {
      setup.white = normalizeController(chosen.white);
      setup.black = normalizeController(chosen.black);
    }
  }

  function recordMove(before, move) {
    const captured = move.flag === 'ep' ? (before.turn === 1 ? 'p' : 'P') : before.board[move.to];
    return {
      uci: C.uci(move), san: C.san(before, move),
      color: before.turn, from: move.from, to: move.to,
      promotion: move.promotion, flag: move.flag, captured
    };
  }

  function squareOrder() {
    return Array.from({ length: 64 }, (_, displayIndex) => {
      const row = displayIndex >> 3;
      const col = displayIndex & 7;
      return game.flipped ? (7 - row) * 16 + (7 - col) : row * 16 + col;
    });
  }

  function getTargets() {
    return game.selected >= 0 && !game.promotionMoves ?
      C.legal(current()).filter(move => move.from === game.selected) : [];
  }

  function squareMarkup(i, displayIndex, legalTargets, latest, kingInCheck, boardReady) {
    const state = current();
    const piece = state.board[i];
    const color = C.side(piece);
    const squareName = C.square(i);
    const light = ((i >> 4) + (i & 7)) % 2 === 0;
    const target = legalTargets.some(m => m.to === i);
    const isCapture = target && (piece !== '.' || legalTargets.some(m => m.to === i && m.flag === 'ep'));
    const selected = game.selected === i;
    const last = latest && (i === latest.from || i === latest.to);
    const checkingKing = kingInCheck && i === state.board.indexOf(state.turn === 1 ? 'K' : 'k');
    const label = piece === '.' ? 'leer' : (color === 1 ? 'weißer ' : 'schwarzer ') + PIECE_NAMES[piece.toLowerCase()];
    const accessible = `Feld ${squareName}, ${label}` + (target ? ', erlaubtes Zielfeld' : '') +
      (selected ? ', ausgewählt' : '');
    const rankLabel = displayIndex % 8 === 0 ? `<span class="square-label rank">${squareName[1]}</span>` : '';
    const fileLabel = displayIndex >> 3 === 7 ? `<span class="square-label file">${squareName[0]}</span>` : '';
    const pieceMarkup = piece === '.' ? '' : `<span class="piece ${color === 1 ? 'white' : 'black'}" aria-hidden="true">${C.GLYPHS[piece]}</span>`;
    return `<button type="button" class="square ${light ? 'light' : 'dark'}${selected ? ' selected' : ''}${last ? ' last-move' : ''}${target ? (isCapture ? ' is-capture' : ' is-target') : ''}${checkingKing ? ' in-check' : ''}" data-index="${i}" aria-label="${accessible}" aria-pressed="${selected}" draggable="${boardReady && color === state.turn}">${rankLabel}${fileLabel}${pieceMarkup}</button>`;
  }

  function renderBoard() {
    const state = current();
    const targetMoves = getTargets();
    const latest = game.records[game.records.length - 1];
    const kingInCheck = C.inCheck(state);
    const boardReady = canMove();
    const focused = board.contains(document.activeElement) ? document.activeElement.dataset.index : null;
    board.innerHTML = squareOrder().map((i, j) => squareMarkup(i, j, targetMoves, latest, kingInCheck, boardReady)).join('');
    board.setAttribute('aria-label', `Schachbrett. ${state.turn === 1 ? 'Weiß' : 'Schwarz'} am Zug.`);
    if (focused != null) {
      const square = board.querySelector(`[data-index="${focused}"]`);
      if (square) square.focus({ preventScroll: true });
    }
  }

  function renderPlayers() {
    const state = current();
    const finished = gameStatus().finished;
    $('gameColumn').classList.toggle('flipped', game.flipped);
    $('blackDescription').textContent = game.players.black === 'human' ? 'Spieler 2 · Mensch' : 'Computer · ' + LEVEL_NAMES[game.players.black];
    $('whiteDescription').textContent = game.players.white === 'human' ? 'Spieler 1 · Mensch' : 'Computer · ' + LEVEL_NAMES[game.players.white];
    for (const [color, id] of [[-1, 'black'], [1, 'white']]) {
      const row = $(id + 'Player');
      const active = !finished && state.turn === color;
      row.classList.toggle('is-active', active);
      $(id + 'Indicator').textContent = active && game.thinking ? 'DENKT …' : active && bothComputers() && game.paused ? 'PAUSE' : 'AM ZUG';
    }
    const captured = color => game.records.filter(r => r.color === color && r.captured !== '.')
      .map(r => r.captured).sort((a, b) => ORDER_OF_CAPTURES[a.toLowerCase()] - ORDER_OF_CAPTURES[b.toLowerCase()]);
    $('whiteCaptured').textContent = captured(1).map(p => C.GLYPHS[p]).join('');
    $('blackCaptured').textContent = captured(-1).map(p => C.GLYPHS[p]).join('');
  }

  function renderMoves() {
    const records = game.records;
    $('moveCount').textContent = records.length + (records.length === 1 ? ' Halbzug' : ' Halbzüge');
    if (!records.length) {
      moveList.innerHTML = '<div class="empty-moves"><span class="empty-moves-icon" aria-hidden="true">♟</span><strong>Noch keine Züge</strong><span>Die Partie beginnt mit Weiß.</span></div>';
      return;
    }
    const rows = [];
    for (let i = 0; i < records.length; i += 2) {
      const white = records[i];
      const black = records[i + 1];
      rows.push(`<div class="move-row"><span class="move-number">${Math.floor(i / 2) + 1}.</span>` +
        `<span class="move-notation ${i === records.length - 1 ? 'is-latest' : ''}">${white.san}</span>` +
        `<span class="move-notation ${i + 1 === records.length - 1 ? 'is-latest' : ''}">${black ? black.san : ''}</span></div>`);
    }
    moveList.innerHTML = rows.join('');
    moveList.scrollTop = moveList.scrollHeight;
  }

  function renderStatus() {
    const state = current();
    const result = gameStatus();
    const card = document.querySelector('.status-card');
    const color = state.turn === 1 ? 'Weiß' : 'Schwarz';
    const level = controllerFor(state.turn);
    const computer = level !== 'human';
    const spectator = bothComputers();
    let heading, description;
    if (result.finished) {
      heading = result.title;
      description = result.description;
    } else if (game.thinking && computer) {
      heading = 'Computer denkt …';
      description = color + ' (' + LEVEL_NAMES[level] + ') berechnet den nächsten Zug.';
    } else if (spectator && game.paused) {
      heading = 'Partie pausiert';
      description = 'Fortsetzen für automatisches Spiel oder „Ein Zug“ für den nächsten Computerzug.';
    } else if (game.promotionMoves) {
      heading = 'Bauernumwandlung';
      description = 'Wähle Dame, Turm, Läufer oder Springer.';
    } else if (C.inCheck(state)) {
      heading = 'Schach!';
      description = color + ' steht im Schach. ' + (computer ? 'Der Computer reagiert.' : 'Schütze deinen König.');
    } else if (computer) {
      heading = color + ' am Zug';
      description = 'Computer · ' + LEVEL_NAMES[level] + ' zieht automatisch.';
    } else if (game.selected >= 0) {
      heading = color + ' am Zug';
      description = C.square(game.selected) + ' ausgewählt. Wähle eines der markierten Zielfelder.';
    } else {
      heading = color + ' am Zug';
      description = 'Wähle eine Figur und dann ihr Zielfeld.';
    }
    $('statusKicker').textContent = spectator ? 'ZUSCHAUERMODUS' : 'PARTIESTATUS';
    $('statusTitle').textContent = heading;
    $('statusDescription').textContent = description;
    $('statusTurn').textContent = result.finished ? 'Partie beendet' : color;
    $('statusSymbol').textContent = result.finished ? '■' : C.inCheck(state) ? '!' : '●';
    card.classList.toggle('is-alert', !result.finished && C.inCheck(state));
    card.classList.toggle('is-ended', result.finished);
    const claimButton = $('claimDrawButton');
    claimButton.classList.toggle('hidden', !result.claim || result.finished || game.thinking || !!game.promotionMoves);
    claimButton.textContent = result.claim ? 'Remis beanspruchen · ' + result.claim : 'Remis beanspruchen';
    $('howtoText').textContent = spectator ?
      'Beide Computer ziehen automatisch. Mit Pause lässt sich die Partie anhalten; „Ein Zug“ spielt einen einzelnen Zug.' :
      'Figur antippen und ein markiertes Feld wählen. Rochade, en passant und Bauernumwandlung werden unterstützt.';
  }

  function renderPromotion() {
    const options = game.promotionMoves;
    promotionOverlay.classList.toggle('hidden', !options);
    if (!options) return;
    $('promotionOptions').innerHTML = options.map(move => {
      const piece = current().turn === 1 ? move.promotion.toUpperCase() : move.promotion;
      return `<button type="button" class="promotion-option" data-promotion="${move.promotion}" aria-label="In ${PROMOTION_NAMES[move.promotion]} umwandeln"><span class="piece ${current().turn === 1 ? 'white' : 'black'}" aria-hidden="true">${C.GLYPHS[piece]}</span><span>${PROMOTION_NAMES[move.promotion]}</span></button>`;
    }).join('');
  }

  function renderControls() {
    const spectator = bothComputers() && !gameStatus().finished;
    $('undoButton').disabled = game.records.length === 0;
    $('soundButton').classList.toggle('is-muted', !game.sound);
    $('soundButton').setAttribute('aria-pressed', String(game.sound));
    $('soundButton').setAttribute('aria-label', game.sound ? 'Ton ausschalten' : 'Ton einschalten');
    $('soundButton').title = game.sound ? 'Ton ausschalten' : 'Ton einschalten';
    $('pauseButton').classList.toggle('hidden', !spectator);
    $('pauseButton').classList.toggle('is-paused', game.paused);
    $('pauseButton').setAttribute('aria-pressed', String(game.paused));
    $('pauseButton').title = game.paused ? 'Computerpartie fortsetzen' : 'Computerpartie pausieren';
    $('pauseLabel').textContent = game.paused ? 'Fortsetzen' : 'Pause';
    $('stepButton').classList.toggle('hidden', !spectator || !game.paused);
    $('stepButton').disabled = game.thinking;
  }

  function renderScreen() {
    const inMenu = game.screen === 'menu';
    $('setupScreen').classList.toggle('hidden', !inMenu);
    $('gameScreen').classList.toggle('hidden', inMenu);
    $('menuButton').classList.toggle('hidden', inMenu);
    $('resumeArea').classList.toggle('hidden', !game.hasGame);
    if (game.hasGame) {
      const white = CONTROLLER_NAMES[game.players.white];
      const black = CONTROLLER_NAMES[game.players.black];
      $('resumeDescription').textContent = white + ' (Weiß) vs. ' + black + ' (Schwarz) · ' + game.records.length + ' Halbzüge';
    }
  }

  function render() {
    renderScreen();
    renderBoard();
    renderPlayers();
    renderMoves();
    renderStatus();
    renderPromotion();
    renderControls();
  }

  function cancelComputer() {
    cpuGeneration++;
    if (cpuTimer !== null) clearTimeout(cpuTimer);
    cpuTimer = null;
    game.thinking = false;
  }

  function clearAnimations() {
    animationTimers.forEach(id => clearTimeout(id));
    animationTimers = [];
    animationLayer.innerHTML = '';
    board.querySelectorAll('.piece-hidden').forEach(piece => piece.classList.remove('piece-hidden'));
  }

  function animateMove(move, previousState) {
    if (prefersReducedMotion && prefersReducedMotion.matches) return;
    const main = { from: move.from, to: move.to, piece: previousState.board[move.from] };
    const motions = [main];
    if (move.flag === 'castle') motions.push({
      from: move.to > move.from ? move.from + 3 : move.from - 4,
      to: move.to > move.from ? move.from + 1 : move.from - 1,
      piece: previousState.turn === 1 ? 'R' : 'r'
    });
    for (const item of motions) {
      const fromEl = board.querySelector(`[data-index="${item.from}"]`);
      const toEl = board.querySelector(`[data-index="${item.to}"]`);
      if (!fromEl || !toEl) continue;
      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();
      const layerRect = animationLayer.getBoundingClientRect();
      const targetPiece = toEl.querySelector('.piece');
      if (targetPiece) targetPiece.classList.add('piece-hidden');
      const ghost = document.createElement('div');
      ghost.className = 'moving-piece';
      ghost.style.left = (fromRect.left - layerRect.left) + 'px';
      ghost.style.top = (fromRect.top - layerRect.top) + 'px';
      ghost.style.width = fromRect.width + 'px';
      ghost.style.height = fromRect.height + 'px';
      ghost.style.fontSize = (targetPiece ? getComputedStyle(targetPiece).fontSize : Math.round(toRect.width * .75) + 'px');
      const span = document.createElement('span');
      span.className = 'piece ' + (C.side(item.piece) === 1 ? 'white' : 'black');
      span.textContent = C.GLYPHS[item.piece];
      ghost.appendChild(span);
      animationLayer.appendChild(ghost);
      requestAnimationFrame(() => {
        ghost.style.transform = `translate(${toRect.left - fromRect.left}px, ${toRect.top - fromRect.top}px)`;
      });
      const timer = setTimeout(() => {
        ghost.remove();
        if (targetPiece && targetPiece.isConnected) targetPiece.classList.remove('piece-hidden');
        animationTimers = animationTimers.filter(id => id !== timer);
      }, 245);
      animationTimers.push(timer);
    }
  }

  function unlockAudio() {
    if (!game.sound) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!audioContext) audioContext = new AudioContext();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    } catch (_) { /* Web Audio optional */ }
  }

  // Alle Sounds werden lokal über Web Audio erzeugt: keine Audio-Dateien, kein Netzwerk.
  function sound(type) {
    if (!game.sound) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!audioContext) audioContext = new AudioContext();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      const now = audioContext.currentTime;
      function note(freq, offset, duration, volume, wave = 'sine') {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(freq, now + offset);
        gain.gain.setValueAtTime(.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(Math.max(.0001, volume), now + offset + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, now + offset + duration);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + duration + .015);
      }
      if (type === 'win') {
        note(392, 0, .13, .055, 'triangle'); note(523, .10, .18, .055, 'triangle'); note(659, .24, .3, .065, 'triangle');
      } else if (type === 'check') {
        note(490, 0, .095, .065, 'triangle'); note(660, .10, .16, .043, 'triangle');
      } else if (type === 'capture') {
        note(175, 0, .085, .070, 'triangle'); note(108, .045, .10, .045, 'sine');
      } else if (type === 'castle') {
        note(240, 0, .08, .047, 'triangle'); note(340, .085, .09, .05, 'triangle');
      } else {
        note(235, 0, .065, .045, 'triangle'); note(318, .040, .060, .035, 'sine');
      }
    } catch (_) { /* Audio ist optional. */ }
  }

  function makeMove(move) {
    if (gameStatus().finished) return;
    const before = current();
    const actual = C.legal(before).find(m => C.uci(m) === C.uci(move));
    if (!actual) return;
    const record = recordMove(before, actual);
    game.history.push(C.apply(before, actual));
    game.records.push(record);
    game.selected = -1;
    game.promotionMoves = null;
    game.claimedDraw = '';
    game.thinking = false;
    clearAnimations();
    save();
    render();
    animateMove(actual, before);
    const status = gameStatus();
    sound(status.finished && status.type === 'mate' ? 'win' :
      C.inCheck(current()) ? 'check' : record.captured !== '.' ? 'capture' :
      actual.flag === 'castle' ? 'castle' : 'move');
    scheduleComputer();
  }

  function handleSquare(index) {
    if (!canMove()) return;
    const state = current();
    if (game.selected >= 0) {
      const candidates = C.legal(state).filter(move => move.from === game.selected && move.to === index);
      if (candidates.length > 1) {
        game.promotionMoves = candidates;
        render();
        const option = $('promotionOptions').querySelector('button');
        if (option) option.focus();
        return;
      }
      if (candidates.length === 1) { makeMove(candidates[0]); return; }
    }
    game.selected = C.side(state.board[index]) === state.turn ? (game.selected === index ? -1 : index) : -1;
    renderBoard();
    renderStatus();
  }

  function scheduleComputer() {
    cancelComputer();
    if (game.screen !== 'game' || gameStatus().finished || game.promotionMoves) return;
    const controller = controllerFor(current().turn);
    if (controller === 'human' || (game.paused && !game.stepOnce)) return;
    const generation = cpuGeneration;
    const expectedState = current();
    game.thinking = true;
    renderPlayers();
    renderStatus();
    renderControls();
    // Versetzt die Züge, damit Zuschauer die letzte Animation erkennen können.
    cpuTimer = window.setTimeout(() => {
      cpuTimer = null;
      if (cpuGeneration !== generation || game.screen !== 'game' || current() !== expectedState ||
          (game.paused && !game.stepOnce) || gameStatus().finished) return;
      const state = current();
      const available = C.legal(state);
      let suggestion;
      try {
        suggestion = CPUS[controller].chooseMove({ state, legalMoves: available, engine: C, history: game.history });
      } catch (error) {
        console.error('Schach: Computerzug fehlgeschlagen, nutze Leicht als Ersatz.', error);
        suggestion = CPUS.easy.chooseMove({ state, legalMoves: available, engine: C });
      }
      const move = suggestion && available.find(m => C.uci(m) === C.uci(suggestion));
      game.thinking = false;
      game.stepOnce = false;
      if (move) makeMove(move);
      else render();
    }, (bothComputers() ? 730 : 450) + Math.random() * 240);
  }

  function reset() {
    cancelComputer();
    clearAnimations();
    game.history = [C.initialState()];
    game.records = [];
    game.selected = -1;
    game.promotionMoves = null;
    game.claimedDraw = '';
    game.paused = false;
    game.stepOnce = false;
    game.hasGame = true;
    save();
    render();
    scheduleComputer();
  }

  function undo() {
    if (!game.records.length) return;
    cancelComputer();
    clearAnimations();
    const spectator = bothComputers();
    // Im Zuschauerbetrieb einen Zug zurücknehmen und die Automatik anhalten.
    if (spectator) game.paused = true;
    game.stepOnce = false;
    let number = 1;
    const humans = [1, -1].filter(color => controllerFor(color) === 'human');
    if (humans.length === 1) {
      // Bis zum vorherigen Spielstand mit dem Menschen am Zug zurückgehen.
      const human = humans[0];
      while (number < game.records.length && game.history[game.history.length - 1 - number].turn !== human) number++;
    }
    game.records.splice(-number, number);
    game.history.splice(-number, number);
    game.selected = -1;
    game.promotionMoves = null;
    game.claimedDraw = '';
    save();
    render();
    scheduleComputer();
  }

  function renderSetup() {
    $('whiteController').value = setup.white;
    $('blackController').value = setup.black;
    const white = CONTROLLER_NAMES[setup.white];
    const black = CONTROLLER_NAMES[setup.black];
    $('summaryTitle').textContent = white + ' gegen ' + black;
    const humans = [setup.white, setup.black].filter(value => value === 'human').length;
    $('summaryHint').textContent = humans === 0 ?
      'Zuschauermodus: beide Computer spielen automatisch.' :
      humans === 1 ? 'Ein Mensch spielt gegen den Computer.' :
      'Zwei Personen spielen abwechselnd am Gerät.';
    $('summaryIcon').textContent = humans === 0 ? '◉' : humans === 1 ? '♞' : '♟';
    $('setupSummary').classList.toggle('is-spectator', humans === 0);
  }

  function openMenu() {
    cancelComputer();
    game.stepOnce = false;
    game.screen = 'menu';
    setup.white = game.players.white;
    setup.black = game.players.black;
    renderSetup();
    renderScreen();
    $('startButton').focus({ preventScroll: true });
  }

  function resumeGame() {
    if (!game.hasGame) return;
    game.screen = 'game';
    game.stepOnce = false;
    render();
    scheduleComputer();
    $('menuButton').focus({ preventScroll: true });
  }

  function startGame() {
    unlockAudio();
    game.players = { white: setup.white, black: setup.black };
    game.flipped = false;
    game.screen = 'game';
    reset();
    $('menuButton').focus({ preventScroll: true });
  }

  function togglePause() {
    if (!bothComputers() || gameStatus().finished) return;
    if (game.paused) {
      game.paused = false;
      unlockAudio();
    } else {
      game.paused = true;
      game.stepOnce = false;
      cancelComputer();
    }
    save();
    render();
    scheduleComputer();
  }

  function stepComputer() {
    if (!bothComputers() || !game.paused || game.thinking || gameStatus().finished) return;
    unlockAudio();
    game.stepOnce = true;
    scheduleComputer();
  }

  function cancelPromotion() {
    game.promotionMoves = null;
    render();
    const selectedButton = board.querySelector(`[data-index="${game.selected}"]`);
    if (selectedButton) selectedButton.focus({ preventScroll: true });
  }

  board.addEventListener('click', event => {
    const tile = event.target.closest('.square');
    if (tile) handleSquare(Number(tile.dataset.index));
  });

  // Zusätzlich zum Antippen können Figuren mit der Maus gezogen werden.
  board.addEventListener('dragstart', event => {
    const tile = event.target.closest('.square');
    if (!tile || !canMove()) { event.preventDefault(); return; }
    const from = Number(tile.dataset.index);
    if (C.side(current().board[from]) !== current().turn) { event.preventDefault(); return; }
    dragSource = from;
    game.selected = from;
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', String(from));
      event.dataTransfer.effectAllowed = 'move';
    }
    const targets = C.legal(current()).filter(m => m.from === from);
    board.querySelectorAll('.square').forEach(square => {
      const to = Number(square.dataset.index);
      const candidates = targets.filter(m => m.to === to);
      square.classList.toggle('selected', to === from);
      square.classList.toggle('is-target', candidates.length > 0 && current().board[to] === '.' && !candidates.some(m => m.flag === 'ep'));
      square.classList.toggle('is-capture', candidates.length > 0 && (current().board[to] !== '.' || candidates.some(m => m.flag === 'ep')));
    });
  });
  board.addEventListener('dragover', event => {
    if (dragSource >= 0 && event.target.closest('.square')) event.preventDefault();
  });
  board.addEventListener('drop', event => {
    const tile = event.target.closest('.square');
    if (dragSource < 0 || !tile) return;
    event.preventDefault();
    const source = dragSource;
    dragSource = -1;
    dropHandled = true;
    game.selected = source;
    handleSquare(Number(tile.dataset.index));
  });
  board.addEventListener('dragend', () => {
    dragSource = -1;
    if (dropHandled) { dropHandled = false; return; }
    renderBoard();
    renderStatus();
  });

  // Pfeiltasten bewegen den Fokus zwischen Feldern; Enter/Leertaste wählen aus.
  board.addEventListener('keydown', event => {
    const deltas = { ArrowUp: -8, ArrowDown: 8, ArrowLeft: -1, ArrowRight: 1 };
    if (!(event.key in deltas)) return;
    const currentTile = event.target.closest('.square');
    if (!currentTile) return;
    const tiles = [...board.querySelectorAll('.square')];
    const position = tiles.indexOf(currentTile);
    const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (dx !== 0 && (position % 8) + dx < 0) return;
    if (dx !== 0 && (position % 8) + dx > 7) return;
    const next = position + deltas[event.key];
    if (next < 0 || next >= 64) return;
    event.preventDefault();
    tiles[next].focus();
  });

  $('promotionOptions').addEventListener('click', event => {
    const button = event.target.closest('[data-promotion]');
    if (!button || !game.promotionMoves) return;
    const choice = game.promotionMoves.find(move => move.promotion === button.dataset.promotion);
    if (choice) makeMove(choice);
  });
  $('cancelPromotion').addEventListener('click', cancelPromotion);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && game.promotionMoves) cancelPromotion();
  });
  $('restartButton').addEventListener('click', () => { unlockAudio(); reset(); });
  $('undoButton').addEventListener('click', undo);
  $('pauseButton').addEventListener('click', togglePause);
  $('stepButton').addEventListener('click', stepComputer);
  $('flipButton').addEventListener('click', () => {
    clearAnimations();
    game.flipped = !game.flipped;
    game.selected = -1;
    save();
    render();
  });
  $('soundButton').addEventListener('click', () => {
    game.sound = !game.sound;
    save();
    renderControls();
    if (game.sound) { unlockAudio(); sound('move'); }
  });
  $('claimDrawButton').addEventListener('click', () => {
    const status = gameStatus();
    if (status.finished || !status.claim || game.thinking) return;
    game.claimedDraw = status.claim + '.';
    game.selected = -1;
    game.stepOnce = false;
    cancelComputer();
    save();
    render();
  });
  for (const side of ['white', 'black']) {
    $(side + 'Controller').addEventListener('change', event => {
      setup[side] = normalizeController(event.target.value);
      saveSettings();
      renderSetup();
    });
  }
  $('startButton').addEventListener('click', startGame);
  $('resumeButton').addEventListener('click', () => { unlockAudio(); resumeGame(); });
  $('menuButton').addEventListener('click', openMenu);

  restore();
  renderSetup();
  render();
})();
