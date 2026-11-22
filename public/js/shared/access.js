// A client's access period (as in digital-invoice): the last day of access, then grace days (3 for a monthly period, 7 for
// a yearly one), then the client becomes read-only by itself. Used by the server and the super admin screens.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Access = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const UNITS = ['MONTH', 'YEAR'];
    const GRACE_DAYS = { MONTH: 3, YEAR: 7 };
    const MAX_COUNT = { MONTH: 120, YEAR: 20 };
    const DAY = 86400000;
    const PK_OFFSET = 5 * 3600000; // Pakistan time, no daylight saving

    // the Pakistan calendar day of an instant, as 'YYYY-MM-DD'
    const pkDay = d => new Date(new Date(d).getTime() + PK_OFFSET).toISOString().slice(0, 10);
    // 00:00 Pakistan time of a 'YYYY-MM-DD'
    const pkMidnight = ymd => new Date(Date.parse(ymd + 'T00:00:00Z') - PK_OFFSET);

    // a period from a start day: start + N months/years − 1 day is the last day of access
    function endOf(startYmd, unit, count) {
        const [y, m, d] = startYmd.split('-').map(Number);
        const months = (unit === 'YEAR' ? 12 : 1) * count;
        const end = new Date(Date.UTC(y, m - 1 + months, d));
        if (end.getUTCDate() !== d) end.setUTCDate(0); // 31 Jan + 1 month → 28/29 Feb
        end.setUTCDate(end.getUTCDate() - 1);
        return end.toISOString().slice(0, 10);
    }

    // status today: { status: NONE | ACTIVE | GRACE | EXPIRED, endsOn, graceUntil, daysLeft }
    function access(tenant, now) {
        if (!tenant || !tenant.accessEndsAt) return { status: 'NONE' };
        const endsOn = pkDay(tenant.accessEndsAt);
        const grace = GRACE_DAYS[tenant.accessUnit] || GRACE_DAYS.MONTH;
        const graceEnd = new Date(pkMidnight(endsOn).getTime() + (grace + 1) * DAY); // end of the last grace day
        const accessEnd = new Date(pkMidnight(endsOn).getTime() + DAY);
        const t = new Date(now || Date.now()).getTime();
        const graceUntil = pkDay(graceEnd.getTime() - 1);
        if (t < accessEnd.getTime()) return { status: 'ACTIVE', endsOn, graceUntil, daysLeft: Math.ceil((accessEnd.getTime() - t) / DAY) };
        if (t < graceEnd.getTime()) return { status: 'GRACE', endsOn, graceUntil, daysLeft: 0 };
        return { status: 'EXPIRED', endsOn, graceUntil, daysLeft: 0 };
    }

    // what the client may do: FULL, READ_ONLY (period and grace over) or BLOCKED (switched off by the administrator)
    function mode(tenant, now) {
        if (!tenant) return { mode: 'BLOCKED', message: 'Your account was not found.' };
        if (!tenant.active && tenant.inactiveReason !== 'EXPIRED') return { mode: 'BLOCKED', message: 'This account has been switched off. Please contact HisabPro.' };
        const a = access(tenant, now);
        if (a.status === 'EXPIRED' || (!tenant.active && tenant.inactiveReason === 'EXPIRED'))
            return { mode: 'READ_ONLY', message: `Your HisabPro subscription ended on ${a.endsOn || 'its end date'}. You can view and print your records; please renew to make changes.` };
        return { mode: 'FULL', access: a };
    }

    return { UNITS, GRACE_DAYS, MAX_COUNT, pkDay, pkMidnight, endOf, access, mode };
});
