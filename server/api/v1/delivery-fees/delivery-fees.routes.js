const express = require('express');
const { getPricing, quote } = require('./delivery-fees.controller');
const router = express.Router();

router.get('/pricing', getPricing);
router.post('/quote', quote);

module.exports = router;
