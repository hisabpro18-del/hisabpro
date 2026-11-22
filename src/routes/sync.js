// Cloud side of the desktop sync: activate a PC, then the PC pushes its changes and pulls everyone else's.
//   POST /api/device/activate   owner / manager signs in once → a device token for this PC
//   POST /api/sync/push         rows the PC changed (last change wins, by updatedAt)
//   GET  /api/sync/pull         rows changed since the PC's cursor (from ChangeLog, minus the PC's own pushes)
//                               { resync: true, resyncCursor } when old entries the PC still needs were cleaned away
//   GET  /api/sync/snapshot     a fresh copy of one table of the shop, page by page (for a resync)
//   GET  /api/desktop/status    on the web: { isDesktop: false } (the desktop app answers this itself)
const express = require('express');
const crypto = require('crypto');
const { prisma, Prisma, withTx } = require('../db');
const { HttpError, str } = require('../lib/http');
const { audit } = require('../audit');
const limits = require('../limits');
const Perms = require('../../public/js/shared/permissions');
const Access = require('../../public/js/shared/access');
const { PULLABLE, PUSHABLE, delegate } = require('../sync/registry');
const { toData, upsertRow } = require('../sync/apply');
const { checkPassword } = require('./auth');
const { syncFloor } = require('../services/maintenance');

const router = express.Router();
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
// child tables and their parent document (SaleItem → Sale, SaleReturnItem → SaleReturn …), from the schema's relations
const PARENTS = Object.fromEntries(Prisma.dmmf.datamodel.models.filter(m => PUSHABLE.has(m.name))
    .map(m => [m.name, m.fields.filter(f => f.kind === 'object' && f.relationFromFields && f.relationFromFields.length).map(f => ({ fk: f.relationFromFields[0], model: f.type }))])
    .filter(([, list]) => list.length));

router.get('/desktop/status', (req, res) => res.json({ isDesktop: false }));

router.post('/device/activate', async (req, res) => {
    const email = str(req.body?.email, 200).toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    // same lock-out as signing in: this door must not allow guessing passwords without limit
    await checkPassword(user, String(req.body?.password || ''), req, email);
    if (!user.active) throw new HttpError(401, 'Wrong email or password.');
    if (!user.tenantId) throw new HttpError(400, 'Use the shop owner\'s or a manager\'s account (not the administrator).');
    const perms = user.role === 'OWNER' ? Perms.ALL : Perms.parse(user.permissions);
    if (user.role === 'CASHIER' && !perms.includes('settings.manage')) throw new HttpError(403, 'Only the shop owner or a manager can set up a PC.');
    const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
    const mode = Access.mode(tenant);
    if (mode.mode === 'BLOCKED') throw new HttpError(403, mode.message);
    if (user.failedLogins || user.lockedUntil) await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    const token = crypto.randomBytes(32).toString('hex');
    // under the client lock: two PCs set up at the same moment must not both get the same code (their invoice numbers would clash)
    const device = await withTx(tenant.id, async tx => {
        await limits.assertRoom(tenant.id, 'devices', 1, tx);
        const n = await tx.device.count({ where: { tenantId: tenant.id } });
        return tx.device.create({ data: { tenantId: tenant.id, name: str(req.body?.name, 60) || `PC ${n + 1}`, code: `D${n + 1}`, tokenHash: sha(token), activatedBy: user.email, appVersion: str(req.body?.appVersion, 30) } });
    });
    await audit({ ip: req.ip, user: { id: user.id, email: user.email, tenantId: tenant.id } }, { tenantId: tenant.id, action: 'device.activate', summary: `Desktop PC "${device.name}" (${device.code}) activated by ${user.email}` });
    res.json({ deviceToken: token, device: { id: device.id, code: device.code, name: device.name }, tenant: { id: tenant.id, name: tenant.name } });
});

