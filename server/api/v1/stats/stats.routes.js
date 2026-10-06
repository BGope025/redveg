const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middleware/auth.middleware');
const {
  getStats,
  getRevenueStats,
  getFinancialTransactions,
  createFinancialTransaction,
  deleteFinancialTransaction,
} = require('./stats.controller');

// Mount routes
router.use(protect, authorize('admin'));
router.get('/', getStats);
router.get('/revenue', getRevenueStats);
router.get('/financial-transactions', getFinancialTransactions);
router.post('/financial-transactions', createFinancialTransaction);
router.delete('/financial-transactions/:id', deleteFinancialTransaction);

module.exports = router;
