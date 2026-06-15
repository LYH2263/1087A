const express = require('express');
const prisma = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../errors');
const { claimCouponSchema } = require('../validators');
const { fromCents } = require('../utils/money');
const { calculateDiscount, isCouponExpired } = require('../utils/coupon');

const router = express.Router();

function mapUserCoupon(uc) {
  const coupon = uc.coupon;
  let status = uc.status;

  if (status === 'AVAILABLE' && isCouponExpired(coupon)) {
    status = 'EXPIRED';
  }

  return {
    id: uc.id,
    couponId: coupon.id,
    name: coupon.name,
    code: coupon.code,
    type: coupon.type,
    discountAmount: coupon.discountAmountCents ? fromCents(coupon.discountAmountCents) : null,
    discountPercentage: coupon.discountPercentage,
    maxDiscount: coupon.maxDiscountCents ? fromCents(coupon.maxDiscountCents) : null,
    minAmount: fromCents(coupon.minAmountCents),
    validFrom: coupon.validFrom,
    validUntil: coupon.validUntil,
    status,
    description: coupon.description,
    claimedAt: uc.claimedAt,
    usedAt: uc.usedAt,
    orderId: uc.orderId
  };
}

router.get('/available', asyncHandler(async (req, res) => {
  const now = new Date();
  const coupons = await prisma.coupon.findMany({
    where: {
      status: 'ACTIVE',
      validFrom: { lte: now },
      validUntil: { gte: now }
    },
    orderBy: { createdAt: 'desc' }
  });

  const available = coupons.filter((c) => c.claimedQuantity < c.totalQuantity);

  const myClaimed = await prisma.userCoupon.findMany({
    where: { userId: req.user.id },
    select: { couponId: true }
  });

  const myClaimedIds = new Set(myClaimed.map((x) => x.couponId));

  const userClaimCounts = await prisma.userCoupon.groupBy({
    by: ['couponId'],
    where: { userId: req.user.id },
    _count: { _all: true }
  });

  const claimCountMap = userClaimCounts.reduce((acc, item) => {
    acc[item.couponId] = item._count._all;
    return acc;
  }, {});

  const result = available.map((c) => {
    const userClaimed = claimCountMap[c.id] || 0;
    return {
      id: c.id,
      name: c.name,
      code: c.code,
      type: c.type,
      discountAmount: c.discountAmountCents ? fromCents(c.discountAmountCents) : null,
      discountPercentage: c.discountPercentage,
      maxDiscount: c.maxDiscountCents ? fromCents(c.maxDiscountCents) : null,
      minAmount: fromCents(c.minAmountCents),
      totalQuantity: c.totalQuantity,
      claimedQuantity: c.claimedQuantity,
      remainQuantity: c.totalQuantity - c.claimedQuantity,
      limitPerUser: c.limitPerUser,
      userClaimed,
      canClaim: userClaimed < c.limitPerUser,
      alreadyClaimed: myClaimedIds.has(c.id),
      validFrom: c.validFrom,
      validUntil: c.validUntil,
      description: c.description
    };
  });

  res.json(result);
}));

router.post('/claim', asyncHandler(async (req, res) => {
  const payload = claimCouponSchema.parse(req.body);

  const result = await prisma.$transaction(async (tx) => {
    const coupon = await tx.coupon.findUnique({
      where: { id: payload.couponId }
    });

    if (!coupon) {
      throw new ApiError(404, 'COUPON_NOT_FOUND');
    }

    const now = new Date();
    if (coupon.validFrom > now) {
      throw new ApiError(400, 'COUPON_NOT_ACTIVE');
    }
    if (coupon.validUntil < now) {
      throw new ApiError(400, 'COUPON_EXPIRED');
    }
    if (coupon.status !== 'ACTIVE') {
      throw new ApiError(400, 'COUPON_NOT_AVAILABLE');
    }
    if (coupon.claimedQuantity >= coupon.totalQuantity) {
      throw new ApiError(400, 'COUPON_SOLD_OUT');
    }

    const userClaimed = await tx.userCoupon.count({
      where: { userId: req.user.id, couponId: coupon.id }
    });

    if (userClaimed >= coupon.limitPerUser) {
      throw new ApiError(400, 'COUPON_LIMIT_REACHED');
    }

    const userCoupon = await tx.userCoupon.create({
      data: {
        userId: req.user.id,
        couponId: coupon.id,
        expiredAt: coupon.validUntil
      },
      include: { coupon: true }
    });

    await tx.coupon.update({
      where: { id: coupon.id },
      data: { claimedQuantity: { increment: 1 } }
    });

    return userCoupon;
  });

  res.status(201).json(mapUserCoupon(result));
}));

