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
