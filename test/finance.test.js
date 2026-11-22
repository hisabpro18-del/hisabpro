const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');
const Calc = require('../public/js/shared/calc');

test('finance: accounts, transfers, payments, cheques, expenses, capital, taxes', async t => {
    const h = await setup();
    const balances = async () => Object.fromEntries((await h.get('/api/finance/accounts')).data.map(a => [a.name, a.balance]));
    const partyBalance = async id => (await h.get('/api/parties/' + id)).data.balance;
    const cust = (await h.post('/api/parties', { type: 'CUSTOMER', name: 'Ahmed', openingBalance: 50000 })).data;
    const vend = (await h.post('/api/parties', { type: 'VENDOR', name: 'Nestle', openingBalance: 80000 })).data;
    let bank, cash;

    await t.test('every client starts with Cash in Hand; a bank account with an opening balance', async () => {
        const list = (await h.get('/api/finance/accounts')).data;
        cash = list.find(a => a.name === 'Cash in Hand');
        assert.ok(cash && cash.type === 'CASH' && cash.isDefault);
        assert.equal(cash.balance, 0);
        const r = await h.post('/api/finance/accounts', { name: 'HBL Main', type: 'BANK', bankName: 'HBL', accountNo: '0123', openingBalance: 100000 });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        bank = r.data;
        assert.equal((await balances())['HBL Main'], 100000);
        assert.equal((await h.post('/api/finance/accounts', { name: 'hbl main', type: 'BANK' })).status, 400, 'names are unique');
        const led = (await h.get(`/api/finance/accounts/${bank.id}/ledger`)).data;
        assert.equal(led.rows[0].type, 'OPENING');
        assert.equal(led.account.balance, 100000);
    });

    await t.test('transfer funds: contra entries with one refId, liquidity unchanged', async () => {
        assert.equal((await h.post('/api/finance/transfers', { fromId: bank.id, toId: bank.id, amount: 100 })).status, 400);
        assert.equal((await h.post('/api/finance/transfers', { fromId: bank.id, toId: cash.id, amount: 100001 })).status, 400, 'not more than the source holds');
        const r = await h.post('/api/finance/transfers', { fromId: bank.id, toId: cash.id, amount: 30000, note: 'Petty cash' });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        const b = await balances();
        assert.equal(b['HBL Main'], 70000);
        assert.equal(b['Cash in Hand'], 30000);
        const led = (await h.get('/api/finance/ledger')).data.filter(x => x.refId === r.data.refId);
        assert.deepEqual(led.map(x => x.type).sort(), ['TRANSFER_IN', 'TRANSFER_OUT']);
        assert.equal(led.reduce((s, x) => s + x.amount, 0), 0);
        const cashLed = (await h.get(`/api/finance/accounts/${cash.id}/ledger`)).data;
        assert.equal(cashLed.rows[0].balance, 30000);
    });

    let payIn;
    await t.test('payment in from a customer lowers the receivable and adds to cash', async () => {
        const r = await h.post('/api/finance/payments', { direction: 'IN', partyId: cust.id, amount: 20000, method: 'CASH', reference: 'Slip 4', note: 'Part payment' });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        payIn = r.data;
        assert.match(payIn.number, /^REC-/);
        assert.equal(await partyBalance(cust.id), 30000);
        assert.equal((await balances())['Cash in Hand'], 50000);
    });

    let payOut;
    await t.test('payment out to a vendor lowers the payable and takes from the bank', async () => {
        const r = await h.post('/api/finance/payments', { direction: 'OUT', partyId: vend.id, amount: 30000, method: 'BANK', accountId: bank.id });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        payOut = r.data;
        assert.match(payOut.number, /^PAY-/);
        assert.equal(await partyBalance(vend.id), 50000);
        assert.equal((await balances())['HBL Main'], 40000);
        const other = await h.post('/api/finance/payments', { direction: 'IN', amount: 5000, method: 'CASH', note: 'Scrap sold' });
        assert.equal(other.status, 200, 'no party = other income');
        assert.equal((await balances())['Cash in Hand'], 55000);
        const list = (await h.get('/api/finance/payments')).data;
        assert.equal(list.length, 3);
        assert.equal(list.find(p => p.id === payIn.id).partyType, 'CUSTOMER');
        assert.equal(list.find(p => p.id === payOut.id).accountName, 'HBL Main');
        assert.equal((await h.post('/api/finance/payments', { direction: 'IN', amount: 0 })).status, 400);
        assert.equal((await h.post('/api/finance/payments', { direction: 'SIDEWAYS', amount: 10 })).status, 400);
    });

    await t.test('deleting a payment reverses its khata and account entries', async () => {
        const r = await h.del('/api/finance/payments/' + payIn.id);
        assert.equal(r.status, 200);
        assert.equal(await partyBalance(cust.id), 50000);
        assert.equal((await balances())['Cash in Hand'], 35000);
        assert.ok(!(await h.get('/api/finance/payments')).data.find(p => p.id === payIn.id));
        assert.ok(!(await h.get(`/api/parties/${cust.id}/ledger`)).data.entries.find(e => e.refId === payIn.id));
        assert.equal((await h.del('/api/finance/payments/' + payIn.id)).status, 404);
        await h.del('/api/finance/payments/' + payOut.id);
        assert.equal(await partyBalance(vend.id), 80000);
        assert.equal((await balances())['HBL Main'], 70000);
    });

    await t.test('cheques: pending moves nothing; clearing moves money and the khata; bounce and cancel only from pending', async () => {
        const inc = await h.post('/api/finance/cheques', { type: 'RECEIVED', partyId: cust.id, chequeNo: '004521', bankName: 'MCB', amount: 10000, dueDate: '2026-12-05' });
        assert.equal(inc.status, 200, JSON.stringify(inc.data));
        assert.equal(await partyBalance(cust.id), 50000);
        assert.equal((await h.post('/api/finance/cheques', { type: 'RECEIVED', partyId: vend.id, chequeNo: '1', amount: 1, dueDate: '2026-12-05' })).status, 400, 'incoming comes from a customer');
        let c = (await h.get('/api/finance/cheques')).data;
        assert.equal(c.kpis.pending, 10000);
        assert.deepEqual(c.upcoming, [{ month: '2026-12', amount: 10000 }]);
        const cl = await h.post(`/api/finance/cheques/${inc.data.id}/clear`, { accountId: bank.id });
        assert.equal(cl.status, 200, JSON.stringify(cl.data));
        assert.equal(await partyBalance(cust.id), 40000);
        assert.equal((await balances())['HBL Main'], 80000);
        assert.equal((await h.post(`/api/finance/cheques/${inc.data.id}/clear`, { accountId: bank.id })).status, 400, 'cannot clear twice');
        assert.equal((await h.post(`/api/finance/cheques/${inc.data.id}/bounce`)).status, 400);
        assert.equal((await h.del('/api/finance/cheques/' + inc.data.id)).status, 400, 'a cleared cheque stays');

        const out = (await h.post('/api/finance/cheques', { type: 'ISSUED', partyId: vend.id, chequeNo: '900', amount: 25000, dueDate: '2026-11-01' })).data;
        assert.equal((await h.post(`/api/finance/cheques/${out.id}/bounce`, { note: 'Insufficient funds' })).status, 200);
        assert.equal(await partyBalance(vend.id), 80000, 'a bounced cheque moves nothing');
        assert.equal((await h.post(`/api/finance/cheques/${out.id}/clear`, { accountId: bank.id })).status, 400);

        const out2 = (await h.post('/api/finance/cheques', { type: 'ISSUED', partyId: vend.id, chequeNo: '901', amount: 15000, dueDate: '2026-11-02' })).data;
        const cl2 = await h.post(`/api/finance/cheques/${out2.id}/clear`, { accountId: bank.id });
        assert.equal(cl2.status, 200);
        assert.equal(await partyBalance(vend.id), 65000);
        assert.equal((await balances())['HBL Main'], 65000);

        const out3 = (await h.post('/api/finance/cheques', { type: 'ISSUED', partyId: vend.id, chequeNo: '902', amount: 1000, dueDate: '2026-11-03' })).data;
        assert.equal((await h.post(`/api/finance/cheques/${out3.id}/cancel`)).status, 200);
        c = (await h.get('/api/finance/cheques')).data;
        assert.equal(c.kpis.pending, 0);
        assert.equal(c.kpis.bouncedCount, 1);
        assert.equal(c.kpis.bounced, 25000);
        assert.equal(c.kpis.clearedThisMonth, 25000);
        assert.equal(c.distribution.CLEARED.count, 2);
        assert.equal(c.distribution.CANCELLED.count, 1);
        const st = (await h.get(`/api/parties/${vend.id}/ledger`)).data;
        assert.equal(st.entries.find(e => e.type === 'CHEQUE').debit, 15000);
    });

    await t.test('expenses: categories, auto voucher numbers, account goes down, summary, delete restores', async () => {
        const cats = (await h.get('/api/finance/expense-categories')).data;
        assert.equal(cats.length, 8);
        const rent = cats.find(c => c.name === 'Rent');
        const cat = await h.post('/api/finance/expense-categories', { name: 'Generator Fuel' });
        assert.equal(cat.status, 200);
        assert.equal((await h.post('/api/finance/expense-categories', { name: 'generator fuel' })).status, 400);
        const before = (await balances())['Cash in Hand'];
        const e1 = await h.post('/api/finance/expenses', { categoryId: rent.id, amount: 5000, accountId: cash.id, note: 'November rent' });
        assert.equal(e1.status, 200, JSON.stringify(e1.data));
        assert.match(e1.data.reference, /^EXP-0001$/);
        const e2 = await h.post('/api/finance/expenses', { categoryId: cat.data.id, amount: 2500, method: 'CASH', reference: 'RCPT-77' });
        assert.equal(e2.data.reference, 'RCPT-77');
        await h.post('/api/finance/expenses', { categoryId: rent.id, amount: 1000, accountId: bank.id });
        assert.equal((await balances())['Cash in Hand'], before - 7500);
        const s = (await h.get('/api/finance/expenses?preset=month')).data;
        assert.equal(s.total, 8500);
        assert.equal(s.count, 3);
        assert.deepEqual(s.topCategory, { name: 'Rent', amount: 6000 });
        assert.equal(s.avgDaily, 8500, 'one active day');
        assert.equal(s.byCategory.length, 2);
        assert.equal(s.trend.reduce((a, d) => a + d.amount, 0), 8500);
        assert.equal(s.rows.find(r => r.reference === 'EXP-0001').accountName, 'Cash in Hand');
        assert.equal((await h.del('/api/finance/expenses/' + e1.data.id)).status, 200);
        assert.equal((await balances())['Cash in Hand'], before - 2500);
        assert.equal((await h.get('/api/finance/expenses?preset=month')).data.total, 3500);
        assert.equal((await h.post('/api/finance/expenses', { amount: 0 })).status, 400);
    });

    await t.test('capital: opening setup once (updating replaces it), injection and drawing move the account', async () => {
        const cashBefore = (await balances())['Cash in Hand'];
        const s1 = await h.post('/api/finance/capital/setup', { openingCapital: 20000000, openingCash: 5000000 });
        assert.equal(s1.status, 200, JSON.stringify(s1.data));
        assert.equal((await balances())['Cash in Hand'], cashBefore + 5000000);
        let cap = (await h.get('/api/finance/capital')).data;
        assert.equal(cap.setup.done, true);
        assert.equal(cap.injected, 20000000);
        assert.equal(cap.movements[0].reference, 'SETUP');
        const s2 = await h.post('/api/finance/capital/setup', { openingCapital: 25000000, openingCash: 4000000 });
        assert.equal(s2.status, 200);
        assert.equal((await balances())['Cash in Hand'], cashBefore + 4000000, 'the old opening cash is replaced, not added');
        cap = (await h.get('/api/finance/capital')).data;
        assert.equal(cap.injected, 25000000);
        assert.equal(cap.movements.filter(m => m.type === 'SETUP').length, 1);

        const bankBefore = (await balances())['HBL Main'];
        assert.equal((await h.post('/api/finance/capital', { type: 'INJECTION', amount: 1000000, accountId: bank.id, reference: 'TT-1' })).status, 200);
        assert.equal((await h.post('/api/finance/capital', { type: 'DRAWING', amount: 400000, accountId: bank.id })).status, 200);
        const div = await h.post('/api/finance/capital', { type: 'DIVIDEND', amount: 100000, accountId: bank.id });
        assert.equal(div.status, 200);
        assert.equal((await balances())['HBL Main'], bankBefore + 1000000 - 500000);
        assert.equal((await h.post('/api/finance/capital', { type: 'DRAWING', amount: 999999999, accountId: bank.id })).status, 400, 'cannot draw more than the account holds');
        assert.equal((await h.post('/api/finance/capital', { type: 'INJECTION', amount: 100 })).status, 400, 'account required');
        cap = (await h.get('/api/finance/capital')).data;
        assert.equal(cap.injected, 26000000);
        assert.equal(cap.drawings, 500000);
        assert.equal(cap.retainedEarnings, cap.netProfit - 500000);
        assert.equal(cap.netWorth, 26000000 - 500000 + cap.netProfit);
        assert.ok(cap.trend.length >= 1);
        assert.equal(cap.trend[cap.trend.length - 1].netWorth, cap.netWorth);
        assert.equal((await h.del('/api/finance/capital/' + div.data.id)).status, 200);
        assert.equal((await balances())['HBL Main'], bankBefore + 1000000 - 400000);
        const setupRow = cap.movements.find(m => m.type === 'SETUP');
        assert.equal((await h.del('/api/finance/capital/' + setupRow.id)).status, 400);
    });

    await t.test('taxes: simple taxes add up, combine taxes compound; inactive ones are ignored', async () => {
        const gst = await h.post('/api/finance/taxes', { name: 'GST', rate: 17, combine: false, active: true });
        assert.equal(gst.status, 200, JSON.stringify(gst.data));
        await h.post('/api/finance/taxes', { name: 'Further Tax', rate: 3, combine: false });
        assert.equal((await h.post('/api/finance/taxes', { name: 'gst', rate: 5 })).status, 400);
        assert.equal((await h.post('/api/finance/taxes', { name: '', rate: 5 })).status, 400);
        let list = (await h.get('/api/finance/taxes')).data;
        assert.equal(Calc.effectiveRate(list), 20);
        const duty = (await h.post('/api/finance/taxes', { name: 'Duty', rate: 10, combine: true })).data;
        list = (await h.get('/api/finance/taxes')).data;
        assert.equal(Calc.effectiveRate(list), 32);
        assert.equal((await h.put('/api/finance/taxes/' + duty.id, { active: false })).data.active, false);
        list = (await h.get('/api/finance/taxes')).data;
        assert.equal(Calc.effectiveRate(list), 20);
        assert.equal((await h.del('/api/finance/taxes/' + gst.data.id)).status, 200);
        assert.equal((await h.get('/api/finance/taxes')).data.length, 2);
    });

    await t.test('permissions: a cashier reads taxes and accounts but cannot touch finance', async () => {
        const cashier = await h.user('CASHIER');
        assert.equal((await h.get('/api/finance/taxes', cashier)).status, 200);
        assert.equal((await h.get('/api/finance/accounts', cashier)).status, 200);
        assert.equal((await h.post('/api/finance/taxes', { name: 'X', rate: 1 }, cashier)).status, 403);
        assert.equal((await h.post('/api/finance/payments', { direction: 'IN', amount: 100 }, cashier)).status, 403);
        assert.equal((await h.get('/api/finance/payments', cashier)).status, 403);
        assert.equal((await h.post('/api/finance/expenses', { amount: 100 }, cashier)).status, 403);
        assert.equal((await h.post('/api/finance/transfers', { fromId: bank.id, toId: cash.id, amount: 1 }, cashier)).status, 403);
        const hr = await h.user('MANAGER', ['hrm.manage']);
        assert.equal((await h.get('/api/finance/accounts', hr)).status, 403);
        assert.equal((await h.get('/api/finance/taxes', hr)).status, 200, 'any signed-in user of the client');
        assert.equal((await h.get('/api/finance/taxes', h.adminToken)).status, 403, 'the super admin outside a workspace has no client');
    });

    await t.test('accounts: cannot delete one with money or the last cash account', async () => {
        assert.equal((await h.del('/api/finance/accounts/' + bank.id)).status, 400);
        const empty = (await h.post('/api/finance/accounts', { name: 'JazzCash', type: 'WALLET' })).data;
        assert.equal((await h.del('/api/finance/accounts/' + empty.id)).status, 200);
        const upd = await h.put('/api/finance/accounts/' + bank.id, { name: 'HBL Current', isDefault: true });
        assert.equal(upd.status, 200);
        assert.ok((await h.get('/api/finance/accounts')).data.find(a => a.name === 'HBL Current' && a.isDefault));
    });
});

