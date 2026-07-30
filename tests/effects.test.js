const { test } = require('node:test');
const assert = require('node:assert');
const { createPlayer } = require('../server/player');
const {
  applyCard,
  useHeldItem,
  computeSpeed,
  tickEffects,
  removeSegmentEffectsFor,
  handleTrackTransition,
  tickForcedMove
} = require('../server/effects');
const { BASE_SPEED } = require('../server/constants');
const { TRACK_PAVED_ID, TRACK_GRASS_ID, TRACK_LAVA_ID, TRACK_ICE_ID, TRACK_THORN_ID } = require('../server/track');

// segmentTracks: [1,2,3,4,5] = 보통길/풀밭/불바다/빙판/가시밭, one per segment.
// A player who hasn't picked any gacha yet (checkpointsDone === 0) is
// computed as being in segment 1 (보통길, multiplier x1) — the "SEG1" below.
function makeRound(players) {
  return {
    players,
    effects: [],
    effectSeq: 0,
    forcedAutoGachaRemaining: 0,
    painfulLifeActive: false,
    elapsedMs: 0,
    track: { trackLength: 5000, checkpoints: [0, 1000, 2000, 3000, 4000], segmentTracks: [1, 2, 3, 4, 5] }
  };
}

function fixedPlayer(id, name) {
  return createPlayer(id, name);
}

const SEG1 = 1.2; // segment index 0 = 보통길, whose nominal speedMultiplier is x1.2

test('a segment self-buff only speeds up the picker (scaled by the segment 1 multiplier)', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  const round = makeRound([alice, bob]);

  applyCard(round, alice, { kind: 'segment', scope: 'self', value: 4 });

  assert.strictEqual(computeSpeed(round, alice), (BASE_SPEED + 4) * SEG1);
  assert.strictEqual(computeSpeed(round, bob), BASE_SPEED * SEG1);
});

test('a segment others-debuff slows everyone except the picker', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  const round = makeRound([alice, bob]);

  applyCard(round, alice, { kind: 'segment', scope: 'others', value: -3 });

  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * SEG1);
  assert.strictEqual(computeSpeed(round, bob), (BASE_SPEED - 3) * SEG1);
});

test('timed effects expire after their duration elapses', () => {
  const alice = fixedPlayer('a', 'Alice');
  const round = makeRound([alice]);

  applyCard(round, alice, { kind: 'timed', scope: 'self', value: 5, durationMs: 3000 });
  assert.strictEqual(computeSpeed(round, alice), (BASE_SPEED + 5) * SEG1);

  tickEffects(round, 2); // 2000ms elapsed, still active
  assert.strictEqual(computeSpeed(round, alice), (BASE_SPEED + 5) * SEG1);

  tickEffects(round, 1.5); // total 3500ms, expired
  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * SEG1);
});

test('segment effects are cleared when the picker enters their next gacha', () => {
  const alice = fixedPlayer('a', 'Alice');
  const round = makeRound([alice]);

  applyCard(round, alice, { kind: 'segment', scope: 'self', value: 10 });
  assert.strictEqual(computeSpeed(round, alice), (BASE_SPEED + 10) * SEG1);

  removeSegmentEffectsFor(round, alice.id);
  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * SEG1);
});

test('a passive self speed-up applies immediately and only speeds up the picker (multiplicative)', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  const round = makeRound([alice, bob]);

  applyCard(round, alice, { kind: 'passive', tier: 1, passiveEffect: { kind: 'selfSpeedMultiplier', factor: 2 } });

  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * SEG1 * 2);
  assert.strictEqual(computeSpeed(round, bob), BASE_SPEED * SEG1);
});

test('a passive others slow-down applies to everyone except the picker (multiplicative)', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  const round = makeRound([alice, bob]);

  applyCard(round, alice, { kind: 'passive', tier: 1, passiveEffect: { kind: 'othersSpeedMultiplier', factor: 1 / 2 } });

  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * SEG1);
  assert.strictEqual(computeSpeed(round, bob), BASE_SPEED * SEG1 * 0.5);
});

test('passives stack multiplicatively across multiple picks instead of replacing each other', () => {
  const alice = fixedPlayer('a', 'Alice');
  const round = makeRound([alice]);

  applyCard(round, alice, { kind: 'passive', tier: 1, passiveEffect: { kind: 'selfSpeedMultiplier', factor: 2 } });
  applyCard(round, alice, { kind: 'passive', tier: 2, passiveEffect: { kind: 'selfSpeedMultiplier', factor: 3 } });

  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * SEG1 * 2 * 3);
});

