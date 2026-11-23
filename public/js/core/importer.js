// The import dialog for lists (products, categories, brands, customers, vendors):
//   1. download the template (a CSV with the right columns and example rows) and fill it in Excel
//   2. upload it (or any CSV: columns are matched by their names — see shared/csvimport.js)
//   3. check the matches and the preview, then import (rows already in HisabPro can be skipped)
// HP.importer.open({ kind, title, endpoint, noun, onDone })
(function () {
    'use strict';
    const { html, raw, icon, t, ui, api, fmt } = HP;

    function template(kind) {
        const tp = CsvImport.schemaOf(kind).template;
        ui.csv(tp.file, tp.header, tp.rows);
    }

    function open({ kind, title, endpoint, noun = 'rows', skipLabel = 'Skip rows already in HisabPro', onDone }) {
        const schema = CsvImport.schemaOf(kind);
        let file = null, mapping = {};
        const m = ui.modal({
            title: t(title), width: 760,
            body: html`<div class="grid gap-3 sm:grid-cols-2">
                <div class="rounded-xl border border-line p-4"><div class="flex items-center gap-2 text-sm font-semibold"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-xs text-accent">1</span>${t('Download the template')}</div>
                  <p class="mt-1 text-xs text-muted">${t('Fill it in Excel (keep the first row), then File → Save As → CSV.')}</p>
                  <button type="button" class="btn btn-outline btn-sm mt-3" data-template>${icon('download')}${t('Download template')}</button></div>
                <label class="flex cursor-pointer flex-col justify-center rounded-xl border-2 border-dashed border-line p-4 hover:bg-surface-2"><div class="flex items-center gap-2 text-sm font-semibold"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-xs text-accent">2</span>${t('Upload the filled file')}</div>
                  <span class="mt-1 text-xs text-muted" data-drop>${t('Click to choose the CSV file')}</span><input type="file" accept=".csv,text/csv,text/plain" class="hidden" data-file></label></div>
              <p class="mt-3 text-xs text-muted">${t('Any column order works: columns are matched by their names, and you can correct the matches below. A file from another shop system works too.')}</p>
              <div data-map class="mt-4"></div><div data-prev class="mt-3"></div>
              <div data-err class="mt-3 hidden max-h-40 overflow-auto rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"></div>`,
            footer: html`<label class="me-auto flex items-center gap-2 text-sm"><input type="checkbox" class="check" data-skip checked>${t(skipLabel)}</label><button class="btn btn-outline" data-close>${t('Cancel')}</button><button class="btn btn-primary" data-go disabled>${t('Import')} 0</button>`,
        });
        const $ = sel => m.el.querySelector(sel);
        const rows = () => (file ? CsvImport.toRows(file, mapping, fmt.toPaisa) : []);
        const label = f => t((schema.fields.find(x => x[0] === f) || [f, f])[1]);
        const isMoney = f => (schema.money || []).includes(f), isQty = f => (schema.qty || []).includes(f);
        function draw() {
            const list = rows();
            const hasName = Object.values(mapping).includes('name');
            const shown = schema.fields.map(f => f[0]).filter(f => f !== 'variant' && Object.values(mapping).includes(f));
            ui.mount($('[data-map]'), file ? html`<div class="text-sm font-medium">${file.header ? t('Columns found in the file — check that each one is matched correctly:') : t('No header row: the columns are read in the template order — change them if needed:')}</div>
                <div class="mt-2 grid gap-2 sm:grid-cols-2">${Array.from({ length: file.columns }, (_, i) => html`<div class="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                    <div class="min-w-0 flex-1"><div class="truncate text-sm font-medium">${file.header ? file.header[i] || `${t('Column')} ${i + 1}` : `${t('Column')} ${i + 1}`}</div><div class="truncate text-xs text-muted">${(file.body[0] || [])[i] || ''}</div></div>
                    <select class="input h-9 w-48" data-col="${i}"><option value="">— ${t('skip')} —</option>${schema.fields.map(([f, l]) => html`<option value="${f}" ${mapping[i] === f ? raw('selected') : ''}>${t(l)}</option>`)}</select></div>`)}</div>
                ${hasName ? '' : html`<p class="mt-2 text-sm text-rose-600">${t('Choose the column that holds the name.')}</p>`}` : '');
            const bad = (f, v) => (isMoney(f) && v !== '' && typeof v !== 'number') || (isQty(f) && v !== '' && !/^-?\d*\.?\d+$/.test(v));
            ui.mount($('[data-prev]'), file ? (list.length ? html`<div class="text-sm font-medium">${t('Preview')} (${list.length})</div>
                <div class="mt-2 max-h-56 overflow-auto rounded-lg border border-line text-xs"><table class="tbl"><thead><tr><th>${t('Line')}</th>${shown.map(f => html`<th class="${isMoney(f) || isQty(f) ? '!text-right' : ''}">${label(f)}</th>`)}</tr></thead>
                  <tbody>${list.slice(0, 30).map(r => html`<tr><td class="text-muted">${r.line}</td>${shown.map(f => html`<td class="${isMoney(f) || isQty(f) ? 'num' : ''} ${bad(f, r[f]) ? 'text-rose-600' : ''}">${isMoney(f) && typeof r[f] === 'number' ? fmt.money(r[f]) : r[f]}</td>`)}</tr>`)}</tbody></table></div>
                ${list.length > 30 ? html`<p class="help">…${t('and')} ${list.length - 30} ${t('more')}</p>` : ''}` : html`<p class="text-sm text-rose-600">${t('Nothing found in the file.')}</p>`) : '');
            const go = $('[data-go]');
            go.disabled = !list.length || !hasName;
            go.textContent = `${t('Import')} ${list.length} ${t(noun)}`;
        }
        $('[data-template]').addEventListener('click', () => template(kind));
        $('[data-file]').addEventListener('change', async e => {
            const f = e.target.files[0]; if (!f) return;
            const err = $('[data-err]'); err.classList.add('hidden');
            if (/\.xlsx?$/i.test(f.name)) { err.textContent = t('This is an Excel file. In Excel choose File → Save As → CSV (Comma delimited), then upload that file.'); err.classList.remove('hidden'); return; }
            file = CsvImport.read(await f.text(), kind);
            mapping = { ...file.mapping };
            $('[data-drop]').textContent = f.name;
            draw();
        });
        m.el.addEventListener('change', e => {
            const sel = e.target.closest('[data-col]'); if (!sel) return;
            const col = sel.dataset.col, f = sel.value;
            for (const k of Object.keys(mapping)) if (mapping[k] === f) delete mapping[k]; // a field comes from one column only
            if (f) mapping[col] = f; else delete mapping[col];
            draw();
        });
        $('[data-go]').addEventListener('click', async e => {
            const btn = e.currentTarget, err = $('[data-err]');
            btn.disabled = true; err.classList.add('hidden');
            try {
                const r = await api.post(endpoint, { rows: rows(), skipExisting: $('[data-skip]').checked });
                m.close();
                ui.toast(`${r.imported} ${t('imported')}${r.skipped ? ` · ${r.skipped} ${t('already in HisabPro, skipped')}` : ''}`);
                if (onDone) onDone(r);
            } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); btn.disabled = false; }
        });
        return m;
    }

    HP.importer = { open, template };
})();
