const { tickPlayerMovement } = require('./player');
const { applyObstacleCollisions } = require('./obstacles');
const { applyBallPickup, tickThrownBalls } = require('./balls');
const { TRACK, isPastFinish } = require('./track');
const { ROUND_TIME_LIMIT_MS } = require('./constants');

function createRound(players) {
  players.forEach((player, index) => {
    player.laneIndex = index;
  });

  return {
    phase: 'racing', // 'racing' | 'finished'
    players,
    thrownBalls: [],
    elapsedMs: 0,
    initialPlayerCount: players.length,
    finishOrder: [],
    retireOrder: [],
    recordedRetireIds: new Set()
  };
}

function tickRound(round, dtSeconds, inputsByPlayerId) {
  if (round.phase !== 'racing') return;

  round.elapsedMs += dtSeconds * 1000;

  for (const player of round.players) {
    if (player.finished || player.retired) continue;
    const input = inputsByPlayerId[player.id] || { jumping: false, ducking: false };
    tickPlayerMovement(player, dtSeconds, input);
    applyObstacleCollisions(player, TRACK);
    applyBallPickup(player, TRACK);

    if (!player.retired && isPastFinish(player.x)) {
      player.finished = true;
      player.resultReason = 'arrived';
      round.finishOrder.push(player.id);
    }
  }

  tickThrownBalls(round.thrownBalls, dtSeconds, round.players);

  // A player can also be knocked out by a thrown ball above, so sweep for
  // any newly-retired player (from either obstacles or balls) here.
  for (const player of round.players) {
    if (player.retired && !round.recordedRetireIds.has(player.id)) {
      round.recordedRetireIds.add(player.id);
      round.retireOrder.push(player.id);
    }
  }

  const activePlayers = round.players.filter((p) => !p.finished && !p.retired);
  const timeUp = round.elapsedMs >= ROUND_TIME_LIMIT_MS;

  const lastSurvivorWins = round.initialPlayerCount >= 2 && activePlayers.length === 1;
  if (lastSurvivorWins) {
    const winner = activePlayers[0];
    winner.finished = true;
    winner.resultReason = 'survivor';
    round.finishOrder.push(winner.id);
  }

  if (lastSurvivorWins || activePlayers.length === 0 || timeUp) {
    if (timeUp) {
      // Safety net: anyone still racing when time runs out is ranked by how
      // far they got, furthest first.
      const stillRacing = round.players
        .filter((p) => !p.finished && !p.retired)
        .sort((a, b) => b.x - a.x);
      for (const p of stillRacing) {
        p.finished = true;
        p.resultReason = 'timeout';
        round.finishOrder.push(p.id);
      }
    }
    round.phase = 'finished';
    finalizeRanks(round);
  }
}

function finalizeRanks(round) {
  let rank = 1;
  const byId = new Map(round.players.map((p) => [p.id, p]));

  for (const id of round.finishOrder) {
    const player = byId.get(id);
    if (player && player.rank === null) player.rank = rank++;
  }

  for (let i = round.retireOrder.length - 1; i >= 0; i--) {
    const player = byId.get(round.retireOrder[i]);
    if (player && player.rank === null) player.rank = rank++;
  }
}

module.exports = { createRound, tickRound };
