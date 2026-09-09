# Pharmacy Management System — Current Architecture

Last updated: 2026-09-09

## 1. Project Overview

Application: Pharmacy Management System
Type: Desktop Electron application with an embedded Express backend and MySQL database
Primary users: Admin (pharmacy owner/manager), Cashier (counter operator)
Deployment model: Server/client over LAN. One PC acts as the server/admin node, another acts as the cashier thin client. Both run the same Electron app; server mode spawns the backend locally, client mode connects to the server’s IP.
Purpose: Inventory management, batch-aware stock tracking, billing/checkout, returns, reporting, and customer history for a medical store.

Confirmed from: package.json, electron.js, plan.md, README.md, src/backend/server.js

## 2. Technology Stack

| Layer | Technology | Purpose | Evidence |
|---|---|---|---|
| Desktop shell | Electron 26 | Main process, window management, config, printing bridge | electron.js, package.json devDependencies |
| Frontend UI | React 18 | Renderer UI, components, state | src/frontend/, package.json |
| Styling | Tailwind CSS 3.3 | Utility-first CSS | public/index.html CDN script + tailwind.config |
| Backend | Node.js + Express | REST API, static frontend serving, Socket.IO server | src/backend/server.js |
| Database | MySQL (mysql2) | Persistent relational store | src/backend/db/, autoSetup.js |
| Authentication | JWT (jsonwebtoken) + bcryptjs | Login tokens, password hashing | src/backend/middleware.js, auth.js |
| Printing | electron-pos-printer + native webContents.print | Bill printing inside Electron | electron.js ipcMain.handle('print-bill'), preload.js |
| Charts | Recharts 3.10 | Dashboard and report charts | src/frontend/components/Admin/Reports.jsx, Dashboard.jsx |
| Spreadsheets | ExcelJS 4.3 | Excel export in reports | Reports.jsx |
| PDF | pdfkit 0.13 | Declared dependency; not visibly used in current frontend code paths inspected | package.json |
| Real-time | Socket.IO 4.7 | Initialized; connection logging only, no custom events in current code | src/backend/server.js |
| Build (frontend) | esbuild 0.28 | Bundles React frontend into public/app.js | scripts/build-frontend.js |
| Packaging | electron-builder 24.6 | Builds portable Windows installer | package.json build section |

Key npm scripts:
- npm start → electron .
- npm run server → node src/backend/server.js
- npm run dev → concurrently runs server + electron
- npm run build → node scripts/build-frontend.js
- npm run build:win → electron-builder --win

## 3. Directory / File Architecture

pharmacy-management/
├── electron.js                 Electron main process: window, IPC, backend spawn, printing
├── preload.js                  Exposes window.electronAPI to renderer
├── package.json                Dependencies and scripts
├── plan.md                     Original project plan/requirements
├── PROJECT_ARCHITECTURE.md     This document
├── README.md                   User-facing quick start
├── public/
│   ├── index.html              Single HTML shell; loads /app.js, Tailwind CDN config
│   ├── app.js                  Built frontend bundle
│   └── app.js.map              Source map
├── scripts/
│   └── build-frontend.js       esbuild build script
└── src/
    ├── backend/
    │   ├── server.js           Express + Socket.IO entry point, route mounting
    │   ├── middleware.js       JWT auth, role checks, audit logger
    │   ├── db/
    │   │   ├── connection.js   MySQL pool creation
    │   │   ├── index.js        DB helper wrapper + bill counter
    │   │   └── autoSetup.js    Schema creation + idempotent migrations
    │   ├── controllers/
    │   │   ├── auth.js         Login, change password, setup admin
    │   │   ├── customer.js     Customer CRUD, search, history, last purchase, validation
    │   │   ├── medicine.js     Medicine CRUD, categories, price update
    │   │   ├── rack.js         Rack CRUD
    │   │   ├── report.js       Dashboard, sales, P&L, margins, returns, audit, etc.
    │   │   ├── sale.js         Sale creation, bill lookup, returns, returnable items
    │   │   ├── setting.js      Settings get/update
    │   │   ├── stock.js        Restock, adjust, low stock, expiry alerts
    │   │   ├── supplier.js     Supplier CRUD
    │   │   └── user.js         User CRUD, deactivate, password reset
    │   └── routes/
    │       ├── auth.js
    │       ├── config.js
    │       ├── customer.js
    │       ├── medicine.js
    │       ├── rack.js
    │       ├── report.js
    │       ├── sale.js
    │       ├── setting.js
    │       ├── stock.js
    │       ├── supplier.js
    │       └── user.js
    └── frontend/
        ├── main.jsx            React entry, mounts App with AuthProvider
        ├── App.jsx             Role-based page router (state-based, no React Router)
        ├── index.html          Dev entry HTML
        ├── context/
        │   └── AuthContext.jsx Auth state, login/logout, token persistence
        ├── utils/
        │   └── api.js          Fetch wrapper with JWT injection and error handling
        └── components/
            ├── Admin/
            │   ├── Customers.jsx  Customer list, add/edit, profile, history
            │   ├── Dashboard.jsx  Today's stats, alerts, recent sales, top medicines
            │   ├── Inventory.jsx  Medicine list, add/edit/restock/delete modals
            │   ├── Reports.jsx    14 report tabs, charts, exports
            │   ├── Settings.jsx   Shop and system settings
            │   └── Users.jsx      User management
            ├── Cashier/
            │   ├── Billing.jsx    Cart, checkout, discounts, customer fields, printing, bill lookup, refunds
            │   └── SearchMedicine.jsx Medicine search/quick view
            └── Common/
                ├── ConnectionStatus.jsx  Online/offline indicator
                ├── Login.jsx             Login form
                ├── Navbar.jsx            Top nav by role
                └── SetupWizard.jsx       First-run shop setup

## 4. High-Level Architecture

```text
Electron Main Process
    │
    ├─ Spawns backend child process (server mode)
    ├─ Creates BrowserWindow (1400x900)
    ├─ IPC: config, restart, print-bill, get-printers
    ▼
React Renderer (localhost:3000 or server IP)
    │
    ├─ State-based routing via currentPage
    ├─ API calls via src/frontend/utils/api.js
    ▼
Express Backend
    │
    ├─ REST JSON API under /api/*
    ├─ Serves public/ frontend
    └─ Socket.IO server initialized (connection logging only)
    ▼
MySQL Database
```

