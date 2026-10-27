const crypto = require('crypto');
const { getDatabaseConnection } = require('../../../../config/turso');
const { hashPassword, comparePassword } = require('../../../../utils/password.utils');
const { PERMISSIONS, ensureAdminSecuritySchema, hasPasswordConflict, writeActivity } = require('../../../../services/admin-security.service');

const STAFF_ROLES = ['admin', 'editor', 'customer_support', 'data_entry'];

function validatePermissions(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((permission) => !PERMISSIONS.includes(permission))) {
    const error = new Error('Choose valid employee permissions.');
    error.status = 400;
    throw error;
  }
  return Array.from(new Set(value));
}

function validateRolePermissions(role, permissions) {
  const forbiddenByRole = {
    editor: ['orders.manual_create', 'payments.manage', 'reports.finance', 'staff.manage', 'activity.read'],
    customer_support: ['orders.manual_create', 'catalog.prices', 'payments.manage', 'reports.finance', 'staff.manage', 'activity.read'],
    data_entry: ['orders.manual_create', 'catalog.prices', 'payments.manage', 'reports.finance', 'staff.manage', 'activity.read']
  };
  const allowlist = {
    customer_support: ['orders.read', 'orders.edit', 'orders.status', 'customers.read', 'customers.manage', 'carts.read'],
    data_entry: ['orders.read', 'orders.edit', 'orders.status', 'customers.read', 'customers.manage', 'carts.read']
  };
  const disallowedByRole = permissions.find((permission) => allowlist[role] && !allowlist[role].includes(permission));
  if (disallowedByRole) {
    const error = new Error(`${role.replace(/_/g, ' ')} accounts cannot receive the ${disallowedByRole} permission.`);
    error.status = 400;
    throw error;
  }
  const forbidden = permissions.find((permission) => forbiddenByRole[role]?.includes(permission));
  if (forbidden) {
    const error = new Error(`${role.replace(/_/g, ' ')} accounts cannot receive the ${forbidden} permission.`);
    error.status = 400;
    throw error;
  }
}

async function getStaff(req, res) {
  try {
    const db = await getDatabaseConnection('orders');
    await ensureAdminSecuritySchema(db);
    const result = await db.execute(`SELECT u.id, u.username, u.email, u.phone,
      a.staff_role AS role, a.permissions_json, a.is_active, a.created_at, a.updated_at, a.last_login_at
      FROM users u JOIN admin_staff_access a ON a.user_id = u.id
      WHERE LOWER(TRIM(u.role)) = 'admin' ORDER BY a.created_at DESC`);
    res.status(200).json({
      success: true,
      data: result.rows.map((row) => ({
        ...row,
        permissions: row.role === 'owner' ? ['*'] : validatePermissions(JSON.parse(row.permissions_json || '[]')),
        is_active: Number(row.is_active) === 1
      }))
    });
  } catch (error) {
    console.error('[admin-staff] list failed:', error.message);
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Unable to load employee accounts.' });
  }
}

