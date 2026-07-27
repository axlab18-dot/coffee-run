const { test } = require('node:test');
const assert = require('node:assert');
const { TRACK, getObstacleAt, isPastFinish } = require('../server/track');

test('track has obstacles and ball spawns within track length', () => {
  const { TRACK_LENGTH } = require('../server/constants');
  for (const obstacle of TRACK.obstacles) {
    assert.ok(obstacle.x >= 0 && obstacle.x < TRACK_LENGTH);
    assert.ok(['pit', 'rock', 'stone'].includes(obstacle.type));
  }
  for (const spawn of TRACK.ballSpawns) {
    assert.ok(spawn.x >= 0 && spawn.x < TRACK_LENGTH);
    assert.ok(['big', 'small'].includes(spawn.type));
  }
});

test('getObstacleAt finds an obstacle within hit radius', () => {
  const obstacle = TRACK.obstacles[0];
  const found = getObstacleAt(obstacle.x + 5, 20);
  assert.strictEqual(found, obstacle);
});

test('getObstacleAt returns undefined when nothing is nearby', () => {
  const found = getObstacleAt(-1000, 20);
  assert.strictEqual(found, undefined);
});

test('isPastFinish is true only at or beyond track length', () => {
  const { TRACK_LENGTH } = require('../server/constants');
  assert.strictEqual(isPastFinish(TRACK_LENGTH - 1), false);
  assert.strictEqual(isPastFinish(TRACK_LENGTH), true);
});
