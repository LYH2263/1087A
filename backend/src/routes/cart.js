const express = require('express');
const prisma = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { cartAddSchema, cartUpdateSchema } = require('../validators');
const { ApiError } = require('../errors');
const { fromCents } = require('../utils/money');

const router = express.Router();

function getSpecForCartItem(book, specId) {
  if (!specId || specId === '') return null;
  const spec = (book.specs || []).find((s) => s.id === specId);
  if (!spec) throw new ApiError(400, 'SPEC_NOT_FOUND');
  return spec;
}

function getEffectivePrice(book, spec) {
  return spec ? spec.priceCents : book.priceCents;
}

function getEffectiveStock(book, spec) {
  return spec ? spec.stock : book.stock;
}

function getEffectiveCover(book, spec) {
  if (spec && spec.coverUrl) return spec.coverUrl;
  return book.coverUrl;
}

function mapCartItem(item) {
  const book = item.book;
  const spec = item.specId && item.specId !== '' && book.specs
    ? book.specs.find((s) => s.id === item.specId)
    : null;
  const effectivePrice = getEffectivePrice(book, spec);
  const effectiveStock = getEffectiveStock(book, spec);
  const effectiveCover = getEffectiveCover(book, spec);
  return {
    id: item.id,
    quantity: item.quantity,
    specId: item.specId || '',
    specName: spec ? spec.name : null,
    book: {
      id: book.id,
      title: book.title,
      author: book.author,
      coverUrl: effectiveCover,
      price: fromCents(effectivePrice),
      stock: effectiveStock,
      status: book.status,
      hasSpecs: (book.specs || []).length > 0,
      specs: (book.specs || []).map((s) => ({
        id: s.id,
        name: s.name,
        price: fromCents(s.priceCents),
        stock: s.stock,
        coverUrl: s.coverUrl
      }))
    }
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const items = await prisma.cartItem.findMany({
    where: { userId: req.user.id },
    include: { book: { include: { specs: { orderBy: { createdAt: 'asc' } } } } },
    orderBy: { createdAt: 'desc' }
  });

  res.json(items.map(mapCartItem));
}));

router.post('/', asyncHandler(async (req, res) => {
  const payload = cartAddSchema.parse(req.body);

  const book = await prisma.book.findUnique({
    where: { id: payload.bookId },
    include: { specs: { orderBy: { createdAt: 'asc' } } }
  });

  if (!book || book.status !== 'ACTIVE') {
    throw new ApiError(404, 'BOOK_NOT_FOUND');
  }

  const specId = payload.specId || '';
  const spec = getSpecForCartItem(book, specId);

  if (book.specs.length > 0 && !spec) {
    throw new ApiError(400, 'SPEC_REQUIRED');
  }

  const effectiveStock = getEffectiveStock(book, spec);

  const existingItem = await prisma.cartItem.findUnique({
    where: {
      userId_bookId_specId: {
        userId: req.user.id,
        bookId: payload.bookId,
        specId
      }
    }
  });

  const nextQuantity = (existingItem?.quantity || 0) + payload.quantity;

  if (effectiveStock < nextQuantity) {
    throw new ApiError(400, 'INSUFFICIENT_STOCK');
  }

  const item = await prisma.cartItem.upsert({
    where: {
      userId_bookId_specId: {
        userId: req.user.id,
        bookId: payload.bookId,
        specId
      }
    },
    update: {
      quantity: {
        increment: payload.quantity
      }
    },
    create: {
      userId: req.user.id,
      bookId: payload.bookId,
      specId,
      quantity: payload.quantity
    },
    include: { book: { include: { specs: { orderBy: { createdAt: 'asc' } } } } }
  });

  res.status(201).json(mapCartItem(item));
}));

router.patch('/:itemId', asyncHandler(async (req, res) => {
  const payload = cartUpdateSchema.parse(req.body);

  const item = await prisma.cartItem.findUnique({
    where: { id: req.params.itemId },
    include: { book: { include: { specs: { orderBy: { createdAt: 'asc' } } } } }
  });

  if (!item || item.userId !== req.user.id) {
    throw new ApiError(404, 'CART_ITEM_NOT_FOUND');
  }

  const spec = item.specId && item.specId !== ''
    ? item.book.specs.find((s) => s.id === item.specId)
    : null;
  const effectiveStock = getEffectiveStock(item.book, spec);

  if (effectiveStock < payload.quantity) {
    throw new ApiError(400, 'INSUFFICIENT_STOCK');
  }

  const updated = await prisma.cartItem.update({
    where: { id: item.id },
    data: { quantity: payload.quantity },
    include: { book: { include: { specs: { orderBy: { createdAt: 'asc' } } } } }
  });

  res.json(mapCartItem(updated));
}));

router.delete('/:itemId', asyncHandler(async (req, res) => {
  const item = await prisma.cartItem.findUnique({
    where: { id: req.params.itemId }
  });

  if (!item || item.userId !== req.user.id) {
    throw new ApiError(404, 'CART_ITEM_NOT_FOUND');
  }

  await prisma.cartItem.delete({ where: { id: item.id } });
  res.json({ message: 'item removed' });
}));

router.delete('/', asyncHandler(async (req, res) => {
  await prisma.cartItem.deleteMany({
    where: { userId: req.user.id }
  });
  res.json({ message: 'cart cleared' });
}));

module.exports = router;
