// Khata (udhaar) recovery: Khata Book, a customer's khata, Promises & Reminders (WhatsApp one-click / SMS), Day Close.
// Shared dialogs are on HP.khata so the POS can use them too (receive udhaar at the counter, share a bill on WhatsApp).
const { html, raw, icon, api, ui, fmt, t } = HP;
const has = k => Perms.has(HP.session, k);
const canManage = () => has('parties.manage') || has('finance.manage') || has('sales.create');

const TYPE = {
    OPENING: ['Opening balance', 'ابتدائی بقایا'], SALE: ['Sale (udhaar)', 'فروخت (ادھار)'], PAYMENT_IN: ['Payment received', 'وصولی'], SALE_RETURN: ['Return', 'واپسی'],
    CHEQUE: ['Cheque', 'چیک'], ADJUSTMENT: ['Adjustment', 'ایڈجسٹمنٹ'], PURCHASE: ['Purchase', 'خریداری'], PAYMENT_OUT: ['Payment made', 'ادائیگی'], PURCHASE_RETURN: ['Purchase return', 'خریداری واپسی'],
    UDHAAR: ['Udhaar given', 'ادھار دیا'], BILL: ['Goods received', 'مال آیا'],
};
const typeLabel = (k, lang) => (TYPE[k] || [k, k])[lang === 'ur' ? 1 : 0];
let MSG = null; // messaging settings (templates) cache
const messaging = async (fresh) => { if (!MSG || fresh) MSG = await api.get('/api/khata/messaging'); return MSG; };

function promiseBadge(p) {
    if (!p) return '';
    if (p.status === 'KEPT') return ui.badge('Kept', 'good');
    if (p.status === 'BROKEN') return ui.badge('Broken', 'bad');
    if (p.status === 'CANCELLED') return ui.badge('Cancelled', 'gray');
    if (p.daysLeft < 0) return ui.badge(`${-p.daysLeft} day${p.daysLeft === -1 ? '' : 's'} late`, 'bad');
    if (p.daysLeft === 0) return ui.badge('Today', 'warn');
    return ui.badge(`in ${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'}`, 'accent');
}

// ── message building ──
function values(party, extra = {}) {
    const c = (HP.session.settings && HP.session.settings.company) || {};
    return { name: party.name, shop: HP.session.tenant.name, balance: HP.wa.ltr(HP.wa.rs(party.balance)), phone: c.phone ? HP.wa.ltr(c.phone) : null, ...extra };
}
function promiseExtra(p, today) {
    const days = p.daysLeft !== undefined ? p.daysLeft : 0;
    const d = HP.wa.ltr(HP.wa.numericDate(p.promisedDate));
    return { amount: HP.wa.ltr(HP.wa.rs(p.amount)), date: d, when: days === 0 ? 'آج' : days < 0 ? `${d} کو` : `${d} تک`, whenEn: days === 0 ? 'today' : days < 0 ? `on ${HP.wa.numericDate(p.promisedDate)}` : `by ${HP.wa.numericDate(p.promisedDate)}` };
}

// send dialog: pick language + channel, edit the text, then WhatsApp (opens chat) or SMS (gateway)
async function sendReminder(party, { kind = 'BALANCE_REMINDER', promise = null, extra = {}, refId = null, onDone } = {}) {
    let m;
    try { m = await messaging(); } catch (err) { return ui.fail(err); }
    let lang = m.language || 'ur';
    const key = { PROMISE_REMINDER: 'promise', BALANCE_REMINDER: 'balance', PAYMENT_THANKS: 'thanks', RECEIPT: 'bill', STATEMENT: 'balance' }[kind] || 'balance';
    const build = () => HP.wa.fill(m[key + (lang === 'ur' ? 'Ur' : 'En')], values(party, { ...(promise ? promiseExtra(promise) : {}), ...extra }));
    const d = ui.modal({
        title: kind === 'PROMISE_REMINDER' ? 'Promise reminder' : kind === 'RECEIPT' ? 'Send bill' : kind === 'PAYMENT_THANKS' ? 'Payment received' : 'Balance reminder',
        subtitle: `${party.name}${party.phone ? ' · ' + party.phone : ' · no phone saved'}`, width: 560,
        body: html`<div class="mb-3 flex items-center justify-between gap-3">${ui.seg('lang', [['ur', 'اردو'], ['en', 'English']], lang)}
            <label class="flex items-center gap-2 text-xs text-muted">Open WhatsApp in <select class="input h-8 w-36" data-target><option value="app" ${HP.wa.target() === 'app' ? raw('selected') : ''}>WhatsApp app</option><option value="web" ${HP.wa.target() === 'web' ? raw('selected') : ''}>WhatsApp Web</option></select></label></div>
          <div class="mb-3"><label class="label">Mobile (WhatsApp / SMS)</label><input class="input" data-phone value="${party.phone || ''}" placeholder="0300-1234567"></div>
          <textarea class="input font-sans" rows="10" data-text dir="auto">${build()}</textarea>
          <p class="help">${m.smsEnabled ? 'SMS goes through the shop\'s SMS gateway' + (m.provider === 'LOG' ? ' (test mode: only logged).' : '.') : 'SMS is off — turn it on in Promises & Reminders → Messaging settings.'} WhatsApp opens the chat; press send there.</p>`,
        footer: html`<button class="btn btn-outline" data-close>${t('Cancel')}</button><button class="btn btn-outline" data-sms ${m.smsEnabled ? '' : raw('disabled')}>${icon('receipt')}Send SMS</button><button class="btn btn-primary" data-wa>${icon('arrowRight')}WhatsApp</button>`,
    });
    const ta = d.el.querySelector('[data-text]');
    d.el.addEventListener('click', async e => {
        const s = e.target.closest('[data-seg=lang] [data-v]');
        if (s) { lang = s.dataset.v; d.el.querySelectorAll('[data-seg=lang] button').forEach(b => b.classList.toggle('on', b.dataset.v === lang)); ta.value = build(); return; }
        if (e.target.closest('[data-wa]')) {
            const text = ta.value.trim(), phone = d.el.querySelector('[data-phone]').value.trim();
            if (!HP.wa.open(phone, text)) return;
            api.post('/api/khata/messages/log', { partyId: party.id || null, kind, to: phone, body: text, refId: refId || (promise && promise.id) }).then(() => onDone && onDone()).catch(() => {});
            d.close();
        }
        if (e.target.closest('[data-sms]')) {
            try {
                const r = await api.post('/api/khata/messages/sms', { partyId: party.id || null, to: d.el.querySelector('[data-phone]').value.trim(), kind, body: ta.value.trim(), refId: refId || (promise && promise.id) });
                ui.toast(r.status === 'SENT' ? 'SMS sent' : r.status === 'LOGGED' ? 'SMS logged (test mode)' : r.status === 'QUEUED' ? 'SMS queued: it is sent when this PC is online' : `SMS failed: ${r.error}`, r.status === 'FAILED' ? 'error' : 'ok');
                if (r.status !== 'FAILED') { d.close(); onDone && onDone(); }
            } catch (err) { ui.fail(err); }
        }
    });
    d.el.querySelector('[data-target]').addEventListener('change', e => HP.wa.setTarget(e.target.value));
}

