// The desktop PC's side of sync (MODE=desktop). Every few seconds, while online:
//   1. push: rows in the local _outbox (written by triggers on every local change) are sent to the cloud
//   2. pull: rows changed in the cloud since our cursor are applied locally (with the outbox triggers paused); when
//      the cloud has cleaned away log entries we still need (kept 14 days), a fresh copy of the shop is downloaded
// A pulled row that still has a local change waiting to be pushed is skipped when ours is newer (it goes up and wins);
// when the cloud's is at least as new, the cloud would refuse ours, so the cloud's row is applied and ours dropped.
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { prisma } = require('../db');
const state = require('./state');
const { PUSHABLE, PULLABLE, delegate } = require('./registry');
const { toData, upsertRow } = require('./apply');
const { setDesktopGuard } = require('../auth');
const { setDeviceResolver } = require('../audit');
const Access = require('../../public/js/shared/access');

const APP_VERSION = (() => { try { return require('../../package.json').version; } catch { return '0'; } })();
const INTERVAL = Number(process.env.HP_SYNC_INTERVAL_MS) || 5000;
const DAY = 86400000;
let timer = null, running = false;

// ── local key/value store (_device) ──
async function getKV() {
    const rows = await prisma.$queryRawUnsafe('SELECT "k", "v" FROM "_device"');
    return Object.fromEntries(rows.map(r => [r.k, r.v]));
}
async function setKV(obj) {
    for (const [k, v] of Object.entries(obj)) await prisma.$executeRawUnsafe('INSERT INTO "_device" ("k", "v") VALUES (?, ?) ON CONFLICT("k") DO UPDATE SET "v" = excluded."v"', k, String(v ?? ''));
}

// a column definition from CREATE TABLE made acceptable to ALTER TABLE ADD COLUMN (dates are stored as epoch ms, as Prisma does)
function columnForAdd(def) {
    let d = def.replace(/DEFAULT CURRENT_TIMESTAMP/i, `DEFAULT ${Date.now()}`);
    if (/NOT NULL/i.test(d) && !/DEFAULT/i.test(d)) {
        const type = (d.match(/^\w+/) || [''])[0].toUpperCase();
        d += ` DEFAULT ${type === 'TEXT' ? "''" : type === 'DATETIME' ? Date.now() : type === 'BOOLEAN' ? 'false' : '0'}`;
    }
    return d;
}

// first start: create the tables and triggers from desktop/schema.sql
async function ensureSchema() {
    const have = await prisma.$queryRawUnsafe(`SELECT name FROM sqlite_master WHERE type='table' AND name='Product'`);
    const file = path.join(__dirname, '..', '..', 'desktop', 'schema.sql');
    const sql = fs.readFileSync(file, 'utf8');
    const version = (sql.match(/version ([0-9a-f]+)/) || [])[1] || '';
    if (have.length) {
        // tables exist; triggers and helper tables are re-applied (all IF NOT EXISTS) when the app version brings a new schema
        const kv = await getKV().catch(() => ({}));
        if (kv.schemaVersion === version) return;
    }
    const statements = sql.split(/\n-- @@\n/).map(x => x.replace(/^--.*$/gm, '').trim()).filter(Boolean);
    const run = stmt => (/^PRAGMA/i.test(stmt) ? prisma.$queryRawUnsafe(stmt) : prisma.$executeRawUnsafe(stmt));
    const isTable = stmt => /^PRAGMA/i.test(stmt) || /^CREATE TABLE IF NOT EXISTS "/.test(stmt);
    // 1. tables (an existing one is left as it is)
    for (const stmt of statements.filter(isTable)) await run(stmt);
    // 2. an app update can bring new columns: add the ones an existing table is missing. SQLite cannot add a column with
    //    a non-constant default (CURRENT_TIMESTAMP) or NOT NULL without a default, so those get a constant one.
    for (const stmt of statements.filter(s => /^CREATE TABLE IF NOT EXISTS "/.test(s))) {
        const table = stmt.match(/^CREATE TABLE IF NOT EXISTS "([^"]+)"/)[1];
        const have = new Set((await prisma.$queryRawUnsafe(`PRAGMA table_info("${table}")`)).map(c => c.name));
        const body = stmt.slice(stmt.indexOf('(') + 1, stmt.lastIndexOf(')'));
        for (const line of body.split(/,\n/).map(l => l.trim())) {
            const m = line.match(/^"([^"]+)"\s+(.*)$/);
            if (!m || have.has(m[1]) || /PRIMARY KEY/i.test(m[2])) continue;
            await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${m[1]}" ${columnForAdd(m[2])}`);
        }
    }
    // 3. indexes, triggers and the rest (they may refer to the columns just added)
    for (const stmt of statements.filter(s => !isTable(s))) await run(stmt);
    await setKV({ schemaVersion: version });
}

