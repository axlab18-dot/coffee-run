const { BASE_SPEED, MAX_HP } = require('./constants');

function createPlayer(id, name) {
  return {
    id,
    name,
    x: 0,
    action: 'running', // 'running' | 'jumping' | 'ducking'
    hp: MAX_HP,
    heldBall: null,     // null | 'big' | 'small'
    finished: false,
    retired: false,
    rank: null,
    resultReason: null, // 'arrived' | 'survivor' | 'timeout' | 'retired'
    hitObstacleXs: new Set(),
    collectedBallXs: new Set()
  };
}

function tickPlayerMovement(player, dtSeconds, input) {
  if (player.finished || player.retired) return;

  player.x += BASE_SPEED * dtSeconds;

  if (input.jumping) player.action = 'jumping';
  else if (input.ducking) player.action = 'ducking';
  else player.action = 'running';
}

module.exports = { createPlayer, tickPlayerMovement };
