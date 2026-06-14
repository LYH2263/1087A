const MEMBER_LEVEL_CONFIG = {
  NORMAL: {
    name: '普通会员',
    minPoints: 0,
    maxPoints: 999,
    discountRate: 1.0,
    freeShipping: false,
    freeShippingThresholdCents: null,
    color: '#64748B',
    icon: '🥉'
  },
  SILVER: {
    name: '银卡会员',
    minPoints: 1000,
    maxPoints: 4999,
    discountRate: 0.95,
    freeShipping: false,
    freeShippingThresholdCents: 5000,
    color: '#A1A1AA',
    icon: '🥈'
  },
  GOLD: {
    name: '金卡会员',
    minPoints: 5000,
    maxPoints: Infinity,
    discountRate: 0.9,
    freeShipping: true,
    freeShippingThresholdCents: 0,
    color: '#F59E0B',
    icon: '🥇'
  }
};

const POINT_EARN_RATE = 1;
const SHIPPING_FEE_CENTS = 1000;
const DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS = 9900;

function getLevelConfig(level) {
  return MEMBER_LEVEL_CONFIG[level] || MEMBER_LEVEL_CONFIG.NORMAL;
}

function calculateLevelByPoints(totalPoints) {
  if (totalPoints >= MEMBER_LEVEL_CONFIG.GOLD.minPoints) return 'GOLD';
  if (totalPoints >= MEMBER_LEVEL_CONFIG.SILVER.minPoints) return 'SILVER';
  return 'NORMAL';
}

function calculateEarnedPoints(paidAmountCents) {
  return Math.floor(Math.max(0, paidAmountCents) / 100) * POINT_EARN_RATE;
}

function calculateMemberDiscount(subtotalCents, level) {
  const config = getLevelConfig(level);
  if (config.discountRate >= 1) return 0;
  const discounted = Math.floor(subtotalCents * config.discountRate);
  return subtotalCents - discounted;
}

function calculateShippingFee(subtotalCents, level) {
  const config = getLevelConfig(level);
  if (config.freeShipping) return 0;
  if (config.freeShippingThresholdCents !== null && subtotalCents >= config.freeShippingThresholdCents) {
    return 0;
  }
  if (subtotalCents >= DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS) return 0;
  return SHIPPING_FEE_CENTS;
}

function getNextLevel(currentLevel) {
  const order = ['NORMAL', 'SILVER', 'GOLD'];
  const idx = order.indexOf(currentLevel);
  if (idx === -1 || idx >= order.length - 1) return null;
  return order[idx + 1];
}

function getLevelProgress(totalPoints, currentLevel) {
  const config = getLevelConfig(currentLevel);
  const nextLevel = getNextLevel(currentLevel);
  if (!nextLevel) {
    return {
      currentLevel,
      nextLevel: null,
      currentPoints: totalPoints,
      requiredPoints: null,
      remainingPoints: 0,
      progress: 100
    };
  }
  const nextConfig = getLevelConfig(nextLevel);
  const required = nextConfig.minPoints - config.minPoints;
  const current = totalPoints - config.minPoints;
  const progress = Math.min(100, Math.round((current / required) * 100));
  return {
    currentLevel,
    nextLevel,
    currentPoints: totalPoints,
    requiredPoints: nextConfig.minPoints,
    remainingPoints: Math.max(0, nextConfig.minPoints - totalPoints),
    progress
  };
}

function getLevelList() {
  return Object.entries(MEMBER_LEVEL_CONFIG).map(([key, value]) => ({
    level: key,
    ...value
  }));
}

module.exports = {
  MEMBER_LEVEL_CONFIG,
  POINT_EARN_RATE,
  SHIPPING_FEE_CENTS,
  DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS,
  getLevelConfig,
  calculateLevelByPoints,
  calculateEarnedPoints,
  calculateMemberDiscount,
  calculateShippingFee,
  getNextLevel,
  getLevelProgress,
  getLevelList
};
