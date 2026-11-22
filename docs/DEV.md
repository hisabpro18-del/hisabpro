# HisabPro — developer guide

Read this before adding a screen or an API. The reference pattern for a whole module is **inventory**:
[src/routes/inventory.js](../src/routes/inventory.js) (API) and [public/js/pages/inventory.js](../public/js/pages/inventory.js) (screens).
The spec every screen copies is [reference/REFERENCE.md](../reference/REFERENCE.md) (layout, labels, fields).

## Run it

```bash
npm run db:local        # Postgres in Docker on localhost:54330
npm run db:deploy       # migrations
npm run seed            # the super admin from .env
npm run build           # CSS + vendor libraries + Prisma client
npm run dev             # http://localhost:3001  (super admin: admin@hisabpro.local / Admin@12345 in .env)
npm test                # node:test, against the local database (each test file makes its own client)
```
After editing any class names in `public/**`, run `npm run build:css` (Tailwind scans `public/`).

## Rules that keep the desktop sync working (do not break)

- Every business table has `id` (UUID made by the app), `tenantId`, `createdAt`, `updatedAt`, `deletedAt`.
  **Never hard-delete** a business row: set `deletedAt`. Always filter `deletedAt: null`.
- **No unique constraints on business fields.** Check uniqueness in code (case-insensitive with `ci()` from `src/db.js`).
- **Money is BigInt paisa** in the database. The API sends and receives **plain numbers of paisa**.
  Server: `B(n)` → BigInt for writes, `N(b)` → number for reads, `paisa(v, label)` to validate input (`src/lib/money.js`).
  Browser: inputs marked `money: true` in `ui.field()` show rupees and `ui.readForm()` returns paisa; `fmt.money(paisa)` displays.
- **Quantities are Float in the product's base unit**, rounded with `Calc.q3()`.
- **Stock, khata balances and cash/bank balances are never stored.** They are sums:
  - stock = Σ `StockMovement.qty` → `src/services/stock.js` (`move()`, `levels()`)
  - party balance = Σ `LedgerEntry` → `src/services/ledger.js` (`post()`, `balances()`, `statement()`)
    Customer balance = Σ(debit − credit) = they owe us. Vendor balance = Σ(credit − debit) = we owe them.
  - account balance = Σ `AccountTxn.amount` (+ in / − out) → `src/services/treasury.js` (`post()`, `balances()`, `accountFor()`)
- A document that moves money/stock (sale, purchase, payment, expense…) is written **in one transaction with the
  client lock**: `withTx(tenantId, async tx => { … })` from `src/db.js`. Inside it, pass `tx` to every service call.
- Saved documents are not edited in place: corrections are new records (returns, reversals, voids with `deletedAt` +
  reversing entries). Running numbers come from `src/services/numbering.js` → `number(tx, tenantId, key, prefix)`
  (it adds the desktop PC code automatically, e.g. `INV-D1-0001`).
- Use `prisma` / `tx` from `src/db.js` only (never `new PrismaClient()`), so the same code runs on SQLite (desktop).
  Avoid raw SQL; if you must, it has to work on Postgres **and** SQLite. Case-insensitive search: `ci(q)`.
- Dates: store instants (`DateTime`); days and ranges in the shop's zone via `src/lib/dates.js` (`range()`, `ymd()`).

## API pattern (src/routes/*.js — loaded automatically)

```js
const router = express.Router();
router.use(authenticate);                      // sets req.user {id, tenantId, role, permissions}, req.tenant
router.get('/things', can('finance.manage'), async (req, res) => { … res.json(list) });   // Express 5: throw freely
module.exports = { router, mount: '/api/things' };   // cloudOnly / desktopOnly: true when needed
```
- Validate input with `src/lib/http.js` (`need`, `str`, `num`, `bool`, `oneOf`, `date`) and throw `new HttpError(400, 'Plain message.')`.
- Scope **every** query by `tenantId: req.user.tenantId`. Look rows up with `findFirst({ where: { id, tenantId, deletedAt: null } })`.
- Log important actions: `await audit(req, { action: 'module.thing_create', summary: 'Plain sentence' })`.
- Permission keys: `public/js/shared/permissions.js` (sales.create, sales.view, sales.delete, inventory.add, inventory.edit,
  purchases.manage, parties.manage, finance.manage, hrm.manage, reports.view, settings.manage). Owners have all.

