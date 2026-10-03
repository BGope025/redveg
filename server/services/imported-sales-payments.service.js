function paymentKey(reportPartyId, invoiceNo) {
  return `${String(reportPartyId || '')}\u0000${String(invoiceNo || '')}`;
}

function createPaymentOverrideMap(rows = []) {
  const overrides = new Map();
  for (const row of rows) {
    overrides.set(paymentKey(row.report_party_id, row.invoice_no), row);
  }
  return overrides;
}

function getEffectiveInvoice(row, overrides) {
  const override = overrides.get(paymentKey(row.party_key, row.invoice_no));
  return {
    ...row,
    effective_payment_status: override?.payment_status ?? row.payment_status,
    effective_received_amount: override?.received_amount ?? row.received_amount,
    effective_balance_amount: override?.balance_amount ?? row.balance_amount,
    payment_updated_at: override?.updated_at ?? null,
    payment_updated_by: override?.updated_by ?? null,
    is_overridden: Boolean(override),
  };
}

function emptySummary() {
  return {
    invoiceCount: 0,
    invoicedAmount: 0,
    paidInvoiceCount: 0,
    partialInvoiceCount: 0,
    unpaidInvoiceCount: 0,
    clearedAmount: 0,
    dueAmount: 0,
    cancelledInvoiceCount: 0,
  };
}

function addInvoiceToSummary(summary, row, overrides) {
  const invoice = getEffectiveInvoice(row, overrides);
  const transactionType = String(invoice.transaction_type || '').trim().toLowerCase();
  const paymentStatus = String(invoice.effective_payment_status || '').trim().toLowerCase();
  if (transactionType.includes('cancelled') || paymentStatus === 'cancelled') {
    summary.cancelledInvoiceCount += 1;
    return invoice;
  }
  if (transactionType !== 'sale') return invoice;

  summary.invoiceCount += 1;
  summary.invoicedAmount += Number(invoice.total_amount) || 0;
  if (paymentStatus === 'paid') summary.paidInvoiceCount += 1;
  else if (paymentStatus === 'partial') summary.partialInvoiceCount += 1;
  else if (paymentStatus === 'unpaid') summary.unpaidInvoiceCount += 1;
  summary.clearedAmount += Number(invoice.effective_received_amount) || 0;
  summary.dueAmount += Number(invoice.effective_balance_amount) || 0;
  return invoice;
}

function summarizeImportedInvoices(rows = [], overrides = new Map()) {
  const overall = emptySummary();
  const byParty = new Map();
  for (const row of rows) {
    addInvoiceToSummary(overall, row, overrides);
    const partyId = String(row.party_key || '');
    if (!partyId) continue;
    if (!byParty.has(partyId)) byParty.set(partyId, emptySummary());
    addInvoiceToSummary(byParty.get(partyId), row, overrides);
  }
  for (const summary of [overall, ...byParty.values()]) {
    summary.clearedAmount = Number(summary.clearedAmount.toFixed(2));
    summary.dueAmount = Number(summary.dueAmount.toFixed(2));
    summary.invoicedAmount = Number(summary.invoicedAmount.toFixed(2));
  }
  return { overall, byParty };
}

module.exports = { paymentKey, createPaymentOverrideMap, getEffectiveInvoice, summarizeImportedInvoices };
