const express = require('express');
const router = express.Router();

// Import all v1 route modules
const authRoutes = require('./v1/auth/auth.routes');
const categoriesRoutes = require('./v1/categories/categories.routes');
const healthRoutes = require('./v1/health/health.routes');
const mediaRoutes = require('./v1/media/media.routes');
const ordersRoutes = require('./v1/orders/orders.routes');
const productsRoutes = require('./v1/products/products.routes');
const uiRoutes = require('./v1/ui/ui.routes');
const usersRoutes = require('./v1/users/users.routes');
const variantsRoutes = require('./v1/variants/variants.routes');
const customersRoutes = require('./v1/customers/customers.routes');
const settingsRoutes = require('./v1/settings/settings.routes');
const campaignsRoutes = require('./v1/campaigns/campaigns.routes');
const deliveryLocationsRoutes = require('./v1/delivery-locations/delivery-locations.routes');
const statsRoutes = require('./v1/stats/stats.routes');
const adminDeliveryLocationsRoutes = require('./v1/admin/delivery-locations/delivery-locations.routes');
const adminProductsRoutes = require('./v1/admin/products/products.routes');
const adminVariantsRoutes = require('./v1/admin/variants/variants.routes');
const couponsRoutes = require('./v1/coupons/coupons.routes');
const deliveryFeesRoutes = require('./v1/delivery-fees/delivery-fees.routes');
const deliverySlotsRoutes = require('./v1/delivery-slots/delivery-slots.routes');
const seoRoutes = require('./v1/seo/seo.routes');
const adminStaffRoutes = require('./v1/admin/staff/staff.routes');
const adminCustomerCartsRoutes = require('./v1/admin/customer-carts/customer-carts.routes');
const businessPolicyRoutes = require('./v1/business-policy/business-policy.routes');

// Mount all routes
router.use('/auth', authRoutes);
router.use('/categories', categoriesRoutes);
router.use('/health', healthRoutes);
router.use('/media', mediaRoutes);
router.use('/orders', ordersRoutes);
router.use('/products', productsRoutes);
router.use('/ui', uiRoutes);
router.use('/users', usersRoutes);
router.use('/variants', variantsRoutes);
router.use('/customers', customersRoutes);
router.use('/coupons', couponsRoutes);
router.use('/delivery-fees', deliveryFeesRoutes);
router.use('/delivery-slots', deliverySlotsRoutes);
router.use('/seo', seoRoutes);
router.use('/settings', settingsRoutes);
router.use('/campaigns', campaignsRoutes);
router.use('/delivery-locations', deliveryLocationsRoutes);
router.use('/stats', statsRoutes);
router.use('/admin/delivery-locations', adminDeliveryLocationsRoutes);
router.use('/admin/products', adminProductsRoutes);
router.use('/admin/variants', adminVariantsRoutes);
router.use('/admin/staff', adminStaffRoutes);
router.use('/admin/customer-carts', adminCustomerCartsRoutes);
router.use('/business-policy', businessPolicyRoutes);

// Health check endpoint (for Render.com sleep prevention)
router.get('/health/ping', (req, res) => {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

module.exports = router;
