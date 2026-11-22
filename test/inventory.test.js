const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');

test('inventory: master data, products, units, variants, stock adjustments, codes, import', async t => {
    const h = await setup();

    await t.test('new client starts with default units, colours and sizes', async () => {
        const units = await h.get('/api/inventory/master/units');
        assert.equal(units.status, 200);
        assert.ok(units.data.find(u => u.shortCode === 'Ctn' && u.isBase));
        assert.equal((await h.get('/api/inventory/master/colors')).data.length, 12);
        assert.equal((await h.get('/api/inventory/master/sizes')).data.length, 15);
    });

    const units = (await h.get('/api/inventory/master/units')).data;
    const ctn = units.find(u => u.shortCode === 'Ctn'), dzn = units.find(u => u.shortCode === 'Dzn');
    const cat = await h.post('/api/inventory/master/categories', { name: 'HAIR PRODUCTS' });

    await t.test('category names are unique (case ignored)', async () => {
        assert.equal(cat.status, 200);
        const dupe = await h.post('/api/inventory/master/categories', { name: 'hair products' });
        assert.equal(dupe.status, 400);
    });

    let pid;
    await t.test('product with base unit carton and alternate unit dozen, opening stock 10', async () => {
        const r = await h.post('/api/inventory/products', { name: 'CLEAR SACHET 8ML', sku: 'CL8', barcode: '2000000000017', categoryId: cat.data.id, retailPrice: 480000, cost: 450000, baseUnitId: ctn.id, altUnits: [{ unitId: dzn.id, factor: 30 }], openingStock: 10 });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        pid = r.data.id;
        const p = (await h.get('/api/inventory/products/' + pid)).data;
        assert.equal(p.stock, 10);
        assert.equal(p.retailPrice, 480000);
        assert.equal(p.altUnits[0].factor, 30);
        assert.equal(p.category, 'HAIR PRODUCTS');
    });

    await t.test('SKU and barcode must lead to one product', async () => {
        const a = await h.post('/api/inventory/products', { name: 'Other', sku: 'cl8' });
        assert.equal(a.status, 400);
        assert.match(a.data.error, /already used/);
        const b = await h.post('/api/inventory/products', { name: 'Other', barcode: '2000000000017' });
        assert.equal(b.status, 400);
    });

    await t.test('stock adjustment by difference and to a counted quantity', async () => {
        const a = await h.post(`/api/inventory/products/${pid}/adjust`, { mode: 'DIFF', qty: -0.5, note: 'damaged' });
        assert.equal(a.data.after, 9.5);
        const b = await h.post(`/api/inventory/products/${pid}/adjust`, { mode: 'SET', qty: 12, note: 'count' });
        assert.equal(b.data.after, 12);
        const moves = (await h.get(`/api/inventory/products/${pid}/movements`)).data;
        assert.equal(moves.length, 3);
        const reason = await h.post(`/api/inventory/products/${pid}/adjust`, { mode: 'DIFF', qty: 1 });
        assert.equal(reason.status, 400);
    });

    await t.test('variant product: one sellable row per colour × size, parent not sold', async () => {
        const colors = (await h.get('/api/inventory/master/colors')).data.slice(0, 2);
        const sizes = (await h.get('/api/inventory/master/sizes')).data.slice(0, 2);
        const variants = [];
        for (const c of colors) for (const s of sizes) variants.push({ colorId: c.id, sizeId: s.id, openingStock: 2 });
        const r = await h.post('/api/inventory/products', { name: 'T-SHIRT', type: 'VARIANT', retailPrice: 150000, variants });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        const p = (await h.get('/api/inventory/products/' + r.data.id)).data;
        assert.equal(p.variants.length, 4);
        assert.equal(p.stock, 0);
        const list = (await h.get('/api/inventory/products')).data;
        assert.equal(list.find(x => x.id === r.data.id).stock, 8);
        const catalog = (await h.get('/api/inventory/catalog')).data;
        assert.ok(!catalog.find(x => x.id === r.data.id), 'the parent is not sellable');
        assert.equal(catalog.filter(x => x.parentId === r.data.id).length, 4);
    });

    await t.test('serialized product: serials are the opening stock', async () => {
        const r = await h.post('/api/inventory/products', { name: 'Phone X', type: 'SERIAL', retailPrice: 5000000, serials: 'IMEI1\nIMEI2\nIMEI2\nIMEI3' });
        assert.equal(r.status, 200);
        const p = (await h.get('/api/inventory/products/' + r.data.id)).data;
        assert.equal(p.serials.length, 3);
        assert.equal(p.stock, 3);
    });

    await t.test('CSV import creates categories and opening stock; deleted products leave the catalog', async () => {
        const r = await h.post('/api/inventory/products/import', { rows: [{ name: 'Soap', sku: 'S1', category: 'Soap & Wash', price: 12000, stock: 24 }, { name: 'Tea', sku: 'T1', category: '', price: 50000, stock: 0 }] });
        assert.equal(r.data.imported, 2);
        const bad = await h.post('/api/inventory/products/import', { rows: [{ name: '', price: 'abc' }] });
        assert.equal(bad.status, 400);
        const tea = (await h.get('/api/inventory/products?q=Tea')).data[0];
        await h.del('/api/inventory/products/' + tea.id);
        assert.ok(!(await h.get('/api/inventory/catalog')).data.find(x => x.id === tea.id));
    });

    await t.test('a cashier can read the catalog but not add products', async () => {
        const cashier = await h.user('CASHIER');
        assert.equal((await h.get('/api/inventory/catalog', cashier)).status, 200);
        assert.equal((await h.post('/api/inventory/products', { name: 'x' }, cashier)).status, 403);
    });
});
