const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');

test('parties: customers, vendors, opening balances, statements, credit limits, POS access', async t => {
    const h = await setup();

    let cust, vend;
    await t.test('customer with opening receivable over its credit limit counts as over-limit', async () => {
        const r = await h.post('/api/parties', { type: 'CUSTOMER', name: 'Ahmed Khan', phone: '0300-1234567', email: 'ahmed@example.com', group: 'WHOLESALE', openingBalance: 50000, creditLimit: 30000, taxId: 'NTN-1', notes: 'Deliver after 5pm', address: 'Main Bazar', city: 'Lahore' });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        cust = r.data;
        assert.equal(cust.balance, 50000);
        assert.equal(cust.overLimit, true);
        const unlimited = (await h.post('/api/parties', { type: 'CUSTOMER', name: 'Bilal', openingBalance: 999999, creditLimit: 0 })).data;
        assert.equal(unlimited.overLimit, false, 'limit 0 = unlimited');
        await h.post('/api/parties', { type: 'CUSTOMER', name: 'Cash Only' });
        const s = (await h.get('/api/parties/stats?type=CUSTOMER')).data;
        assert.deepEqual(s, { total: 3, receivables: 50000 + 999999, overLimit: 1 });
        const one = (await h.get('/api/parties/' + cust.id)).data;
        assert.equal(one.openingBalance, 50000);
        assert.equal(one.group, 'WHOLESALE');
        assert.equal(one.city, 'Lahore');
    });

    await t.test('names are unique per type (case ignored); a vendor may share a customer name', async () => {
        const dupe = await h.post('/api/parties', { type: 'CUSTOMER', name: 'ahmed khan' });
        assert.equal(dupe.status, 400);
        assert.match(dupe.data.error, /already exists/);
        const asVendor = await h.post('/api/parties', { type: 'VENDOR', name: 'Ahmed Khan' });
        assert.equal(asVendor.status, 200);
        assert.equal((await h.post('/api/parties', { type: 'CUSTOMER', name: 'x', email: 'bad' })).status, 400);
        assert.equal((await h.post('/api/parties', { type: 'CUSTOMER', name: 'y', group: 'GOLD' })).status, 400);
    });

    await t.test('vendor with opening payable; payables and recent inwards KPIs', async () => {
        const r = await h.post('/api/parties', { type: 'VENDOR', name: 'Nestle Pakistan', contactPerson: 'Imran', phone: '042-111', openingBalance: 100000, paymentTerms: 'NET_45', bankDetails: 'HBL PK00HABB0000', notes: 'Call before delivery' });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        vend = r.data;
        assert.equal(vend.balance, 100000);
        assert.equal(vend.paymentTerms, 'NET_45');
        const s = (await h.get('/api/parties/stats?type=VENDOR')).data;
        assert.equal(s.total, 2);
        assert.equal(s.payables, 100000);
        assert.equal(s.recentInwards, 2);
        assert.equal((await h.post('/api/parties', { type: 'VENDOR', name: 'Bad terms', paymentTerms: 'NET_99' })).status, 400);
        const list = (await h.get('/api/parties?type=VENDOR')).data;
        assert.deepEqual(list.map(v => v.name), ['Ahmed Khan', 'Nestle Pakistan']);
    });

    await t.test('statement keeps a running balance (customer: debit − credit, vendor: credit − debit)', async () => {
        assert.equal((await h.post('/api/finance/payments', { direction: 'IN', partyId: cust.id, amount: 20000, method: 'CASH' })).status, 200);
        const st = (await h.get(`/api/parties/${cust.id}/ledger`)).data;
        assert.equal(st.entries.length, 2);
        assert.equal(st.entries[0].type, 'OPENING');
        assert.equal(st.entries[0].debit, 50000);
        assert.equal(st.entries[0].balance, 50000);
        assert.equal(st.entries[1].type, 'PAYMENT_IN');
        assert.equal(st.entries[1].credit, 20000);
        assert.equal(st.entries[1].balance, 30000);
        assert.equal(st.balance, 30000);
        assert.deepEqual(st.totals, { debit: 50000, credit: 20000 });
        assert.equal(st.party.overLimit, false, 'now under the limit');

        assert.equal((await h.post('/api/finance/payments', { direction: 'OUT', partyId: vend.id, amount: 40000, method: 'CASH' })).status, 200);
        const vs = (await h.get(`/api/parties/${vend.id}/ledger`)).data;
        assert.deepEqual(vs.entries.map(e => e.balance), [100000, 60000]);
    });

    await t.test('editing the opening balance replaces the opening entry', async () => {
        const r = await h.put('/api/parties/' + cust.id, { name: 'Ahmed Khan', phone: '0321', openingBalance: 70000 });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.balance, 50000);
        assert.equal(r.data.phone, '0321');
        assert.equal(r.data.creditLimit, 30000, 'fields not sent are kept');
        const st = (await h.get(`/api/parties/${cust.id}/ledger`)).data;
        assert.equal(st.entries.filter(e => e.type === 'OPENING').length, 1);
        const rename = await h.put('/api/parties/' + cust.id, { name: 'BILAL' });
        assert.equal(rename.status, 400, 'cannot rename onto another customer');
    });

    await t.test('delete is refused while a balance is open, allowed at zero (soft delete)', async () => {
        const no = await h.del('/api/parties/' + cust.id);
        assert.equal(no.status, 400);
        assert.match(no.data.error, /balance/);
        await h.post('/api/finance/payments', { direction: 'IN', partyId: cust.id, amount: 50000, method: 'CASH' });
        const ok = await h.del('/api/parties/' + cust.id);
        assert.equal(ok.status, 200, JSON.stringify(ok.data));
        assert.ok(!(await h.get('/api/parties?type=CUSTOMER')).data.find(p => p.id === cust.id));
        assert.equal((await h.get('/api/parties/' + cust.id)).status, 404);
        const again = await h.post('/api/parties', { type: 'CUSTOMER', name: 'Ahmed Khan' });
        assert.equal(again.status, 200, 'the name is free again');
    });

    await t.test('a cashier can search and quick-add customers (no balances), but nothing else', async () => {
        const cashier = await h.user('CASHIER', ['sales.create']);
        const s = await h.get('/api/parties?type=CUSTOMER&q=bil', cashier);
        assert.equal(s.status, 200);
        assert.equal(s.data.length, 1);
        for (const k of ['id', 'type', 'name', 'phone', 'group', 'creditLimit', 'balance', 'notes']) assert.ok(k in s.data[0], k);
        assert.equal(s.data[0].balance, 999999);
        const add = await h.post('/api/parties', { type: 'CUSTOMER', name: 'Quick Add', phone: '0333', openingBalance: 5000, creditLimit: 100 }, cashier);
        assert.equal(add.status, 200, JSON.stringify(add.data));
        assert.equal(add.data.balance, 0, 'a cashier cannot set an opening balance');
        assert.equal(add.data.creditLimit, 0);
        assert.equal((await h.get('/api/parties/' + add.data.id, cashier)).status, 200);
        assert.equal((await h.get('/api/parties?type=VENDOR', cashier)).status, 403);
        assert.equal((await h.get('/api/parties', cashier)).status, 403);
        assert.equal((await h.post('/api/parties', { type: 'VENDOR', name: 'V' }, cashier)).status, 403);
        assert.equal((await h.put('/api/parties/' + add.data.id, { name: 'Z' }, cashier)).status, 403);
        assert.equal((await h.del('/api/parties/' + add.data.id, cashier)).status, 403);
        assert.equal((await h.get(`/api/parties/${add.data.id}/ledger`, cashier)).status, 403);
        assert.equal((await h.get('/api/parties/' + vend.id, cashier)).status, 403);
        const nobody = await h.user('MANAGER', ['hrm.manage']);
        assert.equal((await h.get('/api/parties?type=CUSTOMER', nobody)).status, 403);
    });
});

test('parties: a party with a pending cheque cannot be deleted (its clearing would post to a hidden khata)', async () => {
    const h = await setup();
    const vend = (await h.post('/api/parties', { type: 'VENDOR', name: 'Cheque Vendor' })).data;
    const ch = await h.post('/api/finance/cheques', { type: 'ISSUED', partyId: vend.id, amount: 5000, chequeNo: '991', dueDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) });
    assert.equal(ch.status, 200, JSON.stringify(ch.data));
    const no = await h.del('/api/parties/' + vend.id);
    assert.equal(no.status, 400);
    assert.match(no.data.error, /pending cheque/);
    assert.equal((await h.post(`/api/finance/cheques/${ch.data.id}/cancel`, {})).status, 200);
    assert.equal((await h.del('/api/parties/' + vend.id)).status, 200, 'allowed once the cheque is settled');
});
