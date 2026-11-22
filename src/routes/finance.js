// Finance: payments in/out, cash & bank accounts (+ transfers), cheques, expenses (+ categories), capital & equity, taxes.
const express = require('express');
const crypto = require('crypto');
const { prisma, withTx, ci } = require('../db');
const { HttpError, str, need, num, bool, oneOf, date } = require('../lib/http');
const { B, N, paisa } = require('../lib/money');
const { authenticate, can, requireTenant } = require('../auth');
const { audit } = require('../audit');
const ledger = require('../services/ledger');
const treasury = require('../services/treasury');
const numbering = require('../services/numbering');
const settings = require('../services/settings');
const dates = require('../lib/dates');
const { listParties } = require('./parties');
const Calc = require('../../public/js/shared/calc');

const router = express.Router();
router.use(authenticate);
const MANAGE = can('finance.manage');
const ACCOUNTS_READ = can('finance.manage', 'sales.create', 'purchases.manage');

const rs = p => 'Rs ' + (Number(p || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tzOf = async t => (await settings.get(t, 'localization')).timezone || 'Asia/Karachi';
// a real calendar day 'YYYY-MM-DD' (2026-02-31 is not one)
const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
// a day picked on a form: today → now (keeps the order of today's entries), an earlier day → noon of that day in the shop's
// zone. Money cannot move on a day after today (account balances are not dated, reports are).
async function when(t, v) {
    if (v === undefined || v === null || v === '') return new Date();
    if (typeof v !== 'string') throw new HttpError(400, 'Invalid date.');
    const tz = await tzOf(t);
    const today = dates.ymd(new Date(), tz);
    let at, day;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        if (!isDay(v)) throw new HttpError(400, 'Invalid date.');
        if (v === today) return new Date();
        day = v;
        at = new Date(dates.startOf(v, tz).getTime() + 12 * 3600000);
    } else {
        at = date(v, new Date());
        day = dates.ymd(at, tz);
    }
    if (day > today) throw new HttpError(400, 'The date cannot be after today.');
    if (day < '2000-01-01') throw new HttpError(400, 'Invalid date.');
    return at;
}
// a cheque date (may be ahead: post-dated cheques); empty → fallback
const chequeDate = (v, fallback) => {
    if (v === undefined || v === null || v === '') return fallback;
    if (typeof v !== 'string' || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !isDay(v))) throw new HttpError(400, 'Invalid date.');
    const d = date(v, fallback);
    if (d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) throw new HttpError(400, 'Invalid date.');
    return d;
};
const methodFor = type => (type === 'CASH' ? 'CASH' : type === 'WALLET' ? 'WALLET' : 'BANK');

