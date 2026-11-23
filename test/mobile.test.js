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
