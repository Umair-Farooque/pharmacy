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
        SELECT m.id, SUM(sb.quantity_in_stock) as total_stock, MAX(m.reorder_level) as reorder_level
        FROM medicines m
        LEFT JOIN stock_batches sb ON m.id = sb.medicine_id AND sb.quantity_in_stock > 0
        GROUP BY m.id
        HAVING COALESCE(total_stock, 0) <= reorder_level
      ) t
    `);

    const [expiringCount] = await db.query(`
      SELECT COUNT(*) as count FROM stock_batches
      WHERE quantity_in_stock > 0 AND expiry_date IS NOT NULL
        AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 60 DAY)
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
      WHERE DATE(s.created_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
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
    const { start_date, end_date, medicine_id } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date required' });
    }

    const dateCondition = 'DATE(s.created_at) BETWEEN ? AND ?';
    const dateParams = [start_date, end_date];

    let medicineCondition = '';
    let medicineParams = [];
    if (medicine_id) {
      medicineCondition = ' AND si.medicine_id = ?';
      medicineParams = [medicine_id];
    }

    const summaryWhere = `WHERE ${dateCondition}${medicineCondition}`;
    const summaryParams = [...dateParams, ...medicineParams];

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
      ${summaryWhere}
    `, summaryParams);

    const [dailyTrend] = await db.query(`
      SELECT DATE(s.created_at) as date,
        SUM(s.final_amount) as revenue,
        SUM(si.line_profit) as profit,
        COUNT(DISTINCT s.id) as bills
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE ${dateCondition}${medicineCondition}
      GROUP BY DATE(s.created_at) ORDER BY date
    `, summaryParams);

    let topMedsWhere = `WHERE DATE(s.created_at) BETWEEN ? AND ?`;
    let topMedsParams = [start_date, end_date];
    if (medicine_id) {
      topMedsWhere += ' AND si.medicine_id = ?';
      topMedsParams.push(medicine_id);
    }

    const [topMeds] = await db.query(`
      SELECT m.name, SUM(si.quantity) as total_qty, SUM(si.line_total) as revenue, SUM(si.line_profit) as profit
      FROM sale_items si
      JOIN medicines m ON si.medicine_id = m.id
      JOIN sales s ON si.sale_id = s.id
      ${topMedsWhere}
      GROUP BY si.medicine_id ORDER BY total_qty DESC LIMIT 10
    `, topMedsParams);

    let paymentWhere = `WHERE ${dateCondition}`;
    let paymentParams = [...dateParams];
    if (medicine_id) {
      paymentWhere = `WHERE s.id IN (SELECT DISTINCT si2.sale_id FROM sale_items si2 WHERE si2.medicine_id = ?)`;
      paymentParams = [medicine_id, ...dateParams];
    }
    const [paymentBreakdown] = await db.query(`
      SELECT payment_method, SUM(final_amount) as amount, COUNT(*) as count
      FROM sales s
      ${paymentWhere}
      GROUP BY payment_method
    `, paymentParams);

    let cashierWhere = `WHERE ${dateCondition}`;
    let cashierParams = [...dateParams];
    if (medicine_id) {
      cashierWhere = `WHERE s.id IN (SELECT DISTINCT si2.sale_id FROM sale_items si2 WHERE si2.medicine_id = ?)`;
      cashierParams = [medicine_id, ...dateParams];
    }
    const [cashierBreakdown] = await db.query(`
      SELECT u.full_name, SUM(s.final_amount) as revenue, COUNT(s.id) as bills
      FROM sales s JOIN users u ON s.cashier_id = u.id
      ${cashierWhere}
      GROUP BY s.cashier_id ORDER BY revenue DESC
    `, cashierParams);

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
    const query1 = `
      SELECT m.name, m.category,
        COALESCE(SUM(sb.quantity_in_stock), 0) as total_units,
        COALESCE(SUM(sb.quantity_in_stock * sb.purchase_rate_per_unit), 0) as stock_value,
        COALESCE(SUM(sb.quantity_in_stock), 0) * COALESCE(m.current_selling_price, 0) as retail_value
      FROM medicines m
      INNER JOIN stock_batches sb ON m.id = sb.medicine_id AND sb.quantity_in_stock > 0
      GROUP BY m.id ORDER BY stock_value DESC
    `;
    const [rows] = await db.query(query1);

    const query2 = `
      SELECT
        COALESCE(SUM(quantity_in_stock), 0) as total_units,
        COALESCE(SUM(quantity_in_stock * purchase_rate_per_unit), 0) as total_value
      FROM stock_batches WHERE quantity_in_stock > 0
    `;
    const [totals] = await db.query(query2);

    const query3 = `
      SELECT AVG(current_selling_price) as avg_price FROM medicines WHERE current_selling_price IS NOT NULL
    `;
    const [medAvg] = await db.query(query3);

    const query4 = `
      SELECT COALESCE(SUM(quantity_in_stock), 0) as total FROM stock_batches WHERE quantity_in_stock > 0
    `;
    const [totalStock] = await db.query(query4);

    const totalRetail = parseFloat(totalStock[0]?.total || 0) * parseFloat(medAvg[0]?.avg_price || 0);

    res.json({
      items: rows || [],
      totals: { total_units: totals[0]?.total_units || 0, total_value: totals[0]?.total_value || 0, total_retail: totalRetail }
    });
  } catch (err) {
    console.error('[REPORT] Stock valuation error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getProfitMargins(req, res) {
  try {
    const { start_date, end_date } = req.query;

    const start = start_date || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const end = end_date || new Date().toISOString().slice(0, 10);

    const [rows] = await db.query(`
      SELECT m.name, m.category,
        SUM(si.quantity) as units_sold,
        SUM(si.line_total) as revenue,
        SUM(si.quantity * si.purchase_rate_per_unit) as cost,
        SUM(si.line_profit) as profit,
        CASE WHEN SUM(si.line_total) > 0
          THEN ROUND((SUM(si.line_profit) / SUM(si.line_total)) * 100, 2)
          ELSE 0 END as margin_percent
      FROM sale_items si
      JOIN medicines m ON si.medicine_id = m.id
      JOIN sales s ON si.sale_id = s.id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
      GROUP BY si.medicine_id, m.name, m.category
      ORDER BY profit DESC
    `, [start, end]);

    const [totals] = await db.query(`
      SELECT
        COALESCE(SUM(si.quantity), 0) as total_units,
        COALESCE(SUM(si.line_total), 0) as total_revenue,
        COALESCE(SUM(si.quantity * si.purchase_rate_per_unit), 0) as total_cost,
        COALESCE(SUM(si.line_profit), 0) as total_profit
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
    `, [start, end]);

    const totalRevenue = parseFloat(totals[0]?.total_revenue || 0);
    const totalProfit = parseFloat(totals[0]?.total_profit || 0);

    res.json({
      period: { start_date: start, end_date: end },
      summary: {
        total_medicines: rows.length,
        total_units: parseInt(totals[0]?.total_units || 0),
        total_revenue: totalRevenue,
        total_cost: parseFloat(totals[0]?.total_cost || 0),
        total_profit: totalProfit,
        avg_margin: totalRevenue > 0 ? parseFloat(((totalProfit / totalRevenue) * 100).toFixed(2)) : 0,
      },
      items: rows || [],
    });
  } catch (err) {
    console.error('[REPORT] Profit margins error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getExpiryAlerts(req, res) {
  try {
    const { days } = req.query;
    const alertDays = parseInt(days) || 60;

    const [rows] = await db.query(`
      SELECT m.name, m.category, sb.batch_no, sb.quantity_in_stock,
        sb.expiry_date, sb.purchase_rate_per_unit, m.current_selling_price as selling_rate_per_unit,
        DATEDIFF(sb.expiry_date, CURDATE()) as days_remaining,
        s.name as supplier_name
      FROM stock_batches sb
      JOIN medicines m ON sb.medicine_id = m.id
      LEFT JOIN suppliers s ON sb.supplier_id = s.id
      WHERE sb.quantity_in_stock > 0 AND sb.expiry_date IS NOT NULL
      ORDER BY days_remaining ASC
    `);

    res.json({ items: rows || [], alert_days: alertDays });
  } catch (err) {
    console.error('[REPORT] Expiry alerts error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getLowStockAlerts(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT m.name, m.category, m.reorder_level, m.pack_size,
        COALESCE(SUM(sb.quantity_in_stock), 0) as total_stock,
        m.current_selling_price as selling_rate_per_unit,
        COALESCE(SUM(sb.quantity_in_stock * sb.purchase_rate_per_unit), 0) as stock_value
      FROM medicines m
      LEFT JOIN stock_batches sb ON m.id = sb.medicine_id AND sb.quantity_in_stock > 0
      GROUP BY m.id, m.name, m.category, m.reorder_level, m.pack_size, m.current_selling_price
      HAVING total_stock <= m.reorder_level OR total_stock = 0
      ORDER BY total_stock ASC
    `);

    res.json({ items: rows || [] });
  } catch (err) {
    console.error('[REPORT] Low stock error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getPurchaseHistory(req, res) {
  try {
    const { start_date, end_date, medicine_id, supplier_id, batch_id, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const filterParams = [];
    let filterSql = '';
    if (start_date) { filterSql += ' AND DATE(sb.purchase_date) >= ?'; filterParams.push(start_date); }
    if (end_date) { filterSql += ' AND DATE(sb.purchase_date) <= ?'; filterParams.push(end_date); }
    if (medicine_id) { filterSql += ' AND sb.medicine_id = ?'; filterParams.push(medicine_id); }
    if (supplier_id) { filterSql += ' AND sb.supplier_id = ?'; filterParams.push(supplier_id); }
    if (batch_id) { filterSql += ' AND sb.id = ?'; filterParams.push(batch_id); }

    let sql = `
      SELECT
        sb.id as batch_id,
        sb.medicine_id,
        m.name as medicine_name,
        m.generic_name,
        sb.batch_no,
        s.name as supplier_name,
        sb.quantity_received,
        sb.quantity_in_stock,
        sb.purchase_rate_per_unit,
        (sb.quantity_received * sb.purchase_rate_per_unit) as total_purchase_value,
        sb.expiry_date,
        sb.purchase_date,
        u.full_name as created_by_name,
        sb.created_by
      FROM stock_batches sb
      JOIN medicines m ON sb.medicine_id = m.id
      LEFT JOIN suppliers s ON sb.supplier_id = s.id
      LEFT JOIN users u ON sb.created_by = u.id
      WHERE 1=1 ${filterSql}
    `;

    const countSql = `SELECT COUNT(*) as total FROM stock_batches sb WHERE 1=1 ${filterSql}`;
    const [countResult] = await db.query(countSql, filterParams);
    const total = countResult[0]?.total || 0;

    sql += ' ORDER BY sb.purchase_date DESC, sb.id DESC LIMIT ? OFFSET ?';
    const [rows] = await db.query(sql, [...filterParams, parseInt(limit), parseInt(offset)]);

    const [totals] = await db.query(`
      SELECT
        COUNT(*) as total_batches,
        COALESCE(SUM(sb.quantity_received), 0) as total_units,
        COALESCE(SUM(sb.quantity_received * sb.purchase_rate_per_unit), 0) as total_value
      FROM stock_batches sb
      WHERE 1=1 ${filterSql}
    `, filterParams);

    const [supplierSummary] = await db.query(`
      SELECT
        sb.supplier_id,
        s.name as supplier_name,
        COUNT(*) as total_batches,
        COALESCE(SUM(sb.quantity_received), 0) as total_units,
        COALESCE(SUM(sb.quantity_received * sb.purchase_rate_per_unit), 0) as total_value
      FROM stock_batches sb
      LEFT JOIN suppliers s ON sb.supplier_id = s.id
      WHERE 1=1 ${filterSql}
      GROUP BY sb.supplier_id, s.name
      ORDER BY total_value DESC
    `, filterParams);

    res.json({
      items: rows || [],
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
      totals: totals[0] || { total_batches: 0, total_units: 0, total_value: 0 },
      supplierSummary: supplierSummary || []
    });
  } catch (err) {
    console.error('[REPORT] Purchase history error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getStockMovements(req, res) {
  try {
    const { start_date, end_date, medicine_id, batch_id, transaction_type, user_id, page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT
        st.id,
        st.medicine_id,
        m.name as medicine_name,
        st.batch_id,
        sb.batch_no,
        st.transaction_type,
        st.quantity_change,
        st.quantity_before,
        st.quantity_after,
        st.performed_by,
        u.full_name as user_name,
        st.reference_id,
        st.notes,
        st.created_at
      FROM stock_transactions st
      JOIN medicines m ON st.medicine_id = m.id
      LEFT JOIN stock_batches sb ON st.batch_id = sb.id
      LEFT JOIN users u ON st.performed_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (start_date) { sql += ' AND st.created_at >= ?'; params.push(start_date + ' 00:00:00'); }
    if (end_date) { sql += ' AND st.created_at <= ?'; params.push(end_date + ' 23:59:59'); }
    if (medicine_id) { sql += ' AND st.medicine_id = ?'; params.push(medicine_id); }
    if (batch_id) { sql += ' AND st.batch_id = ?'; params.push(batch_id); }
    if (transaction_type) { sql += ' AND st.transaction_type = ?'; params.push(transaction_type); }
    if (user_id) { sql += ' AND st.performed_by = ?'; params.push(user_id); }

    const countSql = sql.replace(
      'SELECT st.id, st.medicine_id, m.name as medicine_name, st.batch_id, sb.batch_no, st.transaction_type, st.quantity_change, st.quantity_before, st.quantity_after, st.performed_by, u.full_name as user_name, st.reference_id, st.notes, st.created_at',
      'SELECT COUNT(*) as total'
    );
    const [countResult] = await db.query(countSql, params);
    const total = countResult[0]?.total || 0;

    sql += ' ORDER BY st.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [rows] = await db.query(sql, params);

    const typeParams = [...params.slice(0, -2)];
    const [typeStats] = await db.query(`
      SELECT transaction_type, COUNT(*) as count, SUM(ABS(quantity_change)) as total_qty
      FROM stock_transactions st WHERE 1=1
      ${start_date ? ' AND st.created_at >= ?' : ''}
      ${end_date ? ' AND st.created_at <= ?' : ''}
      ${medicine_id ? ' AND st.medicine_id = ?' : ''}
      ${batch_id ? ' AND st.batch_id = ?' : ''}
      ${user_id ? ' AND st.performed_by = ?' : ''}
      GROUP BY transaction_type
    `, typeParams);

    res.json({
      items: rows || [],
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
      summary: typeStats || []
    });
  } catch (err) {
    console.error('[REPORT] Stock movements error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getReturns(req, res) {
  try {
    const { start_date, end_date, medicine_id, bill_number, user_id, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT
        r.id,
        r.original_sale_id,
        r.sale_item_id,
        r.quantity_returned,
        r.refund_amount,
        r.reason,
        r.processed_by,
        r.created_at,
        s.bill_number,
        s.created_at as sale_date,
        si.medicine_id,
        m.name as medicine_name,
        si.batch_id,
        sb.batch_no,
        si.selling_rate_per_unit,
        si.purchase_rate_per_unit,
        (r.quantity_returned * si.purchase_rate_per_unit) as cost_returned,
        (r.refund_amount - (r.quantity_returned * si.purchase_rate_per_unit)) as profit_reversed,
        u.full_name as processed_by_name
      FROM returns r
      JOIN sales s ON r.original_sale_id = s.id
      JOIN sale_items si ON r.sale_item_id = si.id
      JOIN medicines m ON si.medicine_id = m.id
      LEFT JOIN stock_batches sb ON si.batch_id = sb.id
      LEFT JOIN users u ON r.processed_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (start_date) { sql += ' AND DATE(r.created_at) >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND DATE(r.created_at) <= ?'; params.push(end_date); }
    if (medicine_id) { sql += ' AND si.medicine_id = ?'; params.push(medicine_id); }
    if (bill_number) { sql += ' AND s.bill_number LIKE ?'; params.push(`%${bill_number}%`); }
    if (user_id) { sql += ' AND r.processed_by = ?'; params.push(user_id); }

    const countSql = sql.replace(
      /SELECT[\s\S]*?FROM/,
      'SELECT COUNT(*) as total FROM'
    );
    const [countResult] = await db.query(countSql, params);
    const total = countResult[0]?.total || 0;

    sql += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [rows] = await db.query(sql, params);

    const [summary] = await db.query(`
      SELECT
        COUNT(*) as total_returns,
        COALESCE(SUM(r.quantity_returned), 0) as total_items,
        COALESCE(SUM(r.refund_amount), 0) as total_refund
      FROM returns r
      JOIN sales s ON r.original_sale_id = s.id
      JOIN sale_items si ON r.sale_item_id = si.id
      WHERE 1=1
      ${start_date ? ' AND DATE(r.created_at) >= ?' : ''}
      ${end_date ? ' AND DATE(r.created_at) <= ?' : ''}
      ${medicine_id ? ' AND si.medicine_id = ?' : ''}
      ${bill_number ? ' AND s.bill_number LIKE ?' : ''}
      ${user_id ? ' AND r.processed_by = ?' : ''}
    `, params);

    res.json({
      items: rows || [],
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
      summary: summary[0] || { total_returns: 0, total_items: 0, total_refund: 0 }
    });
  } catch (err) {
    console.error('[REPORT] Returns error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getAuditLog(req, res) {
  try {
    const { start_date, end_date, user_id, action, entity, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT
        a.id,
        a.user_id,
        u.full_name as user_name,
        u.username,
        a.action,
        a.table_affected,
        a.record_id,
        a.details,
        a.created_at
      FROM audit_log a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (start_date) { sql += ' AND DATE(a.created_at) >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND DATE(a.created_at) <= ?'; params.push(end_date); }
    if (user_id) { sql += ' AND a.user_id = ?'; params.push(user_id); }
    if (action) { sql += ' AND a.action = ?'; params.push(action); }
    if (entity) { sql += ' AND a.table_affected = ?'; params.push(entity); }

    const countSql = sql.replace(
      /SELECT[\s\S]*?FROM/,
      'SELECT COUNT(*) as total FROM'
    );
    const [countResult] = await db.query(countSql, params);
    const total = countResult[0]?.total || 0;

    sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [rows] = await db.query(sql, params);

    const [actionStats] = await db.query(`
      SELECT action, COUNT(*) as count
      FROM audit_log a
      WHERE 1=1
      ${start_date ? ' AND DATE(a.created_at) >= ?' : ''}
      ${end_date ? ' AND DATE(a.created_at) <= ?' : ''}
      ${user_id ? ' AND a.user_id = ?' : ''}
      ${entity ? ' AND a.table_affected = ?' : ''}
      GROUP BY action
    `, params.slice(0, start_date ? -2 : params.length));

    res.json({
      items: rows || [],
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
      actionSummary: actionStats || []
    });
  } catch (err) {
    console.error('[REPORT] Audit log error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getProfitLoss(req, res) {
  try {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date required' });
    }

    const [salesSummary] = await db.query(`
      SELECT
        COALESCE(SUM(si.line_total), 0) as gross_sales,
        COALESCE(SUM(s.discount_amount), 0) as total_discounts,
        COALESCE(SUM(s.tax_amount), 0) as total_tax,
        COALESCE(SUM(s.subtotal), 0) as subtotal_before_discount,
        COUNT(DISTINCT s.id) as total_bills
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
    `, [start_date, end_date]);

    const [cogsResult] = await db.query(`
      SELECT
        COALESCE(SUM(si.quantity * si.purchase_rate_per_unit), 0) as cogs
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
    `, [start_date, end_date]);

    const [returnsSummary] = await db.query(`
      SELECT
        COALESCE(SUM(r.refund_amount), 0) as total_refunds,
        COALESCE(SUM(r.quantity_returned), 0) as items_returned,
        COUNT(*) as return_count,
        COALESCE(SUM(r.quantity_returned * si.purchase_rate_per_unit), 0) as return_cogs
      FROM returns r
      JOIN sale_items si ON r.sale_item_id = si.id
      WHERE DATE(r.created_at) BETWEEN ? AND ?
    `, [start_date, end_date]);

    const [discountBreakdown] = await db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN discount_type = 'PERCENTAGE' THEN discount_amount ELSE 0 END), 0) as percentage_discounts,
        COALESCE(SUM(CASE WHEN discount_type = 'FIXED' THEN discount_amount ELSE 0 END), 0) as fixed_discounts,
        COALESCE(SUM(CASE WHEN discount_type = 'PERCENTAGE' THEN discount_value ELSE 0 END), 0) as percentage_values,
        COALESCE(SUM(CASE WHEN discount_type = 'FIXED' THEN discount_value ELSE 0 END), 0) as fixed_values
      FROM sales
      WHERE DATE(created_at) BETWEEN ? AND ? AND discount_amount > 0
    `, [start_date, end_date]);

    const [dailyTrend] = await db.query(`
      SELECT
        DATE(s.created_at) as date,
        COALESCE(SUM(si.line_total), 0) as gross_sales,
        COALESCE(SUM(s.discount_amount), 0) as discounts,
        COALESCE(SUM(s.tax_amount), 0) as tax,
        COALESCE(SUM(si.quantity * si.purchase_rate_per_unit), 0) as cogs
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
      GROUP BY DATE(s.created_at)
      ORDER BY date
    `, [start_date, end_date]);

    const grossSales = parseFloat(salesSummary[0]?.gross_sales || 0);
    const totalDiscounts = parseFloat(salesSummary[0]?.total_discounts || 0);
    const totalTax = parseFloat(salesSummary[0]?.total_tax || 0);
    const originalCogs = parseFloat(cogsResult[0]?.cogs || 0);
    const totalRefunds = parseFloat(returnsSummary[0]?.total_refunds || 0);
    const returnCogs = parseFloat(returnsSummary[0]?.return_cogs || 0);

    const netCogs = originalCogs - returnCogs;
    const salesAfterDiscount = grossSales - totalDiscounts;
    const netSales = salesAfterDiscount - totalRefunds;
    const grossProfit = netSales - netCogs;
    const grossMarginPercent = netSales > 0 ? parseFloat(((grossProfit / netSales) * 100).toFixed(2)) : 0;

    const dailyPnL = (dailyTrend || []).map(d => {
      const dayGrossSales = parseFloat(d.gross_sales || 0);
      const dayDiscounts = parseFloat(d.discounts || 0);
      const dayTax = parseFloat(d.tax || 0);
      const dayCogs = parseFloat(d.cogs || 0);
      const dayNetSales = dayGrossSales - dayDiscounts;
      const dayGrossProfit = dayNetSales - dayCogs;
      return {
        date: d.date?.slice(5) || '',
        fullDate: d.date,
        gross_sales: dayGrossSales,
        discounts: dayDiscounts,
        tax: dayTax,
        net_sales: dayNetSales,
        cogs: dayCogs,
        gross_profit: dayGrossProfit,
        gross_margin: dayNetSales > 0 ? parseFloat(((dayGrossProfit / dayNetSales) * 100).toFixed(2)) : 0,
      };
    });

    res.json({
      period: { start_date, end_date },
      summary: {
        gross_sales: grossSales,
        sales_after_discount: salesAfterDiscount,
        total_discounts: totalDiscounts,
        percentage_discounts: parseFloat(discountBreakdown[0]?.percentage_discounts || 0),
        fixed_discounts: parseFloat(discountBreakdown[0]?.fixed_discounts || 0),
        total_refunds: totalRefunds,
        return_count: parseInt(returnsSummary[0]?.return_count || 0),
        items_returned: parseInt(returnsSummary[0]?.items_returned || 0),
        return_cogs: returnCogs,
        net_sales: netSales,
        original_cogs: originalCogs,
        net_cogs: netCogs,
        gross_profit: grossProfit,
        gross_margin_percent: grossMarginPercent,
        tax_collected: totalTax,
        total_bills: parseInt(salesSummary[0]?.total_bills || 0),
        operating_expenses: null,
        net_profit: null,
      },
      daily_trend: dailyPnL,
    });
  } catch (err) {
    console.error('[REPORT] Profit & Loss error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getCategorySales(req, res) {
  try {
    const { start_date, end_date, sort_by = 'revenue', sort_order = 'DESC' } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date required' });
    }

    const validSortColumns = ['revenue', 'profit', 'units_sold', 'margin_percent', 'category'];
    const sortCol = validSortColumns.includes(sort_by) ? sort_by : 'revenue';
    const sortDir = sort_order === 'ASC' ? 'ASC' : 'DESC';

    const [categories] = await db.query(`
      SELECT
        COALESCE(NULLIF(TRIM(m.category), '') , 'Uncategorized') as category,
        SUM(si.quantity) as units_sold,
        SUM(si.line_total) as revenue,
        SUM(si.quantity * si.purchase_rate_per_unit) as cost,
        SUM(si.line_profit) as profit,
        CASE WHEN SUM(si.line_total) > 0
          THEN ROUND((SUM(si.line_profit) / SUM(si.line_total)) * 100, 2)
          ELSE 0 END as margin_percent
      FROM sale_items si
      JOIN medicines m ON si.medicine_id = m.id
      JOIN sales s ON si.sale_id = s.id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
      GROUP BY COALESCE(NULLIF(TRIM(m.category), ''), 'Uncategorized')
      ORDER BY ${sortCol === 'revenue' ? 'revenue' : sortCol === 'profit' ? 'profit' : sortCol === 'units_sold' ? 'units_sold' : sortCol === 'margin_percent' ? 'margin_percent' : 'category'} ${sortDir}
    `, [start_date, end_date]);

    const [totals] = await db.query(`
      SELECT
        COUNT(DISTINCT COALESCE(NULLIF(TRIM(m.category), ''), 'Uncategorized')) as total_categories,
        COALESCE(SUM(si.quantity), 0) as total_units,
        COALESCE(SUM(si.line_total), 0) as total_revenue,
        COALESCE(SUM(si.quantity * si.purchase_rate_per_unit), 0) as total_cost,
        COALESCE(SUM(si.line_profit), 0) as total_profit
      FROM sale_items si
      JOIN medicines m ON si.medicine_id = m.id
      JOIN sales s ON si.sale_id = s.id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
    `, [start_date, end_date]);

    const totalRevenue = parseFloat(totals[0]?.total_revenue || 0);
    const totalProfit = parseFloat(totals[0]?.total_profit || 0);
    const avgMargin = totalRevenue > 0 ? parseFloat(((totalProfit / totalRevenue) * 100).toFixed(2)) : 0;

    res.json({
      summary: {
        total_categories: parseInt(totals[0]?.total_categories || 0),
        total_units: parseInt(totals[0]?.total_units || 0),
        total_revenue: totalRevenue,
        total_cost: parseFloat(totals[0]?.total_cost || 0),
        total_profit: totalProfit,
        avg_margin: avgMargin,
      },
      categories: categories || [],
    });
  } catch (err) {
    console.error('[REPORT] Category sales error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getUserActivity(req, res) {
  try {
    const { start_date, end_date, user_id, role } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date required' });
    }

    let userFilter = '';
    const userParams = [];
    if (user_id) { userFilter += ' AND u.id = ?'; userParams.push(user_id); }
    if (role) { userFilter += ' AND u.role = ?'; userParams.push(role); }

    const [userStats] = await db.query(`
      SELECT
        u.id as user_id,
        u.full_name,
        u.username,
        u.role,
        u.is_active,
        COUNT(DISTINCT s.id) as bills,
        COALESCE(SUM(si.quantity), 0) as items_sold,
        COALESCE(SUM(s.final_amount), 0) as revenue,
        COALESCE(SUM(s.discount_amount), 0) as discount,
        COALESCE(SUM(si.line_profit), 0) as profit
      FROM users u
      LEFT JOIN sales s ON u.id = s.cashier_id AND DATE(s.created_at) BETWEEN ? AND ?
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE u.is_active = 1 ${userFilter}
      GROUP BY u.id, u.full_name, u.username, u.role, u.is_active
      ORDER BY revenue DESC
    `, [start_date, end_date, ...userParams]);

    const [totals] = await db.query(`
      SELECT
        COUNT(DISTINCT u.id) as total_users,
        COUNT(DISTINCT s.id) as total_bills,
        COALESCE(SUM(si.quantity), 0) as total_items,
        COALESCE(SUM(s.final_amount), 0) as total_revenue,
        COALESCE(SUM(s.discount_amount), 0) as total_discount,
        COALESCE(SUM(si.line_profit), 0) as total_profit
      FROM users u
      LEFT JOIN sales s ON u.id = s.cashier_id AND DATE(s.created_at) BETWEEN ? AND ?
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE u.is_active = 1 ${userFilter}
    `, [start_date, end_date, ...userParams]);

    let invFilter = '';
    const invParams = [start_date, end_date];
    if (user_id) { invFilter += ' AND st.performed_by = ?'; invParams.push(user_id); }

    const [inventoryActivity] = await db.query(`
      SELECT
        st.performed_by,
        COALESCE(u.full_name, 'Unknown') as full_name,
        st.transaction_type,
        COUNT(*) as txn_count,
        SUM(ABS(st.quantity_change)) as total_qty
      FROM stock_transactions st
      LEFT JOIN users u ON st.performed_by = u.id
      WHERE DATE(st.created_at) BETWEEN ? AND ? ${invFilter}
      GROUP BY st.performed_by, COALESCE(u.full_name, 'Unknown'), st.transaction_type
      ORDER BY st.performed_by, st.transaction_type
    `, invParams);

    const userInventoryMap = {};
    (inventoryActivity || []).forEach(row => {
      if (!userInventoryMap[row.performed_by]) {
        userInventoryMap[row.performed_by] = { full_name: row.full_name || 'Unknown', types: {} };
      }
      userInventoryMap[row.performed_by].types[row.transaction_type] = { count: row.txn_count, qty: parseInt(row.total_qty || 0) };
    });

    const usersWithInventory = (userStats || []).map(u => ({
      ...u,
      bills: parseInt(u.bills || 0),
      items_sold: parseInt(u.items_sold || 0),
      revenue: parseFloat(u.revenue || 0),
      discount: parseFloat(u.discount || 0),
      profit: parseFloat(u.profit || 0),
      average_bill: u.bills > 0 ? parseFloat((u.revenue / u.bills).toFixed(2)) : 0,
      margin_percent: u.revenue > 0 ? parseFloat(((u.profit / u.revenue) * 100).toFixed(2)) : 0,
      inventory_activity: userInventoryMap[u.user_id]?.types || {},
    }));

    const totalRevenue = parseFloat(totals[0]?.total_revenue || 0);
    const totalProfit = parseFloat(totals[0]?.total_profit || 0);

    res.json({
      summary: {
        total_users: parseInt(totals[0]?.total_users || 0),
        total_bills: parseInt(totals[0]?.total_bills || 0),
        total_items: parseInt(totals[0]?.total_items || 0),
        total_revenue: totalRevenue,
        total_discount: parseFloat(totals[0]?.total_discount || 0),
        total_profit: totalProfit,
        avg_margin: totalRevenue > 0 ? parseFloat(((totalProfit / totalRevenue) * 100).toFixed(2)) : 0,
      },
      users: usersWithInventory,
    });
  } catch (err) {
    console.error('[REPORT] User activity error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getBatches(req, res) {
  try {
    const { medicine_id, include_empty } = req.query;

    let sql = `
      SELECT sb.id, sb.batch_no, sb.medicine_id, m.name as medicine_name,
             sb.quantity_in_stock, sb.expiry_date
      FROM stock_batches sb
      JOIN medicines m ON sb.medicine_id = m.id
    `;
    const params = [];
    const conditions = [];

    if (!include_empty) {
      conditions.push('sb.quantity_in_stock > 0');
    }

    if (medicine_id) {
      conditions.push('sb.medicine_id = ?');
      params.push(medicine_id);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY sb.expiry_date ASC';

    const [rows] = await db.query(sql, params);

    res.json({ batches: rows || [] });
  } catch (err) {
    console.error('[REPORT] Batches error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getDashboard, getSalesReport, getDaySummary, getStockValuation, getProfitMargins, getExpiryAlerts, getLowStockAlerts, getPurchaseHistory, getStockMovements, getReturns, getAuditLog, getProfitLoss, getCategorySales, getUserActivity, getBatches };
