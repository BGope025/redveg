const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');
const { getDatabaseConnection } = require('../config/turso');
const {
  ADMIN_ROLES,
  getStaffAccess,
  hasPermission,
  permissionsForRequest,
  writeActivity
} = require('../services/admin-security.service');

/** Verify the session against the current account record so deactivation and
 * permission changes take effect immediately, even for an existing token. */
const protect = async (req, res, next) => {
  try {
    const token = req.cookies?.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
    if (!token) {
      return res.status(401).json({ success: false, message: 'Admin authentication required.' });
    }

    const decoded = jwt.verify(token, jwtSecret);
    const db = await getDatabaseConnection('orders');
    const account = await getStaffAccess(db, decoded.userId);
    if (!account) {
      return res.status(401).json({ success: false, message: 'This account no longer exists.' });
    }

    if (String(account.account_role).toLowerCase() === 'admin') {
      if (!account.isAdminStaff || Number(account.is_active) !== 1) {
        return res.status(403).json({ success: false, message: 'This employee account is inactive.' });
      }
      req.user = {
        userId: account.id,
        username: account.username,
        email: account.email,
        role: account.role,
        permissions: account.permissions,
        isAdminStaff: true,
        isActive: true
      };
      req.adminSecurityDb = db;
      return next();
    }

    // Preserve the existing customer/profile user API behavior. Admin APIs
    // still require an admin staff record in authorize().
    req.user = { userId: account.id, username: account.username, role: account.account_role };
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Admin session is invalid or expired.' });
    }
    if (error.type === 'auth-error') {
      return res.status(401).json({ success: false, message: error.message });
    }
    console.error('[auth] session validation failed:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Backward-compatible route guard. `authorize('admin')` now means an active
 * staff session with the permission mapped to that API resource and method.
 */
const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  if (allowedRoles.includes('admin')) {
    if (!req.user.isAdminStaff || !ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied. Admin staff access is required.' });
    }
    const requiredPermissions = permissionsForRequest(req);
    const allowed = requiredPermissions.every((permission) => hasPermission(req.user, permission));
    const permissionLabel = requiredPermissions.join(' + ');
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(String(req.method).toUpperCase());
    if (req.adminSecurityDb) {
      res.once('finish', () => {
        if (write || !allowed) {
          void writeActivity(req.adminSecurityDb, {
            user: req.user,
            action: allowed ? `api.${String(req.method).toLowerCase()}` : 'api.permission_denied',
            resource: req.originalUrl,
            method: req.method,
            status: res.statusCode,
            ip: req.ip,
            userAgent: req.get('user-agent')
          });
        }
      });
    }
    if (!allowed) {
      return res.status(403).json({ success: false, message: `Access denied. Missing permission: ${permissionLabel}.` });
    }
    return next();
  }

  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Access denied. Insufficient permissions.' });
  }
  next();
};

module.exports = { protect, authorize };
