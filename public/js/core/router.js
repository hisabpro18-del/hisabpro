// Pages register themselves: HP.page('/products', { title, perm, render(el, params, query) → cleanup? }).
// Paths may hold parameters: '/admin/clients/:id'. Links with data-link navigate without reloading.
(function () {
    'use strict';
    const pages = [];
    HP.page = (path, def) => {
        const keys = [];
        const re = new RegExp('^' + path.replace(/:[a-zA-Z]+/g, m => { keys.push(m.slice(1)); return '([^/]+)'; }) + '/?$');
        pages.push({ path, re, keys, def });
    };
    const match = path => {
        for (const p of pages) {
            const m = path.match(p.re);
            if (m) return { ...p, params: Object.fromEntries(p.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
        }
        return null;
    };

    let cleanup = null, seq = 0;
    function navigate(path, { replace } = {}) {
        if (path === location.pathname + location.search && !replace) return render();
        history[replace ? 'replaceState' : 'pushState']({}, '', path);
        render();
    }
    async function render() {
        if (typeof cleanup === 'function') { try { cleanup(); } catch { } }
        cleanup = null;
        const my = ++seq;
        HP.ui.closeMenus();
        if (!HP.session) return;
        const path = location.pathname;
        const m = match(path);
        if (!m) {
            if (path !== HP.app.home() && match(HP.app.home())) return navigate(HP.app.home(), { replace: true });
            HP.shell.render(path);
            const el0 = document.getElementById('page');
            el0.innerHTML = String(HP.html`<div class="card card-pad text-sm text-muted">This page is not available.</div>`);
            return;
        }
        const def = m.def;
        const s = HP.session;
        const allowed = def.super ? s.role === 'SUPER_ADMIN' : (s.role !== 'SUPER_ADMIN' || s.impersonatedBy || s.tenantId)
            && (!def.perm || [].concat(def.perm).some(k => Perms.has(s, k)));
        if (!allowed) return navigate(HP.app.home(), { replace: true });
        HP.shell.render(path);
        document.title = `${HP.t(def.title)} · ${s.tenant ? s.tenant.name : 'HisabPro'}`;
        // a fresh element per page, so listeners a page attached never pile up on the next one
        const old = document.getElementById('page');
        const el = old.cloneNode(false);
        old.replaceWith(el);
        el.innerHTML = String(HP.ui.loading());
        try {
            const c = await def.render(el, m.params, Object.fromEntries(new URLSearchParams(location.search)));
            // the user moved on while this page was still loading: tidy it up now, never over the newer page's cleanup
            if (my !== seq) { if (typeof c === 'function') { try { c(); } catch { } } return; }
            cleanup = c;
        } catch (e) {
            console.error(e);
            el.innerHTML = String(HP.html`<div class="card card-pad text-sm text-rose-600">${e.message}</div>`);
        }
    }
    window.addEventListener('popstate', render);
    document.addEventListener('click', e => {
        const a = e.target.closest('a[data-link]');
        if (!a || e.ctrlKey || e.metaKey || e.shiftKey || a.target) return;
        e.preventDefault();
        navigate(a.getAttribute('href'));
    });
    HP.router = { navigate, render, match };
})();
