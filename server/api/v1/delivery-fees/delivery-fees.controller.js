const { DeliveryQuoteError, quoteDeliveryFee, getDeliveryPricingSettings } = require('../../../services/delivery-fee.service');

async function getPricing(req, res) {
  try {
    const settings = await getDeliveryPricingSettings();
    return res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('Unable to read delivery pricing settings:', error);
    return res.status(503).json({ success: false, message: 'Delivery pricing is temporarily unavailable.' });
  }
}

async function quote(req, res) {
  try {
    const destination = req.body?.destination || {};
    if (!destination.pincode && !(Number.isFinite(Number(destination.latitude)) && Number.isFinite(Number(destination.longitude)))) {
      return res.status(400).json({ success: false, message: 'Choose a delivery pincode or location to calculate the fee.' });
    }
    // Prefer a verified street route, then use the serviceable pincode point as
    // a clearly identified estimate when a street-level geocoder match is unavailable.
    const data = await quoteDeliveryFee(destination, { subtotalAmount: req.body?.subtotalAmount });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof DeliveryQuoteError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Unable to quote delivery fee:', error);
    return res.status(500).json({ success: false, message: 'Unable to calculate delivery distance right now.' });
  }
}

module.exports = { getPricing, quote };