// ───────────────────────── accounts (banks & cash) ─────────────────────────
const ACCOUNT_TYPES = ['CASH', 'BANK', 'WALLET'];
function accountView(a, balances) {
    return { id: a.id, name: a.name, type: a.type, bankName: a.bankName, accountNo: a.accountNo, isDefault: a.isDefault, active: a.active, createdAt: a.createdAt, balance: balances[a.id] || 0 };
}
async function accountList(t) {
    const rows = await prisma.account.findMany({ where: { tenantId: t, deletedAt: null }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
    const bal = await treasury.balances(t);
    return rows.map(a => accountView(a, bal));
}
async function findAccount(t, id, db = prisma) {
    const a = await db.account.findFirst({ where: { id, tenantId: t, deletedAt: null } });
    if (!a) throw new HttpError(404, 'That cash/bank account was not found.');
    return a;
}
async function accountBalance(t, accountId, db = prisma) {
    const r = await db.accountTxn.aggregate({ where: { tenantId: t, accountId, deletedAt: null }, _sum: { amount: true } });
    return N(r._sum.amount);
}
async function assertAccountNameFree(t, name, exceptId) {
    const hits = await prisma.account.findMany({ where: { tenantId: t, deletedAt: null, name: ci(name), ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { name: true } });
    if (hits.some(h => h.name.trim().toLowerCase() === name.toLowerCase())) throw new HttpError(400, `An account named "${name}" already exists.`);
}

router.get('/accounts', ACCOUNTS_READ, async (req, res) => res.json(await accountList(req.user.tenantId)));

router.post('/accounts', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const type = oneOf(b.type || undefined, ACCOUNT_TYPES, 'Account type', 'BANK');
    const data = { name: need(b.name, 'Name', 80), type, bankName: str(b.bankName, 80), accountNo: str(b.accountNo, 60), isDefault: bool(b.isDefault), active: true };
    const opening = paisa(b.openingBalance, 'Opening balance');
    await assertAccountNameFree(t, data.name);
    const a = await withTx(t, async tx => {
        if (data.isDefault) await tx.account.updateMany({ where: { tenantId: t, type, deletedAt: null }, data: { isDefault: false } });
        const row = await tx.account.create({ data: { ...data, tenantId: t } });
        if (opening) await treasury.post(tx, { tenantId: t, accountId: row.id, type: 'OPENING', amount: opening, refId: row.id, refNo: 'Opening balance', note: 'Opening balance' });
        return row;
    });
    await audit(req, { action: 'finance.account_create', summary: `${type === 'CASH' ? 'Cash' : type === 'WALLET' ? 'Wallet' : 'Bank'} account "${a.name}" added${opening ? ` with opening balance ${rs(opening)}` : ''}` });
    res.json(accountView(a, { [a.id]: opening }));
});

router.put('/accounts/:id', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const cur = await findAccount(t, req.params.id);
    const b = { ...cur, ...(req.body || {}) };
    const data = { name: need(b.name, 'Name', 80), type: oneOf(b.type, ACCOUNT_TYPES, 'Account type'), bankName: str(b.bankName, 80), accountNo: str(b.accountNo, 60), isDefault: bool(b.isDefault), active: b.active === undefined ? true : bool(b.active) };
    await assertAccountNameFree(t, data.name, cur.id);
    await withTx(t, async tx => {
        // the shop always keeps one usable cash account (cash sales and expenses land there)
        if (cur.type === 'CASH' && (data.type !== 'CASH' || !data.active) && !(await tx.account.count({ where: { tenantId: t, deletedAt: null, type: 'CASH', active: true, id: { not: cur.id } } }))) {
            throw new HttpError(400, 'Keep at least one active cash account.');
        }
        if (data.isDefault) await tx.account.updateMany({ where: { tenantId: t, type: data.type, deletedAt: null, id: { not: cur.id } }, data: { isDefault: false } });
        await tx.account.update({ where: { id: cur.id }, data });
    });
    await audit(req, { action: 'finance.account_update', summary: `Account "${cur.name}" changed${cur.name !== data.name ? ` (now "${data.name}")` : ''}` });
    res.json({ ok: true });
});

router.delete('/accounts/:id', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const cur = await findAccount(t, req.params.id);
    const bal = await accountBalance(t, cur.id);
    if (bal !== 0) throw new HttpError(400, `"${cur.name}" still holds ${rs(bal)}. Transfer it to another account first.`);
    if (cur.type === 'CASH' && !(await prisma.account.count({ where: { tenantId: t, deletedAt: null, type: 'CASH', active: true, id: { not: cur.id } } }))) throw new HttpError(400, 'Keep at least one cash account.');
    await prisma.account.update({ where: { id: cur.id }, data: { deletedAt: new Date() } });
    await audit(req, { action: 'finance.account_delete', summary: `Account "${cur.name}" deleted (its history is kept)` });
    res.json({ ok: true });
});

// account movements, newest first, each with the account's running balance after it
async function movements(t, { accountId, limit = 1000 } = {}) {
    const where = { tenantId: t, deletedAt: null };
    if (accountId) where.accountId = accountId;
    const rows = await prisma.accountTxn.findMany({ where, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] });
    const names = Object.fromEntries((await prisma.account.findMany({ where: { tenantId: t }, select: { id: true, name: true, type: true } })).map(a => [a.id, a]));
    const run = {};
    const out = rows.map(r => {
        run[r.accountId] = (run[r.accountId] || 0) + N(r.amount);
        const a = names[r.accountId] || {};
        return { id: r.id, date: r.date, accountId: r.accountId, accountName: a.name || '?', accountType: a.type || '', type: r.type, amount: N(r.amount), partyId: r.partyId, refId: r.refId, refNo: r.refNo, note: r.note, balance: run[r.accountId] };
    });
    return out.reverse().slice(0, limit);
}
router.get('/ledger', MANAGE, async (req, res) => {
    res.json(await movements(req.user.tenantId, { accountId: str(req.query.accountId, 60) || null, limit: Math.min(Number(req.query.limit) || 1000, 5000) }));
});
router.get('/accounts/:id/ledger', MANAGE, async (req, res) => {
    const a = await findAccount(req.user.tenantId, req.params.id);
    const rows = await movements(req.user.tenantId, { accountId: a.id, limit: 5000 });
    res.json({ account: accountView(a, { [a.id]: rows.length ? rows[0].balance : 0 }), rows });
});

// transfer between two accounts: two linked entries with the same refId (contra)
router.post('/transfers', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const fromId = need(b.fromId, 'From account', 60), toId = need(b.toId, 'To account', 60);
    if (fromId === toId) throw new HttpError(400, 'Choose two different accounts.');
    const amount = paisa(b.amount, 'Amount');
    if (!amount) throw new HttpError(400, 'Enter the amount to transfer.');
    const note = str(b.note, 300);
    const at = await when(t, b.date);
    const r = await withTx(t, async tx => {
        const from = await findAccount(t, fromId, tx), to = await findAccount(t, toId, tx);
        const bal = await accountBalance(t, from.id, tx);
        if (amount > bal) throw new HttpError(400, `"${from.name}" holds only ${rs(bal)}.`);
        const refId = crypto.randomUUID();
        await treasury.post(tx, { tenantId: t, accountId: from.id, type: 'TRANSFER_OUT', amount: -amount, refId, refNo: `To ${to.name}`, note, date: at });
        await treasury.post(tx, { tenantId: t, accountId: to.id, type: 'TRANSFER_IN', amount, refId, refNo: `From ${from.name}`, note, date: at });
        return { from, to, refId };
    });
    await audit(req, { action: 'finance.transfer', summary: `Transferred ${rs(amount)} from "${r.from.name}" to "${r.to.name}"${note ? ` (${note})` : ''}` });
    res.json({ ok: true, refId: r.refId });
});

