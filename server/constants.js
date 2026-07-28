module.exports = {
  TICK_RATE: 30,               // server ticks per second
  BASE_SPEED: 200,              // px/sec baseline running speed
  TRACK_MIN_SECONDS: 30,        // shortest possible track, at BASE_SPEED
  TRACK_MAX_SECONDS: 60,        // longest possible track, at BASE_SPEED
  GACHA_SELECT_MS: 5000,        // time allowed to pick a gacha option before auto-pick
  ITEM_STOP_SPEED: 0,           // speed while hit by a "stop everyone" item
  ITEM_BACKWARD_SPEED: -200,    // speed while hit by a "run backward" item
  ROUND_TIME_LIMIT_MS: 120000,  // safety-net force-finish if someone never reaches the line

  // The track is split into 5 equal segments (5 gacha checkpoints: start,
  // 1/5, 2/5, 3/5, 4/5). Each player gets this same set of multipliers, but
  // shuffled independently per player — every player hits each multiplier
  // exactly once across their 5 segments, just in a random order.
  NUM_SEGMENTS: 5,
  SEGMENT_SPEED_MULTIPLIER_VALUES: [1, 2, 3, 5, 10],

  // Late-race "dice sprint": a 25% chance per round that everyone still
  // racing gets frozen at a random moment between 45-60s in, forced to roll
  // a die (Space to spin, 2s) for a final, luck-based sprint speed.
  DICE_EVENT_CHANCE: 0.25,
  DICE_MIN_SECONDS: 45,
  DICE_MAX_SECONDS: 60,
  DICE_SPIN_MS: 2000,
  DICE_AUTO_ROLL_MS: 8000 // safety net: auto-rolls for anyone who never presses Space
};
