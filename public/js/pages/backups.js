// Database Backups: storage health donut, Download Backup (one JSON file of the shop's data) and Import Backup (merge only:
// new records are added, existing ones are skipped). Layout follows reference/REFERENCE.md › Database Backups.
const { html, icon, api, ui, fmt } = HP;

const MAX_IMPORT = 15 * 1024 * 1024;
const BACKUP_TYPE = 'application/vnd.hisabpro.backup+json'; // lets the server take files above the normal 3 MB limit
const size = b => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);
const label = m => m.replace(/([a-z])([A-Z])/g, '$1 $2');

async function postBackup(text) {
    let res;
    try { res = await fetch('/api/backup/import', { method: 'POST', headers: { 'Content-Type': BACKUP_TYPE, Authorization: 'Bearer ' + api.token() }, body: text }); }
    catch { throw new Error('Cannot reach the server. Check the connection and try again.'); }
    let data = null;
    try { data = await res.json(); } catch { }
    if (!res.ok) throw new Error((data && data.error) || `Import failed (${res.status}).`);
    return data;
}

HP.page('/administration/backups', {
    title: 'Database Backups', perm: 'settings.manage',
    async render(el) {
        const charts = [];
        const st = await api.get('/api/backup/storage');
        const used = Math.max(st.usedPct, st.usedBytes ? 0.1 : 0);
        ui.mount(el, html`<div class="mx-auto max-w-5xl">
          <div class="mb-6 flex items-start gap-3"><div class="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">${icon('database', 'w-5 h-5')}</div>
            <div><h1 class="text-2xl font-bold tracking-tight">Database Backups</h1><p class="mt-1 text-sm text-muted">Enterprise-grade data protection and recovery controls</p></div></div>

          <div class="card card-pad"><div class="font-semibold">Database Health & Storage</div><div class="mt-0.5 text-xs text-muted">Live storage allocation — 2.5D depth view</div>
            <div class="mt-4 flex flex-wrap items-center gap-8 py-4">
              <div class="relative h-[190px] w-[190px] shrink-0"><canvas data-donut aria-label="Storage used"></canvas>
                <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span class="text-[10px] font-semibold tracking-wider text-muted">STORAGE</span><span class="text-lg font-bold">${fmt.pct(used, used < 1 ? 1 : 0)} Used</span></div></div>
              <div class="min-w-[240px] flex-1 space-y-4">
                <div><div class="mb-1.5 flex items-center justify-between text-sm"><span class="flex items-center gap-2 font-medium"><span class="h-2.5 w-2.5 rounded-full bg-indigo-500"></span>Used Space</span><span class="text-muted">${fmt.pct(used, used < 1 ? 1 : 0)}</span></div>
                  <div class="h-2 overflow-hidden rounded-full bg-surface-2"><div class="h-full rounded-full bg-indigo-500" style="width:${Math.max(used, 0.5)}%"></div></div></div>
                <div><div class="mb-1.5 flex items-center justify-between text-sm"><span class="flex items-center gap-2 font-medium"><span class="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>Free Space</span><span class="text-muted">${fmt.pct(100 - used, used < 1 ? 1 : 0)}</span></div>
                  <div class="h-2 overflow-hidden rounded-full bg-surface-2"><div class="h-full rounded-full bg-emerald-500" style="width:${100 - used}%"></div></div></div>
                <p class="text-xs text-muted">${st.healthy ? 'Database is healthy. Recommended to schedule regular backups.' : 'Storage is filling up. Download a backup and contact HisabPro about a bigger plan.'}</p>
                <details class="text-xs text-muted"><summary class="cursor-pointer select-none">About ${size(st.usedBytes)} of ${size(st.quotaBytes)} · ${st.rows.toLocaleString('en-US')} records — show tables</summary>
                  <div class="mt-2 max-h-56 overflow-y-auto thin-scroll rounded-lg border border-line"><table class="tbl"><thead><tr><th>Table</th><th class="!text-right">Records</th><th class="!text-right">Approx. size</th></tr></thead>
                    <tbody>${st.tables.filter(x => x.rows).map(x => html`<tr><td>${label(x.name)}</td><td class="num">${x.rows.toLocaleString('en-US')}</td><td class="num">${size(x.bytes)}</td></tr>`)}</tbody></table></div></details>
              </div></div></div>

          <div class="mt-6 grid gap-6 md:grid-cols-2">
            <div class="card card-pad flex flex-col"><div class="flex items-start gap-3"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-good-soft text-good">${icon('download', 'w-5 h-5')}</span>
              <div><div class="font-semibold">Download Backup</div><p class="mt-1 text-sm text-muted">Download a full copy of your business data or import records from a backup file.</p></div></div>
              <div class="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-good-soft px-4 py-3 text-sm text-good dark:border-emerald-900">${icon('shield', 'w-4 h-4 mt-0.5 shrink-0')}<span>Creates a full JSON snapshot of products, sales, parties, and configuration. Store offline in a secure location.</span></div>
              <div class="flex-1"></div><button class="btn btn-primary mt-5 w-full" data-download>${icon('download')}Download Backup</button></div>
            <div class="card card-pad flex flex-col"><div class="flex items-start gap-3"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warn-soft text-warn">${icon('upload', 'w-5 h-5')}</span>
              <div><div class="font-semibold">Import Backup</div><p class="mt-1 text-sm text-muted">Choose a .json backup file. Existing records (same name, SKU, username, etc.) are skipped; new records are added.</p></div></div>
              <div class="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-warn-soft px-4 py-3 text-sm text-warn dark:border-amber-900">${icon('alert', 'w-4 h-4 mt-0.5 shrink-0')}<span>Import merges new records only. Existing records with matching identifiers are skipped — review the file before importing production data.</span></div>
              <div class="flex-1"></div><label class="btn btn-outline mt-5 self-start">${icon('file')}Choose file<input type="file" accept=".json,application/json" class="hidden" data-file></label></div>
          </div></div>`);

        charts.push(ui.chart(el.querySelector('[data-donut]'), {
            type: 'doughnut',
            data: { labels: ['Used Space', 'Free Space'], datasets: [{ data: [Math.max(used, 0.6), 100 - used], backgroundColor: ['#6366f1', '#10b981'], borderColor: ui.css('--color-surface'), borderWidth: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.label}: ${c.dataIndex ? fmt.pct(100 - used) : fmt.pct(used)}` } } } },
        }));

        ui.on(el, 'click', '[data-download]', async (e, btn) => {
            btn.disabled = true;
            try { await api.download('/api/backup/download'); ui.toast('Backup downloaded'); } catch (err) { ui.fail(err); } finally { btn.disabled = false; }
        });
        ui.on(el, 'change', '[data-file]', async (e, input) => {
            const file = input.files[0];
            input.value = '';
            if (!file) return;
            try {
                if (file.size > MAX_IMPORT) throw new Error('The file is larger than 15 MB.');
                const text = await file.text();
                let meta;
                try { meta = JSON.parse(text); } catch { throw new Error('This file is not a HisabPro backup (it is not JSON).'); }
                if (!meta || meta.app !== 'HisabPro' || meta.kind !== 'backup') throw new Error('This file is not a HisabPro backup.');
                const records = Object.values(meta.counts || {}).reduce((a, n) => a + (Number(n) || 0), 0) || Object.values(meta.tables || {}).reduce((a, r) => a + (Array.isArray(r) ? r.length : 0), 0);
                const ok = await ui.confirm({
                    title: 'Import this backup?', ok: 'Import new records',
                    message: `${file.name}: ${records.toLocaleString('en-US')} records from "${(meta.tenant && meta.tenant.name) || 'unknown shop'}", made ${meta.exportedAt ? fmt.dateTime(meta.exportedAt) : 'at an unknown time'}. Records already here are skipped; nothing is changed or deleted.`,
                });
                if (!ok) return;
                ui.toast('Importing…', 'info');
                const r = await postBackup(text);
                const rows = Object.keys(r.added).filter(k => r.added[k] || r.skipped[k]);
                ui.modal({
                    title: 'Import finished', subtitle: `${r.totalAdded.toLocaleString('en-US')} records added · ${r.totalSkipped.toLocaleString('en-US')} already present (skipped)`, width: 560,
                    body: rows.length ? html`<div class="overflow-hidden rounded-xl border border-line"><table class="tbl"><thead><tr><th>Table</th><th class="!text-right">Added</th><th class="!text-right">Skipped</th></tr></thead>
                      <tbody>${rows.map(k => html`<tr><td>${label(k)}</td><td class="num ${r.added[k] ? 'text-good font-semibold' : ''}">${r.added[k]}</td><td class="num text-muted">${r.skipped[k]}</td></tr>`)}</tbody></table></div>` : html`<p class="text-sm text-muted">The file had no records.</p>`,
                    footer: html`<button class="btn btn-primary" data-close>Done</button>`,
                });
            } catch (err) { ui.fail(err); }
        });
        return () => charts.forEach(c => { try { c && c.destroy(); } catch { } });
    },
});
