const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');

function createAccessToken(user) {
  return jwt.sign(
    {
      role: user.role,
      username: user.username
    },
    config.jwtSecret,
    {
      subject: user.id,
      expiresIn: config.accessTokenExpiresIn
    }
  );
}

function createRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { createAccessToken, createRefreshToken, hashToken };
