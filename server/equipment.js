// 착용 아이템: bought in the pre-round lobby with tokens, active for the
// whole game once the round starts (unlike in-race gacha items/passives,
// which are temporary). See "착용 아이템" in coffee run.md.
const STARTING_TOKENS = 10;
const MAX_EQUIPPED_ITEMS = 3;
const MAX_DICE_ROLLS = 3;
const EQUIP_PICK_MS = 5000;

const EQUIP_ITEMS = [
  {
    key: 'slipper',
    tier: 1,
    cost: 1,
    label: '쓰래빠 (감속 1회 방어)',
    effect: { kind: 'blockFirstDecel' }
  },
  {
    key: 'flip-flop',
    tier: 1,
    cost: 1,
    label: '쪼리 (최초 가속 효과 x2)',
    effect: { kind: 'firstAccelDouble' }
  },
  {
    key: 'heelys',
    tier: 1,
    cost: 1,
    label: '힐리스 (보통길에서 가속 x2)',
    effect: { kind: 'trackAccelBonus', trackId: 1, multiplier: 2 }
  },
  {
    key: 'safety-shoes',
    tier: 2,
    cost: 2,
    label: '안전화 (가시밭/불바다 효과 무시)',
    effect: { kind: 'ignoreTrackHazard', trackIds: [5, 3] }
  },
  {
    key: 'crampons',
    tier: 2,
    cost: 2,
    label: '아이젠 (빙판 효과 무시)',
    effect: { kind: 'ignoreTrackHazard', trackIds: [4] }
  },
  {
    key: 'sneakers',
    tier: 2,
    cost: 2,
    label: '운동화 (보통길에서 가속 x1.5)',
    effect: { kind: 'trackAccelBonus', trackId: 1, multiplier: 1.5 }
  },
  {
    key: 'running-shoes',
    tier: 3,
    cost: 3,
    label: '런닝화 (가속 x2)',
    effect: { kind: 'globalAccel', multiplier: 2 }
  },
  {
    key: 'skates',
    tier: 3,
    cost: 3,
    label: '스케이트 (빙판에서 가속 x3)',
    effect: { kind: 'trackAccelBonus', trackId: 4, multiplier: 3 }
  },
  {
    key: 'extinguisher',
    tier: 3,
    cost: 3,
    label: '소화기 (불바다에서 배속 x2, 종료 후 감속 무시)',
    effect: { kind: 'lavaMastery', multiplier: 2 }
  },
  {
    key: 'stinky-feet',
    tier: 4,
    cost: 4,
    label: '발냄새 (가속 x3)',
    effect: { kind: 'globalAccel', multiplier: 3 }
  },
  {
    key: 'sticky',
    tier: 4,
    cost: 4,
    label: '찐득이 (받는 감속 효과 x1/3로 완화)',
    effect: { kind: 'incomingDecelDampen', factor: 1 / 3 }
  },
  {
    key: 'racehorse',
    tier: 4,
    cost: 4,
    label: '경주마 (1등일 경우 가속 x1.5)',
    effect: { kind: 'leaderAccel', multiplier: 1.5 }
  },
  {
    key: 'rainbow-shield',
    tier: 5,
    cost: 5,
    label: '무지개반사판 (모든 감속 효과 무시)',
    effect: { kind: 'immuneToAllDecel' }
  },
  {
    key: 'magnet',
    tier: 5,
    cost: 5,
    label: '자석 (상대 속도가 내 속도 ±100을 못 넘음)',
    effect: { kind: 'magnetClamp', range: 100 }
  },
  {
    key: 'moses',
    tier: 5,
    cost: 5,
    label: '모세 (모든 트랙 방해 효과 무시)',
    effect: { kind: 'immuneToAllTrackHazards' }
  }
];

function itemsForTier(tier) {
  return EQUIP_ITEMS.filter((item) => item.tier === tier);
}

function itemByKey(key) {
  return EQUIP_ITEMS.find((item) => item.key === key);
}

// Rolls the equip-shop die: 1-5 offers a 3-card choice from that tier; 6
// grants 3 random items outright, but only counts the first time it's ever
// rolled for a given player — after that, a 6 is rerolled as if it never
// happened (per "6은 최초 1회만 인정, 2회부터 나올 경우 다시 굴리기").
function rollEquipDie(sixAlreadyUsed) {
  let roll = 1 + Math.floor(Math.random() * 6);
  while (roll === 6 && sixAlreadyUsed) {
    roll = 1 + Math.floor(Math.random() * 6);
  }
  return roll;
}

// 6-bonus: 3 independently random items, each from a random tier (1-5) —
// duplicates allowed, per "효과가 동일한 것 3가지도 가능".
function randomItemAnyTier() {
  const tier = 1 + Math.floor(Math.random() * 5);
  const pool = itemsForTier(tier);
  return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = {
  STARTING_TOKENS,
  MAX_EQUIPPED_ITEMS,
  MAX_DICE_ROLLS,
  EQUIP_PICK_MS,
  EQUIP_ITEMS,
  itemsForTier,
  itemByKey,
  rollEquipDie,
  randomItemAnyTier
};
