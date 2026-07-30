const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const {
  createLobby,
  addPlayer,
  removePlayer,
  setReady,
  allReady,
  resetEquipShop,
  rollEquipDice,
  resolveEquipOffer,
  tickEquipOffers
} = require('./lobby');
const { createPlayer } = require('./player');
const { createRound, tickRound, resolveGacha, startDiceSpin } = require('./round');
const { useHeldItem, computeSpeed } = require('./effects');
const { TICK_RATE } = require('./constants');

function createGameServer() {
  const app = express();
  // The client loads the socket.io browser bundle from a CDN (see
  // public/index.html) instead of the default /socket.io/socket.io.js route,
  // since that route is normally served by socket.io hooking into the
  // http.Server's 'request' event — a path that never fires on Vercel's
  // serverless runtime (see handleRequest below).
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const server = http.createServer(app);
  const io = new Server(server, {
    // Vercel's serverless runtime does not support persistent WebSocket
    // upgrades the way a normal long-running Node process does, so we fall
    // back to HTTP long-polling there. It still works locally.
    transports: ['polling', 'websocket']
  });

  const lobby = createLobby();
  let round = null;
  let botCounter = 0;
  let returnToLobbyScheduled = false;

  function maybeStartRound() {
    if (allReady(lobby) && !round) {
      const players = lobby.players.map((p) => createPlayer(p.id, p.name, p.isBot, p.equippedItems));
      round = createRound(players);
      io.emit('track', round.track);
    }
  }

  function broadcastLobby() {
    io.emit('lobby-state', lobby);
  }

  // Each socket gets its own view of the round: a player's own gacha options
  // and held item are private, so opponents only see that they're "picking"
  // or that they're holding *something* — never the specific cards. The dice
  // event has no strategic content (pure luck), so it's shown to everyone.
  function buildRoundStateFor(viewerId) {
    return {
      phase: round.phase,
      track: round.track,
      diceActive: round.diceEvent.triggered,
      players: round.players.map((p) => {
        const isViewer = p.id === viewerId;
        return {
          id: p.id,
          name: p.name,
          isBot: p.isBot,
          x: p.x,
          laneIndex: p.laneIndex,
          checkpointsDone: p.checkpointsDone,
          speed: Math.round(computeSpeed(round, p)),
          accelCount: p.accelCount,
          decelCount: p.decelCount,
          gachaState: isViewer ? p.gachaState : p.gachaState ? { picking: true } : null,
          heldItem: isViewer ? p.heldItem : null,
          hasItem: !!p.heldItem,
          diceState: p.diceState,
          diceResult: p.diceResult,
          finished: p.finished,
          finishTimeMs: p.finishTimeMs,
          rank: p.rank || null,
          resultReason: p.resultReason,
          guaranteedRank: p.guaranteedRank
        };
      })
    };
  }

  function broadcastRound() {
    if (!round) return;
    for (const [id, socket] of io.sockets.sockets) {
      socket.emit('round-state', buildRoundStateFor(id));
    }
  }

  io.on('connection', (socket) => {
    socket.on('join', (name) => {
      const safeName = String(name || '').trim().slice(0, 20) || `Player-${socket.id.slice(0, 4)}`;
      addPlayer(lobby, socket.id, safeName);
      broadcastLobby();
    });

    socket.on('ready', (isReady) => {
      setReady(lobby, socket.id, !!isReady);
      broadcastLobby();
      maybeStartRound();
    });

    // Bots have no client, so testing solo needs stand-ins: they join
    // already-ready and pick/act on their own inside round.js's tick loop.
    socket.on('add-bot', () => {
      botCounter += 1;
      const botId = `bot-${botCounter}`;
      if (lobby.players.some((p) => p.id === botId)) return;
      addPlayer(lobby, botId, `봇 ${botCounter}`, true);
      setReady(lobby, botId, true);
      broadcastLobby();
      maybeStartRound();
    });

    socket.on('remove-bot', (botId) => {
      const target = lobby.players.find((p) => p.id === botId && p.isBot);
      if (!target) return;
      removePlayer(lobby, botId);
      if (round) round.players = round.players.filter((p) => p.id !== botId);
      broadcastLobby();
    });

    // 착용 아이템 shop (pre-round lobby only): roll the die, then optionally
    // pick from the 3-card offer it opens (or let it auto-resolve on timeout).
    socket.on('roll-equip-dice', () => {
      const player = lobby.players.find((p) => p.id === socket.id);
      if (!player) return;
      rollEquipDice(player);
      broadcastLobby();
    });

    socket.on('pick-equip-item', (itemKey) => {
      const player = lobby.players.find((p) => p.id === socket.id);
      if (!player || !player.equipOffer) return;
      resolveEquipOffer(player, String(itemKey || ''));
      broadcastLobby();
    });

    socket.on('gacha-pick', (optionIndex) => {
      if (!round) return;
      const player = round.players.find((p) => p.id === socket.id);
      if (!player || !player.gachaState) return;
      const index = Number(optionIndex);
      if (!Number.isInteger(index) || index < 0 || index >= player.gachaState.options.length) return;
      resolveGacha(round, player, index);
    });

    socket.on('use-item', () => {
      if (!round) return;
      const player = round.players.find((p) => p.id === socket.id);
      if (!player || player.finished) return;
      // Space is dual-purpose: it starts the dice spin when one is awaiting
      // a roll, otherwise it triggers a held item.
      if (player.diceState && !player.diceState.spinning) {
        startDiceSpin(player);
      } else {
        useHeldItem(round, player);
      }
    });

    socket.on('disconnect', () => {
      removePlayer(lobby, socket.id);
      if (round) {
        round.players = round.players.filter((p) => p.id !== socket.id);
      }
      broadcastLobby();
    });
  });

  const dt = 1 / TICK_RATE;
  setInterval(() => {
    if (!round) {
      // 착용 아이템 shop offers auto-resolve after their pick window, same as
      // the in-race gacha — only worth broadcasting if one just resolved.
      const playersWithOffers = lobby.players.filter((p) => p.equipOffer);
      if (playersWithOffers.length > 0) {
        tickEquipOffers(lobby, dt);
        if (playersWithOffers.some((p) => !p.equipOffer)) broadcastLobby();
      }
    }

    if (round) {
      tickRound(round, dt);
      broadcastRound();
      if (round.phase === 'finished' && !returnToLobbyScheduled) {
        returnToLobbyScheduled = true;
        setTimeout(() => {
          round = null;
          returnToLobbyScheduled = false;
          // Bots have no client to click Ready again, so they stay ready;
          // real players go back to the lobby and must ready up manually.
          // The equip shop also refreshes to a full budget for next round.
          resetEquipShop(lobby);
          for (const p of lobby.players) p.ready = p.isBot;
          broadcastLobby();
        }, 6000);
      }
    }
  }, 1000 / TICK_RATE);

  // In a normal long-running process, socket.io hooks into `server`'s own
  // 'request'/'upgrade' events once `server.listen()` runs. Serverless
  // platforms like Vercel never fire those events — they invoke an exported
  // handler function directly per request — so we replicate that routing
  // here: anything under socket.io's path goes to its engine, everything
  // else goes to Express.
  function handleRequest(req, res) {
    if (req.url && req.url.startsWith('/socket.io/')) {
      io.engine.handleRequest(req, res);
    } else {
      app(req, res);
    }
  }

  return { app, server, io, handleRequest };
}

module.exports = { createGameServer };
