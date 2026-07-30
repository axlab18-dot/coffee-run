function createPlayer(id, name, isBot = false) {
  return {
    id,
    name,
    isBot,
    x: 0,
    laneIndex: 0,
    finished: false,
    finishTimeMs: null,  // elapsed round time (ms) at the moment this player finished
    rank: null,
    resultReason: null, // 'arrived' | 'timeout'
    checkpointsDone: 0, // how many of the 5 checkpoints have been passed
    gachaState: null,   // null | { options: Card[], remainingMs: number }
    heldItem: null,      // null | Card (kind: 'item'), consumed by Space or discarded at next gacha
    guaranteedRank: false,
    guaranteedRankAt: null,
    diceState: null,     // null | { spinning: boolean, remainingMs: number, waitMs: number }
    diceSpeed: null,     // null | number — fixed final-sprint speed once the die is rolled
    diceResult: null,    // null | 1-6, the rolled number (kept for display after resolving)
    isGiant: false,      // true after picking 거대화 — makes stompOnOvertake apply
    stompedIds: null,    // null | Set<playerId> — rivals this giant has already stomped once
    forcedMove: null,    // null | { towardId, mode: 'toward'|'away', remainingMs } — 중력맨/반중력맨/블랙홀
    accelCount: 0,       // how many times a speed-up effect has landed on this player (▲ badge)
    decelCount: 0        // how many times a slow-down effect has landed on this player (▼ badge)
  };
}

module.exports = { createPlayer };
