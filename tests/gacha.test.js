const { test } = require('node:test');
const assert = require('node:assert');
const {
  TIERS,
  RAREST_TIER_ID,
  drawCard,
  drawCards,
  drawCardsForTiers,
  rollSegmentTierSet
} = require('../server/gacha');

test('every drawn card belongs to a real tier and template', () => {
  for (let i = 0; i < 200; i++) {
    const card = drawCard();
    const tier = TIERS.find((t) => t.id === card.tier);
    assert.ok(tier, `unknown tier ${card.tier}`);
    assert.ok(tier.cards.some((template) => template.key === card.key));
  }
});

test('every card in every tier is an item (nothing auto-applies anymore)', () => {
  for (const tier of TIERS) {
    for (const card of tier.cards) {
      assert.strictEqual(card.kind, 'item');
      assert.ok(card.itemEffect, `${card.key} is missing an itemEffect`);
    }
  }
});

test('drawCards(3) returns 3 independently-random cards with unique instance ids', () => {
  const cards = drawCards(3);
  assert.strictEqual(cards.length, 3);
  const ids = new Set(cards.map((c) => c.instanceId));
  assert.strictEqual(ids.size, 3);
});

test('drawCards(3) never offers the same card twice in one draw', () => {
  for (let i = 0; i < 500; i++) {
    const cards = drawCards(3);
    const keys = new Set(cards.map((c) => c.key));
    assert.strictEqual(keys.size, cards.length, `duplicate key among: ${cards.map((c) => c.key)}`);
  }
});

test('tier weights favor ★ heavily over ★★★★★ across many draws', () => {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (let i = 0; i < 5000; i++) {
    counts[drawCard().tier] += 1;
  }
  assert.ok(counts[1] > counts[2]);
  assert.ok(counts[2] > counts[3]);
  assert.ok(counts[3] > counts[4]);
  assert.ok(counts[4] > counts[5]);
});

test('RAREST_TIER_ID points at the lowest-weight tier (★★★★★)', () => {
  const rarest = TIERS.reduce((min, t) => (t.weight < min.weight ? t : min));
  assert.strictEqual(RAREST_TIER_ID, rarest.id);
  assert.strictEqual(rarest.label, '★★★★★');
});

test('rollSegmentTierSet returns 3 valid tier ids', () => {
  const validIds = TIERS.map((t) => t.id);
  const tierIds = rollSegmentTierSet();
  assert.strictEqual(tierIds.length, 3);
  for (const id of tierIds) assert.ok(validIds.includes(id));
});

test('rollSegmentTierSet never includes the rarest tier more than once', () => {
  for (let i = 0; i < 2000; i++) {
    const tierIds = rollSegmentTierSet();
    const rareCount = tierIds.filter((id) => id === RAREST_TIER_ID).length;
    assert.ok(rareCount <= 1, `expected at most one rarest-tier draw, got: ${tierIds}`);
  }
});

test('drawCardsForTiers draws exactly one card per given tier, honoring the tier composition', () => {
  const tierIds = [1, 2, 5];
  const cards = drawCardsForTiers(tierIds);
  assert.strictEqual(cards.length, 3);
  assert.deepStrictEqual(cards.map((c) => c.tier), tierIds);
});

test('drawCardsForTiers never repeats a card, even when the same tier appears twice', () => {
  for (let i = 0; i < 300; i++) {
    const cards = drawCardsForTiers([1, 1, 1]);
    const keys = new Set(cards.map((c) => c.key));
    assert.strictEqual(keys.size, cards.length, `duplicate key among: ${cards.map((c) => c.key)}`);
  }
});
