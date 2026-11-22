const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { setup } = require('./helpers');

test('POS: sales, units, credit, payments, idempotency, serials, held carts, returns', async t => {
    const h = await setup();
    const units = (await h.get('/api/inventory/master/units')).data;
    const ctn = units.find(u => u.shortCode === 'Ctn'), dzn = units.find(u => u.shortCode === 'Dzn');
    const sachet = (await h.post('/api/inventory/products', { name: 'CLEAR SACHET 8ML', retailPrice: 480000, cost: 450000, baseUnitId: ctn.id, altUnits: [{ unitId: dzn.id, factor: 30 }], openingStock: 10 })).data.id;
    const soap = (await h.post('/api/inventory/products', { name: 'Soap', retailPrice: 12000, wholesalePrice: 10000, cost: 8000, openingStock: 50 })).data.id;
    const service = (await h.post('/api/inventory/products', { name: 'Gift wrap', type: 'SERVICE', retailPrice: 5000 })).data.id;
    const cash = (await h.get('/api/pos/bootstrap')).data.accounts.find(a => a.type === 'CASH');
    const accountBalance = async () => {
        const { prisma } = require('../src/db');
        const r = await prisma.accountTxn.aggregate({ where: { tenantId: h.tenantId, accountId: cash.id, deletedAt: null }, _sum: { amount: true } });
        return Number(r._sum.amount || 0);
    };
    const stockOf = async id => (await h.get('/api/inventory/products/' + id)).data.stock;

    await t.test('cash walk-in sale with change: stock down, cash in = total', async () => {
        const r = await h.post('/api/pos/sales', { items: [{ productId: soap, qty: 3 }, { productId: service, qty: 1 }], payments: [{ method: 'CASH', amount: 50000 }] });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.total, 41000);
        assert.equal(r.data.change, 9000);
        assert.equal(r.data.paid, 41000);
        assert.equal(r.data.status, 'COMPLETED');
        assert.match(r.data.number, /^INV-\d{4}$/);
        assert.equal(await stockOf(soap), 47);
        assert.equal(await accountBalance(), 41000);
    });

    await t.test('selling 4 dozen from a 30-dozen carton leaves 9.867 cartons', async () => {
        const r = await h.post('/api/pos/sales', { items: [{ productId: sachet, unitId: dzn.id, qty: 4 }], payments: [{ method: 'CASH', amount: 64000 }] });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.items[0].price, 16000);
        assert.equal(r.data.total, 64000);
        assert.equal(await stockOf(sachet), 9.867);
        assert.equal(r.data.items[0].unitName, 'Dzn');
    });

    await t.test('weighed sale: a fractional quantity at a set price', async () => {
        const r = await h.post('/api/pos/sales', { items: [{ productId: sachet, qty: 0.1 }], payments: [{ method: 'CASH', amount: 48000 }] });
        assert.equal(r.data.total, 48000);
    });

    await t.test('walk-in sale must be paid in full', async () => {
        const r = await h.post('/api/pos/sales', { items: [{ productId: soap, qty: 1 }], payments: [{ method: 'CASH', amount: 5000 }] });
        assert.equal(r.status, 400);
    });

    let cust;
    await t.test('credit (udhar) sale: due goes to the customer khata, limit enforced', async () => {
        cust = (await h.post('/api/pos/customers', { name: 'Ali Khan', phone: '03001234567', creditLimit: 100000 })).data;
        const r = await h.post('/api/pos/sales', { mode: 'CREDIT', customerId: cust.id, items: [{ productId: soap, qty: 5 }], payments: [{ method: 'CASH', amount: 20000 }] });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.due, 40000);
        assert.equal(r.data.status, 'DUE');
        const found = (await h.get('/api/pos/customers?q=Ali')).data[0];
        assert.equal(found.balance, 40000);
        const over = await h.post('/api/pos/sales', { mode: 'CREDIT', customerId: cust.id, items: [{ productId: soap, qty: 10 }], payments: [] });
        assert.equal(over.status, 400);
        assert.equal(over.data.code, 'CREDIT_LIMIT');
        const forced = await h.post('/api/pos/sales', { mode: 'CREDIT', customerId: cust.id, overrideLimit: true, items: [{ productId: soap, qty: 10 }], payments: [] });
        assert.equal(forced.status, 200, 'the owner may go over the limit');
    });

    await t.test('wholesale price, bill discount and tax add up exactly', async () => {
        const { prisma } = require('../src/db');
        await prisma.tax.create({ data: { tenantId: h.tenantId, name: 'GST', rate: 17 } });
        const r = await h.post('/api/pos/sales', { priceMode: 'WHOLESALE', items: [{ productId: soap, qty: 3 }], discountType: 'PERCENT', discountValue: 10, payments: [{ method: 'CARD', amount: 31590 }] });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.subtotal, 30000);
        assert.equal(r.data.discount, 3000);
        assert.equal(r.data.tax, 4590);
        assert.equal(r.data.total, 31590);
        assert.equal(r.data.payments[0].method, 'CARD');
        await prisma.tax.updateMany({ where: { tenantId: h.tenantId }, data: { active: false } });
    });

    await t.test('change cannot be given on a card payment', async () => {
        const r = await h.post('/api/pos/sales', { items: [{ productId: soap, qty: 1 }], payments: [{ method: 'CARD', amount: 20000 }] });
        assert.equal(r.status, 400);
    });

    await t.test('split payment and a resend of the same cart make one sale', async () => {
        const clientId = crypto.randomUUID();
        const body = { clientId, items: [{ productId: soap, qty: 2 }], payments: [{ method: 'CASH', amount: 10000 }, { method: 'BANK', amount: 14000 }] };
        const a = await h.post('/api/pos/sales', body);
        const b = await h.post('/api/pos/sales', body);
        assert.equal(a.status, 200, JSON.stringify(a.data));
        assert.equal(a.data.id, clientId);
        assert.equal(b.data.id, a.data.id);
        assert.equal(b.data.duplicate, true);
        assert.equal(a.data.payments.length, 2);
    });

    await t.test('serialized item: the serial must be in stock, then it is sold', async () => {
        const phone = (await h.post('/api/inventory/products', { name: 'Phone', type: 'SERIAL', retailPrice: 3000000, serials: 'IMEI-A\nIMEI-B' })).data.id;
        const none = await h.post('/api/pos/sales', { items: [{ productId: phone, qty: 1 }], payments: [{ method: 'CASH', amount: 3000000 }] });
        assert.equal(none.status, 400);
        const ok = await h.post('/api/pos/sales', { items: [{ productId: phone, qty: 1, serial: 'IMEI-A' }], payments: [{ method: 'CASH', amount: 3000000 }] });
        assert.equal(ok.status, 200, JSON.stringify(ok.data));
        const again = await h.post('/api/pos/sales', { items: [{ productId: phone, qty: 1, serial: 'IMEI-A' }], payments: [{ method: 'CASH', amount: 3000000 }] });
        assert.equal(again.status, 400);
        const left = (await h.get(`/api/inventory/products/${phone}/serials`)).data;
        assert.deepEqual(left.map(s => s.serial), ['IMEI-B']);
    });

    await t.test('held carts: hold, list, resume (removes it)', async () => {
        const r = await h.post('/api/pos/held', { label: 'Table 4', total: 12000, cart: { lines: [{ productId: soap, qty: 1 }] } });
        const list = (await h.get('/api/pos/held')).data;
        assert.equal(list[0].label, 'Table 4');
        assert.equal((await h.del('/api/pos/held/' + r.data.id)).status, 200);
        assert.equal((await h.get('/api/pos/held')).data.length, 0);
    });

    await t.test('partial then full return: refunds add up to the sale, stock back, status follows', async () => {
        const s = (await h.post('/api/pos/sales', { items: [{ productId: soap, qty: 3 }], payments: [{ method: 'CASH', amount: 36000 }] })).data;
        const before = await stockOf(soap);
        const item = s.items[0];
        const a = await h.post('/api/pos/returns', { saleId: s.id, items: [{ saleItemId: item.id, qty: 1, restock: true }], reason: 'defective' });
        assert.equal(a.status, 200, JSON.stringify(a.data));
        assert.equal(a.data.total, 12000);
        assert.equal(await stockOf(soap), before + 1);
        const too = await h.post('/api/pos/returns', { saleId: s.id, items: [{ saleItemId: item.id, qty: 3 }] });
        assert.equal(too.status, 400);
        const b = await h.post('/api/pos/returns', { saleId: s.id, items: [{ saleItemId: item.id, qty: 2, restock: false }] });
        assert.equal(b.data.total, 24000);
        assert.equal(await stockOf(soap), before + 1, 'not restocked');
        const sale = (await h.get('/api/pos/sales/' + s.id)).data;
        assert.equal(sale.status, 'REFUNDED');
        assert.equal(sale.returnedTotal, 36000);
        assert.equal(sale.returns.length, 2);
    });

    await t.test('credit return reduces the customer khata', async () => {
        const s = (await h.post('/api/pos/sales', { mode: 'CREDIT', customerId: cust.id, overrideLimit: true, items: [{ productId: soap, qty: 1 }], payments: [] })).data;
        const before = (await h.get('/api/pos/customers?q=Ali')).data[0].balance;
        await h.post('/api/pos/returns', { saleId: s.id, items: [{ saleItemId: s.items[0].id, qty: 1 }] });
        const after = (await h.get('/api/pos/customers?q=Ali')).data[0].balance;
        assert.equal(before - after, 12000);
    });

    await t.test('lookup by invoice number; list with summary; cashier sees only own sales', async () => {
        const list = (await h.get('/api/pos/sales')).data;
        assert.ok(list.sales.length >= 8);
        const one = await h.get('/api/pos/sales/lookup?code=' + list.sales[0].number.toLowerCase());
        assert.equal(one.status, 200);
        const cashier = await h.user('CASHIER');
        assert.equal((await h.get('/api/pos/sales', cashier)).data.sales.length, 0);
        assert.equal((await h.post('/api/pos/returns', { saleId: list.sales[0].id, items: [] }, cashier)).status, 403);
    });
});
