module.exports = {
  TICK_RATE: 30,               // server ticks per second
  BASE_SPEED: 200,              // px/sec while running normally
  SLOWED_SPEED: 100,            // px/sec while slowed
  TRACK_LENGTH: 3000,           // px from start to finish line
  PIT_STUN_MS: 3000,
  ROCK_STUN_MS: 2000,
  STONE_SLOW_MS: 1000,
  BIG_BALL_STUN_MS: 2000,
  SMALL_BALL_SLOW_MS: 1000,
  THROW_SPEED: 500,             // px/sec for a thrown ball
  THROW_RANGE: 400,             // max distance a thrown ball travels before despawning
  HIT_RADIUS: 20,               // px, distance for obstacle/ball collision checks
  COUNTDOWN_MS: 3000,           // lobby ready -> race start delay
  ROUND_TIME_LIMIT_MS: 60000    // force-end round after this long
};
