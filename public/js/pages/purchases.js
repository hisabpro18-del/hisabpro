// Purchasing screens: Purchases (Create Purchase Order drawer with units, serials, live totals, payment) and
// Purchase Return (debit notes). Layout and labels follow reference/REFERENCE.md "Purchases" / "Purchase Return".
const { html, raw, icon, api, ui, fmt, t } = HP;

const STATUS = { PAID: ['Paid', 'good'], PARTIAL: ['Partial', 'warn'], DUE: ['Due', 'bad'], RETURNED: ['Returned', 'gray'] };
const statusBadge = s => ui.badge(...(STATUS[s] || [s, 'gray']));
const typeLabel = { CASH: 'Cash', BANK: 'Bank', WALLET: 'Wallet' };
const accountLabel = a => `${a.name} (${typeLabel[a.type] || a.type}) — ${fmt.money(a.balance)}`;
const searchIcon = () => html`<span class="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted">${icon('search')}</span>`;

// a plain table (no card around it) for use inside cards
function plainTable(columns, rows, emptyText) {
    if (!rows.length) return html`<div class="px-6 py-14 text-center text-sm text-muted">${emptyText}</div>`;
    return html`<div class="overflow-x-auto thin-scroll"><table class="tbl"><thead><tr>${columns.map(c => html`<th class="${c.num ? '!text-right' : ''}">${c.label}</th>`)}</tr></thead>
      <tbody>${rows.map(r => html`<tr>${columns.map(c => html`<td class="${c.num ? 'num whitespace-nowrap' : ''} ${c.cls || ''}">${c.render(r)}</td>`)}</tr>`)}</tbody></table></div>`;
}

// accounts for a payment method: CASH → cash accounts, BANK → bank and wallet accounts
const accountsFor = (accounts, method) => accounts.filter(a => a.active !== false && (method === 'CASH' ? a.type === 'CASH' : a.type !== 'CASH'));
const accountOptions = (accounts, method, selected = '') => html`<option value="">${method === 'CASH' ? 'Default cash account' : 'Default bank account'}</option>${accountsFor(accounts, method).map(a => html`<option value="${a.id}" ${a.id === selected ? raw('selected') : ''}>${accountLabel(a)}</option>`)}`;

// ───────── print a purchase order / debit note (A4) ─────────
function companyHead(title, number, date) {
    const c = (HP.session.settings && HP.session.settings.company) || {};
    return html`<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px">
        <div><div style="font-size:18px;font-weight:700">${c.name || HP.session.tenant.name}</div><div>${c.address || ''}</div><div>${[c.phone, c.email].filter(Boolean).join(' · ')}</div>${c.taxId ? html`<div>NTN: ${c.taxId}</div>` : ''}</div>
        <div style="text-align:right"><div style="font-size:16px;font-weight:700">${title}</div><div>${number}</div><div>${fmt.date(date)}</div></div></div>`;
}
const cell = 'border:1px solid #999;padding:4px 6px;text-align:left';
const cellR = 'border:1px solid #999;padding:4px 6px;text-align:right';
function printPurchase(p) {
    ui.print(html`<div class="receipt a4" style="padding:6mm">${companyHead('PURCHASE ORDER', p.number, p.date)}
      <div style="margin-bottom:10px"><b>Supplier:</b> ${p.vendorName}${p.vendor && p.vendor.phone ? ` · ${p.vendor.phone}` : ''}${p.vendor && p.vendor.address ? html`<br>${p.vendor.address}` : ''}</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th style="${cell}">#</th><th style="${cell}">Product</th><th style="${cellR}">Qty</th><th style="${cell}">Unit</th><th style="${cellR}">Unit Cost</th><th style="${cellR}">Amount</th></tr></thead>
      <tbody>${p.items.map((i, n) => html`<tr><td style="${cell}">${n + 1}</td><td style="${cell}">${i.name}${i.serials.length ? html`<div style="font-size:10px">S/N: ${i.serials.map(s => s.serial).join(', ')}</div>` : ''}</td><td style="${cellR}">${fmt.qty(i.qty)}</td><td style="${cell}">${i.unitName}</td><td style="${cellR}">${fmt.money(i.cost)}</td><td style="${cellR}">${fmt.money(Math.round(i.qty * i.cost))}</td></tr>`)}</tbody></table>
      <table style="margin-left:auto;margin-top:10px;font-size:12px">${[['Subtotal', p.subtotal], [`Discount${p.discountType === 'PERCENT' ? ` (${p.discountValue}%)` : ''}`, -p.discount], [`Tax (${p.taxRate}%)`, p.tax], ['Grand Total', p.total], ['Paid', p.paid], ['Due', p.due]].map(([l, v], i) => html`<tr><td style="padding:2px 12px;${i === 3 ? 'font-weight:700;border-top:1px solid #000' : ''}">${l}</td><td style="padding:2px 0;text-align:right;${i === 3 ? 'font-weight:700;border-top:1px solid #000' : ''}">${fmt.money(v)}</td></tr>`)}</table>
      ${p.returnedTotal ? html`<p style="margin-top:8px">Returned (debit notes): ${fmt.money(p.returnedTotal)}</p>` : ''}${p.note ? html`<p style="margin-top:8px">Note: ${p.note}</p>` : ''}
      <div style="display:flex;justify-content:space-between;margin-top:40px"><div style="border-top:1px solid #000;width:180px;text-align:center;padding-top:4px">Prepared by</div><div style="border-top:1px solid #000;width:180px;text-align:center;padding-top:4px">Received by</div></div></div>`);
}
function printDebitNote(r) {
    ui.print(html`<div class="receipt a4" style="padding:6mm">${companyHead('DEBIT NOTE', r.number, r.date)}
      <div style="margin-bottom:10px"><b>Supplier:</b> ${r.vendorName}<br><b>Against:</b> ${r.purchaseNumber}<br><b>Settlement:</b> ${r.settlement === 'CASH' ? 'Cash refund from vendor' : 'Credit — reduces payable'}</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th style="${cell}">Product</th><th style="${cellR}">Qty</th><th style="${cellR}">Unit Cost</th><th style="${cellR}">Amount</th></tr></thead>
      <tbody>${r.items.map(i => html`<tr><td style="${cell}">${i.name}</td><td style="${cellR}">${fmt.qty(i.qty)}</td><td style="${cellR}">${fmt.money(i.cost)}</td><td style="${cellR}">${fmt.money(i.total)}</td></tr>`)}</tbody></table>
      <p style="text-align:right;font-size:14px;font-weight:700;margin-top:10px">Total: ${fmt.money(r.total)}</p>${r.reason ? html`<p>Reason: ${r.reason}</p>` : ''}</div>`);
}

