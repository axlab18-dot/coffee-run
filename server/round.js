const { tickPlayerMovement } = require('./player');
const { applyObstacleCollisions } = require('./obstacles');
const { applyBallPickup, tickThrownBalls } = require('./balls');
const { TRACK, isPastFinish } = require('./track');
const { ROUND_TIME_LIMIT_MS } = require('./constants');

function createRound(players) {
  return {
    phase: 'racing', // 'racing' | 'finished'
    players,
    thrownBalls: [],
    elapsedMs: 0,
    nextRank: 1
  };
}

function tickRound(round, dtSeconds, inputsByPlayerId) {
  if (round.phase !== 'racing') return;

  round.elapsedMs += dtSeconds * 1000;

  for (const player of round.players) {
    if (player.finished) continue;
    const input = inputsByPlayerId[player.id] || { jumping: false, ducking: false };
    tickPlayerMovement(player, dtSeconds, input);
    applyObstacleCollisions(player, TRACK);
    applyBallPickup(player, TRACK);

    if (isPastFinish(player.x)) {
      player.finished = true;
      player.rank = round.nextRank++;
    }
  }

  tickThrownBalls(round.thrownBalls, dtSeconds, round.players);

  const allFinished = round.players.every((p) => p.finished);
  const timeUp = round.elapsedMs >= ROUND_TIME_LIMIT_MS;
  if (allFinished || timeUp) {
    round.phase = 'finished';
  }
}

module.exports = { createRound, tickRound };