// the PC proves itself with its device token
async function deviceAuth(req, res, next) {
    const token = String(req.headers['x-device-token'] || '');
    if (!token) return next(new HttpError(401, 'Missing device token.'));
    const device = await prisma.device.findFirst({ where: { tokenHash: sha(token) } });
    if (!device) return next(new HttpError(401, 'This PC is not known to HisabPro. Set it up again.', { code: 'DEVICE_UNKNOWN' }));
    if (device.revokedAt) return next(new HttpError(401, 'This PC was revoked by HisabPro administration.', { code: 'DEVICE_REVOKED' }));
    const tenant = await prisma.tenant.findUnique({ where: { id: device.tenantId } });
    const mode = Access.mode(tenant);
    if (mode.mode === 'BLOCKED') return next(new HttpError(401, mode.message, { code: 'TENANT_BLOCKED' }));
    req.device = device; req.tenant = tenant; req.access = mode;
    next();
}

router.post('/sync/push', express.json({ limit: '20mb' }), deviceAuth, async (req, res) => {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (rows.length > 2000) throw new HttpError(400, 'Too many rows in one push (max 2000).');
    const t = req.device.tenantId;
    const result = { created: 0, updated: 0, skipped: 0, rejected: [] };
    // one row → 'created' | 'updated' | 'skipped' | { reject: reason }
    async function applyOne(tx, r, parents) {
            const model = String(r.tbl || '');
            if (!PUSHABLE.has(model)) { return { reject: 'not pushable' }; }
            let data;
            try { data = toData(model, r.row || {}); } catch { return { reject: 'unreadable row' }; }
            if (!data.id) return { reject: 'no id' };
            data.tenantId = t; // a PC can only write its own client's data
            // a settings row's id is `${tenantId}:${key}`: a PC must not create another client's row ahead of it
            if (model === 'Setting' && data.id !== `${t}:${data.key}`) return { reject: 'settings id of another client' };
            // a child row only under a parent document of this client (already here, or earlier in this push): otherwise a
            // PC could hang lines under another client's sale or purchase, and they would show inside it
            let orphan = false;
            for (const rel of PARENTS[model] || []) {
                const fk = data[rel.fk];
                if (fk === undefined || fk === null) continue;
                const key = `${rel.model}:${fk}`;
                if (!parents.has(key)) {
                    if (!(await tx[delegate(rel.model)].findFirst({ where: { id: fk, tenantId: t }, select: { id: true } }))) { orphan = true; break; }
                    parents.add(key);
                }
            }
            if (orphan) return { reject: 'its document is not in this client' };
            if (model === 'AuditLog') data.deviceId = req.device.id;
            // the activity log is append-only (a database trigger refuses changes): a row already here is never rewritten
            return upsertRow(tx, model, data, { lww: true, tenantId: t, insertOnly: model === 'AuditLog' });
    }
    const tally = (r, out) => { if (out && out.reject) result.rejected.push({ tbl: String(r.tbl || ''), id: r.row && r.row.id, reason: out.reject }); else result[out]++; };
    const begin = tx => tx.$executeRawUnsafe(`SELECT set_config('hp.device', $1, true)`, req.device.id); // the change log knows which PC made it
    try {
        // normally the whole push is one transaction
        const outs = await withTx(t, async tx => { await begin(tx); const parents = new Set(); const o = []; for (const r of rows) o.push(await applyOne(tx, r, parents)); return o; });
        rows.forEach((r, i) => tally(r, outs[i]));
    } catch (e) {
        // one row the database refuses must not stop this PC from syncing for ever: apply row by row, and report the bad ones
        // (the PC drops them from its outbox and shows them as sync problems)
        console.error('sync push batch failed, retrying row by row:', e.message);
        for (const r of rows) {
            try { tally(r, await withTx(t, async tx => { await begin(tx); return applyOne(tx, r, new Set()); })); }
            catch (err) { result.rejected.push({ tbl: String(r.tbl || ''), id: r.row && r.row.id, reason: 'refused by the server: ' + String(err.message).split('\n').pop().slice(0, 200) }); }
        }
    }
    await prisma.device.update({ where: { id: req.device.id }, data: { lastSeenAt: new Date(), lastPushAt: new Date(), appVersion: str(req.headers['x-app-version'], 30) || req.device.appVersion } });
    res.json(result);
});

