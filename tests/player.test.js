const { test } = require('node:test');
const assert = require('node:assert');
const { createPlayer, tickPlayerMovement } = require('../server/player');
const { BASE_SPEED, SLOWED_SPEED } = require('../server/constants');

test('createPlayer starts at x=0 with no timers or held ball', () => {
  const p = createPlayer('p1', 'Alice');
  assert.strictEqual(p.id, 'p1');
  assert.strictEqual(p.name, 'Alice');
  assert.strictEqual(p.x, 0);
  assert.strictEqual(p.action, 'running');
  assert.strictEqual(p.stunMs, 0);
  assert.strictEqual(p.slowMs, 0);
  assert.strictEqual(p.heldBall, null);
  assert.strictEqual(p.finished, false);
});

test('tickPlayerMovement advances x at BASE_SPEED when not stunned or slowed', () => {
  const p = createPlayer('p1', 'Alice');
  tickPlayerMovement(p, 1.0, { jumping: false, ducking: false });
  assert.strictEqual(p.x, BASE_SPEED);
});

test('tickPlayerMovement advances x at SLOWED_SPEED while slowMs > 0', () => {
  const p = createPlayer('p1', 'Alice');
  p.slowMs = 1000;
  tickPlayerMovement(p, 1.0, { jumping: false, ducking: false });
  assert.strictEqual(p.x, SLOWED_SPEED);
  assert.strictEqual(p.slowMs, 0);
});

test('tickPlayerMovement does not advance x while stunMs > 0, and counts it down', () => {
  const p = createPlayer('p1', 'Alice');
  p.stunMs = 500;
  tickPlayerMovement(p, 1.0, { jumping: false, ducking: false });
  assert.strictEqual(p.x, 0);
  assert.strictEqual(p.stunMs, 0);
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

test('finished players do not move even without stun or slow', () => {
  const p = createPlayer('p1', 'Alice');
  p.finished = true;
  tickPlayerMovement(p, 1.0, { jumping: false, ducking: false });
  assert.strictEqual(p.x, 0);
});
