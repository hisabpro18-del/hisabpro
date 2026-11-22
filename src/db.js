// The database client: Postgres in the cloud, the generated SQLite client on a desktop PC. Business code is the same for both.
const config = require('./config');

const { PrismaClient, Prisma } = config.isDesktop ? require('./generated/sqlite') : require('@prisma/client');

// models that carry createdAt / updatedAt (ChangeLog and Counter carry neither, Secret only updatedAt)
const withField = name => new Set(Prisma.dmmf.datamodel.models.filter(m => m.fields.some(f => f.name === name)).map(m => m.name));
const HAS_CREATED = withField('createdAt'), HAS_UPDATED = withField('updatedAt');

const stamp = (model, data, isCreate) => {
    if (!data) return;
    const now = new Date();
    // a value already present is kept: synced rows keep the time they were changed on the PC or server that made them
    if (isCreate && HAS_CREATED.has(model) && data.createdAt === undefined) data.createdAt = now;
    if (HAS_UPDATED.has(model) && data.updatedAt === undefined) data.updatedAt = now;
};

const base = new PrismaClient(config.isDesktop ? {} : { transactionOptions: { maxWait: 10000, timeout: 30000 } });
const prisma = base.$extends({
    query: {
        $allModels: {
            create({ model, args, query }) { stamp(model, args.data, true); return query(args); },
            createMany({ model, args, query }) { for (const d of [].concat(args.data || [])) stamp(model, d, true); return query(args); },
            update({ model, args, query }) { stamp(model, args.data, false); return query(args); },
            updateMany({ model, args, query }) { stamp(model, args.data, false); return query(args); },
            upsert({ model, args, query }) { stamp(model, args.create, true); stamp(model, args.update, false); return query(args); },
        },
    },
});

// Case-insensitive "contains": Postgres needs mode insensitive; SQLite LIKE already ignores case (ASCII)
const ci = q => (config.isDesktop ? { contains: q } : { contains: q, mode: 'insensitive' });

// All writes of one client take turns (the same lock the sync trigger takes), so running numbers never collide and a
// stock or balance check is not raced by a second screen. SQLite has one writer anyway.
async function lockTenant(tx, tenantId) {
    if (config.isDesktop) return;
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', 'hp:' + tenantId);
}

// Run fn(tx) in one transaction holding the client's lock
function withTx(tenantId, fn, opts) {
    return prisma.$transaction(async tx => {
        await lockTenant(tx, tenantId);
        return fn(tx);
    }, { maxWait: 15000, timeout: 30000, ...opts });
}

// field types of every model (used by sync to turn JSON back into dates and BigInts)
const MODELS = Object.fromEntries(Prisma.dmmf.datamodel.models.map(m => [m.name, m.fields.filter(f => f.kind === 'scalar').map(f => ({ name: f.name, type: f.type }))]));

module.exports = { prisma, Prisma, ci, lockTenant, withTx, MODELS, isDesktop: config.isDesktop };
