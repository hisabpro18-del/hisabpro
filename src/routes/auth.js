// Sign in, who am I, change password, sign out.
const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { prisma } = require('../db');
const { HttpError, str } = require('../lib/http');
const { signToken, authenticate, forgetUser } = require('../auth');
const { audit } = require('../audit');
const settings = require('../services/settings');
const Perms = require('../../public/js/shared/permissions');
const Access = require('../../public/js/shared/access');

const MAX_FAILS = 5, LOCK_MIN = 15;
const DUMMY_HASH = bcrypt.hashSync('not-a-password', 10); // an unknown email takes as long as a wrong password
const router = express.Router();

function checkNewPassword(pw, email) {
    const s = String(pw || '');
    if (s.length < 8) throw new HttpError(400, 'The password must be at least 8 characters.');
    if (s.length > 200) throw new HttpError(400, 'The password is too long.');
    if (email && s.toLowerCase() === String(email).toLowerCase()) throw new HttpError(400, 'The password cannot be the email.');
    return s;
}

// What the browser needs to know about the signed-in user
async function me(req) {
    const u = req.user;
    const out = {
        id: u.id, email: u.email, name: u.name, role: u.role, roleLabel: Perms.ROLE_LABEL[u.role] || u.role,
        permissions: u.permissions || [], tenantId: u.tenantId, impersonatedBy: u.impersonatedBy || null,
        mustChangePassword: !!u.mustChangePassword, mode: config.MODE,
    };
    if (u.tenantId) {
        const all = await settings.getAll(u.tenantId);
        out.tenant = { id: req.tenant.id, name: all.company.name || req.tenant.name, plan: req.tenant.plan, access: Access.access(req.tenant), readOnly: !!req.readOnly };
        out.settings = { company: all.company, receipt: all.receipt, numbering: all.numbering, localization: all.localization, pos: all.pos };
    }
    return out;
}

// The password check of every sign-in (web, desktop PC and PC activation): an unknown email takes as long as a wrong
// password, and 5 wrong passwords lock the user for 15 minutes. Throws 401; returns when the password is right.
async function checkPassword(user, password, req, email) {
    const fail = msg => { throw new HttpError(401, msg || 'Wrong email or password.'); };
    if (!user || user.deletedAt) { await bcrypt.compare(password, DUMMY_HASH); fail(); }
    if (user.lockedUntil && user.lockedUntil > new Date()) fail(`Too many wrong passwords. Try again after ${Math.ceil((user.lockedUntil - Date.now()) / 60000)} minutes.`);
    if (await bcrypt.compare(password, user.passwordHash)) return;
    const fails = user.failedLogins + 1;
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: fails >= MAX_FAILS ? 0 : fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60000) : null } });
    await audit({ ip: req.ip, user: { id: user.id, email: user.email, tenantId: user.tenantId } }, { action: 'auth.login_failed', summary: `Wrong password for ${email}${fails >= MAX_FAILS ? ` — locked for ${LOCK_MIN} minutes` : ''}`, tenantId: user.tenantId });
    fail();
}

router.post('/login', async (req, res) => {
    const email = str(req.body?.email, 200).toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) throw new HttpError(400, 'Enter your email and password.');
    const user = await prisma.user.findUnique({ where: { email } });
    const fail = msg => { throw new HttpError(401, msg || 'Wrong email or password.'); };
    if (user && !user.deletedAt && config.isDesktop && user.role === 'SUPER_ADMIN') fail('The administrator signs in on the web.');
    await checkPassword(user, password, req, email);
    if (!user.active) fail('This user has been switched off. Contact your shop owner or HisabPro.');
    if (user.tenantId) {
        const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
        const m = Access.mode(tenant);
        if (m.mode === 'BLOCKED') fail(m.message);
    }
    const upd = await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await audit({ ip: req.ip, user: { id: user.id, email: user.email, tenantId: user.tenantId } }, { action: 'auth.login', summary: `Signed in${config.isDesktop ? ' on a desktop PC' : ''}`, tenantId: user.tenantId });
    res.json({ token: signToken(upd) });
});

router.get('/me', authenticate, async (req, res) => res.json(await me(req)));

router.post('/password', authenticate, async (req, res) => {
    if (config.isDesktop) throw new HttpError(400, 'Change your password on the web (HisabPro online); this PC receives it with the next sync.');
    if (req.user.impersonatedBy) throw new HttpError(400, 'Not available in a client workspace.');
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!(await bcrypt.compare(String(req.body?.current || ''), user.passwordHash))) throw new HttpError(400, 'The current password is wrong.');
    const pw = checkNewPassword(req.body?.password, user.email);
    if (await bcrypt.compare(pw, user.passwordHash)) throw new HttpError(400, 'Choose a password different from the current one.');
    const upd = await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(pw, 10), mustChangePassword: false, tokenVersion: { increment: 1 } } });
    forgetUser(user.id);
    await audit(req, { action: 'auth.password_change', summary: 'Changed own password (signed out everywhere else)' });
    res.json({ token: signToken(upd) });
});

// Dashboard → Show details: the password of one of the shop's owners (the admin), so a cashier or manager at the same
// computer cannot see the figures. 5 wrong tries wait 15 minutes. Wrong is a 400: a 401 would sign the user out.
const unlockFails = new Map(); // userId → { n, until }
router.post('/unlock', authenticate, async (req, res) => {
    const password = String(req.body?.password || '');
    if (!password) throw new HttpError(400, 'Enter the admin password.');
    const key = req.user.id;
    const f = unlockFails.get(key) || { n: 0, until: 0 };
    if (f.until > Date.now()) throw new HttpError(400, `Too many wrong passwords. Try again after ${Math.ceil((f.until - Date.now()) / 60000)} minutes.`);
    const owners = req.user.tenantId ? await prisma.user.findMany({ where: { tenantId: req.user.tenantId, role: 'OWNER', active: true, deletedAt: null } }) : [];
    // the HisabPro administrator working in a client's workspace uses their own password
    if (req.user.impersonatedBy) owners.push(await prisma.user.findUnique({ where: { id: req.user.impersonatedBy } }));
    for (const u of owners.filter(Boolean)) {
        if (await bcrypt.compare(password, u.passwordHash)) {
            unlockFails.delete(key);
            await audit(req, { action: 'auth.dashboard_unlock', summary: 'Dashboard details shown with the admin password' });
            return res.json({ ok: true });
        }
    }
    const n = f.n + 1;
    unlockFails.set(key, n >= MAX_FAILS ? { n: 0, until: Date.now() + LOCK_MIN * 60000 } : { n, until: 0 });
    if (unlockFails.size > 5000) unlockFails.clear();
    await audit(req, { action: 'auth.dashboard_unlock_failed', summary: `Wrong admin password on the dashboard${n >= MAX_FAILS ? ` — blocked for ${LOCK_MIN} minutes` : ''}` });
    throw new HttpError(400, 'Wrong admin password.');
});

router.post('/logout', authenticate, async (req, res) => {
    await audit(req, { action: 'auth.logout', summary: 'Signed out' });
    res.json({ ok: true });
});

module.exports = { router, mount: '/api/auth', checkNewPassword, checkPassword, me };
