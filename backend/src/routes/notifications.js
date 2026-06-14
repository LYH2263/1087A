const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../errors');
const {
  getNotificationList,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification
} = require('../utils/notification');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 20 } = req.query;
  const result = await getNotificationList(
    req.user.id,
    parseInt(page),
    parseInt(pageSize)
  );
  res.json(result);
}));

router.get('/unread-count', asyncHandler(async (req, res) => {
  const count = await getUnreadCount(req.user.id);
  res.json({ unreadCount: count });
}));

router.post('/:id/read', asyncHandler(async (req, res) => {
  const result = await markAsRead(req.params.id, req.user.id);
  if (result.count === 0) {
    throw new ApiError(404, 'NOTIFICATION_NOT_FOUND_OR_ALREADY_READ');
  }
  res.json({ message: 'notification marked as read' });
}));

router.post('/read-all', asyncHandler(async (req, res) => {
  const result = await markAllAsRead(req.user.id);
  res.json({ message: 'all notifications marked as read', updatedCount: result.count });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await deleteNotification(req.params.id, req.user.id);
  if (result.count === 0) {
    throw new ApiError(404, 'NOTIFICATION_NOT_FOUND');
  }
  res.json({ message: 'notification deleted' });
}));

module.exports = router;
