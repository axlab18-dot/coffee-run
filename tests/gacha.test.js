const { test } = require('node:test');
const assert = require('node:assert');
const {
  TIERS,
  RAREST_TIER_ID,
  drawCard,
  drawCards,
  drawCardsFromTier,
  rollSegmentTier
} = require('../server/gacha');

test('every drawn card belongs to a real tier and template', () => {
  for (let i = 0; i < 200; i++) {
    const card = drawCard();
    const tier = TIERS.find((t) => t.id === card.tier);
    assert.ok(tier, `unknown tier ${card.tier}`);
    assert.ok(tier.cards.some((template) => template.key === card.key));
  }
});

const VALID_PASSIVE_EFFECT_KINDS = ['selfSpeedMultiplier', 'othersSpeedMultiplier', 'trackMultiplierOverride', 'painfulLife'];

test('every card is either an item with an itemEffect or a passive with a passiveEffect', () => {
  for (const tier of TIERS) {
    for (const card of tier.cards) {
      if (card.kind === 'item') {
        assert.ok(card.itemEffect, `${card.key} is missing an itemEffect`);
      } else if (card.kind === 'passive') {
        assert.ok(card.passiveEffect, `${card.key} is missing a passiveEffect`);
        assert.ok(
          VALID_PASSIVE_EFFECT_KINDS.includes(card.passiveEffect.kind),
          `${card.key} has an invalid passiveEffect kind`
        );
      } else {
        assert.fail(`${card.key} has unexpected kind ${card.kind}`);
      }
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

test('rollSegmentTier returns a valid tier id', () => {
  const validIds = TIERS.map((t) => t.id);
  for (let i = 0; i < 200; i++) {
    assert.ok(validIds.includes(rollSegmentTier()));
  }
});

test('drawCardsFromTier(tierId, 3) draws 3 cards, all from that single tier', () => {
  for (const tier of TIERS) {
    const cards = drawCardsFromTier(tier.id, 3);
    assert.strictEqual(cards.length, 3);
    for (const card of cards) assert.strictEqual(card.tier, tier.id);
  }
});

test('drawCardsFromTier never repeats a card within one draw', () => {
  for (let i = 0; i < 300; i++) {
    for (const tier of TIERS) {
      const cards = drawCardsFromTier(tier.id, 3);
      const keys = new Set(cards.map((c) => c.key));
      assert.strictEqual(keys.size, cards.length, `duplicate key among: ${cards.map((c) => c.key)}`);
    }
  }
});
