// The HisabPro phone app (Android, for the shop OWNER only): a simple ledger app instead of the full system.
// Home: Payment · Receipt · Reports · All Accounts · Stock · Vendor Reports, and Reminders.
// Shown when HP.mobile.on() (the Android app, see core/native.js). Every screen uses the same APIs as the web app —
// nothing here has its own money logic. The full app (POS, HR, settings …) stays on the web and the Windows app.
const { html, raw, icon, api, ui, fmt, t } = HP;
const go = p => HP.router.navigate(p);
const can = k => Perms.has(HP.session, k);
const isUr = () => HP.lang() === 'ur';
const shopName = () => (HP.session.settings && HP.session.settings.company && HP.session.settings.company.name) || (HP.session.tenant && HP.session.tenant.name) || 'HisabPro';
const COLS = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' };
const TONE = { good: 'bg-good-soft text-good', bad: 'bg-bad-soft text-bad', warn: 'bg-warn-soft text-warn', accent: 'bg-accent-soft text-accent' };
const methodFor = type => (type === 'CASH' ? 'CASH' : type === 'WALLET' ? 'WALLET' : 'BANK');
const PERIODS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['lastMonth', 'Last month']];

// ── building blocks ──
const card = (inner, extra = '') => html`<div class="rounded-2xl border border-line bg-surface p-4 shadow-sm ${extra}">${inner}</div>`;
const stat = (label, value, tone = '', sub = '') => html`<div class="rounded-2xl border border-line bg-surface p-3.5 shadow-sm"><div class="text-xs text-muted">${t(label)}</div>
    <div class="mt-0.5 text-lg font-bold ${tone ? 'text-' + tone : ''}">${value}</div>${sub ? html`<div class="text-xs text-muted">${sub}</div>` : ''}</div>`;
const chips = (name, options, cur) => html`<div class="thin-scroll -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" data-chips="${name}">${options.map(([v, l]) => html`<button type="button" class="chip shrink-0 normal-case ${v === cur ? 'chip-on' : ''}" data-v="${v}">${t(l)}</button>`)}</div>`;
const seg2 = (name, options, cur) => html`<div class="grid ${COLS[options.length]} gap-1 rounded-xl bg-surface-2 p-1" data-seg2="${name}">${options.map(([v, l]) => html`<button type="button" data-v="${v}" class="h-10 rounded-lg text-sm font-semibold ${v === cur ? 'bg-surface shadow-sm text-ink' : 'text-muted'}">${t(l)}</button>`)}</div>`;
const empty = text => html`<div class="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">${t(text)}</div>`;
const initial = name => String(name || '?').trim().charAt(0).toUpperCase();
const avatar = (name, tone = 'accent') => html`<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold ${TONE[tone]}">${initial(name)}</span>`;
// what a balance means, in words: a customer's positive balance is owed TO us, a vendor's positive balance is owed BY us
function balanceWords(type, balance) {
    if (!balance) return { label: 'Settled', tone: 'muted' };
    if (type === 'VENDOR') return balance > 0 ? { label: 'You pay', tone: 'bad' } : { label: 'Advance paid', tone: 'good' };
    return balance > 0 ? { label: 'You receive', tone: 'warn' } : { label: 'Advance received', tone: 'good' };
}
const amountRow = (type, balance) => { const w = balanceWords(type, balance); return html`<div class="text-end"><div class="font-bold text-${w.tone}">${fmt.money(Math.abs(balance))}</div><div class="text-[11px] text-muted">${t(w.label)}</div></div>`; };

// choose a customer or vendor (search by name or phone); resolves the party or null
async function pickParty(type) {
    let list;
    try { list = await api.get('/api/parties', { type }); } catch (e) { ui.fail(e); return null; }
    list.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance) || a.name.localeCompare(b.name));
    return new Promise(resolve => {
        let picked = null;
        const m = ui.modal({
            title: type === 'VENDOR' ? t('Choose vendor') : t('Choose customer'), width: 520,
            body: html`<input class="input h-11" type="search" placeholder="${t('Search name or phone')}" data-q autocomplete="off"><div class="mt-3 divide-y divide-line-soft" data-list></div>`,
            footer: html`<button class="btn btn-outline me-auto" data-new>${icon('userPlus')}${type === 'VENDOR' ? t('New vendor') : t('New customer')}</button><button class="btn btn-outline" data-close>${t('Cancel')}</button>`,
            onClose: () => resolve(picked),
        });
        const box = m.el.querySelector('[data-list]');
        const draw = q => {
            q = (q || '').toLowerCase();
            const rows = list.filter(p => !q || p.name.toLowerCase().includes(q) || String(p.phone || '').includes(q)).slice(0, 200);
            box.innerHTML = String(rows.length ? html`${rows.map(p => html`<button type="button" class="flex w-full items-center gap-3 px-1 py-3 text-start" data-pick="${p.id}">
                ${avatar(p.name, type === 'VENDOR' ? 'bad' : 'warn')}<span class="min-w-0 flex-1"><span class="block truncate font-medium">${p.name}</span><span class="block text-xs text-muted">${p.phone || '—'}</span></span>${amountRow(type, p.balance)}</button>`)}`
                : empty(list.length ? 'Nothing matches.' : 'No accounts yet. Add one with the button below.'));
        };
        draw('');
        m.el.querySelector('[data-q]').addEventListener('input', e => draw(e.target.value));
        ui.on(m.el, 'click', '[data-pick]', (e, b) => { picked = list.find(p => p.id === b.dataset.pick); m.close(); });
        m.el.querySelector('[data-new]').addEventListener('click', async () => { const p = await newParty(type); if (p) { picked = p; m.close(); } });
    });
}

// add a customer or vendor; resolves the new party (with its balance) or null
function newParty(type) {
    return new Promise(resolve => {
        let made = null;
        ui.formDrawer({
            title: type === 'VENDOR' ? t('New vendor') : t('New customer'), submit: t('Save'),
            body: ui.grid(
                ui.field({ label: type === 'VENDOR' ? 'Company / vendor name' : 'Customer name', name: 'name', required: true }),
                ui.field({ label: 'Mobile', name: 'phone', type: 'tel', placeholder: '03xx-xxxxxxx', attr: { inputmode: 'tel' } }),
                ui.field({ label: type === 'VENDOR' ? 'Old balance you owe them (optional)' : 'Old udhaar they owe you (optional)', name: 'openingBalance', money: true, attr: { inputmode: 'decimal' } })),
            async onSubmit(v, d) {
                made = await api.post('/api/parties', { type, name: v.name, phone: v.phone, openingBalance: v.openingBalance || 0 });
                d.close(); ui.toast(t('Saved'));
            },
            onClose: () => resolve(made),
        });
    });
}

// a small slip for the Bluetooth receipt printer (or Android printing): payment made / payment received
function printSlip({ title, number, partyLabel, partyName, amount, method, balance, balanceLabel, note }) {
    const r = (HP.session.settings && HP.session.settings.receipt) || {};
    const c = (HP.session.settings && HP.session.settings.company) || {};
    const row = (l, v, bold) => html`<div style="display:flex;justify-content:space-between;gap:8px;${bold ? 'font-weight:700' : ''}"><span>${l}</span><span style="text-align:right">${v}</span></div>`;
    HP.ui.print(html`<div class="receipt ${r.width === '80' ? 'w80' : 'w58'}" style="padding:4px">
        <div style="text-align:center;font-weight:700;font-size:14px">${shopName()}</div>
        ${c.address ? html`<div style="text-align:center">${c.address}</div>` : ''}${c.phone ? html`<div style="text-align:center">Tel: ${c.phone}</div>` : ''}
        <hr><div style="text-align:center;font-weight:700">${title}</div><hr>
        ${number ? row('No', number) : ''}${row('Date', fmt.dateTime(new Date()))}${partyName ? row(partyLabel, partyName) : ''}
        <hr>${row('Amount / رقم', fmt.money(amount), true)}${method ? row('Method', method) : ''}
        ${balance !== undefined && balance !== null ? row(balanceLabel, fmt.money(Math.abs(balance)), true) : ''}
        ${note ? html`<div style="margin-top:4px">${note}</div>` : ''}
        <hr><div style="text-align:center">Thank you! · شکریہ</div></div>`);
}
const METHOD_LABEL = { CASH: 'Cash', BANK: 'Bank', WALLET: 'JazzCash / Easypaisa', CARD: 'Card' };