// ───────── Purchases ─────────
HP.page('/purchases', {
    title: 'Purchases', perm: 'purchases.manage',
    async render(el, params, query) {
        // the list is the newest CAP purchases; a search of a full list asks the server, so older ones are found too
        const CAP = 2000;
        let list = [], q = '', found = null;
        const draw = () => {
            const s = q.toLowerCase();
            const rows = found || (s ? list.filter(p => (p.number + ' ' + p.vendorName).toLowerCase().includes(s)) : list);
            el.querySelector('[data-count]').textContent = !q && list.length >= CAP ? t('Newest 2,000 — search to find older ones') : `${rows.length} record${rows.length === 1 ? '' : 's'}`;
            ui.mount(el.querySelector('[data-list]'), plainTable([
                { label: 'PO Number', render: p => html`<button class="font-semibold text-accent hover:underline" data-view="${p.id}">${p.number}</button>` },
                { label: 'Date', render: p => html`<span class="whitespace-nowrap">${fmt.date(p.date)}</span>` },
                { label: 'Supplier', render: p => html`<div class="font-medium">${p.vendorName}</div><div class="text-xs text-muted">${p.itemsCount} item${p.itemsCount === 1 ? '' : 's'}</div>` },
                { label: 'Total', num: true, render: p => html`<span class="font-semibold">${fmt.money(p.total)}</span>` },
                { label: 'Paid', num: true, render: p => html`<span class="text-good">${fmt.money(p.paid)}</span>` },
                { label: 'Due', num: true, render: p => html`<span class="${p.due > 0 ? 'text-bad font-medium' : 'text-muted'}">${fmt.money(p.due)}</span>` },
                { label: 'Status', render: p => statusBadge(p.status) },
                { label: 'Actions', render: p => html`<div class="flex items-center gap-1"><button class="btn-icon !w-8 !h-8 border-0" data-view="${p.id}" title="View" aria-label="View ${p.number}">${icon('eye')}</button>
                    ${p.due > 0 && p.status !== 'RETURNED' ? html`<button class="btn btn-outline btn-sm" data-pay="${p.id}">${icon('banknote')}Pay</button>` : ''}
                    <button class="btn-icon !w-8 !h-8 border-0" data-more="${p.id}" aria-label="More actions for ${p.number}">${icon('dots')}</button></div>` },
            ], rows, list.length ? 'No purchases match your search.' : 'No purchases yet — create your first purchase order.'));
        };
        const load = async () => { list = await api.get('/api/purchases'); found = null; if (q && list.length >= CAP) found = await api.get('/api/purchases', { q }); draw(); };
        ui.mount(el, html`${ui.pageHeader({ title: t('Purchases'), subtitle: 'Purchase orders, stock inwarding, and vendor payables', actions: html`<button class="btn btn-primary" data-new>${icon('plus')}Create Purchase Order</button>` })}
          <div class="card"><div class="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div class="text-base font-semibold">Recent Purchases</div>
            <div class="flex items-center gap-3"><div class="relative w-64 max-w-full">${searchIcon()}<input class="input h-9 ps-9" placeholder="Search PO number or supplier…" data-q></div><span class="whitespace-nowrap text-sm text-muted" data-count></span></div></div>
            <div data-list>${ui.loading()}</div></div>`);
        let tm;
        el.querySelector('[data-q]').addEventListener('input', e => {
            q = e.target.value; found = null;
            clearTimeout(tm);
            if (q.trim() && list.length >= CAP) tm = setTimeout(async () => { const want = q; const r = await api.get('/api/purchases', { q: want }).catch(ui.fail); if (r && want === q) { found = r; draw(); } }, 300);
            draw();
        });
        ui.on(el, 'click', '[data-new]', () => purchaseDrawer(load));
        ui.on(el, 'click', '[data-view]', (e, b) => viewPurchase(b.dataset.view, load));
        ui.on(el, 'click', '[data-pay]', (e, b) => payDrawer(list.find(p => p.id === b.dataset.pay), load));
        ui.on(el, 'click', '[data-more]', (e, b) => {
            const p = list.find(x => x.id === b.dataset.more);
            ui.menu(b, [
                { label: 'View details', iconName: 'eye', onClick: () => viewPurchase(p.id, load) },
                { label: 'Print', iconName: 'printer', onClick: async () => { try { printPurchase(await api.get('/api/purchases/' + p.id)); } catch (err) { ui.fail(err); } } },
                p.status !== 'RETURNED' && { label: 'Return items (debit note)', iconName: 'rotate', onClick: () => HP.router.navigate('/purchase-return?id=' + p.id) },
            ]);
        });
        await load();
        if (query.new || query.productId) purchaseDrawer(load, { productId: query.productId });
    },
});

