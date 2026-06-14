const express = require('express');
const prisma = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { toCents, fromCents } = require('../utils/money');
const { ApiError } = require('../errors');

const router = express.Router();

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

router.get('/', asyncHandler(async (req, res) => {
  const {
    title,
    author,
    isbn,
    categoryId,
    minPrice,
    maxPrice,
    sort
  } = req.query;

  const where = {
    status: 'ACTIVE'
  };

  if (title) {
    where.title = { contains: String(title), mode: 'insensitive' };
  }

  if (author) {
    where.author = { contains: String(author), mode: 'insensitive' };
  }

  if (isbn) {
    where.isbn = String(isbn);
  }

  if (categoryId) {
    where.categoryId = String(categoryId);
  }

  const min = toCents(minPrice);
  const max = toCents(maxPrice);

  if (min !== null || max !== null) {
    where.priceCents = {};
    if (min !== null) {
      where.priceCents.gte = min;
    }
    if (max !== null) {
      where.priceCents.lte = max;
    }
  }

  let orderBy = { createdAt: 'desc' };
  if (sort === 'price_asc') {
    orderBy = { priceCents: 'asc' };
  }
  if (sort === 'price_desc') {
    orderBy = { priceCents: 'desc' };
  }
  if (sort === 'sales_desc') {
    orderBy = { sales: 'desc' };
  }

  const books = await prisma.book.findMany({
    where,
    include: { category: true },
    orderBy
  });

  res.json(books.map(mapBook));
}));

router.get('/categories', asyncHandler(async (req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' }
  });
  res.json(categories);
}));

router.get('/:id([a-z0-9]{25})', asyncHandler(async (req, res) => {
  const book = await prisma.book.findUnique({
    where: { id: req.params.id },
    include: { category: true }
  });

  if (!book || book.status !== 'ACTIVE') {
    throw new ApiError(404, 'BOOK_NOT_FOUND');
  }

  res.json(mapBook(book));
}));

module.exports = router;
