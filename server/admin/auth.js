/**
 * Admin 인증 미들웨어
 * X-Admin-Password 헤더 또는 ?password 쿼리로 인증
 */
const C = require('../constants');

function adminAuth(req, res, next) {
  const password = req.headers['x-admin-password'] || req.query.password;
  if (password !== C.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = adminAuth;
