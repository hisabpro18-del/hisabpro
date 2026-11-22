// Khata (udhaar) recovery: the khata book, a customer's statement, receiving payments, payment promises (وعدے),
// reminders by WhatsApp (one click) or SMS (gateway), the message log and the messaging settings.
const express = require('express');
const { prisma, withTx, ci, isDesktop } = require('../db');
const { HttpError, str, need, oneOf } = require('../lib/http');
const { N, paisa } = require('../lib/money');
const { authenticate, can } = require('../auth');
const { audit } = require('../audit');
const ledger = require('../services/ledger');
const settings = require('../services/settings');
const sms = require('../services/sms');
const K = require('../services/khata');
const dates = require('../lib/dates');

const router = express.Router();
router.use(authenticate);

const VIEW = can('parties.manage', 'sales.create', 'finance.manage', 'reports.view');
const MANAGE = can('parties.manage', 'finance.manage', 'sales.create');
const RECEIVE = can('sales.create', 'parties.manage', 'finance.manage');
const tzOf = async t => (await settings.get(t, 'localization')).timezone || 'Asia/Karachi';

async function customer(t, id) {
    const p = await prisma.party.findFirst({ where: { id: String(id || ''), tenantId: t, type: 'CUSTOMER', deletedAt: null } });
    if (!p) throw new HttpError(404, 'Customer not found.');
    return p;
}

// ── khata book ──
router.get('/summary', VIEW, async (req, res) => {
    const t = req.user.tenantId;
    const tz = await tzOf(t);
    const today = K.today(tz);
    const parties = await prisma.party.findMany({ where: { tenantId: t, type: 'CUSTOMER', deletedAt: null }, orderBy: { name: 'asc' } });
    const bal = await ledger.balances(t, { type: 'CUSTOMER' });
    const lastPay = await prisma.ledgerEntry.groupBy({ by: ['partyId'], where: { tenantId: t, deletedAt: null, type: { in: ['PAYMENT_IN', 'CHEQUE'] }, credit: { gt: 0 } }, _max: { date: true } });
    const lastSale = await prisma.ledgerEntry.groupBy({ by: ['partyId'], where: { tenantId: t, deletedAt: null, type: 'SALE' }, _max: { date: true } });
    const promises = await prisma.paymentPromise.findMany({ where: { tenantId: t, status: 'PENDING', deletedAt: null }, orderBy: { promisedDate: 'asc' } });
    const dayRange = dates.range('today', { tz });
    const collected = await prisma.ledgerEntry.aggregate({ where: { tenantId: t, deletedAt: null, type: { in: ['PAYMENT_IN', 'CHEQUE'] }, credit: { gt: 0 }, date: { gte: dayRange.from, lt: dayRange.to } }, _sum: { credit: true } });
    const sentToday = await prisma.messageLog.count({ where: { tenantId: t, deletedAt: null, createdAt: { gte: dayRange.from, lt: dayRange.to } } });
    const rows = parties.map(p => {
        const pr = promises.find(x => x.partyId === p.id);
        const lp = (lastPay.find(x => x.partyId === p.id) || {})._max, ls = (lastSale.find(x => x.partyId === p.id) || {})._max;
        return {
            id: p.id, name: p.name, phone: p.phone, group: p.group, creditLimit: N(p.creditLimit), balance: bal[p.id] || 0,
            lastPaymentAt: lp ? lp.date : null, lastSaleAt: ls ? ls.date : null,
            daysSincePayment: lp && lp.date ? K.daysBetween(dates.ymd(lp.date, tz), today) : null,
            promise: pr ? { id: pr.id, amount: N(pr.amount), promisedDate: pr.promisedDate, daysLeft: K.daysBetween(today, pr.promisedDate) } : null,
        };
    });
    const owing = rows.filter(r => r.balance > 0);
    res.json({
        today,
        kpis: {
            totalReceivable: owing.reduce((s, r) => s + r.balance, 0), customersOwing: owing.length,
            dueToday: promises.filter(p => p.promisedDate === today).length, overdue: promises.filter(p => p.promisedDate < today).length,
            collectedToday: N(collected._sum.credit), messagesToday: sentToday,
            overLimit: owing.filter(r => r.creditLimit > 0 && r.balance > r.creditLimit).length,
        },
        rows,
    });
});

