const { BASE_SPEED, NUM_SEGMENTS } = require('./constants');
const { TIER_RANK } = require('./gacha');
const { TRACKS, trackById, TRACK_GRASS_ID, TRACK_LAVA_ID, TRACK_ICE_ID, TRACK_THORN_ID } = require('./track');

// Effect kinds that originate from a passive pick (as opposed to a one-shot
// item use) — these are what "괜찮아"/"안괜찮아"/역전의 용사 operate on.
const PASSIVE_EFFECT_KINDS = ['permanent', 'trackMultiplierOverride', 'permanentMultiplier'];
function isPassiveEffect(effect) {
  return PASSIVE_EFFECT_KINDS.includes(effect.kind);
}

// A passive-less player gets 허명구의 가호's own x5 for free while on 풀밭 —
// a catch-up mechanic for whoever hasn't accumulated anything yet.
const GRASS_COMEBACK_MULTIPLIER = 5;

function nextEffectSeq(round) {
  round.effectSeq = (round.effectSeq || 0) + 1;
  return round.effectSeq;
}

// ▲/▼ badges next to the speed readout: how many times a speed-up or
// slow-down has landed on this player. Only counts effects that are
// unambiguously "this player got faster/slower" — not positional yanks
// (중력맨/반중력맨/블랙홀) or structural/continuous effects (삶은 고통's drag).
function bumpAccel(player) {
  player.accelCount = (player.accelCount || 0) + 1;
}
function bumpDecel(player) {
  player.decelCount = (player.decelCount || 0) + 1;
}

// 착용 아이템 (equipped items, bought pre-round — see server/equipment.js):
// active for the whole game, unlike in-race gacha items/passives.
function hasEquip(player, key) {
  return player.equippedItems.some((item) => item.key === key);
}

// 쓰래빠: blocks the first decel effect that would ever land on this player,
// once. Call at each decel-creation site for the specific target(s) about to
// be hit; returns true (and consumes the item) if this hit should be voided.
function tryBlockDecelWithSlipper(player) {
  if (player.blockedFirstDecel || !hasEquip(player, 'slipper')) return false;
  player.blockedFirstDecel = true;
  return true;
}

// 쪼리: doubles the value of the first self-accel effect this player ever
// creates (가속 아이템 또는 달려달려 패시브), once.
function maybeDoubleFirstAccel(player, effect) {
  if (player.firstAccelDoubled || !hasEquip(player, 'flip-flop')) return;
  player.firstAccelDoubled = true;
  effect.value *= 2;
}

function setSegmentTrackRange(round, startIndex, count, trackId) {
  for (let i = startIndex; i < startIndex + count; i++) {
    if (i >= 0 && i < round.track.segmentTracks.length) round.track.segmentTracks[i] = trackId;
  }
}

