// The one profit / stock engine. The dashboard, Reports, Profit & Loss, Product Performance, Reminders (and other modules,
// e.g. Capital) read their figures from here, so the same figure is the same number on every screen.
//
// Definitions (all money in paisa; a period is { from (inclusive), to (exclusive) } of instants; only rows with deletedAt null):
//   revenue  (net sales, excl. tax) = Σ(sale.total − sale.tax) − Σ(return.total − return.tax)        by document date
//   cogs                            = Σ sale.costTotal − Σ(returnItem.cost × returnItem.baseQty, restocked returns only)
//                                     (goods returned but not put back on the shelf stay a cost: a loss)
//   grossProfit = revenue − cogs;  expenses = Σ Expense.amount (payroll is an Expense too);  netProfit = grossProfit − expenses
//   stock value = Σ max(stock, 0) × product.cost over sellable products (not SERVICE, not VARIANT parents)
//   receivable / payable = Σ positive customer / vendor khata balances; aging = unpaid charges, oldest paid first (FIFO)
const { prisma } = require('../db');
const { N } = require('../lib/money');
const { HttpError } = require('../lib/http');
const Calc = require('../../public/js/shared/calc');
const dates = require('../lib/dates');
const stock = require('./stock');
const ledger = require('./ledger');
const treasury = require('./treasury');
const settings = require('./settings');

const PRESETS = ['today', 'yesterday', 'week', 'month', 'last30', 'lastMonth', 'year', 'fiscal', 'custom'];
const BUCKETS = ['0-30', '31-60', '61-90', '90+'];
const DAY = 86400000;

const within = ({ from, to }) => ({ gte: from, lt: to });
const costOf = (cost, baseQty) => Calc.round(N(cost) * (Number(baseQty) || 0));
const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
// % change for "vs last period": +100 when the previous period was 0, 0 = no change
const delta = (cur, prev) => (cur === prev ? 0 : prev === 0 ? (cur > 0 ? 100 : -100) : Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10);
const chunks = (list, n = 500) => { const out = []; for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; };

// a real calendar day 'YYYY-MM-DD' (2026-02-31 is not one)
const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;

// the client's period from a query (?preset=…&from=YYYY-MM-DD&to=YYYY-MM-DD), in its time zone
async function rangeFor(tenantId, q = {}, db = prisma) {
    for (const k of ['from', 'to']) if (q[k] !== undefined && q[k] !== '' && !isDay(q[k])) throw new HttpError(400, 'Invalid date.');
    const loc = await settings.get(tenantId, 'localization', db);
    const preset = PRESETS.includes(q.preset) ? q.preset : (q.from || q.to ? 'custom' : 'month');
    const tz = loc.timezone || 'Asia/Karachi';
    const r = dates.range(preset, { from: q.from, to: q.to || q.from, tz, fiscalStartMonth: Number(loc.fiscalStartMonth) || 7 });
    return { ...r, preset, tz, loc };
}
// the period of the same length just before, with its days listed
function previousOf(r) {
    const p = dates.previous(r, r.tz);
    const days = [];
    for (let d = p.fromDay; d <= p.toDay && days.length < 1100; d = dates.addDays(d, 1)) days.push(d);
    return { ...p, days, tz: r.tz };
}

