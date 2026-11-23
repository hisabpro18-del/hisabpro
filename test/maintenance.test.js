// Keeping the free 500 MB database small: the daily clean-up, the PC resync after the sync log was cleaned, size caps,
// and the super admin's storage card.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { setup, call } = require('./helpers');
const { freePort, waitFor, startPC, pcCall } = require('./pc');
const { prisma } = require('../src/db');
const maintenance = require('../src/services/maintenance');

const DAY = 86400000;

test('clean-up: old housekeeping rows go, shop records stay; caps; storage card', async t => {
    const h = await setup();
    const p = (await h.post('/api/inventory/products', { name: 'Ghee 1kg', retailPrice: 60000, cost: 50000, openingStock: 20 })).data.id;

    await t.test('a sale writes no activity-log row (the sale records who made it); the users page still counts it', async () => {
        const s = (await h.post('/api/pos/sales', { items: [{ productId: p, qty: 1 }], payments: [{ method: 'CASH', amount: 60000 }] })).data;
        assert.ok(s.id);
        assert.equal(await prisma.auditLog.count({ where: { tenantId: h.tenantId, action: 'sale.create' } }), 0);
        const u = (await h.get('/api/settings/users')).data;
        assert.equal(u.activity.reduce((a, d) => a + d.sales, 0), 1);
    });

    await t.test('size caps: held cart 60 KB, product photo about 60 KB, logo 150 KB', async () => {
        const big = (await h.post('/api/pos/held', { label: 'x', total: 100, cart: { note: 'x'.repeat(70000) } }));
        assert.equal(big.status, 400);
        assert.equal((await h.post('/api/pos/held', { label: 'ok', total: 100, cart: { items: [] } })).status, 200);
        const img = 'data:image/jpeg;base64,' + 'A'.repeat(95000);
        assert.equal((await h.post('/api/inventory/products', { name: 'Big photo', retailPrice: 100, imageUrl: img })).status, 400);
        const logo = 'data:image/png;base64,' + 'A'.repeat(220000);
        assert.equal((await h.put('/api/settings/company', { logo })).status, 400);
    });

    await t.test('activity log: entries older than a year go; nobody else can delete; recent ones stay', async () => {
        const old = await prisma.auditLog.create({ data: { tenantId: h.tenantId, action: 'test.old', summary: 'old', userEmail: 'x', createdAt: new Date(Date.now() - 400 * DAY) } });
        const recent = await prisma.auditLog.create({ data: { tenantId: h.tenantId, action: 'test.recent', summary: 'recent', userEmail: 'x' } });
        await assert.rejects(prisma.auditLog.delete({ where: { id: recent.id } }), /append-only/);
        assert.ok(await maintenance.pruneAudit() >= 1);
        assert.equal(await prisma.auditLog.findUnique({ where: { id: old.id } }), null);
        assert.ok(await prisma.auditLog.findUnique({ where: { id: recent.id } }));
    });

    await t.test('message history older than a year goes, except messages still waiting to be sent', async () => {
        const at = new Date(Date.now() - 400 * DAY);
        const sent = await prisma.messageLog.create({ data: { tenantId: h.tenantId, channel: 'SMS', kind: 'CUSTOM', body: 'a', status: 'SENT', createdAt: at } });
        const queued = await prisma.messageLog.create({ data: { tenantId: h.tenantId, channel: 'SMS', kind: 'CUSTOM', body: 'b', status: 'QUEUED', createdAt: at, deletedAt: new Date() } });
        const fresh = await prisma.messageLog.create({ data: { tenantId: h.tenantId, channel: 'WHATSAPP', kind: 'CUSTOM', body: 'c' } });
        await maintenance.pruneMessages();
        assert.equal(await prisma.messageLog.findUnique({ where: { id: sent.id } }), null);
        assert.ok(await prisma.messageLog.findUnique({ where: { id: queued.id } }));
        assert.ok(await prisma.messageLog.findUnique({ where: { id: fresh.id } }));
        await prisma.messageLog.delete({ where: { id: queued.id } });
    });

    await t.test('held carts removed more than 30 days ago go; open and recently removed ones stay', async () => {
        const mk = deletedAt => prisma.heldSale.create({ data: { tenantId: h.tenantId, cart: '{}', deletedAt } });
        const gone = await mk(new Date(Date.now() - 40 * DAY)), kept = await mk(new Date(Date.now() - 5 * DAY)), open = await mk(null);
        await maintenance.pruneHeld();
        assert.equal(await prisma.heldSale.findUnique({ where: { id: gone.id } }), null);
        assert.ok(await prisma.heldSale.findUnique({ where: { id: kept.id } }));
        assert.ok(await prisma.heldSale.findUnique({ where: { id: open.id } }));
    });

    await t.test('the activity log no longer feeds the sync log (PCs never download it)', async () => {
        const before = await prisma.changeLog.count({ where: { tenantId: h.tenantId, tbl: 'AuditLog' } });
        await prisma.auditLog.create({ data: { tenantId: h.tenantId, action: 'test.x', summary: 'x', userEmail: 'x' } });
        assert.equal(await prisma.changeLog.count({ where: { tenantId: h.tenantId, tbl: 'AuditLog' } }), before);
    });

    await t.test('storage card: only the super admin; shows size, limit and biggest tables; clean up now', async () => {
        assert.equal((await h.get('/api/admin/storage')).status, 403);
        const st = await call('GET', '/api/admin/storage', undefined, h.adminToken);
        assert.equal(st.status, 200, JSON.stringify(st.data));
        assert.ok(st.data.bytes > 0);
        assert.equal(st.data.limitBytes, 500 * 1024 * 1024);
        assert.ok(['ok', 'warning', 'danger'].includes(st.data.level));
        assert.ok(st.data.tables.length > 0 && st.data.tables[0].name);
        assert.equal((await call('GET', '/api/admin/audit?from=2026-13-40', undefined, h.adminToken)).status, 400, 'a malformed date is a clear 400');
        const run = await call('POST', '/api/admin/maintenance', {}, h.adminToken);
        assert.equal(run.status, 200, JSON.stringify(run.data));
        assert.deepEqual(run.data.errors, []);
        assert.ok(run.data.storage.bytes > 0);
    });
});

