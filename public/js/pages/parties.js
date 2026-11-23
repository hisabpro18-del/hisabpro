// Parties: Customers and Vendors (KPI cards, list, New/Edit drawers, khata statement with print).
// Layout and labels follow reference/REFERENCE.md "Customers" / "Vendors".
const { html, raw, icon, api, ui, fmt, t } = HP;
const has = k => Perms.has(HP.session, k);

const GROUPS = [['RETAIL', 'Retail'], ['WHOLESALE', 'Wholesale'], ['VIP', 'VIP']];
const TERMS = [['COD', 'Cash on Delivery'], ['DUE_ON_RECEIPT', 'Due on Receipt'], ['NET_15', 'Net 15'], ['NET_30', 'Net 30'], ['NET_45', 'Net 45'], ['NET_60', 'Net 60'], ['PREPAID', 'Prepaid']];
const label = (list, v) => (list.find(x => x[0] === v) || [v, v])[1];
const ENTRY = { OPENING: 'Opening balance', SALE: 'Sale', SALE_RETURN: 'Sale return', PURCHASE: 'Purchase', PURCHASE_RETURN: 'Purchase return (debit note)', PAYMENT_IN: 'Payment received', PAYMENT_OUT: 'Payment made', CHEQUE: 'Cheque cleared', ADJUSTMENT: 'Adjustment', UDHAAR: 'Udhaar given (phone)', BILL: 'Goods received (phone)' };
const searchIcon = () => html`<span class="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted">${icon('search')}</span>`;

const CFG = {
    CUSTOMER: {
        path: '/customers', title: 'Customers', one: 'customer', subtitle: 'Customer relationship & ledger — credit limits, receivables, and risk at a glance.',
        emptyIcon: 'userPlus', emptyTitle: 'No customers yet', emptyText: 'Build your customer ledger with credit limits, groups, and receivable tracking — ready for POS credit sales.',
        firstLabel: 'Add First Customer', addLabel: 'Add Customer', search: 'Search by name, phone or city…',
        newTitle: 'New Customer', editTitle: 'Edit Customer', formSubtitle: 'Customer relationship & credit profile', balanceWord: 'Receivable',
        kpis: s => [
            { label: 'Total Customers', value: String(s.total), iconName: 'users', tone: 'accent' },
            { label: 'Total Receivables', value: fmt.money(s.receivables), iconName: 'banknote', tone: 'bad', valueTone: 'bad' },
            { label: 'Over-Limit Customers', value: String(s.overLimit), iconName: 'alert', tone: s.overLimit ? 'bad' : 'good', valueTone: s.overLimit ? 'bad' : 'good' },
        ],
        columns: [
            { label: 'Name', render: p => html`<div class="font-medium">${p.name}</div>${p.phone ? html`<div class="text-xs text-muted">${p.phone}</div>` : ''}` },
            { label: 'Group', render: p => ui.badge(label(GROUPS, p.group), p.group === 'VIP' ? 'accent' : p.group === 'WHOLESALE' ? 'warn' : 'gray', false) },
            { label: 'Phone', render: p => p.phone || html`<span class="text-muted">—</span>` },
            { label: 'City', render: p => p.city || html`<span class="text-muted">—</span>` },
            { label: 'Balance', num: true, render: p => html`<span class="font-semibold ${p.balance > 0 ? 'text-warn' : p.balance < 0 ? 'text-good' : 'text-muted'}">${fmt.money(p.balance)}</span>${p.balance < 0 ? html`<div class="text-[11px] text-muted">advance</div>` : ''}` },
            { label: 'Credit Limit', num: true, render: p => html`${p.creditLimit ? fmt.money(p.creditLimit) : html`<span class="text-muted">Unlimited</span>`}${p.overLimit ? html`<div class="mt-0.5">${ui.badge('Over limit', 'bad')}</div>` : ''}` },
        ],
        match: p => [p.name, p.phone, p.email, p.city],
    },
    VENDOR: {
        path: '/vendors', title: 'Vendors', one: 'vendor', subtitle: 'Supplier ledger & accounts payable — payment terms, payables, and payout details.',
        emptyIcon: 'truck', emptyTitle: 'No vendors yet', emptyText: 'Build your supplier ledger with payment terms, bank details, and payable tracking — ready for purchase orders and payment out.',
        firstLabel: 'Add First Vendor', addLabel: 'Add Vendor', search: 'Search by company, contact or phone…',
        newTitle: 'New Vendor', editTitle: 'Edit Vendor', formSubtitle: 'Supplier ledger & accounts payable profile', balanceWord: 'Payable',
        kpis: s => [
            { label: 'Total Vendors', value: String(s.total), iconName: 'building', tone: 'accent' },
            { label: 'Total Payables', value: fmt.money(s.payables), iconName: 'users', tone: 'accent', valueTone: 'accent' },
            { label: 'Recent Inwards', value: String(s.recentInwards), iconName: 'truck', tone: 'gray', sub: 'Added this month' },
        ],
        columns: [
            { label: 'Company', render: p => html`<div class="font-medium">${p.name}</div>${p.contactPerson ? html`<div class="text-xs text-muted">${p.contactPerson}</div>` : ''}` },
            { label: 'Phone', render: p => p.phone || html`<span class="text-muted">—</span>` },
            { label: 'Payment Terms', render: p => label(TERMS, p.paymentTerms) },
            { label: 'Payable', num: true, render: p => html`<span class="font-semibold ${p.balance > 0 ? 'text-bad' : p.balance < 0 ? 'text-good' : 'text-muted'}">${fmt.money(p.balance)}</span>${p.balance < 0 ? html`<div class="text-[11px] text-muted">advance paid</div>` : ''}` },
        ],
        match: p => [p.name, p.contactPerson, p.phone, p.email],
    },
};