// ── profit & loss ──
async function profitAndLoss(tenantId, { from, to }, db = prisma) {
    const date = within({ from, to });
    const [s, r, restocked, exp] = await Promise.all([
        db.sale.aggregate({ where: { tenantId, deletedAt: null, date }, _sum: { subtotal: true, discount: true, tax: true, total: true, costTotal: true }, _count: { _all: true } }),
        db.saleReturn.aggregate({ where: { tenantId, deletedAt: null, date }, _sum: { total: true, tax: true }, _count: { _all: true } }),
        db.saleReturnItem.findMany({ where: { tenantId, deletedAt: null, restock: true, ret: { is: { deletedAt: null, date } } }, select: { cost: true, baseQty: true } }),
        db.expense.groupBy({ by: ['categoryName'], where: { tenantId, deletedAt: null, date }, _sum: { amount: true } }),
    ]);
    const grossSales = N(s._sum.subtotal), discounts = N(s._sum.discount), saleTax = N(s._sum.tax), salesTotal = N(s._sum.total);
    const returnsTotal = N(r._sum.total), returnsTax = N(r._sum.tax);
    const returns = returnsTotal - returnsTax;
    const revenue = salesTotal - saleTax - returns;
    const cogs = N(s._sum.costTotal) - restocked.reduce((a, i) => a + costOf(i.cost, i.baseQty), 0);
    const byName = {};
    for (const e of exp) { const name = (e.categoryName || '').trim() || 'Uncategorized'; byName[name] = (byName[name] || 0) + N(e._sum.amount); }
    const expenseByCategory = Object.entries(byName).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
    const expenses = expenseByCategory.reduce((a, e) => a + e.amount, 0);
    const grossProfit = revenue - cogs;
    return {
        grossSales, discounts, returns, revenue, tax: saleTax - returnsTax, cogs, grossProfit, expenses, expenseByCategory, netProfit: grossProfit - expenses,
        salesCount: s._count._all, salesTotal, returnsTotal, returnCount: r._count._all,
    };
}

// ── per shop-day figures (same definitions as profitAndLoss, so the days add up to the period) ──
async function dailySeries(tenantId, range, { tz } = {}, db = prisma) {
    if (!tz) tz = range.tz || (await settings.get(tenantId, 'localization', db)).timezone || 'Asia/Karachi';
    const date = within(range);
    const [sales, rets, restocked, exps] = await Promise.all([
        db.sale.findMany({ where: { tenantId, deletedAt: null, date }, select: { date: true, subtotal: true, discount: true, tax: true, total: true, due: true, costTotal: true } }),
        db.saleReturn.findMany({ where: { tenantId, deletedAt: null, date }, select: { date: true, total: true, tax: true } }),
        db.saleReturnItem.findMany({ where: { tenantId, deletedAt: null, restock: true, ret: { is: { deletedAt: null, date } } }, select: { cost: true, baseQty: true, ret: { select: { date: true } } } }),
        db.expense.findMany({ where: { tenantId, deletedAt: null, date }, select: { date: true, amount: true } }),
    ]);
    let days = range.days && range.days.length ? range.days : null;
    if (!days) { days = []; for (let d = range.fromDay; d <= range.toDay && days.length < 1100; d = dates.addDays(d, 1)) days.push(d); }
    const map = new Map(days.map(d => [d, { day: d, count: 0, subtotal: 0, discount: 0, tax: 0, total: 0, due: 0, cost: 0, returns: 0, returnsTax: 0, returnCost: 0, expenses: 0 }]));
    const at = d => { const k = dates.ymd(d, tz); if (!map.has(k)) map.set(k, { day: k, count: 0, subtotal: 0, discount: 0, tax: 0, total: 0, due: 0, cost: 0, returns: 0, returnsTax: 0, returnCost: 0, expenses: 0 }); return map.get(k); };
    for (const s of sales) { const o = at(s.date); o.count++; o.subtotal += N(s.subtotal); o.discount += N(s.discount); o.tax += N(s.tax); o.total += N(s.total); o.due += N(s.due); o.cost += N(s.costTotal); }
    for (const r of rets) { const o = at(r.date); o.returns += N(r.total); o.returnsTax += N(r.tax); }
    for (const i of restocked) at(i.ret.date).returnCost += costOf(i.cost, i.baseQty);
    for (const e of exps) at(e.date).expenses += N(e.amount);
    return [...map.values()].sort((a, b) => (a.day < b.day ? -1 : 1)).map(o => {
        const revenue = o.total - o.tax - (o.returns - o.returnsTax);
        const cogs = o.cost - o.returnCost;
        return { day: o.day, count: o.count, subtotal: o.subtotal, discount: o.discount, tax: o.tax, total: o.total, due: o.due, returns: o.returns, returnsTax: o.returnsTax, revenue, cogs, grossProfit: revenue - cogs, expenses: o.expenses, netProfit: revenue - cogs - o.expenses };
    });
}

