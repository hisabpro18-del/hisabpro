// Database Backups: storage health, a full JSON download of the client's business data, and a merge-only import
// (rows whose id is new are added with this client's tenantId; rows that already exist are skipped; nothing is overwritten).
const express = require('express');
const { prisma, Prisma } = require('../db');
const { HttpError } = require('../lib/http');
const { authenticate, can } = require('../auth');
const { audit } = require('../audit');
const limits = require('../limits');
const { BOTH, delegate } = require('../sync/registry');
const pkg = require('../../package.json');

const router = express.Router();
router.use(authenticate);
const MANAGE = can('settings.manage');

const APP = 'HisabPro';
const FORMAT = 1;
const QUOTA_BYTES = 500 * 1024 * 1024;
// the import arrives as application/vnd.hisabpro.backup+json so the app-wide 3 MB JSON parser leaves it to this route
const BACKUP_TYPE = 'application/vnd.hisabpro.backup+json';
const bigJson = express.json({ limit: '16mb', type: [BACKUP_TYPE, 'application/json'] });

// scalar fields of each synced model, with what an imported value must be
const FIELDS = Object.fromEntries(Prisma.dmmf.datamodel.models.filter(m => BOTH.includes(m.name)).map(m => [m.name, m.fields.filter(f => f.kind === 'scalar')]));
// rows read through a relation without a tenantId filter (sale.items, sale.payments, return.items …): { SaleItem: [{ fk: 'saleId', model: 'Sale' }] }
// An imported child must hang under a parent of THIS client, or it would show up inside another client's document.
const PARENTS = Object.fromEntries(Prisma.dmmf.datamodel.models.filter(m => BOTH.includes(m.name))
    .map(m => [m.name, m.fields.filter(f => f.kind === 'object' && f.relationFromFields && f.relationFromFields.length).map(f => ({ fk: f.relationFromFields[0], model: f.type }))])
    .filter(([, list]) => list.length));
const INT_MAX = 2147483647, BIGINT_MAX = 9223372036854775807n;
const plain = v => (typeof v === 'bigint' ? Number(v) : v);
const chunks = (list, n = 500) => { const out = []; for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; };

// ── storage health (approximate: rows × average row size, per table) ──
router.get('/storage', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const tables = [];
    for (const model of [...BOTH, 'AuditLog']) {
        const d = prisma[delegate(model)];
        const rows = await d.count({ where: { tenantId: t } });
        let bytes = 0;
        if (rows) {
            const sample = await d.findMany({ where: { tenantId: t }, take: 25, orderBy: { createdAt: 'desc' } });
            const avg = sample.reduce((a, r) => a + JSON.stringify(r, (k, v) => plain(v)).length, 0) / sample.length;
            bytes = Math.round(rows * avg * 1.5); // + indexes and storage overhead
        }
        tables.push({ name: model, rows, bytes });
    }
    const used = tables.reduce((a, x) => a + x.bytes, 0);
    const usedPct = Math.min(100, Math.round((used / QUOTA_BYTES) * 1000) / 10);
    res.json({ tables: tables.sort((a, b) => b.bytes - a.bytes), rows: tables.reduce((a, x) => a + x.rows, 0), usedBytes: used, quotaBytes: QUOTA_BYTES, usedPct, freePct: Math.round((100 - usedPct) * 10) / 10, healthy: usedPct < 80 });
});

