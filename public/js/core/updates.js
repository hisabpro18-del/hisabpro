// Windows app updates: the state comes from the desktop app (window.hpDesktop.updates, see desktop/main.js). Settings →
// App update shows the card; anyone using the PC gets one short notice per new version. On the web this does nothing
// (the web app is always the newest version).
(function () {
    'use strict';
    const { html, icon, t, ui } = HP;
    const bridge = () => (window.hpDesktop && window.hpDesktop.updates) || null;
    let state = null;
    const listeners = new Set();
    let told = '';

    function changed(s) {
        state = s;
        listeners.forEach(fn => { try { fn(s); } catch { } });
        // one notice per new version, whoever is at the PC
        if (s && s.status === 'available' && told !== s.version && HP.session) {
            told = s.version;
            const owner = HP.shell && HP.shell.can && HP.shell.can('settings.manage');
            ui.toast(owner ? `HisabPro ${s.version} is available — Settings → App update` : `HisabPro ${s.version} is available. Ask the shop owner to update this PC.`);
        }
    }
    function init() {
        const b = bridge();
        if (!b) return;
        b.onChange(changed);
        b.state().then(changed).catch(() => {});
    }

    const STATUS = {
        idle: ['Not checked yet', 'gray'], checking: ['Checking…', 'gray'], latest: ['Up to date', 'good'], available: ['Update available', 'warn'],
        downloading: ['Downloading…', 'warn'], ready: ['Ready to install', 'good'], installing: ['Installing…', 'good'], error: ['Could not update', 'bad'], dev: ['Development copy', 'gray'],
    };

    // Settings → App update
    function card(box) {
        const b = bridge();
        if (!b) { ui.mount(box, html`<p class="text-sm text-muted">App updates are for the HisabPro Windows app. The web version is always up to date.</p>`); return () => {}; }
        const draw = s => {
            if (!box.isConnected && box.dataset.drawn) { listeners.delete(draw); return; } // the settings page was left
            box.dataset.drawn = '1';
            s = s || { status: 'idle', current: '' };
            const [label, tone] = STATUS[s.status] || STATUS.idle;
            const busy = ['checking', 'downloading', 'installing'].includes(s.status);
            ui.mount(box, html`<div class="text-lg font-semibold">App update</div>
              <p class="mt-1 text-sm text-muted">Get the newest HisabPro for this PC in one click. Your shop's data stays on this PC and keeps syncing — nothing is lost.</p>
              <div class="mt-6 rounded-xl border border-line p-5">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div><div class="text-xs text-muted">${t('Installed version')}</div><div class="text-xl font-bold">${s.current || '—'}</div></div>
                  ${ui.badge(label, tone)}</div>
                ${s.status === 'available' ? html`<p class="mt-4 text-sm">New version <b>${s.version}</b> is ready to download.</p>${s.notes ? html`<pre class="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs text-muted">${s.notes}</pre>` : ''}` : ''}
                ${s.status === 'downloading' ? html`<div class="mt-4"><div class="flex justify-between text-sm"><span>Downloading ${s.version || ''}</span><span>${s.percent || 0}%</span></div>
                    <div class="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-line-soft" role="progressbar" aria-valuenow="${s.percent || 0}" aria-valuemin="0" aria-valuemax="100" aria-label="Download progress"><div class="h-full bg-accent transition-all" style="width:${s.percent || 0}%"></div></div>
                    <p class="mt-2 text-xs text-muted">You can keep selling while it downloads.</p></div>` : ''}
                ${s.status === 'ready' ? html`<p class="mt-4 text-sm">Version <b>${s.version}</b> is downloaded. Click <b>Restart & install</b> — HisabPro closes for about a minute and opens again by itself. It also installs the next time HisabPro is closed.</p>` : ''}
                ${s.status === 'latest' ? html`<p class="mt-4 text-sm text-muted">This PC has the newest version.${s.checkedAt ? ` Checked ${HP.fmt.dateTime(s.checkedAt)}.` : ''}</p>` : ''}
                ${s.status === 'error' || s.status === 'dev' ? html`<p class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">${s.error}</p>` : ''}
                <div class="mt-5 flex flex-wrap gap-2">
                  ${s.status === 'available' ? html`<button class="btn btn-primary" data-up="download">${icon('download')}Download update</button>`
                    : s.status === 'ready' ? html`<button class="btn btn-primary" data-up="install">${icon('refresh')}Restart & install</button>`
                    : html`<button class="btn btn-primary" data-up="check" ${busy ? 'disabled' : ''}>${busy ? ui.spinner('w-4 h-4') : icon('refresh')}${t('Check for updates')}</button>`}
                </div></div>
              <p class="mt-4 text-xs text-muted">HisabPro also checks by itself when it starts and every few hours. Updates come from HisabPro's official release page.</p>`);
            box.querySelectorAll('[data-up]').forEach(btn => btn.addEventListener('click', async () => {
                btn.disabled = true;
                const act = btn.dataset.up;
                if (act === 'install' && (state && state.current) && !(await ui.confirm({ title: 'Restart HisabPro now?', message: 'Sales waiting to sync are kept and go up after the restart.', ok: 'Restart & install' }))) { btn.disabled = false; return; }
                try { draw(await b[act]()); } catch (e) { ui.fail(e); btn.disabled = false; }
            }));
        };
        listeners.add(draw);
        draw(state);
        b.state().then(draw).catch(() => {});
        return () => listeners.delete(draw);
    }

    HP.updates = { init, card, state: () => state, available: () => !!bridge() };
    document.addEventListener('DOMContentLoaded', init);
})();