// "done" screen after saving a payment or receipt
function done(el, { title, lines, actions }) {
    ui.mount(el, html`<div class="flex flex-col items-center pt-6 text-center">
        <span class="flex h-16 w-16 items-center justify-center rounded-full bg-good-soft text-good">${icon('checkCircle', 'w-9 h-9')}</span>
        <div class="mt-4 text-xl font-bold">${title}</div>
        <div class="mt-1 space-y-0.5 text-sm text-muted">${lines.map(l => html`<div>${l}</div>`)}</div></div>
      <div class="mt-8 grid gap-2.5">${actions.map(([key, label, iconName, primary]) => html`<button type="button" class="btn ${primary ? 'btn-primary' : 'btn-outline'} h-12 w-full justify-center text-base" data-done="${key}">${icon(iconName)}${t(label)}</button>`)}</div>`);
}

// ── dates, due badges, small form pieces ──
const today = () => fmt.ymd(new Date());
const plusDays = n => fmt.ymd(new Date(Date.now() + n * 86400000));
const dueBadge = days => (days < 0 ? ui.badge(`${-days} ${t('days late')}`, 'bad') : days === 0 ? ui.badge(t('Today'), 'warn') : ui.badge(`${t('in')} ${days} ${t('days')}`, 'accent'));
// quick "+3 days" … buttons that fill a date field
const dayChips = name => html`<div class="flex flex-wrap gap-2">${[3, 7, 15, 30].map(n => html`<button type="button" class="chip normal-case" data-days="${n}" data-for="${name}">+${n} ${t('days')}</button>`)}</div>`;
function bindDayChips(root) {
    root.addEventListener('click', e => { const b = e.target.closest('[data-days]'); if (!b) return; const f = root.querySelector(`[name="${b.dataset.for}"]`); if (f) f.value = plusDays(Number(b.dataset.days)); });
}
// the big "choose customer / vendor" button at the top of a form
const partyButton = (party, type) => html`<button type="button" class="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-start shadow-sm" data-choose>
    ${party ? html`${avatar(party.name, type === 'VENDOR' ? 'bad' : 'warn')}<span class="min-w-0 flex-1"><span class="block truncate font-semibold">${party.name}</span><span class="block text-xs text-muted">${t('Tap to change')}</span></span>${amountRow(type, party.balance)}`
      : html`<span class="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-muted">${icon(type === 'VENDOR' ? 'truck' : 'user')}</span><span class="flex-1 font-medium text-muted">${type === 'VENDOR' ? t('Choose vendor') : t('Choose customer')}</span>${icon('chevronRight', 'w-5 h-5 text-muted rtl:rotate-180')}`}</button>`;
// "paid from / received in" account (cash, bank, wallet)
const accountField = (accounts, label, value) => (accounts.length ? ui.field({ label, name: 'accountId', type: 'select', value: value || (accounts.find(a => a.type === 'CASH') || accounts[0]).id, options: accounts.map(a => [a.id, `${a.name} — ${fmt.money(a.balance)}`]) }) : '');
const liveAccounts = async () => (await api.get('/api/finance/accounts').catch(() => [])).filter(a => a.active !== false);

// ═════════════════════════ Home ═════════════════════════
HP.page('/m', {
    title: 'Home', mobile: true,
    async render(el) {
        const [k, v] = await Promise.all([api.get('/api/khata/summary').catch(() => null), api.get('/api/parties/stats', { type: 'VENDOR' }).catch(() => null)]);
        const kp = (k && k.kpis) || {};
        if (HP.native && HP.native.refreshAlarms) HP.native.refreshAlarms(); // payment alarms for vendor dues
        const tile = (href, iconName, label, urdu, tone, caption) => html`<a href="${href}" data-link class="flex min-h-[124px] flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-sm transition active:scale-[.98]">
            <span class="flex h-11 w-11 items-center justify-center rounded-xl ${TONE[tone]}">${icon(iconName, 'w-6 h-6')}</span>
            <span><span class="block text-base font-bold leading-tight">${t(label)}</span>${isUr() ? '' : html`<span class="block text-sm text-muted">${urdu}</span>`}${caption ? html`<span class="mt-0.5 block text-[11px] leading-tight text-muted">${caption}</span>` : ''}</span></a>`;
        const collect = (kp.dueToday || 0) + (kp.overdue || 0), pay = (kp.vendorDueToday || 0) + (kp.vendorOverdue || 0);
        ui.mount(el, html`
          <div class="rounded-2xl bg-primary p-5 text-primary-fg shadow-sm">
            <div class="text-xs opacity-80">${fmt.longDate(new Date())}</div>
            <div class="mt-1 text-2xl font-bold leading-tight">${shopName()}</div>
            <div class="mt-4 grid grid-cols-2 gap-3">
              <a href="/m/accounts?tab=CUSTOMER" data-link class="rounded-xl bg-white/15 px-3 py-2"><div class="text-xs opacity-80">${t('To receive')}</div><div class="whitespace-nowrap text-base font-bold">${fmt.money(kp.totalReceivable || 0)}</div></a>
              <a href="/m/vendors" data-link class="rounded-xl bg-white/15 px-3 py-2"><div class="text-xs opacity-80">${t('To pay')}</div><div class="whitespace-nowrap text-base font-bold">${fmt.money((v && v.payables) || 0)}</div></a></div></div>
          <div class="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">${t('Customers')}${isUr() ? '' : ' · گاہک'}</div>
          <div class="grid grid-cols-2 gap-3">
            ${tile('/m/payment', 'arrowUp', 'Payment', 'ادھار دیا', 'warn', t('Customer took on udhaar'))}${tile('/m/receipt', 'arrowDown', 'Receipt', 'وصولی', 'good', t('Customer paid you'))}</div>
          <div class="mt-3 grid grid-cols-2 gap-3">
            ${tile('/m/reports', 'chart', 'Reports', 'رپورٹس', 'accent')}${tile('/m/accounts', 'users', 'All Accounts', 'تمام کھاتے', 'accent')}
            ${tile('/m/stock', 'package', 'Godown Stock', 'گودام اسٹاک', 'warn')}${tile('/m/vendors', 'truck', 'Vendors', 'سپلائرز', 'bad', pay ? html`<span class="font-semibold text-bad">${pay} ${t('to pay now')}</span>` : t('Goods & payments'))}</div>
          <a href="/m/reminders${!collect && pay ? '?view=vendors' : ''}" data-link class="mt-3 flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-sm transition active:scale-[.98]">
            <span class="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-warn-soft text-warn">${icon('bell', 'w-6 h-6')}${collect + pay ? html`<span class="absolute -end-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-bad px-1 text-[11px] font-bold text-white">${collect + pay}</span>` : ''}</span>
            <span class="min-w-0 flex-1"><span class="block text-base font-bold">${t('Reminders')}${isUr() ? '' : html` <span class="font-normal text-muted">· یاد دہانی</span>`}</span>
              <span class="block text-sm text-muted">${kp.dueToday || 0} ${t('to collect today')} · ${kp.overdue || 0} ${t('late')} · ${pay} ${t('vendors to pay')}</span></span>
            ${icon('chevronRight', 'w-5 h-5 text-muted rtl:rotate-180')}</a>
          <a href="/m/expense" data-link class="mt-3 flex h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-line text-sm font-medium text-muted">${icon('wallet', 'w-4 h-4')}${t('Kharcha / Expense')}${isUr() ? '' : ' · خرچہ'}</a>`);
    },
});

