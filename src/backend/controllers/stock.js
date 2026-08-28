const db = require('../db');
const { logAudit } = require('../middleware');

async function restock(req, res) {
  const { medicine_id, batch_no, supplier_id, purchase_rate_per_unit, selling_rate_per_unit, quantity_received, expiry_date } = req.body;

  if (!medicine_id || !purchase_rate_per_unit || !selling_rate_per_unit || !quantity_received) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const result = await conn.run(
      `INSERT INTO stock_batches (medicine_id, batch_no, supplier_id, purchase_rate_per_unit, selling_rate_per_unit, quantity_received, quantity_in_stock, expiry_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [medicine_id, batch_no || null, supplier_id || null, purchase_rate_per_unit, selling_rate_per_unit, quantity_received, quantity_received, expiry_date || null, req.user.id]
    );

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
    await logAudit(req.user.id, 'STOCK_RESTOCK', 'stock_batches', result.insertId, { medicine_id, quantity: quantity_received });
    res.status(201).json({ id: result.insertId, message: 'Stock added successfully' });
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
        CAST(julianday(sb.expiry_date) - julianday('now') AS INTEGER) as days_until_expiry
      FROM stock_batches sb
      JOIN medicines m ON sb.medicine_id = m.id
      WHERE sb.quantity_in_stock > 0 AND sb.expiry_date IS NOT NULL
        AND sb.expiry_date <= date('now', '+' || ? || ' days')
      ORDER BY sb.expiry_date ASC
    `, [days]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { restock, adjustStock, getLowStock, getExpiringSoon };
