const { test } = require('node:test');
const assert = require('node:assert');
const { createPlayer } = require('../server/player');
const { applyObstacleCollisions } = require('../server/obstacles');
const { MAX_HP, PIT_DAMAGE, ROCK_DAMAGE, STONE_DAMAGE } = require('../server/constants');

function playerAt(x, action = 'running') {
  const p = createPlayer('p1', 'Alice');
  p.x = x;
  p.action = action;
  return p;
}

test('running into a pit costs PIT_DAMAGE hp', () => {
  const track = { obstacles: [{ type: 'pit', x: 400 }], ballSpawns: [] };
  const p = playerAt(400, 'running');
  applyObstacleCollisions(p, track);
  assert.strictEqual(p.hp, MAX_HP - PIT_DAMAGE);
});

test('jumping over a pit avoids the damage', () => {
  const track = { obstacles: [{ type: 'pit', x: 400 }], ballSpawns: [] };
  const p = playerAt(400, 'jumping');
  applyObstacleCollisions(p, track);
  assert.strictEqual(p.hp, MAX_HP);
});

test('hitting a rock while running costs ROCK_DAMAGE hp', () => {
  const track = { obstacles: [{ type: 'rock', x: 800 }], ballSpawns: [] };
  const p = playerAt(800, 'running');
  applyObstacleCollisions(p, track);
  assert.strictEqual(p.hp, MAX_HP - ROCK_DAMAGE);
});

test('hitting a stone while running costs STONE_DAMAGE hp', () => {
  const track = { obstacles: [{ type: 'stone', x: 1100 }], ballSpawns: [] };
  const p = playerAt(1100, 'running');
  applyObstacleCollisions(p, track);
  assert.strictEqual(p.hp, MAX_HP - STONE_DAMAGE);
});

test('the same obstacle only triggers once per player', () => {
  const track = { obstacles: [{ type: 'rock', x: 800 }], ballSpawns: [] };
  const p = playerAt(800, 'running');
  applyObstacleCollisions(p, track);
  applyObstacleCollisions(p, track);
  assert.strictEqual(p.hp, MAX_HP - ROCK_DAMAGE);
});

test('hp reaching 0 retires the player', () => {
  const track = {
    obstacles: [
      { type: 'pit', x: 400 },
      { type: 'pit', x: 800 },
      { type: 'pit', x: 1200 },
      { type: 'pit', x: 1600 }
    ],
    ballSpawns: []
  };
  const p = playerAt(400, 'running');
  for (const obstacle of track.obstacles) {
    p.x = obstacle.x;
    applyObstacleCollisions(p, track);
  }
  assert.strictEqual(p.hp, 0);
  assert.strictEqual(p.retired, true);
});
