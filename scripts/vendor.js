// Copies the browser libraries into public/vendor, so the app works without internet (desktop) and without a CDN.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'public', 'vendor');
fs.mkdirSync(out, { recursive: true });
const files = [
    ['node_modules/chart.js/dist/chart.umd.min.js', 'chart.umd.min.js'],
    ['node_modules/jsbarcode/dist/JsBarcode.all.min.js', 'JsBarcode.all.min.js'],
    ['node_modules/qrcode-generator/qrcode.js', 'qrcode.js'],
];
// the Urdu interface font (Noto Naskh Arabic, SIL Open Font License), Arabic-script subset only
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });
for (const w of [400, 600, 700]) files.push([`node_modules/@fontsource/noto-naskh-arabic/files/noto-naskh-arabic-arabic-${w}-normal.woff2`, `fonts/naskh-${w}.woff2`]);
for (const [from, to] of files) {
    fs.copyFileSync(path.join(root, from), path.join(out, to));
    console.log('vendor:', to);
}
