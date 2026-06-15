const express = require('express');
const prisma = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../errors');
const { checkoutSchema, reviewSchema } = require('../validators');
const { fromCents } = require('../utils/money');
const { calculateDiscount, isCouponExpired } = require('../utils/coupon');
const { createOrderNotification } = require('../utils/notification');
const { deductBalance, refundBalance } = require('../utils/wallet');
const {
  getLevelConfig,
  calculateEarnedPoints,
  calculateLevelByPoints,
  calculateMemberDiscount,
  calculateShippingFee,
  SHIPPING_FEE_CENTS,
  DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS
} = require('../utils/member');

const router = express.Router();

function mapOrder(order) {
  const estimatedPoints = calculateEarnedPoints(order.totalCents);
  return {
    id: order.id,
    status: order.status,
    paymentMethod: order.paymentMethod,
    subtotal: fromCents(order.subtotalCents),
    discount: fromCents(order.discountCents),
    total: fromCents(order.totalCents),
    memberDiscount: fromCents(order.memberDiscountCents || 0),
    shippingFee: fromCents(order.shippingFeeCents || 0),
    estimatedPoints,
    couponCode: order.couponCode,
    userCouponId: order.userCouponId,
    recipient: order.recipient,
    phone: order.phone,
    line1: order.line1,
    city: order.city,
    state: order.state,
    postalCode: order.postalCode,
    rating: order.rating,
    reviewText: order.reviewText,
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      id: item.id,
      title: item.title,
      author: item.author,
      coverUrl: item.coverUrl,
      price: fromCents(item.priceCents),
      quantity: item.quantity,
      returnedQuantity: item.returnedQuantity,
      specName: item.specName,
      specId: item.specId
    }))
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.user.id },
    include: { items: true },
    orderBy: { createdAt: 'desc' }
  });

  res.json(orders.map(mapOrder));
}));

