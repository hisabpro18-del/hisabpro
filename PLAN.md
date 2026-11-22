# POS — plan

_Status: built and live — all phases, see the progress table in §4 · updated 2026-11-22_

Our own multi-tenant POS with the same screens, flows and fields as the reference app (captured read-only on
2026-11-21; screen-by-screen spec in [reference/REFERENCE.md](reference/REFERENCE.md)). It has its own name and branding
(name and domain to be decided). Two ways to use it:

- **Web** (any device, online): owners, managers and the super admin.
- **Windows desktop app (.exe)** at the shop counter: works **offline** and syncs with the server when the internet is back.

---

## 1. Stack (the same as digital-invoice)

| Layer | Choice |
|---|---|
| Server | Node 22, Express 5, CommonJS (`server.js` + `src/`) |
| Database | Prisma → Postgres (Docker locally on port 54330, Supabase live). The desktop app uses SQLite (section 5) |
| Frontend | Plain JS single page (`public/app.html` + one JS file per screen), Tailwind |
| Login | JWT + bcrypt, roles, lockout, sign-out-everywhere, append-only activity log (copied from digital-invoice) |
| Desktop | Electron + electron-builder → Windows installer (.exe) with auto-update |
| Tests | `node:test` |
| Hosting | Render (Singapore), Supabase, private GitHub repo, encrypted backups (as in digital-invoice `docs/HOSTING.md`) |

Copied and adapted from digital-invoice instead of rewritten: `src/auth.js`, `src/audit.js`, `src/subscription.js` +
`public/access.js`, `src/limits.js` + `public/plans.js`, and from its POS module `pos-calc.js` (exact paisa maths),
`pos-scan.js` + `pos-camera.js` (scanner and camera), `pos-escpos.js` + `pos-printer.js` (thermal printing), the Excel
import with undo, and the reports engine.

---

## 2. Super admin and clients (as in digital-invoice)