async function loadState() {
    const kv = await getKV();
    state.set({
        device: kv.deviceToken ? { id: kv.deviceId, code: kv.deviceCode, name: kv.deviceName, tenantId: kv.tenantId } : null,
        serverUrl: kv.serverUrl || process.env.HP_SERVER_URL || '',
        lastSyncAt: kv.lastSyncAt ? new Date(kv.lastSyncAt) : null,
        activatedAt: kv.activatedAt ? new Date(kv.activatedAt) : null,
        revoked: kv.revoked === '1',
        shopName: kv.shopName || '',
        token: kv.deviceToken || '',
        cursor: Number(kv.cursor || 0),
        lastResyncAt: kv.lastResyncAt || null,
        problems: (() => { try { return JSON.parse(kv.problems || '[]'); } catch { return []; } })(),
    });
    await countPending();
}
async function countPending() {
    const r = await prisma.$queryRawUnsafe('SELECT COUNT(DISTINCT "tbl" || \':\' || "rowId") AS n FROM "_outbox"');
    state.set({ pending: Number(r[0].n || 0) });
}

async function http(method, p, body, timeoutMs = 15000) {
    const s = state.get();
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), timeoutMs);
    try {
        const res = await fetch(s.serverUrl.replace(/\/+$/, '') + p, {
            method, signal: ctl.signal,
            headers: { 'Content-Type': 'application/json', 'X-Device-Token': s.token || '', 'X-App-Version': APP_VERSION },
            body: body === undefined ? undefined : JSON.stringify(body, (k, v) => (typeof v === 'bigint' ? Number(v) : v)),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error(data.error || `Server answered ${res.status}`), { status: res.status, code: data.code });
        return data;
    } finally { clearTimeout(tm); }
}

// ── activation (once, online) ──
async function activate({ serverUrl, email, password, name }) {
    const url = String(serverUrl || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(url)) throw Object.assign(new Error('Enter the HisabPro server address, e.g. https://hisabpro.com'), { status: 400 });
    state.set({ serverUrl: url, token: '' });
    let r;
    try { r = await http('POST', '/api/device/activate', { email, password, name, appVersion: APP_VERSION }, 20000); }
    catch (e) { throw Object.assign(new Error(e.name === 'AbortError' || !e.status ? 'Cannot reach that server. Check the address and the internet connection.' : e.message), { status: e.status || 503 }); }
    await setKV({ serverUrl: url, deviceToken: r.deviceToken, deviceId: r.device.id, deviceCode: r.device.code, deviceName: r.device.name, tenantId: r.tenant.id, shopName: r.tenant.name, cursor: 0, revoked: '0', activatedAt: new Date().toISOString() });
    await loadState();
    await syncOnce({ full: true }); // download the shop's data now
    return { device: r.device, tenant: r.tenant };
}

