// Importing a product list from a spreadsheet (CSV): any column order, header names from other shop systems
// (e.g. "variant_sku"), our own export, files without a header, and the server's checks.
const test = require('node:test');
const assert = require('node:assert/strict');
const CsvImport = require('../public/js/shared/csvimport');
const { setup } = require('./helpers');
const toPaisa = v => Math.round(Number(v) * 100);

test('reading spreadsheet files', async t => {
    await t.test('a list from another shop system: columns matched by name, any order ("variant_sku" is the SKU)', () => {
        const f = CsvImport.read('product_name,category_name,brand,sale_price,variant_sku,variant_barcode,quantity,purchase_price\nSurf Excel 1kg,Detergents,Unilever,"Rs 1,250.00",SE-1KG,8961014000011,24,1150\n');
        assert.ok(f.header);
        assert.deepEqual(Object.values(f.mapping).sort(), ['barcode', 'brand', 'category', 'cost', 'name', 'price', 'sku', 'stock']);
        const [r] = CsvImport.toRows(f, f.mapping, toPaisa);
        assert.equal(r.line, 2);
        assert.equal(r.name, 'Surf Excel 1kg');
        assert.equal(r.sku, 'SE-1KG');
        assert.equal(r.barcode, '8961014000011');
        assert.equal(r.price, 125000, '"Rs 1,250.00" read as Rs 1,250');
        assert.equal(r.cost, 115000);
        assert.equal(r.stock, '24');
    });

    await t.test('the shop\'s failing layout: header row with variant_sku in the 5th column is not imported as a product', () => {
        const f = CsvImport.read('name,sku,category,price,variant_sku,stock\nRice,R1,Grocery,250,R1-5KG,10\n');
        assert.ok(f.header, 'the first row is recognised as a header');
        const rows = CsvImport.toRows(f, f.mapping, toPaisa);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].stock, '10', 'stock comes from the "stock" column, not from position 5');
        assert.equal(rows[0].sku, 'R1', 'an exact "sku" column wins over "variant_sku"');
    });

    await t.test('HisabPro\'s own export imports back (Type is ignored, Wholesale/Cost/Unit/Expiry kept)', () => {
        const f = CsvImport.read('﻿Name,SKU,Barcode,Type,Category,Brand,Price,Wholesale,Cost,Stock,Unit,Expiry\nGhee 1kg,G1,123,Standard,Cooking Oil,Dalda,600,580,540,12,Pcs,31/12/2026\n');
        assert.equal(Object.values(f.mapping).includes('type'), false);
        const [r] = CsvImport.toRows(f, f.mapping, toPaisa);
        assert.deepEqual([r.name, r.sku, r.barcode, r.category, r.brand, r.price, r.wholesale, r.cost, r.stock, r.unit, r.expiry],
            ['Ghee 1kg', 'G1', '123', 'Cooking Oil', 'Dalda', 60000, 58000, 54000, '12', 'Pcs', '2026-12-31']);
    });

    await t.test('no header row: the plain order Name, SKU, Category, Price, Stock', () => {
        const f = CsvImport.read('Sugar 1kg,SUG,Grocery,160,50\nSalt,SALT,Grocery,40,\n');
        assert.equal(f.header, null);
        const rows = CsvImport.toRows(f, f.mapping, toPaisa);
        assert.equal(rows.length, 2);
        assert.equal(rows[0].line, 1);
        assert.deepEqual([rows[0].name, rows[0].price, rows[0].stock], ['Sugar 1kg', 16000, '50']);
    });

    await t.test('semicolons (Excel in some countries), quoted commas and line breaks, blank lines', () => {
        const f = CsvImport.read('Name;Price;Stock\r\n"Biscuit, family pack";120;6\r\n\r\n"Tea ""Special""\nloose";900;2\r\n');
        const rows = CsvImport.toRows(f, f.mapping, toPaisa);
        assert.equal(rows.length, 2);
        assert.equal(rows[0].name, 'Biscuit, family pack');
        assert.equal(rows[1].name, 'Tea "Special"\nloose');
        assert.equal(rows[1].price, 90000);
    });

    await t.test('variants become their own products with the variant in the name; dates day-first', () => {
        const f = CsvImport.read('Title,Option1 Value,Variant SKU,Variant Price\nShirt,Red / M,SH-RM,1500\nShirt,Blue / L,SH-BL,1500\n');
        const rows = CsvImport.toRows(f, f.mapping, toPaisa);
        assert.deepEqual(rows.map(r => r.name), ['Shirt (Red / M)', 'Shirt (Blue / L)']);
        assert.equal(CsvImport.cleanDate('5-1-27'), '2027-01-05');
        assert.equal(CsvImport.cleanDate('2027.03.09'), '2027-03-09');
        assert.equal(CsvImport.cleanNumber('PKR 1 250'), '1250');
        assert.equal(CsvImport.cleanNumber('twelve'), 'twelve', 'left as written for a clear error');
    });
});

