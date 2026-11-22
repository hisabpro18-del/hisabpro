// Reports (Sales, Purchases, Inventory, Expenses, Financial & Khata, Tax & Audit), Profit & Loss, Product Performance and
// Reminders (Action Center & Alert Dashboard). Layout and labels follow reference/REFERENCE.md › Reports … Reminders.
// Every figure comes from /api/reports/* (one engine: src/services/reports.js).
const { html, icon, api, ui, fmt, t } = HP;

// ───────── shared bits (this file) ─────────
const PRESETS = [['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['last30', 'Last 30 Days'], ['lastMonth', 'Last Month'], ['year', 'This Year'], ['fiscal', 'Fiscal Year']];
const TONE = { good: 'text-good', bad: 'text-bad', warn: 'text-warn', accent: 'text-accent', ink: '' };
const ICON_TONE = { good: 'bg-good-soft text-good', bad: 'bg-bad-soft text-bad', warn: 'bg-warn-soft text-warn', accent: 'bg-accent-soft text-accent', gray: 'bg-surface-2 text-muted', ink: 'bg-surface-2 text-muted' };
const M = v => fmt.money(v);
const R = v => (Number(v) || 0) / 100; // paisa → rupees for CSV
const signTone = v => (v < 0 ? 'text-bad' : 'text-good');
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const dayLabel = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const ymdDate = d => (d ? fmt.ymd(d) : '—');
const has = k => Perms.has(HP.session, k);

let CHARTS = [];
const mk = (canvas, cfg) => { if (!canvas) return null; const c = ui.chart(canvas, cfg); if (c) CHARTS.push(c); return c; };
const killCharts = () => { while (CHARTS.length) { try { CHARTS.pop().destroy(); } catch { } } };

const fillGrad = (hex, a1 = 0.22, a2 = 0) => c => { const a = c.chart.chartArea; if (!a) return rgba(hex, a1); const g = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom); g.addColorStop(0, rgba(hex, a1)); g.addColorStop(1, rgba(hex, a2)); return g; };
const barGrad = (hex, horizontal) => c => { const a = c.chart.chartArea; if (!a) return hex; const g = horizontal ? c.chart.ctx.createLinearGradient(a.left, 0, a.right, 0) : c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom); g.addColorStop(0, rgba(hex, horizontal ? 0.7 : 1)); g.addColorStop(1, rgba(hex, horizontal ? 1 : 0.7)); return g; };
const segGrad = colors => c => { const col = colors[c.dataIndex % colors.length]; const a = c.chart.chartArea; if (!a) return col; const g = c.chart.ctx.createLinearGradient(a.left, a.top, a.right, a.bottom); g.addColorStop(0, rgba(col, 0.72)); g.addColorStop(1, col); return g; };
const moneyAxis = (o = {}) => ({ grid: { color: ui.css('--color-line') }, border: { display: false, dash: [4, 4] }, ticks: { maxTicksLimit: 6, callback: v => fmt.short(v) }, ...o });
const catAxis = (o = {}) => ({ grid: { display: false }, border: { display: false }, ...o });
const tipMoney = horizontal => ({ callbacks: { label: c => ` ${c.dataset.label || c.label}: ${M(horizontal ? c.parsed.x : c.parsed.y)}` } });

