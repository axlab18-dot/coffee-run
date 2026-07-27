const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const { createLobby, addPlayer, removePlayer, setReady, allReady } = require('./lobby');
const { createPlayer } = require('./player');
const { createRound, tickRound } = require('./round');
const { throwBall } = require('./balls');
const { TICK_RATE, COUNTDOWN_MS } = require('./constants');

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const io = new Server(server);

const lobby = createLobby();
const inputsByPlayerId = {};
let round = null;

function broadcastLobby() {
  io.emit('lobby-state', lobby);
}

function broadcastRound() {
  if (!round) return;
  io.emit('round-state', {
    phase: round.phase,
    players: round.players.map((p) => ({
      id: p.id,
      name: p.name,
      x: p.x,
      action: p.action,
      heldBall: p.heldBall,
      finished: p.finished,
      rank: p.rank || null
    })),
    thrownBalls: round.thrownBalls
  });
}

io.on('connection', (socket) => {
  socket.on('join', (name) => {
    const safeName = String(name || '').trim().slice(0, 20) || `Player-${socket.id.slice(0, 4)}`;
    addPlayer(lobby, socket.id, safeName);
    inputsByPlayerId[socket.id] = { jumping: false, ducking: false };
    broadcastLobby();
  });

  socket.on('ready', (isReady) => {
    setReady(lobby, socket.id, !!isReady);
    broadcastLobby();

    if (allReady(lobby) && !round) {
      setTimeout(() => {
        if (!allReady(lobby) || round) return; // ready state changed during the countdown
        const players = lobby.players.map((p) => createPlayer(p.id, p.name));
        round = createRound(players);
      }, COUNTDOWN_MS);
    }
  });

  socket.on('input', (input) => {
    inputsByPlayerId[socket.id] = {
      jumping: !!input.jumping,
      ducking: !!input.ducking
    };
  });

  socket.on('throw', () => {
    if (!round) return;
    const player = round.players.find((p) => p.id === socket.id);
    if (!player) return;
    const thrown = throwBall(player);
    if (thrown) round.thrownBalls.push(thrown);
  });

  socket.on('disconnect', () => {
    removePlayer(lobby, socket.id);
    delete inputsByPlayerId[socket.id];
    if (round) {
      round.players = round.players.filter((p) => p.id !== socket.id);
    }
    broadcastLobby();
  });
});

const dt = 1 / TICK_RATE;
setInterval(() => {
  if (round) {
    tickRound(round, dt, inputsByPlayerId);
    broadcastRound();
    if (round.phase === 'finished') {
      setTimeout(() => {
        round = null;
        for (const p of lobby.players) p.ready = false;
        broadcastLobby();
      }, 5000);
    }
  }
}, 1000 / TICK_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SEON Battle Ball listening on http://localhost:${PORT}`);
});
