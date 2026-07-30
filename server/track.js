const { BASE_SPEED, TRACK_MIN_SECONDS, TRACK_MAX_SECONDS, NUM_SEGMENTS } = require('./constants');

const TRACK_PAVED_ID = 1;
const TRACK_GRASS_ID = 2;
const TRACK_LAVA_ID = 3;
const TRACK_ICE_ID = 4;
const TRACK_THORN_ID = 5;

// See 규칙.txt for the full effect list this mirrors. Per-tick/per-transition
// behavior (bug encounter, post-lava slow, post-ice stun, post-thorn release,
// slow/speed-up immunity) lives in effects.js, not here — this is just the
// static shape + the per-round assignment of one track type per segment.
const TRACKS = [
  { id: TRACK_PAVED_ID, label: '보통길', color: '#e8c93a', speedMultiplier: 1.2 },
  { id: TRACK_GRASS_ID, label: '풀밭', color: '#2e8b57', speedMultiplier: 2 },
  { id: TRACK_LAVA_ID, label: '불바다', color: '#c0392b', speedMultiplier: 2.5 },
  { id: TRACK_ICE_ID, label: '빙판', color: '#3b82c4', speedMultiplier: 3.5 },
  { id: TRACK_THORN_ID, label: '가시밭', color: '#1a1a1a', speedMultiplier: 0.8 }
];

function trackById(id) {
  return TRACKS.find((t) => t.id === id);
}

// NUM_SEGMENTS === TRACKS.length, so a Fisher-Yates shuffle of the 5 track
// ids gives every round exactly one segment of each track type.
function shuffledTrackAssignment() {
  const ids = TRACKS.map((t) => t.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

function createTrack() {
  const seconds = TRACK_MIN_SECONDS + Math.random() * (TRACK_MAX_SECONDS - TRACK_MIN_SECONDS);
  const trackLength = Math.round(BASE_SPEED * seconds);
  const checkpoints = Array.from({ length: NUM_SEGMENTS }, (_, i) => (trackLength * i) / NUM_SEGMENTS);
  const segmentTracks = shuffledTrackAssignment();
  return { trackLength, checkpoints, segmentTracks };
}

function isPastFinish(x, trackLength) {
  return x >= trackLength;
}

module.exports = {
  TRACKS,
  TRACK_PAVED_ID,
  TRACK_GRASS_ID,
  TRACK_LAVA_ID,
  TRACK_ICE_ID,
  TRACK_THORN_ID,
  trackById,
  createTrack,
  isPastFinish
};
