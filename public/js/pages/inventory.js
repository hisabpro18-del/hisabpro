// Inventory screens: Products (drawer with General Info / Pricing & Units / Inventory & Variants / Advanced), Categories,
// Brands / Companies, Units, Colors, Sizes, Print Barcodes. Layout and fields follow reference/REFERENCE.md Part 2.
const { html, raw, icon, api, ui, fmt, t } = HP;
const has = k => Perms.has(HP.session, k);

const master = kind => api.get('/api/inventory/master/' + kind);
const ean13 = () => { const d = '20' + Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join(''); const s = d.split('').reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0); return d + ((10 - (s % 10)) % 10); };
const skuFrom = name => (String(name || 'ITEM').replace(/[^a-z0-9 ]/gi, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 4).toUpperCase() || 'IT') + Math.floor(100 + Math.random() * 900);
const UI_DEFAULTS = { variant: true, serial: true, wholesale: true, expiry: true, units: true };
const uiPrefs = () => { try { return { ...UI_DEFAULTS, ...JSON.parse(localStorage.getItem('hp.productUi') || '{}') }; } catch { return { ...UI_DEFAULTS }; } };
const TYPE_LABEL = { STANDARD: 'Standard', VARIANT: 'Variant', SERIAL: 'Serialized / IMEI', SERVICE: 'Service' };

// ───────── Products ─────────
HP.page('/products', {
    title: 'Products', perm: ['inventory.add', 'inventory.edit'],
    async render(el) {
        let q = '', list = [];
        const draw = () => {
            const rows = q ? list.filter(p => [p.name, p.sku, p.barcode, p.formula].some(v => String(v || '').toLowerCase().includes(q.toLowerCase()))) : list;
            ui.mount(el.querySelector('[data-list]'), ui.table({
                rows, empty: { iconName: 'package', title: 'No products yet', text: 'Add your first product, or import a CSV file.', action: has('inventory.add') ? html`<button class="btn btn-primary" data-new>${icon('plus')}New product</button>` : '' },
                columns: [
                    { label: 'Name', render: p => html`<div class="flex items-center gap-3">${p.imageUrl ? html`<img src="${p.imageUrl}" class="h-9 w-9 rounded-lg object-cover border border-line" alt="">` : ''}<div><div class="font-medium">${p.name}</div><div class="text-xs text-muted">${p.sku ? `SKU: ${p.sku}` : p.variants ? `${p.variants} variants` : ''}${!p.active ? ' · inactive' : ''}</div></div></div>` },
                    { label: 'Type', render: p => html`<span class="badge badge-gray">${TYPE_LABEL[p.type]}</span>` },
                    { label: 'Brand', render: p => p.brand || '—' },
                    { label: 'Category', render: p => html`<span class="text-slate-500">${p.category || '—'}</span>` },
                    { label: 'Price', num: true, render: p => fmt.money(p.retailPrice) },
                    { label: 'Wholesale', num: true, render: p => html`<span class="text-muted">${p.wholesalePrice ? fmt.money(p.wholesalePrice) : '—'}</span>` },
                    { label: 'Stock', num: true, render: p => (p.type === 'SERVICE' ? html`<span class="text-muted">—</span>` : html`<span class="${p.stock <= 0 ? 'text-orange-600 font-semibold' : ''}">${fmt.qty(p.stock)}${p.baseUnit ? html` <span class="text-xs text-muted">${p.baseUnit}</span>` : ''}</span>`) },
                    { label: 'Expiry', render: p => (p.expiryDate ? fmt.date(p.expiryDate) : '—') },
                    { label: 'Actions', render: p => html`<div class="flex gap-3 text-sm">${has('inventory.edit') ? html`<button class="text-muted hover:text-ink" data-edit="${p.id}">Edit</button>${p.type !== 'SERVICE' && p.type !== 'VARIANT' ? html`<button class="text-muted hover:text-ink" data-adjust="${p.id}">Stock</button>` : ''}<button class="text-rose-600" data-del="${p.id}">Delete</button>` : ''}</div>` },
                ],
            }));
        };
        const load = async () => { list = await api.get('/api/inventory/products'); draw(); };
        ui.mount(el, html`<div class="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 class="text-2xl font-bold">${t('Products')}</h1>
            <div class="flex flex-wrap items-center gap-2"><button class="btn-icon" data-uiset aria-label="Product UI Settings" title="Product UI Settings">${icon('settings')}</button>
            ${has('inventory.add') ? html`<button class="btn btn-outline" data-import>${icon('upload')}Import CSV</button>` : ''}<button class="btn btn-outline" data-export>${icon('download')}Export CSV</button>
            ${has('inventory.add') ? html`<button class="btn btn-primary" data-new>${icon('plus')}New</button>` : ''}</div></div>
          <div class="mb-4 max-w-sm relative"><span class="absolute inset-y-0 start-3 flex items-center text-muted">${icon('search')}</span><input class="input ps-9" placeholder="Search (name / SKU / formula)" data-q></div>
          <div data-list>${ui.loading()}</div>`);
        el.querySelector('[data-q]').addEventListener('input', e => { q = e.target.value; draw(); });
        ui.on(el, 'click', '[data-new]', () => productDrawer(null, load));
        ui.on(el, 'click', '[data-edit]', (e, b) => productDrawer(b.dataset.edit, load));
        ui.on(el, 'click', '[data-adjust]', (e, b) => adjustStock(list.find(p => p.id === b.dataset.adjust), load));
        ui.on(el, 'click', '[data-del]', async (e, b) => {
            const p = list.find(x => x.id === b.dataset.del);
            if (!(await ui.confirm({ title: `Delete "${p.name}"?`, message: 'It disappears from the POS and lists. Its past sales and stock history are kept.', ok: 'Delete', danger: true }))) return;
            try { await api.del('/api/inventory/products/' + p.id); ui.toast('Product deleted'); load(); } catch (err) { ui.fail(err); }
        });
        ui.on(el, 'click', '[data-uiset]', productUiSettings);
        ui.on(el, 'click', '[data-import]', () => importCsv(load));
        ui.on(el, 'click', '[data-export]', () => ui.csv('products.csv', ['Name', 'SKU', 'Barcode', 'Type', 'Category', 'Brand', 'Price', 'Wholesale', 'Cost', 'Stock', 'Unit', 'Expiry'],
            list.map(p => [p.name, p.sku, p.barcode, TYPE_LABEL[p.type], p.category, p.brand, p.retailPrice / 100, p.wholesalePrice ? p.wholesalePrice / 100 : '', p.cost / 100, p.type === 'SERVICE' ? '' : p.stock, p.baseUnit, p.expiryDate ? fmt.ymd(p.expiryDate) : ''])));
        await load();
    },
});

