# 🏥 Medical Store Inventory Management System — Complete Plan

## 📋 Project Overview

A desktop application for a pharmacy, running across two networked PCs:
- **Server PC (Admin)** — runs the central database and the Admin app.
- **Client PC (Cashier)** — runs the Cashier app, connects to the Server PC over LAN.

No internet is required — everything runs on the shop's local network. Both PCs always work off **one shared database on the Server PC**, so a sale on the Client PC is immediately reflected everywhere — there is no separate sync engine to write, queue, or debug (see Section 3 for why this matters).

### Key Requirements
- ✅ Two access levels — Admin (full access) & Cashier (billing-focused, limited)
- ✅ Client-Server setup over LAN — one source of truth, always in sync
- ✅ Flexible pricing — enter per-pill or per-pack, system handles the math
- ✅ Bill generation & printing (thermal or A4)
- ✅ Medicine search
- ✅ Rack/location organization
- ✅ Sales analytics — daily, custom range, 6-month, annual, with accurate profit tracking
- ✅ Expiry & batch tracking (added — see Section 5)
- ✅ 100% offline operation, no recurring cost

---

## 🛠️ Technology Stack

| Component | Technology | Reason |
|---|---|---|
| Desktop Framework | **Electron** | Cross-platform, self-contained installer, no separate runtime to install |
| Frontend UI | **React 18** | Component-based, fast to build screens with |
| Backend Server | **Node.js + Express** | Runs only on the Server PC; both apps talk to it |
| **Database** | **MySQL** (or PostgreSQL) | **Changed from SQLite.** A real client-server DB, built for exactly this: multiple machines reading/writing the same data reliably. Removes the need for a custom sync engine entirely (see Section 3). |
| Live UI updates | **Socket.IO / WebSocket** (optional, Phase 2) | Used only to *notify* the Client PC "stock changed, refresh your view" — not to carry the actual data. All real data still comes from the database via the API. This is a much smaller, safer job for WebSocket than trying to make it the sync mechanism itself. |
| Styling | Tailwind CSS | Fast to build a clean UI |
| Printing | electron-pos-printer | Offline bill printing |
| PDF/Excel export | pdfkit / exceljs | Reports and printable bills |
| Packaging | electron-builder | Single installer per PC |

---

## 🏗️ System Architecture (Revised)

**Why this changed from a SQLite + WebSocket-sync design:** that approach requires you to build and maintain an offline queue, a conflict-resolution strategy ("last write wins"), and two separate database files that must always be reconciled. For two PCs on one LAN, that's solving a much harder problem than you actually have. A shared database removes all of that — it's the standard, boring, reliable way to do exactly this.

```
╔═══════════════════════════════════════════════════════════════════╗
║               LOCAL NETWORK (LAN) — NO INTERNET NEEDED             ║
╚═══════════════════════════════════════════════════════════════════╝

SERVER PC (Admin) — static LAN IP, e.g. 192.168.1.100
├── Electron App (Admin UI)
├── Node.js + Express API (Port 3000)     ← the ONLY thing that talks to the DB
│   ├── REST endpoints (medicines, sales, reports, users...)
│   └── Optional: Socket.IO for live "data changed" notifications
└── MySQL Server (Port 3306)
    └── One database — the single source of truth for both PCs

                ↕ HTTP/REST over LAN (http://192.168.1.100:3000)
                ↕ (optional) WebSocket for live refresh notifications

CLIENT PC (Cashier) — connects to Server PC's IP
├── Electron App (Cashier UI)
│   ├── Billing Interface
│   └── Medicine Search
└── NO local database — it's a thin client. Every action (search, bill,
    stock check) goes straight through the API to the one shared MySQL DB.
```