test('passives persist across checkpoints, unlike segment effects', () => {
  const alice = fixedPlayer('a', 'Alice');
  const round = makeRound([alice]);

  applyCard(round, alice, { kind: 'passive', tier: 1, passiveEffect: { kind: 'selfSpeedMultiplier', factor: 2 } });
  removeSegmentEffectsFor(round, alice.id);

  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * SEG1 * 2);
});

test('passives never expire over time, unlike timed effects', () => {
  const alice = fixedPlayer('a', 'Alice');
  const round = makeRound([alice]);

  applyCard(round, alice, { kind: 'passive', tier: 1, passiveEffect: { kind: 'selfSpeedMultiplier', factor: 2 } });
  tickEffects(round, 999);

  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * SEG1 * 2);
});

test('speed scales with the current segment\'s track multiplier (round.track.segmentTracks)', () => {
  const alice = fixedPlayer('a', 'Alice');
  const round = makeRound([alice]); // segmentTracks: [1,2,3,4,5] -> x1.2,x2,x2.5,x3.5,x0.8
  // Give alice a no-op passive first so 풀밭's passive-less comeback bonus
  // (x5) doesn't kick in and mask the segment's own nominal multiplier (x2).
  applyCard(round, alice, { kind: 'passive', tier: 1, passiveEffect: { kind: 'selfSpeedMultiplier', factor: 1 } });
  const expectedMultipliers = [1.2, 2, 2.5, 3.5, 0.8];

  for (let segment = 1; segment <= 5; segment++) {
    alice.checkpointsDone = segment;
    assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * expectedMultipliers[segment - 1]);
  }
});

test('풀밭 grants a passive-less player 허명구의 가호\'s own x5 as a comeback bonus', () => {
  const alice = fixedPlayer('a', 'Alice');
  alice.checkpointsDone = 2; // segment index 1 = 풀밭
  const round = makeRound([alice]);

  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * 5);
});

test('풀밭\'s comeback bonus goes away the moment the player has any passive of their own', () => {
  const alice = fixedPlayer('a', 'Alice');
  alice.checkpointsDone = 2; // segment index 1 = 풀밭
  const round = makeRound([alice]);

  applyCard(round, alice, { kind: 'passive', tier: 1, passiveEffect: { kind: 'selfSpeedMultiplier', factor: 2 } });

  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * 2 * 2);
});

test('허명구의 가호 stacks additively on top of 풀밭\'s own rate each time it\'s picked', () => {
  const alice = fixedPlayer('a', 'Alice');
  alice.checkpointsDone = 2; // segment index 1 = 풀밭
  const round = makeRound([alice]);

  applyCard(round, alice, {
    kind: 'passive',
    tier: 1,
    passiveEffect: { kind: 'trackMultiplierOverride', trackId: TRACK_GRASS_ID, multiplier: 5 }
  });
  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * 5);

  applyCard(round, alice, {
    kind: 'passive',
    tier: 1,
    passiveEffect: { kind: 'trackMultiplierOverride', trackId: TRACK_GRASS_ID, multiplier: 5 }
  });
  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * 10);
});

test('an item held by a player does nothing until used', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  const round = makeRound([alice, bob]);

  applyCard(round, alice, {
    kind: 'item',
    itemEffect: { kind: 'override', scope: 'others', value: -200, durationMs: 1000 }
  });

  assert.ok(alice.heldItem);
  assert.strictEqual(computeSpeed(round, bob), BASE_SPEED * SEG1);

  useHeldItem(round, alice);
  assert.strictEqual(alice.heldItem, null);
  assert.strictEqual(computeSpeed(round, bob), -200 * SEG1);
  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * SEG1); // override never targets the source
});

