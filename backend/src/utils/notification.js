const prisma = require('../db');
const { fromCents } = require('./money');

const NOTIFICATION_CONFIG = {
  ORDER_PAID: {
    title: '订单支付成功',
    content: (order) => `您的订单 ${order.id} 已支付成功，金额 ${fromCents(order.totalCents)} 元，我们将尽快为您发货。`
  },
  ORDER_SHIPPED: {
    title: '订单已发货',
    content: (order) => `您的订单 ${order.id} 已发货，请注意查收。`
  },
  ORDER_COMPLETED: {
    title: '订单已完成',
    content: (order) => `您的订单 ${order.id} 已确认收货，感谢您的购买，期待您的评价！`
  },
  ORDER_REFUNDED: {
    title: '订单已退款',
    content: (order) => `您的订单 ${order.id} 已退款，金额 ${fromCents(order.totalCents)} 元将原路返回。`
  }
};

async function createOrderNotification(userId, type, order) {
  const config = NOTIFICATION_CONFIG[type];
  if (!config) {
    throw new Error(`Invalid notification type: ${type}`);
  }

  return await prisma.notification.create({
    data: {
      userId,
      type,
      title: config.title,
      content: config.content(order),
      orderId: order.id
    }
  });
}

async function markAsRead(notificationId, userId) {
  return await prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId,
      isRead: false
    },
    data: {
      isRead: true,
      readAt: new Date()
    }
  });
}

async function markAllAsRead(userId) {
  return await prisma.notification.updateMany({
    where: {
      userId,
      isRead: false
    },
    data: {
      isRead: true,
      readAt: new Date()
    }
  });
}

async function getUnreadCount(userId) {
  return await prisma.notification.count({
    where: {
      userId,
      isRead: false
    }
  });
}

async function getNotificationList(userId, page = 1, pageSize = 20) {
  const skip = (page - 1) * pageSize;
  const take = pageSize;

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.notification.count({ where: { userId } }),
    getUnreadCount(userId)
  ]);

  return {
    notifications,
    total,
    page,
    pageSize,
    unreadCount
  };
}

async function deleteNotification(notificationId, userId) {
  return await prisma.notification.deleteMany({
    where: {
      id: notificationId,
      userId
    }
  });
}

module.exports = {
  createOrderNotification,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  getNotificationList,
  deleteNotification
};
