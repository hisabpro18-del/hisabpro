// Super admin: dashboard, clients, one client (overview, users, desktop PCs, activity), activity log.
const { html, icon, api, ui, fmt } = HP;

const accessBadge = a => {
    if (!a || a.status === 'NONE') return ui.badge('No time limit', 'gray');
    if (a.status === 'ACTIVE') return ui.badge(a.daysLeft <= 15 ? `${a.daysLeft} days left` : `Until ${a.endsOn}`, a.daysLeft <= 15 ? 'warn' : 'good');
    if (a.status === 'GRACE') return ui.badge(`Grace until ${a.graceUntil}`, 'warn');
    return ui.badge(`Expired ${a.endsOn}`, 'bad');
};
const planName = id => (Plans.plan(id) || { name: 'No plan' }).name;

// ── dashboard ──
HP.page('/admin', {
    title: 'Dashboard', super: true,
    async render(el) {
        const s = await api.get('/api/admin/stats');
        ui.mount(el, html`${ui.pageHeader({ title: 'HisabPro Administration', subtitle: 'Clients, subscriptions, users and desktop PCs across the platform.', actions: html`<a href="/admin/clients?new=1" data-link class="btn btn-primary">${icon('plus')}New client</a>` })}
          <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            ${ui.statCard({ label: 'Clients', value: s.clients, iconName: 'building', tone: 'accent', sub: `${s.active} active · ${s.inactive} switched off` })}
            ${ui.statCard({ label: 'Ending within 15 days', value: s.expiringSoon, iconName: 'clock', tone: 'warn', valueTone: s.expiringSoon ? 'warn' : '' })}
            ${ui.statCard({ label: 'In grace / expired', value: `${s.grace} / ${s.expired}`, iconName: 'alert', tone: 'bad', valueTone: s.expired ? 'bad' : '' })}
            ${ui.statCard({ label: 'Users · Desktop PCs', value: `${s.users} · ${s.devices}`, iconName: 'users', tone: 'good' })}
          </div>
          <div class="card mt-6"><div class="flex items-center justify-between px-5 py-4 border-b border-line"><div class="font-semibold">Recent activity</div><a href="/admin/activity" data-link class="text-sm text-muted hover:text-ink">View all</a></div>
            <div class="divide-y divide-line-soft">${s.recent.length ? s.recent.map(r => html`<div class="flex items-start justify-between gap-4 px-5 py-3 text-sm"><div><div>${r.summary}</div><div class="text-xs text-muted">${r.userEmail} · ${r.action}</div></div><div class="whitespace-nowrap text-xs text-muted">${fmt.dateTime(r.createdAt)}</div></div>`) : html`<div class="px-5 py-8 text-center text-sm text-muted">No activity yet.</div>`}</div></div>`);
    },
});

// ── clients ──
function clientForm(onDone) {
    ui.formDrawer({
        title: 'New client', subtitle: 'A business on HisabPro, with its owner login, plan and access period',
        submit: 'Create client',
        body: html`${ui.section('BUSINESS',
            ui.field({ label: 'Business (shop) name', name: 'name', required: true, placeholder: 'e.g. Minha traders', help: 'Shown in the app and on every bill of this client.' }),
            ui.field({ label: 'Mobile', name: 'mobile', placeholder: '03xx-xxxxxxx' }))}
          ${ui.section('OWNER LOGIN',
            ui.field({ label: 'Owner name', name: 'ownerName', half: true }),
            ui.field({ label: 'Owner email (login)', name: 'ownerEmail', type: 'email', required: true, half: true }),
            ui.field({ label: 'Temporary password', name: 'ownerPassword', type: 'text', required: true, help: 'At least 8 characters. The owner must choose their own at the first sign-in.' }))}
          ${ui.section('SUBSCRIPTION',
            ui.field({ label: 'Plan', name: 'plan', type: 'select', options: [['', 'No plan (no limits)'], ...Plans.PLANS.map(p => [p.id, `${p.name} — ${p.limits ? `${p.limits.users} users, ${p.limits.devices} PCs, ${p.limits.products} products` : 'unlimited'}`])] }),
            ui.field({ label: 'Access period', name: 'accessUnit', type: 'select', half: true, options: [['', 'No time limit'], ['MONTH', 'Months'], ['YEAR', 'Years']] }),
            ui.field({ label: 'How many', name: 'accessCount', type: 'number', value: 1, half: true, min: 1 }))}`,
        async onSubmit(v, d) {
            const r = await api.post('/api/admin/clients', { ...v, accessCount: Number(v.accessCount) || 1 });
            d.close(); ui.toast('Client created'); onDone(r.id);
        },
    });
}

