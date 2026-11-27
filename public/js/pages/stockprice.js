// Stock & Price Management: one page to change the Retail, Wholesale and Cost price and the Stock of one product, of the
// ticked products or of every product, without opening products one by one; with the history of every change.
// Product Cost Price List: every product with what it costs the shop (search, filters, sorting, Excel).
// Both read /api/inventory/stock-price; changes go to /api/inventory/stock-price/save (prices on the product, stock as
// a stock movement, each change also in the history), so the POS, inventory and billing use them at once.
const { html, raw, icon, api, ui, fmt, t } = HP;

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
const FIELDS = { retailPrice: 'Retail Price', wholesalePrice: 'Wholesale Price', cost: 'Cost Price' };
const LOGFIELD = { RETAIL: 'Retail price', WHOLESALE: 'Wholesale price', COST: 'Cost price', STOCK: 'Stock' };
const REASONS = [['PURCHASE', 'Purchase stock'], ['OPENING', 'Opening stock'], ['RETURN', 'Customer return'], ['DAMAGED', 'Damaged stock'], ['ADJUSTMENT', 'Manual adjustment']];
const rupees = paisa => (paisa === null || paisa === undefined ? '' : (paisa / 100).toFixed(2).replace(/\.00$/, ''));
const hasStock = p => p.type !== 'SERVICE' && p.type !== 'SERIAL';
const matches = (p, q) => !q || [p.name, p.sku, p.barcode].some(v => String(v || '').toLowerCase().includes(q));
const byName = (a, b) => a.name.localeCompare(b.name);

// save in parts of 400 products (one server transaction each), all under one batch id in the history
async function saveChanges(changes, { reason = 'ADJUSTMENT', note = '' } = {}) {
    const batchId = uuid();
    let updated = 0;
    for (let i = 0; i < changes.length; i += 400) {
        const r = await api.post('/api/inventory/stock-price/save', { changes: changes.slice(i, i + 400), reason, note, batchId });
        updated += r.updated;
    }
    return updated;
}