// ═════════════════════════ Payment: udhaar given to a customer ═════════════════════════
// The customer took goods or cash on credit: the amount goes into their khata (an amount-only entry, no stock).
HP.page('/m/payment', {
    title: 'Payment', mobile: true, perm: 'parties.manage', // customer list + khata entries
    async render(el, params, query) {
        let party = query.party ? await api.get('/api/parties/' + query.party).catch(() => null) : null;
        if (party && party.type !== 'CUSTOMER') party = null;
        let kept = {};
        const draw = () => {
            ui.mount(el, html`<p class="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">${t('Customer took goods or cash on udhaar: the amount is added to their khata.')}</p>
              <form class="mt-4 space-y-4" data-form novalidate>
                ${partyButton(party, 'CUSTOMER')}
                ${ui.grid(
                    ui.field({ label: 'Udhaar amount', name: 'amount', money: true, required: true, value: kept.amount || '', attr: { inputmode: 'decimal', autofocus: !!party } }),
                    ui.field({ label: 'Date', name: 'date', type: 'date', value: kept.date || today(), half: true, attr: { max: today() } }),
                    ui.field({ label: 'Note', name: 'note', value: kept.note || '', half: true, placeholder: 'e.g. goods on credit' }),
                    ui.field({ label: 'Will pay by (optional)', name: 'dueDate', type: 'date', value: kept.dueDate || '', attr: { min: today() } }))}
                ${dayChips('dueDate')}
                <button class="btn btn-primary h-12 w-full justify-center text-base" data-save>${icon('check')}${t('Add to khata')}</button></form>`);
        };
        const keep = () => { const f = el.querySelector('[data-form]'); if (f) kept = ui.readForm(f); };
        draw();
        bindDayChips(el);
        ui.on(el, 'click', '[data-choose]', async () => { keep(); const p = await pickParty('CUSTOMER'); if (p) { party = p; draw(); } });
        ui.on(el, 'submit', '[data-form]', e => e.preventDefault());
        ui.on(el, 'click', '[data-save]', async (e, btn) => {
            e.preventDefault();
            const v = ui.readForm(el.querySelector('[data-form]'));
            if (!party) return ui.toast(t('Choose the customer first.'), 'error');
            if (!(v.amount > 0)) return ui.toast(t('Enter the amount.'), 'error');
            btn.disabled = true;
            try {
                const r = await api.post('/api/khata/entries', { kind: 'UDHAAR', partyId: party.id, amount: v.amount, date: v.date, note: v.note, dueDate: v.dueDate || null });
                const slip = { title: 'UDHAAR / ادھار', number: r.number, partyLabel: 'Customer', partyName: party.name, amount: r.amount, balance: r.balance, balanceLabel: 'Total balance / کل بقایا', note: v.note };
                done(el, { title: `${fmt.money(r.amount)} ${t('added to khata')}`, lines: [`${party.name} · ${r.number}`, `${t('You receive')}: ${fmt.money(r.balance)}`, ...(v.dueDate ? [`${t('Will pay by')} ${fmt.date(v.dueDate)}`] : [])],
                    actions: [['wa', 'Send balance on WhatsApp', 'arrowRight', true], ['print', 'Print slip', 'printer'], ['again', 'New payment', 'plus'], ['home', 'Home', 'grid']] });
                ui.on(el, 'click', '[data-done]', (ev, b) => {
                    const k = b.dataset.done;
                    if (k === 'wa') HP.khata.sendReminder({ ...party, balance: r.balance }, { kind: 'BALANCE_REMINDER' });
                    else if (k === 'print') printSlip(slip); else if (k === 'again') go('/m/payment'); else go('/m');
                });
            } catch (err) { ui.fail(err); btn.disabled = false; }
        });
    },
});

// ═════════════════════════ Kharcha / Expense ═════════════════════════
HP.page('/m/expense', {
    title: 'Kharcha / Expense', mobile: true, perm: 'finance.manage',
    async render(el) {
        const [live, cats] = await Promise.all([liveAccounts(), api.get('/api/finance/expense-categories').catch(() => [])]);
        ui.mount(el, html`<form class="space-y-4" data-form novalidate>${ui.grid(
                ui.field({ label: 'Expense type', name: 'categoryId', type: 'select', options: [['', t('Choose…')], ...cats.map(c => [c.id, c.name])] }),
                ui.field({ label: 'Paid to (optional)', name: 'payee', placeholder: 'e.g. LESCO, landlord' }),
                ui.field({ label: 'Amount', name: 'amount', money: true, required: true, attr: { inputmode: 'decimal' } }),
                accountField(live, 'Paid from'),
                ui.field({ label: 'Date', name: 'date', type: 'date', value: today(), half: true, attr: { max: today() } }),
                ui.field({ label: 'Note', name: 'note', half: true, placeholder: 'optional' }))}
            <button class="btn btn-primary h-12 w-full justify-center text-base" data-save>${icon('check')}${t('Save expense')}</button></form>`);
        ui.on(el, 'submit', '[data-form]', e => e.preventDefault());
        ui.on(el, 'click', '[data-save]', async (e, btn) => {
            e.preventDefault();
            const v = ui.readForm(el.querySelector('[data-form]'));
            if (!(v.amount > 0)) return ui.toast(t('Enter the amount.'), 'error');
            const acc = live.find(a => a.id === v.accountId);
            const method = acc ? methodFor(acc.type) : 'CASH';
            btn.disabled = true;
            try {
                const r = await api.post('/api/finance/expenses', { categoryId: v.categoryId || null, payee: v.payee, amount: v.amount, method, accountId: v.accountId || null, date: v.date, note: v.note });
                const cat = cats.find(c => c.id === v.categoryId);
                const slip = { title: 'EXPENSE / خرچہ', number: r.reference, partyLabel: 'Paid to', partyName: v.payee || (cat ? cat.name : ''), amount: v.amount, method: METHOD_LABEL[method], note: v.note };
                done(el, { title: `${fmt.money(v.amount)} ${t('expense saved')}`, lines: [[cat ? cat.name : t('Expense'), v.payee, r.reference].filter(Boolean).join(' · ')],
                    actions: [['print', 'Print slip', 'printer'], ['again', 'New expense', 'plus', true], ['home', 'Home', 'grid']] });
                ui.on(el, 'click', '[data-done]', (ev, b) => { const k = b.dataset.done; if (k === 'print') printSlip(slip); else if (k === 'again') go('/m/expense'); else go('/m'); });
            } catch (err) { ui.fail(err); btn.disabled = false; }
        });
    },
});

// ═════════════════════════ Receipt: money received from a customer ═════════════════════════
HP.page('/m/receipt', {
    title: 'Receipt', mobile: true, perm: 'parties.manage', // customer list + receive
    async render(el, params, query) {
        const live = await liveAccounts();
        let party = query.party ? await api.get('/api/parties/' + query.party).catch(() => null) : null;
        if (party && party.type !== 'CUSTOMER') party = null;
        let kept = {};
        const draw = () => {
            ui.mount(el, html`<p class="rounded-xl bg-good-soft px-4 py-3 text-sm text-good">${t('Customer paid you: the amount is taken off their khata.')}</p>
              <form class="mt-4 space-y-4" data-form novalidate>
                ${partyButton(party, 'CUSTOMER')}
                ${ui.grid(
                    ui.field({ label: 'Amount received', name: 'amount', money: true, required: true, value: kept.amount || '', attr: { inputmode: 'decimal', autofocus: !!party } }),
                    accountField(live, 'Received in', kept.accountId),
                    ui.field({ label: 'Note', name: 'note', value: kept.note || '', placeholder: 'optional' }))}
                ${party && party.balance > 0 ? html`<button type="button" class="chip normal-case" data-full>${t('Full balance')} ${fmt.money(party.balance)}</button>` : ''}
                <button class="btn btn-primary h-12 w-full justify-center text-base" data-save>${icon('check')}${t('Save receipt')}</button></form>`);
        };
        const keep = () => { const f = el.querySelector('[data-form]'); if (f) kept = ui.readForm(f); };
        draw();
        ui.on(el, 'click', '[data-choose]', async () => { keep(); const p = await pickParty('CUSTOMER'); if (p) { party = p; draw(); } });
        ui.on(el, 'click', '[data-full]', () => { el.querySelector('[name=amount]').value = (party.balance / 100).toFixed(2); });
        ui.on(el, 'submit', '[data-form]', e => e.preventDefault());
        ui.on(el, 'click', '[data-save]', async (e, btn) => {
            e.preventDefault();
            const v = ui.readForm(el.querySelector('[data-form]'));
            if (!party) return ui.toast(t('Choose the customer first.'), 'error');
            if (!(v.amount > 0)) return ui.toast(t('Enter the amount.'), 'error');
            const acc = live.find(a => a.id === v.accountId);
            const method = acc ? methodFor(acc.type) : 'CASH';
            btn.disabled = true;
            try {
                const r = await api.post('/api/khata/receive', { partyId: party.id, amount: v.amount, method, accountId: v.accountId || null, note: v.note });
                const slip = { title: 'PAYMENT RECEIVED / وصولی', number: r.number, partyLabel: 'Received from', partyName: party.name, amount: r.amount, method: METHOD_LABEL[method], balance: r.balance, balanceLabel: r.balance >= 0 ? 'Balance due / بقایا' : 'Advance', note: v.note };
                done(el, { title: `${fmt.money(r.amount)} ${t('received')}`, lines: [`${party.name} · ${r.number}`, `${t(balanceWords('CUSTOMER', r.balance).label)}: ${fmt.money(Math.abs(r.balance))}`],
                    actions: [['wa', 'Send thank-you on WhatsApp', 'arrowRight', true], ['print', 'Print slip', 'printer'], ['again', 'New receipt', 'plus'], ['home', 'Home', 'grid']] });
                ui.on(el, 'click', '[data-done]', (ev, b) => {
                    const k = b.dataset.done;
                    if (k === 'wa') HP.khata.sendReminder({ ...party, balance: r.balance }, { kind: 'PAYMENT_THANKS', extra: { amount: HP.wa.ltr(HP.wa.rs(r.amount)) }, refId: r.id });
                    else if (k === 'print') printSlip(slip); else if (k === 'again') go('/m/receipt'); else go('/m');
                });
            } catch (err) { ui.fail(err); btn.disabled = false; }
        });
    },
});

