const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

if (process.env.CONFIG_PATH && fs.existsSync(process.env.CONFIG_PATH)) {
  require('dotenv').config({ path: process.env.CONFIG_PATH });
} else {
  require('dotenv').config();
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pharmacy_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
});

pool.getConnection()
  .then(conn => {
    console.log(`[DB] Connected to MySQL at ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
    conn.release();
  })
  .catch(err => {
    console.error('[DB] Connection failed:', err.message);
  });

module.exports = pool;
