const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { setup } = require('./helpers');
const { prisma } = require('../src/db');
const { BACKUP_TYPE } = require('../src/routes/backup');

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// the same data as if it came from another HisabPro server: every id replaced, references kept consistent
const fromAnotherServer = text => { const map = new Map(); return text.replace(UUID, id => { if (!map.has(id)) map.set(id, crypto.randomUUID()); return map.get(id); }); };

async function raw(h, method, path, { body, type, token } = {}) {
    const res = await fetch(h.base + path, { method, headers: { Authorization: 'Bearer ' + (token || h.token), ...(type ? { 'Content-Type': type } : {}) }, body });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, text, headers: res.headers };
}
const importFile = (h, text, token) => raw(h, 'POST', '/api/backup/import', { body: text, type: BACKUP_TYPE, token });

test('backup: download, merge-only import, validation, storage', async t => {
    const a = await setup({ name: 'Backup Source' });
    const p = (await a.post('/api/inventory/products', { name: 'Soap', retailPrice: 12000, cost: 8000, openingStock: 20 })).data.id;
    const cust = (await a.post('/api/pos/customers', { name: 'Ali', creditLimit: 0 })).data;
    const sale = (await a.post('/api/pos/sales', { mode: 'CREDIT', customerId: cust.id, items: [{ productId: p, qty: 3 }], payments: [{ method: 'CASH', amount: 10000 }] })).data;
    await a.post('/api/pos/returns', { saleId: sale.id, items: [{ saleItemId: sale.items[0].id, qty: 1 }] });
    const cash = (await a.get('/api/pos/bootstrap')).data.accounts.find(x => x.type === 'CASH');
    await prisma.expense.create({ data: { tenantId: a.tenantId, amount: 2500n, categoryName: 'Transport', accountId: cash.id } });

    let file;
    await t.test('download: one JSON file of every business table, metadata, money as numbers, no password hashes', async () => {
        const r = await raw(a, 'GET', '/api/backup/download');
        assert.equal(r.status, 200);
        assert.match(r.headers.get('content-disposition'), /attachment; filename="hisabpro-backup-backup-source-\d{4}-\d{2}-\d{2}\.json"/);
        assert.ok(!r.text.includes('passwordHash'), 'never the password hash');
        assert.ok(!/\$2[aby]\$/.test(r.text), 'no bcrypt hash in the file');
        file = r.data;
        assert.equal(file.app, 'HisabPro');
        assert.equal(file.kind, 'backup');
        assert.equal(file.tenant.name, 'Backup Source');
        assert.ok(file.exportedAt && file.version);
        assert.equal(file.tables.Sale.length, 1);
        assert.equal(file.counts.Sale, 1);
        assert.equal(typeof file.tables.Sale[0].total, 'number');
        assert.equal(file.tables.Sale[0].total, 36000);
        assert.ok(file.tables.Product.find(x => x.id === p));
        assert.ok(file.tables.LedgerEntry.length >= 3);
        assert.equal(file.tables.Expense.length, 1);
        assert.ok(file.users.find(u => u.email === a.email && u.role === 'OWNER'));
        assert.ok(Object.keys(file.tables).includes('AssetAssignment'), 'every synced table is listed');
        assert.ok(file.tables.Sale.every(s => s.tenantId === a.tenantId), 'only this client');
    });

    await t.test('importing the same file again into the same client adds nothing', async () => {
        const r = await importFile(a, JSON.stringify(file));
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.totalAdded, 0);
        assert.equal(r.data.skipped.Sale, 1);
    });

    const b = await setup({ name: 'Fresh Client' });
    const moved = fromAnotherServer(JSON.stringify(file));
    await t.test('import into a fresh client adds the rows (with its own tenantId), then skips them the second time', async () => {
        const r1 = await importFile(b, moved);
        assert.equal(r1.status, 200, JSON.stringify(r1.data));
        assert.equal(r1.data.added.Sale, 1);
        assert.equal(r1.data.added.Product, file.tables.Product.length);
        assert.equal(r1.data.added.SaleItem, 1);
        assert.equal(r1.data.added.SaleReturn, 1);
        assert.equal(r1.data.added.Expense, 1);
        assert.equal(r1.data.added.Setting, 0, 'the fresh client already has its settings');
        assert.ok(r1.data.skipped.Setting > 0);
        const sales = await prisma.sale.findMany({ where: { tenantId: b.tenantId } });
        assert.equal(sales.length, 1);
        // the imported data works in the new client: same profit, stock and khata
        const plA = (await a.get('/api/reports/profit-loss?preset=today')).data.pl, plB = (await b.get('/api/reports/profit-loss?preset=today')).data.pl;
        assert.equal(plB.netProfit, plA.netProfit);
        assert.equal(plB.revenue, plA.revenue);
        const prod = (await b.get('/api/inventory/products?q=Soap')).data[0];
        assert.equal(prod.stock, 18);
        assert.equal((await b.get('/api/reports/dashboard')).data.live.receivable, (await a.get('/api/reports/dashboard')).data.live.receivable);

        const r2 = await importFile(b, moved);
        assert.equal(r2.status, 200);
        assert.equal(r2.data.totalAdded, 0);
        assert.equal(r2.data.skipped.Sale, 1);
        assert.equal(r2.data.skipped.Product, file.tables.Product.length);
        assert.equal((await prisma.sale.count({ where: { tenantId: b.tenantId } })), 1);
    });

    await t.test('files from another app or damaged files are refused before anything is written', async () => {
        assert.equal((await importFile(b, JSON.stringify({ app: 'OtherPOS', kind: 'backup', tables: {} }))).status, 400);
        assert.equal((await importFile(b, 'this is not json')).status, 400);
        assert.equal((await importFile(b, JSON.stringify([1, 2, 3]))).status, 400);
        const noTables = await importFile(b, JSON.stringify({ app: 'HisabPro', kind: 'backup' }));
        assert.equal(noTables.status, 400);
        const id = crypto.randomUUID();
        const missing = await importFile(b, JSON.stringify({ app: 'HisabPro', kind: 'backup', tables: { Brand: [{ id: crypto.randomUUID(), name: 'Good' }], Product: [{ id }] } }));
        assert.equal(missing.status, 400);
        assert.match(missing.data.error, /Product row 1 has no "name"/);
        assert.equal(await prisma.brand.count({ where: { tenantId: b.tenantId, name: 'Good' } }), 0, 'nothing written');
        const badDate = await importFile(b, JSON.stringify({ app: 'HisabPro', kind: 'backup', tables: { Brand: [{ id: crypto.randomUUID(), name: 'X', createdAt: 'yesterday-ish' }] } }));
        assert.equal(badDate.status, 400);
        // the same checks through the normal JSON content type
        assert.equal((await b.post('/api/backup/import', { app: 'Nope' })).status, 400);
    });

    await t.test('a file above the app-wide 3 MB JSON limit is accepted here; above 16 MB it is refused', async () => {
        const big = JSON.stringify({ app: 'HisabPro', kind: 'backup', tables: { HeldSale: [{ id: crypto.randomUUID(), label: 'big', cart: JSON.stringify({ pad: 'x'.repeat(4 * 1024 * 1024) }) }] } });
        const r = await importFile(b, big);
        assert.equal(r.status, 200, JSON.stringify(r.data).slice(0, 300));
        assert.equal(r.data.added.HeldSale, 1);
        const tooBig = await importFile(b, JSON.stringify({ app: 'HisabPro', kind: 'backup', pad: 'x'.repeat(17 * 1024 * 1024) }));
        assert.equal(tooBig.status, 413);
    });

    await t.test('storage health: rows and approximate size per table against the quota', async () => {
        const r = await a.get('/api/backup/storage');
        assert.equal(r.status, 200);
        const prod = r.data.tables.find(x => x.name === 'Product');
        assert.equal(prod.rows, file.tables.Product.length);
        assert.ok(prod.bytes > 0);
        assert.equal(r.data.quotaBytes, 500 * 1024 * 1024);
        assert.ok(r.data.usedPct >= 0 && r.data.usedPct < 1);
        assert.equal(r.data.healthy, true);
    });

    await t.test('only settings.manage may download or import', async () => {
        const cashier = await a.user('CASHIER');
        assert.equal((await raw(a, 'GET', '/api/backup/download', { token: cashier })).status, 403);
        assert.equal((await importFile(a, JSON.stringify(file), cashier)).status, 403);
        assert.equal((await a.get('/api/backup/storage', cashier)).status, 403);
    });
});