async function receiveDialog(party, onDone) {
    let accounts = [];
    try { accounts = await api.get('/api/finance/accounts'); } catch { /* the cashier picks a method only */ }
    ui.formDrawer({
        title: 'Receive payment', subtitle: `${party.name} · balance ${fmt.money(party.balance)}`, submit: 'Receive',
        body: html`<div class="mb-4 rounded-xl bg-warn-soft px-4 py-3"><div class="eyebrow">${t('Balance')} / بقایا</div><div class="text-2xl font-bold text-warn">${fmt.money(party.balance)}</div></div>
          ${ui.grid(
            ui.field({ label: 'Amount received', name: 'amount', money: true, required: true, value: party.balance > 0 ? party.balance : 0, attr: { autofocus: true } }),
            ui.field({ label: 'Method', name: 'method', type: 'select', half: true, options: [['CASH', 'Cash'], ['BANK', 'Bank transfer'], ['CARD', 'Card'], ['WALLET', 'JazzCash / Easypaisa']] }),
            accounts.length ? ui.field({ label: 'Into account', name: 'accountId', type: 'select', half: true, options: [['', 'Automatic (by method)'], ...accounts.map(a => [a.id, `${a.name}${a.balance !== undefined ? ' — ' + fmt.money(a.balance) : ''}`])] }) : '',
            ui.field({ label: 'Note', name: 'note', placeholder: 'e.g. part payment' }),
            ui.field({ label: 'Send a thank-you on WhatsApp after saving', name: 'thanks', type: 'checkbox', value: !!HP.wa.number(party.phone) }))}`,
        async onSubmit(v, d) {
            const r = await api.post('/api/khata/receive', { partyId: party.id, amount: v.amount, method: v.method, accountId: v.accountId || null, note: v.note });
            d.close();
            ui.toast(`${r.number}: ${fmt.money(r.amount)} received · balance ${fmt.money(r.balance)}`);
            if (v.thanks) sendReminder({ ...party, balance: r.balance }, { kind: 'PAYMENT_THANKS', extra: { amount: HP.wa.ltr(HP.wa.rs(r.amount)) }, refId: r.id });
            onDone && onDone(r);
        },
    });
}

function promiseDialog(party, onDone, existing) {
    const today = fmt.ymd(new Date());
    ui.formDrawer({
        title: existing ? 'Change promise' : 'Payment promise (وعدہ)', subtitle: `${party.name} · balance ${fmt.money(party.balance)}`, submit: existing ? 'Save' : 'Save promise',
        body: html`${ui.grid(
            ui.field({ label: 'Amount promised', name: 'amount', money: true, required: true, value: existing ? existing.amount : (party.balance > 0 ? party.balance : 0) }),
            ui.field({ label: 'Will pay by (date)', name: 'promisedDate', type: 'date', required: true, value: existing ? existing.promisedDate : today, attr: { min: today } }),
            ui.field({ label: 'Note', name: 'note', value: existing ? existing.note : '', placeholder: 'e.g. will pay after Friday market' }))}
          <div class="mt-3 flex flex-wrap gap-2">${[1, 3, 7, 15, 30].map(n => html`<button type="button" class="chip normal-case" data-days="${n}">+${n} day${n > 1 ? 's' : ''}</button>`)}</div>
          <p class="help mt-3">On the promised day the customer appears under <b>Promises & Reminders → Today</b>. With automatic SMS switched on, the reminder is sent by itself.</p>`,
        onMount(form) {
            form.addEventListener('click', e => { const b = e.target.closest('[data-days]'); if (!b) return; const dt = new Date(Date.parse(today + 'T00:00:00Z') + Number(b.dataset.days) * 86400000); form.querySelector('[name=promisedDate]').value = dt.toISOString().slice(0, 10); });
        },
        async onSubmit(v, d) {
            if (existing) await api.patch('/api/khata/promises/' + existing.id, v); else await api.post('/api/khata/promises', { ...v, partyId: party.id });
            d.close(); ui.toast('Promise saved'); onDone && onDone();
        },
    });
}

