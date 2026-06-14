const express = require('express');
const prisma = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../errors');
const {
  getLevelConfig,
  getLevelProgress,
  getLevelList,
  calculateEarnedPoints,
  calculateLevelByPoints
} = require('../utils/member');

const router = express.Router();

function mapPointLog(log) {
  const sourceMap = {
    ORDER_EARN: '购物获得',
    ORDER_REFUND: '订单退款',
    AFTER_SALE_REFUND: '售后退款',
    ADMIN_ADJUST: '管理员调整'
  };
  return {
    id: log.id,
    source: log.source,
    sourceText: sourceMap[log.source] || log.source,
    points: log.points,
    balanceBefore: log.balanceBefore,
    balanceAfter: log.balanceAfter,
    orderId: log.orderId,
    afterSaleId: log.afterSaleId,
    remark: log.remark,
    createdAt: log.createdAt
  };
}

router.get('/profile', asyncHandler(async (req, res) => {
  let profile = await prisma.memberProfile.findUnique({
    where: { userId: req.user.id }
  });

  if (!profile) {
    profile = await prisma.memberProfile.create({
      data: { userId: req.user.id }
    });
  }

  const levelConfig = getLevelConfig(profile.level);
  const progress = getLevelProgress(profile.totalPoints, profile.level);

  res.json({
    level: profile.level,
    levelName: levelConfig.name,
    levelIcon: levelConfig.icon,
    levelColor: levelConfig.color,
    discountRate: levelConfig.discountRate,
    freeShipping: levelConfig.freeShipping,
    freeShippingThreshold: levelConfig.freeShippingThresholdCents,
    totalPoints: profile.totalPoints,
    availablePoints: profile.availablePoints,
    spentPoints: profile.spentPoints,
    totalSpentCents: profile.totalSpentCents,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    progress
  });
}));

router.get('/point-logs', asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 20, source } = req.query;
  const skip = (Number(page) - 1) * Number(pageSize);
  const take = Number(pageSize);

  const where = { userId: req.user.id };
  if (source) {
    where.source = String(source);
  }

  const [logs, total] = await Promise.all([
    prisma.pointLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.pointLog.count({ where })
  ]);

  const earnSum = await prisma.pointLog.aggregate({
    where: {
      userId: req.user.id,
      points: { gt: 0 }
    },
    _sum: { points: true }
  });

  const spendSum = await prisma.pointLog.aggregate({
    where: {
      userId: req.user.id,
      points: { lt: 0 }
    },
    _sum: { points: true }
  });

  res.json({
    total,
    page: Number(page),
    pageSize: Number(pageSize),
    totalEarned: earnSum._sum.points || 0,
    totalSpent: Math.abs(spendSum._sum.points || 0),
    logs: logs.map(mapPointLog)
  });
}));

router.get('/levels', asyncHandler(async (req, res) => {
  const levels = getLevelList();
  res.json(levels);
}));

router.get('/preview', asyncHandler(async (req, res) => {
  const { subtotal } = req.query;
  const subtotalCents = Number(subtotal) || 0;

  let profile = await prisma.memberProfile.findUnique({
    where: { userId: req.user.id }
  });

  if (!profile) {
    profile = await prisma.memberProfile.create({
      data: { userId: req.user.id }
    });
  }

  const levelConfig = getLevelConfig(profile.level);
  const discountRate = levelConfig.discountRate;
  const memberDiscountCents = discountRate < 1
    ? subtotalCents - Math.floor(subtotalCents * discountRate)
    : 0;
  const estimatedPoints = calculateEarnedPoints(Math.max(0, subtotalCents - memberDiscountCents));

  const nextLevelInfo = (() => {
    const progress = getLevelProgress(profile.totalPoints, profile.level);
    if (!progress.nextLevel) return null;
    return {
      nextLevel: progress.nextLevel,
      nextLevelName: getLevelConfig(progress.nextLevel).name,
      requiredPoints: progress.requiredPoints,
      remainingPoints: progress.remainingPoints
    };
  })();

  res.json({
    currentLevel: profile.level,
    currentLevelName: levelConfig.name,
    currentLevelIcon: levelConfig.icon,
    currentLevelColor: levelConfig.color,
    discountRate,
    freeShipping: levelConfig.freeShipping,
    freeShippingThreshold: levelConfig.freeShippingThresholdCents,
    memberDiscountCents,
    estimatedPoints,
    nextLevelInfo
  });
}));

module.exports = router;
