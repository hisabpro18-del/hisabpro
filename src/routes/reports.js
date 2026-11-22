// Reports: dashboard, the Reports tabs (Sales, Purchases, Inventory, Expenses, Financial & Khata, Tax & Audit), Profit & Loss,
// Product Performance and Reminders. Every figure comes from src/services/reports.js (one engine for every screen).
// Period endpoints take ?preset=today|week|month|last30|lastMonth|year|fiscal|custom&from=YYYY-MM-DD&to=YYYY-MM-DD (shop time zone).
const express = require('express');
const { prisma } = require('../db');
const { N } = require('../lib/money');
const { authenticate, can } = require('../auth');
const dates = require('../lib/dates');
const reports = require('../services/reports');
const settings = require('../services/settings');
const syncState = require('../sync/state');
const config = require('../config');
const Calc = require('../../public/js/shared/calc');

const router = express.Router();
router.use(authenticate);
const VIEW = can('reports.view');

const within = r => ({ gte: r.from, lt: r.to });
const rangeView = r => ({ preset: r.preset, fromDay: r.fromDay, toDay: r.toDay, days: r.days.length });
const sumBy = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
const TXN_LABEL = {
    OPENING: 'Opening balance', SALE: 'Sales', SALE_RETURN: 'Sale refunds', PURCHASE: 'Purchases', PURCHASE_RETURN: 'Purchase refunds', PAYMENT_IN: 'Payments in',
    PAYMENT_OUT: 'Payments out', EXPENSE: 'Expenses', TRANSFER_IN: 'Transfers in', TRANSFER_OUT: 'Transfers out', CAPITAL_IN: 'Capital', DRAWING: 'Drawings',
    CHEQUE: 'Cheques', PAYROLL: 'Payroll', ADVANCE: 'Salary advances',
};
const NOT_CASHFLOW = ['TRANSFER_IN', 'TRANSFER_OUT', 'OPENING'];

async function purchasesTotal(tenantId, r) {
    const a = await prisma.purchase.aggregate({ where: { tenantId, deletedAt: null, date: within(r) }, _sum: { total: true }, _count: { _all: true } });
    return { total: N(a._sum.total), count: a._count._all };
}

