const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');
const { prisma } = require('../src/db');
const dates = require('../src/lib/dates');

test('khata: receive, promises, reminders, SMS gateway (test mode), automatic reminders, day close', async t => {
    const h = await setup();
    const soap = (await h.post('/api/inventory/products', { name: 'Soap', retailPrice: 10000, wholesalePrice: 9000, cost: 7000, openingStock: 500 })).data.id;
    const cust = (await h.post('/api/pos/customers', { name: 'Kiryana Store A', phone: '0300-1234567', group: 'WHOLESALE' })).data;
    const today = dates.ymd(new Date(), 'Asia/Karachi');

    await t.test('a wholesale customer buys on udhaar; the khata book shows the balance', async () => {
        const s = await h.post('/api/pos/sales', { mode: 'CREDIT', customerId: cust.id, priceMode: 'WHOLESALE', items: [{ productId: soap, qty: 100 }], payments: [{ method: 'CASH', amount: 100000 }] });
        assert.equal(s.status, 200, JSON.stringify(s.data));
        assert.equal(s.data.total, 900000);
        const k = (await h.get('/api/khata/summary')).data;
        const row = k.rows.find(r => r.id === cust.id);
        assert.equal(row.balance, 800000);
        assert.equal(k.kpis.totalReceivable, 800000);
        assert.equal(k.kpis.customersOwing, 1);
    });

    await t.test('last rates: the price this customer paid before', async () => {
        const r = (await h.get(`/api/pos/customers/${cust.id}/last-prices`)).data;
        assert.equal(r.find(x => x.productId === soap).price, 9000);
    });

    let promiseId;
    await t.test('a promise to pay; dates in the past are refused', async () => {
        const bad = await h.post('/api/khata/promises', { partyId: cust.id, amount: 300000, promisedDate: '2020-01-01' });
        assert.equal(bad.status, 400);
        const r = await h.post('/api/khata/promises', { partyId: cust.id, amount: 300000, promisedDate: today, note: 'after market' });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        promiseId = r.data.id;
        const list = (await h.get('/api/khata/promises?view=today')).data;
        assert.equal(list.rows.length, 1);
        assert.equal(list.counts.today, 1);
        assert.equal(list.rows[0].balance, 800000);
    });

    await t.test('WhatsApp reminder is logged and counted on the promise', async () => {
        const r = await h.post('/api/khata/messages/log', { partyId: cust.id, kind: 'PROMISE_REMINDER', to: '03001234567', body: 'محترم …', refId: promiseId });
        assert.equal(r.status, 200);
        const p = (await h.get('/api/khata/promises?view=today')).data.rows[0];
        assert.equal(p.remindCount, 1);
    });

    await t.test('SMS is refused while switched off; test mode logs it; the API key never comes back', async () => {
        const off = await h.post('/api/khata/messages/sms', { partyId: cust.id, kind: 'BALANCE_REMINDER', body: 'test' });
        assert.equal(off.status, 400);
        const put = await h.put('/api/khata/messaging', { smsEnabled: true, provider: 'LOG', apiKey: 'SECRET-123', autoPromise: true, sendHour: 0 });
        assert.equal(put.status, 200, JSON.stringify(put.data));
        assert.equal(put.data.hasApiKey, true);
        assert.ok(!JSON.stringify(put.data).includes('SECRET-123'), 'key not returned');
        const s = await h.post('/api/khata/messages/sms', { partyId: cust.id, kind: 'BALANCE_REMINDER', body: 'Your balance is Rs 8,000' });
        assert.equal(s.data.status, 'LOGGED');
        const bad = await h.post('/api/khata/messages/sms', { to: '042-35761234', kind: 'CUSTOM', body: 'x' });
        assert.equal(bad.status, 400, 'a landline cannot get SMS');
        const cashier = await h.user('CASHIER');
        assert.equal((await h.put('/api/khata/messaging', { smsEnabled: false }, cashier)).status, 403);
        assert.ok(!JSON.stringify((await h.get('/api/khata/messaging', cashier)).data).includes('SECRET-123'));
    });

    await t.test('automatic reminder: the scheduler sends one SMS a day for a promise due today', async () => {
        const { runOnce } = require('../src/services/scheduler');
        await runOnce();
        const logs = await prisma.messageLog.findMany({ where: { tenantId: h.tenantId, kind: 'PROMISE_REMINDER', channel: 'SMS' } });
        assert.equal(logs.length, 1);
        assert.equal(logs[0].status, 'LOGGED');
        assert.match(logs[0].body, /Kiryana Store A/);
        assert.match(logs[0].body, /آج/);
        await runOnce();
        assert.equal(await prisma.messageLog.count({ where: { tenantId: h.tenantId, kind: 'PROMISE_REMINDER', channel: 'SMS' } }), 1, 'not twice the same day');
    });

    await t.test('a payment covering the promise marks it kept; the balance drops', async () => {
        const part = await h.post('/api/khata/receive', { partyId: cust.id, amount: 100000, method: 'CASH' });
        assert.equal(part.status, 200, JSON.stringify(part.data));
        assert.match(part.data.number, /^REC-\d{4}$/);
        assert.equal(part.data.balance, 700000);
        assert.equal((await h.get('/api/khata/promises?view=today')).data.rows[0].paid, 100000);
        const rest = await h.post('/api/khata/receive', { partyId: cust.id, amount: 200000, method: 'BANK' });
        assert.equal(rest.data.balance, 500000);
        const kept = (await h.get('/api/khata/promises?view=kept')).data.rows;
        assert.equal(kept.length, 1);
        const finance = (await h.get('/api/finance/payments?direction=IN')).data;
        assert.equal(finance.length, 2, 'khata payments appear under Finance → Payments');
    });

    await t.test('snooze and broken promises; the customer page shows ledger, promises and messages', async () => {
        const p = (await h.post('/api/khata/promises', { partyId: cust.id, amount: 100000, promisedDate: today })).data;
        const sn = await h.patch('/api/khata/promises/' + p.id, { snoozeDays: 7 });
        assert.equal(sn.data.promisedDate, dates.addDays(today, 7));
        await h.patch('/api/khata/promises/' + p.id, { status: 'BROKEN' });
        const c = (await h.get('/api/khata/customers/' + cust.id)).data;
        assert.equal(c.balance, 500000);
        assert.ok(c.entries.length >= 4);
        assert.equal(c.entries[c.entries.length - 1].balance, 500000);
        assert.equal(c.promises.length, 2);
        assert.ok(c.messages.length >= 2);
    });

    await t.test('a cashier can receive at the counter but not change messaging', async () => {
        const cashier = await h.user('CASHIER');
        const r = await h.post('/api/khata/receive', { partyId: cust.id, amount: 50000 }, cashier);
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.balance, 450000);
    });

    await t.test('day close: expected cash = opening + in − out; counted difference saved', async () => {
        const pv = (await h.get('/api/day-close/preview')).data;
        // cash in today: 100000 (sale) + 100000 (khata cash) + 200000 ("bank", but the shop has no bank account yet, so it is
        // kept in Cash in Hand rather than lost) + 50000 (cashier) = 450000
        assert.equal(pv.cashIn, 450000);
        assert.equal(pv.expected, pv.opening + 450000 - pv.cashOut);
        assert.equal(pv.sales.count, 1);
        assert.equal(pv.sales.credit, 800000);
        const r = await h.post('/api/day-close', { day: pv.day, counted: pv.expected - 10000, note: 'short' });
        assert.equal(r.data.difference, -10000);
        const list = (await h.get('/api/day-close')).data;
        assert.equal(list[0].difference, -10000);
    });
});
