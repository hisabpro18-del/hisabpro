// Purchases (stock in + vendor khata + payment in one step) and purchase returns (debit notes).
const express = require('express');
const { prisma, withTx, ci } = require('../db');
const { HttpError, str, num, oneOf, date } = require('../lib/http');
const { B, N, paisa } = require('../lib/money');
const { authenticate, can } = require('../auth');
const { audit } = require('../audit');
const stock = require('../services/stock');
const ledger = require('../services/ledger');
const treasury = require('../services/treasury');
const numbering = require('../services/numbering');
const settings = require('../services/settings');
const dates = require('../lib/dates');
const { listParties } = require('./parties');
const Calc = require('../../public/js/shared/calc');

const router = express.Router();
router.use(authenticate);
const MANAGE = can('purchases.manage');

const rs = p => 'Rs ' + (Number(p || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseUnits = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };
const serialLines = s => (Array.isArray(s) ? s : String(s || '').split(/[\n,]+/)).map(x => String(x).trim()).filter(Boolean);
// a real calendar day 'YYYY-MM-DD' (2026-02-31 is not one)
const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
// a day picked on a form: today → now (keeps today's documents in order), an earlier day → noon of that day in the shop's
// zone. A document that moves stock or money cannot be dated after today (balances are not dated, reports are).
async function when(t, v) {
    if (v === undefined || v === null || v === '') return new Date();
    if (typeof v !== 'string') throw new HttpError(400, 'Invalid date.');
    const tz = (await settings.get(t, 'localization')).timezone;
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
// a payment or a debit note cannot come before the purchase it belongs to (days in the shop's zone)
async function notBefore(tx, t, at, p, what) {
    const tz = (await settings.get(t, 'localization', tx)).timezone; // tx: runs inside the purchase's transaction
    if (dates.ymd(at, tz) < dates.ymd(p.date, tz)) throw new HttpError(400, `${what} cannot be dated before purchase ${p.number} (${dates.ymd(p.date, tz)}).`);
}
const statusOf = (total, paid, due) => (due <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'DUE');

// the same maths as the screen (shared/calc.js): integer paisa, subtotal − discount + tax = total
function totals(lines, { discountType, discountValue, taxRate }) {
    return Calc.bill(lines.map(l => ({ qty: l.qty, price: l.cost, taxRate })), {
        discountType, discountValue: discountType === 'AMOUNT' ? discountValue / 100 : discountValue, defaultRate: taxRate,
    });
}

function purchaseView(p) {
    return {
        id: p.id, number: p.number, date: p.date, vendorId: p.vendorId, vendorName: p.vendorName, subtotal: N(p.subtotal), discountType: p.discountType,
        discountValue: p.discountValue, discount: N(p.discount), taxRate: p.taxRate, tax: N(p.tax), total: N(p.total), paid: N(p.paid), due: N(p.due),
        returnedTotal: N(p.returnedTotal), paymentMethod: p.paymentMethod, accountId: p.accountId, status: p.status, note: p.note, userName: p.userName, createdAt: p.createdAt,
    };
}

// suppliers for the purchase form (with what we owe each)
router.get('/vendors', MANAGE, async (req, res) => {
    res.json(await listParties(req.user.tenantId, { type: 'VENDOR', q: str(req.query.q, 100) }));
});

router.get('/', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const where = { tenantId: t, deletedAt: null };
    const q = str(req.query.q, 100);
    if (q) where.OR = [{ number: ci(q) }, { vendorName: ci(q) }];
    if (req.query.vendorId) where.vendorId = String(req.query.vendorId);
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.from || req.query.to) {
        if ((req.query.from && !isDay(req.query.from)) || (req.query.to && !isDay(req.query.to))) throw new HttpError(400, 'Invalid date.');
        const tz = (await settings.get(t, 'localization')).timezone;
        const r = dates.range('custom', { from: req.query.from || '2000-01-01', to: req.query.to || dates.ymd(new Date(), tz), tz });
        where.date = { gte: r.from, lt: r.to };
    }
    const rows = await prisma.purchase.findMany({ where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 2000 });
    const counts = await prisma.purchaseItem.groupBy({ by: ['purchaseId'], where: { tenantId: t, deletedAt: null, purchaseId: { in: rows.map(r => r.id) } }, _count: true });
    res.json(rows.map(r => ({ ...purchaseView(r), itemsCount: (counts.find(c => c.purchaseId === r.id) || {})._count || 0 })));
});

