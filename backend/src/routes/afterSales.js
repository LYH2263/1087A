const express = require('express');
const prisma = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../errors');
const { createAfterSaleSchema } = require('../validators');
const { fromCents } = require('../utils/money');

const router = express.Router();

function mapAfterSale(afterSale) {
  return {
    id: afterSale.id,
    orderId: afterSale.orderId,
    type: afterSale.type,
    status: afterSale.status,
    reason: afterSale.reason,
    description: afterSale.description,
    rejectReason: afterSale.rejectReason,
    totalAmount: fromCents(afterSale.totalAmountCents),
    reviewedBy: afterSale.reviewedBy,
    reviewedAt: afterSale.reviewedAt,
    createdAt: afterSale.createdAt,
    updatedAt: afterSale.updatedAt,
    items: afterSale.items.map((item) => ({
      id: item.id,
      orderItemId: item.orderItemId,
      bookId: item.bookId,
      title: item.title,
      author: item.author,
      coverUrl: item.coverUrl,
      price: fromCents(item.priceCents),
      quantity: item.quantity
    }))
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const afterSales = await prisma.afterSale.findMany({
    where: { userId: req.user.id },
    include: { items: true },
    orderBy: { createdAt: 'desc' }
  });

  res.json(afterSales.map(mapAfterSale));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const afterSale = await prisma.afterSale.findUnique({
    where: { id: req.params.id },
    include: { items: true }
  });

  if (!afterSale || afterSale.userId !== req.user.id) {
    throw new ApiError(404, 'AFTERSALE_NOT_FOUND');
  }

  res.json(mapAfterSale(afterSale));
}));

router.post('/', asyncHandler(async (req, res) => {
  const payload = createAfterSaleSchema.parse(req.body);

  const order = await prisma.order.findUnique({
    where: { id: payload.orderId },
    include: { items: true }
  });

  if (!order || order.userId !== req.user.id) {
    throw new ApiError(404, 'ORDER_NOT_FOUND');
  }

  if (!['PAID', 'SHIPPED', 'COMPLETED'].includes(order.status)) {
    throw new ApiError(400, 'ORDER_NOT_ELIGIBLE_FOR_AFTERSALE');
  }

  const existingPending = await prisma.afterSale.findFirst({
    where: {
      orderId: order.id,
      userId: req.user.id,
      status: { in: ['PENDING', 'APPROVED', 'PROCESSING'] }
    }
  });

  if (existingPending) {
    throw new ApiError(400, 'AFTERSALE_ALREADY_EXISTS', {
      afterSaleId: existingPending.id,
      status: existingPending.status
    });
  }

  const orderItemMap = new Map(order.items.map((item) => [item.id, item]));

  let totalAmountCents = 0;
  const afterSaleItemsData = [];

  for (const reqItem of payload.items) {
    const orderItem = orderItemMap.get(reqItem.orderItemId);
    if (!orderItem) {
      throw new ApiError(400, 'ORDER_ITEM_NOT_FOUND', { orderItemId: reqItem.orderItemId });
    }

    const availableQuantity = orderItem.quantity - orderItem.returnedQuantity;
    if (reqItem.quantity > availableQuantity) {
      throw new ApiError(400, 'EXCEED_RETURNABLE_QUANTITY', {
        orderItemId: reqItem.orderItemId,
        requested: reqItem.quantity,
        available: availableQuantity
      });
    }

    if (availableQuantity <= 0) {
      throw new ApiError(400, 'ITEM_ALREADY_RETURNED', { orderItemId: reqItem.orderItemId });
    }

    totalAmountCents += orderItem.priceCents * reqItem.quantity;

    afterSaleItemsData.push({
      orderItemId: orderItem.id,
      bookId: orderItem.bookId,
      title: orderItem.title,
      author: orderItem.author,
      coverUrl: orderItem.coverUrl,
      priceCents: orderItem.priceCents,
      quantity: reqItem.quantity
    });
  }

  const afterSale = await prisma.afterSale.create({
    data: {
      orderId: order.id,
      userId: req.user.id,
      type: payload.type,
      reason: payload.reason,
      description: payload.description,
      totalAmountCents,
      items: {
        create: afterSaleItemsData
      }
    },
    include: { items: true }
  });

  res.status(201).json(mapAfterSale(afterSale));
}));

module.exports = router;