Communication:
- Frontend → Backend: HTTP REST with Bearer JWT
- Backend → Database: mysql2 pooled queries
- Electron → Backend: child_process spawn in server mode
- Electron → Renderer: contextBridge + IPC in preload.js
- Socket.IO: initialized but functionally unused beyond connect/disconnect logs

Authentication flow:
1. POST /api/auth/login with username/password
2. Backend verifies bcrypt hash, returns JWT + user object
3. Frontend stores token and user in localStorage
4. Every API request includes Authorization: Bearer <token>
5. requireAuth middleware verifies JWT and attaches req.user
6. requireAdmin middleware checks req.user.role === 'ADMIN'

## 5. Application Startup Flow

Server mode (admin/server PC):
1. electron.js loads .env/config.env via loadConfig()
2. USE_MYSQL=true detected → startServer() spawns node src/backend/server.js
3. Electron waits for http://localhost:3000/api/health to return 200
4. Backend startup:
   a. autoSetup() ensures database exists and runs migrations
   b. db.init() initializes MySQL pool
   c. Mounts all route groups
   d. Starts HTTP server on PORT (default 3001), listens on 0.0.0.0
   e. Initializes Socket.IO
5. createWindow() loads http://localhost:3000 in a 1400x900 BrowserWindow
6. React app loads from public/app.js
7. AuthContext restores token/user from localStorage or shows Login

Client mode (cashier PC):
1. electron.js loads config
2. USE_MYSQL not true → createWindow() directly
3. Window loads server PC’s IP via configured URL
4. Same React frontend, different API base

First-run setup:
- If localStorage.setup_complete is missing, SetupWizard is rendered
- SetupWizard collects shop details, DB config, admin password
- Saves config via window.electronAPI.saveConfig()

## 6. Authentication & Authorization

Roles: ADMIN, CASHIER

Middleware:
- requireAuth: verifies Bearer JWT, attaches req.user (id, username, role)
- requireAdmin: requires req.user.role === 'ADMIN'
- logAudit: async INSERT into audit_log; failures are caught and logged but do not fail the request

Token:
- Secret: JWT_SECRET env var or 'pharmacy_secret_key_change_in_production'
- Expiry: 12h
- Payload: { id, username, role }
- Storage: localStorage (token + user JSON)

Permission matrix (enforced by route middleware):

| Feature | Admin | Cashier |
|---|---|---|
| Login | Yes | Yes |
| Dashboard | Yes | No |
| Billing | Yes | Yes |
| Medicine Search | Yes | Yes |
| Inventory / Medicine CRUD | Yes | No |
| Stock restock/adjust | Yes | No |
| Sales list/details | Yes | Yes |
| Returns | Yes | Yes |
| Reports | Yes | No |
| User management | Yes | No |
| Settings | Yes | No |
| Customers list | Yes | Yes |
| Customer create | Yes | Yes |
| Customer edit/delete | Yes | No |

## 7. Database Architecture

Source of truth for schema: src/backend/db/autoSetup.js

### users
- id: PK, AUTO_INCREMENT
- username: UNIQUE NOT NULL
- password_hash: NOT NULL
- role: ENUM('ADMIN','CASHIER') NOT NULL
- full_name: NOT NULL
- phone: nullable
- is_active: TINYINT DEFAULT 1
- created_at: DATETIME DEFAULT CURRENT_TIMESTAMP
- last_login: DATETIME nullable
- Indexes: none beyond username unique

### racks
- id: PK AUTO_INCREMENT
- rack_code: UNIQUE NOT NULL
- description: nullable

### suppliers
- id: PK AUTO_INCREMENT
- name: NOT NULL
- contact: nullable
- address: nullable

### customers
- id: PK AUTO_INCREMENT
- name: VARCHAR(100) NOT NULL after migration
- phone: VARCHAR(20) NOT NULL after migration
- credit_balance: DECIMAL(10,2) DEFAULT 0
- is_active: TINYINT DEFAULT 1 (migration)
- created_at: DATETIME DEFAULT CURRENT_TIMESTAMP (migration)
- updated_at: DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP (migration)
- Unique index: idx_customer_phone on phone (migration)

### medicines
- id: PK AUTO_INCREMENT
- name: NOT NULL
- generic_name: nullable
- category: nullable
- manufacturer: nullable
- rack_id: nullable FK → racks(id)
- pack_size: nullable
- reorder_level: INT DEFAULT 10
- tax_rate: DECIMAL(5,2) DEFAULT 0
- barcode: UNIQUE nullable
- current_selling_price: DECIMAL(10,2) nullable (added by migration + backfill)
- created_at: DATETIME DEFAULT CURRENT_TIMESTAMP
- created_by: nullable FK → users(id)
- Indexes: idx_medicine_name, idx_medicine_barcode

Important: current_selling_price is populated via migration logic that reads the earliest-expiry batch with stock. After that, it is updated by medicine price updates and restock.

### stock_batches
- id: PK AUTO_INCREMENT
- medicine_id: NOT NULL FK → medicines(id)
- batch_no: nullable
- supplier_id: nullable FK → suppliers(id)
- purchase_rate_per_unit: NOT NULL
- selling_rate_per_unit: NOT NULL
- quantity_received: NOT NULL
- quantity_in_stock: NOT NULL
- expiry_date: DATE nullable
- purchase_date: DATE DEFAULT (CURRENT_DATE)
- created_by: nullable FK → users(id)
- Indexes: idx_batch_medicine, idx_batch_expiry

### sales
- id: PK AUTO_INCREMENT
- bill_number: UNIQUE NOT NULL
- subtotal: NOT NULL
- discount_type: ENUM('PERCENTAGE','FIXED') nullable
- discount_value: DECIMAL(10,2) DEFAULT 0
- discount_amount: DECIMAL(10,2) DEFAULT 0
- tax_amount: DECIMAL(10,2) DEFAULT 0
- final_amount: NOT NULL
- payment_method: ENUM('CASH','CARD','UPI','CREDIT') DEFAULT 'CASH'
- customer_id: nullable FK → customers(id) ON DELETE SET NULL (migration)
- cashier_id: NOT NULL FK → users(id)
- created_at: DATETIME DEFAULT CURRENT_TIMESTAMP
- Indexes: idx_sales_date, idx_sales_cashier, idx_sales_customer (migration)