// ── push ──
async function push() {
    let total = 0;
    for (let round = 0; round < 50; round++) {
        const entries = await prisma.$queryRawUnsafe('SELECT "id", "tbl", "rowId" FROM "_outbox" ORDER BY "id" LIMIT 1000');
        if (!entries.length) break;
        const maxId = Number(entries[entries.length - 1].id);
        const seen = new Set(), batch = [];
        let bytes = 0;
        let lastIncluded = 0;
        for (const e of entries) {
            const key = `${e.tbl}:${e.rowId}`;
            if (!seen.has(key) && PUSHABLE.has(e.tbl)) {
                seen.add(key);
                const row = await prisma[delegate(e.tbl)].findUnique({ where: { id: e.rowId } });
                if (row) {
                    const size = JSON.stringify(row, (k, v) => (typeof v === 'bigint' ? Number(v) : v)).length;
                    if (batch.length && bytes + size > 2_000_000) break; // keep each request under the server's body limit
                    batch.push({ tbl: e.tbl, row }); bytes += size;
                }
            }
            lastIncluded = Number(e.id);
        }
        if (batch.length) {
            const r = await http('POST', '/api/sync/push', { rows: batch }, 60000);
            // rows the cloud refused are dropped from the outbox (they would block sync for ever) and shown as sync problems
            if (r && r.rejected && r.rejected.length) {
                const problems = [...(state.get().problems || []), ...r.rejected.map(x => ({ ...x, at: new Date().toISOString() }))].slice(-50);
                state.set({ problems });
                await setKV({ problems: JSON.stringify(problems) });
            }
        }
        // only what was sent is removed: a change made meanwhile has a newer outbox id and stays
        await prisma.$executeRawUnsafe('DELETE FROM "_outbox" WHERE "id" <= ?', lastIncluded || maxId);
        total += batch.length;
    }
    return total;
}

// ── pull ──
// cloud rows → this PC (with the outbox triggers paused, so they are not sent back up)
async function applyRows(rows) {
    let applied = 0;
    if (!rows.length) return 0;
    await prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe(`UPDATE "_flags" SET "v" = '1' WHERE "k" = 'applying'`);
        for (const { tbl, row } of rows) {
            if (!PULLABLE.has(tbl)) continue;
            const waiting = await tx.$queryRawUnsafe('SELECT 1 FROM "_outbox" WHERE "tbl" = ? AND "rowId" = ? LIMIT 1', tbl, row.id);
            if (waiting.length) {
                // our own change is still waiting to go up: it goes first and wins if it is newer. The cloud refuses
                // an older one (last change wins), so a cloud row at least as new replaces ours here and our change is
                // dropped — otherwise the cursor moves past the cloud's change and this PC keeps its old row for good.
                const local = await tx[delegate(tbl)].findUnique({ where: { id: row.id }, select: { updatedAt: true } });
                if (!local || !local.updatedAt || !row.updatedAt || new Date(row.updatedAt) < new Date(local.updatedAt)) continue;
                await tx.$executeRawUnsafe('DELETE FROM "_outbox" WHERE "tbl" = ? AND "rowId" = ?', tbl, row.id);
            }
            await upsertRow(tx, tbl, toData(tbl, row));
            applied++;
        }
        await tx.$executeRawUnsafe(`UPDATE "_flags" SET "v" = '0' WHERE "k" = 'applying'`);
    }, { timeout: 120000, maxWait: 30000 });
    return applied;
}

// The cloud keeps its change log for two weeks only (to fit the database plan). A PC that was off longer — or a PC set
// up after the log was cleaned — downloads a fresh copy of every table, then continues from the cloud's cursor at that
// moment (changes made during the download are pulled again afterwards; applying a row twice does no harm).
async function resync(resyncCursor, tables) {
    let applied = 0;
    for (const tbl of tables) {
        if (!PULLABLE.has(tbl)) continue;
        let after = '';
        for (let page = 0; page < 100000; page++) {
            const r = await http('GET', `/api/sync/snapshot?tbl=${encodeURIComponent(tbl)}&after=${encodeURIComponent(after)}`, undefined, 120000);
            applied += await applyRows(r.rows.map(row => ({ tbl, row })));
            if (!r.more || !r.next) break;
            after = r.next;
        }
    }
    const at = new Date().toISOString();
    await setKV({ cursor: resyncCursor, lastResyncAt: at });
    state.set({ cursor: resyncCursor, lastResyncAt: at });
    return applied;
}

