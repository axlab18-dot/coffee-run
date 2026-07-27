const { test } = require('node:test');
const assert = require('node:assert');
const { createPlayer } = require('../server/player');
const { applyObstacleCollisions } = require('../server/obstacles');
const { PIT_STUN_MS, ROCK_STUN_MS, STONE_SLOW_MS } = require('../server/constants');

function playerAt(x, action = 'running') {
  const p = createPlayer('p1', 'Alice');
  p.x = x;
  p.action = action;
  return p;
}

test('running into a pit stuns the player for PIT_STUN_MS', () => {
  const track = { obstacles: [{ type: 'pit', x: 400 }], ballSpawns: [] };
  const p = playerAt(400, 'running');
  applyObstacleCollisions(p, track);
  assert.strictEqual(p.stunMs, PIT_STUN_MS);
});

test('jumping over a pit avoids the stun', () => {
  const track = { obstacles: [{ type: 'pit', x: 400 }], ballSpawns: [] };
  const p = playerAt(400, 'jumping');
  applyObstacleCollisions(p, track);
  assert.strictEqual(p.stunMs, 0);
});

test('hitting a rock while running stuns for ROCK_STUN_MS', () => {
  const track = { obstacles: [{ type: 'rock', x: 800 }], ballSpawns: [] };
  const p = playerAt(800, 'running');
  applyObstacleCollisions(p, track);
  assert.strictEqual(p.stunMs, ROCK_STUN_MS);
});

test('hitting a stone while running slows for STONE_SLOW_MS', () => {
  const track = { obstacles: [{ type: 'stone', x: 1100 }], ballSpawns: [] };
  const p = playerAt(1100, 'running');
  applyObstacleCollisions(p, track);
  assert.strictEqual(p.slowMs, STONE_SLOW_MS);
});

test('the same obstacle only triggers once per player', () => {
  const track = { obstacles: [{ type: 'rock', x: 800 }], ballSpawns: [] };
  const p = playerAt(800, 'running');
  applyObstacleCollisions(p, track);
  p.stunMs = 0; // pretend the stun already wore off
  applyObstacleCollisions(p, track);
  assert.strictEqual(p.stunMs, 0);
});