// ───────────────────────── payments in / out ─────────────────────────
const METHODS = ['CASH', 'BANK', 'CARD', 'WALLET'];

// customers and vendors with balances, for the payment / cheque forms
router.get('/parties', MANAGE, async (req, res) => {
    const type = ['CUSTOMER', 'VENDOR'].includes(String(req.query.type || '').toUpperCase()) ? String(req.query.type).toUpperCase() : undefined;
    res.json(await listParties(req.user.tenantId, { type, q: str(req.query.q, 100) }));
});

router.get('/payments', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const where = { tenantId: t, deletedAt: null };
    if (['IN', 'OUT'].includes(req.query.direction)) where.direction = req.query.direction;
    const q = str(req.query.q, 100);
    if (q) where.OR = [{ partyName: ci(q) }, { number: ci(q) }, { reference: ci(q) }];
    const rows = await prisma.payment.findMany({ where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 2000 });
    const accounts = Object.fromEntries((await prisma.account.findMany({ where: { tenantId: t }, select: { id: true, name: true } })).map(a => [a.id, a.name]));
    const parties = Object.fromEntries((await prisma.party.findMany({ where: { tenantId: t, id: { in: rows.map(r => r.partyId).filter(Boolean) } }, select: { id: true, type: true } })).map(p => [p.id, p.type]));
    res.json(rows.map(r => ({
        id: r.id, number: r.number, date: r.date, direction: r.direction, partyId: r.partyId, partyName: r.partyName, partyType: r.partyId ? parties[r.partyId] || '' : '',
        amount: N(r.amount), method: r.method, accountId: r.accountId, accountName: accounts[r.accountId] || '', reference: r.reference, note: r.note, createdAt: r.createdAt,
    })));
});

router.post('/payments', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const direction = oneOf(String(b.direction || '').toUpperCase() || undefined, ['IN', 'OUT'], 'Type');
    const amount = paisa(b.amount, 'Amount');
    if (!amount) throw new HttpError(400, 'Enter the amount.');
    const method = oneOf(String(b.method || '').toUpperCase() || undefined, METHODS, 'Method', 'CASH');
    const reference = str(b.reference, 120), note = str(b.note, 500);
    const at = await when(t, b.date);
    let party = null;
    if (b.partyId) {
        party = await prisma.party.findFirst({ where: { id: String(b.partyId), tenantId: t, deletedAt: null } });
        if (!party) throw new HttpError(400, 'That customer / vendor was not found.');
    }
    const pay = await withTx(t, async tx => {
        const accountId = await treasury.accountFor(tx, t, method, str(b.accountId, 60) || null);
        const number = await numbering.number(tx, t, direction === 'IN' ? 'paymentIn' : 'paymentOut', direction === 'IN' ? 'REC-' : 'PAY-');
        const p = await tx.payment.create({ data: {
            tenantId: t, number, date: at, direction, partyId: party ? party.id : null, partyName: party ? party.name : '', amount: B(amount), method, accountId, reference, note, userId: req.user.id,
        } });
        // money in from a party lowers what they owe us (credit); money out to a party lowers what we owe them (debit)
        if (party) await ledger.post(tx, { tenantId: t, partyId: party.id, type: direction === 'IN' ? 'PAYMENT_IN' : 'PAYMENT_OUT', ...(direction === 'IN' ? { credit: amount } : { debit: amount }), refId: p.id, refNo: number, note: note || reference || (direction === 'IN' ? 'Payment received' : 'Payment made'), date: at });
        await treasury.post(tx, { tenantId: t, accountId, type: direction === 'IN' ? 'PAYMENT_IN' : 'PAYMENT_OUT', amount: direction === 'IN' ? amount : -amount, partyId: party ? party.id : null, refId: p.id, refNo: number, note: [party ? party.name : direction === 'IN' ? 'Other income' : 'Other payout', reference, note].filter(Boolean).join(' — '), date: at });
        return p;
    });
    await audit(req, { action: direction === 'IN' ? 'finance.payment_in' : 'finance.payment_out', summary: `${direction === 'IN' ? 'Payment in' : 'Payment out'} ${pay.number}: ${rs(amount)} ${direction === 'IN' ? 'from' : 'to'} ${party ? `"${party.name}"` : '(no party)'} by ${method.toLowerCase()}` });
    res.json({ id: pay.id, number: pay.number, amount, direction, partyName: pay.partyName, accountId: pay.accountId, date: pay.date });
});

