// The shop's requests of 2026-11-27: per-line wholesale on the POS, Stock & Price Management (bulk prices and stock with
// history), Product Cost Price List data, payment receipts with the remaining balance, invoice search by mobile number,
// the dashboard's admin password, the shop's WhatsApp number and the bill's customer phone.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');

test('shop requests: wholesale per line, stock & price, payments, search, dashboard unlock', async t => {
    const h = await setup();
    const units = (await h.get('/api/inventory/master/units')).data;
    const ctn = units.find(u => u.shortCode === 'Ctn'), pcs = units.find(u => u.shortCode === 'Pcs');
    const surf = (await h.post('/api/inventory/products', { name: 'Excel Surf 200g', retailPrice: 120000, wholesalePrice: 108000, cost: 100000, baseUnitId: ctn.id, altUnits: [{ unitId: pcs.id, factor: 36 }], openingStock: 10 })).data.id;
    const soap = (await h.post('/api/inventory/products', { name: 'Soap', retailPrice: 12000, wholesalePrice: 10000, cost: 8000, openingStock: 50 })).data.id;
    const salt = (await h.post('/api/inventory/products', { name: 'Salt', retailPrice: 5000, cost: 4000, openingStock: 20 })).data.id; // no wholesale price
    const customer = (await h.post('/api/parties', { type: 'CUSTOMER', name: 'Bilal Store', phone: '0300-7654321' })).data;
    const vendor = (await h.post('/api/parties', { type: 'VENDOR', name: 'Lever Distributor', phone: '03011112222' })).data;

    await t.test('POS: each line has its own price — wholesale on one line, retail on another, in one bill', async () => {
        const r = await h.post('/api/pos/sales', { priceMode: 'RETAIL', items: [{ productId: soap, qty: 2, priceMode: 'WHOLESALE' }, { productId: soap, qty: 1 }, { productId: surf, unitId: pcs.id, qty: 36, priceMode: 'WHOLESALE' }, { productId: salt, qty: 1, priceMode: 'WHOLESALE' }], payments: [{ method: 'CASH', amount: 1000000 }] });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        const [w, rt, ctnLine, s] = r.data.items;
        assert.equal(w.price, 10000); // wholesale
        assert.equal(rt.price, 12000); // the bill's mode (retail)
        assert.equal(ctnLine.total, 108000); // 36 pieces at the wholesale carton price ÷ 36
        assert.equal(s.price, 5000); // no wholesale price saved: retail
        assert.equal(r.data.total, 20000 + 12000 + 108000 + 5000);
    });

    await t.test('POS: a bill in wholesale mode prices lines that say nothing at wholesale', async () => {
        const r = await h.post('/api/pos/sales', { priceMode: 'WHOLESALE', items: [{ productId: soap, qty: 1 }, { productId: soap, qty: 1, priceMode: 'RETAIL' }], payments: [{ method: 'CASH', amount: 22000 }] });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.deepEqual(r.data.items.map(i => i.price), [10000, 12000]);
    });

    await t.test('Stock & Price: list with stock, three prices and suppliers', async () => {
        const r = await h.get('/api/inventory/stock-price');
        assert.equal(r.status, 200, JSON.stringify(r.data));
        const p = r.data.products.find(x => x.id === salt);
        assert.equal(p.stock, 19);
        assert.equal(p.wholesalePrice, null);
        assert.equal(p.cost, 4000);
        assert.ok(r.data.vendors.some(v => v.id === vendor.id));
        assert.equal(r.data.canEdit, true);
    });

    await t.test('Stock & Price: bulk save changes only the fields sent and keeps a history', async () => {
        const r = await h.post('/api/inventory/stock-price/save', { reason: 'PURCHASE', note: 'rate list', changes: [
            { productId: soap, retailPrice: 13000, wholesalePrice: 11000 },
            { productId: salt, wholesalePrice: 4500, stock: { op: 'ADD', qty: 5 } },
            { productId: surf, cost: 102000, stock: { op: 'SET', qty: 12 } },
        ] });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.updated, 3);
        const list = (await h.get('/api/inventory/stock-price')).data.products;
        const s = list.find(x => x.id === soap), sa = list.find(x => x.id === salt), su = list.find(x => x.id === surf);
        assert.deepEqual([s.retailPrice, s.wholesalePrice, s.cost], [13000, 11000, 8000]); // cost untouched
        assert.deepEqual([sa.wholesalePrice, sa.stock, sa.retailPrice], [4500, 24, 5000]);
        assert.deepEqual([su.cost, su.stock], [102000, 12]);
        // the POS sells at the new price at once
        const sale = await h.post('/api/pos/sales', { items: [{ productId: soap, qty: 1 }], payments: [{ method: 'CASH', amount: 13000 }] });
        assert.equal(sale.data.items[0].price, 13000);
        const hist = (await h.get('/api/inventory/stock-price/history')).data;
        const stockRow = hist.find(x => x.productId === salt && x.field === 'STOCK');
        assert.deepEqual([stockRow.oldQty, stockRow.newQty, stockRow.reason, stockRow.note], [19, 24, 'PURCHASE', 'rate list']);
        const soapRetail = hist.find(x => x.productId === soap && x.field === 'RETAIL');
        assert.deepEqual([soapRetail.oldPrice, soapRetail.newPrice], [12000, 13000]);
        assert.equal(hist.filter(x => x.productId === soap && x.field === 'COST').length, 0);
        assert.ok(stockRow.userName);
        // only that product's rows
        const one = (await h.get('/api/inventory/stock-price/history?productId=' + surf)).data;
        assert.ok(one.length >= 2 && one.every(x => x.productId === surf));
    });

    await t.test('Stock & Price: wholesale can be removed; decrease below zero is allowed; nothing changed is not logged', async () => {
        const before = (await h.get('/api/inventory/stock-price/history')).data.length;
        const r = await h.post('/api/inventory/stock-price/save', { reason: 'DAMAGED', changes: [{ productId: salt, wholesalePrice: null, stock: { op: 'REMOVE', qty: 30 } }, { productId: soap, retailPrice: 13000 }] });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.updated, 1);
        const sa = (await h.get('/api/inventory/stock-price')).data.products.find(x => x.id === salt);
        assert.deepEqual([sa.wholesalePrice, sa.stock], [null, -6]);
        assert.equal((await h.get('/api/inventory/stock-price/history')).data.length, before + 2);
    });

    await t.test('Stock & Price: bad input and permissions', async () => {
        assert.equal((await h.post('/api/inventory/stock-price/save', { changes: [] })).status, 400);
        assert.equal((await h.post('/api/inventory/stock-price/save', { changes: [{ productId: soap, retailPrice: -5 }] })).status, 400);
        assert.equal((await h.post('/api/inventory/stock-price/save', { changes: [{ productId: soap, stock: { op: 'GROW', qty: 1 } }] })).status, 400);
        const svc = (await h.post('/api/inventory/products', { name: 'Delivery', type: 'SERVICE', retailPrice: 10000 })).data.id;
        assert.equal((await h.post('/api/inventory/stock-price/save', { changes: [{ productId: svc, stock: { op: 'ADD', qty: 1 } }] })).status, 400);
        const cashier = await h.user('CASHIER', ['sales.create']);
        assert.equal((await h.get('/api/inventory/stock-price', cashier)).status, 403); // cashiers never see cost prices
        assert.equal((await h.post('/api/inventory/stock-price/save', { changes: [{ productId: soap, retailPrice: 1 }] }, cashier)).status, 403);
        const viewer = await h.user('MANAGER', ['reports.view']);
        const v = await h.get('/api/inventory/stock-price', viewer);
        assert.equal(v.status, 200);
        assert.equal(v.data.canEdit, false);
        assert.equal((await h.post('/api/inventory/stock-price/save', { changes: [{ productId: soap, retailPrice: 1 }] }, viewer)).status, 403);
    });

    await t.test('a product edited in its drawer and a stock adjustment are in the history too', async () => {
        const cur = (await h.get('/api/inventory/products/' + salt)).data;
        assert.equal((await h.put('/api/inventory/products/' + salt, { ...cur, retailPrice: 5500 })).status, 200);
        assert.equal((await h.post(`/api/inventory/products/${salt}/adjust`, { mode: 'SET', qty: 10, note: 'counted' })).status, 200);
        const hist = (await h.get('/api/inventory/stock-price/history?productId=' + salt)).data;
        assert.ok(hist.some(x => x.field === 'RETAIL' && x.oldPrice === 5000 && x.newPrice === 5500));
        assert.ok(hist.some(x => x.field === 'STOCK' && x.oldQty === -6 && x.newQty === 10 && x.note === 'counted'));
    });

    await t.test('supplier filter: the products bought from a vendor', async () => {
        const p = await h.post('/api/purchases', { vendorId: vendor.id, items: [{ productId: soap, qty: 10, cost: 8000 }], paid: 0 });
        assert.equal(p.status, 200, JSON.stringify(p.data));
        assert.deepEqual((await h.get('/api/inventory/stock-price/supplier/' + vendor.id)).data, [soap]);
    });

    await t.test('payments: the receipt gets the balance before and after (customer and vendor)', async () => {
        await h.post('/api/pos/sales', { mode: 'CREDIT', customerId: customer.id, items: [{ productId: soap, qty: 10 }], payments: [] });
        const inn = await h.post('/api/finance/payments', { direction: 'IN', partyId: customer.id, amount: 50000, method: 'CASH' });
        assert.equal(inn.status, 200, JSON.stringify(inn.data));
        assert.deepEqual([inn.data.balanceBefore, inn.data.balance, inn.data.partyType, inn.data.partyPhone], [130000, 80000, 'CUSTOMER', '0300-7654321']);
        const out = await h.post('/api/finance/payments', { direction: 'OUT', partyId: vendor.id, amount: 30000, method: 'CASH' });
        assert.deepEqual([out.data.balanceBefore, out.data.balance], [80000, 50000]);
        const again = await h.get('/api/finance/payments/' + inn.data.id);
        assert.deepEqual([again.data.balanceBefore, again.data.balance, again.data.amount], [130000, 80000, 50000]);
        const other = await h.post('/api/finance/payments', { direction: 'IN', amount: 1000, method: 'CASH' });
        assert.equal(other.data.balance, null);
    });

    await t.test('sales search: by part of the customer mobile, with the phone in the list and on the bill', async () => {
        for (const q of ['7654321', '03007654321', '0300-765']) {
            const r = await h.get('/api/pos/sales?q=' + encodeURIComponent(q));
            assert.ok(r.data.sales.length >= 1 && r.data.sales.every(s => s.customerId === customer.id), q);
            assert.equal(r.data.sales[0].customerPhone, '0300-7654321');
        }
        const one = (await h.get('/api/pos/sales?q=Bilal')).data.sales[0];
        const full = await h.get('/api/pos/sales/' + one.id);
        assert.equal(full.data.customerPhone, '0300-7654321');
    });

    await t.test('dashboard Show Details: an owner password opens it; a wrong one is a 400 (not a sign-out)', async () => {
        const manager = await h.user('MANAGER', ['reports.view']);
        assert.equal((await h.post('/api/auth/unlock', { password: 'User@12345' }, manager)).status, 400); // the manager's own password is not the admin's
        assert.equal((await h.post('/api/auth/unlock', { password: 'Owner@12345' }, manager)).status, 200);
        assert.equal((await h.post('/api/auth/unlock', {})).status, 400);
        for (let i = 0; i < 5; i++) await h.post('/api/auth/unlock', { password: 'nope' }, manager);
        const locked = await h.post('/api/auth/unlock', { password: 'Owner@12345' }, manager);
        assert.equal(locked.status, 400);
        assert.match(locked.data.error || JSON.stringify(locked.data), /Too many/);
    });

    await t.test('settings: the shop WhatsApp number is saved and checked; receipt toggles exist', async () => {
        assert.equal((await h.put('/api/settings/company', { whatsapp: '0300-1234567' })).status, 200);
        assert.equal((await h.put('/api/settings/company', { whatsapp: '12' })).status, 400);
        const s = (await h.get('/api/settings')).data;
        assert.equal(s.company.whatsapp, '0300-1234567');
        assert.equal(s.receipt.showBarcode, false);
        assert.equal(s.receipt.showWhatsappQr, true);
        assert.equal((await h.put('/api/settings/receipt', { showBarcode: true })).data.showBarcode, true);
        assert.match(s.messaging ? '' : (await h.get('/api/khata/messaging')).data.billEn, /\{items\}/);
    });
});
