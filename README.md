# HisabPro

Multi-tenant POS with khata (customer credit), inventory, purchasing, finance, reports and HRM & payroll. Two ways to use it:

- **Web** (any device, online): owners, managers, cashiers and the HisabPro super admin.
- **Windows desktop app** (`HisabPro Setup.exe`): runs the same app on the shop PC with a local database, **keeps selling
  offline**, and syncs with the cloud whenever the internet is available.

Every client sees its own shop name and logo in the app and on bills (e.g. "Minha traders"); HisabPro is the platform name.

- **Daily use guide for shops (English / اردو headings): [docs/USER-GUIDE.md](docs/USER-GUIDE.md)**
- Plan and decisions: [PLAN.md](PLAN.md)
- Developer guide (rules, patterns): [docs/DEV.md](docs/DEV.md)
- Screen spec copied from the reference app: [reference/REFERENCE.md](reference/REFERENCE.md)

## Stack

Node 22+ · Express 5 (CommonJS) · Prisma 6 · Postgres (cloud) / SQLite (desktop) · plain-JS single-page app with
Tailwind v4 (built locally, no CDN) · Chart.js, JsBarcode, qrcode-generator (copied to `public/vendor`) · Electron +
electron-builder for the Windows app · `node:test`.

## Run locally

```bash
npm install
cp .env.example .env          # then: npm run gen:keys → paste JWT_SECRET; set SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD
npm run db:local              # Postgres in Docker on localhost:54330
npm run db:deploy             # tables + sync triggers
npm run seed                  # the one super admin
npm run build                 # CSS + vendor libraries + Prisma client
npm run dev                   # http://localhost:3001
npm run seed:demo             # optional: a demo shop with products, sales, purchases, staff …
npm test                      # API, sync and money tests (uses the local database)
```

Sign in as the super admin → **Clients → New client** (business name, owner login, plan, access period) → **Open
workspace**, or sign in with the owner's login.

## Who does what

| Super admin (HisabPro) | Client owner / manager / cashier |
|---|---|
| Creates clients, their users (role + permissions matrix), plans and access periods; switches clients off; revokes desktop PCs; "Open workspace"; activity log of everyone | Everything in the shop according to their permissions. Users are only created and changed by the super admin |

Roles: **Owner** (everything), **Manager**, **Cashier**; each user's permissions can be fine-tuned
(sales, inventory, purchasing & parties, finance, HRM, reports, settings).

## Modules

Made for **wholesale + retail karyana / general stores**: retail and wholesale price per product with a one-click switch at
the counter, carton / dozen / piece and loose-by-kg selling, shopkeeper customers on udhaar, last-rate per customer, fast
`24*code` bulk entry, khata recovery with promises and WhatsApp / SMS reminders, day close, full **Urdu** interface.

Dashboard (with a getting-started checklist) · **Khata Book** (who owes what, receive, promises) · **Promises & Reminders**
(WhatsApp one-click and automatic SMS, Urdu/English templates, message log) · **Day Close** (Z-report) · quick search
(Ctrl+K) · POS Terminal (touch grid / barcode table, scanner, weighed & multi-unit selling, walk-in or credit (udhar),
discounts, taxes, split payments, hold / resume, estimate, receipts 80/58 mm or A4) · Sales · Sales Return (refund / credit
note) · Purchases · Purchase Return · Products (standard, variant colour×size, serial/IMEI, service; base + alternate units;
wholesale price; expiry; CSV import/export) · Categories · Brands · Units · Colors · Sizes · Print Barcodes · Customers ·
Vendors (khata ledgers) · Reports · Profit & Loss · Product Performance · Reminders · HRM (employees, attendance & shifts,
leave, payroll & advances, recruitment, performance & assets) · Payments In/Out · Capital & Equity · Banks & Cash · Cheques ·
Expenses · Taxes & Duties · Users · Settings · Database Backups.

## Offline desktop app and sync

```
Shop PC (Electron)                                   Cloud (Render + Supabase)
same app on 127.0.0.1 ── SQLite + outbox ──push──►  /api/sync/push   (last change wins)
                                        ◄──pull───  /api/sync/pull   (ChangeLog written by DB triggers)
```

- **Activate** a PC once (online) with the owner's or a manager's login; it downloads the shop's data. The super admin sees
  each PC under the client and can revoke it.
- Every local change is written to an **outbox** by triggers; the PC pushes it and pulls the cloud's changes every few
  seconds while online. The top bar shows *Live / Online*, *Syncing · n* or *Offline · n waiting*.
- Safe by design: ids are made where a row is created; nothing is hard-deleted; stock, khata and cash balances are sums of
  movements, so offline sales from several PCs add up; invoice numbers carry the PC code (`INV-D1-0001`).
- A PC that stays offline more than 7 days (`desktop/config.json` → `offlineDays`) must connect before it can save again.

Build the Windows installer (from macOS or Windows):

```bash
npm run desktop:build         # → dist-desktop/HisabPro Setup <version>.exe
```
Set the default server address in `desktop/config.json` (`serverUrl`) before building, or type it on the PC's first start.
The installer is not code-signed yet: Windows SmartScreen will warn until a code-signing certificate is added.

## Hosting (same as digital-invoice): Supabase + Render

1. **Supabase** (database) → project → **Connect** → *ORMs / connection string*:
   - `DATABASE_URL` = **Transaction pooler** URI (port **6543**) with `?pgbouncer=true` added at the end
   - `DIRECT_URL` = **Session pooler** URI (port **5432**) — migrations use it
   Put the database password in both (percent-encode special characters: `#` → `%23`, `$` → `%24`, `%` → `%25`, `@` → `%40`).
2. **Render** → **New → Blueprint** → repo `hisabpro` → it reads [render.yaml](render.yaml). Fill `DATABASE_URL`, `DIRECT_URL`,
   `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`; `JWT_SECRET` is generated. Each deploy builds, creates/updates the tables
   (with the sync triggers) and the super admin. Health check: `/healthz`. Every push to `main` deploys.
3. **Domain** (optional): Render → service → Settings → Custom Domains; add the DNS records where the domain is managed
   (e.g. Vercel → Domains, as digital-invoice does). Vercel does not host the app itself.
4. **Desktop app**: put the live address in `desktop/config.json` (`"serverUrl": "https://…"`), then `npm run desktop:build`.
