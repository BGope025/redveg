const { getDeliveryPricingSettings, updateDeliveryPricingSettings } = require('../../../services/delivery-fee.service');

async function getBusinessPolicy(req, res) {
  try {
    return res.status(200).json({ success: true, data: await getDeliveryPricingSettings() });
  } catch (error) {
    console.error('Business order policy read failed:', error);
    return res.status(503).json({ success: false, message: 'Business delivery settings are temporarily unavailable.' });
  }
}

async function updateBusinessPolicy(req, res) {
  try {
    const data = await updateDeliveryPricingSettings(req.body || {});
    return res.status(200).json({ success: true, message: 'Delivery settings saved to the live database.', data });
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    console.error('Business order policy update failed:', error);
    return res.status(status).json({ success: false, message: status === 400 ? error.message : 'Could not save delivery settings.' });
  }
}

module.exports = { getBusinessPolicy, updateBusinessPolicy };