// delete a payment: the payment, its khata entry and its account entry are all marked deleted together
router.delete('/payments/:id', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const p = await prisma.payment.findFirst({ where: { id: req.params.id, tenantId: t, deletedAt: null } });
    if (!p) throw new HttpError(404, 'Payment not found.');
    const now = new Date();
    await withTx(t, async tx => {
        await tx.payment.update({ where: { id: p.id }, data: { deletedAt: now } });
        // only the entries a payment makes (never another document's entries that happen to share the refId)
        const mine = { tenantId: t, refId: p.id, refNo: p.number, deletedAt: null, type: { in: ['PAYMENT_IN', 'PAYMENT_OUT'] } };
        await tx.ledgerEntry.updateMany({ where: mine, data: { deletedAt: now } });
        await tx.accountTxn.updateMany({ where: mine, data: { deletedAt: now } });
    });
    await audit(req, { action: 'finance.payment_delete', summary: `Payment ${p.number} (${rs(N(p.amount))} ${p.direction === 'IN' ? 'from' : 'to'} ${p.partyName ? `"${p.partyName}"` : 'no party'}) deleted; its khata and account entries were reversed` });
    res.json({ ok: true });
});

// ───────────────────────── cheques ─────────────────────────
function chequeView(c, accounts) {
    return { id: c.id, type: c.type, partyId: c.partyId, partyName: c.partyName, chequeNo: c.chequeNo, bankName: c.bankName, amount: N(c.amount), issueDate: c.issueDate, dueDate: c.dueDate, status: c.status, accountId: c.accountId, accountName: c.accountId ? accounts[c.accountId] || '' : '', clearedAt: c.clearedAt, note: c.note, createdAt: c.createdAt };
}
router.get('/cheques', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const rows = await prisma.cheque.findMany({ where: { tenantId: t, deletedAt: null }, orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }] });
    const accounts = Object.fromEntries((await prisma.account.findMany({ where: { tenantId: t }, select: { id: true, name: true } })).map(a => [a.id, a.name]));
    const tz = await tzOf(t);
    const month = dates.range('month', { tz });
    const list = rows.map(c => chequeView(c, accounts));
    const sum = arr => arr.reduce((s, c) => s + c.amount, 0);
    const pending = list.filter(c => c.status === 'PENDING'), bounced = list.filter(c => c.status === 'BOUNCED');
    const upcoming = {};
    for (const c of pending) { const m = dates.ymd(c.dueDate, tz).slice(0, 7); upcoming[m] = (upcoming[m] || 0) + c.amount; }
    const distribution = {};
    for (const s of ['CLEARED', 'PENDING', 'BOUNCED', 'CANCELLED']) { const l = list.filter(c => c.status === s); distribution[s] = { count: l.length, amount: sum(l) }; }
    const today = dates.ymd(new Date(), tz);
    res.json({
        rows: list.map(c => ({ ...c, overdue: c.status === 'PENDING' && dates.ymd(c.dueDate, tz) < today })),
        kpis: { pending: sum(pending), pendingCount: pending.length, clearedThisMonth: sum(list.filter(c => c.status === 'CLEARED' && c.clearedAt && new Date(c.clearedAt) >= month.from)), bounced: sum(bounced), bouncedCount: bounced.length },
        upcoming: Object.entries(upcoming).sort(([a], [b2]) => a.localeCompare(b2)).map(([m, amount]) => ({ month: m, amount })),
        distribution,
    });
});

router.post('/cheques', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const type = oneOf(String(b.type || '').toUpperCase() || undefined, ['RECEIVED', 'ISSUED'], 'Type', 'RECEIVED');
    const party = await prisma.party.findFirst({ where: { id: str(b.partyId, 60), tenantId: t, deletedAt: null } });
    if (!party) throw new HttpError(400, type === 'RECEIVED' ? 'Choose the customer.' : 'Choose the vendor.');
    if (party.type !== (type === 'RECEIVED' ? 'CUSTOMER' : 'VENDOR')) throw new HttpError(400, type === 'RECEIVED' ? 'An incoming cheque comes from a customer.' : 'An outgoing cheque goes to a vendor.');
    const amount = paisa(b.amount, 'Amount');
    if (!amount) throw new HttpError(400, 'Enter the cheque amount.');
    const chequeNo = need(b.chequeNo, 'Cheque number', 40);
    const dueDate = chequeDate(b.dueDate, null);
    if (!dueDate) throw new HttpError(400, 'Cheque date is required.');
    const accountId = str(b.accountId, 60) || null;
    if (accountId) await findAccount(t, accountId);
    const c = await prisma.cheque.create({ data: {
        tenantId: t, type, partyId: party.id, partyName: party.name, chequeNo, bankName: str(b.bankName, 80), amount: B(amount),
        issueDate: chequeDate(b.issueDate, new Date()), dueDate, status: 'PENDING', accountId, note: str(b.note, 500),
    } });
    await audit(req, { action: 'finance.cheque_create', summary: `${type === 'RECEIVED' ? 'Incoming' : 'Outgoing'} cheque #${c.chequeNo} ${type === 'RECEIVED' ? 'from' : 'to'} "${party.name}" for ${rs(amount)} recorded (pending)` });
    res.json({ id: c.id });
});

