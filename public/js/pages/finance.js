// Finance screens: Payments In/Out, Capital & Equity, Banks & Cash, Cheques, Expenses, Taxes & Duties.
// Layout and labels follow reference/REFERENCE.md (Finance part) and its "Cross-screen accounting model".
const { html, raw, icon, api, ui, fmt, t } = HP;

const TYPE = { CASH: 'Cash', BANK: 'Bank', WALLET: 'Wallet' };
const accountLabel = a => `${a.name} (${TYPE[a.type] || a.type}) — ${fmt.money(a.balance)}`;
const searchIcon = () => html`<span class="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted">${icon('search')}</span>`;
const METHOD = { CASH: 'Cash', BANK: 'Bank', CARD: 'Card', WALLET: 'Wallet', CHEQUE: 'Cheque' };
// which accounts a payment method uses
const accountType = m => (m === 'CASH' ? 'CASH' : m === 'WALLET' ? 'WALLET' : 'BANK');
const accountOptions = (accounts, method, selected = '') => {
    const list = accounts.filter(a => a.active !== false && a.type === accountType(method));
    return html`<option value="">${list.length ? `Default ${METHOD[method] ? METHOD[method].toLowerCase() : ''} account` : method === 'CASH' ? 'Cash in Hand' : 'No such account yet — Cash in Hand is used'}</option>${list.map(a => html`<option value="${a.id}" ${a.id === selected ? raw('selected') : ''}>${accountLabel(a)}</option>`)}`;
};
const allAccountOptions = (accounts, selected = '', placeholder = 'Select bank or cash account…') => html`<option value="">${placeholder}</option>${accounts.filter(a => a.active !== false).map(a => html`<option value="${a.id}" ${a.id === selected ? raw('selected') : ''}>${accountLabel(a)}</option>`)}`;
const monthLabel = m => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }); };

// KPI card of the reference: round tinted icon on the left
const KTONE = { accent: 'bg-accent-soft text-accent', bad: 'bg-bad-soft text-bad', good: 'bg-good-soft text-good', warn: 'bg-warn-soft text-warn', gray: 'bg-surface-2 text-muted' };
const VTONE = { accent: 'text-accent', bad: 'text-bad', good: 'text-good', warn: 'text-warn' };
const kpi = k => html`<div class="card card-pad flex items-center gap-4"><div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${KTONE[k.tone] || KTONE.gray}">${icon(k.iconName, 'w-5 h-5')}</div>
    <div class="min-w-0"><div class="text-sm text-muted">${k.label}</div><div class="truncate text-2xl font-bold tracking-tight ${VTONE[k.valueTone] || ''}">${k.value}</div>${k.sub ? html`<div class="text-xs text-muted">${k.sub}</div>` : ''}</div></div>`;

// a table with sortable headers. st = { key, dir }; columns [{ key, label, num, sort(row), render(row) }]
function sortTable(st, columns, rows, emptyHtml, rowCls) {
    if (!rows.length) return emptyHtml;
    const col = columns.find(c => c.key === st.key);
    const sorted = col && col.sort ? [...rows].sort((a, b) => { const x = col.sort(a), y = col.sort(b); return (x < y ? -1 : x > y ? 1 : 0) * (st.dir === 'asc' ? 1 : -1); }) : rows;
    return html`<div class="overflow-x-auto thin-scroll"><table class="tbl"><thead><tr>${columns.map(c => html`<th class="${c.num ? '!text-right' : ''}">${c.sort ? html`<button type="button" class="inline-flex items-center gap-1 uppercase tracking-wider hover:text-ink" data-sort="${c.key}">${c.label}${icon(st.key === c.key && st.dir === 'asc' ? 'chevronUp' : 'chevronDown', `w-3 h-3 ${st.key === c.key ? '' : 'opacity-40'}`)}</button>` : c.label}</th>`)}</tr></thead>
      <tbody>${sorted.map(r => html`<tr class="${rowCls ? rowCls(r) : ''}">${columns.map(c => html`<td class="${c.num ? 'num whitespace-nowrap' : ''} ${c.cls || ''}">${c.render(r)}</td>`)}</tr>`)}</tbody></table></div>`;
}
const onSort = (el, st, redraw) => ui.on(el, 'click', '[data-sort]', (e, b) => { const k = b.dataset.sort; st.dir = st.key === k ? (st.dir === 'asc' ? 'desc' : 'asc') : 'desc'; st.key = k; redraw(); });

// charts made by a page are destroyed when it redraws or is left
function chartKeeper() {
    const list = [];
    return {
        add(canvas, cfg) { const c = ui.chart(canvas, cfg); if (c) list.push(c); return c; },
        clear() { while (list.length) { try { list.pop().destroy(); } catch { } } },
    };
}
// axis ticks: whole rupees below a lakh, short (L / Cr) above
const tick = v => (Math.abs(v) >= 1e7 ? fmt.short(v) : (v / 100).toLocaleString('en-US', { maximumFractionDigits: 0 }));
const moneyTip = { callbacks: { label: c => ` ${c.label ? c.label + ': ' : ''}${fmt.money(c.raw)}` } };
const donut = (labels, data, colors) => ({ type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }] }, options: { cutout: '72%', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: moneyTip } } });
const bars = (labels, data, color) => ({ type: 'bar', data: { labels, datasets: [{ data, backgroundColor: color, borderRadius: 6, maxBarThickness: 42 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmt.money(c.raw) } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: {}, ticks: { callback: tick } } } } });
const chartCard = (title, sub, inner) => html`<div class="card card-pad"><div class="font-semibold">${title}</div><div class="text-xs text-muted">${sub}</div><div class="mt-4">${inner}</div></div>`;
const chartEmpty = text => html`<div class="flex h-64 items-center justify-center text-sm text-muted">${text}</div>`;
const legendRows = items => html`<div class="flex-1 space-y-3">${items.map(it => html`<div class="flex items-center justify-between gap-3"><div class="flex min-w-0 items-center gap-3"><span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:${it.color}"></span><div class="min-w-0"><div class="truncate text-sm font-medium">${it.label}</div><div class="text-xs text-muted">${fmt.money(it.value)}</div></div></div><div class="text-sm text-muted">${it.pct}</div></div>`)}</div>`;
const pctOf = (v, total) => (total > 0 ? `${Math.round((Math.max(v, 0) / total) * 100)}%` : '0%');

function companyName() { const c = (HP.session.settings && HP.session.settings.company) || {}; return c.name || HP.session.tenant.name; }

