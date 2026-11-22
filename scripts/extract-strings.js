// Collects the English interface text of every screen (for the Urdu dictionary): text between tags in html`` templates and
// quoted strings that look like labels. Writes scripts/strings-en.json (unique, sorted).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'public', 'js');
const files = [...fs.readdirSync(path.join(root, 'pages')).map(f => path.join(root, 'pages', f)), ...['shell.js', 'app.js', 'ui.js', 'print.js'].map(f => path.join(root, 'core', f))];
const out = new Set();
const looksUi = s => {
    s = s.trim();
    if (s.length < 2 || s.length > 160) return false;
    if (!/[A-Za-z]/.test(s)) return false;
    if (/^[a-z0-9_.\-]+$/.test(s)) return false; // keys, classes, ids
    if (/(^|\s)(btn|flex|grid|text-|bg-|border|rounded|px-|py-|mt-|mb-|w-|h-|gap-|items-|justify-|col-span|hidden|card|input|label|badge|chip|seg|tbl|num|eyebrow)/.test(s) && !/[A-Z][a-z]+ [a-z]/.test(s)) return false;
    if (/[{}<>=;`$\\]|=>|\/api\/|\.js|https?:|^#|^\.|\(\)/.test(s)) return false;
    if (/^[A-Z_]{2,}$/.test(s) && !/\s/.test(s) && s.length > 12) return false;
    return true;
};
for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    // text nodes inside templates: >text<
    for (const m of src.matchAll(/>([^<>`${}]{2,160})</g)) { const s = m[1].replace(/\s+/g, ' ').trim(); if (looksUi(s)) out.add(s); }
    // quoted strings
    for (const m of src.matchAll(/'((?:[^'\\\n]|\\.){2,160})'|"((?:[^"\\\n]|\\.){2,160})"/g)) { const s = (m[1] || m[2]).replace(/\\'/g, "'").trim(); if (looksUi(s) && /[A-Z]/.test(s[0]) ) out.add(s); }
}
const list = [...out].filter(s => !/[؀-ۿ]/.test(s)).sort();
fs.writeFileSync(path.join(__dirname, 'strings-en.json'), JSON.stringify(list, null, 1));
console.log(list.length, 'strings');