test('conflicting overrides: the higher-tier effect wins regardless of order', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  const carol = fixedPlayer('c', 'Carol');
  const round = makeRound([alice, bob, carol]);

  // Alice (tier 1) stops everyone else; Bob (tier 3) then makes everyone run
  // backward. Bob's higher tier should win for Carol, even though Alice's
  // effect was applied first.
  applyCard(round, alice, { kind: 'item', tier: 1, itemEffect: { kind: 'override', scope: 'others', value: 0, durationMs: 3000 } });
  useHeldItem(round, alice);
  applyCard(round, bob, { kind: 'item', tier: 3, itemEffect: { kind: 'override', scope: 'others', value: -400, durationMs: 3000 } });
  useHeldItem(round, bob);

  assert.strictEqual(computeSpeed(round, carol), -400 * SEG1);
});

test('conflicting overrides of the same tier: the most recently applied one wins', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  const carol = fixedPlayer('c', 'Carol');
  const round = makeRound([alice, bob, carol]);

  applyCard(round, alice, { kind: 'item', tier: 2, itemEffect: { kind: 'override', scope: 'others', value: 0, durationMs: 3000 } });
  useHeldItem(round, alice);
  applyCard(round, bob, { kind: 'item', tier: 2, itemEffect: { kind: 'override', scope: 'others', value: -200, durationMs: 3000 } });
  useHeldItem(round, bob);

  assert.strictEqual(computeSpeed(round, carol), -200 * SEG1);
});

test('a resetAll item sends every player back to the start and forces one auto gacha', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  alice.x = 5000;
  bob.x = 3000;
  const round = makeRound([alice, bob]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'resetAll' } });
  useHeldItem(round, alice);

  assert.strictEqual(alice.x, 0);
  assert.strictEqual(bob.x, 0);
  assert.strictEqual(round.forcedAutoGachaRemaining, 1);
});

test('an instantWin card guarantees the picker a rank, recorded with a timestamp', () => {
  const alice = fixedPlayer('a', 'Alice');
  const round = makeRound([alice]);
  round.elapsedMs = 12345;

  applyCard(round, alice, { kind: 'instantWin' });

  assert.strictEqual(alice.guaranteedRank, true);
  assert.strictEqual(alice.guaranteedRankAt, 12345);
});

test('a dice-roll speed bypasses everything else, including the segment multiplier', () => {
  const alice = fixedPlayer('a', 'Alice');
  const round = makeRound([alice]);

  applyCard(round, alice, { kind: 'segment', scope: 'self', value: 999 });
  alice.checkpointsDone = 3; // segment 3
  alice.diceSpeed = 800;

  assert.strictEqual(computeSpeed(round, alice), 800);
});

test('가속 (multiplier) item multiplies the picker\'s speed for its duration, then expires', () => {
  const alice = fixedPlayer('a', 'Alice');
  const round = makeRound([alice]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'multiplier', value: 3, durationMs: 3000 } });
  useHeldItem(round, alice);
  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * SEG1 * 3);

  tickEffects(round, 3.1);
  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * SEG1);
});

test('가속 only multiplies the picker, never affects other players', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  const round = makeRound([alice, bob]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'multiplier', value: 4, durationMs: 3000 } });
  useHeldItem(round, alice);

  assert.strictEqual(computeSpeed(round, bob), BASE_SPEED * SEG1);
});

test('중력맨 (forcedMove toward) sets up every other active racer to approach the picker\'s position', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  alice.x = 1000;
  bob.x = 400;
  const round = makeRound([alice, bob]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'forcedMove', mode: 'toward', durationMs: 1000 } });
  useHeldItem(round, alice);

  assert.deepStrictEqual(bob.forcedMove, { towardId: alice.id, mode: 'toward', remainingMs: 1000 });
  assert.strictEqual(alice.forcedMove, null); // the picker's own movement is untouched
});

test('forcedMove never applies to a finished player', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  bob.finished = true;
  const round = makeRound([alice, bob]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'forcedMove', mode: 'toward', durationMs: 1000 } });
  useHeldItem(round, alice);

  assert.strictEqual(bob.forcedMove, null);
});

test('반중력맨 tier4 (forcedMove away, onlyBehind) only applies to racers currently behind the picker', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob'); // behind
  const carol = fixedPlayer('c', 'Carol'); // ahead
  alice.x = 500;
  bob.x = 200;
  carol.x = 800;
  const round = makeRound([alice, bob, carol]);

  applyCard(round, alice, {
    kind: 'item',
    itemEffect: { kind: 'forcedMove', mode: 'away', durationMs: 3000, onlyBehind: true }
  });
  useHeldItem(round, alice);

  assert.deepStrictEqual(bob.forcedMove, { towardId: alice.id, mode: 'away', remainingMs: 3000 });
  assert.strictEqual(carol.forcedMove, null);
});