test('importing products', async t => {
    const h = await setup();
    await t.test('all fields: category and brand are made as needed, unit matched, opening stock, wholesale, cost, expiry', async () => {
        const r = await h.post('/api/inventory/products/import', { rows: [
            { line: 2, name: 'Surf Excel 1kg', sku: 'SE-1', barcode: '896101', category: 'Detergents', brand: 'Unilever', unit: 'pcs', price: 125000, wholesale: 120000, cost: 115000, stock: '24', expiry: '2027-06-30' },
            { line: 3, name: 'Loose Rice', sku: 'RICE-L', category: 'Grocery', unit: 'Kg', price: 38000, stock: '12.5' },
        ] });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.imported, 2);
        const cat = (await h.get('/api/inventory/catalog')).data;
        const surf = cat.find(p => p.sku === 'SE-1'), rice = cat.find(p => p.sku === 'RICE-L');
        assert.deepEqual([surf.brand, surf.category, surf.baseUnit, surf.retailPrice, surf.wholesalePrice, surf.cost, surf.stock, surf.barcode], ['Unilever', 'Detergents', 'Pcs', 125000, 120000, 115000, 24, '896101']);
        assert.equal(String(surf.expiryDate).slice(0, 10), '2027-06-30');
        assert.deepEqual([rice.baseUnit, rice.stock], ['Kg', 12.5]);
    });

    await t.test('the same list again: refused with clear lines, or skipped when asked', async () => {
        const rows = [{ line: 2, name: 'Surf Excel 1kg', sku: 'SE-1', price: 125000 }, { line: 3, name: 'New Soap', sku: 'NS-1', price: 9000, stock: '5' }];
        const no = await h.post('/api/inventory/products/import', { rows });
        assert.equal(no.status, 400);
        assert.match(no.data.error, /Line 2: SKU "SE-1" is already used by "Surf Excel 1kg"/);
        const yes = await h.post('/api/inventory/products/import', { rows, skipExisting: true });
        assert.equal(yes.status, 200, JSON.stringify(yes.data));
        assert.deepEqual([yes.data.imported, yes.data.skipped], [1, 1]);
    });

    await t.test('bad values are reported by the file\'s line number; nothing is imported', async () => {
        const before = (await h.get('/api/inventory/catalog')).data.length;
        const r = await h.post('/api/inventory/products/import', { rows: [
            { line: 2, name: 'A', price: 'abc' }, { line: 3, name: 'B', stock: 'variant_sku' }, { line: 4, name: '' , sku: 'X'}, { line: 5, name: 'C', expiry: '31-31-2026' },
            { line: 6, name: 'D', sku: 'DUP' }, { line: 7, name: 'E', sku: 'dup' },
        ] });
        assert.equal(r.status, 400);
        for (const m of [/Line 2: the price "abc"/, /Line 3: the stock "variant_sku" is not a number/, /Line 4: the name is empty/, /Line 5: the expiry date/, /Lines 6 and 7 have the same SKU/]) assert.match(r.data.error, m);
        assert.equal((await h.get('/api/inventory/catalog')).data.length, before);
    });
});

