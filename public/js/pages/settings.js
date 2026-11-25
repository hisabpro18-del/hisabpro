// Settings (Company Profile, Receipt & POS, Localization) and Users (read-only: HisabPro administration adds and changes
// users). Fields, defaults and labels follow reference/REFERENCE.md › Settings and › Users.
const { html, raw, icon, api, ui, fmt, t } = HP;

const SWATCHES = ['#4f46e5', '#0ea5e9', '#059669', '#d97706', '#dc2626', '#7c3aed', '#18181b'];
const FONTS = ['Inter', 'Roboto', 'Georgia', 'Times New Roman'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TIMEZONES = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return ['Asia/Karachi', 'Asia/Dubai', 'Asia/Riyadh', 'Europe/London', 'America/New_York']; } })();
const LAYOUT = [
    ['showLogo', 'Show Logo', ''], ['showTaxId', 'Show Tax ID (GST / NTN)', ''], ['showCustomer', 'Show Customer Info', ''],
    ['showSavings', 'Show Savings', 'Total amount saved on bill'], ['amountInWords', 'Amount in Words', ''], ['showTerms', 'Terms & Conditions', ''], ['showQr', 'QR Code (Scan & Pay)', ''],
    ['showPrevBalance', 'Show Previous Balance / Ledger', 'Credit / udhar running balance on invoice'], ['showBank', 'Show Bank Details', 'Wire transfer instructions for B2B'],
    ['showCashier', 'Show Salesman / Cashier Name', ''], ['showSignature', 'Show Digital Signature Line', 'Space for physical stamp or signature'],
];
const TABS = [['company', 'Company Profile', 'building'], ['receipt', 'Receipt & POS', 'receipt'], ['localization', 'Localization', 'globe']];
// the Windows app also gets "App update" (one click to install a new version)
// … and the Android app gets "Phone app" (Bluetooth receipt printer, app version)
const tabsHere = () => [...TABS, ...(HP.updates && HP.updates.available() ? [['update', 'App update', 'download']] : []), ...(HP.native && HP.native.isApp() ? [['phone', 'Phone app', 'smartphone']] : [])];

const subCard = (title, sub, body) => html`<div class="rounded-xl border border-line p-5"><div class="font-semibold">${title}</div><div class="mb-4 mt-0.5 text-xs text-muted">${sub}</div>${body}</div>`;
const choiceCard = (name, value, cur, iconName, title, caption, compact) => html`<button type="button" data-choice="${name}" data-v="${value}" aria-pressed="${value === cur ? 'true' : 'false'}"
    class="rounded-xl border p-4 text-left transition ${value === cur ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-line hover:bg-surface-2'}">
    <div class="flex items-center gap-3 ${compact ? '' : 'flex-col items-start'}"><span class="flex h-8 w-8 items-center justify-center rounded-lg ${value === cur ? 'bg-accent text-white' : 'bg-surface-2 text-muted'}">${icon(iconName, 'w-4 h-4')}</span><span class="text-sm font-semibold">${title}</span></div>
    <div class="mt-2 text-xs text-muted">${caption}</div></button>`;
const segChoice = (name, options, cur) => html`<div class="inline-flex overflow-hidden rounded-lg border border-line">${options.map(([v, l]) => html`<button type="button" data-choice="${name}" data-v="${v}" class="h-9 px-4 text-sm font-medium ${v === cur ? 'bg-accent text-white' : 'bg-surface hover:bg-surface-2'}">${l}</button>`)}</div>`;

