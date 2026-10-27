const { getDatabaseConnection } = require('../../../config/turso');
const { generateNotFoundError, generateValidationError } = require('../../../utils/error-classes');
const logger = require('../../../utils/logger');

const settingsSchemaReady = new WeakMap();

async function ensureSettingsSchema(db) {
  if (!settingsSchemaReady.has(db)) {
    const initialization = db.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        type TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).catch((error) => {
      settingsSchemaReady.delete(db);
      throw error;
    });
    settingsSchemaReady.set(db, initialization);
  }
  await settingsSchemaReady.get(db);
}

const HEADER_THEME_IDS = new Set([
  'default', 'diwali', 'durga-puja', 'holi', 'eid', 'christmas', 'onam', 'pongal', 'independence-day'
]);

/**
 * Get settings by type
 * @route GET /api/v1/settings/:type
 */
const getSetting = async (req, res) => {
  try {
    const { type } = req.params;
    
    // Validate type
    if (!type) {
      throw generateValidationError('Settings type is required');
    }

    const db = await getDatabaseConnection('catalog');
    await ensureSettingsSchema(db);

    // Get setting by type
    const result = await db.execute({
      sql: 'SELECT * FROM settings WHERE type = ? LIMIT 1',
      args: [type]
    });

    if (result.rows.length === 0) {
      // Return default values based on type
      let defaultValue = null;
      if (type === 'header-theme') {
        defaultValue = 'default';
      }
      
      return res.status(200).json({
        success: true,
        data: {
          type,
          value: defaultValue
        }
      });
    }

    const setting = result.rows[0];
    
    res.status(200).json({
      success: true,
      data: {
        type: setting.type,
        value: setting.value
      }
    });
  } catch (error) {
    if (error.type === 'validation-error') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error fetching setting:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Update or create setting
 * @route PUT /api/v1/settings/:type
 */
const upsertSetting = async (req, res) => {
  try {
    const { type } = req.params;
    const { value } = req.body;

    // Validate input
    if (!type) {
      throw generateValidationError('Settings type is required');
    }
    
    if (value === undefined) {
      throw generateValidationError('Settings value is required');
    }

    // Only allow known settings to be updated via this endpoint
    const allowedTypes = ['header-theme', 'store-status'];
    if (!allowedTypes.includes(type)) {
      throw generateValidationError(`Settings type "${type}" is not updatable via this endpoint`);
    }

    if (type === 'header-theme' && (typeof value !== 'string' || !HEADER_THEME_IDS.has(value))) {
      throw generateValidationError('Choose a valid storefront header theme.');
    }
    if (typeof value !== 'string' || value.length > 500) {
      throw generateValidationError('Settings value must be a string of 500 characters or fewer.');
    }

    const db = await getDatabaseConnection('catalog');
    await ensureSettingsSchema(db);
    await db.execute({
      sql: `INSERT INTO settings (type, value, created_at, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(type) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      args: [type, value]
    });

    logger.info(`Setting saved: ${type}`);

    res.status(200).json({
      success: true,
      message: `Setting ${type} saved successfully`,
      data: {
        type,
        value
      }
    });
  } catch (error) {
    if (error.type === 'validation-error') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error saving setting:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Delete setting (reset to default)
 * @route DELETE /api/v1/settings/:type
 */
const deleteSetting = async (req, res) => {
  try {
    const { type } = req.params;

    // Validate input
    if (!type) {
      throw generateValidationError('Settings type is required');
    }

    // Only allow known settings to be deleted via this endpoint
    const allowedTypes = ['header-theme', 'store-status'];
    if (!allowedTypes.includes(type)) {
      throw generateValidationError(`Settings type "${type}" is not deletable via this endpoint`);
    }

    const db = await getDatabaseConnection('catalog');
    await ensureSettingsSchema(db);

    // Delete setting
    await db.execute({
      sql: 'DELETE FROM settings WHERE type = ?',
      args: [type]
    });

    logger.info(`Setting deleted: ${type}`);

    res.status(200).json({
      success: true,
      message: `Setting ${type} reset to default`
    });
  } catch (error) {
    if (error.type === 'validation-error') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error deleting setting:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getSetting,
  upsertSetting,
  deleteSetting
};