// a customer's statement, in English, Urdu or both
function printStatement(data, lang = 'en', range = {}) {
    const p = data.party, entries = data.entries.filter(e => (!range.from || fmt.ymd(e.date) >= range.from) && (!range.to || fmt.ymd(e.date) <= range.to));
    // balance brought forward = the running balance after the last entry before the period (entries are oldest first)
    const before = range.from ? data.entries.filter(e => fmt.ymd(e.date) < range.from) : [];
    const opening = before.length ? before[before.length - 1].balance : 0;
    const both = lang === 'both', ur = lang === 'ur';
    const L = (en, u) => (both ? `${en} / ${u}` : ur ? u : en);
    const m = v => fmt.money(v, { noSym: true });
    const c = (HP.session.settings && HP.session.settings.company) || {};
    HP.ui.print(html`<div class="receipt a4" dir="${ur ? 'rtl' : 'ltr'}" style="font-family:${ur || both ? '"Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", ' : ''}Arial, sans-serif">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #111;padding-bottom:8px">
          <div><div style="font-size:20px;font-weight:700">${HP.session.tenant.name}</div><div>${c.address || ''}</div><div>${c.phone ? 'Tel: ' + c.phone : ''}</div></div>
          <div style="text-align:${ur ? 'left' : 'right'}"><div style="font-size:18px;font-weight:700">${L('KHATA STATEMENT', 'کھاتہ اسٹیٹمنٹ')}</div><div>${fmt.date(new Date())}</div></div></div>
        <div style="margin:10px 0;display:flex;justify-content:space-between"><div><b>${L('Customer', 'گاہک')}:</b> ${p.name} ${p.phone ? '· ' + p.phone : ''}</div><div><b>${L('Balance', 'بقایا')}:</b> ${fmt.money(data.balance)}</div></div>
        <table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#f1f5f9">
          <th style="padding:6px;text-align:start">${L('Date', 'تاریخ')}</th><th style="padding:6px;text-align:start">${L('Details', 'تفصیل')}</th><th style="padding:6px;text-align:end">${L('Udhaar (Debit)', 'بنام (ادھار)')}</th><th style="padding:6px;text-align:end">${L('Received (Credit)', 'جمع (وصولی)')}</th><th style="padding:6px;text-align:end">${L('Balance', 'بقایا')}</th></tr></thead>
          <tbody>${range.from && opening ? html`<tr><td style="padding:6px"></td><td style="padding:6px">${L('Opening balance', 'سابقہ بقایا')}</td><td></td><td></td><td style="padding:6px;text-align:end">${m(opening)}</td></tr>` : ''}
          ${entries.map(e => html`<tr style="border-bottom:1px solid #e5e7eb"><td style="padding:6px;white-space:nowrap">${fmt.date(e.date)}</td><td style="padding:6px">${both ? `${typeLabel(e.type, 'en')} / ${typeLabel(e.type, 'ur')}` : typeLabel(e.type, lang)} ${e.refNo ? html`<span style="color:#555">${e.refNo}</span>` : ''}${e.note && e.note !== 'Paid at the counter' && e.note !== typeLabel(e.type, 'en') ? html`<div style="color:#666">${e.note}</div>` : ''}</td>
            <td style="padding:6px;text-align:end">${e.debit ? m(e.debit) : ''}</td><td style="padding:6px;text-align:end">${e.credit ? m(e.credit) : ''}</td><td style="padding:6px;text-align:end;font-weight:600">${m(e.balance)}</td></tr>`)}</tbody></table>
        <div style="margin-top:12px;text-align:${ur ? 'left' : 'right'};font-size:16px;font-weight:700">${L('Amount due', 'واجب الادا رقم')}: ${fmt.money(data.balance)}</div>
        <div style="margin-top:28px;display:flex;justify-content:space-between"><div style="border-top:1px solid #000;width:180px;text-align:center;padding-top:4px">${L('Customer signature', 'گاہک کے دستخط')}</div><div style="border-top:1px solid #000;width:180px;text-align:center;padding-top:4px">${L('Shop signature', 'دکان کے دستخط')}</div></div></div>`);
}

// A khata can go back years (e.g. a history moved from another program): a long one asks which period to print, and the
// statement starts with the balance brought forward. Short khatas print straight away.
const STATEMENT_PERIODS = [['m1', 'Last 1 month', 1], ['m3', 'Last 3 months', 3], ['m6', 'Last 6 months', 6], ['y1', 'Last 1 year', 12], ['all', 'Whole khata', 0]];
function statementDialog(data, lang = 'en') {
    if (data.entries.length <= 40) return printStatement(data, lang);
    const fromOf = months => { if (!months) return null; const d = new Date(); d.setMonth(d.getMonth() - months); return fmt.ymd(d); };
    const count = from => data.entries.filter(e => !from || fmt.ymd(e.date) >= from).length;
    const m = ui.modal({
        title: t('Statement period'), width: 420,
        body: html`<p class="mb-3 text-sm text-muted">${t('Which entries should the statement show? It starts with the balance before that period.')}</p>
          <div class="grid gap-2">${STATEMENT_PERIODS.map(([k, label, months]) => html`<button type="button" class="btn btn-outline h-12 justify-between" data-period="${k}"><span>${t(label)}</span><span class="text-xs text-muted">${count(fromOf(months))} ${t('entries')}</span></button>`)}</div>`,
    });
    ui.on(m.el, 'click', '[data-period]', (e, b) => {
        const months = STATEMENT_PERIODS.find(x => x[0] === b.dataset.period)[2];
        m.close();
        printStatement(data, lang, { from: fromOf(months) });
    });
    return m;
}

HP.khata = { sendReminder, receiveDialog, promiseDialog, printStatement, statementDialog, messaging, typeLabel };

