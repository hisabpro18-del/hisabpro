// POS: what the cashier screen needs, sales (one transaction: stock, payments, khata, serials), held carts, returns.
const express = require('express');
const { prisma, withTx, ci } = require('../db');
const { HttpError, str, need, num, bool, oneOf } = require('../lib/http');
const { B, N, paisa } = require('../lib/money');
const { authenticate, can } = require('../auth');
const { audit } = require('../audit');
const stock = require('../services/stock');
const ledger = require('../services/ledger');
const treasury = require('../services/treasury');
const numbering = require('../services/numbering');
const settings = require('../services/settings');
const state = require('../sync/state');
const Calc = require('../../public/js/shared/calc');
const Perms = require('../../public/js/shared/permissions');

const router = express.Router();
router.use(authenticate);

const SELL = can('sales.create');
const VIEW = can('sales.view', 'sales.create', 'sales.delete');
const RETURN = can('sales.delete');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const parseUnits = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };
// a cashier (sales.create only) opens just their own sales; returns staff must open any sale to return it
// child rows of a sale, only this client's (a row pushed by another client's PC under this sale's id never shows)
const withLines = t => ({ items: { where: { tenantId: t } }, payments: { where: { tenantId: t } } });
const seesAllSales = u => Perms.has(u, 'sales.view') || Perms.has(u, 'sales.delete');

async function activeTaxes(tenantId, db = prisma) {
    return db.tax.findMany({ where: { tenantId, deletedAt: null, active: true }, orderBy: { createdAt: 'asc' } });
}

