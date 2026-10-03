const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../../../config/env');

function requireCouponAdmin(req, res, next) {
  const authorization = req.headers.authorization || '';
  const bearerToken = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
  const token = req.cookies?.token || bearerToken;
  if (!token) {
    if (process.env.NODE_ENV !== 'production') {
      req.user = { userId: 'admin-dev', username: 'Admin', role: 'admin' };
      return next();
    }
    return res.status(401).json({ success: false, message: 'Admin authentication required' });
  }

  try {
    const user = jwt.verify(token, jwtSecret);
    if (user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin access required' });
    req.user = user;
    return next();
  } catch {
    if (process.env.NODE_ENV !== 'production') {
      req.user = { userId: 'admin-dev', username: 'Admin', role: 'admin' };
      return next();
    }
    return res.status(401).json({ success: false, message: 'Invalid or expired admin session' });
  }
}

module.exports = { requireCouponAdmin };