test('finance: dates checked (no future money, no impossible days), last cash account kept, capital profit from the engine', async t => {
    const h = await setup();
    const cust = (await h.post('/api/parties', { type: 'CUSTOMER', name: 'Bilal' })).data;
    const vend = (await h.post('/api/parties', { type: 'VENDOR', name: 'Shan Foods' })).data;
    const cash = (await h.get('/api/finance/accounts')).data.find(a => a.type === 'CASH');
    const bank = (await h.post('/api/finance/accounts', { name: 'MCB', type: 'BANK', openingBalance: 100000 })).data;
    const future = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

    await t.test('payments, expenses, transfers, capital and cheque clearing cannot be dated after today or on an impossible day', async () => {
        for (const date of [future, '2026-02-30', '2026-00-10', 20261120, ['2026-11-01']]) {
            const label = JSON.stringify(date);
            assert.equal((await h.post('/api/finance/payments', { direction: 'IN', partyId: cust.id, amount: 100, date })).status, 400, 'payment ' + label);
            assert.equal((await h.post('/api/finance/expenses', { amount: 100, date })).status, 400, 'expense ' + label);
            assert.equal((await h.post('/api/finance/transfers', { fromId: bank.id, toId: cash.id, amount: 100, date })).status, 400, 'transfer ' + label);
            assert.equal((await h.post('/api/finance/capital', { type: 'INJECTION', amount: 100, accountId: cash.id, date })).status, 400, 'capital ' + label);
        }
        assert.equal((await h.get('/api/finance/payments')).data.length, 0, 'nothing was written');
        const past = await h.post('/api/finance/expenses', { amount: 700, date: '2026-03-10' });
        assert.equal(past.status, 200, JSON.stringify(past.data));
        assert.equal((await h.get('/api/finance/expenses?from=2026-03-10&to=2026-03-10')).data.total, 700, 'stays on the day picked');
        assert.equal((await h.get('/api/finance/expenses?from=2026-99-99')).status, 400, 'a bad filter date is a 400, not a server error');
        // cheques may be post-dated, but the day must exist; clearing cannot happen tomorrow
        assert.equal((await h.post('/api/finance/cheques', { type: 'ISSUED', partyId: vend.id, amount: 100, chequeNo: '1', dueDate: '2026-02-30' })).status, 400);
        assert.equal((await h.post('/api/finance/cheques', { type: 'ISSUED', partyId: vend.id, amount: 100, chequeNo: '1', dueDate: future, issueDate: 'soon' })).status, 400);
        const ch = await h.post('/api/finance/cheques', { type: 'ISSUED', partyId: vend.id, amount: 100, chequeNo: '2', dueDate: future });
        assert.equal(ch.status, 200, 'a post-dated cheque is fine');
        assert.equal((await h.post(`/api/finance/cheques/${ch.data.id}/clear`, { date: future })).status, 400);
        assert.equal((await h.post(`/api/finance/cheques/${ch.data.id}/clear`, {})).status, 200);
    });

    await t.test('the last active cash account cannot be turned into a bank account or switched off', async () => {
        assert.equal((await h.put('/api/finance/accounts/' + cash.id, { type: 'BANK' })).status, 400);
        assert.equal((await h.put('/api/finance/accounts/' + cash.id, { active: false })).status, 400);
        const till = (await h.post('/api/finance/accounts', { name: 'Till 2', type: 'CASH' })).data;
        assert.equal((await h.put('/api/finance/accounts/' + till.id, { active: false })).status, 200, 'another cash account may be switched off');
        assert.equal((await h.del('/api/finance/accounts/' + cash.id)).status, 400, 'an inactive one does not count as the cash account');
        const list = (await h.get('/api/finance/accounts')).data;
        assert.equal(list.find(a => a.id === cash.id).type, 'CASH');
    });

    await t.test('capital shows the all-time net profit of the profit engine', async () => {
        const cap = (await h.get('/api/finance/capital')).data;
        const pl = await require('../src/services/reports').profitAndLoss(h.tenantId, { from: new Date(0), to: new Date() });
        assert.equal(cap.netProfit, pl.netProfit);
        assert.equal(cap.netProfit, -700, 'the expense of Rs 7');
    });
});

