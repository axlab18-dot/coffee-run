# SEON Battle Ball Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time multiplayer browser racing game where players auto-run along a side-scrolling track, jump/duck around obstacles, pick up and throw balls at opponents, and race to a finish line.

**Architecture:** Node.js server (Express + Socket.io) runs an authoritative game loop at a fixed tick rate over pure, unit-tested logic modules (track, player physics, obstacle collision, ball pickup/throw, round state machine, lobby). The server broadcasts full game state to clients each tick. The browser client is a vanilla-JS + HTML5 Canvas renderer that only sends input events and draws whatever state the server sends.

**Tech Stack:** Node.js, Express, Socket.io, vanilla JS/HTML5 Canvas on the client, Node's built-in `node:test` + `node:assert` for unit tests (no extra test framework dependency needed).

---

## File Structure

```
package.json
server/
  index.js          # Express app + Socket.io wiring, starts the game loop, entry point
  constants.js       # tunable numbers (speeds, timer durations, tick rate, track length)
  track.js           # static track definition (obstacles, finish line) + pure helpers
  player.js          # createPlayer() and pure per-tick player movement/timer logic
  obstacles.js       # pure obstacle collision detection
  balls.js           # pure ball pickup + throw + thrown-ball collision logic
  round.js           # round state machine: waiting -> countdown -> racing -> finished
  lobby.js           # connected-player registry + ready-state tracking
public/
  index.html         # page shell, canvas element, lobby UI
  style.css          # minimal styling
  client.js          # socket connection, input handling, canvas rendering
tests/
  track.test.js
  player.test.js
  obstacles.test.js
  balls.test.js
  round.test.js
  lobby.test.js
```

