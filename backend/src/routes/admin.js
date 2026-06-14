const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const prisma = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../errors');
const { bookSchema, bookUpdateSchema, categorySchema, createCouponSchema, updateCouponSchema, stockThresholdSchema, singleRestockSchema, batchRestockSchema, rejectAfterSaleSchema, bookSpecSchema, bookSpecUpdateSchema, createSalesGoalSchema, updateSalesGoalSchema } = require('../validators');
const { toCents, fromCents } = require('../utils/money');
const { generateCouponCode } = require('../utils/coupon');
const { createOrderNotification } = require('../utils/notification');
const {
  calculateEarnedPoints,
  calculateLevelByPoints
} = require('../utils/member');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '';
    const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(ext) ? ext : '.png';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${safeExt}`);
  }
});

const MAX_UPLOAD_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(new ApiError(400, 'INVALID_FILE_TYPE'));
    }
    return cb(null, true);
  }
});

function mapBook(book) {
  const specs = (book.specs || []).map((s) => ({
    id: s.id,
    name: s.name,
    price: fromCents(s.priceCents),
    stock: s.stock,
    coverUrl: s.coverUrl
  }));
  const hasSpecs = specs.length > 0;
  const displayPrice = hasSpecs
    ? fromCents(Math.min(...book.specs.map((s) => s.priceCents)))
    : fromCents(book.priceCents);
  const totalStock = hasSpecs
    ? book.specs.reduce((sum, s) => sum + s.stock, 0)
    : book.stock;
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    isbn: book.isbn,
    description: book.description,
    price: displayPrice,
    stock: totalStock,
    coverUrl: book.coverUrl,
    sales: book.sales,
    status: book.status,
    category: book.category,
    hasSpecs,
    specs
  };
}

router.get('/books', asyncHandler(async (req, res) => {
  const { status, keyword } = req.query;
  const where = {};
  if (status) {
    where.status = String(status);
  }
  if (keyword) {
    where.OR = [
      { title: { contains: String(keyword), mode: 'insensitive' } },
      { author: { contains: String(keyword), mode: 'insensitive' } },
      { isbn: { contains: String(keyword), mode: 'insensitive' } }
    ];
  }

  const books = await prisma.book.findMany({
    where,
    include: { category: true, specs: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' }
  });

  res.json(books.map(mapBook));
}));

router.post('/upload', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'NO_FILE');
  }

  res.json({ url: `/uploads/${req.file.filename}` });
}));

router.post('/books', asyncHandler(async (req, res) => {
  const payload = bookSchema.parse(req.body);

  const exists = await prisma.book.findFirst({
    where: { isbn: payload.isbn }
  });

  if (exists) {
    throw new ApiError(409, 'BOOK_EXISTS');
  }

  const book = await prisma.book.create({
    data: {
      title: payload.title,
      author: payload.author,
      isbn: payload.isbn,
      description: payload.description,
      priceCents: toCents(payload.price),
      stock: payload.stock,
      coverUrl: payload.coverUrl,
      categoryId: payload.categoryId
    },
    include: { category: true, specs: { orderBy: { createdAt: 'asc' } } }
  });

  res.status(201).json(mapBook(book));
}));

router.put('/books/:id', asyncHandler(async (req, res) => {
  const payload = bookUpdateSchema.parse(req.body);

  const data = { ...payload };
  if (payload.price !== undefined) {
    data.priceCents = toCents(payload.price);
    delete data.price;
  }

  const book = await prisma.book.update({
    where: { id: req.params.id },
    data,
    include: { category: true, specs: { orderBy: { createdAt: 'asc' } } }
  });

  res.json(mapBook(book));
}));

router.delete('/books/:id', asyncHandler(async (req, res) => {
  const book = await prisma.book.update({
    where: { id: req.params.id },
    data: { status: 'INACTIVE' }
  });

  res.json({ message: 'book deactivated', id: book.id });
}));

router.post('/books/:id/restore', asyncHandler(async (req, res) => {
  const book = await prisma.book.update({
    where: { id: req.params.id },
    data: { status: 'ACTIVE' },
    include: { category: true, specs: { orderBy: { createdAt: 'asc' } } }
  });

  res.json(mapBook(book));
}));

router.get('/books/:bookId/specs', asyncHandler(async (req, res) => {
  const book = await prisma.book.findUnique({
    where: { id: req.params.bookId }
  });

  if (!book) {
    throw new ApiError(404, 'BOOK_NOT_FOUND');
  }

  const specs = await prisma.bookSpec.findMany({
    where: { bookId: req.params.bookId },
    orderBy: { createdAt: 'asc' }
  });

  res.json(specs.map((s) => ({
    id: s.id,
    name: s.name,
    price: fromCents(s.priceCents),
    stock: s.stock,
    coverUrl: s.coverUrl,
    createdAt: s.createdAt
  })));
}));

router.post('/books/:bookId/specs', asyncHandler(async (req, res) => {
  const book = await prisma.book.findUnique({
    where: { id: req.params.bookId }
  });

  if (!book) {
    throw new ApiError(404, 'BOOK_NOT_FOUND');
  }

  const payload = bookSpecSchema.parse(req.body);

  const existing = await prisma.bookSpec.findUnique({
    where: { bookId_name: { bookId: req.params.bookId, name: payload.name } }
  });

  if (existing) {
    throw new ApiError(409, 'SPEC_NAME_EXISTS');
  }

  const spec = await prisma.bookSpec.create({
    data: {
      bookId: req.params.bookId,
      name: payload.name,
      priceCents: toCents(payload.price),
      stock: payload.stock,
      coverUrl: payload.coverUrl || null
    }
  });

  res.status(201).json({
    id: spec.id,
    name: spec.name,
    price: fromCents(spec.priceCents),
    stock: spec.stock,
    coverUrl: spec.coverUrl
  });
}));

router.put('/books/:bookId/specs/:specId', asyncHandler(async (req, res) => {
  const spec = await prisma.bookSpec.findUnique({
    where: { id: req.params.specId }
  });

  if (!spec || spec.bookId !== req.params.bookId) {
    throw new ApiError(404, 'SPEC_NOT_FOUND');
  }

  const payload = bookSpecUpdateSchema.parse(req.body);

  const data = { ...payload };
  if (payload.price !== undefined) {
    data.priceCents = toCents(payload.price);
    delete data.price;
  }

  const updated = await prisma.bookSpec.update({
    where: { id: req.params.specId },
    data
  });

  res.json({
    id: updated.id,
    name: updated.name,
    price: fromCents(updated.priceCents),
    stock: updated.stock,
    coverUrl: updated.coverUrl
  });
}));

router.delete('/books/:bookId/specs/:specId', asyncHandler(async (req, res) => {
  const spec = await prisma.bookSpec.findUnique({
    where: { id: req.params.specId }
  });

  if (!spec || spec.bookId !== req.params.bookId) {
    throw new ApiError(404, 'SPEC_NOT_FOUND');
  }

  await prisma.bookSpec.delete({ where: { id: req.params.specId } });

  res.json({ message: 'spec deleted', id: spec.id });
}));

router.get('/categories', asyncHandler(async (req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' }
  });
  res.json(categories);
}));

router.post('/categories', asyncHandler(async (req, res) => {
  const payload = categorySchema.parse(req.body);
  const exists = await prisma.category.findUnique({
    where: { name: payload.name }
  });
  if (exists) {
    throw new ApiError(409, 'CATEGORY_EXISTS');
  }
  const category = await prisma.category.create({
    data: { name: payload.name }
  });
  res.status(201).json(category);
}));

router.delete('/categories/:id', asyncHandler(async (req, res) => {
  const count = await prisma.book.count({
    where: { categoryId: req.params.id }
  });
  if (count > 0) {
    throw new ApiError(400, 'CATEGORY_IN_USE');
  }
  await prisma.category.delete({ where: { id: req.params.id } });
  res.json({ message: 'category deleted' });
}));

router.get('/orders', asyncHandler(async (req, res) => {
  const { status } = req.query;
  const where = {};
  if (status) {
    where.status = String(status);
  }

  const orders = await prisma.order.findMany({
    where,
    include: {
      items: true,
      user: true
    },
    orderBy: { createdAt: 'desc' }
  });

  res.json(orders.map((order) => ({
    id: order.id,
    status: order.status,
    paymentMethod: order.paymentMethod,
    total: fromCents(order.totalCents),
    recipient: order.recipient,
    phone: order.phone,
    line1: order.line1,
    city: order.city,
    state: order.state,
    postalCode: order.postalCode,
    createdAt: order.createdAt,
    user: {
      id: order.user.id,
      username: order.user.username,
      email: order.user.email,
      phone: order.user.phone
    },
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
  })));
}));

router.get('/orders/stats', asyncHandler(async (req, res) => {
  const grouped = await prisma.order.groupBy({
    by: ['status'],
    _count: { _all: true }
  });

  const revenue = await prisma.order.aggregate({
    _sum: { totalCents: true },
    where: { status: { in: ['PAID', 'SHIPPED', 'COMPLETED'] } }
  });

  res.json({
    statusCounts: grouped.reduce((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {}),
    revenue: fromCents(revenue._sum.totalCents || 0)
  });
}));

router.get('/orders/export', asyncHandler(async (req, res) => {
  const orders = await prisma.order.findMany({
    include: { user: true },
    orderBy: { createdAt: 'desc' }
  });

  const rows = [
    ['订单号', '用户名', '状态', '支付方式', '金额', '收件人', '电话', '地址', '创建时间']
  ];

  orders.forEach((order) => {
    rows.push([
      order.id,
      order.user.username,
      order.status,
      order.paymentMethod,
      fromCents(order.totalCents).toFixed(2),
      order.recipient,
      order.phone,
      `${order.state}${order.city}${order.line1}`,
      order.createdAt.toISOString()
    ]);
  });

  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
  res.send(csv);
}));

router.post('/orders/:id/accept', asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: true }
  });

  if (!order || order.status !== 'PENDING_PAYMENT') {
    throw new ApiError(400, 'ORDER_NOT_PENDING');
  }

  const updated = await prisma.$transaction(async (tx) => {
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
      where: { id: order.id }
    });
  });

  await createOrderNotification(order.userId, 'ORDER_PAID', updated);

  res.json({ message: 'order accepted' });
}));

router.post('/orders/:id/ship', asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id }
  });

  if (!order || order.status !== 'PAID') {
    throw new ApiError(400, 'ORDER_NOT_PAID');
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { status: 'SHIPPED' }
  });

  await createOrderNotification(order.userId, 'ORDER_SHIPPED', updated);

  res.json({ message: 'order shipped' });
}));

router.post('/orders/:id/refund', asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: true }
  });

  if (!order || !['PAID', 'SHIPPED', 'COMPLETED'].includes(order.status)) {
    throw new ApiError(400, 'ORDER_NOT_REFUNDABLE');
  }

  const refundedPoints = calculateEarnedPoints(order.totalCents);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'REFUNDED' }
    });

    if (order.userCouponId) {
      await tx.userCoupon.updateMany({
        where: {
          id: order.userCouponId,
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
        data: {
          stock: { increment: item.quantity },
          sales: { decrement: item.quantity }
        }
      });

      if (item.specId) {
        const spec = await tx.bookSpec.findUnique({ where: { id: item.specId } });
        if (spec) {
          await tx.bookSpec.update({
            where: { id: item.specId },
            data: { stock: { increment: item.quantity } }
          });
        }
      }
    }

    if (refundedPoints > 0) {
      const profile = await tx.memberProfile.findUnique({
        where: { userId: order.userId },
        select: { id: true, totalPoints: true, availablePoints: true, totalSpentCents: true }
      });

      if (profile) {
        const existingRefundLog = await tx.pointLog.findUnique({
          where: { orderId_source: { orderId: order.id, source: 'ORDER_REFUND' } }
        });

        if (!existingRefundLog) {
          const balanceBefore = profile.totalPoints;
          const balanceAfter = Math.max(0, balanceBefore - refundedPoints);
          const newLevel = calculateLevelByPoints(balanceAfter);
          const availableDeduct = Math.min(profile.availablePoints, refundedPoints);
          const spentDeduct = Math.min(profile.totalSpentCents, order.totalCents);

          await tx.pointLog.create({
            data: {
              userId: order.userId,
              profileId: profile.id,
              source: 'ORDER_REFUND',
              points: -refundedPoints,
              balanceBefore,
              balanceAfter,
              orderId: order.id,
              remark: `订单退款，扣回${refundedPoints}积分`
            }
          });

          await tx.memberProfile.update({
            where: { id: profile.id },
            data: {
              totalPoints: balanceAfter,
              availablePoints: { decrement: availableDeduct },
              totalSpentCents: { decrement: spentDeduct },
              level: newLevel
            }
          });
        }
      }
    }

    return await tx.order.findUnique({
      where: { id: order.id }
    });
  });

  await createOrderNotification(order.userId, 'ORDER_REFUNDED', updated);

  res.json({
    message: 'order refunded',
    refundedPoints
  });
}));

function mapCoupon(coupon) {
  return {
    id: coupon.id,
    name: coupon.name,
    code: coupon.code,
    type: coupon.type,
    discountAmount: coupon.discountAmountCents ? fromCents(coupon.discountAmountCents) : null,
    discountPercentage: coupon.discountPercentage,
    maxDiscount: coupon.maxDiscountCents ? fromCents(coupon.maxDiscountCents) : null,
    minAmount: fromCents(coupon.minAmountCents),
    totalQuantity: coupon.totalQuantity,
    claimedQuantity: coupon.claimedQuantity,
    limitPerUser: coupon.limitPerUser,
    validFrom: coupon.validFrom,
    validUntil: coupon.validUntil,
    status: coupon.status,
    description: coupon.description,
    createdAt: coupon.createdAt
  };
}

router.get('/coupons', asyncHandler(async (req, res) => {
  const { status, type } = req.query;
  const where = {};
  if (status) {
    where.status = String(status);
  }
  if (type) {
    where.type = String(type);
  }

  const coupons = await prisma.coupon.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  });

  res.json(coupons.map(mapCoupon));
}));

router.post('/coupons', asyncHandler(async (req, res) => {
  const payload = createCouponSchema.parse(req.body);

  let code;
  let attempts = 0;
  do {
    code = generateCouponCode();
    const exists = await prisma.coupon.findUnique({ where: { code } });
    if (!exists) break;
    attempts++;
  } while (attempts < 10);

  const coupon = await prisma.coupon.create({
    data: {
      name: payload.name,
      code,
      type: payload.type,
      discountAmountCents: payload.discountAmount !== undefined ? toCents(payload.discountAmount) : null,
      discountPercentage: payload.discountPercentage,
      maxDiscountCents: payload.maxDiscount !== undefined ? toCents(payload.maxDiscount) : null,
      minAmountCents: toCents(payload.minAmount || 0),
      totalQuantity: payload.totalQuantity,
      limitPerUser: payload.limitPerUser,
      validFrom: new Date(payload.validFrom),
      validUntil: new Date(payload.validUntil),
      description: payload.description
    }
  });

  res.status(201).json(mapCoupon(coupon));
}));

router.get('/coupons/:id', asyncHandler(async (req, res) => {
  const coupon = await prisma.coupon.findUnique({
    where: { id: req.params.id },
    include: {
      userCoupons: {
        include: { user: true },
        orderBy: { claimedAt: 'desc' },
        take: 50
      }
    }
  });

  if (!coupon) {
    throw new ApiError(404, 'COUPON_NOT_FOUND');
  }

  const data = mapCoupon(coupon);
  data.claimedUsers = coupon.userCoupons.map((uc) => ({
    id: uc.id,
    userId: uc.userId,
    username: uc.user.username,
    status: uc.status,
    claimedAt: uc.claimedAt,
    usedAt: uc.usedAt,
    orderId: uc.orderId
  }));

  res.json(data);
}));

router.put('/coupons/:id', asyncHandler(async (req, res) => {
  const payload = updateCouponSchema.parse(req.body);

  const exists = await prisma.coupon.findUnique({
    where: { id: req.params.id }
  });

  if (!exists) {
    throw new ApiError(404, 'COUPON_NOT_FOUND');
  }

  const coupon = await prisma.coupon.update({
    where: { id: req.params.id },
    data: payload
  });

  res.json(mapCoupon(coupon));
}));

router.delete('/coupons/:id', asyncHandler(async (req, res) => {
  const exists = await prisma.coupon.findUnique({
    where: { id: req.params.id }
  });

  if (!exists) {
    throw new ApiError(404, 'COUPON_NOT_FOUND');
  }

  await prisma.coupon.update({
    where: { id: req.params.id },
    data: { status: 'INACTIVE' }
  });

  res.json({ message: 'coupon deactivated', id: req.params.id });
}));

router.get('/coupons/stats/overview', asyncHandler(async (req, res) => {
  const total = await prisma.coupon.count();
  const active = await prisma.coupon.count({ where: { status: 'ACTIVE' } });
  const totalClaimed = await prisma.userCoupon.count();
  const totalUsed = await prisma.userCoupon.count({ where: { status: 'USED' } });

  const couponUsage = await prisma.userCoupon.groupBy({
    by: ['status'],
    _count: { _all: true }
  });

  res.json({
    totalCoupons: total,
    activeCoupons: active,
    totalClaimed,
    totalUsed,
    byStatus: couponUsage.reduce((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {})
  });
}));

router.get('/stock/threshold', asyncHandler(async (req, res) => {
  const globalThreshold = await prisma.stockThreshold.findFirst({
    where: { isGlobal: true }
  });

  const bookThresholds = await prisma.stockThreshold.findMany({
    where: { isGlobal: false, bookId: { not: null } },
    include: { book: { select: { id: true, title: true } } }
  });

  res.json({
    global: globalThreshold ? { threshold: globalThreshold.threshold } : { threshold: 10 },
    bookThresholds: bookThresholds.map(bt => ({
      id: bt.id,
      bookId: bt.bookId,
      bookTitle: bt.book?.title,
      threshold: bt.threshold
    }))
  });
}));

router.post('/stock/threshold', asyncHandler(async (req, res) => {
  const payload = stockThresholdSchema.parse(req.body);

  if (payload.bookId) {
    const book = await prisma.book.findUnique({ where: { id: payload.bookId } });
    if (!book) {
      throw new ApiError(404, 'BOOK_NOT_FOUND');
    }

    const threshold = await prisma.stockThreshold.upsert({
      where: { bookId: payload.bookId },
      update: { threshold: payload.threshold },
      create: {
        bookId: payload.bookId,
        threshold: payload.threshold,
        isGlobal: false
      }
    });

    res.json({
      id: threshold.id,
      bookId: threshold.bookId,
      threshold: threshold.threshold
    });
  } else {
    const threshold = await prisma.stockThreshold.upsert({
      where: { isGlobal: true, bookId: null },
      update: { threshold: payload.threshold },
      create: {
        threshold: payload.threshold,
        isGlobal: true
      }
    });

    res.json({
      id: threshold.id,
      threshold: threshold.threshold,
      isGlobal: true
    });
  }
}));

router.delete('/stock/threshold/:bookId', asyncHandler(async (req, res) => {
  await prisma.stockThreshold.deleteMany({
    where: { bookId: req.params.bookId }
  });
  res.json({ message: 'threshold deleted' });
}));

router.get('/stock/warnings', asyncHandler(async (req, res) => {
  const globalThreshold = await prisma.stockThreshold.findFirst({
    where: { isGlobal: true }
  });
  const defaultThreshold = globalThreshold?.threshold ?? 10;

  const booksWithThresholds = await prisma.book.findMany({
    where: { status: 'ACTIVE' },
    include: { stockThreshold: true, category: true }
  });

  const warningBooks = booksWithThresholds
    .map(book => {
      const threshold = book.stockThreshold?.threshold ?? defaultThreshold;
      const gap = threshold - book.stock;
      return {
        ...mapBook(book),
        threshold,
        gap,
        isLowStock: book.stock < threshold,
        isZeroStock: book.stock === 0
      };
    })
    .filter(book => book.isLowStock)
    .sort((a, b) => b.gap - a.gap);

  res.json({
    total: warningBooks.length,
    zeroStockCount: warningBooks.filter(b => b.isZeroStock).length,
    books: warningBooks
  });
}));

router.post('/stock/restock', asyncHandler(async (req, res) => {
  const payload = singleRestockSchema.parse(req.body);
  const operatorId = req.user.id;

  const result = await prisma.$transaction(async (tx) => {
    const book = await tx.book.findUnique({
      where: { id: payload.bookId }
    });

    if (!book) {
      throw new ApiError(404, 'BOOK_NOT_FOUND');
    }

    const oldStock = book.stock;
    const newStock = oldStock + payload.quantity;

    await tx.book.update({
      where: { id: payload.bookId },
      data: { stock: newStock }
    });

    const log = await tx.stockRestockLog.create({
      data: {
        bookId: payload.bookId,
        quantity: payload.quantity,
        oldStock,
        newStock,
        operator: operatorId
      }
    });

    return { bookId: payload.bookId, oldStock, newStock, quantity: payload.quantity, logId: log.id };
  });

  res.json(result);
}));

router.post('/stock/restock/batch', asyncHandler(async (req, res) => {
  const payload = batchRestockSchema.parse(req.body);
  const operatorId = req.user.id;

  const results = await prisma.$transaction(async (tx) => {
    const results = [];

    for (const item of payload.items) {
      const book = await tx.book.findUnique({
        where: { id: item.bookId }
      });

      if (!book) {
        throw new ApiError(404, `BOOK_NOT_FOUND: ${item.bookId}`);
      }

      const oldStock = book.stock;
      const newStock = oldStock + item.quantity;

      await tx.book.update({
        where: { id: item.bookId },
        data: { stock: newStock }
      });

      const log = await tx.stockRestockLog.create({
        data: {
          bookId: item.bookId,
          quantity: item.quantity,
          oldStock,
          newStock,
          operator: operatorId
        }
      });

      results.push({
        bookId: item.bookId,
        bookTitle: book.title,
        oldStock,
        newStock,
        quantity: item.quantity,
        logId: log.id
      });
    }

    return results;
  });

  res.json({ success: true, results });
}));

router.get('/stock/restock-logs', asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 20, bookId } = req.query;
  const skip = (Number(page) - 1) * Number(pageSize);
  const take = Number(pageSize);

  const where = {};
  if (bookId) {
    where.bookId = String(bookId);
  }

  const [logs, total] = await Promise.all([
    prisma.stockRestockLog.findMany({
      where,
      include: {
        book: { select: { id: true, title: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.stockRestockLog.count({ where })
  ]);

  res.json({
    total,
    page: Number(page),
    pageSize: Number(pageSize),
    logs: logs.map(log => ({
      id: log.id,
      bookId: log.bookId,
      bookTitle: log.book?.title,
      quantity: log.quantity,
      oldStock: log.oldStock,
      newStock: log.newStock,
      operator: log.operator,
      createdAt: log.createdAt
    }))
  });
}));

function mapAdminAfterSale(afterSale) {
  return {
    id: afterSale.id,
    orderId: afterSale.orderId,
    userId: afterSale.userId,
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
    user: afterSale.user ? {
      id: afterSale.user.id,
      username: afterSale.user.username,
      phone: afterSale.user.phone
    } : undefined,
    order: afterSale.order ? {
      id: afterSale.order.id,
      status: afterSale.order.status,
      recipient: afterSale.order.recipient,
      phone: afterSale.order.phone
    } : undefined,
    items: afterSale.items.map((item) => ({
      id: item.id,
      orderItemId: item.orderItemId,
      bookId: item.bookId,
      title: item.title,
      author: item.author,
      coverUrl: item.coverUrl,
      price: fromCents(item.priceCents),
      quantity: item.quantity,
      specName: item.specName
    }))
  };
}

router.get('/after-sales', asyncHandler(async (req, res) => {
  const { status, type } = req.query;
  const where = {};
  if (status) {
    where.status = String(status);
  }
  if (type) {
    where.type = String(type);
  }

  const afterSales = await prisma.afterSale.findMany({
    where,
    include: {
      items: true,
      user: true,
      order: true
    },
    orderBy: { createdAt: 'desc' }
  });

  res.json(afterSales.map(mapAdminAfterSale));
}));

router.get('/after-sales/:id', asyncHandler(async (req, res) => {
  const afterSale = await prisma.afterSale.findUnique({
    where: { id: req.params.id },
    include: {
      items: true,
      user: true,
      order: { include: { items: true } }
    }
  });

  if (!afterSale) {
    throw new ApiError(404, 'AFTERSALE_NOT_FOUND');
  }

  res.json(mapAdminAfterSale(afterSale));
}));

router.post('/after-sales/:id/approve', asyncHandler(async (req, res) => {
  const afterSale = await prisma.afterSale.findUnique({
    where: { id: req.params.id },
    include: {
      items: true,
      order: { include: { items: true } }
    }
  });

  if (!afterSale) {
    throw new ApiError(404, 'AFTERSALE_NOT_FOUND');
  }

  if (afterSale.status !== 'PENDING') {
    throw new ApiError(400, 'AFTERSALE_NOT_PENDING', { currentStatus: afterSale.status });
  }

  await prisma.$transaction(async (tx) => {
    await tx.afterSale.update({
      where: { id: afterSale.id },
      data: {
        status: 'PROCESSING',
        reviewedBy: req.user.id,
        reviewedAt: new Date()
      }
    });

    for (const item of afterSale.items) {
      const orderItem = afterSale.order.items.find((oi) => oi.id === item.orderItemId);
      if (!orderItem) {
        throw new ApiError(400, 'ORDER_ITEM_NOT_FOUND', { orderItemId: item.orderItemId });
      }

      const newReturnedQty = orderItem.returnedQuantity + item.quantity;
      if (newReturnedQty > orderItem.quantity) {
        throw new ApiError(400, 'EXCEED_RETURNABLE_QUANTITY', {
          orderItemId: item.orderItemId,
          requested: item.quantity,
          available: orderItem.quantity - orderItem.returnedQuantity
        });
      }

      await tx.orderItem.update({
        where: { id: item.orderItemId },
        data: { returnedQuantity: newReturnedQty }
      });

      await tx.book.update({
        where: { id: item.bookId },
        data: {
          stock: { increment: item.quantity },
          sales: { decrement: item.quantity }
        }
      });

      if (orderItem.specId) {
        const spec = await tx.bookSpec.findUnique({ where: { id: orderItem.specId } });
        if (spec) {
          await tx.bookSpec.update({
            where: { id: orderItem.specId },
            data: { stock: { increment: item.quantity } }
          });
        }
      }
    }

    const allOrderItems = afterSale.order.items;
    const allFullyReturned = allOrderItems.every(
      (oi) => {
        const matched = afterSale.items.find((asi) => asi.orderItemId === oi.id);
        const thisReturned = matched ? matched.quantity : 0;
        return (oi.returnedQuantity + thisReturned) >= oi.quantity;
      }
    );

    const newOrderStatus = allFullyReturned ? 'RETURNED' : 'RETURNING';
    if (afterSale.order.status !== 'RETURNING' && afterSale.order.status !== 'RETURNED') {
      await tx.order.update({
        where: { id: afterSale.orderId },
        data: { status: newOrderStatus }
      });
    } else if (allFullyReturned) {
      await tx.order.update({
        where: { id: afterSale.orderId },
        data: { status: 'RETURNED' }
      });
    }
  });

  const updated = await prisma.afterSale.findUnique({
    where: { id: req.params.id },
    include: { items: true, user: true, order: true }
  });

  res.json(mapAdminAfterSale(updated));
}));

router.post('/after-sales/:id/reject', asyncHandler(async (req, res) => {
  const payload = rejectAfterSaleSchema.parse(req.body);

  const afterSale = await prisma.afterSale.findUnique({
    where: { id: req.params.id }
  });

  if (!afterSale) {
    throw new ApiError(404, 'AFTERSALE_NOT_FOUND');
  }

  if (afterSale.status !== 'PENDING') {
    throw new ApiError(400, 'AFTERSALE_NOT_PENDING', { currentStatus: afterSale.status });
  }

  await prisma.afterSale.update({
    where: { id: afterSale.id },
    data: {
      status: 'REJECTED',
      rejectReason: payload.rejectReason,
      reviewedBy: req.user.id,
      reviewedAt: new Date()
    }
  });

  const updated = await prisma.afterSale.findUnique({
    where: { id: req.params.id },
    include: { items: true, user: true, order: true }
  });

  res.json(mapAdminAfterSale(updated));
}));

router.post('/after-sales/:id/complete', asyncHandler(async (req, res) => {
  const afterSale = await prisma.afterSale.findUnique({
    where: { id: req.params.id }
  });

  if (!afterSale) {
    throw new ApiError(404, 'AFTERSALE_NOT_FOUND');
  }

  if (afterSale.status !== 'PROCESSING') {
    throw new ApiError(400, 'AFTERSALE_NOT_PROCESSING', { currentStatus: afterSale.status });
  }

  const refundedPoints = calculateEarnedPoints(afterSale.totalAmountCents);

  await prisma.$transaction(async (tx) => {
    await tx.afterSale.update({
      where: { id: afterSale.id },
      data: {
        status: 'COMPLETED'
      }
    });

    if (afterSale.type === 'RETURN' && refundedPoints > 0) {
      const profile = await tx.memberProfile.findUnique({
        where: { userId: afterSale.userId },
        select: { id: true, totalPoints: true, availablePoints: true, totalSpentCents: true }
      });

      if (profile) {
        const existingRefundLog = await tx.pointLog.findUnique({
          where: { afterSaleId_source: { afterSaleId: afterSale.id, source: 'AFTER_SALE_REFUND' } }
        });

        if (!existingRefundLog) {
          const balanceBefore = profile.totalPoints;
          const balanceAfter = Math.max(0, balanceBefore - refundedPoints);
          const newLevel = calculateLevelByPoints(balanceAfter);
          const availableDeduct = Math.min(profile.availablePoints, refundedPoints);
          const spentDeduct = Math.min(profile.totalSpentCents, afterSale.totalAmountCents);

          await tx.pointLog.create({
            data: {
              userId: afterSale.userId,
              profileId: profile.id,
              source: 'AFTER_SALE_REFUND',
              points: -refundedPoints,
              balanceBefore,
              balanceAfter,
              afterSaleId: afterSale.id,
              orderId: afterSale.orderId,
              remark: `售后退款完成，扣回${refundedPoints}积分`
            }
          });

          await tx.memberProfile.update({
            where: { id: profile.id },
            data: {
              totalPoints: balanceAfter,
              availablePoints: { decrement: availableDeduct },
              totalSpentCents: { decrement: spentDeduct },
              level: newLevel
            }
          });
        }
      }
    }
  });

  const updated = await prisma.afterSale.findUnique({
    where: { id: req.params.id },
    include: { items: true, user: true, order: true }
  });

  res.json({
    ...mapAdminAfterSale(updated),
    refundedPoints
  });
}));

function getMonthRange(year, month) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
}

async function getMonthStats(year, month) {
  const { start, end } = getMonthRange(year, month);

  const validStatuses = ['PAID', 'SHIPPED', 'COMPLETED'];
  const refundStatuses = ['REFUNDED'];

  const validOrders = await prisma.order.aggregate({
    _count: { _all: true },
    _sum: { totalCents: true },
    where: {
      status: { in: validStatuses },
      createdAt: { gte: start, lt: end }
    }
  });

  const refundOrders = await prisma.order.aggregate({
    _count: { _all: true },
    _sum: { totalCents: true },
    where: {
      status: { in: refundStatuses },
      createdAt: { gte: start, lt: end }
    }
  });

  const validCount = validOrders._count._all || 0;
  const validRevenue = validOrders._sum.totalCents || 0;
  const refundCount = refundOrders._count._all || 0;
  const refundRevenue = refundOrders._sum.totalCents || 0;

  const netCount = validCount;
  const netRevenue = validRevenue - refundRevenue;

  return {
    validOrders: validCount,
    validRevenue: fromCents(validRevenue),
    refundOrders: refundCount,
    refundRevenue: fromCents(refundRevenue),
    netOrders: netCount,
    netRevenue: fromCents(netRevenue),
    validRevenueCents: validRevenue,
    refundRevenueCents: refundRevenue,
    netRevenueCents: netRevenue
  };
}

function calculateForecast(year, month, netRevenueCents, netOrders) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (currentYear !== year || currentMonth !== month) {
    return { forecastRevenue: null, forecastOrders: null, daysPassed: null, daysTotal: null, progress: null };
  }

  const { start, end } = getMonthRange(year, month);
  const totalMs = end - start;
  const passedMs = now - start;

  const daysTotal = Math.ceil(totalMs / (1000 * 60 * 60 * 24));
  const daysPassed = Math.min(daysTotal, Math.max(0, Math.floor(passedMs / (1000 * 60 * 60 * 24))) + 1);
  const progress = daysTotal > 0 ? (daysPassed / daysTotal) : 0;

  if (progress <= 0) {
    return { forecastRevenue: 0, forecastOrders: 0, daysPassed, daysTotal, progress: 0 };
  }

  const forecastRevenueCents = Math.round(netRevenueCents / progress);
  const forecastOrders = Math.round(netOrders / progress);

  return {
    forecastRevenue: fromCents(forecastRevenueCents),
    forecastOrders,
    daysPassed,
    daysTotal,
    progress: Math.min(1, progress)
  };
}

function mapSalesGoal(goal) {
  return {
    id: goal.id,
    year: goal.year,
    month: goal.month,
    revenueGoal: fromCents(goal.revenueGoalCents),
    revenueGoalCents: goal.revenueGoalCents,
    orderGoal: goal.orderGoal,
    createdBy: goal.createdBy,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt
  };
}

router.get('/goals', asyncHandler(async (req, res) => {
  const { year, month } = req.query;
  const where = {};
  if (year) where.year = Number(year);
  if (month) where.month = Number(month);

  const goals = await prisma.salesGoal.findMany({
    where,
    orderBy: [{ year: 'desc' }, { month: 'desc' }]
  });

  const goalsWithStats = [];
  for (const goal of goals) {
    const stats = await getMonthStats(goal.year, goal.month);
    const forecast = calculateForecast(goal.year, goal.month, stats.netRevenueCents, stats.netOrders);
    const revenuePercent = goal.revenueGoalCents > 0 ? (stats.netRevenueCents / goal.revenueGoalCents) * 100 : 0;
    const orderPercent = goal.orderGoal > 0 ? (stats.netOrders / goal.orderGoal) * 100 : 0;

    goalsWithStats.push({
      ...mapSalesGoal(goal),
      ...stats,
      ...forecast,
      revenuePercent: Math.min(999, revenuePercent),
      orderPercent: Math.min(999, orderPercent),
      revenueAchieved: stats.netRevenueCents >= goal.revenueGoalCents,
      orderAchieved: stats.netOrders >= goal.orderGoal
    });
  }

  res.json(goalsWithStats);
}));

router.get('/goals/:year/:month', asyncHandler(async (req, res) => {
  const year = Number(req.params.year);
  const month = Number(req.params.month);

  const goal = await prisma.salesGoal.findUnique({
    where: { year_month: { year, month } }
  });

  const stats = await getMonthStats(year, month);

  if (!goal) {
    res.json({
      goal: null,
      ...stats,
      forecast: calculateForecast(year, month, stats.netRevenueCents, stats.netOrders),
      hasGoal: false
    });
    return;
  }

  const forecast = calculateForecast(year, month, stats.netRevenueCents, stats.netOrders);
  const revenuePercent = goal.revenueGoalCents > 0 ? (stats.netRevenueCents / goal.revenueGoalCents) * 100 : 0;
  const orderPercent = goal.orderGoal > 0 ? (stats.netOrders / goal.orderGoal) * 100 : 0;

  res.json({
    goal: mapSalesGoal(goal),
    ...stats,
    forecast,
    revenuePercent: Math.min(999, revenuePercent),
    orderPercent: Math.min(999, orderPercent),
    revenueAchieved: stats.netRevenueCents >= goal.revenueGoalCents,
    orderAchieved: stats.netOrders >= goal.orderGoal,
    hasGoal: true
  });
}));

router.post('/goals', asyncHandler(async (req, res) => {
  const payload = createSalesGoalSchema.parse(req.body);

  const existing = await prisma.salesGoal.findUnique({
    where: { year_month: { year: payload.year, month: payload.month } }
  });

  if (existing) {
    throw new ApiError(409, 'GOAL_ALREADY_EXISTS');
  }

  const goal = await prisma.salesGoal.create({
    data: {
      year: payload.year,
      month: payload.month,
      revenueGoalCents: toCents(payload.revenueGoal),
      orderGoal: payload.orderGoal,
      createdBy: req.user?.id
    }
  });

  res.status(201).json(mapSalesGoal(goal));
}));

router.put('/goals/:year/:month', asyncHandler(async (req, res) => {
  const year = Number(req.params.year);
  const month = Number(req.params.month);
  const payload = updateSalesGoalSchema.parse(req.body);

  const existing = await prisma.salesGoal.findUnique({
    where: { year_month: { year, month } }
  });

  if (!existing) {
    throw new ApiError(404, 'GOAL_NOT_FOUND');
  }

  const data = {};
  if (payload.revenueGoal !== undefined) {
    data.revenueGoalCents = toCents(payload.revenueGoal);
  }
  if (payload.orderGoal !== undefined) {
    data.orderGoal = payload.orderGoal;
  }

  const goal = await prisma.salesGoal.update({
    where: { year_month: { year, month } },
    data
  });

  res.json(mapSalesGoal(goal));
}));

router.delete('/goals/:year/:month', asyncHandler(async (req, res) => {
  const year = Number(req.params.year);
  const month = Number(req.params.month);

  const existing = await prisma.salesGoal.findUnique({
    where: { year_month: { year, month } }
  });

  if (!existing) {
    throw new ApiError(404, 'GOAL_NOT_FOUND');
  }

  await prisma.salesGoal.delete({
    where: { year_month: { year, month } }
  });

  res.json({ message: 'goal deleted' });
}));

router.get('/goals/stats/overview', asyncHandler(async (req, res) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const goal = await prisma.salesGoal.findUnique({
    where: { year_month: { year, month } }
  });

  const stats = await getMonthStats(year, month);
  const forecast = calculateForecast(year, month, stats.netRevenueCents, stats.netOrders);

  const historyGoals = await prisma.salesGoal.findMany({
    where: {
      OR: [
        { year: { lt: year } },
        { year, month: { lt: month } }
      ]
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    take: 12
  });

  const history = [];
  for (const g of historyGoals) {
    const hStats = await getMonthStats(g.year, g.month);
    const revenuePercent = g.revenueGoalCents > 0 ? (hStats.netRevenueCents / g.revenueGoalCents) * 100 : 0;
    const orderPercent = g.orderGoal > 0 ? (hStats.netOrders / g.orderGoal) * 100 : 0;
    history.push({
      ...mapSalesGoal(g),
      netRevenue: hStats.netRevenue,
      netOrders: hStats.netOrders,
      revenuePercent: Math.min(999, revenuePercent),
      orderPercent: Math.min(999, orderPercent),
      revenueAchieved: hStats.netRevenueCents >= g.revenueGoalCents,
      orderAchieved: hStats.netOrders >= g.orderGoal
    });
  }

  res.json({
    current: goal ? {
      goal: mapSalesGoal(goal),
      ...stats,
      forecast,
      revenuePercent: goal.revenueGoalCents > 0 ? (stats.netRevenueCents / goal.revenueGoalCents) * 100 : 0,
      orderPercent: goal.orderGoal > 0 ? (stats.netOrders / goal.orderGoal) * 100 : 0,
      hasGoal: true
    } : {
      goal: null,
      ...stats,
      forecast,
      hasGoal: false,
      year,
      month
    },
    history
  });
}));

module.exports = router;
