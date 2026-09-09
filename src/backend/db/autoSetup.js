const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function autoSetup() {
  const dbName = process.env.DB_NAME || 'pharmacy_db';
  
  const connectionWithoutDb = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });

  try {
    await connectionWithoutDb.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    console.log(`[SETUP] Database '${dbName}' ensured`);
  } finally {
    await connectionWithoutDb.end();
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: dbName,
    multipleStatements: true,
  });

  const run = async (sql, msg) => {
    try {
      await connection.query(sql);
      if (msg) console.log(`[SETUP] ${msg}`);
    } catch (err) {
      console.warn(`[SETUP] ${msg} - ${err.message}`);
    }
  };

  try {
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('ADMIN','CASHIER') NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        is_active TINYINT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
      )
    `, 'users table created');

    await run(`
      CREATE TABLE IF NOT EXISTS racks (
        id INT PRIMARY KEY AUTO_INCREMENT,
        rack_code VARCHAR(20) UNIQUE NOT NULL,
        description VARCHAR(100)
      )
    `, 'racks table created');

    await run(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        contact VARCHAR(50),
        address VARCHAR(200)
      )
    `, 'suppliers table created');

    await run(`
      CREATE TABLE IF NOT EXISTS customers (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100),
        phone VARCHAR(20),
        credit_balance DECIMAL(10,2) DEFAULT 0
      )
    `, 'customers table created');

    await run(`
      CREATE TABLE IF NOT EXISTS medicines (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(150) NOT NULL,
        generic_name VARCHAR(150),
        category VARCHAR(50),
        manufacturer VARCHAR(100),
        rack_id INT,
        pack_size INT,
        reorder_level INT DEFAULT 10,
        tax_rate DECIMAL(5,2) DEFAULT 0,
        barcode VARCHAR(50) UNIQUE,
        current_selling_price DECIMAL(10,2),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INT,
        FOREIGN KEY (rack_id) REFERENCES racks(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `, 'medicines table created');

    await run(`CREATE INDEX idx_medicine_name ON medicines(name)`, 'idx_medicine_name');
    await run(`CREATE INDEX idx_medicine_barcode ON medicines(barcode)`, 'idx_medicine_barcode');

    await run(`
      CREATE TABLE IF NOT EXISTS stock_batches (
        id INT PRIMARY KEY AUTO_INCREMENT,
        medicine_id INT NOT NULL,
        batch_no VARCHAR(50),
        supplier_id INT,
        purchase_rate_per_unit DECIMAL(10,2) NOT NULL,
        selling_rate_per_unit DECIMAL(10,2) NOT NULL,
        quantity_received INT NOT NULL,
        quantity_in_stock INT NOT NULL,
        expiry_date DATE,
        purchase_date DATE DEFAULT (CURRENT_DATE),
        created_by INT,
        FOREIGN KEY (medicine_id) REFERENCES medicines(id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `, 'stock_batches table created');

    await run(`CREATE INDEX idx_batch_medicine ON stock_batches(medicine_id)`, 'idx_batch_medicine');
    await run(`CREATE INDEX idx_batch_expiry ON stock_batches(expiry_date)`, 'idx_batch_expiry');

    await run(`
      CREATE TABLE IF NOT EXISTS sales (
        id INT PRIMARY KEY AUTO_INCREMENT,
        bill_number VARCHAR(20) UNIQUE NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        discount_type ENUM('PERCENTAGE','FIXED'),
        discount_value DECIMAL(10,2) DEFAULT 0,
        discount_amount DECIMAL(10,2) DEFAULT 0,
        tax_amount DECIMAL(10,2) DEFAULT 0,
        final_amount DECIMAL(10,2) NOT NULL,
        payment_method ENUM('CASH','CARD','UPI','CREDIT') DEFAULT 'CASH',
        customer_id INT,
        cashier_id INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cashier_id) REFERENCES users(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      )
    `, 'sales table created');

    await run(`CREATE INDEX idx_sales_date ON sales(created_at)`, 'idx_sales_date');
    await run(`CREATE INDEX idx_sales_cashier ON sales(cashier_id)`, 'idx_sales_cashier');

    await run(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id INT PRIMARY KEY AUTO_INCREMENT,
        sale_id INT NOT NULL,
        medicine_id INT NOT NULL,
        batch_id INT NOT NULL,
        quantity INT NOT NULL,
        purchase_rate_per_unit DECIMAL(10,2) NOT NULL,
        selling_rate_per_unit DECIMAL(10,2) NOT NULL,
        line_total DECIMAL(10,2) NOT NULL,
        line_profit DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
        FOREIGN KEY (medicine_id) REFERENCES medicines(id),
        FOREIGN KEY (batch_id) REFERENCES stock_batches(id)
      )
    `, 'sale_items table created');

    await run(`CREATE INDEX idx_sale_items_sale ON sale_items(sale_id)`, 'idx_sale_items_sale');

    await run(`
      CREATE TABLE IF NOT EXISTS stock_transactions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        medicine_id INT NOT NULL,
        batch_id INT,
        transaction_type ENUM('PURCHASE','SALE','ADJUSTMENT','RETURN','EXPIRED') NOT NULL,
        quantity_change INT NOT NULL,
        quantity_before INT NOT NULL,
        quantity_after INT NOT NULL,
        performed_by INT NOT NULL,
        reference_id INT,
        notes VARCHAR(200),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (medicine_id) REFERENCES medicines(id),
        FOREIGN KEY (batch_id) REFERENCES stock_batches(id),
        FOREIGN KEY (performed_by) REFERENCES users(id)
      )
    `, 'stock_transactions table created');

    await run(`CREATE INDEX idx_stock_trans_medicine ON stock_transactions(medicine_id)`, 'idx_stock_trans_medicine');

    await run(`
      CREATE TABLE IF NOT EXISTS returns (
        id INT PRIMARY KEY AUTO_INCREMENT,
        return_reference VARCHAR(50) UNIQUE NOT NULL,
        original_sale_id INT NOT NULL,
        sale_item_id INT NOT NULL,
        quantity_returned INT NOT NULL,
        refund_amount DECIMAL(10,2) NOT NULL,
        cogs_reversed DECIMAL(10,2) NOT NULL DEFAULT 0,
        reason VARCHAR(200),
        processed_by INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (original_sale_id) REFERENCES sales(id),
        FOREIGN KEY (sale_item_id) REFERENCES sale_items(id),
        FOREIGN KEY (processed_by) REFERENCES users(id)
      )
    `, 'returns table created');

    await run(`
      CREATE TABLE IF NOT EXISTS return_items (
        id INT PRIMARY KEY AUTO_INCREMENT,
        return_id INT NOT NULL,
        sale_item_id INT NOT NULL,
        medicine_id INT NOT NULL,
        batch_id INT NOT NULL,
        quantity_returned INT NOT NULL,
        selling_rate_per_unit DECIMAL(10,2) NOT NULL,
        purchase_rate_per_unit DECIMAL(10,2) NOT NULL,
        refund_amount DECIMAL(10,2) NOT NULL,
        cogs_reversed DECIMAL(10,2) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (return_id) REFERENCES returns(id),
        FOREIGN KEY (sale_item_id) REFERENCES sale_items(id),
        FOREIGN KEY (medicine_id) REFERENCES medicines(id),
        FOREIGN KEY (batch_id) REFERENCES stock_batches(id)
      )
    `, 'return_items table created');

    await run(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        action VARCHAR(50) NOT NULL,
        table_affected VARCHAR(50),
        record_id INT,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `, 'audit_log table created');

    await run(`
      CREATE TABLE IF NOT EXISTS customer_credit_transactions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        customer_id INT NOT NULL,
        sale_id INT,
        type ENUM('CREDIT_SALE', 'PAYMENT', 'ADJUSTMENT', 'REVERSAL') NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        balance_after DECIMAL(10,2) NOT NULL,
        notes VARCHAR(200),
        processed_by INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (sale_id) REFERENCES sales(id),
        FOREIGN KEY (processed_by) REFERENCES users(id)
      )
    `, 'customer_credit_transactions table created');

    await run(`CREATE INDEX idx_customer_credit_customer ON customer_credit_transactions(customer_id)`, 'idx_customer_credit_customer');
    await run(`CREATE INDEX idx_customer_credit_sale ON customer_credit_transactions(sale_id)`, 'idx_customer_credit_sale');

    await run(`
      CREATE TABLE IF NOT EXISTS settings (
        \`key\` VARCHAR(50) PRIMARY KEY,
        value VARCHAR(200),
        description VARCHAR(200)
      )
    `, 'settings table created');

    await run(`
      CREATE TABLE IF NOT EXISTS sale_counter (
        id INT PRIMARY KEY,
        counter INT DEFAULT 0
      )
    `, 'sale_counter table created');

    await run(`
      CREATE TABLE IF NOT EXISTS purchase_invoices (
        id INT PRIMARY KEY AUTO_INCREMENT,
        invoice_number VARCHAR(50) UNIQUE NOT NULL,
        supplier_id INT NOT NULL,
        purchase_date DATE NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        discount_amount DECIMAL(10,2) DEFAULT 0,
        tax_amount DECIMAL(10,2) DEFAULT 0,
        total_amount DECIMAL(10,2) NOT NULL,
        notes VARCHAR(200),
        created_by INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `, 'purchase_invoices table created');

    await run(`
      CREATE TABLE IF NOT EXISTS purchase_invoice_items (
        id INT PRIMARY KEY AUTO_INCREMENT,
        purchase_invoice_id INT NOT NULL,
        medicine_id INT NOT NULL,
        batch_id INT NOT NULL,
        quantity INT NOT NULL,
        purchase_rate_per_unit DECIMAL(10,2) NOT NULL,
        selling_rate_per_unit DECIMAL(10,2) NOT NULL,
        expiry_date DATE,
        line_total DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id),
        FOREIGN KEY (medicine_id) REFERENCES medicines(id),
        FOREIGN KEY (batch_id) REFERENCES stock_batches(id)
      )
    `, 'purchase_invoice_items table created');

    await run(`CREATE INDEX idx_purchase_invoice_supplier ON purchase_invoices(supplier_id)`, 'idx_purchase_invoice_supplier');
    await run(`CREATE INDEX idx_purchase_invoice_date ON purchase_invoices(purchase_date)`, 'idx_purchase_invoice_date');
    await run(`CREATE INDEX idx_purchase_invoice_items_invoice ON purchase_invoice_items(purchase_invoice_id)`, 'idx_purchase_invoice_items_invoice');

    await run(`
      CREATE TABLE IF NOT EXISTS supplier_returns (
        id INT PRIMARY KEY AUTO_INCREMENT,
        return_reference VARCHAR(50) UNIQUE NOT NULL,
        supplier_id INT NOT NULL,
        batch_id INT NOT NULL,
        medicine_id INT NOT NULL,
        quantity_returned INT NOT NULL,
        purchase_rate_per_unit DECIMAL(10,2) NOT NULL,
        reason VARCHAR(200),
        processed_by INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
        FOREIGN KEY (batch_id) REFERENCES stock_batches(id),
        FOREIGN KEY (medicine_id) REFERENCES medicines(id),
        FOREIGN KEY (processed_by) REFERENCES users(id)
      )
    `, 'supplier_returns table created');

    await run(`
      CREATE TABLE IF NOT EXISTS supplier_return_items (
        id INT PRIMARY KEY AUTO_INCREMENT,
        supplier_return_id INT NOT NULL,
        batch_id INT NOT NULL,
        medicine_id INT NOT NULL,
        quantity_returned INT NOT NULL,
        purchase_rate_per_unit DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (supplier_return_id) REFERENCES supplier_returns(id),
        FOREIGN KEY (batch_id) REFERENCES stock_batches(id),
        FOREIGN KEY (medicine_id) REFERENCES medicines(id)
      )
    `, 'supplier_return_items table created');

    console.log('[SETUP] Tables created');

    try {
      await run(`ALTER TABLE medicines ADD COLUMN current_selling_price DECIMAL(10,2)`, 'Migration: add current_selling_price');
    } catch (e) { console.warn('[MIGRATION] current_selling_price may already exist'); }

    try {
      const [rows] = await connection.query("SELECT id FROM medicines WHERE current_selling_price IS NULL AND id IN (SELECT DISTINCT medicine_id FROM stock_batches WHERE quantity_in_stock > 0)");
      for (const row of rows) {
        const [batch] = await connection.query(
          `SELECT selling_rate_per_unit FROM stock_batches WHERE medicine_id = ? AND quantity_in_stock > 0 ORDER BY expiry_date ASC LIMIT 1`,
          [row.id]
        );
        if (batch.length > 0) {
          await connection.query(`UPDATE medicines SET current_selling_price = ? WHERE id = ?`, [batch[0].selling_rate_per_unit, row.id]);
        }
      }
      console.log('[MIGRATION] Backfilled current_selling_price from earliest-expiry batch');
    } catch (e) { console.warn('[MIGRATION] Backfill error:', e.message); }

    try {
      await run(`ALTER TABLE sale_items ADD COLUMN service_charge DECIMAL(10,2) DEFAULT 0`, 'Migration: add service_charge');
    } catch (e) { console.warn('[MIGRATION] service_charge may already exist'); }

    try {
      await run(`ALTER TABLE audit_log ADD COLUMN details TEXT`, 'Migration: add audit_log.details');
    } catch (e) { console.warn('[MIGRATION] audit_log.details may already exist'); }

    try {
      await run(`ALTER TABLE customers MODIFY COLUMN name VARCHAR(100) NOT NULL`, 'Migration: customers.name NOT NULL');
    } catch (e) { console.warn('[MIGRATION] customers.name NOT NULL may already exist'); }

    try {
      await run(`ALTER TABLE customers MODIFY COLUMN phone VARCHAR(20) NOT NULL`, 'Migration: customers.phone NOT NULL');
    } catch (e) { console.warn('[MIGRATION] customers.phone NOT NULL may already exist'); }

    try {
      await run(`ALTER TABLE customers ADD COLUMN is_active TINYINT DEFAULT 1`, 'Migration: add customers.is_active');
    } catch (e) { console.warn('[MIGRATION] customers.is_active may already exist'); }

    try {
      await run(`ALTER TABLE customers ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`, 'Migration: add customers.created_at');
    } catch (e) { console.warn('[MIGRATION] customers.created_at may already exist'); }

    try {
      await run(`ALTER TABLE customers ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`, 'Migration: add customers.updated_at');
    } catch (e) { console.warn('[MIGRATION] customers.updated_at may already exist'); }

    try {
      await run(`CREATE UNIQUE INDEX idx_customer_phone ON customers(phone)`, 'Migration: unique index on customers.phone');
    } catch (e) { console.warn('[MIGRATION] idx_customer_phone may already exist'); }

    try {
      await run(`ALTER TABLE sales DROP FOREIGN KEY sales_ibfk_1`, 'Migration: drop old customer FK');
    } catch (e) { console.warn('[MIGRATION] old customer FK drop:', e.message); }

    try {
      await run(`ALTER TABLE sales ADD CONSTRAINT sales_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL`, 'Migration: add customer FK ON DELETE SET NULL');
    } catch (e) { console.warn('[MIGRATION] customer FK:', e.message); }

    try {
      await run(`CREATE INDEX idx_sales_customer ON sales(customer_id)`, 'Migration: sales.customer_id index');
    } catch (e) { console.warn('[MIGRATION] idx_sales_customer may already exist'); }

    const [settingsCount] = await connection.query("SELECT COUNT(*) as count FROM settings");
    if (settingsCount[0].count === 0) {
      await connection.query(`
        INSERT INTO settings (\`key\`, value, description) VALUES
          ('server_ip', '192.168.1.100', 'Server IP address'),
          ('server_port', '3000', 'API server port'),
          ('shop_name', 'Medical Store', 'Shop name for bills'),
          ('shop_address', '', 'Shop address'),
          ('shop_phone', '', 'Shop phone number'),
          ('tax_enabled', '0', 'Enable GST/tax'),
          ('tax_rate', '0', 'Default tax percentage'),
          ('cashier_discount_cap_percent', '5', 'Max discount % a cashier can apply without admin approval'),
          ('auto_backup_enabled', '1', 'Enable automatic backup'),
          ('backup_time', '02:00', 'Daily backup time'),
          ('low_stock_alert_default', '10', 'Default low-stock threshold'),
          ('expiry_alert_days', '60', 'Warn this many days before expiry')
      `);
      console.log('[SETUP] Default settings inserted');
    }

    const [adminCount] = await connection.query("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'");
    if (adminCount[0].count === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await connection.query(
        "INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, 'ADMIN', ?)",
        ['admin', hash, 'Administrator']
      );
      console.log('[SETUP] Default admin created (username: admin, password: admin123)');
    }

    const [counterCount] = await connection.query("SELECT COUNT(*) as count FROM sale_counter");
    if (counterCount[0].count === 0) {
      await connection.query("INSERT INTO sale_counter (id, counter) VALUES (1, 0)");
    }

    console.log('[SETUP] Database setup complete');
  } finally {
    await connection.end();
  }
}

module.exports = autoSetup;