function partyPage(type) {
    const c = CFG[type];
    HP.page(c.path, {
        title: c.title, perm: 'parties.manage',
        async render(el) {
            let list = [], q = '';
            const draw = () => {
                const s = q.toLowerCase();
                const rows = s ? list.filter(p => c.match(p).some(v => String(v || '').toLowerCase().includes(s))) : list;
                const toolbar = el.querySelector('[data-toolbar]');
                toolbar.classList.toggle('hidden', !list.length);
                if (!list.length) return ui.mount(el.querySelector('[data-list]'), html`<div class="card">${ui.empty({ iconName: c.emptyIcon, title: c.emptyTitle, text: c.emptyText, action: html`<button class="btn btn-primary" data-new>${icon('plus')}${c.firstLabel}</button>` })}</div>`);
                ui.mount(el.querySelector('[data-list]'), ui.table({
                    rows, empty: `No ${c.one}s match "${q}".`,
                    columns: [...c.columns, { label: 'Actions', render: p => html`<div class="flex items-center gap-1 whitespace-nowrap">
                        <button class="btn btn-outline btn-sm" data-ledger="${p.id}">${icon('file')}Ledger</button>
                        <button class="btn-icon !w-8 !h-8 border-0" data-edit="${p.id}" aria-label="Edit ${p.name}" title="Edit">${icon('edit')}</button>
                        <button class="btn-icon !w-8 !h-8 border-0 !text-rose-600" data-del="${p.id}" aria-label="Delete ${p.name}" title="Delete">${icon('trash')}</button></div>` }],
                }));
            };
            const load = async () => {
                const [l, s] = await Promise.all([api.get('/api/parties', { type }), api.get('/api/parties/stats', { type })]);
                list = l;
                ui.mount(el.querySelector('[data-kpis]'), html`${c.kpis(s).map(k => kpi(k))}`);
                draw();
            };
            ui.mount(el, html`${ui.pageHeader({ title: t(c.title), subtitle: c.subtitle })}
              <div class="mb-6 grid gap-4 md:grid-cols-3" data-kpis>${ui.loading()}</div>
              <div class="hidden" data-toolbar><div class="mb-4 flex flex-wrap items-center justify-between gap-3"><div class="relative w-full max-w-md">${searchIcon()}<input class="input ps-9" placeholder="${c.search}" data-q></div><button class="btn btn-primary" data-new>${icon('plus')}${c.addLabel}</button></div></div>
              <div data-list>${html`<div class="card">${ui.loading()}</div>`}</div>`);
            el.querySelector('[data-q]').addEventListener('input', e => { q = e.target.value; draw(); });
            ui.on(el, 'click', '[data-new]', () => partyDrawer(type, null, load));
            ui.on(el, 'click', '[data-edit]', (e, b) => partyDrawer(type, b.dataset.edit, load));
            ui.on(el, 'click', '[data-ledger]', (e, b) => ledgerDrawer(b.dataset.ledger));
            ui.on(el, 'click', '[data-del]', async (e, b) => {
                const p = list.find(x => x.id === b.dataset.del);
                if (p.balance !== 0) return ui.toast(`${p.name} still has a balance of ${fmt.money(p.balance)}. Settle it to zero before deleting.`, 'error');
                if (!(await ui.confirm({ title: `Delete "${p.name}"?`, message: 'They disappear from lists and pickers. Their khata history is kept.', ok: 'Delete', danger: true }))) return;
                try { await api.del('/api/parties/' + p.id); ui.toast(`${p.name} deleted`); load(); } catch (err) { ui.fail(err); }
            });
            await load();
        },
    });
}

