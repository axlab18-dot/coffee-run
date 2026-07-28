const { SEGMENT_SPEED_MULTIPLIER_VALUES } = require('./constants');

// Fisher-Yates: every value in the pool is used exactly once, just in a
// random order — so a player's 5 segments are a random permutation of the
// same multiplier set, never a repeat.
function shuffledSegmentMultipliers() {
  const values = [...SEGMENT_SPEED_MULTIPLIER_VALUES];
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function createPlayer(id, name) {
  return {
    id,
    name,
    x: 0,
    laneIndex: 0,
    finished: false,
    rank: null,
    resultReason: null, // 'arrived' | 'timeout'
    checkpointsDone: 0, // how many of the 3 checkpoints (start, 1/3, 2/3) have been passed
    segmentSpeedMultipliers: shuffledSegmentMultipliers(), // this player's own random order of the multiplier set
    gachaState: null,   // null | { options: Card[], remainingMs: number }
    heldItem: null,      // null | Card (kind: 'item'), consumed by Space or discarded at next gacha
    guaranteedRank: false,
    guaranteedRankAt: null,
    diceState: null,     // null | { spinning: boolean, remainingMs: number, waitMs: number }
    diceSpeed: null,     // null | number — fixed final-sprint speed once the die is rolled
    diceResult: null     // null | 1-6, the rolled number (kept for display after resolving)
  };
}

module.exports = { createPlayer };
