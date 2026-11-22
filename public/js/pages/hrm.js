// HRM & Payroll screens: HR Dashboard, Employees (4-tab drawer with documents), Attendance & Shifts, Leave Management,
// Payroll & Advances (payslips, pay, print), Recruitment (postings + Kanban pipeline), Performance & Assets.
// Layout, labels and fields follow reference/REFERENCE.md "Part 4 — HRM & Payroll". API: src/routes/hrm.js.
const { html, raw, icon, api, ui, fmt, t } = HP;
const PERM = 'hrm.manage';
const API = '/api/hrm';

const DEPARTMENTS = ['Sales', 'Logistics', 'Management', 'Operations', 'Finance', 'Human Resources'];
const BRANCHES = ['Head Office', 'Branch A', 'Branch B', 'Warehouse'];
const GENDERS = ['Male', 'Female', 'Other / Prefer not to say'];
const TAX_STATUS = ['Registered — NTN on file', 'Not registered', 'Exempt', 'Pending verification'];
const DOCS = [['CNIC', 'CNIC Copy', 'Front & back scan (PDF or image)'], ['CV', 'CV / Resume', 'Latest curriculum vitae'], ['EXPERIENCE', 'Experience Letter', 'From previous employer (if applicable)'], ['CONTRACT', 'Employment Contract', 'Signed offer / contract letter']];
const ASSET_CATEGORIES = ['Laptop', 'Phone', 'Vehicle', 'Tablet', 'Access Card', 'Other'];
const ASSET_STATUS = { IN_USE: ['In Use', 'accent'], RETURNED: ['Returned', 'good'], DAMAGED: ['Damaged', 'bad'] };
const STAGES = [['APPLIED', 'Applied'], ['SCREENING', 'Screening'], ['INTERVIEW', 'Interviewing'], ['OFFER', 'Offered'], ['HIRED', 'Hired'], ['REJECTED', 'Rejected']];
const STAGE_LABEL = Object.fromEntries(STAGES);
const MAX_FILE = 250 * 1024;
const FILE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.txt';
const FILE_RE = /^(application\/pdf|image\/(png|jpe?g|webp|gif)|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|text\/plain)$/i;
const PAL = ui.PALETTE;
const ATT = {
    PRESENT: { label: 'Present', tone: 'good', color: PAL[1] },
    LATE: { label: 'Late', tone: 'warn', color: PAL[2] },
    HALF_DAY: { label: 'Half Day', tone: 'accent', color: PAL[4] },
    LEAVE: { label: 'On Leave', tone: 'accent', color: PAL[5] },
    ABSENT: { label: 'Absent', tone: 'bad', color: PAL[3] },
    UNMARKED: { label: 'Not marked', tone: 'gray', color: '#9ca3af' },
};
const ATT_ORDER = ['PRESENT', 'LATE', 'HALF_DAY', 'LEAVE', 'ABSENT', 'UNMARKED'];

// ───────── small helpers ─────────
const todayYmd = () => fmt.ymd();
const thisMonth = () => fmt.month();
const monthName = (m, month = 'long') => { if (!m) return '—'; const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1, 15)).toLocaleString('en-US', { month, year: 'numeric', timeZone: 'UTC' }); };
const dayLabel = s => (s ? fmt.date(String(s).length === 10 ? s + 'T12:00:00Z' : s) : '—'); // a 'YYYY-MM-DD' shop day
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const person = (name, sub) => html`<div class="flex items-center gap-3"><div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">${initials(name)}</div>
    <div class="min-w-0"><div class="truncate font-medium">${name}</div>${sub ? html`<div class="truncate text-xs text-muted">${sub}</div>` : ''}</div></div>`;
