const socket = io();

const nameEntryEl = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const joinButton = document.getElementById('join-button');
const lobbyEl = document.getElementById('lobby');
const playerListEl = document.getElementById('player-list');
const readyButton = document.getElementById('ready-button');
const gameScreenEl = document.getElementById('game-screen');
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const resultsOverlayEl = document.getElementById('results-overlay');
const resultsListEl = document.getElementById('results-list');
const gachaOverlayEl = document.getElementById('gacha-overlay');
const gachaTimerEl = document.getElementById('gacha-timer');
const gachaTimerBarEl = document.getElementById('gacha-timer-bar');
const gachaCardEls = [0, 1, 2].map((i) => document.getElementById(`gacha-card-${i}`));
const itemBadgeEl = document.getElementById('item-badge');
const diceOverlayEl = document.getElementById('dice-overlay');
const diceFaceEl = document.getElementById('dice-face');
const diceHintEl = document.getElementById('dice-hint');

let isReady = false;
let showingResults = false;
let myId = null;
let track = { trackLength: 6000, checkpoints: [0, 2000, 4000] };

const SERVER_TICK_MS = 1000 / 30;
const GACHA_SELECT_MS = 5000;

let prevState = null;
let latestState = null;
let latestReceivedAt = 0;

const RESULT_LABELS = {
  arrived: '완주',
  timeout: '시간 초과'
};

// Assigned by lane index so every player keeps the same color for the whole
// race, regardless of join order changes elsewhere.
const PLAYER_COLORS = [
  '#e63946', '#1d7a4c', '#1d63a8', '#e07b00',
  '#8e44ad', '#0f766e', '#c2185b', '#5d4037'
];

function playerColor(player) {
  return PLAYER_COLORS[player.laneIndex % PLAYER_COLORS.length];
}

socket.on('connect', () => {
  myId = socket.id;
});

socket.on('track', (t) => {
  track = t;
});

function join() {
  const name = nameInput.value.trim();
  if (!name) return;
  socket.emit('join', name);
  nameEntryEl.style.display = 'none';
  lobbyEl.style.display = 'block';
}

joinButton.addEventListener('click', join);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') join();
});

readyButton.addEventListener('click', () => {
  isReady = !isReady;
  socket.emit('ready', isReady);
  readyButton.textContent = isReady ? 'Cancel' : 'Ready';
});

socket.on('lobby-state', (lobby) => {
  playerListEl.innerHTML = '';
  for (const player of lobby.players) {
    const li = document.createElement('li');
    li.textContent = player.name;
    if (player.ready) li.classList.add('ready');
    playerListEl.appendChild(li);
  }

  if (showingResults) {
    showingResults = false;
    gameScreenEl.style.display = 'none';
    resultsOverlayEl.style.display = 'none';
    gachaOverlayEl.style.display = 'none';
    diceOverlayEl.style.display = 'none';
    lobbyEl.style.display = 'block';
    isReady = false;
    readyButton.textContent = 'Ready';
    prevState = null;
    latestState = null;
  }
});

socket.on('round-state', (state) => {
  lobbyEl.style.display = 'none';
  gameScreenEl.style.display = 'block';

  if (state.track) track = state.track;

  prevState = latestState || state;
  latestState = state;
  latestReceivedAt = performance.now();

  updateGachaOverlay(state);
  updateItemBadge(state);
  updateDiceOverlay(state);

  if (state.phase === 'finished' && !showingResults) {
    showingResults = true;
    showResults(state.players);
  }
});

function myPlayer(state) {
  return state.players.find((p) => p.id === myId);
}