Each `server/*.js` module (other than `index.js`) exports pure functions with no Socket.io or I/O dependency, so every rule from the spec is independently testable. `server/index.js` is the only file that touches networking — it is verified by manual end-to-end testing (Task 12) rather than unit tests.

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `server/constants.js`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "seon-battle-ball",
  "version": "1.0.0",
  "description": "Real-time multiplayer side-scrolling racing/dodgeball game",
  "main": "server/index.js",
  "scripts": {
    "start": "node server/index.js",
    "test": "node --test tests/"
  },
  "dependencies": {
    "express": "^4.19.2",
    "socket.io": "^4.7.5"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Create `server/constants.js`**

```javascript
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
```

- [ ] **Step 4: Commit**

```bash
git add package.json server/constants.js
git commit -m "chore: scaffold project with dependencies and constants"
```

---

## Task 2: Track Module

**Files:**
- Create: `server/track.js`
- Test: `tests/track.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/track.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { TRACK, getObstacleAt, isPastFinish } = require('../server/track');

test('track has obstacles and ball spawns within track length', () => {
  const { TRACK_LENGTH } = require('../server/constants');
  for (const obstacle of TRACK.obstacles) {
    assert.ok(obstacle.x >= 0 && obstacle.x < TRACK_LENGTH);
    assert.ok(['pit', 'rock', 'stone'].includes(obstacle.type));
  }
  for (const spawn of TRACK.ballSpawns) {
    assert.ok(spawn.x >= 0 && spawn.x < TRACK_LENGTH);
    assert.ok(['big', 'small'].includes(spawn.type));
  }
});

test('getObstacleAt finds an obstacle within hit radius', () => {
  const obstacle = TRACK.obstacles[0];
  const found = getObstacleAt(obstacle.x + 5, 20);
  assert.strictEqual(found, obstacle);
});

test('getObstacleAt returns undefined when nothing is nearby', () => {
  const found = getObstacleAt(-1000, 20);
  assert.strictEqual(found, undefined);
});

test('isPastFinish is true only at or beyond track length', () => {
  const { TRACK_LENGTH } = require('../server/constants');
  assert.strictEqual(isPastFinish(TRACK_LENGTH - 1), false);
  assert.strictEqual(isPastFinish(TRACK_LENGTH), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/track.test.js`
Expected: FAIL with "Cannot find module '../server/track'"

- [ ] **Step 3: Write implementation**

```javascript
// server/track.js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/track.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/track.js tests/track.test.js
git commit -m "feat: add track definition with obstacles and ball spawns"
```

---

## Task 3: Player Movement Module

**Files:**
- Create: `server/player.js`
- Test: `tests/player.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/player.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { createPlayer, tickPlayerMovement } = require('../server/player');
const { BASE_SPEED, SLOWED_SPEED } = require('../server/constants');

test('createPlayer starts at x=0 with no timers or held ball', () => {
  const p = createPlayer('p1', 'Alice');
  assert.strictEqual(p.id, 'p1');
  assert.strictEqual(p.name, 'Alice');
  assert.strictEqual(p.x, 0);
  assert.strictEqual(p.action, 'running');
  assert.strictEqual(p.stunMs, 0);
  assert.strictEqual(p.slowMs, 0);
  assert.strictEqual(p.heldBall, null);
  assert.strictEqual(p.finished, false);
});

test('tickPlayerMovement advances x at BASE_SPEED when not stunned or slowed', () => {
  const p = createPlayer('p1', 'Alice');
  tickPlayerMovement(p, 1.0, { jumping: false, ducking: false });
  assert.strictEqual(p.x, BASE_SPEED);
});

test('tickPlayerMovement advances x at SLOWED_SPEED while slowMs > 0', () => {
  const p = createPlayer('p1', 'Alice');
  p.slowMs = 1000;
  tickPlayerMovement(p, 1.0, { jumping: false, ducking: false });
  assert.strictEqual(p.x, SLOWED_SPEED);
  assert.strictEqual(p.slowMs, 0);
});

test('tickPlayerMovement does not advance x while stunMs > 0, and counts it down', () => {
  const p = createPlayer('p1', 'Alice');
  p.stunMs = 500;
  tickPlayerMovement(p, 1.0, { jumping: false, ducking: false });
  assert.strictEqual(p.x, 0);
  assert.strictEqual(p.stunMs, 0);
});

test('tickPlayerMovement sets action to jumping or ducking based on input', () => {
  const p = createPlayer('p1', 'Alice');
  tickPlayerMovement(p, 0.1, { jumping: true, ducking: false });
  assert.strictEqual(p.action, 'jumping');
  tickPlayerMovement(p, 0.1, { jumping: false, ducking: true });
  assert.strictEqual(p.action, 'ducking');
  tickPlayerMovement(p, 0.1, { jumping: false, ducking: false });
  assert.strictEqual(p.action, 'running');
});

test('finished players do not move even without stun or slow', () => {
  const p = createPlayer('p1', 'Alice');
  p.finished = true;
  tickPlayerMovement(p, 1.0, { jumping: false, ducking: false });
  assert.strictEqual(p.x, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/player.test.js`
Expected: FAIL with "Cannot find module '../server/player'"

- [ ] **Step 3: Write implementation**

```javascript
// server/player.js
const { BASE_SPEED, SLOWED_SPEED } = require('./constants');

function createPlayer(id, name) {
  return {
    id,
    name,
    x: 0,
    action: 'running', // 'running' | 'jumping' | 'ducking'
    stunMs: 0,
    slowMs: 0,
    heldBall: null,     // null | 'big' | 'small'
    finished: false,
    finishTimeMs: null,
    hitObstacleXs: new Set(),
    collectedBallXs: new Set()
  };
}

function tickPlayerMovement(player, dtSeconds, input) {
  if (player.finished) return;

  if (player.stunMs > 0) {
    player.stunMs = Math.max(0, player.stunMs - dtSeconds * 1000);
    player.action = 'stunned';
    return;
  }

  const speed = player.slowMs > 0 ? SLOWED_SPEED : BASE_SPEED;
  if (player.slowMs > 0) {
    player.slowMs = Math.max(0, player.slowMs - dtSeconds * 1000);
  }

  player.x += speed * dtSeconds;

  if (input.jumping) player.action = 'jumping';
  else if (input.ducking) player.action = 'ducking';
  else player.action = 'running';
}

module.exports = { createPlayer, tickPlayerMovement };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/player.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add server/player.js tests/player.test.js
git commit -m "feat: add player creation and per-tick movement logic"
```

---

## Task 4: Obstacle Collision Module

**Files:**
- Create: `server/obstacles.js`
- Test: `tests/obstacles.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/obstacles.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { createPlayer } = require('../server/player');
const { applyObstacleCollisions } = require('../server/obstacles');
const { PIT_STUN_MS, ROCK_STUN_MS, STONE_SLOW_MS } = require('../server/constants');

function playerAt(x, action = 'running') {
  const p = createPlayer('p1', 'Alice');
  p.x = x;
  p.action = action;
  return p;
}

test('running into a pit stuns the player for PIT_STUN_MS', () => {
  const track = { obstacles: [{ type: 'pit', x: 400 }], ballSpawns: [] };
  const p = playerAt(400, 'running');
  applyObstacleCollisions(p, track);
  assert.strictEqual(p.stunMs, PIT_STUN_MS);
});

test('jumping over a pit avoids the stun', () => {
  const track = { obstacles: [{ type: 'pit', x: 400 }], ballSpawns: [] };
  const p = playerAt(400, 'jumping');
  applyObstacleCollisions(p, track);
  assert.strictEqual(p.stunMs, 0);
});

test('hitting a rock while running stuns for ROCK_STUN_MS', () => {
  const track = { obstacles: [{ type: 'rock', x: 800 }], ballSpawns: [] };
  const p = playerAt(800, 'running');
  applyObstacleCollisions(p, track);
  assert.strictEqual(p.stunMs, ROCK_STUN_MS);
});

test('hitting a stone while running slows for STONE_SLOW_MS', () => {
  const track = { obstacles: [{ type: 'stone', x: 1100 }], ballSpawns: [] };
  const p = playerAt(1100, 'running');
  applyObstacleCollisions(p, track);
  assert.strictEqual(p.slowMs, STONE_SLOW_MS);
});

test('the same obstacle only triggers once per player', () => {
  const track = { obstacles: [{ type: 'rock', x: 800 }], ballSpawns: [] };
  const p = playerAt(800, 'running');
  applyObstacleCollisions(p, track);
  p.stunMs = 0; // pretend the stun already wore off
  applyObstacleCollisions(p, track);
  assert.strictEqual(p.stunMs, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/obstacles.test.js`
Expected: FAIL with "Cannot find module '../server/obstacles'"

- [ ] **Step 3: Write implementation**

```javascript
// server/obstacles.js
const { HIT_RADIUS, PIT_STUN_MS, ROCK_STUN_MS, STONE_SLOW_MS } = require('./constants');

function applyObstacleCollisions(player, track) {
  for (const obstacle of track.obstacles) {
    const key = `${obstacle.type}:${obstacle.x}`;
    if (player.hitObstacleXs.has(key)) continue;
    if (Math.abs(player.x - obstacle.x) > HIT_RADIUS) continue;

    player.hitObstacleXs.add(key);

    if (obstacle.type === 'pit' && player.action !== 'jumping') {
      player.stunMs = PIT_STUN_MS;
    } else if (obstacle.type === 'rock' && player.action !== 'jumping') {
      player.stunMs = ROCK_STUN_MS;
    } else if (obstacle.type === 'stone' && player.action !== 'jumping') {
      player.slowMs = STONE_SLOW_MS;
    }
  }
}

module.exports = { applyObstacleCollisions };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/obstacles.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/obstacles.js tests/obstacles.test.js
git commit -m "feat: add obstacle collision detection with jump avoidance"
```

---

## Task 5: Ball Pickup, Throw, and Hit Detection Module

**Files:**
- Create: `server/balls.js`
- Test: `tests/balls.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/balls.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { createPlayer } = require('../server/player');
const {
  applyBallPickup,
  throwBall,
  tickThrownBalls,
  BIG_BALL_STUN_MS,
  SMALL_BALL_SLOW_MS
} = require('../server/balls');

function playerAt(id, x, action = 'running') {
  const p = createPlayer(id, id);
  p.x = x;
  p.action = action;
  return p;
}

test('walking over a ball spawn picks it up once', () => {
  const track = { obstacles: [], ballSpawns: [{ type: 'big', x: 900 }] };
  const p = playerAt('p1', 900);
  applyBallPickup(p, track);
  assert.strictEqual(p.heldBall, 'big');

  p.heldBall = null; // drop it again to prove re-pickup is blocked
  applyBallPickup(p, track);
  assert.strictEqual(p.heldBall, null);
});

test('cannot pick up a ball while already holding one', () => {
  const track = { obstacles: [], ballSpawns: [{ type: 'small', x: 300 }] };
  const p = playerAt('p1', 300);
  p.heldBall = 'big';
  applyBallPickup(p, track);
  assert.strictEqual(p.heldBall, 'big');
});

test('throwBall creates a thrown ball and clears the held ball', () => {
  const p = playerAt('p1', 500);
  p.heldBall = 'small';
  const thrown = throwBall(p);
  assert.strictEqual(thrown.type, 'small');
  assert.strictEqual(thrown.ownerId, 'p1');
  assert.strictEqual(thrown.x, 500);
  assert.strictEqual(p.heldBall, null);
});

test('throwBall returns null when the player holds nothing', () => {
  const p = playerAt('p1', 500);
  const thrown = throwBall(p);
  assert.strictEqual(thrown, null);
});

test('tickThrownBalls advances balls forward and drops out-of-range ones', () => {
  const balls = [{ ownerId: 'p1', type: 'small', x: 0, traveled: 0 }];
  tickThrownBalls(balls, 1.0, []);
  assert.ok(balls[0].x > 0);
});

test('a big ball hitting a running opponent stuns them, and is removed', () => {
  const target = playerAt('p2', 520, 'running');
  const balls = [{ ownerId: 'p1', type: 'big', x: 500, traveled: 0 }];
  tickThrownBalls(balls, 0.1, [target]);
  assert.strictEqual(target.stunMs, BIG_BALL_STUN_MS);
  assert.strictEqual(balls.length, 0);
});

test('a small ball hitting a running opponent slows them', () => {
  const target = playerAt('p2', 520, 'running');
  const balls = [{ ownerId: 'p1', type: 'small', x: 500, traveled: 0 }];
  tickThrownBalls(balls, 0.1, [target]);
  assert.strictEqual(target.slowMs, SMALL_BALL_SLOW_MS);
});

test('ducking dodges a thrown ball entirely', () => {
  const target = playerAt('p2', 520, 'ducking');
  const balls = [{ ownerId: 'p1', type: 'big', x: 500, traveled: 0 }];
  tickThrownBalls(balls, 0.1, [target]);
  assert.strictEqual(target.stunMs, 0);
  assert.strictEqual(balls.length, 1);
});

test('a thrown ball never hits its own owner', () => {
  const owner = playerAt('p1', 500, 'running');
  const balls = [{ ownerId: 'p1', type: 'big', x: 500, traveled: 0 }];
  tickThrownBalls(balls, 0.1, [owner]);
  assert.strictEqual(owner.stunMs, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/balls.test.js`
Expected: FAIL with "Cannot find module '../server/balls'"

- [ ] **Step 3: Write implementation**

```javascript
// server/balls.js
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
    ball.x += distance;
    ball.traveled += distance;

    if (ball.traveled >= THROW_RANGE) {
      balls.splice(i, 1);
      continue;
    }

    const target = players.find(
      (p) => p.id !== ball.ownerId && !p.finished && Math.abs(p.x - ball.x) <= HIT_RADIUS
    );
    if (!target) continue;

    if (target.action === 'ducking') {
      balls.splice(i, 1); // dodged, ball is spent either way
      continue;
    }

    if (ball.type === 'big') {
      target.stunMs = BIG_BALL_STUN_MS;
    } else {
      target.slowMs = SMALL_BALL_SLOW_MS;
    }
    balls.splice(i, 1);
  }
}

module.exports = {
  applyBallPickup,
  throwBall,
  tickThrownBalls,
  BIG_BALL_STUN_MS,
  SMALL_BALL_SLOW_MS
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/balls.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add server/balls.js tests/balls.test.js
git commit -m "feat: add ball pickup, throw, and hit detection with duck dodge"
```

---

## Task 6: Round State Machine

**Files:**
- Create: `server/round.js`
- Test: `tests/round.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/round.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { createRound, tickRound } = require('../server/round');
const { createPlayer } = require('../server/player');
const { TRACK_LENGTH, ROUND_TIME_LIMIT_MS } = require('../server/constants');

test('a new round starts in racing phase with players at x=0', () => {
  const players = [createPlayer('p1', 'Alice'), createPlayer('p2', 'Bob')];
  const round = createRound(players);
  assert.strictEqual(round.phase, 'racing');
  assert.strictEqual(round.players.length, 2);
});

test('a player crossing the finish line is marked finished and ranked', () => {
  const players = [createPlayer('p1', 'Alice'), createPlayer('p2', 'Bob')];
  const round = createRound(players);
  round.players[0].x = TRACK_LENGTH;
  tickRound(round, 0, {});
  assert.strictEqual(round.players[0].finished, true);
  assert.strictEqual(round.players[0].rank, 1);
});

test('ranks are assigned in the order players finish', () => {
  const players = [createPlayer('p1', 'Alice'), createPlayer('p2', 'Bob')];
  const round = createRound(players);
  round.players[1].x = TRACK_LENGTH;
  tickRound(round, 0, {});
  round.players[0].x = TRACK_LENGTH;
  tickRound(round, 0, {});
  assert.strictEqual(round.players[1].rank, 1);
  assert.strictEqual(round.players[0].rank, 2);
});

test('round moves to finished phase once every player has finished', () => {
  const players = [createPlayer('p1', 'Alice'), createPlayer('p2', 'Bob')];
  const round = createRound(players);
  round.players[0].x = TRACK_LENGTH;
  round.players[1].x = TRACK_LENGTH;
  tickRound(round, 0, {});
  assert.strictEqual(round.phase, 'finished');
});

test('round moves to finished phase once the time limit elapses', () => {
  const players = [createPlayer('p1', 'Alice')];
  const round = createRound(players);
  tickRound(round, ROUND_TIME_LIMIT_MS / 1000 + 1, {});
  assert.strictEqual(round.phase, 'finished');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/round.test.js`
Expected: FAIL with "Cannot find module '../server/round'"

- [ ] **Step 3: Write implementation**

```javascript
// server/round.js
const { tickPlayerMovement } = require('./player');
const { applyObstacleCollisions } = require('./obstacles');
const { applyBallPickup, tickThrownBalls } = require('./balls');
const { TRACK, isPastFinish } = require('./track');
const { ROUND_TIME_LIMIT_MS } = require('./constants');

function createRound(players) {
  return {
    phase: 'racing', // 'racing' | 'finished'
    players,
    thrownBalls: [],
    elapsedMs: 0,
    nextRank: 1
  };
}

function tickRound(round, dtSeconds, inputsByPlayerId) {
  if (round.phase !== 'racing') return;

  round.elapsedMs += dtSeconds * 1000;

  for (const player of round.players) {
    if (player.finished) continue;
    const input = inputsByPlayerId[player.id] || { jumping: false, ducking: false };
    tickPlayerMovement(player, dtSeconds, input);
    applyObstacleCollisions(player, TRACK);
    applyBallPickup(player, TRACK);

    if (isPastFinish(player.x)) {
      player.finished = true;
      player.rank = round.nextRank++;
    }
  }

  tickThrownBalls(round.thrownBalls, dtSeconds, round.players);

  const allFinished = round.players.every((p) => p.finished);
  const timeUp = round.elapsedMs >= ROUND_TIME_LIMIT_MS;
  if (allFinished || timeUp) {
    round.phase = 'finished';
  }
}

module.exports = { createRound, tickRound };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/round.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/round.js tests/round.test.js
git commit -m "feat: add round state machine tying movement, obstacles, and balls together"
```

---

## Task 7: Lobby Module

**Files:**
- Create: `server/lobby.js`
- Test: `tests/lobby.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/lobby.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { createLobby, addPlayer, removePlayer, setReady, allReady } = require('../server/lobby');

test('a new lobby has no players', () => {
  const lobby = createLobby();
  assert.deepStrictEqual(lobby.players, []);
});

test('addPlayer adds a not-ready player', () => {
  const lobby = createLobby();
  addPlayer(lobby, 'p1', 'Alice');
  assert.strictEqual(lobby.players.length, 1);
  assert.strictEqual(lobby.players[0].ready, false);
});

test('removePlayer takes a player back out', () => {
  const lobby = createLobby();
  addPlayer(lobby, 'p1', 'Alice');
  removePlayer(lobby, 'p1');
  assert.strictEqual(lobby.players.length, 0);
});

test('allReady is false for an empty lobby', () => {
  const lobby = createLobby();
  assert.strictEqual(allReady(lobby), false);
});

test('allReady is false until every player is ready', () => {
  const lobby = createLobby();
  addPlayer(lobby, 'p1', 'Alice');
  addPlayer(lobby, 'p2', 'Bob');
  setReady(lobby, 'p1', true);
  assert.strictEqual(allReady(lobby), false);
  setReady(lobby, 'p2', true);
  assert.strictEqual(allReady(lobby), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lobby.test.js`
Expected: FAIL with "Cannot find module '../server/lobby'"

- [ ] **Step 3: Write implementation**

```javascript
// server/lobby.js
function createLobby() {
  return { players: [] };
}

function addPlayer(lobby, id, name) {
  lobby.players.push({ id, name, ready: false });
}

function removePlayer(lobby, id) {
  lobby.players = lobby.players.filter((p) => p.id !== id);
}

function setReady(lobby, id, ready) {
  const player = lobby.players.find((p) => p.id === id);
  if (player) player.ready = ready;
}

function allReady(lobby) {
  return lobby.players.length > 0 && lobby.players.every((p) => p.ready);
}

module.exports = { createLobby, addPlayer, removePlayer, setReady, allReady };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lobby.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/lobby.js tests/lobby.test.js
git commit -m "feat: add lobby join/leave/ready tracking"
```

---

## Task 8: Full Test Suite Check

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: All 28 tests across track/player/obstacles/balls/round/lobby pass, 0 failures.

---

## Task 9: Server Wiring (Express + Socket.io)

**Files:**
- Create: `server/index.js`

- [ ] **Step 1: Write the server entry point**

```javascript
// server/index.js
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const { createLobby, addPlayer, removePlayer, setReady, allReady } = require('./lobby');
const { createPlayer } = require('./player');
const { createRound, tickRound } = require('./round');
const { throwBall } = require('./balls');
const { TICK_RATE, COUNTDOWN_MS } = require('./constants');

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const io = new Server(server);

const lobby = createLobby();
const inputsByPlayerId = {};
let round = null;

function broadcastLobby() {
  io.emit('lobby-state', lobby);
}

function broadcastRound() {
  if (!round) return;
  io.emit('round-state', {
    phase: round.phase,
    players: round.players.map((p) => ({
      id: p.id,
      name: p.name,
      x: p.x,
      action: p.action,
      heldBall: p.heldBall,
      finished: p.finished,
      rank: p.rank || null
    })),
    thrownBalls: round.thrownBalls
  });
}

io.on('connection', (socket) => {
  socket.on('join', (name) => {
    const safeName = String(name || '').trim().slice(0, 20) || `Player-${socket.id.slice(0, 4)}`;
    addPlayer(lobby, socket.id, safeName);
    inputsByPlayerId[socket.id] = { jumping: false, ducking: false };
    broadcastLobby();
  });

  socket.on('ready', (isReady) => {
    setReady(lobby, socket.id, !!isReady);
    broadcastLobby();

    if (allReady(lobby) && !round) {
      setTimeout(() => {
        const players = lobby.players.map((p) => createPlayer(p.id, p.name));
        round = createRound(players);
      }, COUNTDOWN_MS);
    }
  });

  socket.on('input', (input) => {
    inputsByPlayerId[socket.id] = {
      jumping: !!input.jumping,
      ducking: !!input.ducking
    };
  });

  socket.on('throw', () => {
    if (!round) return;
    const player = round.players.find((p) => p.id === socket.id);
    if (!player) return;
    const thrown = throwBall(player);
    if (thrown) round.thrownBalls.push(thrown);
  });

  socket.on('disconnect', () => {
    removePlayer(lobby, socket.id);
    delete inputsByPlayerId[socket.id];
    if (round) {
      round.players = round.players.filter((p) => p.id !== socket.id);
    }
    broadcastLobby();
  });
});

const dt = 1 / TICK_RATE;
setInterval(() => {
  if (round) {
    tickRound(round, dt, inputsByPlayerId);
    broadcastRound();
    if (round.phase === 'finished') {
      setTimeout(() => {
        round = null;
        for (const p of lobby.players) p.ready = false;
        broadcastLobby();
      }, 5000);
    }
  }
}, 1000 / TICK_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SEON Battle Ball listening on http://localhost:${PORT}`);
});
```

- [ ] **Step 2: Commit**

```bash
git add server/index.js
git commit -m "feat: wire Express + Socket.io server around the game modules"
```

---

## Task 10: Client Page Shell

**Files:**
- Create: `public/index.html`
- Create: `public/style.css`

- [ ] **Step 1: Write `public/index.html`**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>SEON Battle Ball</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div id="name-entry">
    <h1>SEON Battle Ball</h1>
    <input id="name-input" type="text" placeholder="닉네임을 입력하세요" maxlength="20" />
    <button id="join-button">Join</button>
  </div>
  <div id="lobby" style="display:none;">
    <h1>SEON Battle Ball</h1>
    <ul id="player-list"></ul>
    <button id="ready-button">Ready</button>
  </div>
  <canvas id="game-canvas" width="800" height="300" style="display:none;"></canvas>
  <script src="/socket.io/socket.io.js"></script>
  <script src="client.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `public/style.css`**

```css
body {
  font-family: sans-serif;
  background: #222;
  color: #eee;
  text-align: center;
}