// ═════════════════════════ Payments In/Out ═════════════════════════
HP.page('/payments', {
    title: 'Payments In/Out', perm: 'finance.manage',
    async render(el, params, query) {
        // the list is the newest CAP payments; the totals count all of them, and a search of a full list asks the server
        const CAP = 2000;
        let list = [], q = '', found = null, totals = null;
        const st = { key: 'date', dir: 'desc' };
        const draw = () => {
            const sum = d => list.filter(p => p.direction === d).reduce((s, p) => s + p.amount, 0);
            const inn = totals ? totals.in : sum('IN'), out = totals ? totals.out : sum('OUT');
            ui.mount(el.querySelector('[data-kpis]'), html`${kpi({ label: t('Payment In'), value: fmt.money(inn), iconName: 'arrowDown', tone: 'good', valueTone: 'good' })}${kpi({ label: t('Payment Out'), value: fmt.money(out), iconName: 'arrowUp', tone: 'bad', valueTone: 'bad' })}${kpi({ label: 'Net Flow', value: fmt.money(inn - out), iconName: 'wallet', tone: 'accent', valueTone: inn - out < 0 ? 'bad' : '' })}`);
            const s = q.toLowerCase();
            const rows = found || (s ? list.filter(p => (p.partyName + ' ' + p.number + ' ' + p.reference).toLowerCase().includes(s)) : list);
            el.querySelector('[data-capnote]').textContent = !q && list.length >= CAP ? t('Showing the newest 2,000 transactions — search to find older ones.') : '';
            ui.mount(el.querySelector('[data-list]'), sortTable(st, [
                { key: 'date', label: 'Date', sort: p => new Date(p.date).getTime(), render: p => html`<span class="whitespace-nowrap">${fmt.dateTime(p.date)}</span>` },
                { key: 'number', label: 'Transaction ID', render: p => html`<span class="font-mono text-xs font-semibold">${p.number}</span>` },
                { key: 'party', label: 'Party Name', render: p => html`<div class="font-medium">${p.partyName || (p.direction === 'IN' ? 'Other income' : 'Other payout')}</div>${p.reference || p.note ? html`<div class="text-xs text-muted">${[p.reference, p.note].filter(Boolean).join(' · ')}</div>` : ''}` },
                { key: 'type', label: 'Type', render: p => (p.direction === 'IN' ? ui.badge('Payment In', 'good') : ui.badge('Payment Out', 'bad')) },
                { key: 'method', label: 'Method', render: p => html`<div>${METHOD[p.method] || p.method}</div><div class="text-xs text-muted">${p.accountName}</div>` },
                { key: 'amount', label: 'Amount', num: true, sort: p => p.amount, render: p => html`<span class="font-semibold ${p.direction === 'IN' ? 'text-good' : 'text-bad'}">${p.direction === 'IN' ? '+' : '−'}${fmt.money(p.amount)}</span>` },
                { key: 'action', label: 'Action', render: p => html`<div class="flex gap-1"><button class="btn-icon !w-8 !h-8 border-0" data-print="${p.id}" aria-label="Print ${p.number}" title="Print receipt">${icon('printer')}</button><button class="btn-icon !w-8 !h-8 border-0 !text-rose-600" data-del="${p.id}" aria-label="Delete ${p.number}" title="Delete">${icon('trash')}</button></div>` },
            ], rows, list.length ? html`<div class="py-12 text-center text-sm text-muted">No transactions match "${q}".</div>`
                : ui.empty({ iconName: 'receipt', title: 'No transactions found', text: 'Record your first payment to start tracking customer and supplier ledger activity.', action: html`<button class="btn btn-primary" data-new>${icon('plus')}New Transaction</button>` })));
        };
        const load = async () => { [list, totals] = await Promise.all([api.get('/api/finance/payments'), api.get('/api/finance/payments', { totals: 1 }).catch(() => null)]); found = null; if (q && list.length >= CAP) found = await api.get('/api/finance/payments', { q }); draw(); };
        ui.mount(el, html`${ui.pageHeader({ title: t('Payments In/Out'), subtitle: 'GAAP-compliant cashflow dashboard — track payment in and payment out with live ledger visibility.' })}
          <div class="mb-6 grid gap-4 md:grid-cols-3" data-kpis></div>
          <div class="card mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div class="relative w-full max-w-sm">${searchIcon()}<input class="input ps-9" placeholder="Search by Customer/Supplier" data-q></div><button class="btn btn-primary" data-new>${icon('plus')}New Transaction</button></div>
          <p class="mb-2 text-xs text-muted empty:hidden" data-capnote></p>
          <div class="card" data-list>${ui.loading()}</div>`);
        let tm;
        el.querySelector('[data-q]').addEventListener('input', e => {
            q = e.target.value; found = null;
            clearTimeout(tm);
            if (q.trim() && list.length >= CAP) tm = setTimeout(async () => { const want = q; const r = await api.get('/api/finance/payments', { q: want }).catch(ui.fail); if (r && want === q) { found = r; draw(); } }, 300);
            draw();
        });
        onSort(el, st, draw);
        ui.on(el, 'click', '[data-new]', () => paymentDrawer('IN', load));
        ui.on(el, 'click', '[data-print]', (e, b) => api.get('/api/finance/payments/' + b.dataset.print).then(HP.receipt.printPayment).catch(ui.fail));
        ui.on(el, 'click', '[data-del]', async (e, b) => {
            const p = list.find(x => x.id === b.dataset.del);
            if (!(await ui.confirm({ title: `Delete ${p.number}?`, message: `The ${fmt.money(p.amount)} is taken back out of ${p.accountName || 'the account'}${p.partyName ? ` and ${p.partyName}'s ledger entry is reversed` : ''}.`, ok: 'Delete', danger: true }))) return;
            try { await api.del('/api/finance/payments/' + p.id); ui.toast(`${p.number} deleted`); load(); } catch (err) { ui.fail(err); }
        });
        await load();
        const qt = String(query.type || '').toLowerCase();
        if (qt === 'in' || qt === 'out') {
            history.replaceState({}, '', '/payments');
            paymentDrawer(qt.toUpperCase(), load, query.partyId);
        }
    },
});

async function paymentDrawer(direction, onDone, partyId) {
    let parties, accounts;
    try { [parties, accounts] = await Promise.all([api.get('/api/finance/parties'), api.get('/api/finance/accounts')]); } catch (err) { return ui.fail(err); }
    const pre = partyId && parties.find(p => p.id === partyId);
    if (pre) direction = pre.type === 'VENDOR' ? 'OUT' : 'IN';
    const partyOptions = (dir, sel = '') => {
        const type = dir === 'IN' ? 'CUSTOMER' : 'VENDOR';
        return html`<option value="">${dir === 'IN' ? 'None — other income' : 'None — other payout'}</option><optgroup label="${dir === 'IN' ? 'Customers' : 'Vendors'}">${parties.filter(p => p.type === type).map(p => html`<option value="${p.id}" ${p.id === sel ? raw('selected') : ''}>${p.name}${p.phone ? ` · ${p.phone}` : ''}</option>`)}</optgroup>`;
    };
    ui.formDrawer({
        title: 'New Transaction', subtitle: 'Record payment in or out with live ledger balance.', submit: html`${icon('download')}${t('Save')}`,
        body: html`<div class="grid grid-cols-12 gap-4">
            ${ui.field({ label: 'Type', name: 'direction', type: 'select', value: direction, options: [['IN', 'Payment In'], ['OUT', 'Payment Out']], half: true, attr: { 'data-dir': true } })}
            ${ui.field({ label: 'Method', name: 'method', type: 'select', value: 'CASH', options: Object.entries(METHOD), half: true, attr: { 'data-method': true } })}
            <div class="col-span-12"><label class="label">Party (Customer / Supplier)</label><select class="input" name="partyId" data-party>${partyOptions(direction, pre ? pre.id : '')}</select><div class="mt-2 hidden rounded-lg bg-surface-2 px-3 py-2 text-sm" data-bal></div></div>
            <div class="col-span-12" data-acct-box><label class="label">Account</label><select class="input" name="accountId" data-account>${accountOptions(accounts, 'CASH')}</select></div>
            <div class="col-span-12 hidden" data-cheque-box><div class="grid grid-cols-12 gap-4">
              ${ui.field({ label: 'Cheque Number', name: 'chequeNo', placeholder: 'e.g. 004521', half: true })}
              ${ui.field({ label: 'Cheque Date', name: 'dueDate', type: 'date', value: fmt.ymd(), half: true })}
              ${ui.field({ label: 'Bank', name: 'bankName', placeholder: 'Bank name on the cheque' })}
              <p class="col-span-12 -mt-2 text-xs text-muted">A cheque is recorded as pending on the Cheques screen; money moves when you mark it cleared.</p></div></div>
            ${ui.field({ label: 'Amount', name: 'amount', money: true, required: true, half: true })}
            ${ui.field({ label: 'Date', name: 'date', type: 'date', value: fmt.ymd(), half: true })}
            ${ui.field({ label: 'Reference', name: 'reference', placeholder: 'Optional reference (slip / transaction no.)' })}
            ${ui.field({ label: 'Note', name: 'note', placeholder: 'Optional note' })}
            ${ui.field({ label: 'Print the receipt after saving (with the remaining balance)', name: 'printIt', type: 'checkbox', value: HP.receipt.autoPayPrint() })}</div>`,
        onMount(form) {
            const showBal = () => {
                const p = parties.find(x => x.id === form.querySelector('[data-party]').value);
                const box = form.querySelector('[data-bal]');
                box.classList.toggle('hidden', !p);
                if (p) box.innerHTML = String(p.type === 'VENDOR'
                    ? html`Current payable to <b>${p.name}</b>: <b class="${p.balance > 0 ? 'text-bad' : 'text-good'}">${fmt.money(p.balance)}</b>${p.bankDetails ? html`<div class="mt-1 text-xs text-muted">Bank: ${p.bankDetails}</div>` : ''}`
                    : html`Current receivable from <b>${p.name}</b>: <b class="${p.balance > 0 ? 'text-warn' : 'text-good'}">${fmt.money(p.balance)}</b>${p.creditLimit ? html` <span class="text-xs text-muted">(limit ${fmt.money(p.creditLimit)})</span>` : ''}`);
            };
            form.addEventListener('change', e => {
                if (e.target.matches('[data-dir]')) { form.querySelector('[data-party]').innerHTML = String(partyOptions(e.target.value)); showBal(); }
                if (e.target.matches('[data-party]')) showBal();
                if (e.target.matches('[data-method]')) {
                    const m = e.target.value;
                    form.querySelector('[data-cheque-box]').classList.toggle('hidden', m !== 'CHEQUE');
                    form.querySelector('[data-acct-box]').classList.toggle('hidden', m === 'CHEQUE');
                    if (m !== 'CHEQUE') form.querySelector('[data-account]').innerHTML = String(accountOptions(accounts, m));
                }
            });
            showBal();
        },
        async onSubmit(v, d) {
            if (!v.amount) throw new Error('Enter the amount.');
            if (v.method === 'CHEQUE') {
                if (!v.partyId) throw new Error(v.direction === 'IN' ? 'A cheque payment in needs a customer.' : 'A cheque payment out needs a vendor.');
                if (!v.chequeNo) throw new Error('Cheque Number is required.');
                await api.post('/api/finance/cheques', { type: v.direction === 'IN' ? 'RECEIVED' : 'ISSUED', partyId: v.partyId, chequeNo: v.chequeNo, bankName: v.bankName, amount: v.amount, issueDate: v.date, dueDate: v.dueDate, note: [v.reference, v.note].filter(Boolean).join(' · ') });
                d.close(); ui.toast('Cheque recorded as pending — clear it on the Cheques screen when it is honoured.'); return onDone();
            }
            const printIt = v.printIt; delete v.printIt;
            HP.receipt.autoPayPrint(printIt);
            const r = await api.post('/api/finance/payments', v);
            d.close();
            ui.toast(`${r.number} saved: ${fmt.money(r.amount)}${r.balance !== null && r.balance !== undefined ? ` · ${r.partyType === 'VENDOR' ? 'payable' : 'balance'} now ${fmt.money(r.balance)}` : ''}`);
            if (printIt) HP.receipt.printPayment(r);
            onDone();
        },
    });
}

// ═════════════════════════ Capital & Equity ═════════════════════════
HP.page('/finance/capital', {
    title: 'Capital & Equity', perm: 'finance.manage',
    async render(el) {
        const charts = chartKeeper();
        const st = { key: 'date', dir: 'desc' };
        let data, accounts = [];
        const draw = () => {
            charts.clear();
            const d = data;
            const C1 = '#6366f1', C2 = '#10b981';
            const total = Math.max(d.injected, 0) + Math.max(d.retainedEarnings, 0);
            ui.mount(el.querySelector('[data-body]'), html`
              ${d.setup.done ? '' : html`<div class="card card-pad mb-6 flex flex-wrap items-center justify-between gap-3 border-indigo-200 bg-accent-soft dark:border-indigo-900"><div><div class="font-semibold">Set up your opening books</div><div class="text-sm text-muted">Enter the money first invested in the business and the cash you hold today. Opening cash is added to Cash in Hand.</div></div><button class="btn btn-primary" data-setup>${icon('wand')}Set Up Now</button></div>`}
              <div class="grid gap-4 md:grid-cols-3">
                <div class="card card-pad"><div class="flex items-start justify-between gap-3"><div><div class="text-sm text-muted">Total Capital Injected</div><div class="mt-2 text-2xl font-bold tracking-tight text-accent">${fmt.money(d.injected)}</div><div class="mt-1 text-xs text-muted">Owner funds invested in the business</div></div><div class="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">${icon('building', 'w-5 h-5')}</div></div>
                  <button class="btn btn-outline btn-sm mt-4" data-setup>${icon('edit')}Update Setup</button></div>
                <div class="card card-pad"><div class="flex items-start justify-between gap-3"><div><div class="text-sm text-muted">Retained Earnings</div><div class="mt-2 text-2xl font-bold tracking-tight ${d.retainedEarnings < 0 ? 'text-bad' : 'text-good'}">${fmt.money(d.retainedEarnings)}</div><div class="mt-1 text-xs text-muted">Net profit ${fmt.money(d.netProfit)} − drawings ${fmt.money(d.drawings)}</div></div><div class="flex h-10 w-10 items-center justify-center rounded-xl bg-good-soft text-good">${icon('trending', 'w-5 h-5')}</div></div></div>
                <div class="card card-pad"><div class="flex items-start justify-between gap-3"><div><div class="text-sm text-muted">Total Business Net Worth</div><div class="mt-2 text-2xl font-bold tracking-tight ${d.netWorth < 0 ? 'text-bad' : ''}">${fmt.money(d.netWorth)}</div><div class="mt-1 text-xs text-muted">Capital injected + retained earnings</div></div><div class="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-muted">${icon('dollar', 'w-5 h-5')}</div></div></div>
              </div>
              <div class="mt-6 grid gap-6 lg:grid-cols-2">
                ${chartCard('Equity Composition', 'Owner money vs earned profit', total > 0 ? html`<div class="flex flex-wrap items-center gap-6"><div class="relative h-52 w-52"><canvas data-donut></canvas><div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><div class="eyebrow">NET WORTH</div><div class="text-sm font-bold">${fmt.money(d.netWorth)}</div></div></div>
                  ${legendRows([{ label: 'Capital Injected', value: d.injected, color: C1, pct: pctOf(d.injected, total) }, { label: 'Retained Earnings', value: d.retainedEarnings, color: C2, pct: pctOf(d.retainedEarnings, total) }])}</div>` : chartEmpty('No equity recorded yet'))}
                ${chartCard('Net Worth Trend', 'Cumulative capital injected + retained earnings', html`<div class="h-56"><canvas data-trend></canvas></div>`)}
              </div>
              <div class="card mt-6"><div class="flex flex-wrap items-start justify-between gap-3 px-5 pt-5"><div><div class="text-base font-semibold">Capital Movements</div><div class="text-sm text-muted">Injections increase capital; drawings reduce retained earnings and sync to bank.</div></div><button class="btn btn-primary" data-move>${icon('plus')}Record Movement</button></div>
                <div class="mt-4" data-moves></div></div>`);
            ui.mount(el.querySelector('[data-moves]'), sortTable(st, [
                { key: 'date', label: 'Date', sort: m => new Date(m.date).getTime(), render: m => html`<span class="whitespace-nowrap">${fmt.dateTime(m.date)}</span>` },
                { key: 'type', label: 'Type', sort: m => m.label, render: m => (m.signed >= 0 ? html`<span class="badge badge-good">${icon('checkCircle', 'w-3 h-3')}${m.label}</span>` : html`<span class="badge badge-warn">${icon('arrowUp', 'w-3 h-3')}${m.label}</span>`) },
                { key: 'reference', label: 'Reference', sort: m => m.reference, render: m => m.reference || html`<span class="text-muted">—</span>` },
                { key: 'note', label: 'Note', sort: m => m.note, render: m => html`<div>${m.note || '—'}</div><div class="text-xs text-muted">${m.accountName}</div>` },
                { key: 'amount', label: 'Amount', num: true, sort: m => m.signed, render: m => html`<span class="font-semibold ${m.signed >= 0 ? 'text-good' : 'text-bad'}">${m.signed >= 0 ? '+' : '−'}${fmt.money(m.amount)}</span>` },
                { key: 'x', label: '', render: m => (m.type === 'SETUP' ? '' : html`<button class="btn-icon !w-8 !h-8 border-0 !text-rose-600" data-del="${m.id}" aria-label="Delete movement" title="Delete">${icon('trash')}</button>`) },
            ], d.movements, html`<div class="px-6 pb-10 pt-4 text-center text-sm text-muted">No capital movements yet. Set up your opening books or record an injection.</div>`));
            const dn = el.querySelector('[data-donut]');
            if (dn) charts.add(dn, donut(['Capital Injected', 'Retained Earnings'], [Math.max(d.injected, 0), Math.max(d.retainedEarnings, 0)], [C1, C2]));
            charts.add(el.querySelector('[data-trend]'), { type: 'line', data: { labels: d.trend.map(x => monthLabel(x.month)), datasets: [{ label: 'Net worth', data: d.trend.map(x => x.netWorth), borderColor: C1, backgroundColor: 'rgba(99,102,241,0.15)', fill: true, tension: 0.3, pointRadius: 3 }] },
                options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmt.money(c.raw) } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: {}, ticks: { callback: tick } } } } });
        };
        const load = async () => { [data, accounts] = await Promise.all([api.get('/api/finance/capital'), api.get('/api/finance/accounts')]); draw(); };
        ui.mount(el, html`${ui.pageHeader({ title: t('Capital & Equity'), subtitle: "GAAP owner's equity — capital injected, retained earnings, and net worth." })}<div data-body>${ui.loading()}</div>`);
        onSort(el, st, draw);
        ui.on(el, 'click', '[data-setup]', () => setupModal(data.setup, load));
        ui.on(el, 'click', '[data-move]', () => movementDrawer(accounts, load));
        ui.on(el, 'click', '[data-del]', async (e, b) => {
            const m = data.movements.find(x => x.id === b.dataset.del);
            if (!(await ui.confirm({ title: `Delete this ${m.label.toLowerCase()}?`, message: `${fmt.money(m.amount)} ${m.signed >= 0 ? 'is taken back out of' : 'goes back into'} ${m.accountName}.`, ok: 'Delete', danger: true }))) return;
            try { await api.del('/api/finance/capital/' + m.id); ui.toast('Movement deleted'); load(); } catch (err) { ui.fail(err); }
        });
        await load();
        return () => charts.clear();
    },
});

