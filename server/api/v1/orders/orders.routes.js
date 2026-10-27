const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middleware/auth.middleware');
const { authenticateCustomer } = require('../../../middleware/customer-auth.middleware');
const { authenticateFirebaseCustomer } = require('../../../middleware/firebase-customer-auth.middleware');
const {
  createOrder,
  verifyRazorpayPayment,
  getOnlinePaymentAvailability,
  getOrderById,
  approveOrder,
  getUserOrders,
  getAllOrders,
  cancelOrder,
  updateOrderStatus,
  updateOrderItems,
  updateOrderPayment,
  reviewOrderCancellation,
  deleteOrder
} = require('./orders.controller');
const { createManualOrder, searchManualCustomers } = require('./manual-orders.controller');

// Public checkout; the controller validates the supplied delivery details.
router.post('/checkout', authenticateFirebaseCustomer, createOrder);
router.post('/verify-payment', authenticateFirebaseCustomer, verifyRazorpayPayment);
router.get('/online-payment-status', authenticateFirebaseCustomer, getOnlinePaymentAvailability);

// Legacy customer-token order history must be checked before admin auth.
router.get('/customer/orders', authenticateCustomer, getUserOrders);

// Protected routes
router.use(protect);

// Admin only routes
router.use(authorize('admin'));
router.get('/manual/customers', searchManualCustomers);
router.post('/manual', createManualOrder);
router.get('/', getAllOrders); // Get all orders with filtering/pagination
router.delete('/:id', deleteOrder); // Archive/delete order
router.patch('/:id/approve', approveOrder);
router.patch('/:id/cancel', cancelOrder);
router.patch('/:id/status', updateOrderStatus);
router.patch('/:id/items', updateOrderItems);
router.patch('/:id/payment', updateOrderPayment);
router.patch('/:id/cancellation-review', reviewOrderCancellation);

// Order details remain protected for admin review.
router.get('/:id', getOrderById);

module.exports = router;
