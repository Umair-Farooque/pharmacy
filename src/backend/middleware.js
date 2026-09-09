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

async function captureBeforeAfter(tableName, recordId, changes) {
  try {
    const [rows] = await db.query(`SELECT * FROM ${tableName} WHERE id = ?`, [recordId]);
    if (rows.length === 0) return null;
    const row = rows[0];
    const before = {};
    if (Array.isArray(changes)) {
      changes.forEach(field => { before[field] = row[field] !== undefined ? row[field] : null; });
    } else if (typeof changes === 'function') {
      return changes(row);
    }
    return before;
  } catch (err) {
    console.error('[AUDIT] captureBeforeAfter error:', err.message);
    return null;
  }
}

async function logAuditWithBeforeAfter(userId, action, tableAffected, recordId, before, after) {
  try {
    const sanitizedBefore = before && typeof before === 'object' ? { ...before } : before;
    const sanitizedAfter = after && typeof after === 'object' ? { ...after } : after;
    if (sanitizedBefore && sanitizedBefore.password_hash) sanitizedBefore.password_hash = '[REDACTED]';
    if (sanitizedAfter && sanitizedAfter.password_hash) sanitizedAfter.password_hash = '[REDACTED]';
    await logAudit(userId, action, tableAffected, recordId, { before: sanitizedBefore, after: sanitizedAfter });
  } catch (err) {
    console.error('[AUDIT] logAuditWithBeforeAfter error:', err.message);
  }
}

module.exports = { generateToken, requireAuth, requireAdmin, logAudit, logAuditWithBeforeAfter, captureBeforeAfter, JWT_SECRET };
