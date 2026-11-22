// Day Close (Z-report): what the cash drawer should hold for a day vs what was counted, plus the day's sales picture.
const express = require('express');
const { prisma } = require('../db');
const { HttpError, str } = require('../lib/http');
const { B, N, paisa } = require('../lib/money');
const { authenticate, can } = require('../auth');
const { audit } = require('../audit');
const settings = require('../services/settings');
const treasury = require('../services/treasury');
const state = require('../sync/state');
const dates = require('../lib/dates');

const router = express.Router();
router.use(authenticate);
const ALLOW = can('sales.create', 'finance.manage');

async function compute(t, day, accountId) {
    const tz = (await settings.get(t, 'localization')).timezone || 'Asia/Karachi';
    const r = dates.range('custom', { from: day, to: day, tz });
    const acc = accountId ? await prisma.account.findFirst({ where: { id: accountId, tenantId: t, deletedAt: null } }) : null;
    const accId = acc ? acc.id : await prisma.$transaction(tx => treasury.accountFor(tx, t, 'CASH', null));
    const before = await prisma.accountTxn.aggregate({ where: { tenantId: t, accountId: accId, deletedAt: null, date: { lt: r.from } }, _sum: { amount: true } });
    const txns = await prisma.accountTxn.findMany({ where: { tenantId: t, accountId: accId, deletedAt: null, date: { gte: r.from, lt: r.to } } });
    const byType = {};
    for (const x of txns) byType[x.type] = (byType[x.type] || 0) + N(x.amount);
    const cashIn = txns.filter(x => N(x.amount) > 0).reduce((s, x) => s + N(x.amount), 0);
    const cashOut = -txns.filter(x => N(x.amount) < 0).reduce((s, x) => s + N(x.amount), 0);
    const opening = N(before._sum.amount);
    const sales = await prisma.sale.findMany({ where: { tenantId: t, deletedAt: null, date: { gte: r.from, lt: r.to } }, select: { id: true, number: true, total: true, due: true, mode: true } });
    const pays = await prisma.salePayment.groupBy({ by: ['method'], where: { tenantId: t, deletedAt: null, saleId: { in: sales.map(s => s.id) } }, _sum: { amount: true } });
    const returns = await prisma.saleReturn.aggregate({ where: { tenantId: t, deletedAt: null, date: { gte: r.from, lt: r.to } }, _sum: { total: true }, _count: true });
    const expenses = await prisma.expense.aggregate({ where: { tenantId: t, deletedAt: null, date: { gte: r.from, lt: r.to } }, _sum: { amount: true }, _count: true });
    const payIn = await prisma.payment.aggregate({ where: { tenantId: t, deletedAt: null, direction: 'IN', date: { gte: r.from, lt: r.to } }, _sum: { amount: true }, _count: true });
    const payOut = await prisma.payment.aggregate({ where: { tenantId: t, deletedAt: null, direction: 'OUT', date: { gte: r.from, lt: r.to } }, _sum: { amount: true }, _count: true });
    const nums = sales.map(s => s.number).sort();
    return {
        day, accountId: accId, accountName: acc ? acc.name : 'Cash in Hand', opening, cashIn, cashOut, expected: opening + cashIn - cashOut,
        byType,
        sales: {
            count: sales.length, total: sales.reduce((s, x) => s + N(x.total), 0), credit: sales.reduce((s, x) => s + N(x.due), 0),
            byMethod: Object.fromEntries(pays.map(p => [p.method, N(p._sum.amount)])), first: nums[0] || '', last: nums[nums.length - 1] || '',
        },
        returns: { count: returns._count, total: N(returns._sum.total) },
        expenses: { count: expenses._count, total: N(expenses._sum.amount) },
        paymentsIn: { count: payIn._count, total: N(payIn._sum.amount) },
        paymentsOut: { count: payOut._count, total: N(payOut._sum.amount) },
    };
}

router.get('/preview', ALLOW, async (req, res) => {
    const t = req.user.tenantId;
    const tz = (await settings.get(t, 'localization')).timezone || 'Asia/Karachi';
    const day = dates.isDay(req.query.day) ? req.query.day : dates.ymd(new Date(), tz);
    const out = await compute(t, day, str(req.query.accountId, 60) || null);
    out.closes = (await prisma.dayClose.findMany({ where: { tenantId: t, day, deletedAt: null }, orderBy: { createdAt: 'desc' } })).map(c => ({ id: c.id, counted: N(c.counted), expected: N(c.expected), difference: N(c.difference), userName: c.userName, createdAt: c.createdAt, note: c.note }));
    res.json(out);
});

router.post('/', ALLOW, async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    if (!dates.isDay(b.day)) throw new HttpError(400, 'Choose the day.');
    if (b.counted === undefined || b.counted === '') throw new HttpError(400, 'Enter the cash you counted in the drawer.');
    const counted = paisa(b.counted, 'Counted cash');
    const c = await compute(t, b.day, str(b.accountId, 60) || null);
    const row = await prisma.dayClose.create({ data: {
        tenantId: t, day: b.day, accountId: c.accountId, openingCash: B(c.opening), cashIn: B(c.cashIn), cashOut: B(c.cashOut), expected: B(c.expected), counted: B(counted),
        difference: B(counted - c.expected), salesTotal: B(c.sales.total), salesCount: c.sales.count, summary: JSON.stringify(c), note: str(b.note, 300),
        userId: req.user.id, userName: req.user.name || req.user.email, deviceId: state.deviceId(),
    } });
    const diff = counted - c.expected;
    await audit(req, { action: 'dayclose.save', summary: `Day close ${b.day}: expected ${(c.expected / 100).toFixed(2)}, counted ${(counted / 100).toFixed(2)} (${diff === 0 ? 'exact' : diff > 0 ? `over by ${(diff / 100).toFixed(2)}` : `short by ${(-diff / 100).toFixed(2)}`})` });
    res.json({ id: row.id, difference: diff, expected: c.expected, counted });
});

router.get('/', ALLOW, async (req, res) => {
    const list = await prisma.dayClose.findMany({ where: { tenantId: req.user.tenantId, deletedAt: null }, orderBy: [{ day: 'desc' }, { createdAt: 'desc' }], take: 120 });
    res.json(list.map(c => ({ id: c.id, day: c.day, opening: N(c.openingCash), cashIn: N(c.cashIn), cashOut: N(c.cashOut), expected: N(c.expected), counted: N(c.counted), difference: N(c.difference), salesTotal: N(c.salesTotal), salesCount: c.salesCount, userName: c.userName, note: c.note, createdAt: c.createdAt })));
});

module.exports = { router, mount: '/api/day-close' };
