const db = require('../db');

async function getDashboard(req, res) {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [todayStats] = await db.query(`
      SELECT
        COALESCE(SUM(s.final_amount), 0) as revenue,
        COALESCE(SUM(si.line_profit), 0) as profit,
        COUNT(DISTINCT s.id) as bill_count,
        COALESCE(SUM(si.quantity), 0) as items_sold
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE DATE(s.created_at) = ?
    `, [today]);

    const [lowStockCount] = await db.query(`
      SELECT COUNT(*) as count FROM (
        SELECT m.id FROM medicines m
        LEFT JOIN stock_batches sb ON m.id = sb.medicine_id AND sb.quantity_in_stock > 0
        GROUP BY m.id HAVING COALESCE(SUM(sb.quantity_in_stock), 0) <= m.reorder_level
      ) t
    `);

    const [expiringCount] = await db.query(`
      SELECT COUNT(*) as count FROM stock_batches
      WHERE quantity_in_stock > 0 AND expiry_date IS NOT NULL
        AND expiry_date <= date('now', '+60 days')
    `);

    const [recentSales] = await db.query(`
      SELECT s.bill_number, s.final_amount, s.created_at, u.full_name as cashier_name
      FROM sales s JOIN users u ON s.cashier_id = u.id
      ORDER BY s.created_at DESC LIMIT 10
    `);

    const [topMeds] = await db.query(`
      SELECT m.name, SUM(si.quantity) as total_qty
      FROM sale_items si
      JOIN medicines m ON si.medicine_id = m.id
      JOIN sales s ON si.sale_id = s.id
      WHERE DATE(s.created_at) >= date('now', '-30 days')
      GROUP BY si.medicine_id ORDER BY total_qty DESC LIMIT 5
    `);

    res.json({
      today: todayStats[0] || { revenue: 0, profit: 0, bill_count: 0, items_sold: 0 },
      alerts: { low_stock: lowStockCount[0]?.count || 0, expiring_soon: expiringCount[0]?.count || 0 },
      recent_sales: recentSales || [],
      top_medicines: topMeds || [],
    });
  } catch (err) {
    console.error('[REPORT] Dashboard error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getSalesReport(req, res) {
  try {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date required' });
    }

    const [summary] = await db.query(`
      SELECT
        COALESCE(SUM(s.final_amount), 0) as total_revenue,
        COALESCE(SUM(si.line_profit), 0) as total_profit,
        COUNT(DISTINCT s.id) as total_bills,
        COALESCE(SUM(si.quantity), 0) as total_items,
        COALESCE(AVG(s.final_amount), 0) as avg_bill_value,
        COALESCE(SUM(s.discount_amount), 0) as total_discount
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
    `, [start_date, end_date]);

    const [dailyTrend] = await db.query(`
      SELECT DATE(s.created_at) as date,
        SUM(s.final_amount) as revenue,
        SUM(si.line_profit) as profit,
        COUNT(DISTINCT s.id) as bills
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
      GROUP BY DATE(s.created_at) ORDER BY date
    `, [start_date, end_date]);

    const [topMeds] = await db.query(`
      SELECT m.name, SUM(si.quantity) as total_qty, SUM(si.line_total) as revenue, SUM(si.line_profit) as profit
      FROM sale_items si
      JOIN medicines m ON si.medicine_id = m.id
      JOIN sales s ON si.sale_id = s.id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
      GROUP BY si.medicine_id ORDER BY total_qty DESC LIMIT 10
    `, [start_date, end_date]);

    const [paymentBreakdown] = await db.query(`
      SELECT payment_method, SUM(final_amount) as amount, COUNT(*) as count
      FROM sales WHERE DATE(created_at) BETWEEN ? AND ?
      GROUP BY payment_method
    `, [start_date, end_date]);

    const [cashierBreakdown] = await db.query(`
      SELECT u.full_name, SUM(s.final_amount) as revenue, COUNT(s.id) as bills
      FROM sales s JOIN users u ON s.cashier_id = u.id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
      GROUP BY s.cashier_id ORDER BY revenue DESC
    `, [start_date, end_date]);

    res.json({
      summary: summary[0] || { total_revenue: 0, total_profit: 0, total_bills: 0, total_items: 0, avg_bill_value: 0, total_discount: 0 },
      daily_trend: dailyTrend || [],
      top_medicines: topMeds || [],
      payment_breakdown: paymentBreakdown || [],
      cashier_breakdown: cashierBreakdown || [],
    });
  } catch (err) {
    console.error('[REPORT] Sales report error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getDaySummary(req, res) {
  try {
    const date = req.params.date || new Date().toISOString().slice(0, 10);

    const [summary] = await db.query(`
      SELECT
        COALESCE(SUM(s.final_amount), 0) as total_revenue,
        COALESCE(SUM(si.line_profit), 0) as total_profit,
        COUNT(DISTINCT s.id) as bill_count,
        COALESCE(SUM(si.quantity), 0) as items_sold
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE DATE(s.created_at) = ?
    `, [date]);

    const [returns] = await db.query(`
      SELECT COALESCE(SUM(refund_amount), 0) as total_refunds, COUNT(*) as return_count
      FROM returns WHERE DATE(created_at) = ?
    `, [date]);

    const [cashierBreakdown] = await db.query(`
      SELECT u.full_name, SUM(s.final_amount) as revenue, COUNT(s.id) as bills
      FROM sales s JOIN users u ON s.cashier_id = u.id
      WHERE DATE(s.created_at) = ?
      GROUP BY s.cashier_id
    `, [date]);

    const [paymentBreakdown] = await db.query(`
      SELECT payment_method, SUM(final_amount) as amount, COUNT(*) as count
      FROM sales WHERE DATE(created_at) = ? GROUP BY payment_method
    `, [date]);

    const [topMeds] = await db.query(`
      SELECT m.name, SUM(si.quantity) as total_qty, SUM(si.line_profit) as profit
      FROM sale_items si
      JOIN medicines m ON si.medicine_id = m.id
      JOIN sales s ON si.sale_id = s.id
      WHERE DATE(s.created_at) = ?
      GROUP BY si.medicine_id ORDER BY total_qty DESC LIMIT 10
    `, [date]);

    res.json({
      date,
      summary: summary[0] || { total_revenue: 0, total_profit: 0, bill_count: 0, items_sold: 0 },
      returns: returns[0] || { total_refunds: 0, return_count: 0 },
      net_sales: parseFloat(summary[0]?.total_revenue || 0) - parseFloat(returns[0]?.total_refunds || 0),
      cashier_breakdown: cashierBreakdown || [],
      payment_breakdown: paymentBreakdown || [],
      top_medicines: topMeds || [],
    });
  } catch (err) {
    console.error('[REPORT] Day summary error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getStockValuation(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT m.name, m.category,
        SUM(sb.quantity_in_stock) as total_units,
        SUM(sb.quantity_in_stock * sb.purchase_rate_per_unit) as stock_value,
        SUM(sb.quantity_in_stock * sb.selling_rate_per_unit) as retail_value
      FROM medicines m
      JOIN stock_batches sb ON m.id = sb.medicine_id
      WHERE sb.quantity_in_stock > 0
      GROUP BY m.id ORDER BY stock_value DESC
    `);

    const [totals] = await db.query(`
      SELECT
        COALESCE(SUM(quantity_in_stock), 0) as total_units,
        COALESCE(SUM(quantity_in_stock * purchase_rate_per_unit), 0) as total_value,
        COALESCE(SUM(quantity_in_stock * selling_rate_per_unit), 0) as total_retail
      FROM stock_batches WHERE quantity_in_stock > 0
    `);

    res.json({ items: rows || [], totals: totals[0] || { total_units: 0, total_value: 0, total_retail: 0 } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function getProfitMargins(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT m.name, m.category,
        SUM(si.quantity) as units_sold,
        SUM(si.line_total) as revenue,
        SUM(si.line_profit) as profit,
        CASE WHEN SUM(si.line_total) > 0
          THEN ROUND((SUM(si.line_profit) / SUM(si.line_total)) * 100, 2)
          ELSE 0 END as margin_percent
      FROM sale_items si
      JOIN medicines m ON si.medicine_id = m.id
      JOIN sales s ON si.sale_id = s.id
      GROUP BY si.medicine_id
      ORDER BY profit DESC LIMIT 50
    `);
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getDashboard, getSalesReport, getDaySummary, getStockValuation, getProfitMargins };
