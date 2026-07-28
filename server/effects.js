const { BASE_SPEED, NUM_SEGMENTS } = require('./constants');
const { TIER_RANK } = require('./gacha');

function nextEffectSeq(round) {
  round.effectSeq = (round.effectSeq || 0) + 1;
  return round.effectSeq;
}

function applyCard(round, player, card) {
  const tierRank = TIER_RANK[card.tier] || 0;

  if (card.kind === 'segment') {
    round.effects.push({
      sourceId: player.id,
      scope: card.scope,
      kind: 'segment',
      value: card.value,
      tierRank,
      seq: nextEffectSeq(round),
      createdAtCheckpoint: player.checkpointsDone
    });
  } else if (card.kind === 'timed') {
    round.effects.push({
      sourceId: player.id,
      scope: card.scope,
      kind: 'timed',
      value: card.value,
      tierRank,
      seq: nextEffectSeq(round),
      remainingMs: card.durationMs
    });
  } else if (card.kind === 'item') {
    player.heldItem = card;
  } else if (card.kind === 'instantWin') {
    player.guaranteedRank = true;
    player.guaranteedRankAt = round.elapsedMs;
  }
}

function activeRacers(round, excludeId) {
  return round.players.filter((p) => !p.finished && p.id !== excludeId);
}

// Every player currently still racing, ordered by progress (furthest first).
// Used for rank-based lookups (swapWithRank) since "rank" mid-race is just
// standing by x among those who haven't finished yet.
function rankedRacers(round) {
  return round.players.filter((p) => !p.finished).sort((a, b) => b.x - a.x);
}

function useHeldItem(round, player) {
  const card = player.heldItem;
  if (!card) return;
  const effect = card.itemEffect;
  const tierRank = TIER_RANK[card.tier] || 0;

  if (effect.kind === 'override') {
    round.effects.push({
      sourceId: player.id,
      scope: effect.scope,
      kind: 'override',
      value: effect.value,
      tierRank,
      seq: nextEffectSeq(round),
      remainingMs: effect.durationMs
    });
  } else if (effect.kind === 'resetAll') {
    for (const p of round.players) p.x = 0;
    round.forcedAutoGachaRemaining = 1;
  } else if (effect.kind === 'multiplier') {
    round.effects.push({
      sourceId: player.id,
      kind: 'multiplier',
      value: effect.value,
      tierRank,
      seq: nextEffectSeq(round),
      remainingMs: effect.durationMs
    });
  } else if (effect.kind === 'gravityPull') {
    // Snap every other active racer toward my position by a fraction of the
    // gap between us — an instant, one-time pull, not a lingering effect.
    for (const other of activeRacers(round, player.id)) {
      other.x = Math.max(0, other.x + (player.x - other.x) * effect.fraction);
    }
  } else if (effect.kind === 'antiGravityPush') {
    // Only pushes racers who are currently behind me, further back.
    for (const other of activeRacers(round, player.id)) {
      if (other.x < player.x) {
        other.x = Math.max(0, other.x - effect.amount);
      }
    }
  } else if (effect.kind === 'swapWithRank') {
    const ranked = rankedRacers(round);
    const target = ranked[effect.rank - 1];
    if (target && target.id !== player.id) {
      const myX = player.x;
      player.x = target.x;
      target.x = myX;
    }
  } else if (effect.kind === 'segmentJump') {
    const nextCheckpoint = round.track.checkpoints[player.checkpointsDone];
    player.x = Math.max(player.x, nextCheckpoint != null ? nextCheckpoint : round.track.trackLength);
  } else if (effect.kind === 'instantDiceSprint') {
    const roll = 1 + Math.floor(Math.random() * 6);
    player.diceResult = roll;
    player.diceSpeed = roll * BASE_SPEED;
    player.diceState = null;
  } else if (effect.kind === 'reverseRace') {
    // Mirrors every still-racing player's progress across the track — the
    // leader becomes the last, the last becomes the leader. The race then
    // continues as normal toward the same finish line.
    for (const p of round.players) {
      if (!p.finished) p.x = Math.max(0, round.track.trackLength - p.x);
    }
  } else if (effect.kind === 'tectonicShift') {
    const numLanes = round.players.length;
    for (const other of activeRacers(round, player.id)) {
      const roll = Math.floor(Math.random() * 3);
      if (roll === 0) {
        round.effects.push({
          sourceId: player.id,
          scope: 'target',
          targetId: other.id,
          kind: 'timed',
          value: -100,
          tierRank,
          seq: nextEffectSeq(round),
          remainingMs: 3000
        });
      } else if (roll === 1) {
        round.effects.push({
          sourceId: player.id,
          scope: 'target',
          targetId: other.id,
          kind: 'override',
          value: 0,
          tierRank,
          seq: nextEffectSeq(round),
          remainingMs: 3000
        });
      } else {
        other.laneIndex = (other.laneIndex + 1) % numLanes;
      }
    }
  } else if (effect.kind === 'patriotMissile') {
    for (const other of activeRacers(round, player.id)) {
      other.x = Math.random() * round.track.trackLength;
    }
  }

  player.heldItem = null;
}