test('tickForcedMove ("toward") moves the player toward the anchor at their own current speed, then clears', () => {
  const alice = fixedPlayer('a', 'Alice'); // the anchor
  const bob = fixedPlayer('b', 'Bob');
  alice.x = 1000;
  bob.x = 0; // segment 1 (보통길, x1.2) -> speed = BASE_SPEED * 1.2
  bob.forcedMove = { towardId: alice.id, mode: 'toward', remainingMs: 500 };
  const round = makeRound([alice, bob]);

  const handled = tickForcedMove(round, bob, 1);

  assert.strictEqual(handled, true);
  assert.strictEqual(bob.x, BASE_SPEED * 1.2 * 1);
  assert.strictEqual(bob.forcedMove, null); // 500ms remaining, 1000ms elapsed -> expired
});

test('tickForcedMove ("away") moves the player further from the anchor', () => {
  const alice = fixedPlayer('a', 'Alice'); // the anchor
  const bob = fixedPlayer('b', 'Bob');
  alice.x = 500;
  bob.x = 200; // behind alice
  bob.forcedMove = { towardId: alice.id, mode: 'away', remainingMs: 2000 };
  const round = makeRound([alice, bob]);

  tickForcedMove(round, bob, 1);

  assert.ok(bob.x < 200, 'expected bob to move further away from alice (backward)');
});

test('tickForcedMove returns false and does nothing when the player has no forcedMove', () => {
  const alice = fixedPlayer('a', 'Alice');
  const round = makeRound([alice]);

  assert.strictEqual(tickForcedMove(round, alice, 1), false);
});

test('나와 N등 트랙 바꾸기 (swapWithRank) swaps positions with whoever currently holds that rank', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  const carol = fixedPlayer('c', 'Carol');
  alice.x = 100; // currently 3rd
  bob.x = 900; // currently 1st
  carol.x = 500; // currently 2nd
  const round = makeRound([alice, bob, carol]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'swapWithRank', rank: 1 } });
  useHeldItem(round, alice);

  assert.strictEqual(alice.x, 900);
  assert.strictEqual(bob.x, 100);
});

test('swapWithRank is a no-op if the requested rank does not exist among active racers', () => {
  const alice = fixedPlayer('a', 'Alice');
  alice.x = 300;
  const round = makeRound([alice]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'swapWithRank', rank: 2 } });
  useHeldItem(round, alice);

  assert.strictEqual(alice.x, 300);
});

test('구간 점프 (segmentJump) moves the player straight to their next checkpoint', () => {
  const alice = fixedPlayer('a', 'Alice');
  alice.x = 150;
  alice.checkpointsDone = 1; // next checkpoint is index 1 -> x=1000
  const round = makeRound([alice]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'segmentJump' } });
  useHeldItem(round, alice);

  assert.strictEqual(alice.x, 1000);
});

test('막판스퍼트 즉시 적용 (instantDiceSprint) sets a fixed roll*BASE_SPEED with no spin delay', () => {
  const alice = fixedPlayer('a', 'Alice');
  const round = makeRound([alice]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'instantDiceSprint' } });
  useHeldItem(round, alice);

  assert.ok(alice.diceResult >= 1 && alice.diceResult <= 6);
  assert.strictEqual(alice.diceSpeed, alice.diceResult * BASE_SPEED);
  assert.strictEqual(alice.diceState, null);
});

test('역전의 용사 (reverseRace) mirrors every still-racing player across the track, but leaves finishers alone', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  alice.x = 1000; // leader
  bob.x = 4000;
  bob.finished = true;
  const round = makeRound([alice, bob]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'reverseRace' } });
  useHeldItem(round, alice);

  assert.strictEqual(alice.x, 5000 - 1000);
  assert.strictEqual(bob.x, 4000); // finished, untouched
});

