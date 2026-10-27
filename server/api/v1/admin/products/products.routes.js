const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../../middleware/auth.middleware');
const {
  getAdminProducts,
  createProduct,
  updateProduct,
  deleteProduct
} = require('../../products/products.controller');
const { createVariant } = require('../../variants/variants.controller');

router.use(protect);
router.use(authorize('admin'));

router.get('/', getAdminProducts);
router.post('/', createProduct);
router.put('/:id', updateProduct);
router.delete('/:id', deleteProduct);
router.post('/:id/variants', (req, res, next) => {
  req.params.productId = req.params.id;
  return createVariant(req, res, next);
});

module.exports = router;
