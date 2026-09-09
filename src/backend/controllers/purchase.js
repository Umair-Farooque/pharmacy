const db = require('../db');
const { logAudit } = require('../middleware');

async function createPurchaseInvoice(req, res) {
  const { invoice_number, supplier_id, purchase_date, items, discount_amount, tax_amount, notes } = req.body;
  const created_by = req.user.id;

  if (!invoice_number || !supplier_id || !purchase_date || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'invoice_number, supplier_id, purchase_date and items are required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [suppliers] = await conn.query('SELECT id FROM suppliers WHERE id = ?', [supplier_id]);
    if (suppliers.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Supplier not found' });
    }

    let subtotal = 0;
    for (const item of items) {
      if (!item.medicine_id || !item.batch_no || !item.quantity || !item.purchase_rate_per_unit) {
        await conn.rollback();
        return res.status(400).json({ error: 'Each item must have medicine_id, batch_no, quantity, purchase_rate_per_unit' });
      }
      if (item.quantity <= 0 || item.purchase_rate_per_unit <= 0) {
        await conn.rollback();
        return res.status(400).json({ error: 'quantity and purchase_rate_per_unit must be greater than 0' });
      }
      const [medicines] = await conn.query('SELECT id FROM medicines WHERE id = ?', [item.medicine_id]);
      if (medicines.length === 0) {
        await conn.rollback();
        return res.status(404).json({ error: `Medicine ${item.medicine_id} not found` });
      }
      const lineTotal = item.quantity * item.purchase_rate_per_unit;
      subtotal += lineTotal;
    }

    const discountAmt = parseFloat(discount_amount) || 0;
    const taxAmt = parseFloat(tax_amount) || 0;
    const totalAmount = subtotal - discountAmt + taxAmt;

    const [invoiceResult] = await conn.query(
      `INSERT INTO purchase_invoices (invoice_number, supplier_id, purchase_date, subtotal, discount_amount, tax_amount, total_amount, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoice_number, supplier_id, purchase_date, subtotal, discountAmt, taxAmt, totalAmount, notes || null, created_by]
    );
    const invoiceId = invoiceResult.insertId;

    const invoiceItems = [];
    for (const item of items) {
      const [dupBatch] = await conn.query(
        `SELECT id FROM stock_batches WHERE medicine_id = ? AND batch_no = ? LIMIT 1`,
        [item.medicine_id, item.batch_no]
      );
      if (dupBatch.length > 0) {
        await conn.rollback();
        return res.status(409).json({ error: `Batch number '${item.batch_no}' already exists for this medicine` });
      }

      const [batchResult] = await conn.run(
        `INSERT INTO stock_batches (medicine_id, batch_no, supplier_id, purchase_rate_per_unit, selling_rate_per_unit, quantity_received, quantity_in_stock, expiry_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [item.medicine_id, item.batch_no, supplier_id, item.purchase_rate_per_unit, item.selling_rate_per_unit || item.purchase_rate_per_unit, item.quantity, item.quantity, item.expiry_date || null, created_by]
      );
      const batchId = batchResult.insertId;

      const lineTotal = item.quantity * item.purchase_rate_per_unit;
      await conn.query(
        `INSERT INTO purchase_invoice_items (purchase_invoice_id, medicine_id, batch_id, quantity, purchase_rate_per_unit, selling_rate_per_unit, expiry_date, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [invoiceId, item.medicine_id, batchId, item.quantity, item.purchase_rate_per_unit, item.selling_rate_per_unit || item.purchase_rate_per_unit, item.expiry_date || null, lineTotal]
      );

      const [existingStock] = await conn.query(
        'SELECT COALESCE(SUM(quantity_in_stock), 0) as total FROM stock_batches WHERE medicine_id = ?',
        [item.medicine_id]
      );

      await conn.query(
        `INSERT INTO stock_transactions (medicine_id, batch_id, transaction_type, quantity_change, quantity_before, quantity_after, performed_by, notes)
         VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?, ?)`,
        [item.medicine_id, batchId, item.quantity, existingStock[0].total, existingStock[0].total + item.quantity, created_by, `Purchase invoice: ${invoice_number}`]
      );

      if (item.selling_rate_per_unit) {
        await conn.run(
          `UPDATE medicines SET current_selling_price = ? WHERE id = ?`,
          [item.selling_rate_per_unit, item.medicine_id]
        );
      }

      invoiceItems.push({
        medicine_id: item.medicine_id,
        batch_id: batchId,
        batch_no: item.batch_no,
        quantity: item.quantity,
        purchase_rate_per_unit: item.purchase_rate_per_unit,
        selling_rate_per_unit: item.selling_rate_per_unit || item.purchase_rate_per_unit,
        expiry_date: item.expiry_date || null,
        line_total: lineTotal,
      });
    }

    await conn.commit();
    await logAudit(created_by, 'PURCHASE_CREATED', 'purchase_invoices', invoiceId, { invoice_number, supplier_id, total_amount: totalAmount, items_count: items.length });

    res.status(201).json({
      id: invoiceId,
      invoice_number,
      supplier_id,
      purchase_date,
      subtotal,
      discount_amount: discountAmt,
      tax_amount: taxAmt,
      total_amount: totalAmount,
      notes: notes || null,
      created_by,
      created_at: new Date().toISOString(),
      items: invoiceItems,
    });
  } catch (err) {
    await conn.rollback();
    console.error('[PURCHASE] Create error:', err.message);
    res.status(500).json({ error: 'Server error: ' + err.message });
  } finally {
    conn.release();
  }
}

async function listPurchaseInvoices(req, res) {
  try {
    const { start_date, end_date, supplier_id } = req.query;
    let sql = `
      SELECT pi.*, s.name as supplier_name, u.full_name as created_by_name
      FROM purchase_invoices pi
      JOIN suppliers s ON pi.supplier_id = s.id
      JOIN users u ON pi.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (start_date) { sql += ' AND DATE(pi.purchase_date) >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND DATE(pi.purchase_date) <= ?'; params.push(end_date); }
    if (supplier_id) { sql += ' AND pi.supplier_id = ?'; params.push(supplier_id); }

    sql += ' ORDER BY pi.created_at DESC';

    const [invoices] = await db.query(sql, params);
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function getPurchaseInvoice(req, res) {
  try {
    const [invoices] = await db.query(
      `SELECT pi.*, s.name as supplier_name, u.full_name as created_by_name
       FROM purchase_invoices pi
       JOIN suppliers s ON pi.supplier_id = s.id
       JOIN users u ON pi.created_by = u.id
       WHERE pi.id = ?`,
      [req.params.id]
    );
    if (invoices.length === 0) return res.status(404).json({ error: 'Purchase invoice not found' });

    const [items] = await db.query(
      `SELECT pii.*, m.name as medicine_name
       FROM purchase_invoice_items pii
       JOIN medicines m ON pii.medicine_id = m.id
       WHERE pii.purchase_invoice_id = ?`,
      [req.params.id]
    );

    res.json({ ...invoices[0], items });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { createPurchaseInvoice, listPurchaseInvoices, getPurchaseInvoice };
