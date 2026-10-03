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
  lines.push('', '*Items:*');

  (Array.isArray(cartItems) ? cartItems : []).forEach((item, index) => {
    const variant = [item.size, item.weight].filter(Boolean).join(' / ') || 'Standard';
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.price) || 0;
    lines.push(`${index + 1}. *${item.name || 'Product'}* — ${variant} × ${quantity} @ ${money(unitPrice)} = ${money(unitPrice * quantity)}`);
  });

  lines.push('', `*Subtotal:* ${money(subtotalAmount)}`);
  if (couponCode && Number(discountAmount) > 0) lines.push(`*Coupon (${couponCode}):* −${money(discountAmount)}`);
  lines.push(`*Delivery:* ${Number(deliveryFee) > 0 ? money(deliveryFee) : 'FREE'}`);
  lines.push(`*Total:* ${money(totalAmount)}`, '', 'Please confirm this order and payment with me on WhatsApp. The order is saved as pending until RedVeg confirms it.');
  return lines.join('\n');
}

module.exports = { generateWhatsAppMessage };
