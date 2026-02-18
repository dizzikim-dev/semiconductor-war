/**
 * Admin 인증 미들웨어
 * X-Admin-Password 헤더 전용 인증 (쿼리 파라미터 제거 — URL 로그 노출 방지)
 */
const crypto = require('crypto');
const C = require('../constants');

function adminAuth(req, res, next) {
  // ADMIN_PASSWORD 미설정 시 모든 요청 거부
  if (!C.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Admin password not configured' });
  }

  const password = req.headers['x-admin-password'];
  if (!password) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 상수 시간 비교 — 타이밍 공격 방지
  const a = Buffer.from(password);
  const b = Buffer.from(C.ADMIN_PASSWORD);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

module.exports = adminAuth;