HP.page('/admin/clients', {
    title: 'Clients', super: true,
    async render(el, p, query) {
        let q = '';
        const draw = async () => {
            const list = await api.get('/api/admin/clients', { q });
            ui.mount(el.querySelector('[data-list]'), ui.table({
                rows: list,
                empty: { iconName: 'building', title: 'No clients yet', text: 'Create the first business on HisabPro.' },
                columns: [
                    { label: 'Client', render: c => html`<a href="/admin/clients/${c.id}" data-link class="font-semibold hover:underline">${c.name}</a><div class="text-xs text-muted">${c.owner || '—'}${c.mobile ? ' · ' + c.mobile : ''}</div>` },
                    { label: 'Plan', render: c => planName(c.plan) },
                    { label: 'Access', render: c => accessBadge(c.access) },
                    { label: 'Status', render: c => (c.active ? ui.badge('Active', 'good') : ui.badge(c.inactiveReason === 'EXPIRED' ? 'Expired' : 'Switched off', 'bad')) },
                    { label: 'Users', num: true, render: c => c.users },
                    { label: 'PCs', num: true, render: c => c.devices },
                    { label: 'Created', render: c => fmt.date(c.createdAt) },
                    { label: '', render: c => html`<div class="flex justify-end gap-2"><button class="btn btn-sm btn-outline" data-ws="${c.id}">Open workspace</button><a class="btn btn-sm btn-ghost" href="/admin/clients/${c.id}" data-link>Manage</a></div>` },
                ],
            }));
        };
        ui.mount(el, html`${ui.pageHeader({ title: 'Clients', subtitle: 'Every business on HisabPro. Only the administrator creates clients and their users.', actions: html`<button class="btn btn-primary" data-new>${icon('plus')}New client</button>` })}
          <div class="mb-4 max-w-md relative"><span class="absolute inset-y-0 start-3 flex items-center text-muted">${icon('search')}</span><input class="input ps-9" placeholder="Search by name or mobile" data-q></div>
          <div data-list>${ui.loading()}</div>`);
        el.querySelector('[data-new]').addEventListener('click', () => clientForm(id => HP.router.navigate('/admin/clients/' + id)));
        let tm; el.querySelector('[data-q]').addEventListener('input', e => { q = e.target.value; clearTimeout(tm); tm = setTimeout(draw, 250); });
        ui.on(el, 'click', '[data-ws]', async (e, b) => { try { await HP.app.openWorkspace(b.dataset.ws); } catch (err) { ui.fail(err); } });
        await draw();
        if (query.new) clientForm(id => HP.router.navigate('/admin/clients/' + id));
    },
});

