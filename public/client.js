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
  }
});

socket.on('round-state', (state) => {
  lobbyEl.style.display = 'none';
  gameScreenEl.style.display = 'block';
  render(state);

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

function render(state) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scale = canvas.width / track.trackLength;
  const laneHeight = canvas.height / state.players.length;

  // Lane dividers and ground lines
  state.players.forEach((player, i) => {
    const laneTop = i * laneHeight;
    ctx.strokeStyle = '#ddd';
    ctx.beginPath();
    ctx.moveTo(0, laneTop);
    ctx.lineTo(canvas.width, laneTop);
    ctx.stroke();

    ctx.strokeStyle = '#535353';
    ctx.beginPath();
    ctx.moveTo(0, laneTop + laneHeight - 20);
    ctx.lineTo(canvas.width, laneTop + laneHeight - 20);
    ctx.stroke();
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
      ctx.fillStyle = obstacle.type === 'rock' ? '#8d8d8d' : '#a5a5a5';
      ctx.beginPath();
      ctx.moveTo(x - 8, canvas.height);
      ctx.lineTo(x, canvas.height - (obstacle.type === 'rock' ? 220 : 130));
      ctx.lineTo(x + 8, canvas.height);
      ctx.closePath();
      ctx.fill();
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

    let bodyY = groundY;
    if (player.action === 'jumping') bodyY -= 30;
    if (player.action === 'ducking') bodyY -= 6;

    ctx.fillStyle = player.retired ? '#bbb' : color;
    ctx.fillRect(x, bodyY - 24, 18, player.action === 'ducking' ? 14 : 24);

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
