const { test } = require('node:test');
const assert = require('node:assert');
const { createTrack, isPastFinish, TRACKS } = require('../server/track');
const { BASE_SPEED, TRACK_MIN_SECONDS, TRACK_MAX_SECONDS, NUM_SEGMENTS } = require('../server/constants');

test('createTrack produces a length within the 30-60s (at base speed) range', () => {
  for (let i = 0; i < 50; i++) {
    const { trackLength } = createTrack();
    assert.ok(trackLength >= BASE_SPEED * TRACK_MIN_SECONDS);
    assert.ok(trackLength <= BASE_SPEED * TRACK_MAX_SECONDS);
  }
});

test('createTrack splits the track into NUM_SEGMENTS (5) even checkpoints', () => {
  const { trackLength, checkpoints } = createTrack();
  assert.strictEqual(checkpoints.length, NUM_SEGMENTS);
  for (let i = 0; i < NUM_SEGMENTS; i++) {
    assert.strictEqual(checkpoints[i], (trackLength * i) / NUM_SEGMENTS);
  }
});

test('isPastFinish is true only at or beyond the given track length', () => {
  assert.strictEqual(isPastFinish(2999, 3000), false);
  assert.strictEqual(isPastFinish(3000, 3000), true);
});

test('createTrack assigns one segmentTrack per segment, all 5 track types exactly once', () => {
  for (let i = 0; i < 50; i++) {
    const { segmentTracks } = createTrack();
    assert.strictEqual(segmentTracks.length, NUM_SEGMENTS);
    assert.deepStrictEqual(
      [...segmentTracks].sort((a, b) => a - b),
      TRACKS.map((t) => t.id).sort((a, b) => a - b)
    );
  }
});

test('different rounds get independently shuffled track orders (not always the same order)', () => {
  const orders = new Set();
  for (let i = 0; i < 100; i++) {
    orders.add(createTrack().segmentTracks.join(','));
  }
  assert.ok(orders.size > 1, 'expected more than one distinct shuffled order across many rounds');
});