// ── one client ──
function userForm(tenantId, user, onDone) {
    const editing = !!user;
    const role = (user && user.role) || 'CASHIER';
    const perms = new Set((user && user.permissions) || Perms.PRESETS[role]);
    const matrix = r => html`<div class="mt-2 grid gap-3 sm:grid-cols-2" data-matrix>${Perms.GROUPS.map(g => html`<div class="rounded-xl border border-line p-3">
        <div class="eyebrow mb-2">${g.label}</div>${g.keys.map(([k, l]) => html`<label class="flex items-center justify-between gap-3 py-1 text-sm"><span>${l}</span><input type="checkbox" class="check" data-perm="${k}" ${r === 'OWNER' || perms.has(k) ? HP.raw('checked') : ''} ${r === 'OWNER' ? HP.raw('disabled') : ''}></label>`)}</div>`)}</div>`;
    ui.formDrawer({
        title: editing ? 'Edit user' : 'Add New User', subtitle: 'Assign role defaults, then fine-tune module access.', wide: true,
        submit: editing ? 'Update User' : 'Create User',
        body: html`<div class="grid grid-cols-12 gap-4">
            ${ui.field({ label: 'Full Name', name: 'name', value: user ? user.name : '', required: true, half: true })}
            ${ui.field({ label: 'Email (login)', name: 'email', type: 'email', value: user ? user.email : '', required: true, half: true })}
            ${editing ? '' : ui.field({ label: 'Temporary password', name: 'password', type: 'text', required: true, help: 'They choose their own at the first sign-in.' })}
            ${ui.field({ label: 'Role', name: 'role', type: 'select', value: role, options: Perms.ROLES.map(r => [r, Perms.ROLE_LABEL[r]]) })}
            ${editing ? ui.field({ label: 'Active', name: 'active', type: 'switch', value: user.active, help: 'Switched off users cannot sign in.' }) : ''}
          </div>
          <div class="mt-6"><div class="font-semibold">Permissions Matrix</div><p class="text-xs text-muted">Role presets apply automatically. Override individual modules as needed. Owners always have everything.</p><div data-matrix-box>${matrix(role)}</div></div>`,
        onMount(form) {
            form.querySelector('[name=role]').addEventListener('change', e => {
                perms.clear(); (Perms.PRESETS[e.target.value] || []).forEach(k => perms.add(k));
                form.querySelector('[data-matrix-box]').innerHTML = String(matrix(e.target.value));
            });
        },
        async onSubmit(v, d, form) {
            const permissions = ui.$$('[data-perm]', form).filter(c => c.checked).map(c => c.dataset.perm);
            if (editing) await api.patch(`/api/admin/clients/${tenantId}/users/${user.id}`, { name: v.name, email: v.email, role: v.role, permissions, active: v.active });
            else await api.post(`/api/admin/clients/${tenantId}/users`, { ...v, permissions });
            d.close(); ui.toast(editing ? 'User updated' : 'User created'); onDone();
        },
    });
}

