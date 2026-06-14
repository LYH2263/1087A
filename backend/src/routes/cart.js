const express = require('express');
const prisma = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { cartAddSchema, cartUpdateSchema } = require('../validators');
const { ApiError } = require('../errors');
const { fromCents } = require('../utils/money');

const router = express.Router();

function mapCartItem(item) {
  return {
    id: item.id,
    quantity: item.quantity,
    book: {
      id: item.book.id,
      title: item.book.title,
      author: item.book.author,
      coverUrl: item.book.coverUrl,
      price: fromCents(item.book.priceCents),
      stock: item.book.stock,
      status: item.book.status
    }
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const items = await prisma.cartItem.findMany({
    where: { userId: req.user.id },
    include: { book: true },
    orderBy: { createdAt: 'desc' }
  });

  res.json(items.map(mapCartItem));
}));

router.post('/', asyncHandler(async (req, res) => {
  const payload = cartAddSchema.parse(req.body);

  const book = await prisma.book.findUnique({
    where: { id: payload.bookId }
  });

  if (!book || book.status !== 'ACTIVE') {
    throw new ApiError(404, 'BOOK_NOT_FOUND');
  }

  const existingItem = await prisma.cartItem.findUnique({
    where: {
      userId_bookId: {
        userId: req.user.id,
        bookId: payload.bookId
      }
    }
  });

  const nextQuantity = (existingItem?.quantity || 0) + payload.quantity;

  if (book.stock < nextQuantity) {
    throw new ApiError(400, 'INSUFFICIENT_STOCK');
  }

  const item = await prisma.cartItem.upsert({
    where: {
      userId_bookId: {
        userId: req.user.id,
        bookId: payload.bookId
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
      quantity: payload.quantity
    },
    include: { book: true }
  });

  res.status(201).json(mapCartItem(item));
}));

router.patch('/:itemId', asyncHandler(async (req, res) => {
  const payload = cartUpdateSchema.parse(req.body);

  const item = await prisma.cartItem.findUnique({
    where: { id: req.params.itemId },
    include: { book: true }
  });

  if (!item || item.userId !== req.user.id) {
    throw new ApiError(404, 'CART_ITEM_NOT_FOUND');
  }

  if (item.book.stock < payload.quantity) {
    throw new ApiError(400, 'INSUFFICIENT_STOCK');
  }

  const updated = await prisma.cartItem.update({
    where: { id: item.id },
    data: { quantity: payload.quantity },
    include: { book: true }
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
