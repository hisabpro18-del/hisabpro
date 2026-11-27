// Sales ledger and Refund & Credit Note (reference/REFERENCE.md "Sales", "Sales Return").
const { html, raw, icon, api, ui, fmt, t } = HP;
const has = k => Perms.has(HP.session, k);
const STATUS = { COMPLETED: ['Completed', 'good'], DUE: ['Pending / Due', 'warn'], PARTIAL_REFUND: ['Partly refunded', 'gray'], REFUNDED: ['Refunded', 'bad'] };
const statusBadge = s => ui.badge(...(STATUS[s] || [s, 'gray']));

const METHOD = { CASH: 'Cash', CARD: 'Card', BANK: 'Bank', WALLET: 'Wallet' };
const openSale = id => api.get('/api/pos/sales/' + id);

// what was bought on a bill
function itemsDialog(s) {
    ui.modal({ title: `${s.number} · ${t('Purchased products')}`, subtitle: `${s.customerName} · ${fmt.dateTime(s.date)}`, width: 640,
        body: html`<div class="overflow-x-auto"><table class="tbl" data-nopage><thead><tr><th>#</th><th>Product</th><th class="!text-right">Qty</th><th class="!text-right">Rate</th><th class="!text-right">Amount</th><th class="!text-right">Returned</th></tr></thead>
          <tbody>${s.items.map((i, k) => html`<tr><td class="text-muted">${k + 1}</td><td>${i.name}${i.serial ? html`<div class="text-xs text-muted">S/N ${i.serial}</div>` : ''}${i.note ? html`<div class="text-xs text-muted">${i.note}</div>` : ''}</td><td class="num">${fmt.qty(i.qty)} ${i.unitName || ''}</td><td class="num">${fmt.money(i.price)}</td><td class="num font-semibold">${fmt.money(i.total)}</td><td class="num ${i.returnedQty ? 'text-bad' : 'text-muted'}">${i.returnedQty ? fmt.qty(i.returnedQty) : '—'}</td></tr>`)}</tbody></table></div>
          <div class="mt-4 ms-auto max-w-xs space-y-1 text-sm">${[['Subtotal', s.subtotal], ['Discount', -Number(s.discount)], ['Tax', s.tax]].filter(([, v]) => Number(v)).map(([l, v]) => html`<div class="flex justify-between"><span class="text-muted">${t(l)}</span><span class="tabular-nums">${fmt.money(v)}</span></div>`)}
            <div class="flex justify-between border-t border-line pt-1 font-bold"><span>${t('Total')}</span><span class="tabular-nums">${fmt.money(s.total)}</span></div></div>`,
        footer: html`<button class="btn btn-primary" data-close>${t('Close')}</button>` });
}
// how the bill was paid: at the counter (cash / card / bank, change given), what was left as udhaar, and refunds
function paymentsDialog(s) {
    const pays = s.payments || [];
    const rows = [
        ...pays.map(p => ({ date: s.date, what: `${t('Paid at the counter')} — ${t(METHOD[p.method] || p.method)}`, amount: Number(p.amount), tone: 'text-good' })),
        ...(Number(s.change) ? [{ date: s.date, what: t('Change given back'), amount: -Number(s.change), tone: 'text-muted' }] : []),
        ...(s.returns || []).map(r => ({ date: r.date, what: `${t('Return')} ${r.number}`, amount: -Number(r.total), tone: 'text-bad' })),
    ];
    ui.modal({ title: `${s.number} · ${t('Payment history')}`, subtitle: `${s.customerName} · ${fmt.dateTime(s.date)}`, width: 560,
        body: html`<div class="mb-4 grid grid-cols-3 gap-3">${[['Bill total', s.total, ''], ['Paid', s.paid, 'text-good'], ['Remaining / Due', s.due, Number(s.due) ? 'text-warn' : '']].map(([l, v, c]) => html`<div class="rounded-xl bg-surface-2 px-3 py-2"><div class="text-xs text-muted">${t(l)}</div><div class="font-bold tabular-nums ${c}">${fmt.money(v)}</div></div>`)}</div>
          ${rows.length ? html`<table class="tbl" data-nopage><thead><tr><th>Date</th><th>Entry</th><th class="!text-right">Amount</th></tr></thead><tbody>${rows.map(r => html`<tr><td class="whitespace-nowrap text-muted">${fmt.dateTime(r.date)}</td><td>${r.what}</td><td class="num font-semibold ${r.tone}">${fmt.money(r.amount)}</td></tr>`)}</tbody></table>` : html`<div class="py-6 text-center text-sm text-muted">${t('Nothing was paid at the counter.')}</div>`}
          ${Number(s.due) && s.customerId ? html`<p class="mt-3 text-xs text-muted">${t('The due amount went to the customer\'s khata. Later payments are on their khata page.')}${s.customerBalance !== undefined ? html` ${t('Khata balance now')}: <b>${fmt.money(s.customerBalance)}</b>` : ''}</p>` : ''}`,
        footer: html`${s.customerId ? html`<a class="btn btn-outline me-auto" href="/khata/c/${s.customerId}" data-link data-close>${icon('handCoins')}${t('Open khata')}</a>` : ''}<button class="btn btn-primary" data-close>${t('Close')}</button>` });
}