function setupModal(setup, onDone) {
    const m = ui.modal({
        width: 460,
        body: html`<div class="flex flex-col items-center text-center"><div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">${icon('wand', 'w-6 h-6')}</div>
            <h2 class="text-lg font-semibold">Update opening books</h2><p class="mt-1 text-sm text-muted">Adjust your recorded initial investment and opening cash balance.</p></div>
          <form class="mt-5 grid grid-cols-12 gap-4" data-f>
            ${ui.field({ label: 'Initial Investment Amount', name: 'openingCapital', money: true, value: setup.openingCapital, required: true, placeholder: '0.00', help: 'How much money was put into the business to start.' })}
            ${ui.field({ label: 'Current Cash/Bank Balance', name: 'openingCash', money: true, value: setup.openingCash, required: true, placeholder: '0.00', help: 'Money currently available in cash or bank accounts. It is posted as the opening balance of Cash in Hand.' })}
            <p class="col-span-12 rounded-lg bg-surface-2 px-3 py-2 text-sm" data-prev></p>
            <div data-err class="col-span-12 hidden rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"></div>
            <button class="btn btn-primary col-span-12 w-full" data-save>Save Changes</button><button type="button" class="col-span-12 text-sm text-muted hover:text-ink" data-close>Cancel</button></form>`,
    });
    const f = m.el.querySelector('[data-f]');
    const prev = () => { const v = ui.readForm(f); m.el.querySelector('[data-prev]').textContent = `Preview: Capital ${fmt.money(v.openingCapital)} · Opening cash ${fmt.money(v.openingCash)}`; };
    f.addEventListener('input', prev); prev();
    f.addEventListener('submit', async e => {
        e.preventDefault();
        const err = m.el.querySelector('[data-err]');
        try { await api.post('/api/finance/capital/setup', ui.readForm(f)); m.close(); ui.toast('Opening books saved'); onDone(); }
        catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); }
    });
}

