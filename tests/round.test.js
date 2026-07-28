const { test } = require('node:test');
const assert = require('node:assert');
const { createRound, tickRound, resolveGacha, startDiceSpin } = require('../server/round');
const { createPlayer } = require('../server/player');
const { ROUND_TIME_LIMIT_MS, BASE_SPEED, DICE_SPIN_MS, DICE_AUTO_ROLL_MS } = require('../server/constants');

function fixedTrackRound(players) {
  const round = createRound(players);
  round.track = { trackLength: 5000, checkpoints: [0, 1000, 2000, 3000, 4000] };
  return round;
}

test('a new round starts in racing phase with players at x=0', () => {
  const players = [createPlayer('p1', 'Alice'), createPlayer('p2', 'Bob')];
  const round = createRound(players);
  assert.strictEqual(round.phase, 'racing');
  assert.strictEqual(round.players.length, 2);
  assert.strictEqual(round.players[0].x, 0);
  assert.strictEqual(round.players[0].laneIndex, 0);
  assert.strictEqual(round.players[1].laneIndex, 1);
  assert.ok(round.track.trackLength > 0);
  assert.strictEqual(round.track.checkpoints.length, 5);
});

test('every player is immediately offered a gacha choice at the start line', () => {
  const players = [createPlayer('p1', 'Alice')];
  const round = fixedTrackRound(players);
  tickRound(round, 0);
  assert.ok(round.players[0].gachaState);
  assert.strictEqual(round.players[0].gachaState.options.length, 3);
  assert.strictEqual(round.players[0].x, 0);
});

test('resolveGacha applies the chosen card and lets the player start running again', () => {
  const players = [createPlayer('p1', 'Alice')];
  const round = fixedTrackRound(players);
  tickRound(round, 0); // opens the start-line gacha
  const alice = round.players[0];
  resolveGacha(round, alice, 0);
  assert.strictEqual(alice.gachaState, null);
  assert.strictEqual(alice.checkpointsDone, 1);
});

test('a gacha choice that times out closes with nothing selected and no effect applied', () => {
  const players = [createPlayer('p1', 'Alice')];
  const round = fixedTrackRound(players);
  tickRound(round, 0);
  tickRound(round, 6); // well past the 5s selection window
  assert.strictEqual(round.players[0].gachaState, null);
  assert.strictEqual(round.players[0].checkpointsDone, 1);
  assert.strictEqual(round.effects.length, 0);
  assert.strictEqual(round.players[0].heldItem, null);
  assert.strictEqual(round.players[0].guaranteedRank, false);
});

test('every player at the same checkpoint is offered the same 3-tier composition', () => {
  const players = [createPlayer('p1', 'Alice'), createPlayer('p2', 'Bob')];
  const round = fixedTrackRound(players);
  tickRound(round, 0); // both open the start-line gacha

  const aliceTiers = round.players[0].gachaState.options.map((c) => c.tier);
  const bobTiers = round.players[1].gachaState.options.map((c) => c.tier);
  assert.deepStrictEqual(aliceTiers, bobTiers);
});

test('the round stays in racing phase until every player has finished', () => {
  const players = [createPlayer('p1', 'Alice'), createPlayer('p2', 'Bob')];
  const round = fixedTrackRound(players);
  round.players[0].checkpointsDone = 5;
  round.players[0].x = 5000;
  round.players[1].checkpointsDone = 5;
  round.players[1].x = 500;

  tickRound(round, 0);

  assert.strictEqual(round.players[0].finished, true);
  assert.strictEqual(round.players[1].finished, false);
  assert.strictEqual(round.phase, 'racing');
});

test('ranks are assigned in finish order once everyone has arrived', () => {
  const players = [createPlayer('p1', 'Alice'), createPlayer('p2', 'Bob')];
  const round = fixedTrackRound(players);
  round.players.forEach((p) => {
    p.checkpointsDone = 5;
  });

  round.players[1].x = 5000;
  tickRound(round, 0);
  round.players[0].x = 5000;
  tickRound(round, 0);

  assert.strictEqual(round.phase, 'finished');
  assert.strictEqual(round.players[1].rank, 1);
  assert.strictEqual(round.players[0].rank, 2);
});