// the reference's KPI card: round tinted icon on the left, label and large figure
const KTONE = { accent: 'bg-accent-soft text-accent', bad: 'bg-bad-soft text-bad', good: 'bg-good-soft text-good', gray: 'bg-surface-2 text-muted' };
const VTONE = { accent: 'text-accent', bad: 'text-bad', good: 'text-good' };
const kpi = k => html`<div class="card card-pad flex items-center gap-4"><div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${KTONE[k.tone] || KTONE.gray}">${icon(k.iconName, 'w-5 h-5')}</div>
    <div class="min-w-0"><div class="text-sm text-muted">${k.label}</div><div class="truncate text-2xl font-bold tracking-tight ${VTONE[k.valueTone] || ''}">${k.value}</div>${k.sub ? html`<div class="text-xs text-muted">${k.sub}</div>` : ''}</div></div>`;

async function partyDrawer(type, id, onDone) {
    const c = CFG[type];
    let p = { group: 'RETAIL', paymentTerms: 'NET_30', creditLimit: 0, openingBalance: 0 };
    if (id) { try { p = await api.get('/api/parties/' + id); } catch (err) { return ui.fail(err); } }
    const body = type === 'CUSTOMER' ? html`
        ${ui.section('BASIC INFO',
            ui.field({ label: 'Name', name: 'name', value: p.name || '', required: true, attr: { autofocus: true } }),
            ui.field({ label: 'Phone', name: 'phone', value: p.phone || '', half: true }),
            ui.field({ label: 'Email', name: 'email', type: 'email', value: p.email || '', half: true }),
            ui.field({ label: 'Customer Group', name: 'group', type: 'select', value: p.group, options: GROUPS }))}
        ${ui.section('FINANCIAL & RISK',
            ui.field({ label: 'Opening Receivable', name: 'openingBalance', money: true, value: p.openingBalance, placeholder: '0.00', help: id ? 'Changing it replaces the opening entry in the ledger.' : 'Sets the initial receivable balance for this customer.' }),
            ui.field({ label: 'Credit Limit', name: 'creditLimit', money: true, value: p.creditLimit, placeholder: '0', help: 'Set to 0 for unlimited credit' }),
            ui.field({ label: 'Tax ID / NTN', name: 'taxId', value: p.taxId || '' }),
            ui.field({ label: 'Cashier Notes', name: 'notes', type: 'textarea', value: p.notes || '', placeholder: 'Instructions for cashiers (e.g. VIP handling, delivery prefs)' }))}
        ${ui.section('LOCATION',
            ui.field({ label: 'Address', name: 'address', value: p.address || '' }),
            ui.field({ label: 'City', name: 'city', value: p.city || '' }))}`
        : html`
        ${ui.section('COMPANY INFO',
            ui.field({ label: 'Company Name', name: 'name', value: p.name || '', required: true, placeholder: 'Supplier / brand name', attr: { autofocus: true } }),
            ui.field({ label: 'Contact Person', name: 'contactPerson', value: p.contactPerson || '', placeholder: 'Primary contact at the company' }),
            ui.field({ label: 'Phone', name: 'phone', value: p.phone || '', half: true }),
            ui.field({ label: 'Email', name: 'email', type: 'email', value: p.email || '', half: true }))}
        ${ui.section('FINANCIAL & TERMS',
            ui.field({ label: 'Opening Payable', name: 'openingBalance', money: true, value: p.openingBalance, placeholder: '0.00', help: id ? 'Changing it replaces the opening entry in the ledger.' : "Sets the initial payable balance — becomes the vendor's live payable on save." }),
            ui.field({ label: 'Tax ID / NTN', name: 'taxId', value: p.taxId || '' }),
            ui.field({ label: 'Payment Terms', name: 'paymentTerms', type: 'select', value: p.paymentTerms, options: TERMS }),
            ui.field({ label: 'Internal Notes', name: 'notes', type: 'textarea', value: p.notes || '', placeholder: 'Notes for the purchasing team (not shown on POs)' }))}
        ${ui.section('LOCATION & PAYOUT',
            ui.field({ label: 'Address', name: 'address', value: p.address || '' }),
            ui.field({ label: 'Bank Details / IBAN', name: 'bankDetails', type: 'textarea', value: p.bankDetails || '', placeholder: 'Account number, bank name, IBAN for quick payments' }))}`;
    ui.formDrawer({
        title: id ? c.editTitle : c.newTitle, subtitle: c.formSubtitle, body,
        async onSubmit(v, d) {
            if (id) await api.put('/api/parties/' + id, v); else await api.post('/api/parties', { ...v, type });
            d.close(); ui.toast(id ? `${v.name} saved` : `${v.name} added`); onDone();
        },
    });
}