router.post('/checkout', asyncHandler(async (req, res) => {
  const payload = checkoutSchema.parse(req.body);

  const address = await prisma.address.findUnique({
    where: { id: payload.addressId }
  });

  if (!address || address.userId !== req.user.id) {
    throw new ApiError(404, 'ADDRESS_NOT_FOUND');
  }

  const [cartItems, memberProfile] = await Promise.all([
    prisma.cartItem.findMany({
      where: { userId: req.user.id },
      include: { book: { include: { specs: { orderBy: { createdAt: 'asc' } } } } }
    }),
    prisma.memberProfile.upsert({
      where: { userId: req.user.id },
      update: {},
      create: { userId: req.user.id }
    })
  ]);

  if (cartItems.length === 0) {
    throw new ApiError(400, 'CART_EMPTY');
  }

  function getSpec(book, specId) {
    if (!specId || specId === '') return null;
    return (book.specs || []).find((s) => s.id === specId) || null;
  }

  function getEffectivePriceCents(book, spec) {
    return spec ? spec.priceCents : book.priceCents;
  }

  function getEffectiveStock(book, spec) {
    return spec ? spec.stock : book.stock;
  }

  function getEffectiveCover(book, spec) {
    if (spec && spec.coverUrl) return spec.coverUrl;
    return book.coverUrl;
  }

  const subtotalCents = cartItems.reduce(
    (sum, item) => {
      const spec = getSpec(item.book, item.specId);
      return sum + getEffectivePriceCents(item.book, spec) * item.quantity;
    },
    0
  );

  const memberLevel = memberProfile.level;
  const memberDiscountCents = calculateMemberDiscount(subtotalCents, memberLevel);
  const afterMemberSubtotal = subtotalCents - memberDiscountCents;

  let appliedUserCoupon = null;
  let appliedCoupon = null;
  let couponDiscountCents = 0;
  let couponCode = null;
  let userCouponId = null;

  if (payload.userCouponId) {
    const uc = await prisma.userCoupon.findUnique({
      where: { id: payload.userCouponId },
      include: { coupon: true }
    });

    if (!uc || uc.userId !== req.user.id) {
      throw new ApiError(404, 'USER_COUPON_NOT_FOUND');
    }

    if (uc.status === 'USED') {
      throw new ApiError(400, 'COUPON_ALREADY_USED');
    }

    if (isCouponExpired(uc.coupon)) {
      throw new ApiError(400, 'COUPON_EXPIRED');
    }

    const now = new Date();
    if (uc.coupon.validFrom > now) {
      throw new ApiError(400, 'COUPON_NOT_ACTIVE');
    }
    if (uc.coupon.status !== 'ACTIVE') {
      throw new ApiError(400, 'COUPON_NOT_AVAILABLE');
    }

    const result = calculateDiscount(uc.coupon, afterMemberSubtotal);
    if (!result.valid) {
      throw new ApiError(400, result.reason, {
        minAmount: result.minAmount
      });
    }

    appliedUserCoupon = uc;
    appliedCoupon = uc.coupon;
    couponDiscountCents = result.discountCents;
    couponCode = uc.coupon.code;
    userCouponId = uc.id;
  }

  const totalDiscountCents = memberDiscountCents + couponDiscountCents;
  const afterDiscountSubtotal = subtotalCents - totalDiscountCents;

  const shippingFeeCents = calculateShippingFee(afterDiscountSubtotal, memberLevel);
  const totalCents = Math.max(0, afterDiscountSubtotal + shippingFeeCents);

  for (const item of cartItems) {
    if (item.book.status !== 'ACTIVE') {
      throw new ApiError(400, 'BOOK_NOT_AVAILABLE');
    }
    const spec = getSpec(item.book, item.specId);
    const effectiveStock = getEffectiveStock(item.book, spec);
    if (effectiveStock < item.quantity) {
      throw new ApiError(400, 'INSUFFICIENT_STOCK');
    }
  }

  const order = await prisma.$transaction(async (tx) => {
    if (appliedUserCoupon) {
      const updatedUc = await tx.userCoupon.updateMany({
        where: {
          id: appliedUserCoupon.id,
          userId: req.user.id,
          status: 'AVAILABLE'
        },
        data: {
          status: 'USED'
        }
      });

      if (updatedUc.count === 0) {
        throw new ApiError(409, 'COUPON_CONCURRENT_USE');
      }
    }

    const created = await tx.order.create({
      data: {
        userId: req.user.id,
        paymentMethod: payload.paymentMethod,
        subtotalCents,
        discountCents: totalDiscountCents,
        memberDiscountCents,
        shippingFeeCents,
        totalCents,
        couponCode,
        userCouponId,
        recipient: address.recipient,
        phone: address.phone,
        line1: address.line1,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        status: 'PENDING_PAYMENT'
      }
    });

    if (appliedUserCoupon) {
      await tx.userCoupon.update({
        where: { id: appliedUserCoupon.id },
        data: {
          usedAt: new Date(),
          orderId: created.id
        }
      });
    }

    const orderItems = cartItems.map((item) => {
      const spec = getSpec(item.book, item.specId);
      const effectiveCover = getEffectiveCover(item.book, spec);
      return {
        orderId: created.id,
        bookId: item.bookId,
        title: item.book.title,
        author: item.book.author,
        coverUrl: effectiveCover,
        priceCents: getEffectivePriceCents(item.book, spec),
        quantity: item.quantity,
        specName: spec ? spec.name : null,
        specId: item.specId && item.specId !== '' ? item.specId : null
      };
    });

    await tx.orderItem.createMany({ data: orderItems });

    for (const item of cartItems) {
      const spec = getSpec(item.book, item.specId);
      if (spec) {
        await tx.bookSpec.update({
          where: { id: spec.id },
          data: { stock: { decrement: item.quantity } }
        });
      } else {
        await tx.book.update({
          where: { id: item.bookId },
          data: { stock: { decrement: item.quantity } }
        });
      }
    }

    await tx.cartItem.deleteMany({
      where: { userId: req.user.id }
    });

    return created;
  });

  if (order.status === 'CANCELED' && userCouponId) {
    await prisma.userCoupon.update({
      where: { id: userCouponId },
      data: {
        status: 'AVAILABLE',
        usedAt: null,
        orderId: null
      }
    });
  }

  const fullOrder = await prisma.order.findUnique({
    where: { id: order.id },
    include: { items: true }
  });

  res.status(201).json(mapOrder(fullOrder));
}));

router.post('/:id/pay', asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: true }
  });

  if (!order || order.userId !== req.user.id) {
    throw new ApiError(404, 'ORDER_NOT_FOUND');
  }

  if (order.status !== 'PENDING_PAYMENT') {
    throw new ApiError(400, 'ORDER_NOT_PAYABLE');
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (order.paymentMethod === 'BALANCE') {
      const deductResult = await deductBalance({
        userId: order.userId,
        amountCents: order.totalCents,
        source: 'ORDER_PAY',
        orderId: order.id,
        remark: `订单支付，订单号：${order.id}`,
        tx
      });

      if (deductResult.isDuplicate) {
        const existingOrder = await tx.order.findUnique({
          where: { id: order.id },
          include: { items: true }
        });
        if (existingOrder.status === 'PAID') {
          return existingOrder;
        }
      }
    }

    await tx.order.update({
      where: { id: order.id },
      data: { status: 'PAID' }
    });

    for (const item of order.items) {
      await tx.book.update({
        where: { id: item.bookId },
        data: { sales: { increment: item.quantity } }
      });
    }

    return await tx.order.findUnique({
      where: { id: order.id },
      include: { items: true }
    });
  });

  if (updated.status === 'PAID') {
    await createOrderNotification(req.user.id, 'ORDER_PAID', updated);
  }

  res.json(mapOrder(updated));
}));

