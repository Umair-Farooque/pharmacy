const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
require('dotenv').config();

const db = require('./db');
const autoSetup = require('./db/autoSetup');

async function startServer() {
  const USE_MYSQL = process.env.USE_MYSQL === 'true';

  if (USE_MYSQL) {
    console.log('[SETUP] Running MySQL auto-setup...');
    try {
      await autoSetup();
    } catch (err) {
      console.error('[SETUP] Auto-setup failed:', err.message);
      console.error('[SETUP] Please check your MySQL connection settings in .env');
      process.exit(1);
    }
  }

  await db.init();

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

  app.use('/api/auth', authRoutes);
  app.use('/api/medicines', medicineRoutes);
  app.use('/api/stock', stockRoutes);
  app.use('/api/sales', saleRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/racks', rackRoutes);
  app.use('/api/suppliers', supplierRoutes);
  app.use('/api/settings', settingRoutes);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const publicDir = path.join(__dirname, '../../public');
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

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Pharmacy app running on http://localhost:${PORT}`);
    console.log(`[SERVER] API: http://localhost:${PORT}/api`);
  });
}

startServer().catch(err => {
  console.error('[SERVER] Failed to start:', err.message);
  process.exit(1);
});
