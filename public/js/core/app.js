// Start-up: desktop activation (Windows app), sign-in, forced password change, then the app.
(function () {
    'use strict';
    const { html, icon, t, api, ui } = HP;
    const app = () => document.getElementById('app');
    let desktop = null; // status from /api/desktop/status when running inside the desktop app

    function themeButtons() {
        return html`<div class="absolute right-5 top-5 z-20 flex items-center gap-2">
            <button type="button" class="btn-icon" data-dark-login aria-label="Switch to night mode">${icon(document.documentElement.classList.contains('dark') ? 'moon' : 'sun')}</button>
            <button type="button" class="btn-icon" data-palette-login aria-label="Theme Palette">${icon('palette')}</button></div>`;
    }
    function bindThemeButtons(root) {
        root.querySelector('[data-dark-login]').addEventListener('click', () => { localStorage.setItem('hp.dark', document.documentElement.classList.contains('dark') ? '0' : '1'); HP.shell.applyTheme(); });
        root.querySelector('[data-palette-login]').addEventListener('click', e => ui.menu(e.currentTarget, HP.shell.PALETTES.map(([c, n]) => ({ label: n, iconName: 'palette', onClick: () => { localStorage.setItem('hp.palette', c); HP.shell.applyTheme(); } }))));
    }
    const centered = (inner, wide) => html`<div class="relative flex min-h-full items-center justify-center overflow-hidden bg-linear-to-br from-white to-[#a2a29d] px-4 py-10 dark:from-[#0f1115] dark:to-[#2a2f38]">
        ${themeButtons()}
        <div class="relative w-full ${wide ? 'max-w-lg' : 'max-w-md'}"><div class="rounded-3xl border border-white/40 bg-white/70 p-8 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-black/40">${inner}</div></div>
        <p class="pointer-events-none absolute bottom-5 text-center text-xs text-muted">© ${new Date().getFullYear()} HisabPro</p></div>`;

    function showLogin(message) {
        HP.session = null; HP.shell.reset();
        app().innerHTML = String(centered(html`
          <div class="flex flex-col items-center text-center">
            <img src="/img/logo.svg" alt="HisabPro" class="mb-5 h-24 w-24 rounded-2xl shadow-sm">
            <h1 class="text-2xl font-bold tracking-tight">Welcome to HisabPro</h1>
            <p class="mt-1.5 text-sm text-muted">${desktop && desktop.shopName ? `${desktop.shopName} · this PC` : t('Secure workspace · Tenant login')}</p>
          </div>
          <form class="mt-8 space-y-5" data-login novalidate>
            <div><label class="label" for="email">${t('Email')}</label><input id="email" type="email" class="input h-11 bg-white/60" placeholder="you@example.com" autocomplete="email" autofocus></div>
            <div><label class="label" for="password">${t('Password')}</label><div class="relative"><input id="password" type="password" class="input h-11 bg-white/60 pe-10" placeholder="••••••••" autocomplete="current-password">
              <button type="button" class="absolute inset-y-0 end-3 flex items-center text-muted" data-eye aria-label="Show password">${icon('eye')}</button></div></div>
            <div data-err class="${message ? '' : 'hidden'} rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">${message || ''}</div>
            <button type="submit" class="btn btn-primary btn-lg w-full" data-go disabled>${t('Sign In')}</button>
          </form>`));
        const root = app();
        bindThemeButtons(root);
        const f = root.querySelector('[data-login]'), em = root.querySelector('#email'), pw = root.querySelector('#password'), go = root.querySelector('[data-go]'), err = root.querySelector('[data-err]');
        const check = () => { go.disabled = !(em.value.trim() && pw.value); };
        em.addEventListener('input', check); pw.addEventListener('input', check);
        root.querySelector('[data-eye]').addEventListener('click', () => { pw.type = pw.type === 'password' ? 'text' : 'password'; });
        f.addEventListener('submit', async e => {
            e.preventDefault();
            if (go.disabled) return;
            go.disabled = true; err.classList.add('hidden');
            try {
                const r = await api.post('/api/auth/login', { email: em.value.trim(), password: pw.value });
                api.setToken(r.token);
                localStorage.removeItem('hp.adminToken');
                await start();
            } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); go.disabled = false; }
        });
    }

    function showChangePassword() {
        app().innerHTML = String(centered(html`
          <h1 class="text-xl font-bold">Choose your own password</h1>
          <p class="mt-1 text-sm text-muted">Your account was set up with a temporary password. Please choose a new one to continue.</p>
          <form class="mt-6 space-y-4" data-pw>
            <div><label class="label">Temporary (current) password</label><input type="password" class="input" name="current" autocomplete="current-password" autofocus></div>
            <div><label class="label">New password</label><input type="password" class="input" name="password" autocomplete="new-password" placeholder="At least 8 characters"></div>
            <div><label class="label">Repeat new password</label><input type="password" class="input" name="again" autocomplete="new-password"></div>
            <div data-err class="hidden rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"></div>
            <div class="flex gap-2"><button type="button" class="btn btn-outline flex-1" data-out>${t('Sign out')}</button><button class="btn btn-primary flex-1">Save password</button></div>
          </form>`));
        const root = app();
        bindThemeButtons(root);
        root.querySelector('[data-out]').addEventListener('click', signOut);
        root.querySelector('[data-pw]').addEventListener('submit', async e => {
            e.preventDefault();
            const v = ui.readForm(e.target), err = root.querySelector('[data-err]');
            if (v.password !== v.again) { err.textContent = 'The two new passwords are not the same.'; err.classList.remove('hidden'); return; }
            try { const r = await api.post('/api/auth/password', { current: v.current, password: v.password }); api.setToken(r.token); await start(); }
            catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); }
        });
    }

    // the phone app is for the shop owner only
    function showOwnerOnly() {
        app().innerHTML = String(centered(html`<div class="flex flex-col items-center text-center">
            <img src="/img/logo.svg" alt="HisabPro" class="mb-5 h-16 w-16 rounded-2xl shadow-sm">
            <h1 class="text-xl font-bold">${t('This app is for the shop owner')}</h1>
            <p class="mt-2 text-sm text-muted">${t('Staff use HisabPro on the shop computer or the website. Sign in here with the owner\'s account.')}</p>
            <p class="mt-2 text-sm text-muted">یہ ایپ صرف دکان کے مالک کے لیے ہے۔ عملہ دکان کے کمپیوٹر یا ویب سائٹ پر HisabPro استعمال کرے۔</p>
            <button type="button" class="btn btn-primary btn-lg mt-6 w-full" data-out>${t('Sign out')}</button></div>`));
        bindThemeButtons(app());
        app().querySelector('[data-out]').addEventListener('click', signOut);
    }

    function showActivation(message) {
        app().innerHTML = String(centered(html`
          <div class="flex items-center gap-3"><img src="/img/logo.svg" class="h-12 w-12 rounded-xl" alt=""><div><h1 class="text-xl font-bold">Set up this PC</h1><p class="text-sm text-muted">HisabPro desktop · works offline, syncs when online</p></div></div>
          <p class="mt-5 text-sm text-muted">Sign in once with the shop owner's or a manager's HisabPro account. This PC then downloads the shop's data and can keep selling without internet.</p>
          <form class="mt-5 space-y-4" data-act>
            <div><label class="label">HisabPro server address</label><input class="input" name="serverUrl" value="${desktop.serverUrl || ''}" placeholder="https://hisabpro.com"></div>
            <div><label class="label">Owner / manager email</label><input class="input" name="email" type="email" autofocus></div>
            <div><label class="label">Password</label><input class="input" name="password" type="password"></div>
            <div><label class="label">Name of this PC</label><input class="input" name="name" placeholder="Counter 1" value="Counter 1"></div>
            <div data-err class="${message ? '' : 'hidden'} rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">${message || ''}</div>
            <button class="btn btn-primary btn-lg w-full" data-go>Activate this PC</button>
          </form>`, true));
        const root = app();
        bindThemeButtons(root);
        root.querySelector('[data-act]').addEventListener('submit', async e => {
            e.preventDefault();
            const v = ui.readForm(e.target), err = root.querySelector('[data-err]'), go = root.querySelector('[data-go]');
            go.disabled = true; go.innerHTML = String(html`${ui.spinner('w-4 h-4')} Activating and downloading data…`); err.classList.add('hidden');
            try { await api.post('/api/desktop/activate', v); desktop = await api.get('/api/desktop/status'); showLogin(); }
            catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); go.disabled = false; go.textContent = 'Activate this PC'; }
        });
    }

    async function pollDesktop() {
        try {
            desktop = await api.get('/api/desktop/status');
            HP.shell.setNet({ desktop: true, online: desktop.online, pending: desktop.pending, revoked: desktop.revoked, clockSkewMinutes: desktop.clockSkewMinutes, problems: desktop.problems });
        } catch { HP.shell.setNet({ desktop: true, online: false }); }
    }

    function home() {
        const s = HP.session;
        if (!s) return '/';
        if (HP.mobile && HP.mobile.on()) return '/m'; // the phone app (owners only, checked in start())
        if (s.role === 'SUPER_ADMIN' && !s.impersonatedBy) return '/admin';
        if (Perms.has(s, 'reports.view')) return '/dashboard';
        if (Perms.has(s, 'sales.create')) return '/pos';
        for (const n of HP.shell.NAV) {
            if (n.href && HP.shell.can(n.perm)) return n.href;
            for (const i of n.items || []) if (HP.shell.can(i[2])) return i[1];
        }
        return '/dashboard';
    }

    async function start() {
        if (desktop === null) {
            try { const st = await api.get('/api/desktop/status'); desktop = st && st.isDesktop ? st : false; } catch { desktop = false; }
            if (desktop) { HP.isDesktop = true; setInterval(pollDesktop, 5000); }
        }
        if (desktop && !desktop.activated) return showActivation();
        if (!api.token()) return showLogin();
        try { HP.session = await api.get('/api/auth/me'); }
        catch (e) {
            if (e.status === 401) return showLogin(e.message);
            app().innerHTML = String(centered(html`<p class="text-sm">${e.message}</p><button class="btn btn-primary mt-4" data-retry>Try again</button>`));
            bindThemeButtons(app());
            app().querySelector('[data-retry]').addEventListener('click', () => location.reload());
            return;
        }
        if (HP.mobile && HP.mobile.on() && HP.session.role !== 'OWNER') return showOwnerOnly();
        if (HP.session.mustChangePassword && !desktop) return showChangePassword();
        if (desktop) HP.shell.setNet({ desktop: true, online: desktop.online, pending: desktop.pending, revoked: desktop.revoked });
        HP.shell.reset();
        if (location.pathname === '/' || location.pathname === '/login') history.replaceState({}, '', home());
        HP.router.render();
    }

    async function signOut() {
        try { await api.post('/api/auth/logout'); } catch { }
        api.setToken(''); localStorage.removeItem('hp.adminToken');
        history.replaceState({}, '', '/');
        showLogin();
    }
    function signedOut(msg) { history.replaceState({}, '', '/'); showLogin(msg); }
    // super admin: enter / leave a client's workspace
    async function openWorkspace(tenantId) {
        const r = await api.post(`/api/admin/clients/${tenantId}/workspace`);
        localStorage.setItem('hp.adminToken', api.token());
        api.setToken(r.token);
        history.replaceState({}, '', '/dashboard');
        await start();
    }
    async function backToAdmin() {
        const tok = localStorage.getItem('hp.adminToken');
        localStorage.removeItem('hp.adminToken');
        if (!tok) return signOut();
        api.setToken(tok);
        history.replaceState({}, '', '/admin/clients');
        await start();
    }
    // reload the session (after settings change the shop name / logo)
    async function refresh() { HP.session = await api.get('/api/auth/me'); HP.shell.render(location.pathname); }

    HP.app = { start, home, signOut, signedOut, openWorkspace, backToAdmin, refresh, desktop: () => desktop };
    document.addEventListener('DOMContentLoaded', start);
})();