## Screen pattern (public/js/pages/*.js — bundled automatically, each file wrapped in its own scope)

```js
const { html, raw, icon, api, ui, fmt, t } = HP;
HP.page('/things', { title: 'Things', perm: 'finance.manage', async render(el, params, query) {
    ui.mount(el, html`${ui.pageHeader({ title, subtitle, actions })} <div data-list></div>`);
    ui.on(el, 'click', '[data-edit]', (e, btn) => …);     // delegated events on el (el is fresh per page visit)
}});
```
- Templates: `html\`…${value}…\`` escapes values; nest `html` freely; `raw()` only for trusted markup.
- Kit (`public/js/core/ui.js`): `pageHeader`, `statCard`, `table`, `empty`, `badge`, `field` (types: text, number,
  select, textarea, checkbox, switch, date, money), `grid`, `section`, `readForm`, `formDrawer` (right drawer with Cancel/Save),
  `modal`, `drawer`, `confirm`, `toast`, `fail`, `menu` (kebab), `autocomplete`, `rangeButton`/`rangePopover` (date range),
  `seg`, `tabs`, `chart` (Chart.js, `ui.PALETTE`), `csv`, `print`, `readImage`, `readFile`.
- Colours: use the theme tokens (`bg-surface`, `bg-surface-2`, `border-line`, `text-muted`, `text-good`, `text-bad`,
  `text-warn`, `bg-accent-soft`, `text-accent`, `btn-primary` …) so night mode works. Component classes are in `styles/app.css`.
- Money colours follow the reference: revenue/cash green, expenses/payable red, receivable amber, negative profit red.
- Wrap visible English text in `t()` where it is a menu/common word; Urdu falls back to English.

## Database size (Supabase free plan: 500 MB)

The super admin dashboard shows the size, the biggest tables and a **Clean up now** button. `src/services/maintenance.js`
runs daily from the scheduler and only removes housekeeping rows — never shop records:

| What | Kept | Setting |
|---|---|---|
| Sync change log (what PCs pull) | 14 days; none for shops without a PC | `SYNC_LOG_DAYS` |
| Activity log | 365 days (the append-only trigger allows deletes only with `hp.retention = 'on'`) | `AUDIT_RETENTION_DAYS` |
| WhatsApp / SMS history | 365 days (queued messages are never removed) | `MESSAGE_RETENTION_DAYS` |
| Removed held carts | 30 days | — |

When change-log entries a PC still needs were cleaned away, its pull answers `{ resync: true }` and the PC downloads a
fresh copy table by table (`GET /api/sync/snapshot`), then continues from the cursor it was given. Size caps: product
photo ≈ 60 KB (the app saves a 320 px JPEG), logo 150 KB, HR files 250 KB, held cart 60 KB. Sales write no activity-log
row (the sale records who made it). Do not log every row of a busy table in the activity log.

## Windows app: build, release, update

- `desktop/config.json` → `serverUrl` is the address new PCs are offered at activation (the live server).
- `npm run desktop:build` makes `dist-desktop/HisabPro Setup <version>.exe` (built on a Mac; not code-signed).
- **Releasing an update** (installed PCs get it from Settings → App update):
  1. raise `"version"` in `package.json` (e.g. 1.0.0 → 1.0.1) — a PC only updates to a higher version;
  2. `GH_TOKEN=$(gh auth token) npm run desktop:release` — builds and publishes a GitHub release on
     `hisabpro18-del/hisabpro` with the installer, `latest.yml` and the `.blockmap` (all three are needed);
  3. PCs see it within 6 hours or at once with **Check for updates**; downloading and installing need one click each.
- The shop's data (`%APPDATA%\HisabPro\hisabpro.db`) is never touched by an update; a newer app adds new database
  columns itself when it starts (`ensureSchema` in `src/sync/client.js`). Changing the sync protocol? Keep old PCs working.

## Tests

`test/helpers.js` starts the app on a free port and makes a fresh client (owner token) per test file:
```js
const { setup } = require('./helpers');
test('…', async () => { const h = await setup(); const r = await h.post('/api/things', {…}); assert.equal(r.status, 200); });
```
