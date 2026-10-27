function money(value) {
  return `₹${(Number(value) || 0).toFixed(2)}`;
}

function generateWhatsAppMessage({
  orderId,
  customerName,
  customerPhone,
  customerAddress,
  cartItems,
  totalAmount,
  subtotalAmount,
  discountAmount = 0,
  deliveryFee = 0,
  deliveryDistanceKm = null,
  deliveryRatePerKm = 10,
  deliverySlotName,
  deliverySlotTime,
  paymentMethod,
  couponCode,
}) {
  const lines = [
    '*RedVeg Order Request*',
    '',
    `*Order ID:* ${orderId}`,
    '*Order status:* Pending',
    `*Customer:* ${customerName}`,
  ];
  if (customerPhone) lines.push(`*Phone:* ${customerPhone}`);
  if (customerAddress) lines.push(`*Delivery address:* ${customerAddress}`);
  if (deliverySlotName && deliverySlotTime) lines.push(`*Delivery slot:* ${deliverySlotName} · ${deliverySlotTime}`);
  if (paymentMethod) {
    const isOnline = String(paymentMethod).toLowerCase() === 'online';
    lines.push(`*Payment method:* ${isOnline ? 'Online via Razorpay' : 'Cash'}`);
    if (isOnline) lines.push('*Payment status:* Pending gateway confirmation. RedVeg updates this automatically after Razorpay confirms payment.');
  }
  lines.push('', '*Items:*');

  (Array.isArray(cartItems) ? cartItems : []).forEach((item, index) => {
    const variant = [item.size, item.weight].filter(Boolean).join(' / ') || 'Standard';
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.price) || 0;
    lines.push(`${index + 1}. *${item.name || 'Product'}* — ${variant} × ${quantity} @ ${money(unitPrice)} = ${money(unitPrice * quantity)}`);
  });

  lines.push('', `*Subtotal:* ${money(subtotalAmount)}`);
  if (couponCode && Number(discountAmount) > 0) lines.push(`*Coupon (${couponCode}):* −${money(discountAmount)}`);
  lines.push(`*Delivery:* ${Number(deliveryDistanceKm) > 0 ? `${Number(deliveryDistanceKm).toFixed(2)} km × ${money(deliveryRatePerKm)}/km = ${money(deliveryFee)}` : money(deliveryFee)}`);
  lines.push(`*Total:* ${money(totalAmount)}`, '', 'Please confirm this order on WhatsApp. The order is saved as pending until RedVeg confirms it.');
  return lines.join('\n');
}

module.exports = { generateWhatsAppMessage };
