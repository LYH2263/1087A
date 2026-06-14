const { z } = require('zod');

const passwordRule = z
  .string()
  .min(8, '密码至少 8 位')
  .regex(/[A-Z]/, '至少包含一个大写字母')
  .regex(/[a-z]/, '至少包含一个小写字母')
  .regex(/[0-9]/, '至少包含一个数字');

const phoneRule = z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确');

const registerSchema = z.object({
  username: z.string().min(2, '用户名过短').max(20, '用户名过长'),
  password: passwordRule,
  phone: phoneRule,
  email: z.string().email('邮箱格式不正确')
});

const loginSchema = z.object({
  account: z.string().min(2),
  password: z.string().min(6),
  remember: z.boolean().optional()
});

const forgotPasswordSchema = z.object({
  account: z.string().min(2),
  method: z.enum(['email', 'sms'])
});

const resetPasswordSchema = z.object({
  token: z.string().min(6),
  newPassword: passwordRule
});

const coverUrlRule = z
  .string()
  .min(1, '封面必填')
  .refine(
    (value) =>
      value.startsWith('/uploads/') ||
      value.startsWith('/covers/') ||
      /^https?:\/\//.test(value),
    '封面地址不合法'
  );

const bookSchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  isbn: z.string().regex(/^[0-9X]{10,13}$/, 'ISBN 格式不正确'),
  description: z.string().min(10),
  price: z.number().positive(),
  stock: z.number().int().min(0),
  coverUrl: coverUrlRule,
  categoryId: z.string().min(1)
});

const bookUpdateSchema = bookSchema.partial();

const categorySchema = z.object({
  name: z.string().min(1).max(20)
});

const cartAddSchema = z.object({
  bookId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
  specId: z.string().optional().default('')
});

const cartUpdateSchema = z.object({
  quantity: z.number().int().min(1).max(99)
});

const addressSchema = z.object({
  recipient: z.string().min(1),
  phone: phoneRule,
  line1: z.string().min(3),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(4),
  isDefault: z.boolean().optional()
});

const checkoutSchema = z.object({
  addressId: z.string().min(1),
  paymentMethod: z.enum(['WECHAT', 'ALIPAY', 'CARD', 'COD']),
  userCouponId: z.string().optional().nullable()
});

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().min(3).max(200)
});

const createCouponSchema = z.object({
  name: z.string().min(1).max(50),
  type: z.enum(['FIXED_AMOUNT', 'PERCENTAGE']),
  discountAmount: z.number().positive().optional(),
  discountPercentage: z.number().positive().max(100).optional(),
  maxDiscount: z.number().positive().optional(),
  minAmount: z.number().min(0).default(0),
  totalQuantity: z.number().int().positive(),
  limitPerUser: z.number().int().min(1).default(1),
  validFrom: z.string().refine((v) => !isNaN(Date.parse(v)), '日期格式不正确'),
  validUntil: z.string().refine((v) => !isNaN(Date.parse(v)), '日期格式不正确'),
  description: z.string().max(200).optional()
}).refine((data) => {
  if (data.type === 'FIXED_AMOUNT') {
    return data.discountAmount !== undefined;
  }
  if (data.type === 'PERCENTAGE') {
    return data.discountPercentage !== undefined;
  }
  return false;
}, {
  message: '满减券需配置 discountAmount，折扣券需配置 discountPercentage',
  path: ['type']
});

const updateCouponSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'EXPIRED']).optional(),
  description: z.string().max(200).optional().nullable()
});

const claimCouponSchema = z.object({
  couponId: z.string().min(1)
});

const wishlistAddSchema = z.object({
  bookId: z.string().min(1)
});

const stockThresholdSchema = z.object({
  threshold: z.number().int().min(0),
  bookId: z.string().optional()
});

const singleRestockSchema = z.object({
  bookId: z.string().min(1),
  quantity: z.number().int().min(1)
});

const batchRestockSchema = z.object({
  items: z.array(z.object({
    bookId: z.string().min(1),
    quantity: z.number().int().min(1)
  })).min(1)
});

const createAfterSaleSchema = z.object({
  orderId: z.string().min(1),
  type: z.enum(['RETURN', 'EXCHANGE']).default('RETURN'),
  reason: z.enum(['QUALITY_ISSUE', 'WRONG_ITEM', 'DAMAGED', 'NOT_AS_DESCRIBED', 'NO_LONGER_WANTED', 'OTHER']),
  description: z.string().max(500).optional(),
  items: z.array(z.object({
    orderItemId: z.string().min(1),
    quantity: z.number().int().min(1)
  })).min(1)
});

const rejectAfterSaleSchema = z.object({
  rejectReason: z.string().min(1).max(500)
});

const bookSpecSchema = z.object({
  name: z.string().min(1, '规格名称必填').max(30, '规格名称最多30字'),
  price: z.number().positive('价格需大于0'),
  stock: z.number().int().min(0, '库存不能为负数'),
  coverUrl: z.string().optional().nullable()
});

const bookSpecUpdateSchema = z.object({
  name: z.string().min(1).max(30).optional(),
  price: z.number().positive().optional(),
  stock: z.number().int().min(0).optional(),
  coverUrl: z.string().optional().nullable()
});

const createSalesGoalSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  revenueGoal: z.number().positive(),
  orderGoal: z.number().int().positive()
});

const updateSalesGoalSchema = z.object({
  revenueGoal: z.number().positive().optional(),
  orderGoal: z.number().int().positive().optional()
});

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  bookSchema,
  bookUpdateSchema,
  categorySchema,
  cartAddSchema,
  cartUpdateSchema,
  addressSchema,
  checkoutSchema,
  reviewSchema,
  createCouponSchema,
  updateCouponSchema,
  claimCouponSchema,
  wishlistAddSchema,
  stockThresholdSchema,
  singleRestockSchema,
  batchRestockSchema,
  createAfterSaleSchema,
  rejectAfterSaleSchema,
  bookSpecSchema,
  bookSpecUpdateSchema,
  createSalesGoalSchema,
  updateSalesGoalSchema
};
