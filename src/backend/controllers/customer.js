const db = require('../db');
const { logAudit } = require('../middleware');

function normalizePhone(phone) {
  if (!phone) return '';
  let p = String(phone).trim();
  p = p.replace(/[\s\-\(\)\.]/g, '');
  if (p.startsWith('+92')) p = '0' + p.slice(3);
  else if (p.startsWith('92') && p.length === 12) p = '0' + p.slice(2);
  return p;
}

async function createCustomer(req, res) {
  const { name, phone } = req.body;
  const normalizedPhone = normalizePhone(phone);

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Customer name is required' });
  }
  if (!normalizedPhone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query('SELECT id, name, phone FROM customers WHERE phone = ? AND is_active = 1', [normalizedPhone]);
    if (existing.length > 0) {
      await conn.rollback();
      return res.status(409).json({
        error: 'Customer with this phone number already exists',
        existing_customer: existing[0],
      });
    }

    const [result] = await conn.query(
      'INSERT INTO customers (name, phone) VALUES (?, ?)',
      [name.trim(), normalizedPhone]
    );
    const customerId = result.insertId;

    await conn.commit();
    await logAudit(req.user.id, 'CUSTOMER_CREATED', 'customers', customerId, { name: name.trim(), phone: normalizedPhone });

    res.status(201).json({
      id: customerId,
      name: name.trim(),
      phone: normalizedPhone,
      is_active: 1,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Customer with this phone number already exists' });
    }
    console.error('[CUSTOMER] Create error:', err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
}

async function searchCustomers(req, res) {
  const { q } = req.query;
  if (!q || !q.trim()) {
    return res.json([]);
  }

  const term = q.trim();
  const normalizedPhone = normalizePhone(term);
  const likeTerm = `%${term}%`;

  try {
    const [rows] = await db.query(
      `SELECT id, name, phone, is_active, created_at FROM customers
       WHERE is_active = 1 AND (phone = ? OR phone LIKE ? OR name LIKE ?)
       ORDER BY created_at DESC LIMIT 50`,
      [normalizedPhone, normalizedPhone + '%', likeTerm]
    );
    res.json(rows);
  } catch (err) {
    console.error('[CUSTOMER] Search error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getCustomer(req, res) {
  try {
    const [rows] = await db.query('SELECT id, name, phone, is_active, created_at, updated_at FROM customers WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function updateCustomer(req, res) {
  const { name, phone } = req.body;
  const normalizedPhone = normalizePhone(phone);

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Customer name is required' });
  }
  if (!normalizedPhone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await db.query(
      'SELECT id FROM customers WHERE phone = ? AND id != ? AND is_active = 1',
      [normalizedPhone, req.params.id]
    );
    if (existing.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'Another customer with this phone number already exists' });
    }

    const [result] = await conn.query(
      'UPDATE customers SET name = ?, phone = ? WHERE id = ?',
      [name.trim(), normalizedPhone, req.params.id]
    );

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Customer not found' });
    }

    await conn.commit();
    await logAudit(req.user.id, 'CUSTOMER_UPDATED', 'customers', req.params.id, { name: name.trim(), phone: normalizedPhone });

    res.json({ message: 'Customer updated successfully' });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Another customer with this phone number already exists' });
    }
    console.error('[CUSTOMER] Update error:', err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
}

async function deactivateCustomer(req, res) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await db.query('SELECT id FROM customers WHERE id = ? AND is_active = 1', [req.params.id]);
    if (existing.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Customer not found or already deactivated' });
    }

    await conn.query('UPDATE customers SET is_active = 0 WHERE id = ?', [req.params.id]);
    await conn.commit();
    await logAudit(req.user.id, 'CUSTOMER_DEACTIVATED', 'customers', req.params.id, {});

    res.json({ message: 'Customer deactivated successfully' });
  } catch (err) {
    await conn.rollback();
    console.error('[CUSTOMER] Deactivate error:', err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
}

async function listCustomers(req, res) {
  try {
    const { q, limit = 100, offset = 0 } = req.query;
    let sql = 'SELECT id, name, phone, is_active, created_at FROM customers WHERE is_active = 1';
    const params = [];

    if (q && q.trim()) {
      const normalizedPhone = normalizePhone(q.trim());
      const likeTerm = `%${q.trim()}%`;
      sql += ' AND (phone = ? OR phone LIKE ? OR name LIKE ?)';
      params.push(normalizedPhone, normalizedPhone + '%', likeTerm);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[CUSTOMER] List error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getCustomerHistory(req, res) {
  try {
    const customerId = req.params.id;

    const [customerRows] = await db.query('SELECT id, name, phone FROM customers WHERE id = ? AND is_active = 1', [customerId]);
    if (customerRows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const [sales] = await db.query(
      `SELECT s.id, s.bill_number, s.subtotal, s.discount_amount, s.tax_amount, s.final_amount,
              s.payment_method, s.created_at, u.full_name as cashier_name
       FROM sales s
       LEFT JOIN users u ON s.cashier_id = u.id
       WHERE s.customer_id = ?
       ORDER BY s.created_at DESC`,
      [customerId]
    );

    const [stats] = await db.query(
      `SELECT COUNT(*) as total_bills, COALESCE(SUM(final_amount), 0) as total_spent, MAX(created_at) as last_purchase
       FROM sales WHERE customer_id = ?`,
      [customerId]
    );

    res.json({
      customer: customerRows[0],
      stats: stats[0] || { total_bills: 0, total_spent: 0, last_purchase: null },
      sales,
    });
  } catch (err) {
    console.error('[CUSTOMER] History error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getCustomerLastPurchase(req, res) {
  try {
    const customerId = req.params.id;

    const [customerRows] = await db.query('SELECT id, name, phone FROM customers WHERE id = ? AND is_active = 1', [customerId]);
    if (customerRows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const [sales] = await db.query(
      `SELECT s.id, s.bill_number, s.subtotal, s.discount_amount, s.tax_amount, s.final_amount,
              s.payment_method, s.created_at, u.full_name as cashier_name
       FROM sales s
       LEFT JOIN users u ON s.cashier_id = u.id
       WHERE s.customer_id = ?
       ORDER BY s.created_at DESC LIMIT 1`,
      [customerId]
    );

    if (sales.length === 0) {
      return res.json({ customer: customerRows[0], sale: null, items: [] });
    }

    const [items] = await db.query(
      `SELECT si.quantity, si.selling_rate_per_unit, si.line_total, si.service_charge, m.name as medicine_name
       FROM sale_items si
       JOIN medicines m ON si.medicine_id = m.id
       WHERE si.sale_id = ?
       ORDER BY si.id ASC`,
      [sales[0].id]
    );

    res.json({ customer: customerRows[0], sale: sales[0], items });
  } catch (err) {
    console.error('[CUSTOMER] Last purchase error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function validateCustomer(req, res) {
  try {
    const { customer_id } = req.body;
    if (!customer_id) {
      return res.json({ valid: true, customer: null });
    }

    const [rows] = await db.query('SELECT id, name, phone, is_active FROM customers WHERE id = ? AND is_active = 1', [customer_id]);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or inactive customer' });
    }

    res.json({ valid: true, customer: rows[0] });
  } catch (err) {
    console.error('[CUSTOMER] Validate error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  createCustomer,
  searchCustomers,
  getCustomer,
  updateCustomer,
  deactivateCustomer,
  listCustomers,
  getCustomerHistory,
  getCustomerLastPurchase,
  validateCustomer,
};
