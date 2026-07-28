const { test } = require('node:test');
const assert = require('node:assert');
const { createPlayer } = require('../server/player');
const { SEGMENT_SPEED_MULTIPLIER_VALUES } = require('../server/constants');

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
});

test('createPlayer assigns a shuffled, no-duplicate segment speed multiplier order', () => {
  const p = createPlayer('p1', 'Alice');
  assert.strictEqual(p.segmentSpeedMultipliers.length, SEGMENT_SPEED_MULTIPLIER_VALUES.length);
  assert.deepStrictEqual(
    [...p.segmentSpeedMultipliers].sort((a, b) => a - b),
    [...SEGMENT_SPEED_MULTIPLIER_VALUES].sort((a, b) => a - b)
  );
});