test('a guaranteedRank player is ranked first regardless of finish order', () => {
  const players = [createPlayer('p1', 'Alice'), createPlayer('p2', 'Bob')];
  const round = fixedTrackRound(players);
  round.players.forEach((p) => {
    p.checkpointsDone = 5;
  });
  round.players[1].guaranteedRank = true;
  round.players[1].guaranteedRankAt = 999;

  round.players[0].x = 5000; // Alice arrives first physically
  tickRound(round, 0);
  round.players[1].x = 5000; // Bob arrives second, but holds the instant-win card
  tickRound(round, 0);

  assert.strictEqual(round.players[1].rank, 1);
  assert.strictEqual(round.players[0].rank, 2);
});

test('round moves to finished phase once the time limit elapses, ranking by distance', () => {
  const players = [createPlayer('p1', 'Alice'), createPlayer('p2', 'Bob')];
  const round = fixedTrackRound(players);
  round.players.forEach((p) => {
    p.checkpointsDone = 5;
  });
  round.elapsedMs = ROUND_TIME_LIMIT_MS - 10;
  round.players[0].x = 500;
  round.players[1].x = 900; // further along, should rank better

  tickRound(round, 0.02); // small dt: crosses the time limit without reaching the finish line

  assert.strictEqual(round.phase, 'finished');
  assert.strictEqual(round.players[1].rank, 1);
  assert.strictEqual(round.players[0].rank, 2);
  assert.strictEqual(round.players[1].resultReason, 'timeout');
});

test('a scheduled dice event freezes every unfinished, non-picking player at their current spot', () => {
  const players = [createPlayer('p1', 'Alice'), createPlayer('p2', 'Bob')];
  const round = fixedTrackRound(players);
  round.players.forEach((p) => {
    p.checkpointsDone = 2;
    p.x = 1500;
  });
  round.diceEvent = { willOccur: true, triggerAtMs: 1000, triggered: false };
  round.elapsedMs = 999;

  tickRound(round, 0.01); // crosses the 1000ms trigger point

  assert.strictEqual(round.diceEvent.triggered, true);
  for (const p of round.players) {
    assert.ok(p.diceState);
    assert.strictEqual(p.diceState.spinning, false);
    assert.strictEqual(p.x, 1500); // frozen this same tick, no movement happened
  }
});

test('a player mid-gacha when the dice event fires is put into dice-awaiting once their pick resolves', () => {
  const players = [createPlayer('p1', 'Alice')];
  const round = fixedTrackRound(players);
  const alice = round.players[0];
  alice.gachaState = { options: [{ kind: 'segment', scope: 'self', value: 1 }], remainingMs: 5000 };
  round.diceEvent = { willOccur: true, triggerAtMs: 0, triggered: true }; // already fired while she was picking

  resolveGacha(round, alice, 0);

  assert.strictEqual(alice.gachaState, null);
  assert.ok(alice.diceState);
  assert.strictEqual(alice.diceState.spinning, false);
});

test('rolling the dice spins for DICE_SPIN_MS then locks in a fixed roll*BASE_SPEED for the rest of the race', () => {
  const players = [createPlayer('p1', 'Alice')];
  const round = fixedTrackRound(players);
  const alice = round.players[0];
  alice.checkpointsDone = 3;
  alice.diceState = { spinning: false, remainingMs: 0, waitMs: 0 };

  startDiceSpin(alice);
  assert.strictEqual(alice.diceState.spinning, true);

  tickRound(round, DICE_SPIN_MS / 1000 + 0.1); // spin completes this tick

  assert.strictEqual(alice.diceState, null);
  assert.ok(alice.diceResult >= 1 && alice.diceResult <= 6);
  assert.strictEqual(alice.diceSpeed, alice.diceResult * BASE_SPEED);
});

test('an AFK player awaiting a dice roll auto-rolls after the safety-net wait window', () => {
  const players = [createPlayer('p1', 'Alice')];
  const round = fixedTrackRound(players);
  const alice = round.players[0];
  alice.diceState = { spinning: false, remainingMs: 0, waitMs: 0 };

  tickRound(round, DICE_AUTO_ROLL_MS / 1000 + 0.1); // never pressed Space, wait window expires

  assert.strictEqual(alice.diceState.spinning, true);
});