HP.page('/admin/clients/:id', {
    title: 'Client', super: true,
    async render(el, { id }, query) {
        let tab = query.tab || 'overview';
        const draw = async () => {
            const c = await api.get(`/api/admin/clients/${id}`);
            const head = html`<div class="mb-2"><a href="/admin/clients" data-link class="text-sm text-muted hover:text-ink">${icon('chevronLeft', 'w-4 h-4 inline')} Clients</a></div>
              ${ui.pageHeader({ title: c.name, subtitle: `${planName(c.plan)} · created ${fmt.date(c.createdAt)}`, actions: html`${c.active ? ui.badge('Active', 'good') : ui.badge('Switched off', 'bad')} ${accessBadge(c.access)}<button class="btn btn-outline" data-ws>${icon('arrowRight')}Open workspace</button>` })}
              <div class="mb-6">${ui.tabs('tab', [['overview', 'Overview'], ['users', 'Users'], ['devices', 'Desktop PCs'], ['activity', 'Activity']], tab)}</div><div data-tab></div>`;
            ui.mount(el, head);
            el.querySelector('[data-ws]').addEventListener('click', () => HP.app.openWorkspace(id).catch(ui.fail));
            const box = el.querySelector('[data-tab]');
            if (tab === 'overview') overview(box, c);
            if (tab === 'users') await users(box, c);
            if (tab === 'devices') await devices(box, c);
            if (tab === 'activity') await activity(box, c);
        };
        ui.on(el, 'click', '[data-tabs] [data-v]', (e, b) => { tab = b.dataset.v; history.replaceState({}, '', `/admin/clients/${id}?tab=${tab}`); draw().catch(ui.fail); });

        function overview(box, c) {
            const u = c.usage;
            const lim = k => (u[k].limit === null ? `${u[k].used} (no limit)` : `${u[k].used} of ${u[k].limit}`);
            ui.mount(box, html`<div class="grid gap-6 lg:grid-cols-2">
              <div class="card card-pad"><div class="font-semibold mb-4">Details</div>
                <form data-details class="grid grid-cols-12 gap-4">
                  ${ui.field({ label: 'Business name', name: 'name', value: c.name, required: true })}
                  ${ui.field({ label: 'Mobile', name: 'mobile', value: c.mobile, half: true })}
                  ${ui.field({ label: 'Plan', name: 'plan', type: 'select', value: c.plan || '', half: true, options: [['', 'No plan'], ...Plans.PLANS.map(p => [p.id, p.name])] })}
                  ${ui.field({ label: 'Client is active', name: 'active', type: 'switch', value: c.active, help: 'Switched off: none of its users can sign in.' })}
                  <div class="col-span-12"><button class="btn btn-primary">Save details</button></div>
                </form></div>
              <div class="space-y-6">
                <div class="card card-pad"><div class="font-semibold mb-1">Access period</div>
                  <p class="text-sm text-muted mb-4">${c.access.status === 'NONE' ? 'No time limit.' : `Last day ${c.access.endsOn}; grace until ${c.access.graceUntil}. After that the client becomes read-only by itself.`}</p>
                  <form data-access class="flex flex-wrap items-end gap-3">
                    <div><label class="label">Period</label><select class="input w-32" name="unit"><option value="MONTH">Months</option><option value="YEAR" selected>Years</option></select></div>
                    <div><label class="label">How many</label><input class="input w-24" type="number" min="1" value="1" name="count"></div>
                    <button class="btn btn-primary" data-mode="renew">Renew</button><button class="btn btn-outline" data-mode="set">Start from today</button><button class="btn btn-ghost" data-mode="clear">No limit</button>
                  </form><p class="help mt-2">Renew adds the period after the current last day; "Start from today" replaces it.</p></div>
                <div class="card card-pad"><div class="font-semibold mb-3">Plan usage</div>
                  <div class="grid grid-cols-3 gap-3 text-sm"><div><div class="text-muted">Users</div><div class="font-semibold">${lim('users')}</div></div><div><div class="text-muted">Desktop PCs</div><div class="font-semibold">${lim('devices')}</div></div><div><div class="text-muted">Products</div><div class="font-semibold">${lim('products')}</div></div></div></div>
              </div></div>`);
            box.querySelector('[data-details]').addEventListener('submit', async e => {
                e.preventDefault();
                try { await api.put(`/api/admin/clients/${id}`, ui.readForm(e.target)); ui.toast('Saved'); draw(); } catch (err) { ui.fail(err); }
            });
            ui.on(box, 'click', '[data-access] [data-mode]', async (e, b) => {
                e.preventDefault();
                const v = ui.readForm(box.querySelector('[data-access]'));
                const mode = b.dataset.mode;
                try { await api.post(`/api/admin/clients/${id}/access`, mode === 'clear' ? { clear: true } : { unit: v.unit, count: v.count, renew: mode === 'renew' }); ui.toast('Access period updated'); draw(); } catch (err) { ui.fail(err); }
            });
        }

        async function users(box, c) {
            const list = await api.get(`/api/admin/clients/${id}/users`);
            ui.mount(box, html`<div class="mb-4 flex justify-between"><p class="text-sm text-muted">Only the HisabPro administrator adds and changes users of a client.</p><button class="btn btn-primary" data-add>${icon('userPlus')}Add New User</button></div>
              ${ui.table({ rows: list, empty: 'No users.', columns: [
                { label: 'User Profile', render: u => html`<div class="flex items-center gap-3"><div class="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent">${(u.name || u.email).charAt(0).toUpperCase()}</div><div><div class="font-medium">${u.name || '—'}</div><div class="text-xs text-muted">${u.email}</div></div></div>` },
                { label: 'Role', render: u => ui.badge(Perms.ROLE_LABEL[u.role], u.role === 'OWNER' ? 'accent' : 'gray', false) },
                { label: 'Status', render: u => html`${u.active ? ui.badge('Active', 'good') : ui.badge('Off', 'bad')} ${u.locked ? ui.badge('Locked', 'warn') : ''} ${u.mustChangePassword ? ui.badge('Temp. password', 'gray', false) : ''}` },
                { label: 'Last sign-in', render: u => (u.lastLoginAt ? fmt.dateTime(u.lastLoginAt) : '—') },
                { label: 'Added', render: u => fmt.date(u.createdAt) },
                { label: '', render: u => html`<div class="flex justify-end gap-1"><button class="btn btn-sm btn-ghost" data-edit="${u.id}">${icon('edit')}Edit</button><button class="btn btn-sm btn-ghost" data-reset="${u.id}">${icon('lock')}Reset password</button></div>` },
              ] })}`);
            box.querySelector('[data-add]').addEventListener('click', () => userForm(id, null, draw));
            ui.on(box, 'click', '[data-edit]', (e, b) => userForm(id, list.find(u => u.id === b.dataset.edit), draw));
            ui.on(box, 'click', '[data-reset]', (e, b) => {
                const u = list.find(x => x.id === b.dataset.reset);
                ui.formDrawer({ title: 'Reset password', subtitle: u.email, submit: 'Reset', body: ui.grid(ui.field({ label: 'New temporary password', name: 'password', required: true, help: 'They must change it at the next sign-in. Signs them out everywhere and unlocks the account.' })),
                    async onSubmit(v, d) { await api.post(`/api/admin/clients/${id}/users/${u.id}/reset-password`, v); d.close(); ui.toast('Password reset'); draw(); } });
            });
        }

        async function devices(box) {
            const list = await api.get(`/api/admin/clients/${id}/devices`);
            ui.mount(box, html`<p class="mb-4 text-sm text-muted">Windows PCs running the HisabPro desktop app for this client. A revoked PC stops working at its next connection.</p>
              ${ui.table({ rows: list, empty: { iconName: 'monitor', title: 'No desktop PCs', text: 'A PC appears here after it is activated with the owner\'s or a manager\'s login.' }, columns: [
                { label: 'PC', render: d => html`<div class="font-medium">${d.name}</div><div class="text-xs text-muted">Code ${d.code} · activated by ${d.activatedBy || '—'}</div>` },
                { label: 'Last seen', render: d => (d.lastSeenAt ? fmt.dateTime(d.lastSeenAt) : '—') },
                { label: 'Last sync up / down', render: d => html`<div class="text-xs">${d.lastPushAt ? fmt.dateTime(d.lastPushAt) : '—'}</div><div class="text-xs text-muted">${d.lastPullAt ? fmt.dateTime(d.lastPullAt) : '—'}</div>` },
                { label: 'Version', render: d => d.appVersion || '—' },
                { label: 'Status', render: d => (d.revokedAt ? ui.badge('Revoked', 'bad') : ui.badge('Active', 'good')) },
                { label: '', render: d => (d.revokedAt ? '' : html`<button class="btn btn-sm btn-ghost text-rose-600" data-revoke="${d.id}">Revoke</button>`) },
              ] })}`);
            ui.on(box, 'click', '[data-revoke]', async (e, b) => {
                if (!(await ui.confirm({ title: 'Revoke this PC?', message: 'It will stop working at its next connection. Sales it has not sent yet stay on that PC.', ok: 'Revoke', danger: true }))) return;
                try { await api.post(`/api/admin/clients/${id}/devices/${b.dataset.revoke}/revoke`); ui.toast('PC revoked'); draw(); } catch (err) { ui.fail(err); }
            });
        }

        async function activity(box) {
            const list = await api.get('/api/admin/audit', { tenantId: id, limit: 300 });
            ui.mount(box, auditTable(list, false));
        }
        await draw();
    },
});

