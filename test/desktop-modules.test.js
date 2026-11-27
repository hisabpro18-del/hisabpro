// Every module on a desktop PC (SQLite, MODE=desktop): purchases, payments, expenses, khata, HRM payroll, reports,
// settings, day close — then the PC's work must arrive in the cloud with the same figures.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');
const { setup } = require('./helpers');

const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 30000) { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out'); await sleep(300); } }

test('desktop PC runs every module on SQLite and syncs it all', { timeout: 180000 }, async t => {
    const h = await setup({ name: 'Desktop Modules Shop' });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-pcm-'));
    const port = await freePort();
    let log = '';
    const pc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
        env: { ...process.env, MODE: 'desktop', PORT: String(port), DATABASE_URL: `file:${path.join(dir, 'pc.db')}?connection_limit=1`, JWT_SECRET: 'desktop-modules-secret-'.padEnd(48, 'y'), HP_SYNC_INTERVAL_MS: '700' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    pc.stdout.on('data', d => { log += d; }); pc.stderr.on('data', d => { log += d; });
    t.after(() => { try { pc.kill(); } catch { } });
    const call = async (method, p, body, token) => { const r = await fetch(`http://127.0.0.1:${port}${p}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => null) }; };
    await waitFor(async () => (await call('GET', '/api/desktop/status').catch(() => null))?.data?.isDesktop);
    const act = await call('POST', '/api/desktop/activate', { serverUrl: h.base, email: h.email, password: 'Owner@12345', name: 'Counter' });
    assert.equal(act.status, 200, JSON.stringify(act.data) + log);
    const tk = (await call('POST', '/api/auth/login', { email: h.email, password: 'Owner@12345' })).data.token;
    const ok = (r, label) => { assert.ok(r.status === 200, `${label}: ${r.status} ${JSON.stringify(r.data)}\n${log.slice(-2000)}`); return r.data; };

    const units = ok(await call('GET', '/api/inventory/master/units', null, tk), 'units');
    const ctn = units.find(u => u.shortCode === 'Ctn'), pcs = units.find(u => u.shortCode === 'Pcs');
    const product = ok(await call('POST', '/api/inventory/products', { name: 'Tea 1kg', retailPrice: 150000, wholesalePrice: 140000, cost: 120000, baseUnitId: ctn.id, altUnits: [{ unitId: pcs.id, factor: 12 }], openingStock: 5 }, tk), 'product').id;
    const vendor = ok(await call('POST', '/api/parties', { type: 'VENDOR', name: 'Tea Distributor', phone: '03011112222', openingBalance: 0 }, tk), 'vendor');
    const customer = ok(await call('POST', '/api/parties', { type: 'CUSTOMER', name: 'Shop B', phone: '03001239999', group: 'WHOLESALE' }, tk), 'customer');

    await t.test('purchases on the PC: stock in, weighted cost, vendor khata', async () => {
        const p = ok(await call('POST', '/api/purchases', { vendorId: vendor.id, items: [{ productId: product, unitId: ctn.id, qty: 5, cost: 130000 }], paid: 300000, paymentMethod: 'CASH' }, tk), 'purchase');
        assert.equal(p.total ?? 650000, 650000);
        const prod = ok(await call('GET', '/api/inventory/products/' + product, null, tk), 'product get');
        assert.equal(prod.stock, 10);
        assert.equal(prod.cost, 125000);
    });

    await t.test('POS wholesale credit sale in pieces, khata receive and promise on the PC', async () => {
        const s = ok(await call('POST', '/api/pos/sales', { mode: 'CREDIT', customerId: customer.id, priceMode: 'WHOLESALE', items: [{ productId: product, unitId: pcs.id, qty: 24 }], payments: [] }, tk), 'sale');
        assert.equal(s.total, 280000);
        const r = ok(await call('POST', '/api/khata/receive', { partyId: customer.id, amount: 80000 }, tk), 'receive');
        assert.equal(r.balance, 200000);
        ok(await call('POST', '/api/khata/promises', { partyId: customer.id, amount: 200000, promisedDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) }, tk), 'promise');
        const k = ok(await call('GET', '/api/khata/summary', null, tk), 'khata summary');
        assert.equal(k.kpis.totalReceivable, 200000);
    });

    await t.test('finance on the PC: payment out, expense, accounts', async () => {
        ok(await call('POST', '/api/finance/payments', { direction: 'OUT', partyId: vendor.id, amount: 100000, method: 'CASH' }, tk), 'payment out');
        ok(await call('POST', '/api/finance/expenses', { amount: 50000, payee: 'Electricity' }, tk), 'expense');
        const accs = ok(await call('GET', '/api/finance/accounts', null, tk), 'accounts');
        assert.ok(accs.length >= 1);
    });

    await t.test('HRM on the PC: employee, payroll generate and pay', async () => {
        const e = ok(await call('POST', '/api/hrm/employees', { name: 'Ahmed', cnic: '12345-1234567-1', phone: '03005556666', designation: 'Salesman', baseSalary: 3000000 }, tk), 'employee');
        assert.match(e.code, /^EMP-D1-0001$/);
        ok(await call('POST', '/api/hrm/payroll/generate', {}, tk), 'payroll generate');
        const pr = ok(await call('GET', '/api/hrm/payroll', null, tk), 'payroll list');
        const slip = pr.rows[0];
        const accs = ok(await call('GET', '/api/finance/accounts', null, tk), 'accounts');
        ok(await call('POST', `/api/hrm/payroll/${slip.id}/pay`, { accountId: accs[0].id }, tk), 'pay payslip');
    });

    await t.test('reports, settings, day close and backup storage answer on the PC', async () => {
        const d = ok(await call('GET', '/api/reports/dashboard?preset=month', null, tk), 'dashboard');
        assert.ok(d.period);
        const pl = ok(await call('GET', '/api/reports/profit-loss?preset=month', null, tk), 'p&l').pl;
        // revenue 280000; cogs 2 cartons × 125000 = 250000; expenses 50000 + 3000000 salary
        assert.equal(pl.revenue, 280000);
        assert.equal(pl.cogs, 250000);
        assert.equal(pl.expenses, 3050000);
        for (const p of ['sales', 'purchases', 'inventory', 'expenses', 'financial', 'tax', 'product-performance', 'reminders']) ok(await call('GET', `/api/reports/${p}?preset=month`, null, tk), p);
        ok(await call('PUT', '/api/settings/company', { address: 'Shop 12, Main Bazar' }, tk), 'settings put');
        ok(await call('GET', '/api/day-close/preview', null, tk), 'day close');
        ok(await call('GET', '/api/backup/storage', null, tk), 'backup storage');
    });

    let rice;
    await t.test('the WhatsApp dialog, the invoice search and Stock & Price Management work on the PC', async () => {
        // the WhatsApp buttons first read the message templates: this was a 500 on PCs (no Secret table on SQLite)
        const m = ok(await call('GET', '/api/khata/messaging', null, tk), 'messaging');
        assert.match(m.billEn, /\{items\}/);
        assert.equal(m.hasApiKey, false);
        ok(await call('GET', '/api/pos/sales?q=1239999', null, tk), 'sales search by phone');
        rice = ok(await call('POST', '/api/inventory/products', { name: 'Rice 5kg', retailPrice: 150000, cost: 120000 }, tk), 'rice').id;
        const r = ok(await call('POST', '/api/inventory/stock-price/save', { reason: 'OPENING', changes: [{ productId: rice, wholesalePrice: 140000, stock: { op: 'ADD', qty: 5 } }] }, tk), 'stock-price save');
        assert.equal(r.updated, 1);
        const list = ok(await call('GET', '/api/inventory/stock-price', null, tk), 'stock-price list').products;
        assert.deepEqual([list.find(p => p.id === rice).stock, list.find(p => p.id === rice).wholesalePrice], [5, 140000]);
        assert.equal(ok(await call('GET', '/api/inventory/stock-price/history?productId=' + rice, null, tk), 'history').length, 2);
        ok(await call('POST', '/api/auth/unlock', { password: 'Owner@12345' }, tk), 'dashboard unlock on the PC');
    });

    await t.test('everything made on the PC reaches the cloud with the same figures', async () => {
        await waitFor(async () => (await call('GET', '/api/desktop/status')).data.pending === 0, 30000);
        const pl = (await h.get('/api/reports/profit-loss?preset=month')).data.pl;
        assert.equal(pl.revenue, 280000);
        assert.equal(pl.cogs, 250000);
        assert.equal(pl.expenses, 3050000);
        const k = (await h.get('/api/khata/summary')).data;
        assert.equal(k.kpis.totalReceivable, 200000);
        assert.equal((await h.get('/api/hrm/employees')).data.length, 1);
        assert.equal((await h.get('/api/inventory/products/' + product)).data.stock, 8);
        const settings = (await h.get('/api/settings')).data;
        assert.equal(settings.company.address, 'Shop 12, Main Bazar');
        // Stock & Price changes made on the PC: the price, the stock and their history
        const cloudRice = (await h.get('/api/inventory/stock-price')).data.products.find(p => p.id === rice);
        assert.deepEqual([cloudRice.stock, cloudRice.wholesalePrice], [5, 140000]);
        const hist = (await h.get('/api/inventory/stock-price/history?productId=' + rice)).data;
        assert.deepEqual(hist.map(x => x.field).sort(), ['STOCK', 'WHOLESALE']);
    });
});