function applyPassive(round, player, passiveEffect, tierRank) {
  if (passiveEffect.kind === 'selfSpeedMultiplier') {
    const effect = {
      sourceId: player.id,
      scope: 'self',
      kind: 'permanentMultiplier',
      value: passiveEffect.factor,
      tierRank,
      seq: nextEffectSeq(round)
    };
    maybeDoubleFirstAccel(player, effect);
    round.effects.push(effect);
    bumpAccel(player);
  } else if (passiveEffect.kind === 'othersSpeedMultiplier') {
    const blockedIds = activeRacers(round, player.id)
      .filter((other) => tryBlockDecelWithSlipper(other))
      .map((other) => other.id);
    round.effects.push({
      sourceId: player.id,
      scope: 'others',
      kind: 'permanentMultiplier',
      value: passiveEffect.factor,
      tierRank,
      seq: nextEffectSeq(round),
      excludeIds: blockedIds
    });
    for (const other of activeRacers(round, player.id)) {
      if (!blockedIds.includes(other.id)) bumpDecel(other);
    }
  } else if (passiveEffect.kind === 'trackMultiplierOverride') {
    // While the picker is on `trackId`, add `multiplier` to that track's own
    // rate for this player — "이 효과는 뽑는 만큼 누적됨": each additional pick
    // pushes another one of these, and computeSpeed sums them all.
    round.effects.push({
      sourceId: player.id,
      kind: 'trackMultiplierOverride',
      trackId: passiveEffect.trackId,
      value: passiveEffect.multiplier,
      tierRank,
      seq: nextEffectSeq(round)
    });
  } else if (passiveEffect.kind === 'painfulLife') {
    round.painfulLifeActive = true;
    setSegmentTrackRange(round, player.checkpointsDone - 1, 1, TRACK_THORN_ID);
  }
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
  } else if (card.kind === 'passive') {
    // Passives apply immediately and stack — each one picked adds another
    // permanent effect, never removed for the rest of the round (unless
    // wiped by 괜찮아/안괜찮아/역전의 용사).
    applyPassive(round, player, card.passiveEffect, tierRank);
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
    const isDecel = effect.value < BASE_SPEED;
    const blockedIds = isDecel
      ? activeRacers(round, player.id)
          .filter((other) => tryBlockDecelWithSlipper(other))
          .map((other) => other.id)
      : [];
    round.effects.push({
      sourceId: player.id,
      scope: effect.scope,
      kind: 'override',
      value: effect.value,
      tierRank,
      seq: nextEffectSeq(round),
      remainingMs: effect.durationMs,
      excludeIds: blockedIds
    });
    if (isDecel) {
      for (const other of activeRacers(round, player.id)) {
        if (!blockedIds.includes(other.id)) bumpDecel(other);
      }
    }
  } else if (effect.kind === 'resetAll') {
    for (const p of round.players) p.x = 0;
    round.forcedAutoGachaRemaining = 1;
  } else if (effect.kind === 'multiplier') {
    const pushed = {
      sourceId: player.id,
      kind: 'multiplier',
      value: effect.value,
      tierRank,
      seq: nextEffectSeq(round),
      remainingMs: effect.durationMs
    };
    if (effect.value > 1) maybeDoubleFirstAccel(player, pushed);
    round.effects.push(pushed);
    if (effect.value > 1) bumpAccel(player);
  } else if (effect.kind === 'forcedMove') {
    // 중력맨(toward)/반중력맨(away)/블랙홀(toward): for the duration, each
    // affected player moves toward/away from the picker's position at their
    // own current speed, regardless of segment ("구간 관계없이").
    const targets = effect.onlyBehind
      ? activeRacers(round, player.id).filter((o) => o.x < player.x)
      : activeRacers(round, player.id);
    for (const target of targets) {
      target.forcedMove = { towardId: player.id, mode: effect.mode, remainingMs: effect.durationMs };
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
    // continues as normal toward the same finish line. Track effects on the
    // (now-swapped) segments still apply, but every passive is wiped.
    for (const p of round.players) {
      if (!p.finished) p.x = Math.max(0, round.track.trackLength - p.x);
    }
    round.effects = round.effects.filter((e) => !isPassiveEffect(e));
    round.painfulLifeActive = false;
  } else if (effect.kind === 'tectonicShift') {
    const numLanes = round.players.length;
    for (const other of activeRacers(round, player.id)) {
      const roll = Math.floor(Math.random() * 3);
      if (roll === 0) {
        if (tryBlockDecelWithSlipper(other)) continue;
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
        bumpDecel(other);
      } else if (roll === 1) {
        if (tryBlockDecelWithSlipper(other)) continue;
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
        bumpDecel(other);
      } else {
        other.laneIndex = (other.laneIndex + 1) % numLanes;
      }
    }
  } else if (effect.kind === 'setSegmentTrack') {
    // "지금 구간"/"내 앞 N구간" are always relative to the segment slot the
    // picker is about to run (player.checkpointsDone was already bumped by
    // finishGachaSelection before applyCard runs), and the assignment is
    // shared, so this affects every player who reaches that slot.
    setSegmentTrackRange(round, player.checkpointsDone - 1, effect.count, effect.trackId);
  } else if (effect.kind === 'shuffleRandomSegments') {
    // 소격변/중격변: pick `count` distinct segment slots and reassign each an
    // independently random track (values may repeat — 중격변 explicitly says
    // duplicates among the 3 are fine).
    const segmentTracks = round.track.segmentTracks;
    const indices = segmentTracks.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const chosen = indices.slice(0, Math.min(effect.count, indices.length));
    const trackIds = TRACKS.map((t) => t.id);
    for (const idx of chosen) {
      segmentTracks[idx] = trackIds[Math.floor(Math.random() * trackIds.length)];
    }
  } else if (effect.kind === 'clearOthersPassives') {
    round.effects = round.effects.filter((e) => !isPassiveEffect(e) || e.sourceId === player.id);
  } else if (effect.kind === 'swapPassivesRandom') {
    const others = activeRacers(round, player.id);
    if (others.length > 0) {
      const target = others[Math.floor(Math.random() * others.length)];
      for (const e of round.effects) {
        if (!isPassiveEffect(e)) continue;
        if (e.sourceId === player.id) e.sourceId = target.id;
        else if (e.sourceId === target.id) e.sourceId = player.id;
      }
    }
  } else if (effect.kind === 'reciprocalSpeedRandom') {
    for (const other of activeRacers(round, player.id)) {
      const roll = effect.min + Math.floor(Math.random() * (effect.max - effect.min + 1));
      const value = 1 / roll;
      if (value < 1 && tryBlockDecelWithSlipper(other)) continue;
      round.effects.push({
        sourceId: other.id,
        kind: 'multiplier',
        value,
        tierRank,
        seq: nextEffectSeq(round),
        remainingMs: effect.durationMs
      });
      if (value < 1) bumpDecel(other);
    }
  } else if (effect.kind === 'diceSpeedPassiveForAll') {
    round.effects.push({
      sourceId: player.id,
      kind: 'permanentMultiplier',
      value: effect.selfValue,
      tierRank,
      seq: nextEffectSeq(round)
    });
    bumpAccel(player);
    for (const other of activeRacers(round, player.id)) {
      const roll = 1 + Math.floor(Math.random() * 6);
      round.effects.push({
        sourceId: other.id,
        kind: 'permanentMultiplier',
        value: roll,
        tierRank,
        seq: nextEffectSeq(round)
      });
      if (roll > 1) bumpAccel(other);
    }
  } else if (effect.kind === 'rewindOthersIfLeading') {
    const ranked = rankedRacers(round);
    const isLeading = ranked.length > 0 && ranked[0].id === player.id;
    if (isLeading) {
      const segmentStartX = round.track.checkpoints[player.checkpointsDone - 1] || 0;
      for (const other of activeRacers(round, player.id)) {
        if (other.x > segmentStartX) other.x = segmentStartX;
      }
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
  if (effect.excludeIds && effect.excludeIds.includes(player.id)) return false;
  if (effect.scope === 'self') return effect.sourceId === player.id;
  if (effect.scope === 'others') return effect.sourceId !== player.id;
  if (effect.scope === 'target') return effect.targetId === player.id;
  return false;
}

// The segment (0-indexed slot into round.track.segmentTracks) a player is
// currently running, based on how many checkpoints they've passed.
function currentSegmentIndex(player) {
  return Math.min(NUM_SEGMENTS, Math.max(1, player.checkpointsDone || 1)) - 1;
}

function currentTrackId(round, player) {
  return round.track.segmentTracks[currentSegmentIndex(player)];
}

// 빙판(ICE) grants immunity to incoming slow-downs; 가시밭(THORN) grants
// immunity to incoming speed-ups (from either items or passives) — both per
// coffee run.md. "Slow"/"speed-up" is just the sign of the effect's
// value/ratio relative to a neutral baseline. `opts.skipMagnet` avoids
// infinite recursion when 자석 clamps another player's speed against this
// player's own (see below).
function computeSpeed(round, player, opts = {}) {
  // The dice-roll "final sprint" is a fixed, fully-determined speed for the
  // rest of the race — it bypasses every other effect and the track below.
  if (player.diceSpeed != null) return player.diceSpeed;

  const trackId = currentTrackId(round, player);
  const track = trackById(trackId);
  const bypassThornRestriction = hasEquip(player, 'safety-shoes') || hasEquip(player, 'moses');
  const ignoreSlow = trackId === TRACK_ICE_ID;
  const ignoreSpeedUp = trackId === TRACK_THORN_ID && !bypassThornRestriction;
  // 무지개반사판: full immunity to incoming decel. 찐득이: incoming decel
  // (additive delta or multiplicative ratio) is dampened toward neutral.
  const immuneToDecel = hasEquip(player, 'rainbow-shield');
  const decelDampen = hasEquip(player, 'sticky') ? 1 / 3 : 1;
  const ignoresDecel = ignoreSlow || immuneToDecel;

  const overrides = round.effects.filter((e) => e.kind === 'override' && targetsPlayer(e, player));
  const usableOverrides = overrides.filter((e) => {
    if (ignoresDecel && e.value < BASE_SPEED) return false;
    if (ignoreSpeedUp && e.value > BASE_SPEED) return false;
    return true;
  });

  // 달리기 속도는 최초 구간 종료 후 초기화되지 않고 조건들이 계속 중첩된다:
  // every additive/override effect currently in round.effects (segment,
  // timed, permanent passives, etc.) still applies here regardless of how
  // many segments the player has already crossed.
  let rawSpeed;
  if (usableOverrides.length > 0) {
    rawSpeed = pickPriorityEffect(usableOverrides).value;
  } else {
    rawSpeed = BASE_SPEED;
    for (const effect of round.effects) {
      if (['override', 'multiplier', 'permanentMultiplier', 'trackMultiplierOverride'].includes(effect.kind)) continue;
      if (!targetsPlayer(effect, player)) continue;
      if (ignoreSpeedUp && effect.value > 0) continue;
      if (effect.value < 0) {
        if (ignoresDecel) continue;
        rawSpeed += effect.value * decelDampen;
      } else {
        rawSpeed += effect.value;
      }
    }
  }

  // Multipliers stack multiplicatively on top of the additive/override speed
  // above. Self-only ones ("가속" items, ★★★★★ 갑분주's dice passive) have no
  // `scope` and apply via sourceId===player.id; 느려느려's own multiplier has
  // scope:'others' and is resolved the normal scope-based way.
  for (const effect of round.effects) {
    if (effect.kind !== 'multiplier' && effect.kind !== 'permanentMultiplier') continue;
    const appliesToMe = effect.scope ? targetsPlayer(effect, player) : effect.sourceId === player.id;
    if (!appliesToMe) continue;
    if (ignoreSpeedUp && effect.value > 1) continue;
    if (effect.value < 1) {
      if (ignoresDecel) continue;
      rawSpeed *= 1 - (1 - effect.value) * decelDampen;
    } else {
      rawSpeed *= effect.value;
    }
  }

  // 착용 아이템의 가속 계열 보너스 (힐리스/운동화/스케이트/런닝화/발냄새/경주마/
  // 소화기) — 가시밭의 "빨라짐 무시" 제약을 그대로 받는다(안전화/모세로 우회한
  // 경우가 아니면 여기서도 적용되지 않음).
  if (!ignoreSpeedUp) {
    for (const item of player.equippedItems) {
      const eff = item.effect;
      if (eff.kind === 'globalAccel') {
        rawSpeed *= eff.multiplier;
      } else if (eff.kind === 'trackAccelBonus' && trackId === eff.trackId) {
        rawSpeed *= eff.multiplier;
      } else if (eff.kind === 'lavaMastery' && trackId === TRACK_LAVA_ID) {
        rawSpeed *= eff.multiplier;
      } else if (eff.kind === 'leaderAccel') {
        const ranked = rankedRacers(round);
        if (ranked.length > 0 && ranked[0].id === player.id) rawSpeed *= eff.multiplier;
      }
    }
  }

  let trackMultiplier = track.speedMultiplier;
  const grassBlessingEffects = round.effects.filter(
    (e) => e.kind === 'trackMultiplierOverride' && e.sourceId === player.id && e.trackId === trackId
  );
  if (grassBlessingEffects.length > 0) {
    // "이 효과는 뽑는 만큼 누적됨" — each 허명구의 가호 pick adds another +5 on
    // top, rather than just replacing the track's normal rate once.
    trackMultiplier = grassBlessingEffects.reduce((sum, e) => sum + e.value, 0);
  } else if (trackId === TRACK_GRASS_ID) {
    // 풀밭: a player with zero accumulated passives of their own gets
    // 허명구의 가호's own x5 for free (comeback mechanic).
    const hasOwnPassive = round.effects.some((e) => isPassiveEffect(e) && e.sourceId === player.id);
    if (!hasOwnPassive) trackMultiplier = GRASS_COMEBACK_MULTIPLIER;
  }

  let finalSpeed = rawSpeed * trackMultiplier;

  if (round.painfulLifeActive) {
    // "속도가 빠를수록 저항을 많이 받음" — approximated as drag proportional
    // to how far above base speed the player currently sits.
    const excess = Math.max(0, finalSpeed - BASE_SPEED);
    finalSpeed -= excess * 0.3;
  }

  // 자석: no other active racer may end up more than `range` away from the
  // wearer's own speed. Computed against the wearer's speed *without* any
  // magnet clamping applied (skipMagnet) so two mutual magnet-wearers can
  // never recurse into each other.
  if (!opts.skipMagnet) {
    for (const other of round.players) {
      if (other.id === player.id || other.finished) continue;
      if (!hasEquip(other, 'magnet')) continue;
      const wearerSpeed = computeSpeed(round, other, { skipMagnet: true });
      finalSpeed = Math.min(wearerSpeed + 100, Math.max(wearerSpeed - 100, finalSpeed));
    }
  }

  return finalSpeed;
}

function tickEffects(round, dtSeconds) {
  const dtMs = dtSeconds * 1000;
  round.effects = round.effects.filter((effect) => {
    if (effect.kind === 'timed' || effect.kind === 'override' || effect.kind === 'multiplier') {
      effect.remainingMs -= dtMs;
      return effect.remainingMs > 0;
    }
    return true; // segment/permanent/track effects are pruned elsewhere, not by time
  });
}

// Segment buffs/debuffs last "until the next gacha" for whoever picked them,
// so they're cleared the moment that player enters their next gacha (or finishes).
function removeSegmentEffectsFor(round, playerId) {
  round.effects = round.effects.filter((effect) => !(effect.kind === 'segment' && effect.sourceId === playerId));
}

// Fires when a player crosses from one segment into the next: post-segment
// effects for the track they just left (불바다/빙판/가시밭). `prevCheckpointsDone`
// is the player's checkpointsDone *before* this crossing was recorded (0
// means they haven't run any segment yet, so there's nothing to leave).
function handleTrackTransition(round, player, prevCheckpointsDone) {
  if (prevCheckpointsDone <= 0) return;

  const leftTrackId = round.track.segmentTracks[prevCheckpointsDone - 1];
  const enteringTrackId = round.track.segmentTracks[player.checkpointsDone - 1];
  const skipLavaHazard = hasEquip(player, 'safety-shoes') || hasEquip(player, 'extinguisher') || hasEquip(player, 'moses');
  const skipIceHazard = hasEquip(player, 'crampons') || hasEquip(player, 'moses');

  if (leftTrackId === TRACK_LAVA_ID) {
    // "불바다 다음이 빙판일 경우 트랙 효과는 무효화 됨" — no need for a special
    // case: 빙판's own slow-immunity in computeSpeed already ignores this
    // multiplier (<1) the moment the player is standing on 빙판.
    if (!skipLavaHazard && !tryBlockDecelWithSlipper(player)) {
      round.effects.push({
        sourceId: player.id,
        kind: 'multiplier',
        value: 0.3,
        tierRank: 0,
        seq: nextEffectSeq(round),
        remainingMs: 3000
      });
      if (enteringTrackId !== TRACK_ICE_ID) bumpDecel(player);
    }
  } else if (leftTrackId === TRACK_ICE_ID) {
    if (!skipIceHazard && Math.random() < 0.75 && !tryBlockDecelWithSlipper(player)) {
      round.effects.push({
        sourceId: player.id,
        scope: 'self',
        kind: 'override',
        value: 0,
        tierRank: 0,
        seq: nextEffectSeq(round),
        remainingMs: 2000
      });
      bumpDecel(player);
    }
  } else if (leftTrackId === TRACK_THORN_ID) {
    round.effects.push({
      sourceId: player.id,
      scope: 'self',
      kind: 'permanent',
      value: 20,
      tierRank: 0,
      seq: nextEffectSeq(round)
    });
    bumpAccel(player);
  }
}

// 중력맨/반중력맨/블랙홀 (forcedMove): while active, movement is a straight
// approach/retreat toward the source's position, at the player's own current
// speed, instead of the normal forward track movement — "구간 관계없이".
// Returns true if it handled this tick's movement (round.js should then
// skip the normal computeSpeed-based advance).
function tickForcedMove(round, player, dtSeconds) {
  if (!player.forcedMove) return false;

  const anchor = round.players.find((p) => p.id === player.forcedMove.towardId);
  if (anchor) {
    const magnitude = Math.abs(computeSpeed(round, player));
    const direction =
      player.forcedMove.mode === 'toward' ? Math.sign(anchor.x - player.x) : Math.sign(player.x - anchor.x);
    player.x = Math.max(0, player.x + direction * magnitude * dtSeconds);
  }

  player.forcedMove.remainingMs -= dtSeconds * 1000;
  if (player.forcedMove.remainingMs <= 0) player.forcedMove = null;
  return true;
}

module.exports = {
  applyCard,
  useHeldItem,
  computeSpeed,
  tickEffects,
  removeSegmentEffectsFor,
  handleTrackTransition,
  tickForcedMove
};