async function pull({ full } = {}) {
    let applied = 0;
    for (let round = 0; round < (full ? 1000 : 50); round++) {
        const s = state.get();
        const r = await http('GET', `/api/sync/pull?cursor=${s.cursor}&limit=1000`, undefined, 60000);
        const skew = r.serverTime ? Date.now() - Date.parse(r.serverTime) : 0;
        if (r.resync) {
            applied += await resync(Number(r.resyncCursor) || 0, Array.isArray(r.tables) ? r.tables : [...PULLABLE].sort());
            state.set({ access: r.access, accessMode: r.mode, clockSkewMs: skew });
            continue; // then the changes since
        }
        applied += await applyRows(r.rows);
        await setKV({ cursor: r.cursor });
        // how far this PC's clock is from the server's (a wrong clock dates sales wrongly and wins conflicts it should not)
        state.set({ cursor: r.cursor, access: r.access, accessMode: r.mode, clockSkewMs: skew });
        if (!r.more) break;
    }
    return applied;
}

async function syncOnce({ full } = {}) {
    if (running) return { busy: true };
    const s = state.get();
    if (!s.device || !s.serverUrl || s.revoked) return { skipped: true };
    running = true;
    try {
        const pushed = await push();
        const pulled = await pull({ full });
        const now = new Date();
        await setKV({ lastSyncAt: now.toISOString() });
        state.set({ online: true, lastSyncAt: now, error: '' });
        await countPending();
        return { pushed, pulled };
    } catch (e) {
        if (e.code === 'DEVICE_REVOKED' || e.code === 'DEVICE_UNKNOWN') { await setKV({ revoked: '1' }); state.set({ revoked: true }); }
        state.set({ online: !(e.name === 'AbortError' || !e.status), error: e.message });
        await countPending().catch(() => {});
        return { error: e.message };
    } finally { running = false; }
}

// writes refused on this PC: revoked, or offline for too long (it must sync to stay in step and to check the subscription)
function guard(p) {
    const s = state.get();
    if (p.startsWith('/api/desktop/') || p.startsWith('/api/auth/')) return null;
    if (s.revoked) return 'This PC was revoked by HisabPro administration. Contact HisabPro.';
    if (!s.device) return 'This PC is not set up yet.';
    // never synced since activation (the first download failed): the offline days count from the activation
    const last = s.lastSyncAt || s.activatedAt;
    if (last && Date.now() - last.getTime() > config.OFFLINE_DAYS * DAY)
        return `This PC has been offline for more than ${config.OFFLINE_DAYS} days. Connect it to the internet so it can sync, then continue.`;
    return null;
}

async function start() {
    await ensureSchema();
    await loadState();
    setDesktopGuard(guard);
    setDeviceResolver(() => state.deviceId());
    const tick = async () => { await syncOnce(); timer = setTimeout(tick, INTERVAL); };
    timer = setTimeout(tick, 500);
}
function stop() { if (timer) clearTimeout(timer); timer = null; }

function status() {
    const s = state.get();
    const last = s.lastSyncAt || s.activatedAt;
    const daysLeft = last ? Math.max(0, Math.ceil((last.getTime() + config.OFFLINE_DAYS * DAY - Date.now()) / DAY)) : null;
    return {
        isDesktop: true, activated: !!s.device, online: !!s.online, pending: s.pending || 0, lastSyncAt: s.lastSyncAt, revoked: !!s.revoked,
        serverUrl: s.serverUrl || '', shopName: s.shopName || '', device: s.device ? { code: s.device.code, name: s.device.name } : null,
        offlineDaysLeft: daysLeft, error: s.error || '', version: APP_VERSION,
        clockSkewMinutes: Math.round((s.clockSkewMs || 0) / 60000), problems: (s.problems || []).length,
        lastResyncAt: s.lastResyncAt || null, // last full download (after the cloud cleaned its sync log)
    };
}

async function setServer(url) {
    await setKV({ serverUrl: url });
    state.set({ serverUrl: url, online: false });
    syncOnce().catch(() => {});
}

const refreshPending = () => countPending().catch(() => {});

module.exports = { start, stop, activate, syncOnce, status, ensureSchema, setServer, refreshPending, Access };
