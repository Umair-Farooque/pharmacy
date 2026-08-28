# Pharmacy Management System

A desktop application for medical stores with inventory management, billing, and reports. Built with Electron, React, Express, and SQLite (defaults to local storage, optional MySQL for multi-PC setup).

## Prerequisites

- **Node.js** (v18+)
- **npm** (comes with Node.js)

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Build frontend
```bash
npm run build
```

### 3. Run the app
```bash
npm start
```

The app will start with a default admin account. The database (SQLite) is created automatically in `data/pharmacy.db`.

## Default Credentials

| Username | Password  | Role  |
|----------|-----------|-------|
| admin    | admin123  | Admin |

**Change the admin password immediately after first login.**

## Features

### Admin
- Dashboard with today's sales and alerts
- Inventory management (add/edit/delete medicines)
- Stock management (restock, view batches)
- User management (cashiers)
- Reports (sales, day summary, bills, stock valuation, profit margins with charts)
- Settings (shop name, address, discount caps, etc.)

### Cashier
- Fast billing with search-as-you-type
- Keyboard shortcuts (Enter to add, Alt+S to submit & print)
- Bill lookup (F2)
- Today's sales summary

### Technical
- **Database**: SQLite by default. Set `USE_MYSQL=true` in `.env` and configure MySQL credentials for multi-PC setup
- **Charts**: Recharts-powered visual reports
- **Printing**: Browser-based bill printing (works with any printer)
- **Offline**: Works fully offline with local SQLite database

## Configuration

Edit `.env` to customize:

```env
PORT=3000
USE_MYSQL=false
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=pharmacy_db
JWT_SECRET=change_this_to_something_secure
```

## Multi-PC Setup (with MySQL)

1. Install MySQL Server on the main PC
2. Set a static LAN IP (e.g., 192.168.1.100)
3. Enable `USE_MYSQL=true` and configure MySQL credentials
4. Cashier PCs connect via `http://192.168.1.100:3000`
5. Open firewall port 3000 on the server PC

## Build Installers

```bash
npm run build:win
```

Outputs to `dist/` folder.

## Project Structure

```
pharmacy/
├── electron.js          # Electron main process
├── preload.js           # Preload script
├── src/
│   ├── backend/        # Express API server
│   │   ├── controllers/
│   │   ├── db/         # SQLite/MySQL adapter
│   │   ├── middleware/
│   │   └── routes/
│   └── frontend/       # React app
│       ├── components/
│       ├── pages/
│       └── utils/
├── scripts/
│   └── build-frontend.js
├── public/              # Built frontend output
└── data/               # SQLite database (created at runtime)
```

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/login | No | User login |
| GET | /api/auth/me | Yes | Current user info |
| GET | /api/medicines | Yes | List/search medicines |
| POST | /api/medicines | Admin | Create medicine |
| PUT | /api/medicines/:id | Admin | Update medicine |
| DELETE | /api/medicines/:id | Admin | Delete medicine |
| POST | /api/stock/restock | Admin | Add stock batch |
| GET | /api/stock/low-stock | Yes | Low stock alerts |
| GET | /api/stock/expiring | Yes | Expiring batches |
| POST | /api/sales | Yes | Create sale |
| GET | /api/sales | Yes | List sales |
| GET | /api/sales/:id | Yes | Sale details |
| GET | /api/sales/bill/:bill_number | Yes | Find by bill number |
| GET | /api/reports/dashboard | Yes | Dashboard data |
| GET | /api/reports/sales | Yes | Sales report |
| GET | /api/reports/day-summary/:date | Yes | Day summary |
| GET | /api/reports/stock-valuation | Admin | Stock value report |
| GET | /api/reports/profit-margins | Admin | Profit margins |
| GET | /api/users | Admin | List users |
| POST | /api/users | Admin | Create user |
| PUT | /api/users/:id | Admin | Update user |
| GET | /api/settings | Yes | Get settings |
| PUT | /api/settings | Admin | Update settings |
