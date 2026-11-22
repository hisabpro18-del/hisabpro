// Cash and bank accounts. Balance of an account = Σ AccountTxn.amount (+ in, − out).
const { prisma } = require('../db');
const { HttpError } = require('../lib/http');
const { B, N } = require('../lib/money');

function post(tx, { tenantId, accountId, type, amount, partyId = null, refId = null, refNo = '', note = '', date = new Date() }) {
    if (!accountId || !amount) return null;
    return tx.accountTxn.create({ data: { tenantId, accountId, type, amount: B(amount), partyId, refId, refNo, note, date } });
}

async function balances(tenantId, db = prisma) {
    const rows = await db.accountTxn.groupBy({ by: ['accountId'], where: { tenantId, deletedAt: null }, _sum: { amount: true } });
    return Object.fromEntries(rows.map(r => [r.accountId, N(r._sum.amount)]));
}

// the account a payment method goes to: the given one (checked), or the default CASH account / first BANK account
async function accountFor(tx, tenantId, method, accountId) {
    if (accountId) {
        const a = await tx.account.findFirst({ where: { id: accountId, tenantId, deletedAt: null } });
        if (!a) throw new HttpError(400, 'That cash/bank account was not found.');
        return a.id;
    }
    const type = method === 'CASH' ? 'CASH' : method === 'WALLET' ? 'WALLET' : 'BANK';
    const list = await tx.account.findMany({ where: { tenantId, deletedAt: null, active: true, type }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
    if (list.length) return list[0].id;
    if (type !== 'CASH') {
        // no bank account yet: money is still recorded, in cash, rather than lost
        const cash = await tx.account.findFirst({ where: { tenantId, deletedAt: null, type: 'CASH' }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
        if (cash) return cash.id;
    }
    const created = await tx.account.create({ data: { tenantId, name: 'Cash in Hand', type: 'CASH', isDefault: true } });
    return created.id;
}

module.exports = { post, balances, accountFor };
