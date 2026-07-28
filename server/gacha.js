const { ITEM_STOP_SPEED, ITEM_BACKWARD_SPEED } = require('./constants');

let nextInstanceId = 1;

// Every card is now an item: drawn cards are just held until Space, never
// auto-applied. See 뽑기.txt for the full effect list this mirrors.
const TIERS = [
  {
    id: 1,
    label: '★',
    weight: 75,
    cards: [
      {
        key: 's1-back-1s',
        label: '아이템: 나 빼고 뒤로 달리기 1초',
        kind: 'item',
        itemEffect: { kind: 'override', scope: 'others', value: ITEM_BACKWARD_SPEED, durationMs: 1000 }
      },
      {
        key: 's1-accel-2x',
        label: '아이템: 가속 2배 (3초)',
        kind: 'item',
        itemEffect: { kind: 'multiplier', value: 2, durationMs: 3000 }
      },
      {
        key: 's1-gravity-1',
        label: '아이템: 중력맨 (내 쪽으로 타인 당기기 레벨 1)',
        kind: 'item',
        itemEffect: { kind: 'gravityPull', fraction: 0.2 }
      }
    ]
  },
  {
    id: 2,
    label: '★★',
    weight: 25,
    cards: [
      {
        key: 's2-stop-3s',
        label: '아이템: 나 빼고 다 멈추기 3초',
        kind: 'item',
        itemEffect: { kind: 'override', scope: 'others', value: ITEM_STOP_SPEED, durationMs: 3000 }
      },
      {
        key: 's2-accel-3x',
        label: '아이템: 가속 3배 (3초)',
        kind: 'item',
        itemEffect: { kind: 'multiplier', value: 3, durationMs: 3000 }
      },
      {
        key: 's2-gravity-2',
        label: '아이템: 중력맨 (내 쪽으로 타인 당기기 레벨 2)',
        kind: 'item',
        itemEffect: { kind: 'gravityPull', fraction: 0.4 }
      }
    ]
  },
  {
    id: 3,
    label: '★★★',
    weight: 12,
    cards: [
      {
        key: 's3-back-3s',
        label: '아이템: 나 빼고 뒤로 달리기 3초',
        kind: 'item',
        itemEffect: { kind: 'override', scope: 'others', value: ITEM_BACKWARD_SPEED, durationMs: 3000 }
      },
      {
        key: 's3-swap-2nd',
        label: '아이템: 나와 2등의 트랙 바꾸기',
        kind: 'item',
        itemEffect: { kind: 'swapWithRank', rank: 2 }
      },
      {
        key: 's3-accel-4x',
        label: '아이템: 가속 4배 (3초)',
        kind: 'item',
        itemEffect: { kind: 'multiplier', value: 4, durationMs: 3000 }
      },
      {
        key: 's3-antigravity-1',
        label: '아이템: 반중력맨 (내 뒤쪽 타인 뒤로 더 밀어내기 레벨 1)',
        kind: 'item',
        itemEffect: { kind: 'antiGravityPush', amount: 300 }
      }
    ]
  },
  {
    id: 4,
    label: '★★★★',
    weight: 5,
    cards: [
      {
        key: 's4-reset-all',
        label: '아이템: 모두 제자리 (전원 시작 위치로), 다음 뽑기는 랜덤 1회 자동 적용',
        kind: 'item',
        itemEffect: { kind: 'resetAll' }
      },
      {
        key: 's4-segment-jump',
        label: '아이템: 구간 점프, 바로 다음 구간으로 넘어감',
        kind: 'item',
        itemEffect: { kind: 'segmentJump' }
      },
      {
        key: 's4-swap-1st',
        label: '아이템: 나와 1등의 트랙 바꾸기',
        kind: 'item',
        itemEffect: { kind: 'swapWithRank', rank: 1 }
      },
      {
        key: 's4-antigravity-2',
        label: '아이템: 반중력맨 (내 뒤쪽 타인 뒤로 더 밀어내기 레벨 2)',
        kind: 'item',
        itemEffect: { kind: 'antiGravityPush', amount: 600 }
      },
      {
        key: 's4-instant-sprint',
        label: '아이템: 막판스퍼트 바로 적용',
        kind: 'item',
        itemEffect: { kind: 'instantDiceSprint' }
      }
    ]
  },
  {
    id: 5,
    label: '★★★★★',
    weight: 1,
    cards: [
      {
        key: 's5-reverse-hero',
        label: '아이템: 역전의 용사 (모두가 출발점이 목적지가 되어 역주행함)',
        kind: 'item',
        itemEffect: { kind: 'reverseRace' }
      },
      {
        key: 's5-tectonic-shift',
        label: '아이템: 지각 변동 (모두의 트랙에 랜덤하게 방해물 생성)',
        kind: 'item',
        itemEffect: { kind: 'tectonicShift' }
      },
      {
        key: 's5-patriot',
        label: '아이템: 패트리어트 (모두에게 미사일 발사, 맞은 사용자는 트랙에 랜덤하게 떨어짐)',
        kind: 'item',
        itemEffect: { kind: 'patriotMissile' }
      }
    ]
  }
];