// ── download ──
router.get('/download', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const out = {};
    const counts = {};
    for (const model of BOTH) {
        const rows = await prisma[delegate(model)].findMany({ where: { tenantId: t }, orderBy: { createdAt: 'asc' } });
        out[model] = rows;
        counts[model] = rows.length;
    }
    // for reference only (users are managed by HisabPro and are never imported); no password hashes, ever
    const users = await prisma.user.findMany({ where: { tenantId: t, deletedAt: null }, select: { name: true, email: true, role: true, active: true, createdAt: true } });
    const exportedAt = new Date();
    const body = JSON.stringify({
        app: APP, kind: 'backup', format: FORMAT, version: pkg.version, exportedAt,
        tenant: { id: t, name: req.tenant ? req.tenant.name : '' }, counts, users, tables: out,
    }, (k, v) => plain(v));
    const safe = String((req.tenant && req.tenant.name) || 'shop').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'shop';
    await audit(req, { action: 'backup.download', summary: `Backup downloaded (${Object.values(counts).reduce((a, b) => a + b, 0)} records)` });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="hisabpro-backup-${safe}-${exportedAt.toISOString().slice(0, 10)}.json"`);
    res.send(body);
});

// one value from the file → what the database column takes (throws a plain message when it cannot be read)
function readValue(f, v, where) {
    const bad = () => { throw new HttpError(400, `The backup file is damaged: ${where}, field "${f.name}" cannot be read.`); };
    if (v === null) { if (f.isRequired) bad(); return null; }
    switch (f.type) {
        case 'String': if (typeof v === 'object') bad(); return String(v);
        case 'Int': { const n = Number(v); if (typeof v === 'object' || !Number.isFinite(n) || Math.abs(n) > INT_MAX) bad(); return Math.trunc(n); }
        case 'Float': { const n = Number(v); if (typeof v === 'object' || !Number.isFinite(n)) bad(); return n; }
        case 'Boolean': if (typeof v === 'boolean') return v; if (v === 'true' || v === 1) return true; if (v === 'false' || v === 0) return false; return bad();
        case 'DateTime': { if (typeof v !== 'string') bad(); const d = new Date(v); if (isNaN(d)) bad(); return d; }
        case 'BigInt': {
            let x;
            if (typeof v === 'string' && /^-?\d{1,20}$/.test(v)) x = BigInt(v);
            else { const n = Number(v); if (typeof v === 'object' || !Number.isFinite(n)) bad(); x = BigInt(Math.round(n)); }
            if (x > BIGINT_MAX || x < -BIGINT_MAX) bad();
            return x;
        }
        default: return v;
    }
}

// ── import (merge only) ──
router.post('/import', MANAGE, bigJson, async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body;
    if (!b || typeof b !== 'object' || Array.isArray(b) || b.app !== APP || b.kind !== 'backup') throw new HttpError(400, 'This file is not a HisabPro backup.');
    if (Number(b.format) > FORMAT) throw new HttpError(400, 'This backup was made by a newer HisabPro. Update the app first.');
    if (!b.tables || typeof b.tables !== 'object' || Array.isArray(b.tables)) throw new HttpError(400, 'The backup file is damaged: it has no tables.');

    // read and check every row before anything is written
    const plan = [];
    for (const model of BOTH) {
        const rows = b.tables[model];
        if (rows === undefined) continue;
        if (!Array.isArray(rows)) throw new HttpError(400, `The backup file is damaged: "${model}" is not a list.`);
        const data = rows.map((row, i) => {
            const where = `${model} row ${i + 1}`;
            if (!row || typeof row !== 'object' || Array.isArray(row)) throw new HttpError(400, `The backup file is damaged: ${where} is not a record.`);
            const o = {};
            for (const f of FIELDS[model]) {
                if (f.name === 'tenantId') { o.tenantId = t; continue; }
                const v = row[f.name];
                if (v === undefined) { if (f.isRequired && !f.hasDefaultValue && !f.isUpdatedAt) throw new HttpError(400, `The backup file is damaged: ${where} has no "${f.name}".`); continue; }
                const val = readValue(f, v, where);
                if (val === null && f.hasDefaultValue && f.isRequired) continue;
                o[f.name] = val;
            }
            if (model === 'Setting') o.id = `${t}:${o.key}`; // one settings row per client and key
            if (typeof o.id !== 'string' || !o.id || o.id.length > 120) throw new HttpError(400, `The backup file is damaged: ${where} has no id.`);
            return o;
        });
        const seen = new Set();
        plan.push({ model, data: data.filter(o => !seen.has(o.id) && seen.add(o.id)), dupes: data.length - seen.size });
    }

    // which ids already exist (in any client: an id is never reused)
    for (const p of plan) {
        const have = new Set();
        for (const part of chunks(p.data.map(o => o.id))) {
            for (const r of await prisma[delegate(p.model)].findMany({ where: { id: { in: part } }, select: { id: true } })) have.add(r.id);
        }
        p.fresh = p.data.filter(o => !have.has(o.id));
        p.skipped = p.data.length - p.fresh.length + p.dupes;
    }
    // a child row is added only under a parent that is new in this file or already belongs to this client (parents come first in BOTH)
    for (const p of plan) {
        for (const rel of PARENTS[p.model] || []) {
            const incoming = new Set((plan.find(x => x.model === rel.model) || { fresh: [] }).fresh.map(o => o.id));
            const ask = [...new Set(p.fresh.map(o => o[rel.fk]).filter(id => typeof id === 'string' && !incoming.has(id)))];
            const mine = new Set();
            for (const part of chunks(ask)) {
                for (const r of await prisma[delegate(rel.model)].findMany({ where: { id: { in: part }, tenantId: t }, select: { id: true } })) mine.add(r.id);
            }
            const keep = p.fresh.filter(o => incoming.has(o[rel.fk]) || mine.has(o[rel.fk]));
            p.skipped += p.fresh.length - keep.length;
            p.fresh = keep;
        }
    }
    const newProducts = (plan.find(p => p.model === 'Product') || { fresh: [] }).fresh.filter(o => o.type !== 'VARIANT' && !o.deletedAt).length;
    if (newProducts) await limits.assertRoom(t, 'products', newProducts);

    const added = {}, skipped = {};
    for (const p of plan) {
        for (const part of chunks(p.fresh)) await prisma[delegate(p.model)].createMany({ data: part });
        added[p.model] = p.fresh.length;
        skipped[p.model] = p.skipped;
    }
    const totalAdded = Object.values(added).reduce((a, n) => a + n, 0), totalSkipped = Object.values(skipped).reduce((a, n) => a + n, 0);
    await audit(req, { action: 'backup.import', summary: `Backup imported from "${String((b.tenant && b.tenant.name) || 'unknown shop').slice(0, 80)}": ${totalAdded} records added, ${totalSkipped} already present (skipped)` });
    res.json({ added, skipped, totalAdded, totalSkipped, source: { name: (b.tenant && b.tenant.name) || '', exportedAt: b.exportedAt || null } });
});

module.exports = { router, mount: '/api/backup', BACKUP_TYPE };