// ═════════════════════════ Reports ═════════════════════════
HP.page('/m/reports', {
    title: 'Reports', mobile: true, perm: 'reports.view',
    async render(el, params, query) {
        let preset = PERIODS.some(p => p[0] === query.preset) ? query.preset : 'today';
        const load = async () => {
            ui.mount(el, html`${chips('period', PERIODS, preset)}<div class="mt-4" data-body>${ui.loading()}</div>`);
            const body = el.querySelector('[data-body]');
            try {
                const [d, f] = await Promise.all([api.get('/api/reports/dashboard', { preset }), api.get('/api/reports/financial', { preset })]);
                const p = d.period, cf = f.cashflow || { in: 0, out: 0, net: 0 };
                ui.mount(body, html`
                  <div class="eyebrow mb-2">${t('Sales & profit')}</div>
                  <div class="grid grid-cols-2 gap-3">
                    ${stat('Sales', fmt.money(p.netSales), '', `${p.salesCount} ${t('bills')}`)}${stat('Profit', fmt.money(p.netProfit), p.netProfit < 0 ? 'bad' : 'good')}
                    ${stat('Expenses', fmt.money(p.expenses), 'bad')}${stat('Purchases', fmt.money(p.purchases))}</div>
                  <div class="eyebrow mb-2 mt-5">${t('Cash in & out')}</div>
                  <div class="grid grid-cols-2 gap-3">${stat('Money in', fmt.money(cf.in), 'good')}${stat('Money out', fmt.money(cf.out), 'bad')}</div>
                  ${card(html`<div class="flex items-center justify-between"><span class="text-sm text-muted">${t('Net cash flow')}</span><span class="text-lg font-bold ${cf.net < 0 ? 'text-bad' : 'text-good'}">${fmt.money(cf.net)}</span></div>`, 'mt-3')}
                  <div class="eyebrow mb-2 mt-5">${t('Right now')}</div>
                  <div class="grid grid-cols-2 gap-3">
                    ${stat('Cash & bank', fmt.money(d.live.cashBank))}
                    <a href="/m/stock?filter=LOW" data-link>${stat('Low stock items', String(d.lowStockCount || 0), d.lowStockCount ? 'warn' : '')}</a>
                    <a href="/m/accounts?tab=CUSTOMER" data-link>${stat('To receive', fmt.money(d.live.receivable), 'warn')}</a>
                    <a href="/m/vendors" data-link>${stat('To pay', fmt.money(d.live.payable), 'bad')}</a></div>
                  <p class="mt-4 text-center text-xs text-muted">${d.range.fromDay === d.range.toDay ? fmt.date(d.range.fromDay) : `${fmt.date(d.range.fromDay)} – ${fmt.date(d.range.toDay)}`}</p>`);
            } catch (e) { ui.mount(body, html`<div class="text-sm text-bad">${e.message}</div>`); }
        };
        ui.on(el, 'click', '[data-chips="period"] [data-v]', (e, b) => { preset = b.dataset.v; history.replaceState(history.state, '', '/m/reports?preset=' + preset); load(); });
        await load();
    },
});

// ═════════════════════════ All Accounts (customers + vendors) ═════════════════════════
HP.page('/m/accounts', {
    title: 'All Accounts', mobile: true, perm: 'parties.manage',
    async render(el, params, query) {
        let tab = ['ALL', 'CUSTOMER', 'VENDOR'].includes(query.tab) ? query.tab : 'ALL', q = '';
        let list = [];
        const load = async () => {
            const [c, v] = await Promise.all([api.get('/api/parties', { type: 'CUSTOMER' }), api.get('/api/parties', { type: 'VENDOR' })]);
            list = [...c, ...v];
        };
        await load();
        const sumPos = type => list.filter(p => p.type === type && p.balance > 0).reduce((a, p) => a + p.balance, 0);
        const drawList = () => {
            const s = q.toLowerCase();
            const rows = list.filter(p => (tab === 'ALL' || p.type === tab) && (!s || p.name.toLowerCase().includes(s) || String(p.phone || '').includes(s)))
                .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance) || a.name.localeCompare(b.name));
            el.querySelector('[data-list]').innerHTML = String(rows.length ? html`<div class="divide-y divide-line-soft rounded-2xl border border-line bg-surface shadow-sm">${rows.slice(0, 300).map(p => html`
                <a href="${p.type === 'VENDOR' ? '/m/vendors/' : '/m/accounts/'}${p.id}" data-link class="flex items-center gap-3 px-4 py-3">${avatar(p.name, p.type === 'VENDOR' ? 'bad' : 'warn')}
                  <span class="min-w-0 flex-1"><span class="block truncate font-medium">${p.name}</span><span class="block text-xs text-muted">${p.type === 'VENDOR' ? t('Vendor') : t('Customer')}${p.phone ? ' · ' + p.phone : ''}</span></span>${amountRow(p.type, p.balance)}</a>`)}</div>`
                : empty(list.length ? 'Nothing matches.' : 'No customers or vendors yet.'));
        };
        ui.mount(el, html`<div class="grid grid-cols-2 gap-3">
              <button type="button" data-tabjump="CUSTOMER" class="text-start">${stat('To receive', fmt.money(sumPos('CUSTOMER')), 'warn')}</button>
              <button type="button" data-tabjump="VENDOR" class="text-start">${stat('To pay', fmt.money(sumPos('VENDOR')), 'bad')}</button></div>
            <div class="mt-4">${seg2('tab', [['ALL', 'All'], ['CUSTOMER', 'Customers'], ['VENDOR', 'Vendors']], tab)}</div>
            <div class="mt-3 flex gap-2"><input class="input h-11 flex-1" type="search" placeholder="${t('Search name or phone')}" data-q autocomplete="off">
              <button type="button" class="btn btn-primary h-11" data-add aria-label="${t('Add')}">${icon('userPlus')}</button></div>
            <div class="mt-3" data-list></div>`);
        drawList();
        const setTab = v => { tab = v; history.replaceState(history.state, '', '/m/accounts' + (tab === 'ALL' ? '' : '?tab=' + tab)); el.querySelectorAll('[data-seg2="tab"] [data-v]').forEach(b => { const on = b.dataset.v === tab; b.classList.toggle('bg-surface', on); b.classList.toggle('shadow-sm', on); b.classList.toggle('text-ink', on); b.classList.toggle('text-muted', !on); }); drawList(); };
        ui.on(el, 'click', '[data-seg2="tab"] [data-v]', (e, b) => setTab(b.dataset.v));
        ui.on(el, 'click', '[data-tabjump]', (e, b) => setTab(b.dataset.tabjump));
        el.querySelector('[data-q]').addEventListener('input', e => { q = e.target.value; drawList(); });
        ui.on(el, 'click', '[data-add]', () => {
            const m = ui.modal({ title: t('Add account'), width: 400, body: html`<div class="grid gap-2"><button class="btn btn-outline h-12 justify-start" data-type="CUSTOMER">${icon('user')}${t('Customer')}</button><button class="btn btn-outline h-12 justify-start" data-type="VENDOR">${icon('truck')}${t('Vendor')}</button></div>` });
            ui.on(m.el, 'click', '[data-type]', async (e, b) => { m.close(); const p = await newParty(b.dataset.type); if (p) go('/m/accounts/' + p.id); });
        });
    },
});

