const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../../middleware/auth.middleware');
const {
  getAllAdminVariants,
  updateVariant,
  deleteVariant
} = require('../../variants/variants.controller');

router.use(protect);
router.use(authorize('admin'));

router.get('/', getAllAdminVariants);
router.put('/:id', updateVariant);
router.delete('/:id', deleteVariant);

module.exports = router;