function lineChart(canvas, labels, sets) {
    const step = Math.max(1, Math.ceil(labels.length / 12)), dot = labels.length <= 1 ? 5 : 0;
    return mk(canvas, {
        type: 'line',
        data: { labels, datasets: sets.map(s => ({ label: s.label, data: s.data, borderColor: s.color, borderWidth: 2, tension: 0.4, pointRadius: dot, pointHoverRadius: 4, pointBackgroundColor: s.color, fill: !!s.fill, backgroundColor: s.fill ? fillGrad(s.color) : s.color })) },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: sets.length > 1 && !!sets[0].legend }, tooltip: tipMoney() },
            scales: { x: catAxis({ ticks: { autoSkip: false, maxRotation: 0, callback: (v, i) => (i % step === 0 ? labels[i] : '') } }), y: moneyAxis() } },
    });
}
function barChart(canvas, labels, sets, { horizontal, legend, symmetric } = {}) {
    let yOpts = {};
    if (symmetric) { const top = Math.max(1, ...sets.flatMap(s => s.data.map(v => Math.abs(v)))); yOpts = { min: -top * 1.1, max: top * 1.1 }; }
    const money = moneyAxis(yOpts), cat = catAxis({ ticks: { autoSkip: false, callback: (v, i) => { const s = String(labels[i] || ''); return s.length > 18 ? s.slice(0, 17) + '…' : s; } } });
    return mk(canvas, {
        type: 'bar',
        data: { labels, datasets: sets.map(s => ({ label: s.label, data: s.data, backgroundColor: s.colors ? segGrad(s.colors) : barGrad(s.color, horizontal), borderRadius: 6, borderSkipped: false, maxBarThickness: horizontal ? 26 : 56 })) },
        options: { indexAxis: horizontal ? 'y' : 'x', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: !!legend, labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: tipMoney(horizontal) },
            scales: horizontal ? { x: money, y: cat } : { x: cat, y: money } },
    });
}
function donutChart(canvas, labels, values, colors, { cutout = '68%', half } = {}) {
    return mk(canvas, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: segGrad(colors), borderColor: ui.css('--color-surface'), borderWidth: 3, hoverOffset: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout, rotation: half ? -90 : 0, circumference: half ? 180 : 360, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.label}: ${M(c.parsed)}` } } } },
    });
}

const card = (title, sub, body, extra = '') => html`<div class="card card-pad">${title ? html`<div class="mb-4 flex flex-wrap items-start justify-between gap-3"><div><div class="font-semibold">${title}</div>${sub ? html`<div class="mt-0.5 text-xs text-muted">${sub}</div>` : ''}</div>${extra}</div>` : ''}${body}</div>`;
const canvasBox = (name, h = 280) => html`<div class="relative" style="height:${h}px"><canvas data-chart="${name}"></canvas></div>`;
const emptyBox = (text, h = 280) => html`<div class="flex items-center justify-center text-center text-sm text-muted" style="height:${h}px">${text}</div>`;
const sectionTitle = s => html`<div class="mb-3 mt-8 text-base font-semibold">${s}</div>`;
const legendRows = (rows, total) => html`<div class="min-w-0 flex-1 space-y-3">${rows.map(r => html`<div class="flex items-start gap-2.5"><span class="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style="background:${r.color}"></span>
    <div class="min-w-0 flex-1"><div class="truncate text-sm font-medium">${r.label}</div><div class="text-xs text-muted">${M(r.value)}</div></div><div class="text-xs font-medium text-muted">${fmt.pct(total ? (r.value / total) * 100 : 0, 0)}</div></div>`)}</div>`;

function chip(d, inverse) {
    if (!d) return html`<span class="mt-3 inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted">— No change from previous period</span>`;
    const good = inverse ? d < 0 : d > 0;
    return html`<span class="mt-3 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${good ? 'border-emerald-200 bg-good-soft text-good dark:border-emerald-900' : 'border-red-200 bg-bad-soft text-bad dark:border-red-900'}">${d > 0 ? '↑' : '↓'} ${d > 0 ? '+' : ''}${d}% from previous period</span>`;
}
function kpi({ label, value, tone = 'ink', iconName, iconTone, sub, delta, inverse, badge }) {
    return html`<div class="card card-pad flex items-start justify-between gap-3"><div class="min-w-0"><div class="flex items-center gap-2 text-sm text-muted">${label}${badge || ''}</div>
        <div class="mt-2 truncate text-2xl font-bold tracking-tight ${TONE[tone] || ''}">${value}</div>${sub ? html`<div class="mt-1 text-xs text-muted">${sub}</div>` : ''}${delta === undefined ? '' : chip(delta, inverse)}</div>
        ${iconName ? html`<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ICON_TONE[iconTone || tone] || ICON_TONE.gray}">${icon(iconName, 'w-5 h-5')}</div>` : ''}</div>`;
}
const kpiRow = (items, cols = 4) => html`<div class="grid gap-4 sm:grid-cols-2 ${cols === 4 ? 'xl:grid-cols-4' : 'lg:grid-cols-3'}">${items}</div>`;
const statusBadge = s => ui.badge(s, s === 'Out of stock' || s === 'Expired' ? 'bad' : s === 'OK' ? 'good' : 'warn');
const presetPills = (list, cur) => list.map(([v, l]) => html`<button type="button" data-preset="${v}" class="h-9 rounded-full border px-4 text-sm transition ${cur === v ? 'border-indigo-200 bg-accent-soft font-medium text-accent dark:border-indigo-900' : 'border-line bg-surface hover:bg-surface-2'}">${t(l)}</button>`);

// a plain printable page: shop, title, period, key figures and the tables
function printReport(title, range, kpis, tables) {
    const s = HP.session;
    const th = 'text-align:left;padding:6px 8px;border-bottom:1px solid #999;font-size:11px;text-transform:uppercase';
    const td = 'padding:5px 8px;border-bottom:1px solid #ddd;font-size:12px';
    ui.print(html`<div style="font-family:system-ui,Arial,sans-serif;color:#000;padding:8px">
        <div style="font-size:12px;color:#555">${(s.tenant && s.tenant.name) || ''}</div><div style="font-size:20px;font-weight:700">${title}</div>
        ${range ? html`<div style="font-size:12px;color:#555;margin-bottom:12px">${range.fromDay} — ${range.toDay}</div>` : ''}
        ${kpis && kpis.length ? html`<table style="border-collapse:collapse;margin:8px 0 16px">${kpis.map(([l, v]) => html`<tr><td style="${td}">${l}</td><td style="${td};text-align:right;font-weight:600">${v}</td></tr>`)}</table>` : ''}
        ${tables.filter(x => x && x.rows && x.rows.length).map(tb => html`${tb.title ? html`<div style="font-weight:700;margin:14px 0 6px">${tb.title}</div>` : ''}<table style="width:100%;border-collapse:collapse"><thead><tr>${tb.header.map(h => html`<th style="${th}">${h}</th>`)}</tr></thead>
          <tbody>${tb.rows.map(r => html`<tr>${r.map(c => html`<td style="${td}">${c}</td>`)}</tr>`)}</tbody></table>`)}
        <div style="margin-top:14px;font-size:10px;color:#777">Printed ${fmt.dateTime(new Date())} · HisabPro</div></div>`);
}
// money columns: printed with the symbol, exported as rupees
const moneyCols = (header, rows, moneyIdx) => ({
    print: rows.map(r => r.map((c, i) => (moneyIdx.includes(i) ? M(c) : c))),
    csv: rows.map(r => r.map((c, i) => (moneyIdx.includes(i) ? R(c) : c))),
});

// ───────── Reports ─────────
const TABS = [['sales', 'Sales', 'file'], ['purchases', 'Purchases', 'cart'], ['inventory', 'Inventory', 'box'], ['expenses', 'Expenses', 'wallet'], ['financial', 'Financial & Khata', 'scale'], ['tax', 'Tax & Audit', 'fileCheck']];
const SUBS = {
    sales: [['analytics', 'Sales Analytics'], ['products', 'Product-wise Sales'], ['categories', 'Category-wise Sales']],
    purchases: [['summary', 'Purchase Summary'], ['suppliers', 'Supplier-wise'], ['payables', 'Outstanding Payables']],
    inventory: [['overview', 'Analytics Overview'], ['stock', 'Current Stock & Value'], ['low', 'Low-Stock Report'], ['expiry', 'Expiry Report'], ['nonmoving', 'Non-Moving Items']],
    expenses: [['summary', 'Expense Summary'], ['categories', 'Category-wise']],
    financial: [['pl', 'Profit & Loss'], ['networth', 'Business Net Worth'], ['khata', 'Customer Ledger (Khata)'], ['aging', 'Aging Report'], ['suppliers', 'Supplier Payables']],
    tax: [['fbr', 'FBR / Sales Tax'], ['voided', 'Voided / Deleted Bills']],
};
const dailyRows = (d, key = 'count') => (d.range.days <= 62 ? d.daily : d.daily.filter(x => x[key]));

// each view returns { body, draw(el), title, kpis: [[label, value]], tables: [{ title, header, rows, money: [idx] }] }
const VIEWS = {
    sales: {
        analytics(d) {
            const rows = dailyRows(d);
            const pays = d.payments, payTotal = pays.reduce((a, p) => a + p.amount, 0);
            const payColors = ['#10b981', '#6366f1', '#0ea5e9', '#f59e0b'];
            return {
                title: 'Sales Analytics',
                kpis: [['Transactions', d.kpis.count], ['Total Sales', M(d.kpis.total)], ['Tax Collected', M(d.kpis.tax)], ['Outstanding Due', M(d.kpis.due)]],
                body: html`${kpiRow([
                    kpi({ label: 'Transactions', value: d.kpis.count, tone: 'accent', iconName: 'file', delta: d.deltas.count }),
                    kpi({ label: 'Total Sales', value: M(d.kpis.total), tone: 'good', iconName: 'trending', delta: d.deltas.total }),
                    kpi({ label: 'Tax Collected', value: M(d.kpis.tax), tone: 'warn', iconName: 'dollar', delta: d.deltas.tax }),
                    kpi({ label: 'Outstanding Due', value: M(d.kpis.due), tone: 'bad', iconName: 'clock', delta: d.deltas.due, inverse: true }),
                ])}
                  <div class="mt-6">${card('Revenue Trend', 'Daily revenue with premium depth gradient', canvasBox('trend', 320))}</div>
                  <div class="mt-6 grid gap-6 lg:grid-cols-2">
                    ${card('Top Selling Products', 'Ranked by revenue — horizontal bars with depth', d.top.length ? canvasBox('top', 300) : emptyBox('No products sold in this period', 300))}
                    ${card('Payment Methods', 'Cash vs Credit vs Other', pays.length ? html`<div class="flex flex-wrap items-center gap-6" style="min-height:300px"><div class="relative h-[200px] w-[200px] shrink-0"><canvas data-chart="pay"></canvas></div>
                      ${legendRows(pays.map((p, i) => ({ label: p.label, value: p.amount, color: payColors[i % payColors.length] })), payTotal)}</div>` : emptyBox('No payments in this period', 300))}
                  </div>`,
                draw(el) {
                    lineChart(el.querySelector('[data-chart=trend]'), d.daily.map(x => dayLabel(x.day)), [{ label: 'Total sales', data: d.daily.map(x => x.total), color: '#6366f1', fill: true }]);
                    barChart(el.querySelector('[data-chart=top]'), d.top.map(x => x.name), [{ label: 'Revenue', data: d.top.map(x => x.revenue), color: '#6366f1' }], { horizontal: true });
                    donutChart(el.querySelector('[data-chart=pay]'), pays.map(p => p.label), pays.map(p => p.amount), payColors);
                },
                tables: [{ header: ['Date', 'Txns', 'Subtotal', 'Tax', 'Total', 'Due'], money: [2, 3, 4, 5], rows: rows.map(x => [x.day, x.count, x.subtotal, x.tax, x.total, x.due]), show: true }],
            };
        },
        products(d) {
            const total = d.products.reduce((a, p) => a + p.revenue, 0);
            return {
                title: 'Product-wise Sales',
                kpis: [['Products sold', d.products.length], ['Units sold', fmt.qty(d.products.reduce((a, p) => a + p.qty, 0))], ['Net revenue', M(total)]],
                body: kpiRow([
                    kpi({ label: 'Products Sold', value: d.products.length, tone: 'accent', iconName: 'package' }),
                    kpi({ label: 'Units Sold', value: fmt.qty(d.products.reduce((a, p) => a + p.qty, 0)), tone: 'accent', iconName: 'layers' }),
                    kpi({ label: 'Net Revenue', value: M(total), tone: 'good', iconName: 'trending', sub: 'After discounts and returns, excluding tax' }),
                ], 3),
                tables: [{ header: ['Product', 'SKU', 'Category', 'Qty Sold', 'Returned', 'Avg Price', 'Revenue', 'Share'], money: [5, 6], show: true,
                    rows: d.products.map(p => [p.name, p.sku || '—', p.category || '—', fmt.qty(p.qty), fmt.qty(p.returnedQty), p.avgPrice, p.revenue, fmt.pct(total ? (p.revenue / total) * 100 : 0)]) }],
            };
        },
        categories(d) {
            const total = d.categories.reduce((a, c) => a + c.revenue, 0);
            const list = d.categories.filter(c => c.revenue > 0);
            return {
                title: 'Category-wise Sales',
                kpis: [['Categories', d.categories.length], ['Net revenue', M(total)]],
                body: html`<div class="grid gap-6 lg:grid-cols-2">${card('Revenue by Category', 'Share of net revenue for the selected period', list.length ? html`<div class="flex flex-wrap items-center gap-6" style="min-height:260px"><div class="relative h-[200px] w-[200px] shrink-0"><canvas data-chart="cats"></canvas></div>${legendRows(list.slice(0, 8).map((c, i) => ({ label: c.name, value: c.revenue, color: ui.PALETTE[i % 10] })), total)}</div>` : emptyBox('No sales in this period', 260))}
                    ${card('Gross Profit by Category', 'Revenue − cost of goods sold', list.length ? canvasBox('catProfit', 260) : emptyBox('No sales in this period', 260))}</div>`,
                draw(el) {
                    donutChart(el.querySelector('[data-chart=cats]'), list.slice(0, 8).map(c => c.name), list.slice(0, 8).map(c => c.revenue), ui.PALETTE);
                    barChart(el.querySelector('[data-chart=catProfit]'), list.slice(0, 8).map(c => c.name), [{ label: 'Gross profit', data: list.slice(0, 8).map(c => c.netProfit), color: '#10b981' }]);
                },
                tables: [{ header: ['Category', 'Products', 'Qty', 'Revenue', 'COGS', 'Gross Profit', 'Margin', 'Share'], money: [3, 4, 5], show: true,
                    rows: d.categories.map(c => [c.name, c.products, fmt.qty(c.qty), c.revenue, c.cogs, c.netProfit, fmt.pct(c.margin), fmt.pct(total ? (c.revenue / total) * 100 : 0)]) }],
            };
        },
    },
    purchases: {
        summary(d) {
            const rows = dailyRows(d);
            return {
                title: 'Purchase Summary',
                kpis: [['Purchase bills', d.kpis.count], ['Total purchases', M(d.kpis.total)], ['Tax paid', M(d.kpis.tax)], ['Outstanding due', M(d.kpis.due)], ['Purchase returns', M(d.kpis.returns)]],
                body: html`${kpiRow([
                    kpi({ label: 'Purchase Bills', value: d.kpis.count, tone: 'accent', iconName: 'file', delta: d.deltas.count }),
                    kpi({ label: 'Total Purchases', value: M(d.kpis.total), iconName: 'package', delta: d.deltas.total }),
                    kpi({ label: 'Tax Paid', value: M(d.kpis.tax), tone: 'warn', iconName: 'dollar', delta: d.deltas.tax }),
                    kpi({ label: 'Outstanding Due', value: M(d.kpis.due), tone: 'bad', iconName: 'clock', delta: d.deltas.due, inverse: true, sub: d.kpis.returns ? `${M(d.kpis.returns)} returned to vendors` : '' }),
                ])}<div class="mt-6">${card('Purchases per Day', 'Bill totals for the selected period', canvasBox('pur', 280))}</div>`,
                draw(el) { barChart(el.querySelector('[data-chart=pur]'), d.daily.map(x => dayLabel(x.day)), [{ label: 'Purchases', data: d.daily.map(x => x.total), color: '#6366f1' }]); },
                tables: [{ header: ['Date', 'Bills', 'Subtotal', 'Discount', 'Tax', 'Total', 'Paid', 'Due'], money: [2, 3, 4, 5, 6, 7], show: true, rows: rows.map(x => [x.day, x.count, x.subtotal, x.discount, x.tax, x.total, x.paid, x.due]) }],
            };
        },
        suppliers(d) {
            return {
                title: 'Supplier-wise Purchases',
                kpis: [['Vendors', d.suppliers.length], ['Total purchases', M(d.kpis.total)]],
                body: d.suppliers.length ? card('Top Vendors', 'Purchase totals per vendor', canvasBox('sup', Math.min(360, 60 + d.suppliers.slice(0, 8).length * 36))) : '',
                draw(el) { const top = d.suppliers.slice(0, 8); barChart(el.querySelector('[data-chart=sup]'), top.map(s => s.name), [{ label: 'Purchases', data: top.map(s => s.total), color: '#6366f1' }], { horizontal: true }); },
                tables: [{ header: ['Vendor', 'Bills', 'Total', 'Paid', 'Due', 'Returns'], money: [2, 3, 4, 5], show: true, empty: 'No purchases in this period.', rows: d.suppliers.map(s => [s.name, s.count, s.total, s.paid, s.due, s.returns]) }],
            };
        },
        payables(d) {
            const p = d.payables;
            return {
                title: 'Outstanding Payables', range: false,
                kpis: [['Total payable', M(p.total)], ['Vendors with dues', p.count], ['Over 90 days', M(p.buckets['90+'])]],
                body: kpiRow([
                    kpi({ label: 'Total Payable', value: M(p.total), tone: 'bad', iconName: 'receipt', sub: 'Live — what we owe vendors today' }),
                    kpi({ label: 'Vendors with Dues', value: p.count, tone: 'accent', iconName: 'truck' }),
                    kpi({ label: 'Over 90 Days', value: M(p.buckets['90+']), tone: p.buckets['90+'] ? 'bad' : 'ink', iconName: 'clock' }),
                ], 3),
                tables: [{ header: ['Vendor', 'Phone', '0–30 days', '31–60 days', '61–90 days', '90+ days', 'Balance'], money: [2, 3, 4, 5, 6], show: true, empty: 'No outstanding supplier payables.',
                    rows: p.parties.map(v => [v.name, v.phone || '—', v.buckets['0-30'], v.buckets['31-60'], v.buckets['61-90'], v.buckets['90+'], v.balance]) }],
            };
        },
    },
    inventory: {
        overview(d) {
            const cats = d.byCategory.slice(0, 6);
            const shades = ['#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff'];
            return {
                title: 'Inventory — Analytics Overview', range: false,
                kpis: [['Stock valuation', M(d.kpis.value)], ['Active products', d.kpis.activeProducts], ['Total units', fmt.qty(d.kpis.units)], ['Low stock alerts', d.kpis.lowStock]],
                body: html`${kpiRow([
                    kpi({ label: 'Stock Valuation', value: M(d.kpis.value), tone: 'good', iconName: 'wallet', sub: `Total ${fmt.sym()} locked in warehouse` }),
                    kpi({ label: 'Active Products', value: d.kpis.activeProducts, tone: 'accent', iconName: 'box' }),
                    kpi({ label: 'Total Units', value: fmt.qty(d.kpis.units), tone: 'accent', iconName: 'layers' }),
                    kpi({ label: 'Low Stock Alerts', value: d.kpis.lowStock, tone: 'warn', iconName: 'alert' }),
                ])}<div class="mt-6">${card('Stock Valuation by Category', 'Warehouse value distribution', cats.some(c => c.value) ? canvasBox('cat', 280) : emptyBox('No stock value yet', 280))}</div>`,
                draw(el) { barChart(el.querySelector('[data-chart=cat]'), cats.map(c => c.name), [{ label: 'Stock value', data: cats.map(c => c.value), colors: shades }]); },
                tables: [
                    { title: 'Low Stock Alerts', header: ['Product', 'SKU', 'Stock', 'Reorder Level', 'Unit', 'Status'], money: [], show: true, empty: 'Every product is above its reorder level.', status: 5,
                        rows: d.lowStock.map(x => [x.name, x.sku || '—', fmt.qty(x.stock), fmt.qty(x.reorderLevel), x.unit || '—', x.status]) },
                    { title: 'Full Stock Register', header: ['Product', 'SKU', 'Category', 'Stock', 'Unit', 'Cost', 'Value', 'Reorder'], money: [5, 6], show: true, empty: 'No products yet.',
                        rows: d.register.map(x => [x.name, x.sku || '—', x.category || 'Other', fmt.qty(x.stock), x.unit || '—', x.cost, x.value, fmt.qty(x.reorderLevel)]) },
                ],
            };
        },
        stock(d) {
            return {
                title: 'Current Stock & Value', range: false,
                kpis: [['Stock at cost', M(d.kpis.value)], ['Stock at retail', M(d.kpis.retailValue)], ['Potential margin', M(d.kpis.retailValue - d.kpis.value)]],
                body: kpiRow([
                    kpi({ label: 'Stock at Cost', value: M(d.kpis.value), tone: 'good', iconName: 'wallet' }),
                    kpi({ label: 'Stock at Retail', value: M(d.kpis.retailValue), tone: 'accent', iconName: 'tag' }),
                    kpi({ label: 'Potential Margin', value: M(d.kpis.retailValue - d.kpis.value), tone: signTone(d.kpis.retailValue - d.kpis.value) === 'text-bad' ? 'bad' : 'good', iconName: 'trending', sub: 'Retail value − cost value' }),
                ], 3),
                tables: [{ header: ['Product', 'SKU', 'Category', 'Stock', 'Unit', 'Cost', 'Value', 'Retail Price', 'Retail Value'], money: [5, 6, 7, 8], show: true, empty: 'No products yet.',
                    rows: d.register.map(x => [x.name, x.sku || '—', x.category || 'Other', fmt.qty(x.stock), x.unit || '—', x.cost, x.value, x.retailPrice, x.retailValue]) }],
            };
        },
        low(d) {
            const out = d.lowStock.filter(x => x.stock <= 0).length, capital = d.lowStock.reduce((a, x) => a + x.restockCapital, 0);
            return {
                title: 'Low-Stock Report', range: false,
                kpis: [['Low stock items', d.lowStock.length], ['Out of stock', out], ['Restock capital', M(capital)]],
                body: kpiRow([
                    kpi({ label: 'Low Stock Items', value: d.lowStock.length, tone: 'warn', iconName: 'alert' }),
                    kpi({ label: 'Out of Stock', value: out, tone: out ? 'bad' : 'ink', iconName: 'box' }),
                    kpi({ label: 'Restock Capital', value: M(capital), tone: 'accent', iconName: 'wallet', sub: '(Reorder level − stock) × cost' }),
                ], 3),
                tables: [{ header: ['Product', 'SKU', 'Stock', 'Reorder Level', 'Unit', 'Restock Qty', 'Restock Capital', 'Status'], money: [6], show: true, status: 7, empty: 'Every product is above its reorder level.',
                    rows: d.lowStock.map(x => [x.name, x.sku || '—', fmt.qty(x.stock), fmt.qty(x.reorderLevel), x.unit || '—', fmt.qty(x.restockQty), x.restockCapital, x.status]) }],
            };
        },
        expiry(d) {
            const expired = d.expiry.filter(x => x.status === 'Expired'), soon = d.expiry.filter(x => x.status === 'Expiring soon');
            const risk = [...expired, ...soon].reduce((a, x) => a + x.value, 0);
            return {
                title: 'Expiry Report', range: false,
                kpis: [['Expired', expired.length], [`Expiring within ${d.reminderDays} days`, soon.length], ['Value at risk', M(risk)]],
                body: kpiRow([
                    kpi({ label: 'Expired', value: expired.length, tone: expired.length ? 'bad' : 'ink', iconName: 'alert' }),
                    kpi({ label: `Expiring within ${d.reminderDays} days`, value: soon.length, tone: 'warn', iconName: 'clock', sub: 'Window from Settings › Localization' }),
                    kpi({ label: 'Value at Risk', value: M(risk), tone: 'bad', iconName: 'wallet', sub: 'Stock × cost of expired and expiring items' }),
                ], 3),
                tables: [{ header: ['Product', 'SKU', 'Expiry Date', 'Days Left', 'Stock', 'Value at Risk', 'Status'], money: [5], show: true, status: 6, empty: 'No products have an expiry date.',
                    rows: d.expiry.map(x => [x.name, x.sku || '—', x.expiryDay, x.daysLeft, fmt.qty(x.stock), x.value, x.status]) }],
            };
        },
        nonmoving(d) {
            const value = d.nonMoving.reduce((a, x) => a + x.value, 0);
            return {
                title: 'Non-Moving Items',
                kpis: [['Non-moving items', d.nonMoving.length], ['Value tied up', M(value)]],
                body: html`${kpiRow([
                    kpi({ label: 'Non-Moving Items', value: d.nonMoving.length, tone: 'warn', iconName: 'pause', sub: 'In stock, not sold in the selected period' }),
                    kpi({ label: 'Value Tied Up', value: M(value), tone: 'bad', iconName: 'wallet' }),
                    kpi({ label: 'Never Sold', value: d.nonMoving.filter(x => !x.lastSold).length, tone: 'ink', iconName: 'box' }),
                ], 3)}`,
                tables: [{ header: ['Product', 'SKU', 'Category', 'Stock', 'Unit', 'Value', 'Last Sold', 'Days Idle'], money: [5], show: true, empty: 'Every product in stock sold in this period.',
                    rows: d.nonMoving.map(x => [x.name, x.sku || '—', x.category || 'Other', fmt.qty(x.stock), x.unit || '—', x.value, x.lastSold ? ymdDate(x.lastSold) : 'Never', x.daysIdle === null ? '—' : x.daysIdle]) }],
            };
        },
    },
    expenses: {
        summary(d) {
            const top = d.byCategory[0];
            return {
                title: 'Expense Summary',
                kpis: [['Total expenses', M(d.kpis.total)], ['Entries', d.kpis.count], ['Average per day', M(d.kpis.perDay)], ['Top category', top ? `${top.name} (${M(top.amount)})` : '—']],
                body: html`${kpiRow([
                    kpi({ label: 'Total Expenses', value: M(d.kpis.total), tone: 'bad', iconName: 'receipt', delta: d.deltas.total, inverse: true }),
                    kpi({ label: 'Entries', value: d.kpis.count, tone: 'accent', iconName: 'file', delta: d.deltas.count, inverse: true }),
                    kpi({ label: 'Average per Day', value: M(d.kpis.perDay), tone: 'warn', iconName: 'calendar' }),
                    kpi({ label: 'Top Category', value: top ? top.name : '—', tone: 'ink', iconName: 'tag', sub: top ? `${M(top.amount)} · ${fmt.pct(top.share)}` : '' }),
                ])}<div class="mt-6">${card('Expenses per Day', 'Operating expenses for the selected period', canvasBox('exp', 260))}</div>`,
                draw(el) { barChart(el.querySelector('[data-chart=exp]'), d.daily.map(x => dayLabel(x.day)), [{ label: 'Expenses', data: d.daily.map(x => x.amount), color: '#ef4444' }]); },
                tables: [{ header: ['Date', 'Category', 'Payee', 'Method', 'Reference', 'Note', 'Amount'], money: [6], show: true, empty: 'No expenses in this period.',
                    rows: d.rows.map(x => [ymdDate(x.date), x.category, x.payee || '—', x.method, x.reference || '—', x.note || '—', x.amount]) }],
            };
        },
        categories(d) {
            const list = d.byCategory;
            return {
                title: 'Expenses by Category',
                kpis: [['Total expenses', M(d.kpis.total)], ['Categories', list.length]],
                body: card('Expense Breakdown', 'Operating expenses by category', list.length ? html`<div class="flex flex-wrap items-center gap-8" style="min-height:260px"><div class="relative h-[220px] w-[220px] shrink-0"><canvas data-chart="ecat"></canvas></div>${legendRows(list.slice(0, 10).map((c, i) => ({ label: c.name, value: c.amount, color: ui.PALETTE[i % 10] })), d.kpis.total)}</div>` : emptyBox('No expense data for this period', 260)),
                draw(el) { donutChart(el.querySelector('[data-chart=ecat]'), list.slice(0, 10).map(c => c.name), list.slice(0, 10).map(c => c.amount), ui.PALETTE); },
                tables: [{ header: ['Category', 'Entries', 'Amount', 'Share'], money: [2], show: true, empty: 'No expenses in this period.', rows: list.map(c => [c.name, c.count, c.amount, fmt.pct(c.share)]) }],
            };
        },
    },
    financial: {
        top(d) {
            const c = d.cashflow;
            return {
                body: html`${kpiRow([
                    kpi({ label: 'Net Cashflow', value: M(c.net), tone: c.net < 0 ? 'bad' : 'good', sub: 'In − Out for selected period' }),
                    kpi({ label: 'Receivables (Udhaar)', value: M(d.receivables.total), tone: 'accent', sub: 'Total to collect from customers' }),
                    kpi({ label: 'Payables (To Pay)', value: M(d.payables.total), tone: 'warn', sub: 'Total owed to suppliers' }),
                ], 3)}
                  <div class="mt-6 grid gap-6 lg:grid-cols-2">${card('Cashflow', 'Money In vs Money Out for selected period', canvasBox('flow', 260))}${card('Receivables vs Payables', 'Total udhaar to collect vs amounts owed to suppliers', canvasBox('rp', 260))}</div>`,
                draw(el) {
                    barChart(el.querySelector('[data-chart=flow]'), ['Cashflow'], [{ label: 'Money In (Sales)', data: [c.in], color: '#10b981' }, { label: 'Money Out (Purchases + Expenses)', data: [c.out], color: '#ef4444' }], { legend: true });
                    barChart(el.querySelector('[data-chart=rp]'), ['Receivables (Udhaar)', 'Payables (To Pay)'], [{ label: 'Balance', data: [d.receivables.total, d.payables.total], colors: ['#6366f1', '#f59e0b'] }]);
                },
            };
        },
        pl(d) {
            const p = d.pl;
            const line = (l, v, cls = '', bold) => html`<div class="flex items-center justify-between py-2.5 ${bold ? 'font-semibold' : 'ps-4 text-sm'}"><span>${l}</span><span class="tabular-nums ${cls}">${v}</span></div>`;
            return {
                title: 'Profit & Loss (Net Profit)',
                kpis: [['Net sales', M(p.revenue)], ['Cost of goods sold', M(p.cogs)], ['Gross profit', M(p.grossProfit)], ['Expenses', M(p.expenses)], ['Net profit', M(p.netProfit)]],
                body: card('Profit & Loss (Net Profit)', 'Net profit from sales, COGS, returns, and expenses for the selected period', html`<div class="max-w-2xl divide-y divide-line-soft">
                    ${line('Total Revenue', M(p.revenue + p.returns))}${line('Sales Return', `- ${M(p.returns)}`, 'text-bad')}${line('Net Sales', M(p.revenue), '', true)}
                    ${line('Cost of Goods Sold', `- ${M(p.cogs)}`, 'text-bad')}${line('Gross Profit', M(p.grossProfit), signTone(p.grossProfit), true)}
                    ${line('Expenses', `- ${M(p.expenses)}`, 'text-bad')}${line('Net Profit', M(p.netProfit), signTone(p.netProfit), true)}</div>
                    <a href="/reports/profit-loss" data-link class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">Open the full statement ${icon('chevronRight', 'w-4 h-4')}</a>`),
                tables: [],
            };
        },
        networth(d) {
            const n = d.netWorth;
            const row = (l, v, cls = '') => html`<div class="flex items-center justify-between py-2.5 text-sm"><span>${l}</span><span class="tabular-nums ${cls}">${M(v)}</span></div>`;
            return {
                title: 'Business Net Worth', range: false,
                kpis: [['Cash & bank', M(n.cashBank)], ['Stock at cost', M(n.stockValue)], ['Receivables', M(n.receivables)], ['Total assets', M(n.assets)], ['Payables', M(n.payables)], ['Net worth', M(n.netWorth)]],
                body: html`<div class="grid gap-6 lg:grid-cols-2">
                    ${card('Assets', 'What the business owns today', html`<div class="divide-y divide-line-soft">${n.accounts.map(a => row(`${a.name} (${a.type.toLowerCase()})`, a.balance, signTone(a.balance)))}${row('Stock at cost', n.stockValue)}${row('Receivables (Udhaar)', n.receivables, 'text-warn')}
                      <div class="flex items-center justify-between py-3 font-semibold"><span>Total Assets</span><span class="tabular-nums">${M(n.assets)}</span></div></div>`)}
                    ${card('Liabilities & Net Worth', 'What the business owes, and what is left for the owner', html`<div class="divide-y divide-line-soft">${row('Payables (To Pay)', n.payables, 'text-bad')}
                      <div class="flex items-center justify-between py-3 font-semibold"><span>Total Liabilities</span><span class="tabular-nums">${M(n.liabilities)}</span></div>
                      <div class="flex items-center justify-between py-4 text-lg font-bold"><span>NET WORTH</span><span class="tabular-nums ${signTone(n.netWorth)}">${M(n.netWorth)}</span></div>
                      ${row('Capital invested by the owner', n.invested)}${row('Drawings & dividends', n.withdrawn)}</div>`)}</div>`,
                tables: [],
            };
        },
        khata(d) {
            return {
                title: 'Customer Ledger (Khata)', range: false,
                kpis: [['Customers with a khata', d.khata.length], ['Receivables', M(d.receivables.total)]],
                body: '',
                tables: [{ header: ['Customer', 'Phone', 'Total Billed', 'Received', 'Balance', 'Last Activity'], money: [2, 3, 4], show: true, empty: 'No customer khata entries yet.', balance: 4,
                    rows: d.khata.map(c => [c.name, c.phone || '—', c.debit, c.credit, c.balance, ymdDate(c.lastDate)]) }],
            };
        },
        aging(d) {
            const rows = p => p.parties.map(x => [x.name, x.buckets['0-30'], x.buckets['31-60'], x.buckets['61-90'], x.buckets['90+'], x.balance]);
            const totalRow = p => ['Total', p.buckets['0-30'], p.buckets['31-60'], p.buckets['61-90'], p.buckets['90+'], p.total];
            const B = ['0-30', '31-60', '61-90', '90+'];
            return {
                title: 'Aging Report', range: false,
                kpis: [['Receivables', M(d.receivables.total)], ['Payables', M(d.payables.total)]],
                body: card('Aging Dues', 'Outstanding balances by age bucket (oldest bills paid first)', canvasBox('aging', 240)),
                draw(el) { barChart(el.querySelector('[data-chart=aging]'), ['0–30 days', '31–60 days', '61–90 days', '90+ days'], [{ label: 'Receivables', data: B.map(k => d.receivables.buckets[k]), color: '#6366f1' }, { label: 'Payables', data: B.map(k => d.payables.buckets[k]), color: '#f59e0b' }], { legend: true }); },
                tables: [
                    { title: 'Receivables (customers)', header: ['Customer', '0–30 days', '31–60 days', '61–90 days', '90+ days', 'Balance'], money: [1, 2, 3, 4, 5], show: true, empty: 'No outstanding customer receivables.', rows: d.receivables.parties.length ? [...rows(d.receivables), totalRow(d.receivables)] : [] },
                    { title: 'Payables (vendors)', header: ['Vendor', '0–30 days', '31–60 days', '61–90 days', '90+ days', 'Balance'], money: [1, 2, 3, 4, 5], show: true, empty: 'No outstanding supplier payables.', rows: d.payables.parties.length ? [...rows(d.payables), totalRow(d.payables)] : [] },
                ],
            };
        },
        suppliers(d) {
            return {
                title: 'Supplier Payables', range: false,
                kpis: [['Payables', M(d.payables.total)], ['Vendors', d.payables.count]],
                body: '',
                tables: [{ header: ['Vendor', 'Phone', 'Oldest Due (days)', 'Balance'], money: [3], show: true, empty: 'No outstanding supplier payables.', rows: d.payables.parties.map(v => [v.name, v.phone || '—', v.oldestDays, v.balance]) }],
            };
        },
    },
    tax: {
        fbr(d) {
            const k = d.kpis, rows = dailyRows(d);
            return {
                title: 'FBR / Sales Tax Report',
                kpis: [['Taxable sales', M(k.taxableSales)], ['Output tax (sales)', M(k.outputTax)], ['Tax on returns', M(k.returnsTax)], ['Input tax (purchases)', M(k.inputTax)], ['Net tax payable', M(k.netTax)]],
                body: html`${kpiRow([
                    kpi({ label: 'Taxable Sales', value: M(k.taxableSales), tone: 'good', iconName: 'trending', sub: `${k.invoices} invoice(s), excluding tax` }),
                    kpi({ label: 'Output Tax (Sales)', value: M(k.outputTax), tone: 'warn', iconName: 'dollar', sub: k.returnsTax ? `${M(k.returnsTax)} reversed on returns` : '' }),
                    kpi({ label: 'Input Tax (Purchases)', value: M(k.inputTax), tone: 'accent', iconName: 'package' }),
                    kpi({ label: 'Net Tax Payable', value: M(k.netTax), tone: k.netTax < 0 ? 'good' : 'bad', iconName: 'landmark', sub: 'Output − returns − input' }),
                ])}`,
                tables: [
                    { title: 'Sales tax by rate', header: ['Tax Rate', 'Lines', 'Taxable Value', 'Sales Tax'], money: [2, 3], show: true, empty: 'No taxed sales in this period.', rows: d.byRate.map(x => [fmt.pct(x.rate, 2), x.lines, x.taxable, x.tax]) },
                    { title: 'Daily sales tax', header: ['Date', 'Invoices', 'Taxable Value', 'Sales Tax', 'Returns Tax', 'Net Tax'], money: [2, 3, 4, 5], show: true, rows: rows.map(x => [x.day, x.count, x.taxable, x.tax, x.returnsTax, x.net]) },
                ],
            };
        },
        voided(d) {
            return {
                title: 'Voided / Deleted Bills',
                kpis: [['Voided / deleted bills', d.voided.length], ['Refunds', d.refunds.length], ['Refunded', M(d.refunds.reduce((a, r) => a + r.total, 0))]],
                body: kpiRow([
                    kpi({ label: 'Voided / Deleted Bills', value: d.voided.length, tone: d.voided.length ? 'bad' : 'ink', iconName: 'trash' }),
                    kpi({ label: 'Refunds (Sales Returns)', value: d.refunds.length, tone: 'warn', iconName: 'rotate' }),
                    kpi({ label: 'Refunded', value: M(d.refunds.reduce((a, r) => a + r.total, 0)), tone: 'bad', iconName: 'banknote' }),
                ], 3),
                tables: [
                    { title: 'Voided / deleted bills', header: ['Type', 'Number', 'Bill Date', 'Deleted On', 'Party', 'Total', 'By'], money: [5], show: true, empty: 'No bills were voided or deleted in this period.',
                        rows: d.voided.map(x => [x.kind, x.number, ymdDate(x.date), fmt.dateTime(x.deletedAt), x.party || '—', x.total, x.by || '—']) },
                    { title: 'Refunds (sales returns)', header: ['Return No', 'Date', 'Invoice', 'Customer', 'Refund', 'Tax', 'Method', 'By'], money: [4, 5], show: true, empty: 'No refunds in this period.',
                        rows: d.refunds.map(x => [x.number, fmt.dateTime(x.date), x.saleNumber, x.customerName || 'Walk-in Customer', x.total, x.tax, x.refundMethod === 'CASH' ? 'Cash' : 'Khata credit', x.userName || '—']) },
                ],
            };
        },
    },
};

