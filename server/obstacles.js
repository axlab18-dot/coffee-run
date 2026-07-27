const { HIT_RADIUS, PIT_DAMAGE, ROCK_DAMAGE, STONE_DAMAGE } = require('./constants');
const { applyDamage } = require('./health');

function applyObstacleCollisions(player, track) {
  for (const obstacle of track.obstacles) {
    const key = `${obstacle.type}:${obstacle.x}`;
    if (player.hitObstacleXs.has(key)) continue;
    if (Math.abs(player.x - obstacle.x) > HIT_RADIUS) continue;

    player.hitObstacleXs.add(key);

    if (player.action === 'jumping') continue; // jumping clears all ground obstacles

    if (obstacle.type === 'pit') {
      applyDamage(player, PIT_DAMAGE);
    } else if (obstacle.type === 'rock') {
      applyDamage(player, ROCK_DAMAGE);
    } else if (obstacle.type === 'stone') {
      applyDamage(player, STONE_DAMAGE);
    }
  }
}

module.exports = { applyObstacleCollisions };
