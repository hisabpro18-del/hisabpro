// Dashboard: greeting, date range, KPI cards (period figures with "vs last period", LIVE balances), Action Center,
// Revenue & Profit Trend, Sales by Category, Cashflow Activity, Low Stock Alert, Action Items & Health.
// Layout and labels follow reference/REFERENCE.md › Dashboard. Figures come from /api/reports/dashboard.
const { html, icon, api, ui, fmt, t } = HP;

const RANGE_KEY = 'hp.range.dashboard';
const loadRange = () => { try { return JSON.parse(localStorage.getItem(RANGE_KEY)) || { preset: 'month' }; } catch { return { preset: 'month' }; } };
const saveRange = r => { try { localStorage.setItem(RANGE_KEY, JSON.stringify(r)); } catch { } };

const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const dayLabel = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const ICON = { accent: 'bg-accent-soft text-accent', good: 'bg-good-soft text-good', bad: 'bg-bad-soft text-bad', warn: 'bg-warn-soft text-warn', gray: 'bg-surface-2 text-muted' };
const signTone = v => (v < 0 ? 'text-bad' : 'text-good');

function greeting() {
    let h = 9;
    try { h = Number(new Intl.DateTimeFormat('en-US', { timeZone: fmt.tz(), hour: 'numeric', hourCycle: 'h23' }).format(new Date())); } catch { }
    return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
}

// "↗ +100% vs last period". Expenses are coloured the other way round (a rise is bad), as in the reference.
function deltaLine(d, inverse) {
    const good = inverse ? d < 0 : d >= 0;
    const arrow = inverse ? (d > 0 ? '↗' : '↘') : (d < 0 ? '↘' : '↗');
    return html`<div class="mt-3 flex items-center gap-1.5 text-xs font-medium ${good ? 'text-good' : 'text-bad'}"><span aria-hidden="true">${arrow}</span>${d === 0 ? 'No change' : `${d > 0 ? '+' : ''}${d}%`} vs last period</div>`;
}
const live = html`<span class="rounded-full border border-emerald-200 bg-good-soft px-1.5 py-px text-[10px] font-semibold tracking-wider text-good dark:border-emerald-900">LIVE</span>`;

function kpi({ label, value, valueCls = '', iconName, tone = 'gray', sub, delta, inverse, isLive, hero, heroCls = '' }) {
    return html`<div class="${hero ? `rounded-2xl border p-6 ${heroCls}` : 'card p-6'} flex items-start justify-between gap-3">
        <div class="min-w-0"><div class="flex items-center gap-2 text-sm text-muted">${t(label)}${isLive ? live : ''}</div>
          <div class="mt-2 ${hero ? 'text-3xl' : String(value).length > 14 ? 'text-xl' : 'text-2xl'} break-words font-bold tracking-tight tabular-nums ${valueCls}">${value}</div>
          ${sub ? html`<div class="mt-1 text-xs text-muted">${sub}</div>` : ''}${delta === undefined ? '' : deltaLine(delta, inverse)}</div>
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ICON[tone]}">${icon(iconName, 'w-5 h-5')}</div></div>`;
}

