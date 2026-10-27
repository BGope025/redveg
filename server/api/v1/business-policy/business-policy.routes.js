const express = require('express');
const { protect, authorize } = require('../../../middleware/auth.middleware');
const { getBusinessPolicy, updateBusinessPolicy } = require('./business-policy.controller');

const router = express.Router();
router.get('/', getBusinessPolicy);
router.put('/', protect, authorize('admin'), updateBusinessPolicy);

module.exports = router;
