const express = require('express');
const prisma = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../errors');
const { checkoutSchema, reviewSchema } = require('../validators');
const { fromCents } = require('../utils/money');
const { calculateDiscount, isCouponExpired } = require('../utils/coupon');

const router = express.Router();

function mapOrder(order) {
  return {
    id: order.id,
    status: order.status,
    paymentMethod: order.paymentMethod,
    subtotal: fromCents(order.subtotalCents),
    discount: fromCents(order.discountCents),
    total: fromCents(order.totalCents),
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
      quantity: item.quantity
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

  const cartItems = await prisma.cartItem.findMany({
    where: { userId: req.user.id },
    include: { book: true }
  });

  if (cartItems.length === 0) {
    throw new ApiError(400, 'CART_EMPTY');
  }

  const subtotalCents = cartItems.reduce(
    (sum, item) => sum + item.book.priceCents * item.quantity,
    0
  );

  let appliedUserCoupon = null;
  let appliedCoupon = null;
  let discountCents = 0;
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

    const result = calculateDiscount(uc.coupon, subtotalCents);
    if (!result.valid) {
      throw new ApiError(400, result.reason, {
        minAmount: result.minAmount
      });
    }

    appliedUserCoupon = uc;
    appliedCoupon = uc.coupon;
    discountCents = result.discountCents;
    couponCode = uc.coupon.code;
    userCouponId = uc.id;
  }

  const totalCents = Math.max(0, subtotalCents - discountCents);

  for (const item of cartItems) {
    if (item.book.status !== 'ACTIVE') {
      throw new ApiError(400, 'BOOK_NOT_AVAILABLE');
    }
    if (item.book.stock < item.quantity) {
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
        discountCents,
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

    const orderItems = cartItems.map((item) => ({
      orderId: created.id,
      bookId: item.bookId,
      title: item.book.title,
      author: item.book.author,
      coverUrl: item.book.coverUrl,
      priceCents: item.book.priceCents,
      quantity: item.quantity
    }));

    await tx.orderItem.createMany({ data: orderItems });

    for (const item of cartItems) {
      await tx.book.update({
        where: { id: item.bookId },
        data: { stock: { decrement: item.quantity } }
      });
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

  await prisma.$transaction(async (tx) => {
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
  });

  const updated = await prisma.order.findUnique({
    where: { id: order.id },
    include: { items: true }
  });

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

  if (order.status !== 'PENDING_PAYMENT') {
    throw new ApiError(400, 'ORDER_NOT_CANCELABLE');
  }

  await prisma.$transaction(async (tx) => {
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
      await tx.book.update({
        where: { id: item.bookId },
        data: { stock: { increment: item.quantity } }
      });
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

  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'COMPLETED' }
  });

  res.json({ message: 'order completed' });
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