async function createStaff(req, res) {
  try {
    if (req.user.role !== 'owner') return res.status(403).json({ success: false, message: 'Only the Owner can create employee accounts and set their initial passwords.' });
    const username = String(req.body?.username || req.body?.email || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    const password = String(req.body?.password || '');
    const role = String(req.body?.role || 'data_entry');
    const permissions = validatePermissions(req.body?.permissions);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone || !username) {
      return res.status(400).json({ success: false, message: 'Enter a valid employee email, username, and phone number.' });
    }
    if (!STAFF_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Choose a valid employee role. Owner access is assigned separately.' });
    }
    if (password.length < 12 || password.length > 128) {
      return res.status(400).json({ success: false, message: 'Set an employee password between 12 and 128 characters.' });
    }
    validateRolePermissions(role, permissions);
    if (req.user.role !== 'owner' && permissions.some((permission) => !req.user.permissions.includes(permission))) {
      return res.status(403).json({ success: false, message: 'You can only assign permissions that you already have.' });
    }

    const db = await getDatabaseConnection('orders');
    await ensureAdminSecuritySchema(db);
    if (await hasPasswordConflict(db, password)) {
      return res.status(409).json({ success: false, message: 'Choose a password that is different from the Owner and every other employee password.' });
    }
    const existing = await db.execute({
      sql: 'SELECT id FROM users WHERE username = ? OR LOWER(email) = LOWER(?) OR phone = ? LIMIT 1',
      args: [username, email, phone]
    });
    if (existing.rows.length) return res.status(409).json({ success: false, message: 'An account already uses that username, email, or phone.' });

    const userId = `USR-${crypto.randomUUID()}`;
    const passwordHash = await hashPassword(password);
    const transaction = await db.transaction('write');
    try {
      await transaction.execute({
        sql: 'INSERT INTO users (id, username, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
        args: [userId, username, email, phone, passwordHash, 'admin']
      });
      await transaction.execute({
        sql: `INSERT INTO admin_staff_access (user_id, staff_role, permissions_json, is_active, created_by, updated_by)
          VALUES (?, ?, ?, 0, ?, ?)`,
        args: [userId, role, JSON.stringify(permissions), req.user.userId, req.user.userId]
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback().catch(() => {});
      throw error;
    } finally {
      transaction.close();
    }
    await writeActivity(db, { user: req.user, action: 'staff.created', resource: userId, method: req.method, status: 201, ip: req.ip, userAgent: req.get('user-agent') });
    res.status(201).json({ success: true, message: 'Employee account created with its own password. Activate it when the employee is ready to sign in.', data: { id: userId, username, email, phone, role, permissions, is_active: false } });
  } catch (error) {
    console.error('[admin-staff] create failed:', error.message);
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Unable to create the employee account.' });
  }
}

async function setStaffPassword(req, res) {
  const staffId = String(req.params.id || '');
  const password = String(req.body?.password || '');
  if (req.user.role !== 'owner') return res.status(403).json({ success: false, message: 'Only the Owner can set employee passwords.' });
  if (password.length < 12 || password.length > 128) {
    return res.status(400).json({ success: false, message: 'Set a password between 12 and 128 characters.' });
  }
  try {
    const db = await getDatabaseConnection('orders');
    await ensureAdminSecuritySchema(db);
    const target = await db.execute({
      sql: `SELECT u.id, u.username FROM users u JOIN admin_staff_access a ON a.user_id = u.id
        WHERE u.id = ? AND LOWER(TRIM(u.role)) = 'admin' AND a.staff_role != 'owner' LIMIT 1`,
      args: [staffId]
    });
    if (!target.rows.length) return res.status(404).json({ success: false, message: 'Employee account not found.' });
    if (await hasPasswordConflict(db, password, staffId)) {
      return res.status(409).json({ success: false, message: 'Choose a password that is different from the Owner and every other employee password.' });
    }
    const passwordHash = await hashPassword(password);
    await db.execute({ sql: 'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', args: [passwordHash, staffId] });
    await writeActivity(db, { user: req.user, action: 'staff.password_updated', resource: staffId, method: req.method, status: 200, ip: req.ip, userAgent: req.get('user-agent') });
    res.status(200).json({ success: true, message: `Password updated for ${target.rows[0].username}.` });
  } catch (error) {
    console.error('[admin-staff] password update failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to set the employee password.' });
  }
}

async function deleteStaff(req, res) {
  const staffId = String(req.params.id || '');
  if (req.user.role !== 'owner') return res.status(403).json({ success: false, message: 'Only the Owner can remove employee accounts.' });
  if (staffId === req.user.userId) return res.status(400).json({ success: false, message: 'You cannot remove your own Owner account.' });
  try {
    const db = await getDatabaseConnection('orders');
    await ensureAdminSecuritySchema(db);
    const result = await db.execute({
      sql: `SELECT u.id, u.username, a.staff_role FROM users u
        JOIN admin_staff_access a ON a.user_id = u.id
        WHERE u.id = ? AND LOWER(TRIM(u.role)) = 'admin' LIMIT 1`,
      args: [staffId]
    });
    const employee = result.rows[0];
    if (!employee) return res.status(404).json({ success: false, message: 'Employee account not found.' });
    if (employee.staff_role === 'owner') return res.status(400).json({ success: false, message: 'The Owner account cannot be removed as an employee.' });

    const transaction = await db.transaction('write');
    try {
      await transaction.execute({ sql: 'DELETE FROM admin_staff_access WHERE user_id = ?', args: [staffId] });
      const deletedUser = await transaction.execute({
        sql: "DELETE FROM users WHERE id = ? AND LOWER(TRIM(role)) = 'admin'",
        args: [staffId]
      });
      if (!deletedUser.rowsAffected) {
        await transaction.rollback();
        return res.status(409).json({ success: false, message: 'The employee account changed before removal. Refresh and try again.' });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback().catch(() => {});
      throw error;
    } finally {
      transaction.close();
    }
    await writeActivity(db, { user: req.user, action: 'staff.deleted', resource: staffId, method: req.method, status: 200, ip: req.ip, userAgent: req.get('user-agent') });
    return res.status(200).json({ success: true, message: `Employee account for ${employee.username} was removed. Their existing activity history is retained.` });
  } catch (error) {
    console.error('[admin-staff] delete failed:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to remove the employee account.' });
  }
}

async function updateStaff(req, res) {
  const staffId = String(req.params.id || '');
  const updates = req.body || {};
  try {
    const db = await getDatabaseConnection('orders');
    await ensureAdminSecuritySchema(db);
    const currentResult = await db.execute({
      sql: `SELECT a.user_id, a.staff_role, a.permissions_json, a.is_active
        FROM admin_staff_access a JOIN users u ON u.id = a.user_id
        WHERE a.user_id = ? AND LOWER(TRIM(u.role)) = 'admin' LIMIT 1`,
      args: [staffId]
    });
    const current = currentResult.rows[0];
    if (!current) return res.status(404).json({ success: false, message: 'Employee account not found.' });

    const role = updates.role === undefined ? current.staff_role : String(updates.role);
    const permissions = updates.permissions === undefined
      ? JSON.parse(current.permissions_json || '[]')
      : validatePermissions(updates.permissions);
    const isActive = updates.is_active === undefined ? Number(current.is_active) === 1 : Boolean(updates.is_active);
    validateRolePermissions(role, permissions);
    if (isActive && role !== 'owner' && permissions.length === 0) {
      return res.status(400).json({ success: false, message: 'Assign at least one permission before activating this employee.' });
    }
    if (role !== current.staff_role || updates.permissions !== undefined) {
      if (req.user.role !== 'owner') {
        if (role === 'owner' || (role !== current.staff_role) || permissions.some((permission) => !req.user.permissions.includes(permission))) {
          return res.status(403).json({ success: false, message: 'Only the Owner can change employee roles. You may grant only permissions you already have.' });
        }
      }
      if (!STAFF_ROLES.includes(role) && role !== 'owner') {
        return res.status(400).json({ success: false, message: 'Choose a valid employee role.' });
      }
      if (role === 'owner' && current.staff_role !== 'owner') {
        return res.status(400).json({ success: false, message: 'Owner access is already assigned. Transfer of ownership must be completed as a separate verified action.' });
      }
    }
    if (staffId === req.user.userId && (!isActive || role !== current.staff_role || JSON.stringify(permissions) !== current.permissions_json)) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate or change your own role and permissions.' });
    }
    if (current.staff_role === 'owner' && role !== 'owner') {
      return res.status(400).json({ success: false, message: 'The Owner role cannot be removed through this endpoint.' });
    }

    await db.execute({
      sql: `UPDATE admin_staff_access SET staff_role = ?, permissions_json = ?, is_active = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?`,
      args: [role, JSON.stringify(permissions), isActive ? 1 : 0, req.user.userId, staffId]
    });
    await writeActivity(db, { user: req.user, action: isActive ? 'staff.updated' : 'staff.deactivated', resource: staffId, method: req.method, status: 200, ip: req.ip, userAgent: req.get('user-agent') });
    res.status(200).json({ success: true, message: 'Employee access updated.', data: { id: staffId, role, permissions, is_active: isActive } });
  } catch (error) {
    console.error('[admin-staff] update failed:', error.message);
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Unable to update employee access.' });
  }
}