test('sync log clean-up: a PC set up after it, and a PC that was away longer, download a fresh copy', { timeout: 120000 }, async t => {
    const h = await setup({ name: 'Resync Shop' });
    const rice = (await h.post('/api/inventory/products', { name: 'Rice 5kg', retailPrice: 150000, cost: 120000, openingStock: 40 })).data.id;
    const cust = (await h.post('/api/pos/customers', { name: 'Akram Store', phone: '03001112233' })).data.id;

    await t.test('a shop with no PC keeps no sync log; the floor remembers what was cleaned', async () => {
        assert.ok(await prisma.changeLog.count({ where: { tenantId: h.tenantId } }) > 0);
        await maintenance.pruneChangeLog(new Date(Date.now() + 1000), { tenantId: h.tenantId });
        assert.equal(await prisma.changeLog.count({ where: { tenantId: h.tenantId } }), 0);
        assert.ok(await maintenance.syncFloor(h.tenantId) > 0);
    });

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-pc-'));
    const port = await freePort();
    const pc = startPC(port, path.join(dir, 'pc.db'), h.base);
    t.after(() => { try { pc.kill(); } catch { } });
    await waitFor(async () => (await pcCall(port, 'GET', '/api/desktop/status').catch(() => null))?.data?.isDesktop);

    let token;
    await t.test('activating a PC after the clean-up downloads the whole shop (users, products, stock, customers)', async () => {
        const r = await pcCall(port, 'POST', '/api/desktop/activate', { serverUrl: h.base, email: h.email, password: 'Owner@12345', name: 'Counter 1' });
        assert.equal(r.status, 200, JSON.stringify(r.data) + pc.log());
        assert.ok((await pcCall(port, 'GET', '/api/desktop/status')).data.lastResyncAt, 'downloaded as a fresh copy');
        const login = await pcCall(port, 'POST', '/api/auth/login', { email: h.email, password: 'Owner@12345' });
        assert.equal(login.status, 200, JSON.stringify(login.data));
        token = login.data.token;
        const cat = await pcCall(port, 'GET', '/api/inventory/catalog', null, token);
        assert.equal(cat.data.find(x => x.id === rice).stock, 40);
        const c = await pcCall(port, 'GET', `/api/khata/customers/${cust}`, null, token);
        assert.equal(c.status, 200, JSON.stringify(c.data));
    });

    await t.test('then later cloud changes arrive the normal way', async () => {
        await h.put(`/api/inventory/products/${rice}`, { name: 'Rice 5kg', retailPrice: 155000, cost: 120000 });
        await waitFor(async () => (await pcCall(port, 'GET', '/api/inventory/catalog', null, token)).data.find(x => x.id === rice).retailPrice === 155000);
    });

    await t.test('a PC away for longer than the sync log is kept resyncs, gets what changed, and its own sales still go up', async () => {
        // a held cart the PC knows about, which is resumed on the web while the PC is away (and later cleaned away)
        const held = (await h.post('/api/pos/held', { label: 'Table 4', total: 5000, cart: { lines: [] } })).data;
        await waitFor(async () => ((await pcCall(port, 'GET', '/api/pos/held', null, token)).data || []).some(x => x.id === held.id));
        const dead = `http://127.0.0.1:${await freePort()}`;
        await pcCall(port, 'POST', '/api/desktop/server', { serverUrl: dead }, token);
        // wait for a sync that failed against the dead address (one already running could still finish against the cloud)
        await waitFor(async () => { const s = (await pcCall(port, 'GET', '/api/desktop/status')).data; return s.online === false && /reach|fetch|ECONNREFUSED|failed/i.test(s.error); });
        const offline = await pcCall(port, 'POST', '/api/pos/sales', { items: [{ productId: rice, qty: 2 }], payments: [{ method: 'CASH', amount: 310000 }] }, token);
        assert.equal(offline.status, 200, JSON.stringify(offline.data));
        // meanwhile in the cloud: a new price and a new product, then (as if 15 days passed) the clean-up
        await h.put(`/api/inventory/products/${rice}`, { name: 'Rice 5kg', retailPrice: 160000, cost: 120000 });
        const oil = (await h.post('/api/inventory/products', { name: 'Oil 1L', retailPrice: 55000, cost: 45000, openingStock: 12 })).data.id;
        assert.equal((await h.del('/api/pos/held/' + held.id)).status, 200);
        assert.ok(await maintenance.pruneHeld(new Date(Date.now() + 40 * DAY)) >= 1, 'the removed cart is cleaned away in the cloud');
        const removed = await maintenance.pruneChangeLog(new Date(Date.now() + 15 * DAY), { tenantId: h.tenantId });
        assert.ok(removed > 0);
        const firstResync = (await pcCall(port, 'GET', '/api/desktop/status')).data.lastResyncAt;
        await pcCall(port, 'POST', '/api/desktop/server', { serverUrl: h.base }, token);
        await waitFor(async () => {
            const cat = (await pcCall(port, 'GET', '/api/inventory/catalog', null, token)).data;
            const o = cat.find(x => x.id === oil), r = cat.find(x => x.id === rice);
            return o && o.stock === 12 && r.retailPrice === 160000;
        }, 30000);
        await waitFor(async () => (await pcCall(port, 'GET', '/api/desktop/status')).data.pending === 0);
        // the fresh copy is applied table by table; its time is noted after the last table
        await waitFor(async () => (await pcCall(port, 'GET', '/api/desktop/status')).data.lastResyncAt !== firstResync);
        const cloud = (await h.get('/api/inventory/catalog')).data.find(x => x.id === rice);
        assert.equal(cloud.stock, 38, 'the PC\'s offline sale reached the cloud');
        const pcRice = (await pcCall(port, 'GET', '/api/inventory/catalog', null, token)).data.find(x => x.id === rice);
        assert.equal(pcRice.stock, 38);
        assert.ok(!((await pcCall(port, 'GET', '/api/pos/held', null, token)).data || []).some(x => x.id === held.id), 'the PC no longer offers the resumed cart');
    });
});