async function pendingCheque(tx, t, id) {
    const c = await tx.cheque.findFirst({ where: { id, tenantId: t, deletedAt: null } });
    if (!c) throw new HttpError(404, 'Cheque not found.');
    if (c.status !== 'PENDING') throw new HttpError(400, `This cheque is already ${c.status.toLowerCase()}.`);
    return c;
}
router.post('/cheques/:id/clear', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const at = await when(t, b.date);
    const c = await withTx(t, async tx => {
        const ch = await pendingCheque(tx, t, req.params.id);
        const accountId = await treasury.accountFor(tx, t, 'BANK', str(b.accountId, 60) || ch.accountId || null);
        const amount = N(ch.amount), inbound = ch.type === 'RECEIVED';
        const ref = `Cheque #${ch.chequeNo}`;
        await treasury.post(tx, { tenantId: t, accountId, type: 'CHEQUE', amount: inbound ? amount : -amount, partyId: ch.partyId, refId: ch.id, refNo: ref, note: `${ref} ${inbound ? 'from' : 'to'} ${ch.partyName}`, date: at });
        if (ch.partyId) await ledger.post(tx, { tenantId: t, partyId: ch.partyId, type: 'CHEQUE', ...(inbound ? { credit: amount } : { debit: amount }), refId: ch.id, refNo: ref, note: `${ref} cleared${ch.bankName ? ` (${ch.bankName})` : ''}`, date: at });
        return tx.cheque.update({ where: { id: ch.id }, data: { status: 'CLEARED', clearedAt: at, accountId } });
    });
    await audit(req, { action: 'finance.cheque_clear', summary: `Cheque #${c.chequeNo} (${c.partyName}, ${rs(N(c.amount))}) cleared` });
    res.json({ ok: true });
});
for (const [action, status] of [['bounce', 'BOUNCED'], ['cancel', 'CANCELLED']]) {
    router.post(`/cheques/:id/${action}`, MANAGE, async (req, res) => {
        const t = req.user.tenantId;
        const c = await withTx(t, async tx => {
            const ch = await pendingCheque(tx, t, req.params.id);
            const note = str(req.body && req.body.note, 300);
            return tx.cheque.update({ where: { id: ch.id }, data: { status, note: note ? [ch.note, note].filter(Boolean).join(' · ') : ch.note } });
        });
        await audit(req, { action: `finance.cheque_${action}`, summary: `Cheque #${c.chequeNo} (${c.partyName}, ${rs(N(c.amount))}) marked ${status.toLowerCase()}` });
        res.json({ ok: true });
    });
}
router.delete('/cheques/:id', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const c = await prisma.cheque.findFirst({ where: { id: req.params.id, tenantId: t, deletedAt: null } });
    if (!c) throw new HttpError(404, 'Cheque not found.');
    if (c.status === 'CLEARED') throw new HttpError(400, 'A cleared cheque has moved money and cannot be deleted.');
    await prisma.cheque.update({ where: { id: c.id }, data: { deletedAt: new Date() } });
    await audit(req, { action: 'finance.cheque_delete', summary: `Cheque #${c.chequeNo} (${c.partyName}, ${rs(N(c.amount))}) deleted` });
    res.json({ ok: true });
});

// ───────────────────────── expenses ─────────────────────────
router.get('/expense-categories', MANAGE, async (req, res) => {
    res.json(await prisma.expenseCategory.findMany({ where: { tenantId: req.user.tenantId, deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } }));
});
router.post('/expense-categories', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const name = need(req.body && req.body.name, 'Category name', 80);
    const hits = await prisma.expenseCategory.findMany({ where: { tenantId: t, deletedAt: null, name: ci(name) }, select: { name: true } });
    if (hits.some(h => h.name.trim().toLowerCase() === name.toLowerCase())) throw new HttpError(400, `Category "${name}" already exists.`);
    const c = await prisma.expenseCategory.create({ data: { tenantId: t, name } });
    await audit(req, { action: 'finance.expense_category_create', summary: `Expense category "${name}" added` });
    res.json({ id: c.id, name: c.name });
});
router.delete('/expense-categories/:id', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const c = await prisma.expenseCategory.findFirst({ where: { id: req.params.id, tenantId: t, deletedAt: null } });
    if (!c) throw new HttpError(404, 'Category not found.');
    await prisma.expenseCategory.update({ where: { id: c.id }, data: { deletedAt: new Date() } });
    await audit(req, { action: 'finance.expense_category_delete', summary: `Expense category "${c.name}" deleted (old expenses keep its name)` });
    res.json({ ok: true });
});