test('backup import cannot reach into another client; values are type- and range-checked', async t => {
    const victim = await setup({ name: 'Victim Shop' });
    const p = (await victim.post('/api/inventory/products', { name: 'Soap', retailPrice: 12000, cost: 8000, openingStock: 20 })).data.id;
    const sale = (await victim.post('/api/pos/sales', { items: [{ productId: p, qty: 1 }], payments: [{ method: 'CASH', amount: 12000 }] })).data;
    const attacker = await setup({ name: 'Attacker Shop' });

    await t.test('lines and payments that point at another client\'s sale are skipped; that sale is untouched', async () => {
        const mySale = crypto.randomUUID();
        const file = { app: 'HisabPro', kind: 'backup', format: 1, tables: {
            Sale: [{ id: mySale, number: 'INV-X', subtotal: 100, total: 100 }],
            SaleItem: [
                { id: crypto.randomUUID(), saleId: sale.id, productId: p, name: 'INJECTED', qty: 5, baseQty: 5, price: 1, gross: 5, total: 99999999 },
                { id: crypto.randomUUID(), saleId: mySale, productId: p, name: 'Mine', qty: 1, baseQty: 1, price: 100, gross: 100, total: 100 },
            ],
            SalePayment: [{ id: crypto.randomUUID(), saleId: sale.id, method: 'CASH', amount: 77777 }],
            SaleReturnItem: [{ id: crypto.randomUUID(), returnId: crypto.randomUUID(), saleItemId: 'x', productId: p, name: 'orphan', qty: 1, baseQty: 1, price: 1, total: 1 }],
        } };
        const r = await importFile(attacker, JSON.stringify(file));
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.added.Sale, 1);
        assert.equal(r.data.added.SaleItem, 1, 'only the line under its own (imported) sale');
        assert.equal(r.data.skipped.SaleItem, 1);
        assert.equal(r.data.added.SalePayment, 0);
        assert.equal(r.data.added.SaleReturnItem, 0, 'a line without its parent is not added');
        const s = (await victim.get('/api/pos/sales/' + sale.id)).data;
        assert.deepEqual(s.items.map(i => i.name), ['Soap']);
        assert.equal(s.payments.length, 1);
        assert.equal(await prisma.saleItem.count({ where: { saleId: sale.id } }), 1);
    });

    await t.test('numbers out of range and dates that are not text are refused before anything is written', async () => {
        const bad = [
            { Brand: [{ id: crypto.randomUUID(), name: 'B1', createdAt: 1700000000000 }] },
            { Brand: [{ id: crypto.randomUUID(), name: 'B2', createdAt: true }] },
            { Sale: [{ id: crypto.randomUUID(), number: 'N', subtotal: 1, total: '99999999999999999999' }] },
            { Sale: [{ id: crypto.randomUUID(), number: 'N', subtotal: 1, total: 1e30 }] },
            { Sale: [{ id: crypto.randomUUID(), number: 'N', subtotal: 1, total: 1, itemsCount: 1e12 }] },
            { Sale: [{ id: crypto.randomUUID(), number: 'N', subtotal: [1], total: 1 }] },
        ];
        for (const tables of bad) {
            const r = await importFile(attacker, JSON.stringify({ app: 'HisabPro', kind: 'backup', tables }));
            assert.equal(r.status, 400, JSON.stringify(tables).slice(0, 120) + ' → ' + JSON.stringify(r.data));
        }
        assert.equal(await prisma.brand.count({ where: { tenantId: attacker.tenantId, name: { in: ['B1', 'B2'] } } }), 0);
    });
});