// one account's khata (ledger): balance, actions, every entry with the running balance
HP.page('/m/accounts/:id', {
    title: 'Khata', mobile: true, perm: 'parties.manage',
    async render(el, params) {
        const d = await api.get(`/api/parties/${params.id}/ledger`);
        if (d.party.type === 'VENDOR') return HP.router.navigate('/m/vendors/' + params.id, { replace: true }); // vendors have their own screen
        const p = d.party, vendor = false;
        const w = balanceWords(p.type, d.balance);
        const party = { ...p, balance: d.balance };
        const entries = [...d.entries].reverse();
        const lang = HP.lang() === 'ur' ? 'ur' : 'en';
        const label = e => (HP.khata && HP.khata.typeLabel ? HP.khata.typeLabel(e.type, lang) : e.type);
        let showAll = false;
        const entryRows = () => (showAll ? entries : entries.slice(0, 60)).map(e => {
            // what the entry did to the balance (in the direction the balance is read)
            const up = vendor ? e.credit - e.debit : e.debit - e.credit;
            const name = label(e), same = x => !x || x === name || x === e.type || /^(payment received|payment made|opening balance)$/i.test(x);
            return html`<div class="flex items-start gap-3 px-4 py-3"><div class="min-w-0 flex-1"><div class="font-medium">${name}${!same(e.refNo) ? html` <span class="text-xs text-muted">${e.refNo}</span>` : ''}</div>
                <div class="text-xs text-muted">${fmt.date(e.date)}${!same(e.note) && e.note !== e.refNo ? ' · ' + e.note : ''}</div></div>
              <div class="text-end"><div class="font-semibold ${up > 0 ? (vendor ? 'text-bad' : 'text-warn') : 'text-good'}">${up > 0 ? '+' : '−'}${fmt.money(Math.abs(up))}</div><div class="text-[11px] text-muted">${t('Bal')} ${fmt.money(e.balance)}</div></div></div>`;
        });
        const actions = vendor
            ? [['pay', 'Payment', 'arrowUp', 'bad'], ...(p.phone ? [['call', 'Call', 'smartphone', 'accent']] : [])]
            : [['rec', 'Receipt', 'arrowDown', 'good'], ['remind', 'Reminder', 'bell', 'warn'], ['promise', 'Promise', 'calendar', 'accent'], ['statement', 'Statement', 'file', 'accent'], ...(p.phone ? [['call', 'Call', 'smartphone', 'accent']] : [])];
        const draw = () => ui.mount(el, html`
          <div class="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <div class="flex items-center gap-3">${avatar(p.name, vendor ? 'bad' : 'warn')}<div class="min-w-0 flex-1"><div class="truncate text-lg font-bold">${p.name}</div><div class="text-xs text-muted">${vendor ? t('Vendor') : t('Customer')}${p.phone ? ' · ' + p.phone : ''}</div></div></div>
            <div class="mt-4 rounded-xl ${w.tone === 'muted' ? 'bg-surface-2' : 'bg-' + w.tone + '-soft'} px-4 py-3"><div class="text-xs text-muted">${t(w.label)}</div><div class="text-2xl font-bold ${w.tone === 'muted' ? '' : 'text-' + w.tone}">${fmt.money(Math.abs(d.balance))}</div></div>
            <div class="mt-4 grid ${COLS[Math.min(actions.length, 5)]} gap-1">${actions.map(([k, l, ic, tone]) => html`<button type="button" class="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-xs font-medium hover:bg-surface-2" data-act="${k}"><span class="flex h-10 w-10 items-center justify-center rounded-full ${TONE[tone]}">${icon(ic, 'w-5 h-5')}</span>${t(l)}</button>`)}</div></div>
          <div class="eyebrow mb-2 mt-5">${t('Khata entries')} (${entries.length})</div>
          ${entries.length ? html`<div class="divide-y divide-line-soft rounded-2xl border border-line bg-surface shadow-sm" data-entries>${entryRows()}</div>
            ${!showAll && entries.length > 60 ? html`<button type="button" class="btn btn-outline mt-3 w-full justify-center" data-more>${t('Show all')} (${entries.length})</button>` : ''}` : empty('No entries yet.')}`);
        draw();
        ui.on(el, 'click', '[data-more]', () => { showAll = true; draw(); });
        ui.on(el, 'click', '[data-act]', async (e, b) => {
            const k = b.dataset.act;
            if (k === 'pay') go('/m/payment?party=' + p.id);
            else if (k === 'rec') go('/m/receipt?party=' + p.id);
            else if (k === 'remind') HP.khata.sendReminder(party, { kind: 'BALANCE_REMINDER' });
            else if (k === 'promise') HP.khata.promiseDialog(party, () => ui.toast(t('Promise saved')));
            else if (k === 'statement') HP.khata.printStatement(d, lang === 'ur' ? 'ur' : 'both'); // Android: print / Save as PDF, then share
            else if (k === 'call') window.open('tel:' + String(p.phone).replace(/[^\d+]/g, ''), '_blank');
        });
    },
});

// ═════════════════════════ Stock ═════════════════════════
HP.page('/m/stock', {
    title: 'Godown Stock', mobile: true, perm: ['inventory.add', 'inventory.edit'],
    async render(el, params, query) {
        const all = (await api.get('/api/inventory/catalog')).filter(p => p.type !== 'SERVICE');
        const isOut = p => p.stock <= 0, isLow = p => !isOut(p) && p.reorderLevel > 0 && p.stock <= p.reorderLevel;
        let filter = ['ALL', 'LOW', 'OUT'].includes(query.filter) ? query.filter : 'ALL', q = '';
        const value = all.reduce((a, p) => a + Math.max(0, p.stock) * (p.cost || 0), 0);
        const drawList = () => {
            const s = q.toLowerCase();
            const rows = all.filter(p => (filter === 'ALL' || (filter === 'LOW' ? isLow(p) || isOut(p) : isOut(p)))
                && (!s || [p.name, p.sku, p.barcode, p.category].some(x => String(x || '').toLowerCase().includes(s))));
            el.querySelector('[data-list]').innerHTML = String(rows.length ? html`<div class="divide-y divide-line-soft rounded-2xl border border-line bg-surface shadow-sm">${rows.slice(0, 300).map(p => {
                const tone = isOut(p) ? 'bad' : isLow(p) ? 'warn' : '';
                return html`<div class="flex items-center gap-3 px-4 py-3"><div class="min-w-0 flex-1"><div class="truncate font-medium">${p.name}</div>
                    <div class="text-xs text-muted">${[p.category, p.barcode || p.sku].filter(Boolean).join(' · ') || '—'}</div><div class="text-xs text-muted">${t('Price')} ${fmt.money(p.retailPrice)}${p.cost ? ` · ${t('Cost')} ${fmt.money(p.cost)}` : ''}</div></div>
                  <div class="text-end"><div class="text-lg font-bold ${tone ? 'text-' + tone : ''}">${fmt.qty(p.stock)}</div><div class="text-[11px] text-muted">${p.baseUnit || ''}${isOut(p) ? ' · ' + t('Out') : isLow(p) ? ' · ' + t('Low') : ''}</div></div></div>`;
            })}</div>${rows.length > 300 ? html`<p class="mt-2 text-center text-xs text-muted">${t('Showing the first 300 — search to find others.')}</p>` : ''}` : empty('Nothing matches.'));
        };
        ui.mount(el, html`<div class="grid grid-cols-3 gap-2">${stat('Items', String(all.length))}${stat('Low', String(all.filter(isLow).length), 'warn')}${stat('Out', String(all.filter(isOut).length), 'bad')}</div>
            ${card(html`<div class="flex items-center justify-between"><span class="text-sm text-muted">${t('Stock value (at cost)')}</span><span class="text-lg font-bold">${fmt.money(value)}</span></div>`, 'mt-3')}
            <div class="mt-4">${seg2('filter', [['ALL', 'All'], ['LOW', 'Low stock'], ['OUT', 'Out of stock']], filter)}</div>
            <div class="mt-3 flex gap-2"><input class="input h-11 flex-1" type="search" placeholder="${t('Search name, code or category')}" data-q autocomplete="off">
              ${HP.native && HP.native.isApp() ? html`<button type="button" class="btn btn-outline h-11" data-cam aria-label="${t('Scan with camera')}">${icon('camera')}</button>` : ''}</div>
            <div class="mt-3" data-list></div>`);
        drawList();
        ui.on(el, 'click', '[data-seg2="filter"] [data-v]', (e, b) => { filter = b.dataset.v; el.querySelectorAll('[data-seg2="filter"] [data-v]').forEach(x => { const on = x.dataset.v === filter; x.classList.toggle('bg-surface', on); x.classList.toggle('shadow-sm', on); x.classList.toggle('text-ink', on); x.classList.toggle('text-muted', !on); }); drawList(); });
        const qi = el.querySelector('[data-q]');
        qi.addEventListener('input', e => { q = e.target.value; drawList(); });
        ui.on(el, 'click', '[data-cam]', async () => { try { const code = await HP.native.scan(); if (code) { q = code; qi.value = code; drawList(); } } catch (err) { ui.fail(err); } });
    },
});

// ═════════════════════════ Vendors (the people goods come from) ═════════════════════════
// List with what is owed and the next payment date; each vendor's profile, goods received, payments, due dates, khata.
function vendorReport(box, preset) {
    ui.mount(box, html`${chips('period', PERIODS, preset)}<div class="mt-4" data-rbody>${ui.loading()}</div>`);
    const body = box.querySelector('[data-rbody]');
    api.get('/api/reports/vendors', { preset }).then(r => {
        ui.mount(body, html`<div class="grid grid-cols-2 gap-3">${stat('Purchased', fmt.money(r.totals.purchased))}${stat('Paid', fmt.money(r.totals.paid), 'good')}</div>
          ${card(html`<div class="flex items-center justify-between"><span class="text-sm text-muted">${t('You still owe vendors')}</span><span class="text-xl font-bold text-bad">${fmt.money(r.totals.payable)}</span></div>
            ${r.totals.returned ? html`<div class="mt-1 text-xs text-muted">${t('Returned to vendors')}: ${fmt.money(r.totals.returned)}</div>` : ''}`, 'mt-3')}
          <div class="eyebrow mb-2 mt-5">${t('Vendors')} (${r.vendors.length})</div>
          ${r.vendors.length ? html`<div class="divide-y divide-line-soft rounded-2xl border border-line bg-surface shadow-sm">${r.vendors.map(v => html`
            <a href="/m/vendors/${v.id}" data-link class="flex items-center gap-3 px-4 py-3">${avatar(v.name, 'bad')}
              <span class="min-w-0 flex-1"><span class="block truncate font-medium">${v.name}</span>
                <span class="block text-xs text-muted">${t('Bought')} ${fmt.money(v.purchased)}</span><span class="block text-xs text-muted">${t('Paid')} ${fmt.money(v.paid)}</span></span>${amountRow('VENDOR', v.balance)}</a>`)}</div>`
            : empty('No vendor activity in this period.')}
          <p class="mt-4 text-center text-xs text-muted">${r.range.fromDay === r.range.toDay ? fmt.date(r.range.fromDay) : `${fmt.date(r.range.fromDay)} – ${fmt.date(r.range.toDay)}`}</p>`);
    }).catch(e => ui.mount(body, html`<div class="text-sm text-bad">${e.message}</div>`));
}

