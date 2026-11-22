// Plan limits (users, desktop PCs, products). Checked when something is ADDED; a client over its limit after a plan change
// keeps what it has but cannot add more.
const { prisma } = require('./db');
const { HttpError } = require('./lib/http');
const Plans = require('../public/js/shared/plans');

const COUNT = {
    users: (tenantId, db = prisma) => db.user.count({ where: { tenantId, active: true, deletedAt: null } }),
    devices: (tenantId, db = prisma) => db.device.count({ where: { tenantId, revokedAt: null } }),
    products: (tenantId, db = prisma) => db.product.count({ where: { tenantId, deletedAt: null, type: { not: 'VARIANT' } } }),
};
const NOUN = { users: 'users', devices: 'desktop PCs', products: 'products' };

async function assertRoom(tenantId, kind, adding = 1, db = prisma) {
    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
    const limit = Plans.limitOf(tenant && tenant.plan, kind);
    if (limit === null || limit === undefined) return;
    const used = await COUNT[kind](tenantId, db); // db = the caller's transaction, if any (never the base client inside one)
    if (used + adding <= limit) return;
    const p = Plans.plan(tenant.plan);
    throw new HttpError(403, `The ${p.name} plan allows ${limit} ${NOUN[kind]} and ${used} are in use. Contact HisabPro to move to a bigger plan.`);
}

async function usage(tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
    const out = {};
    for (const k of Object.keys(COUNT)) out[k] = { used: await COUNT[k](tenantId), limit: Plans.limitOf(tenant && tenant.plan, k) };
    return out;
}

module.exports = { assertRoom, usage };
