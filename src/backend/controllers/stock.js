const db = require('../db');
const { logAudit } = require('../middleware');

async function restock(req, res) {
  const { medicine_id, batch_no, supplier_id, purchase_rate_per_unit, selling_rate_per_unit, quantity_received, expiry_date } = req.body;

  if (!medicine_id || !purchase_rate_per_unit || !quantity_received) {
    return res.status(400).json({ error: 'Missing required fields: medicine_id, purchase_rate_per_unit, quantity_received' });
  }

  const trimmedBatchNo = batch_no ? String(batch_no).trim() : '';
  if (!trimmedBatchNo) {
    return res.status(400).json({ error: 'Batch number is required' });
  }

  if (!expiry_date || String(expiry_date).trim() === '') {
    return res.status(400).json({ error: 'Expiry date is required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [dupCheck] = await conn.query(
      `SELECT id FROM stock_batches WHERE medicine_id = ? AND batch_no = ? LIMIT 1`,
      [medicine_id, trimmedBatchNo]
    );
    if (dupCheck.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: `Batch number '${trimmedBatchNo}' already exists for this medicine` });
    }

    const result = await conn.run(
      `INSERT INTO stock_batches (medicine_id, batch_no, supplier_id, purchase_rate_per_unit, selling_rate_per_unit, quantity_received, quantity_in_stock, expiry_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [medicine_id, trimmedBatchNo, supplier_id || null, purchase_rate_per_unit, selling_rate_per_unit || null, quantity_received, quantity_received, expiry_date, req.user.id]
    );

    if (selling_rate_per_unit) {
      await conn.run(
        `UPDATE medicines SET current_selling_price = ? WHERE id = ?`,
        [selling_rate_per_unit, medicine_id]
      );
    }

    const [existing] = await conn.query(
      'SELECT COALESCE(SUM(quantity_in_stock), 0) as total FROM stock_batches WHERE medicine_id = ?',
      [medicine_id]
    );

    await conn.run(
      `INSERT INTO stock_transactions (medicine_id, batch_id, transaction_type, quantity_change, quantity_before, quantity_after, performed_by, notes)
       VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?, ?)`,
      [medicine_id, result.insertId, quantity_received, existing[0].total - quantity_received, existing[0].total, req.user.id, `Restock: ${quantity_received} units`]
    );

    await conn.commit();
    await logAudit(req.user.id, 'STOCK_RESTOCK', 'stock_batches', result.insertId, { medicine_id, quantity: quantity_received, batch_no: trimmedBatchNo });
    res.status(201).json({ id: result.insertId, message: 'Stock added successfully', batch_no: trimmedBatchNo });
  } catch (err) {
    await conn.rollback();
    console.error('[STOCK] Restock error:', err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
}

async function adjustStock(req, res) {
  const { batch_id, new_quantity, reason } = req.body;
  if (!batch_id || new_quantity === undefined) {
    return res.status(400).json({ error: 'batch_id and new_quantity required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [batches] = await conn.query('SELECT * FROM stock_batches WHERE id = ?', [batch_id]);
    if (batches.length === 0) { await conn.rollback(); return res.status(404).json({ error: 'Batch not found' }); }

    const batch = batches[0];
    const change = new_quantity - batch.quantity_in_stock;

    await conn.run('UPDATE stock_batches SET quantity_in_stock = ? WHERE id = ?', [new_quantity, batch_id]);

    await conn.run(
      `INSERT INTO stock_transactions (medicine_id, batch_id, transaction_type, quantity_change, quantity_before, quantity_after, performed_by, notes)
       VALUES (?, ?, 'ADJUSTMENT', ?, ?, ?, ?, ?)`,
      [batch.medicine_id, batch_id, change, batch.quantity_in_stock, new_quantity, req.user.id, reason || 'Manual adjustment']
    );

    await conn.commit();
    await logAudit(req.user.id, 'STOCK_ADJUSTED', 'stock_batches', batch_id, { change, reason });
    res.json({ message: 'Stock adjusted' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
}

async function markExpired(req, res) {
  const { batch_id, quantity } = req.body;
  if (!batch_id || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'batch_id and valid quantity are required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [batches] = await conn.query('SELECT * FROM stock_batches WHERE id = ?', [batch_id]);
    if (batches.length === 0) { await conn.rollback(); return res.status(404).json({ error: 'Batch not found' }); }
    const batch = batches[0];
    if (batch.quantity_in_stock < quantity) {
      await conn.rollback();
      return res.status(400).json({ error: `Insufficient stock. Available: ${batch.quantity_in_stock}, Requested: ${quantity}` });
    }

    const newQuantity = batch.quantity_in_stock - quantity;
    await conn.run('UPDATE stock_batches SET quantity_in_stock = ? WHERE id = ?', [newQuantity, batch_id]);

    await conn.query(
      `INSERT INTO stock_transactions (medicine_id, batch_id, transaction_type, quantity_change, quantity_before, quantity_after, performed_by, notes)
       VALUES (?, ?, 'EXPIRED', ?, ?, ?, ?, ?)`,
      [batch.medicine_id, batch_id, -quantity, batch.quantity_in_stock, newQuantity, req.user.id, 'Stock marked as expired']
    );

    await conn.commit();
    await logAudit(req.user.id, 'STOCK_EXPIRED', 'stock_batches', batch_id, { batch_id, quantity });
    res.json({ message: 'Stock marked as expired', batch_id, quantity, remaining_stock: newQuantity });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
}

async function getLowStock(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT m.id, m.name, m.reorder_level, COALESCE(SUM(sb.quantity_in_stock), 0) as total_stock
      FROM medicines m
      LEFT JOIN stock_batches sb ON m.id = sb.medicine_id AND sb.quantity_in_stock > 0
      GROUP BY m.id
      HAVING total_stock <= m.reorder_level
      ORDER BY total_stock ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function getExpiringSoon(req, res) {
  try {
    const [settings] = await db.query("SELECT value FROM settings WHERE key = 'expiry_alert_days'");
    const days = settings.length > 0 ? parseInt(settings[0].value) : 60;

    const [rows] = await db.query(`
      SELECT sb.id, m.name, sb.batch_no, sb.expiry_date, sb.quantity_in_stock,
        sb.purchase_rate_per_unit,
        DATEDIFF(sb.expiry_date, CURDATE()) as days_until_expiry
      FROM stock_batches sb
      JOIN medicines m ON sb.medicine_id = m.id
      WHERE sb.quantity_in_stock > 0 AND sb.expiry_date IS NOT NULL
        AND sb.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
      ORDER BY sb.expiry_date ASC
    `, [days]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { restock, adjustStock, markExpired, getLowStock, getExpiringSoon };
