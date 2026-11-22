// Desktop app only: status for the online/offline pill, first-time activation of this PC, and "sync now".
const express = require('express');
const { HttpError } = require('../lib/http');
const { authenticate, can } = require('../auth');
const client = require('../sync/client');

const router = express.Router();

router.get('/status', async (req, res) => { await client.refreshPending(); res.json(client.status()); });

router.post('/activate', async (req, res) => {
    if (client.status().activated) throw new HttpError(400, 'This PC is already set up.');
    const b = req.body || {};
    if (!b.email || !b.password) throw new HttpError(400, 'Enter the owner\'s or a manager\'s email and password.');
    try { res.json(await client.activate(b)); }
    catch (e) { throw new HttpError(e.status && e.status < 500 ? e.status : 400, e.message); }
});

router.post('/sync', authenticate, async (req, res) => res.json(await client.syncOnce()));

// the owner can point the PC at another server address (e.g. the domain changed)
router.post('/server', authenticate, can('settings.manage'), async (req, res) => {
    const url = String(req.body?.serverUrl || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s]+$/.test(url)) throw new HttpError(400, 'Enter an address like https://hisabpro.com');
    await client.setServer(url);
    res.json(client.status());
});

module.exports = { router, mount: '/api/desktop', desktopOnly: true };
