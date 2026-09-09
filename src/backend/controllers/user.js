const bcrypt = require('bcryptjs');
const db = require('../db');
const { logAudit, captureBeforeAfter, logAuditWithBeforeAfter } = require('../middleware');

async function listUsers(req, res) {
  try {
    const [users] = await db.query(
      'SELECT id, username, role, full_name, phone, is_active, created_at, last_login FROM users ORDER BY full_name'
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function createUser(req, res) {
  const { username, password, role, full_name, phone } = req.body;
  if (!username || !password || !role || !full_name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (username, password_hash, role, full_name, phone) VALUES (?, ?, ?, ?, ?)',
      [username, hash, role, full_name, phone || null]
    );
    await logAuditWithBeforeAfter(req.user.id, 'USER_CREATED', 'users', result.insertId, null, { username, role });
    res.status(201).json({ id: result.insertId, message: 'User created' });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Server error' });
  }
}

async function updateUser(req, res) {
  const { role, full_name, phone, is_active } = req.body;
  const changedFields = ['role', 'full_name', 'phone', 'is_active'];
  try {
    const before = await captureBeforeAfter('users', req.params.id, changedFields);
    await db.query(
      'UPDATE users SET role=?, full_name=?, phone=?, is_active=? WHERE id=?',
      [role, full_name, phone || null, is_active, req.params.id]
    );
    const after = { role, full_name, phone: phone || null, is_active };
    await logAuditWithBeforeAfter(req.user.id, 'USER_UPDATED', 'users', req.params.id, before, after);
    res.json({ message: 'User updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function resetPassword(req, res) {
  const { new_password } = req.body;
  if (!new_password) return res.status(400).json({ error: 'New password required' });
  try {
    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
    await logAuditWithBeforeAfter(req.user.id, 'PASSWORD_RESET', 'users', req.params.id, null, { note: 'password changed' });
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function deleteUser(req, res) {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  try {
    await db.query('UPDATE users SET is_active = 0 WHERE id = ?', [req.params.id]);
    await logAuditWithBeforeAfter(req.user.id, 'USER_DEACTIVATED', 'users', req.params.id, { is_active: 1 }, { is_active: 0 });
    res.json({ message: 'User deactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { listUsers, createUser, updateUser, resetPassword, deleteUser };