const mins = s => (s && /^\d{2}:\d{2}$/.test(s) ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : null);
function hoursBetween(a, b) { const x = mins(a), y = mins(b); if (x === null || y === null) return 0; let d = y - x; if (d < 0) d += 1440; return Math.round((d / 60) * 100) / 100; }
const hm = h => { const m = Math.round((Number(h) || 0) * 60); return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`; };
const hoursLabel = h => `${hm(h)} (${(Number(h) || 0).toFixed(2)}h)`;
// same rule as the server: late when the check-in is after shift start + grace (a night-shift arrival after midnight is late)
const previewStatus = (checkIn, shift) => { if (!shift || mins(checkIn) === null) return 'PRESENT'; const late = ((((mins(checkIn) - mins(shift.startTime) + 720) % 1440) + 1440) % 1440) - 720; return late > (shift.graceMinutes || 0) ? 'LATE' : 'PRESENT'; };
const shiftLabel = s => `${s.name} (${s.startTime} – ${s.endTime})`;
const empOptions = (list, keep) => { const o = [['', 'Select employee…'], ...list.filter(e => e.status === 'ACTIVE').map(e => [e.id, `${e.name} (${e.code})`])]; if (keep && !o.some(x => x[0] === keep.id)) o.push([keep.id, `${keep.name} (${keep.code})`]); return o; };
const errBox = () => html`<div data-err class="hidden rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200 dark:border-red-900"></div>`;
const showErr = (root, msg) => { const b = root.querySelector('[data-err]'); if (!b) return ui.toast(msg, 'error'); b.textContent = msg || ''; b.classList.toggle('hidden', !msg); };
const missingRequired = form => Array.from(form.querySelectorAll('[required]')).find(x => !String(x.value).trim());
function requireFilled(form) {
    const bad = missingRequired(form);
    if (!bad) return true;
    bad.focus();
    showErr(form, `${(bad.closest('div')?.querySelector('label')?.textContent || 'This field').replace('*', '').trim()} is required.`);
    return false;
}

// coloured eyebrow above page and drawer titles (spec "page header pattern")
const EYE = { accent: 'text-accent', good: 'text-good', warn: 'text-warn', bad: 'text-bad', purple: 'text-purple-600 dark:text-purple-400' };
const eyeTitle = (eyebrow, title, tone = 'accent') => html`<span class="mb-1 block text-[11px] font-semibold uppercase tracking-wider ${EYE[tone]}">${eyebrow}</span>${title}`;
const header = ({ eyebrow, tone = 'accent', title, subtitle, actions = '' }) => html`<div class="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div>${eyebrow ? html`<div class="mb-1.5 text-xs font-semibold uppercase tracking-wider ${EYE[tone]}">${eyebrow}</div>` : ''}<h1 class="text-2xl font-bold tracking-tight">${t(title)}</h1>${subtitle ? html`<p class="mt-1 text-sm text-muted">${subtitle}</p>` : ''}</div>
    <div class="flex flex-wrap items-center gap-2">${actions}</div></div>`;

// KPI card: coloured icon tile on the left, uppercase label, big figure (count: the tile shows the number itself)
const TILE = { accent: 'bg-accent-soft text-accent', good: 'bg-good-soft text-good', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad', purple: 'bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-300', blue: 'bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-300' };
const kpi = ({ label, value, iconName, tone = 'accent', count, sub }) => html`<div class="card card-pad flex items-center gap-4">
    <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TILE[tone]} ${count !== undefined ? 'text-base font-bold' : ''}">${count !== undefined ? count : icon(iconName, 'w-5 h-5')}</div>
    <div class="min-w-0"><div class="text-xs font-medium uppercase tracking-wide text-muted">${label}</div><div class="mt-0.5 truncate text-2xl font-bold tracking-tight">${value}</div>${sub ? html`<div class="mt-0.5 truncate text-xs text-muted">${sub}</div>` : ''}</div></div>`;

// full-width segmented tab bar (client-side tabs; the URL does not change)
const tabBar = (name, options, value) => html`<div class="card p-1.5 [&>.seg]:flex [&>.seg]:w-full [&>.seg]:border-0 [&>.seg]:bg-transparent [&>.seg>button]:h-10 [&>.seg>button]:flex-1 [&>.seg>button]:text-sm">${ui.seg(name, options, value)}</div>`;
const withIcon = (name, label) => html`<span class="inline-flex items-center gap-2">${icon(name)}${label}</span>`;

// ───────── charts ─────────
const chartCard = ({ id, title, subtitle, height = 260, cls = '' }) => html`<div class="card card-pad ${cls}"><div class="mb-4"><div class="font-semibold">${title}</div>${subtitle ? html`<div class="mt-0.5 text-xs text-muted">${subtitle}</div>` : ''}</div>
    <div class="relative" style="height:${height}px" data-chart="${id}"></div></div>`;
// config null → the empty sentence in the chart area
function drawChart(root, id, config, emptyText) {
    const box = root.querySelector(`[data-chart="${id}"]`);
    if (!box) return;
    if (box._chart) { box._chart.destroy(); box._chart = null; }
    if (!config || !window.Chart) { box.innerHTML = String(html`<div class="flex h-full items-center justify-center px-4 text-center text-sm text-muted">${emptyText}</div>`); return; }
    box.innerHTML = '<canvas></canvas>';
    box._chart = ui.chart(box.querySelector('canvas'), config);
}
const destroyCharts = root => root.querySelectorAll('[data-chart]').forEach(b => { if (b._chart) { b._chart.destroy(); b._chart = null; } });
const shade = (color, f) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(color || '');
    if (!m) return color;
    const n = parseInt(m[1], 16), ch = c => Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f);
    return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
};
// "2.5D depth view": a lighter top face and a darker side face drawn on every bar
const DEPTH = {
    id: 'hpDepth',
    afterDatasetsDraw(chart) {
        const { ctx } = chart;
        chart.data.datasets.forEach((ds, di) => {
            const meta = chart.getDatasetMeta(di);
            if (meta.hidden || meta.type !== 'bar') return;
            meta.data.forEach((bar, i) => {
                const { x, y, base, width } = bar.getProps(['x', 'y', 'base', 'width']);
                if (!width || !Number.isFinite(y) || Math.abs(base - y) < 1) return; // nothing to give depth to at zero
                const d = Math.min(10, width * 0.3), l = x - width / 2, r = x + width / 2, top = Math.min(y, base), bottom = Math.max(y, base);
                const c = Array.isArray(ds.backgroundColor) ? ds.backgroundColor[i % ds.backgroundColor.length] : ds.backgroundColor;
                ctx.save();
                ctx.fillStyle = shade(c, 0.35);
                ctx.beginPath(); ctx.moveTo(l, top); ctx.lineTo(l + d, top - d); ctx.lineTo(r + d, top - d); ctx.lineTo(r, top); ctx.closePath(); ctx.fill();
                ctx.fillStyle = shade(c, -0.3);
                ctx.beginPath(); ctx.moveTo(r, top); ctx.lineTo(r + d, top - d); ctx.lineTo(r + d, bottom - d); ctx.lineTo(r, bottom); ctx.closePath(); ctx.fill();
                ctx.restore();
            });
        });
    },
};
function bars(labels, data, colors, { depth, yMax, money, label = 'Value', step } = {}) {
    return {
        type: 'bar',
        data: { labels, datasets: [{ label, data, backgroundColor: colors, borderRadius: depth ? 0 : 6, maxBarThickness: 48 }] },
        options: {
            responsive: true, maintainAspectRatio: false, layout: { padding: depth ? { top: 14, right: 14 } : 0 },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => (money ? fmt.money(c.raw) : `${label}: ${c.raw}`) } } },
            scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ...(yMax ? { max: yMax } : {}), ticks: money ? { callback: v => fmt.short(v) } : { precision: step ? undefined : 0, stepSize: step } } },
        },
        plugins: depth ? [DEPTH] : [],
    };
}
const doughnut = (labels, data, colors) => ({
    type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } } } },
});
const departmentChart = (byDepartment, kind = 'doughnut') => (byDepartment.length
    ? (kind === 'doughnut' ? doughnut : (l, d, c) => bars(l, d, c, { label: 'Employees' }))(byDepartment.map(d => d.department), byDepartment.map(d => d.count), byDepartment.map((d, i) => PAL[i % PAL.length]))
    : null);
const statusChart = summary => bars(ATT_ORDER.map(k => ATT[k].label), ATT_ORDER.map(k => summary[k] || 0), ATT_ORDER.map(k => ATT[k].color), { label: 'Employees' });

// ───────── files (kept as data: URLs) ─────────
async function pickFile(file) {
    if (!file) return null;
    if (!FILE_RE.test(file.type)) throw new Error('Choose a PDF, an image or a Word file.');
    return { name: file.name, dataUrl: await ui.readFile(file, MAX_FILE) };
}
// save a data: URL as a file (built as a Blob: the page's security policy does not allow opening data: URLs)
function downloadDataUrl(url, filename) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(url || '');
    if (!m) return ui.toast('The file could not be opened.', 'error');
    const bin = atob(m[2]), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: m[1] }));
    a.download = filename || 'document';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ════════════════════════ HR Dashboard ════════════════════════
const QUICK = [
    ['Employees', 'Onboard & manage workforce', 'users', 'accent', '/hrm/employees'],
    ['Attendance & Shifts', 'Track daily presence', 'clock', 'good', '/hrm/attendance'],
    ['Leave Management', 'Requests & approvals', 'calendar', 'purple', '/hrm/leaves'],
    ['Payroll & Advances', 'Salaries & disbursements', 'dollar', 'warn', '/hrm/payroll'],
    ['Recruitment', 'Hiring pipeline & Kanban', 'briefcase', 'blue', '/hrm/recruitment'],
    ['Performance & Assets', 'Appraisals, rewards & hardware', 'star', 'bad', '/hrm/performance'],
];
HP.page('/hrm/dashboard', {
    title: 'HR Dashboard', perm: PERM,
    async render(el) {
        const d = await api.get(API + '/dashboard');
        ui.mount(el, html`${header({ eyebrow: 'HRM & PAYROLL', title: 'HR Dashboard', subtitle: 'Workforce overview, headcount analytics, and quick module access.' })}
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            ${kpi({ label: 'Total Employees', value: d.total, iconName: 'users' })}
            ${kpi({ label: 'Active Today', value: d.presentToday, iconName: 'checkCircle', sub: `of ${d.active} active employees` })}
            ${kpi({ label: 'New Joinees (This Month)', value: d.newJoinees, iconName: 'userPlus' })}
            ${kpi({ label: 'On Leave Today', value: d.onLeaveToday, iconName: 'calendar', tone: 'purple' })}
            <div class="sm:col-span-1 lg:col-span-2">${kpi({ label: 'Payroll (This Month)', value: fmt.money(d.payroll.net), iconName: 'dollar', tone: 'warn', sub: `${fmt.money(d.payroll.paid)} paid · ${plural(d.payroll.count, 'payslip')} for ${d.label}` })}</div>
          </div>
          <div class="mt-6 grid gap-6 lg:grid-cols-5">
            ${chartCard({ id: 'workforce', title: 'Workforce Distribution', subtitle: 'Active employees by department', height: 280, cls: 'lg:col-span-2' })}
            <div class="card card-pad lg:col-span-3"><div class="mb-4 font-semibold">Quick Access</div>
              <div class="grid gap-3 sm:grid-cols-2">${QUICK.map(([title, sub, ic, tone, href]) => html`<a href="${href}" data-link class="group flex items-center gap-3 rounded-xl border border-line p-4 hover:bg-surface-2">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TILE[tone]}">${icon(ic, 'w-5 h-5')}</div>
                <div class="min-w-0 flex-1"><div class="font-semibold">${t(title)}</div><div class="truncate text-xs text-muted">${sub}</div></div>
                <span class="text-faint group-hover:text-ink">${icon('arrowRight')}</span></a>`)}</div></div>
          </div>
          ${chartCard({ id: 'today', title: "Today's Attendance Status", subtitle: fmt.longDate(d.today + 'T12:00:00Z'), height: 220, cls: 'mt-6' })}
          <div class="card card-pad mt-6 flex flex-wrap items-center justify-between gap-4"><div><div class="font-semibold">Employee Registry</div><div class="text-xs text-muted">${d.active} active of ${d.total} total employees</div></div>
            <a href="/hrm/employees" data-link class="btn btn-primary">Manage Employees</a></div>`);
        drawChart(el, 'workforce', departmentChart(d.byDepartment), 'No workforce data yet');
        drawChart(el, 'today', d.active ? statusChart(d.todayStatus) : null, 'No roster data for this date');
        return () => destroyCharts(el);
    },
});

// ════════════════════════ Employees ════════════════════════
HP.page('/hrm/employees', {
    title: 'Employees', perm: PERM,
    async render(el) {
        let list = [], stats = null, q = '', dep = '';
        ui.mount(el, html`${header({ title: 'Employees', subtitle: 'Core workforce registry — onboard, search, and manage your team.', actions: html`<button class="btn btn-primary" data-new>${icon('plus')}Add New Employee</button>` })}
          <div class="grid gap-4 md:grid-cols-3" data-kpis></div>
          ${chartCard({ id: 'workforce', title: 'Workforce Distribution', subtitle: 'Active employees by department', height: 240, cls: 'mt-6' })}
          <div class="mt-6 mb-4 flex flex-wrap items-center gap-3">
            <div class="relative min-w-[220px] flex-1"><span class="absolute inset-y-0 start-3 flex items-center text-muted">${icon('search')}</span><input class="input ps-9" placeholder="Search by Name, CNIC, Phone…" data-q aria-label="Search employees"></div>
            <select class="input w-full sm:w-64" data-dep aria-label="Filter by Department"><option value="">Filter by Department</option>${DEPARTMENTS.map(d => html`<option value="${d}">${d}</option>`)}</select></div>
          <div data-list>${ui.loading()}</div>`);
        const drawRows = () => {
            const ql = q.toLowerCase();
            const rows = list.filter(e => (!dep || e.department === dep) && (!ql || [e.name, e.cnic, e.phone, e.code].some(v => String(v || '').toLowerCase().includes(ql))));
            ui.mount(el.querySelector('[data-list]'), ui.table({
                rows, empty: list.length ? 'No employees match your search.' : 'No employees found. Add your first team member to get started.',
                columns: [
                    { label: 'Profile', render: e => person(e.name, `${e.code} · ${e.cnic}`) },
                    { label: 'Designation & Dept', render: e => html`<div class="font-medium">${e.designation || '—'}</div><div class="text-xs text-muted">${e.department} · ${e.branch}</div>` },
                    { label: 'Phone', render: e => e.phone || '—' },
                    { label: 'Joining Date', render: e => fmt.date(e.joinDate) },
                    { label: 'Status', render: e => (e.status === 'ACTIVE' ? ui.badge('Active', 'good') : ui.badge('Inactive', 'gray')) },
                    { label: 'Actions', render: e => html`<div class="flex gap-3 text-sm"><button class="text-muted hover:text-ink" data-edit="${e.id}">Edit</button><button class="text-rose-600" data-del="${e.id}">Delete</button></div>` },
                ],
            }));
        };
        const load = async () => {
            [list, stats] = await Promise.all([api.get(API + '/employees'), api.get(API + '/dashboard')]);
            ui.mount(el.querySelector('[data-kpis]'), html`${kpi({ label: 'Total Employees', value: stats.total, iconName: 'users' })}
              ${kpi({ label: 'Active Today', value: stats.presentToday, iconName: 'checkCircle', tone: 'good', sub: `of ${stats.active} active employees` })}
              ${kpi({ label: 'New Joinees (This Month)', value: stats.newJoinees, iconName: 'userPlus' })}`);
            drawChart(el, 'workforce', departmentChart(stats.byDepartment, 'bar'), 'No workforce data yet');
            drawRows();
        };
        el.querySelector('[data-q]').addEventListener('input', e => { q = e.target.value; drawRows(); });
        el.querySelector('[data-dep]').addEventListener('change', e => { dep = e.target.value; drawRows(); });
        ui.on(el, 'click', '[data-new]', () => employeeDrawer(null, load));
        ui.on(el, 'click', '[data-edit]', (e, b) => employeeDrawer(b.dataset.edit, load));
        ui.on(el, 'click', '[data-del]', async (e, b) => {
            const emp = list.find(x => x.id === b.dataset.del);
            if (!(await ui.confirm({ title: `Delete ${emp.name}?`, message: 'The employee leaves every HR list. Their attendance, payslips and history are kept.', ok: 'Delete', danger: true }))) return;
            try { await api.del(API + '/employees/' + emp.id); ui.toast('Employee deleted'); load(); } catch (err) { ui.fail(err); }
        });
        await load();
        return () => destroyCharts(el);
    },
});

// Add / edit employee: vertical tabs (Personal Info, Employment Details, Financials, Documents), one form saved once.
// prefill: fields for a new employee (e.g. a hired candidate)
async function employeeDrawer(id, onDone, prefill = {}) {
    let shifts, emp, next;
    try { [shifts, emp, next] = await Promise.all([api.get(API + '/shifts'), id ? api.get(API + '/employees/' + id) : null, id ? null : api.get(API + '/employees/next-code')]); }
    catch (err) { return ui.fail(err); }
    const morning = shifts.find(s => s.name.toLowerCase() === 'morning') || shifts[0];
    const e = emp || { gender: 'Male', branch: 'Head Office', department: 'Sales', status: 'ACTIVE', taxStatus: TAX_STATUS[0], shiftId: morning ? morning.id : '', baseSalary: 0, ...prefill };
    const docs = {};
    for (const d of e.documents || []) docs[d.kind] = { name: d.name, dataUrl: d.dataUrl };
    const changed = new Set();
    const TABS = [['personal', 'Personal Info', 'user'], ['employment', 'Employment Details', 'briefcase'], ['financials', 'Financials', 'wallet'], ['documents', 'Documents', 'file']];
    const tabCls = on => `flex items-center gap-2.5 whitespace-nowrap rounded-lg border px-3 py-2.5 text-sm text-start ${on ? 'border-line bg-surface text-accent font-medium shadow-sm' : 'border-transparent text-muted hover:bg-surface-2'}`;
    let form = null;

    const docRow = ([kind, label, helpText]) => {
        const d = docs[kind];
        return html`<div class="flex items-center gap-3 rounded-xl border border-line p-4">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${d ? 'bg-good-soft text-good' : 'bg-surface-2 text-muted'}">${icon(d ? 'fileCheck' : 'file', 'w-5 h-5')}</div>
            <div class="min-w-0 flex-1"><div class="font-semibold">${label}</div><div class="truncate text-xs text-muted">${d ? d.name : helpText}</div></div>
            ${d ? html`<button type="button" class="btn-icon !h-8 !w-8 border-0" data-docget="${kind}" aria-label="Download ${label}" title="Download">${icon('download')}</button><button type="button" class="btn-icon !h-8 !w-8 border-0 !text-rose-600" data-docdel="${kind}" aria-label="Remove ${label}" title="Remove">${icon('trash')}</button>` : ''}
            <label class="btn btn-outline btn-sm cursor-pointer">${d ? 'Replace' : 'Browse'}<input type="file" class="hidden" accept="${FILE_ACCEPT}" data-docfile="${kind}" aria-label="Choose ${label}"></label></div>`;
    };
    const panes = {
        personal: () => html`<div class="grid grid-cols-12 gap-4">
            ${ui.field({ label: 'Full Name', name: 'name', required: true, value: e.name || '', placeholder: 'e.g. Ahmed Khan' })}
            ${ui.field({ label: 'CNIC', name: 'cnic', required: true, value: e.cnic || '', placeholder: '12345-1234567-1', half: true })}
            ${ui.field({ label: 'Phone', name: 'phone', required: true, value: e.phone || '', placeholder: '03xx-xxxxxxx', half: true })}
            ${ui.field({ label: 'Address', name: 'address', type: 'textarea', value: e.address || '', placeholder: 'Street, city, postal code' })}
            ${ui.field({ label: 'Date of Birth', name: 'dob', type: 'date', value: e.dob ? fmt.ymd(e.dob) : '', half: true })}
            ${ui.field({ label: 'Gender', name: 'gender', type: 'select', value: e.gender, options: GENDERS, half: true })}</div>`,
        employment: () => html`<div class="grid grid-cols-12 gap-4">
            ${ui.field({ label: 'Employee ID', name: 'code', required: true, disabled: true, value: e.code || (next && next.code) || 'EMP-…', half: true, help: id ? '' : 'Generated automatically' })}
            ${ui.field({ label: 'Branch', name: 'branch', type: 'select', value: e.branch, options: BRANCHES, half: true })}
            ${ui.field({ label: 'Department', name: 'department', type: 'select', required: true, value: e.department, options: DEPARTMENTS, half: true })}
            ${ui.field({ label: 'Designation', name: 'designation', required: true, value: e.designation || '', placeholder: 'e.g. Sales Executive', half: true })}
            ${ui.field({ label: 'Joining Date', name: 'joinDate', type: 'date', required: true, value: e.joinDate ? fmt.ymd(e.joinDate) : todayYmd(), half: true })}
            ${ui.field({ label: 'Shift Schedule', name: 'shiftId', type: 'select', value: e.shiftId || '', options: [...shifts.map(s => [s.id, shiftLabel(s)]), ['', 'Flexible / Remote']], half: true })}
            ${ui.field({ label: 'Status', name: 'status', type: 'select', value: e.status, options: [['ACTIVE', 'Active'], ['INACTIVE', 'Inactive']], half: true, help: 'Only active employees appear in attendance and payroll.' })}</div>`,
        financials: () => html`<div class="grid grid-cols-12 gap-4">
            ${ui.field({ label: 'Base Salary (Monthly)', name: 'baseSalary', money: true, required: true, value: e.baseSalary || 0, placeholder: '50000', half: true })}
            ${ui.field({ label: 'Bank Name', name: 'bankName', value: e.bankName || '', placeholder: 'e.g. HBL, Meezan Bank', half: true })}
            ${ui.field({ label: 'IBAN / Account Number', name: 'iban', value: e.iban || '', placeholder: 'PKxxXXXX...', cls: '[&_input]:font-mono' })}
            ${ui.field({ label: 'Tax / NTN Status', name: 'taxStatus', type: 'select', value: e.taxStatus, options: TAX_STATUS })}</div>`,
        documents: () => html`<p class="mb-4 text-sm text-muted">Attach onboarding documents. Files (PDF, image or Word, up to 250 KB each) are stored with the employee record.</p><div class="space-y-3" data-docs>${DOCS.map(docRow)}</div>`,
    };
    const setTab = k => {
        form.querySelectorAll('[data-etab]').forEach(b => { b.className = tabCls(b.dataset.etab === k); b.setAttribute('aria-selected', String(b.dataset.etab === k)); });
        form.querySelectorAll('[data-epane]').forEach(p => p.classList.toggle('hidden', p.dataset.epane !== k));
    };
    // a server message names a field: show the tab that holds it
    const tabFor = msg => (/Full Name|CNIC|Phone|Gender/i.test(msg) ? 'personal' : /Designation|Department|Branch|Joining|shift|Status/i.test(msg) ? 'employment' : /Salary|IBAN|Bank|Tax/i.test(msg) ? 'financials' : null);

    ui.formDrawer({
        title: eyeTitle('EMPLOYEE ONBOARDING', id ? 'Edit Employee' : 'Add New Employee'), subtitle: 'Complete all sections — switch tabs without losing your progress.', wide: true, submit: 'Save Employee',
        body: html`<div class="flex flex-col gap-5 sm:flex-row">
            <div class="flex shrink-0 gap-1 overflow-x-auto sm:w-48 sm:flex-col" role="tablist" aria-orientation="vertical">${TABS.map(([k, l, ic], i) => html`<button type="button" role="tab" aria-selected="${i === 0 ? 'true' : 'false'}" data-etab="${k}" class="${tabCls(i === 0)}">${icon(ic)}${l}</button>`)}</div>
            <div class="min-w-0 flex-1">${TABS.map(([k], i) => html`<div data-epane="${k}" role="tabpanel" class="${i === 0 ? '' : 'hidden'}">${panes[k]()}</div>`)}</div></div>`,
        onMount(f, d) {
            form = f;
            // before the kit's required check runs, open the tab of the first empty required field
            const jump = () => { const bad = missingRequired(form); if (bad && bad.closest('[data-epane]')) setTab(bad.closest('[data-epane]').dataset.epane); };
            d.el.addEventListener('click', ev => { if (ev.target.closest('[data-submit]')) jump(); }, true);
            d.el.addEventListener('submit', jump, true);
            form.addEventListener('click', ev => {
                const tb = ev.target.closest('[data-etab]');
                if (tb) return setTab(tb.dataset.etab);
                const g = ev.target.closest('[data-docget]');
                if (g) { const dd = docs[g.dataset.docget]; return dd && downloadDataUrl(dd.dataUrl, dd.name); }
                const x = ev.target.closest('[data-docdel]');
                if (x) { delete docs[x.dataset.docdel]; changed.add(x.dataset.docdel); form.querySelector('[data-docs]').innerHTML = String(html`${DOCS.map(docRow)}`); }
            });
            form.addEventListener('change', async ev => {
                const inp = ev.target.closest('[data-docfile]');
                if (!inp) return;
                try {
                    const file = await pickFile(inp.files[0]);
                    if (file) { docs[inp.dataset.docfile] = file; changed.add(inp.dataset.docfile); form.querySelector('[data-docs]').innerHTML = String(html`${DOCS.map(docRow)}`); }
                } catch (err) { inp.value = ''; ui.fail(err); }
            });
        },
        async onSubmit(v, d) {
            const body = { ...v };
            delete body.code;
            let empId = id, code = e.code;
            try {
                if (id) await api.put(API + '/employees/' + id, body);
                else { const r = await api.post(API + '/employees', body); empId = r.id; code = r.code; }
            } catch (err) { const k = tabFor(err.message); if (k) setTab(k); throw err; }
            // one file per request keeps each upload small
            const failed = [];
            for (const kind of changed) {
                try { await api.put(`${API}/employees/${empId}/documents/${kind}`, docs[kind] ? { name: docs[kind].name, dataUrl: docs[kind].dataUrl } : { dataUrl: '' }); }
                catch (err) { failed.push(err.message); }
            }
            d.close();
            ui.toast(id ? 'Employee saved' : `Employee ${code} added`);
            if (failed.length) ui.toast(`Saved, but some documents were not attached: ${failed.join(' ')}`, 'error');
            if (onDone) onDone(empId);
        },
    });
}

// ════════════════════════ Attendance & Shifts ════════════════════════
HP.page('/hrm/attendance', {
    title: 'Attendance & Shifts', perm: PERM,
    async render(el) {
        let view = 'roster', date = todayYmd(), data = null, shifts = [], emps = [];
        ui.mount(el, html`${header({ eyebrow: 'TIME & ACTION', tone: 'good', title: 'Attendance & Shifts', subtitle: 'Live daily roster, clock-in engine, and shift configuration.', actions: html`<button class="btn btn-outline" data-bio>${icon('sliders')}Biometric / QR</button><span data-viewseg></span>` })}
          <div data-body>${ui.loading()}</div>`);
        const drawSeg = () => ui.mount(el.querySelector('[data-viewseg]'), ui.seg('view', [['roster', withIcon('fileCheck', 'Daily Roster')], ['shifts', withIcon('sliders', 'Manage Shifts')]], view));

        const drawRoster = () => {
            const isToday = date === data.today;
            ui.mount(el.querySelector('[data-body]'), html`${chartCard({ id: 'att', title: isToday ? "Today's Attendance Status" : `Attendance Status — ${dayLabel(date)}`, height: 230 })}
              <div class="mt-6 mb-3 flex flex-wrap items-center justify-between gap-3">
                <label class="flex items-center gap-2 text-muted">${icon('calendar')}<input type="date" class="input w-44" value="${date}" data-date aria-label="Roster date"></label>
                <div class="flex flex-wrap gap-2"><button class="btn btn-outline" data-bulk ${data.rows.length ? '' : raw('disabled')}>${icon('check')}Bulk Mark Present</button><button class="btn btn-primary" data-mark>Mark Attendance</button></div></div>
              ${ui.table({
                rows: data.rows, empty: 'No active employees. Add employees in the HR module first.',
                columns: [
                    { label: 'Employee Profile', render: r => person(r.employee.name, `${r.employee.code}${r.employee.designation ? ' · ' + r.employee.designation : ''}`) },
                    { label: 'Shift', render: r => (r.shift ? html`<div>${r.shift.name}</div><div class="text-xs text-muted">${r.shift.startTime} – ${r.shift.endTime}</div>` : html`<span class="text-muted">Flexible / Remote</span>`) },
                    { label: 'Check-In', render: r => (r.record && r.record.checkIn) || html`<span class="text-faint">—</span>` },
                    { label: 'Check-Out', render: r => (r.record && r.record.checkOut) || html`<span class="text-faint">—</span>` },
                    { label: 'Working Hours', render: r => (r.record && r.record.hours ? hoursLabel(r.record.hours) : html`<span class="text-faint">—</span>`) },
                    { label: 'Status', render: r => { const s = ATT[r.record ? r.record.status : 'UNMARKED']; return html`${ui.badge(s.label, s.tone)}${r.record && r.record.note ? html`<div class="mt-0.5 max-w-[180px] truncate text-xs text-muted" title="${r.record.note}">${r.record.note}</div>` : ''}`; } },
                    { label: 'Actions', render: r => html`<div class="flex gap-3 text-sm"><button class="font-medium text-accent" data-markrow="${r.employee.id}">${r.record ? 'Edit' : 'Mark'}</button>${r.record ? html`<button class="text-rose-600" data-clear="${r.record.id}">Clear</button>` : ''}</div>` },
                ],
              })}`);
            drawChart(el, 'att', data.rows.length ? statusChart(data.summary) : null, 'No roster data for this date');
        };
        const drawShifts = () => {
            ui.mount(el.querySelector('[data-body]'), html`<div class="grid gap-6 lg:grid-cols-2">
              <div class="card card-pad self-start"><div class="font-semibold">Create Shift</div><p class="mb-4 text-xs text-muted">Define schedules and grace periods for late detection.</p>
                <form class="grid grid-cols-12 gap-4" data-shiftform novalidate>
                  ${ui.field({ label: 'Shift Name', name: 'name', required: true, placeholder: 'e.g. Morning, Night' })}
                  ${ui.field({ label: 'Start Time', name: 'startTime', type: 'time', value: '09:00', half: true })}
                  ${ui.field({ label: 'End Time', name: 'endTime', type: 'time', value: '17:00', half: true })}
                  ${ui.field({ label: 'Grace Period (Minutes)', name: 'graceMinutes', type: 'number', value: 15, placeholder: '15', step: 1, help: 'Arrivals after start + grace are marked Late.', attr: { max: 240 } })}
                  <div class="col-span-12 space-y-3">${errBox()}<button class="btn btn-primary w-full">${icon('plus')}Add Shift</button></div></form></div>
              <div class="card card-pad"><div class="font-semibold">Configured Shifts</div><p class="mb-2 text-xs text-muted">${plural(shifts.length, 'shift')} active</p>
                ${shifts.length ? html`<div class="divide-y divide-line">${shifts.map(s => html`<div class="flex items-center justify-between gap-3 py-3">
                    <div><div class="font-medium">${s.name}</div><div class="text-xs text-muted">${s.startTime} – ${s.endTime} · ${s.graceMinutes} min grace${mins(s.endTime) < mins(s.startTime) ? ' · crosses midnight' : ''}</div></div>
                    <button class="btn-icon !h-8 !w-8 !text-rose-600" data-delshift="${s.id}" aria-label="Delete ${s.name}" title="Delete ${s.name}">${icon('trash')}</button></div>`)}</div>`
                  : html`<div class="py-10 text-center text-sm text-muted">No shifts yet. Create your first shift.</div>`}</div></div>`);
        };
        const load = async () => {
            [data, shifts, emps] = await Promise.all([api.get(API + '/attendance', { date }), api.get(API + '/shifts'), api.get(API + '/employees')]);
            drawSeg();
            view === 'roster' ? drawRoster() : drawShifts();
        };

        ui.on(el, 'click', '[data-seg=view] [data-v]', (e, b) => { if (b.dataset.v === view) return; view = b.dataset.v; drawSeg(); view === 'roster' ? drawRoster() : drawShifts(); });
        ui.on(el, 'click', '[data-bio]', biometricModal);
        ui.on(el, 'change', '[data-date]', (e, inp) => { if (inp.value) { date = inp.value; load().catch(ui.fail); } });
        const openMark = row => attendanceDrawer({ emps, shifts, date, row, onDone: d => { date = d || date; load().catch(ui.fail); } });
        ui.on(el, 'click', '[data-mark]', () => openMark(null));
        ui.on(el, 'click', '[data-markrow]', (e, b) => openMark(data.rows.find(r => r.employee.id === b.dataset.markrow)));
        ui.on(el, 'click', '[data-clear]', async (e, b) => {
            const row = data.rows.find(r => r.record && r.record.id === b.dataset.clear);
            if (!(await ui.confirm({ title: 'Clear attendance?', message: `${row.employee.name} on ${dayLabel(date)} goes back to "Not marked".`, ok: 'Clear', danger: true }))) return;
            try { await api.del(API + '/attendance/' + b.dataset.clear); ui.toast('Attendance cleared'); load(); } catch (err) { ui.fail(err); }
        });
        ui.on(el, 'click', '[data-bulk]', async () => {
            if (!(await ui.confirm({ title: 'Bulk Mark Present', message: `Every active employee not yet marked on ${dayLabel(date)} is marked Present with their shift times. Employees already marked are left as they are.`, ok: 'Mark Present' }))) return;
            try { const r = await api.post(API + '/attendance/bulk-present', { date }); ui.toast(`${plural(r.marked, 'employee')} marked present${r.skipped ? ` · ${r.skipped} already marked` : ''}`); load(); } catch (err) { ui.fail(err); }
        });
        ui.on(el, 'submit', '[data-shiftform]', async (e, f) => {
            e.preventDefault();
            if (!requireFilled(f)) return;
            try { const s = await api.post(API + '/shifts', ui.readForm(f)); ui.toast(`Shift "${s.name}" added`); shifts = await api.get(API + '/shifts'); drawShifts(); }
            catch (err) { showErr(f, err.message); }
        });
        ui.on(el, 'click', '[data-delshift]', async (e, b) => {
            const s = shifts.find(x => x.id === b.dataset.delshift);
            if (!(await ui.confirm({ title: `Delete the ${s.name} shift?`, message: 'Past attendance keeps its times. Employees on this shift must be moved first.', ok: 'Delete', danger: true }))) return;
            try { await api.del(API + '/shifts/' + s.id); ui.toast('Shift deleted'); shifts = await api.get(API + '/shifts'); drawShifts(); } catch (err) { ui.fail(err); }
        });
        await load();
        return () => destroyCharts(el);
    },
});

function attendanceDrawer({ emps, shifts, date, row, onDone }) {
    const rec = row && row.record;
    const emp0 = row ? row.employee : null;
    const shiftOf = sid => shifts.find(s => s.id === sid) || null;
    const sid0 = rec ? rec.shiftId || '' : emp0 ? emp0.shiftId || '' : '';
    const s0 = shiftOf(sid0);
    ui.formDrawer({
        title: eyeTitle('CLOCK-IN ENGINE', rec ? 'Edit Attendance' : 'Mark Attendance', 'good'), subtitle: 'Working hours auto-calculate from check-in and check-out times.', submit: 'Save Attendance',
        body: html`<div class="grid grid-cols-12 gap-4">
            ${ui.field({ label: 'Employee', name: 'employeeId', type: 'select', required: true, value: emp0 ? emp0.id : '', options: empOptions(emps, emp0) })}
            ${ui.field({ label: 'Date', name: 'date', type: 'date', required: true, value: rec ? rec.date : date })}
            ${ui.field({ label: 'Shift', name: 'shiftId', type: 'select', value: sid0, options: [['', 'No shift assigned'], ...shifts.map(s => [s.id, shiftLabel(s)])] })}
            ${ui.field({ label: 'Check-In Time', name: 'checkIn', type: 'time', value: rec ? rec.checkIn : s0 ? s0.startTime : '09:00', half: true })}
            ${ui.field({ label: 'Check-Out Time', name: 'checkOut', type: 'time', value: rec ? rec.checkOut : s0 ? s0.endTime : '17:00', half: true })}
            <div class="col-span-12 rounded-xl border border-line bg-surface-2 p-4" data-preview aria-live="polite"></div>
            ${ui.field({ label: 'Status', name: 'status', type: 'select', value: rec && ['ABSENT', 'HALF_DAY', 'LEAVE'].includes(rec.status) ? rec.status : 'AUTO', options: [['AUTO', 'Auto — Present or Late (from shift start + grace)'], ['HALF_DAY', 'Half Day'], ['ABSENT', 'Absent'], ['LEAVE', 'On Leave']] })}
            ${ui.field({ label: 'Note / Remarks', name: 'note', type: 'textarea', value: rec ? rec.note : '', placeholder: 'e.g. Late due to traffic' })}</div>`,
        onMount(form) {
            const $ = n => form.querySelector(`[name="${n}"]`);
            const applyShift = () => { const s = shiftOf($('shiftId').value); if (s) { $('checkIn').value = s.startTime; $('checkOut').value = s.endTime; } };
            const preview = () => {
                const st = $('status').value, off = st === 'ABSENT' || st === 'LEAVE';
                const h = off ? 0 : hoursBetween($('checkIn').value, $('checkOut').value);
                const status = st === 'AUTO' ? previewStatus($('checkIn').value, shiftOf($('shiftId').value)) : st;
                const overnight = !off && mins($('checkIn').value) !== null && mins($('checkOut').value) !== null && mins($('checkOut').value) < mins($('checkIn').value);
                form.querySelector('[data-preview]').innerHTML = String(html`<div class="flex items-center gap-3"><div class="flex h-10 w-10 items-center justify-center rounded-lg bg-good-soft text-good">${icon('clock', 'w-5 h-5')}</div>
                    <div><div class="eyebrow">Working Hours</div><div><span class="text-lg font-bold">${hm(h)}</span> <span class="text-sm text-muted">(${h.toFixed(2)}h)</span></div></div></div>
                    <div class="mt-2 text-xs text-muted">Preview status: <span class="font-semibold ${ATT[status].tone === 'good' ? 'text-good' : ATT[status].tone === 'warn' ? 'text-warn' : ATT[status].tone === 'bad' ? 'text-bad' : 'text-ink'}">${ATT[status].label}</span>${overnight ? ' · check-out is the next morning (overnight)' : ''}</div>`);
            };
            form.addEventListener('input', preview);
            form.addEventListener('change', ev => {
                if (ev.target.name === 'employeeId' && !rec) { const em = emps.find(x => x.id === ev.target.value); if (em) { $('shiftId').value = em.shiftId || ''; applyShift(); } }
                if (ev.target.name === 'shiftId') applyShift();
                preview();
            });
            preview();
        },
        async onSubmit(v, d) {
            const r = await api.post(API + '/attendance', v);
            d.close();
            ui.toast(`${ATT[r.status].label} — attendance ${r.updated ? 'updated' : 'saved'}`);
            onDone(r.date);
        },
    });
}

function biometricModal() {
    ui.modal({
        title: eyeTitle('ADVANCED INTEGRATION', 'Biometric / QR Settings'), subtitle: 'Placeholder for future API mapping — ZKTeco, thumb scanners, and QR check-in.', width: 560,
        body: html`<div class="space-y-4">
            <div class="rounded-xl border-2 border-dashed border-line p-4"><div class="mb-1 flex items-center gap-2 font-semibold">${icon('lock')}ZKTeco / Biometric Devices</div>
              <p class="mb-3 text-sm text-muted">Map device IP, port, and employee PIN sync. Supports attendance push webhooks.</p>
              <div class="grid grid-cols-2 gap-3"><input class="input" placeholder="Device IP" aria-label="Device IP"><input class="input" placeholder="Port (4370)" aria-label="Port"></div></div>
            <div class="rounded-xl border-2 border-dashed border-line p-4"><div class="mb-1 flex items-center gap-2 font-semibold">${icon('barcode')}QR Code Check-In</div>
              <p class="mb-3 text-sm text-muted">Generate branch QR codes for mobile scan attendance. API endpoint configuration coming soon.</p>
              <input class="input" placeholder="Webhook URL (placeholder)" aria-label="Webhook URL"></div>
            <div class="flex items-start gap-2 rounded-lg border border-amber-200 bg-warn-soft px-3 py-2 text-sm text-warn dark:border-amber-900">${icon('alert', 'w-4 h-4 mt-0.5')}UI-only placeholder. Hardware integrations will connect via secure API keys in a future release.</div></div>`,
        footer: html`<button class="btn btn-outline" data-close>Close</button>`,
    });
}

// ════════════════════════ Leave Management ════════════════════════
HP.page('/hrm/leaves', {
    title: 'Leave Management', perm: PERM,
    async render(el) {
        let data = null, emps = [], open = false;
        ui.mount(el, html`${header({ eyebrow: 'TIME & ACTION', title: 'Leave Management', subtitle: 'Approval pipeline for casual, sick, and annual leave requests.', actions: html`<button class="btn btn-primary" data-new>${icon('plus')}New Leave Request</button>` })}
          <div class="grid gap-4 md:grid-cols-3" data-kpis></div><div data-form></div><div class="mt-6" data-list>${ui.loading()}</div><div class="mt-6" data-taken></div>`);
        const formHtml = () => html`<div class="card card-pad mt-6"><div class="mb-4 font-semibold">Submit Leave Request</div>
          <form class="grid grid-cols-12 gap-4" data-leaveform novalidate>
            ${ui.field({ label: 'Employee', name: 'employeeId', type: 'select', required: true, half: true, options: empOptions(emps) })}
            ${ui.field({ label: 'Leave Type', name: 'type', type: 'select', half: true, value: 'Casual', options: ['Casual', 'Sick', 'Annual'] })}
            ${ui.field({ label: 'From Date', name: 'fromDate', type: 'date', required: true, half: true, value: todayYmd() })}
            ${ui.field({ label: 'To Date', name: 'toDate', type: 'date', required: true, half: true, value: todayYmd() })}
            ${ui.field({ label: 'Reason', name: 'reason', type: 'textarea', placeholder: 'Brief reason for leave' })}
            <div class="col-span-12">${errBox()}</div>
            <div class="col-span-12 flex flex-wrap items-center justify-between gap-3"><div class="text-sm text-muted" data-duration></div>
              <div class="flex gap-2"><button type="button" class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary">Submit Request</button></div></div>
          </form></div>`;
        const duration = () => {
            const f = el.querySelector('[data-leaveform]');
            if (!f) return;
            const a = f.querySelector('[name=fromDate]').value, b = f.querySelector('[name=toDate]').value;
            const n = a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1 : 0;
            f.querySelector('[data-duration]').innerHTML = String(n > 0 ? html`Duration: <b class="text-ink">${n}</b> ${n === 1 ? 'day' : 'days'}` : html`<span class="text-bad">To Date must be on or after From Date</span>`);
        };
        const drawForm = () => { ui.mount(el.querySelector('[data-form]'), open ? formHtml() : ''); duration(); };
        const draw = () => {
            const s = data.stats;
            ui.mount(el.querySelector('[data-kpis]'), html`${kpi({ label: 'Pending Requests', value: s.pending, count: s.pending, tone: 'warn' })}${kpi({ label: 'Approved This Month', value: s.approvedThisMonth, count: s.approvedThisMonth, tone: 'good' })}${kpi({ label: 'Employees On Leave Today', value: s.onLeaveToday, count: s.onLeaveToday, tone: 'accent' })}`);
            const ST = { PENDING: ['Pending', 'warn'], APPROVED: ['Approved', 'good'], REJECTED: ['Rejected', 'bad'] };
            ui.mount(el.querySelector('[data-list]'), ui.table({
                rows: data.rows, empty: 'No leave requests yet. Submit a request to start the approval pipeline.',
                columns: [
                    { label: 'Employee', render: r => person(r.employeeName, r.employeeCode) },
                    { label: 'Leave Type', render: r => ui.badge(r.type, r.type === 'Sick' ? 'bad' : r.type === 'Annual' ? 'accent' : 'gray', false) },
                    { label: 'From Date', render: r => dayLabel(r.fromDate) },
                    { label: 'To Date', render: r => dayLabel(r.toDate) },
                    { label: 'Duration (Days)', num: true, render: r => r.days },
                    { label: 'Reason', render: r => html`<span class="text-muted">${r.reason || '—'}</span>` },
                    { label: 'Status', render: r => html`${ui.badge(...ST[r.status])}${r.decidedBy ? html`<div class="mt-0.5 text-xs text-muted">by ${r.decidedBy}</div>` : ''}` },
                    { label: 'Actions', render: r => html`<div class="flex items-center gap-3 text-sm">${r.status === 'PENDING' ? html`<button class="font-medium text-good" data-approve="${r.id}">Approve</button><button class="text-rose-600" data-reject="${r.id}">Reject</button>` : ''}<button class="btn-icon !h-7 !w-7 border-0" data-delleave="${r.id}" aria-label="Delete request" title="Delete">${icon('trash')}</button></div>` },
                ],
            }));
            ui.mount(el.querySelector('[data-taken]'), html`<div class="mb-3"><div class="font-semibold">Leave Taken This Year (${data.year})</div><div class="text-xs text-muted">Approved leave days per employee</div></div>
              ${ui.table({ rows: data.taken, empty: 'No approved leave this year.', columns: [
                { label: 'Employee', render: r => person(r.employeeName, r.employeeCode) },
                { label: 'Casual', num: true, render: r => r.Casual || 0 }, { label: 'Sick', num: true, render: r => r.Sick || 0 }, { label: 'Annual', num: true, render: r => r.Annual || 0 },
                { label: 'Total (Days)', num: true, render: r => html`<b>${r.total}</b>` },
              ] })}`);
        };
        const load = async () => { [data, emps] = await Promise.all([api.get(API + '/leaves'), api.get(API + '/employees')]); draw(); };
        ui.on(el, 'click', '[data-new]', () => { open = !open; drawForm(); if (open) el.querySelector('[data-leaveform] select').focus(); });
        ui.on(el, 'click', '[data-cancel]', () => { open = false; drawForm(); });
        ui.on(el, 'change', '[data-leaveform] input[type=date]', duration);
        ui.on(el, 'input', '[data-leaveform] input[type=date]', duration);
        ui.on(el, 'submit', '[data-leaveform]', async (e, f) => {
            e.preventDefault();
            if (!requireFilled(f)) return;
            try { const r = await api.post(API + '/leaves', ui.readForm(f)); ui.toast(`${r.type} leave requested for ${r.employeeName}`); open = false; drawForm(); load(); }
            catch (err) { showErr(f, err.message); }
        });
        ui.on(el, 'click', '[data-approve]', async (e, b) => {
            try { const r = await api.post(`${API}/leaves/${b.dataset.approve}/approve`); ui.toast(`Approved${r.marked ? ` · ${plural(r.marked, 'day')} marked On Leave` : ''}`); load(); } catch (err) { ui.fail(err); }
        });
        ui.on(el, 'click', '[data-reject]', async (e, b) => {
            const r = data.rows.find(x => x.id === b.dataset.reject);
            if (!(await ui.confirm({ title: 'Reject this request?', message: `${r.type} leave of ${r.employeeName}, ${dayLabel(r.fromDate)} – ${dayLabel(r.toDate)}.`, ok: 'Reject', danger: true }))) return;
            try { await api.post(`${API}/leaves/${r.id}/reject`); ui.toast('Request rejected'); load(); } catch (err) { ui.fail(err); }
        });
        ui.on(el, 'click', '[data-delleave]', async (e, b) => {
            const r = data.rows.find(x => x.id === b.dataset.delleave);
            if (!(await ui.confirm({ title: 'Delete this leave request?', message: r.status === 'APPROVED' ? 'It is approved: the On Leave days it marked in attendance are cleared too.' : 'The request is removed from the pipeline.', ok: 'Delete', danger: true }))) return;
            try { await api.del(API + '/leaves/' + r.id); ui.toast('Request deleted'); load(); } catch (err) { ui.fail(err); }
        });
        await load();
    },
});

// ════════════════════════ Payroll & Advances ════════════════════════
HP.page('/hrm/payroll', {
    title: 'Payroll & Advances', perm: PERM,
    async render(el) {
        let tab = 'payroll', month = thisMonth(), data = null, advances = [], emps = [];
        ui.mount(el, html`${header({ eyebrow: 'COMPENSATION & TREASURY', tone: 'good', title: 'Payroll & Advances', subtitle: 'Process salaries, manage employee advances, and generate print-ready corporate payslips.' })}
          <div class="grid gap-6 lg:grid-cols-3">
            ${chartCard({ id: 'trend', title: 'Payroll Expense Trend', subtitle: 'Last 6 months — 2.5D depth view', height: 300, cls: 'lg:col-span-2' })}
            <div class="grid gap-4" data-kpis></div></div>
          <div class="mt-6" data-tabs></div><div class="mt-6" data-body>${ui.loading()}</div>`);
        const owedBy = s => advances.filter(a => a.employeeId === s.employeeId && a.status === 'OPEN' && a.deductionMonth <= s.month).reduce((sum, a) => sum + a.remaining, 0);
        const drawPayroll = () => {
            const rows = [...data.rows, ...data.missing.map(m => ({ ...m, missing: true }))];
            ui.mount(el.querySelector('[data-body]'), html`<div class="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div><div class="font-semibold">Monthly Payroll — ${data.label}</div><div class="text-xs text-muted">Net = Basic + Allowances − Deductions (advances, fines, unpaid leave)</div></div>
                <div class="flex flex-wrap items-center gap-2"><input type="month" class="input w-44" value="${month}" data-month aria-label="Payroll month">
                  <button class="btn btn-outline" data-generate ${data.missing.length ? '' : raw('disabled')}>${icon('file')}Generate Payslips${data.missing.length ? ` (${data.missing.length})` : ''}</button>
                  <button class="btn btn-primary" data-payall ${data.stats.drafts ? '' : raw('disabled')}>${icon('banknote')}Pay All Drafts</button></div></div>
              ${ui.table({
                rows, empty: 'No active employees. Add employees to begin payroll processing.',
                columns: [
                    { label: 'Employee', render: r => person(r.employeeName, [r.employeeCode, r.designation].filter(Boolean).join(' · ')) },
                    { label: 'Basic Salary', num: true, cls: 'whitespace-nowrap', render: r => fmt.money(r.basic) },
                    { label: 'Allowances (+)', num: true, cls: 'whitespace-nowrap', render: r => (r.missing ? html`<span class="text-faint">—</span>` : html`<span class="text-good">${fmt.money(r.allowances)}</span>`) },
                    { label: 'Deductions (−)', num: true, cls: 'whitespace-nowrap', render: r => (r.missing ? html`<span class="text-faint">—</span>` : html`<span class="text-bad">${fmt.money(r.deductions + r.advanceCut)}</span>${r.advanceCut ? html`<div class="text-xs text-muted">incl. advance ${fmt.money(r.advanceCut)}</div>` : ''}`) },
                    { label: 'Net Salary', num: true, cls: 'whitespace-nowrap', render: r => (r.missing ? html`<span class="text-faint">—</span>` : html`<span class="font-semibold">${fmt.money(r.net)}</span>`) },
                    { label: 'Status', render: r => (r.missing ? ui.badge('Not generated', 'gray') : r.status === 'PAID' ? html`${ui.badge('Paid', 'good')}<div class="mt-0.5 text-xs text-muted">${fmt.date(r.paidAt)}${r.accountName ? ` · ${r.accountName}` : ''}</div>` : ui.badge('Draft', 'warn')) },
                    { label: 'Actions', render: r => (r.missing ? html`<button class="text-sm font-medium text-accent" data-generate>Generate</button>` : html`<div class="flex flex-wrap gap-3 text-sm">
                        ${r.status === 'DRAFT' ? html`<button class="text-muted hover:text-ink" data-editslip="${r.id}">Edit</button><button class="font-medium text-good" data-pay="${r.id}">Pay</button>` : ''}
                        <button class="text-muted hover:text-ink" data-slip="${r.id}">Payslip</button>${r.status === 'DRAFT' ? html`<button class="text-rose-600" data-delslip="${r.id}">Delete</button>` : ''}</div>`) },
                ],
              })}`);
        };
        const drawAdvances = () => {
            ui.mount(el.querySelector('[data-body]'), html`<div class="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div><div class="font-semibold">Employee Advances & Loans</div><div class="text-xs text-muted">Track disbursements and scheduled payroll recoveries.</div></div>
                <button class="btn btn-primary" data-grant>${icon('plus')}Grant Advance</button></div>
              ${ui.table({
                rows: advances, empty: 'No advances recorded. Grant an advance to begin tracking recoveries.',
                columns: [
                    { label: 'Employee', render: a => person(a.employeeName, a.employeeCode) },
                    { label: 'Advance Amount', num: true, cls: 'whitespace-nowrap', render: a => html`<span class="font-semibold">${fmt.money(a.amount)}</span>` },
                    { label: 'Date Given', render: a => html`${fmt.date(a.date)}${a.accountName ? html`<div class="text-xs text-muted">${a.accountName}</div>` : ''}` },
                    { label: 'Deduction Month', render: a => monthName(a.deductionMonth) },
                    { label: 'Recovered', num: true, cls: 'whitespace-nowrap', render: a => html`<span class="text-good">${fmt.money(a.recovered)}</span>` },
                    { label: 'Remaining', num: true, cls: 'whitespace-nowrap', render: a => html`<span class="${a.remaining ? 'font-medium text-warn' : 'text-muted'}">${fmt.money(a.remaining)}</span>` },
                    { label: 'Status', render: a => (a.status === 'RECOVERED' ? ui.badge('Recovered', 'good') : a.recovered ? ui.badge('Partly recovered', 'warn') : ui.badge('Outstanding', 'warn')) },
                    { label: 'Actions', render: a => (a.recovered ? '' : html`<button class="text-sm text-rose-600" data-void="${a.id}">Void</button>`) },
                ],
              })}`);
        };
        const draw = () => {
            const cur = month === data.current;
            ui.mount(el.querySelector('[data-kpis]'), html`${kpi({ label: cur ? 'Total Payroll Cost (This Month)' : `Total Payroll Cost (${monthName(month, 'short')})`, value: fmt.money(data.stats.total), iconName: 'dollar', tone: 'good', sub: `${fmt.money(data.stats.paid)} paid · ${plural(data.stats.drafts, 'draft')}` })}
              ${kpi({ label: 'Outstanding Advances', value: fmt.money(data.stats.outstandingAdvances), iconName: 'wallet', tone: 'warn' })}
              ${kpi({ label: 'Payslips Generated', value: data.stats.generated, iconName: 'file', sub: data.label })}`);
            drawChart(el, 'trend', data.trend.some(x => x.net) ? bars(data.trend.map(x => monthName(x.month, 'short')), data.trend.map(x => x.net), data.trend.map(() => PAL[3]), { depth: true, money: true }) : null, 'No paid payroll runs yet — process salaries to populate this chart');
            ui.mount(el.querySelector('[data-tabs]'), tabBar('ptab', [['payroll', 'Payroll Processing'], ['advances', 'Advances & Loans']], tab));
            tab === 'payroll' ? drawPayroll() : drawAdvances();
        };
        const load = async () => { [data, advances, emps] = await Promise.all([api.get(API + '/payroll', { month }), api.get(API + '/advances'), api.get(API + '/employees')]); draw(); };
        const slip = id => data.rows.find(r => r.id === id);

        ui.on(el, 'click', '[data-seg=ptab] [data-v]', (e, b) => { tab = b.dataset.v; draw(); });
        ui.on(el, 'change', '[data-month]', (e, inp) => { if (inp.value) { month = inp.value; load().catch(ui.fail); } });
        ui.on(el, 'click', '[data-generate]', async () => {
            try { const r = await api.post(API + '/payroll/generate', { month }); ui.toast(`${plural(r.created, 'draft payslip')} generated for ${data.label}`); load(); } catch (err) { ui.fail(err); }
        });
        ui.on(el, 'click', '[data-editslip]', (e, b) => { const s = slip(b.dataset.editslip); editSlipDrawer(s, owedBy(s), load); });
        ui.on(el, 'click', '[data-pay]', (e, b) => {
            const s = slip(b.dataset.pay);
            payModal({ title: `Pay ${s.employeeName}`, label: `Net salary · ${data.label}`, total: s.net, onPay: accountId => api.post(`${API}/payroll/${s.id}/pay`, { accountId }), done: r => { ui.toast(`Salary paid: ${fmt.money(r.net)}`); load(); } });
        });
        ui.on(el, 'click', '[data-payall]', () => {
            const drafts = data.rows.filter(r => r.status === 'DRAFT');
            payModal({ title: `Pay all drafts — ${data.label}`, label: `${plural(drafts.length, 'payslip')}`, total: drafts.reduce((s, r) => s + r.net, 0), onPay: accountId => api.post(API + '/payroll/pay-all', { month, accountId }), done: r => { ui.toast(`${plural(r.paid, 'payslip')} paid · ${fmt.money(r.total)}`); load(); } });
        });
        ui.on(el, 'click', '[data-slip]', (e, b) => { const s = slip(b.dataset.slip); printSlip(s, emps.find(x => x.id === s.employeeId)); });
        ui.on(el, 'click', '[data-delslip]', async (e, b) => {
            const s = slip(b.dataset.delslip);
            if (!(await ui.confirm({ title: 'Delete this draft payslip?', message: `${s.employeeName} · ${data.label}. You can generate it again.`, ok: 'Delete', danger: true }))) return;
            try { await api.del(API + '/payroll/' + s.id); ui.toast('Draft deleted'); load(); } catch (err) { ui.fail(err); }
        });
        ui.on(el, 'click', '[data-grant]', () => grantDrawer(emps, load));
        ui.on(el, 'click', '[data-void]', async (e, b) => {
            const a = advances.find(x => x.id === b.dataset.void);
            if (!(await ui.confirm({ title: 'Void this advance?', message: `${fmt.money(a.amount)} to ${a.employeeName}. The money is put back into ${a.accountName || 'its account'}.`, ok: 'Void advance', danger: true }))) return;
            try { await api.del(API + '/advances/' + a.id); ui.toast('Advance voided'); load(); } catch (err) { ui.fail(err); }
        });
        await load();
        return () => destroyCharts(el);
    },
});

function editSlipDrawer(s, owed, onDone) {
    ui.formDrawer({
        title: eyeTitle('PAYROLL PROCESSING', 'Edit Payslip', 'good'), subtitle: `${s.employeeName} · ${monthName(s.month)}`, submit: 'Save Payslip',
        body: html`<div class="grid grid-cols-12 gap-4">
            <div class="col-span-12 flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3 text-sm"><span class="text-muted">Basic Salary</span><b>${fmt.money(s.basic)}</b></div>
            ${ui.field({ label: 'Allowances (+)', name: 'allowances', money: true, value: s.allowances, half: true, placeholder: '0.00', help: 'Bonuses, overtime, rewards' })}
            ${ui.field({ label: 'Deductions (−)', name: 'deductions', money: true, value: s.deductions, half: true, placeholder: '0.00', help: 'Fines, unpaid leave' })}
            ${ui.field({ label: 'Advance Recovery (−)', name: 'advanceCut', money: true, value: Math.min(s.advanceCut, owed), placeholder: '0.00', help: `Outstanding advances due by ${monthName(s.month)}: ${fmt.money(owed)}` })}
            ${ui.field({ label: 'Note', name: 'note', value: s.note || '', placeholder: 'Shown on the payslip' })}
            <div class="col-span-12 flex items-center justify-between rounded-xl border border-line p-4" data-net></div></div>`,
        onMount(form) {
            const upd = () => { const v = ui.readForm(form); const net = s.basic + v.allowances - v.deductions - v.advanceCut; form.querySelector('[data-net]').innerHTML = String(html`<span class="text-sm text-muted">Net Salary</span><span class="text-xl font-bold ${net < 0 ? 'text-bad' : ''}">${fmt.money(net)}</span>`); };
            form.addEventListener('input', upd);
            upd();
        },
        async onSubmit(v, d) { await api.put(API + '/payroll/' + s.id, v); d.close(); ui.toast('Payslip saved'); onDone(); },
    });
}

// choose the paying account, then pay (one payslip or all drafts)
async function payModal({ title, label, total, onPay, done }) {
    let accounts;
    try { accounts = await api.get(API + '/accounts'); } catch (err) { return ui.fail(err); }
    const dflt = accounts.find(a => a.isDefault) || accounts[0] || {};
    const m = ui.modal({
        title: eyeTitle('TREASURY DISBURSEMENT', title, 'good'), width: 500,
        body: html`<div class="space-y-4">
            <div class="flex items-center justify-between rounded-xl bg-surface-2 p-4"><span class="text-sm text-muted">${label}</span><span class="text-xl font-bold text-bad">${fmt.money(total)}</span></div>
            <div class="grid grid-cols-12">${ui.field({ label: 'Pay From Account', name: 'accountId', type: 'select', required: true, value: dflt.id || '', options: [['', 'Select treasury account…'], ...accounts.map(a => [a.id, `${a.name} — ${a.accountNo || 'N/A'} (balance ${fmt.money(a.balance)})`])] })}</div>
            <p class="text-xs text-muted">Each salary is recorded as a "Salaries & Wages" expense paid from this account, and the advances it recovers are marked recovered.</p>${errBox()}</div>`,
        footer: html`<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" data-ok>${icon('banknote')}Pay ${fmt.money(total)}</button>`,
    });
    const ok = m.el.querySelector('[data-ok]');
    ok.addEventListener('click', async () => {
        const accountId = m.el.querySelector('[name=accountId]').value;
        if (!accountId) return showErr(m.el, 'Choose the account the salary is paid from.');
        ok.disabled = true;
        try { const r = await onPay(accountId); m.close(); done(r); } catch (err) { showErr(m.el, err.message); ok.disabled = false; }
    });
}