// ── purchase returns (debit notes) ──
router.get('/returns', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const where = { tenantId: t, deletedAt: null };
    if (req.query.purchaseId) where.purchaseId = String(req.query.purchaseId);
    const rows = await prisma.purchaseReturn.findMany({ where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: Number(req.query.limit) > 0 ? Math.min(Number(req.query.limit), 500) : 200 });
    const items = await prisma.purchaseReturnItem.findMany({ where: { tenantId: t, deletedAt: null, returnId: { in: rows.map(r => r.id) } } });
    res.json(rows.map(r => ({
        id: r.id, number: r.number, date: r.date, purchaseId: r.purchaseId, purchaseNumber: r.purchaseNumber, vendorId: r.vendorId, vendorName: r.vendorName,
        total: N(r.total), settlement: r.settlement, accountId: r.accountId, reason: r.reason, userName: r.userName,
        items: items.filter(i => i.returnId === r.id).map(i => ({ id: i.id, purchaseItemId: i.purchaseItemId, productId: i.productId, name: i.name, qty: i.qty, baseQty: i.baseQty, cost: N(i.cost), total: N(i.total) })),
    })));
});

router.get('/:id', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const p = await prisma.purchase.findFirst({ where: { id: req.params.id, tenantId: t, deletedAt: null } });
    if (!p) throw new HttpError(404, 'Purchase not found.');
    const items = await prisma.purchaseItem.findMany({ where: { tenantId: t, purchaseId: p.id, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    const products = await prisma.product.findMany({ where: { tenantId: t, id: { in: items.map(i => i.productId) } }, select: { id: true, type: true } });
    const serials = await prisma.productSerial.findMany({ where: { tenantId: t, purchaseId: p.id, deletedAt: null }, orderBy: { serial: 'asc' } });
    const returns = await prisma.purchaseReturn.findMany({ where: { tenantId: t, purchaseId: p.id, deletedAt: null }, orderBy: { date: 'asc' } });
    const vendor = await prisma.party.findFirst({ where: { id: p.vendorId, tenantId: t } });
    res.json({
        ...purchaseView(p),
        vendor: vendor ? { id: vendor.id, name: vendor.name, phone: vendor.phone, address: vendor.address, taxId: vendor.taxId } : null,
        items: items.map(i => ({
            id: i.id, productId: i.productId, name: i.name, type: (products.find(x => x.id === i.productId) || {}).type || 'STANDARD', unitId: i.unitId, unitName: i.unitName,
            factor: i.factor, qty: i.qty, baseQty: i.baseQty, cost: N(i.cost), total: N(i.total), returnedQty: i.returnedQty,
            serials: serials.filter(s => s.productId === i.productId && serialLines(i.serials).includes(s.serial)).map(s => ({ id: s.id, serial: s.serial, status: s.status })),
        })),
        returns: returns.map(r => ({ id: r.id, number: r.number, date: r.date, total: N(r.total), settlement: r.settlement, reason: r.reason })),
    });
});

// ── create a purchase ──
router.post('/', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const vendor = await prisma.party.findFirst({ where: { id: str(b.vendorId, 60), tenantId: t, deletedAt: null } });
    if (!vendor || vendor.type !== 'VENDOR') throw new HttpError(400, 'Choose the supplier.');
    const at = await when(t, b.date);
    const discountType = oneOf(b.discountType || undefined, ['AMOUNT', 'PERCENT'], 'Discount type', 'AMOUNT');
    const discountValue = discountType === 'PERCENT' ? num(b.discountValue, 'Discount %', { max: 100 }) : paisa(b.discountValue, 'Discount');
    const taxRate = num(b.taxRate, 'Tax %', { max: 100 });
    const paymentMethod = oneOf(b.paymentMethod || undefined, ['CASH', 'BANK'], 'Payment method', 'CASH');
    const accountId = str(b.accountId, 60) || null;
    const note = str(b.note, 500);
    const raw = Array.isArray(b.items) ? b.items : [];
    if (!raw.length) throw new HttpError(400, 'Add at least one product line.');
    if (raw.length > 500) throw new HttpError(400, 'A purchase can have at most 500 lines.');

    const products = await prisma.product.findMany({ where: { tenantId: t, deletedAt: null, id: { in: raw.map(l => String(l && l.productId || '')) } } });
    const units = Object.fromEntries((await prisma.unit.findMany({ where: { tenantId: t } })).map(u => [u.id, u]));
    const lines = raw.map((l, i) => {
        const n = `Line ${i + 1}`;
        const p = products.find(x => x.id === String(l && l.productId || ''));
        if (!p) throw new HttpError(400, `${n}: choose a product.`);
        if (p.type === 'SERVICE') throw new HttpError(400, `"${p.name}" is a service: services cannot be purchased into stock.`);
        if (p.type === 'VARIANT') throw new HttpError(400, `"${p.name}" has variants: purchase each colour / size separately.`);
        const unitId = str(l.unitId, 60) || p.baseUnitId || null;
        let factor = 1;
        if (unitId && unitId !== p.baseUnitId) {
            const alt = parseUnits(p.altUnits).find(u => u.unitId === unitId);
            if (!alt) throw new HttpError(400, `${n}: "${p.name}" is not sold in that unit.`);
            factor = Number(alt.factor) || 1;
        }
        const qty = Calc.q3(num(l.qty, `${n} quantity`, { min: 0.001, max: 1e9, allowEmpty: false }));
        const cost = paisa(l.cost, `${n} unit cost`);
        const serials = p.type === 'SERIAL' ? serialLines(l.serials) : [];
        if (p.type === 'SERIAL') {
            if (factor !== 1) throw new HttpError(400, `"${p.name}" is serialized: buy it in its base unit.`);
            if (!Number.isInteger(qty)) throw new HttpError(400, `"${p.name}" is serialized: the quantity must be a whole number.`);
            if (serials.length !== qty) throw new HttpError(400, `"${p.name}": enter exactly ${qty} serial / IMEI number(s), one per line (${serials.length} given).`);
            if (new Set(serials.map(s => s.toLowerCase())).size !== serials.length) throw new HttpError(400, `"${p.name}": a serial number is repeated.`);
        }
        return { p, unitId, unitName: unitId && units[unitId] ? units[unitId].shortCode : '', factor, qty, baseQty: Calc.q3(qty / factor), cost, serials };
    });
    // a serial can be in stock once
    const allSerials = lines.flatMap(l => l.serials.map(s => ({ s, pid: l.p.id })));
    if (new Set(allSerials.map(x => x.pid + ':' + x.s.toLowerCase())).size !== allSerials.length) throw new HttpError(400, 'The same serial number appears on two lines.');
    const serialsFree = async db => {
        for (const l of lines.filter(x => x.serials.length)) {
            const have = await db.productSerial.findMany({ where: { tenantId: t, productId: l.p.id, deletedAt: null, status: 'IN_STOCK' }, select: { serial: true } });
            const set = new Set(have.map(h => h.serial.toLowerCase()));
            const dupe = l.serials.find(s => set.has(s.toLowerCase()));
            if (dupe) throw new HttpError(400, `Serial "${dupe}" of "${l.p.name}" is already in stock.`);
        }
    };
    await serialsFree(prisma);

    const bill = totals(lines, { discountType, discountValue, taxRate });
    if (!(bill.total <= 1e15)) throw new HttpError(400, 'The purchase total is too large.');
    // cost of one base unit = what the line really costs after its share of the bill discount (tax is kept apart: input tax)
    lines.forEach((l, i) => { const x = bill.lines[i]; l.costPerBase = Calc.round(l.cost * l.factor * (x.gross > 0 ? x.net / x.gross : 1)); });
    const paid = paisa(b.paid, 'Amount paid');
    if (paid > bill.total) throw new HttpError(400, `Amount paid (${rs(paid)}) is more than the total (${rs(bill.total)}).`);
    const due = bill.total - paid;
    const { purchasePrefix } = await settings.get(t, 'numbering');

    const saved = await withTx(t, async tx => {
        await serialsFree(tx); // again under the client's lock: two screens cannot both bring in the same serial
        const number = await numbering.number(tx, t, 'purchase', purchasePrefix || 'PUR-');
        const acct = paid > 0 ? await treasury.accountFor(tx, t, paymentMethod, accountId)
            : accountId && (await tx.account.findFirst({ where: { id: accountId, tenantId: t, deletedAt: null }, select: { id: true } })) ? accountId : null;
        const pur = await tx.purchase.create({ data: {
            tenantId: t, number, date: at, vendorId: vendor.id, vendorName: vendor.name, subtotal: B(bill.subtotal), discountType, discountValue,
            discount: B(bill.discount), taxRate, tax: B(bill.tax), total: B(bill.total), paid: B(paid), due: B(due), paymentMethod, accountId: acct,
            status: statusOf(bill.total, paid, due), note, userId: req.user.id, userName: req.user.name || req.user.email,
        } });
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            await tx.purchaseItem.create({ data: {
                tenantId: t, purchaseId: pur.id, productId: l.p.id, name: l.p.name, unitId: l.unitId, unitName: l.unitName, factor: l.factor,
                qty: l.qty, baseQty: l.baseQty, cost: B(l.cost), total: B(bill.lines[i].total), serials: l.serials.join('\n'),
            } });
            // weighted average cost per base unit
            const prod = await tx.product.findFirst({ where: { id: l.p.id } });
            const before = Math.max(await stock.level(t, l.p.id, tx), 0);
            const newCost = before + l.baseQty > 0 ? Calc.round((before * N(prod.cost) + l.baseQty * l.costPerBase) / (before + l.baseQty)) : l.costPerBase;
            await stock.move(tx, { tenantId: t, productId: l.p.id, qty: l.baseQty, type: 'PURCHASE', unitCost: l.costPerBase, refId: pur.id, refNo: number, date: at, userId: req.user.id });
            await tx.product.update({ where: { id: l.p.id }, data: { cost: B(newCost) } });
            if (l.serials.length) await tx.productSerial.createMany({ data: l.serials.map(s => ({ tenantId: t, productId: l.p.id, serial: s, purchaseId: pur.id })) });
        }
        await ledger.post(tx, { tenantId: t, partyId: vendor.id, type: 'PURCHASE', credit: bill.total, refId: pur.id, refNo: number, note: `Purchase ${number}`, date: at });
        if (paid > 0) {
            await ledger.post(tx, { tenantId: t, partyId: vendor.id, type: 'PAYMENT_OUT', debit: paid, refId: pur.id, refNo: number, note: `Paid with purchase ${number}`, date: at });
            await treasury.post(tx, { tenantId: t, accountId: acct, type: 'PURCHASE', amount: -paid, partyId: vendor.id, refId: pur.id, refNo: number, note: `Purchase ${number} — ${vendor.name}`, date: at });
        }
        return pur;
    });
    await audit(req, { action: 'purchases.create', summary: `Purchase ${saved.number} from "${vendor.name}": ${lines.length} line(s), total ${rs(bill.total)}, paid ${rs(paid)}${due ? `, due ${rs(due)}` : ''}` });
    res.json({ ...purchaseView(saved), itemsCount: lines.length });
});

