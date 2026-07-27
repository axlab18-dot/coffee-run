const socket = io();

const nameEntryEl = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const joinButton = document.getElementById('join-button');
const lobbyEl = document.getElementById('lobby');
const playerListEl = document.getElementById('player-list');
const readyButton = document.getElementById('ready-button');
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

let isReady = false;

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
});

socket.on('round-state', (state) => {
  lobbyEl.style.display = 'none';
  canvas.style.display = 'block';
  render(state);

  if (state.phase === 'finished') {
    setTimeout(() => {
      lobbyEl.style.display = 'block';
      canvas.style.display = 'none';
      isReady = false;
      readyButton.textContent = 'Ready';
    }, 4500);
  }
});

const TRACK_LENGTH = 3000; // must match server/constants.js TRACK_LENGTH

function render(state) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scale = canvas.width / TRACK_LENGTH;
  const groundY = canvas.height - 40;

  ctx.strokeStyle = '#000';
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(canvas.width, groundY);
  ctx.stroke();

  for (const player of state.players) {
    const x = player.x * scale;
    let y = groundY;
    if (player.action === 'jumping') y -= 30;
    if (player.action === 'ducking') y -= 5;

    ctx.fillStyle = player.finished ? '#999' : '#e53935';
    ctx.fillRect(x, y - 30, 20, 30);
    ctx.fillStyle = '#000';
    ctx.font = '10px sans-serif';
    ctx.fillText(player.name, x - 10, y - 34);
    if (player.rank) ctx.fillText(`#${player.rank}`, x - 10, y - 44);
  }

  for (const ball of state.thrownBalls) {
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(ball.x * scale, groundY - 15, ball.type === 'big' ? 8 : 4, 0, Math.PI * 2);
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
