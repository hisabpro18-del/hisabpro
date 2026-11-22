// UI kit used by every page. Markup follows the reference look; behaviour is plain DOM with delegated events.
(function () {
    'use strict';
    const { html, raw, cls, icon, t } = HP;

    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    // delegated listener: on(root, 'click', '[data-act=save]', (e, el) => …)
    const on = (root, type, sel, fn) => root.addEventListener(type, e => { const el = e.target.closest(sel); if (el && root.contains(el)) fn(e, el); });
    const mount = (el, safe) => { el.innerHTML = String(safe); return el; };

    // ── toasts ──
    function toast(msg, type = 'ok') {
        const box = $('#toasts');
        if (!box) return alert(msg);
        const tone = type === 'error' ? 'border-red-200 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200 dark:border-red-900'
            : type === 'info' ? 'border-line bg-surface text-ink' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900';
        const el = document.createElement('div');
        el.className = `pointer-events-auto slide-in flex max-w-sm items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg ${tone}`;
        el.innerHTML = String(html`${icon(type === 'error' ? 'alert' : type === 'info' ? 'info' : 'checkCircle', 'w-4 h-4 mt-0.5')}<div>${msg}</div>`);
        box.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, type === 'error' ? 6000 : 3000);
    }
    const fail = e => toast((e && e.message) || String(e), 'error');

    // ── overlays (modal / drawer); Escape closes the top one ──
    const stack = [];
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length) { const top = stack[stack.length - 1]; if (!top.persistent) top.close(); } });
    function overlay(kind, { title, subtitle, body = '', footer = '', wide, width, persistent, onClose, headerExtra = '' }) {
        const root = $('#overlay-root');
        const wrap = document.createElement('div');
        const panelCls = kind === 'drawer' ? cls('drawer slide-in', { 'drawer-wide': wide }) : 'modal';
        const style = kind === 'modal' ? `max-width:${width || 520}px` : '';
        wrap.innerHTML = String(html`<div class="scrim" data-scrim></div>
            <div class="${panelCls}" style="${style}" role="dialog" aria-modal="true">
              ${title ? html`<div class="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-line">
                <div class="min-w-0"><h2 class="text-lg font-semibold">${title}</h2>${subtitle ? html`<p class="mt-0.5 text-sm text-muted">${subtitle}</p>` : ''}</div>
                <div class="flex items-center gap-2">${headerExtra}<button class="btn-icon !w-8 !h-8 border-0" data-close aria-label="Close">${icon('x')}</button></div>
              </div>` : ''}
              <div class="flex-1 overflow-y-auto thin-scroll px-6 py-5" data-body>${body}</div>
              ${footer ? html`<div class="flex items-center justify-end gap-2 px-6 py-4 border-t border-line bg-surface-2/60 rounded-b-2xl" data-footer>${footer}</div>` : ''}
            </div>`);
        root.appendChild(wrap);
        const panel = wrap.lastElementChild;
        const ctl = {
            el: panel, wrap, persistent,
            body: panel.querySelector('[data-body]'), footer: panel.querySelector('[data-footer]'),
            close() { const i = stack.indexOf(ctl); if (i >= 0) stack.splice(i, 1); wrap.remove(); if (onClose) onClose(); },
        };
        wrap.querySelector('[data-scrim]').addEventListener('click', () => { if (!persistent) ctl.close(); });
        on(panel, 'click', '[data-close]', () => ctl.close());
        stack.push(ctl);
        setTimeout(() => { const f = panel.querySelector('[autofocus]') || panel.querySelector('[data-body] input:not([type=hidden]):not([disabled]),[data-body] select,[data-body] textarea'); if (f) f.focus(); }, 30);
        return ctl;
    }
    const modal = o => overlay('modal', o);
    const drawer = o => overlay('drawer', o);

    function confirm({ title = 'Are you sure?', message = '', ok = 'Confirm', danger = false } = {}) {
        return new Promise(resolve => {
            let done = false;
            const m = modal({
                title, width: 440, body: html`<p class="text-sm text-muted">${message}</p>`,
                footer: html`<button class="btn btn-outline" data-close>${t('Cancel')}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${ok}</button>`,
                onClose: () => { if (!done) resolve(false); },
            });
            m.el.querySelector('[data-ok]').addEventListener('click', () => { done = true; m.close(); resolve(true); });
        });
    }

    // ── form fields ──
    const attrs = a => raw(Object.entries(a || {}).filter(([, v]) => v !== false && v !== null && v !== undefined).map(([k, v]) => (v === true ? k : `${k}="${HP.esc(v)}"`)).join(' '));
    // money: true → the value is paisa and the input shows rupees; readForm gives paisa back
    function field(o) {
        const { label, name, type = 'text', value = '', placeholder = '', required, help, half, third, money, options, rows, attr, cls: extra, disabled, readonly, step } = o;
        const id = 'f_' + name + '_' + Math.random().toString(36).slice(2, 7);
        const wrapCls = cls(half ? 'col-span-12 sm:col-span-6' : third ? 'col-span-12 sm:col-span-4' : 'col-span-12', extra);
        let control;
        const common = { id, name, required: !!required, disabled: !!disabled, readonly: !!readonly, ...attr };
        if (type === 'select') {
            control = html`<select class="input" ${attrs(common)}>${(options || []).map(op => { const [v, l] = Array.isArray(op) ? op : [op, op]; return html`<option value="${v}" ${String(v) === String(value ?? '') ? raw('selected') : ''}>${l}</option>`; })}</select>`;
        } else if (type === 'textarea') {
            control = html`<textarea class="input" rows="${rows || 3}" placeholder="${placeholder}" ${attrs(common)}>${value}</textarea>`;
        } else if (type === 'checkbox') {
            return html`<label class="${wrapCls} flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" class="check" ${attrs({ ...common, checked: !!value })}><span>${label}</span>${help ? html`<span class="text-xs text-muted">${help}</span>` : ''}</label>`;
        } else if (type === 'switch') {
            return html`<div class="${wrapCls} flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
              <div><div class="text-sm font-medium">${label}</div>${help ? html`<div class="text-xs text-muted">${help}</div>` : ''}</div>
              <button type="button" class="switch ${value ? 'on' : ''}" data-switch="${name}" aria-pressed="${value ? 'true' : 'false'}" aria-label="${label}"></button>
              <input type="hidden" name="${name}" value="${value ? 'true' : 'false'}" data-bool></div>`;
        } else {
            const v = money ? HP.fmt.rupees(value, true) : value;
            control = html`<input class="input" type="${money ? 'number' : type}" value="${v ?? ''}" placeholder="${placeholder}" ${attrs({ ...common, step: step || (money ? '0.01' : type === 'number' ? 'any' : null), min: (money || type === 'number') && o.min !== null ? (o.min ?? 0) : null, 'data-money': money ? '1' : null, inputmode: money || type === 'number' ? 'decimal' : null })}>`;
        }
        return html`<div class="${wrapCls}">${label ? html`<label class="label" for="${id}">${label}${required ? html`<span class="text-rose-500"> *</span>` : ''}</label>` : ''}${control}${help ? html`<p class="help">${help}</p>` : ''}</div>`;
    }
    const grid = (...items) => html`<div class="grid grid-cols-12 gap-4">${items}</div>`;
    const section = (title, ...items) => html`<div class="mt-6 first:mt-0"><div class="eyebrow mb-3">${title}</div>${grid(...items)}</div>`;

    // name → value; numbers stay strings unless data-money (→ paisa) or type=number (→ Number); checkboxes → boolean
    function readForm(root) {
        const out = {};
        for (const el of $$('input[name],select[name],textarea[name]', root)) {
            const n = el.name;
            if (el.type === 'checkbox') out[n] = el.checked;
            else if (el.dataset.bool !== undefined) out[n] = el.value === 'true';
            else if (el.dataset.money) out[n] = el.value === '' ? 0 : HP.fmt.toPaisa(el.value);
            else if (el.type === 'number') out[n] = el.value === '' ? '' : Number(el.value);
            else out[n] = el.value.trim();
        }
        return out;
    }
    // switches flip their hidden input
    document.addEventListener('click', e => {
        const sw = e.target.closest('[data-switch]');
        if (!sw) return;
        const on2 = !sw.classList.contains('on');
        sw.classList.toggle('on', on2); sw.setAttribute('aria-pressed', String(on2));
        const hidden = sw.parentElement.querySelector(`input[name="${sw.dataset.switch}"]`);
        if (hidden) { hidden.value = on2 ? 'true' : 'false'; hidden.dispatchEvent(new Event('change', { bubbles: true })); }
    });

    // A drawer with a form: onSubmit(values) may return a promise; errors show in the drawer and keep it open.
    function formDrawer({ title, subtitle, body, submit = t('Save'), onSubmit, wide, onMount, extraFooter = '' }) {
        const d = drawer({
            title, subtitle, wide,
            body: html`<form data-form novalidate>${body}<div data-error class="hidden mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200 dark:border-red-900"></div><button type="submit" class="hidden"></button></form>`,
            footer: html`${extraFooter}<button type="button" class="btn btn-outline" data-close>${t('Cancel')}</button><button type="button" class="btn btn-primary" data-submit>${submit}</button>`,
        });
        const form = d.el.querySelector('[data-form]');
        const errBox = d.el.querySelector('[data-error]');
        const btn = d.el.querySelector('[data-submit]');
        async function go(e) {
            if (e) e.preventDefault();
            const bad = $$('[required]', form).find(el => !String(el.value).trim());
            if (bad) { bad.focus(); errBox.textContent = `${(bad.closest('div')?.querySelector('label')?.textContent || 'This field').replace('*', '').trim()} is required.`; errBox.classList.remove('hidden'); return; }
            errBox.classList.add('hidden');
            btn.disabled = true;
            try { await onSubmit(readForm(form), d, form); }
            catch (err) { errBox.textContent = err.message; errBox.classList.remove('hidden'); }
            finally { btn.disabled = false; }
        }
        form.addEventListener('submit', go);
        btn.addEventListener('click', go);
        if (onMount) onMount(form, d);
        return d;
    }

    // ── building blocks ──
    const pageHeader = ({ title, subtitle, actions = '', iconName }) => html`<div class="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div class="flex items-start gap-3">${iconName ? html`<div class="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">${icon(iconName, 'w-5 h-5')}</div>` : ''}
        <div><h1 class="text-2xl font-bold tracking-tight">${title}</h1>${subtitle ? html`<p class="mt-1 text-sm text-muted">${subtitle}</p>` : ''}</div></div>
        <div class="flex flex-wrap items-center gap-2">${actions}</div></div>`;

    const TONE = {
        accent: 'bg-accent-soft text-accent', good: 'bg-good-soft text-good', bad: 'bg-bad-soft text-bad', warn: 'bg-warn-soft text-warn',
        gray: 'bg-surface-2 text-muted', blue: 'bg-sky-50 text-sky-600 dark:bg-sky-950', orange: 'bg-orange-50 text-orange-600 dark:bg-orange-950',
    };
    const VALUE_TONE = { good: 'text-good', bad: 'text-bad', warn: 'text-warn', accent: 'text-accent' };
    const statCard = ({ label, value, iconName = 'chart', tone = 'gray', valueTone, sub = '', badge = '' }) => html`<div class="card card-pad flex items-start justify-between gap-3">
        <div class="min-w-0"><div class="flex items-center gap-2 text-sm text-muted">${label}${badge}</div>
          <div class="mt-2 text-2xl font-bold tracking-tight ${VALUE_TONE[valueTone] || ''} break-words">${value}</div>${sub ? html`<div class="mt-1 text-xs text-muted">${sub}</div>` : ''}</div>
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${TONE[tone] || TONE.gray}">${icon(iconName, 'w-5 h-5')}</div></div>`;

    const badge = (text, tone = 'gray', dot = true) => html`<span class="badge badge-${tone} ${dot ? 'badge-dot' : ''}">${text}</span>`;
    const spinner = (c = 'w-5 h-5') => html`<svg class="${c} spin text-muted" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity=".25" stroke-width="3"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;
    const loading = () => html`<div class="flex items-center justify-center py-16">${spinner('w-7 h-7')}</div>`;
    const empty = ({ iconName = 'box', title = t('Nothing here yet.'), text = '', action = '' } = {}) => html`<div class="flex flex-col items-center justify-center px-6 py-14 text-center">
        <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-muted shadow-sm">${icon(iconName, 'w-7 h-7')}</div>
        <div class="text-base font-semibold">${title}</div>${text ? html`<p class="mt-1 max-w-md text-sm text-muted">${text}</p>` : ''}${action ? html`<div class="mt-5">${action}</div>` : ''}</div>`;

    // columns: [{ key, label, num, render(row) → Safe|string, cls, sort }]
    function table({ columns, rows, empty: emptyOpts, rowAttr }) {
        if (!rows || !rows.length) return html`<div class="card">${typeof emptyOpts === 'string' ? html`<div class="py-12 text-center text-sm text-muted">${emptyOpts}</div>` : empty(emptyOpts || {})}</div>`;
        return html`<div class="card overflow-x-auto thin-scroll"><table class="tbl"><thead><tr>${columns.map(c => html`<th class="${cls(c.num && '!text-right', c.thCls)}">${c.label}</th>`)}</tr></thead>
          <tbody>${rows.map(r => html`<tr ${rowAttr ? raw(rowAttr(r)) : ''}>${columns.map(c => html`<td class="${cls(c.num && 'num', c.cls)}">${c.render ? c.render(r) : r[c.key]}</td>`)}</tr>`)}</tbody></table></div>`;
    }

    const seg = (name, options, value) => html`<div class="seg" data-seg="${name}">${options.map(([v, l]) => html`<button type="button" data-v="${v}" class="${String(v) === String(value) ? 'on' : ''}">${l}</button>`)}</div>`;
    const tabs = (name, options, value) => html`<div class="tabs" data-tabs="${name}">${options.map(([v, l]) => html`<button type="button" data-v="${v}" class="${v === value ? 'on' : ''}">${l}</button>`)}</div>`;

    // kebab / dropdown menu next to an element. items: [{ label, iconName, danger, onClick }]
    function menu(anchor, items) {
        closeMenus();
        const r = anchor.getBoundingClientRect();
        const el = document.createElement('div');
        el.className = 'popover py-1 min-w-[190px]';
        el.dataset.menu = '1';
        el.style.position = 'fixed';
        el.innerHTML = String(html`${items.filter(Boolean).map((it, i) => html`<button type="button" data-i="${i}" class="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-surface-2 ${it.danger ? 'text-rose-600' : ''}">${icon(it.iconName || 'chevronRight')}${it.label}</button>`)}`);
        document.body.appendChild(el);
        const list = items.filter(Boolean);
        const w = el.offsetWidth, h = el.offsetHeight;
        el.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px';
        el.style.top = (r.bottom + h + 8 > window.innerHeight ? r.top - h - 4 : r.bottom + 4) + 'px';
        el.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; closeMenus(); list[+b.dataset.i].onClick(); });
        setTimeout(() => document.addEventListener('click', closeMenus, { once: true }), 0);
    }
    // suggestion lists live on <body>: the ones whose input left the page (re-render, page change) are removed
    const acs = new Set();
    const sweepAc = () => acs.forEach(a => { if (!a.input.isConnected) { a.box.remove(); acs.delete(a); } });
    const closeMenus = () => { $$('[data-menu]').forEach(m => m.remove()); sweepAc(); };

    // Autocomplete on an input. search(q) → [{ id, label, sub }]; onPick(item)
    function autocomplete(input, { search, onPick, minChars = 0, onEnter }) {
        sweepAc();
        const box = document.createElement('div');
        box.className = 'popover hidden max-h-72 overflow-y-auto thin-scroll py-1';
        box.style.position = 'fixed';
        document.body.appendChild(box);
        const rec = { input, box };
        acs.add(rec);
        let items = [], active = -1, seq = 0;
        const place = () => { const r = input.getBoundingClientRect(); box.style.left = r.left + 'px'; box.style.top = r.bottom + 4 + 'px'; box.style.width = Math.max(r.width, 260) + 'px'; };
        const hide = () => box.classList.add('hidden');
        const draw = () => {
            box.innerHTML = String(items.length ? html`${items.map((it, i) => html`<button type="button" data-i="${i}" class="block w-full px-3 py-2 text-left text-sm ${i === active ? 'bg-accent-soft' : 'hover:bg-surface-2'}"><div class="font-medium truncate">${it.label}</div>${it.sub ? html`<div class="text-xs text-muted truncate">${it.sub}</div>` : ''}</button>`)}` : html`<div class="px-3 py-2 text-sm text-muted">No matches</div>`);
            place(); box.classList.remove('hidden');
        };
        const run = async () => {
            const q = input.value.trim();
            if (q.length < minChars) { hide(); return; }
            const my = ++seq;
            const res = await search(q);
            if (my !== seq || document.activeElement !== input) return;
            items = res || []; active = items.length ? 0 : -1; draw();
        };
        let tmr;
        input.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(run, 120); });
        input.addEventListener('focus', run);
        input.addEventListener('blur', () => setTimeout(hide, 180));
        input.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown' && items.length) { active = (active + 1) % items.length; draw(); e.preventDefault(); }
            else if (e.key === 'ArrowUp' && items.length) { active = (active - 1 + items.length) % items.length; draw(); e.preventDefault(); }
            else if (e.key === 'Enter') {
                if (onEnter && onEnter(input.value.trim()) === true) { hide(); e.preventDefault(); return; }
                if (!box.classList.contains('hidden') && items[active]) { onPick(items[active]); hide(); e.preventDefault(); }
            } else if (e.key === 'Escape' && !box.classList.contains('hidden')) { hide(); e.stopPropagation(); } // close the list only, not the drawer around it
        });
        box.addEventListener('mousedown', e => { const b = e.target.closest('[data-i]'); if (b) { e.preventDefault(); onPick(items[+b.dataset.i]); hide(); } });
        return { destroy: () => { box.remove(); acs.delete(rec); }, refresh: run };
    }

    // ── date range picker (dashboard, reports) ──
    const PRESETS = [['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['last30', 'Last 30 Days'], ['lastMonth', 'Last Month'], ['year', 'This Year'], ['fiscal', 'Fiscal Year']];
    const presetLabel = r => (r.preset === 'custom' ? `${HP.fmt.date(r.from)} – ${HP.fmt.date(r.to)}` : t((PRESETS.find(p => p[0] === r.preset) || [, 'This Month'])[1]));
    function rangeButton(r) {
        return html`<button type="button" class="card flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2" data-range>
          <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">${icon('calendar')}</span>
          <span><span class="eyebrow block">${t('DATE RANGE')}</span><span class="text-sm font-semibold">${presetLabel(r)}</span></span>${icon('chevronDown', 'w-4 h-4 text-muted')}</button>`;
    }
    function rangePopover(anchor, cur, onPick) {
        closeMenus();
        const r = anchor.getBoundingClientRect();
        const el = document.createElement('div');
        el.className = 'popover p-2 w-72'; el.dataset.menu = '1'; el.style.position = 'fixed';
        el.style.top = r.bottom + 6 + 'px'; el.style.left = Math.max(8, r.right - 288) + 'px';
        el.innerHTML = String(html`${PRESETS.map(([v, l]) => html`<button type="button" data-p="${v}" class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${cur.preset === v ? 'bg-accent-soft text-accent font-medium' : 'hover:bg-surface-2'}">${t(l)}${cur.preset === v ? html`<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>` : ''}</button>`)}
          <div class="my-2 border-t border-line"></div><div class="eyebrow px-3 mb-2">CUSTOM RANGE</div>
          <div class="grid grid-cols-2 gap-2 px-2"><input type="date" class="input h-9" data-from value="${cur.from || ''}"><input type="date" class="input h-9" data-to value="${cur.to || ''}"></div>
          <div class="px-2 pt-2"><button type="button" class="btn btn-primary btn-sm w-full" data-apply>Apply</button></div>`);
        document.body.appendChild(el);
        el.addEventListener('click', e => {
            e.stopPropagation();
            const p = e.target.closest('[data-p]');
            if (p) { closeMenus(); onPick({ preset: p.dataset.p }); }
            if (e.target.closest('[data-apply]')) { const f = el.querySelector('[data-from]').value, to = el.querySelector('[data-to]').value; if (f && to) { closeMenus(); onPick({ preset: 'custom', from: f, to }); } }
        });
        setTimeout(() => document.addEventListener('click', closeMenus, { once: true }), 0);
    }

    // ── charts (Chart.js, loaded from /vendor) ──
    const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    function chart(canvas, config) {
        if (!window.Chart || !canvas) return null;
        const grid = css('--color-line'), text = css('--color-muted');
        window.Chart.defaults.color = text;
        window.Chart.defaults.font.family = css('--font-sans') || 'system-ui';
        const c = new window.Chart(canvas, config);
        canvas._chart = c;
        c.options.scales && Object.values(c.options.scales).forEach(s => { if (s.grid) s.grid.color = grid; });
        c.update();
        return c;
    }
    const PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];

    // ── CSV (client side, for lists already on screen) and printing ──
    function csv(filename, header, rows) {
        // a cell a spreadsheet could run as a formula (= + - @ tab CR first) gets a leading ' — but a real number such
        // as -1250.5 stays a number
        const NUM = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
        const cell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s) && !NUM.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
        const text = '﻿' + [header, ...rows].map(r => r.map(cell).join(',')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
        a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    }
    function print(safeHtml) {
        let root = $('#print-root');
        if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
        root.innerHTML = String(safeHtml);
        // let barcodes / images render before printing
        const silent = window.hpDesktop && HP.session && HP.session.settings && HP.session.settings.receipt && HP.session.settings.receipt.autoPrint;
        setTimeout(() => { if (HP.ui.afterPrintRender) HP.ui.afterPrintRender(root); setTimeout(() => (silent ? window.hpDesktop.printSilent() : window.print()), 150); }, 50);
    }

    // file → data: URL, shrunk to maxPx on the longer side; JPEG quality steps down until it fits in maxBytes.
    // { jpeg: true } always saves a JPEG (product photos: much smaller than PNG; the database plan is 500 MB)
    function readImage(file, maxPx = 512, maxBytes = 800 * 1024, { jpeg = false } = {}) {
        return new Promise((resolve, reject) => {
            if (!file) return resolve('');
            if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return reject(new Error('Choose a PNG or JPG image.'));
            if (file.size > 15 * 1024 * 1024) return reject(new Error('That image is too large.'));
            const img = new Image();
            img.onload = () => {
                const s = Math.min(1, maxPx / Math.max(img.width, img.height));
                const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
                const g = c.getContext('2d');
                const asJpeg = jpeg || file.type !== 'image/png';
                if (asJpeg) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); } // transparent parts → white, not black
                g.drawImage(img, 0, 0, c.width, c.height);
                const limit = maxBytes * 1.37; // base64 is about 4/3 of the bytes
                let url = asJpeg ? '' : c.toDataURL('image/png');
                if (!url || url.length > limit) {
                    let src = c;
                    if (!asJpeg) { src = document.createElement('canvas'); src.width = c.width; src.height = c.height; const w = src.getContext('2d'); w.fillStyle = '#ffffff'; w.fillRect(0, 0, c.width, c.height); w.drawImage(c, 0, 0); }
                    for (const q of [0.85, 0.75, 0.65, 0.55, 0.45]) { url = src.toDataURL('image/jpeg', q); if (url.length <= limit) break; }
                }
                URL.revokeObjectURL(img.src);
                if (url.length > limit) return reject(new Error('That image is too large after shrinking.'));
                resolve(url);
            };
            img.onerror = () => reject(new Error('That file is not a readable image.'));
            img.src = URL.createObjectURL(file);
        });
    }
    function readFile(file, maxBytes = 2 * 1024 * 1024) {
        return new Promise((resolve, reject) => {
            if (!file) return resolve(null);
            if (file.size > maxBytes) return reject(new Error(`The file is larger than ${Math.round(maxBytes / 1024)} KB.`));
            const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('Could not read the file.')); r.readAsDataURL(file);
        });
    }

    HP.ui = { $, $$, on, mount, toast, fail, modal, drawer, confirm, field, grid, section, readForm, formDrawer, pageHeader, statCard, badge, spinner, loading, empty, table, seg, tabs, menu, closeMenus, autocomplete, rangeButton, rangePopover, presetLabel, chart, PALETTE, csv, print, readImage, readFile, css };
})();