// ───────── Khata Book ─────────
HP.page('/khata', {
    title: 'Khata Book', perm: ['parties.manage', 'sales.create', 'finance.manage'],
    async render(el) {
        let data, q = '', show = 'OWING';
        const load = async () => { data = await api.get('/api/khata/summary'); draw(); };
        const draw = () => {
            const k = data.kpis;
            ui.mount(el.querySelector('[data-kpis]'), html`<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                ${ui.statCard({ label: 'Total udhaar (receivable)', value: fmt.money(k.totalReceivable), iconName: 'banknote', tone: 'warn', valueTone: 'warn', sub: `${k.customersOwing} customers owe` })}
                ${ui.statCard({ label: 'Promises due today', value: k.dueToday, iconName: 'calendar', tone: 'accent', valueTone: k.dueToday ? 'accent' : '' })}
                ${ui.statCard({ label: 'Overdue promises', value: k.overdue, iconName: 'alert', tone: 'bad', valueTone: k.overdue ? 'bad' : '' })}
                ${ui.statCard({ label: 'Collected today', value: fmt.money(k.collectedToday), iconName: 'handCoins', tone: 'good', valueTone: 'good' })}
                ${ui.statCard({ label: 'Over credit limit', value: k.overLimit, iconName: 'shield', tone: 'orange', sub: `${k.messagesToday} reminders sent today` })}</div>`);
            let rows = data.rows;
            if (show === 'OWING') rows = rows.filter(r => r.balance > 0);
            if (show === 'LIMIT') rows = rows.filter(r => r.creditLimit > 0 && r.balance > r.creditLimit);
            if (show === 'PROMISE') rows = rows.filter(r => r.promise);
            if (show === 'ADVANCE') rows = rows.filter(r => r.balance < 0);
            if (q) rows = rows.filter(r => r.name.toLowerCase().includes(q.toLowerCase()) || String(r.phone).includes(q));
            rows = [...rows].sort((a, b) => b.balance - a.balance);
            ui.mount(el.querySelector('[data-list]'), ui.table({
                rows, empty: { iconName: 'handCoins', title: show === 'OWING' ? 'Nobody owes you money' : 'No customers here', text: 'Credit (udhaar) sales from the POS appear here with each customer\'s balance.' },
                columns: [
                    { label: 'Customer', render: r => html`<a href="/khata/c/${r.id}" data-link class="font-semibold hover:underline">${r.name}</a><div class="text-xs text-muted">${r.phone || 'no phone'}${r.group !== 'RETAIL' ? ' · ' + r.group.toLowerCase() : ''}</div>` },
                    { label: 'Balance / بقایا', num: true, render: r => html`<span class="text-base font-bold ${r.balance > 0 ? 'text-warn' : r.balance < 0 ? 'text-good' : 'text-muted'}">${fmt.money(r.balance)}</span>${r.balance < 0 ? html`<div class="text-xs text-good">advance</div>` : ''}` },
                    { label: 'Limit', num: true, render: r => (r.creditLimit ? html`${fmt.money(r.creditLimit)}${r.balance > r.creditLimit ? html`<div>${ui.badge('Over limit', 'bad')}</div>` : ''}` : html`<span class="text-muted">—</span>`) },
                    { label: 'Last payment', render: r => (r.lastPaymentAt ? html`${fmt.date(r.lastPaymentAt)}<div class="text-xs ${r.daysSincePayment > 30 ? 'text-bad' : 'text-muted'}">${r.daysSincePayment} days ago</div>` : html`<span class="text-muted">never</span>`) },
                    { label: 'Promise / وعدہ', render: r => (r.promise ? html`${fmt.money(r.promise.amount)}<div class="mt-0.5">${promiseBadge(r.promise)}</div>` : html`<span class="text-muted">—</span>`) },
                    { label: '', render: r => html`<div class="flex flex-wrap justify-end gap-1">${canManage() ? html`<button class="btn btn-sm btn-primary" data-recv="${r.id}">${icon('handCoins')}Receive</button><button class="btn btn-sm btn-outline" data-prom="${r.id}">${icon('calendar')}Promise</button><button class="btn btn-sm btn-outline" data-remind="${r.id}" title="WhatsApp / SMS reminder">${icon('bell')}Remind</button>` : ''}<a class="btn btn-sm btn-ghost" href="/khata/c/${r.id}" data-link>${icon('file')}Ledger</a></div>` },
                ],
            }));
        };
        ui.mount(el, html`${ui.pageHeader({ title: 'Khata Book (کھاتہ)', subtitle: 'Who owes how much, promises to pay, and one-click reminders on WhatsApp or SMS.', iconName: 'handCoins', actions: html`<a href="/khata/reminders" data-link class="btn btn-outline">${icon('bell')}Promises & Reminders</a>${has('sales.create') ? html`<a href="/pos" data-link class="btn btn-primary">${icon('cart')}${t('New Sale')}</a>` : ''}` })}
          <div data-kpis class="mb-5"></div>
          <div class="mb-4 flex flex-wrap items-center gap-3"><div class="relative w-full max-w-sm"><span class="absolute inset-y-0 start-3 flex items-center text-muted">${icon('search')}</span><input class="input ps-9" placeholder="Search customer or phone" data-q></div>
            ${ui.seg('show', [['OWING', 'Owing'], ['PROMISE', 'With promise'], ['LIMIT', 'Over limit'], ['ADVANCE', 'Advance'], ['ALL', 'All customers']], show)}</div>
          <div data-list>${ui.loading()}</div>`);
        el.querySelector('[data-q]').addEventListener('input', e => { q = e.target.value; draw(); });
        ui.on(el, 'click', '[data-seg=show] [data-v]', (e, b) => { show = b.dataset.v; el.querySelectorAll('[data-seg=show] button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
        const row = id => data.rows.find(r => r.id === id);
        ui.on(el, 'click', '[data-recv]', (e, b) => receiveDialog(row(b.dataset.recv), load));
        ui.on(el, 'click', '[data-prom]', (e, b) => promiseDialog(row(b.dataset.prom), load));
        ui.on(el, 'click', '[data-remind]', (e, b) => { const r = row(b.dataset.remind); r.promise ? sendReminder(r, { kind: 'PROMISE_REMINDER', promise: r.promise, onDone: load }) : sendReminder(r, { kind: 'BALANCE_REMINDER', onDone: load }); });
        await load();
    },
});

// ───────── one customer's khata ─────────
HP.page('/khata/c/:id', {
    title: 'Customer khata', perm: ['parties.manage', 'sales.create', 'finance.manage'],
    async render(el, { id }) {
        let data, tab = 'ledger', lq = '';
        const load = async () => { data = await api.get('/api/khata/customers/' + id); draw(); };
        // ledger search: remark, reference, type, date or amount — over every entry, then the table pages the matches
        const ledgerMatch = e => {
            const s = lq.trim().toLowerCase(); if (!s) return true;
            const num = s.replace(/[,\s]/g, '');
            return [typeLabel(e.type, 'en'), typeLabel(e.type, 'ur'), e.refNo, e.note, fmt.date(e.date)].some(x => String(x || '').toLowerCase().includes(s))
                || (/^\d+(\.\d+)?$/.test(num) && [e.debit, e.credit].some(v => v && String(v / 100).includes(num)));
        };
        const party = () => ({ ...data.party, balance: data.balance });
        const draw = () => {
            const p = data.party;
            ui.mount(el, html`<div class="mb-2"><a href="/khata" data-link class="text-sm text-muted hover:text-ink">${icon('chevronLeft', 'w-4 h-4 inline')} Khata Book</a></div>
              <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div><h1 class="text-2xl font-bold">${p.name}</h1><p class="mt-1 text-sm text-muted">${p.phone || 'no phone'}${p.city ? ' · ' + p.city : ''}${p.creditLimit ? ' · limit ' + fmt.money(p.creditLimit) : ''}</p>${p.notes ? html`<p class="mt-1 text-xs text-amber-700">${p.notes}</p>` : ''}</div>
                <div class="card px-5 py-3 text-end"><div class="eyebrow">${t('Balance')} / بقایا</div><div class="text-3xl font-bold ${data.balance > 0 ? 'text-warn' : data.balance < 0 ? 'text-good' : ''}">${fmt.money(data.balance)}</div>${data.balance < 0 ? html`<div class="text-xs text-good">advance held</div>` : ''}</div></div>
              <div class="mb-5 flex flex-wrap gap-2">${canManage() ? html`<button class="btn btn-primary" data-recv>${icon('handCoins')}Receive payment</button><button class="btn btn-outline" data-prom>${icon('calendar')}Add promise</button><button class="btn btn-outline" data-remind>${icon('bell')}Send reminder</button>` : ''}
                <button class="btn btn-outline" data-print="en">${icon('printer')}Statement (English)</button><button class="btn btn-outline" data-print="ur">${icon('printer')}اسٹیٹمنٹ (اردو)</button><button class="btn btn-outline" data-print="both">${icon('printer')}Both</button>
                <button class="btn btn-ghost" data-share>${icon('arrowRight')}Share balance on WhatsApp</button></div>
              <div class="mb-4">${ui.tabs('tab', [['ledger', `Ledger / کھاتہ (${data.entries.length})`], ['promises', `Promises / وعدے (${data.promises.length})`], ['messages', `Messages (${data.messages.length})`]], tab)}</div>
              <div data-tab></div>`);
            const box = el.querySelector('[data-tab]');
            if (tab === 'ledger') { ui.mount(box, html`${data.entries.length > 20 ? html`<div class="relative mb-3 max-w-sm"><span class="absolute inset-y-0 start-3 flex items-center text-muted">${icon('search')}</span><input class="input ps-9" type="search" placeholder="${t('Search entries: remark, amount or date')}" data-lq value="${lq}"></div>` : ''}<div data-ledger></div>`); drawLedger(); }
            if (tab === 'promises') ui.mount(box, ui.table({ rows: data.promises, empty: 'No promises yet. Use "Add promise" when the customer says when they will pay.', columns: [
                { label: 'Promised', render: x => html`<b>${fmt.money(x.amount)}</b>` }, { label: 'By', render: x => HP.wa.numericDate(x.promisedDate) },
                { label: 'Status', render: x => promiseBadge(x) }, { label: 'Reminders', render: x => `${x.remindCount}${x.remindedAt ? ' · last ' + fmt.dateTime(x.remindedAt) : ''}` },
                { label: 'Note', render: x => x.note || '—' },
                { label: '', render: x => (x.status === 'PENDING' || x.status === 'OVERDUE' ? html`<div class="flex justify-end gap-1"><button class="btn btn-sm btn-outline" data-premind="${x.id}">Remind</button><button class="btn btn-sm btn-ghost" data-pedit="${x.id}">Change</button><button class="btn btn-sm btn-ghost text-good" data-pkept="${x.id}">Kept</button><button class="btn btn-sm btn-ghost text-rose-600" data-pbroken="${x.id}">Broken</button></div>` : '') },
            ] }));
            if (tab === 'messages') ui.mount(box, messagesTable(data.messages, false));
        };
        const drawLedger = () => {
            const box = el.querySelector('[data-ledger]'); if (!box) return;
            const rows = [...data.entries].reverse().filter(ledgerMatch);
            ui.mount(box, ui.table({ rows, empty: data.entries.length ? t('Nothing matches.') : 'No khata entries yet.', columns: [
                { label: 'Date', render: e => html`<span class="whitespace-nowrap">${fmt.dateTime(e.date)}</span>` },
                { label: 'Details / تفصیل', render: e => html`<div class="font-medium">${typeLabel(e.type, 'en')} <span class="text-muted">· ${typeLabel(e.type, 'ur')}</span></div><div class="text-xs text-muted">${e.refNo}${e.note ? ' · ' + e.note : ''}</div>` },
                { label: 'Udhaar (debit)', num: true, render: e => (e.debit ? html`<span class="text-warn">${fmt.money(e.debit)}</span>` : '') },
                { label: 'Received (credit)', num: true, render: e => (e.credit ? html`<span class="text-good">${fmt.money(e.credit)}</span>` : '') },
                { label: 'Balance', num: true, render: e => html`<b>${fmt.money(e.balance)}</b>` },
            ] }));
        };
        el.addEventListener('input', e => { if (e.target.matches('[data-lq]')) { lq = e.target.value; drawLedger(); } });
        el.addEventListener('click', async e => {
            const b = e.target.closest('button,[data-v]'); if (!b) return;
            if (b.closest('[data-tabs]') && b.dataset.v) { tab = b.dataset.v; draw(); return; }
            if (b.dataset.recv !== undefined) return receiveDialog(party(), load);
            if (b.dataset.prom !== undefined) return promiseDialog(party(), load);
            if (b.dataset.remind !== undefined) { const open = data.promises.find(x => x.status === 'PENDING' || x.status === 'OVERDUE'); return open ? sendReminder(party(), { kind: 'PROMISE_REMINDER', promise: open, onDone: load }) : sendReminder(party(), { kind: 'BALANCE_REMINDER', onDone: load }); }
            if (b.dataset.share !== undefined) return sendReminder(party(), { kind: 'STATEMENT', onDone: load });
            if (b.dataset.print) return statementDialog(data, b.dataset.print);
            const pid = b.dataset.premind || b.dataset.pedit || b.dataset.pkept || b.dataset.pbroken;
            if (pid) {
                const pr = data.promises.find(x => x.id === pid);
                if (b.dataset.premind) return sendReminder(party(), { kind: 'PROMISE_REMINDER', promise: pr, onDone: load });
                if (b.dataset.pedit) return promiseDialog(party(), load, pr);
                try { await api.patch('/api/khata/promises/' + pid, { status: b.dataset.pkept ? 'KEPT' : 'BROKEN' }); load(); } catch (err) { ui.fail(err); }
            }
        });
        await load();
    },
});

function messagesTable(list, withName) {
    const ST = { OPENED: ['WhatsApp opened', 'good'], SENT: ['SMS sent', 'good'], LOGGED: ['Logged (test)', 'gray'], QUEUED: ['Queued', 'warn'], FAILED: ['Failed', 'bad'] };
    return ui.table({ rows: list, empty: 'No messages yet.', columns: [
        { label: 'When', render: m => html`<span class="whitespace-nowrap">${fmt.dateTime(m.createdAt)}</span>` },
        ...(withName ? [{ label: 'Customer', render: m => m.name || '—' }] : []),
        { label: 'Channel', render: m => html`${m.channel === 'WHATSAPP' ? 'WhatsApp' : 'SMS'}<div class="text-xs text-muted">${m.kind.replace(/_/g, ' ').toLowerCase()}</div>` },
        { label: 'To', render: m => m.to },
        { label: 'Message', render: m => html`<div class="max-w-md whitespace-pre-line text-xs" dir="auto">${m.body.length > 220 ? m.body.slice(0, 220) + '…' : m.body}</div>` },
        { label: 'Status', render: m => html`${ui.badge(...(ST[m.status] || [m.status, 'gray']))}${m.error ? html`<div class="text-xs text-bad">${m.error}</div>` : ''}` },
    ] });
}

// ───────── Promises & Reminders ─────────
HP.page('/khata/reminders', {
    title: 'Promises & Reminders', perm: ['parties.manage', 'finance.manage', 'sales.create'],
    async render(el, p, query) {
        let view = query.view || 'due', q = '', data, mode = 'promises';
        const load = async () => {
            if (mode === 'log') { ui.mount(el.querySelector('[data-body]'), messagesTable(await api.get('/api/khata/messages', { limit: 300 }), true)); return; }
            data = await api.get('/api/khata/promises', { view, q }); draw();
        };
        const draw = () => {
            const c = data.counts;
            el.querySelector('[data-counts]').innerHTML = String(html`<div class="grid gap-4 sm:grid-cols-4">
                ${ui.statCard({ label: 'Due today', value: c.today, iconName: 'calendar', tone: 'warn', valueTone: c.today ? 'warn' : '' })}
                ${ui.statCard({ label: 'Overdue', value: c.overdue, iconName: 'alert', tone: 'bad', valueTone: c.overdue ? 'bad' : '' })}
                ${ui.statCard({ label: 'Next 7 days', value: c.next7, iconName: 'clock', tone: 'accent' })}
                ${ui.statCard({ label: 'All pending promises', value: fmt.money(c.pendingAmount), iconName: 'handCoins', tone: 'good', sub: `${c.pending} promises` })}</div>`);
            ui.mount(el.querySelector('[data-body]'), ui.table({
                rows: data.rows, empty: { iconName: 'calendar', title: 'No promises in this view', text: 'Add a promise from the Khata Book when a customer says when they will pay.' },
                columns: [
                    { label: 'Customer', render: r => html`<a href="/khata/c/${r.partyId}" data-link class="font-semibold hover:underline">${r.name}</a><div class="text-xs text-muted">${r.phone || 'no phone'}</div>` },
                    { label: 'Promised', num: true, render: r => html`<b>${fmt.money(r.amount)}</b>${r.paid ? html`<div class="text-xs text-good">paid ${fmt.money(r.paid)} so far</div>` : ''}` },
                    { label: 'By', render: r => html`${HP.wa.numericDate(r.promisedDate)}<div class="mt-0.5">${promiseBadge(r)}</div>` },
                    { label: 'Balance', num: true, render: r => html`<span class="text-warn font-semibold">${fmt.money(r.balance)}</span>` },
                    { label: 'Reminded', render: r => (r.remindCount ? html`${r.remindCount}×<div class="text-xs text-muted">${fmt.dateTime(r.remindedAt)}</div>` : html`<span class="text-muted">not yet</span>`) },
                    { label: '', render: r => (r.status === 'PENDING' || r.status === 'OVERDUE' ? html`<div class="flex flex-wrap justify-end gap-1">
                        <button class="btn btn-sm btn-primary" data-wa="${r.id}">${icon('arrowRight')}WhatsApp</button><button class="btn btn-sm btn-outline" data-sms="${r.id}">SMS</button>
                        <button class="btn btn-sm btn-outline" data-later="${r.id}">Later ${icon('chevronDown', 'w-3 h-3')}</button><button class="btn btn-sm btn-ghost text-good" data-kept="${r.id}">Kept</button><button class="btn btn-sm btn-ghost text-rose-600" data-broken="${r.id}">Broken</button></div>` : '') },
                ],
            }));
        };
        const tabs = [['due', 'Due (7 days)'], ['today', 'Today'], ['overdue', 'Overdue'], ['next7', 'Next 7 days'], ['upcoming', 'Upcoming'], ['kept', 'Kept'], ['broken', 'Broken'], ['all', 'All']];
        ui.mount(el, html`${ui.pageHeader({ title: 'Promises & Reminders (وعدے)', subtitle: 'Customers who promised to pay: remind them on WhatsApp in one click, or by SMS automatically on the day.', iconName: 'bell',
            actions: html`${has('settings.manage') ? html`<button class="btn btn-outline" data-settings>${icon('settings')}Messaging settings</button>` : ''}<a class="btn btn-primary" href="/khata" data-link>${icon('handCoins')}Khata Book</a>` })}
          <div data-counts class="mb-5"></div>
          <div class="mb-4 flex flex-wrap items-center gap-3">${ui.seg('mode', [['promises', 'Promises'], ['log', 'Message log']], mode)}
            <div data-views class="flex flex-wrap gap-2">${tabs.map(([v, l]) => html`<button class="chip normal-case ${v === view ? 'chip-on' : ''}" data-view="${v}">${l}</button>`)}</div>
            <div class="relative ms-auto w-64"><span class="absolute inset-y-0 start-3 flex items-center text-muted">${icon('search')}</span><input class="input ps-9" placeholder="Search customer" data-q></div></div>
          <div data-body>${ui.loading()}</div>`);
        const row = id => data.rows.find(r => r.id === id);
        const partyOf = r => ({ id: r.partyId, name: r.name, phone: r.phone, balance: r.balance });
        el.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.view) { view = b.dataset.view; el.querySelectorAll('[data-view]').forEach(x => x.classList.toggle('chip-on', x === b)); load(); return; }
            if (b.closest('[data-seg=mode]') && b.dataset.v) { mode = b.dataset.v; el.querySelectorAll('[data-seg=mode] button').forEach(x => x.classList.toggle('on', x === b)); el.querySelector('[data-views]').classList.toggle('hidden', mode === 'log'); load(); return; }
            if (b.dataset.settings !== undefined) return messagingSettings();
            const r = row(b.dataset.wa || b.dataset.sms || b.dataset.later || b.dataset.kept || b.dataset.broken);
            if (!r) return;
            if (b.dataset.wa || b.dataset.sms) return sendReminder(partyOf(r), { kind: 'PROMISE_REMINDER', promise: r, onDone: load });
            if (b.dataset.later) return ui.menu(b, [3, 7, 15, 30].map(n => ({ label: `Remind again in ${n} days`, iconName: 'clock', onClick: async () => { try { await api.patch('/api/khata/promises/' + r.id, { snoozeDays: n }); ui.toast(`Moved ${n} days later`); load(); } catch (err) { ui.fail(err); } } })));
            try { await api.patch('/api/khata/promises/' + r.id, { status: b.dataset.kept ? 'KEPT' : 'BROKEN' }); load(); } catch (err) { ui.fail(err); }
        });
        let tm; el.querySelector('[data-q]').addEventListener('input', e2 => { q = e2.target.value; clearTimeout(tm); tm = setTimeout(load, 250); });
        await load();
    },
});

