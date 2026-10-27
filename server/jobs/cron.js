const cron = require('node-cron');
const { runArchiveJob } = require('./archive.job');
const logger = require('../utils/logger');

/**
 * Initialize all scheduled jobs
 */
const initializeJobs = () => {
  try {
    // Archive job - runs daily at midnight
    cron.schedule('0 0 * * *', () => {
      logger.info('Starting archive job for orders older than 30 days');
      runArchiveJob();
    }, {
      timezone: 'Asia/Kolkata'
    });

    logger.info('Scheduled jobs initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize scheduled jobs:', error);
    throw error;
  }
};

module.exports = {
  initializeJobs
};