// the filters shared by both pages: search, category, brand (and supplier on Stock & Price)
function filterBar(data, f, { supplier } = {}) {
    const opts = (list, cur) => list.map(([v, l]) => html`<option value="${v}" ${v === cur ? raw('selected') : ''}>${l}</option>`);
    const cats = [...new Map(data.products.filter(p => p.categoryId).map(p => [p.categoryId, p.category])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    const brands = [...new Map(data.products.filter(p => p.brandId).map(p => [p.brandId, p.brand])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    return html`<div class="relative w-full max-w-sm"><span class="absolute inset-y-0 start-3 flex items-center text-muted">${icon('search')}</span><input class="input ps-9" placeholder="${t('Search name, barcode or SKU')}" data-f="q" value="${f.q}" autocomplete="off" aria-label="Search products"></div>
      <select class="input w-44" data-f="cat" aria-label="Category"><option value="">${t('All categories')}</option>${opts(cats, f.cat)}</select>
      <select class="input w-44" data-f="brand" aria-label="Brand"><option value="">${t('All brands')}</option>${opts(brands, f.brand)}</select>
      ${supplier ? html`<select class="input w-48" data-f="vendor" aria-label="Supplier"><option value="">${t('All suppliers')}</option>${opts(data.vendors.map(v => [v.id, v.name]), f.vendor)}</select>` : ''}`;
}

// ═════════════════════════ Stock & Price Management ═════════════════════════
HP.page('/stock-price', {
    title: 'Stock & Price Management', perm: ['inventory.edit', 'inventory.add', 'purchases.manage', 'reports.view'],
    async render(el, params, query) {
        let data = { products: [], vendors: [], canEdit: false };
        const f = { q: '', cat: '', brand: '', vendor: '' };
        let vendorIds = null; // products bought from the chosen supplier
        let tab = query.tab === 'history' ? 'history' : 'products';
        const picked = new Set(); // ticked product ids
        const edits = {}; // id → { retailPrice, wholesalePrice, cost, stock } typed in the table, not saved yet
        let hist = { rows: [], q: '', field: '', from: '', to: '', productId: query.product || '' };

        const list = () => {
            const q = f.q.trim().toLowerCase();
            return data.products.filter(p => matches(p, q) && (!f.cat || p.categoryId === f.cat) && (!f.brand || p.brandId === f.brand) && (!vendorIds || vendorIds.has(p.id)));
        };
        const editCount = () => Object.keys(edits).length;

        function frame() {
            ui.mount(el, html`${ui.pageHeader({ title: t('Stock & Price Management'), subtitle: 'Search any product, tick one, several or all, and change Retail, Wholesale and Cost prices and Stock in one place.' })}
              <div class="mb-4">${ui.tabs('sp', [['products', t('Products')], ['history', t('Stock & Price History')]], tab)}</div>
              <div data-body></div>`);
            draw();
        }
        function draw() { return tab === 'history' ? drawHistory() : drawProducts(); }

        // ── products ──
        function drawProducts() {
            const rows = list();
            const sel = [...picked].filter(id => data.products.some(p => p.id === id)).length;
            const can = data.canEdit;
            const cell = (p, k) => {
                const e = edits[p.id] || {};
                const v = e[k] !== undefined ? e[k] : p[k];
                return html`<input class="input h-8 w-28 text-right tabular-nums ${e[k] !== undefined ? '!border-amber-500 ring-2 ring-amber-300/50' : ''}" type="number" min="0" step="0.01" value="${rupees(v)}" placeholder="${k === 'wholesalePrice' ? '—' : '0'}" data-cell="${k}" data-id="${p.id}" aria-label="${FIELDS[k]} of ${p.name}" ${can ? '' : raw('disabled')}>`;
            };
            const stockCell = p => {
                if (p.stock === null) return html`<span class="text-muted">${t('Service')}</span>`;
                const e = edits[p.id] || {};
                const v = e.stock !== undefined ? e.stock : p.stock;
                return html`<div class="flex items-center justify-end gap-1"><input class="input h-8 w-24 text-right tabular-nums ${e.stock !== undefined ? '!border-amber-500 ring-2 ring-amber-300/50' : ''} ${p.stock < 0 ? 'text-bad' : ''}" type="number" step="any" value="${v}" data-cell="stock" data-id="${p.id}" aria-label="Stock of ${p.name}" title="${p.type === 'SERIAL' ? t('Counted by serial / IMEI: change it on the product') : t('Type the exact stock count')}" ${can && hasStock(p) ? '' : raw('disabled')}><span class="w-9 text-start text-xs text-muted">${p.baseUnit}</span></div>`;
            };
            const box = el.querySelector('[data-body]');
            ui.mount(box, html`<div class="card card-pad mb-3 flex flex-wrap items-end gap-3">${filterBar(data, f, { supplier: true })}
                <div class="ms-auto flex gap-2"><button class="btn btn-outline" data-excel>${icon('download')}${t('Export to Excel')}</button></div></div>
              <div class="card mb-3 flex flex-wrap items-center gap-2 px-4 py-3">
                <span class="me-2 text-sm"><b>${sel}</b> ${t('selected')} · ${rows.length} ${t('in this list')} · ${data.products.length} ${t('products')}</span>
                ${can ? html`<button class="btn btn-sm btn-outline" data-bulk="retailPrice">${icon('tag')}${t('Update Retail Price')}</button>
                  <button class="btn btn-sm btn-outline" data-bulk="wholesalePrice">${icon('tag')}${t('Update Wholesale Price')}</button>
                  <button class="btn btn-sm btn-outline" data-bulk="cost">${icon('coins')}${t('Update Cost Price')}</button>
                  <button class="btn btn-sm btn-outline" data-bulk="stock">${icon('package')}${t('Update Stock')}</button>
                  <span class="ms-auto flex gap-2">${editCount() ? html`<button class="btn btn-sm btn-ghost" data-discard>${t('Discard')}</button>` : ''}<button class="btn btn-sm btn-primary" data-saveall ${editCount() ? '' : raw('disabled')}>${icon('check')}<span data-savelabel>${t('Save All Changes')}${editCount() ? ` (${editCount()})` : ''}</span></button></span>`
                : html`<span class="text-sm text-muted">${t('You can view prices and stock. Changing them needs the "Edit products" permission.')}</span>`}
              </div>
              ${rows.length ? html`<div class="card overflow-x-auto thin-scroll"><table class="tbl"><thead><tr>
                  <th class="w-10"><input type="checkbox" class="check" data-all aria-label="Select all in this list" ${rows.length && rows.every(p => picked.has(p.id)) ? raw('checked') : ''}></th>
                  <th>${t('Product')}</th><th>${t('Category')}</th><th class="!text-right">${t('Stock')}</th><th class="!text-right">${t('Retail')}</th><th class="!text-right">${t('Wholesale')}</th><th class="!text-right">${t('Cost')}</th><th></th></tr></thead>
                <tbody>${rows.map(p => html`<tr class="${picked.has(p.id) ? 'bg-accent-soft' : ''}">
                  <td><input type="checkbox" class="check" data-pick="${p.id}" aria-label="Select ${p.name}" ${picked.has(p.id) ? raw('checked') : ''}></td>
                  <td><div class="font-medium ${p.active ? '' : 'text-muted line-through'}">${p.name}</div><div class="font-mono text-xs text-muted">${[p.sku, p.barcode].filter(Boolean).join(' · ') || '—'}</div></td>
                  <td class="text-sm text-muted">${p.category || '—'}${p.brand ? html`<div class="text-xs">${p.brand}</div>` : ''}</td>
                  <td class="num">${stockCell(p)}</td><td class="num">${cell(p, 'retailPrice')}</td><td class="num">${cell(p, 'wholesalePrice')}</td><td class="num">${cell(p, 'cost')}</td>
                  <td class="whitespace-nowrap">${can && hasStock(p) ? html`<button class="btn-icon !h-8 !w-8 border-0" data-onestock="${p.id}" title="${t('Change stock (+ / − / exact) with a reason')}" aria-label="Change stock of ${p.name}">${icon('package')}</button>` : ''}<button class="btn-icon !h-8 !w-8 border-0" data-hist="${p.id}" title="${t('History')}" aria-label="History of ${p.name}">${icon('clock')}</button></td></tr>`)}</tbody></table></div>`
                : ui.empty({ iconName: 'package', title: data.products.length ? 'No products match' : 'No products yet', text: data.products.length ? 'Try another search or filter.' : 'Add products under Inventory → Products.' })}`);
        }

        // the products a bulk change is for
        const scopeRows = scope => (scope === 'picked' ? data.products.filter(p => picked.has(p.id)) : scope === 'list' ? list() : data.products);
        const scopeField = (scope0) => {
            const n = { picked: picked.size, list: list().length, all: data.products.length };
            return html`<div class="col-span-12"><div class="label">${t('Apply to')}</div><div class="grid gap-2 sm:grid-cols-3">${[['picked', 'Selected products'], ['list', 'All products in this list'], ['all', 'All products']].map(([v, l]) => html`<label class="flex cursor-pointer items-start gap-2 rounded-xl border border-line p-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft ${n[v] ? '' : 'opacity-50'}"><input type="radio" name="scope" value="${v}" class="mt-0.5" ${v === scope0 ? raw('checked') : ''} ${n[v] ? '' : raw('disabled')}><span><b>${t(l)}</b><span class="block text-xs text-muted">${n[v]} ${t('products')}</span></span></label>`)}</div></div>`;
        };
        const firstScope = () => (picked.size ? 'picked' : list().length < data.products.length ? 'list' : 'all');
        const radio = (form, name) => (form.querySelector(`[name="${name}"]:checked`) || {}).value;

        // Update Retail / Wholesale / Cost Price for the ticked, the listed or all products
        function priceDialog(field) {
            const METHODS = [['SET', 'Set to this amount (Rs)'], ['ADD', 'Increase by Rs'], ['SUB', 'Decrease by Rs'], ['ADDP', 'Increase by %'], ['SUBP', 'Decrease by %'], ...(field === 'cost' ? [] : [['MARGIN', 'Cost + margin %']]), ...(field === 'wholesalePrice' ? [['RETAILLESS', 'Retail price − %'], ['CLEAR', 'Remove the wholesale price']] : [])];
            const d = ui.modal({
                title: `${t(`Update ${FIELDS[field]}`)}`, subtitle: field === 'wholesalePrice' ? t('Each product keeps its own wholesale rate: % changes apply to each one\'s own price.') : t('Only this price is changed — nothing else on the products.'), width: 640,
                body: html`<form class="grid grid-cols-12 gap-4" data-form novalidate>${scopeField(firstScope())}
                    ${ui.field({ label: 'How', name: 'method', type: 'select', options: METHODS, half: true })}
                    ${ui.field({ label: 'Amount (Rs) or %', name: 'value', type: 'number', half: true, min: 0, attr: { step: 'any', autofocus: true } })}
                    ${ui.field({ label: 'Round the new price to', name: 'round', type: 'select', half: true, options: [['0', 'No rounding (paisa)'], ['100', 'Whole rupee'], ['500', 'Nearest Rs 5'], ['1000', 'Nearest Rs 10']] })}
                    ${ui.field({ label: 'Note (kept in the history)', name: 'note', half: true, placeholder: 'e.g. company rate list Dec 2026' })}
                    <div class="col-span-12 rounded-xl bg-surface-2 p-3 text-sm" data-preview></div></form>`,
                footer: html`<button class="btn btn-outline" data-close>${t('Cancel')}</button><button class="btn btn-primary" data-apply>${icon('check')}${t('Apply')}</button>`,
            });
            const form = d.el.querySelector('[data-form]');
            const plan = () => {
                const scope = radio(form, 'scope'), method = form.querySelector('[name=method]').value, v = Number(form.querySelector('[name=value]').value), round = Number(form.querySelector('[name=round]').value);
                const valueNeeded = method !== 'CLEAR';
                if (valueNeeded && !(v >= 0 && form.querySelector('[name=value]').value !== '')) return { error: t('Type the amount or %.') };
                const rnd = x => (round ? Math.round(x / round) * round : Math.round(x));
                const out = [], skipped = [];
                for (const p of scopeRows(scope)) {
                    const cur = p[field];
                    let next;
                    if (method === 'SET') next = fmt.toPaisa(v);
                    else if (method === 'CLEAR') next = null;
                    else if (method === 'MARGIN') next = p.cost ? rnd(p.cost * (1 + v / 100)) : undefined;
                    else if (method === 'RETAILLESS') next = p.retailPrice ? rnd(p.retailPrice * (1 - v / 100)) : undefined;
                    else if (cur === null || cur === undefined) next = undefined; // no wholesale price yet: a +/− has nothing to start from
                    else if (method === 'ADD') next = cur + fmt.toPaisa(v);
                    else if (method === 'SUB') next = cur - fmt.toPaisa(v);
                    else if (method === 'ADDP') next = rnd(cur * (1 + v / 100));
                    else if (method === 'SUBP') next = rnd(cur * (1 - v / 100));
                    if (method !== 'SET' && method !== 'CLEAR' && next !== undefined && round && !['MARGIN', 'RETAILLESS', 'ADDP', 'SUBP'].includes(method)) next = rnd(next);
                    if (next === undefined) { skipped.push(p); continue; }
                    if (next !== null && next < 0) next = 0;
                    if (next === cur || (next === null && (cur === null || cur === undefined))) continue;
                    out.push({ p, cur, next });
                }
                return { out, skipped, scope };
            };
            const preview = () => {
                const r = plan();
                d.el.querySelector('[data-preview]').innerHTML = String(r.error ? html`<span class="text-muted">${r.error}</span>` : html`<b>${r.out.length}</b> ${t('products will change')}${r.skipped.length ? html` · <span class="text-warn">${r.skipped.length} ${t('skipped (no price to start from)')}</span>` : ''}
                    ${r.out.slice(0, 5).map(x => html`<div class="mt-1 flex justify-between gap-3 text-xs"><span class="truncate">${x.p.name}</span><span class="whitespace-nowrap tabular-nums">${x.cur === null || x.cur === undefined ? '—' : fmt.money(x.cur)} → <b>${x.next === null ? '—' : fmt.money(x.next)}</b></span></div>`)}${r.out.length > 5 ? html`<div class="mt-1 text-xs text-muted">… ${r.out.length - 5} ${t('more')}</div>` : ''}`);
            };
            form.addEventListener('input', preview); form.addEventListener('change', preview); preview();
            d.el.querySelector('[data-apply]').addEventListener('click', async e => {
                const r = plan();
                if (r.error) return ui.toast(r.error, 'error');
                if (!r.out.length) return ui.toast(t('Nothing to change: the prices are already like this.'), 'info');
                if (!(await ui.confirm({ title: `${t(`Update ${FIELDS[field]}`)}: ${r.out.length} ${t('products')}?`, message: t('The new prices are used by the POS at once. Every change is kept in the history.'), ok: t('Update prices') }))) return;
                e.target.disabled = true;
                try {
                    const n = await saveChanges(r.out.map(x => ({ productId: x.p.id, [field]: x.next })), { note: form.querySelector('[name=note]').value });
                    d.close(); ui.toast(`${t(FIELDS[field])}: ${n} ${t('products updated')}`); await reload();
                } catch (err) { e.target.disabled = false; ui.fail(err); }
            });
        }

        // Update Stock: + / − / exact count, for one product, the ticked, the listed or all products, with the reason
        function stockDialog(only) {
            const one = only ? data.products.find(p => p.id === only) : null;
            const d = ui.modal({
                title: one ? `${t('Stock')}: ${one.name}` : t('Update Stock'), subtitle: one ? `${t('Now')}: ${fmt.qty(one.stock)} ${one.baseUnit}` : t('Increase, decrease or set the exact stock of many products at once.'), width: 640,
                body: html`<form class="grid grid-cols-12 gap-4" data-form novalidate>${one ? '' : scopeField(firstScope())}
                    <div class="col-span-12"><div class="label">${t('Change')}</div>${ui.seg('op', [['ADD', t('Increase (+)')], ['REMOVE', t('Decrease (−)')], ['SET', t('Set exact quantity')]], 'ADD')}</div>
                    ${ui.field({ label: one ? `Quantity (${one.baseUnit || 'base unit'})` : 'Quantity (in each product\'s base unit)', name: 'qty', type: 'number', half: true, min: 0, attr: { step: 'any', autofocus: true } })}
                    ${ui.field({ label: 'Reason', name: 'reason', type: 'select', half: true, options: REASONS })}
                    ${ui.field({ label: 'Note (kept in the history)', name: 'note', placeholder: 'e.g. 3 cartons torn in transit' })}
                    <div class="col-span-12 rounded-xl bg-surface-2 p-3 text-sm" data-preview></div></form>`,
                footer: html`<button class="btn btn-outline" data-close>${t('Cancel')}</button><button class="btn btn-primary" data-apply>${icon('check')}${t('Apply')}</button>`,
            });
            const form = d.el.querySelector('[data-form]');
            let op = 'ADD';
            const reasonFor = { ADD: 'PURCHASE', REMOVE: 'DAMAGED', SET: 'ADJUSTMENT' };
            form.querySelector('[name=reason]').value = reasonFor[op];
            const plan = () => {
                const raw2 = form.querySelector('[name=qty]').value, qty = Number(raw2);
                if (raw2 === '' || !(qty >= 0)) return { error: t('Type the quantity.') };
                const rows = one ? [one] : scopeRows(radio(form, 'scope'));
                const ok = rows.filter(hasStock), skipped = rows.length - ok.length;
                const out = ok.map(p => ({ p, after: op === 'ADD' ? Calc.q3(p.stock + qty) : op === 'REMOVE' ? Calc.q3(p.stock - qty) : Calc.q3(qty) })).filter(x => x.after !== x.p.stock);
                return { out, skipped, qty };
            };
            const preview = () => {
                const r = plan();
                d.el.querySelector('[data-preview]').innerHTML = String(r.error ? html`<span class="text-muted">${r.error}</span>` : html`<b>${r.out.length}</b> ${t('products will change')}${r.skipped ? html` · <span class="text-warn">${r.skipped} ${t('skipped (services and serial / IMEI products)')}</span>` : ''}
                    ${r.out.slice(0, 5).map(x => html`<div class="mt-1 flex justify-between gap-3 text-xs"><span class="truncate">${x.p.name}</span><span class="whitespace-nowrap tabular-nums">${fmt.qty(x.p.stock)} → <b class="${x.after < 0 ? 'text-bad' : ''}">${fmt.qty(x.after)}</b> ${x.p.baseUnit}</span></div>`)}${r.out.length > 5 ? html`<div class="mt-1 text-xs text-muted">… ${r.out.length - 5} ${t('more')}</div>` : ''}`);
            };
            form.addEventListener('click', e => { const b = e.target.closest('[data-seg=op] [data-v]'); if (!b) return; op = b.dataset.v; form.querySelectorAll('[data-seg=op] button').forEach(x => x.classList.toggle('on', x.dataset.v === op)); form.querySelector('[name=reason]').value = reasonFor[op]; preview(); });
            form.addEventListener('input', preview); form.addEventListener('change', preview); preview();
            d.el.querySelector('[data-apply]').addEventListener('click', async e => {
                const r = plan();
                if (r.error) return ui.toast(r.error, 'error');
                if (!r.out.length) return ui.toast(t('Nothing to change.'), 'info');
                if (!one && !(await ui.confirm({ title: `${t('Update Stock')}: ${r.out.length} ${t('products')}?`, message: t('Stock changes at once in inventory and on the POS. Every change is kept in the history.'), ok: t('Update stock') }))) return;
                e.target.disabled = true;
                try {
                    const n = await saveChanges(r.out.map(x => ({ productId: x.p.id, stock: { op, qty: r.qty } })), { reason: form.querySelector('[name=reason]').value, note: form.querySelector('[name=note]').value });
                    d.close(); ui.toast(`${t('Stock')}: ${n} ${t('products updated')}`); await reload();
                } catch (err) { e.target.disabled = false; ui.fail(err); }
            });
        }

        // Save All Changes typed in the table (prices and exact stock counts)
        function saveAll() {
            const ids = Object.keys(edits);
            if (!ids.length) return;
            const stockN = ids.filter(id => edits[id].stock !== undefined).length;
            const d = ui.modal({
                title: `${t('Save All Changes')}: ${ids.length} ${t('products')}`, subtitle: t('Prices and stock typed in the table'), width: 520,
                body: html`<form class="grid grid-cols-12 gap-4" data-form novalidate>
                    <div class="col-span-12 max-h-52 overflow-y-auto thin-scroll rounded-xl bg-surface-2 p-3 text-xs">${ids.map(id => { const p = data.products.find(x => x.id === id); const e = edits[id]; return html`<div class="py-0.5"><b>${p.name}</b>: ${Object.entries(e).map(([k, v]) => (k === 'stock' ? `${t('stock')} ${fmt.qty(p.stock)} → ${fmt.qty(v)}` : `${t(FIELDS[k]).toLowerCase()} ${p[k] === null ? '—' : fmt.money(p[k])} → ${v === null ? '—' : fmt.money(v)}`)).join(' · ')}</div>`; })}</div>
                    ${stockN ? ui.field({ label: `Reason for the ${stockN} stock change(s)`, name: 'reason', type: 'select', half: true, options: REASONS, value: 'ADJUSTMENT' }) : ''}
                    ${ui.field({ label: 'Note (kept in the history)', name: 'note', half: !!stockN, placeholder: 'optional' })}</form>`,
                footer: html`<button class="btn btn-outline" data-close>${t('Cancel')}</button><button class="btn btn-primary" data-apply>${icon('check')}${t('Save All Changes')}</button>`,
            });
            d.el.querySelector('[data-apply]').addEventListener('click', async e => {
                const form = d.el.querySelector('[data-form]');
                e.target.disabled = true;
                try {
                    const changes = ids.map(id => { const x = edits[id]; const c = { productId: id }; for (const k of Object.keys(FIELDS)) if (x[k] !== undefined) c[k] = x[k]; if (x.stock !== undefined) c.stock = { op: 'SET', qty: x.stock }; return c; });
                    const n = await saveChanges(changes, { reason: form.querySelector('[name=reason]') ? form.querySelector('[name=reason]').value : 'ADJUSTMENT', note: form.querySelector('[name=note]').value });
                    for (const id of ids) delete edits[id];
                    d.close(); ui.toast(`${n} ${t('products updated')}`); await reload();
                } catch (err) { e.target.disabled = false; ui.fail(err); }
            });
        }

        // ── history ──
        async function loadHistory() {
            hist.rows = await api.get('/api/inventory/stock-price/history', { productId: hist.productId, field: hist.field, q: hist.q, from: hist.from, to: hist.to });
            drawHistoryList();
        }
        function drawHistory() {
            const box = el.querySelector('[data-body]');
            const prod = hist.productId && data.products.find(p => p.id === hist.productId);
            ui.mount(box, html`<div class="card card-pad mb-3 flex flex-wrap items-end gap-3">
                ${prod ? html`<span class="badge badge-accent">${prod.name}<button class="ms-1" data-hclear aria-label="Show every product">${icon('x', 'w-3 h-3')}</button></span>` : html`<div class="relative w-full max-w-xs"><span class="absolute inset-y-0 start-3 flex items-center text-muted">${icon('search')}</span><input class="input ps-9" placeholder="${t('Product name')}" data-h="q" value="${hist.q}"></div>`}
                <select class="input w-44" data-h="field" aria-label="What changed"><option value="">${t('Prices and stock')}</option>${Object.entries(LOGFIELD).map(([k, l]) => html`<option value="${k}" ${hist.field === k ? raw('selected') : ''}>${t(l)}</option>`)}</select>
                <div class="flex items-center gap-2"><input type="date" class="input h-10" data-h="from" value="${hist.from}" aria-label="From date"><span>–</span><input type="date" class="input h-10" data-h="to" value="${hist.to}" aria-label="To date"></div>
                <button class="btn btn-outline ms-auto" data-hcsv>${icon('download')}${t('Export to Excel')}</button></div>
              <div data-hlist>${ui.loading()}</div>`);
            loadHistory().catch(ui.fail);
        }
        const showVal = (r, which) => (r.field === 'STOCK' ? fmt.qty(r[which === 'old' ? 'oldQty' : 'newQty'] ?? 0) : (r[which === 'old' ? 'oldPrice' : 'newPrice'] === null ? '—' : fmt.money(r[which === 'old' ? 'oldPrice' : 'newPrice'])));
        const diff = r => {
            const a = r.field === 'STOCK' ? r.oldQty : r.oldPrice, b = r.field === 'STOCK' ? r.newQty : r.newPrice;
            if (a === null || b === null || a === undefined || b === undefined) return '';
            const d = r.field === 'STOCK' ? Calc.q3(b - a) : b - a;
            return html`<span class="${d < 0 ? 'text-bad' : 'text-good'}">${d > 0 ? '+' : ''}${r.field === 'STOCK' ? fmt.qty(d) : fmt.money(d)}</span>`;
        };
        function drawHistoryList() {
            ui.mount(el.querySelector('[data-hlist]'), ui.table({
                rows: hist.rows, empty: { iconName: 'clock', title: 'No changes yet', text: 'Price and stock changes made here, on a product or by a stock adjustment are listed with who made them.' },
                columns: [
                    { label: 'Date & time', render: r => html`<span class="whitespace-nowrap text-muted">${fmt.dateTime(r.date)}</span>` },
                    { label: 'Product', render: r => html`<span class="font-medium">${r.productName}</span>` },
                    { label: 'What', render: r => ui.badge(t(LOGFIELD[r.field] || r.field), r.field === 'STOCK' ? 'accent' : r.field === 'COST' ? 'warn' : 'gray') },
                    { label: 'Before', num: true, render: r => showVal(r, 'old') },
                    { label: 'After', num: true, render: r => html`<b>${showVal(r, 'new')}</b>` },
                    { label: 'Change', num: true, render: diff },
                    { label: 'Reason', render: r => html`${t(r.reasonLabel)}${r.note ? html`<div class="text-xs text-muted">${r.note}</div>` : ''}` },
                    { label: 'User', render: r => html`<span class="text-sm">${r.userName || '—'}</span>` },
                ],
            }));
        }

        // ── loading and events ──
        async function reload() {
            data = await api.get('/api/inventory/stock-price');
            for (const id of [...picked]) if (!data.products.some(p => p.id === id)) picked.delete(id);
            if (f.vendor) vendorIds = new Set(await api.get('/api/inventory/stock-price/supplier/' + f.vendor));
            draw();
        }
        let tm;
        ui.on(el, 'click', '[data-tabs=sp] [data-v]', (e, b) => {
            if (tab === b.dataset.v) return;
            tab = b.dataset.v;
            el.querySelectorAll('[data-tabs=sp] button').forEach(x => x.classList.toggle('on', x.dataset.v === tab));
            history.replaceState({}, '', `/stock-price${tab === 'history' ? '?tab=history' : ''}`);
            draw();
        });
        ui.on(el, 'input', '[data-f]', (e, i) => {
            const k = i.dataset.f;
            f[k] = i.value;
            clearTimeout(tm);
            tm = setTimeout(async () => {
                if (k === 'vendor') { try { vendorIds = f.vendor ? new Set(await api.get('/api/inventory/stock-price/supplier/' + f.vendor)) : null; } catch (err) { ui.fail(err); } }
                const focus = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.f : null;
                const pos = document.activeElement && document.activeElement.selectionStart;
                drawProducts();
                if (focus) { const again = el.querySelector(`[data-f="${focus}"]`); if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch { } } }
            }, k === 'q' ? 180 : 0);
        });
        ui.on(el, 'change', '[data-pick]', (e, c) => { c.checked ? picked.add(c.dataset.pick) : picked.delete(c.dataset.pick); drawProducts(); });
        ui.on(el, 'change', '[data-all]', (e, c) => { for (const p of list()) c.checked ? picked.add(p.id) : picked.delete(p.id); drawProducts(); });
        // a price or stock typed in the table waits for Save All Changes (the box turns amber)
        ui.on(el, 'input', '[data-cell]', (e, i) => {
            const p = data.products.find(x => x.id === i.dataset.id), k = i.dataset.cell;
            if (!p) return;
            const raw2 = String(i.value).trim();
            let v;
            if (k === 'stock') v = raw2 === '' ? p.stock : Calc.q3(Number(raw2));
            else if (k === 'wholesalePrice') v = raw2 === '' || Number(raw2) === 0 ? null : fmt.toPaisa(raw2);
            else v = raw2 === '' ? 0 : fmt.toPaisa(raw2);
            if (k !== 'stock' && v !== null && !(v >= 0)) return;
            if (k === 'stock' && !Number.isFinite(v)) return;
            const e2 = edits[p.id] || {};
            if (v === p[k]) delete e2[k]; else e2[k] = v;
            if (Object.keys(e2).length) edits[p.id] = e2; else delete edits[p.id];
            i.classList.toggle('!border-amber-500', e2[k] !== undefined); i.classList.toggle('ring-2', e2[k] !== undefined); i.classList.toggle('ring-amber-300/50', e2[k] !== undefined);
            const btn = el.querySelector('[data-saveall]');
            if (btn) { btn.disabled = !editCount(); btn.querySelector('[data-savelabel]').textContent = `${t('Save All Changes')}${editCount() ? ` (${editCount()})` : ''}`; }
        });
        // Enter in a price / stock box goes to the same box of the next product
        ui.on(el, 'keydown', '[data-cell]', (e, i) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const all = [...el.querySelectorAll(`[data-cell="${i.dataset.cell}"]`)].filter(x => x.offsetParent);
            const n = all[all.indexOf(i) + (e.shiftKey ? -1 : 1)];
            if (n) { n.focus(); n.select(); }
        });
        ui.on(el, 'click', '[data-bulk]', (e, b) => { const k = b.dataset.bulk; if (k === 'stock') stockDialog(); else priceDialog(k); });
        ui.on(el, 'click', '[data-onestock]', (e, b) => stockDialog(b.dataset.onestock));
        ui.on(el, 'click', '[data-saveall]', saveAll);
        ui.on(el, 'click', '[data-discard]', async () => { if (await ui.confirm({ title: t('Discard the changes typed in the table?'), ok: t('Discard'), danger: true })) { for (const k of Object.keys(edits)) delete edits[k]; drawProducts(); } });
        ui.on(el, 'click', '[data-hist]', (e, b) => { hist = { ...hist, productId: b.dataset.hist, q: '' }; tab = 'history'; frame(); });
        ui.on(el, 'click', '[data-hclear]', () => { hist.productId = ''; drawHistory(); });
        ui.on(el, 'input', '[data-h]', (e, i) => { hist[i.dataset.h] = i.value; clearTimeout(tm); tm = setTimeout(() => loadHistory().catch(ui.fail), 250); });
        ui.on(el, 'change', '[data-h]', (e, i) => { if (i.tagName === 'SELECT') { hist[i.dataset.h] = i.value; loadHistory().catch(ui.fail); } });
        ui.on(el, 'click', '[data-excel]', () => ui.csv(`stock-and-prices-${fmt.ymd(new Date())}.csv`, ['Product', 'SKU', 'Barcode', 'Category', 'Brand', 'Stock', 'Unit', 'Retail Price', 'Wholesale Price', 'Cost Price'],
            list().map(p => [p.name, p.sku, p.barcode, p.category, p.brand, p.stock === null ? '' : p.stock, p.baseUnit, p.retailPrice / 100, p.wholesalePrice === null ? '' : p.wholesalePrice / 100, p.cost / 100])));
        ui.on(el, 'click', '[data-hcsv]', () => ui.csv(`stock-price-history-${fmt.ymd(new Date())}.csv`, ['Date', 'Product', 'What', 'Before', 'After', 'Reason', 'Note', 'User'],
            hist.rows.map(r => [fmt.dateTime(r.date), r.productName, LOGFIELD[r.field] || r.field, r.field === 'STOCK' ? r.oldQty : r.oldPrice === null ? '' : r.oldPrice / 100, r.field === 'STOCK' ? r.newQty : r.newPrice === null ? '' : r.newPrice / 100, r.reasonLabel, r.note, r.userName])));

        data = await api.get('/api/inventory/stock-price');
        frame();
        if (tab === 'products') setTimeout(() => el.querySelector('[data-f=q]')?.focus(), 30);
        // leaving with unsaved typing: say so (the edits are only on this screen)
        return () => { if (editCount()) ui.toast(`${editCount()} ${t('unsaved Stock & Price change(s) were discarded')}`, 'error'); };
    },
});

// ═════════════════════════ Product Cost Price List ═════════════════════════
HP.page('/cost-prices', {
    title: 'Product Cost Price List', perm: ['inventory.edit', 'inventory.add', 'purchases.manage', 'reports.view'],
    async render(el) {
        const data = await api.get('/api/inventory/stock-price');
        const f = { q: '', cat: '', brand: '' };
        let sort = 'name';
        const SORTS = [['name', 'Name (A → Z)'], ['-name', 'Name (Z → A)'], ['cost', 'Cost (lowest first)'], ['-cost', 'Cost (highest first)']];
        const rows = () => {
            const q = f.q.trim().toLowerCase();
            const out = data.products.filter(p => matches(p, q) && (!f.cat || p.categoryId === f.cat) && (!f.brand || p.brandId === f.brand));
            const dir = sort.startsWith('-') ? -1 : 1, key = sort.replace('-', '');
            return out.sort((a, b) => (key === 'cost' ? (a.cost - b.cost) || byName(a, b) : byName(a, b)) * dir);
        };
        const th = (key, label, num) => html`<button type="button" class="inline-flex items-center gap-1 uppercase ${num ? 'w-full justify-end' : ''}" data-sort="${key}">${label}${icon(sort === key ? 'chevronUp' : sort === '-' + key ? 'chevronDown' : 'chevronDown', `w-3 h-3 ${sort.replace('-', '') === key ? 'text-ink' : 'text-faint'}`)}</button>`;
        const draw = () => {
            const list = rows();
            const box = el.querySelector('[data-list]');
            el.querySelector('[data-count]').textContent = `${list.length} ${t('of')} ${data.products.length} ${t('products')}`;
            ui.mount(box, ui.table({
                rows: list, empty: { iconName: 'coins', title: data.products.length ? 'No products match' : 'No products yet', text: data.products.length ? 'Try another search or filter.' : 'Add products under Inventory → Products.' },
                columns: [
                    { label: th('name', 'Product Name'), render: p => html`<span class="font-medium">${p.name}</span>` },
                    { label: 'SKU', render: p => html`<span class="font-mono text-xs">${p.sku || '—'}</span>` },
                    { label: 'Barcode', render: p => html`<span class="font-mono text-xs">${p.barcode || '—'}</span>` },
                    { label: 'Category', render: p => p.category || '—' },
                    { label: 'Brand', render: p => p.brand || '—' },
                    { label: th('cost', 'Cost Price', true), num: true, render: p => html`<b class="text-base">${fmt.money(p.cost)}</b>${p.baseUnit ? html`<div class="text-xs text-muted">${t('per')} ${p.baseUnit}</div>` : ''}` },
                ],
            }));
        };
        ui.mount(el, html`${ui.pageHeader({ title: t('Product Cost Price List'), subtitle: 'What every product costs your business — the latest saved cost price, without opening products one by one.' })}
          <div class="card card-pad mb-3 flex flex-wrap items-end gap-3" data-filters>${filterBar(data, f)}
            <select class="input w-52" data-sortsel aria-label="Sort">${SORTS.map(([v, l]) => html`<option value="${v}">${t(l)}</option>`)}</select>
            <div class="ms-auto flex items-center gap-3"><span class="text-sm text-muted" data-count></span><button class="btn btn-outline" data-excel>${icon('download')}${t('Export to Excel')}</button></div></div>
          <div data-list></div>`);
        let tm;
        ui.on(el, 'input', '[data-f]', (e, i) => { f[i.dataset.f] = i.value; clearTimeout(tm); tm = setTimeout(draw, i.dataset.f === 'q' ? 150 : 0); });
        ui.on(el, 'change', '[data-f]', (e, i) => { f[i.dataset.f] = i.value; draw(); });
        ui.on(el, 'change', '[data-sortsel]', (e, s) => { sort = s.value; draw(); });
        ui.on(el, 'click', '[data-sort]', (e, b) => { const k = b.dataset.sort; sort = sort === k ? '-' + k : k; el.querySelector('[data-sortsel]').value = sort; draw(); });
        ui.on(el, 'click', '[data-excel]', () => ui.csv(`product-cost-prices-${fmt.ymd(new Date())}.csv`, ['Product Name', 'SKU', 'Barcode', 'Category', 'Brand', 'Unit', 'Cost Price'], rows().map(p => [p.name, p.sku, p.barcode, p.category, p.brand, p.baseUnit, p.cost / 100])));
        draw();
        setTimeout(() => el.querySelector('[data-f=q]')?.focus(), 30);
    },
});