async function messagingSettings() {
    let m;
    try { m = await messaging(true); } catch (err) { return ui.fail(err); }
    const TPL = [['promise', 'Promise reminder'], ['balance', 'Balance reminder'], ['thanks', 'Payment received (thank you)'], ['bill', 'Bill / receipt']];
    const ph = '{name} customer · {shop} your shop · {amount} amount · {balance} khata balance · {date} promised date · {when} آج / date · {whenEn} today / by date · {phone} shop phone · {number} {total} {paid} {due} bill figures';
    ui.formDrawer({
        title: 'Messaging settings', subtitle: 'Reminder wording (Urdu & English) and the SMS gateway', wide: true, submit: 'Save settings',
        body: html`${ui.section('LANGUAGE', ui.field({ label: 'Default message language', name: 'language', type: 'select', value: m.language, options: [['ur', 'اردو (Urdu)'], ['en', 'English']], help: 'Each send dialog can switch for one message.' }))}
          <div class="mt-6"><div class="eyebrow mb-1">TEMPLATES</div><p class="help mb-3">Placeholders: ${ph}. A line with a missing value is left out.</p>
          ${TPL.map(([k, l]) => html`<div class="mb-4 rounded-xl border border-line p-3"><div class="mb-2 font-semibold text-sm">${l}</div><div class="grid gap-3 sm:grid-cols-2">
            <div><label class="label">اردو</label><textarea class="input" rows="7" dir="rtl" name="${k}Ur">${m[k + 'Ur']}</textarea><button type="button" class="text-xs text-muted" data-reset="${k}Ur">Reset to default</button></div>
            <div><label class="label">English</label><textarea class="input" rows="7" name="${k}En">${m[k + 'En']}</textarea><button type="button" class="text-xs text-muted" data-reset="${k}En">Reset to default</button></div></div></div>`)}</div>
          ${ui.section('SMS GATEWAY (AUTOMATIC SMS)',
            ui.field({ label: 'Send SMS', name: 'smsEnabled', type: 'switch', value: m.smsEnabled, help: 'Off: reminders go on WhatsApp only (one click, free).' }),
            ui.field({ label: 'Gateway', name: 'provider', type: 'select', value: m.provider, half: true, options: [['LOG', 'Test mode (log only, nothing sent)'], ['HTTP', 'HTTP SMS gateway (any Pakistani provider)']] }),
            ui.field({ label: 'Method', name: 'httpMethod', type: 'select', value: m.httpMethod, half: true, options: [['GET', 'GET'], ['POST', 'POST']] }),
            ui.field({ label: 'Gateway URL', name: 'urlTemplate', value: m.urlTemplate, placeholder: 'https://api.your-sms.pk/send?key={apikey}&to={to}&sender={sender}&msg={message}', help: 'From your SMS provider\'s API page. Placeholders: {to} 923001234567, {to0} 03001234567, {message}, {sender}, {apikey}, {secret}.' }),
            ui.field({ label: 'POST body (optional)', name: 'bodyTemplate', type: 'textarea', rows: 3, value: m.bodyTemplate, placeholder: '{"to":"{to}","text":"{message}"}' }),
            ui.field({ label: 'Sender ID / mask', name: 'senderId', value: m.senderId, half: true }),
            ui.field({ label: 'Success text in reply (optional)', name: 'successText', value: m.successText, half: true, placeholder: 'e.g. OK' }),
            m.desktop ? '' : ui.field({ label: 'API key', name: 'apiKey', type: 'password', value: m.hasApiKey ? '••••' : '', half: true, help: 'Kept on the server only, never on shop PCs.' }),
            m.desktop ? '' : ui.field({ label: 'API secret (if any)', name: 'apiSecret', type: 'password', value: m.hasApiSecret ? '••••' : '', half: true }))}
          ${ui.section('AUTOMATIC REMINDERS',
            ui.field({ label: 'Automatic SMS on the promised day', name: 'autoPromise', type: 'switch', value: m.autoPromise, help: 'Sent once a day per promise by the HisabPro server.' }),
            ui.field({ label: 'Also remind this many days before', name: 'daysBefore', type: 'number', value: m.daysBefore, half: true }),
            ui.field({ label: 'Send after (hour, 0–23)', name: 'sendHour', type: 'number', value: m.sendHour, half: true }),
            ui.field({ label: 'Thank-you SMS when a khata payment is received', name: 'autoThanks', type: 'switch', value: m.autoThanks }))}
          ${m.desktop ? '' : html`<div class="mt-6 flex items-end gap-2"><div class="flex-1"><label class="label">Test SMS to</label><input class="input" data-testto placeholder="03001234567"></div><button type="button" class="btn btn-outline" data-test>Send test</button></div><p class="help">Save first, then test.</p>`}`,
        onMount(form) {
            form.addEventListener('click', async e => {
                const r = e.target.closest('[data-reset]'); if (r) { form.querySelector(`[name=${r.dataset.reset}]`).value = m.defaults[r.dataset.reset]; return; }
                if (e.target.closest('[data-test]')) {
                    try { const x = await api.post('/api/khata/messaging/test', { to: form.querySelector('[data-testto]').value }); ui.toast(x.status === 'SENT' ? 'Test SMS sent' : x.status === 'LOGGED' ? 'Logged (test mode): switch the gateway to HTTP to really send' : `Failed: ${x.error}`, x.status === 'FAILED' ? 'error' : 'ok'); } catch (err) { ui.fail(err); }
                }
            });
        },
        async onSubmit(v, d) { MSG = await api.put('/api/khata/messaging', v); d.close(); ui.toast('Messaging settings saved'); },
    });
}

