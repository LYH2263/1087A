const express = require('express');
const prisma = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { addressSchema } = require('../validators');
const { ApiError } = require('../errors');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const addresses = await prisma.address.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' }
  });
  res.json(addresses);
}));

router.post('/', asyncHandler(async (req, res) => {
  const payload = addressSchema.parse(req.body);

  if (payload.isDefault) {
    await prisma.address.updateMany({
      where: { userId: req.user.id },
      data: { isDefault: false }
    });
  }

  const address = await prisma.address.create({
    data: {
      userId: req.user.id,
      recipient: payload.recipient,
      phone: payload.phone,
      line1: payload.line1,
      city: payload.city,
      state: payload.state,
      postalCode: payload.postalCode,
      isDefault: payload.isDefault || false
    }
  });

  res.status(201).json(address);
}));

router.post('/:id/default', asyncHandler(async (req, res) => {
  const address = await prisma.address.findUnique({
    where: { id: req.params.id }
  });

  if (!address || address.userId !== req.user.id) {
    throw new ApiError(404, 'ADDRESS_NOT_FOUND');
  }

  await prisma.$transaction([
    prisma.address.updateMany({
      where: { userId: req.user.id },
      data: { isDefault: false }
    }),
    prisma.address.update({
      where: { id: address.id },
      data: { isDefault: true }
    })
  ]);

  res.json({ message: 'address updated' });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const payload = addressSchema.parse(req.body);

  const address = await prisma.address.findUnique({
    where: { id: req.params.id }
  });

  if (!address || address.userId !== req.user.id) {
    throw new ApiError(404, 'ADDRESS_NOT_FOUND');
  }

  const data = {
    recipient: payload.recipient,
    phone: payload.phone,
    line1: payload.line1,
    city: payload.city,
    state: payload.state,
    postalCode: payload.postalCode,
    isDefault: Boolean(payload.isDefault)
  };

  let updated;
  if (payload.isDefault) {
    updated = await prisma.$transaction(async (tx) => {
      await tx.address.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false }
      });

      return tx.address.update({
        where: { id: address.id },
        data
      });
    });
  } else {
    updated = await prisma.address.update({
      where: { id: address.id },
      data
    });
  }

  res.json(updated);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const address = await prisma.address.findUnique({
    where: { id: req.params.id }
  });

  if (!address || address.userId !== req.user.id) {
    throw new ApiError(404, 'ADDRESS_NOT_FOUND');
  }

  await prisma.address.delete({ where: { id: address.id } });
  res.json({ message: 'address deleted' });
}));

module.exports = router;
