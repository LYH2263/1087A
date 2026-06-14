const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const prisma = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../errors');
const { bookSchema, bookUpdateSchema, categorySchema, createCouponSchema, updateCouponSchema, stockThresholdSchema, singleRestockSchema, batchRestockSchema, rejectAfterSaleSchema, bookSpecSchema, bookSpecUpdateSchema } = require('../validators');
const { toCents, fromCents } = require('../utils/money');
const { generateCouponCode } = require('../utils/coupon');
const { createOrderNotification } = require('../utils/notification');

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

  if (!order || !['PAID', 'SHIPPED'].includes(order.status)) {
    throw new ApiError(400, 'ORDER_NOT_REFUNDABLE');
  }

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

    return await tx.order.findUnique({
      where: { id: order.id }
    });
  });

  await createOrderNotification(order.userId, 'ORDER_REFUNDED', updated);

  res.json({ message: 'order refunded' });
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

  await prisma.afterSale.update({
    where: { id: afterSale.id },
    data: {
      status: 'COMPLETED'
    }
  });

  const updated = await prisma.afterSale.findUnique({
    where: { id: req.params.id },
    include: { items: true, user: true, order: true }
  });

  res.json(mapAdminAfterSale(updated));
}));

module.exports = router;
