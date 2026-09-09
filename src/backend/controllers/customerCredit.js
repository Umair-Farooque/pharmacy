const db = require('../db');
const { logAudit } = require('../middleware');

async function recordCreditSale(req, res) {
  const { sale_id, customer_id } = req.body;
  const processed_by = req.user.id;

  if (!sale_id || !customer_id) {
    return res.status(400).json({ error: 'sale_id and customer_id are required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [sales] = await conn.query('SELECT * FROM sales WHERE id = ?', [sale_id]);
    if (sales.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Sale not found' });
    }
    const sale = sales[0];
    if (sale.payment_method !== 'CREDIT') {
      await conn.rollback();
      return res.status(400).json({ error: 'Sale payment method is not CREDIT' });
    }

    const [customers] = await conn.query('SELECT id, is_active FROM customers WHERE id = ?', [customer_id]);
    if (customers.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Customer not found' });
    }
    if (!customers[0].is_active) {
      await conn.rollback();
      return res.status(400).json({ error: 'Customer is inactive' });
    }

    const [balanceRows] = await conn.query(
      'SELECT COALESCE(SUM(amount), 0) as current_balance FROM customer_credit_transactions WHERE customer_id = ?',
      [customer_id]
    );
    const currentBalance = parseFloat(balanceRows[0].current_balance) || 0;
    const newBalance = currentBalance + sale.final_amount;

    await conn.query(
      `INSERT INTO customer_credit_transactions (customer_id, sale_id, type, amount, balance_after, notes, processed_by)
       VALUES (?, ?, 'CREDIT_SALE', ?, ?, ?, ?)`,
      [customer_id, sale_id, sale.final_amount, newBalance, null, processed_by]
    );

    await conn.query('UPDATE customers SET credit_balance = ? WHERE id = ?', [newBalance, customer_id]);

    await conn.commit();
    await logAudit(processed_by, 'CREDIT_SALE', 'customer_credit_transactions', null, { sale_id, customer_id, amount: sale.final_amount, balance_after: newBalance });

    res.status(201).json({ message: 'Credit sale recorded', customer_id, sale_id, amount: sale.final_amount, balance_after: newBalance });
  } catch (err) {
    await conn.rollback();
    console.error('[CREDIT] recordCreditSale error:', err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
}

async function recordPayment(req, res) {
  const { customer_id, amount, notes } = req.body;
  const processed_by = req.user.id;

  if (!customer_id || amount === undefined || amount === null || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'customer_id and valid amount are required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [customers] = await conn.query('SELECT id, is_active FROM customers WHERE id = ?', [customer_id]);
    if (customers.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Customer not found' });
    }

    const [balanceRows] = await conn.query(
      'SELECT COALESCE(SUM(amount), 0) as current_balance FROM customer_credit_transactions WHERE customer_id = ?',
      [customer_id]
    );
    const currentBalance = parseFloat(balanceRows[0].current_balance) || 0;
    const paymentAmount = -parseFloat(amount);
    const newBalance = currentBalance + paymentAmount;

    await conn.query(
      `INSERT INTO customer_credit_transactions (customer_id, sale_id, type, amount, balance_after, notes, processed_by)
       VALUES (?, NULL, 'PAYMENT', ?, ?, ?, ?)`,
      [customer_id, paymentAmount, newBalance, notes || null, processed_by]
    );

    await conn.query('UPDATE customers SET credit_balance = ? WHERE id = ?', [newBalance, customer_id]);

    await conn.commit();
    await logAudit(processed_by, 'CUSTOMER_PAYMENT', 'customer_credit_transactions', null, { customer_id, amount: paymentAmount, balance_after: newBalance });

    res.status(201).json({ message: 'Payment recorded', customer_id, amount: paymentAmount, balance_after: newBalance });
  } catch (err) {
    await conn.rollback();
    console.error('[CREDIT] recordPayment error:', err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
}

async function getCustomerCreditHistory(req, res) {
  try {
    const customerId = req.params.id;
    const [rows] = await db.query(
      `SELECT * FROM customer_credit_transactions WHERE customer_id = ? ORDER BY created_at DESC`,
      [customerId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[CREDIT] getCustomerCreditHistory error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getCustomerCreditSummary(req, res) {
  try {
    const customerId = req.params.id;

    const [summaryRows] = await db.query(
      `SELECT 
        COALESCE(SUM(CASE WHEN type = 'CREDIT_SALE' THEN amount ELSE 0 END), 0) as total_credit_sales,
        COALESCE(SUM(CASE WHEN type = 'PAYMENT' THEN amount ELSE 0 END), 0) as total_payments,
        MAX(CASE WHEN type = 'CREDIT_SALE' THEN created_at ELSE NULL END) as last_credit_sale_date
       FROM customer_credit_transactions
       WHERE customer_id = ?`,
      [customerId]
    );

    const [customerRows] = await db.query('SELECT credit_balance FROM customers WHERE id = ?', [customerId]);
    if (customerRows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({
      customer_id: customerId,
      current_balance: customerRows[0].credit_balance,
      total_credit_sales: summaryRows[0].total_credit_sales,
      total_payments: summaryRows[0].total_payments,
      last_credit_sale_date: summaryRows[0].last_credit_sale_date,
    });
  } catch (err) {
    console.error('[CREDIT] getCustomerCreditSummary error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function adjustCredit(req, res) {
  const { customer_id, amount, type, notes } = req.body;
  const processed_by = req.user.id;

  if (!customer_id || amount === undefined || amount === null || !type || !['ADJUSTMENT', 'REVERSAL'].includes(type)) {
    return res.status(400).json({ error: 'customer_id, amount, and valid type (ADJUSTMENT or REVERSAL) are required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [balanceRows] = await conn.query(
      'SELECT COALESCE(SUM(amount), 0) as current_balance FROM customer_credit_transactions WHERE customer_id = ?',
      [customer_id]
    );
    const currentBalance = parseFloat(balanceRows[0].current_balance) || 0;
    const adjustedAmount = parseFloat(amount);
    const newBalance = currentBalance + adjustedAmount;

    await conn.query(
      `INSERT INTO customer_credit_transactions (customer_id, sale_id, type, amount, balance_after, notes, processed_by)
       VALUES (?, NULL, ?, ?, ?, ?, ?)`,
      [customer_id, type, adjustedAmount, newBalance, notes || null, processed_by]
    );

    await conn.query('UPDATE customers SET credit_balance = ? WHERE id = ?', [newBalance, customer_id]);

    await conn.commit();
    const auditAction = type === 'REVERSAL' ? 'CREDIT_REVERSAL' : 'CREDIT_ADJUSTMENT';
    await logAudit(processed_by, auditAction, 'customer_credit_transactions', null, { customer_id, amount: adjustedAmount, balance_after: newBalance });

    res.status(201).json({ message: 'Credit adjusted', customer_id, amount: adjustedAmount, balance_after: newBalance });
  } catch (err) {
    await conn.rollback();
    console.error('[CREDIT] adjustCredit error:', err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
}

module.exports = {
  recordCreditSale,
  recordPayment,
  getCustomerCreditHistory,
  getCustomerCreditSummary,
  adjustCredit,
};