test('finance: deleting a payment, expense or capital row only reverses its own kind of entries', async () => {
    const { prisma } = require('../src/db');
    const h = await setup();
    const p = (await h.post('/api/inventory/products', { name: 'Ghee', retailPrice: 50000, cost: 30000, openingStock: 5 })).data.id;
    const cust = (await h.post('/api/parties', { type: 'CUSTOMER', name: 'Credit Buyer' })).data;
    const sale = (await h.post('/api/pos/sales', { mode: 'CREDIT', customerId: cust.id, items: [{ productId: p, qty: 1 }], payments: [{ method: 'CASH', amount: 20000 }] })).data;
    const cash = (await h.get('/api/finance/accounts')).data.find(a => a.type === 'CASH');
    const before = { khata: (await h.get('/api/parties/' + cust.id)).data.balance, cash: cash.balance };
    assert.equal(before.khata, 30000);
    // a payment / expense / capital row that shares its id with the sale (e.g. from a hand-made backup file)
    await prisma.payment.create({ data: { id: sale.id, tenantId: h.tenantId, number: 'REC-X', direction: 'IN', amount: 1n, method: 'CASH', accountId: cash.id } });
    assert.equal((await h.del('/api/finance/payments/' + sale.id)).status, 200);
    await prisma.expense.create({ data: { id: sale.id, tenantId: h.tenantId, amount: 1n, categoryName: 'X', accountId: cash.id } });
    assert.equal((await h.del('/api/finance/expenses/' + sale.id)).status, 200);
    await prisma.capitalTxn.create({ data: { id: sale.id, tenantId: h.tenantId, type: 'INJECTION', amount: 1n, accountId: cash.id } });
    assert.equal((await h.del('/api/finance/capital/' + sale.id)).status, 200);
    assert.equal((await h.get('/api/parties/' + cust.id)).data.balance, before.khata, 'the sale stays in the khata');
    assert.equal((await h.get('/api/finance/accounts')).data.find(a => a.id === cash.id).balance, before.cash, 'and its cash stays in the drawer');
});