router.get('/customers/:id', VIEW, async (req, res) => {
    const t = req.user.tenantId;
    const p = await customer(t, req.params.id);
    const tz = await tzOf(t);
    await K.settlePromises(t, p.id);
    const entries = await ledger.statement(t, p);
    const promises = await prisma.paymentPromise.findMany({ where: { tenantId: t, partyId: p.id, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 50 });
    const messages = await prisma.messageLog.findMany({ where: { tenantId: t, partyId: p.id, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 50 });
    const today = K.today(tz);
    res.json({
        party: { id: p.id, name: p.name, phone: p.phone, address: p.address, city: p.city, group: p.group, creditLimit: N(p.creditLimit), notes: p.notes, createdAt: p.createdAt },
        balance: entries.length ? entries[entries.length - 1].balance : 0,
        entries,
        promises: promises.map(x => ({ id: x.id, amount: N(x.amount), promisedDate: x.promisedDate, note: x.note, status: x.status === 'PENDING' && x.promisedDate < today ? 'OVERDUE' : x.status, remindCount: x.remindCount, remindedAt: x.remindedAt, createdAt: x.createdAt, daysLeft: K.daysBetween(today, x.promisedDate) })),
        messages: messages.map(m => ({ id: m.id, channel: m.channel, kind: m.kind, to: m.to, body: m.body, status: m.status, error: m.error, createdAt: m.createdAt })),
        today,
    });
});

// receive a payment towards the khata (counter or khata page)
router.post('/receive', RECEIVE, async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const party = await customer(t, b.partyId);
    const amount = paisa(b.amount, 'Amount');
    if (!amount) throw new HttpError(400, 'Enter the amount received.');
    const method = oneOf(String(b.method || 'CASH').toUpperCase(), ['CASH', 'BANK', 'CARD', 'WALLET'], 'Method');
    const p = await withTx(t, async tx => {
        const pay = await K.receive(tx, { tenantId: t, party, amount, method, accountId: str(b.accountId, 60) || null, note: str(b.note, 200), userId: req.user.id });
        await K.settlePromises(t, party.id, tx);
        return pay;
    });
    const balance = await ledger.balance(t, party.id, false);
    await audit(req, { action: 'khata.receive', summary: `Received ${K.rs(amount)} from "${party.name}" (${p.number}, ${method.toLowerCase()}); balance now ${K.rs(balance)}` });
    // optional automatic thank-you SMS
    const m = await settings.get(t, 'messaging');
    if (m.autoThanks && m.smsEnabled && sms.msisdn(party.phone)) {
        const company = await settings.get(t, 'company');
        const body = sms.fill(m.language === 'en' ? m.thanksEn : m.thanksUr, { name: party.name, shop: company.name || req.tenant.name, amount: K.ltr(K.rs(amount)), balance: K.ltr(K.rs(balance)), phone: company.phone ? K.ltr(company.phone) : null });
        await queueOrSend(t, { partyId: party.id, kind: 'PAYMENT_THANKS', to: party.phone, body, refId: p.id, userId: req.user.id });
    }
    res.json({ id: p.id, number: p.number, amount, balance, date: p.date });
});

// ── promises (وعدے) ──
router.get('/promises', VIEW, async (req, res) => {
    const t = req.user.tenantId;
    const tz = await tzOf(t);
    const today = K.today(tz);
    const view = oneOf(req.query.view || 'due', ['due', 'today', 'overdue', 'next7', 'upcoming', 'all', 'kept', 'broken'], 'View');
    const where = { tenantId: t, deletedAt: null };
    const in7 = dates.addDays(today, 7);
    if (view === 'kept') where.status = 'KEPT';
    else if (view === 'broken') where.status = 'BROKEN';
    else if (view !== 'all') {
        where.status = 'PENDING';
        if (view === 'today') where.promisedDate = today;
        if (view === 'overdue') where.promisedDate = { lt: today };
        if (view === 'next7') where.promisedDate = { gt: today, lte: in7 };
        if (view === 'due') where.promisedDate = { lte: in7 };
        if (view === 'upcoming') where.promisedDate = { gt: today };
    }
    let list = await prisma.paymentPromise.findMany({ where, orderBy: [{ promisedDate: 'asc' }, { createdAt: 'asc' }], take: 1000 });
    // pending promises that have been paid become KEPT on the way
    const pendingParties = [...new Set(list.filter(p => p.status === 'PENDING').map(p => p.partyId))];
    let changed = 0;
    for (const pid of pendingParties) changed += await K.settlePromises(t, pid);
    if (changed) list = await prisma.paymentPromise.findMany({ where, orderBy: [{ promisedDate: 'asc' }, { createdAt: 'asc' }], take: 1000 });
    const parties = Object.fromEntries((await prisma.party.findMany({ where: { tenantId: t, id: { in: [...new Set(list.map(p => p.partyId))] } } })).map(p => [p.id, p]));
    const bal = await ledger.balances(t, { partyIds: Object.keys(parties), type: 'CUSTOMER' });
    const q = str(req.query.q, 80).toLowerCase();
    const rows = [];
    for (const p of list) {
        const party = parties[p.partyId];
        if (!party || (q && !party.name.toLowerCase().includes(q) && !String(party.phone).includes(q))) continue;
        rows.push({
            id: p.id, partyId: p.partyId, name: party.name, phone: party.phone, amount: N(p.amount), promisedDate: p.promisedDate, note: p.note,
            status: p.status === 'PENDING' && p.promisedDate < today ? 'OVERDUE' : p.status, daysLeft: K.daysBetween(today, p.promisedDate),
            remindCount: p.remindCount, remindedAt: p.remindedAt, balance: bal[p.partyId] || 0, paid: p.status === 'PENDING' ? await K.paidSince(t, p.partyId, p.createdAt) : null, createdAt: p.createdAt,
        });
    }
    const all = await prisma.paymentPromise.findMany({ where: { tenantId: t, deletedAt: null, status: 'PENDING' }, select: { promisedDate: true, amount: true } });
    res.json({
        today, rows,
        counts: {
            today: all.filter(p => p.promisedDate === today).length, overdue: all.filter(p => p.promisedDate < today).length,
            next7: all.filter(p => p.promisedDate > today && p.promisedDate <= in7).length, pending: all.length,
            pendingAmount: all.reduce((s, p) => s + N(p.amount), 0),
        },
    });
});

router.post('/promises', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const party = await customer(t, b.partyId);
    const amount = paisa(b.amount, 'Amount');
    if (!amount) throw new HttpError(400, 'Enter the promised amount.');
    const day = need(b.promisedDate, 'Promised date', 10);
    if (!dates.isDay(day)) throw new HttpError(400, 'Choose the promised date.');
    const today = K.today(await tzOf(t));
    if (day < today) throw new HttpError(400, 'The promised date cannot be in the past.');
    const p = await prisma.paymentPromise.create({ data: { tenantId: t, partyId: party.id, amount: BigInt(amount), promisedDate: day, note: str(b.note, 300), createdById: req.user.id } });
    await audit(req, { action: 'khata.promise', summary: `"${party.name}" promised to pay ${K.rs(amount)} by ${day}` });
    res.json({ id: p.id });
});