function auditTable(list, showClient) {
    return ui.table({ rows: list, empty: 'No activity.', columns: [
        { label: 'Time', render: r => html`<span class="whitespace-nowrap">${fmt.dateTime(r.createdAt)}</span>` },
        ...(showClient ? [{ label: 'Client', render: r => r.tenantName }] : []),
        { label: 'User', render: r => r.userEmail },
        { label: 'Action', render: r => html`<span class="font-mono text-xs">${r.action}</span>` },
        { label: 'What happened', render: r => r.summary },
    ] });
}

HP.page('/admin/activity', {
    title: 'Activity Log', super: true,
    async render(el) {
        const f = { q: '', from: '', to: '' };
        const draw = async () => ui.mount(el.querySelector('[data-list]'), auditTable(await api.get('/api/admin/audit', { ...f, limit: 500 }), true));
        ui.mount(el, html`${ui.pageHeader({ title: 'Activity Log', subtitle: 'Every important action on HisabPro: who, what, when. Entries can never be changed or removed.', actions: html`<button class="btn btn-outline" data-csv>${icon('download')}Export CSV</button>` })}
          <div class="mb-4 flex flex-wrap items-end gap-3"><div class="w-72"><label class="label">Search</label><input class="input" data-f="q" placeholder="Summary, user or action"></div>
          <div><label class="label">From</label><input type="date" class="input" data-f="from"></div><div><label class="label">To</label><input type="date" class="input" data-f="to"></div></div>
          <div data-list>${ui.loading()}</div>`);
        let tm; ui.on(el, 'input', '[data-f]', (e, i) => { f[i.dataset.f] = i.value; clearTimeout(tm); tm = setTimeout(draw, 300); });
        el.querySelector('[data-csv]').addEventListener('click', () => api.download('/api/admin/audit' + api.qs({ ...f, format: 'csv', limit: 5000 }), 'hisabpro-activity.csv').catch(ui.fail));
        await draw();
    },
});
