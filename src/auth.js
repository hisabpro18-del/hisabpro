// Sign-in tokens and the checks every API route uses.
const jwt = require('jsonwebtoken');
const config = require('./config');
const { prisma } = require('./db');
const { HttpError } = require('./lib/http');
const Perms = require('../public/js/shared/permissions');
const Access = require('../public/js/shared/access');

const secret = () => {
    if (!config.JWT_SECRET || config.JWT_SECRET.length < 32) throw new Error('JWT_SECRET is missing or too short (npm run gen:keys).');
    return config.JWT_SECRET;
};

// tv = the user's tokenVersion when signed; bumping it (password change, role change, disable) ends every older token
function signToken(user) {
    return jwt.sign({ id: user.id, tid: user.tenantId || null, role: user.role, tv: user.tokenVersion || 0 }, secret(), { expiresIn: '12h' });
}
// The super admin working inside a client ("Open workspace"): acts as that client's owner for 2 hours
function signWorkspaceToken(admin, tenantId) {
    return jwt.sign({ id: admin.id, tid: tenantId, role: 'OWNER', tv: admin.tokenVersion || 0, imp: admin.id }, secret(), { expiresIn: '2h' });
}

// Requests that are not reads, but that a read-only client still needs (sign out, own password)
const READ = new Set(['GET', 'HEAD', 'OPTIONS']);
const READ_ONLY_ALLOWED = [/^\/api\/auth\/(logout|password)$/];

// extra checks a desktop PC adds (offline too long, device revoked): set by src/sync/client.js
let desktopGuard = null;
const setDesktopGuard = fn => { desktopGuard = fn; };

// ── who is asking: the user and the client of a token, read together and remembered for AUTH_TTL ──
// Requests that arrive together share one pair of reads (the promise is kept, not only the result).
const AUTH_TTL = 10000;
const seen = new Map(); // `${userId}|${tenantId}` → { at, promise }
function whoIs(p) {
    const key = `${p.id}|${p.tid || ''}`;
    const hit = seen.get(key);
    if (hit && Date.now() - hit.at < AUTH_TTL) return hit.promise;
    const promise = Promise.all([
        prisma.user.findUnique({ where: { id: p.id } }),
        p.tid ? prisma.tenant.findUnique({ where: { id: p.tid } }) : null,
    ]).then(([user, tenant]) => ({ user, tenant }));
    promise.catch(() => seen.delete(key));
    if (seen.size > 5000) seen.clear();
    seen.set(key, { at: Date.now(), promise });
    return promise;
}
// a user or client changed (password, access, removed): the next request reads them again
const forgetUser = id => { for (const k of seen.keys()) if (k.startsWith(id + '|')) seen.delete(k); };
const forgetTenant = id => { for (const k of seen.keys()) if (k.endsWith('|' + id)) seen.delete(k); };

async function authenticate(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next(new HttpError(401, 'Please sign in.'));
    let p;
    try { p = jwt.verify(token, secret()); } catch { return next(new HttpError(401, 'Your session has ended. Please sign in again.')); }

    // user and client are read together (the token names both), and remembered for a few seconds: a screen asks for several
    // things at once, and each would otherwise wait for its own two database reads. A changed password or a removed user
    // still ends the session at once on this server (forgetUser), and within AUTH_TTL anywhere else.
    const { user, tenant: tokenTenant } = await whoIs(p);
    if (!user || !user.active || user.deletedAt || user.tokenVersion !== (p.tv || 0)) { forgetUser(p.id); return next(new HttpError(401, 'Your session has ended. Please sign in again.')); }

    if (p.imp) {
        // only the super admin can hold a workspace token
        if (user.role !== 'SUPER_ADMIN') return next(new HttpError(401, 'Your session has ended. Please sign in again.'));
        req.user = { id: user.id, email: user.email, name: user.name, role: 'OWNER', tenantId: p.tid, permissions: Perms.ALL, impersonatedBy: user.id, adminEmail: user.email };
    } else {
        req.user = { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId, permissions: user.role === 'OWNER' ? Perms.ALL : Perms.parse(user.permissions), mustChangePassword: user.mustChangePassword };
    }

    if (req.user.tenantId) {
        const tenant = tokenTenant && tokenTenant.id === req.user.tenantId ? tokenTenant : await prisma.tenant.findUnique({ where: { id: req.user.tenantId } });
        if (!tenant || tenant.deletedAt) return next(new HttpError(401, 'Your account was not found.'));
        req.tenant = tenant;
        const m = p.imp ? { mode: 'FULL' } : Access.mode(tenant);
        if (m.mode === 'BLOCKED') return next(new HttpError(401, m.message));
        const path = req.originalUrl.split('?')[0];
        if (m.mode === 'READ_ONLY') {
            req.readOnly = true;
            if (!READ.has(req.method) && !READ_ONLY_ALLOWED.some(re => re.test(path))) return next(new HttpError(403, m.message, { readOnly: true }));
        }
        if (desktopGuard && !READ.has(req.method)) {
            const msg = desktopGuard(path);
            if (msg) return next(new HttpError(403, msg, { offlineLimit: true }));
        }
    }
    next();
}

const requireSuper = (req, res, next) => (req.user && req.user.role === 'SUPER_ADMIN' ? next() : next(new HttpError(403, 'Only the HisabPro administrator can do this.')));
const requireTenant = (req, res, next) => (req.user && req.user.tenantId ? next() : next(new HttpError(403, 'Open a client workspace first.')));
// any one of the keys is enough
const can = (...keys) => (req, res, next) => {
    if (!req.user || !req.user.tenantId) return next(new HttpError(403, 'Open a client workspace first.'));
    if (keys.some(k => Perms.has(req.user, k))) return next();
    next(new HttpError(403, 'You do not have permission for this. Ask the shop owner or HisabPro to change your access.'));
};

module.exports = { signToken, signWorkspaceToken, authenticate, requireSuper, requireTenant, can, setDesktopGuard, forgetUser, forgetTenant };