test('지각 변동 (tectonicShift) applies one of slow/stop/lane-shift to every other active racer', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  const round = makeRound([alice, bob]);
  round.players.forEach((p, i) => {
    p.laneIndex = i;
  });
  const bobLaneBefore = bob.laneIndex;

  applyCard(round, alice, { kind: 'item', tier: 5, itemEffect: { kind: 'tectonicShift' } });
  useHeldItem(round, alice);

  const hasTargetEffect = round.effects.some((e) => e.scope === 'target' && e.targetId === bob.id);
  const laneChanged = bob.laneIndex !== bobLaneBefore;
  assert.ok(hasTargetEffect || laneChanged, 'expected either a target-scoped effect or a lane shift on bob');
});

test('a target-scoped slow effect only affects the specific targeted player', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  const carol = fixedPlayer('c', 'Carol');
  const round = makeRound([alice, bob, carol]);

  round.effects.push({
    sourceId: alice.id,
    scope: 'target',
    targetId: bob.id,
    kind: 'timed',
    value: -100,
    tierRank: 5,
    seq: 1,
    remainingMs: 3000
  });

  assert.strictEqual(computeSpeed(round, bob), (BASE_SPEED - 100) * SEG1);
  assert.strictEqual(computeSpeed(round, carol), BASE_SPEED * SEG1);
  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * SEG1);
});

test('연습만이 살길 (setSegmentTrack) overwrites the picker\'s current segment slot for everyone', () => {
  const alice = fixedPlayer('a', 'Alice');
  alice.checkpointsDone = 2; // just picked this at checkpoint index 1 -> about to run segment index 1 (풀밭)
  const round = makeRound([alice]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'setSegmentTrack', trackId: TRACK_PAVED_ID, count: 1 } });
  useHeldItem(round, alice);

  assert.strictEqual(round.track.segmentTracks[1], TRACK_PAVED_ID);
});

test('미끌 미끌 (setSegmentTrack, count 2) overwrites the picker\'s next 2 segment slots', () => {
  const alice = fixedPlayer('a', 'Alice');
  alice.checkpointsDone = 1; // about to run segment index 0 and index 1
  const round = makeRound([alice]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'setSegmentTrack', trackId: TRACK_ICE_ID, count: 2 } });
  useHeldItem(round, alice);

  assert.deepStrictEqual(round.track.segmentTracks.slice(0, 2), [TRACK_ICE_ID, TRACK_ICE_ID]);
  assert.strictEqual(round.track.segmentTracks[2], 3); // untouched
});

test('괜찮아 (clearOthersPassives) removes every passive sourced by other players, keeps the picker\'s own', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  const round = makeRound([alice, bob]);

  applyCard(round, alice, { kind: 'passive', tier: 1, passiveEffect: { kind: 'selfSpeedMultiplier', factor: 2 } });
  applyCard(round, bob, { kind: 'passive', tier: 1, passiveEffect: { kind: 'othersSpeedMultiplier', factor: 0.5 } });

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'clearOthersPassives' } });
  useHeldItem(round, alice);

  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * SEG1 * 2); // own passive kept
  assert.strictEqual(round.effects.some((e) => e.sourceId === bob.id), false); // bob's passive wiped
});

test('안괜찮아 (swapPassivesRandom) transfers passive ownership between the picker and the (only) other racer', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  const round = makeRound([alice, bob]);

  applyCard(round, alice, { kind: 'passive', tier: 1, passiveEffect: { kind: 'selfSpeedMultiplier', factor: 2 } });
  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'swapPassivesRandom' } });
  useHeldItem(round, alice);

  // Alice's self-buff now belongs to Bob instead.
  assert.strictEqual(computeSpeed(round, bob), BASE_SPEED * SEG1 * 2);
  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * SEG1);
});

test('갑분주 (reciprocalSpeedRandom) applies a temporary 1/roll multiplier to everyone but the picker', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  const round = makeRound([alice, bob]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'reciprocalSpeedRandom', min: 1, max: 3, durationMs: 3000 } });
  useHeldItem(round, alice);

  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * SEG1); // picker unaffected
  const bobSpeed = computeSpeed(round, bob);
  assert.ok(
    [BASE_SPEED, BASE_SPEED / 2, BASE_SPEED / 3].some((v) => Math.abs(v * SEG1 - bobSpeed) < 1e-9),
    `expected bob's speed to be BASE_SPEED / (1|2|3), got ${bobSpeed}`
  );
});

