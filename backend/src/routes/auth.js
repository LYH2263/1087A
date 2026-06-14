const express = require('express');
const prisma = require('../db');
const { ApiError } = require('../errors');
const asyncHandler = require('../utils/asyncHandler');
const { hashPassword, verifyPassword } = require('../utils/password');
const { createAccessToken, createRefreshToken, hashToken } = require('../utils/tokens');
const config = require('../config');
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema
} = require('../validators');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function setRefreshCookie(res, token, remember) {
  const maxAgeDays = remember ? config.refreshTokenExpiresDays : 1;
  res.cookie('refresh_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: maxAgeDays * 24 * 60 * 60 * 1000
  });
}

router.post('/register', asyncHandler(async (req, res) => {
  const payload = registerSchema.parse(req.body);

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { username: payload.username },
        { email: payload.email },
        { phone: payload.phone }
      ]
    }
  });

  if (existing) {
    if (existing.username === payload.username) {
      throw new ApiError(409, 'USERNAME_EXISTS');
    }
    if (existing.email === payload.email) {
      throw new ApiError(409, 'EMAIL_EXISTS');
    }
    if (existing.phone === payload.phone) {
      throw new ApiError(409, 'PHONE_EXISTS');
    }
    throw new ApiError(409, 'ACCOUNT_EXISTS');
  }

  const passwordHash = await hashPassword(payload.password);

  const user = await prisma.user.create({
    data: {
      username: payload.username,
      email: payload.email,
      phone: payload.phone,
      passwordHash,
      role: 'USER'
    }
  });

  res.status(201).json({
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone,
    role: user.role
  });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const payload = loginSchema.parse(req.body);

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: payload.account },
        { email: payload.account },
        { phone: payload.account }
      ]
    }
  });

  if (!user) {
    throw new ApiError(401, 'INVALID_CREDENTIALS');
  }

  const valid = await verifyPassword(payload.password, user.passwordHash);
  if (!valid) {
    throw new ApiError(401, 'INVALID_CREDENTIALS');
  }

  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken();
  const expiresAt = new Date(Date.now() + (payload.remember ? config.refreshTokenExpiresDays : 1) * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt
    }
  });

  setRefreshCookie(res, refreshToken, payload.remember);

  res.json({
    accessToken,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      role: user.role
    }
  });
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const token = req.cookies.refresh_token;
  if (!token) {
    throw new ApiError(401, 'NO_REFRESH_TOKEN');
  }

  const tokenHash = hashToken(token);
  const session = await prisma.session.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() }
    },
    include: { user: true }
  });

  if (!session) {
    throw new ApiError(401, 'INVALID_REFRESH_TOKEN');
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date() }
  });

  const newRefreshToken = createRefreshToken();
  const rememberDays = config.refreshTokenExpiresDays;
  const expiresAt = new Date(Date.now() + rememberDays * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId: session.userId,
      tokenHash: hashToken(newRefreshToken),
      expiresAt
    }
  });

  setRefreshCookie(res, newRefreshToken, true);

  const accessToken = createAccessToken(session.user);

  res.json({
    accessToken,
    user: {
      id: session.user.id,
      username: session.user.username,
      email: session.user.email,
      phone: session.user.phone,
      role: session.user.role
    }
  });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const token = req.cookies.refresh_token;
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  res.clearCookie('refresh_token');
  res.json({ message: 'logged out' });
}));

router.post('/forgot-password', asyncHandler(async (req, res) => {
  const payload = forgotPasswordSchema.parse(req.body);

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: payload.account },
        { email: payload.account },
        { phone: payload.account }
      ]
    }
  });

  if (!user) {
    throw new ApiError(404, 'ACCOUNT_NOT_FOUND');
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));

  const destination = payload.method === 'email' ? user.email : user.phone;
  const channel = payload.method === 'email' ? '邮件' : '短信';
  console.log(`[模拟${channel}] 向 ${destination} 发送验证码: ${code}`);

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(code),
      expiresAt
    }
  });

  res.json({
    message: `验证码已通过${channel}发送`,
    code
  });
}));

router.post('/reset-password', asyncHandler(async (req, res) => {
  const payload = resetPasswordSchema.parse(req.body);

  const reset = await prisma.passwordReset.findFirst({
    where: {
      tokenHash: hashToken(payload.token),
      usedAt: null,
      expiresAt: { gt: new Date() }
    },
    include: { user: true }
  });

  if (!reset) {
    throw new ApiError(400, 'RESET_TOKEN_INVALID');
  }

  const passwordHash = await hashPassword(payload.newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: reset.userId },
      data: { passwordHash }
    }),
    prisma.passwordReset.update({
      where: { id: reset.id },
      data: { usedAt: new Date() }
    })
  ]);

  res.json({ message: 'password updated' });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id }
  });

  if (!user) {
    throw new ApiError(404, 'USER_NOT_FOUND');
  }

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone,
    role: user.role
  });
}));

module.exports = router;
