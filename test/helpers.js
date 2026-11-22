// Test helper: starts the app on a free port and creates a fresh client (with its owner) through the super admin API.
// Runs against the local development database; every call to setup() makes a new, uniquely named client.
require('dotenv').config({ quiet: true });
BigInt.prototype.toJSON = function () { return Number(this); };
const { createApp } = require('../server');

let server, base;
async function start() {
    if (base) return base;
    server = createApp().listen(0);
    await new Promise(r => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
    server.unref();
    return base;
}

async function call(method, path, body, token) {
    const res = await fetch(base + path, {
        method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data, ok: res.ok };
}

let adminToken;
async function admin() {
    if (adminToken) return adminToken;
    const r = await call('POST', '/api/auth/login', { email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD });
    if (!r.ok) throw new Error('Super admin login failed — run npm run seed. ' + JSON.stringify(r.data));
    adminToken = r.data.token;
    return adminToken;
}

// { tenantId, token (owner), adminToken, get/post/put/patch/del(path, body?, token?), login(email, pw) }
async function setup({ plan = null, name } = {}) {
    await start();
    const at = await admin();
    const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const email = `owner-${tag}@test.hisabpro`;
    const created = await call('POST', '/api/admin/clients', { name: name || `Test Shop ${tag}`, ownerEmail: email, ownerPassword: 'Owner@12345', ownerName: 'Test Owner', plan }, at);
    if (!created.ok) throw new Error('create client failed: ' + JSON.stringify(created.data));
    const login = await call('POST', '/api/auth/login', { email, password: 'Owner@12345' });
    const token = login.data.token;
    const h = {
        tenantId: created.data.id, token, adminToken: at, email, base,
        get: (p, tk) => call('GET', p, undefined, tk ?? token),
        post: (p, b, tk) => call('POST', p, b ?? {}, tk ?? token),
        put: (p, b, tk) => call('PUT', p, b ?? {}, tk ?? token),
        patch: (p, b, tk) => call('PATCH', p, b ?? {}, tk ?? token),
        del: (p, tk) => call('DELETE', p, undefined, tk ?? token),
        call,
        // add a user of this client (through the super admin) and sign them in
        async user(role, permissions) {
            const e = `${role.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@test.hisabpro`;
            const r = await call('POST', `/api/admin/clients/${created.data.id}/users`, { name: role, email: e, role, password: 'User@12345', permissions }, at);
            if (!r.ok) throw new Error('add user failed: ' + JSON.stringify(r.data));
            return (await call('POST', '/api/auth/login', { email: e, password: 'User@12345' })).data.token;
        },
    };
    return h;
}

module.exports = { setup, call, start };