HP.page('/m/vendors', {
    title: 'Vendors', mobile: true, perm: 'parties.manage', // vendor list, dues; Report needs reports.view
    async render(el, params, query) {
        let tab = query.tab === 'report' ? 'REPORT' : 'LIST', q = '', preset = 'month';
        const [list, dues] = await Promise.all([api.get('/api/parties', { type: 'VENDOR' }), api.get('/api/khata/dues', { view: 'pending' })]);
        if (HP.native && HP.native.syncAlarms) HP.native.syncAlarms(dues.rows, { complete: dues.complete !== false });
        const next = {};
        for (const d of dues.rows) if (!next[d.partyId]) next[d.partyId] = d; // rows come soonest first
        const payable = list.filter(p => p.balance > 0).reduce((a, p) => a + p.balance, 0);
        const late = dues.counts.vendorOverdue || 0;
        const drawList = () => {
            const s = q.toLowerCase();
            const rows = list.filter(p => !s || p.name.toLowerCase().includes(s) || String(p.phone || '').includes(s))
                .sort((a, b) => (next[a.id] ? next[a.id].dueDate : '9999') .localeCompare(next[b.id] ? next[b.id].dueDate : '9999') || b.balance - a.balance || a.name.localeCompare(b.name));
            el.querySelector('[data-list]').innerHTML = String(rows.length ? html`<div class="divide-y divide-line-soft rounded-2xl border border-line bg-surface shadow-sm">${rows.slice(0, 300).map(p => {
                const d = next[p.id];
                return html`<a href="/m/vendors/${p.id}" data-link class="flex items-center gap-3 px-4 py-3">${avatar(p.name, 'bad')}
                  <span class="min-w-0 flex-1"><span class="block truncate font-medium">${p.name}</span>
                    ${d ? html`<span class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">${t('Pay')} ${fmt.money(d.amount)} ${dueBadge(d.daysLeft)}</span>` : html`<span class="block text-xs text-muted">${p.phone || '—'}</span>`}</span>${amountRow('VENDOR', p.balance)}</a>`;
            })}</div>` : empty(list.length ? 'Nothing matches.' : 'No vendors yet. Add the people you buy goods from.'));
        };
        const draw = () => {
            ui.mount(el, html`<div class="grid grid-cols-2 gap-3">${stat('To pay vendors', fmt.money(payable), 'bad')}${stat('Due in 7 days', fmt.money(dues.counts.vendorDueWeek || 0), late ? 'bad' : 'warn', late ? `${late} ${t('late')}` : '')}</div>
              ${can('reports.view') ? html`<div class="mt-4">${seg2('tab', [['LIST', 'Vendors'], ['REPORT', 'Report']], tab)}</div>` : ''}
              <div class="mt-3" data-tabbody></div>`);
            const box = el.querySelector('[data-tabbody]');
            if (tab === 'REPORT' && can('reports.view')) return vendorReport(box, preset);
            ui.mount(box, html`<div class="flex gap-2"><input class="input h-11 flex-1" type="search" placeholder="${t('Search name or phone')}" data-q autocomplete="off" value="${q}">
                <button type="button" class="btn btn-primary h-11" data-add aria-label="${t('New vendor')}">${icon('userPlus')}</button></div><div class="mt-3" data-list></div>`);
            box.querySelector('[data-q]').addEventListener('input', e => { q = e.target.value; drawList(); });
            drawList();
        };
        draw();
        ui.on(el, 'click', '[data-seg2="tab"] [data-v]', (e, b) => { tab = b.dataset.v; history.replaceState(history.state, '', '/m/vendors' + (tab === 'REPORT' ? '?tab=report' : '')); draw(); });
        ui.on(el, 'click', '[data-chips="period"] [data-v]', (e, b) => { preset = b.dataset.v; vendorReport(el.querySelector('[data-tabbody]'), preset); });
        ui.on(el, 'click', '[data-add]', async () => { const p = await newParty('VENDOR'); if (p) go('/m/vendors/' + p.id); });
    },
});

