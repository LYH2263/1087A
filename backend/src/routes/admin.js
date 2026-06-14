const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const prisma = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../errors');
const { bookSchema, bookUpdateSchema, categorySchema, createCouponSchema, updateCouponSchema } = require('../validators');
const { toCents, fromCents } = require('../utils/money');
const { generateCouponCode } = require('../utils/coupon');

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
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    isbn: book.isbn,
    description: book.description,
    price: fromCents(book.priceCents),
    stock: book.stock,
    coverUrl: book.coverUrl,
    sales: book.sales,
    status: book.status,
    category: book.category
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
    include: { category: true },
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
    include: { category: true }
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
    include: { category: true }
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
    data: { status: 'ACTIVE' }
  });

  res.json({ message: 'book activated', id: book.id });
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
      quantity: item.quantity
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

  res.json({ message: 'order accepted' });
}));

router.post('/orders/:id/ship', asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id }
  });

  if (!order || order.status !== 'PAID') {
    throw new ApiError(400, 'ORDER_NOT_PAID');
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'SHIPPED' }
  });

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

  await prisma.$transaction(async (tx) => {
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
    }
  });

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

module.exports = router;
