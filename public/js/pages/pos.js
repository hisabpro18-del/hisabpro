// POS Terminal — layout and behaviour from reference/REFERENCE.md "POS Terminal": product browser on the left (Visual / Touch
// grid or Retail / Barcode table), Current Sale panel on the right. Works the same online and on the offline desktop PC.
const { html, raw, icon, api, ui, fmt, t } = HP;

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
// this device's own choices; what is not chosen here yet comes from Settings → Receipt & POS (Wholesale Mode, Default POS screen)
const prefs = () => { try { return JSON.parse(localStorage.getItem('hp.pos') || '{}') || {}; } catch { return {}; } };
const savePrefs = p => { try { localStorage.setItem('hp.pos', JSON.stringify(p)); } catch { } };
// an unfinished cart survives leaving the screen in the app and the re-draw done by night mode / English–اردو
let posDraft = null;

HP.page('/pos', {
    title: 'POS Terminal', perm: 'sales.create',
    async render(el) {
        if (HP.receipt && HP.receipt.warm) HP.receipt.warm();
        const [boot, catalog] = await Promise.all([api.get('/api/pos/bootstrap'), api.get('/api/inventory/catalog')]);
        const P = prefs();
        if (P.wholesale === undefined) P.wholesale = !!(boot.pos && boot.pos.wholesaleMode);
        if (P.view === undefined) P.view = boot.pos && boot.pos.defaultMode === 'BARCODE' ? 'RETAIL' : 'VISUAL';
        let cat = 'ALL', q = '', hi = -1; // hi: the search result picked with the ↓ ↑ keys (Enter adds it)
        const fresh = () => ({ clientId: uuid(), lines: [], mode: 'WALKIN', customer: null, customerName: 'Walk-in Customer', priceMode: P.wholesale ? 'WHOLESALE' : 'RETAIL', discountType: 'AMOUNT', discountValue: '', split: false, payments: [{ method: 'CASH', amount: '' }], splitAmounts: { CASH: '', CARD: '', BANK: '' } });
        // a cart from before per-line prices (kept draft, held sale) gets the bill's mode on every line
        const normalize = c => { if (!c.priceMode) c.priceMode = P.wholesale || (c.customer && c.customer.group === 'WHOLESALE') ? 'WHOLESALE' : 'RETAIL'; for (const l of c.lines) if (!l.pm) l.pm = c.priceMode; return c; };
        let cart = normalize(posDraft || fresh());
        posDraft = null;
        let busy = false;
        const byId = Object.fromEntries(catalog.map(p => [p.id, p]));
        // Prices: each line is sold at Retail or Wholesale (the W button on the line); the Retail / Wholesale switch sets
        // every line of the bill at once. A product without a wholesale price is sold at its retail price.
        const hasWholesale = p => !!(p && Number(p.wholesalePrice) > 0);
        const basePrice = (p, mode = cart.priceMode) => (mode === 'WHOLESALE' && hasWholesale(p) ? p.wholesalePrice : p.retailPrice);
        const unitPrice = (p, unitId, mode = cart.priceMode) => {
            if (!unitId || unitId === p.baseUnitId) return basePrice(p, mode);
            const u = (p.altUnits || []).find(x => x.unitId === unitId);
            const wholesale = mode === 'WHOLESALE' && hasWholesale(p);
            return u && u.price && !wholesale ? u.price : basePrice(p, mode) / (u ? Number(u.factor) || 1 : 1); // exact: the line total is rounded, not the unit price
        };
        const lineMode = l => l.pm || cart.priceMode;
        // the bill's switch shows Retail or Wholesale when every line agrees, neither when they are mixed
        const billMode = () => (!cart.lines.length ? cart.priceMode : cart.lines.every(l => lineMode(l) === 'WHOLESALE') ? 'WHOLESALE' : cart.lines.every(l => lineMode(l) === 'RETAIL') ? 'RETAIL' : 'MIXED');

        // ── totals (the same maths the server uses) ──
        const totals = () => {
            const b = Calc.bill(cart.lines.map(l => ({ qty: l.qty, price: l.price, lineDiscount: l.lineDiscount || 0, taxRate: l.taxRate })), {
                discountType: cart.discountType, discountValue: cart.discountType === 'PERCENT' ? Number(cart.discountValue) || 0 : Number(cart.discountValue) || 0, defaultRate: boot.defaultRate,
            });
            const pays = cart.split ? Object.entries(cart.splitAmounts).map(([method, a]) => ({ method, amount: fmt.toPaisa(a) })) : cart.payments.map(p => ({ method: p.method, amount: fmt.toPaisa(p.amount) }));
            const s = Calc.settle(b.total, pays.filter(p => p.amount > 0));
            return { ...b, ...s, pays };
        };

        // ── layout ──
        // side by side from tablet width; on a phone the products come first and the sale below them (one scrolling page)
        ui.mount(el, html`<div class="-mx-4 -my-6 flex flex-col sm:-mx-6 md:h-[calc(100%+3rem)] md:min-h-[560px] md:flex-row" data-pos>
            <section class="min-w-0 flex-1 px-4 py-6 sm:px-6 md:overflow-y-auto thin-scroll" data-left></section>
            <aside class="flex w-full shrink-0 flex-col border-t border-line bg-surface md:max-w-[460px] md:overflow-y-auto md:border-s md:border-t-0 thin-scroll" data-right></aside>
          </div>
          <div class="fixed inset-x-0 bottom-0 z-30 hidden border-t border-line bg-surface/95 px-4 py-2.5 shadow-lg backdrop-blur md:!hidden" data-cartbar></div>`);
        const left = el.querySelector('[data-left]'), right = el.querySelector('[data-right]'), cartbar = el.querySelector('[data-cartbar]');
        // phone only: item count, total and a button that scrolls down to the sale (hidden while the sale is on screen)
        function drawCartBar(tt) {
            const n = cart.lines.length;
            cartbar.classList.toggle('hidden', !n || cartbarHidden);
            if (!n) return;
            cartbar.innerHTML = String(html`<div class="flex items-center gap-3"><div class="min-w-0 flex-1"><div class="text-xs text-muted">${n} ${n === 1 ? t('item') : t('items')}</div><div class="text-lg font-bold">${fmt.money(tt.total)}</div></div>
                <button type="button" class="btn btn-primary h-11 px-5" data-gocart>${icon('cart')}${t('Cart')}</button></div>`);
        }
        let cartbarHidden = false;
        const seen = 'IntersectionObserver' in window ? new IntersectionObserver(es => { cartbarHidden = es.some(e => e.isIntersecting); drawCartBar(totals()); }, { threshold: 0.15 }) : null;
        if (seen) seen.observe(right);
        cartbar.addEventListener('click', e => { if (e.target.closest('[data-gocart]')) right.scrollIntoView({ behavior: 'smooth', block: 'start' }); });

        const filtered = () => catalog.filter(p => (cat === 'ALL' || p.categoryId === cat) && (!q || [p.name, p.sku, p.barcode, p.formula].some(v => String(v || '').toLowerCase().includes(q.toLowerCase()))));
        const inCart = id => cart.lines.filter(l => l.productId === id).reduce((s, l) => s + l.qty / (l.factor || 1), 0);

        function drawLeft() {
            const cats = boot.categories.filter(c => catalog.some(p => p.categoryId === c.id));
            const list = filtered();
            left.innerHTML = String(html`<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h1 class="text-2xl font-bold">${t('POS Terminal')}</h1>
                <div class="flex flex-wrap items-center gap-2">${ui.seg('price', [['RETAIL', 'Retail price'], ['WHOLESALE', 'Wholesale price']], billMode())}${ui.seg('view', [['VISUAL', 'Visual / Touch'], ['RETAIL', 'Retail / Barcode']], P.view)}
                  <button class="btn btn-outline" data-held>${t('View Held Sales')}</button></div></div>
              <div class="relative mb-3"><span class="absolute inset-y-0 start-3 flex items-center text-muted">${icon('search')}</span>
                <input class="input h-11 ps-9 pe-12" placeholder="${t('Search / Barcode / Formula — 24*code adds 24')}" data-search value="${q}" autocomplete="off">${HP.native && HP.native.isApp() ? html`<button type="button" class="btn-icon absolute end-1 top-1 !h-9 !w-9 border-0" data-camscan aria-label="${t('Scan with camera')}" title="${t('Scan with camera')}">${icon('camera')}</button>` : html`<span class="kbd absolute end-3 top-3">F1</span>`}</div>
              <div class="thin-scroll -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"><button class="chip shrink-0 ${cat === 'ALL' ? 'chip-on' : ''}" data-cat="ALL">${t('All')}</button>${cats.map(c => html`<button class="chip shrink-0 ${cat === c.id ? 'chip-on' : ''}" data-cat="${c.id}">${c.name}</button>`)}</div>
              <div data-products>${productsHtml(list)}</div>`);
        }
        function productsHtml(list) {
            if (!list.length) return ui.empty({ iconName: 'package', title: catalog.length ? 'No products match' : 'No products yet', text: catalog.length ? 'Try another search or category.' : 'Add products under Inventory → Products.' });
            if (P.view === 'RETAIL') return html`<div class="card overflow-hidden"><table class="tbl" data-nopage><thead><tr><th>SKU / Barcode</th><th>Name</th><th class="!text-right">Price</th><th class="!text-right">Stock</th></tr></thead><tbody>${list.map((p, k) => html`<tr class="cursor-pointer ${p.type !== 'SERVICE' && p.stock <= 0 ? 'text-muted' : ''} ${k === hi ? 'bg-accent-soft outline-2 outline-accent' : ''}" data-add="${p.id}" ${k === hi ? raw('data-hi') : ''}><td class="font-mono text-xs text-muted">${p.barcode || p.sku || '—'}</td><td class="font-semibold">${p.name}</td><td class="num">${fmt.money(basePrice(p))}</td><td class="num ${p.type !== 'SERVICE' && p.stock <= 0 ? 'text-bad' : ''}">${p.type === 'SERVICE' ? '—' : fmt.qty(p.stock - inCart(p.id))}</td></tr>`)}</tbody></table></div>`;
            return html`<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">${list.map((p, k) => {
                const left2 = p.type === 'SERVICE' ? null : Calc.q3(p.stock - inCart(p.id));
                const out = left2 !== null && left2 <= 0;
                const n = cart.lines.filter(l => l.productId === p.id).length;
                return html`<button type="button" class="group relative flex flex-col overflow-hidden rounded-xl border bg-surface text-left transition hover:border-slate-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30 ${k === hi ? 'border-accent ring-2 ring-accent' : 'border-line'}" data-add="${p.id}" ${k === hi ? raw('data-hi') : ''}>
                  <div class="relative flex h-24 items-center justify-center bg-surface-2">${p.imageUrl ? html`<img src="${p.imageUrl}" class="h-full w-full object-cover" alt="" loading="lazy">` : icon('box', 'w-9 h-9 text-faint')}
                    ${left2 === null ? '' : out ? html`<span class="absolute end-2 top-2 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">Out</span>` : html`<span class="absolute end-2 top-2 rounded-full border border-line bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">${fmt.qty(left2)} in stock</span>`}
                    ${n ? html`<span class="absolute bottom-2 start-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">${n} in cart</span>` : ''}</div>
                  <div class="flex flex-1 flex-col p-3"><div class="line-clamp-2 text-sm font-semibold uppercase ${out ? 'text-faint' : ''}">${p.name}</div>
                    <div class="mt-0.5 truncate text-[11px] uppercase text-muted">${p.parentId ? '—' : p.category || ' '}</div>
                    <div class="mt-auto pt-2 font-bold ${out ? 'text-faint' : ''}">${fmt.money(basePrice(p))}</div></div></button>`;
            })}</div>`;
        }
        const refreshProducts = () => { const box = left.querySelector('[data-products]'); if (box) box.innerHTML = String(productsHtml(filtered())); };

        function drawRight() {
            const tt = totals();
            drawCartBar(tt);
            const credit = cart.mode === 'CREDIT';
            const has = cart.lines.length > 0;
            right.innerHTML = String(html`
              <div class="flex items-center justify-between px-5 pt-5"><h2 class="text-lg font-semibold">${t('Current Sale')}</h2>
                <div class="flex items-center gap-1">${has ? html`<button class="btn btn-sm btn-ghost" data-hold>${icon('pause')}${t('Hold')}</button><button class="btn btn-sm btn-ghost" data-estimate>${icon('printer')}Print Estimate</button><button class="btn-icon !w-8 !h-8 border-0 !text-rose-600" data-clear aria-label="Clear cart">${icon('trash')}</button>` : ''}
                <button class="btn-icon !w-8 !h-8" data-settings aria-label="POS settings">${icon('settings')}</button></div></div>
              <div class="px-5 pt-2">${credit ? html`<span class="badge border-amber-300 bg-amber-50 text-amber-700">${cart.customer ? `Credit (Udhar) — ${cart.customer.name}` : 'Credit (Udhar) — no customer'}</span>` : html`<span class="badge badge-gray">Walk-in</span>`}</div>
              <div class="flex items-center justify-between gap-2 px-5 pt-3"><span class="text-xs text-muted">${t('Prices for the whole bill')}</span>${ui.seg('price', [['RETAIL', t('Retail')], ['WHOLESALE', t('Wholesale')]], billMode())}</div>
              <div class="px-5 pt-3">${ui.seg('mode', [['WALKIN', t('Walk-in Customer')], ['CREDIT', t('Credit (Udhar)')]], cart.mode)}</div>
              <div class="px-5 pt-3">${credit ? html`<div class="relative"><input class="input pe-10" placeholder="Customer…" data-cust value="${cart.customer ? cart.customer.name : ''}" autocomplete="off"><span class="kbd absolute end-2 top-2.5">F2</span></div>
                  ${cart.customer ? html`<div class="mt-1.5 flex items-center justify-between text-xs"><span class="text-muted">${cart.customer.phone || ''}</span><span>Balance <b class="${cart.customer.balance > 0 ? 'text-warn' : ''}">${fmt.money(cart.customer.balance)}</b>${cart.customer.creditLimit ? html` · limit ${fmt.money(cart.customer.creditLimit)}` : ''}</span></div>
                  <div class="mt-1.5 flex gap-2"><button class="btn btn-sm btn-outline" data-recvcust>${icon('handCoins')}Receive udhaar</button><button class="btn btn-sm btn-ghost" data-promcust>${icon('calendar')}Promise</button></div>${cart.customer.notes ? html`<div class="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">${icon('info', 'w-3.5 h-3.5 inline')} ${cart.customer.notes}</div>` : ''}` : ''}
                  <button class="mt-1.5 text-xs font-medium text-accent" data-newcust>+ Add Credit Customer</button>`
                : html`<label class="label">${t('Customer name (receipt only)')}</label><input class="input" data-cname value="${cart.customerName}">`}</div>
              <div class="mt-3 min-h-[96px] flex-1 overflow-y-auto thin-scroll border-t border-line px-5 py-1" data-lines>
                ${has ? cart.lines.map((l, i) => html`<div class="border-b border-line-soft py-2.5">
                    <div class="flex items-start gap-2"><div class="min-w-0 flex-1"><div class="line-clamp-2 text-sm font-semibold leading-snug" title="${l.name}">${l.name}</div>${l.variantLabel || l.serial ? html`<div class="truncate text-xs text-muted">${l.variantLabel}${l.serial ? ` S/N ${l.serial}` : ''}</div>` : ''}</div>
                      <div class="flex items-center gap-1"><button class="btn-icon !h-7 !w-7" data-dec="${i}" aria-label="Less">${icon('minus', 'w-3.5 h-3.5')}</button>
                        <div class="w-14 text-center"><div class="text-sm font-semibold tabular-nums">${fmt.qty(l.qty)}</div>${l.unitName ? html`<div class="text-[10px] leading-none text-muted">${l.unitName}</div>` : ''}</div>
                        <button class="btn-icon !h-7 !w-7" data-inc="${i}" aria-label="More">${icon('plus', 'w-3.5 h-3.5')}</button>
                        <button class="ms-1 flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold ${lineMode(l) === 'WHOLESALE' && hasWholesale(byId[l.productId]) ? 'border-accent bg-accent text-white' : 'border-line text-muted hover:bg-surface-2'}" data-ws="${i}" aria-pressed="${lineMode(l) === 'WHOLESALE' ? 'true' : 'false'}" title="${lineMode(l) === 'WHOLESALE' ? 'Wholesale price: click for the retail price' : hasWholesale(byId[l.productId]) ? `Retail price: click for the wholesale price (${fmt.money(unitPrice(byId[l.productId], l.unitId, 'WHOLESALE'))})` : 'No wholesale price is saved for this product'}">W</button>
                        <button class="flex h-7 w-7 items-center justify-center rounded-full border border-line text-[10px] font-bold text-muted hover:bg-surface-2" data-w="${i}" title="Sell by amount / weight">Rs</button></div>
                      <div class="w-24 text-right text-sm font-bold tabular-nums">${fmt.money(tt.lines[i].total)}</div>
                      <button class="text-muted hover:text-rose-600" data-rm="${i}" aria-label="Remove item">${icon('trash')}</button></div>
                    <div class="mt-1 flex items-center justify-between"><button class="text-[11px] text-muted hover:text-ink" data-note="${i}">+ Note / discount</button><span class="text-[11px] text-muted">${fmt.money(l.price)} each${lineMode(l) === 'WHOLESALE' && hasWholesale(byId[l.productId]) && !l.custom ? ' · wholesale' : ''}${l.custom ? ' · own price' : ''}${l.lineDiscount ? ` · disc ${fmt.money(l.lineDiscount)}` : ''}${l.note ? ` · ${l.note}` : ''}${cart.customer && lastPrices[`${l.productId}:${l.unitId || ''}`] ? html` · <button class="text-accent" data-lastrate="${i}" title="Use this customer's last rate">last ${fmt.money(lastPrices[`${l.productId}:${l.unitId || ''}`].price)}</button>` : ''}</span></div></div>`)
                : html`<div class="flex h-full min-h-[120px] items-center justify-center text-sm text-muted">${t('Tap a product to begin')}</div>`}
              </div>
              <div class="border-t border-line px-5 py-2.5 space-y-1.5 text-sm">
                <div class="flex justify-between"><span class="text-muted">${t('Subtotal')}</span><span class="tabular-nums">${fmt.money(tt.subtotal)}</span></div>
                <div class="flex items-center justify-between gap-3"><span class="text-muted">${t('Discount')}</span><div class="flex items-center gap-2"><div class="seg !p-0.5" data-seg="dtype"><button data-v="PERCENT" class="${cart.discountType === 'PERCENT' ? 'on' : ''} !h-6 !px-2">%</button><button data-v="AMOUNT" class="${cart.discountType === 'AMOUNT' ? 'on' : ''} !h-6 !px-2">Rs</button></div><input class="input h-8 w-24 text-right" type="number" min="0" step="0.01" placeholder="0" data-disc value="${cart.discountValue}"></div></div>
                <div class="flex justify-between"><button class="flex items-center gap-1 text-muted hover:text-ink" data-taxes>${t('Tax')} ${icon('chevronDown', 'w-3.5 h-3.5')}</button><span class="tabular-nums">${fmt.money(tt.tax)}</span></div>
                <div class="flex items-center justify-between pt-1"><span class="text-xl font-bold text-accent">${t('Total')}</span><span class="text-2xl font-bold text-accent tabular-nums">${fmt.money(tt.total)}</span></div>
              </div>
              <div class="mx-5 rounded-lg bg-surface-2 p-3">
                <div class="mb-2 flex items-center justify-between"><span class="text-sm font-semibold">Payment</span><button class="rounded-full border px-2.5 py-0.5 text-xs font-medium ${cart.split ? 'border-slate-800 bg-slate-800 text-white' : 'border-line bg-surface'}" data-split>${t('Split Payment')}</button></div>
                ${cart.split ? html`<div class="space-y-2">${['CASH', 'CARD', 'BANK'].map(mth => html`<div class="flex items-center gap-2"><span class="w-14 text-sm">${t(mth === 'CASH' ? 'Cash' : mth === 'CARD' ? 'Card' : 'Bank')}</span><input class="input h-9 text-right" type="number" min="0" step="0.01" placeholder="0" data-splitamt="${mth}" value="${cart.splitAmounts[mth]}"></div>`)}</div>`
                : html`${cart.payments.map((p, i) => html`<div class="mb-2 flex items-center gap-2"><select class="input h-9 w-28" data-pmethod="${i}">${['CASH', 'CARD', 'BANK'].map(mth => html`<option value="${mth}" ${p.method === mth ? raw('selected') : ''}>${t(mth === 'CASH' ? 'Cash' : mth === 'CARD' ? 'Card' : 'Bank')}</option>`)}</select><input class="input h-9 text-right" type="number" min="0" step="0.01" placeholder="0" data-pamt="${i}" value="${p.amount}">${i ? html`<button class="btn-icon !h-9 !w-9" data-prm="${i}" aria-label="Remove payment">${icon('x')}</button>` : ''}</div>`)}
                  ${cart.payments.length < 3 ? html`<button class="text-xs text-muted hover:text-ink" data-addpay>+ Add Payment</button>` : ''}`}
              </div>
              <div class="px-5 pt-2 space-y-1 text-sm">
                <div class="flex justify-between"><span class="text-muted">${t('Paid')}</span><span class="tabular-nums">${fmt.money(tt.paid)}</span></div>
                ${has && tt.change > 0 ? html`<div class="flex justify-between font-semibold text-good"><span>${t('Change')}</span><span class="tabular-nums">${fmt.money(tt.change)}</span></div>` : ''}
                ${has && tt.due > 0 ? html`<div class="flex justify-between font-semibold text-orange-600"><span>${credit ? 'Due (Credit (Udhar))' : t('Remaining Balance')}</span><span class="tabular-nums">${fmt.money(tt.due)}</span></div>` : ''}
              </div>
              <div class="flex flex-wrap gap-2 px-5 pt-2">${[['exact', 'Exact'], [50000, 'Rs 500.00'], [100000, 'Rs 1,000.00'], [500000, 'Rs 5,000.00']].map(([v, l]) => html`<button class="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold hover:bg-line" data-tender="${v}">${l}</button>`)}</div>
              <div class="grid grid-cols-[1fr_1fr_2fr] gap-2 px-5 pb-4 pt-3">
                <button class="btn btn-outline h-14" data-hold ${has ? '' : raw('disabled')}>${t('Hold')}</button>
                <button class="btn btn-outline h-14 !whitespace-normal leading-tight" data-estimate ${has ? '' : raw('disabled')}>Print<br>Estimate</button>
                <button class="btn btn-primary h-14 text-base" data-charge ${has && !busy ? '' : raw('disabled')}>${busy ? ui.spinner('w-5 h-5 text-white') : ''}${t('Charge')} ${fmt.money(tt.total)}<span class="kbd ms-1 !bg-white/20 !text-white !border-white/30">F9</span></button>
              </div>`);
            // the price switch above the products shows the same as the bill's (a wholesale customer, W buttons)
            left.querySelectorAll('[data-seg=price] button').forEach(b => b.classList.toggle('on', b.dataset.v === billMode()));
            // the right panel is redrawn on every keystroke in an amount box: drop the old suggestion list first
            if (custAc) { custAc.destroy(); custAc = null; }
            const ci = right.querySelector('[data-cust]');
            if (ci) custAc = ui.autocomplete(ci, {
                search: async qq => (await api.get('/api/pos/customers', { q: qq })).map(c => ({ ...c, label: c.name, sub: `${c.phone || ''} · balance ${fmt.money(c.balance)}${c.creditLimit ? ' · limit ' + fmt.money(c.creditLimit) : ''}` })),
                onPick: c => { cart.customer = c; customerPrices(); drawRight(); refreshProducts(); loadLastPrices(c.id); },
            });
        }
        let custAc = null;
        const draw = () => { drawLeft(); drawRight(); };

        // ── cart actions ──
        function addLine(p, { unitId, qty = 1, serial, price } = {}) {
            unitId = unitId || p.baseUnitId || null;
            const u = (p.altUnits || []).find(x => x.unitId === unitId);
            const factor = u ? Number(u.factor) || 1 : 1;
            const unitName = u ? u.name : p.baseUnit || '';
            if (p.type !== 'SERVICE' && !boot.pos.allowNegativeStock && Calc.q3(p.stock - inCart(p.id) - qty / factor) < 0) { ui.toast(`Not enough stock of "${p.name}".`, 'error'); return; }
            if (p.type !== 'SERVICE' && Calc.q3(p.stock - inCart(p.id) - qty / factor) < 0) ui.toast(`"${p.name}" is out of stock — selling anyway (stock goes negative).`, 'info');
            const same = !serial && cart.lines.find(l => l.productId === p.id && (l.unitId || null) === unitId && !l.weighed && lineMode(l) === cart.priceMode);
            if (same && price === undefined) same.qty = Calc.q3(same.qty + qty);
            else cart.lines.push({ key: uuid(), productId: p.id, name: p.name, variantLabel: p.variantLabel, unitId, unitName, factor, qty: Calc.q3(qty), price: price ?? unitPrice(p, unitId), pm: cart.priceMode, taxRate: p.taxRate, lineDiscount: 0, note: '', serial: serial || '', weighed: price !== undefined || qty % 1 !== 0 });
            // the search box is not redrawn: the cursor stays in it, ready for the next scan
            refreshProducts(); drawRight();
        }
        const focusSearch = () => setTimeout(() => { if (!document.querySelector('#overlay-root .modal, #overlay-root .drawer')) left.querySelector('[data-search]')?.focus(); }, 40);
        let lastPrices = {};
        async function loadLastPrices(id) {
            lastPrices = {};
            try { for (const x of await api.get(`/api/pos/customers/${id}/last-prices`)) lastPrices[`${x.productId}:${x.unitId || ''}`] = x; } catch { }
            drawRight();
        }
        function repriceAll() { for (const l of cart.lines) { const p = byId[l.productId]; if (p && !l.custom) l.price = unitPrice(p, l.unitId, lineMode(l)); } }
        // every line of the bill to one price (auto: chosen because of a wholesale customer, undone when they leave)
        function setAll(mode, auto = false) {
            cart.priceMode = mode; cart.autoMode = auto;
            for (const l of cart.lines) l.pm = mode;
            repriceAll();
        }
        // a WHOLESALE group customer gets wholesale prices; another customer / walk-in goes back to this counter's choice
        function customerPrices() {
            if (cart.customer && cart.customer.group === 'WHOLESALE') { if (cart.priceMode !== 'WHOLESALE' || billMode() !== 'WHOLESALE') setAll('WHOLESALE', true); }
            else if (cart.autoMode) setAll(P.wholesale ? 'WHOLESALE' : 'RETAIL');
        }
        // the W button of a line: this one product at its wholesale price (or back to retail)
        function toggleLineWholesale(i) {
            const l = cart.lines[i], p = byId[l.productId];
            if (!l || !p) return;
            const toW = lineMode(l) !== 'WHOLESALE' || !hasWholesale(p);
            if (toW && !hasWholesale(p)) return ui.toast(`"${p.name}" has no wholesale price yet. Add it under Inventory → Stock & Price Management.`, 'error');
            l.pm = toW ? 'WHOLESALE' : 'RETAIL';
            l.custom = false; // the list price of the chosen kind replaces a typed special price
            l.price = unitPrice(p, l.unitId, l.pm);
            drawRight();
        }

        async function pick(p) {
            const qn = pendingQty; pendingQty = null;
            if (p.type === 'SERIAL') return pickSerial(p);
            if (qn && !p.weighed) return addLine(p, { qty: qn });
            if (p.weighed) return weighDialog(p);
            if ((p.altUnits || []).length) return qtyDialog(p);
            addLine(p);
        }
        // CTN / PCS: one box per unit, the cursor already in the biggest unit's box (the carton). Tab or the arrow keys move
        // between the boxes, Enter adds to the bill (an empty box adds 1) and the cursor goes back to the search box.
        function qtyDialog(p) {
            const units = [{ unitId: p.baseUnitId || '', name: p.baseUnit || 'Unit', factor: 1 }, ...(p.altUnits || []).map(u => ({ unitId: u.unitId, name: u.name, factor: Number(u.factor) || 1 }))];
            const size = u => 1 / (u.factor || 1); // in base units (1 base = factor of this unit)
            const order = [...units].sort((a, b) => size(b) - size(a)); // CTN first, then loose PCS
            const small = order[order.length - 1];
            const per = u => Calc.q3(size(u) / size(small)); // how many of the smallest unit one of this unit holds
            const left2 = p.type === 'SERVICE' ? null : Calc.q3(p.stock - inCart(p.id));
            const m = ui.modal({
                width: order.length > 2 ? 680 : 520, title: p.name, onClose: focusSearch,
                subtitle: `${t('Type the quantity')} · Tab / ← → ${t('switch')} ${order.map(u => u.name).join(' / ')} · Enter ${t('adds to the bill')}${left2 === null ? '' : ` · ${fmt.qty(left2)} ${p.baseUnit || ''} ${t('in stock')}`}`,
                body: html`<div class="grid gap-3 ${order.length > 2 ? 'sm:grid-cols-3' : 'grid-cols-2'}">${order.map((u, k) => html`<label class="block rounded-xl border border-line p-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
                    <span class="flex items-center justify-between gap-2"><span class="text-base font-bold uppercase">${u.name}</span><span class="text-xs text-muted">${fmt.money(unitPrice(p, u.unitId || null))} ${t('each')}</span></span>
                    <input class="input mt-2 h-14 text-2xl font-bold tabular-nums" inputmode="decimal" autocomplete="off" placeholder="0" data-uq="${k}" ${k === 0 ? raw('autofocus') : ''}>
                    <span class="mt-1 block h-4 text-xs text-muted" data-eq="${k}">${u === small ? '' : `1 ${u.name} = ${fmt.qty(per(u))} ${small.name}`}</span></label>`)}</div>`,
                footer: html`<span class="me-auto text-sm font-semibold" data-sum></span><button class="btn btn-outline" data-close>${t('Cancel')}</button><button class="btn btn-primary" data-ok>${t('Add to bill')}<span class="kbd ms-1 !bg-white/20 !text-white !border-white/30">Enter</span></button>`,
            });
            const inputs = [...m.el.querySelectorAll('[data-uq]')];
            const raw2 = i => String(inputs[i].value).trim().replace(',', '.');
            const val = i => { const n = Number(raw2(i)); return raw2(i) && Number.isFinite(n) && n > 0 ? Calc.q3(n) : 0; };
            const update = () => {
                const parts = order.map((u, i) => [u, val(i)]).filter(([, v]) => v);
                order.forEach((u, i) => { if (u !== small) m.el.querySelector(`[data-eq="${i}"]`).textContent = val(i) ? `= ${fmt.qty(Calc.q3(val(i) * per(u)))} ${small.name}` : `1 ${u.name} = ${fmt.qty(per(u))} ${small.name}`; });
                const pcs = Calc.q3(parts.reduce((s, [u, v]) => s + v * per(u), 0));
                const amount = parts.reduce((s, [u, v]) => s + Calc.round(v * unitPrice(p, u.unitId || null)), 0);
                m.el.querySelector('[data-sum]').textContent = parts.length ? `${parts.map(([u, v]) => `${fmt.qty(v)} ${u.name}`).join(' + ')}${parts.length > 1 || parts[0][0] !== small ? ` = ${fmt.qty(pcs)} ${small.name}` : ''} · ${fmt.money(amount)}` : '';
            };
            const done = () => {
                const bad = inputs.findIndex((x, i) => raw2(i) && !(Number(raw2(i)) > 0));
                if (bad >= 0) { inputs[bad].focus(); inputs[bad].select(); return ui.toast(t('Type a quantity such as 2 or 1.5.'), 'error'); }
                let parts = order.map((u, i) => [u, val(i)]).filter(([, v]) => v > 0);
                if (!parts.length) { const i = Math.max(0, inputs.indexOf(document.activeElement)); parts = [[order[i], 1]]; }
                m.close();
                for (const [u, v] of parts) addLine(p, { unitId: u.unitId || null, qty: v });
                focusSearch();
            };
            m.el.addEventListener('input', update);
            m.el.addEventListener('keydown', e => {
                const k = inputs.indexOf(e.target);
                if (e.key === 'Enter') { e.preventDefault(); done(); return; }
                if (k < 0) return;
                const el2 = e.target, atStart = el2.selectionStart === 0 && el2.selectionEnd === 0, atEnd = el2.selectionStart === el2.value.length;
                const step = e.key === 'ArrowDown' || (e.key === 'ArrowRight' && atEnd) ? 1 : e.key === 'ArrowUp' || (e.key === 'ArrowLeft' && atStart) ? -1 : 0;
                if (step) { e.preventDefault(); const n = (k + step + inputs.length) % inputs.length; inputs[n].focus(); inputs[n].select(); }
            });
            m.el.querySelector('[data-ok]').addEventListener('click', done);
            setTimeout(() => { inputs[0].focus(); inputs[0].select(); }, 40);
        }
        async function pickSerial(p) {
            let serials;
            try { serials = await api.get(`/api/inventory/products/${p.id}/serials`); } catch (err) { return ui.fail(err); }
            const used = new Set(cart.lines.filter(l => l.productId === p.id).map(l => l.serial));
            const free = serials.filter(s => !used.has(s.serial));
            if (!free.length) return ui.toast(`No serial of "${p.name}" left in stock.`, 'error');
            const m = ui.modal({ title: p.name, subtitle: 'Pick the serial / IMEI being sold', width: 420, body: html`<input class="input mb-3" placeholder="Search or scan serial" data-sf autofocus><div class="max-h-72 overflow-y-auto thin-scroll space-y-1" data-sl>${free.map(s => html`<button class="block w-full rounded-lg border border-line px-3 py-2 text-left font-mono text-sm hover:bg-surface-2" data-s="${s.serial}">${s.serial}</button>`)}</div>` });
            m.el.addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) { m.close(); addLine(p, { serial: b.dataset.s }); focusSearch(); } });
            m.el.querySelector('[data-sf]').addEventListener('input', e => m.el.querySelectorAll('[data-s]').forEach(b => b.classList.toggle('hidden', !b.dataset.s.toLowerCase().includes(e.target.value.toLowerCase()))));
            m.el.querySelector('[data-sf]').addEventListener('keydown', e => { if (e.key === 'Enter') { const hit = free.find(s => s.serial.toLowerCase() === e.target.value.trim().toLowerCase()); if (hit) { m.close(); addLine(p, { serial: hit.serial }); focusSearch(); } } });
        }
        // Weighed sale @ price / unit: type the amount → quantity is worked out (or type the quantity)
        function weighDialog(p, line) {
            const units = [{ unitId: p.baseUnitId || '', name: p.baseUnit || 'unit', factor: 1, label: `${p.baseUnit || 'Unit'} (base)` }, ...(p.altUnits || []).map(u => ({ unitId: u.unitId, name: u.name, factor: u.factor, label: `${u.name} (1 ${p.baseUnit || 'base'} = ${u.factor} ${u.name})` }))];
            let unitId = line ? line.unitId || '' : units[0].unitId;
            const priceOf = uid => unitPrice(p, uid || null, line ? lineMode(line) : cart.priceMode);
            const m = ui.modal({
                width: 680, title: p.name, subtitle: `Weighed sale @ ${fmt.money(basePrice(p, line ? lineMode(line) : cart.priceMode), { noSym: true })} / ${p.baseUnit || 'unit'}`,
                headerExtra: html`<div><div class="eyebrow mb-1">SELECT UNIT</div><select class="input h-9 w-56" data-u>${units.map(u => html`<option value="${u.unitId}" ${u.unitId === unitId ? raw('selected') : ''}>${u.label}</option>`)}</select></div>`,
                body: html`<div class="grid grid-cols-2 gap-4"><div><div class="eyebrow mb-1">TOTAL AMOUNT (RS)</div><input class="input h-16 text-2xl" type="number" min="0" step="0.01" placeholder="0" data-amt autofocus></div>
                  <div><div class="eyebrow mb-1" data-ql>QUANTITY (${(units.find(u => u.unitId === unitId) || units[0]).name.toUpperCase()})</div><input class="input h-16 text-2xl" type="number" min="0" step="any" placeholder="0" data-qty value="${line ? line.qty : ''}"></div></div>`,
                footer: html`<span class="me-auto text-sm text-muted">Quantity auto-calculated</span><b class="me-4 text-sm" data-lt>Line total: ${fmt.money(0, { whole: true })}</b><button class="btn btn-outline" data-close>${t('Cancel')}</button><button class="btn btn-primary" data-ok disabled>${line ? 'Update' : 'Add to cart'}</button>`,
            });
            const amt = m.el.querySelector('[data-amt]'), qty = m.el.querySelector('[data-qty]'), lt = m.el.querySelector('[data-lt]'), ok = m.el.querySelector('[data-ok]');
            const sync = from => {
                const price = priceOf(unitId);
                if (from === 'amt') { const a = fmt.toPaisa(amt.value); qty.value = price ? Calc.q3(a / price) || '' : ''; }
                else if (from === 'qty') { amt.value = qty.value ? (Calc.round(Number(qty.value) * price) / 100).toFixed(2) : ''; }
                const total = amt.value ? fmt.toPaisa(amt.value) : Calc.round((Number(qty.value) || 0) * price);
                lt.textContent = `Line total: ${fmt.money(total, { whole: total % 100 === 0 })}`;
                ok.disabled = !(Number(qty.value) > 0);
            };
            if (line) sync('qty');
            amt.addEventListener('input', () => sync('amt'));
            qty.addEventListener('input', () => sync('qty'));
            m.el.querySelector('[data-u]').addEventListener('change', e => { unitId = e.target.value; m.el.querySelector('[data-ql]').textContent = `QUANTITY (${(units.find(u => u.unitId === unitId) || units[0]).name.toUpperCase()})`; sync(amt.value ? 'amt' : 'qty'); });
            const done = () => {
                const qv = Calc.q3(Number(qty.value) || 0);
                if (!(qv > 0)) return;
                const price = priceOf(unitId);
                // when an amount was typed, keep that exact amount as the line total (price per unit adjusted to the paisa)
                const a = amt.value ? fmt.toPaisa(amt.value) : null;
                const exactPrice = a !== null && Calc.round(qv * price) !== a ? a / qv : price;
                if (line) { Object.assign(line, { unitId: unitId || null, qty: qv, price: Math.round(exactPrice * 10000) / 10000, factor: (units.find(u => u.unitId === unitId) || units[0]).factor, unitName: (units.find(u => u.unitId === unitId) || units[0]).name, weighed: true }); draw(); }
                else addLine(p, { unitId: unitId || null, qty: qv, price: Math.round(exactPrice * 10000) / 10000 });
                m.close();
                focusSearch();
            };
            ok.addEventListener('click', done);
            m.el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
        }
        function lineNote(i) {
            const l = cart.lines[i];
            ui.formDrawer({ title: l.name, subtitle: 'Line note and discount', submit: 'Apply',
                body: ui.grid(ui.field({ label: 'Unit price', name: 'price', money: true, value: Math.round(l.price), help: 'Change only for a special price.' }), ui.field({ label: 'Line discount (Rs)', name: 'lineDiscount', money: true, value: l.lineDiscount }), ui.field({ label: 'Note (printed)', name: 'note', value: l.note })),
                onSubmit(v, d) { if (v.price !== Math.round(l.price)) { l.price = v.price; l.custom = true; } l.lineDiscount = v.lineDiscount; l.note = v.note; d.close(); drawRight(); } });
        }

        // ── charge ──
        async function charge() {
            if (busy || !cart.lines.length) return;
            const tt = totals();
            if (cart.mode === 'CREDIT' && !cart.customer) { ui.toast('Choose the credit (udhar) customer first (F2).', 'error'); right.querySelector('[data-cust]')?.focus(); return; }
            if (cart.mode === 'WALKIN' && tt.due > 0) {
                // nothing typed: a walk-in sale is taken as exact cash
                if (!tt.tendered && !cart.split) { cart.payments = [{ method: 'CASH', amount: (tt.total / 100).toFixed(2) }]; }
                else { ui.toast(`${t('Remaining Balance')} ${fmt.money(tt.due)}: take the full amount, or switch to Credit (Udhar).`, 'error'); return; }
            }
            const t2 = totals();
            const body = {
                clientId: cart.clientId, mode: cart.mode, priceMode: billMode() === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL', customerId: cart.customer ? cart.customer.id : null, customerName: cart.customerName,
                items: cart.lines.map(l => ({ productId: l.productId, unitId: l.unitId, qty: l.qty, priceMode: lineMode(l), price: l.custom || l.weighed ? Math.round(l.price * 10000) / 10000 : undefined, lineDiscount: l.lineDiscount || 0, serial: l.serial, note: l.note })),
                discountType: cart.discountType, discountValue: cart.discountType === 'PERCENT' ? Number(cart.discountValue) || 0 : fmt.toPaisa(cart.discountValue),
                payments: t2.pays.filter(p => p.amount > 0),
            };
            busy = true; drawRight();
            try {
                let sale;
                try { sale = await api.post('/api/pos/sales', body); }
                catch (e) {
                    if (e.data && e.data.code === 'CREDIT_LIMIT' && boot.canOverrideLimit && await ui.confirm({ title: 'Over the credit limit', message: e.message + ' Sell anyway?', ok: 'Sell anyway' })) sale = await api.post('/api/pos/sales', { ...body, overrideLimit: true });
                    else throw e;
                }
                for (const it of sale.items) if (byId[it.productId] && byId[it.productId].type !== 'SERVICE') byId[it.productId].stock = Calc.q3(byId[it.productId].stock - it.baseQty);
                const lastCustomerPhone = cart.customer ? cart.customer.phone : '';
                cart = fresh(); lastPrices = {};
                busy = false; draw();
                if (sale.customerId) { try { const full = await api.get('/api/pos/sales/' + sale.id); sale.customerBalance = full.customerBalance; } catch { } }
                if (boot.receipt.autoPrint) HP.receipt.printSale(sale);
                HP.receipt.preview(sale, { phone: lastCustomerPhone, title: `${sale.number} · ${fmt.money(sale.total)}${sale.change ? ` · change ${fmt.money(sale.change)}` : ''}`, onNew: () => left.querySelector('[data-search]')?.focus() });
            } catch (e) { busy = false; drawRight(); ui.fail(e); }
        }

        async function hold() {
            if (busy || !cart.lines.length) return; // not while the same cart is being charged
            const tt = totals();
            try {
                await api.post('/api/pos/held', { label: cart.customer ? cart.customer.name : cart.customerName !== 'Walk-in Customer' ? cart.customerName : `Held ${fmt.time(new Date())}`, total: tt.total, cart });
                cart = fresh(); draw(); ui.toast('Sale held');
            } catch (e) { ui.fail(e); }
        }
        async function heldDrawer() {
            let list;
            try { list = await api.get('/api/pos/held'); } catch (err) { return ui.fail(err); }
            const d = ui.drawer({ title: 'Held Sales', body: html`<div class="eyebrow mb-3">SERVER HELD (${list.length})</div>${list.length ? html`<div class="space-y-2">${list.map(h => html`<div class="flex items-center gap-3 rounded-xl border border-line p-3"><div class="min-w-0 flex-1"><div class="font-medium truncate">${h.label || 'Held sale'}</div><div class="text-xs text-muted">${fmt.dateTime(h.createdAt)} · ${h.userName} · ${(h.cart.lines || []).length} items</div></div><div class="font-semibold">${fmt.money(h.total)}</div><button class="btn btn-sm btn-primary" data-resume="${h.id}">Resume</button><button class="btn-icon !h-8 !w-8" data-delheld="${h.id}" aria-label="Delete">${icon('trash')}</button></div>`)}</div>` : html`<div class="py-16 text-center text-sm text-muted">No held sales</div>`}` });
            d.el.addEventListener('click', async e => {
                const r = e.target.closest('[data-resume]'), x = e.target.closest('[data-delheld]');
                if (r) {
                    if (cart.lines.length && !(await ui.confirm({ title: 'Replace the current cart?', message: 'The cart on screen will be cleared.', ok: 'Resume held sale' }))) return;
                    const h = list.find(z => z.id === r.dataset.resume);
                    try { await api.del('/api/pos/held/' + h.id); cart = normalize({ ...fresh(), priceMode: undefined, ...h.cart, clientId: uuid() }); repriceAll(); d.close(); draw(); if (cart.customer) loadLastPrices(cart.customer.id); } catch (err) { ui.fail(err); }
                }
                if (x) {
                    if (!(await ui.confirm({ title: 'Delete this held sale?', message: 'Its items are thrown away. This cannot be undone.', ok: 'Delete', danger: true }))) return;
                    try { await api.del('/api/pos/held/' + x.dataset.delheld); d.close(); heldDrawer(); } catch (err) { ui.fail(err); }
                }
            });
        }
        function estimate() {
            if (!cart.lines.length) return;
            const tt = totals();
            const sale = { number: 'ESTIMATE', date: new Date(), customerName: cart.customer ? cart.customer.name : cart.customerName, items: cart.lines.map((l, i) => ({ name: l.name, qty: l.qty, unitName: l.unitName, price: Math.round(l.price), mrp: Math.round(l.price), total: tt.lines[i].total, serial: l.serial })), subtotal: tt.subtotal, discount: tt.discount, tax: tt.tax, total: tt.total, payments: [] };
            HP.receipt.printSale(sale, { estimate: true });
        }
        function newCustomer() {
            ui.formDrawer({ title: 'Add Credit Customer', subtitle: 'Quick add — full details under Parties → Customers', submit: 'Add customer',
                body: ui.grid(ui.field({ label: 'Name', name: 'name', required: true }), ui.field({ label: 'Phone', name: 'phone', half: true }), ui.field({ label: 'Credit Limit', name: 'creditLimit', money: true, half: true, help: 'Set to 0 for unlimited credit' }), ui.field({ label: 'Customer Group', name: 'group', type: 'select', options: [['RETAIL', 'Retail'], ['WHOLESALE', 'Wholesale'], ['VIP', 'VIP']] })),
                async onSubmit(v, d) { const c = await api.post('/api/pos/customers', v); cart.customer = c; cart.mode = 'CREDIT'; d.close(); customerPrices(); draw(); ui.toast('Customer added'); } });
        }
        function posSettings() {
            const d = ui.drawer({ title: 'POS settings', subtitle: 'Saved on this device',
                body: html`<div class="grid grid-cols-12 gap-3">${ui.field({ name: 'wholesale', label: 'Wholesale Mode', help: 'Sell at wholesale prices (where a product has one). Wholesale customers always get them.', type: 'switch', value: P.wholesale })}${ui.field({ name: 'retail', label: 'Start in Retail / Barcode view', type: 'switch', value: P.view === 'RETAIL' })}</div>
                  <div class="mt-6 rounded-xl bg-surface-2 p-4 text-sm"><div class="font-semibold mb-1">Active taxes</div>${boot.taxes.length ? boot.taxes.map(x => html`<div class="flex justify-between"><span>${x.name}${x.combine ? ' (compound)' : ''}</span><span>${x.rate}%</span></div>`) : html`<span class="text-muted">No taxes configured.</span>`}<div class="mt-2 text-xs text-muted">Receipt layout, auto-print and copies: Administration → Settings → Receipt & POS.</div></div>` });
            d.el.addEventListener('change', () => { const v = ui.readForm(d.el); const was = P.wholesale; P.wholesale = v.wholesale; P.view = v.retail ? 'RETAIL' : 'VISUAL'; savePrefs(P); if (was !== P.wholesale) setAll(P.wholesale ? 'WHOLESALE' : 'RETAIL'); draw(); });
        }
        function taxesPopover(anchor) {
            ui.menu(anchor, boot.taxes.length ? boot.taxes.map(x => ({ label: `${x.name} — ${x.rate}%${x.combine ? ' (compound)' : ''}`, iconName: 'percent', onClick() { } })) : [{ label: 'No taxes configured. Add them in Finance → Taxes & Duties.', iconName: 'info', onClick() { } }]);
        }

        // barcode / search: Enter adds an exact code match, else the single result
        let pendingQty = null;
        const QTY = /^\s*(\d+(?:\.\d+)?)\s*[*xX×]\s*(.*)$/;
        function scan(code, fromBox) {
            const mq = String(code || '').match(QTY);
            if (mq) {
                pendingQty = Number(mq[1]);
                if (!mq[2].trim()) { ui.toast(`Next item × ${pendingQty}`, 'info'); return true; }
                code = mq[2];
            }
            const c = String(code || '').trim().toLowerCase();
            if (!c) return false;
            const hit = catalog.find(p => (p.barcode && p.barcode.toLowerCase() === c) || (p.sku && p.sku.toLowerCase() === c));
            if (hit) { pick(hit); return true; }
            const list = filtered();
            if (list.length === 1) { pick(list[0]); return true; }
            // several products match what was typed: the first is picked out; ↓ ↑ choose another, Enter adds it
            if (fromBox && list.length > 1) {
                pendingQty = null; // Enter on the picked one reads the "24*" from the box again
                hi = 0; refreshProducts();
                ui.toast(`${list.length} ${t('products match: choose with ↓ ↑ and press Enter')}`, 'info');
                return false;
            }
            // nothing added: a "24*" typed with an unknown code must not carry over to the next product tapped
            pendingQty = null;
            if (Perms.has(HP.session, 'inventory.add') && HP.inventory && /^[A-Za-z0-9\-]{4,}$/.test(String(code).trim())) {
                ui.confirm({ title: `No product with code "${code}"`, message: 'Add it as a new product now? The barcode is filled in for you.', ok: 'Add product' }).then(yes => {
                    if (yes) HP.inventory.productDrawer(null, async () => { const fresh = await api.get('/api/inventory/catalog'); catalog.length = 0; catalog.push(...fresh); for (const p of fresh) byId[p.id] = p; const hit2 = fresh.find(p => p.barcode === String(code).trim()); draw(); if (hit2) pick(hit2); }, { barcode: String(code).trim() });
                });
            } else ui.toast(`No product with code "${code}".`, 'error');
            return false;
        }

        // ── events ──
        el.addEventListener('click', async e => {
            const b = e.target.closest('button, [data-add]');
            if (!b) return;
            const d = b.dataset;
            if (d.add) return pick(byId[d.add]);
            if (d.cat) { cat = d.cat; drawLeft(); return; }
            if (b.closest('[data-camscan]')) { HP.native.scan().then(code => { if (code && scan(code)) refreshProducts(); }).catch(err => ui.fail(err)); return; }
            if (b.closest('[data-seg=view]') && d.v) { P.view = d.v; savePrefs(P); drawLeft(); return; }
            if (b.closest('[data-seg=price]') && d.v) { P.wholesale = d.v === 'WHOLESALE'; savePrefs(P); setAll(d.v); draw(); ui.toast(d.v === 'WHOLESALE' ? t('Wholesale prices for every item of this bill') : t('Retail prices for every item of this bill'), 'info'); return; }
            if (d.recvcust !== undefined && cart.customer) return HP.khata.receiveDialog(cart.customer, r => { cart.customer.balance = r.balance; drawRight(); });
            if (d.promcust !== undefined && cart.customer) return HP.khata.promiseDialog(cart.customer, () => ui.toast('Promise saved'));
            if (b.closest('[data-seg=mode]') && d.v) { cart.mode = d.v; if (d.v === 'WALKIN') { cart.customer = null; customerPrices(); refreshProducts(); } drawRight(); if (d.v === 'CREDIT') right.querySelector('[data-cust]')?.focus(); return; }
            if (b.closest('[data-seg=dtype]') && d.v) { cart.discountType = d.v; drawRight(); return; }
            if (d.held !== undefined) return heldDrawer();
            if (d.inc !== undefined) { const l = cart.lines[+d.inc]; if (l.serial) return; l.qty = Calc.q3(l.qty + 1); draw(); return; }
            if (d.dec !== undefined) { const l = cart.lines[+d.dec]; if (l.qty > 1) l.qty = Calc.q3(l.qty - 1); else cart.lines.splice(+d.dec, 1); draw(); return; }
            if (d.rm !== undefined) { cart.lines.splice(+d.rm, 1); draw(); return; }
            if (d.ws !== undefined) return toggleLineWholesale(+d.ws);
            if (d.w !== undefined) { const l = cart.lines[+d.w]; if (!l.serial && byId[l.productId]) weighDialog(byId[l.productId], l); return; }
            if (d.note !== undefined) return lineNote(+d.note);
            if (d.lastrate !== undefined) { const l = cart.lines[+d.lastrate]; const lp = lastPrices[`${l.productId}:${l.unitId || ''}`]; if (lp) { l.price = lp.price; l.custom = true; drawRight(); } return; }
            if (d.split !== undefined) { cart.split = !cart.split; drawRight(); return; }
            if (d.addpay !== undefined) { cart.payments.push({ method: cart.payments.some(p => p.method === 'CARD') ? 'BANK' : 'CARD', amount: '' }); drawRight(); return; }
            if (d.prm !== undefined) { cart.payments.splice(+d.prm, 1); drawRight(); return; }
            if (d.tender !== undefined) {
                const tt = totals();
                // Exact = what is still to pay after the card / bank amounts already typed (no change to give back)
                const others = cart.split ? fmt.toPaisa(cart.splitAmounts.CARD) + fmt.toPaisa(cart.splitAmounts.BANK) : cart.payments.slice(1).reduce((s, x) => s + fmt.toPaisa(x.amount), 0);
                const v = d.tender === 'exact' ? Math.max(tt.total - others, 0) : Number(d.tender);
                if (cart.split) cart.splitAmounts.CASH = (v / 100).toFixed(2); else cart.payments[0] = { method: 'CASH', amount: (v / 100).toFixed(2) };
                drawRight(); return;
            }
            if (d.charge !== undefined) return charge();
            if (d.hold !== undefined) return hold();
            if (d.estimate !== undefined) return estimate();
            if (d.clear !== undefined) { if (await ui.confirm({ title: 'Clear the cart?', ok: 'Clear', danger: true })) { cart = fresh(); draw(); } return; }
            if (d.newcust !== undefined) return newCustomer();
            if (d.settings !== undefined) return posSettings();
            if (d.taxes !== undefined) return taxesPopover(b);
        });
        el.addEventListener('input', e => {
            const d = e.target.dataset;
            if (d.search !== undefined) { q = e.target.value.replace(/^\s*\d+(\.\d+)?\s*[*xX×]\s*/, ''); hi = -1; refreshProducts(); return; }
            if (d.cname !== undefined) { cart.customerName = e.target.value; return; }
            if (d.disc !== undefined) { cart.discountValue = e.target.value; updateTotalsOnly(); return; }
            if (d.pamt !== undefined) { cart.payments[+d.pamt].amount = e.target.value; updateTotalsOnly(); return; }
            if (d.splitamt !== undefined) { cart.splitAmounts[d.splitamt] = e.target.value; updateTotalsOnly(); }
        });
        el.addEventListener('change', e => { if (e.target.dataset.pmethod !== undefined) { cart.payments[+e.target.dataset.pmethod].method = e.target.value; drawRight(); } });
        // search box: ↓ ↑ walk through the results, Enter adds the one picked (or the scanned / typed code), Esc clears
        el.addEventListener('keydown', e => {
            if (!e.target.matches('[data-search]')) return;
            const box = e.target;
            const clear = () => { q = ''; hi = -1; box.value = ''; refreshProducts(); };
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                const list = filtered();
                if (!list.length) return;
                e.preventDefault();
                hi = hi < 0 ? 0 : Math.max(0, Math.min(list.length - 1, hi + (e.key === 'ArrowDown' ? 1 : -1)));
                refreshProducts();
                left.querySelector('[data-hi]')?.scrollIntoView({ block: 'nearest' });
                return;
            }
            if (e.key === 'Escape') { pendingQty = null; if (q || hi >= 0) { e.preventDefault(); clear(); } return; }
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const list = filtered();
            if (hi >= 0 && list[hi]) {
                const mq = box.value.match(QTY);
                pendingQty = mq ? Number(mq[1]) : null;
                const p = list[hi];
                clear(); pick(p); return;
            }
            if (scan(box.value, true)) clear();
        });
        // re-render the right panel while typing amounts without losing the cursor
        function updateTotalsOnly() {
            const focus = document.activeElement;
            const key = focus && Object.keys(focus.dataset || {})[0], val = focus && focus.dataset[key];
            const pos = focus && focus.selectionStart;
            drawRight();
            if (key) { const again = right.querySelector(`[data-${key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${val}"]`) || right.querySelector(`[data-${key}]`); if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch { } } }
        }
        // keyboard: F1 search, F2 customer, F9 charge; a hardware scanner typing fast anywhere adds the product
        let buf = '', last = 0;
        const onKey = e => {
            if (!document.body.contains(el)) return;
            // a window (customer form, weighing, receipt …) is open: F1 / F2 / F9 must not act on the sale behind it
            if (['F1', 'F2', 'F9'].includes(e.key) && document.querySelector('#overlay-root .modal, #overlay-root .drawer')) { e.preventDefault(); return; }
            if (e.key === 'F1') { e.preventDefault(); left.querySelector('[data-search]')?.focus(); return; }
            if (e.key === 'F2') { e.preventDefault(); if (cart.mode !== 'CREDIT') { cart.mode = 'CREDIT'; drawRight(); } right.querySelector('[data-cust]')?.focus(); return; }
            if (e.key === 'F9') { e.preventDefault(); charge(); return; }
            const typing = e.target.matches('input, textarea, select');
            if (typing || document.querySelector('#overlay-root .modal, #overlay-root .drawer')) return;
            const now = Date.now();
            if (e.key === 'Enter') { if (buf.length >= 4 && now - last < 80) { e.preventDefault(); scan(buf); } buf = ''; return; }
            if (e.key.length === 1) { buf = now - last > 80 ? e.key : buf + e.key; last = now; }
        };
        document.addEventListener('keydown', onKey);
        draw();
        if (cart.customer) loadLastPrices(cart.customer.id);
        setTimeout(() => left.querySelector('[data-search]')?.focus(), 50);
        return () => { document.removeEventListener('keydown', onKey); if (seen) seen.disconnect(); if (custAc) custAc.destroy(); posDraft = cart.lines.length ? cart : null; };
    },
});
