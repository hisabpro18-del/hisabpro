// Errors with an HTTP status, and small request helpers.
class HttpError extends Error {
    constructor(status, message, extra) {
        super(message);
        this.status = status;
        if (extra) Object.assign(this, extra);
    }
}

// text from a request field: trimmed, capped, never null
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
// a required text field
const need = (v, label, max) => {
    const s = str(v, max);
    if (!s) throw new HttpError(400, `${label} is required.`);
    return s;
};
// a non-negative number (quantity, rate …)
const num = (v, label, { min = 0, max = 1e12, allowEmpty = true } = {}) => {
    if ((v === '' || v === undefined || v === null) && allowEmpty) return 0;
    const n = Number(String(v).replace(/,/g, ''));
    if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${label} must be a number${min === 0 ? ' (0 or more)' : ''}.`);
    return n;
};
const bool = v => v === true || v === 'true' || v === 1 || v === '1' || v === 'on';
const oneOf = (v, list, label, dflt) => {
    if ((v === undefined || v === '' || v === null) && dflt !== undefined) return dflt;
    if (!list.includes(v)) throw new HttpError(400, `${label}: choose one of ${list.join(', ')}.`);
    return v;
};
// a date from 'YYYY-MM-DD' or an ISO string; empty → fallback
const date = (v, fallback = null) => {
    if (!v) return fallback;
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T12:00:00+05:00' : v);
    if (isNaN(d)) throw new HttpError(400, 'Invalid date.');
    return d;
};
const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

module.exports = { HttpError, str, need, num, bool, oneOf, date, isEmail };