// pay (part of) what is still due on a purchase
router.post('/:id/pay', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const amount = paisa(b.amount, 'Amount');
    if (!amount) throw new HttpError(400, 'Enter the amount to pay.');
    const method = oneOf(b.method || undefined, ['CASH', 'BANK'], 'Payment method', 'CASH');
    const at = await when(t, b.date);
    const out = await withTx(t, async tx => {
        const p = await tx.purchase.findFirst({ where: { id: req.params.id, tenantId: t, deletedAt: null } });
        if (!p) throw new HttpError(404, 'Purchase not found.');
        if (amount > N(p.due)) throw new HttpError(400, `Only ${rs(N(p.due))} is due on ${p.number}.`);
        await notBefore(tx, t, at, p, 'A payment');
        const acct = await treasury.accountFor(tx, t, method, str(b.accountId, 60) || null);
        const paid = N(p.paid) + amount, due = N(p.due) - amount;
        await ledger.post(tx, { tenantId: t, partyId: p.vendorId, type: 'PAYMENT_OUT', debit: amount, refId: p.id, refNo: p.number, note: `Payment for ${p.number}`, date: at });
        await treasury.post(tx, { tenantId: t, accountId: acct, type: 'PURCHASE', amount: -amount, partyId: p.vendorId, refId: p.id, refNo: p.number, note: `Payment for ${p.number} — ${p.vendorName}`, date: at });
        return tx.purchase.update({ where: { id: p.id }, data: { paid: B(paid), due: B(due), status: p.status === 'RETURNED' ? 'RETURNED' : statusOf(N(p.total), paid, due) } });
    });
    await audit(req, { action: 'purchases.pay', summary: `Paid ${rs(amount)} to "${out.vendorName}" for ${out.number} (due now ${rs(N(out.due))})` });
    res.json(purchaseView(out));
});

