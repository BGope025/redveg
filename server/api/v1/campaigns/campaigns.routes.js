const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middleware/auth.middleware');
const {
  getCampaigns,
  getStorefrontOffers,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  resolveActiveCampaign
} = require('./campaigns.controller');

// Public routes
router.get('/', getCampaigns); // Get campaigns with filtering
router.get('/storefront', getStorefrontOffers); // Public, active offers for the customer storefront
router.get('/active', resolveActiveCampaign); // Get active campaign based on time/location/device
router.get('/:id', getCampaignById); // Get specific campaign by ID

// Protected routes (require authentication)
router.use(protect, authorize('admin'));

router.post('/', createCampaign); // Create new campaign
router.put('/:id', updateCampaign); // Update campaign
router.delete('/:id', deleteCampaign); // Delete campaign

module.exports = router;