function printSlip(s, emp) {
    const co = (HP.session.settings && HP.session.settings.company) || {};
    const row = (l, v, bold) => html`<tr><td style="padding:3px 0">${l}</td><td style="padding:3px 0;text-align:right;${bold ? 'font-weight:700;border-top:1px solid #000' : ''}">${v}</td></tr>`;
    const box = 'border:1px solid #000;padding:8px 10px';
    ui.print(html`<div class="receipt a4" style="padding:4mm 2mm">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:12px">
          <div style="display:flex;gap:10px;align-items:center">${co.logo ? html`<img src="${co.logo}" style="height:48px;width:auto" alt="">` : ''}
            <div><div style="font-size:18px;font-weight:700">${co.name || HP.session.tenant.name}</div>${co.address ? html`<div>${co.address}</div>` : ''}${co.phone ? html`<div>${co.phone}</div>` : ''}${co.taxId ? html`<div>NTN: ${co.taxId}</div>` : ''}</div></div>
          <div style="text-align:right"><div style="font-size:20px;font-weight:700;letter-spacing:3px">PAYSLIP</div><div style="font-weight:600">${monthName(s.month)}</div>
            <div style="font-size:11px">${s.status === 'PAID' ? `Paid on ${fmt.date(s.paidAt)}${s.accountName ? ' · ' + s.accountName : ''}` : 'DRAFT — not paid yet'}</div></div></div>
        <table style="width:100%;margin-bottom:12px;${box}"><tbody>
          <tr><td style="padding:2px 0">Employee: <b>${s.employeeName}</b></td><td>Employee ID: <b>${s.employeeCode}</b></td></tr>
          <tr><td style="padding:2px 0">Designation: ${s.designation || '—'}</td><td>Department: ${s.department || '—'}</td></tr>
          ${emp ? html`<tr><td style="padding:2px 0">CNIC: ${emp.cnic}</td><td>Bank: ${emp.bankName || '—'}${emp.iban ? ` · ${emp.iban}` : ''}</td></tr><tr><td style="padding:2px 0">Joining date: ${fmt.date(emp.joinDate)}</td><td>Branch: ${emp.branch}</td></tr>` : ''}</tbody></table>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div style="${box}"><div style="font-weight:700;margin-bottom:4px">Earnings</div><table style="width:100%"><tbody>${row('Basic Salary', fmt.money(s.basic))}${row('Allowances', fmt.money(s.allowances))}${row('Gross Earnings', fmt.money(s.basic + s.allowances), true)}</tbody></table></div>
          <div style="${box}"><div style="font-weight:700;margin-bottom:4px">Deductions</div><table style="width:100%"><tbody>${row('Deductions (fines, unpaid leave)', fmt.money(s.deductions))}${row('Advance recovery', fmt.money(s.advanceCut))}${row('Total Deductions', fmt.money(s.deductions + s.advanceCut), true)}</tbody></table></div></div>
        <div style="margin-top:12px;border:2px solid #000;padding:10px;display:flex;justify-content:space-between;font-size:16px;font-weight:700"><span>NET SALARY</span><span>${fmt.money(s.net)}</span></div>
        ${s.note ? html`<div style="margin-top:8px">Note: ${s.note}</div>` : ''}
        <div style="display:flex;justify-content:space-between;margin-top:56px"><div style="border-top:1px solid #000;width:40%;text-align:center;padding-top:4px">Employer signature</div><div style="border-top:1px solid #000;width:40%;text-align:center;padding-top:4px">Employee signature</div></div>
        <div style="margin-top:18px;font-size:10px;text-align:center">Computer-generated payslip</div></div>`);
}