// ───────── statement (khata) ─────────
async function ledgerDrawer(id) {
    let s;
    try { s = await api.get(`/api/parties/${id}/ledger`); } catch (err) { return ui.fail(err); }
    const p = s.party, vendor = p.type === 'VENDOR';
    const word = vendor ? 'Payable' : 'Receivable';
    const rows = [...s.entries].reverse();
    const d = ui.drawer({
        title: `${p.name} — Ledger`, subtitle: `${vendor ? 'Vendor' : 'Customer'} statement · ${[p.phone, vendor ? p.contactPerson : p.city].filter(Boolean).join(' · ') || 'running balance of every khata entry'}`, wide: true,
        body: html`<div class="grid grid-cols-3 gap-3">
            <div class="rounded-xl border border-line px-4 py-3"><div class="text-xs text-muted">${vendor ? 'Total billed (credit)' : 'Total billed (debit)'}</div><div class="font-semibold tabular-nums">${fmt.money(vendor ? s.totals.credit : s.totals.debit)}</div></div>
            <div class="rounded-xl border border-line px-4 py-3"><div class="text-xs text-muted">${vendor ? 'Total paid (debit)' : 'Total received (credit)'}</div><div class="font-semibold tabular-nums">${fmt.money(vendor ? s.totals.debit : s.totals.credit)}</div></div>
            <div class="rounded-xl border border-line px-4 py-3"><div class="text-xs text-muted">Current ${word}</div><div class="text-lg font-bold tabular-nums ${s.balance > 0 ? (vendor ? 'text-bad' : 'text-warn') : 'text-good'}">${fmt.money(s.balance)}</div></div></div>
          ${!vendor && p.creditLimit ? html`<p class="mt-2 text-xs ${p.overLimit ? 'text-bad' : 'text-muted'}">Credit limit ${fmt.money(p.creditLimit)}${p.overLimit ? ' — over the limit' : ''}</p>` : ''}
          <div class="mt-4 overflow-x-auto rounded-xl border border-line">${rows.length ? html`<table class="tbl"><thead><tr><th>Date</th><th>Details</th><th class="!text-right">Debit</th><th class="!text-right">Credit</th><th class="!text-right">Balance</th></tr></thead>
            <tbody>${rows.map(e => html`<tr><td class="whitespace-nowrap text-xs text-muted">${fmt.date(e.date)}</td><td><div class="text-sm font-medium">${ENTRY[e.type] || e.type}</div><div class="text-xs text-muted">${[e.refNo, e.note !== e.refNo ? e.note : ''].filter(Boolean).join(' · ')}</div></td>
              <td class="num whitespace-nowrap">${e.debit ? fmt.money(e.debit) : ''}</td><td class="num whitespace-nowrap">${e.credit ? fmt.money(e.credit) : ''}</td><td class="num whitespace-nowrap font-medium">${fmt.money(e.balance)}</td></tr>`)}</tbody></table>`
            : html`<div class="px-6 py-12 text-center text-sm text-muted">No ledger entries yet.</div>`}</div>
          <p class="mt-3 text-xs text-muted">${vendor ? 'Vendor balance = credit − debit (what we owe them).' : 'Customer balance = debit − credit (what they owe us).'}</p>`,
        footer: html`${has('finance.manage') ? html`<a class="btn btn-outline" href="/payments?type=${vendor ? 'out' : 'in'}&partyId=${p.id}" data-link data-go>${icon(vendor ? 'arrowUp' : 'arrowDown')}${vendor ? 'Make Payment' : 'Receive Payment'}</a>` : ''}<button class="btn btn-primary" data-print>${icon('printer')}Print Statement</button>`,
    });
    const go = d.el.querySelector('[data-go]'); if (go) go.addEventListener('click', () => d.close());
    d.el.querySelector('[data-print]').addEventListener('click', () => printStatement(s));
}