async function purchaseDrawer(onDone, { productId } = {}) {
    let vendors, catalog, accounts;
    try { [vendors, catalog, accounts] = await Promise.all([api.get('/api/purchases/vendors'), api.get('/api/inventory/catalog'), api.get('/api/finance/accounts')]); }
    catch (err) { return ui.fail(err); }
    const products = catalog.filter(p => p.type !== 'SERVICE');
    let vendor = null;
    const lines = []; // { key, product, ac }
    let seq = 0, form = null, saveBtn = null;

    ui.formDrawer({
        title: 'Create Purchase Order', subtitle: 'Record stock inwarding, vendor ledger, and payment in one batch.', wide: true,
        body: html`<div class="grid grid-cols-12 gap-4">
            <div class="col-span-12 sm:col-span-6"><label class="label">${icon('calendar', 'w-3.5 h-3.5 inline -mt-0.5')} Date<span class="text-rose-500"> *</span></label><input type="date" class="input" name="date" value="${fmt.ymd()}" required></div>
            <div class="col-span-12 sm:col-span-6"><label class="label">Supplier<span class="text-rose-500"> *</span></label><div class="relative">${searchIcon()}<input class="input ps-9" placeholder="Search supplier…" data-vendor autocomplete="off" aria-label="Supplier"></div><p class="help" data-vendor-info>${vendors.length ? '' : 'No vendors yet — add one on the Vendors screen.'}</p></div>
          </div>
          <div class="card mt-5"><div class="flex items-center justify-between border-b border-line px-4 py-3"><div class="font-semibold">Line Items</div><button type="button" class="btn btn-outline btn-sm" data-add-row>${icon('plus')}Add Row</button></div>
            <div data-lines class="divide-y divide-line"></div></div>
          <div class="mt-5 grid gap-4 sm:grid-cols-2">
            <div class="card card-pad"><div class="mb-3 font-semibold">Order Summary</div>
              <div class="flex justify-between text-sm"><span>Subtotal</span><span class="font-medium tabular-nums" data-subtotal>${fmt.money(0)}</span></div>
              <label class="label mt-3">Discount</label><div class="flex gap-2"><input type="number" min="0" step="0.01" class="input" data-disc aria-label="Discount"><select class="input !w-24" data-disc-type aria-label="Discount type"><option value="AMOUNT">Value</option><option value="PERCENT">%</option></select></div>
              <label class="label mt-3">Tax %</label><input type="number" min="0" max="100" step="any" class="input" name="taxRate" aria-label="Tax %">
              <div class="mt-4 flex items-baseline justify-between border-t border-line pt-3"><span class="font-semibold">Grand Total</span><span class="text-lg font-bold tabular-nums" data-total>${fmt.money(0)}</span></div>
              <div class="mt-1 flex justify-between text-xs text-muted"><span>Discount <span data-disc-amt>${fmt.money(0)}</span></span><span>Tax <span data-tax-amt>${fmt.money(0)}</span></span></div></div>
            <div class="card card-pad"><div class="mb-3 font-semibold">Payment</div>
              <div class="grid grid-cols-2 gap-2"><div><label class="label">Amount Paid</label><input class="input" type="number" name="paid" data-money="1" step="0.01" min="0" inputmode="decimal" placeholder="0.00"></div>
                <div><label class="label">Payment Method</label><select class="input" name="paymentMethod" data-method><option value="CASH">Cash</option><option value="BANK">Bank</option></select></div></div>
              <label class="label mt-3">Account</label><select class="input" name="accountId" data-account>${accountOptions(accounts, 'CASH')}</select>
              <div class="mt-4 flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3"><span class="text-sm text-muted">Due</span><span class="text-lg font-bold tabular-nums" data-due>${fmt.money(0)}</span></div>
              <p class="help" data-pay-err></p></div>
          </div>
          <div class="mt-4 grid grid-cols-12 gap-4">${ui.field({ label: 'Note', name: 'note', placeholder: 'Supplier invoice no., delivery details… (optional)' })}</div>`,
        onMount(f, d) {
            form = f;
            saveBtn = d.el.querySelector('[data-submit]');
            const box = form.querySelector('[data-lines]');
            // supplier
            const vInput = form.querySelector('[data-vendor]');
            const vac = ui.autocomplete(vInput, {
                search: async q2 => vendors.filter(v => (v.name + ' ' + v.contactPerson + ' ' + v.phone).toLowerCase().includes(q2.toLowerCase())).slice(0, 15)
                    .map(v => ({ id: v.id, label: v.name, sub: [v.contactPerson, v.phone, `Payable ${fmt.money(v.balance)}`].filter(Boolean).join(' · '), v })),
                onPick: it => { vendor = it.v; vInput.value = it.v.name; form.querySelector('[data-vendor-info]').innerHTML = String(html`Current payable: <b class="${it.v.balance > 0 ? 'text-bad' : ''}">${fmt.money(it.v.balance)}</b>${it.v.paymentTerms ? ` · ${it.v.paymentTerms.replace(/_/g, ' ')}` : ''}`); recalc(); },
            });
            vInput.addEventListener('input', () => { if (vendor && vInput.value !== vendor.name) { vendor = null; form.querySelector('[data-vendor-info]').textContent = ''; recalc(); } });

            const unitsOf = p => {
                const base = { id: p.baseUnitId || '', name: p.baseUnit || 'Base unit', factor: 1 };
                return p.type === 'SERIAL' ? [base] : [base, ...(p.altUnits || []).map(u => ({ id: u.unitId, name: u.name, factor: Number(u.factor) || 1 }))];
            };
            const addLine = preset => {
                const key = ++seq;
                const row = document.createElement('div');
                row.className = 'p-4';
                row.dataset.line = key;
                row.innerHTML = String(html`<div class="flex items-start gap-2"><div class="relative flex-1">${searchIcon()}<input class="input ps-9" placeholder="Search product…" data-prod autocomplete="off" aria-label="Product"></div>
                    <button type="button" class="btn-icon" data-remove aria-label="Remove line">${icon('trash')}</button></div>
                  <div class="mt-3 grid grid-cols-12 items-end gap-2">
                    <div class="col-span-6 sm:col-span-3"><label class="label">Unit</label><select class="input" data-unit disabled><option value="">—</option></select></div>
                    <div class="col-span-6 sm:col-span-3"><label class="label">Qty</label><input type="number" class="input" min="0" step="any" data-qty></div>
                    <div class="col-span-6 sm:col-span-3"><label class="label">Unit Cost</label><input type="number" class="input" min="0" step="0.01" data-cost></div>
                    <div class="col-span-6 sm:col-span-3 text-right"><div class="label">Subtotal</div><div class="flex h-10 items-center justify-end font-semibold tabular-nums" data-sub>—</div></div>
                  </div>
                  <div class="mt-3 hidden" data-serial-box><label class="label">Serial / IMEI numbers (one per line)</label><textarea class="input font-mono" rows="3" data-serials placeholder="One per line"></textarea><p class="help" data-serial-help></p></div>
                  <p class="help" data-line-info></p>`);
                box.appendChild(row);
                const line = { key, product: null, row };
                lines.push(line);
                const input = row.querySelector('[data-prod]');
                const pick = p => {
                    line.product = p;
                    input.value = p.name;
                    const sel = row.querySelector('[data-unit]');
                    const us = unitsOf(p);
                    sel.innerHTML = String(html`${us.map(u => html`<option value="${u.id}" data-factor="${u.factor}">${u.name}</option>`)}`);
                    sel.disabled = us.length < 2;
                    row.querySelector('[data-cost]').value = fmt.rupees(p.cost);
                    if (!row.querySelector('[data-qty]').value) row.querySelector('[data-qty]').value = p.type === 'SERIAL' ? '' : 1;
                    row.querySelector('[data-serial-box]').classList.toggle('hidden', p.type !== 'SERIAL');
                    row.querySelector('[data-line-info]').textContent = `In stock: ${fmt.qty(p.stock)} ${p.baseUnit || ''} · current cost ${fmt.money(p.cost)} per ${p.baseUnit || 'unit'}`;
                    recalc();
                    (p.type === 'SERIAL' ? row.querySelector('[data-serials]') : row.querySelector('[data-qty]')).focus();
                };
                line.ac = ui.autocomplete(input, {
                    search: async q2 => products.filter(p => (p.name + ' ' + p.sku + ' ' + p.barcode + ' ' + p.formula).toLowerCase().includes(q2.toLowerCase())).slice(0, 20)
                        .map(p => ({ id: p.id, label: p.name, sub: `${p.sku || p.barcode || ''}${p.sku || p.barcode ? ' · ' : ''}stock ${fmt.qty(p.stock)} ${p.baseUnit || ''} · cost ${fmt.money(p.cost)}`, p })),
                    onPick: it => pick(it.p),
                    onEnter: code => { const p = code && products.find(x => x.barcode && x.barcode === code); if (p) { pick(p); return true; } return false; },
                });
                input.addEventListener('input', () => { if (line.product && input.value !== line.product.name) { line.product = null; row.querySelector('[data-line-info]').textContent = ''; recalc(); } });
                if (preset) pick(preset);
                return line;
            };
            const removeLine = key => {
                const i = lines.findIndex(l => l.key === key);
                if (i < 0) return;
                lines[i].ac.destroy(); lines[i].row.remove(); lines.splice(i, 1);
                if (!lines.length) addLine();
                recalc();
            };
            // when the unit changes, the cost follows it (cost per base ÷ units in a base unit)
            box.addEventListener('change', e => {
                if (!e.target.matches('[data-unit]')) return;
                const line = lines.find(l => String(l.key) === e.target.closest('[data-line]').dataset.line);
                const f = Number(e.target.selectedOptions[0].dataset.factor) || 1;
                if (line && line.product) line.row.querySelector('[data-cost]').value = fmt.rupees(Math.round(line.product.cost / f));
                recalc();
            });
            box.addEventListener('click', e => { const b = e.target.closest('[data-remove]'); if (b) removeLine(Number(b.closest('[data-line]').dataset.line)); });
            form.querySelector('[data-add-row]').addEventListener('click', () => addLine().row.querySelector('[data-prod]').focus());
            form.addEventListener('input', e => {
                // a serialized line's quantity follows the serials typed
                if (e.target.matches('[data-serials]')) e.target.closest('[data-line]').querySelector('[data-qty]').value = e.target.value.split(/\n+/).map(x => x.trim()).filter(Boolean).length || '';
                recalc();
            });
            form.addEventListener('change', e => {
                if (e.target.matches('[data-method]')) form.querySelector('[data-account]').innerHTML = String(accountOptions(accounts, e.target.value));
                recalc();
            });
            const pre = productId && products.find(p => p.id === productId);
            addLine(pre || null);
            // clean up the floating suggestion lists when the drawer closes
            const close = d.close;
            d.close = () => { vac.destroy(); lines.forEach(l => l.ac.destroy()); close(); };
            recalc();
        },
        async onSubmit(v, dd) {
            const s = state();
            if (s.problem) throw new Error(s.problem);
            const r = await api.post('/api/purchases', {
                vendorId: vendor.id, date: v.date, note: v.note, taxRate: s.taxRate, discountType: s.discountType, discountValue: s.discountValue,
                paid: v.paid, paymentMethod: v.paymentMethod, accountId: v.accountId,
                items: s.lines.map(l => ({ productId: l.product.id, unitId: l.unitId, qty: l.qty, cost: l.cost, serials: l.serials.join('\n') })),
            });
            dd.close();
            ui.toast(`Purchase ${r.number} saved — stock and vendor ledger updated`);
            onDone();
        },
    });
    // everything the totals and validation need, read from the form
    function state() {
        const taxRate = Math.min(Math.max(Number(form.querySelector('[name=taxRate]').value) || 0, 0), 100);
        const discountType = form.querySelector('[data-disc-type]').value;
        const rawDisc = form.querySelector('[data-disc]').value;
        const discountValue = discountType === 'PERCENT' ? Math.min(Math.max(Number(rawDisc) || 0, 0), 100) : Math.max(fmt.toPaisa(rawDisc), 0);
        const ls = lines.filter(l => l.product).map(l => {
            const sel = l.row.querySelector('[data-unit]');
            return {
                product: l.product, row: l.row, unitId: sel.value, factor: Number((sel.selectedOptions[0] || {}).dataset?.factor) || 1,
                qty: Number(l.row.querySelector('[data-qty]').value) || 0, cost: Math.max(fmt.toPaisa(l.row.querySelector('[data-cost]').value), 0),
                serials: l.row.querySelector('[data-serials]').value.split(/\n+/).map(x => x.trim()).filter(Boolean),
            };
        });
        const bill = window.Calc.bill(ls.map(l => ({ qty: l.qty, price: l.cost, taxRate })), { discountType, discountValue: discountType === 'AMOUNT' ? discountValue / 100 : discountValue, defaultRate: taxRate });
        const paid = fmt.toPaisa(form.querySelector('[name=paid]').value);
        let problem = '';
        if (!vendor) problem = 'Choose the supplier.';
        else if (!ls.length) problem = 'Add at least one product.';
        else {
            for (const l of ls) {
                if (l.qty <= 0) { problem = `Enter the quantity of "${l.product.name}".`; break; }
                if (l.product.type === 'SERIAL' && (!Number.isInteger(l.qty) || l.serials.length !== l.qty)) { problem = `"${l.product.name}": enter exactly ${l.qty} serial number(s), one per line.`; break; }
            }
        }
        if (!problem && paid > bill.total) problem = 'Amount paid is more than the grand total.';
        if (!problem && paid < 0) problem = 'Amount paid cannot be negative.';
        return { taxRate, discountType, discountValue, lines: ls, bill, paid, problem };
    }
    function recalc() {
        if (!form) return;
        const s = state();
        s.lines.forEach((l, i) => {
            l.row.querySelector('[data-sub]').textContent = l.qty > 0 ? fmt.money(s.bill.lines[i].gross) : '—';
            if (l.product.type === 'SERIAL') l.row.querySelector('[data-serial-help]').textContent = `${l.serials.length} of ${l.qty || 0} entered`;
        });
        lines.filter(l => !l.product).forEach(l => { l.row.querySelector('[data-sub]').textContent = '—'; });
        form.querySelector('[data-subtotal]').textContent = fmt.money(s.bill.subtotal);
        form.querySelector('[data-disc-amt]').textContent = fmt.money(s.bill.discount);
        form.querySelector('[data-tax-amt]').textContent = fmt.money(s.bill.tax);
        form.querySelector('[data-total]').textContent = fmt.money(s.bill.total);
        form.querySelector('[data-due]').textContent = fmt.money(Math.max(s.bill.total - s.paid, 0));
        form.querySelector('[data-pay-err]').textContent = s.paid > s.bill.total ? 'Amount paid is more than the grand total.' : '';
        form.querySelector('[data-pay-err]').classList.toggle('text-bad', s.paid > s.bill.total);
        saveBtn.disabled = !!s.problem;
        saveBtn.title = s.problem;
    }
}