async function grantDrawer(emps, onDone) {
    let accounts;
    try { accounts = await api.get(API + '/accounts'); } catch (err) { return ui.fail(err); }
    ui.formDrawer({
        title: eyeTitle('TREASURY DISBURSEMENT', 'Grant Advance', 'warn'), subtitle: 'Record a salary advance or employee loan for scheduled recovery.', submit: 'Grant Advance',
        body: html`<div class="grid grid-cols-12 gap-4">
            ${ui.field({ label: 'Employee', name: 'employeeId', type: 'select', required: true, options: empOptions(emps) })}
            ${ui.field({ label: 'Advance Amount', name: 'amount', money: true, required: true, placeholder: '0.00' })}
            ${ui.field({ label: 'Date Given', name: 'date', type: 'date', value: todayYmd(), half: true })}
            ${ui.field({ label: 'Deduction Month', name: 'deductionMonth', type: 'month', value: thisMonth(), half: true, help: 'Recovered from this month’s payslip' })}
            ${ui.field({ label: 'Disbursement Bank Account', name: 'accountId', type: 'select', required: true, options: [['', 'Select treasury account…'], ...accounts.map(a => [a.id, `${a.name} — ${a.accountNo || 'N/A'}`])] })}
            ${ui.field({ label: 'Repayment Schedule / Note', name: 'note', type: 'textarea', placeholder: 'e.g. Deduct in full from March payroll, or 50% over two months' })}</div>`,
        async onSubmit(v, d) {
            if (!v.amount) throw new Error('Advance Amount is required.');
            const r = await api.post(API + '/advances', v);
            d.close(); ui.toast(`Advance of ${fmt.money(r.amount)} granted to ${r.employeeName}`); onDone();
        },
    });
}