router.patch('/promises/:id', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const p = await prisma.paymentPromise.findFirst({ where: { id: req.params.id, tenantId: t, deletedAt: null } });
    if (!p) throw new HttpError(404, 'Promise not found.');
    const b = req.body || {};
    const data = {};
    if (b.status !== undefined) {
        data.status = oneOf(b.status, ['PENDING', 'KEPT', 'BROKEN', 'CANCELLED'], 'Status');
        if (data.status === 'KEPT') data.keptAt = new Date();
    }
    if (b.promisedDate !== undefined) {
        if (!dates.isDay(String(b.promisedDate))) throw new HttpError(400, 'Choose the new date.');
        data.promisedDate = String(b.promisedDate); data.status = 'PENDING'; data.lastAutoDay = '';
    }
    if (b.snoozeDays !== undefined) {
        const today = K.today(await tzOf(t));
        data.promisedDate = dates.addDays(p.promisedDate > today ? p.promisedDate : today, Math.max(1, Math.min(90, Number(b.snoozeDays) || 1)));
        data.status = 'PENDING'; data.lastAutoDay = '';
    }
    if (b.amount !== undefined) { const a = paisa(b.amount, 'Amount'); if (!a) throw new HttpError(400, 'Enter the amount.'); data.amount = BigInt(a); }
    if (b.note !== undefined) data.note = str(b.note, 300);
    const upd = await prisma.paymentPromise.update({ where: { id: p.id }, data });
    const party = await prisma.party.findFirst({ where: { id: p.partyId } });
    await audit(req, { action: 'khata.promise_update', summary: `Promise of "${party ? party.name : ''}" (${K.rs(N(p.amount))}, ${p.promisedDate}): ${[data.status && `status → ${data.status.toLowerCase()}`, data.promisedDate && `date → ${data.promisedDate}`, data.amount && `amount → ${K.rs(N(data.amount))}`].filter(Boolean).join(', ') || 'note changed'}` });
    res.json({ id: upd.id, status: upd.status, promisedDate: upd.promisedDate });
});

