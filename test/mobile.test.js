// Android app support on the server and in shared code: the receipt-printer encoder (ESC/POS raster) and the
// "newest APK" endpoint. (The native side is in mobile/android; see docs/ANDROID.md.)
const test = require('node:test');
const assert = require('node:assert/strict');
const EscPos = require('../public/js/shared/escpos');
const { setup, call } = require('./helpers');

// a width × height RGBA picture, white, with the given pixels black
function picture(width, height, black = []) {
    const px = new Uint8ClampedArray(width * height * 4).fill(255);
    for (const [x, y] of black) { const i = (y * width + x) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
    return px;
}

test('ESC/POS receipt pictures', async t => {
    await t.test('pixels become bits, most significant first, 1 = black; grey near white stays paper', () => {
        const px = picture(16, 2, [[0, 0], [9, 0], [15, 1]]);
        const i = (1 * 16 + 3) * 4; px[i] = px[i + 1] = px[i + 2] = 230; // light grey
        const m = EscPos.toMono(px, 16, 2);
        assert.equal(m.bytesPerRow, 2);
        assert.deepEqual([...m.data], [0b10000000, 0b01000000, 0b00000000, 0b00000001]);
    });

    await t.test('a width that is not a multiple of 8 is padded; transparent counts as white', () => {
        const px = picture(10, 1, [[9, 0]]);
        px[3] = 0; px[0] = px[1] = px[2] = 0; // pixel 0: black but fully transparent
        const m = EscPos.toMono(px, 10, 1);
        assert.equal(m.bytesPerRow, 2);
        assert.deepEqual([...m.data], [0, 0b01000000]);
    });

    await t.test('blank rows at the bottom are trimmed (keeping a small margin)', () => {
        const m = EscPos.toMono(picture(8, 40, [[0, 2]]), 8, 40);
        assert.equal(EscPos.trim(m, 8).height, 11);
        assert.equal(EscPos.trim(EscPos.toMono(picture(8, 4), 8, 4), 0).height, 0);
    });

    await t.test('a job: init, raster bands (GS v 0) with sizes, feed and cut per copy', () => {
        const m = EscPos.toMono(picture(384, 300, [[0, 0], [383, 299]]), 384, 300);
        const bytes = EscPos.job([m, m]);
        assert.deepEqual([...bytes.slice(0, 2)], [0x1b, 0x40]);
        assert.deepEqual([...bytes.slice(2, 10)], [0x1d, 0x76, 0x30, 0x00, 48, 0, 128, 0], 'first band: 48 bytes × 128 rows');
        const bandBytes = 8 * 3 + 48 * 300; // three bands (128 + 128 + 44 rows)
        const perCopy = bandBytes + 3 + 4;  // + ESC d n + GS V 66 0
        assert.equal(bytes.length, 2 + perCopy * 2);
        assert.deepEqual([...bytes.slice(2 + bandBytes, 2 + perCopy)], [0x1b, 0x64, 4, 0x1d, 0x56, 0x42, 0x00]);
        assert.equal(bytes[2 + 8 + 48 * 128 + 6], 128, 'second band header says 128 rows');
        assert.equal(bytes[2 + 2 * (8 + 48 * 128) + 6], 44, 'last band has the remaining 44 rows');
    });

    await t.test('58 / 80 mm widths and base64', () => {
        assert.equal(EscPos.DOTS[58], 384);
        assert.equal(EscPos.DOTS[80], 576);
        assert.equal(EscPos.toBase64(Uint8Array.of(0x1b, 0x40, 0xff)), 'G0D/');
    });
});

test('Android app: newest APK endpoint, scripts served', async () => {
    const h = await setup();
    const r = await call('GET', '/api/mobile/android');
    assert.equal(r.status, 200, 'no login needed');
    assert.deepEqual(Object.keys(r.data).sort(), ['notes', 'url', 'version', 'versionCode']);
    assert.equal(typeof r.data.versionCode, 'number');
    assert.ok(r.data.url === '' || /^https:\/\//.test(r.data.url));
    for (const f of ['/js/shared/escpos.js', '/js/core/native.js']) {
        const res = await fetch(h.base + f);
        assert.equal(res.status, 200, f);
    }
    const index = await (await fetch(h.base + '/')).text();
    assert.match(index, /escpos\.js/);
    assert.match(index, /native\.js/);
});

test('phone app: vendor report — bought, returned, paid in the period, and owed now', async () => {
    const h = await setup();
    const vendor = (await h.post('/api/parties', { type: 'VENDOR', name: 'Gul Traders', phone: '03001112222', openingBalance: 50000 })).data;
    const idle = (await h.post('/api/parties', { type: 'VENDOR', name: 'Never Used' })).data;
    const prod = (await h.post('/api/inventory/products', { name: 'Sugar 1kg', retailPrice: 16000, cost: 14000 })).data;
    const bought = await h.post('/api/purchases', { vendorId: vendor.id, items: [{ productId: prod.id, qty: 10, cost: 14000 }] });
    assert.equal(bought.status, 200, JSON.stringify(bought.data));
    const paid = await h.post('/api/finance/payments', { direction: 'OUT', partyId: vendor.id, amount: 60000, method: 'CASH' });
    assert.equal(paid.status, 200, JSON.stringify(paid.data));
    const item = (await h.get('/api/purchases/' + bought.data.id)).data.items[0];
    const ret = await h.post(`/api/purchases/${bought.data.id}/returns`, { settlement: 'CREDIT', items: [{ purchaseItemId: item.id, qty: 1 }] });
    assert.equal(ret.status, 200, JSON.stringify(ret.data));

    const r = await h.get('/api/reports/vendors?preset=today');
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const v = r.data.vendors.find(x => x.id === vendor.id);
    assert.equal(v.purchased, 140000);
    assert.equal(v.returned, 14000);
    assert.equal(v.paid, 60000);
    assert.equal(v.balance, 50000 + 140000 - 14000 - 60000, 'opening + bought − returned − paid');
    assert.ok(!r.data.vendors.find(x => x.id === idle.id), 'a vendor with no activity and no balance is left out');
    assert.equal(r.data.totals.payable, v.balance);
    assert.equal(r.data.range.preset, 'today');
    // the same figures for this month; a cashier (no reports.view) cannot read it
    assert.equal((await h.get('/api/reports/vendors')).data.vendors.find(x => x.id === vendor.id).balance, v.balance);
    assert.equal((await h.get('/api/reports/vendors', await h.user('CASHIER'))).status, 403);
});

test('phone app: udhaar given, goods received, vendor payment dates', async t => {
    const h = await setup();
    const cust = (await h.post('/api/parties', { type: 'CUSTOMER', name: 'Akram Store', phone: '03001234567' })).data;
    const vend = (await h.post('/api/parties', { type: 'VENDOR', name: 'Faisal Flour Mills', phone: '03007654321' })).data;
    const bal = async id => (await h.get('/api/parties/' + id)).data.balance;
    const day = n => { const d = new Date(Date.now() + n * 86400000); return new Date(d.getTime() + 5 * 3600000).toISOString().slice(0, 10); }; // Pakistan day

    await t.test('udhaar given to a customer raises their khata; a promise date is saved with it', async () => {
        const r = await h.post('/api/khata/entries', { kind: 'UDHAAR', partyId: cust.id, amount: 250000, note: 'goods on credit', dueDate: day(5) });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.match(r.data.number, /^UDH-/);
        assert.equal(r.data.balance, 250000);
        assert.equal(await bal(cust.id), 250000);
        const promises = (await h.get('/api/khata/promises?view=upcoming')).data.rows.filter(p => p.partyId === cust.id);
        assert.equal(promises.length, 1);
        assert.equal(promises[0].amount, 250000);
        const led = (await h.get(`/api/parties/${cust.id}/ledger`)).data;
        assert.equal(led.entries.at(-1).type, 'UDHAAR');
    });

    await t.test('the wrong kind of party, a future date or a past pay-by date is refused', async () => {
        assert.equal((await h.post('/api/khata/entries', { kind: 'UDHAAR', partyId: vend.id, amount: 100 })).status, 404);
        assert.equal((await h.post('/api/khata/entries', { kind: 'BILL', partyId: cust.id, amount: 100 })).status, 404);
        assert.equal((await h.post('/api/khata/entries', { kind: 'BILL', partyId: vend.id, amount: 100, date: day(2) })).status, 400);
        assert.equal((await h.post('/api/khata/entries', { kind: 'BILL', partyId: vend.id, amount: 100, dueDate: day(-2) })).status, 400);
        assert.equal((await h.post('/api/khata/entries', { kind: 'BILL', partyId: vend.id, amount: 0 })).status, 400);
    });

    let bill, due;
    await t.test('goods received from a vendor raise what we owe and set a pay-by date', async () => {
        const r = await h.post('/api/khata/entries', { kind: 'BILL', partyId: vend.id, amount: 50000000, note: 'Bill 77', dueDate: day(3) });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        bill = r.data;
        assert.match(bill.number, /^BIL-/);
        assert.equal(bill.balance, 50000000);
        const dues = (await h.get('/api/khata/dues?view=pending')).data;
        due = dues.rows.find(d => d.partyId === vend.id);
        assert.equal(due.amount, 50000000);
        assert.equal(due.dueDate, day(3));
        assert.equal(due.status, 'PENDING');
        assert.ok(due.daysLeft >= 2 && due.daysLeft <= 3);
        assert.equal((await h.get('/api/khata/dues?view=upcoming')).data.rows.filter(d => d.partyId === vend.id).length, 1);
        assert.equal((await h.get('/api/khata/dues?view=today')).data.rows.filter(d => d.partyId === vend.id).length, 0);
        const k = (await h.get('/api/khata/summary')).data.kpis;
        assert.equal(k.vendorDuePending, 1);
        assert.equal(k.vendorDueWeek, 50000000);
        // the vendor report counts phone bills as purchased
        assert.equal((await h.get('/api/reports/vendors?preset=today')).data.vendors.find(v => v.id === vend.id).purchased, 50000000);
    });

    await t.test('a part payment leaves the due open; paying the rest marks it paid by itself', async () => {
        await h.post('/api/finance/payments', { direction: 'OUT', partyId: vend.id, amount: 20000000, method: 'CASH' });
        assert.equal((await h.get('/api/khata/dues?view=pending')).data.rows.filter(d => d.partyId === vend.id).length, 1);
        await h.post('/api/finance/payments', { direction: 'OUT', partyId: vend.id, amount: 30000000, method: 'CASH' });
        const all = (await h.get('/api/khata/dues?view=all&partyId=' + vend.id)).data.rows;
        assert.equal(all[0].status, 'PAID');
        assert.equal(await bal(vend.id), 0);
    });

    await t.test('a standalone pay-by date can be moved and cancelled; never marked paid by hand; not for a vendor owed nothing', async () => {
        assert.equal(await bal(vend.id), 0);
        assert.equal((await h.post('/api/khata/dues', { partyId: vend.id, amount: 100000, dueDate: day(2) })).status, 400, 'owed nothing: nothing to pay');
        await h.post('/api/khata/entries', { kind: 'BILL', partyId: vend.id, amount: 10000000 });
        const r = await h.post('/api/khata/dues', { partyId: vend.id, amount: 10000000, dueDate: day(1) });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal((await h.patch('/api/khata/dues/' + r.data.id, { dueDate: day(10) })).status, 200);
        const d = (await h.get('/api/khata/dues?view=pending&partyId=' + vend.id)).data.rows[0];
        assert.equal(d.dueDate, day(10));
        assert.equal((await h.patch('/api/khata/dues/' + r.data.id, { dueDate: day(-1) })).status, 400, 'not into the past');
        assert.equal((await h.patch('/api/khata/dues/' + r.data.id, { status: 'PAID' })).status, 400, 'payments clear dues, not a hand mark');
        await h.patch('/api/khata/dues/' + r.data.id, { status: 'CANCELLED' });
        assert.equal((await h.get('/api/khata/dues?view=pending&partyId=' + vend.id)).data.rows.length, 0);
        await h.post('/api/finance/payments', { direction: 'OUT', partyId: vend.id, amount: 10000000, method: 'CASH' }); // back to 0
    });

    await t.test('one payment clears one due — never a second one too (oldest first)', async () => {
        const v2 = (await h.post('/api/parties', { type: 'VENDOR', name: 'Two Bills Co' })).data;
        await h.post('/api/khata/entries', { kind: 'BILL', partyId: v2.id, amount: 100000, dueDate: day(2) });
        await h.post('/api/khata/entries', { kind: 'BILL', partyId: v2.id, amount: 100000, dueDate: day(4) });
        await h.post('/api/finance/payments', { direction: 'OUT', partyId: v2.id, amount: 100000, method: 'CASH' });
        for (let i = 0; i < 3; i++) { // listing again and again must not count the same payment twice
            const rows = (await h.get('/api/khata/dues?view=all&partyId=' + v2.id)).data.rows;
            assert.deepEqual(rows.map(r => r.status).sort(), ['PAID', 'PENDING']);
            assert.equal(rows.find(r => r.status === 'PENDING').dueDate, day(4), 'the older one was paid');
        }
        await h.post('/api/finance/payments', { direction: 'OUT', partyId: v2.id, amount: 100000, method: 'CASH' });
        assert.deepEqual((await h.get('/api/khata/dues?view=all&partyId=' + v2.id)).data.rows.map(r => r.status), ['PAID', 'PAID']);
    });

    await t.test('paying a purchase later clears its due; a payment made at the counter with a purchase does not', async () => {
        const v3 = (await h.post('/api/parties', { type: 'VENDOR', name: 'Purchase Pay Co' })).data;
        const prod = (await h.post('/api/inventory/products', { name: 'Ghee tin', retailPrice: 300000, cost: 250000 })).data;
        const credit = (await h.post('/api/purchases', { vendorId: v3.id, items: [{ productId: prod.id, qty: 2, cost: 250000 }] })).data;
        assert.equal((await h.post('/api/khata/dues', { partyId: v3.id, amount: 500000, dueDate: day(3) })).status, 200);
        // another purchase paid in full at the counter: its payment belongs to it, not to the old due
        const cash = await h.post('/api/purchases', { vendorId: v3.id, items: [{ productId: prod.id, qty: 2, cost: 250000 }], paid: 500000, paymentMethod: 'CASH' });
        assert.equal(cash.status, 200, JSON.stringify(cash.data));
        assert.equal((await h.get('/api/khata/dues?view=pending&partyId=' + v3.id)).data.rows.length, 1);
        // the credit purchase paid later from the purchase screen
        const pay = await h.post(`/api/purchases/${credit.id}/pay`, { amount: 500000, method: 'CASH' });
        assert.equal(pay.status, 200, JSON.stringify(pay.data));
        assert.equal((await h.get('/api/khata/dues?view=pending&partyId=' + v3.id)).data.rows.length, 0);
    });

    await t.test('the home counts settle first and are only for those who manage the khata', async () => {
        const v4 = (await h.post('/api/parties', { type: 'VENDOR', name: 'Count Co' })).data;
        await h.post('/api/khata/entries', { kind: 'BILL', partyId: v4.id, amount: 300000, dueDate: day(0) });
        let k = (await h.get('/api/khata/summary')).data.kpis;
        const before = k.vendorDueToday;
        assert.ok(before >= 1);
        await h.post('/api/finance/payments', { direction: 'OUT', partyId: v4.id, amount: 300000, method: 'CASH' });
        k = (await h.get('/api/khata/summary')).data.kpis; // no /dues call in between
        assert.equal(k.vendorDueToday, before - 1);
        const cashier = await h.user('CASHIER');
        const ck = (await h.get('/api/khata/summary', cashier)).data.kpis;
        assert.equal(ck.vendorDuePending, undefined);
        assert.equal(ck.vendorDueWeek, undefined);
    });

    await t.test('an entry made by mistake can be removed (with its pay-by date); sales and payments cannot', async () => {
        const r = await h.post('/api/khata/entries', { kind: 'BILL', partyId: vend.id, amount: 700000, dueDate: day(2) });
        const before = await bal(vend.id);
        const del = await h.del('/api/khata/entries/' + r.data.id);
        assert.equal(del.status, 200, JSON.stringify(del.data));
        assert.equal(await bal(vend.id), before - 700000);
        assert.equal((await h.get('/api/khata/dues?view=pending&partyId=' + vend.id)).data.rows.length, 0, 'its due is cancelled');
        const pay = (await h.get(`/api/parties/${vend.id}/ledger`)).data.entries.find(e => e.type === 'PAYMENT_OUT');
        assert.equal((await h.del('/api/khata/entries/' + pay.id)).status, 400);
        // removing an udhaar entry also cancels the promise made with it (no reminders for money never owed)
        const u = (await h.post('/api/khata/entries', { kind: 'UDHAAR', partyId: cust.id, amount: 90000, dueDate: day(2) })).data;
        assert.ok((await h.get('/api/khata/promises?view=upcoming')).data.rows.find(p => p.id === u.dueId));
        assert.equal((await h.del('/api/khata/entries/' + u.id)).status, 200);
        assert.ok(!(await h.get('/api/khata/promises?view=upcoming')).data.rows.find(p => p.id === u.dueId), 'its promise is gone');
    });

    await t.test('a cashier cannot add these entries or see vendor dues', async () => {
        const cashier = await h.user('CASHIER');
        assert.equal((await h.post('/api/khata/entries', { kind: 'UDHAAR', partyId: cust.id, amount: 100 }, cashier)).status, 403);
        assert.equal((await h.get('/api/khata/dues', cashier)).status, 403);
    });

    await t.test('vendor dues feed the desktop sync log like other khata tables', async () => {
        const { prisma } = require('../src/db');
        assert.ok(await prisma.changeLog.count({ where: { tenantId: h.tenantId, tbl: 'VendorDue' } }) > 0);
        assert.ok(require('../src/sync/registry').PULLABLE.has('VendorDue'));
    });
});