// Sales Invoice History & Search: any invoice, old or new, by number, customer name or mobile, and dates
HP.page('/sales', {
    title: 'Sales', perm: 'sales.view',
    async render(el, p, query) {
        const monthStart = fmt.ymd(new Date()).slice(0, 8) + '01';
        const f = { q: query.q || '', status: '', from: query.q ? '' : monthStart, to: query.q ? '' : fmt.ymd(new Date()) };
        let datesTouched = !!query.q;
        let data = { sales: [], summary: {} }, sort = { key: 'date', dir: -1 };
        const draw = () => {
            const rows = [...data.sales].sort((a, b) => { const x = a[sort.key], y = b[sort.key]; return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; });
            const s = data.summary;
            ui.mount(el.querySelector('[data-stats]'), html`<div class="grid gap-4 sm:grid-cols-3">
                ${ui.statCard({ label: 'Total', value: s.count || 0, iconName: 'receipt', tone: 'gray' })}
                ${ui.statCard({ label: 'Total Revenue', value: fmt.money(s.revenue), iconName: 'trending', tone: 'good', valueTone: 'good' })}
                ${ui.statCard({ label: 'Due', value: fmt.money(s.due), iconName: 'banknote', tone: 'warn', valueTone: 'warn' })}</div>`);
            el.querySelector('[data-capnote]').textContent = s.listed && s.count > s.listed ? `${t('Showing the newest')} ${s.listed.toLocaleString('en-US')} ${t('of')} ${s.count.toLocaleString('en-US')} — ${t('choose fewer dates or search to see the others.')}` : '';
            el.querySelector('[data-datenote]').textContent = !f.from && !f.to ? t('All dates: old and new invoices are searched.') : '';
            const th = (k, l, num) => html`<button class="inline-flex items-center gap-1 uppercase ${num ? 'justify-end w-full' : ''}" data-sort="${k}">${l}${icon(sort.key === k ? (sort.dir > 0 ? 'chevronUp' : 'chevronDown') : 'chevronDown', `w-3 h-3 ${sort.key === k ? 'text-ink' : 'text-faint'}`)}</button>`;
            ui.mount(el.querySelector('[data-list]'), ui.table({
                rows, empty: { iconName: 'receipt', title: f.q ? 'No invoice matches' : 'No sales in this period', text: f.q ? 'Try part of the name, the mobile number or the invoice number.' : 'Sales made on the POS appear here.' },
                rowAttr: s2 => `data-row="${s2.id}" class="cursor-pointer"`,
                columns: [
                    { label: th('number', 'Invoice'), render: s2 => html`<span class="font-semibold">${s2.number}</span>` },
                    { label: th('date', 'Date & time'), render: s2 => html`<span class="text-muted whitespace-nowrap">${fmt.dateTime(s2.date)}</span>` },
                    { label: th('customerName', 'Customer'), render: s2 => html`${s2.customerName}${s2.customerPhone ? html`<div class="text-xs text-muted">${s2.customerPhone}</div>` : ''}` },
                    { label: th('status', 'Status'), render: s2 => statusBadge(s2.status) },
                    { label: th('total', 'Total', true), num: true, render: s2 => html`<b>${fmt.money(s2.total)}</b>${s2.returnedTotal ? html`<div class="text-xs text-rose-600">−${fmt.money(s2.returnedTotal)} returned</div>` : ''}` },
                    { label: th('paid', 'Paid', true), num: true, render: s2 => fmt.money(s2.paid) },
                    { label: th('due', 'Due', true), num: true, render: s2 => (s2.due ? html`<span class="text-warn font-semibold">${fmt.money(s2.due)}</span>` : '—') },
                    { label: 'Actions', render: s2 => html`<button class="btn-icon !h-8 !w-8 border-0" data-menu="${s2.id}" aria-label="Actions for ${s2.number}">${icon('dots')}</button>` },
                ],
            }));
        };
        // the newest answer wins: a slow reply to an earlier keystroke must not replace the results of the last one
        let seq = 0;
        const load = async () => { const n = ++seq; const r = await api.get('/api/pos/sales', { ...f, limit: 5000 }); if (n === seq) { data = r; draw(); } };
        ui.mount(el, html`${ui.pageHeader({ title: t('Sales'), subtitle: 'Sales invoice history — find any invoice by number, customer name, mobile number or date.' })}
          <div data-stats class="mb-4"></div>
          <div class="card card-pad mb-4 flex flex-wrap items-end gap-3">
            <div class="w-full max-w-md"><div class="relative"><span class="absolute inset-y-0 start-3 flex items-center text-muted">${icon('search')}</span><input class="input h-11 ps-9" placeholder="Invoice no., customer name or mobile number" data-f="q" value="${f.q}" aria-label="Search invoices" autocomplete="off"></div>
              <p class="mt-1 text-xs text-muted empty:hidden" data-datenote></p></div>
            <div><select class="input w-44" data-f="status" aria-label="Filter by status"><option value="">All Statuses</option><option value="COMPLETED">Completed</option><option value="DUE">Pending / Due</option><option value="REFUNDED">Refunded</option></select>
              <div class="mt-2 flex items-center gap-2"><input type="date" class="input h-9" data-f="from" value="${f.from}" aria-label="From date"><span>–</span><input type="date" class="input h-9" data-f="to" value="${f.to}" aria-label="To date"><button class="btn btn-ghost btn-sm" data-alldates title="Search every date">${t('All dates')}</button></div></div>
            <div class="ms-auto flex gap-2"><button class="btn btn-outline" data-csv>${icon('download')}${t('Export CSV')}</button>${has('sales.create') ? html`<a href="/pos" data-link class="btn btn-primary">${icon('plus')}${t('New Sale')}</a>` : ''}</div>
          </div><p class="mb-2 text-xs text-muted empty:hidden" data-capnote></p><div data-list>${ui.loading()}</div>`);
        let tm;
        const setDates = (from, to) => { f.from = from; f.to = to; el.querySelector('[data-f=from]').value = from; el.querySelector('[data-f=to]').value = to; };
        ui.on(el, 'input', '[data-f]', (e, i) => {
            const k = i.dataset.f;
            f[k] = i.value;
            if (k === 'from' || k === 'to') datesTouched = true;
            // typing a search looks through every invoice (old ones too) unless dates were chosen on purpose
            if (k === 'q' && !datesTouched) setDates(i.value.trim() ? '' : monthStart, i.value.trim() ? '' : fmt.ymd(new Date()));
            clearTimeout(tm); tm = setTimeout(load, k === 'q' ? 200 : 50);
        });
        ui.on(el, 'click', '[data-alldates]', () => { datesTouched = true; setDates('', ''); load(); });
        ui.on(el, 'click', '[data-sort]', (e, b) => { const k = b.dataset.sort; sort = { key: k, dir: sort.key === k ? -sort.dir : -1 }; draw(); });
        ui.on(el, 'click', '[data-csv]', () => ui.csv(`sales-${f.from || 'all'}-${f.to || 'dates'}.csv`, ['Invoice', 'Date', 'Customer', 'Phone', 'Status', 'Total', 'Paid', 'Due', 'Returned', 'Cashier'], data.sales.map(s => [s.number, fmt.dateTime(s.date), s.customerName, s.customerPhone, (STATUS[s.status] || [s.status])[0], s.total / 100, s.paid / 100, s.due / 100, s.returnedTotal / 100, s.cashierName])));
        // a click on the row opens the invoice; the ⋯ button has every action
        ui.on(el, 'click', '[data-row]', (e, tr) => { if (e.target.closest('[data-menu], button, a')) return; openSale(tr.dataset.row).then(s => HP.receipt.preview(s)).catch(ui.fail); });
        ui.on(el, 'click', '[data-menu]', (e, b) => {
            const id = b.dataset.menu;
            const row = data.sales.find(s => s.id === id) || {};
            ui.menu(b, [
                { label: 'View Invoice', iconName: 'eye', onClick: () => openSale(id).then(s => HP.receipt.preview(s)).catch(ui.fail) },
                { label: 'Print / Reprint Invoice', iconName: 'printer', onClick: () => openSale(id).then(s => HP.receipt.printSale(s)).catch(ui.fail) },
                { label: 'Download PDF', iconName: 'download', onClick: () => openSale(id).then(s => { ui.toast('Choose "Save as PDF" as the printer.', 'info'); HP.receipt.printSale(s); }).catch(ui.fail) },
                HP.khata && { label: 'Send on WhatsApp', iconName: 'arrowRight', onClick: () => openSale(id).then(s => HP.receipt.sendWhatsApp(s, row.customerPhone)).catch(ui.fail) },
                { label: 'Share bill picture', iconName: 'image', onClick: () => openSale(id).then(s => HP.receipt.sharePicture(s)).catch(ui.fail) },
                { label: 'View Payment History', iconName: 'wallet', onClick: () => openSale(id).then(paymentsDialog).catch(ui.fail) },
                { label: 'View Purchased Products', iconName: 'package', onClick: () => openSale(id).then(itemsDialog).catch(ui.fail) },
                has('sales.delete') && { label: 'Sales Return', iconName: 'rotate', onClick: () => HP.router.navigate('/sales-return?invoice=' + encodeURIComponent(row.number || '')) },
            ]);
        });
        await load();
        setTimeout(() => el.querySelector('[data-f=q]')?.focus(), 30);
    },
});