HP.inventory = { productDrawer: (id, onDone, prefill) => productDrawer(id, onDone, prefill) };

function productUiSettings() {
    const p = uiPrefs();
    const rows = [['variant', 'Variant Matrix', 'Color / Size options for apparel & shoes'], ['serial', 'IMEI / Serial', 'Serialized inventory tracking'], ['wholesale', 'Wholesale Pricing', 'B2B price field alongside retail'], ['expiry', 'Expiry Dates', 'Pharmacy / grocery expiry tracking'], ['units', 'Unit Conversion', 'Box → Pcs, Kg → Gram conversions']];
    const d = ui.drawer({
        title: 'Product UI Settings', subtitle: 'Tailor the product form to your business type. Settings are saved locally per device.',
        body: html`<div class="grid grid-cols-12 gap-3">${rows.map(([k, l, h]) => ui.field({ name: k, label: l, help: h, type: 'switch', value: p[k] }))}</div>`,
        footer: html`<button class="btn btn-outline w-full" data-reset>Reset to defaults</button>`,
    });
    d.el.addEventListener('change', () => { localStorage.setItem('hp.productUi', JSON.stringify(ui.readForm(d.el))); });
    d.el.querySelector('[data-reset]').addEventListener('click', () => { localStorage.removeItem('hp.productUi'); d.close(); ui.toast('Defaults restored'); });
}

