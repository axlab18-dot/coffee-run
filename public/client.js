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

let isReady = false;
let showingResults = false;
let track = { obstacles: [], ballSpawns: [], trackLength: 3000 };

const SERVER_TICK_MS = 1000 / 30;
const JUMP_DURATION_MS = 420;
const JUMP_HEIGHT = 34;

let prevState = null;
let latestState = null;
let latestReceivedAt = 0;
// Per-player cosmetic animation state (jump arcs), keyed by player id.
// Purely visual — never affects hit detection, which is server-authoritative.
const animState = new Map();

const PLAYER_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00897b'];
const RESULT_LABELS = {
  arrived: '완주',
  survivor: '최종 생존',
  timeout: '생존',
  retired: '탈락'
};

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
    lobbyEl.style.display = 'block';
    isReady = false;
    readyButton.textContent = 'Ready';
    prevState = null;
    latestState = null;
    animState.clear();
  }
});

socket.on('round-state', (state) => {
  lobbyEl.style.display = 'none';
  gameScreenEl.style.display = 'block';

  for (const player of state.players) {
    const anim = animState.get(player.id) || { lastAction: player.action, jumpStart: null };
    if (anim.lastAction !== 'jumping' && player.action === 'jumping') {
      anim.jumpStart = performance.now();
    }
    anim.lastAction = player.action;
    animState.set(player.id, anim);
  }

  prevState = latestState || state;
  latestState = state;
  latestReceivedAt = performance.now();

  if (state.phase === 'finished' && !showingResults) {
    showingResults = true;
    showResults(state.players);
  }
});

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

function jumpArcOffset(playerId, now) {
  const anim = animState.get(playerId);
  if (!anim || anim.jumpStart === null) return 0;
  const elapsed = now - anim.jumpStart;
  if (elapsed >= JUMP_DURATION_MS) {
    anim.jumpStart = null;
    return 0;
  }
  return Math.sin((elapsed / JUMP_DURATION_MS) * Math.PI) * JUMP_HEIGHT;
}

function renderFrame() {
  requestAnimationFrame(renderFrame);
  if (!latestState || gameScreenEl.style.display === 'none') return;

  const now = performance.now();
  const t = Math.min(1, (now - latestReceivedAt) / SERVER_TICK_MS);
  const prevById = new Map(prevState.players.map((p) => [p.id, p]));

  const interpolated = latestState.players.map((player) => {
    const prev = prevById.get(player.id) || player;
    return { ...player, x: lerp(prev.x, player.x, t) };
  });

  render({ ...latestState, players: interpolated }, now);
}

