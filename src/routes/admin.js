// The super admin: clients, their users (only the super admin creates and edits users), plans, access periods, desktop PCs,
// "Open workspace" and the activity log of every client.
const express = require('express');
const bcrypt = require('bcryptjs');
const { prisma, withTx, ci } = require('../db');
const { HttpError, str, need, isEmail, oneOf, bool } = require('../lib/http');
const { authenticate, requireSuper, signWorkspaceToken, forgetUser, forgetTenant } = require('../auth');
const { audit } = require('../audit');
const { checkNewPassword } = require('./auth');
const { seedTenant } = require('../services/tenant');
const settings = require('../services/settings');
const limits = require('../limits');
const maintenance = require('../services/maintenance');
const Perms = require('../../public/js/shared/permissions');
const Plans = require('../../public/js/shared/plans');
const Access = require('../../public/js/shared/access');

const router = express.Router();
router.use(authenticate, requireSuper);

const userView = u => ({
    id: u.id, email: u.email, name: u.name, role: u.role, permissions: Perms.parse(u.permissions), active: u.active,
    locked: !!(u.lockedUntil && u.lockedUntil > new Date()), mustChangePassword: u.mustChangePassword, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
});
const accessText = t => (t.accessEndsAt ? `${t.accessCount} ${String(t.accessUnit).toLowerCase()}(s), last day ${Access.pkDay(t.accessEndsAt)}` : 'no time limit');
const planOf = v => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    if (!Plans.plan(v)) throw new HttpError(400, 'Choose Starter, Pro, Enterprise, or no plan.');
    return v;
};
function period(unit, count, startDay) {
    unit = oneOf(unit, Access.UNITS, 'Period');
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > Access.MAX_COUNT[unit]) throw new HttpError(400, `Enter 1 to ${Access.MAX_COUNT[unit]} ${unit === 'YEAR' ? 'years' : 'months'}.`);
    const start = /^\d{4}-\d{2}-\d{2}$/.test(startDay || '') ? startDay : Access.pkDay(new Date());
    return { accessUnit: unit, accessCount: n, accessEndsAt: Access.pkMidnight(Access.endOf(start, unit, n)) };
}

// ── dashboard ──
router.get('/stats', async (req, res) => {
    const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } });
    const now = new Date();
    const by = s => tenants.filter(t => Access.access(t, now).status === s).length;
    const soon = tenants.filter(t => { const a = Access.access(t, now); return a.status === 'ACTIVE' && a.daysLeft <= 15; }).length;
    res.json({
        clients: tenants.length, active: tenants.filter(t => t.active).length, inactive: tenants.filter(t => !t.active).length,
        expiringSoon: soon, grace: by('GRACE'), expired: by('EXPIRED'),
        users: await prisma.user.count({ where: { tenantId: { not: null }, deletedAt: null } }),
        devices: await prisma.device.count({ where: { revokedAt: null } }),
        recent: (await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 })),
    });
});

// ── database storage (free plan: 500 MB) ──
router.get('/storage', async (req, res) => res.json({ ...(await maintenance.storage()), lastCleanup: maintenance.lastRun() }));
router.post('/maintenance', async (req, res) => {
    const r = await maintenance.runAll();
    await audit(req, { action: 'admin.maintenance', summary: `Database clean-up: ${r.changeLog} sync log, ${r.audit} activity, ${r.messages} message and ${r.held} held-cart rows removed${r.errors.length ? ` (${r.errors.length} step(s) failed)` : ''}` });
    res.json({ ...r, storage: await maintenance.storage() });
});

// ── clients ──
router.get('/clients', async (req, res) => {
    const q = str(req.query.q, 100);
    const tenants = await prisma.tenant.findMany({ where: { deletedAt: null, ...(q ? { OR: [{ name: ci(q) }, { mobile: { contains: q } }] } : {}) }, orderBy: { createdAt: 'desc' } });
    const users = await prisma.user.groupBy({ by: ['tenantId'], where: { tenantId: { in: tenants.map(t => t.id) }, deletedAt: null }, _count: true });
    const devices = await prisma.device.groupBy({ by: ['tenantId'], where: { tenantId: { in: tenants.map(t => t.id) }, revokedAt: null }, _count: true });
    const owners = await prisma.user.findMany({ where: { tenantId: { in: tenants.map(t => t.id) }, role: 'OWNER', deletedAt: null }, select: { tenantId: true, email: true } });
    res.json(tenants.map(t => ({
        id: t.id, name: t.name, mobile: t.mobile, active: t.active, inactiveReason: t.inactiveReason, plan: t.plan, createdAt: t.createdAt,
        access: Access.access(t), owner: (owners.find(o => o.tenantId === t.id) || {}).email || '',
        users: (users.find(u => u.tenantId === t.id) || {})._count || 0, devices: (devices.find(d => d.tenantId === t.id) || {})._count || 0,
    })));
});

