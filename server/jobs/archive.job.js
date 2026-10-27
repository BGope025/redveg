const { getDatabaseConnection } = require('../config/turso');
const logger = require('../utils/logger');

/**
 * Archive orders older than 30 days
 * Sets is_archived = 1 for orders where created_at < 30 days ago
 * This job runs nightly via node-cron
 */
const runArchiveJob = async () => {
  try {
    const ordersDb = await getDatabaseConnection('orders');

    // Update orders older than 30 days to is_archived = 1
    const result = await ordersDb.execute({
      sql: `
        UPDATE orders
        SET is_archived = 1
        WHERE is_archived = 0
        AND datetime(created_at) < datetime('now', '-30 days')
      `,
      args: [],
    });

    const rowsAffected = result.rowsAffected || 0;

    if (rowsAffected > 0) {
      logger.info(`Archive job completed: ${rowsAffected} orders archived`);
    } else {
      logger.info('Archive job completed: No orders to archive');
    }

    return {
      success: true,
      rowsAffected: rowsAffected,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Error in archive job:', error);
    throw error;
  }
};

module.exports = {
  runArchiveJob
};
