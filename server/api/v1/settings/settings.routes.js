const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middleware/auth.middleware');
const {
  getSetting,
  upsertSetting,
  deleteSetting
} = require('./settings.controller');

// Public routes for getting settings
router.get('/:type', getSetting);

// Protected routes for updating/deleting settings (require authentication)
router.use(protect, authorize('admin'));

router.put('/:type', upsertSetting); // Update or create setting
router.delete('/:type', deleteSetting); // Delete setting (reset to default)

module.exports = router;