### Architecture Highlights
- **Single source of truth**: one database, on the Server PC. No client-side copy, no sync queue, no conflict resolution needed.
- **Client PC is thin**: it has no local data store — it always asks the Server PC's API for current data and writes straight back to it.
- **Trade-off, stated plainly**: if the Client PC loses network connection to the Server PC, it cannot bill until reconnected (there's nothing to "queue" locally). On a single shop LAN this should be rare. If your network is genuinely unreliable, that's the one legitimate reason to revisit an offline-queue design later — but don't build that complexity up front on a guess.

---

## 💾 Database Schema

The two biggest fixes here versus a naive design: **batch-level tracking** (so purchase rate and expiry date are recorded *per restock*, not just once on the medicine) and **accurate profit calculation** (sales always reference the exact batch sold, so profit reflects the true cost of *that* stock, even if prices changed since).

### 1. users
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('ADMIN', 'CASHIER') NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  is_active TINYINT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME
);
```

### 2. medicines (identity/catalog info only — no rates or stock here)
```sql
CREATE TABLE medicines (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  generic_name VARCHAR(150),
  category VARCHAR(50),               -- tablet, syrup, injection, etc.
  manufacturer VARCHAR(100),
  rack_id INTEGER,
  pack_size INTEGER,                  -- e.g. 30 (pills per strip/pack), nullable
  reorder_level INTEGER DEFAULT 10,   -- low-stock threshold, per medicine
  tax_rate DECIMAL(5,2) DEFAULT 0,
  barcode VARCHAR(50) UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  FOREIGN KEY (rack_id) REFERENCES racks(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX idx_medicine_name ON medicines(name);
CREATE INDEX idx_medicine_barcode ON medicines(barcode);
```

### 3. stock_batches — **the key fix**
Every restock creates a new batch row. This is what makes expiry tracking and accurate profit both work correctly, even when the same medicine is restocked multiple times at different prices or with different expiry dates.
```sql
CREATE TABLE stock_batches (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  medicine_id INTEGER NOT NULL,
  batch_no VARCHAR(50),
  supplier_id INTEGER,
  purchase_rate_per_unit DECIMAL(10,2) NOT NULL,   -- always per-pill, see Section 6
  selling_rate_per_unit DECIMAL(10,2) NOT NULL,     -- current selling price for this batch
  quantity_received INTEGER NOT NULL,
  quantity_in_stock INTEGER NOT NULL,               -- decreases as this batch sells
  expiry_date DATE,
  purchase_date DATE DEFAULT (CURRENT_DATE),
  created_by INTEGER,
  FOREIGN KEY (medicine_id) REFERENCES medicines(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX idx_batch_medicine ON stock_batches(medicine_id);
CREATE INDEX idx_batch_expiry ON stock_batches(expiry_date);
```
- **Selling from stock uses FEFO (First-Expiry-First-Out)**: when a sale is made, deduct from the batch with the *nearest* expiry date first, automatically. This avoids expired stock accumulating unsold.
- A medicine's "total stock" shown on screen = `SUM(quantity_in_stock)` across its batches.

### 4. racks
```sql
CREATE TABLE racks (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  rack_code VARCHAR(20) UNIQUE NOT NULL,   -- e.g. "A1", "R3-Shelf2"
  description VARCHAR(100)
);
```

### 5. suppliers
```sql
CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  contact VARCHAR(50),
  address VARCHAR(200)
);
```

### 6. sales
```sql
CREATE TABLE sales (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  bill_number VARCHAR(20) UNIQUE NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  discount_type ENUM('PERCENTAGE','FIXED'),
  discount_value DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  final_amount DECIMAL(10,2) NOT NULL,
  payment_method ENUM('CASH','CARD','UPI','CREDIT') DEFAULT 'CASH',
  customer_id INTEGER,                 -- nullable, see customers table
  cashier_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cashier_id) REFERENCES users(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE INDEX idx_sales_date ON sales(created_at);
CREATE INDEX idx_sales_cashier ON sales(cashier_id);
```

### 7. sale_items — **references the exact batch sold**
```sql
CREATE TABLE sale_items (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  sale_id INTEGER NOT NULL,
  medicine_id INTEGER NOT NULL,
  batch_id INTEGER NOT NULL,            -- <- locks in true cost for this line item
  quantity INTEGER NOT NULL,
  purchase_rate_per_unit DECIMAL(10,2) NOT NULL,   -- copied from batch at sale time
  selling_rate_per_unit DECIMAL(10,2) NOT NULL,    -- copied from batch at sale time
  line_total DECIMAL(10,2) NOT NULL,
  line_profit DECIMAL(10,2) NOT NULL,   -- (selling - purchase) * quantity
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (medicine_id) REFERENCES medicines(id),
  FOREIGN KEY (batch_id) REFERENCES stock_batches(id)
);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
```
**Why copy the rates onto sale_items instead of just looking them up later:** if the medicine's price changes next month, old bills/reports must still show what was actually charged and actually earned *at the time*. Copying the rate at sale time is what makes historical reports permanently accurate.

### 8. stock_transactions (full audit trail of every stock change)
```sql
CREATE TABLE stock_transactions (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  medicine_id INTEGER NOT NULL,
  batch_id INTEGER,
  transaction_type ENUM('PURCHASE','SALE','ADJUSTMENT','RETURN','EXPIRED') NOT NULL,
  quantity_change INTEGER NOT NULL,     -- + or -
  quantity_before INTEGER NOT NULL,
  quantity_after INTEGER NOT NULL,
  performed_by INTEGER NOT NULL,
  reference_id INTEGER,                 -- links to sale_id / return_id etc.
  notes VARCHAR(200),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (medicine_id) REFERENCES medicines(id),
  FOREIGN KEY (batch_id) REFERENCES stock_batches(id),
  FOREIGN KEY (performed_by) REFERENCES users(id)
);
CREATE INDEX idx_stock_trans_medicine ON stock_transactions(medicine_id);
```

### 9. returns
```sql
CREATE TABLE returns (
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
);
```

### 10. customers (optional — needed if credit/udhaar or purchase history matters)
```sql
CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100),
  phone VARCHAR(20),
  credit_balance DECIMAL(10,2) DEFAULT 0
);
```

### 11. audit_log (who did what — protects the owner, tracks cashier actions)
```sql
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  user_id INTEGER NOT NULL,
  action VARCHAR(50) NOT NULL,          -- e.g. 'DISCOUNT_APPLIED', 'MEDICINE_EDITED'
  table_affected VARCHAR(50),
  record_id INTEGER,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 12. settings
```sql
CREATE TABLE settings (
  `key` VARCHAR(50) PRIMARY KEY,
  value VARCHAR(200),
  description VARCHAR(200)
);

INSERT INTO settings (`key`, value, description) VALUES
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
  ('expiry_alert_days', '60', 'Warn this many days before expiry');
```

---

## 💊 Core Feature: Flexible Per-Pill / Per-Pack Pricing

This is the trickiest business logic in the system, so worth spelling out precisely.

- Rates are **always stored per unit (per pill/tablet)** in `stock_batches` — this keeps every downstream calculation (stock value, profit, partial-strip sales) simple and consistent.
- The **restock entry screen** supports two input modes, toggled by the user:
  1. **Per-Unit Mode** — enter purchase rate per pill and selling rate per pill directly.
  2. **Pack Mode** — enter pack size (e.g. 30), pack purchase amount (e.g. ₹60), and either a pack selling amount or a per-pill selling rate directly.
     - System computes: `purchase_rate_per_unit = pack_purchase_amount / pack_size` → ₹60 / 30 = ₹2/pill.
     - **Selling rate is shown live but editable**, not silently forced — pharmacies often round selling price (₹2.5, ₹3) rather than dividing evenly, so let them override the computed number.
- Stock is tracked in **individual units (pills)** at all times internally, but the UI displays it as "X packs + Y loose" wherever `pack_size` is known (e.g. "3 strips + 4 tablets"), since that's how pharmacists think and count physically.
- Billing can be done in loose pills or full packs — same underlying stock number either way.

---

## 🎯 Core Features

### Admin Features (full access)

**1. Dashboard**
- Today's summary: sales, revenue, profit, items sold, bill count
- Alerts: low stock, expiring soon
- Recent activity feed
- Charts: sales trend (7/30 days), top medicines, profit trend

**2. Inventory Management**
- Add/Edit/Delete medicines (per-pill or pack pricing entry, Section 6)
- Restock (creates a new `stock_batches` row — batch no, expiry date, supplier)
- Search/filter medicines, by name, rack, category, generic name
- Bulk import from CSV/Excel
- Export inventory to Excel
- View full stock transaction history per medicine

**3. Rack Management**
- Create/edit/delete racks
- Assign medicines to racks
- View medicines by rack (helps physically restock/audit)

**4. Supplier Management**
- Add/edit suppliers
- View purchase history per supplier (via `stock_batches.supplier_id`)

**5. User Management**
- Add/edit/deactivate users, reset passwords
- View per-cashier sales performance
- View audit log

**6. Returns Processing**
- Process customer returns against an original bill
- Restocks the relevant batch (or marks damaged/expired stock separately)

**7. Reports & Analytics** — see dedicated section below

**8. Settings**
- Shop details, tax rate, cashier discount cap, low-stock/expiry alert thresholds, backup schedule, printer config

### Cashier Features (limited access)

**1. Billing Interface**
- Search medicine by name (autocomplete) or scan barcode
- Add to bill, adjust quantity, remove item
- Apply discount **up to the configured cap** (Section on Roles) — larger discounts require an admin PIN override at the counter
- Select payment method (Cash/Card/UPI/Credit)
- Print bill, hold bill, clear bill

**2. Medicine Search / Lookup**
- Search by name, shows stock & rack location & price
- Filter by rack

**3. Today's Summary (own activity only)**
- Bills generated today, total sales amount, next bill number

**4. Connection Status Indicator**
- 🟢 Connected to server / 🔴 Disconnected (billing blocked while disconnected — see Architecture trade-off above)

---

## 📊 Reports & Analytics (this is the feature you specifically asked to expand)

**Profit calculation (the exact math you described):**
`line_profit = (selling_rate_per_unit − purchase_rate_per_unit) × quantity`, using the rate copied onto `sale_items` at the moment of sale (Section 5, table 7). Example: bought at ₹2/pill, sold at ₹5/pill → ₹3/pill profit — computed correctly even months later, even if today's purchase price has since changed, because each sale remembers the true cost of the batch it came from.

**Time-based views — Daily / Custom Range / 6-Month / Annual:**
One Sales Report screen with quick filters: **Today, This Week, This Month, Last 6 Months, This Year, Custom Range**. For any selected range, show:
- Total revenue, total profit, total bills, total items sold
- Average bill value
- Total discount given (so the owner can see how much margin discounts are costing)
- Trend chart (revenue & profit over time within the range)
- Month-over-month / year-over-year comparison (nice-to-have)

**"Check anytime" Day Summary / Closing Report:**
Viewable for any date, defaults to today:
- Total sales, profit, bill count, items sold for that day
- Cashier-wise breakdown (if multiple cashiers worked)
- Payment-mode breakdown (cash/card/UPI/credit)
- Top-selling medicines that day
- Returns/refunds that day (net sales = gross − returns)
- One-click print/export

**Other reports:**
- Best-selling / slow-moving medicines (by quantity *and* by profit — a medicine can sell a lot with thin margin)
- Profit margin % by medicine/category
- Stock valuation (current stock × purchase rate = capital tied up)
- Expiry report (batches expiring soon, and their ₹ value at risk)
- Low-stock/reorder report
- Cashier performance report
- All exportable to PDF/Excel

---

## 🖨️ Printing (Bill Format Example)

```
================================
     MEDICAL STORE
    123 Main Street
   Phone: 98765-43210
================================
Date: 27-08-2026    Time: 5:30PM
Bill #: 00152
Cashier: John Doe
================================
Item          Qty  Rate  Amount
--------------------------------
Paracetamol    10   5.00   50.00
Crocin          5   8.00   40.00
--------------------------------
Subtotal:                 90.00
Discount (10%):             9.00
================================
TOTAL:                  ₹81.00
================================
Payment: CASH
================================
   Thank you! Visit Again
================================
```
Supports thermal (58mm/80mm) or A4 printer — configurable in Settings.

---

## 🔐 Security
- Passwords hashed with bcrypt, never stored plain text.
- Role-based middleware on every API route (`requireAuth`, `requireAdmin`) — the Client PC's Cashier app should never even be able to *call* admin-only endpoints, not just have them hidden in the UI.
- Dedicated MySQL user for the app with only the privileges it needs (not root).
- Every sensitive action (discount override, medicine edit, delete, restock) writes to `audit_log`.

---

## 💾 Backup & Restore
- **Automatic daily backup** of the MySQL database (e.g. `mysqldump` via a scheduled task, run on the Server PC only — that's where the one true database lives).
- **Manual "Backup Now"** button in Admin settings.
- Manual export to USB supported.
- Restore procedure documented and tested before go-live (Section: Testing Strategy).

---

## 📁 Project Structure
```
pharmacy-management/
├── package.json
├── electron-builder.yml
├── electron.js
├── preload.js
├── public/
├── src/
│   ├── frontend/ (React)
│   │   ├── components/
│   │   │   ├── Common/ (Login, Navbar, Modal, ConnectionStatus)
│   │   │   ├── Admin/ (Dashboard, Inventory, Reports, Users, Settings)
│   │   │   └── Cashier/ (Billing, SearchMedicine)
│   │   ├── context/ (AuthContext)
│   │   └── utils/ (api, helpers)
│   └── backend/ (Node.js — runs on Server PC only)
│       ├── server.js
│       ├── controllers/ (auth, medicine, stock, sale, report, user)
│       ├── routes/
│       ├── db/ (MySQL connection pool, migrations)
│       ├── realtime/ (optional Socket.IO — "data changed" notifications only)
│       └── utils/ (printer, backup, reportExport)
└── backups/
```

---

## 📦 Key Dependencies
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "mysql2": "^3.6.5",
    "bcrypt": "^5.1.1",
    "cors": "^2.8.5",
    "socket.io": "^4.7.2",
    "node-cron": "^3.0.2",
    "fs-extra": "^11.1.1",
    "electron-pos-printer": "^1.1.3",
    "pdfkit": "^0.13.0",
    "exceljs": "^4.3.0",
    "date-fns": "^2.30.0"
  },
  "devDependencies": {
    "electron": "^26.2.4",
    "electron-builder": "^24.6.4",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.16.0",
    "tailwindcss": "^3.3.3"
  }
}
```

---

## 🚀 Implementation Phases

**Phase 1 — Foundation (Week 1)**
Project scaffolding, MySQL schema creation, Server PC ↔ Client PC LAN connectivity test (Client can reach Server's API), basic Express routing.

**Phase 2 — Auth & Roles (Week 1-2)**
Login, bcrypt, role-based route protection, default admin account.

**Phase 3 — Inventory & Batches (Week 2-3)**
Medicine CRUD, per-pill/pack pricing entry, `stock_batches` restock flow, rack management, search/filter, stock transaction logging, low-stock & expiry alerts.

**Phase 4 — Billing (Week 3-4)**
Cashier billing UI, medicine search/autocomplete, FEFO batch deduction on sale, discount logic + cap, bill numbering, payment method, stock update on sale.

**Phase 5 — Multi-PC Rollout (Week 4)**
Point Client PC's Electron app at Server PC's IP, connection-status indicator, basic reconnect handling, (optional) Socket.IO live-refresh notifications. *Much lighter than a full sync engine, since there's only one database.*

**Phase 6 — Reports & Analytics (Week 5-6)**
Dashboard, daily/range/6-month/annual reports, profit calculation (batch-based), charts, PDF/Excel export.

**Phase 7 — Printing & Extras (Week 6-7)**
Thermal/A4 printing, print preview, backup system (auto + manual + USB), restore flow, settings screen, returns processing, supplier management.

**Phase 8 — Testing & Deployment (Week 7-8)**
Full testing pass (below), installer build for both PCs, user manual, pilot run with real data.

---

## 🧪 Testing Strategy
- **Unit**: profit calculation, discount calculation, FEFO batch deduction logic
- **Integration**: API endpoints, DB transactions (especially stock deduction race conditions if both PCs sell the last unit near-simultaneously)
- **Multi-PC**: real two-PC LAN test — sale on Client PC instantly visible on Server PC dashboard
- **Network resilience**: Client PC loses connection mid-session → clear error state → recovers cleanly on reconnect (no data loss, no duplicate bills)
- **Performance**: large inventory (10,000+ meds), high transaction volume (500+ bills/day), search speed
- **Printer**: thermal & A4, print queue handling
- **Backup/Restore**: create backup, simulate data loss, restore, verify integrity

---

## ⚙️ Installation & Setup

**Server PC**
1. Install MySQL Server, note/set a static LAN IP (e.g. via router DHCP reservation).
2. Run installer → Server Mode → setup wizard creates DB schema + admin account + shop details.
3. Open firewall port for MySQL (3306) and API (3000) to the LAN.
4. Create cashier account(s) via Users screen.

**Client PC**
1. Run installer → Client Mode.
2. Enter Server PC's IP + port, test connection.
3. Login with cashier credentials.

---

## 🐛 Troubleshooting

| Issue | Check |
|---|---|
| Client can't connect | Same network → ping server IP → firewall rules → server app running |
| Printer not working | USB/LAN connection → Windows default printer set → test print from Windows itself |
| Slow performance | Check indexes on frequently-searched columns, DB connection pool size |
| Data looks wrong after restock | Confirm restock created a new batch row, not an overwrite of an existing one |

---

## 📚 Quick User Manual

**Admin daily tasks:** check dashboard alerts → review yesterday/today's sales → restock low/expiring inventory → spot-check audit log.

**Cashier tasks:** login → confirm 🟢 connected → search/add items → apply discount (within cap) → select payment → print bill → (optionally) check today's summary → logout.

---

## 🚀 Future Enhancements

**Short-term:** barcode scanning, GST calculation refinements, SMS bill/alert via USB modem, customer credit ledger UI.
**Long-term:** admin mobile companion app, multi-store support, prescription record-keeping, accounting software integration.

---

## 📊 Performance Targets

| Metric | Target |
|---|---|
| App launch | < 3 sec |
| Search (1,000+ meds) | < 200ms |
| Bill generation | < 1 sec |
| Report (1 year of data) | < 5 sec |

---

## 💰 Cost Breakdown
**One-time:** development + printer hardware (₹3,000–15,000)
**Recurring:** ₹0/month — fully offline, no SaaS fees
**Annual savings vs. cloud SaaS pharmacy software:** roughly ₹12,000–60,000, depending on the plan they'd otherwise pay for

---

## ✅ Success Criteria
1. Admin can fully manage inventory, batches, and users
2. Cashier can generate accurate bills within their permission limits
3. Client and Server PC always show consistent stock/sales data
4. Bills print correctly on the chosen printer
5. Reports (daily/6-month/annual) are accurate and match manual spot-checks
6. Profit figures reflect actual batch purchase cost, not just current price
7. Backup and restore both verified working
8. No data loss under normal shop operation
9. Performance targets met
10. Owner and staff can operate the system after a walkthrough, without a manual in hand

---

## ❓ Open Questions for the Shop Owner

1. **GST/Tax** — required, or are their medicines untaxed?
2. **Credit/udhaar** — do they extend informal credit to regular customers? (affects whether the `customers` credit ledger is a priority or can wait)
3. **Printer** — thermal receipt printer or A4?
4. **Barcode scanning** — wanted now, or search-by-name is enough for launch?
5. **Number of cashier accounts** — one shared login, or one per staff member? (individual logins are strongly recommended for accountability)
6. **Discount cap enforcement** — hard block at the cashier's cap, or admin-PIN override at the counter for bigger discounts?
7. **Approximate medicine count and daily bill volume** — helps size indexing/performance work appropriately.
8. **Network setup** — wired or Wi-Fi between the two PCs? (wired is more reliable for this use case)
9. **Backup destination** — local folder only, or also copy to USB/external drive periodically?

**This version is ready to build from** — the schema, architecture, and phase plan are now internally consistent (no orphaned SQL, no duplicated sections) and the profit/expiry tracking is structurally sound rather than bolted on. Ready to start scaffolding whenever you are.
