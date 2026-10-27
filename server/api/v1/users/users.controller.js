const { getDatabaseConnection } = require('../../../config/turso');
const { generateNotFoundError, generateValidationError } = require('../../../utils/error-classes');
const { generateUserId } = require('../../../utils/id-generator');
const { hashPassword } = require('../../../utils/password.utils');
const logger = require('../../../utils/logger');

/**
 * Get user profile
 * @route GET /api/v1/users/:userId
 */
const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await getDatabaseConnection('orders');

    // Users can only access their own profile unless they're admin
    if (req.params.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const result = await db.execute({
      sql: 'SELECT id, username, email, phone, role, created_at FROM users WHERE id = ?',
      args: [userId]
    });

    if (result.rows.length === 0) {
      throw generateNotFoundError('User not found');
    }

    const user = result.rows[0];

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    if (error.type === 'not-found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Update user profile
 * @route PUT /api/v1/users/:userId
 */
const updateUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const { email, phone, password } = req.body;

    // Users can only update their own profile unless they're admin
    if (req.params.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const db = await getDatabaseConnection('orders');

    // Check if user exists
    const userResult = await db.execute({
      sql: 'SELECT id FROM users WHERE id = ?',
      args: [userId]
    });

    if (userResult.rows.length === 0) {
      throw generateNotFoundError('User not found');
    }

    // Build update query dynamically
    const updates = [];
    const args = [];

    if (email !== undefined) {
      updates.push('email = ?');
      args.push(email);
    }

    if (phone !== undefined) {
      updates.push('phone = ?');
      args.push(phone);
    }

    if (password !== undefined) {
      if (password.length < 6) {
        throw generateValidationError('Password must be at least 6 characters');
      }
      const hashedPassword = await hashPassword(password);
      updates.push('password_hash = ?');
      args.push(hashedPassword);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    args.push(userId);

    await db.execute({
      sql: `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      args
    });

    logger.info(`User profile updated: ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    if (error.type === 'not-found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    if (error.type === 'validation-error') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error updating user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get all users
 * @route GET /api/v1/users
 */
const getAllUsers = async (req, res) => {
  try {
    const db = await getDatabaseConnection('orders');

    const result = await db.execute({
      sql: 'SELECT id, username, email, phone, role, created_at FROM users ORDER BY created_at DESC',
      args: [],
    });

    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get user by ID
 * @route GET /api/v1/users/:id
 */
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDatabaseConnection('orders');

    const result = await db.execute({
      sql: 'SELECT id, username, email, phone, role, created_at FROM users WHERE id = ?',
      args: [id]
    });

    if (result.rows.length === 0) {
      throw generateNotFoundError('User not found');
    }

    const user = result.rows[0];

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    if (error.type === 'not-found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Create new user
 * @route POST /api/v1/users
 */
const createUser = async (req, res) => {
  try {
    const { username, email, phone, password, role } = req.body;

    // Validate required fields
    if (!username || !email || !phone || !password) {
      throw generateValidationError('Username, email, phone, and password are required');
    }

    // Validate role if provided
    const validRoles = ['customer'];
    if (role && !validRoles.includes(role)) {
      throw generateValidationError(`Role must be one of: ${validRoles.join(', ')}`);
    }

    const db = await getDatabaseConnection('orders');

    // Check if username already exists
    const usernameResult = await db.execute({
      sql: 'SELECT id FROM users WHERE username = ?',
      args: [username]
    });

    if (usernameResult.rows.length > 0) {
      throw generateValidationError('Username already exists');
    }

    // Check if email already exists
    const emailResult = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email]
    });

    if (emailResult.rows.length > 0) {
      throw generateValidationError('Email already exists');
    }

    // Check if phone already exists
    const phoneResult = await db.execute({
      sql: 'SELECT id FROM users WHERE phone = ?',
      args: [phone]
    });

    if (phoneResult.rows.length > 0) {
      throw generateValidationError('Phone already exists');
    }

    const userId = generateUserId();
    const hashedPassword = await hashPassword(password);
    const userRole = role || 'customer'; // Default to customer if not specified

    await db.execute({
      sql: `
        INSERT INTO users (id, username, email, phone, password_hash, role)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [userId, username, email, phone, hashedPassword, userRole]
    });

    logger.info(`User created: ${userId} with role: ${userRole}`);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        id: userId,
        username,
        email,
        phone,
        role: userRole,
        created_at: new Date().toISOString()
      }
    });
  } catch (error) {
    if (error.type === 'validation-error') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Update user
 * @route PUT /api/v1/users/:id
 */
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, phone, password, role } = req.body;

    if (req.user?.isAdminStaff && role !== undefined) {
      throw generateValidationError('Employee roles are managed from Employees & access.');
    }

    const db = await getDatabaseConnection('orders');

    // Check if user exists
    const userResult = await db.execute({
      sql: 'SELECT id FROM users WHERE id = ?',
      args: [id]
    });

    if (userResult.rows.length === 0) {
      throw generateNotFoundError('User not found');
    }

    // Validate role if provided
    if (role !== undefined) {
      const validRoles = ['customer'];
      if (!validRoles.includes(role)) {
        throw generateValidationError(`Role must be one of: ${validRoles.join(', ')}`);
      }
    }

    // Check if username is being changed and already exists
    if (username !== undefined && username !== null) {
      const usernameCheckResult = await db.execute({
        sql: 'SELECT id FROM users WHERE username = ? AND id != ?',
        args: [username, id]
      });

      if (usernameCheckResult.rows.length > 0) {
        throw generateValidationError('Username already exists');
      }
    }

    // Check if email is being changed and already exists
    if (email !== undefined && email !== null) {
      const emailCheckResult = await db.execute({
        sql: 'SELECT id FROM users WHERE email = ? AND id != ?',
        args: [email, id]
      });

      if (emailCheckResult.rows.length > 0) {
        throw generateValidationError('Email already exists');
      }
    }

    // Check if phone is being changed and already exists
    if (phone !== undefined && phone !== null) {
      const phoneCheckResult = await db.execute({
        sql: 'SELECT id FROM users WHERE phone = ? AND id != ?',
        args: [phone, id]
      });

      if (phoneCheckResult.rows.length > 0) {
        throw generateValidationError('Phone already exists');
      }
    }

    // Build update query dynamically
    const updates = [];
    const args = [];

    if (username !== undefined) {
      updates.push('username = ?');
      args.push(username);
    }

    if (email !== undefined) {
      updates.push('email = ?');
      args.push(email);
    }

    if (phone !== undefined) {
      updates.push('phone = ?');
      args.push(phone);
    }

    if (password !== undefined) {
      if (password.length < 6) {
        throw generateValidationError('Password must be at least 6 characters');
      }
      const hashedPassword = await hashPassword(password);
      updates.push('password_hash = ?');
      args.push(hashedPassword);
    }

    if (role !== undefined) {
      updates.push('role = ?');
      args.push(role);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    args.push(id);

    await db.execute({
      sql: `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      args
    });

    logger.info(`User updated: ${id}`);

    res.status(200).json({
      success: true,
      message: 'User updated successfully'
    });
  } catch (error) {
    if (error.type === 'validation-error') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    if (error.type === 'not-found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Delete user
 * @route DELETE /api/v1/users/:id
 */
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDatabaseConnection('orders');

    // Check if user exists
    const userResult = await db.execute({
      sql: 'SELECT id, role FROM users WHERE id = ?',
      args: [id]
    });

    if (userResult.rows.length === 0) {
      throw generateNotFoundError('User not found');
    }

    if (String(userResult.rows[0].role).toLowerCase() === 'admin') {
      return res.status(409).json({ success: false, message: 'Employee accounts cannot be deleted here. Deactivate them from Employees & access.' });
    }

    // Prevent deleting the last admin user
    if (req.body.preventLastAdminCheck !== true) { // Allow bypass for internal use
      const adminCountResult = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM users WHERE role = \"admin\"',
        args: [],
      });

      const adminCount = parseInt(adminCountResult.rows[0].count);

      const userRoleResult = await db.execute({
        sql: 'SELECT role FROM users WHERE id = ?',
        args: [id]
      });

      const userRole = userRoleResult.rows[0]?.role;

      if (adminCount <= 1 && userRole === 'admin') {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete the last admin user'
        });
      }
    }

    await db.execute({
      sql: 'DELETE FROM users WHERE id = ?',
      args: [id]
    });

    logger.info(`User deleted: ${id}`);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    if (error.type === 'validation-error') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
};

