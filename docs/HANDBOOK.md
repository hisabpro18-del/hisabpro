# HisabPro — Handbook

**For whoever takes charge of HisabPro next.** It explains what the system is, where everything runs, which accounts own
what, how the code is organised and how to develop, deploy, release and operate it. Read it top to bottom once; afterwards
use the table of contents.

> **This repository is public.** This handbook names every service, link and setting, and says *where* each password
> and key is kept. It never contains the values themselves. Get the logins from the owner of HisabPro (see
> [§2.3](#23-accounts-and-who-owns-them)) and keep them in a password manager. Never commit a secret; `.env` and `render.env` are
> git-ignored for that reason.

_Last updated: 2026-11-22 · app version 1.0.0 · 175 automated tests passing_

---

## Contents

1. [What HisabPro is](#1-what-hisabpro-is)
2. [Links, servers, accounts and secrets](#2-links-servers-accounts-and-secrets)
3. [Architecture](#3-architecture)
4. [Repository tour](#4-repository-tour)
5. [Local development setup](#5-local-development-setup)
6. [Configuration (environment variables)](#6-configuration-environment-variables)
7. [Backend (API server)](#7-backend-api-server)
8. [Data model](#8-data-model)
9. [Frontend (web app)](#9-frontend-web-app)
10. [Windows desktop app and sync](#10-windows-desktop-app-and-sync)
11. [Background jobs, SMS / WhatsApp and database size](#11-background-jobs-sms--whatsapp-and-database-size)
12. [Testing](#12-testing)
13. [Deployment (Render + Supabase)](#13-deployment-render--supabase)
14. [Releasing a new Windows app version](#14-releasing-a-new-windows-app-version)
15. [Operations runbooks](#15-operations-runbooks)
16. [Troubleshooting](#16-troubleshooting)
17. [Making changes safely (checklists)](#17-making-changes-safely-checklists)
18. [Known gaps and roadmap](#18-known-gaps-and-roadmap)
19. [History and decisions](#19-history-and-decisions)
20. [Glossary](#20-glossary)

---

## 1. What HisabPro is

HisabPro is a **multi-tenant point-of-sale and shop-management system** for Pakistani **wholesale + retail karyana /
general stores**. One platform (HisabPro) serves many shops ("clients" or "tenants"). Each shop sees **its own shop name
and logo** in the app and on every bill (e.g. "Minha Traders"); HisabPro is only the platform's name.

The screens, layouts and flows follow the reference product KhataPOS (layout and flow only; own name, code and branding).
The screen-by-screen specification copied from it is [reference/REFERENCE.md](../reference/REFERENCE.md).

### 1.1 Two ways to use it

| | Web app | Windows desktop app |
|---|---|---|
| Who | Super admin, shop owners, managers, cashiers | The shop's counter PC |
| Where it runs | Browser → `https://hisabpro-2r1x.onrender.com` | Installed `.exe`; the same app runs **inside the PC** with a local SQLite database |
| Internet | Needed | **Not needed for selling.** Syncs with the cloud whenever online |
| Updates | Every push to `main` deploys | **Settings → App update** (one click; from GitHub releases) |

### 1.2 Who does what

| Role | Can do |
|---|---|
| **Super admin** (HisabPro staff, one account) | Creates clients (shops), **creates and edits every user** of every shop (role + permission matrix), sets plan and access period, switches a shop off, revokes desktop PCs, "Open workspace" (works inside a shop as its owner for 2 hours), sees everyone's activity log, watches database storage |
| **Owner** | Everything inside their shop |
| **Manager** | Everything except Settings (by default; adjustable per user) |
| **Cashier** | POS only by default (`sales.create`); adjustable per user |

Owners **cannot** add staff — only the super admin creates users (an explicit business decision).

### 1.3 Modules (what a shop gets)

- **POS Terminal** — touch grid or barcode table, scanner, `24*code` bulk entry, weighed (kg) and multi-unit selling
  (carton / dozen / piece), retail ⇄ wholesale price switch, walk-in or credit (udhaar) customer, last rate per customer,
  discounts, taxes, split payments, hold / resume, estimate, receipts 80 / 58 mm or A4, WhatsApp receipt.
- **Sales, Sales Return** (cash refund or credit note to khata).
- **Purchases, Purchase Return**, vendor payments.
- **Inventory** — products (standard, variants colour × size, serial / IMEI, service), base + alternate units, wholesale
  price, expiry, CSV import / export, categories, brands, units, colours, sizes, barcode printing.
- **Khata (Udhaar)** — Khata Book (who owes what), receive payment, **promises (وعدے)**, WhatsApp one-click reminders,
  **automatic SMS** through any HTTP SMS gateway, Urdu / English templates, message log, bilingual statements, **Day Close**
  (Z-report).
- **Parties** — customers and vendors with ledgers.
- **Finance** — payments in / out, banks & cash, cheques, expenses, taxes, capital & equity.
- **Reports** — dashboard, reports (all tabs), profit & loss, product performance, reminders.
- **HRM & Payroll** — employees (with documents), attendance & shifts, leave, payroll & advances, recruitment, appraisals,
  disciplinary, asset assignment.
- **Administration** — users (read-only for owners), settings, database backups (JSON download / merge import).
- **Full Urdu interface** (1,900+ strings, right-to-left, bundled Noto Naskh font), night mode, theme palette, Ctrl+K
  quick search, getting-started checklist.

User-facing guide for shops: [docs/USER-GUIDE.md](USER-GUIDE.md).

---

## 2. Links, servers, accounts and secrets

### 2.1 Links

| What | Link | Notes |
|---|---|---|
| **Live app** (web) | https://hisabpro-2r1x.onrender.com | Health check: `/healthz` → `{"ok":true,"mode":"cloud"}` |
| **Source code** | https://github.com/hisabpro18-del/hisabpro | **Public.** Branch `main` = production |
| **Windows app releases** | https://github.com/hisabpro18-del/hisabpro/releases | Installed PCs update from here. Share the latest release link with new shops |
| Latest installer | https://github.com/hisabpro18-del/hisabpro/releases/latest | `HisabPro-Setup-<version>.exe` |
| **Render** (app hosting) | https://dashboard.render.com → service **hisabpro** | Web service, region **Singapore**, auto-deploys `main` |
| **Supabase** (database) | https://supabase.com/dashboard/project/wprrcbvrxeuvfptgwvkp | Postgres, region **Singapore (ap-southeast-1)**, **free plan (500 MB)** |
| Supabase (old, unused) | project `rnrdogvpzoowvykttqfq` (Tokyo) | Created first, never used for production. Safe to delete |
| **Vercel** (DNS only) | https://vercel.com → team **hisabpro** | Only for the future custom domain's DNS. Vercel does **not** host the app |
| Reference app | https://khatapos.com | The UI/UX reference. Screenshots are kept **locally only** in `reference/khatapos/` (git-ignored: they contain a real shop's data) |
| Sister project | `~/Documents/digital-invoice` (owner's Mac) | Same stack and hosting pattern; HisabPro copied its structure and super-admin model |

### 2.2 Servers at a glance

```
             Shops' browsers                          Shops' Windows PCs (HisabPro.exe)
                   │ HTTPS                                    │ HTTPS (device token)
                   ▼                                          ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │ Render web service "hisabpro" (Singapore, Node 22)               │
   │  server.js: web app + REST API + desktop-sync API + scheduler    │
   └───────────────┬──────────────────────────────────────────────────┘
                   │ Postgres (Prisma) — pooled :6543 for the app, session :5432 for migrations
                   ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │ Supabase Postgres (Singapore, free plan 500 MB)                  │
   │  51 tables · sync triggers → ChangeLog · append-only AuditLog    │
   └──────────────────────────────────────────────────────────────────┘

   GitHub hisabpro18-del/hisabpro ── push to main ──► Render auto-deploy
                                  └─ Releases (installer + latest.yml) ──► PCs' "App update"
```

| Item | Value |
|---|---|
| Render service | `hisabpro`, runtime Node (`NODE_VERSION=22`), region `singapore`, blueprint [render.yaml](../render.yaml) |
| Build command | `npm ci --include=dev && npm run build && npm run db:deploy && npm run seed` |
| Start command | `npm start` (→ `node server.js`) |
| Health check | `GET /healthz` |
| Auto deploy | On every push to `main` |
| Database host (app) | `aws-1-ap-southeast-1.pooler.supabase.com:6543` (transaction pooler, `?pgbouncer=true`) |
| Database host (migrations) | `aws-1-ap-southeast-1.pooler.supabase.com:5432` (session pooler) |
| Database user | `postgres.wprrcbvrxeuvfptgwvkp` |
| Database name | `postgres` |
| Database usage (2026-11-22) | ≈ 13 MB of 500 MB (one shop just onboarded) |

Render plan: the blueprint asks for **Starter** (always on). The free plan sleeps after 15 idle minutes, which delays PC
syncing and automatic SMS, and an idle app also lets a free Supabase project pause after a week. Check the plan in the
Render dashboard.

### 2.3 Accounts and who owns them

All service accounts belong to **HisabPro's company Google account** (the HisabPro Gmail). The owner of HisabPro holds
its password and the passwords below. Ask the owner; do not expect to find them in the repository.

| Account | Owner / login | Used for |
|---|---|---|
| Google (HisabPro Gmail) | HisabPro company account | Sign-in for Supabase, Render, Vercel; GitHub org email |
| GitHub `hisabpro18-del` | HisabPro company account | Owns the repo and releases. Developers are added as **collaborators** (Settings → Collaborators) |
| Render | HisabPro company account | Hosting; environment variables hold the production secrets |
| Supabase | HisabPro company account | Database; the **database password** is separate from the account password |
| Vercel team `hisabpro` | HisabPro company account | DNS for the future domain |
| HisabPro **super admin** (in the app) | The owner's personal email, set by `SUPER_ADMIN_EMAIL` on Render | Platform administration |
| Shop logins (owners, managers, cashiers) | Created by the super admin | Each shop's staff |

**Production data already in the system (2026-11-22):** one client **"Minha Traders"** with an owner login and one cashier
login ("counterman"). Their emails are visible to the super admin under **Clients → Minha Traders → Users**.

### 2.4 Where every secret lives

| Secret | Where it is kept | How to change it |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` (contain the DB password) | Render → hisabpro → **Environment**; also the owner's local `render.env` (git-ignored) | Supabase → Project Settings → Database → **Reset database password**, then update both URLs on Render (percent-encode special characters, see [§13.2](#132-supabase-database)) and redeploy |
| `JWT_SECRET` (signs every login token) | Render → Environment | Generate with `npm run gen:keys`, paste, redeploy. **Changing it signs everyone out** (desktop PCs keep working: they use device tokens) |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | Render → Environment | Change there and redeploy; the seed step updates the super admin's password on each deploy |
| Desktop **device tokens** | Hashed (SHA-256) in the `Device` table; the plain token only on that PC | Revoke the PC (super admin → client → Desktop PCs) and activate it again |
| A PC's local login-token secret | `%APPDATA%\HisabPro\secret.key` on that PC | Generated on first start; never leaves the PC |
| Shops' SMS gateway keys | `Secret` table (server only, never synced to PCs, never sent to the browser) | Shop → Khata → Promises & Reminders → Messaging settings |
| GitHub access for releases | The releasing developer's own `gh auth login` | Each developer signs in with their own GitHub account |

### 2.5 Security to-dos for the new person in charge

During setup some passwords and tokens were typed into a chat with an AI assistant. Treat them as exposed and change
them once:

1. Supabase **database password** → reset, then update `DATABASE_URL` and `DIRECT_URL` on Render and in `render.env`.
2. Supabase **account** password (the HisabPro Gmail sign-in, if used as a password login).
3. Supabase → Account → **Access Tokens**: delete every token you do not use.
4. The **KhataPOS reference account** password (used only to read the reference screens).
5. Shop logins created on day one (owner, cashier) and the super admin password: ask the users to change them
   (owners/cashiers via the super admin's **Reset password**; super admin via `SUPER_ADMIN_PASSWORD` on Render).

---

## 3. Architecture

### 3.1 One codebase, two modes

The same Node/Express server runs in two places. `MODE` decides which:

| | `MODE=cloud` (Render) | `MODE=desktop` (inside the Electron app) |
|---|---|---|
| Database | Postgres (Supabase) via `@prisma/client` | SQLite file via the generated client `src/generated/sqlite` |
| Listens on | `PORT` (Render sets it) | `127.0.0.1:<random free port>`, only reachable from the PC itself |
| Extra routes | `admin.js` (super admin), `sync.js` (PC sync API) — `cloudOnly` | `desktop.js` (activation, status, sync now) — `desktopOnly` |
| Background | `services/scheduler.js` (SMS reminders every 5 min + daily maintenance) | `sync/client.js` (push / pull every 5 s while online) |
| Locks | Postgres advisory lock per client: `pg_advisory_xact_lock(hashtext('hp:'+tenantId))` | Not needed (SQLite, one connection) |

Business code (routes, services) is **identical** in both modes. That is why the code rules in [§8.1](#81-rules-that-keep-sync-working-never-break-them)
exist: everything has to work on Postgres **and** SQLite, and on several offline PCs at once.

### 3.2 Request lifecycle (cloud)

1. `server.js` → security headers (CSP without inline scripts, `X-Frame-Options: DENY`, …) → JSON body parser (6 MB;
   `/api/sync/push` parses its own up to 20 MB).
2. Route files in `src/routes/*.js` are **loaded automatically** in file-name order; each exports
   `{ router, mount, cloudOnly?, desktopOnly? }`.
3. `authenticate` (in `src/auth.js`) verifies the JWT (`Authorization: Bearer …`), loads the user and tenant, checks the
   token version (password change / sign-out invalidates old tokens) and the client's access mode (active / grace /
   read-only / blocked).
4. `can('perm.key')` checks the permission (owners have all).
5. The handler validates input with `src/lib/http.js`, runs writes in `withTx(tenantId, tx => …)` and logs important
   actions with `audit()`.
6. Express 5 catches thrown errors; the error handler turns them into `{ error: "Plain message" }` with the status of the
   `HttpError` (500s are logged and shown as a generic message).
7. Any other path serves `public/index.html` (single-page app); static files are cached 1 hour in the cloud.

### 3.3 Tech stack and versions

| Layer | Technology |
|---|---|
| Runtime | Node **22+** (`engines`), Render uses 22; developed on Node 24 |
| Server | Express **5** (async errors), CommonJS, `jsonwebtoken`, `bcryptjs`, `dotenv` |
| Database | Prisma **6** (`relationMode = "prisma"`, no database foreign keys), Postgres 16 locally / Supabase in production, SQLite on PCs |
| Web app | Plain JavaScript single-page app (no framework, no bundler), Tailwind CSS **v4** built locally, Chart.js, JsBarcode, qrcode-generator, Noto Naskh Arabic font (all copied to `public/vendor` by `scripts/vendor.js`) |
| Desktop | Electron **39**, electron-builder **26** (NSIS installer, x64), electron-updater **6** (GitHub provider) |
| Tests | `node:test` (built-in), real HTTP against the app and a real local Postgres; desktop tests spawn a real desktop-mode server process |
| Hosting | Render (web service) + Supabase (Postgres) — same as `digital-invoice` |

---

## 4. Repository tour

```
.
├── server.js                  Express app: headers, auto-loaded routes, static web app, error handler, startServer()
├── package.json               scripts, dependencies, electron-builder config ("build"), app version
├── render.yaml                Render blueprint (service, build/start commands, env var list)
├── docker-compose.yml         local Postgres 16 on localhost:54330 (npm run db:local)
├── .env.example               template for local .env
├── PLAN.md                    original plan, phase table, decisions log
├── README.md                  short overview
├── docs/
│   ├── HANDBOOK.md            ← this file
│   ├── DEV.md                 coding rules and patterns (short, read before coding)
│   └── USER-GUIDE.md          daily-use guide for shops (English with Urdu headings)
├── reference/REFERENCE.md     screen-by-screen spec copied from the reference app (screenshots local only)
├── prisma/
│   ├── schema.prisma          the data model (Postgres); the SQLite copy is generated from it
│   ├── migrations/            SQL migrations incl. sync triggers and AuditLog append-only trigger
│   ├── seed.js                creates / updates the one super admin from SUPER_ADMIN_* (safe to repeat)
│   └── sqlite/                generated SQLite schema (git-ignored)
├── src/
│   ├── config.js              MODE, PORT, JWT_SECRET, OFFLINE_DAYS, TRUST_PROXY_HOPS
│   ├── db.js                  Prisma client for the mode, timestamps extension, withTx(), lockTenant(), ci(), MODELS
│   ├── auth.js                tokens (12 h; workspace 2 h), authenticate, can(), requireSuper, desktop guard hook
│   ├── audit.js               append-only activity log (never throws into the caller)
│   ├── limits.js              plan limits (users, PCs, products), checked when adding
│   ├── lib/                   http.js (HttpError + input readers), money.js (paisa), dates.js (shop time zone)
│   ├── routes/                one file per module, auto-loaded (see §7.6 for every endpoint)
│   ├── services/              business engines: stock, ledger, treasury, numbering, reports, settings, tenant,
│   │                          khata, sms, scheduler, maintenance
│   ├── sync/                  registry.js (which tables sync), apply.js (row upsert), client.js (PC side), state.js
│   └── generated/sqlite/      generated Prisma client for SQLite (git-ignored)
├── public/                    the web app (served as static files)
│   ├── index.html             loads core scripts, then /js/pages.bundle.js
│   ├── css/app.css            built by Tailwind (git-ignored)
│   ├── vendor/                copied libraries and fonts (git-ignored)
│   ├── img/                   logo
│   └── js/
│       ├── shared/            used by server AND browser: calc.js (money/tax maths), permissions.js, plans.js, access.js
│       ├── core/              html, icons, fmt, i18n (+ i18n-ur.js dictionary), api, ui (kit), router, shell (layout,
│       │                      sidebar, top bar), app (start-up, login, activation), print, whatsapp, palette,
│       │                      updates (Windows app updates), theme-boot
│       └── pages/             one file per module; concatenated into /js/pages.bundle.js by src/routes/pages.js
├── styles/app.css             Tailwind source: theme tokens (light/dark), component classes
├── desktop/
│   ├── main.js                Electron main: env setup, starts server.js in-process, window, printing, updates
│   ├── preload.js             window.hpDesktop bridge (print, info, updates)
│   ├── config.json            serverUrl offered at activation (production URL), offlineDays
│   ├── icon.png
│   └── schema.sql             generated SQLite DDL + outbox triggers (git-ignored)
├── scripts/
│   ├── gen-sqlite.js          builds prisma/sqlite schema, src/generated/sqlite client, desktop/schema.sql
│   ├── vendor.js              copies Chart.js, JsBarcode, qrcode, fonts into public/vendor
│   ├── seed-demo.js           a full demo shop (products, sales, purchases, staff …)
│   └── extract-strings.js     lists English UI strings (to find missing Urdu translations)
├── test/                      node:test suites (+ helpers.js, pc.js for desktop child processes)
└── dist-desktop/              installer output (git-ignored)
```

Git-ignored (never commit): `.env`, `render.env`, `node_modules/`, `public/css/app.css`, `public/vendor/`,
`src/generated/`, `prisma/sqlite/`, `desktop/schema.sql`, `dist-desktop/`, `reference/khatapos/`, `data/`.

---

## 5. Local development setup

### 5.1 Prerequisites

- macOS, Linux or Windows with **Node 22+** and npm.
- **Docker** (for the local Postgres) — or any Postgres 16 you point `DATABASE_URL` at.
- Git, and the GitHub CLI `gh` if you will publish Windows releases.
- To build the Windows installer: macOS or Windows (electron-builder cross-builds the NSIS installer from macOS).

### 5.2 First run

```bash
git clone https://github.com/hisabpro18-del/hisabpro.git && cd hisabpro
npm install
cp .env.example .env
npm run gen:keys              # prints JWT_SECRET=… → paste into .env
#   in .env set SUPER_ADMIN_EMAIL (e.g. admin@hisabpro.local) and SUPER_ADMIN_PASSWORD (e.g. Admin@12345)
npm run db:local              # Postgres 16 in Docker on localhost:54330 (user/pass postgres/postgres, db hisabpro)
npm run db:deploy             # all migrations: tables, sync triggers, append-only audit log
npm run seed                  # the super admin
npm run build                 # Tailwind CSS + vendor files + Prisma client
npm run dev                   # http://localhost:3001 (restarts on file changes)
npm run seed:demo             # optional: a demo shop ("Minha traders", owner owner@minha.test / Owner@12345)
```

Sign in with the super admin → **Clients → New client** → **Open workspace**, or sign in with the demo owner.

### 5.3 Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Server with `--watch`; the page bundle is rebuilt on every request outside production |
| `npm run build:css` | Rebuild Tailwind after changing class names in `public/**` or `styles/app.css` |
| `npm run watch:css` | Tailwind in watch mode |
| `npm run db:migrate` | `prisma migrate dev` — create and apply a migration after editing `schema.prisma` |
| `npm run db:deploy` | Apply pending migrations (what Render runs) |
| `npm test` | All test suites, one file at a time (needs the local Postgres running) |
| `node --test test/pos.test.js` | One suite |
| `npm run build:sqlite` | Regenerate the desktop SQLite schema/client after any schema change |
| `npm run desktop` | Run the Electron app from source (unset `ELECTRON_RUN_AS_NODE` first if your shell sets it) |
| `npm run desktop:build` | Build `dist-desktop/HisabPro Setup <version>.exe` |
| `npm run seed:demo` | Demo shop with data |
| `node scripts/extract-strings.js` | English strings, to check Urdu coverage |

### 5.4 Running a desktop PC against your local cloud

```bash
npm run build:sqlite
unset ELECTRON_RUN_AS_NODE
HP_SERVER_URL=http://localhost:3001 HP_USER_DATA=/tmp/hp-pc1 npm run desktop
```
Activate with a shop owner's login. `HP_USER_DATA` keeps each test PC's database separate. Delete the folder to start
over. Without Electron, a desktop-mode server can also be started directly (this is what the tests do):

```bash
MODE=desktop PORT=4001 DATABASE_URL="file:/tmp/pc.db?connection_limit=1" JWT_SECRET=$(openssl rand -hex 32) \
HP_SERVER_URL=http://localhost:3001 node server.js
```

---

## 6. Configuration (environment variables)

### 6.1 Cloud (Render / local `.env`)

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Postgres URL. Production: Supabase **transaction pooler** (port 6543) **with `?pgbouncer=true`** |
| `DIRECT_URL` | yes | — | Postgres URL for migrations. Production: Supabase **session pooler** (port 5432). Locally the same as `DATABASE_URL` |
| `JWT_SECRET` | yes | — | Long random string (`npm run gen:keys`). Render generates one from the blueprint |
| `SUPER_ADMIN_EMAIL` | yes (seed) | — | The one super admin. The seed refuses if that email belongs to a shop user |
| `SUPER_ADMIN_PASSWORD` | yes (seed) | — | Its password (re-applied on every deploy) |
| `NODE_ENV` | prod | — | `production` on Render (caches the page bundle) |
| `PORT` | no | 3001 | Render sets it |
| `TRUST_PROXY_HOPS` | prod | 0 | `1` on Render so `req.ip` is the client's IP (login lockout and audit IPs) |
| `DESKTOP_OFFLINE_DAYS` | no | 7 | Days a PC may stay offline before it must connect to save again |
| `ELECTRON_SKIP_BINARY_DOWNLOAD` | Render | — | `1`: skip downloading Electron during `npm ci` on the server |
| `NODE_VERSION` | Render | — | `22` |
| `SYNC_LOG_DAYS` | no | 14 | Days the sync change log is kept (shops with a PC) |
| `AUDIT_RETENTION_DAYS` | no | 365 | Days the activity log is kept |
| `MESSAGE_RETENTION_DAYS` | no | 365 | Days WhatsApp / SMS history is kept |
| `DB_LIMIT_MB` | no | 500 | Database plan size for the storage card (raise it after upgrading Supabase) |
| `HP_NO_SCHEDULER` | no | — | `1` disables the background scheduler (rarely needed) |
| `HP_DEV_PAGES` | no | auto | Rebuild the page bundle on every request (set automatically outside production) |

### 6.2 Desktop (set by `desktop/main.js`, not by hand)

| Variable | Value |
|---|---|
| `MODE` | `desktop` |
| `DATABASE_URL` | `file:%APPDATA%/HisabPro/hisabpro.db?connection_limit=1` |
| `JWT_SECRET` | contents of `%APPDATA%/HisabPro/secret.key` (random per PC) |
| `HP_SERVER_URL` | from `desktop/config.json` → `serverUrl` (pre-fills the activation screen) |
| `DESKTOP_OFFLINE_DAYS` | from `desktop/config.json` → `offlineDays` |
| `PRISMA_QUERY_ENGINE_LIBRARY` | the Windows engine inside `app.asar.unpacked` |

Developer / test switches: `HP_USER_DATA` (data folder), `HP_HIDDEN` (hidden window, no update check), `HP_PORT`,
`HP_SYNC_INTERVAL_MS` (default 5000).

---

## 7. Backend (API server)

### 7.1 Adding an API — the pattern

```js
// src/routes/things.js — picked up automatically
const express = require('express');
const { prisma, withTx } = require('../db');
const { HttpError, need, str, num } = require('../lib/http');
const { authenticate, can } = require('../auth');
const { audit } = require('../audit');
const router = express.Router();
router.use(authenticate);
router.get('/', can('finance.manage'), async (req, res) => {
    res.json(await prisma.thing.findMany({ where: { tenantId: req.user.tenantId, deletedAt: null } }));
});
router.post('/', can('finance.manage'), async (req, res) => {
    const name = need(req.body?.name, 'Name', 80);
    const row = await withTx(req.user.tenantId, tx => tx.thing.create({ data: { tenantId: req.user.tenantId, name } }));
    await audit(req, { action: 'thing.create', summary: `Thing "${name}" added` });
    res.json(row);
});
module.exports = { router, mount: '/api/things' };   // add cloudOnly: true or desktopOnly: true when needed
```

The reference module for a full feature is **inventory**: [src/routes/inventory.js](../src/routes/inventory.js) +
[public/js/pages/inventory.js](../public/js/pages/inventory.js).

### 7.2 Authentication, tokens and access

- **Login** `POST /api/auth/login` → JWT valid **12 hours** (`{ id, tid, role, tv }`). The browser keeps it in
  `localStorage` and sends `Authorization: Bearer …`.
- **5 wrong passwords lock the user for 15 minutes** (same lock on PC activation). Failed logins are audited.
- `tokenVersion` (`tv`) on the user: a password change, a super admin password reset, or the super admin changing the
  user's email / role / permissions / deactivating them increments it, which ends every older token. Signing out only
  forgets the token in that browser.
- `mustChangePassword`: users created with a temporary password must choose their own at first sign-in (web).
- **Open workspace**: the super admin gets a 2-hour token acting as the client's owner (`imp` = admin id); everything they
  do is audited as the admin.
- **Client access period** (`public/js/shared/access.js`): last day of access + grace (3 days monthly, 7 days yearly),
  then **read-only** automatically; a switched-off client is **blocked**. Pakistan calendar days.
- **Plans** (`public/js/shared/plans.js`, enforced in `src/limits.js` when adding):

  | Plan | Users | Desktop PCs | Products | Price (Rs/year, still to be decided) |
  |---|---|---|---|---|
  | Starter | 3 | 1 | 1,000 | 12,000 |
  | Pro | 15 | 5 | 10,000 | 30,000 |
  | Enterprise | unlimited | unlimited | unlimited | 90,000 |
  | No plan | unlimited | unlimited | unlimited | — |

- **Permissions** (`public/js/shared/permissions.js`, shared by server and browser): `sales.create`, `sales.view`,
  `sales.delete`, `inventory.add`, `inventory.edit`, `purchases.manage`, `parties.manage`, `finance.manage`, `hrm.manage`,
  `reports.view`, `settings.manage`. Owners have all. Presets: Manager = all except `settings.manage`; Cashier =
  `sales.create`. Users without inventory/purchase/report rights never receive **cost prices** from the catalog API.

### 7.3 Validation and errors

`src/lib/http.js`: `need(v, label, max)`, `str(v, max)`, `num(v, label, {min,max})`, `bool`, `oneOf`, `date`,
`isEmail`. Throw `new HttpError(400, 'Plain sentence for the shop.')` — messages are shown to users as-is (and
translated to Urdu when a dictionary entry exists). Extra fields (`code`, `readOnly`, `offlineLimit`) pass through.

### 7.4 Money, dates, numbering

- **Money = BigInt paisa** in the database (Rs 1 = 100 paisa). The API sends and receives **plain numbers of paisa**.
  Server helpers `src/lib/money.js`: `B(n)` → BigInt for writes, `N(b)` → number for reads, `paisa(v, label)` validates.
  `public/js/shared/calc.js` holds the shared maths (bill totals, tax, rounding) used by POS and server alike.
- **Quantities** are Float in the product's **base unit**, rounded with `Calc.q3()` (3 decimals). Alternate units carry a
  factor (e.g. carton = 24 pcs). Sub-unit prices keep the exact fraction internally (24 pcs of a Rs 2,800 carton totals
  exactly Rs 2,800).
- **Dates**: instants are stored; "today", days and report ranges use the shop's time zone (default `Asia/Karachi`) via
  `src/lib/dates.js`.
- **Running numbers**: `src/services/numbering.js` → `INV-0001` on the web, `INV-D1-0001` on PC `D1` (each PC counts on
  its own, so offline numbers never collide). Stored in `Counter` (never synced).

### 7.5 Services (the engines)

| Service | Responsibility |
|---|---|
| `stock.js` | Stock = Σ `StockMovement.qty`. `move()` writes movements, `levels()` sums them |
| `ledger.js` | Khata: `post()` ledger entries, `balance()`, `balances()`, `statement()` |
| `treasury.js` | Cash / bank accounts: `post()` account transactions, balances, `accountFor()` |
| `numbering.js` | Document numbers per client (and per PC) |
| `reports.js` | The one profit / stock engine behind dashboard, reports, P&L, product performance, reminders |
| `settings.js` | Per-client settings (company, receipt, numbering, localization, pos, messaging …) merged over defaults |
| `tenant.js` | What a new client starts with (settings, units, colours, sizes, Cash in Hand, expense categories) |
| `khata.js` | Template values, promise status, receiving a customer payment |
| `sms.js` | SMS through the shop's own HTTP gateway (URL/body templates with `{to}`, `{message}`, `{apikey}` …); `LOG` = test mode |
| `scheduler.js` | Every 5 minutes (cloud): queued SMS from PCs, automatic promise reminders; daily maintenance |
| `maintenance.js` | Daily clean-up of housekeeping rows, storage report (see [§11.3](#113-database-size-500-mb-free-plan)) |

### 7.6 Every API endpoint

All paths start with the mount. Auth = signed-in user unless noted; the permission in brackets is checked per route.

| Mount (file) | Endpoints |
|---|---|
| `/api/auth` (auth.js) | `POST /login` · `GET /me` (session, shop, settings, permissions) · `POST /password` · `POST /logout` |
| `/api/admin` (admin.js, **super admin, cloud only**) | `GET /stats` · `GET /storage` · `POST /maintenance` · `GET/POST /clients` · `GET/PUT /clients/:id` · `POST /clients/:id/access` · `GET/POST /clients/:id/users` · `PATCH /clients/:id/users/:uid` · `POST /clients/:id/users/:uid/reset-password` · `GET /clients/:id/devices` · `POST /clients/:id/devices/:did/revoke` · `POST /clients/:id/workspace` · `GET /audit` |
| `/api/pos` (pos.js) | `GET /bootstrap` · `GET/POST /customers` · `GET /customers/:id/last-prices` · `POST /sales` (idempotent by `clientId`) · `GET /sales` · `GET /sales/lookup` · `GET /sales/:id` · `GET/POST /held` · `DELETE /held/:id` · `POST /returns` (idempotent) · `GET /returns` |
| `/api/inventory` (inventory.js) | `GET/POST /master/:kind` · `PUT/DELETE /master/:kind/:id` (categories, brands, units, colors, sizes) · `GET/POST /products` · `GET/PUT/DELETE /products/:id` · `POST /products/:id/adjust` · `GET /products/:id/movements` · `POST /products/import` · `GET /catalog` · `GET /products/:id/serials` |
| `/api/purchases` (purchases.js) | `GET /vendors` · `GET /` · `GET /returns` · `GET /:id` · `POST /` · `POST /:id/pay` · `POST /:id/returns` |
| `/api/parties` (parties.js) | `GET /` · `GET /stats` · `GET /:id` · `POST /` · `PUT /:id` · `DELETE /:id` · `GET /:id/ledger` |
| `/api/khata` (khata.js) | `GET /summary` · `GET /customers/:id` · `POST /receive` · `GET/POST /promises` · `PATCH /promises/:id` · `POST /messages/log` · `POST /messages/sms` [parties.manage or finance.manage] · `GET /messages` · `GET/PUT /messaging` · `POST /messaging/test` |
| `/api/day-close` (dayclose.js) | `GET /preview` · `POST /` · `GET /` |
| `/api/finance` (finance.js) | accounts (`GET/POST /accounts`, `PUT/DELETE /accounts/:id`, `GET /ledger`, `GET /accounts/:id/ledger`, `POST /transfers`) · `GET /parties` · payments (`GET/POST /payments`, `DELETE /payments/:id`) · cheques (`GET/POST /cheques`, `POST /cheques/:id/clear`, `DELETE /cheques/:id`) · expenses (`GET/POST /expense-categories`, `DELETE /expense-categories/:id`, `GET/POST /expenses`, `DELETE /expenses/:id`) · capital (`GET /capital`, `POST /capital/setup`, `POST /capital`, `DELETE /capital/:id`) · taxes (`GET/POST /taxes`, `PUT/DELETE /taxes/:id`) |
| `/api/hrm` (hrm.js) | `GET /meta` · employees (`GET /employees`, `GET /employees/next-code`, `GET/PUT/DELETE /employees/:id`, `POST /employees`, `PUT /employees/:id/documents/:kind`) · shifts · attendance (+ `POST /attendance/bulk-present`) · leaves (+ approve / reject) · payroll (`GET /payroll`, `POST /payroll/generate`, `PUT/DELETE /payroll/:id`, `POST /payroll/:id/pay`, `POST /payroll/pay-all`) · `GET /accounts` · advances · recruitment (`GET /recruitment`, postings, candidates, `PATCH /candidates/:id/stage`, `GET /candidates/:id/resume`) · appraisals · disciplinary · assets (+ return) · `GET /dashboard` |
| `/api/reports` (reports.js) | `GET /dashboard` · `/sales` · `/purchases` · `/inventory` · `/expenses` · `/financial` · `/tax` · `/profit-loss` · `/product-performance` · `/reminders` |
| `/api/settings` (settings.js) | `GET /` · `GET /users` (read-only list + 7-day activity) · `PUT /:key` (company, receipt, numbering, localization, pos) |
| `/api/backup` (backup.js) | `GET /storage` · `GET /download` (full JSON of the client's business data) · `POST /import` (merge only: new ids added, existing rows never overwritten) |
| `/api/onboarding` (onboarding.js) | `GET /` (getting-started checklist state) |
| `/api` (sync.js, **cloud only**, device token) | `GET /desktop/status` (web answer `{isDesktop:false}`) · `POST /device/activate` (owner/manager login → device token) · `POST /sync/push` · `GET /sync/pull` · `GET /sync/snapshot` |
| `/api/desktop` (desktop.js, **desktop only**) | `GET /status` · `POST /activate` · `POST /sync` (sync now) · `POST /server` (change server address) |
| `/js` (pages.js) | `GET /pages.bundle.js` (all `public/js/pages/*.js` concatenated, each in its own scope) |
| — | `GET /healthz` |

### 7.7 Activity log (audit)

`await audit(req, { action, summary })` writes `AuditLog` (who, what, when, IP, device). The table is **append-only**: a
database trigger refuses UPDATE / DELETE / TRUNCATE, except the nightly retention job (which marks its transaction with
`hp.retention = 'on'`). Do not audit every row of a busy table — sales, for example, write no audit row (the sale itself
records who made it).

---

## 8. Data model

[prisma/schema.prisma](../prisma/schema.prisma) is the source of truth (50 models; 51 tables in the database with
Prisma's own `_prisma_migrations`).

### 8.1 Rules that keep sync working (never break them)

1. Every business table has `id` (UUID **made by the app**, on the server or a PC), `tenantId`, `createdAt`,
   `updatedAt`, `deletedAt`.
2. **Never hard-delete** a business row: set `deletedAt`, and filter `deletedAt: null` everywhere.
3. **No unique constraints on business fields** (two offline PCs may both create "SKU-1"); check uniqueness in code,
   case-insensitively with `ci()` from `src/db.js`.
4. **Balances are never stored**: stock = Σ `StockMovement`, khata = Σ `LedgerEntry`, cash/bank = Σ `AccountTxn`. That is
   what lets offline sales from several PCs simply add up.
5. Saved documents are not edited in place: corrections are new records (returns, reversals, voids).
6. Money-moving writes run in **one transaction with the client lock**: `withTx(tenantId, async tx => …)`, and every call
   inside uses `tx` (never the global `prisma` — on SQLite that would deadlock the single connection).
7. Use `prisma` / `tx` from `src/db.js` only. Avoid raw SQL; if unavoidable it must run on Postgres **and** SQLite.
8. `createdAt` / `updatedAt` are set by the app (Prisma extension in `src/db.js`) and **kept as sent** when synced.
9. A new table that should reach PCs must be added to `src/sync/registry.js` **and** get a sync trigger in a migration
   (see [§17.3](#173-adding-a-table)).

### 8.2 Tables by area

| Area | Tables |
|---|---|
| Platform | `Tenant` (client/shop, plan, access period, active), `User` (role, permissions JSON, lockout, tokenVersion), `Device` (desktop PC, token hash, last seen; server only), `ChangeLog` (sync log written by triggers; server only), `Counter` (running numbers and the sync floor; never synced), `AuditLog` (append-only), `Setting` (one row per client and key, JSON value), `Secret` (SMS keys; server only) |
| Inventory | `Category`, `Brand`, `Unit`, `Color`, `Size`, `Product` (variants are child products with `parentId`), `ProductSerial`, `StockMovement` |
| Parties & khata | `Party` (customers and vendors, `type`), `LedgerEntry`, `PaymentPromise`, `MessageLog` |
| Treasury | `Account`, `AccountTxn` |
| Sales | `Sale`, `SaleItem`, `SalePayment`, `HeldSale`, `SaleReturn`, `SaleReturnItem`, `DayClose` |
| Purchases | `Purchase`, `PurchaseItem`, `PurchaseReturn`, `PurchaseReturnItem` |
| Finance | `Payment`, `ExpenseCategory`, `Expense` (with `source`/`refId` for automatic expenses such as salaries), `Cheque`, `CapitalTxn`, `Tax` |
| HRM | `Employee` (documents as data URLs, max 250 KB each), `Shift`, `Attendance`, `LeaveRequest`, `Payslip`, `Advance`, `JobPosting`, `Candidate` (resume), `Appraisal`, `Disciplinary`, `AssetAssignment` |

### 8.3 Migrations

| Migration | Contents |
|---|---|
| `20261121083038_init` | All tables |
| `20261121083053_sync_triggers` | `hp_sync_log()` trigger function (takes the client lock, writes `ChangeLog`) on every synced table; AuditLog append-only triggers |
| `20261121091335_category_image` | Category image |
| `20261121094653_khata_messages_dayclose` | PaymentPromise, MessageLog, DayClose, Secret |
| `20261121094654_sync_triggers_2` | Sync triggers for those tables |
| `20261121095453_expense_source` | Expense `source` / `refId` |
| `20261122182528_storage_limits` | Drops the AuditLog sync trigger; lets the retention job delete old audit rows |

Create one with `npm run db:migrate -- --name what_changed`; hand-written SQL (triggers) goes in a migration created with
`npx prisma migrate dev --create-only --name …`. Render applies pending migrations on every deploy.

---

## 9. Frontend (web app)

### 9.1 How it is built

- **No framework, no bundler.** `public/index.html` loads, in order: vendor libraries, `shared/*` (also used by the
  server), `core/*`, then `/js/pages.bundle.js` (every file in `public/js/pages/` concatenated by `src/routes/pages.js`,
  each wrapped in its own function scope). Everything hangs off the global `HP` namespace.
- **CSP forbids inline scripts**: never put `<script>` or `onclick=` in HTML; bind events in JS.
- Tailwind v4 scans `public/**`; run `npm run build:css` after adding class names.

### 9.2 Core modules (`public/js/core/`)

| File | Role |
|---|---|
| `html.js` | `` html`…${value}…` `` tagged templates that **escape** values; `raw()` for trusted markup only |
| `icons.js` | `icon(name, classes)` inline SVG icons |
| `fmt.js` | `fmt.money(paisa)`, `qty`, `date`, `dateTime`, `pct`, `short` (k / L / Cr) … in the shop's zone and currency |
| `i18n.js`, `i18n-ur.js` | Urdu: `t()` plus a DOM translator (MutationObserver) that translates text nodes using the dictionary; RTL switch |
| `api.js` | `api.get/post/put/patch/del` with the token; errors become `Error(message)` with `.status` |
| `ui.js` | The UI kit (below) |
| `router.js` | `HP.page(path, { title, perm, render })`, `HP.router.navigate()`, `data-link` anchors |
| `shell.js` | Layout: sidebar (`NAV`), top bar, network pill (Live / Syncing / Offline · n waiting), theme, palette |
| `app.js` | Start-up: desktop activation screen, login, forced password change, workspace switching |
| `print.js` | Receipts 80 / 58 mm and A4 templates, barcodes / QR, WhatsApp send |
| `whatsapp.js` | `HP.wa` click-to-send links (Urdu-safe formatting) |
| `palette.js` | Ctrl+K quick search |
| `updates.js` | Windows app updates (Settings → App update, notice to everyone at the PC) |
| `theme-boot.js` | Applies dark mode / palette before first paint |

**UI kit** (`HP.ui`): `pageHeader`, `statCard`, `table`, `empty`, `badge`, `field` (text, number, select, textarea,
checkbox, switch, date, `money: true` shows rupees but `readForm()` returns paisa), `grid`, `section`, `readForm`,
`formDrawer`, `modal`, `drawer`, `confirm({title, message, ok})`, `toast`, `fail`, `menu`, `autocomplete`,
`rangeButton`/`rangePopover`, `seg`, `tabs`, `chart`, `csv` (spreadsheet-formula safe), `print`,
`readImage(file, maxPx, maxBytes, {jpeg})`, `readFile`.

### 9.3 Screens (routes)

| Area | Paths (file) |
|---|---|
| Super admin | `/admin` (dashboard + storage card), `/admin/clients`, `/admin/clients/:id`, `/admin/activity` (admin.js) |
| Dashboard | `/dashboard` (dashboard.js) |
| POS & sales | `/pos` (pos.js), `/sales`, `/sales-return` (sales.js) |
| Purchasing | `/purchases`, `/purchase-return` (purchases.js) |
| Inventory | `/products`, `/categories`, `/brands`, `/inventory/units`, `/inventory/colors`, `/inventory/sizes`, `/inventory/barcodes` (inventory.js) |
| Khata | `/khata`, `/khata/c/:id`, `/khata/reminders`, `/day-close` (khata.js) |
| Parties | `/customers`, `/vendors` (parties.js) |
| Reports | `/reports`, `/reports/profit-loss`, `/reports/product-performance`, `/reminders` (reports.js) |
| HRM | `/hrm/dashboard`, `/hrm/employees`, `/hrm/attendance`, `/hrm/leaves`, `/hrm/payroll`, `/hrm/recruitment`, `/hrm/performance` (hrm.js) |
| Finance | `/payments`, `/finance/capital`, `/banks`, `/cheques`, `/expenses`, `/finance/taxes` (finance.js) |
| Administration | `/users`, `/settings` (tabs: Company Profile, Receipt & POS, Localization, App update on Windows) (settings.js), `/administration/backups` (backups.js) |

### 9.4 Adding a screen — the pattern

```js
// public/js/pages/things.js — bundled automatically
const { html, raw, icon, api, ui, fmt, t } = HP;
HP.page('/things', { title: 'Things', perm: 'finance.manage', async render(el, params, query) {
    const list = await api.get('/api/things');
    ui.mount(el, html`${ui.pageHeader({ title: 'Things', subtitle: '…' })}<div data-list></div>`);
    ui.on(el, 'click', '[data-edit]', (e, btn) => { /* … */ });   // delegated on el (fresh per visit)
}});
```
Add the menu entry in `NAV` in `public/js/core/shell.js`. Use theme tokens (`bg-surface`, `border-line`, `text-muted`,
`text-accent`, `btn-primary` …) so night mode works. Money colours: revenue/cash green, expenses/payable red,
receivable amber.

### 9.5 Urdu

The interface switches between English and اردو (top bar). Text nodes are translated through the dictionary in
`public/js/core/i18n-ur.js` (≈1,946 entries, exact-string keys) plus a few patterns in `i18n.js`. When you add visible
English text, add its Urdu translation to the dictionary (find missing ones with `node scripts/extract-strings.js`).
Server error messages are translated the same way when an entry exists. WhatsApp/SMS templates have separate Urdu and
English versions in settings (`messaging`); every Urdu line starts with an Urdu word or emoji so WhatsApp shows it RTL.

---

## 10. Windows desktop app and sync

### 10.1 What the installed app is

- `desktop/main.js` (Electron main process) sets the environment, then **runs `server.js` inside the app** on
  `127.0.0.1:<free port>` with `MODE=desktop`, and opens a window on it. The web app is identical to the cloud's.
- Data folder: **`%APPDATA%\HisabPro\`** → `hisabpro.db` (SQLite: all the shop's data + outbox), `secret.key`.
  Menu **HisabPro → Open data folder** opens it. Uninstalling or updating never deletes it.
- On start `ensureSchema()` runs `desktop/schema.sql` (generated) and **adds any missing columns** — that is how a newer app
  upgrades an older PC database.
- Silent receipt printing (Settings → Receipt & POS → Auto-Print on Save) goes through IPC `print-silent`.
- `window.hpDesktop` (preload) exposes `printSilent`, `info`, `updates.{state,check,download,install,onChange}`.

### 10.2 Activation (once per PC, online)

1. First start shows **Set up this PC**: server address (pre-filled from `desktop/config.json`), owner or manager email and
   password, PC name.
2. The PC calls `POST /api/device/activate`. The cloud checks the password (same lockout as login), the role (owner or
   manager; a cashier only if given `settings.manage`), the client's access and the plan's PC limit, then creates a `Device` (`code` D1, D2 …) and
   returns a **device token** (stored hashed in the cloud, plain in the PC's `_device` table).
3. The PC downloads the shop (see resync below) and shows the normal login. Users sign in on the PC with their usual
   HisabPro email and password (their accounts were downloaded); a cashier can then sell.

### 10.3 Sync protocol

Which tables move where is defined once in [src/sync/registry.js](../src/sync/registry.js):

| Direction | Tables |
|---|---|
| Both ways | Setting, Category, Brand, Unit, Color, Size, Product, ProductSerial, StockMovement, Party, LedgerEntry, Account, AccountTxn, Sale, SaleItem, SalePayment, HeldSale, SaleReturn, SaleReturnItem, Purchase, PurchaseItem, PurchaseReturn, PurchaseReturnItem, Payment, ExpenseCategory, Expense, Cheque, CapitalTxn, Tax, Employee, Shift, Attendance, LeaveRequest, Payslip, Advance, JobPosting, Candidate, Appraisal, Disciplinary, AssetAssignment, PaymentPromise, MessageLog, DayClose |
| Cloud → PC only | Tenant, User |
| PC → cloud only | AuditLog |
| Never | Device, ChangeLog, Counter, Secret |

**On the PC** (`src/sync/client.js`, every 5 s while online):

1. **Outbox**: SQLite triggers (generated by `scripts/gen-sqlite.js`) write `(tbl, rowId)` into `_outbox` on every local
   insert/update — except while cloud rows are being applied (`_flags.applying = '1'`).
2. **Push** `POST /api/sync/push` with the current rows (≤ 2 MB per request, ≤ 2000 rows). Header `X-Device-Token`.
3. **Pull** `GET /api/sync/pull?cursor=N` and apply rows. A pulled row that still has a local change waiting is skipped
   when the local one is newer (it will go up and win), otherwise the cloud's row replaces it.
4. Status for the top-bar pill: online, pending count, last sync, clock skew, problems, `lastResyncAt`.

**In the cloud** (`src/routes/sync.js`):

- **Push**: `tenantId` is forced to the device's client; child rows are accepted only under a parent document of the same
  client; **last write wins by `updatedAt`**; AuditLog rows are insert-only. The whole batch is one transaction; if the
  database refuses one row, the batch is retried row by row and bad rows are returned as `rejected` (the PC drops them
  from its outbox and lists them as **sync problems**). `set_config('hp.device', …)` tags the change-log entries so the
  PC does not pull its own changes back.
- **ChangeLog**: the `hp_sync_log()` trigger on every synced table inserts `(seq, tenantId, tbl, rowId, deviceId)`. It
  takes the client's advisory lock, so per client the `seq` order equals the commit order (a cursor never skips a change
  that commits late).
- **Pull**: entries with `seq > cursor` (≤ 1000), newest per row, minus the PC's own, minus tables PCs never receive →
  the current rows. Response includes `cursor`, `more`, `access` (subscription), `serverTime` (clock check).
- **Floor and resync**: the daily clean-up deletes change-log entries older than 14 days (all of them for shops without a
  PC) and remembers the newest deleted `seq` per client as the **floor** (`Counter` id `<tenantId>:syncFloor`). A pull
  whose cursor is below the floor answers `{ resync: true, resyncCursor, tables }` (with `rows: []` and the old cursor, so
  an older app waits instead of skipping data). The PC then downloads every table page by page from
  `GET /api/sync/snapshot?tbl=…&after=<id>` (100 rows per page for tables with images, 20 for employees/candidates,
  1000 otherwise) and continues from `resyncCursor`. New PCs and PCs that were away longer than 14 days take this path.

### 10.4 Safety rules on the PC

- **Offline limit**: if a PC has not synced for `offlineDays` (7), writes are refused until it connects (it must stay in
  step and re-check the subscription). Reading still works.
- **Revoked** PC (super admin → client → Desktop PCs → Revoke): its next contact marks it revoked; it refuses writes.
- **Clock check**: the pill warns when the PC clock differs from the server's (wrong clocks mis-date sales and win
  conflicts they should not).
- **Read-only / blocked** client: PCs follow the same access mode as the web.

### 10.5 App updates

- `electron-updater` with the **GitHub provider** (`package.json` → `build.publish`: owner `hisabpro18-del`, repo
  `hisabpro`, `releaseType: release`). The build embeds `app-update.yml`; each release carries `latest.yml`, the installer
  and its `.blockmap`.
- The app checks quietly **20 s after start and every 6 hours**; it never downloads by itself. **Settings → App update**:
  *Check for updates* → *Download update* (progress bar; selling continues) → *Restart & install* (silent installer,
  restarts HisabPro). A downloaded update also installs the next time the app is closed.
- Everyone at the PC sees a one-time notice per new version; only users with Settings access see the tab.
- Installers are **not code-signed** yet: first install shows SmartScreen (*More info → Run anyway*). Updates downloaded by
  the app do not trigger SmartScreen.

---

## 11. Background jobs, SMS / WhatsApp and database size

### 11.1 Scheduler (cloud, every 5 minutes)

1. Sends SMS that desktop PCs queued (PCs cannot reach SMS gateways themselves) once those rows have synced up.
2. Automatic **promise reminders**: for shops with SMS and automatic reminders switched on, after the shop's chosen hour,
   for promises due today (or N days before), at most once a day per promise, only if the customer still owes.
3. Once a day: database maintenance.

Every message is **claimed by a conditional update** before sending, so two server instances never send twice.

### 11.2 WhatsApp and SMS

- **WhatsApp** is click-to-send (`wa.me` link with the filled template) — free, works from any device; each click is
  logged in `MessageLog`.
- **SMS** goes through the **shop's own HTTP SMS gateway** (any Pakistani provider): URL and optional body templates with
  placeholders `{to}` (923001234567), `{to0}` (03001234567), `{message}`, `{sender}`, `{apikey}`, `{secret}`; success text
  to detect a good reply. Provider `LOG` = test mode (nothing is sent). Keys live in `Secret` (server only).
- Templates (Urdu and English): promise reminder, balance reminder, payment thanks, bill — with `{name}`, `{shop}`,
  `{amount}`, `{balance}`, `{when}`, `{phone}`, `{number}`, `{total}`, `{paid}`, `{due}`.
- Sending SMS needs `parties.manage` or `finance.manage`; cashiers can still use WhatsApp.

### 11.3 Database size (500 MB free plan)

Supabase's free plan allows **500 MB**; when full, saving stops. Protections:

| Mechanism | Detail |
|---|---|
| Daily clean-up (`src/services/maintenance.js`) | Sync change log after 14 days (immediately for shops without a PC) · activity log after 365 days · WhatsApp/SMS history after 365 days (queued messages kept) · removed held carts after 30 days. **Shop records (sales, stock, khata, purchases, HR …) are never removed.** |
| Size caps | Product photo ≈ 60 KB (the app saves a 320 px JPEG, server limit 90,000 chars) · logo 150 KB · HR documents / resume 250 KB each · held cart 60 KB |
| No noisy logs | Sales write no activity-log row; the activity log has no sync trigger |
| Storage card | Super admin dashboard: size vs limit, biggest tables, **Clean up now**; amber at 70 %, red at 85 % |

Rough growth: a very busy shop (≈200 bills/day) adds about 0.5–1 MB of real records per day. Plan the upgrade to
Supabase **Pro** (8 GB) before the card turns red; then set `DB_LIMIT_MB=8192` on Render.

---

## 12. Testing

- `npm test` runs every `test/*.test.js` **one file at a time** against the **local Postgres** (it must be running:
  `npm run db:local`). 175 tests, ≈ 1–2 minutes.
- `test/helpers.js` starts the app in-process on a free port and `setup()` creates a **fresh client with its owner** through
  the super admin API (`h.get/post/put/patch/del`, `h.user('CASHIER')` adds a user and returns their token).
- `test/pc.js` starts a **real desktop-mode server as a child process** with its own SQLite file (`startPC`, `pcCall`,
  `waitFor`); `sync.test.js` and `maintenance.test.js` test activation, offline selling, both-way sync, revoke and resync.
- Suites: `inventory`, `pos`, `khata`, `sync`, `desktop-modules`, `followups`, `review-core`, `purchases`, `parties`,
  `finance`, `hrm`, `reports`, `settings`, `backup`, `maintenance`.
- Write a test with every change; for sync-related changes, a desktop child-process test. Timing in desktop tests: wait
  for states with `waitFor`, never fixed sleeps.

```js
const { setup } = require('./helpers');
test('things', async () => {
    const h = await setup();
    const r = await h.post('/api/things', { name: 'A' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
});
```

---

## 13. Deployment (Render + Supabase)

### 13.1 Normal deploy

1. Merge / push to `main`.
2. Render builds automatically: `npm ci --include=dev` → `npm run build` (CSS, vendor, Prisma client) →
   `npm run db:deploy` (pending migrations) → `npm run seed` (super admin) → starts `npm start`.
3. Watch Render → hisabpro → **Events / Logs**. Check `https://hisabpro-2r1x.onrender.com/healthz`.

Migrations run **before** the new code starts, so they must be compatible with the code still running for a minute
(and with desktop PCs that update later): add columns/tables freely; never rename or drop something old code or old PCs
still use.

### 13.2 Supabase database

- Project `wprrcbvrxeuvfptgwvkp`, Singapore. Dashboard → **Connect** → *ORMs*:
  - `DATABASE_URL` = Transaction pooler, port **6543**, add **`?pgbouncer=true`**.
  - `DIRECT_URL` = Session pooler, port **5432**.
- Password in URLs must be **percent-encoded**: `#` → `%23`, `$` → `%24`, `%` → `%25`, `@` → `%40`, `&` → `%26`.
- Run migrations from your machine (rarely needed — Render does it):
  ```bash
  set -a; . ./render.env; set +a      # a local, git-ignored file with DATABASE_URL and DIRECT_URL
  npx prisma migrate status && npx prisma migrate deploy
  ```
- Free-plan notes: 500 MB limit; a project pauses after a week without activity (an always-on Render service prevents
  that); no point-in-time recovery — take your own backups ([§15.9](#159-back-up-and-restore-the-whole-database)).

### 13.3 Render web service

- Created from the blueprint ([render.yaml](../render.yaml)): Dashboard → **New → Blueprint** → this repo.
- Environment (Render → hisabpro → Environment): `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `SUPER_ADMIN_EMAIL`,
  `SUPER_ADMIN_PASSWORD`, `NODE_ENV=production`, `TRUST_PROXY_HOPS=1`, `ELECTRON_SKIP_BINARY_DOWNLOAD=1`,
  `NODE_VERSION=22`, `DESKTOP_OFFLINE_DAYS=7` (optional retention variables, [§6.1](#61-cloud-render--local-env)).
- Manual redeploy: **Manual Deploy → Deploy latest commit**; roll back: **Events → pick an earlier deploy → Rollback**.

### 13.4 Custom domain (not done yet)

1. Render → hisabpro → Settings → **Custom Domains** → add e.g. `app.hisabpro.com` (and/or apex).
2. In Vercel → team hisabpro → **Domains** (where the DNS is managed) add the CNAME / A records Render shows.
3. Wait for Render's certificate, then put the new address in `desktop/config.json` and release an app update (new PCs
   are offered it). PCs already activated keep the address they were set up with — **keep the onrender.com address
   working** (it stays valid as long as the Render service exists). There is no screen yet to change a PC's address;
   the local API `POST /api/desktop/server` does it (a small Settings field would be a good addition).

---

## 14. Releasing a new Windows app version

Installed PCs only update to a **higher** version than they have.

```bash
# 1. raise "version" in package.json (e.g. 1.0.0 → 1.0.1) and commit
npm run build && npm run build:sqlite
unset ELECTRON_RUN_AS_NODE
npx electron-builder --win nsis --x64 --publish never
#    → dist-desktop/HisabPro Setup 1.0.1.exe, .exe.blockmap, latest.yml

# 2. latest.yml names the installer with dashes — upload copies with exactly those names
mkdir -p /tmp/rel && cp "dist-desktop/HisabPro Setup 1.0.1.exe" /tmp/rel/HisabPro-Setup-1.0.1.exe \
  && cp "dist-desktop/HisabPro Setup 1.0.1.exe.blockmap" /tmp/rel/HisabPro-Setup-1.0.1.exe.blockmap \
  && cp dist-desktop/latest.yml /tmp/rel/

# 3. publish the GitHub release (gh signed in with an account that can write to the repo)
gh release create v1.0.1 --repo hisabpro18-del/hisabpro --target main --title "HisabPro 1.0.1" \
  --notes "What changed, in plain words for shops" \
  /tmp/rel/HisabPro-Setup-1.0.1.exe /tmp/rel/HisabPro-Setup-1.0.1.exe.blockmap /tmp/rel/latest.yml
```

Alternative: `GH_TOKEN=… npm run desktop:release` builds and publishes in one step with a GitHub token.

Checks after releasing: `https://github.com/hisabpro18-del/hisabpro/releases/download/v1.0.1/latest.yml` shows the new
version; on a PC, **Settings → App update → Check for updates** offers it. Notes in the release body are shown in the app.

**Never** publish a release whose desktop code is incompatible with the live server, and never change the sync protocol in
a way that breaks older installed versions — not every shop updates the same day.

---

## 15. Operations runbooks

### 15.1 Onboard a new shop

1. Sign in as super admin → **Clients → New client**: business (shop) name as it should appear on bills, mobile, owner
   name, owner email (login), temporary password, plan, access period.
2. Open the client → **Users → Add New User** for each staff member (role + permission ticks). Owners cannot do this
   themselves.
3. Give the owner the web address and temporary password; they choose their own at first sign-in, then fill
   **Settings → Company Profile** (name, phone, address, logo) and **Receipt & POS**.
4. For offline selling: send the latest installer link; on the shop PC, install → activate with the owner's login → done.
   The PC appears under the client's **Desktop PCs**.

### 15.2 Add or change a staff user
Super admin → Clients → the client → Users → **Add New User** / **Edit** (role, permissions, active). Desktop PCs receive the change
at their next sync.

### 15.3 Reset a password or unlock a user
Super admin → client → Users → **Reset password** (gives a temporary password; the user must change it). A lock after 5
wrong passwords clears itself after 15 minutes, or immediately with a reset.

### 15.4 Extend, change or end a subscription
Super admin → client → **Access period**: **Renew** adds the period after the current last day; **Start from today**
replaces it. The **Plan** and **Client is active** are in the client's details (**Edit**). After the last day + grace the
client is read-only automatically. Unticking **Client is active** blocks it at once (PCs too).

### 15.5 Revoke a lost or sold PC
Super admin → client → **Desktop PCs → Revoke**. The PC stops working at its next contact. A revoked PC can be set up
again only by re-installing / clearing its data folder and activating.

### 15.6 A shop's PC is not syncing
Ask what the top-bar pill says:
- **Offline · n waiting** → no internet, or the server address is wrong (desktop status shows the error).
- **Clock** warning → fix the Windows date/time (set automatic).
- **Sync problems** → rows the cloud refused; see the PC's status details; usually a data error, fix and re-enter.
- **Revoked** → see 15.5. **Offline more than 7 days** → connect to the internet; it syncs and unlocks.
Cloud side: super admin → client → Desktop PCs shows *last seen / last push / last pull* and app version.

### 15.7 Check or free database space
Super admin dashboard → **Database storage**. Press **Clean up now** for an immediate clean-up. If still high, see the
biggest tables (usually product photos or HR documents) and plan the Supabase upgrade.

### 15.8 Change a secret
See [§2.4](#24-where-every-secret-lives). After changing anything on Render, it redeploys automatically.

### 15.9 Back up and restore the whole database
Per shop: **Administration → Database Backups → Download** (JSON; import is merge-only). Whole platform (recommended
weekly, keep copies off-site):
```bash
set -a; . ./render.env; set +a
pg_dump "$DIRECT_URL" --no-owner --format=custom --file=hisabpro-$(date +%F).dump
# restore into an EMPTY database:
pg_restore --no-owner --dbname="$TARGET_URL" hisabpro-YYYY-MM-DD.dump
```
(Use a `pg_dump` at least as new as the Supabase Postgres version — see Supabase → Project Settings → Infrastructure.)
Supabase free plan has no point-in-time recovery.

### 15.10 Deploy went wrong
Render → Events → **Rollback** to the previous deploy. If a migration ran, it stays applied: write a new forward
migration rather than editing an applied one.

---

## 16. Troubleshooting

| Symptom | Cause → fix |
|---|---|
| Web login returns **500** | `JWT_SECRET` missing on Render → set it, redeploy |
| Login says wrong password but it is right | Locked after 5 attempts (15 min) or client switched off / blocked → super admin |
| Render build fails at `db:deploy` | Wrong `DIRECT_URL` (must be session pooler 5432) or un-encoded special characters in the password |
| `prepared statement … already exists` errors | `DATABASE_URL` lacks `?pgbouncer=true` on the 6543 pooler |
| Seed fails "belongs to a shop user" | `SUPER_ADMIN_EMAIL` is a shop login → use a different email |
| Storage card amber/red | [§11.3](#113-database-size-500-mb-free-plan), [§15.7](#157-check-or-free-database-space) |
| Electron does not start on the Mac (`ELECTRON_RUN_AS_NODE`) | `unset ELECTRON_RUN_AS_NODE` before `npm run desktop` / electron-builder |
| Installed app: "HisabPro could not start" | Usually a damaged data folder or missing engine → reinstall; data folder is kept. Check the shown error |
| "Windows protected your PC" | Not code-signed → More info → Run anyway (or buy a code-signing certificate, [§18](#18-known-gaps-and-roadmap)) |
| App update: "Could not reach the update server" | No internet, GitHub blocked by the network, or the release lacks `latest.yml` / names differ from `latest.yml` |
| PC shows old data after a long absence | It resyncs automatically (status `lastResyncAt`); wait for "Live / Online" |
| Urdu text shows in English | Missing dictionary entry in `public/js/core/i18n-ur.js` |
| New CSS classes have no effect | `npm run build:css` |
| Tests fail with connection errors | Local Postgres not running → `npm run db:local` |

---

## 17. Making changes safely (checklists)

### 17.1 A new API or screen
- [ ] Route in `src/routes/` with `authenticate` + `can(...)`; every query scoped by `tenantId` and `deletedAt: null`.
- [ ] Writes that move money/stock inside `withTx`, using `tx` throughout.
- [ ] `audit()` for important actions (not for every row of busy tables).
- [ ] Screen in `public/js/pages/`, menu entry in `shell.js` `NAV`, permission on both server and menu.
- [ ] Urdu strings added; `npm run build:css`; check night mode and phone width.
- [ ] Tests; `npm test` green.

### 17.2 Changing a table
- [ ] Edit `prisma/schema.prisma` → `npm run db:migrate -- --name …` → `npm run build:sqlite`.
- [ ] Only **add** columns (with defaults) — old desktop apps and the running server must keep working.
- [ ] Remember `ensureSchema` on PCs adds new columns automatically after the app update.

### 17.3 Adding a table
- [ ] Model with `id` (String UUID default), `tenantId`, `createdAt`, `updatedAt`, `deletedAt`, `@@index([tenantId])`.
- [ ] Should PCs have it? Add it to `BOTH` / `PULL_ONLY` / `PUSH_ONLY` in `src/sync/registry.js` and add
      `CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "NewTable" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();`
      in a migration. Server-only? Add it to `SERVER_ONLY` in `scripts/gen-sqlite.js`.
- [ ] Will it grow fast? Decide its retention in `src/services/maintenance.js`.
- [ ] Include it in backups if it is business data (backup uses the `BOTH` list).

### 17.4 Sync or desktop changes
- [ ] Old installed apps must keep working against the new server (add fields; never repurpose).
- [ ] Desktop child-process tests (`test/pc.js`) pass.
- [ ] Release a new app version ([§14](#14-releasing-a-new-windows-app-version)).

### 17.5 Money or stock maths
- [ ] Paisa BigInt in the DB, numbers of paisa in the API, `Calc` for shared maths; quantities via `Calc.q3`.
- [ ] Never store a balance; post movements / ledger entries / account transactions.

---

## 18. Known gaps and roadmap

| Item | Status / next step |
|---|---|
| Custom domain | Not set up — [§13.4](#134-custom-domain-not-done-yet) |
| Code-signing certificate | Not bought — SmartScreen warns on first install. With a certificate set `win.signAndEditExecutable` and signing options in `package.json` |
| Windows installer on real PCs | Built and published (v1.0.0); first real-shop installs in progress — collect feedback |
| App update end-to-end on Windows | Implemented and the feed verified; first real update will be the next release — test it on one PC first |
| Plan prices | Placeholders in `public/js/shared/plans.js` — owner to decide |
| Database growth | Free plan 500 MB — upgrade to Supabase Pro when the storage card warns |
| Backups | Manual `pg_dump` (no automation yet) — consider a scheduled job (e.g. GitHub Action with a secret) |
| FBR POS integration | Not built |
| Multiple branches per client | Not built |
| Shop-side user management | Deliberately not allowed (super admin only) |
| Super admin 2FA | Not built — use a strong unique password |

---

## 19. History and decisions

| Date | Event / decision |
|---|---|
| 2026-11-21 | Plan: same stack and hosting as `digital-invoice`; one super admin creates clients and **all** users; same screens and flows as KhataPOS under the HisabPro name; Windows desktop app with offline mode; each shop sees its own name on app and bills |
| 2026-11-21 | Built all phases: foundation, selling, desktop + sync, buying & money, insight, HRM, khata recovery (promises, WhatsApp, SMS, Urdu/English templates, day close), wholesale/karyana features, full Urdu interface. Three independent code reviews, 54 bugs fixed |
| 2026-11-22 | Code on GitHub (`hisabpro18-del/hisabpro`); Supabase project in Singapore; Render service live; production super admin and the first client (Minha Traders: owner + cashier) created |
| 2026-11-22 | Stay on the free 500 MB database: daily clean-up of housekeeping rows, PC resync from a fresh copy, size caps, storage card |
| 2026-11-22 | Windows app updates itself from GitHub releases (Settings → App update); v1.0.0 released |

The original plan with the phase table is in [PLAN.md](../PLAN.md); short coding rules in [docs/DEV.md](DEV.md).

---

## 20. Glossary

| Term | Meaning |
|---|---|
| Client / tenant / shop | One business on HisabPro (`Tenant`); all its data carries its `tenantId` |
| Super admin | HisabPro's platform administrator (one account) |
| Khata (کھاتہ) | A party's running account / ledger |
| Udhaar (ادھار) | Credit: goods now, payment later |
| Wada (وعدہ) | A customer's promise to pay an amount by a date (`PaymentPromise`) |
| Karyana | Grocery / general store |
| Paisa | 1/100 rupee; all money is stored in paisa |
| Day Close | End-of-day cash count vs expected (Z-report) |
| PC code | `D1`, `D2` … per activated desktop PC; part of its invoice numbers (`INV-D1-0001`) |
| Outbox | Local table of changed rows waiting to be pushed |
| ChangeLog / cursor | Cloud log of changes; a PC's cursor is the last log number it applied |
| Floor / resync | Oldest still-available log position; a PC below it downloads a fresh copy |
| Open workspace | Super admin acting inside a client as its owner (2 hours, audited) |
| Read-only mode | Client past its access period + grace: can view, cannot save |