async function productDrawer(id, onDone, prefill) {
    const prefs = uiPrefs();
    let cats, brands, units, colors, sizes, prod;
    try { [cats, brands, units, colors, sizes, prod] = await Promise.all([master('categories'), master('brands'), master('units'), master('colors'), master('sizes'), id ? api.get('/api/inventory/products/' + id) : null]); }
    catch (err) { return ui.fail(err); }
    const p = prod || { type: 'STANDARD', active: true, reorderLevel: 10, taxRate: 0, altUnits: [], variants: [], ...(prefill || {}) };
    const isChild = !!(p && p.parentId);
    let type = p.type;
    let alt = (p.altUnits || []).map(u => ({ unitId: u.unitId, factor: u.factor, price: u.price }));
    const pickedColors = new Set((p.variants || []).map(v => v.colorId).filter(Boolean));
    const pickedSizes = new Set((p.variants || []).map(v => v.sizeId).filter(Boolean));
    let image = p.imageUrl || '';
    const typeCards = [['STANDARD', 'Standard', 'Normal inventory item'], ['VARIANT', 'Variant', 'Color / Size matrix'], ['SERIAL', 'Serialized / IMEI', 'Unique serial per unit'], ['SERVICE', 'Service', 'Intangible — no stock tracking']]
        .filter(([v]) => v === type || (v !== 'VARIANT' || prefs.variant) && (v !== 'SERIAL' || prefs.serial));
    const unitOpts = [['', '— none —'], ...units.map(u => [u.id, `${u.name} (${u.shortCode})${u.isBase ? '' : ''}`])];

    const general = () => html`<div class="grid grid-cols-12 gap-4">
        ${ui.field({ label: 'Name', name: 'name', value: p.name || '', required: true, placeholder: 'Product name' })}
        ${isChild ? '' : html`<div class="col-span-12"><div class="label">Product Type</div><div class="grid grid-cols-2 gap-2" data-types>${typeCards.map(([v, l, d]) => html`<button type="button" data-type="${v}" ${id && v !== type ? raw('disabled') : ''} class="rounded-xl border p-3 text-left ${v === type ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'} disabled:opacity-40"><div class="text-sm font-semibold">${l}</div><div class="text-xs text-muted">${d}</div></button>`)}</div>${id ? html`<p class="help">The type of a saved product cannot change.</p>` : ''}</div>`}
        ${ui.field({ label: 'Formula / Generic', name: 'formula', value: p.formula || '', half: true })}
        ${type === 'VARIANT' ? '' : html`<div class="col-span-12 sm:col-span-6"><label class="label">SKU</label><div class="flex gap-2"><input class="input" name="sku" value="${p.sku || ''}"><button type="button" class="btn-icon" data-gen-sku title="Generate SKU">${icon('wand')}</button></div></div>
          <div class="col-span-12 sm:col-span-6"><label class="label">Barcode</label><div class="flex gap-2"><input class="input font-mono" name="barcode" value="${p.barcode || ''}">${HP.native && HP.native.isApp() ? html`<button type="button" class="btn-icon" data-cam-bar title="${t('Scan with camera')}" aria-label="${t('Scan with camera')}">${icon('camera')}</button>` : ''}<button type="button" class="btn-icon" data-gen-bar title="Generate Barcode">${icon('wand')}</button></div><p class="help">Supports hardware scanner — focus field and scan</p></div>`}
        ${ui.field({ label: 'Category', name: 'categoryId', type: 'select', value: p.categoryId || '', half: true, options: [['', 'None'], ...cats.filter(c => c.active || c.id === p.categoryId).map(c => [c.id, c.name])] })}
        ${ui.field({ label: 'Brand', name: 'brandId', type: 'select', value: p.brandId || '', half: true, options: [['', 'None'], ...brands.map(b => [b.id, b.name])] })}
        <div class="col-span-12 rounded-xl border border-line p-4"><div class="mb-3 flex items-center gap-2 font-semibold">${icon('image')}Media Center</div>
          <div class="flex gap-4"><label class="flex h-28 flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line text-center text-xs text-muted hover:bg-surface-2">${icon('upload', 'w-5 h-5 mb-1')}Drag & drop image<br>PNG, JPG up to 800 KB<input type="file" accept="image/png,image/jpeg,image/webp" class="hidden" data-img-file></label>
          <div class="flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-2 text-xs text-muted" data-img-prev>${image ? html`<img src="${image}" class="h-full w-full object-cover" alt="">` : 'No image selected'}</div></div>
          <div class="mt-3"><label class="label">Image URL</label><input class="input" data-img-url placeholder="https://…" value="${image.startsWith('data:') ? '' : image}"></div>
          ${image ? html`<button type="button" class="mt-2 text-xs text-rose-600" data-img-clear>Remove image</button>` : ''}</div>
        ${ui.field({ label: 'Active', name: 'active', type: 'checkbox', value: p.active !== false })}
      </div>`;

    const altRows = () => html`${alt.length ? alt.map((u, i) => html`<div class="grid grid-cols-12 gap-2 items-end mb-2" data-alt="${i}">
          <div class="col-span-4"><label class="label">Unit</label><select class="input" data-alt-unit>${unitOpts.map(([v, l]) => html`<option value="${v}" ${v === u.unitId ? raw('selected') : ''}>${l}</option>`)}</select></div>
          <div class="col-span-3"><label class="label">How many in 1 base</label><input class="input" type="number" step="any" min="0" data-alt-factor value="${u.factor || ''}"></div>
          <div class="col-span-4"><label class="label">Price (optional)</label><input class="input" type="number" step="0.01" min="0" data-alt-price value="${u.price ? fmt.rupees(u.price) : ''}" placeholder="auto"></div>
          <button type="button" class="col-span-1 btn-icon" data-alt-del="${i}" aria-label="Remove">${icon('trash')}</button></div>`)
        : html`<div class="rounded-lg border border-dashed border-line px-3 py-4 text-center text-sm text-muted">No alternate units. POS sells in base unit only.</div>`}`;

    const pricing = () => html`<div class="grid grid-cols-12 gap-4">
        ${ui.field({ label: 'Retail Price', name: 'retailPrice', money: true, value: p.retailPrice || 0, third: true })}
        ${prefs.wholesale ? ui.field({ label: 'Wholesale Price', name: 'wholesalePrice', money: true, value: p.wholesalePrice || 0, third: true, help: 'This price applies when Wholesale Mode is active at the POS.' }) : ''}
        ${ui.field({ label: 'Cost', name: 'cost', money: true, value: p.cost || 0, third: true })}
        ${ui.field({ label: 'Tax %', name: 'taxRate', type: 'number', value: p.taxRate || 0, third: true, help: '0 = the POS default tax' })}
        ${ui.field({ label: 'Sold by amount (weighed / loose)', name: 'weighed', type: 'checkbox', value: p.weighed, help: 'POS asks for an amount or quantity' })}
        ${prefs.units ? html`<div class="col-span-12 rounded-xl border border-indigo-100 bg-accent-soft/50 p-4 dark:border-indigo-950">
          <div class="font-semibold">Advanced UoM Matrix</div><p class="mb-3 text-xs text-muted">Stock is tracked in the base unit. Set retail price per base unit; alternate units auto-price from the conversion rule (override for bulk discounts).</p>
          ${ui.field({ label: 'Base Unit (inventory)', name: 'baseUnitId', type: 'select', value: p.baseUnitId || '', options: unitOpts, help: 'Retail price above is per 1 base unit.' })}
          <div class="mt-4 mb-2 flex items-center justify-between"><div class="eyebrow">ALTERNATE SALE UNITS</div><button type="button" class="text-xs font-medium text-accent" data-alt-add>+ Add unit row</button></div>
          <div data-alt-box>${altRows()}</div><p class="help">Example: base unit Carton, alternate unit Dozen with 30 → 1 Ctn = 30 Dzn.</p></div>` : ''}
      </div>`;

    const variantMatrix = () => {
        if (type !== 'VARIANT') return '';
        const combos = [];
        const cs = [...pickedColors].length ? [...pickedColors] : [null], ss = [...pickedSizes].length ? [...pickedSizes] : [null];
        for (const c of cs) for (const s of ss) if (c || s) combos.push({ colorId: c, sizeId: s });
        const existing = p.variants || [];
        const label = v => [v.colorId && (colors.find(c => c.id === v.colorId) || {}).name, v.sizeId && (sizes.find(s => s.id === v.sizeId) || {}).name].filter(Boolean).join(' / ');
        return html`<div class="mt-4"><div class="eyebrow mb-2">VARIANTS (${combos.length})</div>${combos.length ? html`<div class="overflow-x-auto rounded-xl border border-line"><table class="tbl"><thead><tr><th>Variant</th><th>SKU</th><th>Barcode</th><th class="!text-right">Price</th><th class="!text-right">${id ? 'Stock' : 'Opening'}</th></tr></thead><tbody>
          ${combos.map(v => { const e = existing.find(x => x.colorId === v.colorId && x.sizeId === v.sizeId) || {}; return html`<tr data-var data-color="${v.colorId || ''}" data-size="${v.sizeId || ''}" data-id="${e.id || ''}">
            <td class="whitespace-nowrap font-medium">${label(v)}</td><td><input class="input h-8 w-28" data-v-sku value="${e.sku || ''}"></td><td><input class="input h-8 w-36 font-mono" data-v-bar value="${e.barcode || ''}"></td>
            <td class="num"><input class="input h-8 w-24 text-right" type="number" step="0.01" min="0" data-v-price value="${e.retailPrice ? fmt.rupees(e.retailPrice) : ''}" placeholder="same"></td>
            <td class="num">${e.id ? fmt.qty(e.stock) : html`<input class="input h-8 w-20 text-right" type="number" step="any" min="0" data-v-open placeholder="0">`}</td></tr>`; })}</tbody></table></div>` : html`<p class="text-sm text-muted">Pick colours and/or sizes above.</p>`}</div>`;
    };
    const pickList = (title, items, picked, kind) => html`<div class="rounded-xl border border-line p-3"><div class="mb-2 font-medium text-sm">${title}</div>
        <input class="input h-8 mb-2" placeholder="Search ${kind}…" data-pick-search="${kind}"><div class="max-h-44 overflow-y-auto thin-scroll space-y-1" data-pick-list="${kind}">
        ${items.map(it => html`<label class="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-surface-2" data-pick-row="${it.name.toLowerCase()}"><input type="checkbox" class="check" data-pick="${kind}" value="${it.id}" ${picked.has(it.id) ? raw('checked') : ''}>${kind === 'colors' ? html`<span class="h-3 w-3 rounded-full border border-line" style="background:${it.hex}"></span>` : ''}${it.name}</label>`)}</div></div>`;
    const inventory = () => type === 'SERVICE' ? html`<p class="text-sm text-muted">A service has no stock.</p>` : type === 'VARIANT' ? html`<div class="font-semibold mb-3">Variant Options</div><div class="grid grid-cols-2 gap-3">${pickList('Colors', colors, pickedColors, 'colors')}${pickList('Sizes', sizes, pickedSizes, 'sizes')}</div><div data-matrix>${variantMatrix()}</div>`
        : html`<div class="grid grid-cols-12 gap-4">
            ${id ? html`<div class="col-span-12 rounded-lg bg-surface-2 px-3 py-2 text-sm">Current stock: <b>${fmt.qty(p.stock)}</b> ${p.baseUnit || ''} · change it with <b>Stock</b> on the list (an adjustment is recorded).</div>` : ui.field({ label: 'Opening Stock', name: 'openingStock', type: 'number', value: '', half: true })}
            ${ui.field({ label: 'Reorder Level', name: 'reorderLevel', type: 'number', value: p.reorderLevel ?? 10, half: true })}
            ${prefs.expiry ? ui.field({ label: 'Expiry Date', name: 'expiryDate', type: 'date', value: p.expiryDate ? fmt.ymd(p.expiryDate) : '' }) : ''}
          </div>`;
    const advanced = () => type === 'SERIAL' ? html`<div class="grid grid-cols-12 gap-4">
          ${ui.field({ label: id ? 'Add serial / IMEI numbers' : 'Serial / IMEI numbers (opening stock)', name: 'serials', type: 'textarea', rows: 8, placeholder: 'One per line', help: 'Each line is one unit in stock. The POS asks which serial is sold.' })}
          ${p.serials && p.serials.length ? html`<div class="col-span-12"><div class="eyebrow mb-2">SAVED SERIALS (${p.serials.length})</div><div class="flex flex-wrap gap-1.5">${p.serials.map(s => html`<span class="badge ${s.status === 'IN_STOCK' ? 'badge-good' : 'badge-gray'}">${s.serial}</span>`)}</div></div>` : ''}</div>`
        : html`<p class="text-sm text-muted">No advanced options for this product type.</p>`;

    let tab = 'general';
    const drawTab = form => {
        const box = form.querySelector('[data-tabbody]');
        // keep what was typed on other tabs: tab bodies are rendered once and hidden
        for (const t2 of ['general', 'pricing', 'inventory', 'advanced']) {
            let pane = box.querySelector(`[data-pane="${t2}"]`);
            if (!pane) { pane = document.createElement('div'); pane.dataset.pane = t2; box.appendChild(pane); pane.innerHTML = String({ general, pricing, inventory, advanced }[t2]()); }
            pane.classList.toggle('hidden', t2 !== tab);
        }
        form.querySelectorAll('[data-tabs] [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === tab));
    };
    const rerender = (form, which) => { const pane = form.querySelector(`[data-pane="${which}"]`); if (pane) pane.innerHTML = String({ general, pricing, inventory, advanced }[which]()); };

    ui.formDrawer({
        title: id ? 'Edit Products' : 'New Products', subtitle: 'Full product engine — pricing, units, variants & inventory', wide: true,
        body: html`<div class="mb-5">${ui.tabs('ptab', [['general', 'General Info'], ['pricing', 'Pricing & Units'], ['inventory', 'Inventory & Variants'], ['advanced', 'Advanced']], tab)}</div><div data-tabbody></div>`,
        onMount(form) {
            drawTab(form);
            form.addEventListener('click', async e => {
                const tb = e.target.closest('[data-tabs] [data-v]');
                if (tb) { tab = tb.dataset.v; drawTab(form); return; }
                const ty = e.target.closest('[data-type]');
                if (ty && !ty.disabled) {
                    keepGeneral(form);
                    type = ty.dataset.type; rerender(form, 'general'); rerender(form, 'inventory'); rerender(form, 'advanced'); return;
                }
                if (e.target.closest('[data-gen-sku]')) { form.querySelector('[name=sku]').value = skuFrom(form.querySelector('[name=name]').value); return; }
                if (e.target.closest('[data-gen-bar]')) { form.querySelector('[name=barcode]').value = ean13(); return; }
                if (e.target.closest('[data-cam-bar]')) { HP.native.scan().then(code => { if (code) form.querySelector('[name=barcode]').value = code; }).catch(err => ui.fail(err)); return; }
                if (e.target.closest('[data-img-clear]')) { keepGeneral(form); image = ''; rerender(form, 'general'); return; }
                if (e.target.closest('[data-alt-add]')) { syncAlt(form); alt.push({ unitId: '', factor: '', price: null }); form.querySelector('[data-alt-box]').innerHTML = String(altRows()); return; }
                const ad = e.target.closest('[data-alt-del]');
                if (ad) { syncAlt(form); alt.splice(+ad.dataset.altDel, 1); form.querySelector('[data-alt-box]').innerHTML = String(altRows()); }
            });
            form.addEventListener('change', async e => {
                if (e.target.matches('[data-img-file]')) {
                    try { image = await ui.readImage(e.target.files[0], 320, 40 * 1024, { jpeg: true }); form.querySelector('[data-img-prev]').innerHTML = `<img src="${image}" class="h-full w-full object-cover" alt="">`; } catch (err) { ui.fail(err); }
                }
                if (e.target.matches('[data-pick]')) {
                    const set = e.target.dataset.pick === 'colors' ? pickedColors : pickedSizes;
                    e.target.checked ? set.add(e.target.value) : set.delete(e.target.value);
                    // keep the SKU / barcode / price / opening stock already typed in the variant rows
                    const typed = {};
                    ui.$$('[data-var]', form).forEach(r => { typed[`${r.dataset.color}|${r.dataset.size}`] = ['[data-v-sku]', '[data-v-bar]', '[data-v-price]', '[data-v-open]'].map(sel => (r.querySelector(sel) || {}).value); });
                    form.querySelector('[data-matrix]').innerHTML = String(variantMatrix());
                    ui.$$('[data-var]', form).forEach(r => {
                        const was = typed[`${r.dataset.color}|${r.dataset.size}`];
                        if (was) ['[data-v-sku]', '[data-v-bar]', '[data-v-price]', '[data-v-open]'].forEach((sel, i) => { const inp = r.querySelector(sel); if (inp && was[i] !== undefined) inp.value = was[i]; });
                    });
                }
            });
            form.addEventListener('input', e => {
                if (e.target.matches('[data-img-url]')) { image = e.target.value.trim(); if (/^https:\/\//.test(image)) form.querySelector('[data-img-prev]').innerHTML = `<img src="${HP.esc(image)}" class="h-full w-full object-cover" alt="">`; }
                if (e.target.matches('[data-pick-search]')) { const k = e.target.dataset.pickSearch, q = e.target.value.toLowerCase(); form.querySelectorAll(`[data-pick-list="${k}"] [data-pick-row]`).forEach(r => r.classList.toggle('hidden', !r.dataset.pickRow.includes(q))); }
            });
        },
        async onSubmit(v, d, form) {
            if (prefs.units) syncAlt(form);
            const body = { ...v, type, imageUrl: image, altUnits: alt.filter(u => u.unitId), wholesalePrice: v.wholesalePrice || null };
            // a section hidden in Product UI Settings is not in the form: keep what the product already has (the API replaces every field)
            if (!prefs.wholesale) body.wholesalePrice = p.wholesalePrice || null;
            if (!prefs.units) body.baseUnitId = p.baseUnitId || '';
            if (body.expiryDate === undefined) body.expiryDate = p.expiryDate ? fmt.ymd(p.expiryDate) : '';
            if (body.reorderLevel === undefined && p.reorderLevel !== undefined) body.reorderLevel = p.reorderLevel;
            if (type === 'VARIANT') {
                body.variants = ui.$$('[data-var]', form).map(r => ({
                    id: r.dataset.id || null, colorId: r.dataset.color || null, sizeId: r.dataset.size || null,
                    sku: r.querySelector('[data-v-sku]').value.trim(), barcode: r.querySelector('[data-v-bar]').value.trim(),
                    retailPrice: r.querySelector('[data-v-price]').value === '' ? '' : fmt.toPaisa(r.querySelector('[data-v-price]').value),
                    openingStock: r.querySelector('[data-v-open]') ? r.querySelector('[data-v-open]').value : 0,
                }));
            }
            if (id) await api.put('/api/inventory/products/' + id, body); else await api.post('/api/inventory/products', body);
            d.close(); ui.toast(id ? 'Product saved' : 'Product added'); onDone();
        },
    });
    // keep what was already typed on General Info (name, codes, category …) across a re-draw of that tab
    function keepGeneral(form) {
        const typed = ui.readForm(form.querySelector('[data-pane="general"]'));
        Object.assign(p, typed, { categoryId: typed.categoryId || null, brandId: typed.brandId || null });
    }
    function syncAlt(form) {
        alt = ui.$$('[data-alt]', form).map(r => ({ unitId: r.querySelector('[data-alt-unit]').value, factor: r.querySelector('[data-alt-factor]').value, price: r.querySelector('[data-alt-price]').value === '' ? null : fmt.toPaisa(r.querySelector('[data-alt-price]').value) }));
    }
}

function adjustStock(p, onDone) {
    ui.formDrawer({
        title: 'Adjust stock', subtitle: `${p.name} · now ${fmt.qty(p.stock)} ${p.baseUnit || ''}`, submit: 'Save adjustment',
        body: html`<div class="grid grid-cols-12 gap-4">
            ${ui.field({ label: 'How', name: 'mode', type: 'select', options: [['DIFF', 'Add or remove a quantity (+ / −)'], ['SET', 'Set to the counted quantity']] })}
            ${ui.field({ label: 'Quantity', name: 'qty', type: 'number', required: true, min: null, help: 'For add/remove use a minus sign to remove, e.g. -2.' })}
            ${ui.field({ label: 'Reason', name: 'note', required: true, placeholder: 'Damaged, stock count, found…' })}</div>
          <div class="mt-6" data-moves>${ui.loading()}</div>`,
        async onMount(form) {
            const moves = await api.get(`/api/inventory/products/${p.id}/movements`);
            ui.mount(form.querySelector('[data-moves]'), html`<div class="eyebrow mb-2">STOCK HISTORY</div>${moves.length ? html`<div class="max-h-72 overflow-y-auto thin-scroll rounded-xl border border-line"><table class="tbl"><tbody>${moves.map(m => html`<tr><td class="text-xs text-muted whitespace-nowrap">${fmt.dateTime(m.date)}</td><td class="text-xs">${m.type.replace('_', ' ')} ${m.refNo ? `· ${m.refNo}` : ''}${m.note ? html`<div class="text-muted">${m.note}</div>` : ''}</td><td class="num font-medium ${m.qty < 0 ? 'text-bad' : 'text-good'}">${m.qty > 0 ? '+' : ''}${fmt.qty(m.qty)}</td></tr>`)}</tbody></table></div>` : html`<p class="text-sm text-muted">No movements yet.</p>`}`);
        },
        async onSubmit(v, d) { const r = await api.post(`/api/inventory/products/${p.id}/adjust`, v); d.close(); ui.toast(`Stock now ${fmt.qty(r.after)}`); onDone(); },
    });
}

function importCsv(onDone) {
    let rows = [];
    const m = ui.modal({
        title: 'Import Products (CSV)', width: 520,
        body: html`<label class="flex h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line text-sm text-muted hover:bg-surface-2">${icon('upload', 'w-7 h-7 mb-2')}<span data-drop>Drop CSV here or click to browse</span><input type="file" accept=".csv,text/csv" class="hidden" data-file></label>
          <p class="mt-3 text-xs text-muted">Columns: Name, SKU, Category, Price, Stock (header row optional)</p><div data-prev class="mt-3"></div>`,
        footer: html`<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" data-go disabled>Import 0 products</button>`,
    });
    const parse = text => {
        const out = [];
        for (const line of text.split(/\r?\n/)) {
            if (!line.trim()) continue;
            const cells = []; let cur = '', qd = false;
            for (let i = 0; i < line.length; i++) { const c = line[i]; if (qd) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') qd = false; else cur += c; } else if (c === '"') qd = true; else if (c === ',') { cells.push(cur); cur = ''; } else cur += c; }
            cells.push(cur); out.push(cells.map(s => s.trim()));
        }
        if (out.length && /name/i.test(out[0][0] || '') && isNaN(Number(out[0][3]))) out.shift();
        return out.map(c => ({ name: c[0] || '', sku: c[1] || '', category: c[2] || '', price: c[3] === '' || c[3] === undefined ? '' : fmt.toPaisa(c[3]), stock: c[4] || 0 }));
    };
    m.el.querySelector('[data-file]').addEventListener('change', async e => {
        const f = e.target.files[0]; if (!f) return;
        rows = parse(await f.text());
        m.el.querySelector('[data-drop]').textContent = f.name;
        const go = m.el.querySelector('[data-go]'); go.disabled = !rows.length; go.textContent = `Import ${rows.length} products`;
        ui.mount(m.el.querySelector('[data-prev]'), rows.length ? html`<div class="max-h-48 overflow-auto rounded-lg border border-line text-xs"><table class="tbl"><thead><tr><th>Name</th><th>SKU</th><th>Category</th><th class="!text-right">Price</th><th class="!text-right">Stock</th></tr></thead><tbody>${rows.slice(0, 50).map(r => html`<tr><td>${r.name}</td><td>${r.sku}</td><td>${r.category}</td><td class="num">${r.price === '' ? '' : fmt.money(r.price)}</td><td class="num">${r.stock}</td></tr>`)}</tbody></table></div>${rows.length > 50 ? html`<p class="help">…and ${rows.length - 50} more</p>` : ''}` : html`<p class="text-sm text-rose-600">No rows found in the file.</p>`);
    });
    m.el.querySelector('[data-go]').addEventListener('click', async e => {
        e.target.disabled = true;
        try { const r = await api.post('/api/inventory/products/import', { rows }); m.close(); ui.toast(`${r.imported} products imported`); onDone(); }
        catch (err) { ui.fail(err); e.target.disabled = false; }
    });
}

// ───────── master data pages ─────────
function masterPage(path, kind, cfg) {
    HP.page(path, {
        title: cfg.title, perm: ['inventory.add', 'inventory.edit'],
        async render(el) {
            let list = [], q = '';
            const load = async () => { list = await master(kind); draw(); };
            const draw = () => {
                const rows = q ? list.filter(r => r.name.toLowerCase().includes(q.toLowerCase())) : list;
                ui.mount(el.querySelector('[data-list]'), ui.table({ rows, columns: [...cfg.columns(list), { label: 'Actions', render: r => has('inventory.edit') ? html`<div class="flex gap-1"><button class="btn-icon !w-8 !h-8 border-0" data-edit="${r.id}" aria-label="Edit">${icon('edit')}</button><button class="btn-icon !w-8 !h-8 border-0 !text-rose-600" data-del="${r.id}" aria-label="Delete">${icon('trash')}</button></div>` : '' }],
                    empty: { iconName: cfg.icon, title: `No ${cfg.plural} yet`, text: cfg.emptyText || '', action: has('inventory.add') ? html`<button class="btn btn-primary" data-new>${icon('plus')}${cfg.addLabel}</button>` : '' } }));
            };
            ui.mount(el, html`${ui.pageHeader({ title: cfg.title, subtitle: cfg.subtitle, actions: has('inventory.add') && !cfg.search ? html`<button class="btn btn-primary" data-new>${icon('plus')}${cfg.newLabel || 'New'}</button>` : '' })}
              ${cfg.search ? html`<div class="mb-4 flex items-center justify-between gap-3"><div class="relative w-full max-w-md"><span class="absolute inset-y-0 start-3 flex items-center text-muted">${icon('search')}</span><input class="input ps-9" placeholder="${cfg.search}" data-q></div>${has('inventory.add') ? html`<button class="btn btn-primary" data-new>${icon('plus')}${cfg.addLabel}</button>` : ''}</div>` : ''}
              <div data-list>${ui.loading()}</div>`);
            const qi = el.querySelector('[data-q]'); if (qi) qi.addEventListener('input', e => { q = e.target.value; draw(); });
            const form = row => {
                const m = ui.modal({
                    title: row ? cfg.editTitle : cfg.addTitle, subtitle: cfg.formSubtitle, width: cfg.width || 480,
                    body: html`<form class="grid grid-cols-12 gap-4" data-f>${cfg.fields(row || {}, list)}</form><div data-err class="hidden mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"></div>`,
                    footer: html`<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" data-save>${row ? 'Save' : cfg.createLabel || 'Save'}</button>`,
                });
                const f = m.el.querySelector('[data-f]');
                if (cfg.onMount) cfg.onMount(f);
                const save = async e => {
                    e && e.preventDefault();
                    try { const v = ui.readForm(f); if (row) await api.put(`/api/inventory/master/${kind}/${row.id}`, v); else await api.post(`/api/inventory/master/${kind}`, v); m.close(); ui.toast('Saved'); load(); }
                    catch (err) { const b = m.el.querySelector('[data-err]'); b.textContent = err.message; b.classList.remove('hidden'); }
                };
                m.el.querySelector('[data-save]').addEventListener('click', save);
                f.addEventListener('submit', save);
            };
            ui.on(el, 'click', '[data-new]', () => form(null));
            ui.on(el, 'click', '[data-edit]', (e, b) => form(list.find(r => r.id === b.dataset.edit)));
            ui.on(el, 'click', '[data-del]', async (e, b) => {
                const r = list.find(x => x.id === b.dataset.del);
                if (!(await ui.confirm({ title: `Delete "${r.name}"?`, ok: 'Delete', danger: true }))) return;
                try { await api.del(`/api/inventory/master/${kind}/${r.id}`); ui.toast('Deleted'); load(); } catch (err) { ui.fail(err); }
            });
            await load();
        },
    });
}

masterPage('/categories', 'categories', {
    title: 'Categories', plural: 'categories', icon: 'layers', subtitle: 'Master data engine for product hierarchy, POS visuals, and catalog organization.',
    search: 'Search categories...', addLabel: 'Add Category', addTitle: 'Add Category', editTitle: 'Edit Category', createLabel: 'Create Category', width: 520,
    formSubtitle: 'Create a master category or sub-category for your catalog.',
    columns: list => [
        { label: 'Image', render: r => (r.imageUrl ? html`<img src="${r.imageUrl}" class="h-9 w-9 rounded-full object-cover border border-line" alt="">` : html`<div class="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-muted">${icon('image')}</div>`) },
        { label: 'Name', render: r => html`<div class="font-medium uppercase">${r.name}</div>${r.products ? html`<div class="text-xs text-muted">${r.products} product${r.products === 1 ? '' : 's'}</div>` : ''}` },
        { label: 'Parent Category', render: r => (list.find(c => c.id === r.parentId) || {}).name || '—' },
        { label: 'Status', render: r => (r.active ? ui.badge('Active', 'good') : ui.badge('Inactive', 'gray')) },
    ],
    fields: (r, list) => html`${ui.field({ label: 'Category Name', name: 'name', value: r.name || '', required: true, placeholder: 'e.g. Beverages, Spices, Cold Drinks', attr: { autofocus: true } })}
        ${ui.field({ label: 'Parent Category', name: 'parentId', type: 'select', value: r.parentId || '', options: [['', 'None (top-level category)'], ...list.filter(c => c.id !== r.id).map(c => [c.id, c.name])] })}
        ${ui.field({ label: 'Category Image URL', name: 'imageUrl', value: r.imageUrl || '', placeholder: 'https://example.com/category-image.png' })}
        <div class="col-span-12 flex h-24 items-center justify-center rounded-xl border-2 border-dashed border-line text-xs text-muted" data-cprev>${r.imageUrl ? html`<img src="${r.imageUrl}" class="h-20 object-contain" alt="">` : 'Image preview will appear here'}</div>
        ${ui.field({ label: 'Active on POS', name: 'active', type: 'switch', value: r.active !== false, help: 'Visible in POS category filters and product assignment.' })}
        ${ui.field({ label: 'Sort order', name: 'sortOrder', type: 'number', value: r.sortOrder || 0 })}`,
    onMount: f => f.querySelector('[name=imageUrl]').addEventListener('input', e => { const u = e.target.value.trim(); f.querySelector('[data-cprev]').innerHTML = /^https:\/\//.test(u) ? `<img src="${HP.esc(u)}" class="h-20 object-contain" alt="">` : 'Image preview will appear here'; }),
});
masterPage('/brands', 'brands', {
    title: 'Brands / Companies', plural: 'brands', icon: 'tag', subtitle: 'Manufacturer and brand master data for products, reports and purchasing.',
    search: 'Search brands...', addLabel: 'Add Brand', addTitle: 'Add Brand', editTitle: 'Edit Brand', createLabel: 'Create Brand',
    emptyText: 'Add the brands or companies whose products you sell.',
    columns: () => [{ label: 'Name', render: r => html`<span class="font-medium">${r.name}</span>` }, { label: 'Description', render: r => html`<span class="text-muted">${r.description || '—'}</span>` }, { label: 'Status', render: r => (r.active ? ui.badge('Active', 'good') : ui.badge('Inactive', 'gray')) }],
    fields: r => html`${ui.field({ label: 'Brand / Company Name', name: 'name', value: r.name || '', required: true, attr: { autofocus: true } })}${ui.field({ label: 'Description', name: 'description', type: 'textarea', value: r.description || '' })}${ui.field({ label: 'Active', name: 'active', type: 'switch', value: r.active !== false })}`,
});
masterPage('/inventory/units', 'units', {
    title: 'Units', plural: 'units', icon: 'ruler', subtitle: 'Master data for measurement units — used in product pricing and POS conversions.', addTitle: 'New Unit', editTitle: 'Edit Unit',
    columns: () => [{ label: 'Name', render: r => r.name }, { label: 'Short Code', render: r => html`<span class="font-mono">${r.shortCode}</span>` }, { label: 'Base Unit', render: r => (r.isBase ? 'Yes' : 'No') }],
    fields: r => html`${ui.field({ label: 'Name', name: 'name', value: r.name || '', required: true, placeholder: 'Kilogram, Box, Pieces…', attr: { autofocus: true } })}${ui.field({ label: 'Short Code', name: 'shortCode', value: r.shortCode || '', required: true, placeholder: 'Kg, Box, Pcs…' })}${ui.field({ label: 'Is base storage unit', name: 'isBase', type: 'checkbox', value: r.isBase })}`,
});
masterPage('/inventory/colors', 'colors', {
    title: 'Colors', plural: 'colors', icon: 'droplet', subtitle: 'Standard color master data for variant products (apparel, footwear).', addTitle: 'New Color', editTitle: 'Edit Color',
    columns: () => [{ label: 'Name', render: r => html`<span class="inline-flex items-center gap-2"><span class="h-4 w-4 rounded-full border border-line" style="background:${r.hex}"></span>${r.name}</span>` }, { label: 'Hex', render: r => html`<span class="font-mono text-xs">${r.hex}</span>` }],
    fields: r => html`${ui.field({ label: 'Name', name: 'name', value: r.name || '', required: true, attr: { autofocus: true } })}${ui.field({ label: 'Hex (optional)', name: 'hex', value: r.hex || '', placeholder: '#EF4444' })}`,
});
masterPage('/inventory/sizes', 'sizes', {
    title: 'Sizes', plural: 'sizes', icon: 'ruler', subtitle: 'Size master data for variant products — controls order in the variant matrix.', addTitle: 'New Size', editTitle: 'Edit Size',
    columns: () => [{ label: 'Name', render: r => html`<span class="font-medium">${r.name}</span>` }, { label: 'Sort Order', render: r => r.sortOrder }],
    fields: r => html`${ui.field({ label: 'Name', name: 'name', value: r.name || '', required: true, attr: { autofocus: true } })}${ui.field({ label: 'Sort Order', name: 'sortOrder', type: 'number', value: r.sortOrder || 0 })}`,
});

// ───────── Print Barcodes ─────────
HP.page('/inventory/barcodes', {
    title: 'Print Barcodes', perm: ['inventory.add', 'inventory.edit'],
    async render(el) {
        const catalog = await api.get('/api/inventory/catalog');
        const saved = (() => { try { return JSON.parse(localStorage.getItem('hp.labels') || '{}'); } catch { return {}; } })();
        const s = { template: 'STANDARD', w: 50, h: 25, rowGap: 2, colGap: 2, cols: 1, store: true, name: true, price: true, sku: false, expiry: false, font: 'M', ...saved };
        const queue = [];
        const shop = HP.session.tenant.name;
        const TPL = [['STANDARD', 'Standard Retail', 'Barcode center, store top, name & price bottom', 'tag'], ['MINI', 'Jewelry / Mini Tag', 'Compact horizontal — price left, tiny barcode right', 'star'], ['MINIMAL', 'Minimalist', 'Barcode and SKU only — no names or prices', 'barcode'], ['WHOLESALE', 'Wholesale / Logistics', 'Full product details, thick barcode, large MRP', 'truck']];
        const fs = { S: 0.8, M: 1, L: 1.2 }[s.font] || 1;
        const label = p => {
            const code = p.barcode || p.sku || p.id.slice(0, 12);
            const show = k => s.template !== 'MINIMAL' && s[k];
            const bar = `<svg class="hp-bc" data-code="${HP.esc(code)}" data-h="${s.template === 'WHOLESALE' ? 34 : s.template === 'MINI' ? 18 : 26}"></svg>`;
            const f = n => `font-size:${(n * (s.font === 'S' ? 0.85 : s.font === 'L' ? 1.15 : 1)).toFixed(1)}px`;
            if (s.template === 'MINI') return `<div class="lbl" style="display:flex;align-items:center;gap:2mm"><div style="${f(11)};font-weight:700">${show('price') ? HP.esc(fmt.money(p.retailPrice)) : ''}</div><div style="flex:1;text-align:center">${bar}${s.sku ? `<div style="${f(7)}">${HP.esc(code)}</div>` : ''}</div></div>`;
            return `<div class="lbl" style="text-align:center">${show('store') ? `<div style="${f(8)};font-weight:700">${HP.esc(shop)}</div>` : ''}${bar}${s.sku || s.template === 'MINIMAL' ? `<div style="${f(7)}">${HP.esc(code)}</div>` : ''}${show('name') ? `<div style="${f(s.template === 'WHOLESALE' ? 9 : 8)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${HP.esc(p.name)}</div>` : ''}${show('price') ? `<div style="${f(s.template === 'WHOLESALE' ? 13 : 10)};font-weight:700">${s.template === 'WHOLESALE' ? 'MRP ' : ''}${HP.esc(fmt.money(p.retailPrice))}</div>` : ''}${s.expiry && p.expiryDate ? `<div style="${f(7)}">Exp ${HP.esc(fmt.date(p.expiryDate))}</div>` : ''}</div>`;
        };
        const sheet = (items, scale = 1) => `<div style="display:grid;grid-template-columns:repeat(${s.cols}, ${s.w}mm);column-gap:${s.colGap}mm;row-gap:${s.rowGap}mm;transform-origin:top left;transform:scale(${scale})">${items.map(p => `<div style="width:${s.w}mm;height:${s.h}mm;overflow:hidden;box-sizing:border-box;padding:1mm;border:${scale !== 1 ? '1px dashed #cbd5e1' : '0'};color:#000;background:#fff;font-family:Arial, sans-serif">${label(p)}</div>`).join('')}</div>`;
        const renderBars = root => root.querySelectorAll('svg.hp-bc').forEach(svg => { try { window.JsBarcode(svg, svg.dataset.code, { format: 'CODE128', height: Number(svg.dataset.h), width: 1.2, displayValue: false, margin: 0 }); } catch { /* not encodable */ } });
        // label barcodes as well as the receipts' own barcodes / QR codes; the receipts' hook comes back when this page is left
        const prevAfterPrint = HP.ui.afterPrintRender;
        HP.ui.afterPrintRender = root => { renderBars(root); if (prevAfterPrint) prevAfterPrint(root); };
        const draw = () => {
            localStorage.setItem('hp.labels', JSON.stringify(s));
            const roll = s.w * s.cols + s.colGap * (s.cols - 1);
            ui.mount(el, html`${ui.pageHeader({ title: 'Print Barcodes', subtitle: 'Universal labeling — templates, custom dimensions, any thermal printer.', iconName: 'barcode' })}
            <div class="grid gap-6 lg:grid-cols-[440px_1fr]">
              <div class="space-y-6">
                <div class="card card-pad"><div class="eyebrow mb-3">SEARCH & QUEUE</div><div class="relative"><span class="absolute inset-y-0 start-3 flex items-center text-muted">${icon('search')}</span><input class="input ps-9" type="search" placeholder="Search by product name or SKU…" data-search></div></div>
                <div class="card card-pad"><div class="eyebrow mb-3">PRINT QUEUE</div>${queue.length ? html`<div class="space-y-2">${queue.map((q2, i) => html`<div class="flex items-center gap-2 rounded-lg border border-line px-3 py-2"><div class="min-w-0 flex-1"><div class="truncate text-sm font-medium">${q2.p.name}</div><div class="text-xs text-muted font-mono">${q2.p.barcode || q2.p.sku || '(no code — uses id)'}</div></div><input type="number" min="1" max="500" class="input h-8 w-16" value="${q2.n}" data-n="${i}"><button class="btn-icon !w-8 !h-8" data-rm="${i}" aria-label="Remove">${icon('x')}</button></div>`)}</div>` : html`<p class="text-sm text-muted">Search and add products to build your print queue.</p>`}</div>
              </div>
              <div class="card card-pad"><div class="eyebrow mb-4">LABEL SETTINGS & LIVE PREVIEW</div>
                <div class="label">Label Template</div><div class="grid grid-cols-2 gap-2 mb-5">${TPL.map(([v, l, d, ic]) => html`<button type="button" data-tpl="${v}" class="rounded-xl border p-3 text-left ${s.template === v ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'}"><div class="flex items-center gap-2 text-sm font-semibold">${icon(ic)}${l}</div><div class="mt-1 text-xs text-muted">${d}</div></button>`)}</div>
                <div class="label">${icon('ruler', 'w-3.5 h-3.5 inline')} Label Dimensions (mm)</div>
                <div class="grid grid-cols-4 gap-2">${[['w', 'Width'], ['h', 'Height'], ['rowGap', 'Row Gap'], ['colGap', 'Column Gap']].map(([k, l]) => html`<div><div class="text-xs text-muted mb-1">${l}</div><input type="number" min="0" step="0.5" class="input" data-s="${k}" value="${s[k]}"></div>`)}</div>
                <p class="help mb-4">Effective roll width (${s.cols}-up): ${roll} mm</p>
                <div class="grid grid-cols-2 gap-3 mb-4"><div><div class="label">Roll Layout</div><select class="input" data-s="cols">${[[1, 'Single Column'], [2, 'Double Column (2-up)'], [3, 'Triple Column (3-up)']].map(([v, l]) => html`<option value="${v}" ${s.cols === v ? raw('selected') : ''}>${l}</option>`)}</select></div>
                  <div><div class="label">Global Font Size</div><select class="input" data-s="font">${[['S', 'Small — fits long product names'], ['M', 'Medium — balanced'], ['L', 'Large — short names only']].map(([v, l]) => html`<option value="${v}" ${s.font === v ? raw('selected') : ''}>${l}</option>`)}</select></div></div>
                <div class="label">Label Elements to Print</div><div class="grid grid-cols-12 gap-2 mb-5">${[['store', 'Show Store Name'], ['name', 'Show Product Name'], ['price', 'Show Price / MRP'], ['sku', 'Show SKU'], ['expiry', 'Show Expiry', 'Only shown when product has an expiry date']].map(([k, l, h]) => ui.field({ name: 'el_' + k, label: l, help: h, type: 'switch', value: s[k], half: true }))}</div>
                <div class="label">Live Preview</div><div class="flex min-h-[140px] items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-line bg-white p-4" data-preview>${queue.length ? raw(sheet([queue[0].p], 1.6)) : html`<span class="text-sm text-muted">Add a product to the queue to preview a label</span>`}</div>
                <p class="help mb-4">Actual size: ${s.w} × ${s.h} mm — scaled to fit preview</p>
                <button class="btn btn-primary btn-lg w-full" data-print ${queue.length ? '' : raw('disabled')}>${icon('printer')}Print Labels</button>
              </div></div>`);
            renderBars(el);
            HP.ui.autocomplete(el.querySelector('[data-search]'), {
                search: async q => catalog.filter(p => (p.name + ' ' + p.sku + ' ' + p.barcode).toLowerCase().includes(q.toLowerCase())).slice(0, 12).map(p => ({ id: p.id, label: p.name, sub: `${p.barcode || p.sku || 'no code'} · ${fmt.money(p.retailPrice)}`, p })),
                onPick: it => { const ex = queue.find(x => x.p.id === it.p.id); ex ? ex.n++ : queue.push({ p: it.p, n: 1 }); draw(); },
            });
        };
        el.addEventListener('click', e => {
            const tp = e.target.closest('[data-tpl]'); if (tp) { s.template = tp.dataset.tpl; draw(); }
            const rm = e.target.closest('[data-rm]'); if (rm) { queue.splice(+rm.dataset.rm, 1); draw(); }
            if (e.target.closest('[data-print]')) {
                const items = queue.flatMap(q2 => Array(Math.max(1, Math.min(500, q2.n))).fill(q2.p));
                ui.print(raw(sheet(items)));
            }
        });
        el.addEventListener('change', e => {
            const k = e.target.dataset.s;
            if (k) { s[k] = k === 'font' ? e.target.value : Number(e.target.value) || 0; draw(); }
            if (e.target.dataset.n !== undefined) { queue[+e.target.dataset.n].n = Math.max(1, Number(e.target.value) || 1); }
            if (e.target.name && e.target.name.startsWith('el_')) { s[e.target.name.slice(3)] = e.target.value === 'true'; draw(); }
        });
        draw();
        return () => { HP.ui.afterPrintRender = prevAfterPrint; };
    },
});