function movementDrawer(accounts, onDone) {
    const SUB = { INJECTION: 'Owner adds money — increases equity and bank balance.', DRAWING: 'Owner takes money out — reduces retained earnings and the bank balance.', DIVIDEND: 'Profit paid out to the owners — reduces retained earnings and the bank balance.' };
    const chip = type => (type === 'INJECTION' ? html`<span class="badge badge-good">${icon('arrowDown', 'w-3 h-3')}Credits equity & bank</span>` : html`<span class="badge badge-warn">${icon('arrowUp', 'w-3 h-3')}Debits retained earnings & bank</span>`);
    ui.formDrawer({
        title: 'Record Capital Movement', subtitle: SUB.INJECTION,
        body: html`<div class="grid grid-cols-12 gap-4">
            <div class="col-span-12">${ui.field({ label: 'Movement Type', name: 'type', type: 'select', options: [['INJECTION', 'Capital Injection — Owner adds money'], ['DRAWING', 'Owner Drawing — Owner takes money out'], ['DIVIDEND', 'Dividend — Profit paid to owners']], attr: { 'data-type': true } })}<div class="mt-2" data-chip>${chip('INJECTION')}</div></div>
            ${ui.field({ label: 'Amount', name: 'amount', money: true, required: true, placeholder: '0.00' })}
            <div class="col-span-12"><label class="label">Transfer To/From Bank<span class="text-rose-500"> *</span></label><select class="input" name="accountId" required>${allAccountOptions(accounts)}</select></div>
            ${ui.field({ label: 'Reference', name: 'reference', placeholder: 'Cheque no., transfer ref…' })}
            ${ui.field({ label: 'Note', name: 'note', placeholder: 'Optional memo' })}</div>`,
        onMount(form, d) {
            form.addEventListener('change', e => {
                if (!e.target.matches('[data-type]')) return;
                form.querySelector('[data-chip]').innerHTML = String(chip(e.target.value));
                d.el.querySelector('h2').nextElementSibling.textContent = SUB[e.target.value];
            });
        },
        async onSubmit(v, d) {
            if (!v.amount) throw new Error('Enter the amount.');
            const a = accounts.find(x => x.id === v.accountId);
            if (v.type !== 'INJECTION' && a && v.amount > a.balance) throw new Error(`${a.name} holds only ${fmt.money(a.balance)}.`);
            await api.post('/api/finance/capital', v);
            d.close(); ui.toast('Capital movement recorded'); onDone();
        },
    });
}

// ═════════════════════════ Banks & Cash ═════════════════════════
const TXN = { OPENING: 'Opening Balance', SALE: 'Sale', SALE_RETURN: 'Sale Return', PURCHASE: 'Purchase', PURCHASE_RETURN: 'Purchase Return', PAYMENT_IN: 'Payment In', PAYMENT_OUT: 'Payment Out', EXPENSE: 'Expense', TRANSFER_IN: 'Transfer In', TRANSFER_OUT: 'Transfer Out', CAPITAL_IN: 'Capital Injection', DRAWING: 'Drawing', CHEQUE: 'Cheque Cleared', PAYROLL: 'Payroll', ADVANCE: 'Advance' };

HP.page('/banks', {
    title: 'Banks & Cash', perm: 'finance.manage',
    async render(el) {
        const charts = chartKeeper();
        let accounts = [], rows = [], selected = null;
        const draw = () => {
            charts.clear();
            const total = accounts.reduce((s, a) => s + a.balance, 0);
            const positive = accounts.reduce((s, a) => s + Math.max(a.balance, 0), 0);
            el.querySelector('[data-sub]').textContent = `Treasury Management Dashboard — ${fmt.money(total)} total liquidity`;
            const shown = selected ? rows.filter(r => r.accountId === selected) : rows;
            const sel = accounts.find(a => a.id === selected);
            ui.mount(el.querySelector('[data-body]'), html`
              <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                ${accounts.map(a => html`<div role="button" tabindex="0" data-acct="${a.id}" class="relative cursor-pointer rounded-2xl bg-linear-to-br from-slate-600 to-slate-800 p-5 text-white shadow-lg transition hover:-translate-y-0.5 dark:from-slate-700 dark:to-slate-900 ${selected === a.id ? 'ring-2 ring-accent ring-offset-2 ring-offset-canvas' : ''}">
                  <button type="button" class="absolute end-3 top-3 rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white" data-edit-acct="${a.id}" aria-label="Edit ${a.name}">${icon('edit')}</button>
                  <div class="flex items-center gap-2 text-xs font-semibold tracking-wider text-white/80">${icon(a.type === 'CASH' ? 'wallet' : a.type === 'WALLET' ? 'monitor' : 'landmark')}${(TYPE[a.type] || a.type).toUpperCase()}${a.isDefault ? html`<span class="rounded bg-white/15 px-1.5 py-0.5 text-[10px]">DEFAULT</span>` : ''}</div>
                  <div class="mt-2 truncate pe-6 font-medium">${a.name}</div>${a.bankName || a.accountNo ? html`<div class="truncate text-xs text-white/60">${[a.bankName, a.accountNo].filter(Boolean).join(' · ')}</div>` : ''}
                  <div class="mt-3 text-[10px] font-semibold tracking-wider text-white/60">CURRENT BALANCE</div><div class="text-2xl font-bold tracking-tight ${a.balance < 0 ? 'text-rose-300' : ''}">${fmt.money(a.balance)}</div></div>`)}
                <button type="button" data-add-acct class="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line text-sm font-medium text-muted hover:bg-surface-2"><span class="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2">${icon('plus', 'w-5 h-5')}</span>Add New Account</button>
              </div>
              <div class="card card-pad mt-6"><div class="font-semibold">Liquidity Overview</div><div class="text-xs text-muted">Fund distribution across treasury accounts</div>
                ${positive > 0 ? html`<div class="mt-4 flex flex-wrap items-center gap-8"><div class="relative h-52 w-52"><canvas data-donut></canvas><div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><div class="eyebrow">TOTAL LIQUIDITY</div><div class="text-sm font-bold">${fmt.money(total)}</div></div></div>
                  ${legendRows(accounts.map((a, i) => ({ label: `${a.name} (${TYPE[a.type] || a.type})`, value: a.balance, color: ui.PALETTE[i % ui.PALETTE.length], pct: pctOf(a.balance, positive) })))}</div>` : chartEmpty('No money in any account yet')}</div>
              <div class="mt-8 flex flex-wrap items-end justify-between gap-3"><div><h2 class="text-lg font-semibold">Transactions Ledger</h2><p class="text-sm text-muted">All treasury movements — transfers, payments, and account activity</p></div>
                ${sel ? html`<div class="flex items-center gap-2"><span class="badge badge-accent">${sel.name}</span><button class="btn btn-ghost btn-sm" data-clear>${icon('x')}Show all accounts</button></div>` : ''}</div>
              <div class="card mt-3">${shown.length ? html`<div class="overflow-x-auto thin-scroll"><table class="tbl"><thead><tr><th>Date</th><th>Bank</th><th>Type</th><th>Reference/Note</th><th class="!text-right">Amount</th>${sel ? html`<th class="!text-right">Balance</th>` : ''}</tr></thead><tbody>
                ${shown.map(r => html`<tr><td class="whitespace-nowrap">${fmt.dateTime(r.date)}</td><td>${r.accountName}</td><td><span class="badge ${r.amount >= 0 ? 'badge-good' : 'badge-bad'}">${TXN[r.type] || r.type}</span></td>
                  <td><div>${r.refNo}</div>${r.note && r.note !== r.refNo ? html`<div class="text-xs text-muted">${r.note}</div>` : ''}</td><td class="num font-semibold ${r.amount >= 0 ? 'text-good' : 'text-bad'}">${r.amount >= 0 ? '+ ' : '− '}${fmt.money(Math.abs(r.amount))}</td>${sel ? html`<td class="num">${fmt.money(r.balance)}</td>` : ''}</tr>`)}</tbody></table></div>`
                : html`<div class="py-12 text-center text-sm text-muted">No transactions yet.</div>`}</div>`);
            const dn = el.querySelector('[data-donut]');
            if (dn) charts.add(dn, donut(accounts.map(a => a.name), accounts.map(a => Math.max(a.balance, 0)), accounts.map((a, i) => ui.PALETTE[i % ui.PALETTE.length])));
        };
        const load = async () => { [accounts, rows] = await Promise.all([api.get('/api/finance/accounts'), api.get('/api/finance/ledger', { limit: 2000 })]); draw(); };
        ui.mount(el, html`${ui.pageHeader({ title: t('Banks & Cash'), subtitle: html`<span data-sub>Treasury Management Dashboard</span>`, actions: html`<button class="btn btn-primary" data-transfer>${icon('refresh')}Transfer Funds</button>` })}<div data-body>${ui.loading()}</div>`);
        ui.on(el, 'click', '[data-acct]', (e, b) => { if (e.target.closest('[data-edit-acct]')) return; selected = selected === b.dataset.acct ? null : b.dataset.acct; draw(); });
        ui.on(el, 'keydown', '[data-acct]', (e, b) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selected = selected === b.dataset.acct ? null : b.dataset.acct; draw(); } });
        ui.on(el, 'click', '[data-clear]', () => { selected = null; draw(); });
        ui.on(el, 'click', '[data-edit-acct]', (e, b) => accountDrawer(accounts.find(a => a.id === b.dataset.editAcct), load));
        ui.on(el, 'click', '[data-add-acct]', () => accountDrawer(null, load));
        ui.on(el, 'click', '[data-transfer]', () => transferDrawer(accounts, load));
        await load();
        return () => charts.clear();
    },
});

