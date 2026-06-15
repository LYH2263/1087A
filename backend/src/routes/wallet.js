const express = require('express');
const prisma = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../errors');
const { fromCents } = require('../utils/money');
const {
  getOrCreateWallet,
  rechargeWallet,
} = require('../utils/wallet');

const router = express.Router();

function mapTransaction(tx) {
  const typeMap = {
    RECHARGE: '充值',
    CONSUME: '消费',
    REFUND: '退款',
    ADJUST: '调整'
  };

  const sourceMap = {
    RECHARGE: '模拟充值',
    ORDER_PAY: '订单支付',
    ORDER_CANCEL: '订单取消退款',
    ORDER_REFUND: '订单退款',
    AFTER_SALE_REFUND: '售后退款',
    ADMIN_ADJUST: '管理员调整'
  };

  return {
    id: tx.id,
    type: tx.type,
    typeText: typeMap[tx.type] || tx.type,
    source: tx.source,
    sourceText: sourceMap[tx.source] || tx.source,
    amount: fromCents(tx.amountCents),
    amountCents: tx.amountCents,
    balanceBefore: fromCents(tx.balanceBefore),
    balanceBeforeCents: tx.balanceBefore,
    balanceAfter: fromCents(tx.balanceAfter),
    balanceAfterCents: tx.balanceAfter,
    orderId: tx.orderId,
    afterSaleId: tx.afterSaleId,
    remark: tx.remark,
    createdAt: tx.createdAt
  };
}

router.get('/balance', asyncHandler(async (req, res) => {
  const wallet = await getOrCreateWallet(req.user.id);

  res.json({
    balance: fromCents(wallet.balanceCents),
    balanceCents: wallet.balanceCents,
    updatedAt: wallet.updatedAt
  });
}));

router.post('/recharge', asyncHandler(async (req, res) => {
  const { amount } = req.body;

  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    throw new ApiError(400, 'INVALID_AMOUNT', { message: '请输入有效的充值金额' });
  }

  const amountCents = Math.round(Number(amount) * 100);

  const rechargeId = `recharge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const result = await rechargeWallet({
    userId: req.user.id,
    amountCents,
    rechargeId,
    remark: '模拟充值'
  });

  res.status(201).json({
    balance: fromCents(result.wallet.balanceCents),
    balanceCents: result.wallet.balanceCents,
    transaction: mapTransaction(result.transaction),
    isDuplicate: result.isDuplicate
  });
}));

router.get('/transactions', asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 20, type, source } = req.query;
  const skip = (Number(page) - 1) * Number(pageSize);
  const take = Number(pageSize);

  const where = { userId: req.user.id };
  if (type) {
    where.type = String(type);
  }
  if (source) {
    where.source = String(source);
  }

  const [transactions, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.walletTransaction.count({ where })
  ]);

  const incomeSum = await prisma.walletTransaction.aggregate({
    where: {
      userId: req.user.id,
      type: { in: ['RECHARGE', 'REFUND', 'ADJUST'] }
    },
    _sum: { amountCents: true }
  });

  const expenseSum = await prisma.walletTransaction.aggregate({
    where: {
      userId: req.user.id,
      type: 'CONSUME'
    },
    _sum: { amountCents: true }
  });

  const wallet = await getOrCreateWallet(req.user.id);

  res.json({
    total,
    page: Number(page),
    pageSize: Number(pageSize),
    balance: fromCents(wallet.balanceCents),
    balanceCents: wallet.balanceCents,
    totalIncome: fromCents(incomeSum._sum.amountCents || 0),
    totalIncomeCents: incomeSum._sum.amountCents || 0,
    totalExpense: fromCents(expenseSum._sum.amountCents || 0),
    totalExpenseCents: expenseSum._sum.amountCents || 0,
    transactions: transactions.map(mapTransaction)
  });
}));

module.exports = router;
