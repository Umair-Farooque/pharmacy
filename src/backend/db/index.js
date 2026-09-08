const mysqlPool = require('./connection');

const db = {
  query: async (sql, params) => {
    const [rows] = await mysqlPool.query(sql, params);
    return [rows, []];
  },
  run: async (sql, params) => {
    const [result] = await mysqlPool.execute(sql, params);
    return result;
  },
  getConnection: async () => {
    const conn = await mysqlPool.getConnection();
    return {
      query: async (sql, params) => { const [rows] = await conn.query(sql, params); return [rows, []]; },
      run: async (sql, params) => { const [result] = await conn.execute(sql, params); return result; },
      beginTransaction: () => conn.beginTransaction(),
      commit: () => conn.commit(),
      rollback: () => conn.rollback(),
      release: () => conn.release(),
    };
  },
  init: async () => { console.log('[DB] Using MySQL'); },
  save: async () => {},
  getNextSaleBill: async () => {
    const [result] = await mysqlPool.execute('UPDATE sale_counter SET counter = counter + 1 WHERE id = 1');
    const [rows] = await mysqlPool.query('SELECT counter FROM sale_counter WHERE id = 1');
    const counter = rows[0]?.counter || 1;
    return `BL${new Date().getFullYear()}${String(counter).padStart(5, '0')}`;
  },
};

console.log('[DB] Configured for MySQL');

module.exports = db;
