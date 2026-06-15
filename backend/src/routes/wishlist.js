const express = require('express');
const prisma = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { wishlistAddSchema } = require('../validators');
const { ApiError } = require('../errors');
const { fromCents } = require('../utils/money');

const router = express.Router();

function mapWishlistItem(item) {
  const currentPrice = item.book.priceCents;
  const savedPrice = item.priceCents;
  const isPriceDropped = currentPrice < savedPrice;
  const dropAmount = savedPrice - currentPrice;
  const dropPercent = savedPrice > 0 ? Math.round((dropAmount / savedPrice) * 100) : 0;

  return {
    id: item.id,
    bookId: item.bookId,
    savedPrice: fromCents(savedPrice),
    savedPriceCents: savedPrice,
    isPriceDropped,
    dropAmount: fromCents(dropAmount),
    dropAmountCents: dropAmount,
    dropPercent,
    book: {
      id: item.book.id,
      title: item.book.title,
      author: item.book.author,
      coverUrl: item.book.coverUrl,
      price: fromCents(item.book.priceCents),
      priceCents: item.book.priceCents,
      stock: item.book.stock,
      status: item.book.status
    }
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const items = await prisma.wishlistItem.findMany({
    where: { userId: req.user.id },
    include: { book: true },
    orderBy: { createdAt: 'desc' }
  });

  res.json(items.map(mapWishlistItem));
}));

router.post('/', asyncHandler(async (req, res) => {
  const payload = wishlistAddSchema.parse(req.body);

  const book = await prisma.book.findUnique({
    where: { id: payload.bookId }
  });

  if (!book) {
    throw new ApiError(404, 'BOOK_NOT_FOUND');
  }

  const existingItem = await prisma.wishlistItem.findUnique({
    where: {
      userId_bookId: {
        userId: req.user.id,
        bookId: payload.bookId
      }
    },
    include: { book: true }
  });

  if (existingItem) {
    res.json(mapWishlistItem(existingItem));
    return;
  }

  const item = await prisma.wishlistItem.create({
    data: {
      userId: req.user.id,
      bookId: payload.bookId,
      priceCents: book.priceCents
    },
    include: { book: true }
  });

  res.status(201).json(mapWishlistItem(item));
}));

router.delete('/:itemId', asyncHandler(async (req, res) => {
  const item = await prisma.wishlistItem.findUnique({
    where: { id: req.params.itemId }
  });

  if (!item || item.userId !== req.user.id) {
    throw new ApiError(404, 'WISHLIST_ITEM_NOT_FOUND');
  }

  await prisma.wishlistItem.delete({ where: { id: item.id } });
  res.json({ message: 'item removed' });
}));

router.delete('/book/:bookId', asyncHandler(async (req, res) => {
  const item = await prisma.wishlistItem.findUnique({
    where: {
      userId_bookId: {
        userId: req.user.id,
        bookId: req.params.bookId
      }
    }
  });

  if (!item) {
    throw new ApiError(404, 'WISHLIST_ITEM_NOT_FOUND');
  }

  await prisma.wishlistItem.delete({ where: { id: item.id } });
  res.json({ message: 'item removed' });
}));

router.post('/:itemId/add-to-cart', asyncHandler(async (req, res) => {
  const item = await prisma.wishlistItem.findUnique({
    where: { id: req.params.itemId },
    include: { book: { include: { specs: { orderBy: { createdAt: 'asc' } } } } }
  });

  if (!item || item.userId !== req.user.id) {
    throw new ApiError(404, 'WISHLIST_ITEM_NOT_FOUND');
  }

  if (item.book.status !== 'ACTIVE') {
    throw new ApiError(400, 'BOOK_NOT_ACTIVE');
  }

  const hasSpecs = (item.book.specs || []).length > 0;
  const firstSpec = hasSpecs ? item.book.specs[0] : null;
  const effectiveStock = firstSpec ? firstSpec.stock : item.book.stock;

  if (effectiveStock < 1) {
    throw new ApiError(400, 'INSUFFICIENT_STOCK');
  }

  const specId = firstSpec ? firstSpec.id : '';

  const existingCartItem = await prisma.cartItem.findUnique({
    where: {
      userId_bookId_specId: {
        userId: req.user.id,
        bookId: item.bookId,
        specId
      }
    }
  });

  if (existingCartItem) {
    await prisma.cartItem.update({
      where: { id: existingCartItem.id },
      data: {
        quantity: {
          increment: 1
        }
      }
    });
  } else {
    await prisma.cartItem.create({
      data: {
        userId: req.user.id,
        bookId: item.bookId,
        specId,
        quantity: 1
      }
    });
  }

  res.json({ message: 'added to cart' });
}));

router.get('/check/:bookId', asyncHandler(async (req, res) => {
  const item = await prisma.wishlistItem.findUnique({
    where: {
      userId_bookId: {
        userId: req.user.id,
        bookId: req.params.bookId
      }
    }
  });

  res.json({ isFavorited: !!item });
}));

router.delete('/', asyncHandler(async (req, res) => {
  await prisma.wishlistItem.deleteMany({
    where: { userId: req.user.id }
  });
  res.json({ message: 'wishlist cleared' });
}));

module.exports = router;