function render(state, now) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scale = canvas.width / track.trackLength;
  const laneHeight = canvas.height / state.players.length;

  // Lane dividers, ground lines, and a light texture tick every ~40px
  state.players.forEach((player, i) => {
    const laneTop = i * laneHeight;
    const groundY = laneTop + laneHeight - 20;

    ctx.strokeStyle = '#e2e2e2';
    ctx.beginPath();
    ctx.moveTo(0, laneTop);
    ctx.lineTo(canvas.width, laneTop);
    ctx.stroke();

    ctx.strokeStyle = '#535353';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(canvas.width, groundY);
    ctx.stroke();

    ctx.strokeStyle = '#c9c9c9';
    for (let tx = 0; tx < canvas.width; tx += 40) {
      ctx.beginPath();
      ctx.moveTo(tx, groundY + 2);
      ctx.lineTo(tx + 14, groundY + 2);
      ctx.stroke();
    }
  });

  // Finish line
  ctx.strokeStyle = '#202020';
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(canvas.width - 2, 0);
  ctx.lineTo(canvas.width - 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);

  // Ground obstacles (span the full height, since the hazard is shared across all lanes)
  for (const obstacle of track.obstacles) {
    const x = obstacle.x * scale;
    if (obstacle.type === 'pit') {
      ctx.fillStyle = '#c9c9c9';
      ctx.fillRect(x - 10, 0, 20, canvas.height);
    } else {
      drawCactus(x, canvas.height, obstacle.type === 'rock' ? 34 : 22);
    }
  }

  // Ball spawn markers
  for (const spawn of track.ballSpawns) {
    ctx.fillStyle = '#f4b400';
    ctx.beginPath();
    ctx.arc(spawn.x * scale, canvas.height - 30, spawn.type === 'big' ? 6 : 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Players, one per lane
  state.players.forEach((player, i) => {
    const laneTop = i * laneHeight;
    const groundY = laneTop + laneHeight - 20;
    const color = PLAYER_COLORS[player.laneIndex % PLAYER_COLORS.length];
    const x = player.x * scale;

    const arc = player.action === 'jumping' ? jumpArcOffset(player.id, now) : 0;
    const isDucking = player.action === 'ducking' && arc === 0;
    const bodyHeight = isDucking ? 14 : 24;
    let bodyY = groundY - arc;
    if (isDucking) bodyY -= 4;

    // Subtle running bob so a moving, non-jumping racer doesn't look static
    const isActive = !player.retired && !player.finished;
    const bob =
      isActive && arc === 0 && !isDucking ? Math.sin(now / 90 + player.laneIndex) * 1.5 : 0;

    ctx.fillStyle = player.retired ? '#bbb' : color;
    ctx.fillRect(x, bodyY - 24 + bob, 18, bodyHeight);

    // Two alternating "leg" ticks under the body while running, for a stride feel
    if (isActive && arc === 0 && !isDucking) {
      const strideOffset = Math.sin(now / 90 + player.laneIndex) > 0 ? 3 : -3;
      ctx.fillStyle = player.retired ? '#bbb' : color;
      ctx.fillRect(x + 3 + strideOffset, groundY - 2, 4, 4);
      ctx.fillRect(x + 11 - strideOffset, groundY - 2, 4, 4);
    }

    // HP bar
    const hpBarWidth = 60;
    const hpBarX = 6;
    const hpBarY = laneTop + 6;
    ctx.fillStyle = '#ddd';
    ctx.fillRect(hpBarX, hpBarY, hpBarWidth, 6);
    ctx.fillStyle = player.hp > 3 ? '#43a047' : '#e53935';
    ctx.fillRect(hpBarX, hpBarY, hpBarWidth * Math.max(0, player.hp / 10), 6);

    ctx.fillStyle = '#202020';
    ctx.font = '11px monospace';
    ctx.fillText(`${player.name} (${player.hp})`, hpBarX, hpBarY + 18);

    if (player.retired) {
      ctx.fillStyle = '#e53935';
      ctx.fillText('OUT', x, bodyY - 30);
    } else if (player.finished) {
      ctx.fillStyle = '#202020';
      ctx.fillText(`#${player.rank}`, x, bodyY - 30);
    }
  });

  // Thrown balls (drawn at each lane's mid-height using the owner's lane as a proxy)
  for (const ball of state.thrownBalls) {
    const owner = state.players.find((p) => p.id === ball.ownerId);
    const laneTop = (owner ? owner.laneIndex : 0) * laneHeight;
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(ball.x * scale, laneTop + laneHeight - 30, ball.type === 'big' ? 8 : 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// A two-spike cactus silhouette, closer to the classic dino-game obstacle
// than a single triangle.
function drawCactus(x, baseY, height) {
  ctx.fillStyle = '#5b7a4a';
  ctx.fillRect(x - 4, baseY - height, 8, height);
  ctx.fillRect(x - 9, baseY - height * 0.55, 6, height * 0.3);
  ctx.fillRect(x + 3, baseY - height * 0.75, 6, height * 0.3);
}

requestAnimationFrame(renderFrame);

const keysDown = new Set();

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keysDown.add(e.code);
  sendInput();
  if (e.code === 'Space') socket.emit('throw');
});

window.addEventListener('keyup', (e) => {
  keysDown.delete(e.code);
  sendInput();
});

function sendInput() {
  socket.emit('input', {
    jumping: keysDown.has('ArrowUp'),
    ducking: keysDown.has('ArrowDown')
  });
}
