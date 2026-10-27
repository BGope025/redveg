const express = require('express');
const { protect, authorize } = require('../../../middleware/auth.middleware');
const { getActiveDeliverySlots, getAdminDeliverySlots, createDeliverySlot, updateDeliverySlot } = require('./delivery-slots.controller');

const router = express.Router();
router.get('/', getActiveDeliverySlots);
router.get('/admin', protect, authorize('admin'), getAdminDeliverySlots);
router.post('/admin', protect, authorize('admin'), createDeliverySlot);
router.patch('/admin/:id', protect, authorize('admin'), updateDeliverySlot);

module.exports = router;
