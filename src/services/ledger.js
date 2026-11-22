// Khata (party ledgers). Customer balance = Σ(debit − credit): what they owe us. Vendor balance = Σ(credit − debit): what we owe.
const { prisma } = require('../db');
const { B, N } = require('../lib/money');

function post(tx, { tenantId, partyId, type, debit = 0, credit = 0, refId = null, refNo = '', note = '', date = new Date() }) {
    if (!partyId || (!debit && !credit)) return null;
    return tx.ledgerEntry.create({ data: { tenantId, partyId, type, debit: B(debit), credit: B(credit), refId, refNo, note, date } });
}

// { partyId: balance in paisa } — for customers positive = receivable, for vendors positive = payable
async function balances(tenantId, { partyIds, type } = {}, db = prisma) {
    const where = { tenantId, deletedAt: null };
    if (partyIds) where.partyId = { in: partyIds };
    else if (type) where.partyId = { in: (await db.party.findMany({ where: { tenantId, type }, select: { id: true } })).map(p => p.id) };
    const rows = await db.ledgerEntry.groupBy({ by: ['partyId'], where, _sum: { debit: true, credit: true } });
    let vendors = null;
    if (type === undefined) vendors = new Set((await db.party.findMany({ where: { tenantId, type: 'VENDOR' }, select: { id: true } })).map(p => p.id));
    const out = {};
    for (const r of rows) {
        const d = N(r._sum.debit), c = N(r._sum.credit);
        const isVendor = type ? type === 'VENDOR' : vendors.has(r.partyId);
        out[r.partyId] = isVendor ? c - d : d - c;
    }
    return out;
}

async function balance(tenantId, partyId, isVendor, db = prisma) {
    return (await balances(tenantId, { partyIds: [partyId], type: isVendor ? 'VENDOR' : 'CUSTOMER' }, db))[partyId] || 0;
}

// entries with a running balance (oldest first)
async function statement(tenantId, party, db = prisma) {
    const rows = await db.ledgerEntry.findMany({ where: { tenantId, partyId: party.id, deletedAt: null }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] });
    let run = 0;
    const vendor = party.type === 'VENDOR';
    return rows.map(r => {
        const d = N(r.debit), c = N(r.credit);
        run += vendor ? c - d : d - c;
        return { id: r.id, date: r.date, type: r.type, refId: r.refId, refNo: r.refNo, note: r.note, debit: d, credit: c, balance: run };
    });
}

module.exports = { post, balances, balance, statement };
