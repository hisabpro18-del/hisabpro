// Sales ledger and Refund & Credit Note (reference/REFERENCE.md "Sales", "Sales Return").
const { html, raw, icon, api, ui, fmt, t } = HP;
const has = k => Perms.has(HP.session, k);
const STATUS = { COMPLETED: ['Completed', 'good'], DUE: ['Pending / Due', 'warn'], PARTIAL_REFUND: ['Partly refunded', 'gray'], REFUNDED: ['Refunded', 'bad'] };
const statusBadge = s => ui.badge(...(STATUS[s] || [s, 'gray']));

HP.page('/sales', {
    title: 'Sales', perm: 'sales.view',
    async render(el, p, query) {
        const f = { q: '', status: '', from: fmt.ymd(new Date()).slice(0, 8) + '01', to: fmt.ymd(new Date()) };
        let data = { sales: [], summary: {} }, sort = { key: 'date', dir: -1 };
        const draw = () => {
            const rows = [...data.sales].sort((a, b) => { const x = a[sort.key], y = b[sort.key]; return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; });
            const s = data.summary;
            ui.mount(el.querySelector('[data-stats]'), html`<div class="grid gap-4 sm:grid-cols-3">
                ${ui.statCard({ label: 'Total', value: s.count || 0, iconName: 'receipt', tone: 'gray' })}
                ${ui.statCard({ label: 'Total Revenue', value: fmt.money(s.revenue), iconName: 'trending', tone: 'good', valueTone: 'good' })}
                ${ui.statCard({ label: 'Due', value: fmt.money(s.due), iconName: 'banknote', tone: 'warn', valueTone: 'warn' })}</div>`);
            el.querySelector('[data-capnote]').textContent = s.listed && s.count > s.listed ? `${t('Showing the newest')} ${s.listed.toLocaleString('en-US')} ${t('of')} ${s.count.toLocaleString('en-US')} — ${t('choose fewer dates or search to see the others.')}` : '';
            const th = (k, l, num) => html`<button class="inline-flex items-center gap-1 uppercase ${num ? 'justify-end w-full' : ''}" data-sort="${k}">${l}${icon(sort.key === k ? (sort.dir > 0 ? 'chevronUp' : 'chevronDown') : 'chevronDown', `w-3 h-3 ${sort.key === k ? 'text-ink' : 'text-faint'}`)}</button>`;
            ui.mount(el.querySelector('[data-list]'), ui.table({
                rows, empty: { iconName: 'receipt', title: 'No sales in this period', text: 'Sales made on the POS appear here.' },
                columns: [
                    { label: th('number', 'Invoice'), render: s2 => html`<span class="font-semibold">${s2.number}</span>` },
                    { label: th('date', 'Date'), render: s2 => html`<span class="text-muted whitespace-nowrap">${fmt.dateTime(s2.date)}</span>` },
                    { label: th('customerName', 'Customer'), render: s2 => s2.customerName },
                    { label: th('status', 'Status'), render: s2 => statusBadge(s2.status) },
                    { label: th('total', 'Total', true), num: true, render: s2 => html`<b>${fmt.money(s2.total)}</b>${s2.returnedTotal ? html`<div class="text-xs text-rose-600">−${fmt.money(s2.returnedTotal)} returned</div>` : ''}` },
                    { label: th('due', 'Due', true), num: true, render: s2 => (s2.due ? html`<span class="text-warn font-semibold">${fmt.money(s2.due)}</span>` : '—') },
                    { label: 'Actions', render: s2 => html`<button class="btn-icon !h-8 !w-8 border-0" data-menu="${s2.id}" aria-label="Actions for ${s2.number}">${icon('dots')}</button>` },
                ],
            }));
        };
        const load = async () => { data = await api.get('/api/pos/sales', { ...f, limit: 5000 }); draw(); };
        ui.mount(el, html`${ui.pageHeader({ title: t('Sales'), subtitle: 'Enterprise sales ledger — invoices, payments, and returns in real time.' })}
          <div data-stats class="mb-4"></div>
          <div class="card card-pad mb-4 flex flex-wrap items-end gap-3">
            <div class="relative w-full max-w-sm"><span class="absolute inset-y-0 start-3 flex items-center text-muted">${icon('search')}</span><input class="input ps-9" placeholder="Search by Invoice ID or Customer Name" data-f="q" aria-label="Search by Invoice ID or Customer Name"></div>
            <div><select class="input w-44" data-f="status" aria-label="Filter by status"><option value="">All Statuses</option><option value="COMPLETED">Completed</option><option value="DUE">Pending / Due</option><option value="REFUNDED">Refunded</option></select>
              <div class="mt-2 flex items-center gap-2"><input type="date" class="input h-9" data-f="from" value="${f.from}" aria-label="From date"><span>–</span><input type="date" class="input h-9" data-f="to" value="${f.to}" aria-label="To date"></div></div>
            <div class="ms-auto flex gap-2"><button class="btn btn-outline" data-csv>${icon('download')}${t('Export CSV')}</button>${has('sales.create') ? html`<a href="/pos" data-link class="btn btn-primary">${icon('plus')}${t('New Sale')}</a>` : ''}</div>
          </div><p class="mb-2 text-xs text-muted empty:hidden" data-capnote></p><div data-list>${ui.loading()}</div>`);
        let tm;
        ui.on(el, 'input', '[data-f]', (e, i) => { f[i.dataset.f] = i.value; clearTimeout(tm); tm = setTimeout(load, 250); });
        ui.on(el, 'click', '[data-sort]', (e, b) => { const k = b.dataset.sort; sort = { key: k, dir: sort.key === k ? -sort.dir : -1 }; draw(); });
        ui.on(el, 'click', '[data-csv]', () => ui.csv(`sales-${f.from}-${f.to}.csv`, ['Invoice', 'Date', 'Customer', 'Status', 'Total', 'Paid', 'Due', 'Returned', 'Cashier'], data.sales.map(s => [s.number, fmt.dateTime(s.date), s.customerName, (STATUS[s.status] || [s.status])[0], s.total / 100, s.paid / 100, s.due / 100, s.returnedTotal / 100, s.cashierName])));
        ui.on(el, 'click', '[data-menu]', (e, b) => {
            const id = b.dataset.menu;
            ui.menu(b, [
                { label: 'View Details', iconName: 'eye', onClick: () => api.get('/api/pos/sales/' + id).then(s => HP.receipt.preview(s)).catch(ui.fail) },
                { label: 'Print Invoice', iconName: 'printer', onClick: () => api.get('/api/pos/sales/' + id).then(s => HP.receipt.printSale(s)).catch(ui.fail) },
                { label: 'Download PDF', iconName: 'download', onClick: () => api.get('/api/pos/sales/' + id).then(s => { ui.toast('Choose "Save as PDF" as the printer.', 'info'); HP.receipt.printSale(s); }).catch(ui.fail) },
                has('sales.delete') && { label: 'Sales Return', iconName: 'rotate', onClick: () => HP.router.navigate('/sales-return?invoice=' + encodeURIComponent((data.sales.find(s => s.id === id) || {}).number || '')) },
            ]);
        });
        await load();
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
        const lookup = async code => {
            try { sale = await api.get('/api/pos/sales/lookup', { code }); drawSale(); }
            catch (e) { sale = null; drawSale(); ui.fail(e); }
        };
        ui.mount(el, html`${ui.pageHeader({ title: 'Refund & Credit Note', subtitle: 'Look up an invoice, process partial or full returns, and issue credit notes.' })}
          <div class="card card-pad mb-6"><div class="label">Invoice Lookup</div><form class="flex gap-2" data-look><div class="relative flex-1"><span class="absolute inset-y-0 start-3 flex items-center text-muted">${icon('search')}</span><input class="input h-11 ps-9" placeholder="Enter Invoice # or Sale ID…" data-code value="${query.invoice || ''}"></div><button class="btn btn-primary h-11">${icon('search')}${t('Search')}</button></form></div>
          <div data-proc></div><div data-recent>${ui.loading()}</div>`);
        el.querySelector('[data-look]').addEventListener('submit', e => { e.preventDefault(); const c = el.querySelector('[data-code]').value.trim(); if (c) lookup(c); });
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
