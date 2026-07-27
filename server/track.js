const { TRACK_LENGTH, HIT_RADIUS } = require('./constants');

const TRACK = {
  obstacles: [
    { type: 'pit', x: 400 },
    { type: 'rock', x: 800 },
    { type: 'stone', x: 1100 },
    { type: 'pit', x: 1500 },
    { type: 'rock', x: 1900 },
    { type: 'stone', x: 2200 },
    { type: 'pit', x: 2600 }
  ],
  ballSpawns: [
    { type: 'small', x: 300 },
    { type: 'big', x: 900 },
    { type: 'small', x: 1300 },
    { type: 'big', x: 1800 },
    { type: 'small', x: 2400 }
  ]
};

function getObstacleAt(x, radius = HIT_RADIUS) {
  return TRACK.obstacles.find((o) => Math.abs(o.x - x) <= radius);
}

function isPastFinish(x) {
  return x >= TRACK_LENGTH;
}

module.exports = { TRACK, getObstacleAt, isPastFinish };
