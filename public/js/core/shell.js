// The frame around every page: sidebar (menu as in the reference), top bar (shop name, online pill, English/اردو,
// night mode, theme palette), the workspace banner for the super admin, and the user card.
(function () {
    'use strict';
    const { html, icon, t, cls } = HP;

    const NAV = [
        { label: 'Dashboard', href: '/dashboard', iconName: 'grid', perm: 'reports.view' },
        { label: 'POS Terminal', href: '/pos', iconName: 'cart', perm: 'sales.create' },
        { divider: true },
        { group: 'Sales', iconName: 'trending', items: [['Sales', '/sales', 'sales.view'], ['Sales Return', '/sales-return', 'sales.delete']] },
        { group: 'Purchasing', iconName: 'bag', items: [['Purchases', '/purchases', 'purchases.manage'], ['Purchase Return', '/purchase-return', 'purchases.manage']] },
        { group: 'Inventory', iconName: 'box', items: [['Products', '/products', ['inventory.add', 'inventory.edit']], ['Categories', '/categories', ['inventory.add', 'inventory.edit']], ['Brands / Companies', '/brands', ['inventory.add', 'inventory.edit']], ['Units', '/inventory/units', ['inventory.add', 'inventory.edit']], ['Colors', '/inventory/colors', ['inventory.add', 'inventory.edit']], ['Sizes', '/inventory/sizes', ['inventory.add', 'inventory.edit']], ['Print Barcodes', '/inventory/barcodes', ['inventory.add', 'inventory.edit']]] },
        { group: 'Khata (Udhaar)', iconName: 'handCoins', items: [['Khata Book', '/khata', ['parties.manage', 'sales.create', 'finance.manage']], ['Promises & Reminders', '/khata/reminders', ['parties.manage', 'finance.manage', 'sales.create']], ['Day Close', '/day-close', ['sales.create', 'finance.manage']]] },
        { group: 'Parties', iconName: 'users', items: [['Customers', '/customers', 'parties.manage'], ['Vendors', '/vendors', 'parties.manage']] },
        { group: 'Reports', iconName: 'chart', items: [['Reports', '/reports', 'reports.view'], ['Profit & Loss', '/reports/profit-loss', 'reports.view'], ['Product Performance', '/reports/product-performance', 'reports.view'], ['Reminders', '/reminders', 'reports.view']] },
        { group: 'HRM & PAYROLL', iconName: 'users', special: true, items: [['HR Dashboard', '/hrm/dashboard', 'hrm.manage', 'grid'], ['Employees', '/hrm/employees', 'hrm.manage', 'users'], ['Attendance & Shifts', '/hrm/attendance', 'hrm.manage', 'clock'], ['Leave Management', '/hrm/leaves', 'hrm.manage', 'calendar'], ['Payroll & Advances', '/hrm/payroll', 'hrm.manage', 'dollar'], ['Recruitment', '/hrm/recruitment', 'hrm.manage', 'briefcase'], ['Performance & Assets', '/hrm/performance', 'hrm.manage', 'star']] },
        { group: 'Finance', iconName: 'wallet', items: [['Payments In/Out', '/payments', 'finance.manage'], ['Capital & Equity', '/finance/capital', 'finance.manage'], ['Banks & Cash', '/banks', 'finance.manage'], ['Cheques', '/cheques', 'finance.manage'], ['Expenses', '/expenses', 'finance.manage'], ['Taxes & Duties', '/finance/taxes', 'finance.manage']] },
        { group: 'Administration', iconName: 'settings', items: [['Users', '/users', 'settings.manage'], ['Settings', '/settings', 'settings.manage'], ['Database Backups', '/administration/backups', 'settings.manage']] },
    ];
    const ADMIN_NAV = [
        { label: 'Dashboard', href: '/admin', iconName: 'grid' },
        { label: 'Clients', href: '/admin/clients', iconName: 'building' },
        { label: 'Activity Log', href: '/admin/activity', iconName: 'activity' },
    ];
    const can = p => !p || [].concat(p).some(k => Perms.has(HP.session, k));
    const isSuperView = () => HP.session.role === 'SUPER_ADMIN' && !HP.session.impersonatedBy;

    const PALETTES = [['#83837d', 'Stone'], ['#4f46e5', 'Indigo'], ['#0f766e', 'Teal'], ['#b45309', 'Amber'], ['#be123c', 'Rose'], ['#1f2937', 'Graphite']];
    function applyTheme() {
        const dark = localStorage.getItem('hp.dark') === '1';
        document.documentElement.classList.toggle('dark', dark);
        const p = localStorage.getItem('hp.palette');
        if (p) { document.documentElement.style.setProperty('--color-primary', p); document.documentElement.style.setProperty('--color-primary-hover', p); }
    }
    applyTheme();

    const openGroups = () => { try { return JSON.parse(localStorage.getItem('hp.navOpen') || '[]'); } catch { return []; } };
    let framed = false, mobileOpen = false;

    function sidebar(path) {
        const s = HP.session;
        let body;
        if (isSuperView()) {
            body = ADMIN_NAV.map(n => html`<a href="${n.href}" data-link class="${cls('nav-item', { on: path === n.href || (n.href !== '/admin' && path.startsWith(n.href)) })}">${icon(n.iconName)}<span>${t(n.label)}</span></a>`);
        } else {
            const open = openGroups();
            body = NAV.map(n => {
                if (n.divider) return html`<div class="my-2 border-t border-line"></div>`;
                if (n.href) return can(n.perm) ? html`<a href="${n.href}" data-link class="${cls('nav-item', { on: path === n.href })}">${icon(n.iconName)}<span>${t(n.label)}</span></a>` : '';
                const items = n.items.filter(i => can(i[2]));
                if (!items.length) return '';
                const active = items.some(i => path === i[1] || path.startsWith(i[1] + '/'));
                const isOpen = active || open.includes(n.group);
                return html`<div class="${cls(n.special && 'my-1 rounded-xl border border-indigo-100 bg-linear-to-b from-indigo-50/60 to-emerald-50/40 dark:border-indigo-950 dark:from-indigo-950/30 dark:to-transparent')}">
                  <button type="button" class="nav-group ${n.special ? 'text-accent uppercase !text-[13px]' : ''}" data-group="${n.group}">${icon(n.iconName)}<span class="flex-1 text-start">${t(n.group)}</span>${icon(isOpen ? 'chevronUp' : 'chevronDown', 'w-4 h-4 text-muted')}</button>
                  ${isOpen ? html`<div class="pb-1">${items.map(i => html`<a href="${i[1]}" data-link class="${cls('nav-sub', { on: path === i[1] })}">${i[3] ? icon(i[3], 'w-4 h-4') : html`<span class="w-4"></span>`}<span>${t(i[0])}</span></a>`)}</div>` : ''}
                </div>`;
            });
        }
        const brand = s.tenant ? s.tenant.name : 'HisabPro';
        const logo = s.settings && s.settings.company && s.settings.company.logo;
        return html`<div class="flex h-16 items-center gap-3 border-b border-line px-5">
            <img src="${logo || '/img/logo.svg'}" alt="" class="h-9 w-9 rounded-lg border border-line object-contain bg-white">
            <div class="min-w-0"><div class="truncate text-base font-semibold">${brand}</div>${s.tenant ? '' : html`<div class="text-xs text-muted">Administration</div>`}</div>
          </div>
          <nav class="flex-1 overflow-y-auto thin-scroll px-3 py-3 space-y-0.5">${body}</nav>
          <div class="border-t border-line p-3">
            <div class="flex items-center gap-3 px-1 pb-3"><div class="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 font-semibold text-muted">${(s.name || s.email || '?').charAt(0).toUpperCase()}</div>
              <div class="min-w-0"><div class="truncate text-sm font-semibold">${s.name || s.email}</div><div class="text-xs text-muted">${s.impersonatedBy ? 'Administrator (as owner)' : s.roleLabel}</div></div></div>
            <button type="button" class="btn btn-outline w-full" data-signout>${icon('logout')}${t('Sign out')}</button>
          </div>`;
    }

    function topbar() {
        const s = HP.session;
        const ur = HP.lang() === 'ur';
        const dark = document.documentElement.classList.contains('dark');
        return html`<div class="flex h-16 items-center gap-3 border-b border-line bg-topbar px-4 sm:px-6">
            <button type="button" class="btn-icon lg:hidden" data-menu-toggle aria-label="Menu">${icon('menu')}</button>
            <div class="min-w-0 flex-1 truncate text-sm text-muted">${s.tenant ? s.tenant.name : 'HisabPro Administration'}</div>
            ${s.tenant ? html`<button type="button" class="hidden md:flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-muted hover:text-ink" data-palette-open>${icon('search')}<span>Search</span><span class="kbd">Ctrl K</span></button>` : ''}
            <div id="net-pill">${netPill()}</div>
            <div class="seg !bg-topbar"><button type="button" data-lang="en" class="${!ur ? 'on' : ''}">English</button><button type="button" data-lang="ur" class="${ur ? 'on' : ''}">اردو</button></div>
            <button type="button" class="btn-icon" data-dark aria-label="${dark ? 'Switch to day mode' : 'Switch to night mode'}" title="Night mode">${icon(dark ? 'moon' : 'sun')}</button>
            <button type="button" class="btn-icon" data-palette aria-label="Theme Palette" title="Theme Palette">${icon('palette')}</button>
          </div>`;
    }

    let net = { online: navigator.onLine, pending: 0, desktop: false };
    function netPill() {
        if (net.desktop && net.revoked) return html`<span class="badge badge-bad">${icon('lock', 'w-3.5 h-3.5')}PC revoked</span>`;
        if (net.desktop && Math.abs(net.clockSkewMinutes || 0) >= 5) return html`<span class="badge badge-warn" title="This PC's date/time is wrong by about ${Math.abs(net.clockSkewMinutes)} minutes. Fix the Windows clock so sales get the right date.">${icon('clock', 'w-3.5 h-3.5')}PC clock wrong</span>`;
        if (net.desktop && net.problems) return html`<span class="badge badge-warn" title="${net.problems} change(s) were refused by the HisabPro server. Contact HisabPro.">${icon('alert', 'w-3.5 h-3.5')}Sync problems: ${net.problems}</span>`;
        if (!net.online) return html`<span class="badge badge-bad badge-dot" title="${net.desktop ? 'Sales are saved on this PC and sent when the internet is back' : 'No internet connection'}">${t('Offline')}${net.pending ? ` · ${net.pending} waiting` : ''}</span>`;
        if (net.pending) return html`<span class="badge badge-warn badge-dot">${t('Syncing')} · ${net.pending}</span>`;
        if (isMobile()) return ''; // the phone app: nothing to say while online
        return html`<span class="badge badge-good badge-dot">${t('Live / Online')}</span>`;
    }
    function setNet(patch) { Object.assign(net, patch); const el = document.getElementById('net-pill'); if (el) el.innerHTML = String(netPill()); }
    window.addEventListener('online', () => !net.desktop && setNet({ online: true }));
    window.addEventListener('offline', () => !net.desktop && setNet({ online: false }));

    function banner() {
        const s = HP.session;
        const parts = [];
        if (s.impersonatedBy) parts.push(html`<div class="flex items-center justify-between gap-3 bg-amber-100 px-6 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <span>${icon('shield', 'w-4 h-4 inline')} You are working inside <b>${s.tenant ? s.tenant.name : ''}</b> as its owner (HisabPro administrator).</span>
            <button type="button" class="btn btn-sm btn-outline" data-back-admin>Back to administration</button></div>`);
        if (s.tenant && s.tenant.readOnly) parts.push(html`<div class="bg-rose-50 px-6 py-2 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-200">${icon('lock', 'w-4 h-4 inline')} Read-only: the subscription has ended. You can view and print; contact HisabPro to renew.</div>`);
        else if (s.tenant && s.tenant.access && s.tenant.access.status === 'GRACE') parts.push(html`<div class="bg-amber-50 px-6 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">Your subscription ended on ${s.tenant.access.endsOn}. It stays open until ${s.tenant.access.graceUntil}: contact HisabPro to renew.</div>`);
        else if (s.tenant && s.tenant.access && s.tenant.access.status === 'ACTIVE' && s.tenant.access.daysLeft <= 7) parts.push(html`<div class="bg-amber-50 px-6 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">Your subscription ends in ${s.tenant.access.daysLeft} day(s) (${s.tenant.access.endsOn}).</div>`);
        return html`${parts}`;
    }

    // the phone app (owner's ledger screens): back arrow, title, language, settings — no sidebar
    const isMobile = () => !!(HP.mobile && HP.mobile.on());
    function mobileTopbar(path, def) {
        const home = path === '/m';
        const ur = HP.lang() === 'ur';
        return html`<div class="flex h-14 items-center gap-2 border-b border-line bg-topbar px-3">
            ${home ? html`<img src="/img/logo.svg" alt="" class="h-8 w-8 rounded-lg">` : html`<button type="button" class="btn-icon border-0" data-m-back aria-label="${t('Back')}">${icon('chevronLeft', 'w-5 h-5 rtl:rotate-180')}</button>`}
            <div class="min-w-0 flex-1 truncate text-base font-semibold">${home ? 'HisabPro' : t(def ? def.title : '')}</div>
            <div id="net-pill">${netPill()}</div>
            <div class="seg !bg-topbar"><button type="button" data-lang="en" class="${!ur ? 'on' : ''}">EN</button><button type="button" data-lang="ur" class="${ur ? 'on' : ''}">اردو</button></div>
            ${home ? html`<a href="/m/settings" data-link class="btn-icon" aria-label="${t('Settings')}">${icon('settings')}</a>` : ''}</div>`;
    }
    function render(path, def) {
        const app = document.getElementById('app');
        const mode = isMobile() ? 'mobile' : 'full';
        // listeners live on #app, which stays the same element across sign-outs: bind them once
        if (!app.dataset.bound) { bind(app); app.dataset.bound = '1'; }
        if (mode === 'mobile') {
            if (framed !== 'mobile') {
                app.innerHTML = String(html`<div class="flex h-full flex-col"><div id="banner"></div><header id="topbar" class="shrink-0"></header>
                  <main id="page" class="flex-1 overflow-y-auto thin-scroll px-4 pb-10 pt-4"></main></div>`);
                framed = 'mobile';
            }
            document.getElementById('topbar').innerHTML = String(mobileTopbar(path, def));
            document.getElementById('banner').innerHTML = String(banner());
            return;
        }
        if (framed !== 'full') {
            app.innerHTML = String(html`<div class="flex h-full">
              <div class="fixed inset-0 z-30 bg-black/30 hidden" data-nav-scrim></div>
              <aside id="sidebar" class="fixed inset-y-0 start-0 z-40 flex w-64 -translate-x-full flex-col border-e border-line bg-surface transition-transform lg:static lg:translate-x-0 rtl:translate-x-full rtl:lg:translate-x-0"></aside>
              <div class="flex min-w-0 flex-1 flex-col"><div id="banner"></div><header id="topbar"></header><main id="page" class="flex-1 overflow-y-auto thin-scroll px-4 py-6 sm:px-6"></main></div>
            </div>`);
            framed = 'full';
        }
        document.getElementById('sidebar').innerHTML = String(sidebar(path));
        document.getElementById('topbar').innerHTML = String(topbar());
        document.getElementById('banner').innerHTML = String(banner());
        toggleMobile(false);
    }
    function toggleMobile(v) {
        mobileOpen = v;
        const sb = document.getElementById('sidebar'), sc = document.querySelector('[data-nav-scrim]');
        if (!sb) return;
        sb.classList.toggle('!translate-x-0', v);
        sc && sc.classList.toggle('hidden', !v);
    }
    function bind(app) {
        app.addEventListener('click', e => {
            const g = e.target.closest('[data-group]');
            if (g) {
                const open = openGroups(), n = g.dataset.group;
                const next = open.includes(n) ? open.filter(x => x !== n) : [...open, n];
                localStorage.setItem('hp.navOpen', JSON.stringify(next));
                document.getElementById('sidebar').innerHTML = String(sidebar(location.pathname));
                return;
            }
            if (e.target.closest('[data-signout]')) return HP.app.signOut();
            if (e.target.closest('[data-m-back]')) {
                // back within the app's own history, else one level up (/m/accounts/x → /m/accounts → /m)
                if (history.state && history.state.prev) history.back();
                else HP.router.navigate(location.pathname.replace(/\/[^/]+$/, '') || '/m', { replace: true });
                return;
            }
            if (e.target.closest('[data-palette-open]')) return HP.palette.show();
            if (e.target.closest('[data-back-admin]')) return HP.app.backToAdmin();
            if (e.target.closest('[data-menu-toggle]')) return toggleMobile(!mobileOpen);
            if (e.target.closest('[data-nav-scrim]')) return toggleMobile(false);
            const l = e.target.closest('[data-lang]');
            if (l) { HP.setLang(l.dataset.lang); HP.router.render(); return; }
            if (e.target.closest('[data-dark]')) { localStorage.setItem('hp.dark', document.documentElement.classList.contains('dark') ? '0' : '1'); applyTheme(); HP.router.render(); return; }
            const pb = e.target.closest('[data-palette]');
            if (pb) {
                HP.ui.menu(pb, PALETTES.map(([c, n]) => ({ label: n, iconName: 'palette', onClick: () => { localStorage.setItem('hp.palette', c); applyTheme(); } })));
            }
        });
    }
    function reset() { framed = null; }

    HP.shell = { render, reset, setNet, applyTheme, NAV, PALETTES, can };
})();