router.get('/expenses', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const loc = await settings.get(t, 'localization');
    const tz = loc.timezone || 'Asia/Karachi';
    const preset = String(req.query.preset || (req.query.from ? 'custom' : 'month'));
    if ((req.query.from && !isDay(req.query.from)) || (req.query.to && !isDay(req.query.to))) throw new HttpError(400, 'Invalid date.');
    const r = dates.range(preset, { from: req.query.from, to: req.query.to, tz, fiscalStartMonth: loc.fiscalStartMonth });
    const rows = await prisma.expense.findMany({ where: { tenantId: t, deletedAt: null, date: { gte: r.from, lt: r.to } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] });
    const accounts = Object.fromEntries((await prisma.account.findMany({ where: { tenantId: t }, select: { id: true, name: true } })).map(a => [a.id, a.name]));
    const list = rows.map(e => ({ id: e.id, date: e.date, categoryId: e.categoryId, categoryName: e.categoryName || 'Uncategorized', amount: N(e.amount), accountId: e.accountId, accountName: accounts[e.accountId] || '', method: e.method, payee: e.payee, reference: e.reference, note: e.note }));
    const total = list.reduce((s, e) => s + e.amount, 0);
    const byCat = {}, byDay = {};
    for (const e of list) { byCat[e.categoryName] = (byCat[e.categoryName] || 0) + e.amount; const d = dates.ymd(e.date, tz); byDay[d] = (byDay[d] || 0) + e.amount; }
    const byCategory = Object.entries(byCat).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
    const activeDays = Object.keys(byDay).length;
    res.json({
        range: { preset, fromDay: r.fromDay, toDay: r.toDay }, rows: list, total, count: list.length,
        topCategory: byCategory[0] || null, avgDaily: activeDays ? Calc.round(total / activeDays) : 0, byCategory,
        trend: r.days.map(d => ({ day: d, amount: byDay[d] || 0 })),
    });
});

router.post('/expenses', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const amount = paisa(b.amount, 'Amount');
    if (!amount) throw new HttpError(400, 'Enter the expense amount.');
    let category = null;
    if (b.categoryId) {
        category = await prisma.expenseCategory.findFirst({ where: { id: String(b.categoryId), tenantId: t, deletedAt: null } });
        if (!category) throw new HttpError(400, 'That expense category was not found.');
    }
    const at = await when(t, b.date);
    const e = await withTx(t, async tx => {
        let accountId = str(b.accountId, 60) || null, method = String(b.method || '').toUpperCase();
        if (accountId) { const a = await findAccount(t, accountId, tx); if (!METHODS.includes(method)) method = methodFor(a.type); }
        else { method = oneOf(method || undefined, METHODS, 'Method', 'CASH'); accountId = await treasury.accountFor(tx, t, method, null); }
        const reference = str(b.reference, 60) || await numbering.number(tx, t, 'expense', 'EXP-');
        const row = await tx.expense.create({ data: {
            tenantId: t, date: at, categoryId: category ? category.id : null, categoryName: category ? category.name : 'Uncategorized', amount: B(amount), accountId, method,
            payee: str(b.payee, 120), reference, note: str(b.note, 500), userId: req.user.id,
        } });
        await treasury.post(tx, { tenantId: t, accountId, type: 'EXPENSE', amount: -amount, refId: row.id, refNo: reference, note: [row.categoryName, row.payee, row.note].filter(Boolean).join(' — '), date: at });
        return row;
    });
    await audit(req, { action: 'finance.expense_create', summary: `Expense ${e.reference}: ${rs(amount)} for ${e.categoryName}${e.payee ? ` to ${e.payee}` : ''}` });
    res.json({ id: e.id, reference: e.reference });
});

router.delete('/expenses/:id', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const e = await prisma.expense.findFirst({ where: { id: req.params.id, tenantId: t, deletedAt: null } });
    if (e && e.source === 'PAYROLL') throw new HttpError(400, 'This expense is a paid salary (payslip). It is managed under HRM → Payroll.');
    if (!e) throw new HttpError(404, 'Expense not found.');
    const now = new Date();
    await withTx(t, async tx => {
        await tx.expense.update({ where: { id: e.id }, data: { deletedAt: now } });
        await tx.accountTxn.updateMany({ where: { tenantId: t, refId: e.id, deletedAt: null, type: 'EXPENSE' }, data: { deletedAt: now } });
    });
    await audit(req, { action: 'finance.expense_delete', summary: `Expense ${e.reference} (${rs(N(e.amount))}, ${e.categoryName}) deleted; the money went back to its account` });
    res.json({ ok: true });
});

