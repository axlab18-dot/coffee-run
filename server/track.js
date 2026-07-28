const { BASE_SPEED, TRACK_MIN_SECONDS, TRACK_MAX_SECONDS, NUM_SEGMENTS } = require('./constants');

function createTrack() {
  const seconds = TRACK_MIN_SECONDS + Math.random() * (TRACK_MAX_SECONDS - TRACK_MIN_SECONDS);
  const trackLength = Math.round(BASE_SPEED * seconds);
  const checkpoints = Array.from({ length: NUM_SEGMENTS }, (_, i) => (trackLength * i) / NUM_SEGMENTS);
  return { trackLength, checkpoints };
}

function isPastFinish(x, trackLength) {
  return x >= trackLength;
}

module.exports = { createTrack, isPastFinish };