function tableHtml(tb) {
    const money = new Set(tb.money || []);
    if (!tb.rows.length) return html`<div class="card py-10 text-center text-sm text-muted">${tb.empty || 'No data for this period.'}</div>`;
    return html`<div class="card overflow-x-auto thin-scroll"><table class="tbl"><thead><tr>${tb.header.map((h, i) => html`<th class="${money.has(i) || (typeof tb.rows[0][i] === 'number') ? '!text-right' : ''}">${h}</th>`)}</tr></thead>
      <tbody>${tb.rows.map((r, ri) => html`<tr class="${r[0] === 'Total' && ri === tb.rows.length - 1 ? 'font-semibold' : ''}">${r.map((c, i) => {
        if (tb.status === i) return html`<td>${statusBadge(c)}</td>`;
        if (money.has(i)) return html`<td class="num ${tb.balance === i ? (c > 0 ? 'text-warn' : c < 0 ? 'text-good' : '') : c < 0 ? 'text-bad' : ''}">${M(c)}</td>`;
        return html`<td class="${typeof c === 'number' ? 'num' : ''}">${c}</td>`;
    })}</tr>`)}</tbody></table></div>`;
}

HP.page('/reports', {
    title: 'Reports', perm: 'reports.view',
    async render(el, params, query) {
        let tab = SUBS[query.tab] ? query.tab : 'sales';
        let sub = (SUBS[tab].find(s => s[0] === query.sub) || SUBS[tab][0])[0];
        let range = { preset: 'today' };
        const cache = {};
        let current = null; // the view on screen (for Print / CSV)

        ui.mount(el, html`${ui.pageHeader({ title: html`<span class="inline-flex items-center gap-3">${icon('chart', 'w-6 h-6 text-muted')}${t('Reports')}</span>`, subtitle: 'Enterprise reporting suite — tenant-scoped, real-time data',
            actions: html`<button class="btn btn-outline" data-print>${icon('printer')}${t('Print')}</button><button class="btn btn-outline" data-csv>${icon('download')}CSV</button>` })}
          <div class="card card-pad mb-6" data-rangebox></div>
          <div class="mb-1 overflow-x-auto thin-scroll"><div class="inline-flex gap-1 rounded-xl border border-line bg-surface-2 p-1" data-maintabs></div></div>
          <div data-subtabs class="mt-3"></div>
          <div data-content class="mt-6">${ui.loading()}</div>`);

        const drawRange = d => {
            ui.mount(el.querySelector('[data-rangebox]'), html`<div class="flex flex-wrap items-center gap-2"><span class="me-2 flex items-center gap-2 text-sm text-muted">${icon('calendar')}Date range</span>${presetPills(PRESETS, range.preset)}</div>
              <div class="mt-4 flex flex-wrap items-end gap-3"><div><label class="label">From</label><input type="date" class="input w-44" data-from value="${d ? d.fromDay : ''}"></div>
              <div><label class="label">To</label><input type="date" class="input w-44" data-to value="${d ? d.toDay : ''}"></div></div>`);
        };
        const drawTabs = () => {
            ui.mount(el.querySelector('[data-maintabs]'), html`${TABS.map(([v, l, ic]) => html`<button type="button" data-tab="${v}" class="flex items-center gap-2 whitespace-nowrap rounded-lg px-4 h-9 text-sm font-medium ${v === tab ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-ink'}">${icon(ic, 'w-4 h-4')}${t(l)}</button>`)}`);
            ui.mount(el.querySelector('[data-subtabs]'), tab === 'financial' ? '' : html`<div class="overflow-x-auto thin-scroll">${ui.tabs('sub', SUBS[tab], sub)}</div>`);
        };
        const setButtons = on => { for (const s of ['[data-print]', '[data-csv]']) el.querySelector(s).disabled = !on; };

        async function show() {
            killCharts();
            history.replaceState({}, '', `/reports?tab=${tab}&sub=${sub}`);
            drawTabs();
            const box = el.querySelector('[data-content]');
            const key = `${tab}|${range.preset}|${range.from || ''}|${range.to || ''}`;
            if (!cache[key]) { box.innerHTML = String(ui.loading()); setButtons(false); cache[key] = await api.get('/api/reports/' + tab, range); }
            const d = cache[key];
            drawRange(d.range);
            const v = VIEWS[tab][sub](d);
            current = { ...v, range: v.range === false ? null : d.range };
            if (tab === 'financial') {
                const top = VIEWS.financial.top(d);
                ui.mount(box, html`${top.body}<div class="mt-8 overflow-x-auto thin-scroll">${ui.tabs('sub', SUBS.financial, sub)}</div><div class="mt-6">${v.body}</div>${(v.tables || []).filter(x => x.show).map(tb => html`${tb.title ? sectionTitle(tb.title) : html`<div class="mt-6"></div>`}${tableHtml(tb)}`)}`);
                top.draw(box);
            } else {
                ui.mount(box, html`${v.body || ''}${(v.tables || []).filter(x => x.show).map(tb => html`${tb.title ? sectionTitle(tb.title) : html`<div class="mt-6"></div>`}${tableHtml(tb)}`)}`);
            }
            if (v.draw) v.draw(box);
            setButtons((v.tables || []).some(tb => tb.rows.length) || (v.kpis && v.kpis.length && !(v.tables || []).length));
        }
        const go = async () => { try { await show(); } catch (e) { ui.mount(el.querySelector('[data-content]'), html`<div class="card card-pad text-sm text-rose-600">${e.message}</div>`); } };

        ui.on(el, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; sub = SUBS[tab][0][0]; go(); });
        ui.on(el, 'click', '[data-tabs="sub"] [data-v]', (e, b) => { sub = b.dataset.v; go(); });
        ui.on(el, 'click', '[data-preset]', (e, b) => { range = { preset: b.dataset.preset }; go(); });
        ui.on(el, 'change', '[data-from],[data-to]', () => {
            const f = el.querySelector('[data-from]').value, to = el.querySelector('[data-to]').value;
            if (f && to) { range = { preset: 'custom', from: f, to }; go(); }
        });
        ui.on(el, 'click', '[data-print]', () => {
            if (!current) return;
            printReport(`Reports — ${current.title}`, current.range, current.kpis, (current.tables || []).map(tb => ({ title: tb.title, header: tb.header, rows: moneyCols(tb.header, tb.rows, tb.money || []).print })));
        });
        ui.on(el, 'click', '[data-csv]', () => {
            if (!current) return;
            const tb = (current.tables || []).find(x => x.rows.length);
            const name = `${current.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${current.range ? `-${current.range.fromDay}-to-${current.range.toDay}` : ''}.csv`;
            if (tb) return ui.csv(name, tb.header, moneyCols(tb.header, tb.rows, tb.money || []).csv);
            if (current.kpis && current.kpis.length) return ui.csv(name, ['Figure', 'Value'], current.kpis);
            ui.toast('Nothing to export for this report.', 'info');
        });
        await go();
        return killCharts;
    },
});

