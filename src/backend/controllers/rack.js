const db = require('../db');

async function listRacks(req, res) {
  try {
    const [racks] = await db.query(`
      SELECT r.*, COUNT(m.id) as medicine_count FROM racks r
      LEFT JOIN medicines m ON r.id = m.rack_id
      GROUP BY r.id ORDER BY r.rack_code
    `);
    res.json(racks);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function createRack(req, res) {
  const { rack_code, description } = req.body;
  if (!rack_code) return res.status(400).json({ error: 'rack_code is required' });
  try {
    const [result] = await db.query(
      'INSERT INTO racks (rack_code, description) VALUES (?, ?)',
      [rack_code, description || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Rack code already exists' });
    res.status(500).json({ error: 'Server error' });
  }
}

async function updateRack(req, res) {
  const { rack_code, description } = req.body;
  try {
    await db.query('UPDATE racks SET rack_code=?, description=? WHERE id=?', [rack_code, description || null, req.params.id]);
    res.json({ message: 'Rack updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function deleteRack(req, res) {
  try {
    const [meds] = await db.query('SELECT COUNT(*) as count FROM medicines WHERE rack_id = ?', [req.params.id]);
    if (meds[0].count > 0) return res.status(409).json({ error: 'Rack has medicines assigned' });
    await db.query('DELETE FROM racks WHERE id = ?', [req.params.id]);
    res.json({ message: 'Rack deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { listRacks, createRack, updateRack, deleteRack };
