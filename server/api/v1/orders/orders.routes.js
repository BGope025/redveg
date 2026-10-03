const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middleware/auth.middleware');
const { authenticateCustomer } = require('../../../middleware/customer-auth.middleware');
const {
  createOrder,
  getOrderById,
  approveOrder,
  getUserOrders,
  getAllOrders,
  cancelOrder,
  updateOrderStatus,
  updateOrderPayment,
  deleteOrder
} = require('./orders.controller');

// Public guest checkout; the controller validates the supplied delivery details.
router.post('/checkout', createOrder);

// Protected routes
router.use(protect);

// Admin only routes
router.use(authorize('admin'));
router.get('/', getAllOrders); // Get all orders with filtering/pagination
router.delete('/:id', deleteOrder); // Archive/delete order
router.patch('/:id/approve', approveOrder);
router.patch('/:id/cancel', cancelOrder);
router.patch('/:id/status', updateOrderStatus);
router.patch('/:id/payment', updateOrderPayment);

// User routes
router.get('/customer/orders', authenticateCustomer, getUserOrders);
router.get('/:id', getOrderById);

module.exports = router;
