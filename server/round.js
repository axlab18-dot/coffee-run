const { createTrack, isPastFinish } = require('./track');
const { drawCard, drawCardsFromTier, rollSegmentTier } = require('./gacha');
const {
  applyCard,
  useHeldItem,
  computeSpeed,
  tickEffects,
  removeSegmentEffectsFor,
  handleTrackTransition,
  applyGiantStomps,
  tickForcedMove
} = require('./effects');
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

// Bots have no client, so these per-tick probabilities stand in for "reaction
// time" — at TICK_RATE (30/s) they average out to roughly the time noted.
const BOT_GACHA_PICK_CHANCE_PER_TICK = 0.05; // ~0.7s average
const BOT_USE_ITEM_CHANCE_PER_TICK = 0.02; // ~1.7s average
const BOT_DICE_ROLL_CHANCE_PER_TICK = 0.05; // ~0.7s average

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
    painfulLifeActive: false,
    forcedAutoGachaRemaining: 0,
    elapsedMs: 0,
    finishOrder: [],
    diceEvent: createDiceEvent(),
    // One tier per checkpoint, rolled once for the whole round — every
    // player sees the same tier group at a given checkpoint (fairness), so
    // the 3 options offered there are always from that single tier's list.
    segmentTiers: track.checkpoints.map(() => rollSegmentTier())
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
    const prevCheckpointsDone = player.checkpointsDone;
    player.checkpointsDone += 1;
    applyCard(round, player, drawCard());
    handleTrackTransition(round, player, prevCheckpointsDone);
    return;
  }

  // Every player at this checkpoint draws from the same tier
  // (round.segmentTiers), so the 3 options are always from a single group —
  // only which specific cards within that tier are offered is randomized.
  const tierId = round.segmentTiers[player.checkpointsDone];
  player.gachaState = { options: drawCardsFromTier(tierId), remainingMs: GACHA_SELECT_MS };
}

// Shared cleanup once a gacha choice is settled, whether the player picked a
// card, timed out with nothing selected, or auto-applied a forced pick.
function finishGachaSelection(round, player, card) {
  const prevCheckpointsDone = player.checkpointsDone;
  player.gachaState = null;
  player.checkpointsDone += 1;
  if (card) applyCard(round, player, card);
  handleTrackTransition(round, player, prevCheckpointsDone);

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
  player.finishTimeMs = round.elapsedMs;
  player.resultReason = resultReason;
  removeSegmentEffectsFor(round, player.id);
  round.finishOrder.push(player.id);
  // Provisional rank by arrival order, so the client can announce it the
  // instant this player crosses the line — finalizeRanks recomputes the
  // real final ranks (guaranteedRank first) once the whole round ends.
  player.rank = round.finishOrder.length;
}

function tickRound(round, dtSeconds) {
  if (round.phase !== 'racing') return;

  round.elapsedMs += dtSeconds * 1000;

  checkDiceEventTrigger(round);

  for (const player of round.players) {
    if (player.finished) continue;

    if (player.gachaState) {
      // Bots have no client to click a card, so they pick a random option
      // themselves after a short, randomized reaction delay each tick.
      if (player.isBot && Math.random() < BOT_GACHA_PICK_CHANCE_PER_TICK) {
        resolveGacha(round, player, Math.floor(Math.random() * player.gachaState.options.length));
        continue;
      }
      player.gachaState.remainingMs -= dtSeconds * 1000;
      if (player.gachaState.remainingMs <= 0) {
        skipGacha(round, player);
      }
      continue;
    }

    if (player.diceState) {
      if (player.isBot && !player.diceState.spinning && Math.random() < BOT_DICE_ROLL_CHANCE_PER_TICK) {
        startDiceSpin(player);
      }
      if (player.diceState.spinning) {
        player.diceState.remainingMs -= dtSeconds * 1000;
        if (player.diceState.remainingMs <= 0) resolveDiceRoll(round, player);
      } else {
        player.diceState.waitMs += dtSeconds * 1000;
        if (player.diceState.waitMs >= DICE_AUTO_ROLL_MS) startDiceSpin(player);
      }
      continue;
    }

    if (player.isBot && player.heldItem && Math.random() < BOT_USE_ITEM_CHANCE_PER_TICK) {
      useHeldItem(round, player);
    }

    if (!tickForcedMove(round, player, dtSeconds)) {
      const speed = computeSpeed(round, player);
      player.x = Math.max(0, player.x + speed * dtSeconds);
    }

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

  applyGiantStomps(round);
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

  // finishPlayer() already set a provisional arrival-order rank on each
  // player (for the client's live finish announcement) — reset here so the
  // guaranteedRank-first ordering below is the actual final word.
  for (const player of round.players) player.rank = null;

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