// Numeric priority used when two conflicting override effects (e.g. "stop"
// vs "run backward") land on the same player at once — the higher-tier one
// wins. Same-tier conflicts are broken elsewhere by recency.
const TIER_RANK = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };

// The rarest tier (lowest weight) is capped at one appearance per 3-choice
// draw — computed from the data so a future reshuffle of weights/labels
// can't silently break this rule.
const RAREST_TIER_ID = TIERS.reduce((rarest, tier) => (tier.weight < rarest.weight ? tier : rarest)).id;

function pickWeightedTier(excludeIds = []) {
  const candidates = excludeIds.length > 0 ? TIERS.filter((t) => !excludeIds.includes(t.id)) : TIERS;
  const totalWeight = candidates.reduce((sum, tier) => sum + tier.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const tier of candidates) {
    if (roll < tier.weight) return tier;
    roll -= tier.weight;
  }
  return candidates[candidates.length - 1];
}

function drawCard() {
  const tier = pickWeightedTier();
  const template = tier.cards[Math.floor(Math.random() * tier.cards.length)];
  return { ...template, tier: tier.id, tierLabel: tier.label, instanceId: nextInstanceId++ };
}

const TOTAL_CARD_TEMPLATES = TIERS.reduce((sum, tier) => sum + tier.cards.length, 0);

// Each of the n draws is independently random (per requirement: no
// fairness/balancing across draws), but the options offered together must
// not repeat the same card — so a duplicate just gets rerolled.
function drawCards(n = 3) {
  const cards = [];
  const usedKeys = new Set();
  const maxAttempts = Math.max(n, TOTAL_CARD_TEMPLATES) * 20;

  for (let attempts = 0; cards.length < n && attempts < maxAttempts; attempts++) {
    const card = drawCard();
    if (usedKeys.has(card.key)) continue;
    usedKeys.add(card.key);
    cards.push(card);
  }

  return cards;
}

function drawCardForTier(tierId, excludeKeys) {
  const tier = TIERS.find((t) => t.id === tierId);
  const candidates = tier.cards.filter((c) => !excludeKeys.has(c.key));
  const pool = candidates.length > 0 ? candidates : tier.cards;
  const template = pool[Math.floor(Math.random() * pool.length)];
  return { ...template, tier: tier.id, tierLabel: tier.label, instanceId: nextInstanceId++ };
}

// Draws one card per given tier id (in order), never repeating a card key
// within the set. Used so every player at the same checkpoint sees the same
// tier composition (fairness), while the exact card within each tier is
// still randomized per player.
function drawCardsForTiers(tierIds) {
  const usedKeys = new Set();
  return tierIds.map((tierId) => {
    const card = drawCardForTier(tierId, usedKeys);
    usedKeys.add(card.key);
    return card;
  });
}

// Rolls the 3-tier composition that every player will see when they reach a
// given checkpoint. Rolled once per checkpoint per round (not per player),
// so the rarest tier's odds and presence are identical for everyone. That
// rarest tier is capped at one appearance per set — once rolled, later
// slots exclude it (other tiers can still repeat freely).
function rollSegmentTierSet(n = 3) {
  const tierIds = [];
  let rareUsed = false;
  for (let i = 0; i < n; i++) {
    const tier = pickWeightedTier(rareUsed ? [RAREST_TIER_ID] : []);
    if (tier.id === RAREST_TIER_ID) rareUsed = true;
    tierIds.push(tier.id);
  }
  return tierIds;
}

module.exports = {
  TIERS,
  TIER_RANK,
  RAREST_TIER_ID,
  drawCard,
  drawCards,
  drawCardsForTiers,
  rollSegmentTierSet
};