// ── products sold in a period: qty (base units), revenue (excl. tax, after discounts and returns), cogs, profit ──
async function productSales(tenantId, { from, to }, db = prisma) {
    const date = within({ from, to });
    const [items, rets] = await Promise.all([
        db.saleItem.findMany({ where: { tenantId, deletedAt: null, sale: { is: { deletedAt: null, date } } }, select: { productId: true, name: true, baseQty: true, total: true, tax: true, cost: true } }),
        db.saleReturnItem.findMany({ where: { tenantId, deletedAt: null, ret: { is: { deletedAt: null, date } } }, select: { productId: true, name: true, baseQty: true, total: true, tax: true, cost: true, restock: true } }),
    ]);
    const by = new Map();
    const row = (id, name) => { if (!by.has(id)) by.set(id, { productId: id, name, soldQty: 0, returnedQty: 0, qty: 0, revenue: 0, cogs: 0 }); return by.get(id); };
    for (const i of items) { const r = row(i.productId, i.name); r.soldQty += i.baseQty; r.revenue += N(i.total) - N(i.tax); r.cogs += costOf(i.cost, i.baseQty); }
    for (const i of rets) { const r = row(i.productId, i.name); r.returnedQty += i.baseQty; r.revenue -= N(i.total) - N(i.tax); if (i.restock) r.cogs -= costOf(i.cost, i.baseQty); }
    const ids = [...by.keys()];
    const products = [];
    for (const part of chunks(ids)) products.push(...await db.product.findMany({ where: { tenantId, id: { in: part } }, select: { id: true, name: true, sku: true, categoryId: true, baseUnitId: true, type: true } }));
    const [cats, units] = await Promise.all([
        db.category.findMany({ where: { tenantId }, select: { id: true, name: true } }),
        db.unit.findMany({ where: { tenantId }, select: { id: true, shortCode: true } }),
    ]);
    const pMap = Object.fromEntries(products.map(p => [p.id, p])), cMap = Object.fromEntries(cats.map(c => [c.id, c.name])), uMap = Object.fromEntries(units.map(u => [u.id, u.shortCode]));
    return [...by.values()].map(r => {
        const p = pMap[r.productId] || {};
        const qty = Calc.q3(r.soldQty - r.returnedQty), netProfit = r.revenue - r.cogs;
        return {
            productId: r.productId, name: p.name || r.name, sku: p.sku || '', categoryId: p.categoryId || null, category: (p.categoryId && cMap[p.categoryId]) || '', unit: (p.baseUnitId && uMap[p.baseUnitId]) || '',
            soldQty: Calc.q3(r.soldQty), returnedQty: Calc.q3(r.returnedQty), qty, revenue: r.revenue, cogs: r.cogs, netProfit,
            margin: pct(netProfit, r.revenue), avgPrice: qty ? Calc.round(r.revenue / qty) : 0, avgCost: qty ? Calc.round(r.cogs / qty) : 0,
        };
    }).sort((a, b) => b.netProfit - a.netProfit);
}

// the same rows grouped by category ("Other" when a product has none)
function byCategory(rows) {
    const m = new Map();
    for (const r of rows) {
        const k = r.category || 'Other';
        if (!m.has(k)) m.set(k, { name: k, categoryId: r.categoryId, products: 0, qty: 0, revenue: 0, cogs: 0, netProfit: 0 });
        const o = m.get(k); o.products++; o.qty = Calc.q3(o.qty + r.qty); o.revenue += r.revenue; o.cogs += r.cogs; o.netProfit += r.netProfit;
    }
    return [...m.values()].map(o => ({ ...o, margin: pct(o.netProfit, o.revenue) })).sort((a, b) => b.revenue - a.revenue);
}

