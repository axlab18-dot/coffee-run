const {
  STARTING_TOKENS,
  MAX_EQUIPPED_ITEMS,
  MAX_DICE_ROLLS,
  EQUIP_PICK_MS,
  itemsForTier,
  rollEquipDie,
  randomItemAnyTier
} = require('./equipment');

function createLobby() {
  return { players: [] };
}

function addPlayer(lobby, id, name, isBot = false) {
  lobby.players.push({
    id,
    name,
    ready: false,
    isBot,
    tokens: STARTING_TOKENS,
    equippedItems: [], // up to 3 item objects (may contain duplicates via the 6-bonus)
    rollsUsed: 0,
    sixBonusUsed: false,
    equipOffer: null // null | { tier, options: Item[], remainingMs }
  });
}

function removePlayer(lobby, id) {
  lobby.players = lobby.players.filter((p) => p.id !== id);
}

function setReady(lobby, id, ready) {
  const player = lobby.players.find((p) => p.id === id);
  if (player) player.ready = ready;
}

function allReady(lobby) {
  return lobby.players.length > 0 && lobby.players.every((p) => p.ready);
}

// Resets everyone's equip shop state for a fresh round — 착용 아이템 is a
// per-game loadout, bought again each time from a full 10-token budget.
function resetEquipShop(lobby) {
  for (const player of lobby.players) {
    player.tokens = STARTING_TOKENS;
    player.equippedItems = [];
    player.rollsUsed = 0;
    player.sixBonusUsed = false;
    player.equipOffer = null;
  }
}

function canRollEquipDie(player) {
  return (
    !player.ready &&
    player.rollsUsed < MAX_DICE_ROLLS &&
    player.equippedItems.length < MAX_EQUIPPED_ITEMS &&
    !player.equipOffer
  );
}

// Rolls the equip die for this player. A 1-5 opens a 3-card tier offer to
// choose from (or auto-resolves after EQUIP_PICK_MS); a 6 (only the first
// time) immediately grants 3 random items, ignoring the normal token cap.
function rollEquipDice(player) {
  if (!canRollEquipDie(player)) return null;

  player.rollsUsed += 1;
  const roll = rollEquipDie(player.sixBonusUsed);

  if (roll === 6) {
    player.sixBonusUsed = true;
    const bonusItems = [randomItemAnyTier(), randomItemAnyTier(), randomItemAnyTier()];
    for (const item of bonusItems) {
      // Only items that actually fit under the 3-equipped cap get pushed —
      // and only those are charged. Tokens may still go negative for the
      // ones that DO fit ("토큰 소모량 10을 초과할 수 있으며").
      if (player.equippedItems.length < MAX_EQUIPPED_ITEMS) {
        player.equippedItems.push(item);
        player.tokens -= item.cost;
      }
    }
    return { kind: 'sixBonus', items: bonusItems };
  }

  player.equipOffer = { tier: roll, options: itemsForTier(roll), remainingMs: EQUIP_PICK_MS };
  return { kind: 'offer', tier: roll, options: player.equipOffer.options };
}

// Finalizes the current offer, whichever item was picked (or auto-picked on
// timeout). A choice the player can't afford is simply skipped (no item, no
// token charge) rather than letting them go into debt outside the 6-bonus.
function resolveEquipOffer(player, chosenKey) {
  if (!player.equipOffer) return;
  const { options } = player.equipOffer;
  const chosen = options.find((item) => item.key === chosenKey) || options[Math.floor(Math.random() * options.length)];

  if (chosen.cost <= player.tokens && player.equippedItems.length < MAX_EQUIPPED_ITEMS) {
    player.tokens -= chosen.cost;
    player.equippedItems.push(chosen);
  }
  player.equipOffer = null;
}

// Ticks down any pending equip offer's timer; auto-resolves (random pick
// among the 3) once it hits zero — mirrors the in-race gacha's own timeout.
function tickEquipOffers(lobby, dtSeconds) {
  for (const player of lobby.players) {
    if (!player.equipOffer) continue;
    player.equipOffer.remainingMs -= dtSeconds * 1000;
    if (player.equipOffer.remainingMs <= 0) resolveEquipOffer(player, null);
  }
}

module.exports = {
  createLobby,
  addPlayer,
  removePlayer,
  setReady,
  allReady,
  resetEquipShop,
  canRollEquipDie,
  rollEquipDice,
  resolveEquipOffer,
  tickEquipOffers
};