// ───────── Day Close ─────────
HP.page('/day-close', {
    title: 'Day Close', perm: ['sales.create', 'finance.manage'],
    async render(el) {
        let day = fmt.ymd(new Date()), accountId = '', data, accounts = [];
        try { accounts = (await api.get('/api/finance/accounts')).filter(a => a.type === 'CASH'); } catch { }
        const load = async () => { data = await api.get('/api/day-close/preview', { day, accountId }); draw(); };
        const draw = () => {
            const d = data, s = d.sales;
            const row = (l, v, cls2) => html`<div class="flex justify-between py-1.5 text-sm"><span class="text-muted">${l}</span><span class="font-medium tabular-nums ${cls2 || ''}">${v}</span></div>`;
            ui.mount(el.querySelector('[data-body]'), html`<div class="grid gap-6 lg:grid-cols-3">
              <div class="card card-pad lg:col-span-2"><div class="mb-4 grid gap-4 sm:grid-cols-4">
                  ${ui.statCard({ label: 'Opening cash', value: fmt.money(d.opening), iconName: 'wallet', tone: 'gray' })}${ui.statCard({ label: 'Cash in', value: fmt.money(d.cashIn), iconName: 'arrowDown', tone: 'good', valueTone: 'good' })}
                  ${ui.statCard({ label: 'Cash out', value: fmt.money(d.cashOut), iconName: 'arrowUp', tone: 'bad', valueTone: 'bad' })}${ui.statCard({ label: 'Should be in drawer', value: fmt.money(d.expected), iconName: 'banknote', tone: 'accent', valueTone: 'accent' })}</div>
                <div class="grid gap-6 sm:grid-cols-2"><div><div class="eyebrow mb-2">SALES</div>${row('Invoices', `${s.count}${s.first ? ` (${s.first} – ${s.last})` : ''}`)}${row('Total sales', fmt.money(s.total), 'text-good')}${row('Cash', fmt.money(s.byMethod.CASH || 0))}${row('Card', fmt.money(s.byMethod.CARD || 0))}${row('Bank', fmt.money(s.byMethod.BANK || 0))}${row('On udhaar (credit)', fmt.money(s.credit), 'text-warn')}</div>
                  <div><div class="eyebrow mb-2">OTHER MONEY</div>${row(`Returns (${d.returns.count})`, fmt.money(d.returns.total), 'text-bad')}${row(`Khata / payments received (${d.paymentsIn.count})`, fmt.money(d.paymentsIn.total), 'text-good')}${row(`Payments made (${d.paymentsOut.count})`, fmt.money(d.paymentsOut.total), 'text-bad')}${row(`Expenses (${d.expenses.count})`, fmt.money(d.expenses.total), 'text-bad')}</div></div></div>
              <div class="card card-pad"><div class="font-semibold mb-3">Count the drawer</div>
                <label class="label">Cash counted</label><input class="input h-14 text-2xl" type="number" min="0" step="0.01" data-counted placeholder="0">
                <div class="mt-3 rounded-xl bg-surface-2 p-3 text-sm" data-diff>Enter the counted cash.</div>
                <label class="label mt-3">Note</label><input class="input" data-note placeholder="e.g. Rs 100 short — change given wrong">
                <button class="btn btn-primary btn-lg mt-4 w-full" data-save>${icon('check')}Save & print Z-report</button>
                ${d.closes.length ? html`<div class="mt-4 text-xs text-muted">Closed ${d.closes.length} time(s) today; last by ${d.closes[0].userName} (${fmt.time(d.closes[0].createdAt)}): ${d.closes[0].difference === 0 ? 'exact' : fmt.money(d.closes[0].difference, { sign: true })}</div>` : ''}</div></div>
              <div class="mt-6" data-history></div>`);
            const inp = el.querySelector('[data-counted]'), diffBox = el.querySelector('[data-diff]');
            inp.addEventListener('input', () => {
                if (inp.value === '') { diffBox.textContent = 'Enter the counted cash.'; return; }
                const diff = fmt.toPaisa(inp.value) - d.expected;
                diffBox.innerHTML = String(diff === 0 ? html`<b class="text-good">Exact. ✔</b>` : diff > 0 ? html`<b class="text-good">Over by ${fmt.money(diff)}</b>` : html`<b class="text-bad">Short by ${fmt.money(-diff)}</b>`);
            });
            el.querySelector('[data-save]').addEventListener('click', async ev => {
                if (inp.value === '') return ui.toast('Enter the cash you counted.', 'error');
                const btn = ev.currentTarget;
                if (btn.disabled) return;
                btn.disabled = true; // a double click must not record the day close twice
                try {
                    const r = await api.post('/api/day-close', { day, accountId: d.accountId, counted: fmt.toPaisa(inp.value), note: el.querySelector('[data-note]').value });
                    zReport(d, r.counted, r.difference, el.querySelector('[data-note]').value);
                    ui.toast('Day closed'); load();
                } catch (err) { btn.disabled = false; ui.fail(err); }
            });
            api.get('/api/day-close').then(list => ui.mount(el.querySelector('[data-history]'), html`<div class="font-semibold mb-3">Recent day closes</div>${ui.table({ rows: list, empty: 'No day closes yet.', columns: [
                { label: 'Day', render: c => c.day }, { label: 'Expected', num: true, render: c => fmt.money(c.expected) }, { label: 'Counted', num: true, render: c => fmt.money(c.counted) },
                { label: 'Difference', num: true, render: c => html`<span class="${c.difference < 0 ? 'text-bad' : c.difference > 0 ? 'text-good' : ''} font-semibold">${c.difference === 0 ? 'exact' : fmt.money(c.difference, { sign: true })}</span>` },
                { label: 'Sales', num: true, render: c => `${fmt.money(c.salesTotal)} (${c.salesCount})` }, { label: 'By', render: c => html`${c.userName}<div class="text-xs text-muted">${fmt.dateTime(c.createdAt)}</div>` }, { label: 'Note', render: c => c.note || '—' },
            ] })}`)).catch(() => {});
        };
        ui.mount(el, html`${ui.pageHeader({ title: 'Day Close (Z-report)', subtitle: 'At closing time: count the cash drawer and compare it with what it should hold.', iconName: 'banknote',
            actions: html`<input type="date" class="input w-44" data-day value="${day}">${accounts.length > 1 ? html`<select class="input w-48" data-acc>${accounts.map(a => html`<option value="${a.id}">${a.name}</option>`)}</select>` : ''}` })}<div data-body>${ui.loading()}</div>`);
        el.querySelector('[data-day]').addEventListener('change', e => { day = e.target.value; load(); });
        const acc = el.querySelector('[data-acc]'); if (acc) acc.addEventListener('change', e => { accountId = e.target.value; load(); });
        await load();
    },
});

