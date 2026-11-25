// Long lists: the list endpoints stop at a limit, but their totals count every matching record, and a search reaches
// records beyond the limit (the pages page or "show more" through what is listed; see core/ui.js pageTables).
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');

test('list totals and search go past the list limit', async t => {
    const h = await setup();
    const p = (await h.post('/api/inventory/products', { name: 'Sugar 1kg', retailPrice: 15000, cost: 12000, openingStock: 100 })).data.id;
    const cust = (await h.post('/api/parties', { type: 'CUSTOMER', name: 'Bilal 89', phone: '03001112233' })).data;

    await t.test('sales: the cards count every sale, not only the ones listed', async () => {
        for (let i = 0; i < 3; i++) assert.equal((await h.post('/api/pos/sales', { items: [{ productId: p, qty: 1 }], payments: [{ method: 'CASH', amount: 15000 }] })).status, 200);
        const credit = await h.post('/api/pos/sales', { mode: 'CREDIT', customerId: cust.id, items: [{ productId: p, qty: 2 }], payments: [] });
        assert.equal(credit.status, 200, JSON.stringify(credit.data));
        const one = (await h.get('/api/pos/sales?limit=1')).data;
        assert.equal(one.sales.length, 1);
        assert.equal(one.summary.listed, 1);
        assert.equal(one.summary.count, 4);
        assert.equal(one.summary.revenue, 3 * 15000 + 30000);
        assert.equal(one.summary.due, 30000);
        const found = (await h.get('/api/pos/sales?limit=1&q=Bilal')).data;
        assert.equal(found.summary.count, 1);
        assert.equal(found.sales[0].customerName, 'Bilal 89');
    });

    await t.test('payments: totals cover every payment; search asks the server', async () => {
        assert.equal((await h.post('/api/finance/payments', { direction: 'IN', partyId: cust.id, amount: 10000, method: 'CASH', reference: 'Slip 7' })).status, 200);
        assert.equal((await h.post('/api/finance/payments', { direction: 'IN', partyId: cust.id, amount: 5000, method: 'CASH' })).status, 200);
        const tot = (await h.get('/api/finance/payments?totals=1')).data;
        const list = (await h.get('/api/finance/payments')).data;
        assert.equal(tot.in, list.filter(x => x.direction === 'IN').reduce((s, x) => s + x.amount, 0));
        assert.equal(tot.out, list.filter(x => x.direction === 'OUT').reduce((s, x) => s + x.amount, 0));
        assert.equal(tot.count, list.length);
        const slip = (await h.get('/api/finance/payments?q=slip 7')).data;
        assert.equal(slip.length, 1);
        assert.equal(slip[0].amount, 10000);
    });
});