router.post('/:id/cancel', asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: true }
  });

  if (!order || order.userId !== req.user.id) {
    throw new ApiError(404, 'ORDER_NOT_FOUND');
  }

  if (order.status !== 'PENDING_PAYMENT' && order.status !== 'PAID') {
    throw new ApiError(400, 'ORDER_NOT_CANCELABLE');
  }

  await prisma.$transaction(async (tx) => {
    if (order.status === 'PAID' && order.paymentMethod === 'BALANCE') {
      await refundBalance({
        userId: order.userId,
        amountCents: order.totalCents,
        source: 'ORDER_CANCEL',
        orderId: order.id,
        remark: `订单取消退款，订单号：${order.id}`,
        tx
      });
    }

    await tx.order.update({
      where: { id: order.id },
      data: { status: 'CANCELED' }
    });

    if (order.userCouponId) {
      await tx.userCoupon.updateMany({
        where: {
          id: order.userCouponId,
          userId: req.user.id,
          status: 'USED',
          orderId: order.id
        },
        data: {
          status: 'AVAILABLE',
          usedAt: null,
          orderId: null
        }
      });
    }

    for (const item of order.items) {
      if (item.specId) {
        const spec = await tx.bookSpec.findUnique({ where: { id: item.specId } });
        if (spec) {
          await tx.bookSpec.update({
            where: { id: item.specId },
            data: { stock: { increment: item.quantity } }
          });
        } else {
          await tx.book.update({
            where: { id: item.bookId },
            data: { stock: { increment: item.quantity } }
          });
        }
      } else {
        await tx.book.update({
          where: { id: item.bookId },
          data: { stock: { increment: item.quantity } }
        });
      }
    }
  });

  res.json({ message: 'order canceled' });
}));

router.post('/:id/confirm', asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id }
  });

  if (!order || order.userId !== req.user.id) {
    throw new ApiError(404, 'ORDER_NOT_FOUND');
  }

  if (order.status !== 'SHIPPED') {
    throw new ApiError(400, 'ORDER_NOT_SHIPPED');
  }

  const earnedPoints = calculateEarnedPoints(order.totalCents);

  const updated = await prisma.$transaction(async (tx) => {
    const orderUpdated = await tx.order.update({
      where: { id: order.id },
      data: { status: 'COMPLETED' }
    });

    const profile = await tx.memberProfile.upsert({
      where: { userId: req.user.id },
      update: {},
      create: { userId: req.user.id },
      select: { id: true, totalPoints: true, availablePoints: true, totalSpentCents: true, level: true }
    });

    const existingLog = await tx.pointLog.findUnique({
      where: { orderId_source: { orderId: order.id, source: 'ORDER_EARN' } }
    });

    if (!existingLog && earnedPoints > 0) {
      const balanceBefore = profile.totalPoints;
      const balanceAfter = balanceBefore + earnedPoints;
      const newLevel = calculateLevelByPoints(balanceAfter);

      await tx.pointLog.create({
        data: {
          userId: req.user.id,
          profileId: profile.id,
          source: 'ORDER_EARN',
          points: earnedPoints,
          balanceBefore,
          balanceAfter,
          orderId: order.id,
          remark: `订单完成，实付${fromCents(order.totalCents)}元，获得${earnedPoints}积分`
        }
      });

      await tx.memberProfile.update({
        where: { id: profile.id },
        data: {
          totalPoints: balanceAfter,
          availablePoints: { increment: earnedPoints },
          totalSpentCents: { increment: order.totalCents },
          level: newLevel
        }
      });
    }

    return orderUpdated;
  });

  await createOrderNotification(req.user.id, 'ORDER_COMPLETED', updated);

  res.json({
    message: 'order completed',
    earnedPoints,
    orderId: updated.id
  });
}));

router.post('/:id/review', asyncHandler(async (req, res) => {
  const payload = reviewSchema.parse(req.body);

  const order = await prisma.order.findUnique({
    where: { id: req.params.id }
  });

  if (!order || order.userId !== req.user.id) {
    throw new ApiError(404, 'ORDER_NOT_FOUND');
  }

  if (order.status !== 'COMPLETED') {
    throw new ApiError(400, 'ORDER_NOT_COMPLETED');
  }

  if (order.reviewedAt) {
    throw new ApiError(400, 'ORDER_ALREADY_REVIEWED');
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      rating: payload.rating,
      reviewText: payload.reviewText,
      reviewedAt: new Date()
    }
  });

  res.json({ message: 'review submitted' });
}));

module.exports = router;