function zReport(d, counted, diff, note) {
    const m = v => fmt.money(v, { noSym: true });
    const row = (l, v) => html`<div style="display:flex;justify-content:space-between"><span>${l}</span><span>${v}</span></div>`;
    HP.ui.print(html`<div class="receipt w80"><div style="text-align:center;font-weight:700">DAY CLOSE (Z-REPORT)</div><div style="text-align:center;font-weight:700">${HP.session.tenant.name}</div>
      <div style="text-align:center">${d.day} · ${HP.session.name || ''}</div><hr>
      ${row('Invoices', `${d.sales.count}`)}${d.sales.first ? row('From / to', `${d.sales.first} – ${d.sales.last}`) : ''}${row('Total sales', m(d.sales.total))}${row(' Cash', m(d.sales.byMethod.CASH || 0))}${row(' Card', m(d.sales.byMethod.CARD || 0))}${row(' Bank', m(d.sales.byMethod.BANK || 0))}${row(' Udhaar', m(d.sales.credit))}
      ${row('Returns', m(d.returns.total))}${row('Payments received', m(d.paymentsIn.total))}${row('Payments made', m(d.paymentsOut.total))}${row('Expenses', m(d.expenses.total))}<hr>
      ${row('Opening cash', m(d.opening))}${row('Cash in', m(d.cashIn))}${row('Cash out', m(d.cashOut))}${row('Expected in drawer', m(d.expected))}${row('Counted', m(counted))}
      <div style="display:flex;justify-content:space-between;font-weight:700"><span>Difference</span><span>${diff === 0 ? 'EXACT' : (diff > 0 ? '+' : '') + m(diff)}</span></div>${note ? html`<hr><div>${note}</div>` : ''}
      <div style="margin-top:24px;border-top:1px solid #000;text-align:center">Signature</div></div>`);
}