router.post('/clients', async (req, res) => {
    const b = req.body || {};
    const name = need(b.name, 'Business name', 120);
    const mobile = str(b.mobile, 30);
    const ownerEmail = str(b.ownerEmail, 200).toLowerCase();
    if (!isEmail(ownerEmail)) throw new HttpError(400, 'Enter the owner\'s login email.');
    const ownerName = str(b.ownerName, 100) || name;
    const pw = checkNewPassword(b.ownerPassword, ownerEmail);
    const plan = planOf(b.plan) ?? null;
    const per = b.accessUnit ? period(b.accessUnit, b.accessCount, b.startDay) : {};
    if (await prisma.user.findUnique({ where: { email: ownerEmail } })) throw new HttpError(400, 'That email is already registered.');
    const hash = await bcrypt.hash(pw, 10);
    const tenant = await prisma.$transaction(async tx => {
        const t = await tx.tenant.create({ data: { name, mobile, plan, ...per } });
        await tx.user.create({ data: { tenantId: t.id, email: ownerEmail, name: ownerName, passwordHash: hash, role: 'OWNER', permissions: JSON.stringify(Perms.ALL), mustChangePassword: true } });
        await seedTenant(tx, t.id, { name, mobile });
        return t;
    }, { timeout: 30000 });
    await audit(req, { tenantId: tenant.id, action: 'admin.client_create', summary: `Client "${name}" created; owner login ${ownerEmail}; plan ${plan || 'none'}; access ${accessText(tenant)}` });
    res.json({ id: tenant.id });
});

async function findTenant(id) {
    const t = await prisma.tenant.findUnique({ where: { id } });
    if (!t || t.deletedAt) throw new HttpError(404, 'Client not found.');
    return t;
}

router.get('/clients/:id', async (req, res) => {
    const t = await findTenant(req.params.id);
    res.json({ ...t, access: Access.access(t), usage: await limits.usage(t.id), company: await settings.get(t.id, 'company') });
});

router.put('/clients/:id', async (req, res) => {
    const t = await findTenant(req.params.id);
    const b = req.body || {};
    const data = {};
    if (b.name !== undefined) data.name = need(b.name, 'Business name', 120);
    if (b.mobile !== undefined) data.mobile = str(b.mobile, 30);
    const plan = planOf(b.plan);
    if (plan !== undefined) data.plan = plan;
    if (b.active !== undefined) {
        data.active = bool(b.active);
        data.inactiveReason = data.active ? null : 'ADMIN';
        if (data.active && Access.access(t).status === 'EXPIRED') throw new HttpError(400, 'The access period is over: renew it to switch the client back on.');
    }
    const upd = await prisma.tenant.update({ where: { id: t.id }, data });
    forgetTenant(t.id);
    if (data.name && data.name !== t.name) {
        const company = await settings.get(t.id, 'company');
        if (!company.name || company.name === t.name) await settings.put(t.id, 'company', { name: data.name });
    }
    const what = [data.name && data.name !== t.name && `name "${t.name}" → "${data.name}"`, data.mobile !== undefined && data.mobile !== t.mobile && `mobile → ${data.mobile || '—'}`,
        plan !== undefined && plan !== t.plan && `plan ${t.plan || 'none'} → ${plan || 'none'}`, data.active === false && t.active && 'switched off', data.active === true && !t.active && 'switched on'].filter(Boolean);
    if (what.length) await audit(req, { tenantId: t.id, action: 'admin.client_update', summary: `Client "${upd.name}": ${what.join(', ')}` });
    res.json(upd);
});