### sale_items
- id: PK AUTO_INCREMENT
- sale_id: NOT NULL FK → sales(id) ON DELETE CASCADE
- medicine_id: NOT NULL FK → medicines(id)
- batch_id: NOT NULL FK → stock_batches(id)
- quantity: NOT NULL
- purchase_rate_per_unit: NOT NULL
- selling_rate_per_unit: NOT NULL
- line_total: NOT NULL
- line_profit: NOT NULL
- service_charge: DECIMAL(10,2) DEFAULT 0 (migration)
- Indexes: idx_sale_items_sale

### stock_transactions
- id: PK AUTO_INCREMENT
- medicine_id: NOT NULL FK → medicines(id)
- batch_id: nullable FK → stock_batches(id)
- transaction_type: ENUM('PURCHASE','SALE','ADJUSTMENT','RETURN','EXPIRED') NOT NULL
- quantity_change: NOT NULL
- quantity_before: NOT NULL
- quantity_after: NOT NULL
- performed_by: NOT NULL FK → users(id)
- reference_id: nullable
- notes: VARCHAR(200) nullable
- created_at: DATETIME DEFAULT CURRENT_TIMESTAMP
- Indexes: idx_stock_trans_medicine

### returns
- id: PK AUTO_INCREMENT
- return_reference: UNIQUE NOT NULL
- original_sale_id: NOT NULL FK → sales(id)
- sale_item_id: NOT NULL FK → sale_items(id)
- quantity_returned: NOT NULL
- refund_amount: NOT NULL
- cogs_reversed: NOT NULL DEFAULT 0
- reason: VARCHAR(200) nullable
- processed_by: NOT NULL FK → users(id)
- created_at: DATETIME DEFAULT CURRENT_TIMESTAMP

### return_items
- id: PK AUTO_INCREMENT
- return_id: NOT NULL FK → returns(id)
- sale_item_id: NOT NULL FK → sale_items(id)
- medicine_id: NOT NULL FK → medicines(id)
- batch_id: NOT NULL FK → stock_batches(id)
- quantity_returned: NOT NULL
- selling_rate_per_unit: NOT NULL
- purchase_rate_per_unit: NOT NULL
- refund_amount: NOT NULL
- cogs_reversed: NOT NULL
- created_at: DATETIME DEFAULT CURRENT_TIMESTAMP

### audit_log
- id: PK AUTO_INCREMENT
- user_id: NOT NULL FK → users(id)
- action: VARCHAR(50) NOT NULL
- table_affected: VARCHAR(50) nullable
- record_id: INT nullable
- details: TEXT nullable
- created_at: DATETIME DEFAULT CURRENT_TIMESTAMP

### settings
- key: VARCHAR(50) PRIMARY KEY
- value: VARCHAR(200) nullable
- description: VARCHAR(200) nullable

### sale_counter
- id: PK
- counter: INT DEFAULT 0

## 8. Database Relationship Diagram

```text
users
  │
  │ 1:N
  ├── sales.cashier_id
  ├── medicines.created_by
  ├── stock_batches.created_by
  ├── stock_transactions.performed_by
  ├── returns.processed_by
  └── audit_log.user_id

racks
  │
  │ 1:N
  └── medicines.rack_id

suppliers
  │
  │ 1:N
  └── stock_batches.supplier_id

medicines
  │
  │ 1:N
  ├── stock_batches.medicine_id
  ├── sale_items.medicine_id
  ├── stock_transactions.medicine_id
  ├── returns.medicine_id  (via return_items)
  └── return_items.medicine_id

stock_batches
  │
  │ 1:N
  ├── sale_items.batch_id
  ├── stock_transactions.batch_id
  ├── returns.batch_id  (via return_items)
  └── return_items.batch_id

sales
  │
  │ 1:N
  ├── sale_items.sale_id ON DELETE CASCADE
  ├── returns.original_sale_id
  └── stock_transactions.reference_id  (informational)

customers
  │
  │ 1:N
  └── sales.customer_id ON DELETE SET NULL

returns
  │
  │ 1:N
  └── return_items.return_id
```

Key relationships:
- sales → sale_items is the core transactional relationship
- medicines → stock_batches is the inventory backbone
- stock_batches → sale_items captures exact batch/cost at sale time
- customers → sales is optional; sales.customer_id can be NULL

## 9. Inventory Architecture

Medicine master data lives in medicines. Stock is tracked entirely in stock_batches. There is no medicine-level quantity field; total stock is computed as SUM(quantity_in_stock) across batches.

Restock flow (stock.js restock):
1. Validates medicine_id, batch_no, purchase_rate_per_unit, quantity_received, expiry_date
2. Checks duplicate batch_no for the same medicine
3. Inserts a new stock_batches row with quantity_in_stock = quantity_received
4. If selling_rate_per_unit is provided, updates medicines.current_selling_price
5. Inserts a stock_transactions row with type 'PURCHASE'
6. Commits transaction + audit

Stock adjustment flow (stock.js adjustStock):
1. Validates batch_id and new_quantity
2. Updates stock_batches.quantity_in_stock
3. Inserts stock_transactions row with type 'ADJUSTMENT'
4. Commits transaction + audit

Low stock detection: medicines where aggregated stock_batches.quantity_in_stock <= medicines.reorder_level.

Expiry detection: stock_batches with expiry_date <= CURDATE() + configured days, with positive stock.

Medicine search/list: aggregates SUM(stock_batches.quantity_in_stock) as total_stock and pulls one current_selling_price per medicine; also pulls rack_code via LEFT JOIN.

## 10. Sales / Billing Architecture

Workflow (frontend Billing.jsx → backend sale.js):
1. Cashier searches medicine by name/barcode
2. Selects medicine; pending medicine UI appears
3. Enters quantity; for Drip Bottle category, enters service charge after quantity
4. Item added to cart with medicine_id, quantity, selling_rate_per_unit, service_charge
5. Cart shows per-item quantity editable inputs and line totals
6. Optional customer name/phone fields in billing form
7. Optional discount: PERCENTAGE or FIXED, capped by settings.cashier_discount_cap_percent
8. Payment method selection: CASH, CARD, UPI, CREDIT
9. On submit or Alt+S:
   - Frontend POST /api/sales with items, discount, payment_method, customer_id/customer_phone/customer_name
   - Backend opens transaction
   - For each item: validates medicine stock and price, selects batches FEFO, deducts stock, builds sale_items with copied rates
   - Computes subtotal, discount, tax, final_amount
   - INSERT into sales with customer_id (if any)
   - INSERT sale_items
   - COMMIT
   - Audit SALE_CREATED
   - Return sale JSON including items