// ── messages ──
async function queueOrSend(t, { partyId, kind, to, body, refId, userId }) {
    const log = await prisma.messageLog.create({ data: { tenantId: t, partyId, channel: 'SMS', kind, to, body, status: 'QUEUED', refId: refId || null, userId } });
    if (isDesktop) return log; // the cloud sends it once this row has synced up
    const r = await sms.send(t, to, body);
    return prisma.messageLog.update({ where: { id: log.id }, data: { status: r.status, provider: r.provider, error: r.error } });
}
const KINDS = ['PROMISE_REMINDER', 'BALANCE_REMINDER', 'PAYMENT_THANKS', 'RECEIPT', 'STATEMENT', 'CUSTOM'];
async function bumpPromise(t, kind, refId) {
    if (kind !== 'PROMISE_REMINDER' || !refId) return;
    await prisma.paymentPromise.updateMany({ where: { id: refId, tenantId: t }, data: { remindedAt: new Date(), remindCount: { increment: 1 } } });
}

// a WhatsApp chat was opened with this message (it is sent from the shop's own WhatsApp)
router.post('/messages/log', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const kind = oneOf(b.kind, KINDS, 'Kind', 'CUSTOM');
    const log = await prisma.messageLog.create({ data: { tenantId: t, partyId: str(b.partyId, 60) || null, channel: 'WHATSAPP', kind, to: str(b.to, 30), body: need(b.body, 'Message', 4000), status: 'OPENED', provider: 'whatsapp', refId: str(b.refId, 60) || null, userId: req.user.id } });
    await bumpPromise(t, kind, log.refId);
    res.json({ id: log.id });
});

router.post('/messages/sms', can('parties.manage', 'finance.manage'), async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const kind = oneOf(b.kind, KINDS, 'Kind', 'CUSTOM');
    const party = b.partyId ? await customer(t, b.partyId) : null;
    const to = str(b.to, 30) || (party ? party.phone : '');
    if (!sms.msisdn(to)) throw new HttpError(400, 'This customer has no valid Pakistani mobile number (e.g. 0300-1234567).');
    const m = await settings.get(t, 'messaging');
    if (!m.smsEnabled) throw new HttpError(400, 'SMS is switched off. Turn it on under Promises & Reminders → Messaging settings, or send on WhatsApp.');
    const log = await queueOrSend(t, { partyId: party ? party.id : null, kind, to, body: need(b.body, 'Message', 1000), refId: str(b.refId, 60) || null, userId: req.user.id });
    if (log.status !== 'FAILED') await bumpPromise(t, kind, log.refId);
    res.json({ id: log.id, status: log.status, error: log.error });
});