// ════════════════════════ Recruitment ════════════════════════
HP.page('/hrm/recruitment', {
    title: 'Recruitment', perm: PERM,
    async render(el) {
        let data = { postings: [], candidates: [] }, postingForm = false, dragId = null;
        ui.mount(el, html`${header({ eyebrow: 'TALENT ACQUISITION', title: 'Recruitment', subtitle: 'Active job postings and applicant pipeline — Kanban hiring board.', actions: html`<button class="btn btn-primary" data-addcand>${icon('plus')}Add Candidate</button>` })}
          <div class="mb-3 flex items-center justify-between gap-3"><h2 class="font-semibold">Active Job Postings</h2><button class="btn btn-outline btn-sm" data-addpost>${icon('plus')}Add Posting</button></div>
          <div data-postform></div><div data-postings>${ui.loading()}</div>
          <div class="mt-8 mb-3"><h2 class="font-semibold">Applicant Pipeline</h2><p class="text-xs text-muted">Drag a card to another column, or change its stage with the list on the card.</p></div>
          <div data-board></div>`);
        const postFormHtml = () => html`<div class="card card-pad mb-4"><div class="mb-4 font-semibold">New Job Posting</div>
          <form class="grid grid-cols-12 gap-4" data-postingform novalidate>
            ${ui.field({ label: 'Job Title', name: 'title', required: true, placeholder: 'e.g. Cashier', half: true })}
            ${ui.field({ label: 'Department', name: 'department', type: 'select', options: DEPARTMENTS, half: true })}
            ${ui.field({ label: 'Openings (slots)', name: 'openings', type: 'number', value: 1, min: 1, step: 1, half: true })}
            ${ui.field({ label: 'Status', name: 'status', type: 'select', options: [['OPEN', 'Open'], ['CLOSED', 'Closed']], half: true })}
            <div class="col-span-12">${errBox()}</div>
            <div class="col-span-12 flex justify-end gap-2"><button type="button" class="btn btn-outline" data-postcancel>Cancel</button><button class="btn btn-primary">Save Posting</button></div></form></div>`;
        const drawPostings = () => ui.mount(el.querySelector('[data-postings]'), data.postings.length
            ? html`<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">${data.postings.map(p => html`<div class="card card-pad ${p.status === 'CLOSED' ? 'opacity-70' : ''}">
                <div class="flex items-start justify-between gap-2"><div class="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">${icon('briefcase')}</div>
                  <div class="flex items-center gap-1">${p.status === 'OPEN' ? ui.badge('OPEN', 'good', false) : ui.badge('CLOSED', 'gray', false)}<button class="btn-icon !h-7 !w-7 border-0" data-postmenu="${p.id}" aria-label="Actions for ${p.title}">${icon('dots')}</button></div></div>
                <div class="mt-3 font-semibold">${p.title}</div><div class="text-xs text-muted">${p.department}</div>
                <div class="mt-3 flex items-center justify-between text-xs"><span class="flex items-center gap-1 text-muted">${icon('users', 'w-3.5 h-3.5')}${plural(p.applicants, 'applicant')}</span><span class="font-medium text-accent">${plural(p.openings, 'slot')}${p.hired ? ` · ${p.hired} hired` : ''}</span></div></div>`)}</div>`
            : html`<div class="card py-10 text-center text-sm text-muted">No job postings yet. Add a posting to show open roles here.</div>`);
        const card = c => html`<div class="cursor-grab rounded-lg border border-line bg-surface p-3 shadow-sm active:cursor-grabbing" draggable="true" data-cand="${c.id}">
            <div class="flex items-start justify-between gap-2"><div class="min-w-0"><div class="truncate font-medium">${c.name}</div><div class="truncate text-xs text-muted">${c.position}${c.department ? ` · ${c.department}` : ''}</div></div>
              <button class="btn-icon !h-7 !w-7 shrink-0 border-0" data-candmenu="${c.id}" aria-label="Actions for ${c.name}">${icon('dots')}</button></div>
            <div class="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted"><span class="inline-flex items-center gap-1">${icon('calendar', 'w-3.5 h-3.5')}${fmt.date(c.appliedDate)}</span>${c.phone ? html`<span>${c.phone}</span>` : ''}${c.hasResume ? html`<span class="inline-flex items-center gap-1 text-accent">${icon('file', 'w-3.5 h-3.5')}CV</span>` : ''}</div>
            <select class="input mt-2 h-8 text-xs" data-stage="${c.id}" aria-label="Stage of ${c.name}">${STAGES.map(([v, l]) => html`<option value="${v}" ${v === c.stage ? raw('selected') : ''}>${l}</option>`)}</select></div>`;
        const COL_TONE = { HIRED: 'text-good', REJECTED: 'text-bad' };
        const drawBoard = () => ui.mount(el.querySelector('[data-board]'), html`<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">${STAGES.map(([st, label]) => {
            const cards = data.candidates.filter(c => c.stage === st);
            return html`<div class="flex min-h-[260px] flex-col rounded-xl border border-line bg-surface transition" data-col="${st}">
                <div class="flex items-center justify-between border-b border-line px-4 py-3"><span class="text-xs font-semibold uppercase tracking-wider ${COL_TONE[st] || ''}">${label}</span><span class="rounded-full border border-line bg-surface-2 px-2 text-xs font-medium">${cards.length}</span></div>
                <div class="flex flex-1 flex-col gap-2 p-3">${cards.length ? cards.map(card) : html`<div class="flex flex-1 items-center justify-center py-6 text-xs text-muted">Drop candidates here</div>`}</div></div>`;
        })}</div>`);
        const load = async () => { data = await api.get(API + '/recruitment'); drawPostings(); drawBoard(); };
        const move = async (id, stage) => {
            const c = data.candidates.find(x => x.id === id);
            if (!c || c.stage === stage) return;
            const prev = c.stage;
            c.stage = stage; drawBoard();
            try { await api.patch(`${API}/candidates/${id}/stage`, { stage }); ui.toast(`${c.name} → ${STAGE_LABEL[stage]}`); }
            catch (err) { c.stage = prev; drawBoard(); return ui.fail(err); }
            load().catch(ui.fail);
            if (stage === 'HIRED' && await ui.confirm({ title: `${c.name} is hired`, message: 'Create the employee record now? Name, phone and position are filled in for you.', ok: 'Create Employee' })) {
                employeeDrawer(null, null, { name: c.name, phone: c.phone, designation: c.position, department: DEPARTMENTS.includes(c.department) ? c.department : 'Sales' });
            }
        };

        ui.on(el, 'click', '[data-addcand]', () => candidateDrawer(data.postings, load));
        ui.on(el, 'click', '[data-addpost]', () => { postingForm = !postingForm; ui.mount(el.querySelector('[data-postform]'), postingForm ? postFormHtml() : ''); if (postingForm) el.querySelector('[data-postingform] input').focus(); });
        ui.on(el, 'click', '[data-postcancel]', () => { postingForm = false; ui.mount(el.querySelector('[data-postform]'), ''); });
        ui.on(el, 'submit', '[data-postingform]', async (e, f) => {
            e.preventDefault();
            if (!requireFilled(f)) return;
            try { const p = await api.post(API + '/postings', ui.readForm(f)); ui.toast(`Posting "${p.title}" added`); postingForm = false; ui.mount(el.querySelector('[data-postform]'), ''); load(); }
            catch (err) { showErr(f, err.message); }
        });
        ui.on(el, 'click', '[data-postmenu]', (e, b) => {
            const p = data.postings.find(x => x.id === b.dataset.postmenu);
            ui.menu(b, [
                { label: p.status === 'OPEN' ? 'Close posting' : 'Reopen posting', iconName: p.status === 'OPEN' ? 'lock' : 'refresh', onClick: async () => { try { await api.put(API + '/postings/' + p.id, { status: p.status === 'OPEN' ? 'CLOSED' : 'OPEN' }); ui.toast(p.status === 'OPEN' ? 'Posting closed' : 'Posting reopened'); load(); } catch (err) { ui.fail(err); } } },
                { label: 'Delete posting', iconName: 'trash', danger: true, onClick: async () => { if (!(await ui.confirm({ title: `Delete "${p.title}"?`, message: 'Its candidates stay in the pipeline.', ok: 'Delete', danger: true }))) return; try { await api.del(API + '/postings/' + p.id); ui.toast('Posting deleted'); load(); } catch (err) { ui.fail(err); } } },
            ]);
        });
        ui.on(el, 'click', '[data-candmenu]', (e, b) => {
            const c = data.candidates.find(x => x.id === b.dataset.candmenu);
            ui.menu(b, [
                c.hasResume && { label: 'Download resume', iconName: 'download', onClick: async () => { try { const r = await api.get(`${API}/candidates/${c.id}/resume`); downloadDataUrl(r.resume, `${c.name} resume`); } catch (err) { ui.fail(err); } } },
                c.stage === 'HIRED' && { label: 'Create employee', iconName: 'userPlus', onClick: () => employeeDrawer(null, null, { name: c.name, phone: c.phone, designation: c.position, department: DEPARTMENTS.includes(c.department) ? c.department : 'Sales' }) },
                { label: 'Remove candidate', iconName: 'trash', danger: true, onClick: async () => { if (!(await ui.confirm({ title: `Remove ${c.name}?`, message: 'The candidate leaves the pipeline.', ok: 'Remove', danger: true }))) return; try { await api.del(API + '/candidates/' + c.id); ui.toast('Candidate removed'); load(); } catch (err) { ui.fail(err); } } },
            ]);
        });
        ui.on(el, 'change', '[data-stage]', (e, s) => move(s.dataset.stage, s.value));
        // drag and drop between columns
        const clearDrop = () => el.querySelectorAll('[data-col]').forEach(x => x.classList.remove('ring-2', 'ring-accent', 'bg-accent-soft'));
        el.addEventListener('dragstart', e => { const c = e.target.closest && e.target.closest('[data-cand]'); if (!c) return; dragId = c.dataset.cand; e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; c.classList.add('opacity-50'); });
        el.addEventListener('dragend', e => { const c = e.target.closest && e.target.closest('[data-cand]'); if (c) c.classList.remove('opacity-50'); clearDrop(); dragId = null; });
        el.addEventListener('dragover', e => { const col = e.target.closest('[data-col]'); if (!col || !dragId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!col.classList.contains('ring-2')) { clearDrop(); col.classList.add('ring-2', 'ring-accent', 'bg-accent-soft'); } });
        el.addEventListener('drop', e => { const col = e.target.closest('[data-col]'); if (!col) return; e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || dragId; clearDrop(); dragId = null; if (id) move(id, col.dataset.col); });
        await load();
    },
});

