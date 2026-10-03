const express = require('express');
const router = express.Router();
const { registerCustomer, loginCustomer, getCustomerProfile, getAllCustomers, getCustomerSalesInvoices, updateCustomerSalesInvoicePayment } = require('./customers.controller');
const { authenticateCustomer } = require('../../../middleware/customer-auth.middleware');
const { protect, authorize } = require('../../../middleware/auth.middleware');

// Public routes
router.post('/register', registerCustomer);
router.post('/login', loginCustomer);

// Protected routes
router.get('/profile', authenticateCustomer, getCustomerProfile);
router.get('/:customerId/sales-invoices', protect, authorize('admin'), getCustomerSalesInvoices);
router.patch('/:customerId/sales-invoices/payment', protect, authorize('admin'), updateCustomerSalesInvoicePayment);
router.get('/', protect, authorize('admin'), getAllCustomers);

module.exports = router;
