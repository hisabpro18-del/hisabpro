// Stock = Σ StockMovement.qty per product (base units). Never stored, so movements made on two offline PCs simply add up.
const { prisma } = require('../db');
const { B } = require('../lib/money');
const Calc = require('../../public/js/shared/calc');

// { productId: qty } for the given products (all when productIds is omitted)
async function levels(tenantId, productIds, db = prisma) {
    const where = { tenantId, deletedAt: null };
    if (productIds) where.productId = { in: productIds };
    const rows = await db.stockMovement.groupBy({ by: ['productId'], where, _sum: { qty: true } });
    const out = {};
    for (const r of rows) out[r.productId] = Calc.q3(r._sum.qty || 0);
    return out;
}

async function level(tenantId, productId, db = prisma) {
    return (await levels(tenantId, [productId], db))[productId] || 0;
}

// one movement (qty is + in / − out, in base units)
function move(tx, { tenantId, productId, qty, type, unitCost = 0, refId = null, refNo = '', note = '', date = new Date(), userId = null }) {
    return tx.stockMovement.create({ data: { tenantId, productId, qty: Calc.q3(qty), type, unitCost: B(unitCost), refId, refNo, note, date, userId } });
}

module.exports = { levels, level, move };