test('templates and other lists', async t => {
    await t.test('every template reads back as its own list (header recognised, every column matched)', () => {
        for (const kind of ['product', 'category', 'brand', 'customer', 'vendor']) {
            const tp = CsvImport.SCHEMAS[kind].template;
            const csv = [tp.header, ...tp.rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
            const f = CsvImport.read(csv, kind);
            assert.ok(f.header, kind);
            assert.equal(Object.keys(f.mapping).length, tp.header.length, `${kind}: all ${tp.header.length} columns matched`);
            assert.equal(CsvImport.toRows(f, f.mapping, toPaisa).length, tp.rows.length);
        }
    });

    await t.test('customers from another system: "Customer Name, Contact No, Udhar, Limit" and a minus balance in brackets', () => {
        const f = CsvImport.read('Customer Name,Contact No,City,Udhar,Limit\nAkram Store,0300-1234567,Lahore,"25,000",50000\nBilal,0321,Kasur,(1500),\n', 'customer');
        const rows = CsvImport.toRows(f, f.mapping, toPaisa);
        assert.deepEqual([rows[0].name, rows[0].phone, rows[0].city, rows[0].balance, rows[0].creditLimit], ['Akram Store', '0300-1234567', 'Lahore', 2500000, 5000000]);
        assert.equal(rows[1].balance, -150000, '(1500) is an advance of Rs 1,500');
    });

    await t.test('vendors: "Supplier, Contact Person, Mobile, Payable"; categories with a parent', () => {
        let f = CsvImport.read('Supplier,Contact Person,Mobile,Payable\nFaisal Mills,Haji Saleem,0300,150000\n', 'vendor');
        assert.deepEqual(Object.values(f.mapping).sort(), ['balance', 'contactPerson', 'name', 'phone']);
        f = CsvImport.read('Category,Main Category\nRice,Grocery\n', 'category');
        assert.deepEqual(CsvImport.toRows(f, f.mapping, toPaisa)[0], { line: 2, name: 'Rice', parent: 'Grocery', description: '', sortOrder: '' });
        f = CsvImport.read('Dalda\nNestle\n', 'brand');
        assert.equal(f.header, null, 'one column of names without a header');
        assert.equal(CsvImport.toRows(f, f.mapping, toPaisa).length, 2);
    });
});

test('importing categories, brands, customers and vendors', async t => {
    const h = await setup();
    await t.test('categories: parents found or made; existing names skipped when asked, else refused', async () => {
        const r = await h.post('/api/inventory/master/categories/import', { rows: [
            { line: 2, name: 'Grocery', parent: '', description: 'dry goods' }, { line: 3, name: 'Rice', parent: 'Grocery' }, { line: 4, name: 'Pulses', parent: 'Dry Goods' },
        ] });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.imported, 4, '3 rows + the missing parent "Dry Goods"');
        const cats = (await h.get('/api/inventory/master/categories')).data;
        const id = n => cats.find(c => c.name === n).id;
        assert.equal(cats.find(c => c.name === 'Rice').parentId, id('Grocery'));
        assert.equal(cats.find(c => c.name === 'Pulses').parentId, id('Dry Goods'));
        assert.equal((await h.post('/api/inventory/master/categories/import', { rows: [{ line: 2, name: 'rice' }] })).status, 400);
        const again = await h.post('/api/inventory/master/categories/import', { rows: [{ line: 2, name: 'rice' }, { line: 3, name: 'Snacks' }], skipExisting: true });
        assert.deepEqual([again.data.imported, again.data.skipped], [1, 1]);
        // a loop in the file (A under B, B under A) is not made
        await h.post('/api/inventory/master/categories/import', { rows: [{ line: 2, name: 'Loop A', parent: 'Loop B' }, { line: 3, name: 'Loop B', parent: 'Loop A' }] });
        const after = (await h.get('/api/inventory/master/categories')).data;
        const a = after.find(c => c.name === 'Loop A'), b = after.find(c => c.name === 'Loop B');
        assert.ok(!(a.parentId === b.id && b.parentId === a.id), 'no loop');
    });

    await t.test('brands; units and other lists cannot be imported this way', async () => {
        const r = await h.post('/api/inventory/master/brands/import', { rows: [{ line: 2, name: 'Dalda', description: 'oil' }, { line: 3, name: 'Nestle' }] });
        assert.equal(r.data.imported, 2);
        assert.equal((await h.post('/api/inventory/master/units/import', { rows: [{ name: 'Box' }] })).status, 404);
    });

    await t.test('customers with old udhaar (and an advance) open their khata with that balance', async () => {
        const r = await h.post('/api/parties/import?type=CUSTOMER', { rows: [
            { line: 2, name: 'Akram Store', phone: '0300-1234567', city: 'Lahore', balance: 2500000, creditLimit: 5000000, group: 'Wholesale' },
            { line: 3, name: 'Bilal Karyana', phone: '0321-7654321', balance: -150000 },
            { line: 4, name: 'Zero Shop' },
        ] });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.imported, 3);
        const list = (await h.get('/api/parties?type=CUSTOMER')).data;
        const akram = list.find(p => p.name === 'Akram Store'), bilal = list.find(p => p.name === 'Bilal Karyana');
        assert.deepEqual([akram.balance, akram.creditLimit, akram.group, akram.city], [2500000, 5000000, 'WHOLESALE', 'Lahore']);
        assert.equal(bilal.balance, -150000, 'an advance received');
        assert.equal(list.find(p => p.name === 'Zero Shop').balance, 0);
        assert.equal((await h.get('/api/khata/summary')).data.kpis.totalReceivable, 2500000);
    });

    await t.test('vendors with old balances; bad rows reported by line; names already there', async () => {
        const r = await h.post('/api/parties/import?type=VENDOR', { rows: [{ line: 2, name: 'Faisal Mills', contactPerson: 'Haji Saleem', phone: '0300', balance: 15000000 }] });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        const v = (await h.get('/api/parties?type=VENDOR')).data.find(p => p.name === 'Faisal Mills');
        assert.deepEqual([v.balance, v.contactPerson], [15000000, 'Haji Saleem']);
        const bad = await h.post('/api/parties/import?type=VENDOR', { rows: [{ line: 2, name: 'Faisal Mills' }, { line: 3, name: 'X', balance: 'lots' }, { line: 4, name: 'Y', email: 'not-an-email' }, { line: 5, name: '' }] });
        assert.equal(bad.status, 400);
        for (const m of [/Line 2: a vendor named "Faisal Mills" already exists/, /Line 3: the old balance "lots"/, /Line 4: The email address/, /Line 5: the name is empty/]) assert.match(bad.data.error, m);
        const skip = await h.post('/api/parties/import?type=VENDOR', { rows: [{ line: 2, name: 'faisal mills' }, { line: 3, name: 'Shan Foods' }], skipExisting: true });
        assert.deepEqual([skip.data.imported, skip.data.skipped], [1, 1]);
    });

    await t.test('a cashier cannot import customers (balances) or products', async () => {
        const cashier = await h.user('CASHIER');
        assert.equal((await h.post('/api/parties/import?type=CUSTOMER', { rows: [{ name: 'Q' }] }, cashier)).status, 403);
        assert.equal((await h.post('/api/inventory/master/categories/import', { rows: [{ name: 'Q' }] }, cashier)).status, 403);
    });
});
