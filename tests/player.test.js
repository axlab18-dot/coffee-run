const { test } = require('node:test');
const assert = require('node:assert');
const { createPlayer } = require('../server/player');

test('createPlayer starts at x=0 with no gacha state, no held item, no rank', () => {
  const p = createPlayer('p1', 'Alice');
  assert.strictEqual(p.id, 'p1');
  assert.strictEqual(p.name, 'Alice');
  assert.strictEqual(p.x, 0);
  assert.strictEqual(p.checkpointsDone, 0);
  assert.strictEqual(p.gachaState, null);
  assert.strictEqual(p.heldItem, null);
  assert.strictEqual(p.finished, false);
  assert.strictEqual(p.rank, null);
  assert.strictEqual(p.guaranteedRank, false);
  assert.strictEqual(p.isGiant, false);
  assert.strictEqual(p.finishTimeMs, null);
  assert.strictEqual(p.forcedMove, null);
  assert.strictEqual(p.accelCount, 0);
  assert.strictEqual(p.decelCount, 0);
});
