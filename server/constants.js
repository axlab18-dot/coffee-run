module.exports = {
  TICK_RATE: 30,               // server ticks per second
  BASE_SPEED: 200,              // px/sec while running (constant, no more time-based slow/stun)
  TRACK_LENGTH: 3000,           // px from start to finish line
  MAX_HP: 10,
  PIT_DAMAGE: 3,
  ROCK_DAMAGE: 2,
  STONE_DAMAGE: 1,
  BIG_BALL_DAMAGE: 3,
  SMALL_BALL_DAMAGE: 1,
  THROW_SPEED: 500,             // px/sec for a thrown ball
  THROW_RANGE: 400,             // max distance a thrown ball travels before despawning
  HIT_RADIUS: 20,               // px, distance for obstacle/ball collision checks
  ROUND_TIME_LIMIT_MS: 90000    // safety-net force-end if nobody finishes or gets eliminated
};
