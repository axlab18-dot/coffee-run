const { ITEM_STOP_SPEED, ITEM_BACKWARD_SPEED } = require('./constants');
const { TRACK_PAVED_ID, TRACK_GRASS_ID, TRACK_LAVA_ID, TRACK_ICE_ID } = require('./track');

let nextInstanceId = 1;

// Items are held until Space; passives apply immediately and stack. See
// 뽑기.txt for the full effect list this mirrors.
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
        label: '아이템: 중력맨 (내 쪽으로 타인을 1초간 당긴다)',
        kind: 'item',
        itemEffect: { kind: 'forcedMove', mode: 'toward', durationMs: 1000 }
      },
      {
        key: 's1-practice-makes-perfect',
        label: '아이템: 연습만이 살길 (모두의 지금 구간이 보통길로 변경)',
        kind: 'item',
        itemEffect: { kind: 'setSegmentTrack', trackId: TRACK_PAVED_ID, count: 1 }
      },
      {
        key: 's1-passive-speed-up',
        label: '패시브: 달려 달려 (내 달리기 속도 +3)',
        kind: 'passive',
        passiveEffect: { kind: 'selfSpeed', amount: 3 }
      },
      {
        key: 's1-passive-slow-others',
        label: '패시브: 느려 느려 (남 달리기 속도 -3)',
        kind: 'passive',
        passiveEffect: { kind: 'othersSpeed', amount: -3 }
      },
      {
        key: 's1-passive-hermit-blessing',
        label: '패시브: 자연인 허명구의 가호 (풀밭에서 배속 x5)',
        kind: 'passive',
        passiveEffect: { kind: 'trackMultiplierOverride', trackId: TRACK_GRASS_ID, multiplier: 5 }
      }
    ]
  },
  {
    id: 2,
    label: '★★',
    weight: 25,
    cards: [
      {
        key: 's2-stop-2s',
        label: '아이템: 나 빼고 다 멈추기 2초',
        kind: 'item',
        itemEffect: { kind: 'override', scope: 'others', value: ITEM_STOP_SPEED, durationMs: 2000 }
      },
      {
        key: 's2-accel-3x',
        label: '아이템: 가속 3배 (3초)',
        kind: 'item',
        itemEffect: { kind: 'multiplier', value: 3, durationMs: 3000 }
      },
      {
        key: 's2-gravity-2',
        label: '아이템: 중력맨 (내 쪽으로 타인을 2초간 당긴다)',
        kind: 'item',
        itemEffect: { kind: 'forcedMove', mode: 'toward', durationMs: 2000 }
      },
      {
        key: 's2-minor-shift',
        label: '아이템: 소격변 (트랙 5구간 중 2개가 무작위로 바뀜)',
        kind: 'item',
        itemEffect: { kind: 'shuffleRandomSegments', count: 2 }
      },
      {
        key: 's2-its-okay',
        label: '아이템: 괜찮아 (상대가 적용한 패시브 모두 제거)',
        kind: 'item',
        itemEffect: { kind: 'clearOthersPassives' }
      },
      {
        key: 's2-its-not-okay',
        label: '아이템: 안괜찮아 (랜덤한 유저와 패시브 효과 상호 교환)',
        kind: 'item',
        itemEffect: { kind: 'swapPassivesRandom' }
      },
      {
        key: 's2-arsonist',
        label: '아이템: 방화범 (모두의 해당 구간을 불바다로 변경)',
        kind: 'item',
        itemEffect: { kind: 'setSegmentTrack', trackId: TRACK_LAVA_ID, count: 1 }
      },
      {
        key: 's2-passive-speed-up',
        label: '패시브: 달려 달려 (내 달리기 속도 +6)',
        kind: 'passive',
        passiveEffect: { kind: 'selfSpeed', amount: 6 }
      },
      {
        key: 's2-passive-slow-others',
        label: '패시브: 느려 느려 (남 달리기 속도 -6)',
        kind: 'passive',
        passiveEffect: { kind: 'othersSpeed', amount: -6 }
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
        label: '아이템: 2등 나와 (나와 2등의 트랙 바꾸기)',
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
        key: 's3-gravity-3',
        label: '아이템: 중력맨 (내 쪽으로 타인을 3초간 당긴다)',
        kind: 'item',
        itemEffect: { kind: 'forcedMove', mode: 'toward', durationMs: 3000 }
      },
      {
        key: 's3-major-shift',
        label: '아이템: 중격변 (트랙 5구간 중 3개가 무작위로 바뀜, 중복 가능)',
        kind: 'item',
        itemEffect: { kind: 'shuffleRandomSegments', count: 3 }
      },
      {
        key: 's3-sudden-chaos',
        label: '아이템: 갑분주 (모두에게 1~3의 역배속 적용, 나는 효과 없음)',
        kind: 'item',
        itemEffect: { kind: 'reciprocalSpeedRandom', min: 1, max: 3, durationMs: 3000 }
      },
      {
        key: 's3-antigravity-1',
        label: '아이템: 반중력맨 (내 뒤쪽 타인 뒤로 더 밀어내기 레벨 1)',
        kind: 'item',
        itemEffect: { kind: 'antiGravityPush', amount: 300 }
      },
      {
        key: 's3-slippery',
        label: '아이템: 미끌 미끌 (내 앞 2구간을 빙판으로 변경)',
        kind: 'item',
        itemEffect: { kind: 'setSegmentTrack', trackId: TRACK_ICE_ID, count: 2 }
      },
      {
        key: 's3-passive-speed-up',
        label: '패시브: 달려 달려 (내 달리기 속도 +9)',
        kind: 'passive',
        passiveEffect: { kind: 'selfSpeed', amount: 9 }
      },
      {
        key: 's3-passive-slow-others',
        label: '패시브: 느려 느려 (남 달리기 속도 -9)',
        kind: 'passive',
        passiveEffect: { kind: 'othersSpeed', amount: -9 }
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
        label: '아이템: 1등 나와 (나와 1등의 트랙 바꾸기)',
        kind: 'item',
        itemEffect: { kind: 'swapWithRank', rank: 1 }
      },
      {
        key: 's4-antigravity-2',
        label: '아이템: 반중력맨 (내 뒤쪽 플레이어를 3초간 뒤로 밀어낸다)',
        kind: 'item',
        itemEffect: { kind: 'forcedMove', mode: 'away', durationMs: 3000, onlyBehind: true }
      },
      {
        key: 's4-black-hole',
        label: '아이템: 블랙홀 (구간 관계없이 모두가 아이템 사용자 위치로 4초간 이동)',
        kind: 'item',
        itemEffect: { kind: 'forcedMove', mode: 'toward', durationMs: 4000 }
      },
      {
        key: 's4-piece-of-cake',
        label: '아이템: ㅈ밥게임 (내가 1등이면 모두 이 구간 시작 위치로 이동)',
        kind: 'item',
        itemEffect: { kind: 'rewindOthersIfLeading' }
      },
      {
        key: 's4-instant-sprint',
        label: '아이템: 막판 ㄱ (막판스퍼트 바로 적용)',
        kind: 'item',
        itemEffect: { kind: 'instantDiceSprint' }
      },
      {
        key: 's4-passive-speed-up',
        label: '패시브: 달려 달려 (내 달리기 속도 +20)',
        kind: 'passive',
        passiveEffect: { kind: 'selfSpeed', amount: 20 }
      },
      {
        key: 's4-passive-slow-others',
        label: '패시브: 느려 느려 (남 달리기 속도 -20)',
        kind: 'passive',
        passiveEffect: { kind: 'othersSpeed', amount: -20 }
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
        label: '아이템: 역전의 용사 (모두가 출발점이 목적지가 되어 역주행함, 모든 패시브 소멸)',
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
      },
      {
        key: 's5-sudden-chaos-dice',
        label: '아이템: 갑분주 (모두가 배속 주사위(1~6)를 얻음, 나는 무조건 6배)',
        kind: 'item',
        itemEffect: { kind: 'diceSpeedPassiveForAll', selfValue: 6 }
      },
      {
        key: 's5-passive-giant',
        label: '패시브: 거대화 (속도 +15, 모든 구간이 지금 트랙으로 통일, 추월당한 상대 3초 스턴)',
        kind: 'passive',
        passiveEffect: { kind: 'giant', amount: 15 }
      },
      {
        key: 's5-passive-painful-life',
        label: '패시브: 삶은 고통 (모두의 지금 구간이 가시밭으로 변경, 빠를수록 저항 증가)',
        kind: 'passive',
        passiveEffect: { kind: 'painfulLife' }
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

// Rolls the single tier every player will draw from when they reach a given
// checkpoint. Rolled once per checkpoint per round (not per player), so the
// tier odds and presence are identical for everyone at that checkpoint.
function rollSegmentTier() {
  return pickWeightedTier().id;
}

// Draws n unique cards from within a single tier's pool (no cross-tier mix),
// so a checkpoint rolled into e.g. ★★★ only ever offers ★★★ items. Falls
// back to allowing repeats if the tier has fewer templates than n.
function drawCardsFromTier(tierId, n = 3) {
  const tier = TIERS.find((t) => t.id === tierId);
  const pool = [...tier.cards];
  const cards = [];
  for (let i = 0; i < n; i++) {
    const source = pool.length > 0 ? pool : tier.cards;
    const idx = Math.floor(Math.random() * source.length);
    const template = source[idx];
    if (source === pool) pool.splice(idx, 1);
    cards.push({ ...template, tier: tier.id, tierLabel: tier.label, instanceId: nextInstanceId++ });
  }
  return cards;
}

module.exports = {
  TIERS,
  TIER_RANK,
  RAREST_TIER_ID,
  drawCard,
  drawCards,
  drawCardsFromTier,
  rollSegmentTier
};