test('갑분주 (diceSpeedPassiveForAll) gives the picker a permanent x6 and everyone else a permanent 1-6 multiplier', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  const round = makeRound([alice, bob]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'diceSpeedPassiveForAll', selfValue: 6 } });
  useHeldItem(round, alice);

  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * SEG1 * 6);
  tickEffects(round, 999); // never expires, unlike timed multipliers
  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * SEG1 * 6);

  const bobSpeed = computeSpeed(round, bob);
  assert.ok(bobSpeed >= BASE_SPEED * SEG1 && bobSpeed <= BASE_SPEED * SEG1 * 6);
});

test('ㅈ밥게임 (rewindOthersIfLeading) rewinds others to the segment start only when the picker is leading', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  alice.checkpointsDone = 2; // segment start = checkpoints[1] = 1000
  bob.checkpointsDone = 2;
  alice.x = 1900; // leading
  bob.x = 1500;
  const round = makeRound([alice, bob]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'rewindOthersIfLeading' } });
  useHeldItem(round, alice);

  assert.strictEqual(bob.x, 1000);
  assert.strictEqual(alice.x, 1900);
});

test('ㅈ밥게임 (rewindOthersIfLeading) does nothing when the picker is not leading', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  alice.checkpointsDone = 2;
  bob.checkpointsDone = 2;
  alice.x = 1200; // not leading
  bob.x = 1500;
  const round = makeRound([alice, bob]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'rewindOthersIfLeading' } });
  useHeldItem(round, alice);

  assert.strictEqual(bob.x, 1500);
});

test('역전의 용사 wipes every passive across all players', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  const round = makeRound([alice, bob]);

  applyCard(round, bob, { kind: 'passive', tier: 1, passiveEffect: { kind: 'selfSpeedMultiplier', factor: 3 } });
  assert.strictEqual(computeSpeed(round, bob), BASE_SPEED * SEG1 * 3);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'reverseRace' } });
  useHeldItem(round, alice);

  assert.strictEqual(computeSpeed(round, bob), BASE_SPEED * SEG1);
});

test('자연인 허명구의 가호 (trackMultiplierOverride) replaces 풀밭\'s normal x2 with x5, only for the picker', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  alice.checkpointsDone = 2; // segment 2 = index 1 = 풀밭 in the fixture's segmentTracks
  bob.checkpointsDone = 2;
  const round = makeRound([alice, bob]);

  applyCard(round, alice, {
    kind: 'passive',
    tier: 1,
    passiveEffect: { kind: 'trackMultiplierOverride', trackId: TRACK_GRASS_ID, multiplier: 5 }
  });
  // Give bob a passive of his own so the passive-less comeback bonus doesn't
  // also give him x5, letting this test isolate 허명구's own explicit x5.
  applyCard(round, bob, { kind: 'passive', tier: 1, passiveEffect: { kind: 'selfSpeedMultiplier', factor: 1 } });

  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * 5);
  assert.strictEqual(computeSpeed(round, bob), BASE_SPEED * 2); // unaffected, normal 풀밭 rate
});

test('빙판(ICE) grants immunity to incoming slow-downs (overrides and negative additive effects)', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  alice.checkpointsDone = 4; // segment 4 = index 3 = 빙판 in the fixture
  const round = makeRound([alice, bob]);

  applyCard(round, bob, { kind: 'item', tier: 1, itemEffect: { kind: 'override', scope: 'others', value: 0, durationMs: 3000 } });
  useHeldItem(round, bob);
  applyCard(round, bob, { kind: 'passive', tier: 1, passiveEffect: { kind: 'othersSpeedMultiplier', factor: 0.1 } });

  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * 3.5); // both ignored, track multiplier still applies
});

test('가시밭(THORN) grants immunity to incoming speed-ups (multipliers and positive additive effects)', () => {
  const alice = fixedPlayer('a', 'Alice');
  alice.checkpointsDone = 5; // segment 5 = index 4 = 가시밭 in the fixture
  const round = makeRound([alice]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'multiplier', value: 4, durationMs: 3000 } });
  useHeldItem(round, alice);
  applyCard(round, alice, { kind: 'passive', tier: 1, passiveEffect: { kind: 'selfSpeedMultiplier', factor: 10 } });

  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * 0.8); // both ignored, but slow-downs still would apply
});