const ACTIONS = [
    ['New Sale', '/pos', 'cart', 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300'],
    ['Payment In', '/payments?type=in', 'arrowDown', 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300'],
    ['Payment Out', '/payments?type=out', 'arrowUp', 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-300'],
    ['Add Expense', '/expenses', 'receipt', 'bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-300'],
    ['Add Product', '/products', 'package', 'bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-300'],
];

function healthText(h) {
    switch (h.id) {
        case 'sync': return h.ok ? 'All data synced' : `${h.count} change(s) waiting to sync`;
        case 'vendors': return h.ok ? 'No overdue vendor payments' : `${h.count} vendor payment(s) overdue (over 30 days)`;
        case 'receivables': return h.ok ? 'No pending receivables' : `${fmt.money(h.amount)} pending from ${h.count} customer(s)`;
        case 'restock': return h.ok ? 'Stock levels are healthy' : `${h.count} products need restocking`;
        case 'expiry': return h.ok ? `No products expiring in the next ${h.days} days` : `${h.count} product(s) expired or expiring within ${h.days} days`;
        default: return '';
    }
}

function view(d, range) {
    const s = HP.session;
    const p = d.period, dl = d.deltas;
    const shop = (s.tenant && s.tenant.name) || '';
    return html`
      <div class="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
        <div><div class="eyebrow tracking-[0.12em]">${fmt.longDate(new Date())}</div><h1 class="mt-2 text-3xl font-bold tracking-tight">${t(greeting())}, ${shop}</h1></div>
        ${ui.rangeButton(range)}
      </div>
      <div class="grid gap-6 md:grid-cols-2">
        ${kpi({ hero: true, heroCls: 'border-indigo-100 bg-linear-to-br from-indigo-50 to-surface dark:border-indigo-900 dark:from-indigo-950/50', label: 'Sales & Revenue', value: fmt.money(p.netSales), valueCls: 'text-accent', iconName: 'trending', tone: 'accent', sub: `${p.salesCount} sales · ${fmt.money(p.volume)} volume${p.returnsTotal ? ` · ${fmt.money(p.returnsTotal)} returned` : ''}`, delta: dl.netSales })}
        ${kpi({ hero: true, heroCls: 'border-emerald-100 bg-linear-to-br from-emerald-50 to-surface dark:border-emerald-900 dark:from-emerald-950/40', label: 'Net Profit', value: fmt.money(p.netProfit), valueCls: signTone(p.netProfit), iconName: 'dollar', tone: 'good', sub: 'Net profit after expenses for selected period', delta: dl.netProfit })}
      </div>
      <div class="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        ${kpi({ label: 'Purchases', value: fmt.money(p.purchases), iconName: 'package', tone: 'gray', delta: dl.purchases })}
        ${kpi({ label: 'Expenses', value: fmt.money(p.expenses), valueCls: 'text-bad', iconName: 'receipt', tone: 'bad', delta: dl.expenses, inverse: true })}
        ${kpi({ label: 'Receivable', value: fmt.money(d.live.receivable), valueCls: 'text-warn', iconName: 'banknote', tone: 'warn', isLive: true })}
        ${kpi({ label: 'Payable', value: fmt.money(d.live.payable), valueCls: 'text-bad', iconName: 'receipt', tone: 'bad', isLive: true })}
      </div>
      <div class="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        ${kpi({ label: 'Gross Profit', value: fmt.money(p.grossProfit), valueCls: signTone(p.grossProfit), iconName: 'dollar', tone: 'good', delta: dl.grossProfit })}
        ${kpi({ label: 'Total Revenue', value: fmt.money(p.revenue), valueCls: signTone(p.revenue), iconName: 'trending', tone: 'good', delta: dl.revenue })}
        ${kpi({ label: 'Cash & Bank', value: fmt.money(d.live.cashBank), valueCls: signTone(d.live.cashBank), iconName: 'wallet', tone: 'good', isLive: true })}
      </div>

      <div class="card mt-6 p-4">
        <div class="flex items-center justify-between px-1"><div class="eyebrow text-[12px]">ACTION CENTER</div><div class="text-xs text-muted">Core ledger actions</div></div>
        <div class="mt-3 flex flex-wrap gap-3">${ACTIONS.map(([l, href, ic, tone]) => html`<a href="${href}" data-link class="inline-flex items-center gap-3 rounded-full border border-line bg-surface py-1.5 ps-1.5 pe-5 text-sm font-medium hover:bg-surface-2">
          <span class="flex h-8 w-8 items-center justify-center rounded-full ${tone}">${icon(ic, 'w-4 h-4')}</span>${t(l)}</a>`)}</div>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <div class="card p-6 lg:col-span-2"><div class="font-semibold">Revenue & Profit Trend</div><div class="mt-0.5 text-xs text-muted">Daily revenue and net profit for the selected period</div>
          <div class="relative mt-4 h-[250px]"><canvas data-trend aria-label="Revenue and net profit per day"></canvas></div></div>
        <div class="card p-6"><div class="font-semibold">Sales by Category</div><div class="mt-0.5 text-xs text-muted">Category mix for the selected period</div>
          ${d.categories.length ? html`<div class="mt-4 flex h-[250px] items-center gap-5"><div class="relative h-[170px] w-[170px] shrink-0"><canvas data-cats aria-label="Sales by category"></canvas></div>
            <div class="min-w-0 flex-1 space-y-2.5">${d.categories.slice(0, 8).map((c, i) => html`<div class="flex items-center gap-2 text-xs uppercase"><span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:${ui.PALETTE[i % ui.PALETTE.length]}"></span><span class="truncate" title="${c.name}">${c.name}</span></div>`)}</div></div>`
            : html`<div class="flex h-[250px] items-center justify-center text-sm text-muted">No sales in this period</div>`}</div>
      </div>

      <div class="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <div class="card p-6"><div class="flex items-center justify-between"><div class="font-semibold">Cashflow Activity</div><a href="/payments" data-link class="text-xs text-muted hover:text-ink">View ledger</a></div>
          <div class="mt-3 divide-y divide-line-soft">${d.cashflow.length ? d.cashflow.map(c => html`<div class="flex items-center gap-3 py-3">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${c.amount >= 0 ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad'}">${icon(c.amount >= 0 ? 'arrowDown' : 'arrowUp', 'w-4 h-4')}</span>
            <div class="min-w-0 flex-1"><div class="text-sm font-medium">${t(c.title)}</div><div class="truncate text-xs text-muted">${c.party} · ${c.kind}</div></div>
            <div class="whitespace-nowrap text-sm font-semibold ${c.amount >= 0 ? 'text-good' : 'text-bad'}">${c.amount >= 0 ? '+' : '−'}${fmt.money(Math.abs(c.amount))}</div></div>`)
            : html`<div class="py-8 text-center text-sm text-muted">No money has moved yet.</div>`}</div></div>
        <div class="card p-6"><div class="font-semibold">${t('Low Stock Alert')}</div>
          <div class="mt-3 divide-y divide-line-soft">${d.lowStock.length ? d.lowStock.map(x => html`<div class="flex items-center gap-3 py-3">
            <div class="min-w-0 flex-1"><div class="truncate text-sm font-medium" title="${x.name}">${x.name}</div><div class="text-xs text-muted">${x.status}</div></div>
            <span class="rounded-full bg-bad-soft px-2 py-0.5 text-xs font-semibold text-bad">${fmt.qty(x.stock)}</span>
            <a href="/purchases" data-link class="btn btn-primary btn-sm">${icon('rotate', 'w-3.5 h-3.5')}Reorder</a></div>`)
            : html`<div class="py-8 text-center text-sm text-muted">Every product is above its reorder level.</div>`}</div>
          ${d.lowStockCount > d.lowStock.length ? html`<a href="/reminders" data-link class="mt-2 block text-xs text-muted hover:text-ink">+ ${d.lowStockCount - d.lowStock.length} more in Reminders</a>` : ''}</div>
        <div class="card p-6"><div class="font-semibold">Action Items & Health</div>
          <div class="mt-3 divide-y divide-line-soft">${d.health.map(h => html`<div class="flex items-center gap-3 py-3 text-sm">${icon(h.ok ? 'checkCircle' : 'alert', `w-4 h-4 shrink-0 ${h.ok ? 'text-good' : 'text-warn'}`)}<span>${healthText(h)}</span></div>`)}</div></div>
      </div>`;
}

HP.page('/dashboard', {
    title: 'Dashboard', perm: 'reports.view',
    async render(el) {
        let range = loadRange(), data = null;
        const charts = [];
        const kill = () => { while (charts.length) { try { charts.pop().destroy(); } catch { } } };

        function drawCharts(d) {
            const trend = el.querySelector('[data-trend]');
            if (trend) {
                const labels = d.trend.map(x => dayLabel(x.day));
                const step = Math.max(1, Math.ceil(labels.length / 12));
                const dot = labels.length <= 1 ? 4 : 0;
                charts.push(ui.chart(trend, {
                    type: 'line',
                    data: { labels, datasets: [
                        { label: 'Revenue', data: d.trend.map(x => x.revenue), borderColor: '#6366f1', borderWidth: 2, tension: 0.4, pointRadius: dot, pointHoverRadius: 4, fill: true,
                            backgroundColor: c => { const a = c.chart.chartArea; if (!a) return rgba('#6366f1', 0.06); const g = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom); g.addColorStop(0, rgba('#6366f1', 0.14)); g.addColorStop(1, rgba('#6366f1', 0)); return g; } },
                        { label: 'Net profit', data: d.trend.map(x => x.netProfit), borderColor: '#10b981', borderWidth: 2, tension: 0.4, pointRadius: dot, pointHoverRadius: 4, fill: false },
                    ] },
                    options: {
                        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt.money(c.parsed.y)}` } } },
                        scales: {
                            x: { grid: { display: false }, border: { display: false }, ticks: { autoSkip: false, maxRotation: 0, callback: (v, i) => (i % step === 0 ? labels[i] : '') } },
                            y: { grid: { color: ui.css('--color-line') }, border: { display: false, dash: [4, 4] }, ticks: { maxTicksLimit: 6, callback: v => fmt.short(v) } },
                        },
                    },
                }));
            }
            const cats = el.querySelector('[data-cats]');
            if (cats) {
                const list = d.categories.slice(0, 8);
                charts.push(ui.chart(cats, {
                    type: 'doughnut',
                    data: { labels: list.map(c => c.name), datasets: [{ data: list.map(c => c.revenue), borderColor: ui.css('--color-surface'), borderWidth: 3, hoverOffset: 4,
                        backgroundColor: c => { const col = ui.PALETTE[c.dataIndex % ui.PALETTE.length]; const a = c.chart.chartArea; if (!a) return col; const g = c.chart.ctx.createLinearGradient(a.left, a.top, a.right, a.bottom); g.addColorStop(0, rgba(col, 0.7)); g.addColorStop(1, col); return g; } }] },
                    options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt.money(c.parsed)}` } } } },
                }));
            }
        }

        async function load() {
            data = await api.get('/api/reports/dashboard', { preset: range.preset, from: range.from, to: range.to });
            kill();
            ui.mount(el, view(data, range));
            drawCharts(data);
            gettingStarted(el);
        }
        ui.on(el, 'click', '[data-range]', (e, btn) => {
            e.stopPropagation();
            ui.rangePopover(btn, { preset: range.preset, from: range.from || (data && data.range.fromDay), to: range.to || (data && data.range.toDay) }, async pick => {
                range = pick; saveRange(range);
                try { await load(); } catch (err) { ui.fail(err); }
            });
        });
        await load();
        return kill;
    },
});

