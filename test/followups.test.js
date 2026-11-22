// Regression tests for the follow-ups after the code review.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { setup, call } = require('./helpers');

test('follow-ups: return resend, cash refund cap, wholesale alt units, cashier limits, robust sync push', async t => {
    const h = await setup();
    const units = (await h.get('/api/inventory/master/units')).data;
    const ctn = units.find(u => u.shortCode === 'Ctn'), pcs = units.find(u => u.shortCode === 'Pcs');
    const p = (await h.post('/api/inventory/products', { name: 'Soap Ctn', retailPrice: 720000, wholesalePrice: 690000, cost: 650000, baseUnitId: ctn.id, altUnits: [{ unitId: pcs.id, factor: 72, price: 10500 }], openingStock: 10 })).data.id;
    const cust = (await h.post('/api/pos/customers', { name: 'Shop X', phone: '03001231234', group: 'WHOLESALE' })).data;

    await t.test('wholesale: an alternate unit with its own (retail) price sells at wholesale ÷ factor', async () => {
        const retail = (await h.post('/api/pos/sales', { items: [{ productId: p, unitId: pcs.id, qty: 2 }], payments: [{ method: 'CASH', amount: 21000 }] })).data;
        assert.equal(retail.items[0].price, 10500, 'retail uses the unit\'s own price');
        const whole = (await h.post('/api/pos/sales', { priceMode: 'WHOLESALE', items: [{ productId: p, unitId: pcs.id, qty: 72 }], payments: [{ method: 'CASH', amount: 690000 }] })).data;
        assert.equal(whole.total, 690000, '72 pieces at wholesale = one carton at wholesale');
    });

    await t.test('the same return sent twice makes one credit note', async () => {
        const s = (await h.post('/api/pos/sales', { items: [{ productId: p, qty: 1 }], payments: [{ method: 'CASH', amount: 720000 }] })).data;
        const clientId = crypto.randomUUID();
        const body = { clientId, saleId: s.id, items: [{ saleItemId: s.items[0].id, qty: 1 }] };
        const a = await h.post('/api/pos/returns', body), b = await h.post('/api/pos/returns', body);
        assert.equal(a.status, 200, JSON.stringify(a.data));
        assert.equal(b.data.id, a.data.id);
        assert.equal(b.data.duplicate, true);
        assert.equal((await h.get('/api/pos/returns?limit=50')).data.filter(r => r.saleId === s.id).length, 1);
    });

    await t.test('cash refund on an udhaar bill is capped at what was paid', async () => {
        const s = (await h.post('/api/pos/sales', { mode: 'CREDIT', customerId: cust.id, items: [{ productId: p, qty: 1 }], payments: [{ method: 'CASH', amount: 200000 }] })).data;
        const cash = await h.post('/api/pos/returns', { saleId: s.id, refundMethod: 'CASH', items: [{ saleItemId: s.items[0].id, qty: 1 }] });
        assert.equal(cash.status, 400);
        assert.match(cash.data.error, /khata/);
        const credit = await h.post('/api/pos/returns', { saleId: s.id, refundMethod: 'CREDIT', items: [{ saleItemId: s.items[0].id, qty: 1 }] });
        assert.equal(credit.status, 200, JSON.stringify(credit.data));
    });

    await t.test('a cashier sees no cost prices and cannot send SMS (WhatsApp stays)', async () => {
        const cashier = await h.user('CASHIER');
        const cat = (await h.get('/api/inventory/catalog', cashier)).data;
        assert.equal(cat[0].cost, undefined);
        assert.ok((await h.get('/api/inventory/catalog')).data[0].cost !== undefined, 'the owner still sees it');
        assert.equal((await h.post('/api/khata/messages/sms', { partyId: cust.id, kind: 'CUSTOM', body: 'x' }, cashier)).status, 403);
        assert.equal((await h.post('/api/khata/messages/log', { partyId: cust.id, kind: 'BALANCE_REMINDER', to: '03001231234', body: 'x' }, cashier)).status, 200);
    });

    await t.test('one row the database refuses does not block the rest of a PC\'s push', async () => {
        const act = await call('POST', '/api/device/activate', { email: h.email, password: 'Owner@12345', name: 'Push test' });
        assert.equal(act.status, 200, JSON.stringify(act.data));
        const push = rows => fetch(h.base + '/api/sync/push', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Token': act.data.deviceToken }, body: JSON.stringify({ rows }) }).then(r => r.json());
        const now = new Date().toISOString();
        const good = { id: crypto.randomUUID(), tenantId: h.tenantId, name: 'From PC', hex: '#111111', createdAt: now, updatedAt: now };
        const bad = { id: crypto.randomUUID(), tenantId: h.tenantId, name: 'Overflow', retailPrice: 1e30, createdAt: now, updatedAt: now };
        const r = await push([{ tbl: 'Color', row: good }, { tbl: 'Product', row: bad }]);
        assert.equal(r.created, 1, JSON.stringify(r));
        assert.equal(r.rejected.length, 1);
        assert.ok((await h.get('/api/inventory/master/colors')).data.find(c => c.name === 'From PC'), 'the good row arrived');
    });
});