router.get('/sync/pull', deviceAuth, async (req, res) => {
    const t = req.device.tenantId;
    const cursor = BigInt(Math.max(0, Number(req.query.cursor) || 0));
    const limit = Math.min(Math.max(Number(req.query.limit) || 1000, 1), 5000);
    const log = await prisma.changeLog.findMany({ where: { tenantId: t, seq: { gt: cursor } }, orderBy: { seq: 'asc' }, take: limit });
    // read after the log: if the nightly clean-up removed entries this PC has not seen yet, it downloads a fresh copy of the
    // shop instead (the clean-up deletes entries and moves the floor in one transaction, so this check never misses one)
    const floor = BigInt(await syncFloor(t));
    if (cursor < floor) {
        const [m] = await prisma.$queryRaw`SELECT MAX("seq") AS m FROM "ChangeLog" WHERE "tenantId" = ${t}`;
        const resyncCursor = m && m.m !== null && BigInt(m.m) > floor ? BigInt(m.m) : floor;
        await prisma.device.update({ where: { id: req.device.id }, data: { lastSeenAt: new Date(), lastPullAt: new Date() } });
        // rows: [] and the same cursor: an older PC app that does not know "resync" simply waits instead of skipping data
        return res.json({ rows: [], cursor: Number(cursor), more: false, resync: true, resyncCursor: Number(resyncCursor), tables: SNAPSHOT_TABLES, access: Access.access(req.tenant), mode: req.access.mode, serverTime: new Date().toISOString() });
    }
    const next = log.length ? log[log.length - 1].seq : cursor;
    // newest entry per row, leaving out what this PC pushed itself and tables PCs never receive
    const want = new Map();
    for (const e of log) if (e.deviceId !== req.device.id && PULLABLE.has(e.tbl)) want.set(`${e.tbl}:${e.rowId}`, e);
    const byTable = {};
    for (const e of want.values()) (byTable[e.tbl] = byTable[e.tbl] || []).push(e.rowId);
    const rows = [];
    for (const [tbl, ids] of Object.entries(byTable)) {
        const found = await prisma[delegate(tbl)].findMany({ where: { id: { in: ids } } });
        for (const row of found) {
            if (tbl === 'User' && row.tenantId !== t) continue;
            if (tbl === 'Tenant' && row.id !== t) continue;
            if (tbl !== 'Tenant' && row.tenantId !== t) continue;
            rows.push({ tbl, row });
        }
    }
    await prisma.device.update({ where: { id: req.device.id }, data: { lastSeenAt: new Date(), lastPullAt: new Date() } });
    res.json({ rows, cursor: Number(next), more: log.length === limit, access: Access.access(req.tenant), mode: req.access.mode, serverTime: new Date().toISOString() });
});

// a resync: every row of one table of this shop, by id, page by page (deleted rows too, so the PC learns of the deletes)
const SNAPSHOT_TABLES = [...PULLABLE].sort();
// rows per page: smaller for tables that may carry images (photos, logo, carts) or attached files (up to 4 × 250 KB)
const PAGE = { Product: 100, Category: 100, Setting: 100, HeldSale: 100, Employee: 20, Candidate: 20 };
router.get('/sync/snapshot', deviceAuth, async (req, res) => {
    const t = req.device.tenantId;
    const tbl = String(req.query.tbl || '');
    if (!PULLABLE.has(tbl)) throw new HttpError(400, 'Unknown table.');
    const after = str(req.query.after, 80);
    const limit = PAGE[tbl] || 1000;
    const where = tbl === 'Tenant' ? { id: t } : { tenantId: t };
    if (after) where.AND = [{ id: { gt: after } }];
    const rows = await prisma[delegate(tbl)].findMany({ where, orderBy: { id: 'asc' }, take: limit });
    await prisma.device.update({ where: { id: req.device.id }, data: { lastSeenAt: new Date() } });
    res.json({ rows, more: rows.length === limit, next: rows.length ? rows[rows.length - 1].id : after });
});

module.exports = { router, mount: '/api', cloudOnly: true };
