// End to end: a desktop PC (a real child process, MODE=desktop, its own SQLite file) against the cloud app (this process).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');
const { setup, call } = require('./helpers');

const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 20000, step = 300) {
    const end = Date.now() + ms;
    for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out'); await sleep(step); }
}

function startPC(port, dbFile, cloudBase) {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
        env: { ...process.env, MODE: 'desktop', PORT: String(port), DATABASE_URL: `file:${dbFile}?connection_limit=1`, JWT_SECRET: 'desktop-test-secret-'.padEnd(48, 'x'), HP_SERVER_URL: cloudBase, HP_SYNC_INTERVAL_MS: '700' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
    child.log = () => out;
    return child;
}
const pcCall = (port, method, p, body, token) => fetch(`http://127.0.0.1:${port}${p}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));

test('desktop PC: activate, download, sell offline, sync both ways, revoke', { timeout: 120000 }, async t => {
    const h = await setup({ name: 'Sync Shop' });
    const soap = (await h.post('/api/inventory/products', { name: 'Soap', sku: 'SOAP', retailPrice: 12000, cost: 8000, openingStock: 100 })).data.id;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-pc-'));
    const port = await freePort();
    let pc = startPC(port, path.join(dir, 'pc.db'), h.base);
    t.after(() => { try { pc.kill(); } catch { } });
    await waitFor(async () => (await pcCall(port, 'GET', '/api/desktop/status').catch(() => null))?.data?.isDesktop);

    await t.test('a new PC asks to be activated; a cashier cannot activate it', async () => {
        const s = await pcCall(port, 'GET', '/api/desktop/status');
        assert.equal(s.data.activated, false);
        const before = await pcCall(port, 'POST', '/api/auth/login', { email: h.email, password: 'Owner@12345' });
        assert.equal(before.status, 401, 'no users on the PC before activation');
    });

    let token;
    await t.test('activation with the owner downloads users, settings and products', async () => {
        const r = await pcCall(port, 'POST', '/api/desktop/activate', { serverUrl: h.base, email: h.email, password: 'Owner@12345', name: 'Counter 1' });
        assert.equal(r.status, 200, JSON.stringify(r.data) + pc.log());
        assert.equal(r.data.device.code, 'D1');
        const login = await pcCall(port, 'POST', '/api/auth/login', { email: h.email, password: 'Owner@12345' });
        assert.equal(login.status, 200, JSON.stringify(login.data));
        token = login.data.token;
        const me = await pcCall(port, 'GET', '/api/auth/me', null, token);
        assert.equal(me.data.tenant.name, 'Sync Shop');
        assert.equal(me.data.mode, 'desktop');
        const cat = await pcCall(port, 'GET', '/api/inventory/catalog', null, token);
        assert.equal(cat.data.find(p => p.id === soap).stock, 100);
        const devices = await call('GET', `/api/admin/clients/${h.tenantId}/devices`, undefined, h.adminToken);
        assert.equal(devices.data.length, 1);
    });

    let pcSale;
    await t.test('a sale on the PC gets the PC\'s own number and reaches the cloud', async () => {
        const r = await pcCall(port, 'POST', '/api/pos/sales', { items: [{ productId: soap, qty: 2 }], payments: [{ method: 'CASH', amount: 24000 }] }, token);
        assert.equal(r.status, 200, JSON.stringify(r.data));
        pcSale = r.data;
        assert.match(pcSale.number, /^INV-D1-\d{4}$/);
        await waitFor(async () => (await h.get('/api/pos/sales')).data.sales.find(s => s.id === pcSale.id));
        assert.equal((await h.get('/api/inventory/products/' + soap)).data.stock, 98, 'stock movement synced');
        const ledgerAccount = (await h.get('/api/pos/sales/' + pcSale.id)).data;
        assert.equal(ledgerAccount.items.length, 1);
    });

    await t.test('a price change in the cloud reaches the PC', async () => {
        const p = (await h.get('/api/inventory/products/' + soap)).data;
        await h.put('/api/inventory/products/' + soap, { ...p, retailPrice: 15000 });
        await waitFor(async () => (await pcCall(port, 'GET', '/api/inventory/catalog', null, token)).data.find(x => x.id === soap).retailPrice === 15000);
    });

    await t.test('a web sale lowers the stock the PC sees', async () => {
        await h.post('/api/pos/sales', { items: [{ productId: soap, qty: 3 }], payments: [{ method: 'CASH', amount: 45000 }] });
        await waitFor(async () => (await pcCall(port, 'GET', '/api/inventory/catalog', null, token)).data.find(x => x.id === soap).stock === 95);
    });

    await t.test('offline: the PC keeps selling; the sales go up when the cloud is back', async () => {
        // point the PC at an address nobody answers = no internet
        const dead = `http://127.0.0.1:${await freePort()}`;
        const set = await pcCall(port, 'POST', '/api/desktop/server', { serverUrl: dead }, token);
        assert.equal(set.status, 200, JSON.stringify(set.data));
        await waitFor(async () => (await pcCall(port, 'GET', '/api/desktop/status')).data.online === false);
        const offline = [];
        for (let i = 0; i < 3; i++) {
            const r = await pcCall(port, 'POST', '/api/pos/sales', { items: [{ productId: soap, qty: 1 }], payments: [{ method: 'CASH', amount: 15000 }] }, token);
            assert.equal(r.status, 200, JSON.stringify(r.data));
            offline.push(r.data);
        }
        assert.ok(offline.every(s => /^INV-D1-/.test(s.number)), 'numbered on the PC');
        assert.ok((await pcCall(port, 'GET', '/api/desktop/status')).data.pending >= 3, 'waiting to be sent');
        const cloudBefore = (await h.get('/api/pos/sales')).data.sales;
        assert.ok(!offline.some(o => cloudBefore.find(x => x.id === o.id)), 'not in the cloud yet');
        // the internet is back
        await pcCall(port, 'POST', '/api/desktop/server', { serverUrl: h.base }, token);
        await waitFor(async () => { const s2 = (await h.get('/api/pos/sales')).data.sales; return offline.every(o => s2.find(x => x.id === o.id)); }, 30000);
        await waitFor(async () => (await pcCall(port, 'GET', '/api/desktop/status')).data.pending === 0);
        assert.equal((await h.get('/api/inventory/products/' + soap)).data.stock, 92);
    });

    await t.test('a revoked PC stops accepting sales', async () => {
        const devices = await call('GET', `/api/admin/clients/${h.tenantId}/devices`, undefined, h.adminToken);
        await call('POST', `/api/admin/clients/${h.tenantId}/devices/${devices.data[0].id}/revoke`, {}, h.adminToken);
        await waitFor(async () => (await pcCall(port, 'GET', '/api/desktop/status')).data.revoked);
        const login = await pcCall(port, 'POST', '/api/auth/login', { email: h.email, password: 'Owner@12345' });
        const r = await pcCall(port, 'POST', '/api/pos/sales', { items: [{ productId: soap, qty: 1 }], payments: [{ method: 'CASH', amount: 15000 }] }, login.data.token);
        assert.equal(r.status, 403);
        assert.match(r.data.error, /revoked/);
    });
});
