// Safe HTML templates: html`<b>${name}</b>` escapes every value; nested html`` and raw() are inserted as-is.
// Pages build their markup with this, so text from the database can never inject script.
(function () {
    'use strict';
    class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
    const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
    const esc = v => String(v ?? '').replace(/[&<>"'`]/g, c => ESC[c]);
    const render = v => {
        if (v === null || v === undefined || v === false) return '';
        if (v instanceof Safe) return v.s;
        if (Array.isArray(v)) return v.map(render).join('');
        return esc(v);
    };
    const html = (strings, ...vals) => new Safe(strings.reduce((out, s, i) => out + s + (i < vals.length ? render(vals[i]) : ''), ''));
    const raw = s => new Safe(String(s ?? ''));
    // class list from strings / {class: condition}
    const cls = (...a) => a.flatMap(x => (x && typeof x === 'object' ? Object.entries(x).filter(([, v]) => v).map(([k]) => k) : [x])).filter(Boolean).join(' ');

    window.HP = window.HP || {};
    Object.assign(window.HP, { html, raw, esc, cls, Safe });
})();
