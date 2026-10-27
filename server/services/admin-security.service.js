const { randomUUID } = require('crypto');
const { comparePassword } = require('../utils/password.utils');

const PERMISSIONS = [
  'dashboard.read',
  'orders.read',
  'orders.edit',
  'orders.status',
  'orders.cancellations',
  'orders.archive',
  'orders.manual_create',
  'payments.manage',
  'catalog.read',
  'catalog.manage',
  'catalog.prices',
  'campaigns.manage',
  'coupons.manage',
  'customers.read',
  'customers.manage',
  'carts.read',
  'reports.read',
  'reports.finance',
  'delivery.manage',
  'settings.manage',
  'staff.manage',
  'activity.read',
  'content.manage'
];

const ADMIN_ROLES = ['owner', 'admin', 'editor', 'customer_support', 'data_entry'];
const LEGACY_ADMIN_PERMISSIONS = JSON.stringify(PERMISSIONS);
let schemaPromise;

async function ensureAdminSecuritySchema(db) {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await db.execute(`CREATE TABLE IF NOT EXISTS admin_staff_access (
        user_id TEXT PRIMARY KEY,
        staff_role TEXT NOT NULL DEFAULT 'admin',
        permissions_json TEXT NOT NULL DEFAULT '[]',
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_by TEXT,
        updated_by TEXT,
        last_login_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`);
      await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_staff_one_owner
        ON admin_staff_access(staff_role) WHERE staff_role = 'owner'`);
      await db.execute(`CREATE TABLE IF NOT EXISTS admin_activity_logs (
        id TEXT PRIMARY KEY,
        actor_user_id TEXT,
        actor_username TEXT,
        action TEXT NOT NULL,
        resource TEXT,
        http_method TEXT,
        http_status INTEGER,
        ip_address TEXT,
        user_agent TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_admin_activity_created ON admin_activity_logs(created_at)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_admin_activity_actor ON admin_activity_logs(actor_user_id, created_at)');

      // Preserve access for existing admin accounts. New staff accounts are
      // created with an explicit role and permission list by the staff API.
      const legacyAdmins = await db.execute(`SELECT id FROM users WHERE LOWER(TRIM(role)) = 'admin'`);
      for (const account of legacyAdmins.rows) {
        await db.execute({
          sql: `INSERT OR IGNORE INTO admin_staff_access
            (user_id, staff_role, permissions_json, is_active)
            VALUES (?, 'admin', ?, 1)`,
          args: [account.id, LEGACY_ADMIN_PERMISSIONS]
        });
      }

      // A single existing admin is the unambiguous owner bootstrap case.
      const staffCount = await db.execute('SELECT COUNT(*) AS count FROM admin_staff_access');
      const ownerCount = await db.execute(`SELECT COUNT(*) AS count FROM admin_staff_access WHERE staff_role = 'owner'`);
      if (Number(staffCount.rows[0]?.count) === 1 && Number(ownerCount.rows[0]?.count) === 0) {
        await db.execute(`UPDATE admin_staff_access SET staff_role = 'owner', permissions_json = '["*"]'
          WHERE user_id = (SELECT user_id FROM admin_staff_access LIMIT 1)`);
      }
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

function parsePermissions(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

async function getStaffAccess(db, userId) {
  await ensureAdminSecuritySchema(db);
  const result = await db.execute({
    sql: `SELECT u.id, u.username, u.email, u.phone, u.role AS account_role,
      a.staff_role, a.permissions_json, a.is_active
      FROM users u LEFT JOIN admin_staff_access a ON a.user_id = u.id WHERE u.id = ? LIMIT 1`,
    args: [userId]
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row,
    role: row.staff_role || row.account_role,
    permissions: parsePermissions(row.permissions_json),
    isAdminStaff: Boolean(row.staff_role)
  };
}

async function hasPasswordConflict(db, password, excludeUserId = null) {
  const result = await db.execute({
    sql: `SELECT u.id, u.password_hash FROM users u
      JOIN admin_staff_access a ON a.user_id = u.id
      WHERE LOWER(TRIM(u.role)) = 'admin' AND u.password_hash IS NOT NULL AND u.password_hash != ''
        AND (? IS NULL OR u.id != ?)`,
    args: [excludeUserId, excludeUserId]
  });
  for (const row of result.rows) {
    if (await comparePassword(password, row.password_hash)) return true;
  }
  return false;
}

function permissionsForRequest(req) {
  const method = String(req.method || 'GET').toUpperCase();
  const path = String(req.originalUrl || req.baseUrl || '').split('?')[0].replace(/^\/api\/v1/, '');
  const pathLower = path.toLowerCase();

  if (pathLower.startsWith('/orders')) {
    if (pathLower.includes('/manual')) return ['orders.manual_create'];
    if (method === 'GET') return ['orders.read'];
    if (pathLower.includes('/payment')) return ['payments.manage'];
    if (pathLower.includes('/cancellation-review')) return ['orders.cancellations'];
    if (pathLower.endsWith('/items')) return ['orders.edit'];
    if (pathLower.endsWith('/approve') || pathLower.endsWith('/status') || pathLower.endsWith('/cancel')) return ['orders.status'];
    if (method === 'DELETE') return ['orders.archive'];
    return ['orders.edit'];
  }
  if (pathLower.startsWith('/stats')) {
    // The dashboard summary contains revenue and average-order-value metrics.
    return ['reports.finance'];
  }
  if (pathLower.startsWith('/admin/staff/activity')) return ['activity.read'];
  if (pathLower.startsWith('/admin/customer-carts')) return ['carts.read'];
  if (pathLower.startsWith('/customers/') && pathLower.includes('/sales-invoices/payment')) return ['payments.manage'];
  if (pathLower.startsWith('/customers/') && pathLower.includes('/sales-invoices')) return ['reports.finance'];
  if (pathLower.startsWith('/customers')) return [method === 'GET' ? 'customers.read' : 'customers.manage'];
  if (pathLower.startsWith('/campaigns')) return ['campaigns.manage'];
  if (pathLower.startsWith('/coupons')) return ['coupons.manage'];
  if (pathLower.startsWith('/admin/delivery-locations') || pathLower.startsWith('/delivery-locations') || pathLower.startsWith('/delivery-slots') || pathLower.startsWith('/delivery-fees')) return ['delivery.manage'];
  if (pathLower.startsWith('/categories')) return ['catalog.manage'];
  if (pathLower.startsWith('/products') || pathLower.startsWith('/variants') || pathLower.startsWith('/admin/products') || pathLower.startsWith('/admin/variants')) {
    if (method === 'GET') return ['catalog.read'];
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const variantPayloads = Array.isArray(body.variants) ? body.variants : [];
    const changesPrice = ['price', 'basePrice', 'base_price', 'unit_price', 'salePrice'].some((key) => Object.prototype.hasOwnProperty.call(body, key))
      || variantPayloads.some((variant) => variant && ['price', 'basePrice', 'base_price', 'unit_price', 'salePrice'].some((key) => Object.prototype.hasOwnProperty.call(variant, key)));
    return changesPrice ? ['catalog.manage', 'catalog.prices'] : ['catalog.manage'];
  }
  if (pathLower.startsWith('/media')) return ['content.manage'];
  if (pathLower.startsWith('/settings') || pathLower.startsWith('/ui') || pathLower.startsWith('/seo') || pathLower.startsWith('/business-policy')) return ['settings.manage'];
  if (pathLower === '/users' && method === 'GET') return ['staff.manage'];
  if (pathLower === '/users' && method === 'POST') return ['customers.manage'];
  if (pathLower.startsWith('/users/')) return [method === 'GET' ? 'customers.read' : 'customers.manage'];
  if (pathLower.startsWith('/admin/staff')) return ['staff.manage'];
  // Fail closed for new or unmapped admin endpoints until their permission is
  // explicitly assigned here.
  return ['__unmapped_admin_route__'];
}

function hasPermission(user, permission) {
  if (user?.role === 'owner') return true;
  const allowedByRole = {
    customer_support: ['orders.read', 'orders.edit', 'orders.status', 'customers.read', 'customers.manage', 'carts.read'],
    data_entry: ['orders.read', 'orders.edit', 'orders.status', 'customers.read', 'customers.manage', 'carts.read']
  };
  if (allowedByRole[user?.role] && !allowedByRole[user.role].includes(permission)) return false;
  const forbiddenByRole = {
    editor: ['orders.manual_create', 'payments.manage', 'reports.finance', 'staff.manage', 'activity.read'],
    customer_support: ['orders.manual_create', 'catalog.prices', 'payments.manage', 'reports.finance', 'staff.manage', 'activity.read'],
    data_entry: ['orders.manual_create', 'catalog.prices', 'payments.manage', 'reports.finance', 'staff.manage', 'activity.read']
  };
  if (forbiddenByRole[user?.role]?.includes(permission)) return false;
  const assigned = Array.isArray(user?.permissions) ? user.permissions : [];
  // Creating a manual order requires reading the live catalog to select a
  // product and variant; keep that API capability bundled with this grant.
  if (permission === 'catalog.read' && assigned.includes('orders.manual_create')) return true;
  return assigned.includes('*') || assigned.includes(permission);
}

async function writeActivity(db, entry) {
  try {
    await ensureAdminSecuritySchema(db);
    await db.execute({
      sql: `INSERT INTO admin_activity_logs
        (id, actor_user_id, actor_username, action, resource, http_method, http_status, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        randomUUID(), entry.user?.userId || null, entry.user?.username || null,
        String(entry.action || 'unknown').slice(0, 120), String(entry.resource || '').slice(0, 300) || null,
        entry.method || null, Number(entry.status) || null, entry.ip || null,
        String(entry.userAgent || '').slice(0, 500) || null
      ]
    });
  } catch (error) {
    // Activity logging must not break the business operation being audited.
    console.error('[admin-security] activity log write failed:', error.message);
  }
}

module.exports = {
  ADMIN_ROLES,
  PERMISSIONS,
  permissionsForRequest,
  ensureAdminSecuritySchema,
  getStaffAccess,
  hasPasswordConflict,
  hasPermission,
  writeActivity
};
