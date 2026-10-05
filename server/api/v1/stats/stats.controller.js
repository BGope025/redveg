const { getDatabaseConnection } = require('../../../config/turso');
const { generateNotFoundError, generateValidationError } = require('../../../utils/error-classes');
const logger = require('../../../utils/logger');
const { ensureImportedSalesSchema } = require('./imported-sales.schema');
const { ensureCustomerInvoicePaymentsSchema } = require('../customers/customer-invoice-payments.schema');
const { createPaymentOverrideMap, getEffectiveInvoice, summarizeImportedInvoices } = require('../../../services/imported-sales-payments.service');

/**
 * Get stats for admin dashboard
 * @route GET /api/v1/stats
 */
const getStats = async (req, res) => {
  try {
    const ordersDb = await getDatabaseConnection('orders');

    // Get today's aggregates (Kolkata timezone)
    const todayStart = await ordersDb.execute({
      sql: "SELECT datetime('now', 'start of day', '-5 hours', '-30 minutes') as start",
      args: [],
    });
    const todayEnd = await ordersDb.execute({
      sql: "SELECT datetime('now', 'start of day', '+1 day', '-5 hours', '-30 minutes') as end",
      args: [],
    });
    const startToday = todayStart.rows[0].start;
    const endToday = todayEnd.rows[0].end;

    // Get yesterday's aggregates
    const yesterdayStart = await ordersDb.execute({
      sql: "SELECT datetime('now', 'start of day', '-1 day', '-5 hours', '-30 minutes') as start",
      args: [],
    });
    const yesterdayEnd = await ordersDb.execute({
      sql: "SELECT datetime('now', 'start of day', '0 days', '-5 hours', '-30 minutes') as end",
      args: [],
    });
    const startYesterday = yesterdayStart.rows[0].start;
    const endYesterday = yesterdayEnd.rows[0].end;

    // Query for today's confirmed orders
    const todayResult = await ordersDb.execute({
      sql: `
        SELECT
          COUNT(*) as order_count,
          COALESCE(SUM(total_amount), 0) as revenue
        FROM orders
        WHERE LOWER(status) IN ('approved', 'completed', 'delivered')
          AND created_at >= ?
          AND created_at < ?
      `,
      args: [startToday, endToday],
    });

    // Query for yesterday's confirmed orders
    const yesterdayResult = await ordersDb.execute({
      sql: `
        SELECT
          COUNT(*) as order_count,
          COALESCE(SUM(total_amount), 0) as revenue
        FROM orders
        WHERE LOWER(status) IN ('approved', 'completed', 'delivered')
          AND created_at >= ?
          AND created_at < ?
      `,
      args: [startYesterday, endYesterday],
    });

    // Query for pending orders (needs attention)
    const pendingResult = await ordersDb.execute({
      sql: `
        SELECT COUNT(*) as pending_count
        FROM orders
        WHERE is_archived = 0 AND LOWER(status) IN ('pending', 'new')
      `,
      args: [],
    });

    const todayOrderCount = todayResult.rows[0].order_count;
    const todayRevenue = parseFloat(todayResult.rows[0].revenue) || 0;
    const yesterdayOrderCount = yesterdayResult.rows[0].order_count;
    const yesterdayRevenue = parseFloat(yesterdayResult.rows[0].revenue) || 0;
    const pendingCount = pendingResult.rows[0].pending_count;

    // Calculate average order value for today
    const avgOrderValue = todayOrderCount > 0 ? todayRevenue / todayOrderCount : 0;

    // Calculate trend percentages
    const orderTrend = yesterdayOrderCount > 0 ? ((todayOrderCount - yesterdayOrderCount) / yesterdayOrderCount * 100) : 0;
    const revenueTrend = yesterdayRevenue > 0 ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue * 100) : 0;

    // Format values
    const formatINR = (num) => {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(num);
    };

    const stats = [
      {
        label: "Orders today",
        value: todayOrderCount.toString(),
        trend: `${orderTrend >= 0 ? '+' : ''}${orderTrend.toFixed(1)}%`,
        tone: orderTrend >= 0 ? "green" : "red",
      },
      {
        label: "Revenue today",
        value: formatINR(todayRevenue),
        trend: `${revenueTrend >= 0 ? '+' : ''}${revenueTrend.toFixed(1)}%`,
        tone: revenueTrend >= 0 ? "green" : "red",
      },
      {
        label: "Avg. order value",
        value: formatINR(avgOrderValue),
        trend: "--",
        tone: "amber",
      },
      {
        label: "Needs attention",
        value: pendingCount.toString(),
        trend: `${pendingCount} pending`,
        tone: pendingCount > 0 ? "amber" : "neutral",
      },
    ];

    res.status(200).json(stats);
  } catch (error) {
    logger.error('Error fetching stats:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get revenue time series data for analytics
 * @route GET /api/v1/stats/revenue
 */
const getRevenueStats = async (req, res) => {
  try {
    const { range, bucket, from, to } = req.query;
    const ordersDb = await getDatabaseConnection('orders');

    await ensureImportedSalesSchema(ordersDb);

    // Validate bucket
    const validBuckets = ['day', 'week', 'month'];
    if (bucket && !validBuckets.includes(bucket)) {
      return res.status(400).json({ success: false, message: 'Invalid bucket parameter' });
    }

    // Determine date range
    let startDate, endDate;
    if (from && to) {
      // Validate format YYYY-MM-DD
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(from) || !dateRegex.test(to)) {
        return res.status(400).json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD' });
      }
      startDate = from;
      endDate = to; // inclusive, we'll make exclusive by adding 1 day
    } else {
      // Use range parameter
      const now = new Date();
      let rangeStart, rangeEnd;
      switch (range) {
        case 'lifetime':
          // No lower bound, use earliest order date
          rangeStart = null; // we'll handle in query
          rangeEnd = now.toISOString().split('T')[0];
          break;
        case '12m':
          rangeStart = new Date(now);
          rangeStart.setMonth(rangeStart.getMonth() - 12);
          break;
        case '6m':
          rangeStart = new Date(now);
          rangeStart.setMonth(rangeStart.getMonth() - 6);
          break;
        case '30d':
          rangeStart = new Date(now);
          rangeStart.setDate(rangeStart.getDate() - 30);
          break;
        default:
          return res.status(400).json({ success: false, message: 'Invalid range parameter' });
      }
      if (rangeStart) {
        startDate = rangeStart.toISOString().split('T')[0];
      }
      endDate = now.toISOString().split('T')[0];
    }

    // Convert to Kolkata time UTC boundaries
    // Helper to convert Kolkata date string to UTC start of day
    const kolkataDateToUTCStart = (dateStr) => {
      // dateStr is YYYY-MM-DD, represents start of day in Kolkata
      // Convert to UTC: subtract 5 hours 30 minutes
      return `datetime('${dateStr}', '-5 hours', '-30 minutes')`;
    };
    const kolkataDateToUTCEnd = (dateStr) => {
      // end exclusive: start of next day in Kolkata, converted to UTC
      return `datetime('${dateStr}', '+1 day', '-5 hours', '-30 minutes')`;
    };

    let startUTC, endUTC;
    if (startDate) {
      startUTC = kolkataDateToUTCStart(startDate);
    } else {
      // lifetime: no lower bound, we'll use a very early date or null
      startUTC = null;
    }
    endUTC = kolkataDateToUTCEnd(endDate);

    // Build base query
    let sql = `
      SELECT
        `;
    // Depending on bucket, we need to group by period
    if (bucket === 'day') {
      sql += `strftime('%Y-%m-%d', datetime(created_at, '+5 hours', '+30 minutes')) as period,`;
    } else if (bucket === 'week') {
      sql += `strftime('%Y-%W', datetime(created_at, '+5 hours', '+30 minutes')) as period,`;
    } else if (bucket === 'month') {
      sql += `strftime('%Y-%m', datetime(created_at, '+5 hours', '+30 minutes')) as period,`;
    } else {
      // default to month if bucket not specified
      sql += `strftime('%Y-%m', datetime(created_at, '+5 hours', '+30 minutes')) as period,`;
    }
    sql += `
      COUNT(*) as order_count,
      SUM(total_amount) as revenue
      FROM orders
      WHERE LOWER(status) IN ('approved', 'completed', 'delivered')
    `;
    const args = [];

    // Add date filters
    if (startUTC) {
      sql += ` AND created_at >= ${startUTC}`;
    }
    if (endUTC) {
      sql += ` AND created_at < ${endUTC}`;
    }

    // Add grouping
    sql += ` GROUP BY period ORDER BY period`;

    // Execute query
    const result = await ordersDb.execute({ sql, args });

    // Lifetime earnings are all-time, independent of the selected chart range.
    // Archived orders remain included so historical records are not lost.
    const lifetimeResult = await ordersDb.execute({
      sql: `
        SELECT COALESCE(SUM(total_amount), 0) AS lifetime_revenue
        FROM orders
        WHERE LOWER(status) IN ('approved', 'completed', 'delivered')
      `,
      args: [],
    });


    const reportDateFilters = [];
    const reportDateArgs = [];
    if (startDate) {
      reportDateFilters.push('sale_date >= ?');
      reportDateArgs.push(startDate);
    }
    if (endDate) {
      reportDateFilters.push('sale_date <= ?');
      reportDateArgs.push(endDate);
    }
    const reportDateSql = reportDateFilters.length ? ' AND ' + reportDateFilters.join(' AND ') : '';
    const reportPeriodSql = bucket === 'day'
      ? "strftime('%Y-%m-%d', sale_date)"
      : bucket === 'week'
        ? "strftime('%Y-%W', sale_date)"
        : "strftime('%Y-%m', sale_date)";
    const reportInvoicesResult = await ordersDb.execute({
      sql: [
        'SELECT invoice_no, party_key, sale_date, transaction_type, payment_status, total_amount, received_amount, balance_amount,',
        '  ' + reportPeriodSql + ' AS period',
        'FROM imported_sales_invoices',
        'WHERE 1 = 1' + reportDateSql,
      ].join('\n'),
      args: reportDateArgs,
    });
    const customerDb = await getDatabaseConnection('customer');
    await ensureCustomerInvoicePaymentsSchema(customerDb);
    const overrideRowsResult = await customerDb.execute(`SELECT report_party_id, invoice_no, payment_status, received_amount, balance_amount, updated_at, updated_by
      FROM customer_invoice_payment_overrides`);
    const overrides = createPaymentOverrideMap(overrideRowsResult.rows);
    const reportRows = reportInvoicesResult.rows;
    const reportSummary = summarizeImportedInvoices(reportRows, overrides).overall;
    const activeReportRows = reportRows.filter((row) => {
      const invoice = getEffectiveInvoice(row, overrides);
      return String(row.transaction_type || '').trim().toLowerCase() === 'sale'
        && String(invoice.effective_payment_status || '').trim().toLowerCase() !== 'cancelled';
    });
    const reportDates = activeReportRows.map((row) => String(row.sale_date || '')).filter(Boolean).sort();
    const reportSummaryResult = { rows: [{
      invoice_count: reportSummary.invoiceCount,
      invoiced_amount: reportSummary.invoicedAmount,
      received_amount: reportSummary.clearedAmount,
      outstanding_amount: reportSummary.dueAmount,
      cancelled_invoice_count: reportSummary.cancelledInvoiceCount,
      report_from: reportDates[0] || null,
      report_to: reportDates[reportDates.length - 1] || null,
    }] };
    const reportPeriods = new Map();
    for (const row of activeReportRows) {
      const period = String(row.period || '');
      if (!period) continue;
      const invoice = getEffectiveInvoice(row, overrides);
      const point = reportPeriods.get(period) || { period, imported_invoiced: 0, imported_received: 0 };
      point.imported_invoiced += Number(row.total_amount) || 0;
      point.imported_received += Number(invoice.effective_received_amount) || 0;
      reportPeriods.set(period, point);
    }
    const reportSeriesResult = { rows: [...reportPeriods.values()] };

    // Format series
    const series = result.rows.map((row) => {
      let label = row.period;
      if (bucket === 'day') {
        // period is YYYY-MM-DD
        label = new Date(row.period).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      } else if (bucket === 'week') {
        // period is YYYY-WW (week number)
        // We'll approximate label as year and week number
        label = `Week ${row.period.split('-')[1]} ${row.period.split('-')[0]}`;
      } else if (bucket === 'month') {
        // period is YYYY-MM
        label = new Date(`${row.period}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      }
      return {
        period: row.period,
        label: label,
        revenue: parseFloat(row.revenue) || 0,
        orders: parseInt(row.order_count) || 0,
      };
    });


    const reportLabel = (period) => {
      if (bucket === 'day') return new Date(period).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      if (bucket === 'week') return 'Week ' + period.split('-')[1] + ' ' + period.split('-')[0];
      return new Date(period + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    };
    const chartSeriesByPeriod = new Map(series.map((item) => [item.period, { ...item, importedInvoiced: 0, importedCollected: 0 }]));
    for (const row of reportSeriesResult.rows) {
      const period = String(row.period);
      const point = chartSeriesByPeriod.get(period) || {
        period,
        label: reportLabel(period),
        revenue: 0,
        orders: 0,
        importedInvoiced: 0,
        importedCollected: 0,
      };
      point.importedInvoiced = Number.parseFloat(row.imported_invoiced) || 0;
      point.importedCollected = Number.parseFloat(row.imported_received) || 0;
      chartSeriesByPeriod.set(period, point);
    }
    const chartSeries = [...chartSeriesByPeriod.values()].sort((a, b) => a.period.localeCompare(b.period));

    // Determine overall summary for the range
    const totalRevenue = series.reduce((sum, s) => sum + s.revenue, 0);
    const totalOrders = series.reduce((sum, s) => sum + s.orders, 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const lifetimeRevenue = parseFloat(lifetimeResult.rows[0]?.lifetime_revenue) || 0;
    const importedRow = reportSummaryResult.rows[0] || {};
    const importedSales = {
      invoiceCount: Number(importedRow.invoice_count) || 0,
      invoicedAmount: Number((Number(importedRow.invoiced_amount) || 0).toFixed(2)),
      receivedAmount: Number((Number(importedRow.received_amount) || 0).toFixed(2)),
      outstandingAmount: Number((Number(importedRow.outstanding_amount) || 0).toFixed(2)),
      cancelledInvoiceCount: Number(importedRow.cancelled_invoice_count) || 0,
      reportFrom: importedRow.report_from || null,
      reportTo: importedRow.report_to || null,
    };

    const summary = {
      lifetimeRevenue: Math.round(lifetimeRevenue),
      periodRevenue: Math.round(totalRevenue),
      orderCount: totalOrders,
      averageOrderValue: Math.round(avgOrderValue),
      todayRevenue: 0, // we could compute today separately but not required for this endpoint
      thisMonthRevenue: 0,
      previousPeriodRevenue: 0,
      periodChangePercent: 0,
    };

    // If range is not lifetime, we could compute previous period for comparison, but skip for simplicity.

    res.status(200).json({
      success: true,
      data: {
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        range: range || 'custom',
        from: startDate || '',
        to: endDate,
        bucket: bucket || 'month',
        includedStatuses: ['approved', 'completed', 'delivered'],
        summary: summary,
        importedSales,
        series: chartSeries,
      },
    });
  } catch (error) {
    logger.error('Error fetching revenue stats:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  getStats,
  getRevenueStats,
};