router.get('/mine', asyncHandler(async (req, res) => {
  const { status } = req.query;
  const now = new Date();

  const where = { userId: req.user.id };

  const userCoupons = await prisma.userCoupon.findMany({
    where,
    include: { coupon: true },
    orderBy: { claimedAt: 'desc' }
  });

  let mapped = userCoupons.map(mapUserCoupon);

  if (status) {
    const filterStatus = String(status).toUpperCase();
    mapped = mapped.filter((uc) => uc.status === filterStatus);
  }

  const counts = {
    AVAILABLE: mapped.filter((uc) => uc.status === 'AVAILABLE').length,
    USED: mapped.filter((uc) => uc.status === 'USED').length,
    EXPIRED: mapped.filter((uc) => uc.status === 'EXPIRED').length
  };

  res.json({
    items: mapped,
    counts
  });
}));

router.post('/calculate', asyncHandler(async (req, res) => {
  const { userCouponId, subtotal } = req.body;

  if (subtotal === undefined || subtotal === null) {
    throw new ApiError(400, 'SUBTOTAL_REQUIRED');
  }

  const subtotalCents = Math.round(Number(subtotal) * 100);

  if (!userCouponId) {
    return res.json({
      useCoupon: false,
      subtotal: fromCents(subtotalCents),
      discount: 0,
      total: fromCents(subtotalCents)
    });
  }

  const userCoupon = await prisma.userCoupon.findUnique({
    where: { id: userCouponId },
    include: { coupon: true }
  });

  if (!userCoupon || userCoupon.userId !== req.user.id) {
    throw new ApiError(404, 'USER_COUPON_NOT_FOUND');
  }

  if (userCoupon.status === 'USED') {
    throw new ApiError(400, 'COUPON_ALREADY_USED');
  }

  if (isCouponExpired(userCoupon.coupon)) {
    throw new ApiError(400, 'COUPON_EXPIRED');
  }

  const result = calculateDiscount(userCoupon.coupon, subtotalCents);

  if (!result.valid) {
    return res.json({
      useCoupon: false,
      valid: false,
      reason: result.reason,
      minAmount: result.minAmount,
      subtotal: fromCents(subtotalCents),
      discount: 0,
      total: fromCents(subtotalCents)
    });
  }

  res.json({
    useCoupon: true,
    valid: true,
    userCouponId: userCoupon.id,
    subtotal: fromCents(subtotalCents),
    discount: fromCents(result.discountCents),
    total: fromCents(result.finalCents),
    details: result.details
  });
}));

router.get('/applicable', asyncHandler(async (req, res) => {
  const { subtotal } = req.query;

  if (subtotal === undefined || subtotal === null) {
    throw new ApiError(400, 'SUBTOTAL_REQUIRED');
  }

  const subtotalCents = Math.round(Number(subtotal) * 100);
  const now = new Date();

  const myCoupons = await prisma.userCoupon.findMany({
    where: {
      userId: req.user.id,
      status: 'AVAILABLE'
    },
    include: { coupon: true }
  });

  const applicable = [];
  const notApplicable = [];

  for (const uc of myCoupons) {
    const coupon = uc.coupon;
    if (isCouponExpired(coupon)) continue;
    if (coupon.status !== 'ACTIVE') continue;
    if (coupon.validFrom > now) continue;

    const result = calculateDiscount(coupon, subtotalCents);

    const item = {
      userCouponId: uc.id,
      couponId: coupon.id,
      name: coupon.name,
      code: coupon.code,
      type: coupon.type,
      discountAmount: coupon.discountAmountCents ? fromCents(coupon.discountAmountCents) : null,
      discountPercentage: coupon.discountPercentage,
      maxDiscount: coupon.maxDiscountCents ? fromCents(coupon.maxDiscountCents) : null,
      minAmount: fromCents(coupon.minAmountCents),
      validUntil: coupon.validUntil,
      description: coupon.description,
      discount: result.valid ? fromCents(result.discountCents) : 0
    };

    if (result.valid) {
      applicable.push(item);
    } else {
      item.reason = result.reason;
      item.minAmount = result.minAmount;
      notApplicable.push(item);
    }
  }

  applicable.sort((a, b) => b.discount - a.discount);

  res.json({
    applicable,
    notApplicable,
    subtotal: fromCents(subtotalCents),
    bestChoice: applicable.length > 0 ? applicable[0] : null
  });
}));

module.exports = router;