// ───────── Profit & Loss ─────────
HP.page('/reports/profit-loss', {
    title: 'Profit & Loss', perm: 'reports.view',
    async render(el) {
        let range = { preset: 'today' };
        const open = { rev: true, cogs: true, exp: true };
        let data = null;
        const PL_PRESETS = [['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['year', 'This Year'], ['fiscal', 'Fiscal Year']];

        const sec = (key, title, lines, subtotal) => html`<div class="border-b border-line-soft px-6 py-2">
            <button type="button" class="flex w-full items-center justify-between py-3 text-base font-semibold" data-sec="${key}" aria-expanded="${open[key] ? 'true' : 'false'}">${title}${icon(open[key] ? 'chevronUp' : 'chevronDown', 'w-4 h-4 text-muted')}</button>
            ${open[key] ? html`<div class="pb-1">${lines.map(([l, v, cls]) => html`<div class="flex items-center justify-between py-2.5 ps-5 text-sm"><span>${l}</span><span class="tabular-nums ${cls || ''}">${v}</span></div>`)}</div>` : ''}
            <div class="flex items-center justify-between border-t border-line py-3 font-semibold"><span>${subtotal[0]}</span><span class="tabular-nums ${subtotal[2] || ''}">${subtotal[1]}</span></div></div>`;

        function view(d) {
            const p = d.pl, r = d.range;
            const gm = p.revenue ? (p.grossProfit / p.revenue) * 100 : 0, nm = p.revenue ? (p.netProfit / p.revenue) * 100 : 0, or = p.revenue ? (p.expenses / p.revenue) * 100 : 0;
            const pill = (txt, v) => html`<span class="rounded-full border px-2 py-0.5 text-[11px] font-semibold ${v < 0 ? 'border-red-200 bg-bad-soft text-bad dark:border-red-900' : 'border-emerald-200 bg-good-soft text-good dark:border-emerald-900'}">${txt} ${fmt.pct(v)}</span>`;
            return html`
              <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div><h1 class="text-2xl font-bold tracking-tight">${t('Profit & Loss')}</h1><p class="mt-1 text-sm text-muted">GAAP-aligned income statement for the selected period</p></div>
                <div class="flex flex-col items-end gap-3"><div class="flex flex-wrap justify-end gap-2">${presetPills(PL_PRESETS, range.preset)}</div>
                  <div class="flex flex-wrap items-end justify-end gap-2"><div><label class="label">From</label><input type="date" class="input w-40" data-from value="${r.fromDay}"></div><div><label class="label">To</label><input type="date" class="input w-40" data-to value="${r.toDay}"></div>
                  <button class="btn btn-primary h-10" data-search>${t('Search')}</button><button class="btn btn-outline h-10" data-print>${t('Print')}</button></div></div>
              </div>
              ${kpiRow([
                  kpi({ label: 'Gross Profit', value: M(p.grossProfit), tone: p.grossProfit < 0 ? 'bad' : 'good', badge: html`<span class="ms-auto">${pill('GM', gm)}</span>` }),
                  kpi({ label: 'Expenses', value: M(p.expenses), tone: 'bad' }),
                  kpi({ label: 'Net Profit', value: M(p.netProfit), tone: p.netProfit < 0 ? 'bad' : 'good', badge: html`<span class="ms-auto">${pill('NM', nm)}</span>` }),
                  kpi({ label: 'Operating Ratio', value: fmt.pct(or), tone: 'accent' }),
              ])}
              <div class="mt-6 grid gap-6 lg:grid-cols-2">
                ${card('The Profit Waterfall', 'Revenue vs COGS vs Expenses vs Net Profit', canvasBox('wf', 300))}
                ${card('Expense Breakdown', 'Operating expenses by category', p.expenseByCategory.length ? html`<div class="flex flex-wrap items-center gap-6" style="min-height:300px"><div class="relative h-[200px] w-[200px] shrink-0"><canvas data-chart="eb"></canvas></div>${legendRows(p.expenseByCategory.slice(0, 8).map((c, i) => ({ label: c.name, value: c.amount, color: ui.PALETTE[(i + 3) % 10] })), p.expenses)}</div>` : emptyBox('No expense data for this period', 300))}
              </div>
              <div class="card mt-6 overflow-hidden">
                <div class="border-b border-line bg-surface-2 px-6 py-5"><div class="text-base font-semibold">Profit & Loss Statement</div><div class="mt-0.5 text-xs text-muted">${r.fromDay} — ${r.toDay}</div></div>
                ${sec('rev', 'Total Revenue', [['Total Revenue', M(p.revenue + p.returns)], ['Sales Return', `- ${M(p.returns)}`, 'text-bad']], ['Net Sales', M(p.revenue), p.revenue < 0 ? 'text-bad' : ''])}
                ${sec('cogs', 'Cost of Goods Sold', [['Cost of Goods Sold', `- ${M(p.cogs)}`, 'text-bad']], ['Gross Profit', M(p.grossProfit), p.grossProfit < 0 ? 'text-bad' : ''])}
                ${sec('exp', 'Expenses', [['Expenses', `- ${M(p.expenses)}`, 'text-bad']], ['Net Profit Before Tax', M(p.netProfit), p.netProfit < 0 ? 'text-bad' : ''])}
                <div class="flex flex-wrap items-center justify-between gap-3 border-t-4 border-double border-line bg-surface-2 px-6 py-6">
                  <div class="flex items-center gap-3"><span class="text-lg font-bold tracking-wider">NET PROFIT</span>${pill('Net Margin', nm)}</div>
                  <span class="text-3xl font-bold tabular-nums ${signTone(p.netProfit)}">${M(p.netProfit)}</span></div>
                <div class="px-6 py-3 text-xs text-muted">Total Revenue is after bill discounts (${M(p.discounts)}) and excludes sales tax (${M(p.tax)} net). Returns put back on the shelf reduce COGS; damaged returns stay a cost.</div>
              </div>`;
        }
        function draw(d) {
            const p = d.pl;
            barChart(el.querySelector('[data-chart=wf]'), ['Net Sales', 'COGS', 'Expenses', 'Net Profit'], [{ label: 'Amount', data: [p.revenue, p.cogs, p.expenses, p.netProfit], colors: ['#10b981', '#f43f5e', '#f59e0b', '#6366f1'] }], { symmetric: true });
            donutChart(el.querySelector('[data-chart=eb]'), p.expenseByCategory.slice(0, 8).map(c => c.name), p.expenseByCategory.slice(0, 8).map(c => c.amount), ui.PALETTE.slice(3).concat(ui.PALETTE.slice(0, 3)));
        }
        async function load() { data = await api.get('/api/reports/profit-loss', range); redraw(); }
        function redraw() { killCharts(); ui.mount(el, view(data)); draw(data); }

        ui.on(el, 'click', '[data-preset]', (e, b) => { range = { preset: b.dataset.preset }; load().catch(ui.fail); });
        ui.on(el, 'click', '[data-search]', () => {
            const f = el.querySelector('[data-from]').value, to = el.querySelector('[data-to]').value;
            if (!f || !to) return ui.toast('Choose both dates.', 'error');
            range = { preset: 'custom', from: f, to }; load().catch(ui.fail);
        });
        ui.on(el, 'click', '[data-sec]', (e, b) => { open[b.dataset.sec] = !open[b.dataset.sec]; redraw(); });
        ui.on(el, 'click', '[data-print]', () => {
            const p = data.pl;
            printReport('Profit & Loss Statement', data.range, [], [{ header: ['', 'Amount'], rows: [
                ['Total Revenue', M(p.revenue + p.returns)], ['Sales Return', `- ${M(p.returns)}`], ['Net Sales', M(p.revenue)], ['Cost of Goods Sold', `- ${M(p.cogs)}`], ['Gross Profit', M(p.grossProfit)],
                ['Expenses', `- ${M(p.expenses)}`], ...p.expenseByCategory.map(c => [`   ${c.name}`, M(c.amount)]), ['Net Profit Before Tax', M(p.netProfit)], ['NET PROFIT', M(p.netProfit)],
                ['Net Margin', fmt.pct(p.revenue ? (p.netProfit / p.revenue) * 100 : 0)]] }]);
        });
        await load();
        return killCharts;
    },
});

// ───────── Product Performance ─────────
HP.page('/reports/product-performance', {
    title: 'Product Performance', perm: 'reports.view',
    async render(el) {
        let range = { preset: 'month' }, data = null, categoryId = '', q = '', sort = { key: 'netProfit', dir: -1 };
        const PP_PRESETS = [['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['custom', 'Custom']];
        const SORTABLE = { qty: 'Qty Sold', revenue: 'Revenue', netProfit: 'Net Profit', margin: 'Margin' };
        const periodText = () => (range.preset === 'custom' ? `${data.range.fromDay} — ${data.range.toDay}` : t((PRESETS.find(p => p[0] === range.preset) || [, ''])[1]));

        const filtered = () => (data ? data.products.filter(p => !categoryId || p.categoryId === categoryId) : []);
        function insight(iconName, label, value, detail) {
            return html`<div class="card card-pad flex items-start gap-4"><div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">${icon(iconName, 'w-5 h-5')}</div>
              <div class="min-w-0"><div class="eyebrow">${label}</div><div class="mt-1 truncate text-lg font-bold" title="${value}">${value}</div><div class="text-xs text-muted">${detail}</div><div class="mt-1 text-xs text-accent">${periodText()}</div></div></div>`;
        }
        function tableRows() {
            const rows = filtered().filter(p => !q || p.name.toLowerCase().includes(q));
            rows.sort((a, b) => (a[sort.key] - b[sort.key]) * sort.dir || a.name.localeCompare(b.name));
            if (!rows.length) return html`<tr><td colspan="9" class="py-10 text-center text-sm text-muted">No products sold in this period.</td></tr>`;
            return html`${rows.map((p, i) => html`<tr><td class="text-muted">${i + 1}</td><td><div class="font-medium">${p.name}</div><div class="text-[11px] uppercase tracking-wide text-muted">${p.category || 'Other'}</div></td>
              <td class="num">${fmt.qty(p.qty)}</td><td class="num">${M(p.avgCost)}</td><td class="num">${M(p.avgPrice)}</td><td class="num">${M(p.revenue)}</td><td class="num">${M(p.cogs)}</td>
              <td class="num font-semibold ${p.netProfit < 0 ? 'text-bad' : ''}">${M(p.netProfit)}</td>
              <td class="num ${p.margin < 0 ? 'text-bad' : 'text-good'}"><span class="inline-flex items-center gap-1">${p.margin < 0 ? icon('alert', 'w-3.5 h-3.5') : ''}${fmt.pct(p.margin)}</span></td></tr>`)}`;
        }
        const head = () => html`<tr><th>RANK</th><th>PRODUCT</th>${[['qty', 'Qty Sold'], ['avgCost', 'AVG COST'], ['avgPrice', 'AVG PRICE'], ['revenue', 'Revenue'], ['cogs', 'COGS'], ['netProfit', 'Net Profit'], ['margin', 'Margin']].map(([k, l]) =>
            SORTABLE[k] ? html`<th class="!text-right"><button type="button" data-sort="${k}" class="inline-flex items-center gap-1 uppercase ${sort.key === k ? 'text-accent' : ''}">${l} <span aria-hidden="true">${sort.key === k ? (sort.dir < 0 ? '↓' : '↑') : '↕'}</span></button></th>` : html`<th class="!text-right">${l}</th>`)}</tr>`;

        function view() {
            const rows = filtered();
            const rev = rows.reduce((a, p) => a + p.revenue, 0), prof = rows.reduce((a, p) => a + p.netProfit, 0);
            const topP = rows.length ? rows.reduce((a, b) => (b.netProfit > a.netProfit ? b : a)) : null;
            const topV = rows.length ? rows.reduce((a, b) => (b.qty > a.qty ? b : a)) : null;
            const r = data.range;
            return html`
              <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div><h1 class="text-2xl font-bold tracking-tight">${t('Product Performance')}</h1><p class="mt-1 text-sm text-muted">Product-wise P&L — revenue, COGS, and margin by SKU.</p></div>
                <div class="flex flex-col items-end gap-3"><div class="flex flex-wrap items-center justify-end gap-2"><span class="me-1 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted">${icon('calendar', 'w-4 h-4')}PERIOD</span>${presetPills(PP_PRESETS, range.preset)}</div>
                  <div class="flex flex-wrap items-end justify-end gap-2"><div><label class="label">From</label><input type="date" class="input w-40" data-from value="${r.fromDay}"></div><div><label class="label">To</label><input type="date" class="input w-40" data-to value="${r.toDay}"></div>
                  <div><label class="label">Category</label><select class="input w-56" data-cat><option value="">All categories</option>${data.categories.map(c => html`<option value="${c.id}" ${c.id === categoryId ? 'selected' : ''}>${c.name}</option>`)}</select></div></div></div>
              </div>
              <div class="grid gap-4 lg:grid-cols-3">
                ${insight('award', 'TOP PROFITABLE PRODUCT', topP ? topP.name : '—', topP ? `${M(topP.netProfit)} profit · ${fmt.pct(topP.margin)} margin` : 'No sales in this period')}
                ${insight('package', 'HIGHEST VOLUME PRODUCT', topV ? topV.name : '—', topV ? `${fmt.qty(topV.qty)} units sold` : 'No sales in this period')}
                ${insight('chart', 'AVERAGE CATALOG MARGIN', fmt.pct(rev ? (prof / rev) * 100 : 0), 'Weighted across all sold products')}
              </div>
              <div class="mt-6 grid gap-6 lg:grid-cols-2">
                ${card('Top 5 Products: Revenue vs Profit', 'Dual bars with 2.5D depth — indigo revenue, emerald profit', rows.length ? canvasBox('top5', 300) : emptyBox('No products sold in this period', 300))}
                ${card('Profit Margin Distribution', 'Share of total profit pool by product', rows.some(p => p.netProfit > 0) ? html`<div class="flex flex-wrap items-center gap-6" style="min-height:300px"><div class="relative h-[200px] w-[200px] shrink-0"><canvas data-chart="dist"></canvas></div>${legendRows(rows.filter(p => p.netProfit > 0).sort((a, b) => b.netProfit - a.netProfit).slice(0, 6).map((p, i) => ({ label: p.name, value: p.netProfit, color: ui.PALETTE[i % 10] })), rows.filter(p => p.netProfit > 0).reduce((a, p) => a + p.netProfit, 0))}</div>` : emptyBox('No profitable products in this period', 300))}
              </div>
              <div class="card mt-6">
                <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div class="flex items-center gap-2 font-semibold">${icon('trending', 'w-5 h-5 text-muted')}Product Profitability</div>
                  <div class="flex w-full items-center gap-2 sm:w-auto"><input class="input min-w-0 sm:w-72" placeholder="Search products…" data-q value="${q}"><button class="btn btn-outline" data-csv ${rows.length ? '' : 'disabled'}>${icon('download')}CSV</button></div></div>
                <div class="overflow-x-auto thin-scroll"><table class="tbl"><thead data-head>${head()}</thead><tbody data-rows>${tableRows()}</tbody></table></div>
              </div>`;
        }
        function draw() {
            const rows = filtered();
            const top = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
            barChart(el.querySelector('[data-chart=top5]'), top.map(p => p.name), [{ label: 'Revenue', data: top.map(p => p.revenue), color: '#6366f1' }, { label: 'Profit', data: top.map(p => p.netProfit), color: '#10b981' }], { legend: true });
            const pos = rows.filter(p => p.netProfit > 0).sort((a, b) => b.netProfit - a.netProfit).slice(0, 6);
            donutChart(el.querySelector('[data-chart=dist]'), pos.map(p => p.name), pos.map(p => p.netProfit), ui.PALETTE);
        }
        const redraw = () => { killCharts(); ui.mount(el, view()); draw(); };
        async function load() { data = await api.get('/api/reports/product-performance', range); redraw(); }

        ui.on(el, 'click', '[data-preset]', (e, b) => {
            if (b.dataset.preset === 'custom') { range = { preset: 'custom', from: data.range.fromDay, to: data.range.toDay }; redraw(); el.querySelector('[data-from]').focus(); return; }
            range = { preset: b.dataset.preset }; load().catch(ui.fail);
        });
        ui.on(el, 'change', '[data-from],[data-to]', () => { const f = el.querySelector('[data-from]').value, to = el.querySelector('[data-to]').value; if (f && to) { range = { preset: 'custom', from: f, to }; load().catch(ui.fail); } });
        ui.on(el, 'change', '[data-cat]', (e, s) => { categoryId = s.value; redraw(); });
        ui.on(el, 'input', '[data-q]', (e, i) => { q = i.value.trim().toLowerCase(); el.querySelector('[data-rows]').innerHTML = String(tableRows()); });
        ui.on(el, 'click', '[data-sort]', (e, b) => { const k = b.dataset.sort; sort = sort.key === k ? { key: k, dir: -sort.dir } : { key: k, dir: -1 }; el.querySelector('[data-head]').innerHTML = String(head()); el.querySelector('[data-rows]').innerHTML = String(tableRows()); });
        ui.on(el, 'click', '[data-csv]', () => ui.csv(`product-performance-${data.range.fromDay}-to-${data.range.toDay}.csv`, ['Product', 'Category', 'Qty Sold', 'Avg Cost', 'Avg Price', 'Revenue', 'COGS', 'Net Profit', 'Margin %'],
            filtered().map(p => [p.name, p.category || 'Other', p.qty, R(p.avgCost), R(p.avgPrice), R(p.revenue), R(p.cogs), R(p.netProfit), p.margin])));
        await load();
        return killCharts;
    },
});

// ───────── Reminders: Action Center & Alert Dashboard ─────────
HP.page('/reminders', {
    title: 'Reminders', perm: 'reports.view',
    async render(el) {
        const open = { low: true, exp: true, cust: true, sup: true };
        let data = null;
        const canBuy = has('purchases.manage'), canPay = has('finance.manage');

        const panel = (key, iconName, tone, title, count, head, rows, empty) => html`<div class="card overflow-hidden">
            <button type="button" class="flex w-full items-center gap-3 px-5 py-4 text-left" data-acc="${key}" aria-expanded="${open[key] ? 'true' : 'false'}">
              <span class="flex h-9 w-9 items-center justify-center rounded-lg ${ICON_TONE[tone]}">${icon(iconName, 'w-4 h-4')}</span>
              <span class="min-w-0 flex-1"><span class="block font-semibold">${title}</span><span class="block text-xs text-muted">${count} actionable alerts</span></span>
              <span class="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted">${count}</span>${icon(open[key] ? 'chevronUp' : 'chevronDown', 'w-4 h-4 text-muted')}</button>
            ${open[key] ? html`<div class="overflow-x-auto thin-scroll border-t border-line"><table class="tbl"><thead><tr>${head.map(([h, right]) => html`<th class="${right ? '!text-right' : ''}">${h}</th>`)}</tr></thead>
              <tbody>${rows.length ? rows : html`<tr><td colspan="${head.length}" class="py-8 text-center text-sm text-muted">${empty}</td></tr>`}</tbody></table></div>` : ''}</div>`;

        function view(d) {
            const k = d.kpis, a = d.aging, v = d.valueAtRisk;
            const B = ['0-30', '31-60', '61-90', '90+'];
            const hasDues = B.some(b => a.receivables[b] || a.payables[b]);
            const risk = [['Healthy Stock', v.healthy, '#10b981'], ['Low Stock', v.low, '#f59e0b'], ['Out of Stock', v.out, '#ef4444'], ['Expiring', v.expiring, '#a855f7']];
            const tierBadge = e => (e.tier === 'expired' ? ui.badge('Expired', 'bad') : e.tier === 'urgent' ? ui.badge(`${e.daysLeft} days left`, 'bad') : ui.badge(`${e.daysLeft} days left`, 'warn'));
            return html`
              ${ui.pageHeader({ title: html`<span class="inline-flex items-center gap-3">${icon('bell', 'w-6 h-6 text-muted')}Action Center & Alert Dashboard</span>`, subtitle: 'Smart inbox — act on stock, expiry, and ledger risks in one click.', actions: html`<button class="btn btn-outline" data-refresh>${icon('refresh')}Refresh alerts</button>` })}
              ${kpiRow([
                  kpi({ label: 'Total Overdue to Collect', value: M(k.overdueCollect), tone: 'ink', iconName: 'wallet', iconTone: 'bad', sub: k.olderThan30 ? `${M(k.olderThan30)} older than 30 days` : 'Customer khata dues' }),
                  kpi({ label: 'Total Payables Due', value: M(k.payablesDue), tone: 'warn', iconName: 'banknote', iconTone: 'warn' }),
                  kpi({ label: 'Stock Items at Risk', value: k.atRisk, tone: 'warn', iconName: 'box', iconTone: 'warn', sub: 'Low stock or expiring' }),
                  kpi({ label: 'Health Score', value: `${k.healthScore}/100`, tone: k.healthScore >= 70 ? 'good' : k.healthScore >= 40 ? 'warn' : 'bad', iconName: 'activity', iconTone: 'good' }),
              ])}
              <div class="mt-6 grid gap-6 lg:grid-cols-2">
                ${card('Aging Dues (Receivables vs Payables)', 'Outstanding balances by age bucket', hasDues ? canvasBox('aging', 280) : emptyBox('No outstanding dues to visualize', 280))}
                ${card('Inventory Value at Risk', `Donut with inner shadow — ${fmt.sym()} value by stock health`, html`<div class="flex flex-wrap items-center gap-6" style="min-height:280px">
                    <div class="relative h-[200px] w-[200px] shrink-0">${v.total ? html`<canvas data-chart="risk"></canvas>` : ''}<div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"><span class="text-[10px] font-semibold tracking-wider text-muted">TOTAL VALUE</span><span class="text-sm font-bold">${M(v.total)}</span></div></div>
                    ${legendRows(risk.filter(x => x[1] > 0 || x[0] === 'Healthy Stock').map(([l, val, c]) => ({ label: l, value: val, color: c })), v.total)}</div>`)}
              </div>
              <div class="mb-3 mt-8 flex items-center gap-2 text-xs font-semibold tracking-wider text-muted">${icon('alert', 'w-4 h-4')}SMART INBOX</div>
              <div class="space-y-4">
                ${panel('low', 'box', 'warn', t('Low Stock Alert'), d.lowStock.length, [['PRODUCT'], ['CURRENT STOCK', 1], ['REORDER LEVEL', 1], ['RESTOCK CAPITAL', 1], ['ACTION', 1]],
                    d.lowStock.map(x => html`<tr><td class="font-medium">${x.name}${x.status === 'Out of stock' ? html` <span class="ms-1">${ui.badge('Out of stock', 'bad', false)}</span>` : ''}</td><td class="num">${fmt.qty(x.stock)} <span class="text-xs text-muted">${x.unit}</span></td><td class="num">${fmt.qty(x.reorderLevel)}</td><td class="num">${M(x.restockCapital)}</td>
                      <td class="num">${canBuy ? html`<a href="/purchases?productId=${x.id}&qty=${x.restockQty}" data-link class="btn btn-outline btn-sm">${icon('plus', 'w-3.5 h-3.5')}Create PO</a>` : ''}</td></tr>`), 'Every product is above its reorder level.')}
                ${panel('exp', 'alert', 'bad', `Expiring Soon (${d.window.days}–${d.window.upTo} days)`, d.expiring.length, [['PRODUCT'], ['BATCH'], ['EXPIRY DATE'], ['VALUE RISK', 1], ['ACTIONS', 1]],
                    d.expiring.map(x => html`<tr><td class="font-medium">${x.name}</td><td class="text-muted">${x.sku || '—'}</td><td>${fmt.date(x.expiryDate)} <span class="ms-1">${tierBadge(x)}</span></td><td class="num">${M(x.valueRisk)}</td>
                      <td class="num">${has('inventory.edit') ? html`<a href="/products" data-link class="btn btn-outline btn-sm">${icon('edit', 'w-3.5 h-3.5')}Review stock</a>` : ''}</td></tr>`), 'No products expiring within the alert window.')}
                ${panel('cust', 'users', 'good', 'Customer Dues', d.customers.length, [['CUSTOMER'], ['PHONE'], ['DUE AMOUNT', 1], ['ACTION', 1]],
                    d.customers.map(c => html`<tr><td class="font-medium">${c.name}<div class="text-xs text-muted">${c.oldestDays ? `oldest unpaid ${c.oldestDays} days` : 'today'}</div></td><td>${c.phone || '—'}</td><td class="num font-semibold text-warn">${M(c.balance)}</td>
                      <td class="num">${canPay ? html`<a href="/payments?type=in&partyId=${c.id}" data-link class="btn btn-outline btn-sm">${icon('arrowDown', 'w-3.5 h-3.5')}Collect</a>` : ''}</td></tr>`), 'No outstanding customer receivables.')}
                ${panel('sup', 'dollar', 'gray', 'Supplier Dues', d.suppliers.length, [['VENDOR'], ['DUE AMOUNT', 1], ['ACTION', 1]],
                    d.suppliers.map(s => html`<tr><td class="font-medium">${s.name}<div class="text-xs text-muted">${s.oldestDays ? `oldest unpaid ${s.oldestDays} days` : 'today'}</div></td><td class="num font-semibold text-bad">${M(s.balance)}</td>
                      <td class="num">${canPay ? html`<a href="/payments?type=out&partyId=${s.id}" data-link class="btn btn-outline btn-sm">${icon('arrowUp', 'w-3.5 h-3.5')}Pay</a>` : ''}</td></tr>`), 'No outstanding supplier payables.')}
              </div>`;
        }
        function draw(d) {
            const B = ['0-30', '31-60', '61-90', '90+'];
            barChart(el.querySelector('[data-chart=aging]'), ['0–30 days', '31–60 days', '61–90 days', '90+ days'], [{ label: 'Receivables', data: B.map(k => d.aging.receivables[k]), color: '#6366f1' }, { label: 'Payables', data: B.map(k => d.aging.payables[k]), color: '#f97316' }], { legend: true });
            const v = d.valueAtRisk;
            donutChart(el.querySelector('[data-chart=risk]'), ['Healthy Stock', 'Low Stock', 'Out of Stock', 'Expiring'], [v.healthy, v.low, v.out, v.expiring], ['#10b981', '#f59e0b', '#ef4444', '#a855f7'], { cutout: '72%' });
        }
        const redraw = () => { killCharts(); ui.mount(el, view(data)); draw(data); };
        async function load() { data = await api.get('/api/reports/reminders'); redraw(); }
        ui.on(el, 'click', '[data-acc]', (e, b) => { open[b.dataset.acc] = !open[b.dataset.acc]; redraw(); });
        ui.on(el, 'click', '[data-refresh]', async () => { try { await load(); ui.toast('Alerts refreshed'); } catch (err) { ui.fail(err); } });
        await load();
        return killCharts;
    },
});
