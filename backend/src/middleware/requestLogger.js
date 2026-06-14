const logger = require('../logger');

function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    logger.info('request.completed', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs
    });
  });
  next();
}

module.exports = requestLogger;
