// Sale / purchase money maths. The SAME file runs in the browser (POS preview) and on the server (what is saved), so the
// cashier's screen always equals the stored bill. All money is integer paisa (Rs 1 = 100); quantities are numbers.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // half-up rounding to a whole paisa (also for negatives: -2.5 → -3)
    const round = x => (x < 0 ? -Math.round(-x) : Math.round(x));
    const q3 = x => Math.round((Number(x) || 0) * 1000) / 1000; // quantities: 3 decimals
    // rupees typed by a person → paisa
    const toPaisa = rupees => round((Number(String(rupees ?? '').replace(/,/g, '')) || 0) * 100);
    const toRupees = paisa => (Number(paisa) || 0) / 100;

    // Rate of the default POS taxes: simple ones add up, a "combine" (compound) tax applies on top of the others.
    // taxes = [{ rate, combine, active }]
    function effectiveRate(taxes) {
        const live = (taxes || []).filter(t => t && t.active !== false);
        const simple = live.filter(t => !t.combine).reduce((s, t) => s + (Number(t.rate) || 0), 0);
        let factor = 1 + simple / 100;
        for (const t of live.filter(t => t.combine)) factor *= 1 + (Number(t.rate) || 0) / 100;
        return Math.round((factor - 1) * 100 * 10000) / 10000;
    }

    // lines: [{ qty, price (paisa per unit), lineDiscount (paisa), taxRate (percent; 0 → defaultRate) }]
    // opts: { discountType: 'AMOUNT'|'PERCENT', discountValue (rupees for AMOUNT, percent for PERCENT), defaultRate }
    // Prices exclude tax. The bill discount is shared over the lines in proportion to their value (the last line takes
    // the rounding rest, so the shares add up exactly), and tax is worked out per line on what is left.
    function bill(lines, opts) {
        const o = opts || {};
        const rows = (lines || []).map(l => {
            const gross = round(q3(l.qty) * (Number(l.price) || 0));
            const lineDiscount = Math.min(Math.max(round(Number(l.lineDiscount) || 0), 0), Math.max(gross, 0));
            return { gross, lineDiscount, rate: Number(l.taxRate) > 0 ? Number(l.taxRate) : Number(o.defaultRate) || 0 };
        });
        const afterLine = rows.reduce((s, r) => s + r.gross - r.lineDiscount, 0);
        let billDiscount = o.discountType === 'PERCENT'
            ? round(afterLine * Math.min(Math.max(Number(o.discountValue) || 0, 0), 100) / 100)
            : toPaisa(o.discountValue);
        billDiscount = Math.min(Math.max(billDiscount, 0), Math.max(afterLine, 0));

        // whole-paisa shares that add up exactly and never exceed what a line is worth (largest remainder: each line gets
        // the floor of its exact share, the paisa left go to the biggest fractions; a tie goes to the later line).
        // Half-up rounding per line with the rest on the last line could over-give and leave the last line a negative share.
        const shares = rows.map(() => 0);
        if (billDiscount && afterLine > 0) {
            const exact = rows.map(r => billDiscount * (r.gross - r.lineDiscount) / afterLine);
            exact.forEach((x, i) => { shares[i] = Math.max(Math.floor(x), 0); });
            let left = billDiscount - shares.reduce((s, x) => s + x, 0);
            const order = exact.map((x, i) => i).sort((a, b) => (exact[b] - shares[b]) - (exact[a] - shares[a]) || b - a);
            for (const i of order) {
                if (left <= 0) break;
                if (shares[i] < rows[i].gross - rows[i].lineDiscount) { shares[i]++; left--; }
            }
        }
        const out = rows.map((r, i) => {
            const share = shares[i];
            const discount = r.lineDiscount + share;
            const net = r.gross - discount;
            const tax = round(net * r.rate / 100);
            return { gross: r.gross, discount, net, taxRate: r.rate, tax, total: net + tax };
        });
        const subtotal = rows.reduce((s, r) => s + r.gross, 0);
        const discount = out.reduce((s, r) => s + r.discount, 0);
        const tax = out.reduce((s, r) => s + r.tax, 0);
        return { lines: out, subtotal, discount, tax, total: subtotal - discount + tax };
    }

    // payments: [{ method, amount }]. Walk-in: change goes back for cash. Returns what is kept.
    function settle(total, payments) {
        const tendered = (payments || []).reduce((s, p) => s + Math.max(round(Number(p.amount) || 0), 0), 0);
        const change = Math.max(tendered - total, 0);
        const paid = tendered - change;
        return { tendered, paid, change, due: Math.max(total - paid, 0) };
    }

    // "Six Hundred Forty Rupees Only" (Pakistani grouping: thousand, lakh, crore)
    function words(paisa) {
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const two = n => (n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : ''));
        const three = n => (n >= 100 ? ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + two(n % 100) : '') : two(n));
        const say = n => {
            if (n === 0) return 'Zero';
            const parts = [];
            const crore = Math.floor(n / 1e7); n %= 1e7;
            const lakh = Math.floor(n / 1e5); n %= 1e5;
            const thousand = Math.floor(n / 1e3); n %= 1e3;
            if (crore) parts.push(say(crore) + ' Crore');
            if (lakh) parts.push(two(lakh) + ' Lakh');
            if (thousand) parts.push(two(thousand) + ' Thousand');
            if (n) parts.push(three(n));
            return parts.join(' ');
        };
        const p = Math.abs(round(Number(paisa) || 0));
        const rs = Math.floor(p / 100), ps = p % 100;
        return say(rs) + ' Rupees' + (ps ? ' and ' + two(ps) + ' Paisa' : '') + ' Only';
    }

    return { round, q3, toPaisa, toRupees, effectiveRate, bill, settle, words };
});
