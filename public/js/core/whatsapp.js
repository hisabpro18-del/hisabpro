// WhatsApp from the shop's own account (as in Honda-Admin): the chat opens with the message typed, nothing is sent until the
// person at the counter presses send. Free — no gateway, no WhatsApp Business API.
(function () {
    'use strict';
    const LRM = '‎';
    // a Pakistani mobile in the form WhatsApp needs (923001234567), or null (landlines have no WhatsApp)
    function number(phone) {
        let d = String(phone || '').replace(/\D/g, '');
        if (d.startsWith('0092')) d = d.slice(2);
        if (d.length === 11 && d.startsWith('03')) d = '92' + d.slice(1);
        else if (d.length === 10 && d.startsWith('3')) d = '92' + d;
        return d.length === 12 && d.startsWith('923') ? d : null;
    }
    // where the chat opens: the WhatsApp app on this computer (default) or WhatsApp Web; chosen per computer
    const target = () => { try { return localStorage.getItem('hp.waTarget') === 'web' ? 'web' : 'app'; } catch { return 'app'; } };
    const setTarget = t => { try { t === 'app' ? localStorage.removeItem('hp.waTarget') : localStorage.setItem('hp.waTarget', t); } catch { } };
    const q = (n, text) => `phone=${n}&text=${encodeURIComponent(text)}`;
    // call straight from a click handler (a browser opens apps / tabs only from the click itself)
    function open(phone, text, onNotOpened) {
        const n = number(phone);
        if (!n) { HP.ui.toast('This number is not a Pakistani mobile (e.g. 0300-1234567), so it has no WhatsApp.', 'error'); return false; }
        if (target() === 'web' || window.hpDesktop) { window.open(`https://web.whatsapp.com/send?${q(n, text)}`, '_blank', 'noopener'); return true; }
        window.location.href = `whatsapp://send?${q(n, text)}`;
        let left = false;
        const leave = () => { left = true; };
        window.addEventListener('blur', leave); document.addEventListener('visibilitychange', leave);
        setTimeout(() => {
            window.removeEventListener('blur', leave); document.removeEventListener('visibilitychange', leave);
            if (!left && document.hasFocus()) (onNotOpened || (() => { if (confirm('WhatsApp did not open on this computer. Open WhatsApp Web instead?')) { setTarget('web'); window.open(`https://web.whatsapp.com/send?${q(n, text)}`, '_blank', 'noopener'); } }))();
        }, 3000);
        return true;
    }
    // {placeholders}; a null value drops its whole line; unknown {words} stay visible so a typo shows in the preview
    const fill = (template, values) => String(template || '')
        .split('\n').filter(line => ![...line.matchAll(/\{(\w+)\}/g)].some(([, k]) => k in values && values[k] === null)).join('\n')
        .replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] ?? '' : m))
        .replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    // numbers / phones / dates stay left-to-right inside an Urdu line
    const ltr = v => `${LRM}${v}${LRM}`;
    const numericDate = ymd => { const [y, m, d] = String(ymd).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
    const rs = paisa => `${HP.fmt.sym()} ${((Number(paisa) || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    HP.wa = { number, open, fill, ltr, numericDate, rs, target, setTarget };
})();