// When two override effects (stop / run-backward) from different players
// land on the same target at once, only one can determine their speed.
// Higher tier wins; a tie is broken by recency (the more recently applied
// effect wins) — an arbitrary but simple, deterministic house rule for an
// otherwise unspecified case.
function pickPriorityEffect(effects) {
  return [...effects].sort((a, b) => {
    if (b.tierRank !== a.tierRank) return b.tierRank - a.tierRank;
    return b.seq - a.seq;
  })[0];
}

function targetsPlayer(effect, player) {
  if (effect.scope === 'self') return effect.sourceId === player.id;
  if (effect.scope === 'others') return effect.sourceId !== player.id;
  if (effect.scope === 'target') return effect.targetId === player.id;
  return false;
}

function computeSpeed(round, player) {
  // The dice-roll "final sprint" is a fixed, fully-determined speed for the
  // rest of the race — it bypasses every other effect and the segment
  // multiplier below.
  if (player.diceSpeed != null) return player.diceSpeed;

  const overrides = round.effects.filter((e) => e.kind === 'override' && targetsPlayer(e, player));

  let rawSpeed;
  if (overrides.length > 0) {
    rawSpeed = pickPriorityEffect(overrides).value;
  } else {
    rawSpeed = BASE_SPEED;
    for (const effect of round.effects) {
      if (effect.kind === 'override' || effect.kind === 'multiplier') continue;
      if (targetsPlayer(effect, player)) rawSpeed += effect.value;
    }
  }

  // Self-only "가속" items multiply on top of the additive/override speed.
  for (const effect of round.effects) {
    if (effect.kind === 'multiplier' && effect.sourceId === player.id) {
      rawSpeed *= effect.value;
    }
  }

  const segment = Math.min(NUM_SEGMENTS, Math.max(1, player.checkpointsDone || 1));
  return rawSpeed * player.segmentSpeedMultipliers[segment - 1];
}

function tickEffects(round, dtSeconds) {
  const dtMs = dtSeconds * 1000;
  round.effects = round.effects.filter((effect) => {
    if (effect.kind === 'timed' || effect.kind === 'override' || effect.kind === 'multiplier') {
      effect.remainingMs -= dtMs;
      return effect.remainingMs > 0;
    }
    return true; // segment effects are pruned by removeSegmentEffectsFor, not by time
  });
}

// Segment buffs/debuffs last "until the next gacha" for whoever picked them,
// so they're cleared the moment that player enters their next gacha (or finishes).
function removeSegmentEffectsFor(round, playerId) {
  round.effects = round.effects.filter((effect) => !(effect.kind === 'segment' && effect.sourceId === playerId));
}

module.exports = { applyCard, useHeldItem, computeSpeed, tickEffects, removeSegmentEffectsFor };
