const db = require('../db');
const { logAudit } = require('../middleware');

async function generateReturnReference() {
  const year = new Date().getFullYear();
  const random = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  return `SUP-RET-${year}${random}`;
}

async function processSupplierReturn(req, res) {
  const { supplier_id, batch_id, medicine_id, quantity_returned, reason } = req.body;
  const processed_by = req.user.id;

  if (!supplier_id || !batch_id || !medicine_id || !quantity_returned) {
    return res.status(400).json({ error: 'supplier_id, batch_id, medicine_id and quantity_returned are required' });
  }
  if (quantity_returned <= 0) {
    return res.status(400).json({ error: 'quantity_returned must be greater than 0' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [batches] = await conn.query('SELECT * FROM stock_batches WHERE id = ? AND medicine_id = ?', [batch_id, medicine_id]);
    if (batches.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Batch not found or does not belong to the specified medicine' });
    }
    const batch = batches[0];
    if (batch.quantity_in_stock < quantity_returned) {
      await conn.rollback();
      return res.status(400).json({ error: `Insufficient stock in batch. Available: ${batch.quantity_in_stock}, Requested: ${quantity_returned}` });
    }

    const returnReference = await generateReturnReference();

    const [returnResult] = await conn.query(
      `INSERT INTO supplier_returns (return_reference, supplier_id, batch_id, medicine_id, quantity_returned, purchase_rate_per_unit, reason, processed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [returnReference, supplier_id, batch_id, medicine_id, quantity_returned, batch.purchase_rate_per_unit, reason || null, processed_by]
    );
    const returnId = returnResult.insertId;

    await conn.query(
      `INSERT INTO supplier_return_items (supplier_return_id, batch_id, medicine_id, quantity_returned, purchase_rate_per_unit)
       VALUES (?, ?, ?, ?, ?)`,
      [returnId, batch_id, medicine_id, quantity_returned, batch.purchase_rate_per_unit]
    );

    const newQuantity = batch.quantity_in_stock - quantity_returned;
    await conn.run('UPDATE stock_batches SET quantity_in_stock = ? WHERE id = ?', [newQuantity, batch_id]);

    await conn.query(
      `INSERT INTO stock_transactions (medicine_id, batch_id, transaction_type, quantity_change, quantity_before, quantity_after, performed_by, notes)
       VALUES (?, ?, 'SUPPLIER_RETURN', ?, ?, ?, ?, ?)`,
      [medicine_id, batch_id, -quantity_returned, batch.quantity_in_stock, newQuantity, processed_by, `Supplier return: ${returnReference}`]
    );

    await conn.commit();
    await logAudit(processed_by, 'SUPPLIER_RETURN_PROCESSED', 'supplier_returns', returnId, { return_reference: returnReference, batch_id, quantity_returned });

    res.status(201).json({
      id: returnId,
      return_reference: returnReference,
      supplier_id,
      batch_id,
      medicine_id,
      quantity_returned,
      purchase_rate_per_unit: batch.purchase_rate_per_unit,
      reason: reason || null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    await conn.rollback();
    console.error('[SUPPLIER_RETURN] Process error:', err.message);
    res.status(500).json({ error: 'Server error: ' + err.message });
  } finally {
    conn.release();
  }
}

async function listSupplierReturns(req, res) {
  try {
    const { start_date, end_date, supplier_id, medicine_id } = req.query;
    let sql = `
      SELECT sr.*, s.name as supplier_name, m.name as medicine_name, sb.batch_no, u.full_name as processed_by_name
      FROM supplier_returns sr
      JOIN suppliers s ON sr.supplier_id = s.id
      JOIN medicines m ON sr.medicine_id = m.id
      JOIN stock_batches sb ON sr.batch_id = sb.id
      JOIN users u ON sr.processed_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (start_date) { sql += ' AND DATE(sr.created_at) >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND DATE(sr.created_at) <= ?'; params.push(end_date); }
    if (supplier_id) { sql += ' AND sr.supplier_id = ?'; params.push(supplier_id); }
    if (medicine_id) { sql += ' AND sr.medicine_id = ?'; params.push(medicine_id); }

    sql += ' ORDER BY sr.created_at DESC';

    const [returns] = await db.query(sql, params);
    res.json(returns);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { processSupplierReturn, listSupplierReturns };
