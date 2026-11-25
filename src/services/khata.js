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
// ── vendor dues (what the shop must pay a vendor by a date) ──
// payments to the vendor recorded after `since`. A payment made at the counter together with a purchase (the same
// moment) belongs to that purchase; paying a purchase later (Purchases → Pay) does count.
async function vendorPaidSince(tenantId, partyId, since, db = prisma) {
    const rows = await db.ledgerEntry.findMany({ where: { tenantId, partyId, deletedAt: null, type: { in: ['PAYMENT_OUT', 'CHEQUE'] }, debit: { gt: 0 }, createdAt: { gte: since } }, select: { debit: true, refId: true, createdAt: true } });
    const refs = [...new Set(rows.map(r => r.refId).filter(Boolean))];
    const purchases = refs.length ? await db.ledgerEntry.findMany({ where: { tenantId, partyId, deletedAt: null, type: 'PURCHASE', refId: { in: refs } }, select: { refId: true, createdAt: true } }) : [];
    const madeAt = new Map(purchases.map(p => [p.refId, p.createdAt.getTime()]));
    const withPurchase = r => madeAt.has(r.refId) && Math.abs(r.createdAt.getTime() - madeAt.get(r.refId)) <= 10000;
    return rows.filter(r => !withPurchase(r)).reduce((s, r) => s + N(r.debit), 0);
}
// Dues are paid off oldest first by the payments made after the first of them. The walk runs over every due that is
// not cancelled (PAID ones included), so a payment that already paid one due is never counted again for the next.
// A vendor who is owed nothing has nothing due.
async function settleDues(tenantId, partyId, db = prisma) {
    const dues = await db.vendorDue.findMany({ where: { tenantId, partyId, deletedAt: null, status: { in: ['PENDING', 'PAID'] } }, orderBy: [{ createdAt: 'asc' }] });
    if (!dues.some(d => d.status === 'PENDING')) return 0;
    const balance = await ledger.balance(tenantId, partyId, true, db);
    let paid = await vendorPaidSince(tenantId, partyId, dues[0].createdAt, db);
    let n = 0;
    for (const d of dues) {
        const amount = N(d.amount);
        const covered = paid >= amount;
        paid = Math.max(0, paid - amount);
        if (d.status === 'PENDING' && (covered || balance <= 0)) {
            await db.vendorDue.update({ where: { id: d.id }, data: { status: 'PAID', paidAt: new Date() } });
            n++;
        }
    }
    return n;
}
// settle every vendor that has open dues (before listing or counting them)
async function settleAllDues(tenantId, db = prisma) {
    const open = await db.vendorDue.findMany({ where: { tenantId, status: 'PENDING', deletedAt: null }, select: { partyId: true } });
    // vendors are independent of each other; inside a transaction (one connection) they go one by one
    const ids = [...new Set(open.map(d => d.partyId))];
    if (db === prisma) await Promise.all(ids.map(pid => settleDues(tenantId, pid, db)));
    else for (const pid of ids) await settleDues(tenantId, pid, db);
}

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

module.exports = { ltr, rs, numericDate, promiseValues, paidSince, settlePromises, vendorPaidSince, settleDues, settleAllDues, receive, today, daysBetween };
