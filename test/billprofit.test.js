// Bill-wise profit report: each bill's sales (without tax, after its returns), purchase cost and profit; the product-wise
// breakdown of one bill (purchase price, selling price, quantity, profit per item).
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');

test('bill-wise profit', async t => {
    const h = await setup();
    const units = (await h.get('/api/inventory/master/units')).data;
    const ctn = units.find(u => u.shortCode === 'Ctn'), pcs = units.find(u => u.shortCode === 'Pcs');
    const soap = (await h.post('/api/inventory/products', { name: 'Soap', retailPrice: 15000, wholesalePrice: 14000, cost: 10000, openingStock: 100 })).data.id;
    const tea = (await h.post('/api/inventory/products', { name: 'Tea Ctn', retailPrice: 600000, cost: 480000, baseUnitId: ctn.id, altUnits: [{ unitId: pcs.id, factor: 24, price: 26000 }], openingStock: 10 })).data.id;
    const free = (await h.post('/api/inventory/products', { name: 'No Cost Item', retailPrice: 5000, openingStock: 10 })).data.id;

    const s1 = (await h.post('/api/pos/sales', { items: [{ productId: soap, qty: 4 }, { productId: tea, unitId: pcs.id, qty: 6 }], payments: [{ method: 'CASH', amount: 216000 }] })).data;
    const s2 = (await h.post('/api/pos/sales', { priceMode: 'WHOLESALE', items: [{ productId: soap, qty: 10 }], discountType: 'AMOUNT', discountValue: 10000, payments: [{ method: 'CASH', amount: 130000 }] })).data;
    const s3 = (await h.post('/api/pos/sales', { items: [{ productId: free, qty: 2 }], payments: [{ method: 'CASH', amount: 10000 }] })).data;
    // one soap of bill 1 comes back to stock
    const ret = await h.post('/api/pos/returns', { saleId: s1.id, items: [{ saleItemId: s1.items.find(i => i.productId === soap).id, qty: 1 }] });
    assert.equal(ret.status, 200, JSON.stringify(ret.data));

    let list;
    await t.test('each bill: sales, purchase cost, net profit (returns off the bill they belong to)', async () => {
        const r = await h.get('/api/reports/bill-profit?preset=today');
        assert.equal(r.status, 200, JSON.stringify(r.data));
        list = r.data;
        const b1 = list.bills.find(b => b.id === s1.id), b2 = list.bills.find(b => b.id === s2.id), b3 = list.bills.find(b => b.id === s3.id);
        // bill 1: 4 soap × 150 + 6 pcs tea × 260 = 2,160; 1 soap back (150) → 2,010; cost 4×100 + 6×(4800/24=200) − 100 = 1,500
        assert.deepEqual([b1.sales, b1.revenue, b1.cost, b1.profit], [216000, 201000, 150000, 51000]);
        assert.equal(b1.returned, 15000);
        // bill 2: 10 soap at wholesale 140 = 1,400 − 100 discount = 1,300; cost 1,000
        assert.deepEqual([b2.sales, b2.cost, b2.profit], [130000, 100000, 30000]);
        assert.equal(b3.profit, 10000, 'no cost price: the whole sale shows as profit');
        assert.ok(list.totals.bills >= 3);
        assert.equal(list.totals.profit, list.bills.reduce((a, b) => a + b.profit, 0));
        assert.equal(list.totals.cost, list.bills.reduce((a, b) => a + b.cost, 0));
    });

    await t.test('search by bill number or customer', async () => {
        const r = await h.get('/api/reports/bill-profit?preset=today&q=' + encodeURIComponent(s2.number));
        assert.deepEqual(r.data.bills.map(b => b.id), [s2.id]);
    });

    await t.test('one bill product by product: purchase price, selling price, quantity, profit', async () => {
        const r = await h.get('/api/reports/bill-profit/' + s1.id);
        assert.equal(r.status, 200, JSON.stringify(r.data));
        const soapLine = r.data.items.find(i => i.name === 'Soap'), teaLine = r.data.items.find(i => i.name === 'Tea Ctn');
        assert.deepEqual([soapLine.qty, soapLine.returnedQty, soapLine.netQty, soapLine.purchasePrice, soapLine.sellingPrice, soapLine.revenue, soapLine.cost, soapLine.profit], [4, 1, 3, 10000, 15000, 45000, 30000, 15000]);
        assert.deepEqual([teaLine.unit, teaLine.qty, teaLine.purchasePrice, teaLine.sellingPrice, teaLine.profit], ['Pcs', 6, 20000, 26000, 36000], 'per piece: cost 4,800 / 24 = 200');
        assert.equal(r.data.totals.profit, list.bills.find(b => b.id === s1.id).profit, 'the breakdown adds up to the bill');
        const d2 = (await h.get('/api/reports/bill-profit/' + s2.id)).data;
        assert.deepEqual([d2.items[0].listPrice, d2.items[0].sellingPrice], [14000, 13000], 'selling price after the bill discount');
        const d3 = (await h.get('/api/reports/bill-profit/' + s3.id)).data;
        assert.equal(d3.totals.noCost, 1);
    });

    await t.test('only for those who see reports', async () => {
        const cashier = await h.user('CASHIER');
        assert.equal((await h.get('/api/reports/bill-profit', cashier)).status, 403);
        assert.equal((await h.get('/api/reports/bill-profit/' + s1.id, cashier)).status, 403);
        assert.equal((await h.get('/api/reports/bill-profit/00000000-0000-0000-0000-000000000000')).status, 404);
    });
});
