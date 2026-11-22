// /js/pages.bundle.js: every file in public/js/pages joined into one script, so a new screen is just a new file.
const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const dir = path.join(__dirname, '..', '..', 'public', 'js', 'pages');
let cache = null;
function build() {
    if (cache && !process.env.HP_DEV_PAGES) return cache;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
    cache = files.map(f => `/* ${f} */\n;(function(){\n${fs.readFileSync(path.join(dir, f), 'utf8')}\n})();`).join('\n');
    return cache;
}
if (config.MODE === 'cloud' && process.env.NODE_ENV !== 'production') process.env.HP_DEV_PAGES = '1'; // rebuild on every request while developing

const router = express.Router();
router.get('/pages.bundle.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(build());
});

module.exports = { router, mount: '/js' };
