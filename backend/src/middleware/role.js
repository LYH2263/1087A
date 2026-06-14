const { ApiError } = require('../errors');

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return next(new ApiError(403, 'FORBIDDEN'));
    }
    return next();
  };
}

module.exports = { requireRole };
