const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');
const { prisma } = require('../src/db');
const dates = require('../src/lib/dates');
const ledger = require('../src/services/ledger');
const treasury = require('../src/services/treasury');
const reports = require('../src/services/reports');

const TZ = 'Asia/Karachi';
const DAY = 86400000;
const sum = (rows, k) => rows.reduce((a, r) => a + r[k], 0);
const dayOffset = n => dates.addDays(dates.ymd(new Date(), TZ), n); // 'YYYY-MM-DD' n days from today (shop zone)

test('reports: P&L, dashboard, product performance, stock, khata aging, reminders', async t => {
    const h = await setup();
    const boot = (await h.get('/api/pos/bootstrap')).data;
    const cash = boot.accounts.find(a => a.type === 'CASH');
    const cat = (await h.post('/api/inventory/master/categories', { name: 'GROCERY' })).data;
    // A: Rs 100 + 10% tax, cost Rs 60;  B: Rs 50, no tax, cost Rs 20, only 3 in stock;  C: none in stock
    const A = (await h.post('/api/inventory/products', { name: 'Alpha', categoryId: cat.id, retailPrice: 10000, cost: 6000, taxRate: 10, openingStock: 100, reorderLevel: 5 })).data.id;
    const B = (await h.post('/api/inventory/products', { name: 'Bravo', retailPrice: 5000, cost: 2000, openingStock: 3, reorderLevel: 5 })).data.id;
    const C = (await h.post('/api/inventory/products', { name: 'Charlie', retailPrice: 1000, cost: 500, reorderLevel: 5 })).data.id;
    await h.post('/api/inventory/products', { name: 'Delivery', type: 'SERVICE', retailPrice: 2000 });

    // sale: 4 × A + 2 × B, Rs 20 bill discount → subtotal 50,000, discount 2,000, tax 3,840, total 51,840, cost 28,000
    const sale = await h.post('/api/pos/sales', { items: [{ productId: A, qty: 4 }, { productId: B, qty: 2 }], discountType: 'AMOUNT', discountValue: 2000, payments: [{ method: 'CASH', amount: 51840 }] });
    assert.equal(sale.status, 200, JSON.stringify(sale.data));
    assert.deepEqual([sale.data.subtotal, sale.data.discount, sale.data.tax, sale.data.total, sale.data.costTotal], [50000, 2000, 3840, 51840, 28000]);
    const itemA = sale.data.items.find(i => i.productId === A), itemB = sale.data.items.find(i => i.productId === B);
    // one A back on the shelf (10,560 incl. 960 tax), one B returned damaged, not restocked (4,800)
    const r1 = await h.post('/api/pos/returns', { saleId: sale.data.id, items: [{ saleItemId: itemA.id, qty: 1, restock: true }] });
    const r2 = await h.post('/api/pos/returns', { saleId: sale.data.id, items: [{ saleItemId: itemB.id, qty: 1, restock: false }] });
    assert.equal(r1.data.total, 10560); assert.equal(r1.data.tax, 960); assert.equal(r2.data.total, 4800);
    // an expense of Rs 50 (rent), recorded the way the Finance module does
    const exp = await prisma.expense.create({ data: { tenantId: h.tenantId, amount: 5000n, categoryName: 'Rent', accountId: cash.id, payee: 'Landlord' } });
    await treasury.post(prisma, { tenantId: h.tenantId, accountId: cash.id, type: 'EXPENSE', amount: -5000, refId: exp.id, refNo: 'EXP-1' });
    // a sale yesterday (the previous period of "today"): 2 × A = 22,000 incl. 2,000 tax, cost 12,000
    const old = await h.post('/api/pos/sales', { items: [{ productId: A, qty: 2 }], payments: [{ method: 'CASH', amount: 22000 }] });
    const yesterday = dates.range('yesterday', { tz: TZ });
    await prisma.sale.update({ where: { id: old.data.id }, data: { date: new Date(yesterday.from.getTime() + 12 * 3600000) } });

    await t.test('profit & loss: exact figures for sales with tax and discount, restocked and damaged returns, an expense', async () => {
        const r = await h.get('/api/reports/profit-loss?preset=today');
        assert.equal(r.status, 200, JSON.stringify(r.data));
        const pl = r.data.pl;
        assert.equal(pl.grossSales, 50000);
        assert.equal(pl.discounts, 2000);
        assert.equal(pl.returns, 14400, 'returns excl. tax: 9,600 + 4,800');
        assert.equal(pl.revenue, 33600, '(51,840 − 3,840) − 14,400');
        assert.equal(pl.tax, 2880, '3,840 − 960');
        assert.equal(pl.cogs, 22000, '28,000 − 6,000 put back; the damaged B keeps its cost');
        assert.equal(pl.grossProfit, 11600);
        assert.equal(pl.expenses, 5000);
        assert.deepEqual(pl.expenseByCategory, [{ name: 'Rent', amount: 5000 }]);
        assert.equal(pl.netProfit, 6600);
        assert.equal(pl.salesCount, 1);
        // the service other modules call gives the same numbers
        const direct = await reports.profitAndLoss(h.tenantId, dates.range('today', { tz: TZ }));
        assert.equal(direct.netProfit, 6600);
        assert.equal(direct.revenue, 33600);
    });

    await t.test('dashboard: period figures, deltas vs the previous period, live balances, low stock', async () => {
        const r = await h.get('/api/reports/dashboard?preset=today');
        assert.equal(r.status, 200, JSON.stringify(r.data));
        const d = r.data;
        assert.equal(d.period.salesTotal, 51840);
        assert.equal(d.period.revenue, 33600);
        assert.equal(d.previous.salesTotal, 22000);
        assert.equal(d.previous.revenue, 20000);
        assert.equal(d.previous.netProfit, 8000, '20,000 − 12,000, no expenses yesterday');
        assert.equal(d.deltas.salesTotal, 135.6, '(51,840 − 22,000) / 22,000');
        assert.equal(d.period.netSales, 36480, 'sales less refunds: 51,840 − 10,560 − 4,800');
        assert.equal(d.deltas.netSales, 65.8);
        assert.equal(d.deltas.revenue, 68);
        assert.equal(d.deltas.expenses, 100, 'from nothing to something is +100%');
        assert.equal(d.deltas.purchases, 0, 'no change');
        assert.equal(d.deltas.netProfit, -17.5);
        // cash: 51,840 − 10,560 − 4,800 − 5,000 + 22,000
        assert.equal(d.live.cashBank, 53480);
        assert.equal(d.live.receivable, 0);
        assert.equal(d.trend.length, 1);
        assert.equal(d.trend[0].netProfit, 6600);
        assert.deepEqual(d.lowStock.map(x => x.name), ['Charlie', 'Bravo']);
        assert.equal(d.lowStockCount, 2);
        assert.equal(d.health.find(x => x.id === 'restock').ok, false);
        assert.deepEqual(d.categories.map(c => c.name).sort(), ['GROCERY', 'Other']);
        assert.ok(d.cashflow.length >= 3);
        assert.equal(d.cashflow.find(x => x.type === 'EXPENSE').kind, 'Expense');
        assert.equal(d.cashflow.find(x => x.type === 'EXPENSE').party, 'Rent');
    });

    await t.test('the days of the trend add up to the period P&L', async () => {
        const dash = (await h.get('/api/reports/dashboard?preset=last30')).data;
        const pl = (await h.get('/api/reports/profit-loss?preset=last30')).data.pl;
        assert.equal(dash.trend.length, 30);
        assert.equal(sum(dash.trend, 'revenue'), pl.revenue);
        assert.equal(sum(dash.trend, 'netProfit'), pl.netProfit);
        assert.equal(pl.netProfit, 14600);
        const custom = (await h.get(`/api/reports/profit-loss?preset=custom&from=${dayOffset(-1)}&to=${dayOffset(-1)}`)).data;
        assert.equal(custom.range.fromDay, dayOffset(-1));
        assert.equal(custom.pl.revenue, 20000);
    });

    await t.test('product performance: qty, revenue, COGS, profit and margin per product', async () => {
        const r = (await h.get('/api/reports/product-performance?preset=today')).data;
        const a = r.products.find(p => p.productId === A), b = r.products.find(p => p.productId === B);
        assert.deepEqual([a.qty, a.revenue, a.cogs, a.netProfit, a.margin, a.avgPrice, a.avgCost], [3, 28800, 18000, 10800, 37.5, 9600, 6000]);
        assert.deepEqual([b.qty, b.revenue, b.cogs, b.netProfit, b.margin], [1, 4800, 4000, 800, 16.7]);
        assert.equal(a.category, 'GROCERY');
        assert.equal(r.summary.topProfit.productId, A);
        assert.equal(r.summary.avgMargin, 34.5, '11,600 / 33,600');
        assert.equal(sum(r.products, 'netProfit'), 11600, 'products add up to the gross profit');
        assert.equal(r.products[0].productId, A, 'sorted by net profit');
    });

    await t.test('sales and tax tabs', async () => {
        const s = (await h.get('/api/reports/sales?preset=today')).data;
        assert.deepEqual(s.kpis, { count: 1, total: 51840, tax: 3840, due: 0 });
        assert.equal(s.deltas.count, 0);
        assert.deepEqual(s.payments, [{ method: 'CASH', label: 'Cash', amount: 51840 }]);
        assert.equal(s.top[0].name, 'Alpha');
        assert.equal(s.categories.find(c => c.name === 'GROCERY').revenue, 28800);
        const tx = (await h.get('/api/reports/tax?preset=today')).data;
        assert.equal(tx.kpis.outputTax, 3840);
        assert.equal(tx.kpis.returnsTax, 960);
        assert.equal(tx.kpis.netOutputTax, 2880);
        assert.equal(tx.kpis.taxableSales, 48000);
        assert.deepEqual(tx.byRate.map(x => [x.rate, x.taxable, x.tax]), [[10, 38400, 3840], [0, 9600, 0]]);
        assert.equal(tx.refunds.length, 2);
    });

    await t.test('inventory: stock value, low stock (out of stock and low), services and variant parents left out', async () => {
        const inv = (await h.get('/api/reports/inventory?preset=today')).data;
        assert.equal(inv.kpis.value, 95 * 6000 + 1 * 2000, 'A 95 left, B 1 left, C none');
        assert.equal(inv.kpis.units, 96);
        assert.deepEqual(inv.lowStock.map(x => [x.name, x.status, x.restockCapital]), [['Charlie', 'Out of stock', 2500], ['Bravo', 'Low stock', 8000]]);
        assert.ok(!inv.register.find(x => x.name === 'Delivery'), 'a service has no stock');
        assert.equal(inv.byCategory[0].name, 'GROCERY');
        assert.ok(inv.nonMoving.every(x => x.id !== A), 'A sold today');
        const val = await reports.stockValuation(h.tenantId);
        assert.equal(val.value, inv.kpis.value, 'one valuation for every screen');
    });

    await t.test('a cashier cannot open reports', async () => {
        const cashier = await h.user('CASHIER');
        assert.equal((await h.get('/api/reports/dashboard', cashier)).status, 403);
        assert.equal((await h.get('/api/reports/profit-loss', cashier)).status, 403);
    });
});