// ── stock ──
// every sellable product with its stock, cost and value (point in time); variant SKUs included, VARIANT parents and services not
async function stockValuation(tenantId, db = prisma) {
    const [products, lv, cats, units] = await Promise.all([
        db.product.findMany({ where: { tenantId, deletedAt: null, type: { notIn: ['VARIANT', 'SERVICE'] } }, orderBy: { name: 'asc' } }),
        stock.levels(tenantId, undefined, db),
        db.category.findMany({ where: { tenantId }, select: { id: true, name: true } }),
        db.unit.findMany({ where: { tenantId }, select: { id: true, shortCode: true } }),
    ]);
    const cMap = Object.fromEntries(cats.map(c => [c.id, c.name])), uMap = Object.fromEntries(units.map(u => [u.id, u.shortCode]));
    const rows = products.map(p => {
        const qty = lv[p.id] || 0, cost = N(p.cost), retail = N(p.retailPrice);
        return {
            id: p.id, name: p.name, sku: p.sku, type: p.type, parentId: p.parentId, active: p.active, categoryId: p.categoryId, category: (p.categoryId && cMap[p.categoryId]) || '',
            unit: (p.baseUnitId && uMap[p.baseUnitId]) || '', stock: qty, cost, retailPrice: retail, value: Calc.round(Math.max(qty, 0) * cost), retailValue: Calc.round(Math.max(qty, 0) * retail),
            reorderLevel: p.reorderLevel, expiryDate: p.expiryDate,
        };
    });
    const cat = new Map();
    for (const r of rows) { const k = r.category || 'Other'; cat.set(k, (cat.get(k) || 0) + r.value); }
    return {
        value: rows.reduce((a, r) => a + r.value, 0),
        retailValue: rows.reduce((a, r) => a + r.retailValue, 0),
        units: Calc.q3(rows.reduce((a, r) => a + Math.max(r.stock, 0), 0)),
        count: rows.length,
        activeCount: rows.filter(r => r.active).length,
        byCategory: [...cat.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
        products: rows,
    };
}

const stockStatus = r => (r.stock <= 0 ? 'Out of stock' : 'Low stock');
// stock ≤ reorder level (reorder level > 0), active products only; restock capital = (reorder level − stock) × cost
async function lowStock(tenantId, { valuation } = {}, db = prisma) {
    const v = valuation || await stockValuation(tenantId, db);
    return v.products.filter(r => r.active && r.reorderLevel > 0 && r.stock <= r.reorderLevel)
        .map(r => ({ ...r, status: stockStatus(r), restockQty: Calc.q3(Math.max(r.reorderLevel - r.stock, 0)), restockCapital: Calc.round(Math.max(r.reorderLevel - r.stock, 0) * r.cost) }))
        .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));
}

// products with an expiry date up to `withinDays` ahead (already expired included); days < 0 = expired
async function expiring(tenantId, { withinDays = 60, valuation, now = new Date() } = {}, db = prisma) {
    const v = valuation || await stockValuation(tenantId, db);
    const loc = await settings.get(tenantId, 'localization', db);
    const today = dates.ymd(now, loc.timezone);
    const limit = dates.addDays(today, withinDays);
    return v.products.filter(r => r.expiryDate && dates.ymd(r.expiryDate, loc.timezone) <= limit)
        .map(r => { const d = dates.ymd(r.expiryDate, loc.timezone); return { ...r, expiryDay: d, daysLeft: Math.round((Date.parse(d) - Date.parse(today)) / DAY) }; })
        .sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));
}

