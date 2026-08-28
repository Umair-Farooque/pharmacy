const USE_MYSQL = process.env.USE_MYSQL === 'true';

let dbModule;

if (USE_MYSQL) {
  const mysqlPool = require('./connection');
  dbModule = {
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
    DATA_DIR: null,
  };
  console.log('[DB] Configured for MySQL');
} else {
  const sqlite = require('./sqliteDb');
  const origQuery = sqlite.query.bind(sqlite);
  const origRun = sqlite.run.bind(sqlite);
  const origSave = sqlite.save.bind(sqlite);

  dbModule = {
    query: async (sql, params = []) => {
      const results = origQuery(sql, params);
      return [results, []];
    },
    run: async (sql, params = []) => {
      return origRun(sql, params);
    },
    getConnection: () => {
      const conn = sqlite.getConnection();
      return {
        query: async (sql, params = []) => {
          const results = conn.query(sql, params);
          return [results, []];
        },
        run: async (sql, params = []) => {
          return conn.run(sql, params);
        },
        beginTransaction: () => { conn._db.run('BEGIN TRANSACTION'); },
        commit: async () => { conn._db.run('COMMIT'); await origSave(); },
        rollback: () => { conn._db.run('ROLLBACK'); },
        release: () => {},
      };
    },
    init: sqlite.init,
    save: sqlite.save,
    DATA_DIR: sqlite.DATA_DIR,
    getNextSaleBill: sqlite.getNextSaleBill,
  };
  console.log('[DB] Configured for SQLite (local testing)');
}

const db = {
  query: (...args) => dbModule.query(...args),
  run: (...args) => dbModule.run(...args),
  getConnection: (...args) => dbModule.getConnection(...args),
  init: dbModule.init,
  save: dbModule.save,
  DATA_DIR: dbModule.DATA_DIR,
  getNextSaleBill: dbModule.getNextSaleBill,
};

module.exports = db;