// ───────────────────────── capital & equity ─────────────────────────
// net profit from the shared profit engine (an error is reported, never shown as a profit of 0)
async function netProfit(t, to) {
    const r = await require('../services/reports').profitAndLoss(t, { from: new Date(0), to });
    return Calc.round(Number(r.netProfit) || 0);
}
const CAP_LABEL = { SETUP: 'Capital Injection', INJECTION: 'Capital Injection', DRAWING: 'Owner Drawing', DIVIDEND: 'Dividend' };
const isIn = type => type === 'SETUP' || type === 'INJECTION';

router.get('/capital', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const setup = await settings.get(t, 'financialSetup');
    const rows = await prisma.capitalTxn.findMany({ where: { tenantId: t, deletedAt: null }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] });
    const accounts = Object.fromEntries((await prisma.account.findMany({ where: { tenantId: t }, select: { id: true, name: true } })).map(a => [a.id, a.name]));
    const injected = rows.filter(r => isIn(r.type)).reduce((s, r) => s + N(r.amount), 0);
    const drawings = rows.filter(r => !isIn(r.type)).reduce((s, r) => s + N(r.amount), 0);
    const profit = await netProfit(t, new Date());
    const retained = profit - drawings;
    // month by month (last 12 months, from the first movement)
    const tz = await tzOf(t);
    const now = new Date();
    const thisMonth = dates.ymd(now, tz).slice(0, 7);
    const first = rows.length ? dates.ymd(rows[rows.length - 1].date, tz).slice(0, 7) : thisMonth;
    const months = [];
    for (let m = thisMonth; months.length < 12; ) {
        months.unshift(m);
        if (m <= first && months.length >= 2) break;
        const [y, mo] = m.split('-').map(Number);
        m = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
    }
    const trend = [];
    for (const m of months) {
        const [y, mo] = m.split('-').map(Number);
        const next = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;
        const end = m === thisMonth ? now : dates.startOf(next, tz);
        const inUpTo = rows.filter(r => r.date < end);
        const cap = inUpTo.filter(r => isIn(r.type)).reduce((s, r) => s + N(r.amount), 0);
        const draw = inUpTo.filter(r => !isIn(r.type)).reduce((s, r) => s + N(r.amount), 0);
        const p = m === thisMonth ? profit : await netProfit(t, end);
        trend.push({ month: m, capital: cap, retained: p - draw, netWorth: cap + p - draw });
    }
    res.json({
        setup: { done: !!setup.done, openingCapital: Number(setup.openingCapital) || 0, openingCash: Number(setup.openingCash) || 0 },
        injected, drawings, netProfit: profit, retainedEarnings: retained, netWorth: injected + retained,
        movements: rows.map(r => ({ id: r.id, date: r.date, type: r.type, label: CAP_LABEL[r.type] || r.type, amount: N(r.amount), signed: isIn(r.type) ? N(r.amount) : -N(r.amount), accountId: r.accountId, accountName: accounts[r.accountId] || '', reference: r.reference, note: r.note })),
        trend,
    });
});

// opening books: capital invested + cash in hand today. Saving again replaces the earlier setup (old rows marked deleted).
router.post('/capital/setup', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const openingCapital = paisa(b.openingCapital, 'Initial investment amount');
    const openingCash = paisa(b.openingCash, 'Current cash/bank balance');
    const before = await settings.get(t, 'financialSetup');
    await withTx(t, async tx => {
        const old = await tx.capitalTxn.findMany({ where: { tenantId: t, type: 'SETUP', deletedAt: null } });
        const now = new Date();
        if (old.length) {
            await tx.capitalTxn.updateMany({ where: { id: { in: old.map(o => o.id) } }, data: { deletedAt: now } });
            await tx.accountTxn.updateMany({ where: { tenantId: t, refId: { in: old.map(o => o.id) }, deletedAt: null, type: 'OPENING' }, data: { deletedAt: now } });
        }
        const cash = await treasury.accountFor(tx, t, 'CASH', null);
        const row = await tx.capitalTxn.create({ data: { tenantId: t, date: old.length ? old[0].date : now, type: 'SETUP', amount: B(openingCapital), accountId: cash, reference: 'SETUP', note: 'Opening capital — initial business investment' } });
        if (openingCash) await treasury.post(tx, { tenantId: t, accountId: cash, type: 'OPENING', amount: openingCash, refId: row.id, refNo: 'SETUP', note: 'Opening cash balance', date: row.date });
        await settings.put(t, 'financialSetup', { done: true, openingCapital, openingCash }, tx);
    });
    await audit(req, { action: 'finance.capital_setup', summary: before.done ? `Opening books updated: capital ${rs(before.openingCapital)} → ${rs(openingCapital)}, opening cash ${rs(before.openingCash)} → ${rs(openingCash)}` : `Opening books set: capital ${rs(openingCapital)}, opening cash ${rs(openingCash)}` });
    res.json({ ok: true, openingCapital, openingCash });
});

