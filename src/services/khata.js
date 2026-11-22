// Khata (udhaar) recovery: message values for templates, promise status, and receiving a payment from a customer.
const { prisma } = require('../db');
const { B, N } = require('../lib/money');
const ledger = require('./ledger');
const treasury = require('./treasury');
const numbering = require('./numbering');
const dates = require('../lib/dates');

const LRM = '‎';
// numbers, phones and dates stay left-to-right inside an Urdu sentence (otherwise "0300-1234567" shows as "1234567-0300")
const ltr = v => `${LRM}${v}${LRM}`;
const rs = (paisa, sym = 'Rs') => `${sym} ${(Number(paisa || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const numericDate = ymd => { const [y, m, d] = String(ymd).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };

// values for {placeholders} of a promise reminder
function promiseValues({ party, promise, balance, company, shopName, today, sym = 'Rs' }) {
    const days = Math.round((Date.parse(promise.promisedDate + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
    const d = ltr(numericDate(promise.promisedDate));
    return {
        name: party.name, shop: shopName, amount: ltr(rs(promise.amount, sym)), balance: ltr(rs(balance, sym)), date: d,
        when: days === 0 ? 'آج' : days < 0 ? `${d} کو` : `${d} تک`,
        whenEn: days === 0 ? 'today' : days < 0 ? `on ${numericDate(promise.promisedDate)}` : `by ${numericDate(promise.promisedDate)}`,
        phone: company && company.phone ? ltr(company.phone) : null,
    };
}

// What has been paid towards a promise: money in from the customer since the promise was made. Money paid at the counter
// for a new sale (the PAYMENT_IN that shares the sale's refId) pays for those goods, not the old khata, so it does not count.
async function paidSince(tenantId, partyId, since, db = prisma) {
    const rows = await db.ledgerEntry.findMany({ where: { tenantId, partyId, deletedAt: null, type: { in: ['PAYMENT_IN', 'CHEQUE'] }, credit: { gt: 0 }, date: { gte: since } }, select: { credit: true, refId: true } });
    const refs = [...new Set(rows.map(r => r.refId).filter(Boolean))];
    const forSales = refs.length ? new Set((await db.ledgerEntry.findMany({ where: { tenantId, partyId, deletedAt: null, type: 'SALE', refId: { in: refs } }, select: { refId: true } })).map(r => r.refId)) : new Set();
    return rows.filter(r => !forSales.has(r.refId)).reduce((s, r) => s + N(r.credit), 0);
}

// a promise that has been paid in full (or the customer owes nothing any more) becomes KEPT by itself
async function settlePromises(tenantId, partyId, db = prisma) {
    const open = await db.paymentPromise.findMany({ where: { tenantId, partyId, status: 'PENDING', deletedAt: null } });
    if (!open.length) return 0;
    const balance = await ledger.balance(tenantId, partyId, false, db);
    let n = 0;
    for (const p of open) {
        const paid = await paidSince(tenantId, partyId, p.createdAt, db);
        if (paid >= N(p.amount) || balance <= 0) {
            await db.paymentPromise.update({ where: { id: p.id }, data: { status: 'KEPT', keptAt: new Date() } });
            n++;
        }
    }
    return n;
}

// money in from a customer at the counter or the khata page: a Payment (REC-, same counter as Finance → Payments In),
// a khata credit and the cash/bank account entry, in the caller's transaction
async function receive(tx, { tenantId, party, amount, method = 'CASH', accountId = null, note = '', userId = null, date = new Date() }) {
    const acc = await treasury.accountFor(tx, tenantId, method, accountId);
    const number = await numbering.number(tx, tenantId, 'paymentIn', 'REC-');
    const p = await tx.payment.create({ data: { tenantId, number, date, direction: 'IN', partyId: party.id, partyName: party.name, amount: B(amount), method, accountId: acc, reference: '', note: note || 'Khata payment', userId } });
    await ledger.post(tx, { tenantId, partyId: party.id, type: 'PAYMENT_IN', credit: amount, refId: p.id, refNo: number, note: note || 'Payment received', date });
    await treasury.post(tx, { tenantId, accountId: acc, type: 'PAYMENT_IN', amount, partyId: party.id, refId: p.id, refNo: number, note: [party.name, note].filter(Boolean).join(' — '), date });
    return p;
}

const today = (tz = 'Asia/Karachi') => dates.ymd(new Date(), tz);
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

module.exports = { ltr, rs, numericDate, promiseValues, paidSince, settlePromises, receive, today, daysBetween };
