const jwt = require('jsonwebtoken');
const { getDatabaseConnection } = require('../../../config/turso');
const { comparePassword } = require('../../../utils/password.utils');
const logger = require('../../../utils/logger');
const { ensureAdminSecuritySchema, getStaffAccess, writeActivity } = require('../../../services/admin-security.service');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Admin login endpoint
 * @route POST /api/v1/auth/login
 */
const login = async (req, res) => {
  try {
    const { username, password, loginAs } = req.body;

    // Validate input
    if (!username || !password || !['owner', 'employee'].includes(loginAs)) {
      return res.status(400).json({
        success: false,
        message: 'Choose Owner or Employee and enter your username and password.'
      });
    }

    // Get database connection
    const db = await getDatabaseConnection('orders'); // Users table is in ordersDb
    logger.info(`Database connection obtained for orders db`);
    await ensureAdminSecuritySchema(db);

    // Find user
    const userResult = await db.execute({
      sql: `SELECT u.id, u.username, u.password_hash, u.role FROM users u
        JOIN admin_staff_access a ON a.user_id = u.id
        WHERE LOWER(TRIM(u.role)) = 'admin'
          AND (LOWER(TRIM(u.username)) = LOWER(TRIM(?)) OR LOWER(TRIM(u.email)) = LOWER(TRIM(?))) LIMIT 1`,
      args: [username, username]
    });
    logger.info(`Admin login lookup completed, found ${userResult.rows.length} matching users`);

    if (userResult.rows.length === 0) {
      logger.info(`User not found: ${username}`);
      await writeActivity(db, { action: 'auth.login.failed', resource: '/auth/login', method: 'POST', status: 401, ip: req.ip, userAgent: req.get('user-agent') });
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const user = userResult.rows[0];
    if (String(user.role).toLowerCase() !== 'admin') {
      await writeActivity(db, { action: 'auth.login.denied', resource: '/auth/login', method: 'POST', status: 403, ip: req.ip, userAgent: req.get('user-agent'), user: { userId: user.id, username: user.username } });
      return res.status(403).json({
        success: false,
        message: 'This account is not authorized for the admin panel'
      });
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password_hash);

    if (!isPasswordValid) {
      await writeActivity(db, { action: 'auth.login.failed', resource: '/auth/login', method: 'POST', status: 401, ip: req.ip, userAgent: req.get('user-agent'), user: { userId: user.id, username: user.username } });
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const staffAccess = await getStaffAccess(db, user.id);
    if (!staffAccess?.isAdminStaff || Number(staffAccess.is_active) !== 1) {
      await writeActivity(db, { action: 'auth.login.inactive', resource: '/auth/login', method: 'POST', status: 403, ip: req.ip, userAgent: req.get('user-agent'), user: { userId: user.id, username: user.username } });
      return res.status(403).json({ success: false, message: 'This employee account is inactive.' });
    }
    const accountType = staffAccess.role === 'owner' ? 'owner' : 'employee';
    if (accountType !== loginAs) {
      await writeActivity(db, { action: 'auth.login.type_mismatch', resource: '/auth/login', method: 'POST', status: 403, ip: req.ip, userAgent: req.get('user-agent'), user: { userId: user.id, username: user.username } });
      return res.status(403).json({ success: false, message: `This account is not an ${loginAs === 'owner' ? 'Owner' : 'employee'} account.` });
    }
    await db.execute({
      sql: 'UPDATE admin_staff_access SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      args: [user.id]
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: staffAccess.role
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    logger.info(`User ${user.username} logged in successfully`);

    await writeActivity(db, { action: 'auth.login.success', resource: '/auth/login', method: 'POST', status: 200, ip: req.ip, userAgent: req.get('user-agent'), user: { userId: user.id, username: user.username } });
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          username: user.username,
          role: staffAccess.role,
          permissions: staffAccess.permissions,
          adminAccess: true
        },
        token
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Admin logout endpoint
 * @route POST /api/v1/auth/logout
 */
const logout = async (req, res) => {
  try {
    if (req.adminSecurityDb && req.user?.isAdminStaff) {
      await writeActivity(req.adminSecurityDb, { user: req.user, action: 'auth.logout', resource: '/auth/logout', method: 'POST', status: 200, ip: req.ip, userAgent: req.get('user-agent') });
    }
    // Clear the token cookie
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    logger.info('User logged out successfully');

    res.status(200).json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Validate token endpoint
 * @route GET /api/v1/auth/validate
 */
const validate = async (req, res) => {
  try {
    if (!req.user?.isAdminStaff) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    res.status(200).json({
      success: true,
      message: 'Token is valid',
      data: {
        user: {
          id: req.user.userId,
          username: req.user.username,
          role: req.user.role,
          permissions: req.user.permissions,
          adminAccess: true
        }
      }
    });
  } catch (error) {
    logger.error('Token validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = { login, logout, validate };

