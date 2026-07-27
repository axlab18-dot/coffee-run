const { HIT_RADIUS, PIT_STUN_MS, ROCK_STUN_MS, STONE_SLOW_MS } = require('./constants');

function applyObstacleCollisions(player, track) {
  for (const obstacle of track.obstacles) {
    const key = `${obstacle.type}:${obstacle.x}`;
    if (player.hitObstacleXs.has(key)) continue;
    if (Math.abs(player.x - obstacle.x) > HIT_RADIUS) continue;

    player.hitObstacleXs.add(key);

    if (obstacle.type === 'pit' && player.action !== 'jumping') {
      player.stunMs = PIT_STUN_MS;
    } else if (obstacle.type === 'rock' && player.action !== 'jumping') {
      player.stunMs = ROCK_STUN_MS;
    } else if (obstacle.type === 'stone' && player.action !== 'jumping') {
      player.slowMs = STONE_SLOW_MS;
    }
  }
}

module.exports = { applyObstacleCollisions };
