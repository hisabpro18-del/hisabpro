// HisabPro server: the API and the web app. Runs in the cloud (Postgres) and inside the desktop app (SQLite, MODE=desktop).
const path = require('path');
const fs = require('fs');
const express = require('express');
const config = require('./src/config');
const { HttpError } = require('./src/lib/http');

// BigInt paisa from the database go out as plain numbers
BigInt.prototype.toJSON = function () { return Number(this); };

function createApp() {
    const app = express();
    app.disable('x-powered-by');
    if (config.TRUST_PROXY_HOPS) app.set('trust proxy', config.TRUST_PROXY_HOPS);

    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'same-origin');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Permissions-Policy', 'camera=(self), microphone=()');
        res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
        next();
    });
    const json = express.json({ limit: '6mb' });
    app.use((req, res, next) => (req.path === '/api/sync/push' ? next() : json(req, res, next))); // sync push parses its own (20 MB)

    app.get('/healthz', (req, res) => res.json({ ok: true, mode: config.MODE }));

    // every file in src/routes registers itself: { router, mount, cloudOnly?, desktopOnly? }
    const dir = path.join(__dirname, 'src', 'routes');
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()) {
        const mod = require(path.join(dir, f));
        if (!mod.router || !mod.mount) continue;
        if (mod.cloudOnly && config.isDesktop) continue;
        if (mod.desktopOnly && !config.isDesktop) continue;
        app.use(mod.mount, mod.router);
    }
    app.use('/api', (req, res, next) => next(new HttpError(404, 'Not found.')));

    // the web app: static files, and index.html for every other path (the app routes in the browser)
    const pub = path.join(__dirname, 'public');
    app.use(express.static(pub, { index: false, maxAge: config.isDesktop ? 0 : '1h' }));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(pub, 'index.html')));

    // errors → JSON { error }
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
        if (err && err.type === 'entity.too.large') err = new HttpError(413, 'That is too large to upload.');
        if (err && err.type === 'entity.parse.failed') err = new HttpError(400, 'The request could not be read.');
        const status = err instanceof HttpError ? err.status : 500;
        if (status >= 500) console.error(req.method, req.originalUrl, err);
        const body = { error: status >= 500 ? 'Something went wrong on the server. Please try again.' : err.message };
        for (const k of ['readOnly', 'offlineLimit', 'code']) if (err && err[k]) body[k] = err[k];
        res.status(status).json(body);
    });
    return app;
}

// start listening (and, on a desktop PC, the local database and the sync worker)
async function startServer(port = config.PORT) {
    if (config.isDesktop) await require('./src/sync/client').start();
    else if (process.env.HP_NO_SCHEDULER !== '1') require('./src/services/scheduler').start(); // automatic SMS reminders
    const app = createApp();
    return new Promise(resolve => {
        const srv = app.listen(port, config.isDesktop ? '127.0.0.1' : undefined, () => {
            console.log(`HisabPro (${config.MODE}) on http://localhost:${srv.address().port}`);
            resolve(srv);
        });
    });
}

if (require.main === module) startServer().catch(e => { console.error(e); process.exit(1); });

module.exports = { createApp, startServer };
