// ESC/POS for thermal receipt printers (58 / 80 mm). The receipt is sent as a picture (raster image), so Urdu text,
// the shop logo, barcodes and QR codes print exactly as on screen — plain-text ESC/POS cannot print Urdu.
// Shared: the Android app uses it in the browser (public/js/core/native.js); tests run it in node.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.EscPos = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const ESC = 0x1b, GS = 0x1d;
    // printable dots per line at 203 dpi: 58 mm paper → 384 dots (48 mm), 80 mm paper → 576 dots (72 mm)
    const DOTS = { 58: 384, 80: 576 };

    // RGBA pixels (canvas getImageData().data) → 1 bit per pixel, rows of whole bytes, most significant bit first, 1 = black
    function toMono(rgba, width, height, threshold = 165) {
        const bytesPerRow = Math.ceil(width / 8);
        const data = new Uint8Array(bytesPerRow * height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                const a = rgba[i + 3] / 255;
                // transparent counts as white paper
                const lum = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * a + 255 * (1 - a);
                if (lum < threshold) data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
            }
        }
        return { data, bytesPerRow, height };
    }

    // drop blank rows at the bottom (the drawing is made a little taller than measured, to never cut the last line)
    function trim(mono, keep = 8) {
        let last = mono.height - 1;
        const row = y => mono.data.subarray(y * mono.bytesPerRow, (y + 1) * mono.bytesPerRow);
        while (last >= 0 && row(last).every(b => b === 0)) last--;
        const height = Math.min(mono.height, last + 1 + keep);
        return { data: mono.data.subarray(0, height * mono.bytesPerRow), bytesPerRow: mono.bytesPerRow, height };
    }

    // GS v 0: raster bit image, sent in bands (small printers have small buffers)
    function raster(mono, band = 128) {
        const parts = [];
        for (let y = 0; y < mono.height; y += band) {
            const h = Math.min(band, mono.height - y);
            parts.push(Uint8Array.of(GS, 0x76, 0x30, 0x00, mono.bytesPerRow & 0xff, (mono.bytesPerRow >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff));
            parts.push(mono.data.subarray(y * mono.bytesPerRow, (y + h) * mono.bytesPerRow));
        }
        return parts;
    }

    function concat(parts) {
        const total = parts.reduce((n, p) => n + p.length, 0);
        const out = new Uint8Array(total);
        let at = 0;
        for (const p of parts) { out.set(p, at); at += p.length; }
        return out;
    }

    // a whole print job: initialise, then each picture (one per receipt copy) followed by a paper feed and a cut
    // (printers without a cutter ignore the cut command)
    function job(monos, { feedLines = 4, cut = true } = {}) {
        const parts = [Uint8Array.of(ESC, 0x40)];
        for (const m of monos) {
            parts.push(...raster(m));
            parts.push(Uint8Array.of(ESC, 0x64, feedLines));
            if (cut) parts.push(Uint8Array.of(GS, 0x56, 0x42, 0x00));
        }
        return concat(parts);
    }

    function toBase64(bytes) {
        if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(s);
    }

    return { DOTS, toMono, trim, raster, job, toBase64 };
});