- **One super admin** (created by `npm run seed` from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`). Not tied to a client.
- **Clients** (businesses). Each client's users have one role: **Owner**, **Manager** or **Cashier**.
- **Only the super admin creates and edits users** (decided 2026-11-21). Owners cannot add staff, so there is no approval step.

The super admin can:
1. Create a client: business name, mobile, owner login email + temporary password (changed at first login), plan, access period.
2. Manage any client's users: add, change name/role/login email, disable, reset password (also unlocks).
3. Set the plan (limits on users, branches, counters, products; prices set later).
4. Set the access period (months/years). After the end date plus grace (3 days monthly, 7 yearly) the client becomes read-only by itself; renewing restores it.
5. Switch a client off (nobody can log in).
6. **Open workspace**: act as the client's owner for 2 hours, logged under the super admin.
7. **Devices**: see each client's Windows PCs, when each last synced, and revoke one (section 5).
8. Activity log of every client: filter, search, CSV; entries can never be changed or deleted.

Security (copied): 5 wrong passwords lock for 15 minutes; a password, role or active change signs the user out everywhere; 12-hour web sessions.

---

## 3. Modules (from the reference app's menu)

| Menu | Screens |
|---|---|
| Dashboard | KPI cards with a date range, charts, quick actions (New Sale, Payment In/Out, Add Expense, Add Product, Reorder) |
| POS Terminal | Visual/Touch and Retail/Barcode modes; search / barcode / formula (F1); category chips; product tiles with stock; weighed sale by amount with unit choice (e.g. Ctn / Dzn); Walk-in or Credit (Udhar) customer; discount (% or Rs); tax; split payment (Cash / Card / Bank); quick cash buttons; Hold, View Held Sales, Print Estimate, Charge (F9) |
| Sales | Sales list with actions and details, CSV; Sales Return (refund and credit note by invoice) |
| Purchasing | Purchases (purchase orders); Purchase Return (by invoice) |
| Inventory | Products (variants, units, import/export CSV, UI settings); Categories; Brands / Companies; Units; Colors; Sizes; Print Barcodes (label templates) |
| Parties | Customers (credit limits, receivables, risk); Vendors (payables) |
| Reports | Reports (sales, product-wise, category-wise, purchases, expenses, financial & khata, tax & audit); Profit & Loss; Product Performance; Reminders (low stock, expiring, customer and supplier dues) |
| HRM & Payroll | HR Dashboard; Employees; Attendance & Shifts; Leave Management; Payroll & Advances; Recruitment; Performance & Assets |
| Finance | Payments In/Out; Capital & Equity; Banks & Cash; Cheques; Expenses; Taxes & Duties |
| Administration | Users; Settings (Company Profile, Receipt & POS, Localization); Database Backups |
| Top bar | Online/offline pill, English / اردو switch, night mode, theme palette |

Field-level detail for every screen and form: [reference/REFERENCE.md](reference/REFERENCE.md).

**What the reference does that shapes our data model**
- **Item types:** Standard, Variant (color × size matrix), Serialized / IMEI, Service (no stock).
- **Prices:** retail, wholesale (a "Wholesale Mode" at the till), cost, tax %.
- **Units:** a base unit plus alternate sale units with a factor (e.g. 1 Ctn = 30 Dzn). Stock is kept in the base unit and
  can be fractional (selling 4 Dzn from a 30-Dzn carton leaves 9.867 Ctn).
- **Weighed / amount sale:** the cashier types the amount and the quantity is worked out.
- **Stock fields:** opening stock, reorder level (default 10), expiry date. Reminders list low stock, expiring items,
  customer and supplier dues.
- **Parties:** customers and vendors share one party table with a type, a credit limit (0 = unlimited) and payment terms.
  Credit (Udhar) sales go on the customer's khata.
- **Receipt settings:**
  - format: thermal 80/58 mm or A4/A5;
  - layout: Standard, Compact or Supermarket;
  - brand color, copies, auto-print;
  - 12 on/off options, including logo, tax ID, previous balance, amount in words, QR "scan & pay", bank details, and a
    signature line.
- **Look:** a warm-grey and indigo theme, night mode, a theme palette, and an English / اردو switch in the top bar.
- **Its own figures don't always agree:**
  - cost of goods uses carton cost against pieces sold, giving margins like −2800%;
  - retained earnings equal cash sales, not net profit;
  - the alerts page leaves variants out of stock value.

  **We use one calculation everywhere:** stock value and cost of goods both come from stock movements valued at cost in
  the base unit, and every screen reads the same figures.

---

## 4. Phases

| # | Phase | Contents | Status (2026-11-21) |
|---|---|---|---|
| 0 | Reference capture | 35 pages (also full height) and ~85 forms → [reference/REFERENCE.md](reference/REFERENCE.md) | ✅ Done |
| 1 | Foundation | Prisma schema (sync-ready), super admin, clients, users + permissions, plans, access periods, login, app shell, night mode, theme palette | ✅ Done |
| 2 | Selling | Inventory (variants, units, serials, barcodes, CSV), POS Terminal, sales, returns, receipts 80/58 mm + A4 | ✅ Done |
| 3 | Desktop + sync | Electron app, SQLite, outbox/pull sync, activation, revoke, offline limit, clock check, schema upgrade, Windows installer | ✅ Done (installer not yet tried on a real Windows PC) |
| 4 | Buying and money | Purchases + returns, customers/vendors with khata, payments, banks, cheques, expenses, taxes, capital | ✅ Done |
| 5 | Insight | Dashboard, reports (all tabs), P&L, product performance, reminders | ✅ Done |
| 6 | HRM & Payroll | Employees, attendance & shifts, leave, payroll & advances, recruitment, performance & assets | ✅ Done |
| 6b | Khata recovery (added) | Khata Book, promises (وعدے), WhatsApp one-click reminders (as in Honda-Admin), automatic SMS through any HTTP SMS gateway, Urdu/English templates, message log, bilingual statements, day close | ✅ Done |
| 6c | Wholesale / karyana (added) | Retail ⇄ wholesale switch, `24*code`, last rate per customer, receive udhaar at the counter, unknown barcode → add product | ✅ Done |
| 6d | Urdu + easy flow (added) | Full Urdu interface (1,900+ strings, RTL, bundled font), Ctrl+K quick search, getting-started checklist, user guide | ✅ Done |
| 7 | Go live | Code review (3 reviewers, 54 bugs fixed), automated tests, demo data, docs; Render + Supabase (Singapore) live at hisabpro-2r1x.onrender.com | ✅ Live. Still open: own domain, code-signing certificate |
| 7b | Fit the free 500 MB database (added) | Daily clean-up of housekeeping rows (sync log 14 days, activity log and message history 1 year), PC resync from a fresh copy, size caps on photos / logo / files / held carts, storage card for the super admin | ✅ Done (175 tests) |
| 7c | One-click app updates (added) | Settings → App update in the Windows app: check, download, restart & install from GitHub releases; quiet check on start and every 6 hours | ✅ Done |

Each phase ends with its tests passing and a run in the real app (web, and from phase 3 the desktop app offline and online).

---

## 5. Hybrid: Windows offline app + sync

**Verdict: yes, it can be done**, and the reference app does the same thing (its server has a `/api/desktop/status`
endpoint answering `activated`, `isDesktop`, `tenant`, `shopName`). The one condition is that the data model is built
for sync **from the first table**. Adding offline later means redoing every table.

### How it works

```
Windows PC at the counter (Electron app)                      Cloud (Render + Supabase)
┌────────────────────────────────────────────┐               ┌──────────────────────────────┐
│ Window: the same screens as the web app    │               │ Express API (same code)      │
│        │                                   │               │   /api/...   web users       │
│        ▼                                   │   internet    │   /api/sync/push  /pull      │
│ Local Express API (same code, 127.0.0.1)   │ ◄───────────► │        │                     │
│        │                                   │  when online  │        ▼                     │
│        ▼                                   │               │ Postgres (all clients)       │
│ SQLite file  +  outbox of local changes    │               └──────────────────────────────┘
│ Receipt printer · barcode scanner · drawer │                     ▲
└────────────────────────────────────────────┘                     │ web browser (owner at home,
                                                                   │ super admin): online only
```

- **One code base.** The desktop app runs the same Express routes and the same screens on the PC, against a local SQLite
  file. The web uses the same code against Postgres. Business rules are written once.
- **Activation.** First start needs internet: the owner (or the super admin) logs in, the server registers the PC as a
  **device** of that client and gives it a device token, and the app downloads that client's data. The super admin sees
  and can revoke devices.
- **Offline login.** The PC keeps the client's users (with hashed passwords) so cashiers can log in without internet.
  Password changes and disabled users arrive with the next sync.
- **Sync.** Every local change is written, in the same transaction, to an **outbox**. When online, the app **pushes**
  the outbox (each change has an id, so a retry never doubles anything) and **pulls** what changed on the server since its
  last sync. It runs every few seconds while online and at once when the connection returns. The top-bar pill shows
  *Online*, *Offline* or *Syncing (12 waiting)*.

### Rules that make sync safe

| Data | Rule | Why it cannot clash |
|---|---|---|
| Every row | Id is a UUID made on the device; `updatedAt`, `deletedAt` (no hard deletes) | Two PCs never make the same id |
| Sales, returns, payments, purchases, expenses | Never edited after saving; a return or void is a **new** record | Nothing to merge, only to add |
| Stock | Not a stored number but the sum of **stock movements** (sale, purchase, return, adjustment) | Movements from two PCs simply add up |
| Customer / vendor khata balance | The sum of ledger entries | Always adds up after sync |
| Products, prices, customers, settings | Last change wins (by time), every change kept in history | Rare, and visible in the history |
| Invoice numbers | Per PC prefix, e.g. `C1-000123`, `C2-000045` | Printed receipts never need renumbering |

### What the business must accept (to confirm)

1. Two PCs offline at the same time can **sell more than the stock** (e.g. the last item sold twice). After sync stock goes
   negative and shows in *Reminders*. Selling is never blocked by it.
2. **Credit limits** offline use the balance as last synced, so two PCs could both give credit up to the limit.
3. A PC may stay offline for **N days** (suggest 7), then it asks for internet. This also enforces the access period
   and a revoked device.
4. Sales on a PC that breaks **before** it syncs are lost. Mitigation: sync every few seconds when online, and a daily
   local backup copy.
5. Wrong PC clock: the app warns when the PC's time differs from the server's by more than a few minutes.

### Costs and work

- **Code-signing certificate** for the .exe (yearly fee); without it Windows SmartScreen warns "unknown publisher".
- **Auto-update** server for new versions (GitHub Releases or a file host).
- Prisma with two databases: one schema for Postgres and a generated copy for SQLite (SQLite supports enums and JSON in
  Prisma; avoid Postgres-only types such as arrays in synced tables). Use a Prisma version with the fixed SQLite adapter (7.3+).
- About one extra phase of work (phase 3), plus offline tests in every later phase.
- Printing from the desktop app can go **straight to the receipt printer without the print dialog**, which the web cannot do.

---

## 6. Decided

| Date | Decision |
|---|---|
| 2026-11-21 | Same stack and hosting as digital-invoice; this folder, separate repo |
| 2026-11-21 | One super admin creates clients; only the super admin creates and edits users |
| 2026-11-21 | Same screens, flows and fields as the reference app, under our own name and branding |
| 2026-11-21 | Windows desktop app with offline mode and sync; web for everyone else |
| 2026-11-21 | Product name **HisabPro** (main domain). Each client sees and prints its own shop name and logo (e.g. "Minha traders") |
| 2026-11-21 | Build all phases, review the code, test in detail, then hand over |
| 2026-11-22 | Stay on the Supabase free plan (500 MB): only housekeeping rows are cleaned; shop records are kept for ever |
| 2026-11-22 | Windows app updates itself from GitHub releases (Settings → App update); shops never re-download the installer |

## 7. Open

- The exact domain (e.g. hisabpro.com) — then set it in `desktop/config.json` and release an update (PCs already set up keep the address they were activated with).
- FBR POS integration, multiple branches, Urdu (later). All screen text goes in one language file from the start, so Urdu is cheap to add.
- The offline rules in section 5 (1–5).
- Plan prices and limits.
- **Database Backups** screen: the reference lets a shop download and restore its own backup. Online we keep backups
  centrally; suggest *download only* for the shop and restore by the super admin.
- Screens the reference never showed, to design ourselves: the Serialized/IMEI and Service item forms, row actions and
  delete confirmations, leave balances, job postings, where the 4-digit Master PIN is set, and a fiscal-year setting.
