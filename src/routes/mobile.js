// The Android app asks which APK is the newest (Settings → Phone app, and a one-time notice). The answer comes from
// mobile/release.json, updated (and deployed) whenever a new APK is released — see docs/ANDROID.md.
// Public: no login needed; it only names a version and a download link.
const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const FILE = path.join(__dirname, '..', '..', 'mobile', 'release.json');

function read() {
    try {
        const a = (JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}).android || {};
        const url = /^https:\/\//i.test(String(a.url || '')) ? String(a.url) : '';
        return { version: String(a.version || ''), versionCode: Number(a.versionCode) || 0, url, notes: String(a.notes || '').slice(0, 2000) };
    } catch { return { version: '', versionCode: 0, url: '', notes: '' }; }
}

router.get('/android', (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.json(read()); });

module.exports = { router, mount: '/api/mobile', cloudOnly: true };
