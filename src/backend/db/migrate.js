const pool = require('./connection');

async function migrate() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS=0');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('ADMIN','CASHIER') NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        is_active TINYINT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS racks (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        rack_code VARCHAR(20) UNIQUE NOT NULL,
        description VARCHAR(100)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        contact VARCHAR(50),
        address VARCHAR(200)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100),
        phone VARCHAR(20),
        credit_balance DECIMAL(10,2) DEFAULT 0
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS medicines (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(150) NOT NULL,
        generic_name VARCHAR(150),
        category VARCHAR(50),
        manufacturer VARCHAR(100),
        rack_id INTEGER,
        pack_size INTEGER,
        reorder_level INTEGER DEFAULT 10,
        tax_rate DECIMAL(5,2) DEFAULT 0,
        barcode VARCHAR(50) UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        FOREIGN KEY (rack_id) REFERENCES racks(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);
    await conn.query('CREATE INDEX IF NOT EXISTS idx_medicine_name ON medicines(name)');
    await conn.query('CREATE INDEX IF NOT EXISTS idx_medicine_barcode ON medicines(barcode)');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS stock_batches (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        medicine_id INTEGER NOT NULL,
        batch_no VARCHAR(50),
        supplier_id INTEGER,
        purchase_rate_per_unit DECIMAL(10,2) NOT NULL,
        selling_rate_per_unit DECIMAL(10,2) NOT NULL,
        quantity_received INTEGER NOT NULL,
        quantity_in_stock INTEGER NOT NULL,
        expiry_date DATE,
        purchase_date DATE DEFAULT (CURRENT_DATE),
        created_by INTEGER,
        FOREIGN KEY (medicine_id) REFERENCES medicines(id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);
    await conn.query('CREATE INDEX IF NOT EXISTS idx_batch_medicine ON stock_batches(medicine_id)');
    await conn.query('CREATE INDEX IF NOT EXISTS idx_batch_expiry ON stock_batches(expiry_date)');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        bill_number VARCHAR(20) UNIQUE NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        discount_type ENUM('PERCENTAGE','FIXED'),
        discount_value DECIMAL(10,2) DEFAULT 0,
        discount_amount DECIMAL(10,2) DEFAULT 0,
        tax_amount DECIMAL(10,2) DEFAULT 0,
        final_amount DECIMAL(10,2) NOT NULL,
        payment_method ENUM('CASH','CARD','UPI','CREDIT') DEFAULT 'CASH',
        customer_id INTEGER,
        cashier_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cashier_id) REFERENCES users(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      )
    `);
    await conn.query('CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at)');
    await conn.query('CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_id)');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        sale_id INTEGER NOT NULL,
        medicine_id INTEGER NOT NULL,
        batch_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        purchase_rate_per_unit DECIMAL(10,2) NOT NULL,
        selling_rate_per_unit DECIMAL(10,2) NOT NULL,
        line_total DECIMAL(10,2) NOT NULL,
        line_profit DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
        FOREIGN KEY (medicine_id) REFERENCES medicines(id),
        FOREIGN KEY (batch_id) REFERENCES stock_batches(id)
      )
    `);
    await conn.query('CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS stock_transactions (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        medicine_id INTEGER NOT NULL,
        batch_id INTEGER,
        transaction_type ENUM('PURCHASE','SALE','ADJUSTMENT','RETURN','EXPIRED') NOT NULL,
        quantity_change INTEGER NOT NULL,
        quantity_before INTEGER NOT NULL,
        quantity_after INTEGER NOT NULL,
        performed_by INTEGER NOT NULL,
        reference_id INTEGER,
        notes VARCHAR(200),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (medicine_id) REFERENCES medicines(id),
        FOREIGN KEY (batch_id) REFERENCES stock_batches(id),
        FOREIGN KEY (performed_by) REFERENCES users(id)
      )
    `);
    await conn.query('CREATE INDEX IF NOT EXISTS idx_stock_trans_medicine ON stock_transactions(medicine_id)');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS returns (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        original_sale_id INTEGER NOT NULL,
        sale_item_id INTEGER NOT NULL,
        quantity_returned INTEGER NOT NULL,
        refund_amount DECIMAL(10,2) NOT NULL,
        reason VARCHAR(200),
        processed_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (original_sale_id) REFERENCES sales(id),
        FOREIGN KEY (sale_item_id) REFERENCES sale_items(id),
        FOREIGN KEY (processed_by) REFERENCES users(id)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        user_id INTEGER NOT NULL,
        action VARCHAR(50) NOT NULL,
        table_affected VARCHAR(50),
        record_id INTEGER,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS settings (
        \`key\` VARCHAR(50) PRIMARY KEY,
        value VARCHAR(200),
        description VARCHAR(200)
      )
    `);

    await conn.query('SET FOREIGN_KEY_CHECKS=1');

    console.log('[MIGRATE] All tables created successfully.');

    const [rows] = await conn.query("SELECT COUNT(*) as count FROM settings");
    if (rows[0].count === 0) {
      await conn.query(`
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
      console.log('[MIGRATE] Default settings inserted.');
    }

    const [adminRows] = await conn.query("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'");
    if (adminRows[0].count === 0) {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('admin123', 10);
      await conn.query(
        "INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, 'ADMIN', ?)",
        ['admin', hash, 'Administrator']
      );
      console.log('[MIGRATE] Default admin created (username: admin, password: admin123)');
    }

  } catch (err) {
    console.error('[MIGRATE] Error:', err.message);
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrate();