// ── what the POS screen loads once ──
router.get('/bootstrap', SELL, async (req, res) => {
    const t = req.user.tenantId;
    const [taxes, accounts, cats, all] = await Promise.all([
        activeTaxes(t),
        prisma.account.findMany({ where: { tenantId: t, deletedAt: null, active: true }, orderBy: [{ type: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }] }),
        prisma.category.findMany({ where: { tenantId: t, deletedAt: null, active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
        settings.getAll(t),
    ]);
    res.json({
        taxes: taxes.map(x => ({ id: x.id, name: x.name, rate: x.rate, combine: x.combine, active: x.active })),
        defaultRate: Calc.effectiveRate(taxes),
        accounts: accounts.map(a => ({ id: a.id, name: a.name, type: a.type, isDefault: a.isDefault })),
        categories: cats.map(c => ({ id: c.id, name: c.name, parentId: c.parentId })),
        pos: all.pos, receipt: all.receipt, numbering: all.numbering, company: all.company,
        canOverrideLimit: Perms.has(req.user, 'parties.manage'),
    });
});

// ── customers for credit sales (search + quick add) ──
router.get('/customers', can('sales.create', 'parties.manage'), async (req, res) => {
    const t = req.user.tenantId;
    const q = str(req.query.q, 80);
    const where = { tenantId: t, type: 'CUSTOMER', deletedAt: null, active: true };
    if (q) where.OR = [{ name: ci(q) }, { phone: { contains: q } }];
    const list = await prisma.party.findMany({ where, orderBy: { name: 'asc' }, take: 30 });
    const bal = await ledger.balances(t, { partyIds: list.map(p => p.id), type: 'CUSTOMER' });
    res.json(list.map(p => ({ id: p.id, name: p.name, phone: p.phone, group: p.group, creditLimit: N(p.creditLimit), notes: p.notes, balance: bal[p.id] || 0 })));
});
router.post('/customers', can('sales.create', 'parties.manage'), async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const name = need(b.name, 'Customer name', 120);
    const dupe = await prisma.party.findFirst({ where: { tenantId: t, type: 'CUSTOMER', deletedAt: null, name: ci(name) } });
    if (dupe && dupe.name.toLowerCase() === name.toLowerCase()) throw new HttpError(400, `A customer named "${dupe.name}" already exists.`);
    const p = await prisma.party.create({ data: { tenantId: t, type: 'CUSTOMER', name, phone: str(b.phone, 30), group: oneOf(b.group, ['RETAIL', 'WHOLESALE', 'VIP'], 'Group', 'RETAIL'), creditLimit: B(paisa(b.creditLimit, 'Credit limit')) } });
    await audit(req, { action: 'party.create', summary: `Customer "${name}" added from the POS` });
    res.json({ id: p.id, name: p.name, phone: p.phone, group: p.group, creditLimit: N(p.creditLimit), notes: '', balance: 0 });
});

// the price this customer last paid for each product (wholesale shops quote "same rate as last time")
router.get('/customers/:id/last-prices', can('sales.create', 'parties.manage'), async (req, res) => {
    const t = req.user.tenantId;
    const sales = await prisma.sale.findMany({ where: { tenantId: t, customerId: req.params.id, deletedAt: null }, orderBy: { date: 'desc' }, take: 60, select: { id: true, date: true } });
    const items = sales.length ? await prisma.saleItem.findMany({ where: { tenantId: t, saleId: { in: sales.map(s => s.id) }, deletedAt: null } }) : [];
    const dateOf = Object.fromEntries(sales.map(s => [s.id, s.date]));
    const out = {};
    for (const it of items.sort((a, b) => dateOf[b.saleId] - dateOf[a.saleId])) {
        const key = `${it.productId}:${it.unitId || ''}`;
        if (!out[key]) out[key] = { productId: it.productId, unitId: it.unitId, price: N(it.price), unitName: it.unitName, date: dateOf[it.saleId] };
    }
    res.json(Object.values(out));
});

// ── sale ──
function saleView(s) {
    return {
        ...s,
        items: (s.items || []).filter(i => !i.deletedAt).map(i => ({ ...i })),
        payments: (s.payments || []).filter(p => !p.deletedAt).map(p => ({ ...p })),
    };
}

router.post('/sales', SELL, async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    // the cart's own id makes a resend (double click, lost answer, offline retry) return the same sale
    const id = b.clientId && UUID.test(b.clientId) ? b.clientId.toLowerCase() : undefined;
    if (id) {
        const prev = await prisma.sale.findFirst({ where: { id, tenantId: t }, include: withLines(t) });
        if (prev) return res.json({ ...saleView(prev), duplicate: true });
    }
    const mode = oneOf(b.mode, ['WALKIN', 'CREDIT'], 'Customer mode', 'WALKIN');
    const priceMode = oneOf(b.priceMode, ['RETAIL', 'WHOLESALE'], 'Price mode', 'RETAIL');
    const items = Array.isArray(b.items) ? b.items.slice(0, 500) : [];
    if (!items.length) throw new HttpError(400, 'The cart is empty.');
    if (items.some(i => !i || typeof i !== 'object')) throw new HttpError(400, 'A cart line could not be read.');
    const payments = (Array.isArray(b.payments) ? b.payments : []).filter(p => p && typeof p === 'object').map(p => ({ method: oneOf(p.method, ['CASH', 'CARD', 'BANK'], 'Payment method'), amount: paisa(p.amount, 'Payment'), accountId: str(p.accountId, 60) || null })).filter(p => p.amount > 0);
    const discountType = oneOf(b.discountType, ['AMOUNT', 'PERCENT'], 'Discount type', 'AMOUNT');
    // AMOUNT discounts arrive in paisa from the POS; Calc.bill takes rupees for AMOUNT
    const discountValue = discountType === 'PERCENT' ? num(b.discountValue, 'Discount %', { max: 100 }) : paisa(b.discountValue, 'Discount') / 100;

    const sale = await withTx(t, async tx => {
        // checked again under the client lock: two copies of the same cart sent at once must not make a second sale (or a 500)
        if (id) {
            const again = await tx.sale.findFirst({ where: { id }, include: withLines(t) });
            if (again) {
                if (again.tenantId !== t) throw new HttpError(400, 'That cart id cannot be used.');
                return { ...again, duplicate: true };
            }
        }
        const all = await settings.getAll(t, tx);
        const products = await tx.product.findMany({ where: { tenantId: t, id: { in: [...new Set(items.map(i => String(i.productId)))] }, deletedAt: null } });
        const byId = Object.fromEntries(products.map(p => [p.id, p]));
        const lines = items.map((it, i) => {
            const p = byId[it.productId];
            if (!p) throw new HttpError(400, `Line ${i + 1}: that product no longer exists.`);
            if (p.type === 'VARIANT') throw new HttpError(400, `Line ${i + 1}: choose a colour/size of "${p.name}".`);
            const qty = Calc.q3(num(it.qty, `Line ${i + 1} quantity`, { min: 0.001, max: 1e7, allowEmpty: false }));
            let factor = 1, unitName = '', unitId = p.baseUnitId;
            if (it.unitId && it.unitId !== p.baseUnitId) {
                const u = parseUnits(p.altUnits).find(x => x.unitId === it.unitId);
                if (!u) throw new HttpError(400, `Line ${i + 1}: that unit is not set up for "${p.name}".`);
                factor = Number(u.factor) || 1; unitId = u.unitId;
            }
            // a price may carry fractions of a paisa (e.g. a carton price ÷ 12 pieces): the line total is rounded, not the unit price
            const price = it.price === undefined || it.price === null || it.price === '' ? null : (() => {
                const n = Number(it.price);
                if (!Number.isFinite(n) || n < 0 || n > 1e14) throw new HttpError(400, `Line ${i + 1}: the price is not valid.`);
                return Math.round(n * 10000) / 10000;
            })();
            const serial = p.type === 'SERIAL' ? str(it.serial, 120) : '';
            if (p.type === 'SERIAL') {
                if (!serial) throw new HttpError(400, `Line ${i + 1}: pick the serial / IMEI of "${p.name}".`);
                if (qty !== 1) throw new HttpError(400, `Line ${i + 1}: a serialized item is sold one serial per line.`);
            }
            return { p, qty, factor, unitId, unitName, price, lineDiscount: paisa(it.lineDiscount, `Line ${i + 1} discount`), serial, note: str(it.note, 200) };
        });
        // unit names for the receipt
        const unitIds = [...new Set(lines.map(l => l.unitId).filter(Boolean))];
        const units = Object.fromEntries((await tx.unit.findMany({ where: { tenantId: t, id: { in: unitIds } } })).map(u => [u.id, u.shortCode]));
        for (const l of lines) {
            l.unitName = units[l.unitId] || '';
            if (l.price === null) {
                // default price: alternate unit's own price, else the base price ÷ factor (wholesale when chosen and set)
                const base = priceMode === 'WHOLESALE' && l.p.wholesalePrice !== null ? N(l.p.wholesalePrice) : N(l.p.retailPrice);
                const alt = l.factor !== 1 ? parseUnits(l.p.altUnits).find(x => x.unitId === l.unitId) : null;
                const wholesale = priceMode === 'WHOLESALE' && l.p.wholesalePrice !== null;
                l.price = alt && alt.price && !wholesale ? Number(alt.price) : Math.round(base / l.factor * 10000) / 10000;
            }
        }
        const taxes = await activeTaxes(t, tx);
        const calc = Calc.bill(lines.map(l => ({ qty: l.qty, price: l.price, lineDiscount: l.lineDiscount, taxRate: l.p.taxRate })), { discountType, discountValue, defaultRate: Calc.effectiveRate(taxes) });
        // a typo like a price of 1e14 × 1e7 pieces would overflow the database's money column (a 500): refuse it plainly
        if (!(calc.subtotal <= 1e15)) throw new HttpError(400, 'The bill total is too large. Check the quantities and prices.');
        const pay = Calc.settle(calc.total, payments);
        const cashTendered = payments.filter(p => p.method === 'CASH').reduce((s, p) => s + p.amount, 0);
        if (pay.change > cashTendered) throw new HttpError(400, 'Change can only be given back on a cash payment. Lower the card/bank amount.');

        let customer = null;
        if (mode === 'CREDIT') {
            if (!b.customerId) throw new HttpError(400, 'Choose the credit (udhar) customer.');
            customer = await tx.party.findFirst({ where: { id: String(b.customerId), tenantId: t, type: 'CUSTOMER', deletedAt: null } });
            if (!customer) throw new HttpError(400, 'That customer was not found.');
            const limit = N(customer.creditLimit);
            if (limit > 0 && pay.due > 0) {
                const bal = await ledger.balance(t, customer.id, false, tx);
                if (bal + pay.due > limit && !(bool(b.overrideLimit) && Perms.has(req.user, 'parties.manage')))
                    throw new HttpError(400, `This sale takes ${customer.name} over the credit limit (${Calc.toRupees(limit).toLocaleString('en-US')}): balance would be ${Calc.toRupees(bal + pay.due).toLocaleString('en-US')}.`, { code: 'CREDIT_LIMIT' });
            }
        } else if (pay.due > 0) {
            throw new HttpError(400, 'A walk-in sale must be paid in full. Take the full amount, or choose Credit (Udhar) and a customer.');
        }

        if (!all.pos.allowNegativeStock) {
            const lv = await stock.levels(t, lines.map(l => l.p.id), tx);
            // the same product on several lines (or in several units) counts together
            const wanted = {};
            for (const l of lines) if (l.p.type !== 'SERVICE') wanted[l.p.id] = Calc.q3((wanted[l.p.id] || 0) + Calc.q3(l.qty / l.factor));
            for (const l of lines) if (wanted[l.p.id] !== undefined && (lv[l.p.id] || 0) < wanted[l.p.id] - 1e-9) throw new HttpError(400, `Not enough stock of "${l.p.name}" (${lv[l.p.id] || 0} left).`);
        }
        const serialsTaken = new Set();
        for (const l of lines.filter(l => l.serial)) {
            const key = `${l.p.id}:${l.serial.toLowerCase()}`;
            if (serialsTaken.has(key)) throw new HttpError(400, `Serial ${l.serial} of "${l.p.name}" is on two lines.`);
            serialsTaken.add(key);
            const s = await tx.productSerial.findFirst({ where: { tenantId: t, productId: l.p.id, serial: l.serial, deletedAt: null } });
            if (!s || s.status !== 'IN_STOCK') throw new HttpError(400, `Serial ${l.serial} of "${l.p.name}" is not in stock.`);
            l.serialId = s.id;
        }

        const number = await numbering.number(tx, t, 'INV', all.numbering.invoicePrefix || 'INV-');
        const date = new Date();
        const itemRows = lines.map((l, i) => {
            const c = calc.lines[i];
            const baseQty = Calc.q3(l.qty / l.factor);
            return {
                tenantId: t, productId: l.p.id, name: l.p.name, variantLabel: l.p.variantLabel, unitId: l.unitId, unitName: l.unitName, factor: l.factor,
                qty: l.qty, baseQty, price: B(Calc.round(l.price)), mrp: l.p.retailPrice && l.factor === 1 ? l.p.retailPrice : B(Calc.round(N(l.p.retailPrice) / l.factor)),
                gross: B(c.gross), discount: B(c.discount), taxRate: c.taxRate, tax: B(c.tax), total: B(c.total), cost: l.p.cost, serial: l.serial, note: l.note,
            };
        });
        const costTotal = lines.reduce((s, l, i) => s + Calc.round(N(l.p.cost) * itemRows[i].baseQty), 0);
        const kept = payments.map(p => ({ ...p }));
        let changeLeft = pay.change;
        for (const p of kept) if (p.method === 'CASH' && changeLeft) { const c = Math.min(changeLeft, p.amount); p.amount -= c; changeLeft -= c; }
        const accounts = [];
        for (const p of kept) accounts.push(p.amount ? await treasury.accountFor(tx, t, p.method, p.accountId) : null);

        const created = await tx.sale.create({
            data: {
                ...(id ? { id } : {}), tenantId: t, number, date, status: pay.due > 0 ? 'DUE' : 'COMPLETED', mode, priceMode,
                customerId: customer ? customer.id : null, customerName: customer ? customer.name : (str(b.customerName, 120) || 'Walk-in Customer'),
                subtotal: B(calc.subtotal), discountType, discountValue: discountType === 'PERCENT' ? discountValue : discountValue * 100, discount: B(calc.discount), tax: B(calc.tax), total: B(calc.total),
                paid: B(pay.paid), tendered: B(pay.tendered), change: B(pay.change), due: B(pay.due), costTotal: B(costTotal), itemsCount: lines.length,
                note: str(b.note, 300), cashierId: req.user.id, cashierName: req.user.name || req.user.email, deviceId: state.deviceId(),
                items: { create: itemRows },
                payments: { create: kept.filter(p => p.amount > 0).map(p => ({ tenantId: t, method: p.method, amount: B(p.amount), accountId: accounts[kept.indexOf(p)] })) },
            },
            include: withLines(t),
        });
        for (const it of created.items) {
            const p = byId[it.productId];
            if (p.type !== 'SERVICE') await stock.move(tx, { tenantId: t, productId: p.id, qty: -it.baseQty, type: 'SALE', unitCost: N(it.cost), refId: created.id, refNo: number, date, userId: req.user.id });
        }
        for (const l of lines.filter(l => l.serialId)) await tx.productSerial.update({ where: { id: l.serialId }, data: { status: 'SOLD', saleId: created.id } });
        for (const p of created.payments) await treasury.post(tx, { tenantId: t, accountId: p.accountId, type: 'SALE', amount: N(p.amount), partyId: customer ? customer.id : null, refId: created.id, refNo: number, date });
        if (customer) {
            await ledger.post(tx, { tenantId: t, partyId: customer.id, type: 'SALE', debit: calc.total, refId: created.id, refNo: number, date });
            if (pay.paid) await ledger.post(tx, { tenantId: t, partyId: customer.id, type: 'PAYMENT_IN', credit: pay.paid, refId: created.id, refNo: number, note: 'Paid at the counter', date });
        }
        return created;
    });
    if (sale.duplicate) return res.json(saleView(sale));
    await audit(req, { action: 'sale.create', summary: `Sale ${sale.number}: ${Calc.toRupees(N(sale.total)).toFixed(2)} (${sale.mode === 'CREDIT' ? `credit, due ${Calc.toRupees(N(sale.due)).toFixed(2)}` : 'paid'})` });
    res.json(saleView(sale));
});

// balance of the sale's customer before and after (for "Show Previous Balance" on the receipt)
async function withBalance(t, s) {
    if (!s.customerId) return s;
    const now = await ledger.balance(t, s.customerId, false);
    return { ...s, customerBalance: now };
}

router.get('/sales', VIEW, async (req, res) => {
    const t = req.user.tenantId;
    const where = { tenantId: t, deletedAt: null };
    const q = str(req.query.q, 80);
    if (q) where.OR = [{ number: ci(q) }, { customerName: ci(q) }];
    if (req.query.status) where.status = String(req.query.status) === 'REFUNDED' ? { in: ['REFUNDED', 'PARTIAL_REFUND'] } : String(req.query.status);
    if (req.query.from || req.query.to) {
        const tz = (await settings.get(t, 'localization')).timezone;
        const { range } = require('../lib/dates');
        const r = range('custom', { from: req.query.from, to: req.query.to || req.query.from, tz });
        where.date = { gte: r.from, lt: r.to };
    }
    if (!Perms.has(req.user, 'sales.view')) where.cashierId = req.user.id; // a cashier sees only their own sales
    const list = await prisma.sale.findMany({ where, orderBy: { date: 'desc' }, take: Math.min(Number(req.query.limit) || 1000, 5000) });
    res.json({
        sales: list.map(s => ({ id: s.id, number: s.number, date: s.date, customerName: s.customerName, status: s.status, mode: s.mode, total: N(s.total), due: N(s.due), paid: N(s.paid), returnedTotal: N(s.returnedTotal), cashierName: s.cashierName, itemsCount: s.itemsCount })),
        summary: { count: list.length, revenue: list.reduce((a, s) => a + N(s.total) - N(s.returnedTotal), 0), due: list.reduce((a, s) => a + N(s.due), 0) },
    });
});

router.get('/sales/lookup', VIEW, async (req, res) => {
    const t = req.user.tenantId;
    const code = str(req.query.code, 80);
    if (!code) throw new HttpError(400, 'Enter an invoice number.');
    let s = UUID.test(code) ? await prisma.sale.findFirst({ where: { tenantId: t, id: code.toLowerCase(), deletedAt: null }, include: withLines(t) }) : null;
    // "contains" can also match longer numbers (INV-0001 inside XINV-0001): take the exact one
    if (!s) s = (await prisma.sale.findMany({ where: { tenantId: t, deletedAt: null, number: ci(code) }, include: withLines(t), take: 50 })).find(x => x.number.toLowerCase() === code.toLowerCase()) || null;
    if (!s) throw new HttpError(404, `No sale found with number ${code}.`);
    if (!seesAllSales(req.user) && s.cashierId !== req.user.id) throw new HttpError(403, 'You can only open your own sales.');
    res.json(await withBalance(t, saleView(s)));
});

router.get('/sales/:id', VIEW, async (req, res) => {
    const t = req.user.tenantId;
    const s = await prisma.sale.findFirst({ where: { tenantId: t, id: req.params.id, deletedAt: null }, include: withLines(t) });
    if (!s) throw new HttpError(404, 'Sale not found.');
    if (!seesAllSales(req.user) && s.cashierId !== req.user.id) throw new HttpError(403, 'You can only open your own sales.');
    const returns = await prisma.saleReturn.findMany({ where: { tenantId: t, saleId: s.id, deletedAt: null }, orderBy: { date: 'asc' } });
    res.json({ ...(await withBalance(t, saleView(s))), returns: returns.map(r => ({ id: r.id, number: r.number, date: r.date, total: N(r.total) })) });
});

// ── held carts ──
router.get('/held', SELL, async (req, res) => {
    const list = await prisma.heldSale.findMany({ where: { tenantId: req.user.tenantId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json(list.map(h => ({ id: h.id, label: h.label, total: N(h.total), userName: h.userName, createdAt: h.createdAt, cart: JSON.parse(h.cart || '{}') })));
});
router.post('/held', SELL, async (req, res) => {
    const b = req.body || {};
    const cart = JSON.stringify(b.cart || {});
    if (cart.length > 200000) throw new HttpError(400, 'That cart is too large to hold.');
    const h = await prisma.heldSale.create({ data: { tenantId: req.user.tenantId, label: str(b.label, 80), cart, total: B(paisa(b.total, 'Total')), userId: req.user.id, userName: req.user.name || req.user.email } });
    res.json({ id: h.id });
});
router.delete('/held/:id', SELL, async (req, res) => {
    const h = await prisma.heldSale.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId, deletedAt: null } });
    if (!h) throw new HttpError(404, 'That held sale was already resumed or removed.');
    await prisma.heldSale.update({ where: { id: h.id }, data: { deletedAt: new Date() } });
    res.json({ ok: true });
});

// ── returns (refund & credit note) ──
router.post('/returns', RETURN, async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const lines = Array.isArray(b.items) ? b.items : [];
    // the return form's own id makes a double click / resend give back the same credit note instead of a second one
    const rid = b.clientId && UUID.test(b.clientId) ? b.clientId.toLowerCase() : undefined;
    if (rid) { const prev = await prisma.saleReturn.findFirst({ where: { id: rid, tenantId: t } }); if (prev) return res.json({ ...prev, duplicate: true }); }
    const ret = await withTx(t, async tx => {
        if (rid) { const prev = await tx.saleReturn.findFirst({ where: { id: rid, tenantId: t } }); if (prev) return { ...prev, duplicate: true }; }
        const sale = await tx.sale.findFirst({ where: { tenantId: t, id: String(b.saleId || ''), deletedAt: null }, include: { items: { where: { tenantId: t } } } });
        if (!sale) throw new HttpError(404, 'Sale not found.');
        const prevItems = await tx.saleReturnItem.findMany({ where: { tenantId: t, saleItemId: { in: sale.items.map(i => i.id) }, deletedAt: null } });
        // what each sale line has already given back. The return lines are the record (they add up across PCs after a
        // sync, where the saleItem.returnedQty counter is last-change-wins), so the larger of the two is trusted. Lines of
        // this request count too, so the same sale line sent twice cannot be refunded twice.
        const done = {};
        for (const it of sale.items) {
            const before = prevItems.filter(p => p.saleItemId === it.id);
            const qty = Calc.q3(before.reduce((s, p) => s + p.qty, 0));
            done[it.id] = { qty: Math.max(qty, it.returnedQty || 0), total: before.reduce((s, p) => s + N(p.total), 0), tax: before.reduce((s, p) => s + N(p.tax), 0) };
        }
        const rows = [];
        for (const l of lines) {
            if (!l || typeof l !== 'object') continue;
            const qty = Calc.q3(Number(l.qty) || 0);
            if (!(qty > 0)) continue;
            const item = sale.items.find(i => i.id === l.saleItemId && !i.deletedAt);
            if (!item) throw new HttpError(400, 'A returned line is not on this sale.');
            const d = done[item.id];
            const left = Calc.q3(item.qty - d.qty);
            if (qty > left + 1e-9) throw new HttpError(400, `"${item.name}": only ${Math.max(left, 0)} can still be returned.`);
            // the last of a line takes exactly what is left, so the returns add up to the line to the paisa
            const all = Math.abs(qty - left) < 1e-9;
            const restTotal = Math.max(N(item.total) - d.total, 0), restTax = Math.max(N(item.tax) - d.tax, 0);
            const total = all ? restTotal : Math.min(Calc.round(N(item.total) * qty / item.qty), restTotal);
            const tax = all ? restTax : Math.min(Calc.round(N(item.tax) * qty / item.qty), restTax);
            d.qty = Calc.q3(d.qty + qty); d.total += total; d.tax += tax;
            rows.push({ item, qty, baseQty: Calc.q3(qty / (item.factor || 1)), total, tax, restock: l.restock !== false });
        }
        if (!rows.length) throw new HttpError(400, 'Enter a return quantity for at least one line.');
        const refund = rows.reduce((s, r) => s + r.total, 0);
        const refundMethod = oneOf(b.refundMethod, ['CASH', 'CREDIT'], 'Refund method', sale.customerId ? 'CREDIT' : 'CASH');
        if (refundMethod === 'CREDIT' && !sale.customerId) throw new HttpError(400, 'A walk-in sale is refunded in cash.');
        if (refundMethod === 'CASH') {
            // cash back can never be more than the customer actually paid on this bill (the rest was udhaar: credit it instead)
            const cashBefore = (await tx.saleReturn.findMany({ where: { tenantId: t, saleId: sale.id, deletedAt: null, refundMethod: 'CASH' }, select: { total: true } })).reduce((a, x) => a + N(x.total), 0);
            const left = N(sale.paid) - cashBefore;
            if (refund > left) throw new HttpError(400, sale.customerId ? `Only ${Calc.toRupees(Math.max(left, 0)).toFixed(2)} of this bill was paid in cash. Refund the rest to the customer's khata (credit note).` : 'This refund is more than was paid on the bill.');
        }
        const number = await numbering.number(tx, t, 'RET', 'RET-');
        const date = new Date();
        const accountId = refundMethod === 'CASH' ? await treasury.accountFor(tx, t, 'CASH', str(b.accountId, 60) || null) : null;
        const r = await tx.saleReturn.create({
            data: {
                ...(rid ? { id: rid } : {}), tenantId: t, number, date, saleId: sale.id, saleNumber: sale.number, customerId: sale.customerId, customerName: sale.customerName, total: B(refund), tax: B(rows.reduce((s, x) => s + x.tax, 0)),
                refundMethod, accountId, reason: str(b.reason, 300), userId: req.user.id, userName: req.user.name || req.user.email,
                items: { create: rows.map(x => ({ tenantId: t, saleItemId: x.item.id, productId: x.item.productId, name: x.item.name, qty: x.qty, baseQty: x.baseQty, price: x.item.price, total: B(x.total), tax: B(x.tax), cost: x.item.cost, restock: x.restock })) },
            },
        });
        for (const id of new Set(rows.map(x => x.item.id))) await tx.saleItem.update({ where: { id }, data: { returnedQty: done[id].qty } });
        for (const x of rows) {
            const p = await tx.product.findFirst({ where: { id: x.item.productId, tenantId: t } });
            if (x.restock && p && p.type !== 'SERVICE') await stock.move(tx, { tenantId: t, productId: x.item.productId, qty: x.baseQty, type: 'SALE_RETURN', unitCost: N(x.item.cost), refId: r.id, refNo: number, date, userId: req.user.id });
            if (x.item.serial) await tx.productSerial.updateMany({ where: { tenantId: t, productId: x.item.productId, serial: x.item.serial }, data: { status: x.restock ? 'IN_STOCK' : 'SOLD', saleId: x.restock ? null : sale.id } });
        }
        if (refundMethod === 'CASH') await treasury.post(tx, { tenantId: t, accountId, type: 'SALE_RETURN', amount: -refund, partyId: sale.customerId, refId: r.id, refNo: number, date });
        else await ledger.post(tx, { tenantId: t, partyId: sale.customerId, type: 'SALE_RETURN', credit: refund, refId: r.id, refNo: number, note: `Return on ${sale.number}`, date });
        // Σ of the sale's returns (this one included): additive across PCs, unlike a running total
        const returnedTotal = N((await tx.saleReturn.aggregate({ where: { tenantId: t, saleId: sale.id, deletedAt: null }, _sum: { total: true } }))._sum.total);
        const fresh = await tx.saleItem.findMany({ where: { tenantId: t, saleId: sale.id, deletedAt: null } });
        const allBack = fresh.every(i => i.returnedQty >= i.qty - 1e-9);
        await tx.sale.update({ where: { id: sale.id }, data: { returnedTotal: B(returnedTotal), status: allBack ? 'REFUNDED' : 'PARTIAL_REFUND' } });
        return r;
    });
    await audit(req, { action: 'sale.return', summary: `Return ${ret.number} on ${ret.saleNumber}: ${Calc.toRupees(N(ret.total)).toFixed(2)} refunded (${ret.refundMethod === 'CASH' ? 'cash' : 'to the customer\'s khata'})` });
    res.json(ret);
});

router.get('/returns', VIEW, async (req, res) => {
    const list = await prisma.saleReturn.findMany({ where: { tenantId: req.user.tenantId, deletedAt: null }, orderBy: { date: 'desc' }, take: Math.min(Number(req.query.limit) || 15, 1000), include: { items: { where: { tenantId: req.user.tenantId } } } });
    res.json(list.map(r => ({ ...r, total: N(r.total), tax: N(r.tax) })));
});

module.exports = { router, mount: '/api/pos', activeTaxes };