function accountDrawer(a, onDone) {
    const d = ui.formDrawer({
        title: a ? 'Edit Account' : 'Add New Account', subtitle: a ? `${a.name} · balance ${fmt.money(a.balance)}` : 'Create a bank or cash account for treasury tracking.',
        body: html`<div class="grid grid-cols-12 gap-4">
            ${ui.field({ label: 'Name', name: 'name', value: a ? a.name : '', required: true, placeholder: 'e.g. HBL Main Account', attr: { autofocus: true } })}
            ${ui.field({ label: 'Account Type', name: 'type', type: 'select', value: a ? a.type : 'BANK', options: [['BANK', 'Bank account'], ['CASH', 'Cash drawer / petty cash account'], ['WALLET', 'Mobile wallet (JazzCash, Easypaisa…)']] })}
            ${ui.field({ label: 'Bank Name', name: 'bankName', value: a ? a.bankName : '', placeholder: 'e.g. HBL, Meezan', half: true })}
            ${ui.field({ label: 'Account #', name: 'accountNo', value: a ? a.accountNo : '', placeholder: 'Optional account number', half: true })}
            ${a ? '' : ui.field({ label: 'Opening Balance', name: 'openingBalance', money: true, placeholder: '0.00', help: 'Money already in this account today.' })}
            ${ui.field({ label: 'Default account for its type', name: 'isDefault', type: 'checkbox', value: a ? a.isDefault : false, help: 'Used when a payment does not pick an account.' })}</div>`,
        extraFooter: a ? html`<button type="button" class="btn btn-ghost me-auto !text-rose-600" data-del-acct>${icon('trash')}Delete</button>` : '',
        async onSubmit(v, dd) {
            if (a) await api.put('/api/finance/accounts/' + a.id, v); else await api.post('/api/finance/accounts', v);
            dd.close(); ui.toast(a ? 'Account saved' : `Account "${v.name}" added`); onDone();
        },
    });
    const del = d.el.querySelector('[data-del-acct]');
    if (del) del.addEventListener('click', async () => {
        if (!(await ui.confirm({ title: `Delete "${a.name}"?`, message: 'Only an account with a zero balance can be deleted. Its history is kept.', ok: 'Delete', danger: true }))) return;
        try { await api.del('/api/finance/accounts/' + a.id); d.close(); ui.toast('Account deleted'); onDone(); } catch (err) { ui.fail(err); }
    });
}

function transferDrawer(accounts, onDone) {
    const opts = (ph, sel) => allAccountOptions(accounts, sel, ph);
    ui.formDrawer({
        title: 'Transfer Funds', subtitle: 'Move money between treasury accounts — contra entries recorded automatically.', submit: 'Transfer Funds',
        body: html`<div class="grid grid-cols-12 gap-4">
            <div class="col-span-12"><label class="label">From Account<span class="text-rose-500"> *</span></label><select class="input" name="fromId" required data-from>${opts('Select source account…')}</select></div>
            <div class="col-span-12 flex justify-center"><button type="button" class="btn-icon rounded-full" data-swap aria-label="Swap accounts" title="Swap">${icon('refresh')}</button></div>
            <div class="col-span-12"><label class="label">To Account<span class="text-rose-500"> *</span></label><select class="input" name="toId" required data-to>${opts('Select destination account…')}</select></div>
            ${ui.field({ label: 'Amount', name: 'amount', money: true, required: true, placeholder: '0.00' })}
            ${ui.field({ label: 'Note', name: 'note', placeholder: 'Optional reference or memo' })}</div>`,
        onMount(form) {
            form.querySelector('[data-swap]').addEventListener('click', () => { const f = form.querySelector('[data-from]'), to = form.querySelector('[data-to]'); [f.value, to.value] = [to.value, f.value]; });
        },
        async onSubmit(v, d) {
            if (v.fromId === v.toId) throw new Error('Choose two different accounts.');
            if (!v.amount) throw new Error('Enter the amount to transfer.');
            const from = accounts.find(a => a.id === v.fromId);
            if (from && v.amount > from.balance) throw new Error(`${from.name} holds only ${fmt.money(from.balance)}.`);
            await api.post('/api/finance/transfers', v);
            d.close(); ui.toast(`Transferred ${fmt.money(v.amount)}`); onDone();
        },
    });
}

// ═════════════════════════ Cheques ═════════════════════════
const CHQ = { PENDING: ['Pending', 'warn'], CLEARED: ['Cleared', 'good'], BOUNCED: ['Bounced', 'bad'], CANCELLED: ['Cancelled', 'gray'] };