router.get('/messages', VIEW, async (req, res) => {
    const t = req.user.tenantId;
    const where = { tenantId: t, deletedAt: null };
    if (req.query.partyId) where.partyId = String(req.query.partyId);
    if (req.query.channel) where.channel = String(req.query.channel);
    const list = await prisma.messageLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(Number(req.query.limit) || 200, 1000) });
    const names = Object.fromEntries((await prisma.party.findMany({ where: { tenantId: t, id: { in: [...new Set(list.map(m => m.partyId).filter(Boolean))] } }, select: { id: true, name: true } })).map(p => [p.id, p.name]));
    res.json(list.map(m => ({ id: m.id, partyId: m.partyId, name: names[m.partyId] || '', channel: m.channel, kind: m.kind, to: m.to, body: m.body, status: m.status, error: m.error, createdAt: m.createdAt })));
});

// ── messaging settings (templates, SMS gateway) ──
const pub = async t => {
    const m = await settings.get(t, 'messaging');
    return { ...m, hasApiKey: !!(await sms.secret(t, 'smsApiKey')), hasApiSecret: !!(await sms.secret(t, 'smsApiSecret')), defaults: settings.DEFAULTS.messaging, desktop: isDesktop };
};
router.get('/messaging', VIEW, async (req, res) => res.json(await pub(req.user.tenantId)));
router.put('/messaging', can('settings.manage'), async (req, res) => {
    const t = req.user.tenantId;
    const b = { ...(req.body || {}) };
    if (b.provider !== undefined) oneOf(b.provider, ['LOG', 'HTTP'], 'Provider');
    if (b.httpMethod !== undefined) oneOf(b.httpMethod, ['GET', 'POST'], 'Method');
    if (b.urlTemplate && !/^https?:\/\//.test(b.urlTemplate)) throw new HttpError(400, 'The gateway URL must start with https://');
    if (b.language !== undefined) oneOf(b.language, ['ur', 'en'], 'Language');
    if (b.sendHour !== undefined && !(Number(b.sendHour) >= 0 && Number(b.sendHour) <= 23)) throw new HttpError(400, 'Send hour must be 0–23.');
    const keyChange = !isDesktop && ((b.apiKey !== undefined && b.apiKey !== '••••') || (b.apiSecret !== undefined && b.apiSecret !== '••••'));
    if (!isDesktop) {
        if (b.apiKey !== undefined && b.apiKey !== '••••') await sms.setSecret(t, 'smsApiKey', str(b.apiKey, 500));
        if (b.apiSecret !== undefined && b.apiSecret !== '••••') await sms.setSecret(t, 'smsApiSecret', str(b.apiSecret, 500));
    }
    delete b.apiKey; delete b.apiSecret;
    const saved = await settings.put(t, 'messaging', b);
    // keys typed now go to this gateway address only (changing the address later needs the key typed again)
    if (keyChange) await sms.bindKeys(t, saved.urlTemplate);
    await audit(req, { action: 'settings.messaging', summary: 'Messaging settings (templates / SMS gateway) changed' });
    res.json(await pub(t));
});
router.post('/messaging/test', can('settings.manage'), async (req, res) => {
    if (isDesktop) throw new HttpError(400, 'Test the SMS gateway from the web app (the gateway key stays on the server).');
    const t = req.user.tenantId;
    const to = str(req.body?.to, 30);
    if (!sms.msisdn(to)) throw new HttpError(400, 'Enter a Pakistani mobile number, e.g. 03001234567.');
    const company = await settings.get(t, 'company');
    const body = `HisabPro: SMS test from ${company.name || req.tenant.name}.`;
    const r = await sms.send(t, to, body);
    await prisma.messageLog.create({ data: { tenantId: t, channel: 'SMS', kind: 'CUSTOM', to, body, status: r.status, provider: r.provider, error: r.error, userId: req.user.id } });
    res.json(r);
});

module.exports = { router, mount: '/api/khata', queueOrSend };
