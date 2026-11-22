const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');

test('purchases: alt units, weighted cost, payments, returns, serials, permissions', async t => {
    const h = await setup();
    const units = (await h.get('/api/inventory/master/units')).data;
    const ctn = units.find(u => u.shortCode === 'Ctn'), dzn = units.find(u => u.shortCode === 'Dzn'), pcs = units.find(u => u.shortCode === 'Pcs');
    const vendor = (await h.post('/api/parties', { type: 'VENDOR', name: 'Unilever Distributor', contactPerson: 'Ali', phone: '0300' })).data;
    const prod = (await h.post('/api/inventory/products', { name: 'CLEAR SACHET 8ML', retailPrice: 480000, cost: 450000, baseUnitId: ctn.id, altUnits: [{ unitId: dzn.id, factor: 30 }], openingStock: 10 })).data;
    const accounts = async () => Object.fromEntries((await h.get('/api/finance/accounts')).data.map(a => [a.name, a.balance]));
    const vendorBalance = async () => (await h.get('/api/parties/' + vendor.id)).data.balance;
    const product = async id => (await h.get('/api/inventory/products/' + id)).data;

    let pur;
    await t.test('purchase in an alternate unit (dozen) moves base-unit stock and updates the weighted average cost', async () => {
        const r = await h.post('/api/purchases', {
            vendorId: vendor.id, date: '2026-11-20',
            items: [{ productId: prod.id, unitId: dzn.id, qty: 60, cost: 16000 }], // Rs 160 per dozen = Rs 4,800 per carton
            discountType: 'PERCENT', discountValue: 10, taxRate: 5, paid: 400000, paymentMethod: 'CASH',
        });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        pur = r.data;
        assert.match(pur.number, /^PUR-/);
        assert.equal(pur.subtotal, 960000);
        assert.equal(pur.discount, 96000);
        assert.equal(pur.tax, 43200);
        assert.equal(pur.total, 907200);
        assert.equal(pur.subtotal - pur.discount + pur.tax, pur.total);
        assert.equal(pur.paid, 400000);
        assert.equal(pur.due, 507200);
        assert.equal(pur.status, 'PARTIAL');
        const p = await product(prod.id);
        assert.equal(p.stock, 12); // 10 + 60/30
        // a carton cost Rs 4,800 less the 10% bill discount = Rs 4,320 (tax is input tax, not cost): (10×4500 + 2×4320) / 12
        assert.equal(p.cost, 447000);
        const moves = (await h.get(`/api/inventory/products/${prod.id}/movements`)).data;
        const m = moves.find(x => x.type === 'PURCHASE');
        assert.equal(m.qty, 2);
        assert.equal(m.unitCost, 432000);
        assert.equal(m.refNo, pur.number);
    });

    await t.test('partial payment: vendor owes the due, cash goes down by what was paid', async () => {
        assert.equal(await vendorBalance(), 507200);
        assert.equal((await accounts())['Cash in Hand'], -400000);
        const detail = (await h.get('/api/purchases/' + pur.id)).data;
        assert.equal(detail.items.length, 1);
        assert.equal(detail.items[0].baseQty, 2);
        assert.equal(detail.items[0].unitName, 'Dzn');
        assert.equal(detail.items[0].total, 907200);
        const list = (await h.get('/api/purchases')).data;
        assert.equal(list.length, 1);
        assert.equal(list[0].itemsCount, 1);
    });

    await t.test('paying more on a purchase later lowers its due and the vendor balance', async () => {
        const over = await h.post(`/api/purchases/${pur.id}/pay`, { amount: 600000 });
        assert.equal(over.status, 400);
        const r = await h.post(`/api/purchases/${pur.id}/pay`, { amount: 7200, method: 'CASH' });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.due, 500000);
        assert.equal(r.data.status, 'PARTIAL');
        assert.equal(await vendorBalance(), 500000);
        assert.equal((await accounts())['Cash in Hand'], -407200);
    });

    let item;
    await t.test('purchase return on credit: stock out, payable down', async () => {
        item = (await h.get('/api/purchases/' + pur.id)).data.items[0];
        const tooMany = await h.post(`/api/purchases/${pur.id}/returns`, { settlement: 'CREDIT', items: [{ purchaseItemId: item.id, qty: 61 }] });
        assert.equal(tooMany.status, 400);
        const r = await h.post(`/api/purchases/${pur.id}/returns`, { settlement: 'CREDIT', reason: 'Damaged', items: [{ purchaseItemId: item.id, qty: 30 }] });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.match(r.data.number, /^PRN-/);
        assert.equal(r.data.total, 453600); // half of the line total incl. discount and tax
        assert.equal(await vendorBalance(), 500000 - 453600);
        assert.equal((await product(prod.id)).stock, 11);
        assert.equal(r.data.purchase.due, 46400);
        assert.equal(r.data.purchase.returnedTotal, 453600);
        const again = await h.post(`/api/purchases/${pur.id}/returns`, { settlement: 'CREDIT', items: [{ purchaseItemId: item.id, qty: 31 }] });
        assert.equal(again.status, 400, 'cannot return more than bought − already returned');
    });

    await t.test('purchase return with cash refund: money comes back, payable unchanged, purchase fully returned', async () => {
        const cashBefore = (await accounts())['Cash in Hand'];
        const r = await h.post(`/api/purchases/${pur.id}/returns`, { settlement: 'CASH', items: [{ purchaseItemId: item.id, qty: 30 }] });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.total, 453600);
        assert.equal((await accounts())['Cash in Hand'], cashBefore + 453600);
        assert.equal(await vendorBalance(), 46400);
        assert.equal(r.data.purchase.status, 'RETURNED');
        assert.equal(r.data.purchase.returnedTotal, pur.total);
        assert.equal((await product(prod.id)).stock, 10);
        const rets = (await h.get('/api/purchases/returns')).data;
        assert.equal(rets.length, 2);
        assert.equal(rets[0].items[0].qty, 30);
        const detail = (await h.get('/api/purchases/' + pur.id)).data;
        assert.equal(detail.items[0].returnedQty, 60);
        assert.equal(detail.returns.length, 2);
    });

    await t.test('amount discount, tax and a fully paid bank purchase into a chosen account', async () => {
        const bank = (await h.post('/api/finance/accounts', { name: 'HBL Main', type: 'BANK', openingBalance: 2000000 })).data;
        const tea = (await h.post('/api/inventory/products', { name: 'Tea 1kg', retailPrice: 150000, cost: 0, baseUnitId: pcs.id })).data;
        const r = await h.post('/api/purchases', { vendorId: vendor.id, items: [{ productId: tea.id, qty: 3, cost: 100033 }, { productId: prod.id, qty: 1, cost: 450000 }], discountType: 'AMOUNT', discountValue: 1001, taxRate: 17 });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        const b = r.data;
        assert.equal(b.subtotal, 300099 + 450000);
        assert.equal(b.discount, 1001);
        assert.equal(b.subtotal - b.discount + b.tax, b.total);
        assert.equal(b.status, 'DUE');
        // the Rs 10.01 bill discount is shared by value: tea's share 400 paisa of 300099 → cost per unit after discount
        const teaCost = Math.round(100033 * (300099 - 400) / 300099);
        assert.equal((await product(tea.id)).cost, teaCost, 'first purchase sets the cost (after its share of the discount)');
        const full = await h.post('/api/purchases', { vendorId: vendor.id, items: [{ productId: tea.id, qty: 1, cost: 90000 }], paid: 90000, paymentMethod: 'BANK', accountId: bank.id });
        assert.equal(full.data.status, 'PAID');
        assert.equal((await accounts())['HBL Main'], 2000000 - 90000);
        assert.equal((await product(tea.id)).cost, Math.round((3 * teaCost + 90000) / 4));
        const over = await h.post('/api/purchases', { vendorId: vendor.id, items: [{ productId: tea.id, qty: 1, cost: 1000 }], paid: 2000 });
        assert.equal(over.status, 400, 'cannot pay more than the total');
    });

    await t.test('serialized product: exactly one serial per unit, serials enter stock, returned serials go back to the vendor', async () => {
        const phone = (await h.post('/api/inventory/products', { name: 'Phone X', type: 'SERIAL', retailPrice: 5000000, baseUnitId: pcs.id })).data;
        const wrong = await h.post('/api/purchases', { vendorId: vendor.id, items: [{ productId: phone.id, qty: 2, cost: 4000000, serials: 'IMEI-A' }] });
        assert.equal(wrong.status, 400);
        assert.match(wrong.data.error, /exactly 2/);
        const r = await h.post('/api/purchases', { vendorId: vendor.id, items: [{ productId: phone.id, qty: 2, cost: 4000000, serials: 'IMEI-A\nIMEI-B' }] });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        let p = await product(phone.id);
        assert.equal(p.stock, 2);
        assert.deepEqual(p.serials.map(s => s.serial).sort(), ['IMEI-A', 'IMEI-B']);
        const dupe = await h.post('/api/purchases', { vendorId: vendor.id, items: [{ productId: phone.id, qty: 1, cost: 4000000, serials: 'imei-a' }] });
        assert.equal(dupe.status, 400, 'a serial already in stock cannot be bought again');
        const detail = (await h.get('/api/purchases/' + r.data.id)).data;
        assert.equal(detail.items[0].serials.length, 2);
        const ret = await h.post(`/api/purchases/${r.data.id}/returns`, { settlement: 'CREDIT', items: [{ purchaseItemId: detail.items[0].id, serials: ['IMEI-B'] }] });
        assert.equal(ret.status, 200, JSON.stringify(ret.data));
        assert.equal(ret.data.total, 4000000);
        p = await product(phone.id);
        assert.equal(p.stock, 1);
        assert.equal(p.serials.find(s => s.serial === 'IMEI-B').status, 'RETURNED_TO_VENDOR');
        assert.equal(p.serials.find(s => s.serial === 'IMEI-A').status, 'IN_STOCK');
        const notMine = await h.post(`/api/purchases/${r.data.id}/returns`, { settlement: 'CREDIT', items: [{ purchaseItemId: detail.items[0].id, serials: ['IMEI-B'] }] });
        assert.equal(notMine.status, 400, 'a serial already returned cannot be returned again');
    });

    await t.test('services, variant parents and customers as suppliers are refused', async () => {
        const svc = (await h.post('/api/inventory/products', { name: 'Repair', type: 'SERVICE', retailPrice: 10000 })).data;
        const a = await h.post('/api/purchases', { vendorId: vendor.id, items: [{ productId: svc.id, qty: 1, cost: 100 }] });
        assert.equal(a.status, 400);
        const colors = (await h.get('/api/inventory/master/colors')).data.slice(0, 1);
        const v = (await h.post('/api/inventory/products', { name: 'Shirt', type: 'VARIANT', retailPrice: 1000, variants: [{ colorId: colors[0].id }] })).data;
        const b = await h.post('/api/purchases', { vendorId: vendor.id, items: [{ productId: v.id, qty: 1, cost: 100 }] });
        assert.equal(b.status, 400);
        const child = (await h.get('/api/inventory/products/' + v.id)).data.variants[0];
        const c = await h.post('/api/purchases', { vendorId: vendor.id, items: [{ productId: child.id, qty: 1, cost: 100 }] });
        assert.equal(c.status, 200, 'a variant child can be purchased');
        const cust = (await h.post('/api/parties', { type: 'CUSTOMER', name: 'Walk Customer' })).data;
        const d = await h.post('/api/purchases', { vendorId: cust.id, items: [{ productId: child.id, qty: 1, cost: 100 }] });
        assert.equal(d.status, 400);
        const e = await h.post('/api/purchases', { vendorId: vendor.id, items: [] });
        assert.equal(e.status, 400);
    });

    await t.test('a cashier cannot see or create purchases', async () => {
        const cashier = await h.user('CASHIER');
        assert.equal((await h.get('/api/purchases', cashier)).status, 403);
        assert.equal((await h.post('/api/purchases', { vendorId: vendor.id, items: [{ productId: prod.id, qty: 1, cost: 1 }] }, cashier)).status, 403);
        const buyer = await h.user('MANAGER', ['purchases.manage']);
        assert.equal((await h.get('/api/purchases/vendors', buyer)).status, 200, 'a buyer can pick suppliers');
        assert.equal((await h.get('/api/finance/accounts', buyer)).status, 200, 'and pick the paying account');
    });
});

