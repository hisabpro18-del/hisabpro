// Keeping the cloud database small (Supabase free plan: 500 MB). Runs once a day from the scheduler, and on demand from the
// super admin's storage card. Nothing here removes shop records (sales, stock, khata, purchases …): only housekeeping rows.
//   1. Sync change log: PCs read it to learn what changed. Entries older than SYNC_LOG_DAYS (14) are removed, and at once
//      for shops with no active PC. The shop's "floor" (the newest removed entry) is remembered: a PC whose cursor is below
//      it downloads a fresh copy of the shop instead (GET /api/sync/snapshot), so nothing is ever missed.
//   2. Activity log entries older than AUDIT_RETENTION_DAYS (365).
//   3. Message log (WhatsApp / SMS history) older than MESSAGE_RETENTION_DAYS (365).
//   4. Held carts that were resumed or removed more than 30 days ago.
const { prisma, withTx, isDesktop } = require('../db');

const DAY = 86400000;
const days = (name, dflt) => { const n = Number(process.env[name]); return Number.isFinite(n) && n >= 1 ? n : dflt; };
const SYNC_LOG_DAYS = () => days('SYNC_LOG_DAYS', 14);
const AUDIT_DAYS = () => days('AUDIT_RETENTION_DAYS', 365);
const MESSAGE_DAYS = () => days('MESSAGE_RETENTION_DAYS', 365);
const HELD_DAYS = 30;
const LIMIT_MB = () => days('DB_LIMIT_MB', 500);
const floorId = tenantId => `${tenantId}:syncFloor`;

// the newest change-log entry removed for this shop: a PC with an older cursor must download a fresh copy
async function syncFloor(tenantId, db = prisma) {
    const c = await db.counter.findUnique({ where: { id: floorId(tenantId) } });
    return c ? c.value : 0;
}

async function pruneChangeLog(now = new Date(), { tenantId } = {}) {
    let removed = 0;
    const tenants = tenantId ? [{ id: tenantId }] : await prisma.tenant.findMany({ select: { id: true } });
    for (const { id: t } of tenants) {
        const pcs = await prisma.device.count({ where: { tenantId: t, revokedAt: null } });
        // a shop without PCs needs no change log at all (a PC set up later downloads a fresh copy)
        const before = new Date(now.getTime() - (pcs ? SYNC_LOG_DAYS() * DAY : 0));
        // under the shop's lock: the entries' numbers and times are in step with the writes, and the floor moves with them
        removed += await withTx(t, async tx => {
            const r = await tx.$queryRaw`SELECT MAX("seq") AS m FROM "ChangeLog" WHERE "tenantId" = ${t} AND "at" < ${before}`;
            const max = r[0] && r[0].m !== null ? BigInt(r[0].m) : null;
            if (max === null) return 0;
            if (max > 2147483647n) return 0; // the floor is kept in an Int counter (not reachable on this plan; never guess)
            const n = await tx.$executeRaw`DELETE FROM "ChangeLog" WHERE "tenantId" = ${t} AND "seq" <= ${max}`;
            const v = Number(max);
            await tx.counter.upsert({ where: { id: floorId(t) }, create: { id: floorId(t), tenantId: t, key: 'syncFloor', value: v }, update: { value: v } });
            return n;
        }, { timeout: 120000 });
    }
    return removed;
}

async function pruneAudit(now = new Date()) {
    const before = new Date(now.getTime() - AUDIT_DAYS() * DAY);
    // the activity log refuses deletes, except inside a transaction marked as the retention job
    return prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe(`SELECT set_config('hp.retention', 'on', true)`);
        return tx.$executeRaw`DELETE FROM "AuditLog" WHERE "createdAt" < ${before}`;
    }, { timeout: 120000 });
}

async function pruneMessages(now = new Date()) {
    const before = new Date(now.getTime() - MESSAGE_DAYS() * DAY);
    // queued or sending messages are never removed (the scheduler still has to send them)
    return (await prisma.messageLog.deleteMany({ where: { createdAt: { lt: before }, status: { notIn: ['QUEUED', 'SENDING'] } } })).count;
}

async function pruneHeld(now = new Date()) {
    const before = new Date(now.getTime() - HELD_DAYS * DAY);
    return (await prisma.heldSale.deleteMany({ where: { deletedAt: { lt: before } } })).count;
}

// size of the database against the plan's limit, and the biggest tables
async function storage() {
    if (isDesktop) return null;
    const [db] = await prisma.$queryRawUnsafe('SELECT pg_database_size(current_database())::bigint AS bytes');
    const tables = await prisma.$queryRawUnsafe(`SELECT c.relname AS name, pg_total_relation_size(c.oid)::bigint AS bytes, c.reltuples::bigint AS rows
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND n.nspname = current_schema() ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 10`);
    const bytes = Number(db.bytes), limitBytes = LIMIT_MB() * 1024 * 1024;
    const percent = Math.round((bytes / limitBytes) * 1000) / 10;
    return {
        bytes, limitBytes, percent, level: percent >= 85 ? 'danger' : percent >= 70 ? 'warning' : 'ok',
        tables: tables.map(r => ({ name: r.name, bytes: Number(r.bytes), rows: Math.max(0, Number(r.rows)) })),
        retention: { syncLogDays: SYNC_LOG_DAYS(), auditDays: AUDIT_DAYS(), messageDays: MESSAGE_DAYS(), heldDays: HELD_DAYS },
    };
}

let lastRun = null;
async function runAll(now = new Date()) {
    if (isDesktop) return { skipped: true };
    const out = { changeLog: 0, audit: 0, messages: 0, held: 0, errors: [] };
    // each step on its own: one failing must not stop the others
    for (const [k, fn] of [['changeLog', pruneChangeLog], ['audit', pruneAudit], ['messages', pruneMessages], ['held', pruneHeld]]) {
        try { out[k] = await fn(now); } catch (e) { out.errors.push(`${k}: ${e.message}`); console.error('maintenance', k, e.message); }
    }
    lastRun = { at: now.toISOString(), ...out };
    return out;
}
// once a day (the scheduler ticks every few minutes)
async function daily(now = new Date()) {
    if (lastRun && now.getTime() - Date.parse(lastRun.at) < DAY) return null;
    return runAll(now);
}

module.exports = { syncFloor, pruneChangeLog, pruneAudit, pruneMessages, pruneHeld, storage, runAll, daily, lastRun: () => lastRun };