#player-list {
  list-style: none;
  padding: 0;
}

#player-list li.ready {
  color: #4caf50;
}

#game-canvas {
  background: #87ceeb;
  margin-top: 20px;
  border: 2px solid #444;
}

#ready-button {
  font-size: 1.2em;
  padding: 8px 24px;
}
```

- [ ] **Step 3: Commit**

```bash
git add public/index.html public/style.css
git commit -m "feat: add client page shell with lobby and canvas"
```

---

## Task 11: Client Script (Input + Rendering)

**Files:**
- Create: `public/client.js`

- [ ] **Step 1: Write `public/client.js`**

```javascript
// public/client.js
const socket = io();

const nameEntryEl = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const joinButton = document.getElementById('join-button');
const lobbyEl = document.getElementById('lobby');
const playerListEl = document.getElementById('player-list');
const readyButton = document.getElementById('ready-button');
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

let isReady = false;
let latestRoundState = null;

function join() {
  const name = nameInput.value.trim();
  if (!name) return;
  socket.emit('join', name);
  nameEntryEl.style.display = 'none';
  lobbyEl.style.display = 'block';
}

joinButton.addEventListener('click', join);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') join();
});

readyButton.addEventListener('click', () => {
  isReady = !isReady;
  socket.emit('ready', isReady);
  readyButton.textContent = isReady ? 'Cancel' : 'Ready';
});