// set a new access period, or renew = add the period after the current last day
router.post('/clients/:id/access', async (req, res) => {
    const t = await findTenant(req.params.id);
    const b = req.body || {};
    let data;
    if (b.clear) data = { accessUnit: null, accessCount: null, accessEndsAt: null };
    else {
        let start = b.startDay;
        if (b.renew && t.accessEndsAt) {
            const cur = Access.access(t);
            if (cur.status === 'ACTIVE' || cur.status === 'GRACE') start = new Date(Date.parse(cur.endsOn + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
        }
        data = period(b.unit, b.count, start);
    }
    if (!t.active && t.inactiveReason === 'EXPIRED') { data.active = true; data.inactiveReason = null; }
    const upd = await prisma.tenant.update({ where: { id: t.id }, data });
    forgetTenant(t.id);
    await audit(req, { tenantId: t.id, action: 'admin.client_access', summary: `Access of "${t.name}": ${accessText(t)} → ${accessText(upd)}` });
    res.json({ ...upd, access: Access.access(upd) });
});

// ── users of a client ──
async function findUser(tenantId, uid) {
    const u = await prisma.user.findFirst({ where: { id: uid, tenantId, deletedAt: null } });
    if (!u) throw new HttpError(404, 'User not found.');
    return u;
}
const activeOwners = (tenantId, exceptId) => prisma.user.count({ where: { tenantId, role: 'OWNER', active: true, deletedAt: null, id: { not: exceptId } } });

router.get('/clients/:id/users', async (req, res) => {
    await findTenant(req.params.id);
    res.json((await prisma.user.findMany({ where: { tenantId: req.params.id, deletedAt: null }, orderBy: { createdAt: 'asc' } })).map(userView));
});

router.post('/clients/:id/users', async (req, res) => {
    const t = await findTenant(req.params.id);
    const b = req.body || {};
    const email = str(b.email, 200).toLowerCase();
    if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email (it is the login).');
    const name = need(b.name, 'Full name', 100);
    const role = oneOf(b.role, Perms.ROLES, 'Role');
    const pw = checkNewPassword(b.password, email);
    if (await prisma.user.findUnique({ where: { email } })) throw new HttpError(400, 'That email is already registered.');
    await limits.assertRoom(t.id, 'users');
    const permissions = role === 'OWNER' ? Perms.ALL : (Array.isArray(b.permissions) ? Perms.clean(b.permissions) : Perms.PRESETS[role]);
    const u = await prisma.user.create({ data: { tenantId: t.id, email, name, role, permissions: JSON.stringify(permissions), passwordHash: await bcrypt.hash(pw, 10), mustChangePassword: true } });
    await audit(req, { tenantId: t.id, action: 'user.create', summary: `User ${email} added to "${t.name}" as ${Perms.ROLE_LABEL[role]}` });
    res.json(userView(u));
});

router.patch('/clients/:id/users/:uid', async (req, res) => {
    const t = await findTenant(req.params.id);
    const u = await findUser(t.id, req.params.uid);
    const b = req.body || {};
    const data = {};
    if (b.name !== undefined) data.name = need(b.name, 'Full name', 100);
    if (b.role !== undefined) data.role = oneOf(b.role, Perms.ROLES, 'Role');
    const role = data.role || u.role;
    if (b.permissions !== undefined || data.role) data.permissions = JSON.stringify(role === 'OWNER' ? Perms.ALL : Perms.clean(b.permissions ?? Perms.PRESETS[role]));
    if (b.active !== undefined) data.active = bool(b.active);
    if (b.email !== undefined && str(b.email, 200).toLowerCase() !== u.email) {
        const email = str(b.email, 200).toLowerCase();
        if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email.');
        if (await prisma.user.findUnique({ where: { email } })) throw new HttpError(400, 'That email is already registered.');
        data.email = email;
    }
    const losesOwner = u.role === 'OWNER' && u.active && ((data.role && data.role !== 'OWNER') || data.active === false);
    if (losesOwner && !(await activeOwners(t.id, u.id))) throw new HttpError(400, 'Keep at least one active owner on the account.');
    if (data.active === true && !u.active) await limits.assertRoom(t.id, 'users');
    if (data.email || data.active === false || (data.role && data.role !== u.role) || data.permissions) data.tokenVersion = { increment: 1 };
    const upd = await prisma.user.update({ where: { id: u.id }, data });
    forgetUser(u.id);
    const what = [data.name && data.name !== u.name && 'name', data.email && `login ${u.email} → ${data.email}`, data.role && data.role !== u.role && `role → ${Perms.ROLE_LABEL[data.role]}`,
        data.permissions && 'permissions changed', data.active === false && u.active && 'switched off', data.active === true && !u.active && 'switched on'].filter(Boolean);
    if (what.length) await audit(req, { tenantId: t.id, action: 'user.update', summary: `User ${u.email}: ${what.join(', ')}` });
    res.json(userView(upd));
});

router.post('/clients/:id/users/:uid/reset-password', async (req, res) => {
    const t = await findTenant(req.params.id);
    const u = await findUser(t.id, req.params.uid);
    const pw = checkNewPassword(req.body?.password, u.email);
    const upd = await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(pw, 10), mustChangePassword: true, tokenVersion: { increment: 1 }, failedLogins: 0, lockedUntil: null } });
    forgetUser(u.id);
    await audit(req, { tenantId: t.id, action: 'user.password_reset', summary: `Password reset for ${u.email} (must change at next sign-in; unlocked)` });
    res.json(userView(upd));
});

