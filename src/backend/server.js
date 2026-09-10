const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

if (process.env.CONFIG_PATH && fs.existsSync(process.env.CONFIG_PATH)) {
  require('dotenv').config({ path: process.env.CONFIG_PATH });
} else {
  require('dotenv').config();
}

const db = require('./db');
const autoSetup = require('./db/autoSetup');

async function startServer() {
  console.log('[SETUP] Running MySQL auto-setup...');
  console.log(`[SETUP] Connecting to MySQL at ${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || 3306} as ${process.env.DB_USER || 'root'}`);
  try {
    await autoSetup();
  } catch (err) {
    // Machine-readable fatal marker so Electron can surface the REAL failure
    // instead of a generic health-check timeout.
    console.error(`[SETUP-FATAL] stage=mysql-setup code=${err.code || 'UNKNOWN'} errno=${err.errno || ''} sqlState=${err.sqlState || ''} message=${err.message}`);
    console.error('[SETUP] MySQL host:', process.env.DB_HOST || '127.0.0.1');
    console.error('[SETUP] MySQL port:', process.env.DB_PORT || 3306);
    console.error('[SETUP] MySQL user:', process.env.DB_USER || 'root');
    process.exit(1);
  }

  try {
    await db.init();
  } catch (err) {
    console.error(`[SETUP-FATAL] stage=schema-init code=${err.code || 'UNKNOWN'} message=${err.message}`);
    process.exit(1);
  }

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  app.use(cors());
  app.use(express.json());

  const authRoutes = require('./routes/auth');
  const medicineRoutes = require('./routes/medicine');
  const stockRoutes = require('./routes/stock');
  const saleRoutes = require('./routes/sale');
  const reportRoutes = require('./routes/report');
  const userRoutes = require('./routes/user');
  const rackRoutes = require('./routes/rack');
  const supplierRoutes = require('./routes/supplier');
  const settingRoutes = require('./routes/setting');
  const customerRoutes = require('./routes/customer');
  const customerCreditRoutes = require('./routes/customerCredit');
  const backupRoutes = require('./routes/backup');
  const purchaseRoutes = require('./routes/purchase');
  const supplierReturnRoutes = require('./routes/supplierReturn');

  app.use('/api/auth', authRoutes);
  app.use('/api/medicines', medicineRoutes);
  app.use('/api/stock', stockRoutes);
  app.use('/api/sales', saleRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/racks', rackRoutes);
  app.use('/api/suppliers', supplierRoutes);
  app.use('/api/settings', settingRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/customers', customerCreditRoutes);
  app.use('/api/backup', backupRoutes);
  app.use('/api/purchase', purchaseRoutes);
  app.use('/api/supplier-returns', supplierReturnRoutes);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const publicDir = process.env.PUBLIC_DIR || path.join(__dirname, '../../public');
  app.use(express.static(publicDir));
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  io.on('connection', (socket) => {
    console.log('[SOCKET] Client connected:', socket.id);
    socket.on('disconnect', () => {
      console.log('[SOCKET] Client disconnected:', socket.id);
    });
  });

  global.io = io;

  const PORT = process.env.PORT || 3001;
  return new Promise((resolve, reject) => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[SERVER] Pharmacy app running on http://localhost:${PORT}`);
      console.log(`[SERVER] API: http://localhost:${PORT}/api`);
      resolve(server);
    });
    server.on('error', (err) => {
      // Distinguish Express port failures from MySQL failures (BUG 6).
      if (err.code === 'EADDRINUSE') {
        console.error(`[SERVER-FATAL] stage=express-port code=EADDRINUSE message=Express port ${PORT} is already in use by another application.`);
      } else {
        console.error(`[SERVER-FATAL] stage=express-port code=${err.code || 'UNKNOWN'} message=${err.message}`);
      }
      reject(err);
    });
  });
}

if (require.main === module) {
  startServer().catch(err => {
    console.error('[SERVER] Failed to start:', err.message);
    process.exit(1);
  });
}

module.exports = { startServer };