function candidateDrawer(postings, onDone) {
    let resume = null;
    const open = postings.filter(p => p.status === 'OPEN');
    ui.formDrawer({
        title: eyeTitle('TALENT ACQUISITION', 'Add Candidate'), subtitle: 'Log a new applicant to the recruitment pipeline.', submit: 'Add Candidate',
        body: html`<div class="grid grid-cols-12 gap-4">
            ${ui.field({ label: 'Full Name', name: 'name', required: true, placeholder: 'e.g. Sara Ahmed' })}
            ${ui.field({ label: 'Phone', name: 'phone', required: true, placeholder: '03xx-xxxxxxx' })}
            ${ui.field({ label: 'Applied Position', name: 'postingId', type: 'select', options: [['', 'Select or type below…'], ...open.map(p => [p.id, `${p.title} — ${p.department}`])] })}
            ${ui.field({ label: 'Position Title', name: 'position', required: true, placeholder: 'e.g. Sales Executive' })}
            <div class="col-span-12"><div class="label">Resume Upload</div>
              <label class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line px-4 py-6 text-center text-sm text-muted hover:bg-surface-2" data-dropzone>${icon('upload', 'w-6 h-6')}
                <span data-resname>Drop a PDF, image or Word file here (up to 250 KB)</span><span class="btn btn-outline btn-sm">Browse Resume</span><input type="file" class="hidden" accept="${FILE_ACCEPT}" data-resume aria-label="Resume file"></label></div>
            ${ui.field({ label: 'Applied Date', name: 'appliedDate', type: 'date', value: todayYmd() })}</div>`,
        onMount(form) {
            const take = async file => {
                try { resume = await pickFile(file); form.querySelector('[data-resname]').textContent = resume ? `${resume.name} — attached` : 'Drop a PDF, image or Word file here (up to 250 KB)'; }
                catch (err) { resume = null; ui.fail(err); }
            };
            form.addEventListener('change', e => {
                if (e.target.name === 'postingId') { const p = postings.find(x => x.id === e.target.value); if (p) form.querySelector('[name=position]').value = p.title; }
                if (e.target.matches('[data-resume]')) take(e.target.files[0]);
            });
            const zone = form.querySelector('[data-dropzone]');
            zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('bg-surface-2'); });
            zone.addEventListener('dragleave', () => zone.classList.remove('bg-surface-2'));
            zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('bg-surface-2'); take(e.dataTransfer.files[0]); });
        },
        async onSubmit(v, d) {
            const r = await api.post(API + '/candidates', { ...v, resume: resume ? resume.dataUrl : '' });
            d.close(); ui.toast(`${r.name} added to Applied`); onDone();
        },
    });
}