// ── purchase return (debit note) ──
router.post('/:id/returns', MANAGE, async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const settlement = oneOf(b.settlement || undefined, ['CREDIT', 'CASH'], 'Settlement', 'CREDIT');
    const reason = str(b.reason, 300);
    const at = await when(t, b.date);
    const raw = (Array.isArray(b.items) ? b.items : []).filter(l => l && (Number(l.qty) > 0 || (Array.isArray(l.serials) && l.serials.length)));
    if (!raw.length) throw new HttpError(400, 'Enter a return quantity on at least one line.');

    const out = await withTx(t, async tx => {
        const p = await tx.purchase.findFirst({ where: { id: req.params.id, tenantId: t, deletedAt: null } });
        if (!p) throw new HttpError(404, 'Purchase not found.');
        await notBefore(tx, t, at, p, 'A return');
        const items = await tx.purchaseItem.findMany({ where: { tenantId: t, purchaseId: p.id, deletedAt: null } });
        const prev = await tx.purchaseReturnItem.groupBy({ by: ['purchaseItemId'], where: { tenantId: t, deletedAt: null, purchaseItemId: { in: items.map(i => i.id) } }, _sum: { total: true } });
        const products = await tx.product.findMany({ where: { tenantId: t, id: { in: items.map(i => i.productId) } }, select: { id: true, type: true } });
        const lines = [];
        for (const l of raw) {
            const it = items.find(i => i.id === String(l.purchaseItemId || ''));
            if (!it) throw new HttpError(400, 'A return line does not belong to this purchase.');
            if (lines.some(x => x.it.id === it.id)) throw new HttpError(400, `"${it.name}" is listed twice.`);
            const isSerial = (products.find(x => x.id === it.productId) || {}).type === 'SERIAL';
            let serials = [];
            let qty;
            if (isSerial) {
                serials = serialLines(l.serials);
                qty = serials.length;
                if (!qty) throw new HttpError(400, `"${it.name}": tick the serial numbers being returned.`);
                if (new Set(serials).size !== qty) throw new HttpError(400, `"${it.name}": a serial number is repeated.`);
                const mine = new Set(serialLines(it.serials));
                const rows = await tx.productSerial.findMany({ where: { tenantId: t, productId: it.productId, purchaseId: p.id, deletedAt: null, status: 'IN_STOCK', serial: { in: serials } } });
                for (const s of serials) if (!mine.has(s) || !rows.find(r => r.serial === s)) throw new HttpError(400, `Serial "${s}" of "${it.name}" is not in stock from this purchase.`);
                serials = rows.filter(r => serials.includes(r.serial));
            } else {
                qty = Calc.q3(num(l.qty, `"${it.name}" return quantity`, { min: 0.001, max: 1e9, allowEmpty: false }));
            }
            const left = Calc.q3(it.qty - it.returnedQty);
            if (qty > left) throw new HttpError(400, `"${it.name}": only ${left} ${it.unitName || ''} can still be returned.`.replace(/\s+\./, '.'));
            const lineTotal = N(it.total);
            const already = N((prev.find(x => x.purchaseItemId === it.id) || { _sum: {} })._sum.total);
            // the last return of a line takes exactly what is left, so a full return equals the purchase total
            const value = qty === left ? lineTotal - already : Calc.round(lineTotal * qty / it.qty);
            lines.push({ it, qty, baseQty: Calc.q3(qty / (it.factor || 1)), value, serials });
        }
        const total = lines.reduce((s, l) => s + l.value, 0);
        const number = await numbering.number(tx, t, 'purchaseReturn', 'PRN-');
        const acct = settlement === 'CASH' ? await treasury.accountFor(tx, t, oneOf(b.method || undefined, ['CASH', 'BANK'], 'Refund method', 'CASH'), str(b.accountId, 60) || null) : null;
        const ret = await tx.purchaseReturn.create({ data: {
            tenantId: t, number, date: at, purchaseId: p.id, purchaseNumber: p.number, vendorId: p.vendorId, vendorName: p.vendorName,
            total: B(total), settlement, accountId: acct, reason, userId: req.user.id, userName: req.user.name || req.user.email,
        } });
        const netShare = N(p.subtotal) > 0 ? (N(p.subtotal) - N(p.discount)) / N(p.subtotal) : 1; // after the bill discount, as bought
        for (const l of lines) {
            const costPerBase = Calc.round(N(l.it.cost) * (l.it.factor || 1) * netShare);
            await tx.purchaseReturnItem.create({ data: { tenantId: t, returnId: ret.id, purchaseItemId: l.it.id, productId: l.it.productId, name: l.it.name, qty: l.qty, baseQty: l.baseQty, cost: l.it.cost, total: B(l.value) } });
            await stock.move(tx, { tenantId: t, productId: l.it.productId, qty: -l.baseQty, type: 'PURCHASE_RETURN', unitCost: costPerBase, refId: ret.id, refNo: number, note: `Returned to ${p.vendorName}`, date: at, userId: req.user.id });
            await tx.purchaseItem.update({ where: { id: l.it.id }, data: { returnedQty: Calc.q3(l.it.returnedQty + l.qty) } });
            if (l.serials.length) await tx.productSerial.updateMany({ where: { id: { in: l.serials.map(s => s.id) } }, data: { status: 'RETURNED_TO_VENDOR' } });
        }
        if (settlement === 'CREDIT') await ledger.post(tx, { tenantId: t, partyId: p.vendorId, type: 'PURCHASE_RETURN', debit: total, refId: ret.id, refNo: number, note: `Debit note ${number} against ${p.number}`, date: at });
        else await treasury.post(tx, { tenantId: t, accountId: acct, type: 'PURCHASE_RETURN', amount: total, partyId: p.vendorId, refId: ret.id, refNo: number, note: `Refund from ${p.vendorName} — ${number}`, date: at });
        const fresh = await tx.purchaseItem.findMany({ where: { tenantId: t, purchaseId: p.id, deletedAt: null } });
        const allBack = fresh.every(i => Calc.q3(i.qty - i.returnedQty) <= 0);
        const due = settlement === 'CREDIT' ? Math.max(N(p.due) - total, 0) : N(p.due);
        const upd = await tx.purchase.update({ where: { id: p.id }, data: { returnedTotal: B(N(p.returnedTotal) + total), due: B(due), status: allBack ? 'RETURNED' : statusOf(N(p.total), N(p.paid), due) } });
        return { ret, upd, total, lines: lines.length };
    });
    await audit(req, { action: 'purchases.return_create', summary: `Debit note ${out.ret.number} against ${out.upd.number} ("${out.upd.vendorName}"): ${out.lines} line(s), ${rs(out.total)}, ${settlement === 'CREDIT' ? 'payable reduced' : 'refund received'}` });
    res.json({ id: out.ret.id, number: out.ret.number, total: out.total, settlement, purchase: purchaseView(out.upd) });
});

module.exports = { router, mount: '/api/purchases' };
