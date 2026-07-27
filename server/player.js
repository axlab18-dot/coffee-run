const { BASE_SPEED, SLOWED_SPEED } = require('./constants');

function createPlayer(id, name) {
  return {
    id,
    name,
    x: 0,
    action: 'running', // 'running' | 'jumping' | 'ducking' | 'stunned'
    stunMs: 0,
    slowMs: 0,
    heldBall: null,     // null | 'big' | 'small'
    finished: false,
    finishTimeMs: null,
    hitObstacleXs: new Set(),
    collectedBallXs: new Set()
  };
}

function tickPlayerMovement(player, dtSeconds, input) {
  if (player.finished) return;

  if (player.stunMs > 0) {
    player.stunMs = Math.max(0, player.stunMs - dtSeconds * 1000);
    player.action = 'stunned';
    return;
  }

  const speed = player.slowMs > 0 ? SLOWED_SPEED : BASE_SPEED;
  if (player.slowMs > 0) {
    player.slowMs = Math.max(0, player.slowMs - dtSeconds * 1000);
  }

  player.x += speed * dtSeconds;

  if (input.jumping) player.action = 'jumping';
  else if (input.ducking) player.action = 'ducking';
  else player.action = 'running';
}

module.exports = { createPlayer, tickPlayerMovement };
