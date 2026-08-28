const fs = require('fs-extra');
const path = require('path');
const { generateToken } = require('../middleware');

const DATA_DIR = path.join(__dirname, '../../../../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MEDICINES_FILE = path.join(DATA_DIR, 'medicines.json');
const STOCK_BATCHES_FILE = path.join(DATA_DIR, 'stock_batches.json');
const SALES_FILE = path.join(DATA_DIR, 'sales.json');
const SALE_ITEMS_FILE = path.join(DATA_DIR, 'sale_items.json');
const STOCK_TRANS_FILE = path.join(DATA_DIR, 'stock_transactions.json');
const RETURNS_FILE = path.join(DATA_DIR, 'returns.json');
const RACKS_FILE = path.join(DATA_DIR, 'racks.json');
const SUPPLIERS_FILE = path.join(DATA_DIR, 'suppliers.json');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit_log.json');
const BATCH_COUNTER_FILE = path.join(DATA_DIR, 'batch_counter.json');

let initialized = false;

async function ensureDataDir() {
  await fs.ensureDir(DATA_DIR);
}

async function loadJSON(file, defaultVal) {
  try {
    if (await fs.pathExists(file)) {
      const content = await fs.readFile(file, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) { }
  return defaultVal;
}

async function saveJSON(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

async function init() {
  if (initialized) return;
  await ensureDataDir();

  const bcrypt = require('bcryptjs');
  const adminHash = await bcrypt.hash('admin123', 10);

  const defaults = {
    users: [{
      id: 1, username: 'admin', password_hash: adminHash,
      role: 'ADMIN', full_name: 'Administrator',
      phone: null, is_active: 1,
      created_at: new Date().toISOString(), last_login: null
    }],
    medicines: [],
    stock_batches: [],
    sales: [],
    sale_items: [],
    stock_transactions: [],
    returns: [],
    racks: [],
    suppliers: [],
    customers: [],
    settings: {
      server_ip: '192.168.1.100', server_port: '3000',
      shop_name: 'Medical Store', shop_address: '', shop_phone: '',
      tax_enabled: '0', tax_rate: '0',
      cashier_discount_cap_percent: '5',
      auto_backup_enabled: '1', backup_time: '02:00',
      low_stock_alert_default: '10', expiry_alert_days: '60'
    },
    audit_log: [],
    batch_counter: 0,
    sale_counter: 0,
  };

  for (const [key, val] of Object.entries(defaults)) {
    const file = path.join(DATA_DIR, `${key}.json`);
    if (!(await fs.pathExists(file))) {
      await saveJSON(file, val);
    }
  }

  initialized = true;
  console.log('[MOCK DB] Initialized at', DATA_DIR);
}

async function query(sql, params = []) {
  await init();
  const s = sql.trim().toLowerCase();

  if (s.startsWith('select count(*)') && sql.includes('settings')) {
    const data = await loadJSON(SETTINGS_FILE, {});
    return [{ count: Object.keys(data).length }];
  }
  if (s.startsWith('select count(*)') && sql.includes('users')) {
    const data = await loadJSON(USERS_FILE, []);
    const filtered = data.filter(u => u.role === 'ADMIN');
    return [{ count: filtered.length }];
  }
  if (s.startsWith('select') && !sql.includes(' from ') === false) {
    const table = extractTable(sql);
    const data = await loadJSON(getFile(table), []);
    let result = data;

    if (sql.includes('JOIN') && sql.includes('stock_batches') && sql.includes('medicines')) {
      result = data.map(b => {
        const med = result.find ? result : data;
        const m = med.find ? med.find(m => m.id === b.medicine_id) : null;
        const r = med.find ? med.find(r => r.id === (m && m.rack_id)) : null;
        return { ...b, name: m ? m.name : '', rack_code: r ? r.rack_code : '' };
      });
    }

    if (sql.includes('GROUP BY') && sql.includes('medicines')) {
      const grouped = {};
      for (const item of data) {
        const med = (await loadJSON(MEDICINES_FILE, [])).find(m => m.id === item.medicine_id);
        const key = item.medicine_id;
        if (!grouped[key]) grouped[key] = { id: item.medicine_id, name: med ? med.name : '', total_stock: 0 };
        grouped[key].total_stock += item.quantity_in_stock || 0;
      }
      return Object.values(grouped);
    }

    if (params.length > 0 && sql.includes('where')) {
      const col = extractWhereColumn(sql);
      result = data.filter(row => {
        const val = row[col];
        return params.some(p => String(val).toLowerCase().includes(String(p).toLowerCase()));
      });
    }

    if (sql.includes('order by')) {
      const match = sql.match(/order\s+by\s+(\w+)(?:\s+(asc|desc))?/i);
      if (match) {
        const col = match[1];
        const desc = match[2] && match[2].toLowerCase() === 'desc';
        result = [...result].sort((a, b) => {
          if (desc) return a[col] > b[col] ? -1 : 1;
          return a[col] > b[col] ? 1 : -1;
        });
      }
    }

    return result;
  }

  if (s.startsWith('insert into')) {
    const table = extractInsertTable(sql);
    const data = await loadJSON(getFile(table), []);
    const id = (data.length > 0 ? Math.max(...data.map(r => r.id || 0)) : 0) + 1;
    const obj = buildInsertObject(sql, params, id);
    data.push(obj);
    await saveJSON(getFile(table), data);
    return { insertId: id, affectedRows: 1 };
  }

  if (s.startsWith('update')) {
    const table = extractUpdateTable(sql);
    const data = await loadJSON(getFile(table), []);
    const col = extractWhereColumn(sql);
    const idx = data.findIndex(r => String(r[col]) === String(params[params.length - 1]));
    if (idx >= 0) {
      const fields = extractSetFields(sql);
      fields.forEach((f, i) => { data[idx][f] = params[i]; });
      await saveJSON(getFile(table), data);
    }
    return { affectedRows: idx >= 0 ? 1 : 0 };
  }

  if (s.startsWith('delete from')) {
    const table = extractDeleteTable(sql);
    const data = await loadJSON(getFile(table), []);
    const col = extractWhereColumn(sql);
    const filtered = data.filter(r => String(r[col]) !== String(params[0]));
    await saveJSON(getFile(table), filtered);
    return { affectedRows: data.length - filtered.length };
  }

  return [];
}

function getFile(table) {
  const map = {
    users: USERS_FILE, medicines: MEDICINES_FILE, stock_batches: STOCK_BATCHES_FILE,
    sales: SALES_FILE, sale_items: SALE_ITEMS_FILE, stock_transactions: STOCK_TRANS_FILE,
    returns: RETURNS_FILE, racks: RACKS_FILE, suppliers: SUPPLIERS_FILE,
    customers: CUSTOMERS_FILE, settings: SETTINGS_FILE, audit_log: AUDIT_FILE
  };
  return map[table] || USERS_FILE;
}

function extractTable(sql) {
  const match = sql.match(/from\s+(\w+)/i);
  return match ? match[1] : 'users';
}

function extractWhereColumn(sql) {
  const match = sql.match(/where\s+\w+\.(\w+)\s*=/i) || sql.match(/where\s+(\w+)\s*=/i);
  return match ? match[1] : 'id';
}

function extractInsertTable(sql) {
  const match = sql.match(/insert\s+into\s+(\w+)/i);
  return match ? match[1] : 'users';
}

function extractSetFields(sql) {
  const match = sql.match(/set\s+(.+?)\s+where/i);
  if (!match) return [];
  return match[1].split(',').map(s => s.trim().split(/\s+/)[0]);
}

function extractUpdateTable(sql) {
  const match = sql.match(/update\s+(\w+)/i);
  return match ? match[1] : 'users';
}

function extractDeleteTable(sql) {
  const match = sql.match(/delete\s+from\s+(\w+)/i);
  return match ? match[1] : 'users';
}

function buildInsertObject(sql, params, id) {
  const fields = [];
  const vals = [...params];
  if (!sql.includes(' on duplicate')) {
    if (!sql.includes('last_insert_id')) vals.unshift(id);
  }
  const cols = sql.match(/\(([^)]+)\)\s*values/i);
  if (cols) {
    cols[1].split(',').forEach(c => fields.push(c.trim().replace(/`/g, '')));
  }
  const obj = {};
  fields.forEach((f, i) => { obj[f] = vals[i] !== undefined ? vals[i] : null; });
  if (obj.id === undefined && !sql.includes('last_insert_id')) obj.id = id;
  return obj;
}

async function getNextBatchId() {
  const counter = await loadJSON(BATCH_COUNTER_FILE, 0);
  await saveJSON(BATCH_COUNTER_FILE, counter + 1);
  return counter + 1;
}

async function getNextSaleBill() {
  const counter = await loadJSON(BATCH_COUNTER_FILE, { sale: 0 });
  counter.sale = (counter.sale || 0) + 1;
  await saveJSON(BATCH_COUNTER_FILE, counter);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${dateStr}-${String(counter.sale).padStart(4, '0')}`;
}

module.exports = { query, init, loadJSON, saveJSON, getNextBatchId, getNextSaleBill, DATA_DIR };