HP.page('/cheques', {
    title: 'Cheques', perm: 'finance.manage',
    async render(el) {
        const charts = chartKeeper();
        const st = { key: 'date', dir: 'asc' };
        let data, accounts = [];
        const draw = () => {
            charts.clear();
            const k = data.kpis, dist = data.distribution;
            const distItems = [['CLEARED', '#10b981'], ['PENDING', '#f59e0b'], ['BOUNCED', '#ef4444'], ['CANCELLED', '#94a3b8']].filter(([s]) => dist[s].count);
            ui.mount(el.querySelector('[data-body]'), html`
              <div class="grid gap-4 md:grid-cols-3">
                ${kpi({ label: 'Total Pending', value: fmt.money(k.pending), iconName: 'clock', tone: 'warn', valueTone: 'warn', sub: `${k.pendingCount} cheque${k.pendingCount === 1 ? '' : 's'}` })}
                ${kpi({ label: 'Cleared This Month', value: fmt.money(k.clearedThisMonth), iconName: 'check', tone: 'good', valueTone: 'good' })}
                <div class="card card-pad flex items-center gap-4"><div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bad-soft text-bad">${icon('x', 'w-5 h-5')}</div><div><div class="text-sm text-muted">Bounced</div><div class="text-2xl font-bold"><span class="text-bad">${k.bouncedCount}</span> <span class="text-sm font-normal text-muted">(${fmt.money(k.bounced)})</span></div></div></div>
              </div>
              <div class="mt-6 grid gap-6 lg:grid-cols-2">
                ${chartCard('Upcoming Clearances', 'Pending PDC value grouped by month', data.upcoming.length ? html`<div class="h-64"><canvas data-upcoming></canvas></div>` : chartEmpty('No pending cheques to forecast'))}
                ${chartCard('Cheque Status Distribution', 'Cleared vs Pending vs Bounced', distItems.length ? html`<div class="flex flex-wrap items-center gap-6"><div class="h-52 w-52"><canvas data-dist></canvas></div>${legendRows(distItems.map(([s, c]) => ({ label: `${CHQ[s][0]} (${dist[s].count})`, value: dist[s].amount, color: c, pct: pctOf(dist[s].count, distItems.reduce((a, [x]) => a + dist[x].count, 0)) })))}</div>` : chartEmpty('No cheque activity to chart yet'))}
              </div>
              <div class="card mt-6">${sortTable(st, [
                { key: 'no', label: 'Cheque #', render: c => html`<span class="font-mono font-semibold">${c.chequeNo}</span>` },
                { key: 'type', label: 'Type', sort: c => c.type, render: c => (c.type === 'RECEIVED' ? html`<span class="badge badge-good">${icon('arrowDown', 'w-3 h-3')}Incoming</span>` : html`<span class="badge badge-accent">${icon('arrowUp', 'w-3 h-3')}Outgoing</span>`) },
                { key: 'party', label: 'Party', render: c => html`<span class="font-medium">${c.partyName}</span>` },
                { key: 'bank', label: 'Bank', render: c => html`<div>${c.bankName || '—'}</div>${c.accountName ? html`<div class="text-xs text-muted">${c.status === 'CLEARED' ? 'Cleared via' : 'Via'} ${c.accountName}</div>` : ''}` },
                { key: 'date', label: 'Date', sort: c => new Date(c.dueDate).getTime(), render: c => html`<div class="whitespace-nowrap ${c.overdue ? 'font-semibold text-bad' : ''}">${fmt.date(c.dueDate)}</div>${c.overdue ? html`<div class="text-[11px] text-bad">overdue</div>` : ''}` },
                { key: 'amount', label: 'Amount', num: true, sort: c => c.amount, render: c => html`<span class="font-semibold">${fmt.money(c.amount)}</span>` },
                { key: 'status', label: 'Status', sort: c => c.status, render: c => ui.badge(...CHQ[c.status]) },
                { key: 'actions', label: 'Actions', render: c => html`<div class="flex items-center gap-1">${c.status === 'PENDING' ? html`<button class="btn btn-outline btn-sm" data-clear="${c.id}">${icon('check')}Clear</button>` : ''}<button class="btn-icon !w-8 !h-8 border-0" data-more="${c.id}" aria-label="More actions for cheque ${c.chequeNo}">${icon('dots')}</button></div>` },
            ], data.rows, html`<div class="flex flex-col items-center py-12 text-center"><div class="mb-2 text-muted">${icon('banknote', 'w-7 h-7')}</div><div class="text-sm text-muted">No cheques recorded yet</div><button class="mt-1 text-sm font-medium text-accent hover:underline" data-new>Record your first cheque</button></div>`, c => (c.overdue ? 'bg-bad-soft/40' : ''))}</div>`);
            const up = el.querySelector('[data-upcoming]');
            if (up) charts.add(up, bars(data.upcoming.map(u => monthLabel(u.month)), data.upcoming.map(u => u.amount), '#f59e0b'));
            const ds = el.querySelector('[data-dist]');
            if (ds) charts.add(ds, { ...donut(distItems.map(([s]) => CHQ[s][0]), distItems.map(([s]) => dist[s].count), distItems.map(([, c]) => c)), options: { cutout: '65%', maintainAspectRatio: false, plugins: { legend: { display: false } } } });
        };
        const load = async () => { [data, accounts] = await Promise.all([api.get('/api/finance/cheques'), api.get('/api/finance/accounts')]); draw(); };
        ui.mount(el, html`${ui.pageHeader({ title: t('Cheques'), subtitle: 'GAAP-compliant post-dated cheque lifecycle — track pending, cleared, and bounced PDCs with bank and ledger integration.', actions: html`<button class="btn btn-primary" data-new>${icon('plus')}Record Cheque</button>` })}<div data-body>${ui.loading()}</div>`);
        onSort(el, st, draw);
        ui.on(el, 'click', '[data-new]', () => chequeDrawer(accounts, load));
        ui.on(el, 'click', '[data-clear]', (e, b) => clearCheque(data.rows.find(c => c.id === b.dataset.clear), accounts, load));
        const act = async (c, action, confirmText, okLabel) => {
            if (!(await ui.confirm({ title: `${okLabel} cheque #${c.chequeNo}?`, message: confirmText, ok: okLabel, danger: action !== 'clear' }))) return;
            try { if (action === 'delete') await api.del('/api/finance/cheques/' + c.id); else await api.post(`/api/finance/cheques/${c.id}/${action}`); ui.toast(`Cheque #${c.chequeNo} ${action === 'delete' ? 'deleted' : action === 'bounce' ? 'marked bounced' : 'cancelled'}`); load(); }
            catch (err) { ui.fail(err); }
        };
        ui.on(el, 'click', '[data-more]', (e, b) => {
            const c = data.rows.find(x => x.id === b.dataset.more);
            ui.menu(b, [
                c.status === 'PENDING' && { label: 'Mark Cleared', iconName: 'checkCircle', onClick: () => clearCheque(c, accounts, load) },
                c.status === 'PENDING' && { label: 'Mark Bounced', iconName: 'alert', onClick: () => act(c, 'bounce', 'No money moves; the party still owes / is owed the amount.', 'Bounce') },
                c.status === 'PENDING' && { label: 'Cancel', iconName: 'x', onClick: () => act(c, 'cancel', 'The cheque is marked cancelled. No money moves.', 'Cancel') },
                c.status !== 'CLEARED' && { label: 'Delete', iconName: 'trash', danger: true, onClick: () => act(c, 'delete', 'The cheque record is removed from the list.', 'Delete') },
                c.status === 'CLEARED' && { label: `Cleared on ${fmt.date(c.clearedAt)}`, iconName: 'info', onClick: () => { } },
            ]);
        });
        await load();
        return () => charts.clear();
    },
});

async function chequeDrawer(accounts, onDone) {
    let parties;
    try { parties = await api.get('/api/finance/parties'); } catch (err) { return ui.fail(err); }
    const partyOpts = type => html`<option value="">${type === 'RECEIVED' ? 'Select customer…' : 'Select vendor…'}</option>${parties.filter(p => p.type === (type === 'RECEIVED' ? 'CUSTOMER' : 'VENDOR')).map(p => html`<option value="${p.id}">${p.name} — ${fmt.money(p.balance)}</option>`)}`;
    ui.formDrawer({
        title: 'Record Cheque', subtitle: 'Post-dated cheque (PDC) — incoming from customer or outgoing to vendor.', submit: 'Save Cheque',
        body: html`<div class="grid grid-cols-12 gap-4">
            <div class="col-span-12"><div class="label">Type</div><div class="grid grid-cols-2 gap-2" data-types>
              <button type="button" data-t="RECEIVED" class="flex items-center justify-center gap-2 rounded-xl border border-accent bg-accent-soft py-2.5 text-sm font-medium text-accent">${icon('arrowDown')}Incoming</button>
              <button type="button" data-t="ISSUED" class="flex items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-sm font-medium hover:bg-surface-2">${icon('arrowUp')}Outgoing</button></div><input type="hidden" name="type" value="RECEIVED" data-type></div>
            <div class="col-span-12"><label class="label" data-party-label>Party (Customer)<span class="text-rose-500"> *</span></label><select class="input" name="partyId" required data-party>${partyOpts('RECEIVED')}</select></div>
            ${ui.field({ label: 'Bank', name: 'bankName', placeholder: 'Bank on the cheque, e.g. MCB', half: true })}
            ${ui.field({ label: 'Cheque Number', name: 'chequeNo', required: true, placeholder: 'e.g. 004521', half: true })}
            <div class="col-span-12"><label class="label">Clear into / from account</label><select class="input" name="accountId">${allAccountOptions(accounts, '', 'Choose when clearing')}</select></div>
            ${ui.field({ label: 'Issue Date', name: 'issueDate', type: 'date', value: fmt.ymd(), half: true })}
            ${ui.field({ label: 'Date', name: 'dueDate', type: 'date', required: true, half: true, help: 'The date the cheque can be cleared.' })}
            ${ui.field({ label: 'Amount', name: 'amount', money: true, required: true })}
            ${ui.field({ label: 'Notes', name: 'note', type: 'textarea', placeholder: 'Optional memo…' })}</div>`,
        onMount(form) {
            form.querySelector('[data-types]').addEventListener('click', e => {
                const b = e.target.closest('[data-t]'); if (!b) return;
                const type = b.dataset.t;
                form.querySelector('[data-type]').value = type;
                form.querySelectorAll('[data-t]').forEach(x => { const on = x === b; x.className = `flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium ${on ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-surface-2'}`; });
                form.querySelector('[data-party]').innerHTML = String(partyOpts(type));
                form.querySelector('[data-party-label]').innerHTML = String(html`Party (${type === 'RECEIVED' ? 'Customer' : 'Vendor'})<span class="text-rose-500"> *</span>`);
            });
        },
        async onSubmit(v, d) {
            if (!v.amount) throw new Error('Enter the cheque amount.');
            await api.post('/api/finance/cheques', v);
            d.close(); ui.toast('Cheque recorded as pending'); onDone();
        },
    });
}