// one vendor: profile, what is owed, goods received, payments, payment dates, khata
HP.page('/m/vendors/:id', {
    title: 'Vendor', mobile: true, perm: 'parties.manage', // ledger, profile, dues; paying needs finance.manage
    async render(el, params, query) {
        const id = params.id;
        let d, dues, live = [];
        const load = async changed => {
            [d, dues] = await Promise.all([api.get(`/api/parties/${id}/ledger`), api.get('/api/khata/dues', { view: 'pending', partyId: id })]);
            if (HP.native && HP.native.refreshAlarms) HP.native.refreshAlarms(changed); // just changed: alarms at once
        };
        await load();
        if (d.party.type !== 'VENDOR') return HP.router.navigate('/m/accounts/' + id, { replace: true });
        const lang = isUr() ? 'ur' : 'en';
        const label = e => (HP.khata && HP.khata.typeLabel ? HP.khata.typeLabel(e.type, lang) : e.type);
        let showAll = false;
        const draw = () => {
            const p = d.party, w = balanceWords('VENDOR', d.balance);
            const entries = [...d.entries].reverse();
            ui.mount(el, html`
              <div class="rounded-2xl border border-line bg-surface p-4 shadow-sm">
                <div class="flex items-start gap-3">${avatar(p.name, 'bad')}<div class="min-w-0 flex-1"><div class="truncate text-lg font-bold">${p.name}</div>
                  <div class="text-xs text-muted">${[p.contactPerson, p.phone].filter(Boolean).join(' · ') || t('Vendor')}</div>${p.address || p.city ? html`<div class="text-xs text-muted">${[p.address, p.city].filter(Boolean).join(', ')}</div>` : ''}</div>
                  <button type="button" class="btn-icon" data-act="edit" aria-label="${t('Edit profile')}">${icon('edit')}</button></div>
                <div class="mt-4 rounded-xl ${w.tone === 'muted' ? 'bg-surface-2' : 'bg-' + w.tone + '-soft'} px-4 py-3"><div class="text-xs text-muted">${t(w.label)}</div><div class="text-2xl font-bold ${w.tone === 'muted' ? '' : 'text-' + w.tone}">${fmt.money(Math.abs(d.balance))}</div></div>
                <div class="mt-4 grid ${COLS[2 + (can('finance.manage') ? 1 : 0) + (p.phone ? 1 : 0)]} gap-1">
                  ${[['goods', 'Goods received', 'package', 'bad'], ...(can('finance.manage') ? [['pay', 'Payment', 'arrowUp', 'good']] : []), ['due', 'Pay-by date', 'calendar', 'warn'], ...(p.phone ? [['call', 'Call', 'smartphone', 'accent']] : [])].map(([k, l, ic, tone]) => html`<button type="button" class="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-xs font-medium hover:bg-surface-2" data-act="${k}"><span class="flex h-10 w-10 items-center justify-center rounded-full ${TONE[tone]}">${icon(ic, 'w-5 h-5')}</span>${t(l)}</button>`)}</div></div>
              <div class="eyebrow mb-2 mt-5">${t('Payments due')} (${dues.rows.length})</div>
              ${dues.rows.length ? html`<div class="space-y-2">${dues.rows.map(x => html`<div class="rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
                  <div class="flex items-center justify-between gap-3"><div><div class="font-bold">${fmt.money(x.amount)}</div><div class="text-xs text-muted">${fmt.date(x.dueDate)}${x.note ? ' · ' + x.note : ''}</div></div>${dueBadge(x.daysLeft)}</div>
                  <div class="mt-3 grid ${can('finance.manage') ? 'grid-cols-3' : 'grid-cols-2'} gap-2">${can('finance.manage') ? html`<button type="button" class="btn btn-primary h-9 justify-center" data-pay="${x.id}">${t('Pay')}</button>` : ''}
                    <button type="button" class="btn btn-outline h-9 justify-center" data-due="${x.id}">${icon('calendar')}${t('Date')}</button>
                    <button type="button" class="btn btn-outline h-9 justify-center text-bad" data-cancel="${x.id}">${icon('x')}${t('Remove')}</button></div></div>`)}</div>
                <p class="mt-2 text-xs text-muted">${t('Payments clear these dates by themselves, oldest first.')}</p>`
                : empty('No payment dates set. Use "Pay-by date" or set one when goods are received.')}
              <div class="eyebrow mb-2 mt-5">${t('Khata entries')} (${entries.length})</div>
              ${entries.length ? html`<div class="divide-y divide-line-soft rounded-2xl border border-line bg-surface shadow-sm">${(showAll ? entries : entries.slice(0, 60)).map(e => {
                    const up = e.credit - e.debit, name = label(e), same = x => !x || x === name || x === e.type || /^(payment made|opening balance|goods received)$/i.test(x);
                    return html`<div class="flex items-start gap-3 px-4 py-3"><div class="min-w-0 flex-1"><div class="font-medium">${name}${!same(e.refNo) ? html` <span class="text-xs text-muted">${e.refNo}</span>` : ''}</div>
                        <div class="text-xs text-muted">${fmt.date(e.date)}${!same(e.note) && e.note !== e.refNo ? ' · ' + e.note : ''}</div>
                        ${e.type === 'BILL' ? html`<button type="button" class="mt-1 text-xs text-bad" data-remove="${e.id}">${t('Remove (entered by mistake)')}</button>` : ''}</div>
                      <div class="text-end"><div class="font-semibold ${up > 0 ? 'text-bad' : 'text-good'}">${up > 0 ? '+' : '−'}${fmt.money(Math.abs(up))}</div><div class="text-[11px] text-muted">${t('Bal')} ${fmt.money(e.balance)}</div></div></div>`;
                })}</div>${!showAll && entries.length > 60 ? html`<button type="button" class="btn btn-outline mt-3 w-full justify-center" data-more>${t('Show all')} (${entries.length})</button>` : ''}` : empty('No entries yet.')}`);
        };
        const reload = async () => { await load(true); draw(); };
        draw();

        // goods received from this vendor: an amount-only khata entry, with an optional pay-by date (phone alarm)
        const goods = () => ui.formDrawer({
            title: t('Goods received'), subtitle: `${d.party.name} · مال آیا`, submit: t('Save'),
            body: html`${ui.grid(
                ui.field({ label: 'Bill amount', name: 'amount', money: true, required: true, attr: { inputmode: 'decimal', autofocus: true } }),
                ui.field({ label: 'Date', name: 'date', type: 'date', value: today(), half: true, attr: { max: today() } }),
                ui.field({ label: 'Bill no / note', name: 'note', half: true, placeholder: 'optional' }),
                ui.field({ label: 'Pay by (reminder)', name: 'dueDate', type: 'date', value: plusDays(3), attr: { min: today() } }))}
              <div class="mt-3">${dayChips('dueDate')}</div>
              <p class="mt-4 rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn">${t('Amount only: stock does not change. If this bill is also entered as a purchase on the shop computer, do not enter it here too.')}</p>`,
            onMount: form => bindDayChips(form),
            async onSubmit(v, dr) {
                await api.post('/api/khata/entries', { kind: 'BILL', partyId: id, amount: v.amount, date: v.date, note: v.note, dueDate: v.dueDate || null });
                dr.close(); ui.toast(t('Saved')); await reload();
            },
        });
        // a payment to this vendor (cash / bank); open dues it covers are marked paid by themselves
        const pay = async amount => {
            if (!live.length) live = await liveAccounts();
            ui.formDrawer({
                title: t('Payment to vendor'), subtitle: `${d.party.name} · ${t('You pay')} ${fmt.money(Math.max(0, d.balance))}`, submit: t('Save payment'),
                body: ui.grid(
                    ui.field({ label: 'Amount', name: 'amount', money: true, required: true, value: amount || '', attr: { inputmode: 'decimal', autofocus: true } }),
                    accountField(live, 'Paid from'),
                    ui.field({ label: 'Date', name: 'date', type: 'date', value: today(), half: true, attr: { max: today() } }),
                    ui.field({ label: 'Note', name: 'note', half: true, placeholder: 'optional' }),
                    ui.field({ label: 'Print a slip', name: 'print', type: 'checkbox', value: false })),
                async onSubmit(v, dr) {
                    const acc = live.find(a => a.id === v.accountId);
                    const method = acc ? methodFor(acc.type) : 'CASH';
                    // the dues it covers are cleared by the server (oldest first) — never marked by hand, or one payment would count twice
                    const r = await api.post('/api/finance/payments', { direction: 'OUT', partyId: id, amount: v.amount, method, accountId: v.accountId || null, date: v.date, note: v.note });
                    dr.close(); ui.toast(`${fmt.money(v.amount)} ${t('paid')}`);
                    await reload();
                    if (v.print) printSlip({ title: 'PAYMENT MADE / ادائیگی', number: r.number, partyLabel: 'Paid to', partyName: d.party.name, amount: v.amount, method: METHOD_LABEL[method], balance: d.balance, balanceLabel: d.balance >= 0 ? 'Still to pay' : 'Advance', note: v.note });
                },
            });
        };
        const setDue = existing => {
            // only what is not already scheduled (a second date for the same money would remind twice)
            const left = Math.max(0, d.balance - dues.rows.reduce((a, x) => a + x.amount, 0));
            if (!existing && dues.rows.length && !left) return ui.toast(t('The whole balance already has a pay-by date. Change that date instead.'), 'info');
            return setDueForm(existing, left || Math.max(0, d.balance));
        };
        const setDueForm = (existing, suggest) => ui.formDrawer({
            title: existing ? t('Change payment date') : t('Pay-by date'), subtitle: d.party.name, submit: t('Save'),
            body: html`${ui.grid(
                existing ? '' : ui.field({ label: 'Amount to pay', name: 'amount', money: true, required: true, value: suggest || '', attr: { inputmode: 'decimal' } }),
                ui.field({ label: 'Pay by', name: 'dueDate', type: 'date', required: true, value: existing ? (existing.dueDate >= today() ? existing.dueDate : today()) : plusDays(3), attr: { min: today() } }),
                existing ? '' : ui.field({ label: 'Note', name: 'note', placeholder: 'optional' }))}<div class="mt-3">${dayChips('dueDate')}</div>
              <p class="help mt-3">${t('On that day the phone shows a reminder to pay this vendor.')}</p>`,
            onMount: form => bindDayChips(form),
            async onSubmit(v, dr) {
                if (existing) await api.patch('/api/khata/dues/' + existing.id, { dueDate: v.dueDate });
                else await api.post('/api/khata/dues', { partyId: id, amount: v.amount, dueDate: v.dueDate, note: v.note });
                dr.close(); ui.toast(t('Saved')); await reload();
            },
        });
        const edit = () => ui.formDrawer({
            title: t('Edit profile'), subtitle: d.party.name, submit: t('Save'),
            body: ui.grid(
                ui.field({ label: 'Company / vendor name', name: 'name', required: true, value: d.party.name }),
                ui.field({ label: 'Contact person', name: 'contactPerson', value: d.party.contactPerson || '', half: true }),
                ui.field({ label: 'Mobile', name: 'phone', type: 'tel', value: d.party.phone || '', half: true, attr: { inputmode: 'tel' } }),
                ui.field({ label: 'Address', name: 'address', value: d.party.address || '' }),
                ui.field({ label: 'City', name: 'city', value: d.party.city || '', half: true }),
                ui.field({ label: 'Notes', name: 'notes', value: d.party.notes || '', half: true, placeholder: 'e.g. supplies flour, sugar' })),
            async onSubmit(v, dr) { await api.put('/api/parties/' + id, v); dr.close(); ui.toast(t('Saved')); await reload(); },
        });

        ui.on(el, 'click', '[data-more]', () => { showAll = true; draw(); });
        ui.on(el, 'click', '[data-act]', (e, b) => {
            const k = b.dataset.act;
            if (k === 'goods') goods(); else if (k === 'pay') pay(Math.max(0, d.balance)); else if (k === 'due') setDue(); else if (k === 'edit') edit();
            else if (k === 'call') window.open('tel:' + String(d.party.phone).replace(/[^\d+]/g, ''), '_blank');
        });
        ui.on(el, 'click', '[data-pay]', (e, b) => { const x = dues.rows.find(r => r.id === b.dataset.pay); pay(x.amount); });
        ui.on(el, 'click', '[data-cancel]', async (e, b) => {
            if (!(await ui.confirm({ title: t('Remove this pay-by date?'), message: t('Only the reminder is removed — the khata does not change. To record a payment, use "Pay".'), ok: t('Remove'), danger: true }))) return;
            try { await api.patch('/api/khata/dues/' + b.dataset.cancel, { status: 'CANCELLED' }); await reload(); } catch (err) { ui.fail(err); }
        });
        ui.on(el, 'click', '[data-due]', (e, b) => setDue(dues.rows.find(r => r.id === b.dataset.due)));
        ui.on(el, 'click', '[data-remove]', async (e, b) => {
            if (!(await ui.confirm({ title: t('Remove this entry?'), message: t('Only for an entry made by mistake. Its payment date is cancelled too.'), ok: t('Remove'), danger: true }))) return;
            try { await api.del('/api/khata/entries/' + b.dataset.remove); ui.toast(t('Removed')); await reload(); } catch (err) { ui.fail(err); }
        });
        if (query.pay && can('finance.manage')) { const x = dues.rows.find(r => r.id === query.pay); if (x) pay(x.amount); }
    },
});