test('reports: receivables / payables with FIFO aging, reminders expiry window, health score', async t => {
    const h = await setup();
    const tid = h.tenantId;
    const ago = n => new Date(Date.now() - n * DAY);
    const x = (await h.post('/api/pos/customers', { name: 'Xavier', phone: '0300' })).data;
    const y = (await h.post('/api/pos/customers', { name: 'Yasir' })).data;
    const z = (await h.post('/api/pos/customers', { name: 'Zara' })).data;
    const v = await prisma.party.create({ data: { tenantId: tid, type: 'VENDOR', name: 'Vendor Co' } });
    // X: 10,000 (100 days) + 5,000 (45 days) + 3,000 (5 days) − 12,000 paid → 3,000 in 31–60 and 3,000 in 0–30
    await ledger.post(prisma, { tenantId: tid, partyId: x.id, type: 'SALE', debit: 10000, date: ago(100) });
    await ledger.post(prisma, { tenantId: tid, partyId: x.id, type: 'SALE', debit: 5000, date: ago(45) });
    await ledger.post(prisma, { tenantId: tid, partyId: x.id, type: 'SALE', debit: 3000, date: ago(5) });
    await ledger.post(prisma, { tenantId: tid, partyId: x.id, type: 'PAYMENT_IN', credit: 12000, date: ago(2) });
    await ledger.post(prisma, { tenantId: tid, partyId: y.id, type: 'OPENING', debit: 7000, date: ago(70) });
    await ledger.post(prisma, { tenantId: tid, partyId: z.id, type: 'PAYMENT_IN', credit: 2000, date: ago(1) }); // an advance
    await ledger.post(prisma, { tenantId: tid, partyId: v.id, type: 'PURCHASE', credit: 20000, date: ago(120) });
    await ledger.post(prisma, { tenantId: tid, partyId: v.id, type: 'PAYMENT_OUT', debit: 5000, date: ago(10) });
    const bank = await prisma.account.create({ data: { tenantId: tid, name: 'Meezan', type: 'BANK' } });
    await treasury.post(prisma, { tenantId: tid, accountId: bank.id, type: 'CAPITAL_IN', amount: 100000 });

    await t.test('receivables and payables: totals, FIFO aging buckets', async () => {
        const recv = await reports.receivables(tid);
        assert.equal(recv.total, 13000, 'X 6,000 + Y 7,000; an advance is not a receivable');
        assert.equal(recv.net, 11000);
        assert.deepEqual(recv.buckets, { '0-30': 3000, '31-60': 3000, '61-90': 7000, '90+': 0 });
        const px = recv.parties.find(p => p.id === x.id);
        assert.deepEqual(px.buckets, { '0-30': 3000, '31-60': 3000, '61-90': 0, '90+': 0 });
        assert.equal(px.oldestDays, 45);
        const pay = await reports.payables(tid);
        assert.equal(pay.total, 15000);
        assert.deepEqual(pay.buckets, { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 15000 });
        const fin = (await h.get('/api/reports/financial?preset=month')).data;
        assert.equal(fin.receivables.total, 13000);
        assert.equal(fin.payables.total, 15000);
        assert.equal(fin.netWorth.netWorth, 100000 + 13000 - 15000);
        assert.equal(fin.khata.find(c => c.id === z.id).balance, -2000);
        assert.equal(fin.cashflow.in, 100000);
        const dash = (await h.get('/api/reports/dashboard')).data;
        assert.deepEqual(dash.live, { receivable: 13000, payable: 15000, cashBank: 100000 });
        assert.equal(dash.health.find(i => i.id === 'vendors').ok, false, 'a vendor bill is over 30 days old');
        assert.equal(dash.health.find(i => i.id === 'receivables').ok, false);
    });

    // expiry window: reminder days 30 → items expiring within 60 days (and already expired) are listed
    const mk = async (name, d) => (await h.post('/api/inventory/products', { name, retailPrice: 1000, cost: 400, openingStock: 10, reorderLevel: 0, expiryDate: dayOffset(d) })).data.id;
    const e10 = await mk('Milk (10 days)', 10), e45 = await mk('Yogurt (45 days)', 45), e90 = await mk('Rice (90 days)', 90), eOld = await mk('Bread (expired)', -5);

    await t.test('reminders: expiry window from settings, tiers, value at risk, aging chart, health score', async () => {
        const r = (await h.get('/api/reports/reminders')).data;
        assert.deepEqual(r.window, { days: 30, upTo: 60 });
        assert.deepEqual(r.expiring.map(e => [e.productId || e.id, e.tier, e.daysLeft]), [[eOld, 'expired', -5], [e10, 'urgent', 10], [e45, 'upcoming', 45]]);
        assert.ok(!r.expiring.find(e => e.id === e90));
        assert.equal(r.expiring[1].valueRisk, 4000);
        assert.equal(r.kpis.atRisk, 3);
        assert.equal(r.kpis.overdueCollect, 13000);
        assert.equal(r.kpis.olderThan30, 10000);
        assert.equal(r.kpis.payablesDue, 15000);
        assert.deepEqual(r.aging.receivables, { '0-30': 3000, '31-60': 3000, '61-90': 7000, '90+': 0 });
        assert.equal(r.valueAtRisk.total, 16000);
        assert.equal(r.valueAtRisk.expiring, 12000);
        assert.equal(r.valueAtRisk.healthy, 4000);
        // 100 − 3 expiring × 5 − 1 customer over 60 days × 5 − 1 vendor over 60 days × 5
        assert.equal(r.kpis.healthScore, 75);
        assert.equal(r.customers.length, 2);
        assert.equal(r.suppliers[0].name, 'Vendor Co');

        const put = await h.put('/api/settings/localization', { expiryReminderDays: 100 });
        assert.equal(put.status, 200, JSON.stringify(put.data));
        const r2 = (await h.get('/api/reports/reminders')).data;
        assert.deepEqual(r2.window, { days: 100, upTo: 200 });
        assert.equal(r2.expiring.find(e => e.id === e90).tier, 'urgent');
        assert.equal(r2.expiring.find(e => e.id === e45).tier, 'urgent');
    });

    await t.test('inventory expiry report flags expired and expiring items', async () => {
        const inv = (await h.get('/api/reports/inventory')).data;
        assert.equal(inv.expiry.find(e => e.id === eOld).status, 'Expired');
        assert.equal(inv.expiry.find(e => e.id === e10).status, 'Expiring soon');
    });
});

