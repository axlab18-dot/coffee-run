const {
  HIT_RADIUS,
  THROW_SPEED,
  THROW_RANGE,
  BIG_BALL_STUN_MS,
  SMALL_BALL_SLOW_MS
} = require('./constants');

function applyBallPickup(player, track) {
  if (player.heldBall) return;
  for (const spawn of track.ballSpawns) {
    const key = `${spawn.type}:${spawn.x}`;
    if (player.collectedBallXs.has(key)) continue;
    if (Math.abs(player.x - spawn.x) > HIT_RADIUS) continue;

    player.collectedBallXs.add(key);
    player.heldBall = spawn.type;
    return;
  }
}

function throwBall(player) {
  if (!player.heldBall) return null;
  const thrown = { ownerId: player.id, type: player.heldBall, x: player.x, traveled: 0 };
  player.heldBall = null;
  return thrown;
}

function tickThrownBalls(balls, dtSeconds, players) {
  for (let i = balls.length - 1; i >= 0; i--) {
    const ball = balls[i];
    const distance = THROW_SPEED * dtSeconds;
    const fromX = ball.x;
    const toX = fromX + distance;

    // Swept check across the whole segment the ball covers this tick, so a
    // fast-moving ball can't tunnel past a target between two ticks.
    const target = players.find(
      (p) =>
        p.id !== ball.ownerId &&
        !p.finished &&
        p.x >= fromX - HIT_RADIUS &&
        p.x <= toX + HIT_RADIUS
    );

    ball.x = toX;
    ball.traveled += distance;

    if (target) {
      if (target.action !== 'ducking') {
        if (ball.type === 'big') {
          target.stunMs = BIG_BALL_STUN_MS;
        } else {
          target.slowMs = SMALL_BALL_SLOW_MS;
        }
      }
      balls.splice(i, 1); // resolved (hit or dodged), the ball is spent either way
      continue;
    }

    if (ball.traveled >= THROW_RANGE) {
      balls.splice(i, 1);
    }
  }
}

module.exports = {
  applyBallPickup,
  throwBall,
  tickThrownBalls,
  BIG_BALL_STUN_MS,
  SMALL_BALL_SLOW_MS
};