function clearCheque(c, accounts, onDone) {
    const inbound = c.type === 'RECEIVED';
    const def = c.accountId || (accounts.find(a => a.type === 'BANK' && a.isDefault) || accounts.find(a => a.type === 'BANK') || {}).id || '';
    ui.formDrawer({
        title: `Clear cheque #${c.chequeNo}`, subtitle: `${inbound ? 'From' : 'To'} ${c.partyName} · ${fmt.money(c.amount)}`, submit: 'Mark Cleared',
        body: html`<div class="grid grid-cols-12 gap-4">
            <div class="col-span-12"><label class="label">${inbound ? 'Deposited into' : 'Paid from'}</label><select class="input" name="accountId">${allAccountOptions(accounts, def, 'Default bank account')}</select></div>
            ${ui.field({ label: 'Cleared on', name: 'date', type: 'date', value: fmt.ymd() })}
            <p class="col-span-12 rounded-lg bg-surface-2 px-3 py-2 text-sm">${inbound ? html`${fmt.money(c.amount)} is added to the account and <b>${c.partyName}</b>'s receivable goes down.` : html`${fmt.money(c.amount)} is taken from the account and what you owe <b>${c.partyName}</b> goes down.`}</p></div>`,
        async onSubmit(v, d) { await api.post(`/api/finance/cheques/${c.id}/clear`, v); d.close(); ui.toast(`Cheque #${c.chequeNo} cleared`); onDone(); },
    });
}

// ═════════════════════════ Expenses ═════════════════════════
HP.page('/expenses', {
    title: 'Expenses', perm: 'finance.manage',
    async render(el) {
        const charts = chartKeeper();
        let range = { preset: 'month' }, data, accounts = [], cats = [];
        const pill = (v, l) => html`<button type="button" data-preset="${v}" class="h-9 rounded-full border px-4 text-sm font-medium ${range.preset === v ? 'border-indigo-200 bg-accent-soft text-accent dark:border-indigo-900' : 'border-line bg-surface hover:bg-surface-2'}">${t(l)}</button>`;
        const draw = () => {
            charts.clear();
            const d = data;
            ui.mount(el.querySelector('[data-filter]'), html`<div class="flex flex-wrap gap-2">${pill('today', 'Today')}${pill('week', 'This Week')}${pill('month', 'This Month')}</div>
              <div class="flex items-center gap-2 text-sm text-muted">${icon('calendar')}<input type="date" class="input h-9 w-40" data-from value="${d.range.fromDay}" aria-label="From"><span>to</span><input type="date" class="input h-9 w-40" data-to value="${d.range.toDay}" aria-label="To"></div>`);
            ui.mount(el.querySelector('[data-body]'), html`
              <div class="grid gap-4 md:grid-cols-3">
                ${ui.statCard({ label: 'Total Expenses', value: fmt.money(d.total), iconName: 'wallet', valueTone: 'bad', sub: `${d.count} transaction${d.count === 1 ? '' : 's'}` })}
                ${ui.statCard({ label: 'Top Expense Category', value: d.topCategory ? d.topCategory.name : '—', iconName: 'receipt', sub: d.topCategory ? fmt.money(d.topCategory.amount) : 'No expenses in range' })}
                ${ui.statCard({ label: 'Average Daily Expense', value: fmt.money(d.avgDaily), iconName: 'activity', valueTone: 'warn', sub: 'Mean outflow per active day' })}
              </div>
              <div class="mt-6 grid gap-6 lg:grid-cols-2">
                ${chartCard('Expenses by Category', 'Where operational spend is concentrated', d.byCategory.length ? html`<div class="flex flex-wrap items-center gap-6"><div class="h-52 w-52"><canvas data-cat></canvas></div>${legendRows(d.byCategory.slice(0, 8).map((c, i) => ({ label: c.name, value: c.amount, color: ui.PALETTE[i % ui.PALETTE.length], pct: pctOf(c.amount, d.total) })))}</div>` : chartEmpty('No expense data for this period'))}
                ${chartCard('Expense Trend', 'Daily outflows for the selected period', d.count ? html`<div class="h-64"><canvas data-trend></canvas></div>` : chartEmpty('No expense data for this period'))}
              </div>
              <div class="card mt-6"><div class="px-5 pt-5"><div class="text-base font-semibold">Expense Transactions</div><div class="text-sm text-muted">All operational outflows for the selected period</div></div>
                <div class="mt-4">${d.rows.length ? html`<div class="overflow-x-auto thin-scroll"><table class="tbl"><thead><tr><th>Date</th><th>Voucher #</th><th>Category</th><th>Paid From</th><th>Note</th><th class="!text-right">Amount</th><th></th></tr></thead><tbody>
                  ${d.rows.map(e => html`<tr><td class="whitespace-nowrap">${fmt.date(e.date)}</td><td class="font-mono text-xs font-semibold">${e.reference}</td><td>${e.categoryName}</td><td>${e.accountName}</td><td><div>${e.note || '—'}</div>${e.payee ? html`<div class="text-xs text-muted">Paid to ${e.payee}</div>` : ''}</td><td class="num font-semibold text-bad">${fmt.money(e.amount)}</td>
                    <td><button class="btn-icon !w-8 !h-8 border-0 !text-rose-600" data-del="${e.id}" aria-label="Delete ${e.reference}" title="Delete">${icon('trash')}</button></td></tr>`)}</tbody></table></div>`
                  : html`<div class="px-6 pb-12 pt-6 text-center text-sm text-muted">No expenses recorded for this period</div>`}</div></div>`);
            const cc = el.querySelector('[data-cat]');
            if (cc) charts.add(cc, donut(d.byCategory.map(c => c.name), d.byCategory.map(c => c.amount), d.byCategory.map((c, i) => ui.PALETTE[i % ui.PALETTE.length])));
            const tc = el.querySelector('[data-trend]');
            if (tc) charts.add(tc, bars(d.trend.map(x => fmt.date(x.day + 'T12:00:00+05:00').slice(0, 6)), d.trend.map(x => x.amount), '#ef4444'));
        };
        const load = async () => {
            [data, accounts, cats] = await Promise.all([api.get('/api/finance/expenses', range.preset === 'custom' ? { preset: 'custom', from: range.from, to: range.to } : { preset: range.preset }), api.get('/api/finance/accounts'), api.get('/api/finance/expense-categories')]);
            draw();
        };
        ui.mount(el, html`${ui.pageHeader({ title: t('Expenses'), subtitle: 'GAAP-compliant operational expenditure intelligence', actions: html`<button class="btn btn-primary" data-new>${icon('plus')}Record Expense</button>` })}
          <div class="mb-6 flex flex-wrap items-center justify-between gap-3" data-filter></div><div data-body>${ui.loading()}</div>`);
        ui.on(el, 'click', '[data-preset]', (e, b) => { range = { preset: b.dataset.preset }; load().catch(ui.fail); });
        el.addEventListener('change', e => {
            if (!e.target.matches('[data-from],[data-to]')) return;
            const from = el.querySelector('[data-from]').value, to = el.querySelector('[data-to]').value;
            if (from && to) { range = { preset: 'custom', from, to }; load().catch(ui.fail); }
        });
        ui.on(el, 'click', '[data-new]', () => expenseDrawer(accounts, cats, load));
        ui.on(el, 'click', '[data-del]', async (e, b) => {
            const x = data.rows.find(r => r.id === b.dataset.del);
            if (!(await ui.confirm({ title: `Delete expense ${x.reference}?`, message: `${fmt.money(x.amount)} goes back into ${x.accountName}.`, ok: 'Delete', danger: true }))) return;
            try { await api.del('/api/finance/expenses/' + x.id); ui.toast('Expense deleted'); load(); } catch (err) { ui.fail(err); }
        });
        await load();
        return () => charts.clear();
    },
});

