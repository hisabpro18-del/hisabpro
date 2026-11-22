// Parties: customers and vendors (one table, type), their opening balances, live khata balances and statements.
// The POS (sales.create) may search and quick-add CUSTOMERS; everything else needs parties.manage.
const express = require('express');
const { prisma, withTx, ci } = require('../db');
const { HttpError, str, need, oneOf, isEmail } = require('../lib/http');
const { B, N, paisa } = require('../lib/money');
const { authenticate, can } = require('../auth');
const { audit } = require('../audit');
const Perms = require('../../public/js/shared/permissions');
const ledger = require('../services/ledger');
const settings = require('../services/settings');
const dates = require('../lib/dates');

const router = express.Router();
router.use(authenticate);

const TYPES = ['CUSTOMER', 'VENDOR'];
const GROUPS = ['RETAIL', 'WHOLESALE', 'VIP'];
const TERMS = ['COD', 'DUE_ON_RECEIPT', 'NET_15', 'NET_30', 'NET_45', 'NET_60', 'PREPAID'];
const MANAGE = can('parties.manage');
const rs = p => 'Rs ' + (Number(p || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const label = type => (type === 'VENDOR' ? 'Vendor' : 'Customer');

// customers can be read / added from the POS too
const typeOf = v => (String(v || '').toUpperCase() === 'VENDOR' ? 'VENDOR' : String(v || '').toUpperCase() === 'CUSTOMER' ? 'CUSTOMER' : '');
const READ = (req, res, next) => (typeOf(req.query.type) === 'CUSTOMER' ? can('sales.create', 'parties.manage') : MANAGE)(req, res, next);
const CREATE = (req, res, next) => ((typeOf(req.body && req.body.type) || 'CUSTOMER') === 'CUSTOMER' ? can('sales.create', 'parties.manage') : MANAGE)(req, res, next);

function view(p, balance = 0) {
    const creditLimit = N(p.creditLimit);
    return {
        id: p.id, type: p.type, name: p.name, contactPerson: p.contactPerson, phone: p.phone, email: p.email, group: p.group,
        taxId: p.taxId, creditLimit, paymentTerms: p.paymentTerms, notes: p.notes, address: p.address, city: p.city, bankDetails: p.bankDetails,
        active: p.active, createdAt: p.createdAt, balance, overLimit: p.type === 'CUSTOMER' && creditLimit > 0 && balance > creditLimit,
    };
}

// parties with their live balances (used by this file, purchases and finance)
async function listParties(tenantId, { type, q, take = 5000 } = {}) {
    const where = { tenantId, deletedAt: null };
    if (type) where.type = type;
    if (q) where.OR = [{ name: ci(q) }, { phone: ci(q) }, { contactPerson: ci(q) }, { email: ci(q) }];
    const rows = await prisma.party.findMany({ where, orderBy: { name: 'asc' }, take });
    const bal = {};
    for (const ty of TYPES) {
        const ids = rows.filter(r => r.type === ty).map(r => r.id);
        if (ids.length) Object.assign(bal, await ledger.balances(tenantId, { partyIds: ids, type: ty }));
    }
    return rows.map(r => view(r, bal[r.id] || 0));
}

async function findParty(tenantId, id, db = prisma) {
    const p = await db.party.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!p) throw new HttpError(404, 'Party not found.');
    return p;
}

async function assertNameFree(tenantId, type, name, exceptId) {
    const where = { tenantId, type, deletedAt: null, name: ci(name) };
    if (exceptId) where.id = { not: exceptId };
    const hits = await prisma.party.findMany({ where, select: { name: true } });
    if (hits.some(h => h.name.trim().toLowerCase() === name.toLowerCase())) throw new HttpError(400, `A ${label(type).toLowerCase()} named "${name}" already exists.`);
}

// the fields a form sends; `full` = may set money fields (opening balance, credit limit)
function readParty(b, type, full) {
    const email = str(b.email, 120);
    if (email && !isEmail(email)) throw new HttpError(400, 'The email address does not look right.');
    const d = {
        name: need(b.name, type === 'VENDOR' ? 'Company name' : 'Name', 160),
        phone: str(b.phone, 40), email, taxId: str(b.taxId, 60), notes: str(b.notes, 1000), address: str(b.address, 300), city: str(b.city, 80),
    };
    if (type === 'CUSTOMER') {
        d.group = oneOf(String(b.group || '').toUpperCase() || undefined, GROUPS, 'Customer group', 'RETAIL');
        if (full) d.creditLimit = B(paisa(b.creditLimit, 'Credit limit'));
    } else {
        d.contactPerson = str(b.contactPerson, 120);
        d.paymentTerms = oneOf(b.paymentTerms || undefined, TERMS, 'Payment terms', 'NET_30');
        d.bankDetails = str(b.bankDetails, 500);
    }
    return d;
}

// opening balance of a party = its OPENING ledger rows (customer: debit, vendor: credit)
async function openingOf(tenantId, party, db = prisma) {
    const rows = await db.ledgerEntry.findMany({ where: { tenantId, partyId: party.id, type: 'OPENING', deletedAt: null } });
    return rows.reduce((s, r) => s + (party.type === 'VENDOR' ? N(r.credit) - N(r.debit) : N(r.debit) - N(r.credit)), 0);
}
const postOpening = (tx, tenantId, party, amount) => ledger.post(tx, {
    tenantId, partyId: party.id, type: 'OPENING', refId: party.id, refNo: 'Opening balance', note: 'Opening balance',
    ...(party.type === 'VENDOR' ? { credit: amount } : { debit: amount }), date: party.createdAt,
});

// ── list (POS search uses ?type=CUSTOMER&q=) ──
router.get('/', READ, async (req, res) => {
    const type = typeOf(req.query.type) || undefined;
    const q = str(req.query.q, 100);
    res.json(await listParties(req.user.tenantId, { type, q, take: q ? 200 : 5000 }));
});

// KPI figures of the Customers / Vendors screens
router.get('/stats', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const type = typeOf(req.query.type) || 'CUSTOMER';
    const list = await listParties(t, { type });
    const outstanding = list.reduce((s, p) => s + Math.max(p.balance, 0), 0);
    if (type === 'CUSTOMER') return res.json({ total: list.length, receivables: outstanding, overLimit: list.filter(p => p.overLimit).length });
    const loc = await settings.get(t, 'localization');
    const month = dates.range('month', { tz: loc.timezone });
    res.json({ total: list.length, payables: outstanding, recentInwards: list.filter(p => new Date(p.createdAt) >= month.from).length });
});