// "Getting started" card for a new shop: the steps from /api/onboarding, until done or hidden
async function gettingStarted(el) {
    const key = 'hp.onboard.hide.' + (HP.session.tenant && HP.session.tenant.id);
    try { if (localStorage.getItem(key)) return; } catch { }
    let o;
    try { o = await HP.api.get('/api/onboarding'); } catch { return; }
    if (o.steps.filter(s => !s.optional).every(s => s.done)) return;
    const { html, icon } = HP;
    const card = document.createElement('div');
    card.className = 'card card-pad mb-6 border-indigo-200 dark:border-indigo-900';
    card.innerHTML = String(html`<div class="mb-3 flex items-start justify-between gap-3"><div><div class="font-semibold">Getting started with HisabPro</div><div class="text-sm text-muted">${o.done} of ${o.total} done — each step opens the right screen.</div></div>
        <button class="btn btn-sm btn-ghost" data-hide-onboard>Hide</button></div>
      <div class="mb-3 h-2 overflow-hidden rounded-full bg-surface-2"><div class="h-full rounded-full bg-accent" style="width:${Math.round(o.done / o.total * 100)}%"></div></div>
      <div class="grid gap-2 sm:grid-cols-2">${o.steps.map(s => html`<a href="${s.href}" data-link class="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-sm hover:bg-surface-2 ${s.done ? 'opacity-60' : ''}">
        <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${s.done ? 'bg-good text-white' : 'border border-line text-muted'}">${s.done ? icon('check', 'w-3.5 h-3.5') : ''}</span>
        <span class="flex-1 ${s.done ? 'line-through' : ''}">${s.label}${s.optional ? html` <span class="text-xs text-muted">(optional)</span>` : ''}</span>${s.done ? '' : icon('chevronRight', 'w-4 h-4 text-muted')}</a>`)}</div>`);
    el.prepend(card);
    card.querySelector('[data-hide-onboard]').addEventListener('click', () => { try { localStorage.setItem(key, '1'); } catch { } card.remove(); });
}
