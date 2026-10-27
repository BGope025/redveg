const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { getDatabaseConnection } = require('../../../config/turso');
const logger = require('../../../utils/logger');
const { getStaffAccess, writeActivity } = require('../../../services/admin-security.service');

// Retrieve from environment or use a placeholder if not set
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Google OAuth login endpoint for admin panel
 * @route POST /api/v1/auth/oauth/google
 */
const googleLogin = async (req, res) => {
  try {
    const { idToken, loginAs } = req.body;
    
    if (!idToken || !['owner', 'employee'].includes(loginAs)) {
      return res.status(400).json({
        success: false,
        message: 'Choose Owner or Employee and provide an ID token.'
      });
    }

    // Verify Google ID token
    if (!GOOGLE_CLIENT_ID) {
      return res.status(503).json({ success: false, message: 'Google sign-in is not configured.' });
    }
    const ticket = await client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
    
    const payload = ticket.getPayload();
    const email = payload.email;
    if (payload.email_verified !== true) {
      return res.status(403).json({ success: false, message: 'A verified Google email is required.' });
    }

    // Authorize admin emails. For production, define ADMIN_EMAILS in .env (comma separated)
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    
    if (!email || !adminEmails.includes(email.toLowerCase())) {
      logger.warn(`Unauthorized OAuth attempt with email: ${email}`);
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Admin access required'
      });
    }

    // Get database connection
    const db = await getDatabaseConnection('orders'); 

    // Find user by email (used as username here)
    const userResult = await db.execute({
      sql: `SELECT id, username, role FROM users WHERE LOWER(email) = LOWER(?) AND LOWER(TRIM(role)) = 'admin' LIMIT 1`,
      args: [email]
    });
    const user = userResult.rows[0];
    if (!user) return res.status(403).json({ success: false, message: 'This employee account is not activated for Google sign-in.' });
    const staffAccess = await getStaffAccess(db, user.id);
    if (!staffAccess?.isAdminStaff || Number(staffAccess.is_active) !== 1) {
      return res.status(403).json({ success: false, message: 'This employee account is inactive.' });
    }
    const accountType = staffAccess.role === 'owner' ? 'owner' : 'employee';
    if (accountType !== loginAs) return res.status(403).json({ success: false, message: `This account is not an ${loginAs === 'owner' ? 'Owner' : 'employee'} account.` });

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

    logger.info(`OAuth User ${user.username} logged in successfully`);

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
        token // Return token in body as well
      }
    });
    await writeActivity(db, { user: { userId: user.id, username: user.username }, action: 'auth.google_login.success', resource: '/auth/oauth/google', method: 'POST', status: 200, ip: req.ip, userAgent: req.get('user-agent') });
  } catch (error) {
    logger.error('OAuth login error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token or authentication failed'
    });
  }
};

module.exports = { googleLogin };