async function getActivity(req, res) {
  try {
    const db = await getDatabaseConnection('orders');
    await ensureAdminSecuritySchema(db);
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 250);
    const result = await db.execute({
      sql: `SELECT id, actor_user_id, actor_username, action, resource, http_method, http_status, ip_address, created_at
        FROM admin_activity_logs ORDER BY created_at DESC LIMIT ?`,
      args: [limit]
    });
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('[admin-staff] activity lookup failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to load activity history.' });
  }
}

async function claimOwner(req, res) {
  const currentPassword = String(req.body?.currentPassword || '');
  if (!currentPassword) return res.status(400).json({ success: false, message: 'Confirm your current password to set up the Owner account.' });
  try {
    const db = await getDatabaseConnection('orders');
    await ensureAdminSecuritySchema(db);
    const owners = await db.execute(`SELECT user_id FROM admin_staff_access WHERE staff_role = 'owner' LIMIT 1`);
    if (owners.rows.length) return res.status(409).json({ success: false, message: 'An Owner account has already been set up.' });
    const account = await db.execute({
      sql: 'SELECT password_hash FROM users WHERE id = ? AND LOWER(TRIM(role)) = ?',
      args: [req.user.userId, 'admin']
    });
    if (!account.rows.length || !(await comparePassword(currentPassword, account.rows[0].password_hash))) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }
    const updated = await db.execute({
      sql: `UPDATE admin_staff_access SET staff_role = 'owner', permissions_json = '["*"]', updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND staff_role = 'admin' AND NOT EXISTS (SELECT 1 FROM admin_staff_access WHERE staff_role = 'owner')`,
      args: [req.user.userId, req.user.userId]
    });
    if (!updated.rowsAffected) return res.status(409).json({ success: false, message: 'Owner setup was completed by another session. Refresh and sign in again.' });
    await db.execute({
      sql: `UPDATE admin_staff_access SET permissions_json = '[]', updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id != ? AND staff_role = 'admin'`,
      args: [req.user.userId, req.user.userId]
    });
    await writeActivity(db, { user: req.user, action: 'staff.owner_claimed', resource: req.user.userId, method: req.method, status: 200, ip: req.ip, userAgent: req.get('user-agent') });
    res.status(200).json({ success: true, message: 'This account now has Owner access. Sign in again to refresh your permissions.' });
  } catch (error) {
    console.error('[admin-staff] owner setup failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to set up the Owner account.' });
  }
}

module.exports = { claimOwner, createStaff, deleteStaff, getActivity, getStaff, setStaffPassword, updateStaff };