async function viewPurchase(id, onChange) {
    let p;
    try { p = await api.get('/api/purchases/' + id); } catch (err) { return ui.fail(err); }
    const m = ui.modal({
        title: `Purchase ${p.number}`, subtitle: `${p.vendorName} · ${fmt.dateTime(p.date)}`, width: 780,
        headerExtra: statusBadge(p.status),
        body: html`<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">${[['Total', p.total, ''], ['Paid', p.paid, 'text-good'], ['Due', p.due, p.due > 0 ? 'text-bad' : ''], ['Returned', p.returnedTotal, '']].map(([l, v, c]) => html`<div class="rounded-xl border border-line px-3 py-2"><div class="text-xs text-muted">${l}</div><div class="font-semibold tabular-nums ${c}">${fmt.money(v)}</div></div>`)}</div>
          <div class="mt-4 overflow-x-auto rounded-xl border border-line"><table class="tbl"><thead><tr><th>Product</th><th class="!text-right">Qty</th><th>Unit</th><th class="!text-right">Unit Cost</th><th class="!text-right">Returned</th><th class="!text-right">Amount</th></tr></thead>
            <tbody>${p.items.map(i => html`<tr><td><div class="font-medium">${i.name}</div>${i.serials.length ? html`<div class="mt-1 flex flex-wrap gap-1">${i.serials.map(s => html`<span class="badge ${s.status === 'IN_STOCK' ? 'badge-good' : 'badge-gray'} font-mono">${s.serial}</span>`)}</div>` : ''}${i.factor !== 1 ? html`<div class="text-xs text-muted">= ${fmt.qty(i.baseQty)} base unit(s)</div>` : ''}</td>
              <td class="num">${fmt.qty(i.qty)}</td><td>${i.unitName || '—'}</td><td class="num">${fmt.money(i.cost)}</td><td class="num ${i.returnedQty ? 'text-warn' : 'text-muted'}">${fmt.qty(i.returnedQty)}</td><td class="num font-medium">${fmt.money(Math.round(i.qty * i.cost))}</td></tr>`)}</tbody></table></div>
          <div class="mt-4 ms-auto max-w-xs space-y-1 text-sm">${[['Subtotal', p.subtotal], [`Discount${p.discountType === 'PERCENT' ? ` (${p.discountValue}%)` : ''}`, -p.discount], [`Tax (${p.taxRate}%)`, p.tax]].map(([l, v]) => html`<div class="flex justify-between"><span class="text-muted">${l}</span><span class="tabular-nums">${fmt.money(v)}</span></div>`)}
            <div class="flex justify-between border-t border-line pt-1 font-semibold"><span>Grand Total</span><span class="tabular-nums">${fmt.money(p.total)}</span></div></div>
          ${p.returns.length ? html`<div class="mt-4"><div class="eyebrow mb-2">DEBIT NOTES</div>${p.returns.map(r => html`<div class="flex justify-between border-b border-line-soft py-1.5 text-sm"><span>${r.number} · ${fmt.date(r.date)} · ${r.settlement === 'CASH' ? 'Cash refund' : 'Credit'}</span><span class="tabular-nums">${fmt.money(r.total)}</span></div>`)}</div>` : ''}
          ${p.note ? html`<p class="mt-3 text-sm text-muted">Note: ${p.note}</p>` : ''}<p class="mt-2 text-xs text-muted">Recorded by ${p.userName || '—'}</p>`,
        footer: html`<button class="btn btn-outline" data-print>${icon('printer')}Print</button>${p.status !== 'RETURNED' ? html`<button class="btn btn-outline" data-ret>${icon('rotate')}Return items</button>` : ''}${p.due > 0 && p.status !== 'RETURNED' ? html`<button class="btn btn-primary" data-pay>${icon('banknote')}Pay due</button>` : ''}`,
    });
    m.el.querySelector('[data-print]').addEventListener('click', () => printPurchase(p));
    const r = m.el.querySelector('[data-ret]'); if (r) r.addEventListener('click', () => { m.close(); HP.router.navigate('/purchase-return?id=' + p.id); });
    const pay = m.el.querySelector('[data-pay]'); if (pay) pay.addEventListener('click', () => { m.close(); payDrawer(p, onChange); });
}