// ── khata: receivables / payables with aging ──
async function partyDues(tenantId, type, { now = new Date() } = {}, db = prisma) {
    const parties = await db.party.findMany({ where: { tenantId, type, deletedAt: null }, select: { id: true, name: true, phone: true } });
    const bal = parties.length ? await ledger.balances(tenantId, { partyIds: parties.map(p => p.id), type }, db) : {};
    const owing = parties.filter(p => (bal[p.id] || 0) > 0);
    const entries = [];
    for (const part of chunks(owing.map(p => p.id))) {
        entries.push(...await db.ledgerEntry.findMany({ where: { tenantId, deletedAt: null, partyId: { in: part } }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }], select: { partyId: true, date: true, debit: true, credit: true } }));
    }
    const byParty = new Map();
    for (const e of entries) { if (!byParty.has(e.partyId)) byParty.set(e.partyId, []); byParty.get(e.partyId).push(e); }
    const vendor = type === 'VENDOR';
    const total = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const rows = owing.map(p => {
        // charges (sales to a customer / purchases from a vendor) are paid off oldest first by every payment, return and credit
        const list = byParty.get(p.id) || [];
        const charges = [];
        let paid = 0;
        for (const e of list) {
            const charge = vendor ? N(e.credit) : N(e.debit), pay = vendor ? N(e.debit) : N(e.credit);
            if (charge) charges.push({ date: e.date, left: charge });
            paid += pay;
        }
        for (const c of charges) { const use = Math.min(c.left, paid); c.left -= use; paid -= use; if (!paid) break; }
        const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
        let oldest = 0;
        for (const c of charges.filter(c => c.left > 0)) {
            const age = Math.max(0, Math.floor((now - c.date) / DAY));
            oldest = Math.max(oldest, age);
            buckets[age <= 30 ? '0-30' : age <= 60 ? '31-60' : age <= 90 ? '61-90' : '90+'] += c.left;
        }
        for (const k of BUCKETS) total[k] += buckets[k];
        const last = list.length ? list[list.length - 1].date : null;
        return { id: p.id, name: p.name, phone: p.phone, balance: bal[p.id], buckets, oldestDays: oldest, lastDate: last };
    }).sort((a, b) => b.balance - a.balance);
    return {
        total: rows.reduce((a, r) => a + r.balance, 0),
        net: Object.values(bal).reduce((a, b) => a + b, 0), // incl. advances (negative balances)
        count: rows.length, buckets: total, parties: rows,
    };
}
const receivables = (tenantId, o, db) => partyDues(tenantId, 'CUSTOMER', o, db);
const payables = (tenantId, o, db) => partyDues(tenantId, 'VENDOR', o, db);

// ── cash & bank ──
async function cashAndBank(tenantId, db = prisma) {
    const [accounts, bal] = await Promise.all([
        db.account.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ type: 'asc' }, { name: 'asc' }] }),
        treasury.balances(tenantId, db),
    ]);
    const rows = accounts.map(a => ({ id: a.id, name: a.name, type: a.type, balance: bal[a.id] || 0 }));
    return { total: rows.reduce((s, a) => s + a.balance, 0), accounts: rows };
}

// ── purchases in a period ──
async function purchaseSummary(tenantId, { from, to }, db = prisma) {
    const date = within({ from, to });
    const [list, rets] = await Promise.all([
        db.purchase.findMany({ where: { tenantId, deletedAt: null, date }, select: { id: true, date: true, vendorId: true, vendorName: true, subtotal: true, discount: true, tax: true, total: true, paid: true, due: true } }),
        db.purchaseReturn.findMany({ where: { tenantId, deletedAt: null, date }, select: { date: true, vendorId: true, vendorName: true, total: true } }),
    ]);
    const s = { count: list.length, subtotal: 0, discount: 0, tax: 0, total: 0, paid: 0, due: 0, returns: rets.reduce((a, r) => a + N(r.total), 0) };
    for (const p of list) for (const k of ['subtotal', 'discount', 'tax', 'total', 'paid', 'due']) s[k] += N(p[k]);
    return { ...s, list, returnsList: rets };
}

// "+100%" style change between two figure objects
function deltas(cur, prev, keys) { return Object.fromEntries(keys.map(k => [k, delta(cur[k] || 0, prev[k] || 0)])); }

module.exports = {
    PRESETS, BUCKETS, rangeFor, previousOf, delta, deltas, pct,
    profitAndLoss, dailySeries, productSales, byCategory,
    stockValuation, lowStock, expiring, stockStatus,
    receivables, payables, partyDues, cashAndBank, purchaseSummary,
};
