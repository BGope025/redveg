const jwt = require('jsonwebtoken');
const { generateAuthError } = require('../utils/error-classes');
const { jwtSecret } = require('../config/env');

/**
 * Protect middleware - verifies JWT token
 */
const protect = (req, res, next) => {
  try {
    // Get token from cookies or Authorization header
    const token = req.cookies?.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, jwtSecret);

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Admin session is invalid or expired.'
      });
    }

    if (error.type === 'auth-error') {
      return res.status(401).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Authorization middleware - checks user role
 * @param {string[]} allowedRoles - Array of allowed roles
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.'
      });
    }

    next();
  };
};

module.exports = {
  protect,
  authorize
};