async function payDrawer(p, onDone) {
    let accounts;
    try { accounts = await api.get('/api/finance/accounts'); } catch (err) { return ui.fail(err); }
    ui.formDrawer({
        title: `Pay ${p.number}`, subtitle: `${p.vendorName} · due ${fmt.money(p.due)}`, submit: 'Save Payment',
        body: html`<div class="grid grid-cols-12 gap-4">
            ${ui.field({ label: 'Amount', name: 'amount', money: true, value: p.due, required: true, half: true })}
            ${ui.field({ label: 'Date', name: 'date', type: 'date', value: fmt.ymd(), half: true })}
            ${ui.field({ label: 'Payment Method', name: 'method', type: 'select', options: [['CASH', 'Cash'], ['BANK', 'Bank']], half: true, attr: { 'data-method': true } })}
            <div class="col-span-12 sm:col-span-6"><label class="label">Account</label><select class="input" name="accountId" data-account>${accountOptions(accounts, 'CASH')}</select></div>
            <p class="col-span-12 text-xs text-muted">The payment is posted to the vendor's ledger as Payment Out and taken from the chosen account.</p></div>`,
        onMount(form) { form.addEventListener('change', e => { if (e.target.matches('[data-method]')) form.querySelector('[data-account]').innerHTML = String(accountOptions(accounts, e.target.value)); }); },
        async onSubmit(v, d) {
            if (!v.amount) throw new Error('Enter the amount to pay.');
            if (v.amount > p.due) throw new Error(`Only ${fmt.money(p.due)} is due.`);
            await api.post(`/api/purchases/${p.id}/pay`, v);
            d.close(); ui.toast(`Paid ${fmt.money(v.amount)} to ${p.vendorName}`); onDone();
        },
    });
}