function updateGachaOverlay(state) {
  const me = myPlayer(state);
  if (!me || !me.gachaState) {
    gachaOverlayEl.style.display = 'none';
    return;
  }

  gachaOverlayEl.style.display = 'flex';
  const remainingMs = Math.max(0, me.gachaState.remainingMs);
  gachaTimerEl.textContent = Math.ceil(remainingMs / 1000);

  const ratio = Math.max(0, Math.min(1, remainingMs / GACHA_SELECT_MS));
  gachaTimerBarEl.style.width = `${ratio * 100}%`;
  gachaTimerBarEl.classList.toggle('urgent', remainingMs <= GACHA_SELECT_MS * 0.3);

  me.gachaState.options.forEach((card, i) => {
    const el = gachaCardEls[i];
    if (!el) return;
    el.className = `gacha-card ${card.kind === 'item' ? 'item' : 'passive'}`;
    const kindTag = card.kind === 'item' ? '아이템' : '패시브';
    el.innerHTML = `<div class="card-tier">${card.tierLabel} · ${kindTag}</div><div class="card-label">${card.label}</div>`;
  });
}

function updateItemBadge(state) {
  const me = myPlayer(state);
  if (me && me.heldItem) {
    itemBadgeEl.style.display = 'block';
    itemBadgeEl.textContent = `★ 보유 아이템: ${me.heldItem.label} — Space로 사용!`;
  } else {
    itemBadgeEl.style.display = 'none';
  }
}

function updateDiceOverlay(state) {
  const me = myPlayer(state);
  if (!me || !me.diceState) {
    diceOverlayEl.style.display = 'none';
    return;
  }

  diceOverlayEl.style.display = 'flex';
  if (me.diceState.spinning) {
    diceFaceEl.textContent = String(1 + Math.floor(Math.random() * 6));
    diceHintEl.textContent = '주사위를 굴리는 중...';
  } else {
    diceFaceEl.textContent = '?';
    diceHintEl.textContent = 'Space (또는 클릭)로 주사위를 굴리세요';
  }
}

