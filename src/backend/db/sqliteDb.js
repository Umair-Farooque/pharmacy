const path = require('path');
const fs = require('fs-extra');

const DATA_DIR = path.join(__dirname, '../../../../data');
const DB_FILE = path.join(DATA_DIR, 'pharmacy.db');

let db = null;
let SQL = null;
let ready = false;

async function init() {
  if (ready) return;
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();
  await fs.ensureDir(DATA_DIR);

  if (await fs.pathExists(DB_FILE)) {
    const buf = await fs.readFile(DB_FILE);
    db = new SQL.Database(buf);
    migrateSchema();
  } else {
    db = new SQL.Database();
    createTables();
    seedData();
    await save();
  }

  ready = true;
  console.log('[SQLITE] Database ready at', DB_FILE);
}

function migrateSchema() {
  try {
    db.run(`ALTER TABLE medicines ADD COLUMN current_selling_price REAL`);
    console.log('[SQLITE MIGRATION] Added current_selling_price to medicines');
  } catch (e) { }

  try {
    db.exec(`SELECT service_charge FROM sale_items LIMIT 1`);
  } catch (e) {
    try {
      db.run(`ALTER TABLE sale_items ADD COLUMN service_charge REAL DEFAULT 0`);
      console.log('[SQLITE MIGRATION] Added service_charge to sale_items');
    } catch (e2) { }
  }

  const meds = query(`SELECT id FROM medicines WHERE current_selling_price IS NULL`);
  for (const med of meds) {
    const batches = query(`SELECT selling_rate_per_unit FROM stock_batches WHERE medicine_id = ? AND quantity_in_stock > 0 ORDER BY expiry_date ASC LIMIT 1`, [med.id]);
    if (batches.length > 0) {
      db.run(`UPDATE medicines SET current_selling_price = ? WHERE id = ?`, [batches[0].selling_rate_per_unit, med.id]);
    }
  }
}

async function save() {
  if (!db) return;
  const data = db.export();
  const buf = Buffer.from(data);
  await fs.writeFile(DB_FILE, buf);
}