test('reports: bad period dates are a 400; a debit note lowers the input tax', async t => {
    const h = await setup();
    await t.test('impossible or malformed custom dates are refused, not a server error', async () => {
        for (const q of ['from=2026-13-45', 'from=0000-00-00&to=9999-99-99', 'from=2026-02-31', 'preset=custom&from=x', 'from=2026-01-01&from=2026-01-02']) {
            for (const p of ['profit-loss', 'dashboard', 'sales', 'tax', 'financial']) {
                const r = await h.get(`/api/reports/${p}?${q}`);
                assert.equal(r.status, 400, `${p}?${q} → ${r.status} ${JSON.stringify(r.data).slice(0, 100)}`);
            }
        }
        assert.equal((await h.get('/api/reports/profit-loss?from=2026-02-28&to=2026-03-01')).status, 200);
    });

    await t.test('tax report: input tax = purchase tax − the tax given back by debit notes', async () => {
        const vendor = (await h.post('/api/parties', { type: 'VENDOR', name: 'Taxed Supplier' })).data;
        const prod = (await h.post('/api/inventory/products', { name: 'Oil', retailPrice: 30000, cost: 0 })).data;
        // 10 × Rs 100 + 17% = Rs 1,170 (tax Rs 170); then 4 returned on credit = Rs 468, of which Rs 68 is tax
        const pur = await h.post('/api/purchases', { vendorId: vendor.id, items: [{ productId: prod.id, qty: 10, cost: 10000 }], taxRate: 17 });
        assert.equal(pur.status, 200, JSON.stringify(pur.data));
        assert.equal(pur.data.tax, 17000);
        const item = (await h.get('/api/purchases/' + pur.data.id)).data.items[0];
        const ret = await h.post(`/api/purchases/${pur.data.id}/returns`, { settlement: 'CREDIT', items: [{ purchaseItemId: item.id, qty: 4 }] });
        assert.equal(ret.status, 200, JSON.stringify(ret.data));
        assert.equal(ret.data.total, 46800);
        const k = (await h.get('/api/reports/tax?preset=today')).data.kpis;
        assert.equal(k.grossInputTax, 17000);
        assert.equal(k.inputTaxReturns, 6800);
        assert.equal(k.inputTax, 10200);
        assert.equal(k.netTax, k.outputTax - k.returnsTax - 10200);
    });
});