router.post('/capital', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const type = oneOf(String(b.type || '').toUpperCase() || undefined, ['INJECTION', 'DRAWING', 'DIVIDEND'], 'Movement type', 'INJECTION');
    const amount = paisa(b.amount, 'Amount');
    if (!amount) throw new HttpError(400, 'Enter the amount.');
    const accountId = need(b.accountId, 'Transfer to/from account', 60);
    const at = await when(t, b.date);
    const reference = str(b.reference, 120), note = str(b.note, 500);
    const row = await withTx(t, async tx => {
        const a = await findAccount(t, accountId, tx);
        if (type !== 'INJECTION') {
            const bal = await accountBalance(t, a.id, tx);
            if (amount > bal) throw new HttpError(400, `"${a.name}" holds only ${rs(bal)}.`);
        }
        const r = await tx.capitalTxn.create({ data: { tenantId: t, date: at, type, amount: B(amount), accountId: a.id, reference, note } });
        await treasury.post(tx, { tenantId: t, accountId: a.id, type: type === 'INJECTION' ? 'CAPITAL_IN' : 'DRAWING', amount: type === 'INJECTION' ? amount : -amount, refId: r.id, refNo: reference || CAP_LABEL[type], note: note || CAP_LABEL[type], date: at });
        return { r, a };
    });
    await audit(req, { action: 'finance.capital_' + type.toLowerCase(), summary: `${CAP_LABEL[type]} of ${rs(amount)} ${type === 'INJECTION' ? 'into' : 'from'} "${row.a.name}"${reference ? ` (${reference})` : ''}` });
    res.json({ id: row.r.id });
});

router.delete('/capital/:id', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const c = await prisma.capitalTxn.findFirst({ where: { id: req.params.id, tenantId: t, deletedAt: null } });
    if (!c) throw new HttpError(404, 'Capital movement not found.');
    if (c.type === 'SETUP') throw new HttpError(400, 'Change the opening books with Update Setup instead.');
    const now = new Date();
    await withTx(t, async tx => {
        await tx.capitalTxn.update({ where: { id: c.id }, data: { deletedAt: now } });
        await tx.accountTxn.updateMany({ where: { tenantId: t, refId: c.id, deletedAt: null, type: { in: ['CAPITAL_IN', 'DRAWING'] } }, data: { deletedAt: now } });
    });
    await audit(req, { action: 'finance.capital_delete', summary: `${CAP_LABEL[c.type]} of ${rs(N(c.amount))} deleted; its account entry was reversed` });
    res.json({ ok: true });
});

// ───────────────────────── taxes & duties ─────────────────────────
const taxView = x => ({ id: x.id, name: x.name, rate: x.rate, combine: x.combine, active: x.active });
function readTax(b) { return { name: need(b.name, 'Tax name', 80), rate: num(b.rate, 'Rate (%)', { max: 100 }), combine: bool(b.combine), active: b.active === undefined ? true : bool(b.active) }; }
async function assertTaxNameFree(t, name, exceptId) {
    const hits = await prisma.tax.findMany({ where: { tenantId: t, deletedAt: null, name: ci(name), ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { name: true } });
    if (hits.some(h => h.name.trim().toLowerCase() === name.toLowerCase())) throw new HttpError(400, `A tax named "${name}" already exists.`);
}
// every signed-in user of the client may read the taxes (the POS uses them)
router.get('/taxes', requireTenant, async (req, res) => {
    res.json((await prisma.tax.findMany({ where: { tenantId: req.user.tenantId, deletedAt: null }, orderBy: { name: 'asc' } })).map(taxView));
});
router.post('/taxes', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const data = readTax(req.body || {});
    await assertTaxNameFree(t, data.name);
    const x = await prisma.tax.create({ data: { ...data, tenantId: t } });
    await audit(req, { action: 'finance.tax_create', summary: `Tax "${x.name}" (${x.rate}%${x.combine ? ', combine' : ''}${x.active ? '' : ', inactive'}) added` });
    res.json(taxView(x));
});
router.put('/taxes/:id', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const cur = await prisma.tax.findFirst({ where: { id: req.params.id, tenantId: t, deletedAt: null } });
    if (!cur) throw new HttpError(404, 'Tax not found.');
    const data = readTax({ ...cur, ...(req.body || {}) });
    await assertTaxNameFree(t, data.name, cur.id);
    const x = await prisma.tax.update({ where: { id: cur.id }, data });
    await audit(req, { action: 'finance.tax_update', summary: `Tax "${cur.name}" changed: ${cur.rate}% → ${x.rate}%${x.combine ? ', combine' : ''}${x.active ? ', active' : ', inactive'}` });
    res.json(taxView(x));
});
router.delete('/taxes/:id', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const cur = await prisma.tax.findFirst({ where: { id: req.params.id, tenantId: t, deletedAt: null } });
    if (!cur) throw new HttpError(404, 'Tax not found.');
    await prisma.tax.update({ where: { id: cur.id }, data: { deletedAt: new Date() } });
    await audit(req, { action: 'finance.tax_delete', summary: `Tax "${cur.name}" (${cur.rate}%) deleted` });
    res.json({ ok: true });
});

module.exports = { router, mount: '/api/finance' };
