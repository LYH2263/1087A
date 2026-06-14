const { ZodError } = require('zod');
const multer = require('multer');
const { ApiError } = require('../errors');
const logger = require('../logger');

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: '输入校验失败',
      details: err.errors
    });
  }

  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: err.message,
      details: err.details
    });
  }

  if (err instanceof multer.MulterError) {
    const errorCode = err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_FAILED';
    return res.status(400).json({
      error: errorCode
    });
  }

  logger.error('request.failed', {
    message: err.message,
    stack: err.stack
  });

  return res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: '服务器开小差了，请稍后重试。'
  });
}

module.exports = errorHandler;