HP.page('/settings', {
    title: 'Settings', perm: 'settings.manage',
    async render(el, params, query) {
        let tab = tabsHere().some(x => x[0] === query.tab) ? query.tab : 'company';
        let s = await api.get('/api/settings');
        let logo = s.company.logo || '';
        let rc = { ...s.receipt }, pos = { ...s.pos };

        const company = () => html`<div class="text-lg font-semibold">Company Profile</div><p class="mt-1 text-sm text-muted">Business identity shown on invoices, receipts, and reports</p>
            <form data-form class="mt-6" novalidate>${ui.grid(
                ui.field({ label: 'Name', name: 'name', value: s.company.name, required: true, half: true }),
                ui.field({ label: 'Phone', name: 'phone', value: s.company.phone, half: true }),
                ui.field({ label: 'Email', name: 'email', type: 'email', value: s.company.email, half: true }),
                ui.field({ label: 'Tax ID / NTN', name: 'taxId', value: s.company.taxId, half: true }),
                ui.field({ label: 'Address', name: 'address', value: s.company.address }),
                html`<div class="col-span-12"><div class="label">Company Logo</div><div class="flex items-start gap-4">
                    <div class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-line bg-white" data-logo-prev>${logo ? html`<img src="${logo}" alt="Company logo" class="h-full w-full object-contain">` : icon('image', 'w-6 h-6 text-faint')}</div>
                    <div><input type="file" accept="image/png,image/jpeg" data-logo-file aria-label="Choose file" class="block text-sm text-muted file:me-3 file:cursor-pointer file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:bg-surface-2">
                      ${logo ? html`<button type="button" class="mt-2 text-xs text-rose-600" data-logo-remove>Remove logo</button>` : ''}</div></div>
                  <p class="help">Shown on printed receipts. Max 150 KB.</p></div>`)}
              <div class="mt-6 border-t border-line pt-5"><button class="btn btn-primary" data-save>${t('Save')}</button></div></form>`;

        const receipt = () => html`<div class="text-lg font-semibold">Receipt & POS</div><p class="mt-1 text-sm text-muted">Invoice configuration engine — templates, B2B layout, branding, and automation</p>
            <p class="mt-4 text-sm text-muted">Enterprise invoice configuration — templates, B2B layout, branding, and print automation. Saved for the whole shop and used by every counter and PC.</p>
            <form data-form class="mt-5 space-y-5" novalidate>
              <input type="hidden" name="paper" value="${rc.paper}"><input type="hidden" name="width" value="${rc.width}"><input type="hidden" name="template" value="${rc.template}"><input type="hidden" name="defaultMode" value="${pos.defaultMode}">
              ${subCard('Template & Size Engine', 'Choose paper format, size, and visual invoice template', html`
                <div class="eyebrow mb-2">PAPER FORMAT</div><div class="grid gap-3 sm:grid-cols-2">${choiceCard('paper', 'THERMAL', rc.paper, 'receipt', 'Thermal Receipt', '80mm / 58mm roll — retail POS')}${choiceCard('paper', 'STANDARD', rc.paper, 'file', 'Standard Invoice', 'A4 / A5 — B2B wholesale & corporate')}</div>
                <div class="eyebrow mb-2 mt-5">${rc.paper === 'STANDARD' ? 'PAGE SIZE' : 'THERMAL WIDTH'}</div>${rc.paper === 'STANDARD' ? segChoice('width', [['A4', 'A4'], ['A5', 'A5']], rc.width) : segChoice('width', [['80', '80mm'], ['58', '58mm']], rc.width)}
                <div class="eyebrow mb-2 mt-5">VISUAL TEMPLATE</div><div class="grid gap-3 sm:grid-cols-3">${choiceCard('template', 'STANDARD', rc.template, 'receipt', 'Standard', 'Balanced retail layout', true)}${choiceCard('template', 'COMPACT', rc.template, 'minus', 'Compact (Save Paper)', 'Dense lines, minimal spacing', true)}${choiceCard('template', 'SUPERMARKET', rc.template, 'cart', 'Supermarket', 'High-volume SKU layout', true)}</div>`)}
              ${subCard('Brand Configuration', 'Theme A4/A5 invoices with your corporate identity', html`<div class="grid gap-6 md:grid-cols-2">
                <div><div class="text-sm font-medium">Primary Brand Color</div><div class="mb-3 text-xs text-muted">Applied to invoice headers, accents, and table bands</div>
                  <div class="flex flex-wrap gap-2.5">${SWATCHES.map(c => html`<button type="button" data-swatch="${c}" aria-label="Brand color ${c}" class="h-8 w-8 rounded-full border-2 border-surface ${c.toLowerCase() === String(rc.brandColor).toLowerCase() ? 'ring-2 ring-offset-2 ring-accent ring-offset-surface' : ''}" style="background:${c}"></button>`)}</div>
                  <div class="mt-3 flex items-center gap-2"><input type="color" class="h-10 w-12 cursor-pointer rounded-lg border border-line bg-surface p-1" data-color value="${rc.brandColor}" aria-label="Pick a color"><input class="input font-mono uppercase" name="brandColor" value="${rc.brandColor}" maxlength="7" data-hex></div></div>
                <div>${ui.field({ label: 'Typography', name: 'font', type: 'select', value: rc.font, options: FONTS, help: 'Invoice body and heading font family' })}
                  <div class="mt-3 rounded-lg border border-line border-t-4 px-4 py-3" style="border-top-color:${rc.brandColor}" data-preview><div class="text-[11px] text-muted" style="font-family:${rc.font}">Preview</div><div class="mt-1 font-semibold" style="font-family:${rc.font}">Tax Invoice — ${rc.font}</div></div></div></div>`)}
              ${subCard('Receipt Print Layout', 'ERP-level fields and compliance toggles for every printout', html`<div class="grid grid-cols-12 gap-3">
                ${LAYOUT.map(([k, l, h]) => ui.field({ name: k, label: l, help: h, type: 'switch', value: rc[k], half: true }))}
                <div class="col-span-12 rounded-xl border border-line px-4 py-3"><div class="text-sm font-medium">QR Code Type</div><div class="mb-2 text-xs text-muted">Payload format when QR Code is enabled</div>
                  <select class="input" name="qrType">${[['STANDARD', 'Standard Link'], ['PAYMENT', 'Payment UPI'], ['TAX', 'Tax Authority Compliant']].map(([v, l]) => html`<option value="${v}" ${v === rc.qrType ? raw('selected') : ''}>${l}</option>`)}</select></div>
                ${ui.field({ name: 'bankDetails', label: 'Bank details (printed when "Show Bank Details" is on)', type: 'textarea', rows: 2, value: rc.bankDetails, placeholder: 'Bank, account title, IBAN' })}</div>`)}
              ${subCard('Print Automation', 'Rules for silent printing after save or checkout', html`<div class="grid grid-cols-12 gap-3">
                ${ui.field({ name: 'autoPrint', label: 'Auto-Print on Save', help: 'Send to printer immediately after invoice is saved', type: 'switch', value: rc.autoPrint, half: true })}
                <div class="col-span-12 rounded-xl border border-line px-4 py-3 sm:col-span-6"><div class="text-sm font-medium">Default Print Copies</div><div class="mb-2 text-xs text-muted">1 = Customer · 2 = Customer + Merchant · 3 = Logistics</div>
                  <div class="flex items-center gap-3"><input class="input w-24" type="number" min="1" max="3" step="1" name="copies" value="${rc.copies}" aria-label="Default Print Copies"><span class="flex gap-1.5 text-faint">${icon('printer', 'w-4 h-4')}${icon('grid', 'w-4 h-4')}${icon('barcode', 'w-4 h-4')}${icon('wand', 'w-4 h-4')}</span></div></div></div>`)}
              ${subCard('POS Preferences', 'How the POS Terminal behaves on every counter', html`<div class="grid grid-cols-12 gap-3">
                ${ui.field({ name: 'allowNegativeStock', label: 'Allow selling below zero stock', help: 'Off: a sale is refused when stock would go below zero', type: 'switch', value: pos.allowNegativeStock, half: true })}
                ${ui.field({ name: 'wholesaleMode', label: 'Wholesale Mode', help: 'Start the POS with wholesale prices', type: 'switch', value: pos.wholesaleMode, half: true })}
                <div class="col-span-12 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3"><div><div class="text-sm font-medium">Default POS screen</div><div class="text-xs text-muted">What the POS Terminal opens with</div></div>${segChoice('defaultMode', [['VISUAL', 'Visual / Touch'], ['BARCODE', 'Retail / Barcode']], pos.defaultMode)}</div></div>`)}
              <div class="border-t border-line pt-5"><div class="font-semibold">Document Numbering & Legal Text</div><div class="mb-4 mt-0.5 text-xs text-muted">Server-synced fields shown on all invoice templates</div>
                ${ui.grid(
                    ui.field({ label: 'Invoice Prefix', name: 'invoicePrefix', value: s.numbering.invoicePrefix, half: true, required: true }),
                    ui.field({ label: 'Purchase Prefix', name: 'purchasePrefix', value: s.numbering.purchasePrefix, half: true, required: true }),
                    ui.field({ label: 'Invoice Footer / Thank You', name: 'footer', value: s.numbering.footer }),
                    ui.field({ label: 'Terms & Conditions', name: 'terms', value: s.numbering.terms }))}</div>
              <div class="border-t border-line pt-5"><button class="btn btn-primary" data-save>${t('Save')}</button></div></form>`;

        const localization = () => html`<div class="text-lg font-semibold">Localization</div><p class="mt-1 text-sm text-muted">Currency, language, timezone, and inventory alert preferences</p>
            <form data-form class="mt-6" novalidate>${ui.grid(
                ui.field({ label: 'Currency Symbol', name: 'currencySymbol', value: s.localization.currencySymbol, half: true, required: true }),
                ui.field({ label: 'Currency Code', name: 'currencyCode', value: s.localization.currencyCode, half: true, required: true }),
                ui.field({ label: 'Language (default)', name: 'language', type: 'select', value: s.localization.language, half: true, options: [['en', 'English'], ['ur', 'اردو']] }),
                html`<div class="col-span-12 sm:col-span-6"><label class="label" for="loc-tz">Timezone</label><input id="loc-tz" class="input" name="timezone" list="tz-list" value="${s.localization.timezone}" required autocomplete="off"><datalist id="tz-list">${TIMEZONES.map(z => html`<option value="${z}"></option>`)}</datalist><p class="help">Days, "today" and reports follow this zone.</p></div>`,
                ui.field({ label: 'Expiry Reminder (days)', name: 'expiryReminderDays', type: 'number', value: s.localization.expiryReminderDays, half: true, min: 1, help: 'Reminders lists items expiring within this many days (and the next window).' }),
                ui.field({ label: 'Fiscal Year Starts', name: 'fiscalStartMonth', type: 'select', value: s.localization.fiscalStartMonth, half: true, options: MONTHS.map((m, i) => [i + 1, m]), help: 'Used by the "Fiscal Year" period on reports (Pakistan: July).' }))}
              <div class="mt-6 border-t border-line pt-5"><button class="btn btn-primary" data-save>${t('Save')}</button></div></form>`;

        function draw() {
            history.replaceState({}, '', `/settings${tab === 'company' ? '' : `?tab=${tab}`}`);
            ui.mount(el, html`<div class="mb-6 flex items-start gap-3"><div class="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">${icon('sliders', 'w-5 h-5')}</div>
                <div><h1 class="text-2xl font-bold tracking-tight">${t('Settings')}</h1><p class="mt-1 text-sm text-muted">Core business configuration — modular ERP settings engine</p></div></div>
              <div class="grid items-start gap-6 lg:grid-cols-[260px_1fr]">
                <div class="card p-2">${tabsHere().map(([v, l, ic]) => html`<button type="button" data-tab="${v}" class="flex w-full items-center gap-3 rounded-lg px-4 h-11 text-sm ${v === tab ? 'bg-accent-soft font-semibold text-accent' : 'hover:bg-surface-2'}">${icon(ic, 'w-4 h-4')}${l}</button>`)}</div>
                <div class="card p-6 sm:p-8" data-panel>${tab === 'company' ? company() : tab === 'receipt' ? receipt() : tab === 'update' || tab === 'phone' ? '' : localization()}</div>
              </div>`);
            if (tab === 'update') HP.updates.card(el.querySelector('[data-panel]'));
            if (tab === 'phone') HP.native.settingsCard(el.querySelector('[data-panel]'));
        }
        // keep what was typed when a choice card re-draws the receipt tab
        const keepReceipt = () => {
            const form = el.querySelector('[data-form]');
            if (!form || tab !== 'receipt') return;
            const v = ui.readForm(form);
            for (const k of Object.keys(rc)) if (v[k] !== undefined) rc[k] = v[k];
            for (const k of Object.keys(pos)) if (v[k] !== undefined) pos[k] = v[k];
            Object.assign(s.numbering, { invoicePrefix: v.invoicePrefix, purchasePrefix: v.purchasePrefix, footer: v.footer, terms: v.terms });
        };

        ui.on(el, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; draw(); });
        ui.on(el, 'click', '[data-choice]', (e, b) => {
            keepReceipt();
            const name = b.dataset.choice, v = b.dataset.v;
            if (name === 'defaultMode') pos.defaultMode = v;
            else rc[name] = v;
            if (name === 'paper') rc.width = v === 'STANDARD' ? (['A4', 'A5'].includes(rc.width) ? rc.width : 'A4') : (['80', '58'].includes(rc.width) ? rc.width : '80');
            draw();
        });
        const setColor = c => {
            rc.brandColor = c;
            el.querySelector('[data-hex]').value = c.toUpperCase(); el.querySelector('[data-color]').value = c;
            el.querySelector('[data-preview]').style.borderTopColor = c;
            el.querySelectorAll('[data-swatch]').forEach(sw => sw.classList.toggle('ring-2', sw.dataset.swatch.toLowerCase() === c.toLowerCase()));
        };
        ui.on(el, 'click', '[data-swatch]', (e, b) => setColor(b.dataset.swatch));
        ui.on(el, 'input', '[data-color]', (e, i) => setColor(i.value));
        ui.on(el, 'input', '[data-hex]', (e, i) => { if (/^#[0-9a-f]{6}$/i.test(i.value)) { el.querySelector('[data-color]').value = i.value; el.querySelector('[data-preview]').style.borderTopColor = i.value; } });
        ui.on(el, 'change', '[name=font]', (e, sel) => { el.querySelectorAll('[data-preview] div').forEach(d => { d.style.fontFamily = sel.value; }); el.querySelector('[data-preview] div:last-child').textContent = `Tax Invoice — ${sel.value}`; });
        ui.on(el, 'change', '[data-logo-file]', async (e, input) => {
            const file = input.files[0];
            if (!file) return;
            try {
                if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error('Choose a PNG or JPG image.');
                logo = await ui.readImage(file, 360, 150 * 1024);
                el.querySelector('[data-logo-prev]').innerHTML = String(html`<img src="${logo}" alt="Company logo" class="h-full w-full object-contain">`);
            } catch (err) { input.value = ''; ui.fail(err); }
        });
        ui.on(el, 'click', '[data-logo-remove]', () => { logo = ''; el.querySelector('[data-logo-prev]').innerHTML = String(icon('image', 'w-6 h-6 text-faint')); });

        ui.on(el, 'submit', '[data-form]', e => e.preventDefault());
        ui.on(el, 'click', '[data-save]', async (e, btn) => {
            e.preventDefault();
            const form = el.querySelector('[data-form]');
            const missing = ui.$$('[required]', form).find(i => !String(i.value).trim());
            if (missing) { missing.focus(); return ui.toast(`${(missing.closest('div').querySelector('label') || {}).textContent || 'This field'} is required.`.replace('*', ''), 'error'); }
            const v = ui.readForm(form);
            btn.disabled = true;
            try {
                if (tab === 'company') {
                    s.company = await api.put('/api/settings/company', { name: v.name, phone: v.phone, email: v.email, taxId: v.taxId, address: v.address, logo });
                } else if (tab === 'receipt') {
                    const r = { paper: v.paper, width: v.width, template: v.template, brandColor: v.brandColor, font: v.font, qrType: v.qrType, copies: Number(v.copies) || 1, bankDetails: v.bankDetails };
                    for (const [k] of LAYOUT) r[k] = v[k];
                    r.autoPrint = v.autoPrint;
                    s.receipt = await api.put('/api/settings/receipt', r);
                    s.numbering = await api.put('/api/settings/numbering', { invoicePrefix: v.invoicePrefix, purchasePrefix: v.purchasePrefix, footer: v.footer, terms: v.terms });
                    s.pos = await api.put('/api/settings/pos', { allowNegativeStock: v.allowNegativeStock, wholesaleMode: v.wholesaleMode, defaultMode: v.defaultMode });
                    rc = { ...s.receipt }; pos = { ...s.pos };
                } else {
                    s.localization = await api.put('/api/settings/localization', { ...v, expiryReminderDays: Number(v.expiryReminderDays), fiscalStartMonth: Number(v.fiscalStartMonth) });
                }
                await HP.app.refresh(); // the shop name, logo and formats in the sidebar, top bar and receipts
                ui.toast('Settings saved');
            } catch (err) { ui.fail(err); }
            finally { btn.disabled = false; }
        });
        draw();
    },
});

// ───────── Users (read-only) ─────────
const AVATAR = ['bg-violet-500', 'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-sky-500'];
const initials = u => (u.name || u.email || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const ROLE_ROWS = [['OWNER', 'Admins', '#7c3aed'], ['MANAGER', 'Managers', '#6366f1'], ['CASHIER', 'Cashiers', '#10b981']];

HP.page('/users', {
    title: 'Users', perm: 'settings.manage',
    async render(el) {
        const d = await api.get('/api/settings/users');
        const charts = [];
        let q = '';
        const total = d.users.length;
        const rows = () => {
            const list = d.users.filter(u => !q || `${u.name} ${u.email}`.toLowerCase().includes(q));
            if (!list.length) return html`<tr><td colspan="5" class="py-10 text-center text-sm text-muted">No users match.</td></tr>`;
            return html`${list.map(u => html`<tr>
                <td><div class="flex items-center gap-3"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${AVATAR[(u.email || '').length % AVATAR.length]}">${initials(u)}</span>
                  <div class="min-w-0"><div class="font-medium">${u.name || '—'}</div><div class="truncate text-xs text-muted">${u.email}</div></div></div></td>
                <td>${ui.badge(u.roleLabel, u.role === 'OWNER' ? 'accent' : u.role === 'MANAGER' ? 'good' : 'gray', false)}</td>
                <td><span class="inline-flex items-center gap-2 text-sm"><span class="h-2 w-2 rounded-full ${u.active ? 'bg-emerald-500' : 'bg-slate-400'}"></span>${u.active ? 'Active' : 'Inactive'}</span></td>
                <td>${u.createdAt ? fmt.date(u.createdAt) : '—'}</td>
                <td>${u.lastLoginAt ? fmt.dateTime(u.lastLoginAt) : html`<span class="text-muted">Never</span>`}</td></tr>`)}`;
        };
        const roleRows = ROLE_ROWS.filter(([k]) => d.roles[k] || k === 'OWNER');
        ui.mount(el, html`${ui.pageHeader({ title: t('Users'), subtitle: 'Manage staff accounts, roles, and granular permissions for your shop.' })}
          <div class="grid gap-6 lg:grid-cols-2">
            <div class="card card-pad"><div class="font-semibold">Staff Role Distribution</div><div class="mt-0.5 text-xs text-muted">Admins, managers, and cashiers across your team</div>
              <div class="mt-4 flex flex-wrap items-center gap-8" style="min-height:240px"><div class="relative h-[180px] w-[180px] shrink-0"><canvas data-roles aria-label="Users by role"></canvas>
                <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span class="text-2xl font-bold">${total}</span><span class="text-[10px] font-semibold tracking-wider text-muted">TOTAL</span></div></div>
                <div class="min-w-0 flex-1 space-y-3">${roleRows.map(([k, l, c]) => html`<div class="flex items-center gap-3 text-sm"><span class="h-2.5 w-2.5 rounded-full" style="background:${c}"></span><span class="flex-1">${l}</span><span class="font-semibold">${d.roles[k] || 0}</span><span class="w-12 text-right text-xs text-muted">${fmt.pct(total ? ((d.roles[k] || 0) / total) * 100 : 0, 0)}</span></div>`)}</div></div></div>
            <div class="card card-pad"><div class="font-semibold">System Activity</div><div class="mt-0.5 text-xs text-muted">Sign-ins and sales recorded over the past week</div>
              <div class="relative mt-4 h-[240px]"><canvas data-activity aria-label="Sign-ins and sales per day"></canvas></div></div>
          </div>
          <div class="card mt-6">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><input class="input max-w-md" placeholder="Search users…" data-q aria-label="Search users">
              <div class="flex items-center gap-2 text-sm text-muted">${icon('info', 'w-4 h-4')}Users are added and changed by HisabPro administration</div></div>
            <div class="overflow-x-auto thin-scroll"><table class="tbl"><thead><tr><th>USER PROFILE</th><th>ROLE</th><th>STATUS</th><th>ADDED DATE</th><th>LAST SIGN-IN</th></tr></thead><tbody data-rows>${rows()}</tbody></table></div>
          </div>`);
        const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
        charts.push(ui.chart(el.querySelector('[data-roles]'), {
            type: 'doughnut',
            data: { labels: roleRows.map(r => r[1]), datasets: [{ data: roleRows.map(r => d.roles[r[0]] || 0), backgroundColor: roleRows.map(r => r[2]), borderColor: ui.css('--color-surface'), borderWidth: 3 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } },
        }));
        charts.push(ui.chart(el.querySelector('[data-activity]'), {
            type: 'line',
            data: { labels: d.activity.map(a => a.label), datasets: [
                { label: 'Sign-ins', data: d.activity.map(a => a.signIns), borderColor: '#6366f1', borderWidth: 2, tension: 0.4, pointRadius: 0, pointHoverRadius: 4, fill: true,
                    backgroundColor: c => { const a = c.chart.chartArea; if (!a) return rgba('#6366f1', 0.2); const g = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom); g.addColorStop(0, rgba('#6366f1', 0.35)); g.addColorStop(1, rgba('#6366f1', 0.02)); return g; } },
                { label: 'Sales', data: d.activity.map(a => a.sales), borderColor: '#10b981', borderWidth: 2, tension: 0.4, pointRadius: 0, pointHoverRadius: 4, fill: false },
            ] },
            options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: true, labels: { usePointStyle: true, boxWidth: 8 } } },
                scales: { x: { grid: { display: false }, border: { display: false } }, y: { beginAtZero: true, grid: { color: ui.css('--color-line') }, border: { display: false, dash: [4, 4] }, ticks: { precision: 0, maxTicksLimit: 5 } } } },
        }));
        ui.on(el, 'input', '[data-q]', (e, i) => { q = i.value.trim().toLowerCase(); const tb = el.querySelector('[data-rows]'); tb.innerHTML = String(rows()); ui.repage(tb); });
        return () => charts.forEach(c => { try { c && c.destroy(); } catch { } });
    },
});
