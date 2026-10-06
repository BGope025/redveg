const jwt = require('jsonwebtoken');
const { getDatabaseConnection } = require('../../../config/turso');
const { generateAuthError } = require('../../../utils/error-classes');
const { comparePassword } = require('../../../utils/password.utils');
const logger = require('../../../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Admin login endpoint
 * @route POST /api/v1/auth/login
 */
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    // Get database connection
    const db = await getDatabaseConnection('orders'); // Users table is in ordersDb
    logger.info(`Database connection obtained for orders db`);

    // Find user
    const userResult = await db.execute({
      sql: 'SELECT id, username, password_hash, role FROM users WHERE username = ?',
      args: [username]
    });
    logger.info(`Admin login lookup completed, found ${userResult.rows.length} matching users`);

    if (userResult.rows.length === 0) {
      logger.info(`User not found: ${username}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const user = userResult.rows[0];
    if (String(user.role).toLowerCase() !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'This account is not authorized for the admin panel'
      });
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role
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

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          username: user.username,
          role: user.role
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
const logout = (req, res) => {
  try {
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
    const authHeader = req.headers.authorization;
    const token = req.cookies?.token || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null);
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    // Verify token
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      }

      if (decoded.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required' });
      }

      // Token is valid, return user info
      res.status(200).json({
        success: true,
        message: 'Token is valid',
        data: {
          user: {
            id: decoded.userId,
            username: decoded.username,
            role: decoded.role
          }
        }
      });
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

