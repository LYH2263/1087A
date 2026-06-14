const { fromCents } = require('./money');

function calculateDiscount(coupon, subtotalCents) {
  if (!coupon) {
    return {
      valid: false,
      reason: 'COUPON_NOT_FOUND',
      discountCents: 0,
      finalCents: subtotalCents
    };
  }

  const now = new Date();
  if (coupon.validFrom && now < new Date(coupon.validFrom)) {
    return {
      valid: false,
      reason: 'COUPON_NOT_ACTIVE',
      discountCents: 0,
      finalCents: subtotalCents
    };
  }
  if (coupon.validUntil && now > new Date(coupon.validUntil)) {
    return {
      valid: false,
      reason: 'COUPON_EXPIRED',
      discountCents: 0,
      finalCents: subtotalCents
    };
  }
  if (coupon.status !== 'ACTIVE') {
    return {
      valid: false,
      reason: 'COUPON_NOT_AVAILABLE',
      discountCents: 0,
      finalCents: subtotalCents
    };
  }

  const minAmount = coupon.minAmountCents || 0;
  if (subtotalCents < minAmount) {
    return {
      valid: false,
      reason: 'MIN_AMOUNT_NOT_REACHED',
      minAmount: fromCents(minAmount),
      discountCents: 0,
      finalCents: subtotalCents
    };
  }

  let discountCents = 0;

  if (coupon.type === 'FIXED_AMOUNT') {
    discountCents = coupon.discountAmountCents || 0;
  } else if (coupon.type === 'PERCENTAGE') {
    const percentage = coupon.discountPercentage || 0;
    discountCents = Math.floor(subtotalCents * percentage / 100);
    if (coupon.maxDiscountCents && discountCents > coupon.maxDiscountCents) {
      discountCents = coupon.maxDiscountCents;
    }
  }

  if (discountCents > subtotalCents) {
    discountCents = subtotalCents;
  }

  const finalCents = subtotalCents - discountCents;

  return {
    valid: true,
    discountCents,
    finalCents,
    subtotalCents,
    details: {
      type: coupon.type,
      name: coupon.name,
      code: coupon.code,
      minAmount: fromCents(minAmount),
      discountAmount: coupon.type === 'FIXED_AMOUNT' ? fromCents(discountCents) : null,
      discountPercentage: coupon.type === 'PERCENTAGE' ? coupon.discountPercentage : null,
      maxDiscount: coupon.type === 'PERCENTAGE' && coupon.maxDiscountCents ? fromCents(coupon.maxDiscountCents) : null
    }
  };
}

function generateCouponCode(prefix = 'CP') {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}${timestamp}${random}`;
}

function isCouponExpired(coupon) {
  const now = new Date();
  return new Date(coupon.validUntil) < now;
}

module.exports = {
  calculateDiscount,
  generateCouponCode,
  isCouponExpired
};
