const { test } = require('node:test');
const assert = require('node:assert');
const {
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
} = require('../server/lobby');
const { STARTING_TOKENS, MAX_EQUIPPED_ITEMS, MAX_DICE_ROLLS, EQUIP_PICK_MS } = require('../server/equipment');

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

test('addPlayer starts the equip shop at 10 tokens with no items or rolls used', () => {
  const lobby = createLobby();
  addPlayer(lobby, 'p1', 'Alice');
  const alice = lobby.players[0];
  assert.strictEqual(alice.tokens, STARTING_TOKENS);
  assert.deepStrictEqual(alice.equippedItems, []);
  assert.strictEqual(alice.rollsUsed, 0);
  assert.strictEqual(alice.equipOffer, null);
});

test('rolling 1-5 opens a 3-item offer from that tier and consumes a roll', () => {
  const lobby = createLobby();
  addPlayer(lobby, 'p1', 'Alice');
  const alice = lobby.players[0];

  const originalRandom = Math.random;
  Math.random = () => 0.05; // rolls a 1 (1 + floor(0.05*6) = 1)
  const result = rollEquipDice(alice);
  Math.random = originalRandom;

  assert.strictEqual(result.kind, 'offer');
  assert.strictEqual(result.tier, 1);
  assert.strictEqual(result.options.length, 3);
  assert.strictEqual(alice.rollsUsed, 1);
  assert.ok(alice.equipOffer);
  assert.strictEqual(alice.equipOffer.remainingMs, EQUIP_PICK_MS);
});

test('resolveEquipOffer charges tokens and equips the chosen item', () => {
  const lobby = createLobby();
  addPlayer(lobby, 'p1', 'Alice');
  const alice = lobby.players[0];
  alice.equipOffer = { tier: 1, options: itemsForTier1(), remainingMs: EQUIP_PICK_MS };

  resolveEquipOffer(alice, 'slipper');

  assert.strictEqual(alice.equippedItems.length, 1);
  assert.strictEqual(alice.equippedItems[0].key, 'slipper');
  assert.strictEqual(alice.tokens, STARTING_TOKENS - 1);
  assert.strictEqual(alice.equipOffer, null);
});

test('tickEquipOffers auto-resolves (picks something) once the timer runs out', () => {
  const lobby = createLobby();
  addPlayer(lobby, 'p1', 'Alice');
  const alice = lobby.players[0];
  alice.equipOffer = { tier: 1, options: itemsForTier1(), remainingMs: 500 };

  tickEquipOffers(lobby, 1); // 1000ms elapsed, past the 500ms remaining

  assert.strictEqual(alice.equipOffer, null);
  assert.strictEqual(alice.equippedItems.length, 1);
});

test('a player cannot roll again once they have 3 equipped items or 3 rolls used', () => {
  const lobby = createLobby();
  addPlayer(lobby, 'p1', 'Alice');
  const alice = lobby.players[0];
  alice.rollsUsed = MAX_DICE_ROLLS;
  assert.strictEqual(canRollEquipDie(alice), false);
  assert.strictEqual(rollEquipDice(alice), null);

  alice.rollsUsed = 0;
  alice.equippedItems = itemsForTier1(); // pretend they already have MAX_EQUIPPED_ITEMS
  assert.strictEqual(alice.equippedItems.length, MAX_EQUIPPED_ITEMS);
  assert.strictEqual(canRollEquipDie(alice), false);
});

test('rolling a 6 grants 3 random items outright, but only charges tokens for the ones that fit under the cap', () => {
  const lobby = createLobby();
  addPlayer(lobby, 'p1', 'Alice');
  const alice = lobby.players[0];
  const preExisting = itemsForTier1()[0]; // 'slipper', cost 1
  alice.equippedItems = [preExisting]; // already 1 equipped, room for only 2 more
  alice.tokens = STARTING_TOKENS - preExisting.cost;

  const originalRandom = Math.random;
  let call = 0;
  Math.random = () => {
    call += 1;
    return call === 1 ? 5 / 6 : 0; // first call picks the die roll (=6), rest pick tier/item deterministically
  };
  const result = rollEquipDice(alice);
  Math.random = originalRandom;

  assert.strictEqual(result.kind, 'sixBonus');
  assert.strictEqual(alice.equippedItems.length, MAX_EQUIPPED_ITEMS); // capped at 3, not 4
  const newlyEquipped = alice.equippedItems.slice(1); // the 2 that fit from this roll
  const spentThisRoll = STARTING_TOKENS - preExisting.cost - alice.tokens;
  const costOfNewlyEquipped = newlyEquipped.reduce((sum, item) => sum + item.cost, 0);
  assert.strictEqual(spentThisRoll, costOfNewlyEquipped); // never charged for the discarded 3rd item
});

test('a 6 is only honored the first time — a later 6 is rerolled instead', () => {
  const lobby = createLobby();
  addPlayer(lobby, 'p1', 'Alice');
  const alice = lobby.players[0];
  alice.sixBonusUsed = true;

  const originalRandom = Math.random;
  let call = 0;
  Math.random = () => {
    call += 1;
    return call === 1 ? 5 / 6 : 0; // would roll a 6 first, but it's already used — rerolls to a 1
  };
  const result = rollEquipDice(alice);
  Math.random = originalRandom;

  assert.strictEqual(result.kind, 'offer');
  assert.strictEqual(result.tier, 1);
});

test('resetEquipShop gives everyone a fresh 10-token budget for the next round', () => {
  const lobby = createLobby();
  addPlayer(lobby, 'p1', 'Alice');
  const alice = lobby.players[0];
  alice.tokens = 3;
  alice.equippedItems = itemsForTier1();
  alice.rollsUsed = 2;

  resetEquipShop(lobby);

  assert.strictEqual(alice.tokens, STARTING_TOKENS);
  assert.deepStrictEqual(alice.equippedItems, []);
  assert.strictEqual(alice.rollsUsed, 0);
});

function itemsForTier1() {
  return require('../server/equipment').itemsForTier(1);
}
