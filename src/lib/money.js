// Money on the server: the database holds BigInt paisa; the API speaks plain numbers of paisa.
const Calc = require('../../public/js/shared/calc');
const { HttpError } = require('./http');

const B = n => BigInt(Calc.round(Number(n) || 0)); // number of paisa → BigInt for the database
const N = b => (b === null || b === undefined ? 0 : Number(b)); // BigInt from the database → number

// paisa sent by the browser (already converted from rupees there): a whole, non-negative number
function paisa(v, label, { allowNegative = false, max = 1e14 } = {}) {
    if (v === '' || v === undefined || v === null) return 0;
    const n = Number(v);
    if (!Number.isFinite(n) || (!allowNegative && n < 0) || Math.abs(n) > max) throw new HttpError(400, `${label} is not a valid amount.`);
    return Calc.round(n);
}

module.exports = { B, N, paisa, Calc };
