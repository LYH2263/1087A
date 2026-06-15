const prisma = require('../db');
const { ApiError } = require('../errors');

async function getOrCreateWallet(userId, tx = prisma) {
  let wallet = await tx.wallet.findUnique({
    where: { userId }
  });

  if (!wallet) {
    wallet = await tx.wallet.create({
      data: { userId }
    });
  }

  return wallet;
}

async function rechargeWallet({
  userId,
  amountCents,
  rechargeId,
  remark = '模拟充值',
  tx: externalTx
}) {
  if (amountCents <= 0) {
    throw new ApiError(400, 'INVALID_AMOUNT', { message: '充值金额必须大于0' });
  }

  const executor = async (tx) => {
    const wallet = await getOrCreateWallet(userId, tx);

    const existingTx = await tx.walletTransaction.findUnique({
      where: { rechargeId_source: { rechargeId, source: 'RECHARGE' } }
    });

    if (existingTx) {
      return {
        wallet,
        transaction: existingTx,
        isDuplicate: true
      };
    }

    const balanceBefore = wallet.balanceCents;
    const balanceAfter = balanceBefore + amountCents;

    const updatedWallet = await tx.wallet.update({
      where: {
        id: wallet.id,
        version: wallet.version
      },
      data: {
        balanceCents: balanceAfter,
        version: { increment: 1 }
      }
    });

    if (!updatedWallet) {
      throw new ApiError(409, 'WALLET_CONCURRENT_UPDATE', { message: '钱包更新冲突，请重试' });
    }

    const transaction = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        userId,
        type: 'RECHARGE',
        source: 'RECHARGE',
        amountCents,
        balanceBefore,
        balanceAfter,
        rechargeId,
        remark
      }
    });

    return {
      wallet: updatedWallet,
      transaction,
      isDuplicate: false
    };
  };

  if (externalTx) {
    return executor(externalTx);
  }
  return prisma.$transaction(executor);
}

async function deductBalance({
  userId,
  amountCents,
  source,
  orderId,
  afterSaleId,
  remark,
  operatorId,
  tx: externalTx
}) {
  if (amountCents <= 0) {
    throw new ApiError(400, 'INVALID_AMOUNT', { message: '扣减金额必须大于0' });
  }

  if (!orderId && !afterSaleId) {
    throw new ApiError(400, 'MISSING_REFERENCE', { message: '缺少业务关联ID' });
  }

  const uniqueKey = orderId
    ? { orderId_source: { orderId, source } }
    : { afterSaleId_source: { afterSaleId, source } };

  const executor = async (tx) => {
    const wallet = await getOrCreateWallet(userId, tx);

    const existingTx = await tx.walletTransaction.findUnique({
      where: uniqueKey
    });

    if (existingTx) {
      return {
        wallet,
        transaction: existingTx,
        isDuplicate: true
      };
    }

    if (wallet.balanceCents < amountCents) {
      throw new ApiError(400, 'INSUFFICIENT_BALANCE', {
        message: '余额不足',
        balance: wallet.balanceCents,
        required: amountCents
      });
    }

    const balanceBefore = wallet.balanceCents;
    const balanceAfter = balanceBefore - amountCents;

    const updatedWallet = await tx.wallet.update({
      where: {
        id: wallet.id,
        version: wallet.version
      },
      data: {
        balanceCents: balanceAfter,
        version: { increment: 1 }
      }
    });

    if (!updatedWallet) {
      throw new ApiError(409, 'WALLET_CONCURRENT_UPDATE', { message: '钱包更新冲突，请重试' });
    }

    const txData = {
      walletId: wallet.id,
      userId,
      type: 'CONSUME',
      source,
      amountCents,
      balanceBefore,
      balanceAfter,
      remark
    };

    if (orderId) txData.orderId = orderId;
    if (afterSaleId) txData.afterSaleId = afterSaleId;
    if (operatorId) txData.operatorId = operatorId;

    const transaction = await tx.walletTransaction.create({ data: txData });

    return {
      wallet: updatedWallet,
      transaction,
      isDuplicate: false
    };
  };

  if (externalTx) {
    return executor(externalTx);
  }
  return prisma.$transaction(executor);
}

async function refundBalance({
  userId,
  amountCents,
  source,
  orderId,
  afterSaleId,
  remark,
  operatorId,
  tx: externalTx
}) {
  if (amountCents <= 0) {
    throw new ApiError(400, 'INVALID_AMOUNT', { message: '退款金额必须大于0' });
  }

  if (!orderId && !afterSaleId) {
    throw new ApiError(400, 'MISSING_REFERENCE', { message: '缺少业务关联ID' });
  }

  const uniqueKey = orderId
    ? { orderId_source: { orderId, source } }
    : { afterSaleId_source: { afterSaleId, source } };

  const executor = async (tx) => {
    const wallet = await getOrCreateWallet(userId, tx);

    const existingTx = await tx.walletTransaction.findUnique({
      where: uniqueKey
    });

    if (existingTx) {
      return {
        wallet,
        transaction: existingTx,
        isDuplicate: true
      };
    }

    const balanceBefore = wallet.balanceCents;
    const balanceAfter = balanceBefore + amountCents;

    const updatedWallet = await tx.wallet.update({
      where: {
        id: wallet.id,
        version: wallet.version
      },
      data: {
        balanceCents: balanceAfter,
        version: { increment: 1 }
      }
    });

    if (!updatedWallet) {
      throw new ApiError(409, 'WALLET_CONCURRENT_UPDATE', { message: '钱包更新冲突，请重试' });
    }

    const txData = {
      walletId: wallet.id,
      userId,
      type: 'REFUND',
      source,
      amountCents,
      balanceBefore,
      balanceAfter,
      remark
    };

    if (orderId) txData.orderId = orderId;
    if (afterSaleId) txData.afterSaleId = afterSaleId;
    if (operatorId) txData.operatorId = operatorId;

    const transaction = await tx.walletTransaction.create({ data: txData });

    return {
      wallet: updatedWallet,
      transaction,
      isDuplicate: false
    };
  };

  if (externalTx) {
    return executor(externalTx);
  }
  return prisma.$transaction(executor);
}

module.exports = {
  getOrCreateWallet,
  rechargeWallet,
  deductBalance,
  refundBalance
};