router.get('/:id', async (req, res, next) => {
    const p = await findParty(req.user.tenantId, req.params.id);
    const allowed = p.type === 'CUSTOMER' ? ['sales.create', 'parties.manage'] : ['parties.manage'];
    if (!allowed.some(k => Perms.has(req.user, k))) return next(new HttpError(403, 'You do not have permission for this. Ask the shop owner or HisabPro to change your access.'));
    const balance = await ledger.balance(req.user.tenantId, p.id, p.type === 'VENDOR');
    res.json({ ...view(p, balance), openingBalance: await openingOf(req.user.tenantId, p) });
});

router.post('/', CREATE, async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const type = typeOf(b.type) || 'CUSTOMER';
    const full = Perms.has(req.user, 'parties.manage'); // a cashier's quick-add cannot set balances or limits
    const data = readParty(b, type, full);
    const opening = full ? paisa(b.openingBalance, type === 'VENDOR' ? 'Opening payable' : 'Opening receivable') : 0;
    await assertNameFree(t, type, data.name);
    const party = await withTx(t, async tx => {
        const p = await tx.party.create({ data: { ...data, tenantId: t, type } });
        if (opening) await postOpening(tx, t, p, opening);
        return p;
    });
    await audit(req, { action: 'parties.create', summary: `${label(type)} "${party.name}" added${opening ? ` with opening ${type === 'VENDOR' ? 'payable' : 'receivable'} ${rs(opening)}` : ''}` });
    res.json(view(party, opening));
});

router.put('/:id', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const cur = await findParty(t, req.params.id);
    const b = { ...view(cur), ...(req.body || {}) };
    const data = readParty(b, cur.type, true);
    if (cur.type === 'VENDOR') delete data.creditLimit;
    await assertNameFree(t, cur.type, data.name, cur.id);
    const before = await openingOf(t, cur);
    const opening = req.body && req.body.openingBalance !== undefined ? paisa(req.body.openingBalance, 'Opening balance') : before;
    await withTx(t, async tx => {
        await tx.party.update({ where: { id: cur.id }, data });
        if (opening !== before) {
            // corrections are new rows: the old opening entry is marked deleted and a new one written
            await tx.ledgerEntry.updateMany({ where: { tenantId: t, partyId: cur.id, type: 'OPENING', deletedAt: null }, data: { deletedAt: new Date() } });
            if (opening) await postOpening(tx, t, cur, opening);
        }
    });
    const changes = ['name', 'phone', 'email', 'group', 'creditLimit', 'paymentTerms'].filter(k => data[k] !== undefined && String(cur[k]) !== String(data[k]));
    await audit(req, { action: 'parties.update', summary: `${label(cur.type)} "${cur.name}" changed${changes.length ? ': ' + changes.join(', ') : ''}${opening !== before ? `; opening balance ${rs(before)} → ${rs(opening)}` : ''}` });
    const balance = await ledger.balance(t, cur.id, cur.type === 'VENDOR');
    res.json(view(await findParty(t, cur.id), balance));
});

router.delete('/:id', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const cur = await findParty(t, req.params.id);
    // checked under the client's lock, so a sale or payment saved at the same moment cannot slip past the zero check
    await withTx(t, async tx => {
        const balance = await ledger.balance(t, cur.id, cur.type === 'VENDOR', tx);
        if (balance !== 0) throw new HttpError(400, `"${cur.name}" still has a balance of ${rs(balance)}. Settle it to zero before deleting.`);
        // a pending cheque would post to the khata of a deleted party when it clears
        const pending = await tx.cheque.count({ where: { tenantId: t, partyId: cur.id, status: 'PENDING', deletedAt: null } });
        if (pending) throw new HttpError(400, `"${cur.name}" has ${pending} pending cheque(s). Clear, bounce or cancel them before deleting.`);
        await tx.party.update({ where: { id: cur.id }, data: { deletedAt: new Date() } });
    });
    await audit(req, { action: 'parties.delete', summary: `${label(cur.type)} "${cur.name}" deleted (the khata history is kept)` });
    res.json({ ok: true });
});

// statement: every khata entry with the running balance
router.get('/:id/ledger', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const p = await findParty(t, req.params.id);
    const entries = await ledger.statement(t, p);
    const totals = entries.reduce((s, e) => ({ debit: s.debit + e.debit, credit: s.credit + e.credit }), { debit: 0, credit: 0 });
    res.json({ party: view(p, entries.length ? entries[entries.length - 1].balance : 0), entries, totals, balance: entries.length ? entries[entries.length - 1].balance : 0 });
});

module.exports = { router, mount: '/api/parties', listParties, partyView: view, TERMS };