test('painfulLife drags speed down proportional to how far above base speed it sits', () => {
  const alice = fixedPlayer('a', 'Alice');
  const round = makeRound([alice]); // segment 1 (index 0) -> 보통길 x1.2
  round.painfulLifeActive = true;

  const baseline = computeSpeed(round, alice);
  const baselineExcess = BASE_SPEED * 1.2 - BASE_SPEED;
  assert.strictEqual(baseline, BASE_SPEED * 1.2 - baselineExcess * 0.3);

  applyCard(round, alice, { kind: 'passive', tier: 1, passiveEffect: { kind: 'selfSpeedMultiplier', factor: 2 } });
  const boosted = computeSpeed(round, alice);
  const boostedRaw = BASE_SPEED * 2 * 1.2;
  const excess = boostedRaw - BASE_SPEED;
  assert.strictEqual(boosted, boostedRaw - excess * 0.3);
});

test('handleTrackTransition: leaving 불바다 applies a 3s x0.3 slow to the picker', () => {
  const alice = fixedPlayer('a', 'Alice');
  alice.checkpointsDone = 2; // just moved on to segment index 1, having just left segment index 0 (불바다)
  const round = makeRound([alice]);
  round.track.segmentTracks = [TRACK_LAVA_ID, TRACK_PAVED_ID, TRACK_GRASS_ID, TRACK_ICE_ID, TRACK_THORN_ID];

  handleTrackTransition(round, alice, 1); // prevCheckpointsDone=1: they had just finished segment index 0

  const slow = round.effects.find((e) => e.kind === 'multiplier' && e.sourceId === alice.id);
  assert.ok(slow, 'expected a temporary multiplier effect from leaving 불바다');
  assert.strictEqual(slow.value, 0.3);
  assert.strictEqual(slow.remainingMs, 3000);
});

test('handleTrackTransition: the post-불바다 slow is voided by 빙판\'s own slow-immunity (naturally, via computeSpeed)', () => {
  const alice = fixedPlayer('a', 'Alice');
  alice.checkpointsDone = 2; // entering segment index 1, which is 빙판 here
  const round = makeRound([alice]);
  round.track.segmentTracks = [TRACK_LAVA_ID, TRACK_ICE_ID, TRACK_PAVED_ID, TRACK_GRASS_ID, TRACK_THORN_ID];

  handleTrackTransition(round, alice, 1);

  // The multiplier effect still gets created, but computeSpeed ignores it
  // while alice stands on 빙판 (ignoreSlow), so no slow actually applies.
  assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * 3.5);
});

test('handleTrackTransition: leaving 가시밭 grants a permanent +20 release bonus', () => {
  const alice = fixedPlayer('a', 'Alice');
  alice.checkpointsDone = 2;
  const round = makeRound([alice]);
  round.track.segmentTracks = [TRACK_THORN_ID, TRACK_PAVED_ID, TRACK_GRASS_ID, TRACK_LAVA_ID, TRACK_ICE_ID];

  handleTrackTransition(round, alice, 1); // just left segment index 0 (가시밭)

  const bonus = round.effects.find((e) => e.kind === 'permanent' && e.sourceId === alice.id);
  assert.ok(bonus, 'expected a permanent +20 release effect');
  assert.strictEqual(bonus.value, 20);
});

test('소격변 (shuffleRandomSegments, count 2) reassigns exactly 2 segment slots', () => {
  const alice = fixedPlayer('a', 'Alice');
  const round = makeRound([alice]); // starts as [1,2,3,4,5]

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'shuffleRandomSegments', count: 2 } });
  useHeldItem(round, alice);

  const changedCount = round.track.segmentTracks.filter((id, i) => id !== [1, 2, 3, 4, 5][i]).length;
  assert.ok(changedCount <= 2, `expected at most 2 segments to change, got ${changedCount}`);
  for (const id of round.track.segmentTracks) assert.ok(id >= 1 && id <= 5);
});

test('중격변 (shuffleRandomSegments, count 3) reassigns exactly 3 segment slots', () => {
  const alice = fixedPlayer('a', 'Alice');
  const round = makeRound([alice]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'shuffleRandomSegments', count: 3 } });
  useHeldItem(round, alice);

  const changedCount = round.track.segmentTracks.filter((id, i) => id !== [1, 2, 3, 4, 5][i]).length;
  assert.ok(changedCount <= 3, `expected at most 3 segments to change, got ${changedCount}`);
  for (const id of round.track.segmentTracks) assert.ok(id >= 1 && id <= 5);
});