function expenseDrawer(accounts, cats, onDone) {
    const cash = accounts.find(a => a.type === 'CASH' && a.isDefault) || accounts.find(a => a.type === 'CASH') || {};
    const catOpts = sel => html`<option value="">Select category…</option>${cats.map(c => html`<option value="${c.id}" ${c.id === sel ? raw('selected') : ''}>${c.name}</option>`)}<option value="__new">+ Add New Category</option>`;
    ui.formDrawer({
        title: 'Record Expense', subtitle: 'OpEx entry with automatic double-entry ledger posting.', submit: 'Save Expense',
        body: html`<div class="grid grid-cols-12 gap-4">
            ${ui.field({ label: 'Voucher / Receipt #', name: 'reference', placeholder: 'Auto-generated if left blank', help: 'Leave empty for automatic EXP-XXXX numbering.', half: true })}
            ${ui.field({ label: 'Date', name: 'date', type: 'date', value: fmt.ymd(), required: true, half: true })}
            <div class="col-span-12"><label class="label">Category</label><select class="input" name="categoryId" data-cat>${catOpts('')}</select></div>
            <div class="col-span-12"><label class="label">Payment Method / Bank Account<span class="text-rose-500"> *</span></label><select class="input" name="accountId" required data-acct>${allAccountOptions(accounts, cash.id || '', 'Select paying account…')}</select><p class="help" data-avail></p></div>
            ${ui.field({ label: 'Amount', name: 'amount', money: true, required: true, placeholder: '0.00', half: true })}
            ${ui.field({ label: 'Payee', name: 'payee', placeholder: 'Who was paid (optional)', half: true })}
            ${ui.field({ label: 'Note', name: 'note', type: 'textarea', placeholder: 'Description or memo for this expense' })}</div>`,
        onMount(form) {
            const avail = () => {
                const a = accounts.find(x => x.id === form.querySelector('[data-acct]').value);
                const amt = fmt.toPaisa(form.querySelector('[name=amount]').value);
                const p = form.querySelector('[data-avail]');
                p.textContent = a ? `Available: ${fmt.money(a.balance)}${amt > a.balance ? ' — this expense is more than the account holds' : ''}` : '';
                p.classList.toggle('text-bad', !!a && amt > a.balance);
            };
            form.addEventListener('input', avail);
            form.addEventListener('change', async e => {
                avail();
                if (!e.target.matches('[data-cat]') || e.target.value !== '__new') return;
                e.target.value = '';
                const name = await askName();
                if (!name) return;
                try { const c = await api.post('/api/finance/expense-categories', { name }); cats.push(c); cats.sort((a, b) => a.name.localeCompare(b.name)); e.target.innerHTML = String(catOpts(c.id)); ui.toast(`Category "${c.name}" added`); }
                catch (err) { ui.fail(err); }
            });
            avail();
        },
        async onSubmit(v, d) {
            if (!v.amount) throw new Error('Enter the expense amount.');
            if (v.categoryId === '__new') v.categoryId = '';
            const r = await api.post('/api/finance/expenses', v);
            d.close(); ui.toast(`Expense ${r.reference} saved`); onDone();
        },
    });
}

function askName() {
    return new Promise(resolve => {
        let done = false;
        const m = ui.modal({
            title: 'Add New Category', width: 420,
            body: html`<form data-f><label class="label">Category name</label><input class="input" name="name" placeholder="e.g. Generator Fuel" autofocus></form>`,
            footer: html`<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" data-ok>Add</button>`,
            onClose: () => { if (!done) resolve(''); },
        });
        const ok = e => { if (e) e.preventDefault(); const v = m.el.querySelector('[name=name]').value.trim(); if (!v) return; done = true; m.close(); resolve(v); };
        m.el.querySelector('[data-ok]').addEventListener('click', ok);
        m.el.querySelector('[data-f]').addEventListener('submit', ok);
    });
}

// ═════════════════════════ Taxes & Duties ═════════════════════════
HP.page('/finance/taxes', {
    title: 'Taxes & Duties', perm: 'finance.manage',
    async render(el) {
        let taxes = [];
        const st = { key: 'name', dir: 'asc' };
        const draw = () => {
            el.querySelector('[data-rate]').value = window.Calc.effectiveRate(taxes);
            ui.mount(el.querySelector('[data-list]'), sortTable(st, [
                { key: 'name', label: 'Name', sort: x => x.name.toLowerCase(), render: x => html`<span class="font-medium">${x.name}</span>` },
                { key: 'rate', label: 'Rate', sort: x => x.rate, render: x => `${x.rate}%` },
                { key: 'combine', label: 'Combine', sort: x => (x.combine ? 1 : 0), render: x => (x.combine ? ui.badge('Compound', 'accent') : html`<span class="text-muted">No</span>`) },
                { key: 'active', label: 'Active', sort: x => (x.active ? 1 : 0), render: x => html`<button type="button" class="switch ${x.active ? 'on' : ''}" data-toggle="${x.id}" aria-pressed="${x.active ? 'true' : 'false'}" aria-label="Active: ${x.name}"></button>` },
                { key: 'actions', label: 'Actions', render: x => html`<div class="flex gap-1"><button class="btn-icon !w-8 !h-8 border-0" data-edit="${x.id}" aria-label="Edit ${x.name}">${icon('edit')}</button><button class="btn-icon !w-8 !h-8 border-0 !text-rose-600" data-del="${x.id}" aria-label="Delete ${x.name}">${icon('trash')}</button></div>` },
            ], taxes, html`<div class="py-12 text-center text-sm text-muted">No taxes configured yet.</div>`));
        };
        const load = async () => { taxes = await api.get('/api/finance/taxes'); draw(); };
        ui.mount(el, html`<div class="mx-auto max-w-4xl">${ui.pageHeader({ title: t('Taxes & Duties'), subtitle: 'Configure sales taxes, GST rates, and duty stacking for POS', iconName: 'percent' })}
            <div class="card card-pad"><div class="font-semibold">Default POS Tax Rate</div><div class="text-xs text-muted">Applied when no specific tax is selected at checkout</div>
              <label class="label mt-4" for="pos-rate">Tax % (default)</label><div class="flex max-w-sm items-center gap-2"><input id="pos-rate" class="input" readonly data-rate value="0"><span class="text-sm text-muted">%</span></div>
              <p class="help">Worked out from the active taxes below: simple taxes add up; a Combine tax is applied on top of them (compound).</p></div>
            <p class="my-5 text-sm text-muted">Define sales taxes for POS. Enable <b class="text-ink">Combine</b> to stack a tax on top of the others on the same bill.</p>
            <form class="card card-pad" data-add novalidate><div class="font-semibold mb-4">Add New Tax</div>
              <div class="grid grid-cols-12 gap-4">${ui.field({ label: 'Tax Name', name: 'name', placeholder: 'e.g. "GST @ 18%"' })}
                ${ui.field({ label: 'Rate (%)', name: 'rate', type: 'number', half: true, attr: { max: 100 } })}
                <div class="col-span-12 flex flex-col justify-end gap-2 sm:col-span-6">${ui.field({ label: 'Active', name: 'active', type: 'checkbox', value: true })}${ui.field({ label: 'Combine / Group Tax', name: 'combine', type: 'checkbox', value: true })}</div></div>
              <div data-err class="mt-4 hidden rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"></div>
              <button class="btn btn-primary mt-4">Add Tax</button></form>
            <div class="card mt-6" data-list>${ui.loading()}</div></div>`);
        onSort(el, st, draw);
        el.querySelector('[data-add]').addEventListener('submit', async e => {
            e.preventDefault();
            const f = e.target, err = f.querySelector('[data-err]');
            const v = ui.readForm(f);
            err.classList.add('hidden');
            if (!v.name) { err.textContent = 'Tax name is required.'; err.classList.remove('hidden'); return; }
            try { await api.post('/api/finance/taxes', v); f.reset(); ui.toast(`Tax "${v.name}" added`); load(); }
            catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); }
        });
        ui.on(el, 'click', '[data-toggle]', async (e, b) => {
            e.stopPropagation();
            const x = taxes.find(y => y.id === b.dataset.toggle);
            try { await api.put('/api/finance/taxes/' + x.id, { active: !x.active }); load(); } catch (err) { ui.fail(err); load(); }
        });
        ui.on(el, 'click', '[data-edit]', (e, b) => {
            const x = taxes.find(y => y.id === b.dataset.edit);
            ui.formDrawer({
                title: 'Edit Tax', subtitle: x.name,
                body: html`<div class="grid grid-cols-12 gap-4">${ui.field({ label: 'Tax Name', name: 'name', value: x.name, required: true })}${ui.field({ label: 'Rate (%)', name: 'rate', type: 'number', value: x.rate, attr: { max: 100 } })}
                  ${ui.field({ label: 'Active', name: 'active', type: 'checkbox', value: x.active })}${ui.field({ label: 'Combine / Group Tax', name: 'combine', type: 'checkbox', value: x.combine, help: 'applied on top of the other taxes' })}</div>`,
                async onSubmit(v, d) { await api.put('/api/finance/taxes/' + x.id, v); d.close(); ui.toast('Tax saved'); load(); },
            });
        });
        ui.on(el, 'click', '[data-del]', async (e, b) => {
            const x = taxes.find(y => y.id === b.dataset.del);
            if (!(await ui.confirm({ title: `Delete "${x.name}"?`, message: 'It is no longer offered at the POS. Past bills keep the tax they charged.', ok: 'Delete', danger: true }))) return;
            try { await api.del('/api/finance/taxes/' + x.id); ui.toast('Tax deleted'); load(); } catch (err) { ui.fail(err); }
        });
        await load();
    },
});