socket.on('lobby-state', (lobby) => {
  playerListEl.innerHTML = '';
  for (const player of lobby.players) {
    const li = document.createElement('li');
    li.textContent = player.name;
    if (player.ready) li.classList.add('ready');
    playerListEl.appendChild(li);
  }
});

socket.on('round-state', (state) => {
  latestRoundState = state;
  lobbyEl.style.display = 'none';
  canvas.style.display = 'block';
  render(state);

  if (state.phase === 'finished') {
    setTimeout(() => {
      lobbyEl.style.display = 'block';
      canvas.style.display = 'none';
      isReady = false;
      readyButton.textContent = 'Ready';
    }, 4500);
  }
});

function render(state) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scale = canvas.width / 3000; // matches TRACK_LENGTH
  const groundY = canvas.height - 40;

  ctx.strokeStyle = '#000';
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(canvas.width, groundY);
  ctx.stroke();

  for (const player of state.players) {
    const x = player.x * scale;
    let y = groundY;
    if (player.action === 'jumping') y -= 30;
    if (player.action === 'ducking') y -= 5;

    ctx.fillStyle = player.finished ? '#999' : '#e53935';
    ctx.fillRect(x, y - 30, 20, 30);
    ctx.fillStyle = '#000';
    ctx.font = '10px sans-serif';
    ctx.fillText(player.name, x - 10, y - 34);
    if (player.rank) ctx.fillText(`#${player.rank}`, x - 10, y - 44);
  }

  for (const ball of state.thrownBalls) {
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(ball.x * scale, groundY - 15, ball.type === 'big' ? 8 : 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

const keysDown = new Set();

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keysDown.add(e.code);
  sendInput();
  if (e.code === 'Space') socket.emit('throw');
});

