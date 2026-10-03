function paymentValidationError(message) {
  const error = new Error(message);
  error.type = 'validation-error';
  return error;
}

function calculatePaymentUpdate(totalValue, statusValue, dueValue) {
  const totalAmount = Number(totalValue);
  const status = typeof statusValue === 'string' ? statusValue.trim().toLowerCase() : '';
  const rawDue = Number(dueValue);

  if (!Number.isFinite(totalAmount) || totalAmount < 0 || !Number.isFinite(rawDue)) {
    throw paymentValidationError('A valid invoice total and due amount are required');
  }
  if (!['paid', 'partial', 'unpaid'].includes(status)) {
    throw paymentValidationError('Payment status must be paid, partial, or unpaid');
  }

  const roundedTotal = Number(totalAmount.toFixed(2));
  if (rawDue < 0 || rawDue > roundedTotal) {
    throw paymentValidationError('Due amount must be between zero and the invoice total');
  }
  const dueAmount = Number(rawDue.toFixed(2));
  if (status === 'paid' && dueAmount !== 0) {
    throw paymentValidationError('Paid invoices must have zero due');
  }
  if (status === 'unpaid' && dueAmount !== roundedTotal) {
    throw paymentValidationError('Unpaid invoices must have the full invoice total due');
  }
  if (status === 'partial' && (dueAmount <= 0 || dueAmount >= roundedTotal)) {
    throw paymentValidationError('Partial payment requires a due amount between zero and the invoice total');
  }

  return {
    paymentStatus: status === 'partial' ? 'Partial' : status === 'paid' ? 'Paid' : 'Unpaid',
    receivedAmount: Number((roundedTotal - dueAmount).toFixed(2)),
    dueAmount,
  };
}

module.exports = { calculatePaymentUpdate };
