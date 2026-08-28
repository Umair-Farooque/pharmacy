const jwt = require('jsonwebtoken');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'pharmacy_secret_key_change_in_production';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

async function logAudit(userId, action, tableAffected, recordId, details) {
  try {
    await db.query(
      'INSERT INTO audit_log (user_id, action, table_affected, record_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, action, tableAffected, recordId, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('[AUDIT] Failed to log:', err.message);
  }
}

module.exports = { generateToken, requireAuth, requireAdmin, logAudit, JWT_SECRET };