function printStatement(s) {
    const p = s.party, vendor = p.type === 'VENDOR';
    const co = (HP.session.settings && HP.session.settings.company) || {};
    const cell = 'border:1px solid #999;padding:4px 6px;text-align:left', cellR = 'border:1px solid #999;padding:4px 6px;text-align:right';
    ui.print(html`<div class="receipt a4" style="padding:6mm">
      <div style="display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px">
        <div><div style="font-size:18px;font-weight:700">${co.name || HP.session.tenant.name}</div><div>${co.address || ''}</div><div>${[co.phone, co.email].filter(Boolean).join(' · ')}</div></div>
        <div style="text-align:right"><div style="font-size:16px;font-weight:700">${vendor ? 'VENDOR' : 'CUSTOMER'} STATEMENT</div><div>As of ${fmt.date(new Date())}</div></div></div>
      <div style="margin-bottom:10px"><b>${p.name}</b>${p.contactPerson ? ` (${p.contactPerson})` : ''}<br>${[p.phone, p.address, p.city].filter(Boolean).join(' · ')}</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th style="${cell}">Date</th><th style="${cell}">Details</th><th style="${cell}">Ref</th><th style="${cellR}">Debit</th><th style="${cellR}">Credit</th><th style="${cellR}">Balance</th></tr></thead>
        <tbody>${s.entries.map(e => html`<tr><td style="${cell}">${fmt.date(e.date)}</td><td style="${cell}">${ENTRY[e.type] || e.type}${e.note && e.note !== e.refNo ? html`<div style="font-size:10px">${e.note}</div>` : ''}</td><td style="${cell}">${e.refNo}</td><td style="${cellR}">${e.debit ? fmt.money(e.debit) : ''}</td><td style="${cellR}">${e.credit ? fmt.money(e.credit) : ''}</td><td style="${cellR}">${fmt.money(e.balance)}</td></tr>`)}
        <tr><td style="${cell}" colspan="3"><b>Totals</b></td><td style="${cellR}"><b>${fmt.money(s.totals.debit)}</b></td><td style="${cellR}"><b>${fmt.money(s.totals.credit)}</b></td><td style="${cellR}"><b>${fmt.money(s.balance)}</b></td></tr></tbody></table>
      <p style="text-align:right;font-size:14px;font-weight:700;margin-top:12px">${vendor ? 'Balance payable' : 'Balance due'}: ${fmt.money(s.balance)}</p>
      <p style="font-size:11px">${raw('&nbsp;')}${window.Calc.words(Math.abs(s.balance))}</p></div>`);
}

partyPage('CUSTOMER');
partyPage('VENDOR');
