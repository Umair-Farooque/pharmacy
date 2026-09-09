const db = require('../db');

async function listSuppliers(req, res) {
  try {
    const [suppliers] = await db.query('SELECT * FROM suppliers ORDER BY name');
    res.json(suppliers);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function createSupplier(req, res) {
  const { name, contact, address } = req.body;
  if (!name) return res.status(400).json({ error: 'Supplier name required' });
  try {
    const [result] = await db.query(
      'INSERT INTO suppliers (name, contact, address) VALUES (?, ?, ?)',
      [name, contact || null, address || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function updateSupplier(req, res) {
  const { name, contact, address } = req.body;
  try {
    await db.query('UPDATE suppliers SET name=?, contact=?, address=? WHERE id=?', [name, contact || null, address || null, req.params.id]);
    res.json({ message: 'Supplier updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function deleteSupplier(req, res) {
  try {
    await db.query('DELETE FROM suppliers WHERE id = ?', [req.params.id]);
    res.json({ message: 'Supplier deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function getSupplierProfile(req, res) {
  try {
    const [suppliers] = await db.query('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    if (suppliers.length === 0) return res.status(404).json({ error: 'Supplier not found' });

    const [purchaseStats] = await db.query(
      `SELECT COUNT(*) as total_purchase_invoices, COALESCE(SUM(total_amount), 0) as total_purchase_amount, MAX(purchase_date) as last_purchase_date
       FROM purchase_invoices WHERE supplier_id = ?`,
      [req.params.id]
    );

    res.json({ ...suppliers[0], ...purchaseStats[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function getSupplierProducts(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT DISTINCT m.id, m.name, m.generic_name, m.category, m.manufacturer
       FROM medicines m
       JOIN stock_batches sb ON m.id = sb.medicine_id
       WHERE sb.supplier_id = ?
       ORDER BY m.name`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { listSuppliers, createSupplier, updateSupplier, deleteSupplier, getSupplierProfile, getSupplierProducts };
