// Cloud-only background jobs (every 5 minutes):
//   - automatic SMS for payment promises due today (or N days before), at most once a day per promise, after the
//     shop's chosen hour — only for shops that switched SMS and automatic reminders on
//   - SMS queued on desktop PCs (they cannot reach the gateway themselves) are sent once their rows have synced up
// Each message is claimed by a conditional update first, so two server instances never send the same message twice.
const { prisma, isDesktop } = require('../db');
const settings = require('./settings');
const sms = require('./sms');
const ledger = require('./ledger');
const dates = require('../lib/dates');
const { N } = require('../lib/money');
const { promiseValues } = require('./khata');

let timer = null;

async function runOnce(now = new Date()) {
    if (isDesktop) return { skipped: true };
    // Two server instances may run this at once. Each message is claimed first with a conditional update and only the
    // instance whose update changed the row sends it. (A session advisory lock does not work here: with a connection pool
    // or pgbouncer the unlock can run on another connection, so the lock leaks and is shared.)
    const out = { promised: 0, queued: 0, failed: 0 };
    // 1. SMS queued by desktop PCs (or by a web request that could not send at once)
    const queued = await prisma.messageLog.findMany({ where: { channel: 'SMS', status: 'QUEUED', deletedAt: null }, take: 200, orderBy: { createdAt: 'asc' } });
    for (const q of queued) {
        const claim = await prisma.messageLog.updateMany({ where: { id: q.id, status: 'QUEUED' }, data: { status: 'SENDING' } });
        if (!claim.count) continue;
        const r = await sms.send(q.tenantId, q.to, q.body);
        await prisma.messageLog.update({ where: { id: q.id }, data: { status: r.status, provider: r.provider, error: r.error } });
        r.status === 'FAILED' ? out.failed++ : out.queued++;
    }
    // 2. automatic promise reminders
    const tenants = await prisma.tenant.findMany({ where: { active: true, deletedAt: null }, select: { id: true, name: true } });
    for (const t of tenants) {
        const m = await settings.get(t.id, 'messaging');
        if (!m.smsEnabled || !m.autoPromise) continue;
        const loc = await settings.get(t.id, 'localization');
        const tz = loc.timezone || 'Asia/Karachi';
        const today = dates.ymd(now, tz);
        const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(now));
        if (hour < (Number(m.sendHour) || 0)) continue;
        const days = [today, ...(Number(m.daysBefore) > 0 ? [dates.addDays(today, Number(m.daysBefore))] : [])];
        const due = await prisma.paymentPromise.findMany({ where: { tenantId: t.id, status: 'PENDING', deletedAt: null, promisedDate: { in: days }, NOT: { lastAutoDay: today } } });
        if (!due.length) continue;
        const company = await settings.get(t.id, 'company');
        for (const p of due) {
            const party = await prisma.party.findFirst({ where: { id: p.partyId, tenantId: t.id, deletedAt: null } });
            if (!party || !sms.msisdn(party.phone)) continue;
            const balance = await ledger.balance(t.id, party.id, false);
            if (balance <= 0) continue; // nothing owed any more
            // at most one a day: the day is marked before sending, by exactly one instance
            const claim = await prisma.paymentPromise.updateMany({ where: { id: p.id, tenantId: t.id, status: 'PENDING', NOT: { lastAutoDay: today } }, data: { lastAutoDay: today } });
            if (!claim.count) continue;
            const body = sms.fill(m.language === 'en' ? m.promiseEn : m.promiseUr, promiseValues({ party, promise: p, balance, company, shopName: company.name || t.name, today }));
            const r = await sms.send(t.id, party.phone, body, m);
            await prisma.messageLog.create({ data: { tenantId: t.id, partyId: party.id, channel: 'SMS', kind: 'PROMISE_REMINDER', to: party.phone, body, status: r.status, provider: r.provider, error: r.error, refId: p.id } });
            if (r.status !== 'FAILED') await prisma.paymentPromise.update({ where: { id: p.id }, data: { remindedAt: new Date(), remindCount: { increment: 1 } } });
            r.status === 'FAILED' ? out.failed++ : out.promised++;
        }
    }
    return out;
}

function start(intervalMs = 5 * 60000) {
    if (isDesktop || timer) return;
    const tick = async () => { try { await runOnce(); } catch (e) { console.error('scheduler:', e.message); } timer = setTimeout(tick, intervalMs); };
    timer = setTimeout(tick, 15000);
}

module.exports = { runOnce, start, N };
