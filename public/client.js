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
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const scale = canvas.width / track.trackLength;
  const laneHeight = canvas.height / state.players.length;

  // Lane dividers, ground lines, and a dashed ground texture (like the
  // dino-game's dotted horizon line)
  state.players.forEach((player, i) => {
    const laneTop = i * laneHeight;
    const groundY = laneTop + laneHeight - 20;

    if (i > 0) {
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
  });

  // Finish line
  ctx.strokeStyle = '#000000';
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
      ctx.clearRect(x - 10, 0, 20, canvas.height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 10, 0, 20, canvas.height);
    } else {
      drawCactus(x, canvas.height, obstacle.type === 'rock' ? 34 : 20);
    }
  }

  // Ball spawn markers
  for (const spawn of track.ballSpawns) {
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(spawn.x * scale, canvas.height - 30, spawn.type === 'big' ? 6 : 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Players, one per lane
  state.players.forEach((player, i) => {
    const laneTop = i * laneHeight;
    const groundY = laneTop + laneHeight - 20;
    const x = player.x * scale;

    const arc = player.action === 'jumping' ? jumpArcOffset(player.id, now) : 0;
    const isDucking = player.action === 'ducking' && arc === 0;
    const isActive = !player.retired && !player.finished;
    const stride = isActive && arc === 0 && !isDucking && Math.sin(now / 90 + player.laneIndex) > 0;

    drawDino(x, groundY - arc, { ducking: isDucking, stride, dim: player.retired });

    // HP bar: a row of small pixel blocks, like a retro health meter
    const hpBarX = 6;
    const hpBarY = laneTop + 6;
    for (let h = 0; h < 10; h++) {
      ctx.strokeStyle = '#000000';
      ctx.strokeRect(hpBarX + h * 7, hpBarY, 5, 8);
      if (h < player.hp) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(hpBarX + h * 7, hpBarY, 5, 8);
      }
    }

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(player.name, hpBarX, hpBarY + 22);

    if (player.retired) {
      ctx.font = 'bold 11px monospace';
      ctx.fillText('OUT', x, groundY - 46);
    } else if (player.finished) {
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`#${player.rank}`, x, groundY - 46);
    }
  });

  // Thrown balls (drawn at each lane's mid-height using the owner's lane as a proxy)
  for (const ball of state.thrownBalls) {
    const owner = state.players.find((p) => p.id === ball.ownerId);
    const laneTop = (owner ? owner.laneIndex : 0) * laneHeight;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(ball.x * scale, laneTop + laneHeight - 30, ball.type === 'big' ? 8 : 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// A blocky pixel-art silhouette in the style of the Chrome dino-game runner,
// built from filled rectangles rather than an image asset.
function drawDino(x, groundY, { ducking, stride, dim }) {
  ctx.fillStyle = dim ? '#bbbbbb' : '#000000';

  if (ducking) {
    // Low, elongated pose (matches the dino game's duck sprite)
    ctx.fillRect(x - 4, groundY - 14, 26, 12);
    ctx.fillRect(x + 18, groundY - 20, 8, 8); // head
    ctx.fillRect(x - 4, groundY - 2, 6, 2);
    ctx.fillRect(x + 12, groundY - 2, 6, 2);
  } else {
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
}

// A two-spike cactus silhouette, closer to the classic dino-game obstacle
// than a single triangle.
function drawCactus(x, baseY, height) {
  ctx.fillStyle = '#000000';
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
