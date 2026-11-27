// SMS through the shop's own gateway. Pakistani SMS providers differ, so the gateway is a URL (and optional body)
// template with placeholders — it fits any HTTP SMS API. Provider 'LOG' is test mode: the message is only logged.
//   {to} 923001234567   {to0} 03001234567   {message} the text (URL-encoded in the URL)   {sender} sender id/mask
//   {apikey} / {secret} the shop's keys (kept server-side in Secret, never synced to PCs)
const { prisma } = require('../db');
const settings = require('./settings');

// Pakistani mobile → 923001234567 (or null). Accepts 0300-1234567, 3001234567, +92 300…, 0092300…
function msisdn(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.startsWith('0092')) d = d.slice(2);
    if (d.length === 11 && d.startsWith('03')) d = '92' + d.slice(1);
    else if (d.length === 10 && d.startsWith('3')) d = '92' + d;
    return d.length === 12 && d.startsWith('923') ? d : null;
}

// the Windows app's database has no Secret table (keys stay on the server): there they are simply not set. Reading one
// there used to throw, which broke every WhatsApp button on a PC ("Something went wrong on the server").
async function secret(tenantId, key) {
    if (!prisma.secret) return '';
    const s = await prisma.secret.findUnique({ where: { id: `${tenantId}:${key}` } });
    return s ? s.value : '';
}
async function setSecret(tenantId, key, value) {
    const id = `${tenantId}:${key}`;
    if (!prisma.secret) return;
    if (!value) { await prisma.secret.deleteMany({ where: { id } }); return; }
    await prisma.secret.upsert({ where: { id }, create: { id, tenantId, key, value }, update: { value, updatedAt: new Date() } });
}

// The keys only ever go to the gateway address they were saved for. Whoever can edit the URL template (a manager with
// settings, or a shop PC through sync) could otherwise point it at their own server and receive the key with the next SMS.
const ORIGIN = 'smsKeyOrigin';
const originOf = u => { try { return new URL(u).origin; } catch { return ''; } };
const templateOrigin = tpl => originOf(String(tpl || '').replace(/\{(to|to0|sender|apikey|secret|message)\}/g, 'x'));
// called when the shop saves its key / secret: binds them to the gateway's current address
// (no address yet → 'none': the key must be typed again once the address is set)
async function bindKeys(tenantId, urlTemplate) { await setSecret(tenantId, ORIGIN, templateOrigin(urlTemplate) || 'none'); }

// → { status: 'SENT' | 'FAILED' | 'LOGGED', provider, error }
async function send(tenantId, to, text, cfg) {
    const m = cfg || await settings.get(tenantId, 'messaging');
    const num = msisdn(to);
    if (!num) return { status: 'FAILED', provider: m.provider, error: 'Not a Pakistani mobile number.' };
    if (!m.smsEnabled) return { status: 'FAILED', provider: m.provider, error: 'SMS is switched off in Messaging settings.' };
    if (m.provider === 'LOG') return { status: 'LOGGED', provider: 'LOG', error: '' };
    if (m.provider !== 'HTTP' || !m.urlTemplate) return { status: 'FAILED', provider: m.provider, error: 'No SMS gateway is set up.' };
    const vals = { to: num, to0: '0' + num.slice(2), sender: m.senderId || '', apikey: await secret(tenantId, 'smsApiKey'), secret: await secret(tenantId, 'smsApiSecret') };
    const fill = (tpl, enc) => tpl.replace(/\{(to|to0|sender|apikey|secret|message)\}/g, (x, k) => { const v = k === 'message' ? text : vals[k]; return enc ? encodeURIComponent(v) : v; });
    const url = fill(m.urlTemplate, true);
    if (!/^https?:\/\//.test(url)) return { status: 'FAILED', provider: 'HTTP', error: 'The gateway URL must start with https://' };
    if ((vals.apikey || vals.secret) && /\{(apikey|secret)\}/.test(`${m.urlTemplate} ${m.httpMethod === 'POST' ? m.bodyTemplate || '' : ''}`)) {
        const bound = await secret(tenantId, ORIGIN);
        if (!bound) await setSecret(tenantId, ORIGIN, originOf(url)); // a key saved before this check: bound on first use
        else if (bound !== originOf(url)) return { status: 'FAILED', provider: 'HTTP', error: 'The SMS gateway address changed after the API key was saved. Enter the API key again in Messaging settings.' };
    }
    // a gateway that echoes the request in its error must not put the key into the message log (which PCs and browsers see)
    const hide = str => [vals.apikey, vals.secret].filter(v => v && v.length >= 4).reduce((t, v) => t.split(v).join('••••').split(encodeURIComponent(v)).join('••••'), String(str));
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), 15000);
    try {
        const opts = { method: m.httpMethod === 'POST' ? 'POST' : 'GET', signal: ctl.signal };
        if (opts.method === 'POST' && m.bodyTemplate) {
            const body = fill(m.bodyTemplate, false);
            opts.body = body;
            opts.headers = { 'Content-Type': body.trim().startsWith('{') ? 'application/json' : 'application/x-www-form-urlencoded' };
        }
        const res = await fetch(url, opts);
        const reply = hide((await res.text()).slice(0, 2000)).slice(0, 500);
        if (!res.ok) return { status: 'FAILED', provider: 'HTTP', error: `Gateway answered ${res.status}: ${reply}` };
        if (m.successText && !reply.toLowerCase().includes(m.successText.toLowerCase())) return { status: 'FAILED', provider: 'HTTP', error: `Gateway reply did not contain "${m.successText}": ${reply}` };
        return { status: 'SENT', provider: 'HTTP', error: '' };
    } catch (e) {
        return { status: 'FAILED', provider: 'HTTP', error: e.name === 'AbortError' ? 'The gateway did not answer in 15 seconds.' : hide(e.message) };
    } finally { clearTimeout(tm); }
}

// {name} style templates; a value of null drops the whole line (as in Honda-Admin's WhatsApp kit)
function fill(template, values) {
    return String(template || '')
        .split('\n').filter(line => ![...line.matchAll(/\{(\w+)\}/g)].some(([, k]) => k in values && values[k] === null)).join('\n')
        .replace(/\{(\w+)\}/g, (x, k) => (k in values ? values[k] ?? '' : x))
        .replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { msisdn, send, fill, secret, setSecret, bindKeys };
