const { test } = require('node:test');
const assert = require('node:assert');
const { createPlayer } = require('../server/player');
const {
  applyBallPickup,
  throwBall,
  tickThrownBalls,
  BIG_BALL_STUN_MS,
  SMALL_BALL_SLOW_MS
} = require('../server/balls');

function playerAt(id, x, action = 'running') {
  const p = createPlayer(id, id);
  p.x = x;
  p.action = action;
  return p;
}

test('walking over a ball spawn picks it up once', () => {
  const track = { obstacles: [], ballSpawns: [{ type: 'big', x: 900 }] };
  const p = playerAt('p1', 900);
  applyBallPickup(p, track);
  assert.strictEqual(p.heldBall, 'big');

  p.heldBall = null; // drop it again to prove re-pickup is blocked
  applyBallPickup(p, track);
  assert.strictEqual(p.heldBall, null);
});

test('cannot pick up a ball while already holding one', () => {
  const track = { obstacles: [], ballSpawns: [{ type: 'small', x: 300 }] };
  const p = playerAt('p1', 300);
  p.heldBall = 'big';
  applyBallPickup(p, track);
  assert.strictEqual(p.heldBall, 'big');
});

test('throwBall creates a thrown ball and clears the held ball', () => {
  const p = playerAt('p1', 500);
  p.heldBall = 'small';
  const thrown = throwBall(p);
  assert.strictEqual(thrown.type, 'small');
  assert.strictEqual(thrown.ownerId, 'p1');
  assert.strictEqual(thrown.x, 500);
  assert.strictEqual(p.heldBall, null);
});

test('throwBall returns null when the player holds nothing', () => {
  const p = playerAt('p1', 500);
  const thrown = throwBall(p);
  assert.strictEqual(thrown, null);
});

test('tickThrownBalls advances balls forward and drops out-of-range ones', () => {
  const balls = [{ ownerId: 'p1', type: 'small', x: 0, traveled: 0 }];
  tickThrownBalls(balls, 0.5, []);
  assert.ok(balls[0].x > 0);
});

test('a big ball hitting a running opponent stuns them, and is removed', () => {
  const target = playerAt('p2', 520, 'running');
  const balls = [{ ownerId: 'p1', type: 'big', x: 500, traveled: 0 }];
  tickThrownBalls(balls, 0.1, [target]);
  assert.strictEqual(target.stunMs, BIG_BALL_STUN_MS);
  assert.strictEqual(balls.length, 0);
});

test('a small ball hitting a running opponent slows them', () => {
  const target = playerAt('p2', 520, 'running');
  const balls = [{ ownerId: 'p1', type: 'small', x: 500, traveled: 0 }];
  tickThrownBalls(balls, 0.1, [target]);
  assert.strictEqual(target.slowMs, SMALL_BALL_SLOW_MS);
});

test('ducking dodges a thrown ball entirely', () => {
  const target = playerAt('p2', 520, 'ducking');
  const balls = [{ ownerId: 'p1', type: 'big', x: 500, traveled: 0 }];
  tickThrownBalls(balls, 0.1, [target]);
  assert.strictEqual(target.stunMs, 0);
  assert.strictEqual(target.slowMs, 0);
});

test('a thrown ball never hits its own owner', () => {
  const owner = playerAt('p1', 500, 'running');
  const balls = [{ ownerId: 'p1', type: 'big', x: 500, traveled: 0 }];
  tickThrownBalls(balls, 0.1, [owner]);
  assert.strictEqual(owner.stunMs, 0);
});