// ════════════════════════ Performance & Assets ════════════════════════
HP.page('/hrm/performance', {
    title: 'Performance & Assets', perm: PERM,
    async render(el) {
        let tab = 'appraisals', form = null, emps = [], appraisals = { rows: [], byDepartment: [] }, disc = [], assets = [];
        ui.mount(el, html`${header({ eyebrow: 'TALENT & OPERATIONS', tone: 'purple', title: 'Performance & Assets', subtitle: 'Appraisals, disciplinary records, rewards, and company asset registry.' })}
          <div data-tabs></div><div class="mt-6" data-body>${ui.loading()}</div>`);
        const stars = r => html`<span class="whitespace-nowrap"><span class="text-warn">${'★'.repeat(Math.round(r))}</span><span class="text-line">${'★'.repeat(5 - Math.round(r))}</span> <span class="text-xs text-muted">${Number(r).toFixed(1)}/5</span></span>`;
        const formButtons = (save) => html`<div class="col-span-12">${errBox()}</div><div class="col-span-12 flex justify-end gap-2"><button type="button" class="btn btn-outline" data-formcancel>Cancel</button><button class="btn btn-primary">${save}</button></div>`;
        const apprForm = () => html`<div class="card card-pad mt-4"><div class="mb-4 font-semibold">Add Appraisal</div><form class="grid grid-cols-12 gap-4" data-apprform novalidate>
            ${ui.field({ label: 'Employee', name: 'employeeId', type: 'select', required: true, half: true, options: empOptions(emps) })}
            ${ui.field({ label: 'Review Period', name: 'period', type: 'month', required: true, half: true, value: thisMonth() })}
            ${ui.field({ label: 'Rating (0–5)', name: 'rating', type: 'number', value: 4, half: true, step: 0.5, attr: { max: 5 } })}
            ${ui.field({ label: 'Feedback', name: 'feedback', type: 'textarea', placeholder: 'Performance summary, goals, areas of improvement…' })}
            ${formButtons('Save Appraisal')}</form></div>`;
        const discForm = kind => html`<div class="card card-pad mt-4 border-l-4 ${kind === 'WARNING' ? 'border-l-red-500' : 'border-l-emerald-500'}"><div class="mb-4 font-semibold">${kind === 'WARNING' ? 'Official Warning' : 'Reward / Bonus'}</div>
            <form class="grid grid-cols-12 gap-4" data-discform="${kind}" novalidate>
            ${ui.field({ label: 'Employee', name: 'employeeId', type: 'select', required: true, half: true, options: empOptions(emps) })}
            ${ui.field({ label: 'Date', name: 'date', type: 'date', half: true, value: todayYmd() })}
            ${ui.field({ label: 'Title', name: 'title', required: true, placeholder: kind === 'WARNING' ? 'e.g. Late attendance — written warning' : 'e.g. Q1 performance bonus' })}
            ${kind === 'REWARD' ? ui.field({ label: 'Bonus Amount', name: 'amount', money: true, half: true, placeholder: '0.00', help: 'Added to the allowances of that month’s payslip' }) : ''}
            ${ui.field({ label: 'Description', name: 'description', type: 'textarea' })}
            ${formButtons('Save Record')}</form></div>`;
        const discCard = kind => {
            const w = kind === 'WARNING', rows = disc.filter(d => d.kind === kind);
            return html`<div class="card overflow-hidden border-t-4 ${w ? 'border-t-red-500' : 'border-t-emerald-500'}">
                <div class="flex items-center gap-2 border-b border-line px-5 py-4 font-semibold ${w ? 'text-bad' : 'text-good'}">${icon(w ? 'shield' : 'award')}${w ? 'Official Warnings' : 'Rewards & Bonuses'}<span class="ms-auto text-xs font-normal text-muted">${rows.length || ''}</span></div>
                ${rows.length ? html`<div class="divide-y divide-line">${rows.map(d => html`<div class="flex items-start gap-3 px-5 py-3">
                    <div class="min-w-0 flex-1"><div class="font-medium">${d.title}</div><div class="text-xs text-muted">${d.employeeName} · ${fmt.date(d.date)}</div>${d.description ? html`<div class="mt-1 text-sm text-muted">${d.description}</div>` : ''}</div>
                    ${!w && d.amount ? html`<div class="whitespace-nowrap font-semibold text-good">${fmt.money(d.amount)}</div>` : ''}
                    <button class="btn-icon !h-7 !w-7 border-0 !text-rose-600" data-deldisc="${d.id}" aria-label="Delete ${d.title}" title="Delete">${icon('trash')}</button></div>`)}</div>`
                : html`<div class="py-10 text-center text-sm text-muted">${w ? 'No warnings on record' : 'No rewards on record'}</div>`}</div>`;
        };
        const assetIcon = c => (c === 'Vehicle' ? 'truck' : c === 'Phone' || c === 'Tablet' ? 'monitor' : c === 'Access Card' ? 'tag' : 'laptop');
        const draw = () => {
            ui.mount(el.querySelector('[data-tabs]'), tabBar('perf', [['appraisals', withIcon('star', 'Appraisals & KPIs')], ['discipline', withIcon('shield', 'Warnings & Rewards')], ['assets', withIcon('laptop', 'Asset Management')]], tab));
            const body = el.querySelector('[data-body]');
            destroyCharts(body);
            if (tab === 'appraisals') {
                ui.mount(body, html`${chartCard({ id: 'dept', title: 'Department-wise Performance', subtitle: 'Average appraisal rating by department — 2.5D depth view', height: 260 })}
                  <div class="mt-6 flex justify-end"><button class="btn btn-primary" data-addappr>${icon('plus')}Add Appraisal</button></div>${form === 'appraisal' ? apprForm() : ''}
                  <div class="mt-4">${ui.table({ rows: appraisals.rows, empty: 'No appraisals yet. Add employee performance reviews to get started.', columns: [
                    { label: 'Employee', render: r => person(r.employeeName, [r.employeeCode, r.department].filter(Boolean).join(' · ')) },
                    { label: 'Review Period', render: r => monthName(r.period) },
                    { label: 'Rating', render: r => stars(r.rating) },
                    { label: 'Feedback', render: r => html`<span class="text-muted">${r.feedback || '—'}</span>` },
                    { label: '', render: r => html`<button class="btn-icon !h-7 !w-7 border-0" data-delappr="${r.id}" aria-label="Delete appraisal" title="Delete">${icon('trash')}</button>` },
                  ] })}</div>`);
                const b = appraisals.byDepartment;
                drawChart(body, 'dept', b.length ? bars(b.map(x => x.department), b.map(x => x.average), b.map((x, i) => PAL[i % PAL.length]), { depth: true, yMax: 5, label: 'Average rating', step: 1 }) : null, 'No appraisal data yet — add employee reviews to populate this chart');
            } else if (tab === 'discipline') {
                ui.mount(body, html`<div class="flex flex-wrap justify-end gap-2">
                    <button class="btn bg-bad-soft text-bad hover:opacity-90 ${form === 'WARNING' ? 'ring-1 ring-current' : ''}" data-logform="WARNING">${icon('shield')}Log Warning</button>
                    <button class="btn bg-good-soft text-good hover:opacity-90 ${form === 'REWARD' ? 'ring-1 ring-current' : ''}" data-logform="REWARD">${icon('award')}Log Reward</button></div>
                  ${form === 'WARNING' || form === 'REWARD' ? discForm(form) : ''}
                  <div class="mt-6 grid gap-6 lg:grid-cols-2">${discCard('WARNING')}${discCard('REWARD')}</div>`);
            } else {
                ui.mount(body, html`<div class="flex justify-end"><button class="btn btn-primary" data-assign>${icon('plus')}Assign Asset</button></div>
                  <div class="mt-4">${ui.table({ rows: assets, empty: 'No assets assigned. Track laptops, phones, and vehicles here.', columns: [
                    { label: 'Asset ID / Name', render: a => html`<div class="flex items-center gap-3"><div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">${icon(assetIcon(a.category))}</div><div class="min-w-0"><div class="font-medium">${a.name}</div><div class="truncate font-mono text-xs text-muted">${a.code || '—'} · ${a.category}</div></div></div>` },
                    { label: 'Assigned To', render: a => person(a.employeeName, a.employeeCode) },
                    { label: 'Issue Date', render: a => fmt.date(a.issueDate) },
                    { label: 'Return Date', render: a => (a.returnDate ? fmt.date(a.returnDate) : html`<span class="text-faint">—</span>`) },
                    { label: 'Status', render: a => ui.badge(...ASSET_STATUS[a.status]) },
                    { label: 'Actions', render: a => html`<div class="flex items-center gap-3 text-sm">${a.status === 'IN_USE' ? html`<button class="font-medium text-good" data-return="${a.id}">Mark returned</button>` : ''}<button class="btn-icon !h-7 !w-7 border-0" data-assetmenu="${a.id}" aria-label="More actions for ${a.name}">${icon('dots')}</button></div>` },
                  ] })}</div>`);
            }
        };
        const load = async () => {
            [emps, appraisals, disc, assets] = await Promise.all([api.get(API + '/employees'), api.get(API + '/appraisals'), api.get(API + '/disciplinary'), api.get(API + '/assets')]);
            draw();
        };
        const focusForm = () => { const f = el.querySelector('[data-apprform], [data-discform]'); if (f) f.querySelector('select').focus(); };

        ui.on(el, 'click', '[data-seg=perf] [data-v]', (e, b) => { if (tab === b.dataset.v) return; tab = b.dataset.v; form = null; draw(); });
        ui.on(el, 'click', '[data-addappr]', () => { form = form === 'appraisal' ? null : 'appraisal'; draw(); focusForm(); });
        ui.on(el, 'click', '[data-logform]', (e, b) => { form = form === b.dataset.logform ? null : b.dataset.logform; draw(); focusForm(); });
        ui.on(el, 'click', '[data-formcancel]', () => { form = null; draw(); });
        ui.on(el, 'submit', '[data-apprform]', async (e, f) => {
            e.preventDefault();
            if (!requireFilled(f)) return;
            try { await api.post(API + '/appraisals', ui.readForm(f)); ui.toast('Appraisal saved'); form = null; appraisals = await api.get(API + '/appraisals'); draw(); }
            catch (err) { showErr(f, err.message); }
        });
        ui.on(el, 'submit', '[data-discform]', async (e, f) => {
            e.preventDefault();
            if (!requireFilled(f)) return;
            try { await api.post(API + '/disciplinary', { ...ui.readForm(f), kind: f.dataset.discform }); ui.toast(f.dataset.discform === 'WARNING' ? 'Warning logged' : 'Reward logged'); form = null; disc = await api.get(API + '/disciplinary'); draw(); }
            catch (err) { showErr(f, err.message); }
        });
        ui.on(el, 'click', '[data-delappr]', async (e, b) => {
            const r = appraisals.rows.find(x => x.id === b.dataset.delappr);
            if (!(await ui.confirm({ title: 'Delete this appraisal?', message: `${r.employeeName} · ${monthName(r.period)}`, ok: 'Delete', danger: true }))) return;
            try { await api.del(API + '/appraisals/' + r.id); ui.toast('Appraisal deleted'); appraisals = await api.get(API + '/appraisals'); draw(); } catch (err) { ui.fail(err); }
        });
        ui.on(el, 'click', '[data-deldisc]', async (e, b) => {
            const d = disc.find(x => x.id === b.dataset.deldisc);
            if (!(await ui.confirm({ title: `Delete "${d.title}"?`, message: d.kind === 'REWARD' && d.amount ? 'Payslips already generated keep the bonus; new ones will not include it.' : `${d.employeeName} · ${fmt.date(d.date)}`, ok: 'Delete', danger: true }))) return;
            try { await api.del(API + '/disciplinary/' + d.id); ui.toast('Record deleted'); disc = await api.get(API + '/disciplinary'); draw(); } catch (err) { ui.fail(err); }
        });
        const reloadAssets = async () => { assets = await api.get(API + '/assets'); draw(); };
        const returnAsset = async (a, status) => { try { await api.post(`${API}/assets/${a.id}/return`, { status, returnDate: todayYmd() }); ui.toast(status === 'DAMAGED' ? 'Marked damaged' : 'Marked returned'); reloadAssets(); } catch (err) { ui.fail(err); } };
        ui.on(el, 'click', '[data-assign]', () => assetDrawer(null, emps, reloadAssets));
        ui.on(el, 'click', '[data-return]', (e, b) => returnAsset(assets.find(x => x.id === b.dataset.return), 'RETURNED'));
        ui.on(el, 'click', '[data-assetmenu]', (e, b) => {
            const a = assets.find(x => x.id === b.dataset.assetmenu);
            ui.menu(b, [
                { label: 'Edit', iconName: 'edit', onClick: () => assetDrawer(a, emps, reloadAssets) },
                a.status === 'IN_USE' && { label: 'Mark damaged', iconName: 'alert', onClick: () => returnAsset(a, 'DAMAGED') },
                { label: 'Delete record', iconName: 'trash', danger: true, onClick: async () => { if (!(await ui.confirm({ title: `Delete "${a.name}"?`, message: 'The assignment record is removed from the registry.', ok: 'Delete', danger: true }))) return; try { await api.del(API + '/assets/' + a.id); ui.toast('Asset record deleted'); reloadAssets(); } catch (err) { ui.fail(err); } } },
            ]);
        });
        await load();
        return () => destroyCharts(el);
    },
});

function assetDrawer(a, emps, onDone) {
    const keep = a ? { id: a.employeeId, name: a.employeeName, code: a.employeeCode } : null;
    ui.formDrawer({
        title: eyeTitle('ASSET REGISTRY', a ? 'Edit Asset' : 'Assign Asset', 'purple'), subtitle: 'Track company hardware, vehicles, and equipment issued to staff.', submit: a ? 'Save Asset' : 'Assign Asset',
        body: html`<div class="grid grid-cols-12 gap-4">
            ${ui.field({ label: 'Asset Name', name: 'name', required: true, value: a ? a.name : '', placeholder: 'e.g. MacBook Pro 14' })}
            ${ui.field({ label: 'Asset ID / Code', name: 'code', value: a ? a.code : '', placeholder: 'e.g. AST-0042', cls: '[&_input]:font-mono', half: true })}
            ${ui.field({ label: 'Category', name: 'category', type: 'select', value: a ? a.category : 'Laptop', options: ASSET_CATEGORIES, half: true })}
            ${ui.field({ label: 'Assign To', name: 'employeeId', type: 'select', required: true, value: a ? a.employeeId : '', options: empOptions(emps, keep) })}
            ${ui.field({ label: 'Issue Date', name: 'issueDate', type: 'date', value: a ? fmt.ymd(a.issueDate) : todayYmd(), half: true })}
            ${ui.field({ label: 'Return Date', name: 'returnDate', type: 'date', value: a && a.returnDate ? fmt.ymd(a.returnDate) : '', half: true })}
            ${ui.field({ label: 'Status', name: 'status', type: 'select', value: a ? a.status : 'IN_USE', options: Object.entries(ASSET_STATUS).map(([v, [l]]) => [v, l]) })}
            ${ui.field({ label: 'Note', name: 'note', type: 'textarea', value: a ? a.note : '', placeholder: 'Serial number, condition, accessories included…' })}</div>`,
        async onSubmit(v, d) {
            if (a) await api.put(API + '/assets/' + a.id, v); else await api.post(API + '/assets', v);
            d.close(); ui.toast(a ? 'Asset saved' : 'Asset assigned'); onDone();
        },
    });
}
