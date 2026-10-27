const express = require('express');
const router = express.Router();
const { registerCustomer, loginCustomer, getCustomerProfile, getAllCustomers, getCustomerSalesInvoices, updateCustomerSalesInvoicePayment, importCustomers, updateImportedCustomer } = require('./customers.controller');
const { authenticateCustomer } = require('../../../middleware/customer-auth.middleware');
const { authenticateFirebaseCustomer } = require('../../../middleware/firebase-customer-auth.middleware');
const { syncFirebaseCustomer, updateMyPhoneNumber, getMyProfile, getMyOrders, getMyFavorites, getMyCart, saveMyCart, addMyFavorite, deleteMyFavorite, requestMyOrderCancellation, createMyAddress, deleteMyAddress } = require('./customer-account.controller');
const { protect, authorize } = require('../../../middleware/auth.middleware');

// Public routes
router.post('/register', registerCustomer);
router.post('/login', loginCustomer);

// Firebase-authenticated storefront account routes. Identity always comes from the verified token.
router.post('/me/sync', authenticateFirebaseCustomer, syncFirebaseCustomer);
router.put('/me/phone', authenticateFirebaseCustomer, updateMyPhoneNumber);
router.get('/me', authenticateFirebaseCustomer, getMyProfile);
router.get('/me/orders', authenticateFirebaseCustomer, getMyOrders);
router.get('/me/favorites', authenticateFirebaseCustomer, getMyFavorites);
router.get('/me/cart', authenticateFirebaseCustomer, getMyCart);
router.put('/me/cart', authenticateFirebaseCustomer, saveMyCart);
router.put('/me/favorites/:productId', authenticateFirebaseCustomer, addMyFavorite);
router.delete('/me/favorites/:productId', authenticateFirebaseCustomer, deleteMyFavorite);
router.post('/me/orders/:orderId/cancellation-request', authenticateFirebaseCustomer, requestMyOrderCancellation);
router.post('/me/addresses', authenticateFirebaseCustomer, createMyAddress);
router.delete('/me/addresses/:addressId', authenticateFirebaseCustomer, deleteMyAddress);

// Protected routes
router.get('/profile', authenticateCustomer, getCustomerProfile);
router.post('/import', protect, authorize('admin'), importCustomers);
router.patch('/imported/:customerId', protect, authorize('admin'), updateImportedCustomer);
router.get('/:customerId/sales-invoices', protect, authorize('admin'), getCustomerSalesInvoices);
router.patch('/:customerId/sales-invoices/payment', protect, authorize('admin'), updateCustomerSalesInvoicePayment);
router.get('/', protect, authorize('admin'), getAllCustomers);

module.exports = router;
