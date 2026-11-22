// Test helpers: a desktop PC as a real child process (MODE=desktop, its own SQLite file) talking to the cloud app.
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

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

module.exports = { freePort, sleep, waitFor, startPC, pcCall };