test('purchases: the bill discount lowers the cost, so profit, cash and net worth agree', async () => {
    const h = await setup();
    const units = (await h.get('/api/inventory/master/units')).data;
    const pcs = units.find(u => u.shortCode === 'Pcs');
    const vendor = (await h.post('/api/parties', { type: 'VENDOR', name: 'Discount Supplier' })).data;
    const prod = (await h.post('/api/inventory/products', { name: 'Biscuit', retailPrice: 12000, cost: 0, baseUnitId: pcs.id })).data;
    // 10 × Rs 100 less 10% = Rs 900, paid in cash; then all 10 sold for Rs 120 each in cash
    const pur = await h.post('/api/purchases', { vendorId: vendor.id, items: [{ productId: prod.id, qty: 10, cost: 10000 }], discountType: 'PERCENT', discountValue: 10, paid: 90000 });
    assert.equal(pur.status, 200, JSON.stringify(pur.data));
    assert.equal((await h.get('/api/inventory/products/' + prod.id)).data.cost, 9000, 'Rs 90 a piece after the discount');
    const sale = await h.post('/api/pos/sales', { items: [{ productId: prod.id, qty: 10 }], payments: [{ method: 'CASH', amount: 120000 }] });
    assert.equal(sale.status, 200, JSON.stringify(sale.data));
    const pl = (await h.get('/api/reports/profit-loss?preset=today')).data.pl;
    assert.equal(pl.cogs, 90000);
    assert.equal(pl.netProfit, 30000, 'profit = cash gained (−900 + 1,200)');
    const fin = (await h.get('/api/reports/financial?preset=today')).data.netWorth;
    assert.equal(fin.cashBank, 30000);
    assert.equal(fin.netWorth, 30000);
    const cap = (await h.get('/api/finance/capital')).data;
    assert.equal(cap.netWorth, fin.netWorth, 'capital (retained earnings) equals assets − liabilities');
});

