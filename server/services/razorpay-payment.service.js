const Razorpay = require('razorpay');
const { createHmac, randomUUID, timingSafeEqual } = require('node:crypto');

const razorpayConfigured = () => Boolean(
  process.env.RAZORPAY_KEY_ID?.trim() &&
  process.env.RAZORPAY_KEY_SECRET?.trim()
);

function getRazorpayClient() {
  if (!razorpayConfigured()) throw new Error('Online payments are not configured yet.');
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID.trim(),
    key_secret: process.env.RAZORPAY_KEY_SECRET.trim(),
  });
}

async function createRazorpayOrder({ orderId, amount }) {
  const client = getRazorpayClient();
  const amountInPaise = Math.round(Number(amount) * 100);
  if (!Number.isSafeInteger(amountInPaise) || amountInPaise < 100) throw new Error('Online payments must be at least ₹1.00.');
  const receipt = `rv_${randomUUID().replace(/-/g, '')}`;
  const result = await client.orders.create({
    amount: amountInPaise,
    currency: 'INR',
    receipt,
    notes: { redveg_order_id: orderId },
  });
  if (!result?.id || Number(result.amount) !== amountInPaise || result.currency !== 'INR') {
    throw new Error('Razorpay returned mismatched order details.');
  }
  return result;
}

function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !orderId || !paymentId || typeof signature !== 'string') return false;
  const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest();
  let received;
  try { received = Buffer.from(signature, 'hex'); } catch { return false; }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function fetchRazorpayPayment(paymentId) {
  return getRazorpayClient().payments.fetch(paymentId);
}

async function captureRazorpayPayment(paymentId, amountInPaise) {
  return getRazorpayClient().payments.capture(paymentId, amountInPaise, 'INR');
}

module.exports = { razorpayConfigured, createRazorpayOrder, verifyPaymentSignature, fetchRazorpayPayment, captureRazorpayPayment };
