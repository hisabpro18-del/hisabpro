// Calendar days in the shop's time zone (default Asia/Karachi). Reports, "today" and date ranges use these.
const DAY = 86400000;

// offset of a time zone at an instant, in ms (local wall clock − UTC)
function offsetMs(tz, at) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(at).reduce((o, p) => (o[p.type] = p.value, o), {});
    const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
    return wall - Math.floor(at.getTime() / 1000) * 1000;
}
const safeTz = tz => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return 'Asia/Karachi'; } };

// 'YYYY-MM-DD' of an instant in tz
const ymd = (at, tz = 'Asia/Karachi') => new Date(new Date(at).getTime() + offsetMs(safeTz(tz), new Date(at))).toISOString().slice(0, 10);
// the instant of 00:00 of a 'YYYY-MM-DD' in tz
function startOf(day, tz = 'Asia/Karachi') {
    const guess = Date.parse(day + 'T00:00:00Z');
    return new Date(guess - offsetMs(safeTz(tz), new Date(guess)));
}
// a real calendar day 'YYYY-MM-DD' (2026-13-01 or 2026-02-30 are not)
const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);

// A named period → { from, to (exclusive), fromDay, toDay, days[] } in tz. Custom: from/to 'YYYY-MM-DD' (inclusive).
function range(preset, { from, to, tz = 'Asia/Karachi', fiscalStartMonth = 7, now = new Date() } = {}) {
    const today = ymd(now, tz);
    const [y, m] = today.split('-').map(Number);
    let a, b; // inclusive days
    switch (preset) {
        case 'today': a = b = today; break;
        case 'yesterday': a = b = addDays(today, -1); break;
        case 'week': { const dow = new Date(today + 'T00:00:00Z').getUTCDay(); a = addDays(today, -((dow + 6) % 7)); b = today; break; } // Monday start
        case 'last30': a = addDays(today, -29); b = today; break;
        case 'lastMonth': { const d = new Date(Date.UTC(y, m - 2, 1)); a = d.toISOString().slice(0, 10); b = addDays(`${y}-${String(m).padStart(2, '0')}-01`, -1); break; }
        case 'year': a = `${y}-01-01`; b = today; break;
        case 'fiscal': { const fy = m >= fiscalStartMonth ? y : y - 1; a = `${fy}-${String(fiscalStartMonth).padStart(2, '0')}-01`; b = today; break; }
        case 'custom': a = isDay(from) ? from : today; b = isDay(to) ? to : today; if (b < a) [a, b] = [b, a]; break;
        case 'month': default: a = `${y}-${String(m).padStart(2, '0')}-01`; b = today; break;
    }
    const days = [];
    for (let d = a; d <= b && days.length < 1100; d = addDays(d, 1)) days.push(d);
    return { from: startOf(a, tz), to: startOf(addDays(b, 1), tz), fromDay: a, toDay: b, days };
}

// the period of the same length just before (for "vs last period")
function previous(r, tz = 'Asia/Karachi') {
    const n = r.days.length;
    const b = addDays(r.fromDay, -1), a = addDays(r.fromDay, -n);
    return { from: startOf(a, tz), to: startOf(r.fromDay, tz), fromDay: a, toDay: b, days: [] };
}

module.exports = { ymd, startOf, addDays, isDay, range, previous, DAY };
