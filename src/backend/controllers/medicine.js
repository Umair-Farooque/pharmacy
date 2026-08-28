const db = require('../db');
const { logAudit } = require('../middleware');

async function listMedicines(req, res) {
  try {
    const { search, rack_id, category } = req.query;
    let sql = `
      SELECT m.*,
        COALESCE(SUM(sb.quantity_in_stock), 0) as total_stock,
        r.rack_code,
        (SELECT sb2.selling_rate_per_unit FROM stock_batches sb2
         WHERE sb2.medicine_id = m.id AND sb2.quantity_in_stock > 0
         ORDER BY sb2.expiry_date ASC LIMIT 1) as selling_rate_per_unit,
        (SELECT sb3.purchase_rate_per_unit FROM stock_batches sb3
         WHERE sb3.medicine_id = m.id AND sb3.quantity_in_stock > 0
         ORDER BY sb3.expiry_date ASC LIMIT 1) as purchase_rate_per_unit
      FROM medicines m
      LEFT JOIN stock_batches sb ON m.id = sb.medicine_id AND sb.quantity_in_stock > 0
      LEFT JOIN racks r ON m.rack_id = r.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      sql += ' AND (m.name LIKE ? OR m.generic_name LIKE ? OR m.barcode LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (rack_id) {
      sql += ' AND m.rack_id = ?';
      params.push(rack_id);
    }
    if (category) {
      sql += ' AND m.category = ?';
      params.push(category);
    }

    sql += ' GROUP BY m.id ORDER BY m.name';

    const [medicines] = await db.query(sql, params);
    res.json(medicines);
  } catch (err) {
    console.error('[MEDICINE] List error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getMedicine(req, res) {
  try {
    const [medicines] = await db.query('SELECT * FROM medicines WHERE id = ?', [req.params.id]);
    if (medicines.length === 0) return res.status(404).json({ error: 'Medicine not found' });

    const [batches] = await db.query(
      'SELECT * FROM stock_batches WHERE medicine_id = ? ORDER BY expiry_date ASC',
      [req.params.id]
    );

    const [transactions] = await db.query(
      'SELECT * FROM stock_transactions WHERE medicine_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.params.id]
    );

    res.json({ ...medicines[0], batches, transactions });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function createMedicine(req, res) {
  const { name, generic_name, category, manufacturer, rack_id, pack_size, reorder_level, tax_rate, barcode } = req.body;
  if (!name) return res.status(400).json({ error: 'Medicine name is required' });

  try {
    const [result] = await db.query(
      `INSERT INTO medicines (name, generic_name, category, manufacturer, rack_id, pack_size, reorder_level, tax_rate, barcode, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, generic_name || null, category || null, manufacturer || null, rack_id || null,
       pack_size || null, reorder_level || 10, tax_rate || 0, barcode || null, req.user.id]
    );
    await logAudit(req.user.id, 'MEDICINE_CREATED', 'medicines', result.insertId, { name });
    res.status(201).json({ id: result.insertId, message: 'Medicine created' });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Barcode already exists' });
    console.error('[MEDICINE] Create error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function updateMedicine(req, res) {
  const { name, generic_name, category, manufacturer, rack_id, pack_size, reorder_level, tax_rate, barcode } = req.body;
  try {
    await db.query(
      `UPDATE medicines SET name=?, generic_name=?, category=?, manufacturer=?, rack_id=?,
       pack_size=?, reorder_level=?, tax_rate=?, barcode=? WHERE id=?`,
      [name, generic_name || null, category || null, manufacturer || null, rack_id || null,
       pack_size || null, reorder_level || 10, tax_rate || 0, barcode || null, req.params.id]
    );
    await logAudit(req.user.id, 'MEDICINE_UPDATED', 'medicines', req.params.id, { name });
    res.json({ message: 'Medicine updated' });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Barcode already exists' });
    res.status(500).json({ error: 'Server error' });
  }
}

async function deleteMedicine(req, res) {
  try {
    const [sales] = await db.query('SELECT COUNT(*) as count FROM sale_items WHERE medicine_id = ?', [req.params.id]);
    if (sales[0].count > 0) {
      return res.status(409).json({ error: 'Cannot delete medicine with sales history' });
    }
    await db.query('DELETE FROM stock_batches WHERE medicine_id = ?', [req.params.id]);
    await db.query('DELETE FROM medicines WHERE id = ?', [req.params.id]);
    await logAudit(req.user.id, 'MEDICINE_DELETED', 'medicines', req.params.id, null);
    res.json({ message: 'Medicine deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function getCategories(req, res) {
  try {
    const [rows] = await db.query("SELECT DISTINCT category FROM medicines WHERE category IS NOT NULL ORDER BY category");
    res.json(rows.map(r => r.category));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { listMedicines, getMedicine, createMedicine, updateMedicine, deleteMedicine, getCategories };
