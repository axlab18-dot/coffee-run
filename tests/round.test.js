const { test } = require('node:test');
const assert = require('node:assert');
const { createRound, tickRound } = require('../server/round');
const { createPlayer } = require('../server/player');
const { TRACK_LENGTH, ROUND_TIME_LIMIT_MS, MAX_HP } = require('../server/constants');

test('a new round starts in racing phase with players at x=0 and full hp', () => {
  const players = [createPlayer('p1', 'Alice'), createPlayer('p2', 'Bob')];
  const round = createRound(players);
  assert.strictEqual(round.phase, 'racing');
  assert.strictEqual(round.players.length, 2);
  assert.strictEqual(round.players[0].hp, MAX_HP);
  assert.strictEqual(round.players[0].laneIndex, 0);
  assert.strictEqual(round.players[1].laneIndex, 1);
});

test('a solo player crossing the finish line ends the round and is ranked 1', () => {
  const players = [createPlayer('p1', 'Alice')];
  const round = createRound(players);
  round.players[0].x = TRACK_LENGTH;
  tickRound(round, 0, {});
  assert.strictEqual(round.players[0].finished, true);
  assert.strictEqual(round.players[0].rank, 1);
  assert.strictEqual(round.phase, 'finished');
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

test('a player reduced to 0 hp is retired, not finished', () => {
  const players = [createPlayer('p1', 'Alice'), createPlayer('p2', 'Bob')];
  const round = createRound(players);
  round.players[0].hp = 0;
  round.players[0].retired = true;
  tickRound(round, 0, {});
  assert.strictEqual(round.players[0].finished, false);
  assert.ok(round.retireOrder.includes('p1'));
});

test('the last non-retired player auto-wins immediately, even mid-track', () => {
  const players = [createPlayer('p1', 'Alice'), createPlayer('p2', 'Bob')];
  const round = createRound(players);
  round.players[0].x = 1200; // nowhere near the finish line
  round.players[1].hp = 0;
  round.players[1].retired = true;
  tickRound(round, 0, {});
  assert.strictEqual(round.phase, 'finished');
  assert.strictEqual(round.players[0].finished, true);
  assert.strictEqual(round.players[0].rank, 1);
  assert.strictEqual(round.players[1].rank, 2);
});

test('when multiple players retire, later retirements rank better than earlier ones', () => {
  const players = [
    createPlayer('p1', 'Alice'),
    createPlayer('p2', 'Bob'),
    createPlayer('p3', 'Carol')
  ];
  const round = createRound(players);

  round.players[0].hp = 0;
  round.players[0].retired = true;
  tickRound(round, 0, {}); // Alice retires first

  round.players[1].hp = 0;
  round.players[1].retired = true;
  tickRound(round, 0, {}); // Bob retires second -> Carol is the sole survivor, auto-wins

  assert.strictEqual(round.phase, 'finished');
  assert.strictEqual(round.players[2].rank, 1); // Carol: last one standing
  assert.strictEqual(round.players[1].rank, 2); // Bob: retired later than Alice
  assert.strictEqual(round.players[0].rank, 3); // Alice: retired first
});

test('round moves to finished phase once the time limit elapses, ranking by distance', () => {
  const players = [createPlayer('p1', 'Alice'), createPlayer('p2', 'Bob')];
  const round = createRound(players);
  round.elapsedMs = ROUND_TIME_LIMIT_MS - 10;
  round.players[0].x = 500;
  round.players[1].x = 900; // further along, should rank better
  tickRound(round, 0.02, {}); // small dt: crosses the time limit without reaching the finish line
  assert.strictEqual(round.phase, 'finished');
  assert.strictEqual(round.players[1].rank, 1);
  assert.strictEqual(round.players[0].rank, 2);
});