test('purchases: bad dates, repeated serials on a return, one serial bought twice at once, foreign accounts', async t => {
    const h = await setup();
    const units = (await h.get('/api/inventory/master/units')).data;
    const pcs = units.find(u => u.shortCode === 'Pcs');
    const vendor = (await h.post('/api/parties', { type: 'VENDOR', name: 'Phone Supplier' })).data;
    const soap = (await h.post('/api/inventory/products', { name: 'Soap', retailPrice: 100, cost: 50, baseUnitId: pcs.id })).data;
    const line = [{ productId: soap.id, qty: 1, cost: 100 }];
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

    await t.test('a purchase cannot be dated after today, on an impossible day, or with a non-text date', async () => {
        for (const date of [tomorrow, '2026-02-31', '2026-13-01', 12345, { d: 1 }, '1999-12-31']) {
            const r = await h.post('/api/purchases', { vendorId: vendor.id, items: line, date });
            assert.equal(r.status, 400, `${JSON.stringify(date)} → ${JSON.stringify(r.data)}`);
        }
        const ok = await h.post('/api/purchases', { vendorId: vendor.id, items: line, date: '2026-01-15' });
        assert.equal(ok.status, 200, JSON.stringify(ok.data));
        assert.equal(new Date(ok.data.date).toISOString(), '2026-01-15T07:00:00.000Z', 'noon of that day in the shop zone (Asia/Karachi)');
        assert.equal((await h.post(`/api/purchases/${ok.data.id}/pay`, { amount: 10, date: tomorrow })).status, 400);
        assert.equal((await h.post(`/api/purchases/${ok.data.id}/pay`, { amount: 10, date: '2026-01-14' })).status, 400, 'not before the purchase');
        assert.equal((await h.post(`/api/purchases/${ok.data.id}/pay`, { amount: 10, date: '2026-01-15' })).status, 200, 'the same day is fine');
        const okItem = (await h.get('/api/purchases/' + ok.data.id)).data.items[0];
        assert.equal((await h.post(`/api/purchases/${ok.data.id}/returns`, { items: [{ purchaseItemId: okItem.id, qty: 1 }], date: '2026-01-01' })).status, 400, 'a return not before the purchase');
        assert.equal((await h.get('/api/purchases?from=2026-99-99')).status, 400, 'a bad filter date is a 400, not a server error');
        assert.equal((await h.get(`/api/purchases?from=2026-01-01&to=${today}`)).status, 200);
    });

    await t.test('a repeated serial on a return is refused (stock and serials stay in step)', async () => {
        const phone = (await h.post('/api/inventory/products', { name: 'Phone', type: 'SERIAL', retailPrice: 5000000, baseUnitId: pcs.id })).data;
        const r = await h.post('/api/purchases', { vendorId: vendor.id, items: [{ productId: phone.id, qty: 2, cost: 4000000, serials: 'SN-1\nSN-2' }] });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        const item = (await h.get('/api/purchases/' + r.data.id)).data.items[0];
        const bad = await h.post(`/api/purchases/${r.data.id}/returns`, { settlement: 'CREDIT', items: [{ purchaseItemId: item.id, serials: ['SN-1', 'SN-1'] }] });
        assert.equal(bad.status, 400, JSON.stringify(bad.data));
        const p = (await h.get('/api/inventory/products/' + phone.id)).data;
        assert.equal(p.stock, 2);
        assert.equal(p.serials.filter(s => s.status === 'IN_STOCK').length, 2);
    });

    await t.test('two purchases of the same serial at the same moment: only one gets in', async () => {
        const tab = (await h.post('/api/inventory/products', { name: 'Tablet', type: 'SERIAL', retailPrice: 5000000, baseUnitId: pcs.id })).data;
        const body = { vendorId: vendor.id, items: [{ productId: tab.id, qty: 1, cost: 100, serials: 'TAB-777' }] };
        const res = await Promise.all([h.post('/api/purchases', body), h.post('/api/purchases', body), h.post('/api/purchases', body)]);
        assert.deepEqual(res.map(r => r.status).sort(), [200, 400, 400], JSON.stringify(res.map(r => r.data)));
        const p = (await h.get('/api/inventory/products/' + tab.id)).data;
        assert.equal(p.stock, 1);
        assert.equal(p.serials.filter(s => s.serial === 'TAB-777').length, 1);
    });

    await t.test('an unpaid purchase does not keep an account id of another client', async () => {
        const other = await setup();
        const foreign = (await other.get('/api/finance/accounts')).data[0].id;
        const r = await h.post('/api/purchases', { vendorId: vendor.id, items: line, accountId: foreign });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.accountId, null);
        assert.equal((await h.post('/api/purchases', { vendorId: vendor.id, items: line, paid: 100, accountId: foreign })).status, 400, 'paying from it is refused');
    });

    await t.test('an absurd total is a 400, not a database overflow', async () => {
        const r = await h.post('/api/purchases', { vendorId: vendor.id, items: [{ productId: soap.id, qty: 1e9, cost: 1e14 }] });
        assert.equal(r.status, 400, JSON.stringify(r.data));
    });
});

test('purchases: two payments at the same moment cannot overpay a purchase', async () => {
    const h = await setup();
    const vendor = (await h.post('/api/parties', { type: 'VENDOR', name: 'Race Supplier' })).data;
    const prod = (await h.post('/api/inventory/products', { name: 'Rice', retailPrice: 2000, cost: 0 })).data;
    const pur = (await h.post('/api/purchases', { vendorId: vendor.id, items: [{ productId: prod.id, qty: 1, cost: 100000 }] })).data;
    const res = await Promise.all([1, 2, 3].map(() => h.post(`/api/purchases/${pur.id}/pay`, { amount: 70000 })));
    assert.deepEqual(res.map(r => r.status).sort(), [200, 400, 400]);
    const p = (await h.get('/api/purchases/' + pur.id)).data;
    assert.equal(p.paid, 70000);
    assert.equal(p.due, 30000);
    assert.equal((await h.get('/api/parties/' + vendor.id)).data.balance, 30000);
});