function createTables() {
  db.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN','CASHIER')),
      full_name TEXT NOT NULL,
      phone TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      last_login TEXT
    )
  `);

  db.run(`
    CREATE TABLE racks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rack_code TEXT UNIQUE NOT NULL,
      description TEXT
    )
  `);

  db.run(`
    CREATE TABLE suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact TEXT,
      address TEXT
    )
  `);

  db.run(`
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      phone TEXT,
      credit_balance REAL DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE medicines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      generic_name TEXT,
      category TEXT,
      manufacturer TEXT,
      rack_id INTEGER,
      pack_size INTEGER,
      reorder_level INTEGER DEFAULT 10,
      tax_rate REAL DEFAULT 0,
      barcode TEXT UNIQUE,
      current_selling_price REAL,
      created_at TEXT DEFAULT (datetime('now')),
      created_by INTEGER,
      FOREIGN KEY (rack_id) REFERENCES racks(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_medicine_name ON medicines(name)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_medicine_barcode ON medicines(barcode)`);

  db.run(`
    CREATE TABLE stock_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER NOT NULL,
      batch_no TEXT,
      supplier_id INTEGER,
      purchase_rate_per_unit REAL NOT NULL,
      selling_rate_per_unit REAL NOT NULL,
      quantity_received INTEGER NOT NULL,
      quantity_in_stock INTEGER NOT NULL,
      expiry_date TEXT,
      purchase_date TEXT DEFAULT (date('now')),
      created_by INTEGER,
      FOREIGN KEY (medicine_id) REFERENCES medicines(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_batch_medicine ON stock_batches(medicine_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_batch_expiry ON stock_batches(expiry_date)`);

  db.run(`
    CREATE TABLE sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_number TEXT UNIQUE NOT NULL,
      subtotal REAL NOT NULL,
      discount_type TEXT,
      discount_value REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      final_amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'CASH',
      customer_id INTEGER,
      cashier_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (cashier_id) REFERENCES users(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_id)`);

  db.run(`
    CREATE TABLE sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      medicine_id INTEGER NOT NULL,
      batch_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      purchase_rate_per_unit REAL NOT NULL,
      selling_rate_per_unit REAL NOT NULL,
      line_total REAL NOT NULL,
      line_profit REAL NOT NULL,
      service_charge REAL DEFAULT 0,
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (medicine_id) REFERENCES medicines(id),
      FOREIGN KEY (batch_id) REFERENCES stock_batches(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)`);

  db.run(`
    CREATE TABLE stock_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER NOT NULL,
      batch_id INTEGER,
      transaction_type TEXT NOT NULL CHECK(transaction_type IN ('PURCHASE','SALE','ADJUSTMENT','RETURN','EXPIRED')),
      quantity_change INTEGER NOT NULL,
      quantity_before INTEGER NOT NULL,
      quantity_after INTEGER NOT NULL,
      performed_by INTEGER NOT NULL,
      reference_id INTEGER,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (medicine_id) REFERENCES medicines(id),
      FOREIGN KEY (batch_id) REFERENCES stock_batches(id),
      FOREIGN KEY (performed_by) REFERENCES users(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_stock_trans_medicine ON stock_transactions(medicine_id)`);

  db.run(`
    CREATE TABLE returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_sale_id INTEGER NOT NULL,
      sale_item_id INTEGER NOT NULL,
      quantity_returned INTEGER NOT NULL,
      refund_amount REAL NOT NULL,
      reason TEXT,
      processed_by INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (original_sale_id) REFERENCES sales(id),
      FOREIGN KEY (sale_item_id) REFERENCES sale_items(id),
      FOREIGN KEY (processed_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      table_affected TEXT,
      record_id INTEGER,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      description TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sale_counter (
      id INTEGER PRIMARY KEY,
      counter INTEGER DEFAULT 0
    )
  `);
  db.run(`INSERT OR IGNORE INTO sale_counter (id, counter) VALUES (1, 0)`);
}

function seedData() {
  const bcrypt = require('bcryptjs');

  db.run(`INSERT INTO settings (key, value, description) VALUES ('server_ip', '192.168.1.100', 'Server IP address')`);
  db.run(`INSERT INTO settings (key, value, description) VALUES ('server_port', '3000', 'API server port')`);
  db.run(`INSERT INTO settings (key, value, description) VALUES ('shop_name', 'Medical Store', 'Shop name for bills')`);
  db.run(`INSERT INTO settings (key, value, description) VALUES ('shop_address', '', 'Shop address')`);
  db.run(`INSERT INTO settings (key, value, description) VALUES ('shop_phone', '', 'Shop phone number')`);
  db.run(`INSERT INTO settings (key, value, description) VALUES ('tax_enabled', '0', 'Enable GST/tax')`);
  db.run(`INSERT INTO settings (key, value, description) VALUES ('tax_rate', '0', 'Default tax percentage')`);
  db.run(`INSERT INTO settings (key, value, description) VALUES ('cashier_discount_cap_percent', '5', 'Max discount % a cashier can apply without admin approval')`);
  db.run(`INSERT INTO settings (key, value, description) VALUES ('auto_backup_enabled', '1', 'Enable automatic backup')`);
  db.run(`INSERT INTO settings (key, value, description) VALUES ('backup_time', '02:00', 'Daily backup time')`);
  db.run(`INSERT INTO settings (key, value, description) VALUES ('low_stock_alert_default', '10', 'Default low-stock threshold')`);
  db.run(`INSERT INTO settings (key, value, description) VALUES ('expiry_alert_days', '60', 'Warn this many days before expiry')`);

  const hash = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, ?, ?)`, ['admin', hash, 'ADMIN', 'Administrator']);
  console.log('[SQLITE] Default admin created (admin / admin123)');

  db.run(`INSERT INTO racks (rack_code, description) VALUES ('A1', 'Shelf A1 - Tablets')`);
  db.run(`INSERT INTO racks (rack_code, description) VALUES ('A2', 'Shelf A2 - Capsules')`);
  db.run(`INSERT INTO racks (rack_code, description) VALUES ('B1', 'Shelf B1 - Syrups')`);
  db.run(`INSERT INTO racks (rack_code, description) VALUES ('B2', 'Shelf B2 - Injections')`);
  db.run(`INSERT INTO racks (rack_code, description) VALUES ('C1', 'Shelf C1 - Creams')`);

  db.run(`INSERT INTO suppliers (name, contact, address) VALUES ('Pharma Distributors Ltd', '98765-43210', '123 Medicine Lane, Mumbai')`);
  db.run(`INSERT INTO suppliers (name, contact, address) VALUES ('ABC Pharma', '87654-32109', '456 Health Ave, Delhi')`);
}

function query(sql, params = []) {
  if (!ready) throw new Error('DB not initialized - call init() first');
  try {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  } catch (e) {
    throw e;
  }
}

function run(sql, params = []) {
  if (!ready) throw new Error('DB not initialized - call init() first');
  try {
    db.run(sql, params);
    return { insertId: db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] || 0, affectedRows: db.getRowsModified() };
  } catch (e) {
    throw e;
  }
}

function getConnection() {
  return { query, run, _db: db, _save: save };
}

function getNextSaleBill() {
  if (!ready) throw new Error('DB not initialized');
  db.run(`UPDATE sale_counter SET counter = counter + 1 WHERE id = 1`);
  const result = db.exec("SELECT counter FROM sale_counter WHERE id = 1")[0];
  const num = result ? result.values[0][0] : 1;
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${dateStr}-${String(num).padStart(4, '0')}`;
}

module.exports = { init, query, run, getConnection, save, getNextSaleBill, DATA_DIR };