function showResults(players) {
  const sorted = [...players].sort((a, b) => (a.rank || 999) - (b.rank || 999));
  resultsListEl.innerHTML = '';
  for (const player of sorted) {
    const li = document.createElement('li');
    const label = RESULT_LABELS[player.resultReason] || '';
    li.textContent = `#${player.rank} ${player.name} — ${label}`;
    resultsListEl.appendChild(li);
  }
  resultsOverlayEl.style.display = 'flex';
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function renderFrame() {
  requestAnimationFrame(renderFrame);
  if (!latestState || gameScreenEl.style.display === 'none') return;

  const now = performance.now();
  const t = Math.min(1, (now - latestReceivedAt) / SERVER_TICK_MS);
  const prevById = new Map(prevState.players.map((p) => [p.id, p]));

  const interpolated = latestState.players.map((player) => {
    const prev = prevById.get(player.id) || player;
    const frozen = player.gachaState || player.diceState;
    const x = frozen ? player.x : lerp(prev.x, player.x, t);
    return { ...player, x };
  });

  render({ ...latestState, players: interpolated }, now);
}

function render(state, now) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const scale = canvas.width / track.trackLength;
  const numLanes = state.players.length;
  const laneHeight = canvas.height / numLanes;

  // Lane backgrounds are drawn per row slot (0..numLanes-1), independent of
  // player order — a player's row is decided by their own laneIndex below,
  // so a "지각변동" lane shift actually moves them to a different row.
  for (let lane = 0; lane < numLanes; lane++) {
    const laneTop = lane * laneHeight;
    const groundY = laneTop + laneHeight - 20;

    if (lane > 0) {
      ctx.strokeStyle = '#cccccc';
      ctx.beginPath();
      ctx.moveTo(0, laneTop);
      ctx.lineTo(canvas.width, laneTop);
      ctx.stroke();
    }

    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(canvas.width, groundY);
    ctx.stroke();

    ctx.fillStyle = '#000000';
    for (let tx = 0; tx < canvas.width; tx += 20) {
      ctx.fillRect(tx, groundY + 3, 8, 2);
    }
  }

  // Checkpoint markers — thin dotted verticals that turn green once my own
  // runner has passed them, as a personal progress readout.
  const me = state.players.find((p) => p.id === myId);
  ctx.setLineDash([4, 4]);
  for (const checkpoint of track.checkpoints.slice(1)) {
    const x = checkpoint * scale;
    ctx.strokeStyle = me && me.x >= checkpoint ? '#2e7d32' : '#999999';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Finish line
  ctx.strokeStyle = '#000000';
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(canvas.width - 2, 0);
  ctx.lineTo(canvas.width - 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);

  // Players — placed by their own laneIndex (not array order), so a
  // "지각변동" lane shift is visible even though join order never changes.
  state.players.forEach((player) => {
    const laneTop = player.laneIndex * laneHeight;
    const groundY = laneTop + laneHeight - 20;
    const x = player.x * scale;
    const paused = !!player.gachaState || (!!player.diceState && !player.diceState.spinning);
    const stride = !paused && !player.finished && Math.sin(now / 90 + player.laneIndex) > 0;

    const holdingItem = (player.heldItem || player.hasItem) && !player.finished;

    // A pulsing amber ring under a holder's feet makes "this player has an
    // item" readable at a glance, even at a distance on the wider track.
    if (holdingItem) {
      const pulse = 3 + Math.sin(now / 150) * 2;
      ctx.strokeStyle = '#ff8800';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x + 7, groundY + 2, 14 + pulse, 5 + pulse * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    drawDino(x, groundY, { stride, dim: player.finished, color: playerColor(player) });

    if (player.gachaState) {
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = '#000000';
      ctx.fillText('?', x + 10, groundY - 40);
    } else if (player.diceState) {
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = '#000000';
      ctx.fillText(player.diceState.spinning ? '🎲' : '🎲?', x + 10, groundY - 40);
    } else if (player.diceResult && !player.finished) {
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = '#000000';
      ctx.fillText(`🎲${player.diceResult}`, x + 10, groundY - 40);
    }

    if (holdingItem) {
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = '#ff8800';
      ctx.fillText('★', x + 8, groundY - 46);
    }

    ctx.fillStyle = playerColor(player);
    ctx.font = 'bold 11px monospace';
    ctx.fillText(player.name, 6, laneTop + 16);

    if (player.finished) {
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`#${player.rank}`, x, groundY - 46);
    }
  });
}

// A blocky pixel-art silhouette in the style of the Chrome dino-game runner,
// built from filled rectangles rather than an image asset.
function drawDino(x, groundY, { stride, dim, color }) {
  ctx.fillStyle = dim ? '#bbbbbb' : color || '#000000';

  // Body
  ctx.fillRect(x, groundY - 26, 14, 18);
  // Head
  ctx.fillRect(x + 8, groundY - 34, 12, 12);
  // Snout
  ctx.fillRect(x + 18, groundY - 30, 6, 5);
  // Tail
  ctx.fillRect(x - 6, groundY - 20, 8, 6);
  // Legs (alternate for a running stride)
  if (stride) {
    ctx.fillRect(x, groundY - 8, 5, 8);
    ctx.fillRect(x + 9, groundY - 4, 5, 4);
  } else {
    ctx.fillRect(x, groundY - 4, 5, 4);
    ctx.fillRect(x + 9, groundY - 8, 5, 8);
  }
  // Eye (white pixel cut into the head)
  if (!dim) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 16, groundY - 32, 2, 2);
  }
}

requestAnimationFrame(renderFrame);

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;

  if (e.code === 'Space') {
    socket.emit('use-item');
    return;
  }

  if (e.code === 'Digit1' || e.code === 'Numpad1') socket.emit('gacha-pick', 0);
  else if (e.code === 'Digit2' || e.code === 'Numpad2') socket.emit('gacha-pick', 1);
  else if (e.code === 'Digit3' || e.code === 'Numpad3') socket.emit('gacha-pick', 2);
});

gachaCardEls.forEach((el, i) => {
  if (!el) return;
  el.addEventListener('click', () => socket.emit('gacha-pick', i));
});

diceFaceEl.addEventListener('click', () => socket.emit('use-item'));
