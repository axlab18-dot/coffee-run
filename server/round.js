const { createTrack, isPastFinish } = require('./track');
const { drawCard, drawCardsForTiers, rollSegmentTierSet } = require('./gacha');
const { applyCard, computeSpeed, tickEffects, removeSegmentEffectsFor } = require('./effects');
const {
  BASE_SPEED,
  GACHA_SELECT_MS,
  ROUND_TIME_LIMIT_MS,
  DICE_EVENT_CHANCE,
  DICE_MIN_SECONDS,
  DICE_MAX_SECONDS,
  DICE_SPIN_MS,
  DICE_AUTO_ROLL_MS
} = require('./constants');

function createRound(players) {
  players.forEach((player, index) => {
    player.laneIndex = index;
  });

  const track = createTrack();

  return {
    phase: 'racing', // 'racing' | 'finished'
    players,
    track,
    effects: [],
    effectSeq: 0,
    forcedAutoGachaRemaining: 0,
    elapsedMs: 0,
    finishOrder: [],
    diceEvent: createDiceEvent(),
    // One tier-composition per checkpoint, rolled once for the whole round —
    // every player sees the same 3 tiers at a given checkpoint (fairness),
    // even though the specific card within each tier is still randomized.
    segmentTierSets: track.checkpoints.map(() => rollSegmentTierSet())
  };
}

function createDiceEvent() {
  const willOccur = Math.random() < DICE_EVENT_CHANCE;
  return {
    willOccur,
    triggerAtMs: willOccur
      ? (DICE_MIN_SECONDS + Math.random() * (DICE_MAX_SECONDS - DICE_MIN_SECONDS)) * 1000
      : null,
    triggered: false
  };
}

// Entering a checkpoint always clears the picker's segment buffs/debuffs and
// discards any unused item — both are scoped to "until the next gacha".
function triggerGacha(round, player) {
  removeSegmentEffectsFor(round, player.id);
  player.heldItem = null;

  if (round.forcedAutoGachaRemaining > 0) {
    round.forcedAutoGachaRemaining -= 1;
    player.checkpointsDone += 1;
    applyCard(round, player, drawCard());
    return;
  }

  // Every player at this checkpoint draws from the same 3-tier composition
  // (round.segmentTierSets), so the tier odds are identical across players —
  // only the specific card within each tier is randomized per player.
  const tierSet = round.segmentTierSets[player.checkpointsDone];
  player.gachaState = { options: drawCardsForTiers(tierSet), remainingMs: GACHA_SELECT_MS };
}

// Shared cleanup once a gacha choice is settled, whether the player picked a
// card, timed out with nothing selected, or auto-applied a forced pick.
function finishGachaSelection(round, player, card) {
  player.gachaState = null;
  player.checkpointsDone += 1;
  if (card) applyCard(round, player, card);

  // The dice event may have fired while this player was mid-pick — since
  // they were frozen for the gacha already, they missed the freeze sweep and
  // go straight into "awaiting roll" now that they're free to move again.
  if (round.diceEvent.triggered && !player.finished && player.diceSpeed === null) {
    player.diceState = { spinning: false, remainingMs: 0, waitMs: 0 };
  }
}

function resolveGacha(round, player, optionIndex) {
  if (!player.gachaState) return;
  const card = player.gachaState.options[optionIndex];
  if (!card) return;
  finishGachaSelection(round, player, card);
}

// Selection window ran out with nothing picked — per design, this means no
// effect is applied at all (not a random fallback pick).
function skipGacha(round, player) {
  if (!player.gachaState) return;
  finishGachaSelection(round, player, null);
}

function startDiceSpin(player) {
  if (!player.diceState || player.diceState.spinning) return;
  player.diceState.spinning = true;
  player.diceState.remainingMs = DICE_SPIN_MS;
}

// The final-sprint speed is "roll * base speed unit" — a flat, luck-based
// number for the home stretch, deliberately independent of the segment
// multiplier and any active buffs/debuffs.
function resolveDiceRoll(round, player) {
  const roll = 1 + Math.floor(Math.random() * 6);
  player.diceResult = roll;
  player.diceSpeed = roll * BASE_SPEED;
  player.diceState = null;
}

function checkDiceEventTrigger(round) {
  if (!round.diceEvent.willOccur || round.diceEvent.triggered) return;
  if (round.elapsedMs < round.diceEvent.triggerAtMs) return;

  round.diceEvent.triggered = true;
  for (const player of round.players) {
    if (!player.finished && !player.gachaState && player.diceSpeed === null) {
      player.diceState = { spinning: false, remainingMs: 0, waitMs: 0 };
    }
  }
}

function finishPlayer(round, player, resultReason) {
  player.finished = true;
  player.resultReason = resultReason;
  removeSegmentEffectsFor(round, player.id);
  round.finishOrder.push(player.id);
}

function tickRound(round, dtSeconds) {
  if (round.phase !== 'racing') return;

  round.elapsedMs += dtSeconds * 1000;

  checkDiceEventTrigger(round);

  for (const player of round.players) {
    if (player.finished) continue;

    if (player.gachaState) {
      player.gachaState.remainingMs -= dtSeconds * 1000;
      if (player.gachaState.remainingMs <= 0) {
        skipGacha(round, player);
      }
      continue;
    }

    if (player.diceState) {
      if (player.diceState.spinning) {
        player.diceState.remainingMs -= dtSeconds * 1000;
        if (player.diceState.remainingMs <= 0) resolveDiceRoll(round, player);
      } else {
        player.diceState.waitMs += dtSeconds * 1000;
        if (player.diceState.waitMs >= DICE_AUTO_ROLL_MS) startDiceSpin(player);
      }
      continue;
    }

    const speed = computeSpeed(round, player);
    player.x = Math.max(0, player.x + speed * dtSeconds);

    const checkpoints = round.track.checkpoints;
    while (
      !player.gachaState &&
      player.checkpointsDone < checkpoints.length &&
      player.x >= checkpoints[player.checkpointsDone]
    ) {
      triggerGacha(round, player);
    }

    if (!player.gachaState && isPastFinish(player.x, round.track.trackLength)) {
      finishPlayer(round, player, 'arrived');
    }
  }

  tickEffects(round, dtSeconds);

  const allFinished = round.players.every((p) => p.finished);
  const timeUp = round.elapsedMs >= ROUND_TIME_LIMIT_MS;

  if (allFinished || timeUp) {
    if (timeUp && !allFinished) {
      // Safety net: anyone still racing when time runs out is ranked by how
      // far they got, furthest first.
      const stillRacing = round.players.filter((p) => !p.finished).sort((a, b) => b.x - a.x);
      for (const p of stillRacing) {
        finishPlayer(round, p, 'timeout');
      }
    }
    round.phase = 'finished';
    finalizeRanks(round);
  }
}

function finalizeRanks(round) {
  let rank = 1;
  const byId = new Map(round.players.map((p) => [p.id, p]));

  // Anyone holding the special-tier "instant win" card is guaranteed rank 1+,
  // ordered by whenever they picked it, ahead of everyone else.
  const guaranteed = round.players
    .filter((p) => p.guaranteedRank)
    .sort((a, b) => a.guaranteedRankAt - b.guaranteedRankAt);

  for (const player of guaranteed) {
    player.rank = rank++;
  }

  for (const id of round.finishOrder) {
    const player = byId.get(id);
    if (player && player.rank === null) player.rank = rank++;
  }
}

module.exports = { createRound, tickRound, resolveGacha, startDiceSpin };
