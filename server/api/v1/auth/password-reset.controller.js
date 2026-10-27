const crypto = require('crypto');
const { getDatabaseConnection } = require('../../../config/turso');
const { hashPassword } = require('../../../utils/password.utils');
const { sendPasswordResetEmail, sendEmployeePasswordRequestEmail } = require('../../../services/email.service');
const logger = require('../../../utils/logger');
const { ensureAdminSecuritySchema, hasPasswordConflict, writeActivity } = require('../../../services/admin-security.service');

const GENERIC_RESPONSE = {
  success: true,
  message: 'If an Owner account matches that email, a password reset link will be sent.'
};
const EMPLOYEE_REQUEST_RESPONSE = {
  success: true,
  message: 'If an active employee account matches, the Owner has been notified to review the password change request.'
};
let schemaReady;

function secretHash(value) {
  const secret = process.env.PASSWORD_RESET_HASH_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('Password reset hashing secret is not configured');
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

async function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = Promise.all([
      db.execute(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      db.execute(`CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id, expires_at)`),
      db.execute(`CREATE TABLE IF NOT EXISTS password_reset_requests (
        id TEXT PRIMARY KEY,
        target_hash TEXT NOT NULL,
        ip_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      db.execute(`CREATE INDEX IF NOT EXISTS idx_password_reset_requests_target ON password_reset_requests(target_hash, created_at)`),
      db.execute(`CREATE INDEX IF NOT EXISTS idx_password_reset_requests_ip ON password_reset_requests(ip_hash, created_at)`)
    ]).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

async function requestPasswordReset(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
  }

  try {
    const db = await getDatabaseConnection('orders');
    await ensureSchema(db);
    await ensureAdminSecuritySchema(db);
    const targetHash = secretHash(email);
    const ipHash = secretHash(req.ip || 'unknown');
    const recent = await db.execute({
      sql: `SELECT
        SUM(CASE WHEN target_hash = ? THEN 1 ELSE 0 END) AS target_count,
        SUM(CASE WHEN ip_hash = ? THEN 1 ELSE 0 END) AS ip_count
        FROM password_reset_requests WHERE created_at >= datetime('now', '-1 hour')`,
      args: [targetHash, ipHash]
    });
    const counts = recent.rows[0] || {};
    if (Number(counts.target_count || 0) >= 3 || Number(counts.ip_count || 0) >= 10) {
      return res.status(200).json(GENERIC_RESPONSE);
    }
    await db.execute({
      sql: 'INSERT INTO password_reset_requests (id, target_hash, ip_hash) VALUES (?, ?, ?)',
      args: [crypto.randomUUID(), targetHash, ipHash]
    });
    // Opportunistic cleanup keeps the request log bounded without storing email addresses or raw IPs.
    await db.execute("DELETE FROM password_reset_requests WHERE created_at < datetime('now', '-2 days')");

    const result = await db.execute({
      sql: `SELECT u.id, u.email FROM users u
        JOIN admin_staff_access a ON a.user_id = u.id
        WHERE LOWER(TRIM(u.email)) = ? AND LOWER(TRIM(u.role)) = 'admin' AND a.staff_role = 'owner' AND a.is_active = 1 LIMIT 1`,
      args: [email]
    });
    if (!result.rows.length) return res.status(200).json(GENERIC_RESPONSE);

    const user = result.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
      .toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
    await db.execute({
      sql: "UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL",
      args: [user.id]
    });
    await db.execute({
      sql: 'INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
      args: [tokenHash, user.id, expiresAt]
    });

    const baseUrl = String(process.env.APP_PUBLIC_URL || 'https://redveg.in').replace(/\/+$/, '');
    // Keep the bearer token in the URL fragment so it is not sent in HTTP requests or referrers.
    const resetUrl = `${baseUrl}/admin/reset-password#token=${encodeURIComponent(token)}`;
    try {
      await sendPasswordResetEmail({
        to: user.email,
        resetUrl,
        idempotencyKey: `password-reset/${tokenHash}`
      });
    } catch (error) {
      logger.error(`Password reset email could not be delivered: ${error.message}`);
      // Do not expose account existence or provider configuration to the caller.
    }
    return res.status(200).json(GENERIC_RESPONSE);
  } catch (error) {
    logger.error('Password reset request failed:', error);
    return res.status(200).json(GENERIC_RESPONSE);
  }
}

async function requestEmployeePasswordChange(req, res) {
  const identifier = String(req.body?.identifier || '').trim();
  if (!identifier || identifier.length > 254) {
    return res.status(400).json({ success: false, message: 'Enter your employee username or work email.' });
  }
  try {
    const db = await getDatabaseConnection('orders');
    await ensureSchema(db);
    await ensureAdminSecuritySchema(db);
    const targetHash = secretHash(identifier.toLowerCase());
    const ipHash = secretHash(req.ip || 'unknown');
    const recent = await db.execute({
      sql: `SELECT SUM(CASE WHEN target_hash = ? THEN 1 ELSE 0 END) AS target_count,
        SUM(CASE WHEN ip_hash = ? THEN 1 ELSE 0 END) AS ip_count
        FROM password_reset_requests WHERE created_at >= datetime('now', '-1 hour')`,
      args: [targetHash, ipHash]
    });
    const counts = recent.rows[0] || {};
    if (Number(counts.target_count || 0) >= 3 || Number(counts.ip_count || 0) >= 10) return res.status(200).json(EMPLOYEE_REQUEST_RESPONSE);
    await db.execute({
      sql: 'INSERT INTO password_reset_requests (id, target_hash, ip_hash) VALUES (?, ?, ?)',
      args: [crypto.randomUUID(), targetHash, ipHash]
    });
    await db.execute("DELETE FROM password_reset_requests WHERE created_at < datetime('now', '-2 days')");
    const employeeResult = await db.execute({
      sql: `SELECT u.id, u.username, u.email FROM users u
        JOIN admin_staff_access a ON a.user_id = u.id
        WHERE (LOWER(TRIM(u.email)) = LOWER(TRIM(?)) OR LOWER(TRIM(u.username)) = LOWER(TRIM(?)))
          AND LOWER(TRIM(u.role)) = 'admin' AND a.staff_role != 'owner' AND a.is_active = 1 LIMIT 1`,
      args: [identifier, identifier]
    });
    if (!employeeResult.rows.length) return res.status(200).json(EMPLOYEE_REQUEST_RESPONSE);
    const ownerResult = await db.execute({
      sql: `SELECT u.email FROM users u JOIN admin_staff_access a ON a.user_id = u.id
        WHERE a.staff_role = 'owner' AND a.is_active = 1 AND LOWER(TRIM(u.role)) = 'admin'
          AND u.email IS NOT NULL AND TRIM(u.email) != '' LIMIT 1`
    });
    if (!ownerResult.rows.length) {
      console.error('[password-reset] Employee requested a password change, but no Owner email is configured.');
      return res.status(200).json(EMPLOYEE_REQUEST_RESPONSE);
    }
    const employee = employeeResult.rows[0];
    const requestedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    try {
      await sendEmployeePasswordRequestEmail({
        to: ownerResult.rows[0].email,
        employeeName: employee.username,
        employeeUsername: employee.username,
        employeeEmail: employee.email,
        requestedAt,
        idempotencyKey: `employee-password-request/${crypto.createHash('sha256').update(`${employee.id}:${Math.floor(Date.now() / 60000)}`).digest('hex')}`
      });
      await writeActivity(db, { user: { userId: employee.id, username: employee.username }, action: 'auth.employee_password_change.requested', resource: '/auth/password-reset/employee-request', method: 'POST', status: 200, ip: req.ip, userAgent: req.get('user-agent') });
    } catch (error) {
      console.error('[password-reset] Employee password request email failed:', error.message);
      return res.status(503).json({ success: false, message: 'Could not notify the Owner right now. Please try again shortly.' });
    }
    return res.status(200).json(EMPLOYEE_REQUEST_RESPONSE);
  } catch (error) {
    console.error('[password-reset] Employee request failed:', error.message);
    return res.status(503).json({ success: false, message: 'Could not send the request right now. Please try again shortly.' });
  }
}

async function confirmPasswordReset(req, res) {
  const token = String(req.body?.token || '');
  const password = String(req.body?.password || '');
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).json({ success: false, message: 'This reset link is invalid or has expired.' });
  }
  if (password.length < 12 || password.length > 128) {
    return res.status(400).json({ success: false, message: 'Choose a password between 12 and 128 characters.' });
  }

  try {
    const db = await getDatabaseConnection('orders');
    await ensureSchema(db);
    await ensureAdminSecuritySchema(db);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await db.execute({
      sql: `SELECT t.user_id FROM password_reset_tokens t
        JOIN users u ON u.id = t.user_id
        JOIN admin_staff_access a ON a.user_id = u.id
        WHERE t.token_hash = ? AND t.used_at IS NULL
        AND t.expires_at > CURRENT_TIMESTAMP AND LOWER(TRIM(u.role)) = 'admin' AND a.staff_role = 'owner' AND a.is_active = 1 LIMIT 1`,
      args: [tokenHash]
    });
    if (!result.rows.length) {
      return res.status(400).json({ success: false, message: 'This reset link is invalid or has expired.' });
    }
    const userId = result.rows[0].user_id;
    if (await hasPasswordConflict(db, password, userId)) {
      return res.status(409).json({ success: false, message: 'Choose a password that is not used by an employee account.' });
    }
    const passwordHash = await hashPassword(password);
    const transaction = await db.transaction('write');
    try {
      const consumed = await transaction.execute({
        sql: `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP
          WHERE token_hash = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
        args: [tokenHash]
      });
      if (!consumed.rowsAffected) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'This reset link is invalid or has expired.' });
      }
      await transaction.execute({
        sql: 'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        args: [passwordHash, userId]
      });
      await transaction.execute({
        sql: 'UPDATE password_reset_tokens SET used_at = COALESCE(used_at, CURRENT_TIMESTAMP) WHERE user_id = ?',
        args: [userId]
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback().catch(() => {});
      throw error;
    } finally {
      transaction.close();
    }
    return res.status(200).json({ success: true, message: 'Password updated. You can now sign in.' });
  } catch (error) {
    logger.error('Password reset confirmation failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to reset the password right now. Please request a new link.' });
  }
}

module.exports = { requestPasswordReset, requestEmployeePasswordChange, confirmPasswordReset };
