// Quick search (Ctrl+K or the search button in the top bar): jump to any screen, customer khata, product or invoice.
// Also "?" opens the keyboard shortcuts.
(function () {
    'use strict';
    const { html, icon, api, ui } = HP;
    let open = null;

    function pages() {
        const out = [];
        for (const n of HP.shell.NAV) {
            if (n.href && HP.shell.can(n.perm)) out.push({ label: HP.t(n.label), sub: 'Page', href: n.href, iconName: n.iconName });
            for (const i of n.items || []) if (HP.shell.can(i[2])) out.push({ label: HP.t(i[0]), sub: HP.t(n.group), href: i[1], iconName: n.iconName });
        }
        return out;
    }

    async function show() {
        if (open || !HP.session || !HP.session.tenantId) return;
        const pg = pages();
        let results = [], active = 0, seq = 0;
        const m = ui.modal({ width: 640, body: html`<div class="relative"><span class="absolute inset-y-0 start-3 flex items-center text-muted">${icon('search')}</span>
            <input class="input h-12 ps-10 text-base" placeholder="Search screens, customers, products, invoice number…" data-pq autofocus></div>
            <div class="mt-3 max-h-[55vh] overflow-y-auto thin-scroll" data-pr></div>
            <div class="mt-3 flex flex-wrap gap-3 text-[11px] text-muted"><span><span class="kbd">↑↓</span> move</span><span><span class="kbd">Enter</span> open</span><span><span class="kbd">Esc</span> close</span><span><span class="kbd">Ctrl K</span> quick search</span><span><span class="kbd">?</span> shortcuts</span></div>`,
            onClose: () => { open = null; } });
        open = m;
        const box = m.el.querySelector('[data-pr]'), input = m.el.querySelector('[data-pq]');
        const draw = () => {
            box.innerHTML = String(results.length ? html`${results.map((r, i) => html`<button class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${i === active ? 'bg-accent-soft' : 'hover:bg-surface-2'}" data-i="${i}">
                <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-muted">${icon(r.iconName || 'arrowRight')}</span>
                <span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium">${r.label}</span><span class="block truncate text-xs text-muted">${r.sub || ''}</span></span>${r.right ? html`<span class="text-sm font-semibold">${r.right}</span>` : ''}</button>`)}` : html`<div class="py-10 text-center text-sm text-muted">Nothing found</div>`);
        };
        const go = r => { if (!r) return; m.close(); if (r.href) HP.router.navigate(r.href); if (r.run) r.run(); };
        const search = async () => {
            const q = input.value.trim().toLowerCase(), my = ++seq;
            const list = pg.filter(p => !q || p.label.toLowerCase().includes(q) || p.href.includes(q)).slice(0, q ? 8 : 12);
            results = list; active = 0; draw();
            if (q.length < 2) return;
            const more = [];
            const can = k => Perms.has(HP.session, k);
            await Promise.all([
                (can('sales.create') || can('parties.manage')) && api.get('/api/pos/customers', { q }).then(cs => cs.slice(0, 6).forEach(c => more.push({ label: c.name, sub: `Customer · ${c.phone || ''}`, right: c.balance ? HP.fmt.money(c.balance) : '', href: '/khata/c/' + c.id, iconName: 'user' }))).catch(() => {}),
                (can('inventory.add') || can('inventory.edit') || can('sales.create')) && api.get('/api/inventory/products', { q }).then(ps => ps.slice(0, 6).forEach(p => more.push({ label: p.name, sub: `Product · ${p.sku || p.barcode || ''} · stock ${HP.fmt.qty(p.stock)}`, right: HP.fmt.money(p.retailPrice), href: can('inventory.edit') ? '/products' : '/pos', iconName: 'package' }))).catch(() => {}),
                can('sales.view') && /\d/.test(q) && api.get('/api/pos/sales/lookup', { code: input.value.trim() }).then(s => more.push({ label: s.number, sub: `Invoice · ${s.customerName} · ${HP.fmt.dateTime(s.date)}`, right: HP.fmt.money(s.total), iconName: 'receipt', run: () => HP.receipt.preview(s) })).catch(() => {}),
            ].filter(Boolean));
            if (my !== seq) return;
            results = [...list, ...more]; draw();
        };
        input.addEventListener('input', search);
        input.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown') { active = Math.min(active + 1, results.length - 1); draw(); e.preventDefault(); }
            if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); draw(); e.preventDefault(); }
            if (e.key === 'Enter') { go(results[active]); e.preventDefault(); }
        });
        box.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) go(results[+b.dataset.i]); });
        search();
    }

    function shortcuts() {
        ui.modal({ title: 'Keyboard shortcuts', width: 480, body: html`<table class="tbl"><tbody>${[
            ['Ctrl + K', 'Quick search: screens, customers, products, invoices'], ['?', 'This list'], ['F1', 'POS: search / scan box'], ['F2', 'POS: choose credit (udhaar) customer'],
            ['F9', 'POS: charge the sale'], ['24*code', 'POS: add 24 of an item (type 24* then scan)'], ['Esc', 'Close a window'], ['Enter', 'POS search: add the scanned / only match'],
        ].map(([k, d]) => html`<tr><td class="whitespace-nowrap"><span class="kbd">${k}</span></td><td>${d}</td></tr>`)}</tbody></table>` });
    }

    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); show(); return; }
        if (e.key === '?' && !e.target.matches('input, textarea, select') && !document.querySelector('#overlay-root .modal')) { e.preventDefault(); shortcuts(); }
    });
    HP.palette = { show, shortcuts };
})();