HP.page('/sales-return', {
    title: 'Sales Return', perm: 'sales.delete',
    async render(el, p, query) {
        let sale = null;
        const loadRecent = async () => {
            const list = await api.get('/api/pos/returns', { limit: 15 });
            ui.mount(el.querySelector('[data-recent]'), html`<div class="card"><div class="flex items-center justify-between border-b border-line px-5 py-4"><div class="font-semibold">Recent Returns</div><div class="text-sm text-muted">${list.length} records</div></div>
              ${list.length ? html`<div class="overflow-x-auto"><table class="tbl"><thead><tr><th>Return ID</th><th>Original Invoice #</th><th>Date</th><th class="!text-right">Total Refunded</th><th>Actions</th></tr></thead><tbody>${list.map(r => html`<tr><td class="font-semibold">${r.number}</td><td>${r.saleNumber}</td><td class="text-muted">${fmt.dateTime(r.date)}</td><td class="num font-semibold">${fmt.money(r.total)}</td><td><button class="text-sm text-muted hover:text-ink" data-cn="${r.id}">${icon('printer', 'w-4 h-4 inline')} Credit note</button></td></tr>`)}</tbody></table></div>` : html`<div class="py-10 text-center text-sm text-muted">No returns yet.</div>`}</div>`);
            el._recent = list;
        };
        let returnKey = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
        const drawSale = () => {
            returnKey = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
            const box = el.querySelector('[data-proc]');
            if (!sale) { box.innerHTML = ''; return; }
            const lines = sale.items.map(i => ({ ...i, left: Calc.q3(i.qty - i.returnedQty) }));
            ui.mount(box, html`<div class="card mb-6"><div class="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div><div class="font-semibold">Process Return</div><div class="text-sm text-muted">Invoice ${sale.number}</div></div>
                <div class="flex flex-wrap gap-2 text-xs">${[['calendar', fmt.dateTime(sale.date)], ['user', sale.customerName], ['wallet', fmt.money(sale.total)]].map(([ic, v]) => html`<span class="badge badge-gray">${icon(ic, 'w-3.5 h-3.5')}${v}</span>`)}</div></div>
              <div class="overflow-x-auto"><table class="tbl"><thead><tr><th>Product</th><th class="!text-right">Sold Qty</th><th class="!text-right">Prev. Returned</th><th class="!text-right">Return Price</th><th>Return Qty</th><th>Restock?</th><th class="!text-right">Refund Amount</th></tr></thead>
                <tbody>${lines.map(i => html`<tr><td>${i.name}${i.serial ? html`<div class="text-xs text-muted">S/N ${i.serial}</div>` : ''}</td><td class="num">${fmt.qty(i.qty)} ${i.unitName}</td><td class="num">${fmt.qty(i.returnedQty)}</td><td class="num">${fmt.money(Number(i.total) / i.qty)}</td>
                  <td><input type="number" min="0" max="${i.left}" step="any" class="input h-9 w-24" value="0" data-rq="${i.id}" ${i.left <= 0 ? raw('disabled') : ''}></td>
                  <td><label class="flex items-center gap-2 text-sm"><input type="checkbox" class="check" data-rs="${i.id}" checked>Yes</label></td><td class="num font-medium" data-ra="${i.id}">${fmt.money(0)}</td></tr>`)}</tbody></table></div>
              <div class="flex flex-wrap items-end justify-between gap-4 border-t border-line px-5 py-4">
                <div class="flex flex-wrap gap-3"><div class="w-72"><label class="label">Return Reason (optional)</label><input class="input" data-reason placeholder="Defective, wrong item, customer request…"></div>
                  <div><label class="label">Refund</label><select class="input w-56" data-method>${sale.customerId ? html`<option value="CREDIT">To the customer's khata (credit note)</option>` : ''}<option value="CASH">Cash refund</option></select></div></div>
                <div class="flex items-end gap-4"><div class="text-right"><div class="eyebrow">TOTAL REFUND AMOUNT</div><div class="text-2xl font-bold" data-total>${fmt.money(0)}</div></div>
                  <button class="btn btn-outline" data-partial disabled>${icon('rotate')}Process Partial Return</button><button class="btn btn-danger" data-full>${icon('rotate')}Process Full Return</button></div></div></div>`);
            const recalc = () => {
                let total = 0, any = false;
                for (const i of lines) {
                    const inp = box.querySelector(`[data-rq="${i.id}"]`);
                    let q = Math.min(Math.max(Number(inp.value) || 0, 0), i.left);
                    const amt = q >= i.left - 1e-9 && q > 0 ? Number(i.total) * i.left / i.qty : Calc.round(Number(i.total) * q / i.qty);
                    box.querySelector(`[data-ra="${i.id}"]`).textContent = fmt.money(amt);
                    total += amt; if (q > 0) any = true;
                }
                box.querySelector('[data-total]').textContent = fmt.money(total);
                box.querySelector('[data-partial]').disabled = !any;
            };
            // on the card just drawn (box itself stays between look-ups, so a listener there would pile up)
            box.firstElementChild.addEventListener('input', recalc);
            const submit = async full => {
                const items = lines.filter(i => i.left > 0).map(i => ({ saleItemId: i.id, qty: full ? i.left : Number(box.querySelector(`[data-rq="${i.id}"]`).value) || 0, restock: box.querySelector(`[data-rs="${i.id}"]`).checked })).filter(i => i.qty > 0);
                if (!items.length) return ui.toast('Nothing left to return on this invoice.', 'error');
                if (!(await ui.confirm({ title: full ? 'Return everything left on this invoice?' : 'Process this return?', message: `Refund ${box.querySelector('[data-total]').textContent}${full ? ' (all remaining items)' : ''}.`, ok: 'Process return', danger: full }))) return;
                try {
                    const r = await api.post('/api/pos/returns', { clientId: returnKey, saleId: sale.id, items, reason: box.querySelector('[data-reason]').value, refundMethod: box.querySelector('[data-method]').value });
                    ui.toast(`Return ${r.number}: ${fmt.money(r.total)} refunded`);
                    sale = await api.get('/api/pos/sales/' + sale.id); drawSale(); loadRecent();
                } catch (e) { ui.fail(e); }
            };
            box.querySelector('[data-partial]').addEventListener('click', () => submit(false));
            box.querySelector('[data-full]').addEventListener('click', () => submit(true));
        };
        // search as you type: invoice no., customer name or mobile number, every date
        let found = [], seq = 0, tm;
        const drawFound = () => {
            const box = el.querySelector('[data-found]');
            const qv = el.querySelector('[data-code]').value.trim();
            if (!qv || sale) { box.innerHTML = ''; return; }
            ui.mount(box, found.length ? html`<div class="mt-3 overflow-x-auto rounded-xl border border-line"><table class="tbl" data-nopage><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Status</th><th class="!text-right">Total</th><th></th></tr></thead>
                <tbody>${found.map(x => html`<tr class="cursor-pointer" data-pickret="${x.id}"><td class="font-semibold">${x.number}</td><td class="whitespace-nowrap text-muted">${fmt.dateTime(x.date)}</td><td>${x.customerName}${x.customerPhone ? html`<div class="text-xs text-muted">${x.customerPhone}</div>` : ''}</td><td>${statusBadge(x.status)}</td><td class="num font-semibold">${fmt.money(x.total)}</td><td class="text-right"><button class="btn btn-sm btn-outline" data-pickret="${x.id}">${icon('rotate')}${t('Return')}</button></td></tr>`)}</tbody></table></div>`
                : html`<p class="mt-3 text-sm text-muted">${t('No sale matches. Try part of the name, the mobile number or the invoice number.')}</p>`);
        };
        const search = async () => {
            const qv = el.querySelector('[data-code]').value.trim(), n = ++seq;
            if (qv.length < 2) { found = []; drawFound(); return; }
            try { const r = await api.get('/api/pos/sales', { q: qv, limit: 30 }); if (n === seq) { found = r.sales; drawFound(); } } catch (e) { ui.fail(e); }
        };
        const pickSale = async id => {
            try { sale = await api.get('/api/pos/sales/' + id); drawSale(); drawFound(); el.querySelector('[data-proc]').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { ui.fail(e); }
        };
        const lookup = async code => {
            try { sale = await api.get('/api/pos/sales/lookup', { code }); drawSale(); }
            catch (e) { sale = null; drawSale(); ui.fail(e); }
        };
        ui.mount(el, html`${ui.pageHeader({ title: 'Refund & Credit Note', subtitle: 'Look up an invoice, process partial or full returns, and issue credit notes.' })}
          <div class="card card-pad mb-6"><div class="label">${t('Find the sale')}</div><form class="flex gap-2" data-look><div class="relative flex-1"><span class="absolute inset-y-0 start-3 flex items-center text-muted">${icon('search')}</span><input class="input h-11 ps-9" placeholder="${t('Invoice no., customer name or mobile number')}" data-code value="${query.invoice || ''}" autocomplete="off"></div><button class="btn btn-primary h-11">${icon('search')}${t('Search')}</button></form><div data-found></div></div>
          <div data-proc></div><div data-recent>${ui.loading()}</div>`);
        el.querySelector('[data-look]').addEventListener('submit', async e => {
            e.preventDefault();
            const c = el.querySelector('[data-code]').value.trim();
            if (!c) return;
            clearTimeout(tm); await search();
            // an exact invoice number, or the only match, opens at once; several matches stay in the list to choose from
            const exact = found.find(x => x.number.toLowerCase() === c.toLowerCase());
            if (exact || found.length === 1) return pickSale((exact || found[0]).id);
            if (found.length > 1) return ui.toast(t('Several sales match: choose one from the list.'), 'info');
            lookup(c); // a sale id, or say plainly that nothing was found
        });
        el.querySelector('[data-code]').addEventListener('input', () => { if (sale) { sale = null; drawSale(); } clearTimeout(tm); tm = setTimeout(search, 250); });
        ui.on(el, 'click', '[data-pickret]', (e, b) => { e.stopPropagation(); pickSale(b.dataset.pickret); });
        ui.on(el, 'click', '[data-cn]', (e, b) => {
            const r = (el._recent || []).find(x => x.id === b.dataset.cn);
            HP.ui.print(html`<div class="receipt w80"><div style="text-align:center;font-weight:700">CREDIT NOTE</div><div style="text-align:center;font-weight:700">${HP.session.tenant.name}</div><hr>
              <div style="display:flex;justify-content:space-between"><span>Credit note</span><b>${r.number}</b></div><div style="display:flex;justify-content:space-between"><span>Invoice</span><span>${r.saleNumber}</span></div><div style="display:flex;justify-content:space-between"><span>Date</span><span>${fmt.dateTime(r.date)}</span></div><div style="display:flex;justify-content:space-between"><span>Customer</span><span>${r.customerName}</span></div><hr>
              ${r.items.map(i => html`<div>${i.name}</div><div style="display:flex;justify-content:space-between;padding-left:10px"><span>${fmt.qty(i.qty)}</span><span>${fmt.money(i.total, { noSym: true })}</span></div>`)}<hr>
              <div style="display:flex;justify-content:space-between;font-weight:700"><span>Total refunded</span><span>${fmt.money(r.total)}</span></div><div>${r.refundMethod === 'CASH' ? 'Refunded in cash' : 'Credited to the customer account'}</div>${r.reason ? html`<div>Reason: ${r.reason}</div>` : ''}</div>`);
        });
        await loadRecent();
        if (query.invoice) lookup(query.invoice);
    },
});
