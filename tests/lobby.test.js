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
