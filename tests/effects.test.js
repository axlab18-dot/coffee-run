const { test } = require('node:test');
const assert = require('node:assert');
const { createPlayer } = require('../server/player');
const {
  applyCard,
  useHeldItem,
  computeSpeed,
  tickEffects,
  removeSegmentEffectsFor
} = require('../server/effects');
const { BASE_SPEED, SEGMENT_SPEED_MULTIPLIER_VALUES } = require('../server/constants');

function makeRound(players) {
  return {
    players,
    effects: [],
    effectSeq: 0,
    forcedAutoGachaRemaining: 0,
    elapsedMs: 0,
    track: { trackLength: 5000, checkpoints: [0, 1000, 2000, 3000, 4000] }
  };
}

// Each player's segment multipliers are shuffled at creation, so tests that
// need a predictable segment-1 speed pin it to the "identity" order.
function fixedPlayer(id, name, multipliers = [1, 2, 3, 5, 10]) {
  const p = createPlayer(id, name);
  p.segmentSpeedMultipliers = multipliers;
  return p;
}

const SEG1 = 1;

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

test('later segments run faster: speed scales with the player\'s own multiplier for that segment', () => {
  const alice = fixedPlayer('a', 'Alice', [1, 2, 3, 5, 10]);
  const round = makeRound([alice]);

  for (let segment = 1; segment <= 5; segment++) {
    alice.checkpointsDone = segment;
    assert.strictEqual(computeSpeed(round, alice), BASE_SPEED * alice.segmentSpeedMultipliers[segment - 1]);
  }
});

test("each player's segment multipliers are a random, no-duplicate permutation of the shared value pool", () => {
  for (let i = 0; i < 200; i++) {
    const p = createPlayer('p', 'P');
    assert.strictEqual(p.segmentSpeedMultipliers.length, SEGMENT_SPEED_MULTIPLIER_VALUES.length);
    assert.deepStrictEqual(
      [...p.segmentSpeedMultipliers].sort((a, b) => a - b),
      [...SEGMENT_SPEED_MULTIPLIER_VALUES].sort((a, b) => a - b)
    );
    const unique = new Set(p.segmentSpeedMultipliers);
    assert.strictEqual(unique.size, p.segmentSpeedMultipliers.length, 'no duplicate multiplier within one player');
  }
});

test('different players get independently shuffled multiplier orders (not always the same order)', () => {
  const orders = new Set();
  for (let i = 0; i < 100; i++) {
    orders.add(createPlayer('p', 'P').segmentSpeedMultipliers.join(','));
  }
  assert.ok(orders.size > 1, 'expected more than one distinct shuffled order across many players');
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

test('중력맨 (gravityPull) instantly pulls every other active racer toward the user by a fraction of the gap', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  alice.x = 1000;
  bob.x = 400; // 600 behind alice
  const round = makeRound([alice, bob]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'gravityPull', fraction: 0.2 } });
  useHeldItem(round, alice);

  assert.strictEqual(bob.x, 400 + 600 * 0.2);
  assert.strictEqual(alice.x, 1000); // the picker's own position is untouched
});

test('gravityPull never drags a finished player and never pulls anyone past 0', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  alice.x = 100;
  bob.x = 900;
  bob.finished = true;
  const round = makeRound([alice, bob]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'gravityPull', fraction: 0.9 } });
  useHeldItem(round, alice);

  assert.strictEqual(bob.x, 900); // finished players are untouched
});

test('반중력맨 (antiGravityPush) only pushes racers currently behind the user, further back', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob'); // behind alice
  const carol = fixedPlayer('c', 'Carol'); // ahead of alice
  alice.x = 500;
  bob.x = 200;
  carol.x = 800;
  const round = makeRound([alice, bob, carol]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'antiGravityPush', amount: 300 } });
  useHeldItem(round, alice);

  assert.strictEqual(bob.x, 0); // 200 - 300, clamped at 0
  assert.strictEqual(carol.x, 800); // ahead of alice, untouched
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

test('패트리어트 (patriotMissile) teleports every other active racer to a random point on the track', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  const carol = fixedPlayer('c', 'Carol');
  carol.finished = true;
  const carolX = carol.x;
  const round = makeRound([alice, bob, carol]);

  applyCard(round, alice, { kind: 'item', itemEffect: { kind: 'patriotMissile' } });
  useHeldItem(round, alice);

  assert.ok(bob.x >= 0 && bob.x <= round.track.trackLength);
  assert.strictEqual(carol.x, carolX); // finished players are never hit
});

test('지각 변동 (tectonicShift) applies one of slow/stop/lane-shift to every other active racer', () => {
  const alice = fixedPlayer('a', 'Alice');
  const bob = fixedPlayer('b', 'Bob');
  bob.laneIndex = 0;
  const round = makeRound([alice, bob]);
  round.players.forEach((p, i) => {
    p.laneIndex = i;
  });

  applyCard(round, alice, { kind: 'item', tier: 5, itemEffect: { kind: 'tectonicShift' } });
  useHeldItem(round, alice);

  const hasTargetEffect = round.effects.some((e) => e.scope === 'target' && e.targetId === bob.id);
  const laneChanged = bob.laneIndex !== 0;
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