// ── dashboard ──
router.get('/dashboard', VIEW, async (req, res) => {
    const t = req.user.tenantId;
    const r = await reports.rangeFor(t, req.query);
    const p = reports.previousOf(r);
    const [pl, plPrev, pur, purPrev, series, sold, recv, pay, cash, valuation, txns] = await Promise.all([
        reports.profitAndLoss(t, r), reports.profitAndLoss(t, p), purchasesTotal(t, r), purchasesTotal(t, p), reports.dailySeries(t, r),
        reports.productSales(t, r), reports.receivables(t), reports.payables(t), reports.cashAndBank(t), reports.stockValuation(t),
        prisma.accountTxn.findMany({ where: { tenantId: t, deletedAt: null, type: { notIn: ['TRANSFER_IN', 'TRANSFER_OUT'] } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 5 }),
    ]);
    const fig = (x, pu) => ({ salesTotal: x.salesTotal, netSales: x.salesTotal - x.returnsTotal, salesCount: x.salesCount, volume: x.salesTotal, returnsTotal: x.returnsTotal, netProfit: x.netProfit, purchases: pu.total, expenses: x.expenses, grossProfit: x.grossProfit, revenue: x.revenue });
    const period = fig(pl, pur), previous = fig(plPrev, purPrev);
    const low = await reports.lowStock(t, { valuation });
    const reminderDays = Number(r.loc.expiryReminderDays) || 30;
    const exp = await reports.expiring(t, { withinDays: reminderDays, valuation });
    res.json({
        range: rangeView(r),
        period, previous,
        deltas: reports.deltas(period, previous, ['salesTotal', 'netSales', 'netProfit', 'purchases', 'expenses', 'grossProfit', 'revenue']),
        live: { receivable: recv.total, payable: pay.total, cashBank: cash.total },
        trend: series.map(d => ({ day: d.day, revenue: d.revenue, netProfit: d.netProfit })),
        categories: reports.byCategory(sold).filter(c => c.revenue > 0).map(c => ({ name: c.name, revenue: c.revenue })),
        cashflow: await cashflowRows(t, txns),
        lowStock: low.slice(0, 10).map(x => ({ id: x.id, name: x.name, stock: x.stock, unit: x.unit, reorderLevel: x.reorderLevel, status: x.status })),
        lowStockCount: low.length,
        health: [
            { id: 'sync', ok: !(config.isDesktop && syncState.get().pending), count: config.isDesktop ? syncState.get().pending : 0 },
            { id: 'vendors', ok: !pay.parties.some(v => v.oldestDays > 30), count: pay.parties.filter(v => v.oldestDays > 30).length },
            { id: 'receivables', ok: recv.total <= 0, count: recv.count, amount: recv.total },
            { id: 'restock', ok: low.length === 0, count: low.length },
            { id: 'expiry', ok: exp.length === 0, count: exp.length, days: reminderDays },
        ],
    });
});

// recent money movements for "Cashflow Activity": title by direction, who, and how (account / kind)
async function cashflowRows(t, txns) {
    if (!txns.length) return [];
    const partyIds = [...new Set(txns.map(x => x.partyId).filter(Boolean))];
    const [parties, accounts, expenses, salePays] = await Promise.all([
        prisma.party.findMany({ where: { tenantId: t, id: { in: partyIds } }, select: { id: true, name: true, type: true } }),
        prisma.account.findMany({ where: { tenantId: t }, select: { id: true, name: true, type: true } }),
        prisma.expense.findMany({ where: { tenantId: t, id: { in: txns.filter(x => x.type === 'EXPENSE' && x.refId).map(x => x.refId) } }, select: { id: true, categoryName: true, payee: true } }),
        prisma.salePayment.findMany({ where: { tenantId: t, saleId: { in: txns.filter(x => x.type === 'SALE' && x.refId).map(x => x.refId) } }, select: { saleId: true, accountId: true, method: true } }),
    ]);
    const P = Object.fromEntries(parties.map(x => [x.id, x])), A = Object.fromEntries(accounts.map(x => [x.id, x])), E = Object.fromEntries(expenses.map(x => [x.id, x]));
    const via = a => ({ CASH: 'Cash', BANK: 'Bank', WALLET: 'Wallet' }[a && a.type] || 'Cash');
    const METHOD = { CASH: 'Cash', CARD: 'Card', BANK: 'Bank' };
    return txns.map(x => {
        const amount = N(x.amount), party = x.partyId && P[x.partyId], acct = A[x.accountId], exp = x.refId && E[x.refId];
        let who = party ? party.name : '';
        if (!who) who = x.type === 'SALE' ? 'Walk-in sale' : x.type === 'SALE_RETURN' ? 'Walk-in refund' : x.type === 'EXPENSE' ? ((exp && (exp.categoryName || exp.payee)) || x.note || 'Expense') : (x.note || x.refNo || TXN_LABEL[x.type] || x.type);
        let kind;
        if (x.type === 'SALE') { const sp = salePays.find(s => s.saleId === x.refId && s.accountId === x.accountId); kind = sp ? METHOD[sp.method] || via(acct) : via(acct); }
        else if (amount < 0 && x.type === 'EXPENSE') kind = 'Expense';
        else if (amount < 0 && (x.type === 'PURCHASE' || (party && party.type === 'VENDOR'))) kind = 'Vendor';
        else if (amount < 0 && x.type === 'SALE_RETURN') kind = 'Refund';
        else if (amount < 0 && (x.type === 'PAYROLL' || x.type === 'ADVANCE')) kind = 'Salary';
        else if (x.type === 'CAPITAL_IN') kind = 'Capital';
        else if (x.type === 'DRAWING') kind = 'Drawing';
        else kind = via(acct);
        return { id: x.id, date: x.date, type: x.type, title: amount >= 0 ? 'Payment In' : 'Payment Out', party: who, kind, amount, account: acct ? acct.name : '' };
    });
}

// ── Reports › Sales (Sales Analytics, Product-wise, Category-wise) ──
router.get('/sales', VIEW, async (req, res) => {
    const t = req.user.tenantId;
    const r = await reports.rangeFor(t, req.query);
    const p = reports.previousOf(r);
    const [series, prevAgg, sold, pays, dueAgg] = await Promise.all([
        reports.dailySeries(t, r),
        prisma.sale.aggregate({ where: { tenantId: t, deletedAt: null, date: within(p) }, _sum: { total: true, tax: true, due: true }, _count: { _all: true } }),
        reports.productSales(t, r),
        prisma.salePayment.groupBy({ by: ['method'], where: { tenantId: t, deletedAt: null, sale: { is: { deletedAt: null, date: within(r) } } }, _sum: { amount: true } }),
        prisma.sale.aggregate({ where: { tenantId: t, deletedAt: null, date: within(r) }, _sum: { due: true } }),
    ]);
    const kpis = { count: sumBy(series, 'count'), total: sumBy(series, 'total'), tax: sumBy(series, 'tax'), due: sumBy(series, 'due') };
    const previous = { count: prevAgg._count._all, total: N(prevAgg._sum.total), tax: N(prevAgg._sum.tax), due: N(prevAgg._sum.due) };
    const LABEL = { CASH: 'Cash', CARD: 'Card', BANK: 'Bank' };
    const payments = pays.map(x => ({ method: x.method, label: LABEL[x.method] || x.method, amount: N(x._sum.amount) })).filter(x => x.amount > 0);
    if (N(dueAgg._sum.due) > 0) payments.push({ method: 'CREDIT', label: 'Credit (Udhar)', amount: N(dueAgg._sum.due) });
    payments.sort((a, b) => b.amount - a.amount);
    const byRevenue = [...sold].sort((a, b) => b.revenue - a.revenue);
    res.json({
        range: rangeView(r), kpis, previous, deltas: reports.deltas(kpis, previous, ['count', 'total', 'tax', 'due']),
        daily: series.map(d => ({ day: d.day, count: d.count, subtotal: d.subtotal, discount: d.discount, tax: d.tax, total: d.total, due: d.due })),
        top: byRevenue.filter(x => x.revenue > 0).slice(0, 10).map(x => ({ name: x.name, revenue: x.revenue })),
        payments, products: byRevenue, categories: reports.byCategory(sold),
    });
});

// ── Reports › Purchases (Summary, Supplier-wise, Outstanding Payables) ──
router.get('/purchases', VIEW, async (req, res) => {
    const t = req.user.tenantId;
    const r = await reports.rangeFor(t, req.query);
    const p = reports.previousOf(r);
    const [cur, prev, pay] = await Promise.all([reports.purchaseSummary(t, r), reports.purchaseSummary(t, p), reports.payables(t)]);
    const days = new Map(r.days.map(d => [d, { day: d, count: 0, subtotal: 0, discount: 0, tax: 0, total: 0, paid: 0, due: 0 }]));
    for (const x of cur.list) {
        const k = dates.ymd(x.date, r.tz);
        if (!days.has(k)) days.set(k, { day: k, count: 0, subtotal: 0, discount: 0, tax: 0, total: 0, paid: 0, due: 0 });
        const o = days.get(k); o.count++; for (const f of ['subtotal', 'discount', 'tax', 'total', 'paid', 'due']) o[f] += N(x[f]);
    }
    const sup = new Map();
    const vendorRow = (id, name) => { if (!sup.has(id)) sup.set(id, { vendorId: id, name, count: 0, total: 0, paid: 0, due: 0, returns: 0 }); return sup.get(id); };
    for (const x of cur.list) { const o = vendorRow(x.vendorId, x.vendorName); o.count++; o.total += N(x.total); o.paid += N(x.paid); o.due += N(x.due); }
    for (const x of cur.returnsList) vendorRow(x.vendorId, x.vendorName).returns += N(x.total);
    const k = ['count', 'total', 'tax', 'due', 'returns'];
    const pick = s => Object.fromEntries(k.map(f => [f, s[f]]));
    res.json({
        range: rangeView(r), kpis: pick(cur), previous: pick(prev), deltas: reports.deltas(pick(cur), pick(prev), k),
        daily: [...days.values()].sort((a, b) => (a.day < b.day ? -1 : 1)),
        suppliers: [...sup.values()].sort((a, b) => b.total - a.total),
        payables: pay,
    });
});

// ── Reports › Inventory (Analytics Overview, Current Stock & Value, Low-Stock, Expiry, Non-Moving) ──
router.get('/inventory', VIEW, async (req, res) => {
    const t = req.user.tenantId;
    const r = await reports.rangeFor(t, req.query);
    const valuation = await reports.stockValuation(t);
    const reminderDays = Number(r.loc.expiryReminderDays) || 30;
    const [low, exp, soldInRange, lastSold] = await Promise.all([
        reports.lowStock(t, { valuation }),
        reports.expiring(t, { withinDays: 36500, valuation }),
        prisma.stockMovement.groupBy({ by: ['productId'], where: { tenantId: t, deletedAt: null, type: 'SALE', date: within(r) }, _sum: { qty: true } }),
        prisma.stockMovement.groupBy({ by: ['productId'], where: { tenantId: t, deletedAt: null, type: 'SALE' }, _max: { date: true } }),
    ]);
    const moved = new Set(soldInRange.map(x => x.productId));
    const last = Object.fromEntries(lastSold.map(x => [x.productId, x._max.date]));
    const now = Date.now();
    const nonMoving = valuation.products.filter(x => x.stock > 0 && !moved.has(x.id))
        .map(x => ({ ...x, lastSold: last[x.id] || null, daysIdle: last[x.id] ? Math.floor((now - new Date(last[x.id])) / 86400000) : null }))
        .sort((a, b) => b.value - a.value);
    res.json({
        range: rangeView(r),
        kpis: { value: valuation.value, retailValue: valuation.retailValue, activeProducts: valuation.activeCount, units: valuation.units, lowStock: low.length },
        byCategory: valuation.byCategory,
        lowStock: low, register: valuation.products,
        expiry: exp.map(x => ({ ...x, status: x.daysLeft < 0 ? 'Expired' : x.daysLeft <= reminderDays ? 'Expiring soon' : 'OK' })),
        reminderDays, nonMoving,
    });
});

// ── Reports › Expenses (Summary, Category-wise) ──
router.get('/expenses', VIEW, async (req, res) => {
    const t = req.user.tenantId;
    const r = await reports.rangeFor(t, req.query);
    const p = reports.previousOf(r);
    const [rows, prev] = await Promise.all([
        prisma.expense.findMany({ where: { tenantId: t, deletedAt: null, date: within(r) }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 5000 }),
        prisma.expense.aggregate({ where: { tenantId: t, deletedAt: null, date: within(p) }, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    const total = rows.reduce((a, x) => a + N(x.amount), 0);
    const cats = new Map();
    for (const x of rows) { const k = (x.categoryName || '').trim() || 'Uncategorized'; const o = cats.get(k) || { name: k, count: 0, amount: 0 }; o.count++; o.amount += N(x.amount); cats.set(k, o); }
    const daily = new Map(r.days.map(d => [d, { day: d, count: 0, amount: 0 }]));
    for (const x of rows) { const k = dates.ymd(x.date, r.tz); const o = daily.get(k) || { day: k, count: 0, amount: 0 }; o.count++; o.amount += N(x.amount); daily.set(k, o); }
    const kpis = { total, count: rows.length, perDay: r.days.length ? Calc.round(total / r.days.length) : 0 };
    const previous = { total: N(prev._sum.amount), count: prev._count._all };
    res.json({
        range: rangeView(r), kpis, previous, deltas: reports.deltas(kpis, previous, ['total', 'count']),
        byCategory: [...cats.values()].map(o => ({ ...o, share: reports.pct(o.amount, total) })).sort((a, b) => b.amount - a.amount),
        daily: [...daily.values()].sort((a, b) => (a.day < b.day ? -1 : 1)),
        rows: rows.map(x => ({ id: x.id, date: x.date, category: x.categoryName || 'Uncategorized', payee: x.payee, method: x.method, reference: x.reference, note: x.note, amount: N(x.amount) })),
    });
});

// ── Reports › Financial & Khata ──
router.get('/financial', VIEW, async (req, res) => {
    const t = req.user.tenantId;
    const r = await reports.rangeFor(t, req.query);
    const [txns, recv, pay, pl, valuation, cash, capital, customers, ledgerSums] = await Promise.all([
        prisma.accountTxn.groupBy({ by: ['type'], where: { tenantId: t, deletedAt: null, date: within(r), type: { notIn: NOT_CASHFLOW } }, _sum: { amount: true } }),
        reports.receivables(t), reports.payables(t), reports.profitAndLoss(t, r), reports.stockValuation(t), reports.cashAndBank(t),
        prisma.capitalTxn.groupBy({ by: ['type'], where: { tenantId: t, deletedAt: null }, _sum: { amount: true } }),
        prisma.party.findMany({ where: { tenantId: t, type: 'CUSTOMER', deletedAt: null }, select: { id: true, name: true, phone: true } }),
        prisma.ledgerEntry.groupBy({ by: ['partyId'], where: { tenantId: t, deletedAt: null }, _sum: { debit: true, credit: true }, _max: { date: true } }),
    ]);
    // money in / out by kind (positive and negative sums are kept apart: a type can hold both, e.g. cheques)
    const pos = await prisma.accountTxn.groupBy({ by: ['type'], where: { tenantId: t, deletedAt: null, date: within(r), type: { notIn: NOT_CASHFLOW }, amount: { gt: 0 } }, _sum: { amount: true } });
    const byType = txns.map(x => { const plus = N((pos.find(p => p.type === x.type) || { _sum: {} })._sum.amount); const net = N(x._sum.amount); return { type: x.type, label: TXN_LABEL[x.type] || x.type, in: plus, out: plus - net }; })
        .sort((a, b) => (b.in + b.out) - (a.in + a.out));
    const moneyIn = sumBy(byType, 'in'), moneyOut = sumBy(byType, 'out');
    const cap = Object.fromEntries(capital.map(x => [x.type, N(x._sum.amount)]));
    const invested = (cap.SETUP || 0) + (cap.INJECTION || 0), withdrawn = (cap.DRAWING || 0) + (cap.DIVIDEND || 0);
    const sums = Object.fromEntries(ledgerSums.map(x => [x.partyId, x]));
    const khata = customers.map(c => {
        const s = sums[c.id];
        const debit = s ? N(s._sum.debit) : 0, credit = s ? N(s._sum.credit) : 0;
        return { id: c.id, name: c.name, phone: c.phone, debit, credit, balance: debit - credit, lastDate: s ? s._max.date : null };
    }).filter(c => c.debit || c.credit).sort((a, b) => b.balance - a.balance);
    const assets = cash.total + valuation.value + recv.total, liabilities = pay.total;
    res.json({
        range: rangeView(r),
        cashflow: { in: moneyIn, out: moneyOut, net: moneyIn - moneyOut, byType },
        receivables: recv, payables: pay, pl,
        netWorth: { cashBank: cash.total, accounts: cash.accounts, stockValue: valuation.value, receivables: recv.total, payables: pay.total, assets, liabilities, netWorth: assets - liabilities, invested, withdrawn },
        khata,
    });
});

// ── Reports › Tax & Audit (FBR / Sales Tax, Voided / Deleted Bills) ──
router.get('/tax', VIEW, async (req, res) => {
    const t = req.user.tenantId;
    const r = await reports.rangeFor(t, req.query);
    const [series, rates, purchaseTax, purchaseRets, voidSales, voidPurchases, refunds] = await Promise.all([
        reports.dailySeries(t, r),
        prisma.saleItem.groupBy({ by: ['taxRate'], where: { tenantId: t, deletedAt: null, sale: { is: { deletedAt: null, date: within(r) } } }, _sum: { total: true, tax: true }, _count: { _all: true } }),
        prisma.purchase.aggregate({ where: { tenantId: t, deletedAt: null, date: within(r) }, _sum: { tax: true } }),
        prisma.purchaseReturn.findMany({ where: { tenantId: t, deletedAt: null, date: within(r) }, select: { purchaseId: true, total: true } }),
        prisma.sale.findMany({ where: { tenantId: t, NOT: { deletedAt: null }, OR: [{ date: within(r) }, { deletedAt: within(r) }] }, orderBy: { deletedAt: 'desc' }, take: 1000 }),
        prisma.purchase.findMany({ where: { tenantId: t, NOT: { deletedAt: null }, OR: [{ date: within(r) }, { deletedAt: within(r) }] }, orderBy: { deletedAt: 'desc' }, take: 1000 }),
        prisma.saleReturn.findMany({ where: { tenantId: t, deletedAt: null, date: within(r) }, orderBy: { date: 'desc' }, take: 1000 }),
    ]);
    // a debit note gives back its share of the purchase's tax (a return carries the purchase's tax ÷ total), so it lowers input tax
    const retPurchases = purchaseRets.length ? await prisma.purchase.findMany({ where: { tenantId: t, id: { in: [...new Set(purchaseRets.map(x => x.purchaseId))] } }, select: { id: true, tax: true, total: true } }) : [];
    const PUR = Object.fromEntries(retPurchases.map(x => [x.id, x]));
    const inputTaxReturns = purchaseRets.reduce((a, x) => { const p = PUR[x.purchaseId]; return a + (p && N(p.total) > 0 ? Calc.round(N(x.total) * N(p.tax) / N(p.total)) : 0); }, 0);
    const outputTax = sumBy(series, 'tax'), returnsTax = sumBy(series, 'returnsTax'), grossInputTax = N(purchaseTax._sum.tax), inputTax = grossInputTax - inputTaxReturns;
    const taxable = sumBy(series, 'total') - outputTax;
    res.json({
        range: rangeView(r),
        kpis: { taxableSales: taxable, outputTax, returnsTax, netOutputTax: outputTax - returnsTax, grossInputTax, inputTaxReturns, inputTax, netTax: outputTax - returnsTax - inputTax, invoices: sumBy(series, 'count') },
        byRate: rates.map(x => ({ rate: x.taxRate, lines: x._count._all, taxable: N(x._sum.total) - N(x._sum.tax), tax: N(x._sum.tax) })).sort((a, b) => b.rate - a.rate),
        daily: series.map(d => ({ day: d.day, count: d.count, taxable: d.total - d.tax, tax: d.tax, returnsTax: d.returnsTax, net: d.tax - d.returnsTax })),
        voided: [
            ...voidSales.map(s => ({ kind: 'Sale', id: s.id, number: s.number, date: s.date, deletedAt: s.deletedAt, party: s.customerName, total: N(s.total), by: s.cashierName })),
            ...voidPurchases.map(s => ({ kind: 'Purchase', id: s.id, number: s.number, date: s.date, deletedAt: s.deletedAt, party: s.vendorName, total: N(s.total), by: s.userName })),
        ].sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt)),
        refunds: refunds.map(x => ({ id: x.id, number: x.number, date: x.date, saleNumber: x.saleNumber, customerName: x.customerName, total: N(x.total), tax: N(x.tax), refundMethod: x.refundMethod, userName: x.userName, reason: x.reason })),
    });
});

// ── Profit & Loss ──
router.get('/profit-loss', VIEW, async (req, res) => {
    const t = req.user.tenantId;
    const r = await reports.rangeFor(t, req.query);
    res.json({ range: rangeView(r), pl: await reports.profitAndLoss(t, r) });
});

// ── Product Performance ──
router.get('/product-performance', VIEW, async (req, res) => {
    const t = req.user.tenantId;
    const r = await reports.rangeFor(t, req.query);
    const [products, cats] = await Promise.all([
        reports.productSales(t, r),
        prisma.category.findMany({ where: { tenantId: t, deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ]);
    const revenue = sumBy(products, 'revenue'), profit = sumBy(products, 'netProfit');
    const topProfit = products.length ? products.reduce((a, b) => (b.netProfit > a.netProfit ? b : a)) : null;
    const topVolume = products.length ? products.reduce((a, b) => (b.qty > a.qty ? b : a)) : null;
    res.json({ range: rangeView(r), products, categories: cats, summary: { revenue, profit, avgMargin: reports.pct(profit, revenue), topProfit, topVolume } });
});

// ── Reminders (Action Center & Alert Dashboard) ──
router.get('/reminders', VIEW, async (req, res) => {
    const t = req.user.tenantId;
    const loc = await settings.get(t, 'localization');
    const days = Math.max(1, Number(loc.expiryReminderDays) || 30);
    const valuation = await reports.stockValuation(t);
    const [low, exp, recv, pay] = await Promise.all([
        reports.lowStock(t, { valuation }), reports.expiring(t, { withinDays: days * 2, valuation }), reports.receivables(t), reports.payables(t),
    ]);
    const lowIds = new Set(low.map(x => x.id)), expIds = new Set(exp.map(x => x.id));
    const risk = { healthy: 0, low: 0, out: 0, expiring: 0 };
    for (const x of valuation.products) {
        if (expIds.has(x.id) && x.stock > 0) risk.expiring += x.value;
        else if (x.stock <= 0) risk.out += x.value;
        else if (lowIds.has(x.id)) risk.low += x.value;
        else risk.healthy += x.value;
    }
    const old = o => o.buckets['61-90'] + o.buckets['90+'] > 0;
    const score = Math.max(0, 100 - Math.min(30, low.length) - Math.min(20, 5 * exp.length) - Math.min(25, 5 * recv.parties.filter(old).length) - Math.min(25, 5 * pay.parties.filter(old).length));
    res.json({
        window: { days, upTo: days * 2 },
        kpis: { overdueCollect: recv.total, olderThan30: recv.buckets['31-60'] + recv.buckets['61-90'] + recv.buckets['90+'], payablesDue: pay.total, atRisk: new Set([...lowIds, ...expIds]).size, healthScore: score },
        aging: { receivables: recv.buckets, payables: pay.buckets },
        valueAtRisk: { total: valuation.value, ...risk },
        lowStock: low,
        expiring: exp.map(x => ({ ...x, tier: x.daysLeft < 0 ? 'expired' : x.daysLeft <= days ? 'urgent' : 'upcoming', valueRisk: x.value })),
        customers: recv.parties, suppliers: pay.parties,
    });
});

module.exports = { router, mount: '/api/reports' };