// ═════════════════════════ Reminders ═════════════════════════
// customers: promises due today / late / upcoming and everyone who owes; vendors: what to pay, by when
HP.page('/m/reminders', {
    title: 'Reminders', mobile: true, perm: 'parties.manage',
    async render(el, params, query) {
        const VIEWS = [['today', 'Due today'], ['overdue', 'Late'], ['upcoming', 'Upcoming'], ['owing', 'All who owe'], ['vendors', 'Pay vendors']];
        let view = VIEWS.some(v => v[0] === query.view) ? query.view : 'today';
        const load = async () => {
            ui.mount(el, html`${chips('view', VIEWS, view)}<div class="mt-4" data-body>${ui.loading()}</div>`);
            const body = el.querySelector('[data-body]');
            try {
                if (view === 'vendors') return await vendorsToPay(body);
                let rows;
                if (view === 'owing') {
                    const s = await api.get('/api/khata/summary');
                    rows = s.rows.filter(r => r.balance > 0).sort((a, b) => b.balance - a.balance).map(r => ({ party: { id: r.id, name: r.name, phone: r.phone, balance: r.balance }, promise: r.promise, sub: r.daysSincePayment === null ? t('No payment yet') : r.daysSincePayment === 0 ? t('Paid something today') : `${t('Last payment')}: ${r.daysSincePayment} ${t('days ago')}` }));
                } else {
                    const s = await api.get('/api/khata/promises', { view });
                    rows = s.rows.map(r => ({ party: { id: r.partyId, name: r.name, phone: r.phone, balance: r.balance }, promise: r, sub: `${t('Promised')} ${fmt.money(r.amount)} · ${fmt.date(r.promisedDate)}${r.remindCount ? ` · ${t('reminded')} ${r.remindCount}×` : ''}` }));
                }
                ui.mount(body, rows.length ? html`<div class="space-y-3">${rows.map((r, i) => html`<div class="rounded-2xl border border-line bg-surface p-4 shadow-sm">
                    <a href="/m/accounts/${r.party.id}" data-link class="flex items-start gap-3">${avatar(r.party.name, 'warn')}
                      <span class="min-w-0 flex-1"><span class="block truncate font-semibold">${r.party.name}</span><span class="block text-xs text-muted">${r.sub}</span></span>
                      <span class="text-end"><span class="block font-bold text-warn">${fmt.money(r.party.balance)}</span>${r.promise && r.promise.daysLeft !== undefined ? dueBadge(r.promise.daysLeft) : ''}</span></a>
                    <div class="mt-3 grid grid-cols-3 gap-2">
                      <button type="button" class="btn btn-primary h-10 justify-center" data-remind="${i}">${icon('bell')}${t('Remind')}</button>
                      <button type="button" class="btn btn-outline h-10 justify-center" data-promise="${i}">${icon('calendar')}${t('Promise')}</button>
                      <button type="button" class="btn btn-outline h-10 justify-center" data-rec="${i}">${icon('arrowDown')}${t('Receive')}</button></div></div>`)}</div>`
                    : empty(view === 'owing' ? 'Nobody owes you money.' : view === 'today' ? 'No promises due today.' : view === 'overdue' ? 'No late promises.' : 'No upcoming promises.'));
                ui.on(body, 'click', '[data-remind]', (e, b) => { const r = rows[+b.dataset.remind]; const pr = r.promise && r.promise.promisedDate ? r.promise : null; HP.khata.sendReminder(r.party, pr && view !== 'owing' ? { kind: 'PROMISE_REMINDER', promise: pr, onDone: load } : { kind: 'BALANCE_REMINDER', onDone: load }); });
                ui.on(body, 'click', '[data-promise]', (e, b) => HP.khata.promiseDialog(rows[+b.dataset.promise].party, load));
                ui.on(body, 'click', '[data-rec]', (e, b) => go('/m/receipt?party=' + rows[+b.dataset.rec].party.id));
            } catch (e) { ui.mount(body, html`<div class="text-sm text-bad">${e.message}</div>`); }
        };
        // vendors to pay, soonest first
        async function vendorsToPay(body) {
            const s = await api.get('/api/khata/dues', { view: 'pending' });
            if (HP.native && HP.native.syncAlarms) HP.native.syncAlarms(s.rows, { complete: s.complete !== false });
            const total = s.rows.reduce((a, r) => a + r.amount, 0);
            ui.mount(body, s.rows.length ? html`${card(html`<div class="flex items-center justify-between"><span class="text-sm text-muted">${t('To pay on the dates below')}</span><span class="text-lg font-bold text-bad">${fmt.money(total)}</span></div>`)}
                <div class="mt-3 space-y-3">${s.rows.map(r => html`<div class="rounded-2xl border border-line bg-surface p-4 shadow-sm">
                  <a href="/m/vendors/${r.partyId}" data-link class="flex items-start gap-3">${avatar(r.name, 'bad')}
                    <span class="min-w-0 flex-1"><span class="block truncate font-semibold">${r.name}</span><span class="block text-xs text-muted">${fmt.date(r.dueDate)}${r.note ? ' · ' + r.note : ''}</span></span>
                    <span class="text-end"><span class="block font-bold text-bad">${fmt.money(r.amount)}</span>${dueBadge(r.daysLeft)}</span></a>
                  <div class="mt-3 grid grid-cols-2 gap-2"><a href="/m/vendors/${r.partyId}${can('finance.manage') ? '?pay=' + r.id : ''}" data-link class="btn btn-primary h-10 justify-center">${icon('arrowUp')}${t('Pay now')}</a>
                    <a href="/m/vendors/${r.partyId}" data-link class="btn btn-outline h-10 justify-center">${t('Open vendor')}</a></div></div>`)}</div>`
                : empty('No vendor payments are due. Set a pay-by date when goods are received.'));
        }
        ui.on(el, 'click', '[data-chips="view"] [data-v]', (e, b) => { view = b.dataset.v; history.replaceState(history.state, '', '/m/reminders?view=' + view); load(); });
        await load();
    },
});

// ═════════════════════════ Phone settings ═════════════════════════
HP.page('/m/settings', {
    title: 'Settings', mobile: true,
    async render(el) {
        const s = HP.session;
        ui.mount(el, html`${card(html`<div class="flex items-center gap-3">${avatar(s.name || s.email)}<div class="min-w-0"><div class="truncate font-semibold">${s.name || s.email}</div><div class="truncate text-xs text-muted">${s.email} · ${shopName()}</div></div></div>`)}
          <div class="mt-4 rounded-2xl border border-line bg-surface p-4 shadow-sm"><div class="mb-2 text-sm font-semibold">${t('Language')}</div>${seg2('lang', [['en', 'English'], ['ur', 'اردو']], HP.lang())}
            <div class="mb-2 mt-4 text-sm font-semibold">${t('Night mode')}</div>${seg2('dark', [['0', 'Off'], ['1', 'On']], document.documentElement.classList.contains('dark') ? '1' : '0')}</div>
          <div class="mt-4 rounded-2xl border border-line bg-surface p-4 shadow-sm" data-phone></div>
          <button type="button" class="btn btn-outline mt-4 h-12 w-full justify-center text-bad" data-signout>${icon('logout')}${t('Sign out')}</button>
          <p class="mt-4 text-center text-xs text-muted">${t('Everything else (POS, staff, full settings) is on the HisabPro website and the shop computer.')}</p>`);
        if (HP.native && HP.native.isApp()) HP.native.settingsCard(el.querySelector('[data-phone]'));
        else el.querySelector('[data-phone]').remove();
        ui.on(el, 'click', '[data-seg2="lang"] [data-v]', (e, b) => { HP.setLang(b.dataset.v); HP.router.render(); });
        ui.on(el, 'click', '[data-seg2="dark"] [data-v]', (e, b) => { localStorage.setItem('hp.dark', b.dataset.v); HP.shell.applyTheme(); HP.router.render(); });
    },
});
