// Formatting: money (paisa in, "Rs 2,575.35" out), quantities, dates in the shop's time zone.
(function () {
    'use strict';
    const S = () => (HP.session && HP.session.settings && HP.session.settings.localization) || {};
    const sym = () => S().currencySymbol || 'Rs';
    const tz = () => { const z = S().timezone || 'Asia/Karachi'; try { new Intl.DateTimeFormat('en', { timeZone: z }); return z; } catch { return 'Asia/Karachi'; } };

    const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
    // paisa → "Rs 1,234.50" (negative: "Rs -1,234.50")
    const money = (paisa, o = {}) => {
        const v = (Number(paisa) || 0) / 100;
        const s = o.whole ? nf0.format(v) : nf2.format(v);
        return (o.sign && v > 0 ? '+' : '') + (o.noSym ? s : `${sym()} ${s}`);
    };
    // short money for chart axes: 20k, 1.2M
    const short = paisa => {
        const v = (Number(paisa) || 0) / 100, a = Math.abs(v);
        if (a >= 1e7) return (v / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr';
        if (a >= 1e5) return (v / 1e5).toFixed(1).replace(/\.0$/, '') + 'L';
        if (a >= 1e3) return (v / 1e3).toFixed(0) + 'k';
        return nf0.format(v);
    };
    const qty = q => { const n = Math.round((Number(q) || 0) * 1000) / 1000; return n.toLocaleString('en-US', { maximumFractionDigits: 3 }); };
    // paisa → value for an <input type=number> in rupees ('' for 0 when blank)
    const rupees = (paisa, blankZero) => { const v = (Number(paisa) || 0) / 100; return blankZero && !v ? '' : String(Math.round(v * 100) / 100); };
    const toPaisa = v => window.Calc.toPaisa(v);

    const dtf = (o) => new Intl.DateTimeFormat('en-GB', { timeZone: tz(), ...o });
    const date = d => (d ? dtf({ day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d)) : '—');
    const time = d => (d ? new Intl.DateTimeFormat('en-US', { timeZone: tz(), hour: 'numeric', minute: '2-digit' }).format(new Date(d)).toLowerCase() : '');
    const dateTime = d => (d ? `${date(d)}, ${time(d)}` : '—');
    // 'YYYY-MM-DD' of an instant in the shop's zone (for <input type=date>)
    const ymd = (d = new Date()) => { const p = dtf({ year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(d)).reduce((o, x) => (o[x.type] = x.value, o), {}); return `${p.year}-${p.month}-${p.day}`; };
    const month = (d = new Date()) => ymd(d).slice(0, 7);
    const longDate = d => dtf({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d)).toUpperCase();
    const pct = (n, d = 1) => `${(Number(n) || 0).toFixed(d)}%`;

    HP.fmt = { money, short, qty, rupees, toPaisa, date, time, dateTime, ymd, month, longDate, pct, sym, tz };
})();