// ── desktop PCs of a client ──
router.get('/clients/:id/devices', async (req, res) => {
    await findTenant(req.params.id);
    const list = await prisma.device.findMany({ where: { tenantId: req.params.id }, orderBy: { createdAt: 'asc' } });
    res.json(list.map(d => ({ id: d.id, name: d.name, code: d.code, activatedBy: d.activatedBy, appVersion: d.appVersion, lastSeenAt: d.lastSeenAt, lastPushAt: d.lastPushAt, lastPullAt: d.lastPullAt, revokedAt: d.revokedAt, createdAt: d.createdAt })));
});
router.post('/clients/:id/devices/:did/revoke', async (req, res) => {
    const t = await findTenant(req.params.id);
    const d = await prisma.device.findFirst({ where: { id: req.params.did, tenantId: t.id } });
    if (!d) throw new HttpError(404, 'PC not found.');
    if (!d.revokedAt) await prisma.device.update({ where: { id: d.id }, data: { revokedAt: new Date() } });
    await audit(req, { tenantId: t.id, action: 'device.revoke', summary: `Desktop PC "${d.name}" (${d.code}) revoked: it stops working at its next connection` });
    res.json({ ok: true });
});

// ── open a client's workspace as its owner (2 hours) ──
router.post('/clients/:id/workspace', async (req, res) => {
    const t = await findTenant(req.params.id);
    const admin = await prisma.user.findUnique({ where: { id: req.user.id } });
    await audit(req, { tenantId: t.id, action: 'admin.workspace_open', summary: `Administrator opened the workspace of "${t.name}"` });
    res.json({ token: signWorkspaceToken(admin, t.id), name: t.name });
});

// ── activity log (all clients) ──
router.get('/audit', async (req, res) => {
    const where = {};
    if (req.query.tenantId) where.tenantId = String(req.query.tenantId);
    const q = str(req.query.q, 100);
    if (q) where.OR = [{ summary: ci(q) }, { userEmail: ci(q) }, { action: ci(q) }];
    const realDay = v => { const d = new Date(String(v) + 'T00:00:00Z'); return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === String(v); };
    for (const k of ['from', 'to']) if (req.query[k] && !realDay(req.query[k])) throw new HttpError(400, 'Choose a valid date.');
    if (req.query.from || req.query.to) where.createdAt = { ...(req.query.from ? { gte: new Date(req.query.from + 'T00:00:00+05:00') } : {}), ...(req.query.to ? { lt: new Date(new Date(req.query.to + 'T00:00:00+05:00').getTime() + 86400000) } : {}) };
    const rows = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(Number(req.query.limit) || 300, 5000) });
    const names = Object.fromEntries((await prisma.tenant.findMany({ select: { id: true, name: true } })).map(t => [t.id, t.name]));
    const list = rows.map(r => ({ ...r, tenantName: r.tenantId ? names[r.tenantId] || '' : 'HisabPro' }));
    if (req.query.format === 'csv') {
        // a cell a spreadsheet would run as a formula (= + - @, or a leading tab / carriage return) is made plain text
        const cell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
        const csv = ['Time,Client,User,Action,Summary,IP'].concat(list.map(r => [r.createdAt.toISOString(), r.tenantName, r.userEmail, r.action, r.summary, r.ip].map(cell).join(','))).join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="hisabpro-activity.csv"');
        return res.send('﻿' + csv);
    }
    res.json(list);
});

module.exports = { router, mount: '/api/admin', cloudOnly: true };
