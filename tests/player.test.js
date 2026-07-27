const { test } = require('node:test');
const assert = require('node:assert');
const { createPlayer, tickPlayerMovement } = require('../server/player');
const { BASE_SPEED, MAX_HP } = require('../server/constants');

test('createPlayer starts at x=0 with full hp and no held ball', () => {
  const p = createPlayer('p1', 'Alice');
  assert.strictEqual(p.id, 'p1');
  assert.strictEqual(p.name, 'Alice');
  assert.strictEqual(p.x, 0);
  assert.strictEqual(p.action, 'running');
  assert.strictEqual(p.hp, MAX_HP);
  assert.strictEqual(p.heldBall, null);
  assert.strictEqual(p.finished, false);
  assert.strictEqual(p.retired, false);
  assert.strictEqual(p.rank, null);
});

test('tickPlayerMovement always advances x at BASE_SPEED (no more time-based slow/stun)', () => {
  const p = createPlayer('p1', 'Alice');
  tickPlayerMovement(p, 1.0, { jumping: false, ducking: false });
  assert.strictEqual(p.x, BASE_SPEED);
});

test('tickPlayerMovement sets action to jumping or ducking based on input', () => {
  const p = createPlayer('p1', 'Alice');
  tickPlayerMovement(p, 0.1, { jumping: true, ducking: false });
  assert.strictEqual(p.action, 'jumping');
  tickPlayerMovement(p, 0.1, { jumping: false, ducking: true });
  assert.strictEqual(p.action, 'ducking');
  tickPlayerMovement(p, 0.1, { jumping: false, ducking: false });
  assert.strictEqual(p.action, 'running');
});

test('finished players do not move', () => {
  const p = createPlayer('p1', 'Alice');
  p.finished = true;
  tickPlayerMovement(p, 1.0, { jumping: false, ducking: false });
  assert.strictEqual(p.x, 0);
});

test('retired players do not move', () => {
  const p = createPlayer('p1', 'Alice');
  p.retired = true;
  tickPlayerMovement(p, 1.0, { jumping: false, ducking: false });
  assert.strictEqual(p.x, 0);
});
