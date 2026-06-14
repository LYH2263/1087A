const jwt = require('jsonwebtoken');
const config = require('../config');
const { ApiError } = require('../errors');

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return next(new ApiError(401, 'UNAUTHORIZED'));
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.sub, role: payload.role, username: payload.username };
    return next();
  } catch (error) {
    return next(new ApiError(401, 'INVALID_TOKEN'));
  }
}

module.exports = { requireAuth };