window.addEventListener('keyup', (e) => {
  keysDown.delete(e.code);
  sendInput();
});

function sendInput() {
  socket.emit('input', {
    jumping: keysDown.has('ArrowUp'),
    ducking: keysDown.has('ArrowDown')
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add public/client.js
git commit -m "feat: add client input handling and canvas rendering"
```

---

## Task 12: Manual End-to-End Verification

**Files:** none (manual verification only)

- [ ] **Step 1: Start the server**

Run: `npm start`
Expected: Console prints `SEON Battle Ball listening on http://localhost:3000`

- [ ] **Step 2: Open two browser tabs to `http://localhost:3000`, enter a different nickname in each, and click Join**

Expected: Both tabs switch from the name-entry screen to the lobby, showing two player entries (with the entered nicknames) in `#player-list`.

- [ ] **Step 3: Click Ready in both tabs**

Expected: After the `COUNTDOWN_MS` delay (3s), both tabs switch to the canvas view and characters begin moving right automatically.

- [ ] **Step 4: In one tab, hold ArrowUp when approaching a pit/rock marker**

Expected: The character's drawn position rises (jump) and does not stall; without pressing ArrowUp, running into the same obstacle type on a second run should visibly pause that character for the obstacle's stun duration.

- [ ] **Step 5: Pick up a ball, then press Space near the other player**

Expected: A small dark circle (the thrown ball) appears and travels right across the canvas; if it reaches the other player while that player is not ducking, that player's rectangle stops moving briefly.

- [ ] **Step 6: Hold ArrowDown in the other tab before the ball arrives**

Expected: The ball passes through without stopping that player (dodge).

- [ ] **Step 7: Let one character reach the right edge of the canvas**

Expected: A `#1` rank label appears above the finishing character; once all players finish (or the time limit passes), both tabs return to the lobby view after the results delay.

- [ ] **Step 8: Commit any fixes found during manual testing**

If manual testing surfaces a bug, fix it, re-run the relevant unit tests (`npm test`), re-verify manually, then commit:

```bash
git add -A
git commit -m "fix: <describe the bug fixed during manual verification>"
```

---

## Spec Coverage Check

- Lobby & matchmaking (nickname entry, single shared lobby, ready button, no cap) → Task 7, Task 9, Task 10, Task 11
- Controls (auto-run, jump, duck, throw) → Task 3, Task 11
- Track obstacles (pit/rock/stone with correct durations) → Task 2, Task 4
- Ball system (spawn, pickup, big/small effects, throw) → Task 2, Task 5
- Win condition (ranking, round end, return to lobby) → Task 6, Task 9, Task 11
- Server-authoritative architecture → Task 9 (game loop owns all state; client only renders)
- Disconnect handling → Task 9 (`disconnect` handler removes player from lobby/round)