// ───────── Purchase Return ─────────
HP.page('/purchase-return', {
    title: 'Purchase Return', perm: 'purchases.manage',
    async render(el, params, query) {
        let list = [], returns = [], q = '', selected = query.id || null, detail = null, accounts = [], poShown = 100;
        const drawList = () => {
            const s = q.toLowerCase();
            const all = s ? list.filter(p => (p.number + ' ' + p.vendorName).toLowerCase().includes(s)) : list;
            const rows = all.slice(0, poShown);
            ui.mount(el.querySelector('[data-polist]'), rows.length ? html`${rows.map(p => html`<button type="button" data-pick="${p.id}" class="flex w-full items-center justify-between gap-3 px-5 py-3 text-left ${p.id === selected ? 'bg-accent-soft' : 'hover:bg-surface-2'}">
                <div class="min-w-0"><div class="font-semibold ${p.id === selected ? 'text-accent' : ''}">${p.number}</div><div class="truncate text-xs text-muted">${p.vendorName} · ${fmt.date(p.date)}</div></div>
                <div class="text-right"><div class="text-sm font-medium tabular-nums">${fmt.money(p.total)}</div>${statusBadge(p.status)}</div></button>`)}
                ${all.length > rows.length ? html`<button type="button" class="w-full px-5 py-3 text-center text-sm font-medium text-accent hover:bg-surface-2" data-po-more>${t('Show more')} (${all.length - rows.length})</button>` : ''}`
                : html`<div class="px-5 py-12 text-center text-sm text-muted">No purchases found.</div>`);
        };
        const drawDetail = () => {
            const box = el.querySelector('[data-detail]');
            if (!detail) return ui.mount(box, html`<div class="flex h-full min-h-[320px] flex-col items-center justify-center px-6 py-14 text-center">
                <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line text-muted">${icon('package', 'w-7 h-7')}</div>
                <div class="font-semibold">Select a purchase invoice</div><p class="mt-1 text-sm text-muted">Choose a PO from the left panel to process a debit note.</p></div>`);
            const p = detail;
            const open = p.items.filter(i => i.qty - i.returnedQty > 0.0005);
            ui.mount(box, html`<div class="border-b border-line px-5 py-4"><div class="flex items-start justify-between gap-3"><div><div class="text-base font-semibold">${p.number}</div><div class="text-sm text-muted">${p.vendorName} · ${fmt.date(p.date)}</div></div>${statusBadge(p.status)}</div>
                <div class="mt-3 grid grid-cols-3 gap-2 text-sm">${[['Total', p.total], ['Due', p.due], ['Returned', p.returnedTotal]].map(([l, v]) => html`<div class="rounded-lg bg-surface-2 px-3 py-2"><div class="text-xs text-muted">${l}</div><div class="font-semibold tabular-nums">${fmt.money(v)}</div></div>`)}</div></div>
              ${open.length ? html`<div class="overflow-x-auto thin-scroll"><table class="tbl"><thead><tr><th>Product</th><th class="!text-right">Bought</th><th class="!text-right">Returned</th><th class="!text-right">Return Qty</th><th class="!text-right">Amount</th></tr></thead><tbody>
                ${p.items.map(i => { const left = Math.round((i.qty - i.returnedQty) * 1000) / 1000; return html`<tr data-item="${i.id}">
                  <td><div class="font-medium">${i.name}</div><div class="text-xs text-muted">${fmt.money(i.cost)} / ${i.unitName || 'unit'} · line ${fmt.money(i.total)}</div>
                    ${i.type === 'SERIAL' ? html`<div class="mt-1 flex flex-wrap gap-1.5">${i.serials.map(s => html`<label class="badge ${s.status === 'IN_STOCK' ? 'badge-gray cursor-pointer' : 'badge-gray opacity-50 line-through'} font-mono"><input type="checkbox" class="check !h-3 !w-3" data-serial="${s.serial}" ${s.status !== 'IN_STOCK' ? raw('disabled') : ''}>${s.serial}</label>`)}</div>` : ''}</td>
                  <td class="num">${fmt.qty(i.qty)} <span class="text-xs text-muted">${i.unitName}</span></td><td class="num text-muted">${fmt.qty(i.returnedQty)}</td>
                  <td class="num">${left <= 0 ? html`<span class="text-xs text-muted">—</span>` : i.type === 'SERIAL' ? html`<span class="tabular-nums" data-sqty>0</span>` : html`<input type="number" min="0" max="${left}" step="any" class="input h-8 w-24 text-right" data-rqty placeholder="0" aria-label="Return quantity for ${i.name}"><div class="text-[11px] text-muted">max ${fmt.qty(left)}</div>`}</td>
                  <td class="num whitespace-nowrap font-medium" data-amt>—</td></tr>`; })}</tbody></table></div>
                <div class="grid grid-cols-12 gap-4 border-t border-line px-5 py-4">
                  <div class="col-span-12 sm:col-span-6"><label class="label">Settlement</label><select class="input" data-settle><option value="CREDIT">Credit — reduce payable</option><option value="CASH">Cash refund from vendor</option></select></div>
                  <div class="col-span-12 sm:col-span-6 hidden" data-acct-box><label class="label">Refund into account</label><select class="input" data-acct><option value="">Default cash account</option>${accounts.map(a => html`<option value="${a.id}">${accountLabel(a)}</option>`)}</select></div>
                  <div class="col-span-12"><label class="label">Reason</label><input class="input" data-reason placeholder="Damaged, expired, wrong item…"></div>
                  <div class="col-span-12 flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3"><span class="text-sm text-muted">Debit note total</span><span class="text-xl font-bold tabular-nums" data-rtotal>${fmt.money(0)}</span></div>
                  <div class="col-span-12 flex justify-end"><button class="btn btn-primary" data-process disabled>${icon('fileCheck')}Process Debit Note</button></div></div>`
                : html`<div class="px-6 py-12 text-center text-sm text-muted">Everything on this purchase has already been returned.</div>`}`);
            calc();
        };
        // value of what is being returned: the line's share (the last return of a line takes what is left)
        const calc = () => {
            if (!detail) return;
            let total = 0, n = 0;
            for (const tr of el.querySelectorAll('[data-item]')) {
                const it = detail.items.find(i => i.id === tr.dataset.item);
                const left = Math.round((it.qty - it.returnedQty) * 1000) / 1000;
                let qty = 0;
                if (it.type === 'SERIAL') { qty = tr.querySelectorAll('[data-serial]:checked').length; const s = tr.querySelector('[data-sqty]'); if (s) s.textContent = qty; }
                else { const inp = tr.querySelector('[data-rqty]'); qty = inp ? Math.min(Math.max(Number(inp.value) || 0, 0), left) : 0; }
                const back = detail.returnsByItem[it.id] || 0;
                const value = qty <= 0 ? 0 : Math.abs(qty - left) < 0.0005 ? it.total - back : Math.round(it.total * qty / it.qty);
                tr.querySelector('[data-amt]').textContent = qty > 0 ? fmt.money(value) : '—';
                total += value; if (qty > 0) n++;
            }
            const t2 = el.querySelector('[data-rtotal]'); if (t2) t2.textContent = fmt.money(total);
            const b = el.querySelector('[data-process]'); if (b) b.disabled = !n;
        };
        const loadDetail = async () => {
            if (!selected) { detail = null; return drawDetail(); }
            ui.mount(el.querySelector('[data-detail]'), ui.loading());
            try {
                detail = await api.get('/api/purchases/' + selected);
                const rets = await api.get('/api/purchases/returns', { purchaseId: selected });
                detail.returnsByItem = {};
                for (const r of rets) for (const i of r.items) detail.returnsByItem[i.purchaseItemId] = (detail.returnsByItem[i.purchaseItemId] || 0) + i.total;
            } catch (err) { detail = null; ui.fail(err); }
            drawDetail();
        };
        const drawReturns = () => ui.mount(el.querySelector('[data-returns]'), plainTable([
            { label: 'Debit Note', render: r => html`<span class="font-semibold">${r.number}</span>` },
            { label: 'Date', render: r => fmt.date(r.date) },
            { label: 'PO', render: r => r.purchaseNumber },
            { label: 'Supplier', render: r => r.vendorName },
            { label: 'Settlement', render: r => (r.settlement === 'CASH' ? ui.badge('Cash refund', 'good') : ui.badge('Credit', 'accent')) },
            { label: 'Amount', num: true, render: r => html`<span class="font-medium">${fmt.money(r.total)}</span>` },
            { label: '', render: r => html`<button class="btn-icon !w-8 !h-8 border-0" data-print-ret="${r.id}" aria-label="Print ${r.number}">${icon('printer')}</button>` },
        ], returns, 'No debit notes yet.'));
        const loadAll = async () => { [list, returns, accounts] = await Promise.all([api.get('/api/purchases'), api.get('/api/purchases/returns', { limit: 15 }), api.get('/api/finance/accounts')]); drawList(); drawReturns(); };

        ui.mount(el, html`${ui.pageHeader({ title: t('Purchase Return'), subtitle: 'Debit note & supplier return engine — reverse purchases, adjust inventory, and update payables.' })}
          <div class="grid gap-6 lg:grid-cols-2">
            <div class="card overflow-hidden"><div class="px-5 pt-4"><div class="text-base font-semibold">Select Invoice</div><div class="text-sm text-muted">Recent purchase orders</div>
              <div class="relative my-3">${searchIcon()}<input class="input ps-9" placeholder="Search by PO number or supplier…" data-q></div></div>
              <div class="max-h-[560px] divide-y divide-line overflow-y-auto border-t border-line thin-scroll" data-polist>${ui.loading()}</div></div>
            <div class="card overflow-hidden" data-detail></div>
          </div>
          <div class="card mt-6"><div class="border-b border-line px-5 py-4"><div class="text-base font-semibold">Recent Debit Notes</div><div class="text-sm text-muted">Latest returns to suppliers</div></div><div data-returns>${ui.loading()}</div></div>`);
        el.querySelector('[data-q]').addEventListener('input', e => { q = e.target.value; poShown = 100; drawList(); });
        ui.on(el, 'click', '[data-po-more]', () => { poShown += 100; drawList(); });
        ui.on(el, 'click', '[data-pick]', (e, b) => { selected = b.dataset.pick; history.replaceState({}, '', '/purchase-return?id=' + selected); drawList(); loadDetail(); });
        el.addEventListener('input', e => { if (e.target.matches('[data-rqty]')) calc(); });
        el.addEventListener('change', e => {
            if (e.target.matches('[data-serial]')) calc();
            if (e.target.matches('[data-settle]')) el.querySelector('[data-acct-box]').classList.toggle('hidden', e.target.value !== 'CASH');
        });
        ui.on(el, 'click', '[data-print-ret]', (e, b) => printDebitNote(returns.find(r => r.id === b.dataset.printRet)));
        ui.on(el, 'click', '[data-process]', async (e, btn) => {
            const items = [];
            for (const tr of el.querySelectorAll('[data-item]')) {
                const it = detail.items.find(i => i.id === tr.dataset.item);
                if (it.type === 'SERIAL') { const s = [...tr.querySelectorAll('[data-serial]:checked')].map(x => x.dataset.serial); if (s.length) items.push({ purchaseItemId: it.id, serials: s }); }
                else { const v = Number((tr.querySelector('[data-rqty]') || {}).value) || 0; if (v > 0) items.push({ purchaseItemId: it.id, qty: v }); }
            }
            const settlement = el.querySelector('[data-settle]').value;
            if (!(await ui.confirm({ title: 'Process debit note?', message: `Stock goes down by the returned quantities and ${settlement === 'CASH' ? 'the refund is added to the chosen account' : `what you owe ${detail.vendorName} goes down`}.`, ok: 'Process' }))) return;
            btn.disabled = true;
            try {
                const r = await api.post(`/api/purchases/${detail.id}/returns`, { items, settlement, accountId: el.querySelector('[data-acct]').value, reason: el.querySelector('[data-reason]').value });
                ui.toast(`Debit note ${r.number} processed (${fmt.money(r.total)})`);
                await loadAll(); await loadDetail();
            } catch (err) { ui.fail(err); btn.disabled = false; }
        });
        await loadAll();
        await loadDetail();
    },
});