10. Bill preview shown in UI with print button
11. Print generates HTML and calls window.electronAPI.printBill in Electron, or hidden iframe fallback in browser

Bill number generation:
- Format: BL + YYYY + 5-digit zero-padded counter
- Example: BL202600001
- Implemented in src/backend/db/index.js getNextSaleBill via atomic UPDATE sale_counter

## 11. Batch Consumption Logic

Source of truth: src/backend/controllers/sale.js, lines selecting batches.

Ordering:
1. expiry_date ASC, with NULL expiry dates sorted last
2. Tie-breaker: id ASC
3. Limited to 50 batches per medicine in the candidate query

Deduction:
- Iterates candidate batches in order
- Deducts min(remaining_requested, batch.quantity_in_stock)
- Creates one sale_items row per consumed batch fragment
- Updates stock_batches.quantity_in_stock per batch
- Creates stock_transactions rows with type 'SALE'

This is FEFO with NULL-safe ordering and an ID tie-breaker.

## 12. Returns / Refund Architecture

Backend:
- POST /api/sales/return processes returns
- Validates original_sale_id and items
- Computes already_returned per sale_item_id from returns table
- Rejects if requested quantity exceeds remaining returnable quantity
- Creates returns row with unique return_reference (RET-YYYY#####)
- Creates return_items rows
- Restores stock to original batch_id
- Creates stock_transactions rows with type 'RETURN'
- Audit RETURN_PROCESSED

Frontend:
- Billing.jsx refund modal searches bill by number
- Loads returnable items via GET /api/sales/:id/returnable-items
- Allows partial return per item
- Processes return via POST /api/sales/return

Original sale data is preserved. Returns do not modify sales or sale_items.

## 13. Customer Architecture

Database:
- customers table exists with phone unique index, is_active soft-delete, timestamps
- sales.customer_id is nullable with ON DELETE SET NULL

Backend:
- src/backend/controllers/customer.js: create, search, get, update, deactivate, list, history, last purchase, validate
- src/backend/routes/customer.js:
  - Cashier-accessible: POST /, GET /search, GET /, GET /:id, GET /:id/history, GET /:id/last-purchase
  - Admin-only: PUT /:id, POST /deactivate/:id
- Sale creation supports:
  - customer_id from selected customer
  - customer_phone + customer_name auto find-or-create inside transaction
  - Phone normalization: trim, remove spaces/hyphens/parentheses/dots; +92 → 0 prefix; 92XXXXXXXXXX → 0 prefix

Frontend:
- Billing.jsx: inline customer name and phone fields; values sent on sale creation; fields cleared after sale
- Admin/Customers.jsx: searchable customer list, add/edit modals, deactivate, profile modal with stats + purchase history + last purchase
- Cashier Customers page: same Customers component rendered under cashier role in App.jsx

## 14. Reports Architecture

Backend controller: src/backend/controllers/report.js
Frontend: src/frontend/components/Admin/Reports.jsx

Implemented reports:
| Report | Endpoint | Admin | Export |
|---|---|---|---|
| Dashboard | GET /reports/dashboard | No | None |
| Sales Report | GET /reports/sales | No | CSV |
| Day Summary | GET /reports/day-summary/:date | No | None |
| Bills | Embedded in Reports tab UI, uses GET /sales | No | None |
| Stock Valuation | GET /reports/stock-valuation | Yes | Excel |
| Profit Margins | GET /reports/profit-margins | Yes | None |
| Expiry Alerts | GET /reports/expiry-alerts | No | Excel |
| Low Stock | GET /reports/low-stock | No | Excel |
| Purchase History | GET /reports/purchase-history | Yes | Excel |
| Stock Movements | GET /reports/stock-movements | Yes | Excel |
| Returns | GET /reports/returns | Yes | Excel |
| Audit Log | GET /reports/audit-log | Yes | Excel |
| Profit & Loss | GET /reports/profit-loss | Yes | CSV |
| Category Sales | GET /reports/category-sales | Yes | CSV, Excel |
| User Activity | GET /reports/user-activity | Yes | CSV |
| Batches | GET /reports/batches | Yes | None |

## 15. Dashboard

Backend: report.js getDashboard
- Today’s revenue, profit, bill count, items sold
- Low stock count
- Expiring soon count
- Last 10 recent sales
- Top 5 medicines by quantity in last 30 days

Frontend: Admin/Dashboard.jsx
- Stat cards for revenue, profit, bills, items sold
- Alert cards for low stock and expiry
- Recent sales table
- Top medicines list

## 16. Medicine Management

Frontend: Admin/Inventory.jsx
Backend: medicine.js + routes/medicine.js

Implemented:
- List/search medicines with stock, rack, category, barcode
- Add medicine (admin)
- Edit medicine (admin)
- Update medicine price (admin)
- Delete medicine (admin, blocked if sales history exists)
- Categories list

Fields managed:
- name, generic_name, category, manufacturer, rack_id, pack_size, reorder_level, tax_rate, barcode, current_selling_price

## 17. Supplier Management

Backend: src/backend/controllers/supplier.js, src/backend/routes/supplier.js
Frontend: Inventory.jsx includes supplier management UI
- CRUD operations for suppliers
- supplier_id stored on stock_batches for purchase history linkage

## 18. Stock Management

Backend: stock.js + routes/stock.js
Frontend: Inventory.jsx

Implemented:
- Restock: creates batch, updates medicine price if provided, logs transaction
- Adjust stock: manual quantity update with reason
- Low stock alerts
- Expiry alerts

Batch tracking:
- Every restock creates a new batch
- selling_rate_per_unit on batch is stored but current_selling_price on medicine is the authoritative current price
- Stock transactions provide full audit trail

## 19. User Management

Backend: user.js + routes/user.js
Frontend: Admin/Users.jsx

Implemented:
- List users
- Create user (admin)
- Update user (admin)
- Reset password (admin)
- Deactivate user (admin; soft delete via is_active = 0)
- Self password change via /api/auth/change-password

Roles enforced:
- ADMIN: full access
- CASHIER: billing and read-only access to medicines, sales, reports listed above

## 20. Audit Logging

Table: audit_log
Logged actions: LOGIN, PASSWORD_CHANGED, USER_CREATED, USER_UPDATED, PASSWORD_RESET, USER_DEACTIVATED, MEDICINE_CREATED, MEDICINE_UPDATED, MEDICINE_PRICE_UPDATED, MEDICINE_DELETED, STOCK_RESTOCK, STOCK_ADJUSTED, SALE_CREATED, RETURN_PROCESSED, CUSTOMER_CREATED, CUSTOMER_UPDATED, CUSTOMER_DEACTIVATED

Each log stores: user_id, action, table_affected, record_id, details (JSON string), created_at

Failures in audit logging do not fail the main transaction.

## 21. API Architecture

| Prefix | Source | Auth | Notes |
|---|---|---|---|
| /api/auth | auth.js | Mixed | login public; change-password protected |
| /api/medicines | medicine.js | requireAuth | create/update/delete/price require admin |
| /api/stock | stock.js | requireAuth | restock/adjust require admin |
| /api/sales | sale.js | requireAuth | all protected |
| /api/reports | report.js | requireAuth | many require admin |
| /api/users | user.js | requireAuth | all require admin |
| /api/racks | rack.js | requireAuth | create/update/delete require admin |
| /api/suppliers | supplier.js | requireAuth | create/update/delete require admin |
| /api/settings | setting.js | requireAuth | update requires admin |
| /api/customers | customer.js | requireAuth | create/list/search open to cashiers; edit/deactivate admin-only |
| /api/health | server.js | None | health check |

Request/response pattern:
- JSON body with Content-Type: application/json
- Bearer token in Authorization header
- Errors returned as { error: string }
- Success responses are typically JSON objects or arrays

## 22. Frontend Architecture

Entry: src/frontend/main.jsx → App.jsx
Routing: State-based via currentPage in App.jsx; no React Router in current code
Auth: AuthContext provides user, login, logout, loading, isAdmin

Pages/components by role:
- ADMIN: Dashboard, Inventory, Reports, Users, Settings, Customers
- CASHIER: Billing, SearchMedicine, Customers

API client: src/frontend/utils/api.js
- getApiBase() chooses server IP from localStorage or localhost fallback
- request() adds Authorization header if token exists
- Throws on non-ok responses using data.error or status text

State management: React useState/useEffect within components; no global state library

## 23. Electron Architecture

Main process: electron.js
- Creates main BrowserWindow 1400x900 min 1200x700
- contextIsolation: true, nodeIntegration: false
- preload: preload.js
- Server mode: spawns node src/backend/server.js, waits for /api/health
- Client mode: loads remote server URL
- IPC handlers: save-config, get-config, get-server-ip, restart-app, print-bill, get-printers

Preload exposes window.electronAPI with:
- platform, versions
- saveConfig, getConfig, getServerIp
- restartApp
- printBill(html, printerName, paperWidth)
- getPrinters

Printing:
- Electron: hidden BrowserWindow loads temp HTML file, calls webContents.print with pageSize for 58mm or 80mm, silent if printerName provided
- Browser fallback: hidden iframe + contentWindow.print()

Configuration persistence:
- Server mode: config.env in userData or project root
- Stores USE_MYSQL, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, PORT, JWT_SECRET, SERVER_IP

## 24. Real-Time / Socket.IO Architecture

Socket.IO is initialized in src/backend/server.js and attached to the HTTP server. global.io is set.

Current behavior:
- Logs client connect/disconnect
- No custom events, no emitters, no listeners beyond connect/disconnect
- No frontend Socket.IO client usage found in inspected frontend code

Status: Installed and initialized, but effectively unused for application features.

## 25. File / Export / Printing Architecture

Printing:
- Backend does not generate PDFs for bills
- Frontend generates HTML receipt string
- In Electron: IPC to electron.js, which writes a temp HTML file, loads it in a hidden window, and prints
- In browser fallback: hidden iframe print

Exports:
- CSV: sales report, P&L, category sales, user activity via custom frontend functions
- Excel: expiry alerts, low stock, purchase history, stock movements, returns, audit log via ExcelJS

No filesystem export path from backend was found in inspected code paths; exports are browser-initiated downloads.

## 26. Setup & Installation Architecture

First-run/setup:
- SetupWizard.jsx shown when localStorage.setup_complete is missing
- Collects shop details, MySQL config, admin password
- Saves config via save-config IPC
- AutoSetup runs on every backend start and ensures DB + tables + default data

AutoSetup behavior:
- Creates database if missing
- Creates all tables IF NOT EXISTS
- Runs idempotent migrations wrapped in try/catch
- Seeds default settings if settings table is empty
- Seeds default admin if no ADMIN user exists:
  - username: admin
  - password: admin123
  - role: ADMIN

Environment/config:
- .env supported via dotenv
- electron.js can override/load config.env
- Configurable: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, PORT, JWT_SECRET, SERVER_IP

## 27. Complete Feature Inventory

| Feature | Status | Frontend | Backend | Database | Notes |
|---|---|---|---|---|---|
| Authentication | FULLY IMPLEMENTED | ✓ | ✓ | ✓ | JWT, bcrypt, role-based |
| Admin Dashboard | FULLY IMPLEMENTED | ✓ | ✓ | ✓ | Today's stats, alerts, charts |
| Medicine Management | FULLY IMPLEMENTED | ✓ | ✓ | ✓ | CRUD + barcode unique |
| Rack Management | FULLY IMPLEMENTED | ✓ | ✓ | ✓ | CRUD |
| Supplier Management | FULLY IMPLEMENTED | ✓ | ✓ | ✓ | CRUD |
| Stock Restock | FULLY IMPLEMENTED | ✓ | ✓ | ✓ | Batch creation, price update |
| Stock Adjustment | FULLY IMPLEMENTED | ✓ | ✓ | ✓ | Manual adjustment with audit |
| Low Stock Alerts | FULLY IMPLEMENTED | ✓ | ✓ | ✓ | |
| Expiry Alerts | FULLY IMPLEMENTED | ✓ | ✓ | ✓ | |
| Billing / Checkout | FULLY IMPLEMENTED | ✓ | ✓ | ✓ | FEFO, discounts, service charge |
| Bill Printing | FULLY IMPLEMENTED | ✓ | ✓ | N/A | Electron print + iframe fallback |
| Bill Lookup | FULLY IMPLEMENTED | ✓ | ✓ | ✓ | By bill number and recent list |
| Returns / Refunds | FULLY IMPLEMENTED | ✓ | ✓ | ✓ | Partial returns, stock restore |
| Customer Management | FULLY IMPLEMENTED | ✓ | ✓ | ✓ | Auto find-or-create during sale |
| Customer History | FULLY IMPLEMENTED | ✓ | ✓ | ✓ | Purchase history + last purchase |
| Reports | FULLY IMPLEMENTED | ✓ | ✓ | ✓ | 14 report types, exports |
| Audit Logging | FULLY IMPLEMENTED | ✓ | ✓ | ✓ | Admin-only report view |
| User Management | FULLY IMPLEMENTED | ✓ | ✓ | ✓ | CRUD + deactivate + reset |
| Settings | FULLY IMPLEMENTED | ✓ | ✓ | ✓ | Shop, discount cap, tax, alerts |
| Multi-PC / LAN | FULLY IMPLEMENTED | ✓ | ✓ | ✓ | Server/client Electron modes |
| Socket.IO Live Updates | NOT IMPLEMENTED | ✗ | ✗ | N/A | Initialized but unused |
| Backup/Restore | NOT IMPLEMENTED | ✗ | ✗ | N/A | Declared in plan, not in code |
| Barcode Scanning | NOT IMPLEMENTED | ✗ | ✗ | N/A | Search-only |
| Customer Credit Ledger | NOT IMPLEMENTED | ✗ | ✗ | Partial | credit_balance column exists, no ledger workflow |

## 28. Feature-by-Feature Detailed Inventory

### Authentication
Purpose: Restrict access to admin and cashier workflows.
Files:
- Backend: src/backend/controllers/auth.js, src/backend/routes/auth.js, src/backend/middleware.js
- Frontend: src/frontend/context/AuthContext.jsx, src/frontend/components/Common/Login.jsx
Database: users
API:
- POST /api/auth/login
- POST /api/auth/setup-admin
- POST /api/auth/change-password
Permissions: login public; setup-admin public; change-password authenticated
Current behavior: JWT valid 12h; token + user persisted in localStorage; no refresh token; no logout endpoint (frontend clears storage)

### Medicines
Purpose: Maintain medicine catalog and current selling price.
Files:
- Backend: src/backend/controllers/medicine.js, src/backend/routes/medicine.js
- Frontend: src/frontend/components/Admin/Inventory.jsx
Database: medicines, stock_batches
API:
- GET /api/medicines
- GET /api/medicines/categories
- GET /api/medicines/:id
- POST /api/medicines
- PUT /api/medicines/:id
- PUT /api/medicines/:id/price
- DELETE /api/medicines/:id
Permissions: read for authenticated; write/admin for admin
Business logic: list aggregates total_stock and current selling price; delete blocked if sale_items reference the medicine

### Stock / Batches
Purpose: Track purchase batches, expiry, stock levels.
Files:
- Backend: src/backend/controllers/stock.js, src/backend/routes/stock.js
- Frontend: Inventory.jsx
Database: stock_batches, stock_transactions
API:
- POST /api/stock/restock
- POST /api/stock/adjust
- GET /api/stock/low-stock
- GET /api/stock/expiring-soon
Permissions: restock/adjust require admin; alerts require auth
Business logic: restock prevents duplicate batch_no per medicine; updates medicines.current_selling_price if provided; adjustment records before/after quantities

### Sales / Billing
Purpose: Create sales, deduct stock, record financials, print bills.
Files:
- Backend: src/backend/controllers/sale.js, src/backend/routes/sale.js
- Frontend: src/frontend/components/Cashier/Billing.jsx
Database: sales, sale_items, stock_batches, stock_transactions, sale_counter
API:
- POST /api/sales
- GET /api/sales
- GET /api/sales/:id
- GET /api/sales/bill/:bill_number
- GET /api/sales/search/:bill_number
- GET /api/sales/:id/returnable-items
- POST /api/sales/return
Permissions: authenticated
Business logic: FEFO batch selection; atomic stock deduction; service_charge per item; discount cap enforced frontend only; customer auto-create by phone if provided; bill number from sale_counter

### Returns
Purpose: Process customer returns and restore stock.
Files:
- Backend: sale.js processReturn, getReturnableItems
- Frontend: Billing.jsx refund modal
Database: returns, return_items, stock_batches, stock_transactions
API:
- GET /api/sales/:id/returnable-items
- POST /api/sales/return
Permissions: authenticated
Business logic: partial returns supported; already_returned tracked per sale_item_id; stock restored to original batch; refund = quantity_returned × selling_rate_per_unit

### Customers
Purpose: Maintain regular customer records and link them to sales.
Files:
- Backend: src/backend/controllers/customer.js, src/backend/routes/customer.js
- Frontend: src/frontend/components/Admin/Customers.jsx, Billing.jsx inline fields
Database: customers, sales.customer_id
API:
- POST /api/customers
- GET /api/customers/search
- GET /api/customers
- GET /api/customers/:id
- GET /api/customers/:id/history
- GET /api/customers/:id/last-purchase
- PUT /api/customers/:id
- POST /api/customers/deactivate/:id
Permissions: create/list/search for authenticated; update/deactivate for admin
Business logic: phone normalized and unique; duplicate phone rejected; inactive customers excluded from search/create reuse; deactivate uses is_active = 0; ON DELETE SET NULL preserves history

### Reports
Purpose: Operational and financial reporting.
Files:
- Backend: src/backend/controllers/report.js, src/backend/routes/report.js
- Frontend: src/frontend/components/Admin/Reports.jsx
Database: sales, sale_items, stock_batches, returns, return_items, users, audit_log, stock_transactions
Permissions: mix of authenticated and admin-only per report
Current limitations: P&L explicitly notes operating expenses and net profit not tracked

### Users / Roles
Purpose: Admin and cashier account management.
Files:
- Backend: src/backend/controllers/user.js, src/backend/routes/user.js
- Frontend: src/frontend/components/Admin/Users.jsx
Database: users
API:
- GET /api/users
- POST /api/users
- PUT /api/users/:id
- POST /api/users/:id/reset-password
- DELETE /api/users/:id  (actually deactivates)
Permissions: all admin-only
Business logic: delete performs soft delete; self-delete blocked; password reset hashes new password

### Settings
Purpose: Shop configuration and operational defaults.
Files:
- Backend: src/backend/controllers/setting.js, src/backend/routes/setting.js
- Frontend: src/frontend/components/Admin/Settings.jsx
Database: settings key/value table
API:
- GET /api/settings
- PUT /api/settings
Permissions: read authenticated; write admin-only
Keys used in code: shop_name, shop_address, shop_phone, tax_enabled, tax_rate, cashier_discount_cap_percent, expiry_alert_days, low_stock_alert_default, server_ip, server_port, auto_backup_enabled, backup_time

## 29. Business Rules Currently Implemented

- Two roles only: ADMIN and CASHIER
- Bill numbers are unique and monotonically increasing per year
- Sales must have at least one item
- Stock deduction uses FEFO order: nearest expiry first, null expiry last, batch id as tie-breaker
- Selling price used for totals is medicines.current_selling_price, not the batch selling rate
- Profit = (current_selling_price - batch.purchase_rate_per_unit) × quantity_sold_from_batch
- Discount can be percentage or fixed; cashier cap enforced in frontend, not backend
- Tax amount is passed from frontend; medicine tax_rate is not applied automatically in backend sale creation
- Returns cannot exceed original item quantity
- Customer phone must be unique; normalization handles 0300..., +92300..., 92300... forms into a canonical leading-zero format
- Customer name is required; duplicate names allowed
- Deactivating a customer preserves historical sales; sales.customer_id becomes NULL if customer is removed
- Medicines with existing sales cannot be deleted
- Stock transactions record before/after quantities and are append-only
- Service charge is per-cart-item and included in subtotal; persisted in sale_items.service_charge
- Drip Bottle category triggers service charge input in billing UI

## 30. Financial Calculations

### Sales
- medicineLineTotal = Σ(deducted_quantity × current_selling_price) per item across batches
- Subtotal = Σ(medicineLineTotal) + Σ(service_charge)
- Discount amount = subtotal × (discount_value/100) for PERCENTAGE, or discount_value for FIXED
- Tax amount = tax_amount from request body
- Final amount = max(0, subtotal - discount_amount + tax_amount)

### COGS
- Per sale item: purchase_rate_per_unit copied from stock_batches at sale time
- Total COGS for reports: Σ(sale_items.quantity × sale_items.purchase_rate_per_unit)
- Returns reduce effective COGS: net COGS = original COGS - returned COGS

### Profit
- Per line: (current_selling_price - batch.purchase_rate_per_unit) × deducted_quantity
- Stored in sale_items.line_profit
- Aggregated in reports via SUM(line_profit)

### Returns impact
- Refund amount = Σ(quantity_returned × sale_items.selling_rate_per_unit)
- COGS reversed = Σ(quantity_returned × sale_items.purchase_rate_per_unit)
- Stock is increased on original batch by quantity_returned
- Original sale and sale_items remain unchanged

### Stock valuation
- Cost value = Σ(quantity_in_stock × purchase_rate_per_unit)
- Retail value = Σ(quantity_in_stock × medicines.current_selling_price)

## 31. Data Flow Examples

### Sale
```text
Cashier selects medicine
    ↓
Pending medicine UI with quantity (and service charge if Drip Bottle)
    ↓
Add to cart
    ↓
Optional customer name/phone entered
    ↓
Submit or Alt+S
    ↓
POST /api/sales
    ↓
Backend validates stock, selects FEFO batches
    ↓
Deduct stock, create stock_transactions
    ↓
Create sale + sale_items
    ↓
If customer_phone provided: find or create customer, link sale
    ↓
Audit SALE_CREATED
    ↓
Frontend shows bill preview
    ↓
Print via Electron IPC or iframe
```

### Customer Sale
```text
Cashier enters phone and/or name in billing form
    ↓
POST /api/sales with customer_phone/customer_name
    ↓
Backend normalizes phone
    ↓
If phone matches existing active customer → reuse customer_id
    Else → INSERT new customer and use new customer_id
    ↓
Sale saved with customer_id
    ↓
Later: search customer → GET /api/customers/:id/history
    ↓
See previous sales and last purchase items
```

### Restock
```text
Admin creates/selects medicine
    ↓
Admin enters batch details: batch_no, supplier, rates, quantity, expiry
    ↓
POST /api/stock/restock
    ↓
Backend checks duplicate batch_no
    ↓
INSERT stock_batches
    ↓
If selling rate provided: UPDATE medicines.current_selling_price
    ↓
INSERT stock_transactions type PURCHASE
    ↓
Audit STOCK_RESTOCK
```

## 32. Known Issues and Limitations

### High
- 403 on /api/customers for cashier if server is not restarted after route change; route file requires reload to take effect
- Discount cap is enforced only in frontend; backend does not validate discount percentage against settings
- Tax is not calculated from medicine tax_rate during sales; relies on frontend-provided tax_amount
- CORS is wide open on both Express and Socket.IO; any origin can call the API in current configuration
- electron.js main window URL is hardcoded to http://localhost:3000; client/server mode does not change the loaded URL in the inspected code

### Medium
- No offline mode for cashier client; if server is unreachable, billing fails
- No refresh token mechanism; after 12 hours the user must log in again
- Bill number uses year prefix but counter never resets per year; format suggests yearly but is continuous
- Return reference uses random 5-digit number; not guaranteed unique under high volume
- Socket.IO is unused despite being initialized
- Backup/restore is not implemented despite being in plan and settings
- Customer credit_balance is unused; no ledger workflow
- No barcode scanner integration; search-by-name only
- service_charge is item-level in sale_items, but bill print and cart display have had inconsistencies across changes; verify before relying on it for compliance
- ConnectionStatus polls localhost:3000 specifically; it does not use the configured server IP, so it may show disconnected even when the API is reachable via server IP
- react-router-dom is installed but unused; routing is state-based and can break browser history expectations
- Two index.html files exist with different titles; src/frontend/index.html and public/index.html may drift apart
- electron-builder configuration differs between package.json and electron-builder.yml; packaging behavior may vary by invocation

### Low
- No unit tests or integration tests found
- JWT secret has a known default value if env is missing
- No rate limiting or brute-force protection on login
- Admin default credentials are well-known and must be changed manually
- pdfkit is declared but no active PDF generation path was found in inspected frontend code
- medicines.current_selling_price migration backfills from earliest-expiry batch; if batches have different purchase/selling histories, the backfill may not reflect intended pricing

## 33. Dead / Unused Code / Fields

- pdfkit is a declared dependency but no active PDF generation path was found in inspected frontend code
- Socket.IO client events are not used anywhere in frontend
- customers.credit_balance has no read/write logic beyond default 0
- settings keys auto_backup_enabled and backup_time have no implementation
- stock_batches.selling_rate_per_unit is stored but not the authoritative price for sales; sales use medicines.current_selling_price
- react-router-dom is installed in devDependencies but not imported or used anywhere in the frontend

## 34. Inconsistencies

- medicines.current_selling_price is the sale-price source of truth, while stock_batches also stores selling_rate_per_unit. These can diverge.
- tax_rate exists on medicines and in settings, but backend sale creation ignores both and trusts frontend tax_amount.
- sale_counter format suggests yearly counters, but implementation is a single global counter without year reset.
- plan.md describes per-pack pricing entry UI, but inspected backend/frontend code stores and exposes only per-unit rates; no pack-mode logic was found in controllers or components.
- Backend generates bill numbers as BL${year}${pad(counter,5)}, while Billing.jsx UI placeholder references a date-prefixed format like 20260828-0001; these formats do not match.
- electron-builder config differs between package.json (portable target) and electron-builder.yml (nsis installer); behavior may depend on which invocation is used.

## 35. Security Review

- Authentication: JWT Bearer tokens in localStorage; no httpOnly cookie protection
- Authorization: role checks on routes; admin-only routes protected by requireAdmin
- Passwords: bcryptjs with cost 10
- SQL injection: parameterized queries used consistently in backend
- Input validation: basic presence checks; no schema/type enforcement beyond JS parsing
- Electron security: contextIsolation true, nodeIntegration false, preload used
- Secrets: JWT secret defaults to a known string if not set in env
- Audit: sensitive actions logged, but login failures are not logged
- No evidence of rate limiting, account lockout, or brute-force protection
- CORS: app.use(cors()) with no origin restriction; Socket.IO CORS set to origin '*'
- Plaintext database credentials are present in .env/config and are readable by anyone with filesystem access
- No HTTPS; all API and frontend traffic is plain HTTP, including on LAN
- Token storage in localStorage is vulnerable to XSS; contextIsolation reduces but does not eliminate this risk
- No token refresh mechanism; long-lived 12h tokens increase exposure if stolen

## 36. Dependency / External Service Architecture

- MySQL: primary datastore; required for operation
- Electron: desktop packaging and native printing
- No external APIs, payment gateways, or cloud services are used
- Printing relies on local/network printers via Electron/OS

## 37. Deployment Architecture

Development:
- npm run dev starts backend and Electron concurrently
- Frontend built via npm run build into public/
- Electron loads http://localhost:3000

Production/server PC:
- Electron in server mode; USE_MYSQL=true
- Backend spawned as child process from Electron
- MySQL installed locally on server PC
- Firewall must allow 3000 and 3306

Production/cashier PC:
- Electron in client mode; USE_MYSQL not set
- Connects to server IP configured in config.env
- No local database

Packaging:
- electron-builder with portable target for Windows
- asar: false
- Files packaged: electron.js, preload.js, src/**, public/**

## 38. Recommended Reading Order for Future AI Agents

1. package.json
2. src/backend/db/autoSetup.js
3. src/backend/server.js
4. src/backend/middleware.js
5. src/backend/routes/sale.js
6. src/backend/controllers/sale.js
7. src/backend/controllers/customer.js
8. src/frontend/components/Cashier/Billing.jsx
9. src/frontend/App.jsx
10. src/frontend/utils/api.js
11. electron.js
12. preload.js
13. src/backend/controllers/report.js
14. src/frontend/components/Admin/Reports.jsx

## 39. Source of Truth

| Data | Source of Truth |
|---|---|
| Medicine catalog | medicines table |
| Current selling price | medicines.current_selling_price |
| Purchase cost | stock_batches.purchase_rate_per_unit |
| Current stock | stock_batches.quantity_in_stock summed by medicine |
| Historical sale price | sale_items.selling_rate_per_unit |
| Historical COGS | sale_items.purchase_rate_per_unit |
| Customer identity | customers table, normalized phone unique |
| Bill | sales + sale_items |
| Return | returns + return_items |
| Settings | settings key/value table |
| Audit | audit_log |

## 40. Architecture Decision Summary

- Electron is used for desktop distribution and native printing.
- React handles the renderer UI without React Router.
- Express serves both the API and the built frontend.
- MySQL is the single source of truth; client PCs are thin.
- Stock is batch-based with FEFO consumption.
- Historical sale prices and costs are copied into sale_items at sale time.
- Customers are optional and can be auto-created from phone during billing.
- Customer phone is the unique business identifier.
- Audit logging is append-only and best-effort.
- Socket.IO is present but unused for application features.

## 41. Code References

Backend:
- src/backend/controllers/sale.js: createSale, processReturn, getReturnableItems
- src/backend/controllers/customer.js: createCustomer, searchCustomers, getCustomerHistory
- src/backend/controllers/report.js: all report functions
- src/backend/controllers/stock.js: restock, adjustStock
- src/backend/middleware.js: requireAuth, requireAdmin, logAudit
- src/backend/db/autoSetup.js: schema and migrations
- src/backend/db/index.js: getNextSaleBill
- src/backend/server.js: startup, route mounting, Socket.IO

Frontend:
- src/frontend/components/Cashier/Billing.jsx: billing, cart, checkout, customer fields, refunds, printing
- src/frontend/components/Admin/Customers.jsx: customer management UI
- src/frontend/components/Admin/Reports.jsx: reports UI
- src/frontend/components/Admin/Inventory.jsx: medicine and stock UI
- src/frontend/App.jsx: role-based page routing
- src/frontend/utils/api.js: HTTP client

Electron:
- electron.js: main process, IPC, printing
- preload.js: exposed APIs
