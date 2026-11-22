# Section 3: Reports, Finance and Administration

Spec for 13 screens (plus their tabs and dialogs) in the reference web POS: **Reports, Profit & Loss, Product Performance, Reminders (Action Center), Payments In/Out, Capital & Equity, Banks & Cash, Cheques, Expenses, Taxes & Duties, Users, Settings, Database Backups**.

Source: read-only captures in `reference/khatapos/`:
- First pass: page captures `NN-*.png/.json` (viewport only) and dialog/tab captures in `forms/fNN-*.png/.json`.
- Second pass: full-height pages and extra forms in `gaps/` (`t-*.png`, `fNN-*.png`).

## Conventions and capture notes

- Layouts below are confirmed from the full-height `gaps/` captures unless marked otherwise. The JSON text was identical between passes.
- "(inferred)" marks behaviour deduced from labels, sub-titles, figures or the network log. The screens do not show it directly.
- Labels are quoted exactly as shown (English UI). Business data is never copied. Amounts are given only as format examples.
- **Number format:** currency symbol + space + thousands separators + 2 decimals, e.g. `Rs 1,234.00`.
  - Negative values look like `Rs -17,960.00`, and deductions in statements look like `- Rs 0.00` (red).
  - Signed ledger values look like `+ Rs 640.00` (green) or `+Rs 200,000.00`.
  - Percent values have 1 decimal, e.g. `-2806.3%`, `0.0%`.
  - Stock quantities can be fractional, e.g. `9.8667`.
- **Date formats:** date inputs show `dd/mm/yyyy` (native date picker). Report tables use `YYYY-MM-DD`. Ledger and movement tables use `DD/MM/YYYY, HH:mm:ss`. Chart axes use `21 Nov`.
- **Drawer pattern:** most "create" forms open as a **right-side drawer**, about 450px wide and full height, over a dimmed, blurred page. It has a title, a one-line sub-title, a close "X" (aria-label "Close … drawer"), a scrollable body, and a sticky footer with `Cancel` (secondary) and a primary action on the right. The one centered modal is Capital "Update opening books".
- **Tables:**
  - Light grey header band and white rows with thin dividers.
  - Sortable headers show a small up/down chevron. The active sort column is highlighted (indigo text and arrow).
  - Empty states are a centered grey sentence, sometimes with an icon and a call-to-action.
- **Common shell (applies to every screen):**
  - Left sidebar groups: Dashboard, POS Terminal, Sales, Purchasing, Inventory, Parties, Reports, HRM & PAYROLL, Finance, Administration. Groups collapse, and the active child shows a left accent bar.
  - User card at the bottom (avatar initials, name, role) with `Sign out`.
  - Top bar: tenant name, a `Live / Online` status pill, `English | اردو` language toggle, night-mode toggle ("Switch to night mode"), and "Theme Palette" button.
  - Every page header has an H1 title (sometimes with an icon tile) and a grey one-line sub-title.
- Sidebar routes in this section: Reports `/reports`, Profit & Loss `/reports/profit-loss`, Product Performance `/reports/product-performance`, Reminders `/reminders`, Payments In/Out `/payments`, Capital & Equity `/finance/capital`, Banks & Cash `/banks`, Cheques `/cheques`, Expenses `/expenses`, Taxes & Duties `/finance/taxes`, Users `/users`, Settings `/settings`, Database Backups `/administration/backups`.
- Deep links seen in the app's quick-action menu: `Payment In => /payments?type=in`, `Payment Out => /payments?type=out`, `Add Expense => /expenses`, `View ledger => /payments`, `Reorder => /purchases`.

---

### Reports (`/reports`)

- **Purpose:** a tabbed reporting suite (Sales, Purchases, Inventory, Expenses, Financial & Khata, Tax & Audit) over a shared date range, with Print and CSV export.

**Layout (top to bottom):**

1. **Header:** chart icon + H1 `Reports`, sub-title "Enterprise reporting suite — tenant-scoped, real-time data". Top-right buttons: `Print` (printer icon) and `CSV` (download icon). Both are greyed out (disabled) on placeholder sub-tabs.
2. **Date range card:**
   - Label `Date range` (calendar icon), then pill presets: `Today`, `This Week`, `This Month`, `Last 30 Days`, `Last Month`, `This Year`, `Fiscal Year`.
   - Below them, `From` and `To` date inputs. Default is today to today.
   - No preset is shown highlighted in the capture.
3. **Main tab bar** (segmented, each with an icon): `Sales` (default), `Purchases`, `Inventory`, `Expenses`, `Financial & Khata`, `Tax & Audit`.
4. **Sub-tab row** (underline tabs) under the main tab. Sub-tabs differ per main tab (see below).
5. **Content area** for the active sub-tab.

#### Tab: Sales › Sub-tab `Sales Analytics` (default)

**KPI cards** (4 across). Each has a label, a big value, an icon tile at top-right, and a delta chip under the value. The chip is green with an up arrow for an increase, grey with "—" for no change.

| Card | Figure | Delta chip examples |
|---|---|---|
| Transactions | count of sales in range | "+100% from previous period" |
| Total Sales | sum of sale totals (green) | "+100% from previous period" |
| Tax Collected | sum of tax on sales (amber) | "No change from previous period" |
| Outstanding Due | unpaid balance on sales in range (red) | "No change from previous period" |

**Charts:**

| Chart | Type | Shows |
|---|---|---|
| Revenue Trend | Full-width line/area chart (sub-title "Daily revenue with premium depth gradient"). A single day shows as one dot | Revenue per day; X axis = dates, Y = amount |
| Top Selling Products | Horizontal bar chart, indigo bars, left half of the row (sub-title "Ranked by revenue — horizontal bars with depth") | Products ranked by revenue; Y axis = product names (wrapped), X = amount |
| Payment Methods | Donut with legend, right half of the row (sub-title "Cash vs Credit vs Other") | Share of sales by payment method; legend row = coloured dot, method, amount under it, and % at the far right (e.g. `Cash 100%`) |

**Daily summary table** (full width, below the charts):

| Date | Txns | Subtotal | Tax | Total | Due |
|---|---|---|---|---|---|
| `YYYY-MM-DD` | count | amount | amount | amount | amount |

One row per day in range.

#### Tab: Sales › `Product-wise Sales` / `Category-wise Sales`

- These are placeholder cards (dashed border, centered title and text). Print and CSV are disabled.
  - **Product-wise Sales:** "Breakdown of revenue and quantity sold per product for the selected period. Coming next in this reporting suite."
  - **Category-wise Sales:** "Aggregate sales by product category for the selected period. Coming next in this reporting suite."
- **To build (inferred):**
  - Product-wise: Product, Qty Sold, Revenue.
  - Category-wise: Category, Qty, Revenue.

#### Tab: Purchases

- Sub-tabs: `Purchase Summary` (default), `Supplier-wise`, `Outstanding Payables`.
- Placeholder: "Purchase Summary — Tenant-scoped purchase reports for the selected date range. Scaffold ready for Firebase integration." Print and CSV are disabled.
- **To build (inferred):**
  - Purchase Summary: purchases per day with totals, tax and due.
  - Supplier-wise: totals per vendor.
  - Outstanding Payables: vendors with unpaid balances.

#### Tab: Inventory

- Sub-tabs: `Analytics Overview` (default), `Current Stock & Value`, `Low-Stock Report`, `Expiry Report`, `Non-Moving Items`.
- Only Analytics Overview was captured. Print and CSV are enabled on it.

**Analytics Overview, top to bottom:**

1. **KPI cards** (4 across, icon tile top-right):

| Card | Figure | Caption / notes |
|---|---|---|
| Stock Valuation | Σ (stock × cost), green | "Total Rs locked in warehouse". Wallet icon |
| Active Products | Count of products, including variant SKUs (indigo) | Box icon |
| Total Units | Σ stock quantity (indigo) | Shown unrounded in the reference (a long float). **Round to 2–4 decimals in our build** |
| Low Stock Alerts | Count of low-stock products (amber) | Warning-triangle icon |

2. **Stock Valuation by Category** card (full width):
   - Vertical bar chart, sub-title "Warehouse value distribution".
   - One bar per category, in shades of indigo, sorted by value descending. About the top 5 are shown; uncategorised items appear under `Other`.
3. **Low Stock Alerts** section title, then a table:

| Product | SKU | Stock | Reorder Level | Unit | Status |
|---|---|---|---|---|---|
| name | code | qty | number | unit (e.g. Ctn, Pcs) | red pill `Out of stock` |

4. **Full Stock Register** section title, then a table:

| Product | SKU | Category | Stock | Unit | Cost | Value | Reorder |
|---|---|---|---|---|---|---|---|
| name | code | category (wraps) | qty, can be fractional | unit, or `—` | `Rs x` | `Rs x` | number |

Rules for this tab:

- Value = Stock × Cost (verified from the figures). Stock Valuation = Σ Value.
- Low stock = Reorder Level > 0 **and** Stock ≤ Reorder Level. Variant SKUs with reorder 0 and stock 0 were not listed.
- Status shows `Out of stock` when Stock = 0. Use `Low stock` (amber) when 0 < Stock ≤ Reorder Level. (inferred)
- Stock and valuation are point-in-time. The date range does not change them. (inferred)
- Fractional stock (e.g. 9.8667) comes from selling pieces of an item stocked in cartons. Our build should store stock in the base unit and display it converted. (inferred)

#### Tab: Expenses

- Sub-tabs: `Expense Summary` (default), `Category-wise`.
- Placeholder: "Expense Summary — Track operating expenses by period and category with tenant-isolated Firestore queries." Print and CSV are disabled.

#### Tab: Financial & Khata

This tab has no sub-tab row at the top. It shows KPIs and charts first, then the sub-tabs.

**KPI cards** (3 across):

| Card | Figure | Caption |
|---|---|---|
| Net Cashflow | Money in − money out (green) | "In − Out for selected period" |
| Receivables (Udhaar) | Total customer dues (indigo) | "Total to collect from customers" |
| Payables (To Pay) | Total vendor dues (amber) | "Total owed to suppliers" |

**Charts:**

| Chart | Type | Shows |
|---|---|---|
| Cashflow | Vertical bar | "Money In vs Money Out for selected period"; legend `Money In (Sales)` / `Money Out (Purchases + Expenses)` |
| Receivables vs Payables | Vertical bar, 2 bars | "Total udhaar to collect vs amounts owed to suppliers"; bars `Receivables (Udhaar)` and `Payables (To Pay)` |

**Sub-tabs** (below the charts):

- `Profit & Loss` (default). Its card reads "Profit & Loss (Net Profit) — Net profit from sales, COGS, returns, and expenses for the selected period." It appears to be a placeholder or summary card. This lower area exists only in the viewport capture, so its styling is unseen.
- `Business Net Worth`
- `Customer Ledger (Khata)`
- `Aging Report`
- `Supplier Payables`

#### Tab: Tax & Audit

- Sub-tabs: `FBR / Sales Tax` (default), `Voided / Deleted Bills`.
- Placeholder: "FBR / Sales Tax Report — Sales tax calculated from total sales for FBR compliance reporting." Print and CSV are disabled.

**Actions:**

| Button | Effect |
|---|---|
| Date presets | Set From/To and reload every tab |
| From / To | Custom range |
| Main tabs / sub-tabs | Switch report |
| `Print` | Browser print of the current report (inferred) |
| `CSV` | Download the current table as CSV (inferred) |

Print and CSV are enabled only when the sub-tab has real data.

**Behaviours / rules:**

- Each KPI's delta compares the selected range with the immediately preceding range of equal length. If the previous value was 0 and the current value is above 0, the chip shows "+100%". Equal values show "No change from previous period". (inferred)
- Total Sales = Σ sale totals. Tax Collected = Σ sale tax. Outstanding Due = Σ (total − paid) for sales in range. Txns = number of sale invoices. (inferred)
- `This Week` and `Fiscal Year` need a week-start and fiscal-year-start setting, but no such setting appears on the Settings screens. Assume Mon week start and a Jul–Jun fiscal year (Pakistan), and make both configurable. (inferred / open question)
- Net Cashflow = sales receipts − (purchase payments + expenses) in the range. Receivables and Payables are point-in-time balances from party ledgers. (inferred)
- Data is scoped per tenant (shop) ("tenant-scoped").

**Screenshots:** `16-reports.png`, `gaps/t-reports.png`, `forms/f20-reports--Sales-Analytics.png`, `forms/f21-reports--Product-wise-Sales.png`, `forms/f22-reports--Category-wise-Sales.png`, `forms/f23-reports--Purchases.png`, `gaps/f22-reports--Inventory.png`, `forms/f24-reports--Expenses.png`, `forms/f25-reports--Financial-Khata.png`, `forms/f26-reports--Tax-Audit.png`

---

### Profit & Loss (`/reports/profit-loss`)

- **Purpose:** an income statement (revenue → COGS → gross profit → expenses → net profit) for a chosen period, with KPI cards and charts.

**Layout:**

1. **Header row:**
   - Left: H1 `Profit & Loss`, sub-title "GAAP-aligned income statement for the selected period".
   - Right, top line: pill presets `Today` (active, highlighted by default), `This Week`, `This Month`, `This Year`, `Fiscal Year`.
   - Right, second line: `From` and `To` date inputs, `Search` button (filled), `Print` button (outline).
2. **KPI cards** (4 across):

| Card | Figure | Extra |
|---|---|---|
| Gross Profit | Net Sales − COGS (red when negative) | Badge top-right `GM <x>%` (gross margin), red when negative |
| Expenses | Operating expenses in period | — |
| Net Profit | Gross Profit − Expenses | Badge `NM <x>%` (net margin) |
| Operating Ratio | Percentage (indigo), e.g. `0.0%` | — |

3. **Two charts side by side:**

| Chart | Type | Shows |
|---|---|---|
| The Profit Waterfall | Vertical bar chart with 4 bars and a symmetric ± axis | Sub-title "Revenue vs COGS vs Expenses vs Net Profit". Bars: `Net Sales` (green), `COGS` (red/pink, drawn upward), `Expenses`, `Net Profit` (indigo; drawn below zero when negative) |
| Expense Breakdown | Donut/pie by category (inferred) | "Operating expenses by category". Empty state: "No expense data for this period" |

4. **Profit & Loss Statement** card (full width):
   - Header band with title `Profit & Loss Statement` and a grey sub-line with the range `YYYY-MM-DD — YYYY-MM-DD`.
   - Three collapsible sections. Each header is a bold label with a chevron (^) at the far right, and the sections start expanded:
     - **`Total Revenue`:** indented line `Total Revenue` (amount, right-aligned) and indented line `Sales Return` (red `- Rs x`). Then a divider and the bold subtotal `Net Sales`.
     - **`Cost of Goods Sold`:** indented line `Cost of Goods Sold` (red `- Rs x`), divider, bold subtotal `Gross Profit` (red when negative).
     - **`Expenses`:** indented line `Expenses` (red `- Rs x`), divider, bold subtotal `Net Profit Before Tax` (red when negative).
   - Footer band (shaded, separated by a double rule): `NET PROFIT` in caps, a pill `Net Margin <x>%` (red when negative), and a large amount at the right (red when negative, green when positive, inferred).

**Actions:**

| Button | Effect |
|---|---|
| Presets | Set From/To (and apply immediately, inferred) |
| `Search` | Apply the custom From/To range |
| `Print` | Print the statement |
| Section chevrons (`Total Revenue`, `Cost of Goods Sold`, `Expenses`) | Expand or collapse the line items |

**Behaviours / rules:**

- Net Sales = Total Revenue − Sales Return.
- Gross Profit = Net Sales − COGS.
- Net Profit Before Tax = Gross Profit − Expenses.
- NET PROFIT = Net Profit Before Tax. No tax line is shown.
- GM % = Gross Profit ÷ Net Sales × 100. NM % = Net Profit ÷ Net Sales × 100. Both are verified against the captured figures.
- Operating Ratio = Expenses ÷ Net Sales × 100. It showed 0.0% while COGS was non-zero, so COGS is excluded. (inferred)
- COGS = Σ (qty sold × cost per unit) for sales in period. Returned items reduce it (inferred).
  - Caution: in the reference, COGS is far larger than revenue (margin about −2800%). It looks like carton cost is multiplied by piece quantity.
  - **Our build must convert cost to the selling unit (base-unit cost) before computing COGS.**
- Expenses come from the Expenses module, grouped by category for the breakdown chart.

**Screenshots:** `17-reports-profit-loss.png`, `gaps/t-reports-profit-loss.png`

---

### Product Performance (`/reports/product-performance`)

- **Purpose:** profit and loss per product (SKU): quantity, revenue, COGS, net profit and margin, ranked, with category filter and search.

**Layout:**

1. **Header:**
   - Left: H1 `Product Performance`, sub-title "Product-wise P&L — revenue, COGS, and margin by SKU."
   - Right: label `PERIOD` (calendar icon) and pills `Today`, `This Week`, `This Month` (active by default), `Custom`.
   - Below those: `From` / `To` dates (default first day of month → today) and a `Category` select.
2. **Insight cards** (3 across). Each has an icon tile, a small caps label, a bold value (product name truncated with "…"), a grey detail line, and an indigo period caption ("This month"):

| Card | Value | Detail |
|---|---|---|
| TOP PROFITABLE PRODUCT | Product name | "Rs <profit> profit · <margin>% margin" |
| HIGHEST VOLUME PRODUCT | Product name | "<n> units sold" |
| AVERAGE CATALOG MARGIN | `<x>%` | "Weighted across all sold products" |

3. **Two charts:**

| Chart | Type | Shows |
|---|---|---|
| Top 5 Products: Revenue vs Profit | Grouped vertical bars (2 per product, 3D look). Sub-title "Dual bars with 2.5D depth — indigo revenue, emerald profit" | Revenue (indigo) and profit (green, can go below zero) for the top 5 products; X = truncated product names |
| Profit Margin Distribution | Donut (inferred) | "Share of total profit pool by product". Empty state: "No profitable products in this period" (only products with positive profit are included) |

4. **Product Profitability** card:
   - Header: trend icon + title, and a search box (placeholder `Search products…`) on the right.
   - Columns:

| RANK | PRODUCT | Qty Sold ↕ | AVG COST | AVG PRICE | Revenue ↕ | COGS | Net Profit ↓ | Margin ↕ |
|---|---|---|---|---|---|---|---|---|
| grey number | name, with the category in small grey caps under it | number | `Rs x` | `Rs x` | `Rs x` | `Rs x` | bold, red when negative | % with a red warning-triangle icon when negative (green when positive, inferred) |

   - Sortable columns: Qty Sold, Revenue, Net Profit, Margin. The default sort is **Net Profit descending** (indigo header with ↓), and RANK follows the current sort.

**Forms / filters:**

| Label | Type | Options | Notes |
|---|---|---|---|
| PERIOD | Pill radio | Today, This Week, This Month, Custom | Default This Month |
| From | date | — | Editable when Custom is chosen (inferred) |
| To | date | — | — |
| Category | select | `All categories` + every product category (A–Z) | Default All categories |
| Search products… | search | — | Filters table rows by product name |

**Behaviours / rules:**

- Revenue = Σ line totals. COGS = Σ qty × unit cost. Net Profit = Revenue − COGS. Margin = Net Profit ÷ Revenue.
- AVG PRICE = Revenue ÷ Qty. AVG COST = COGS ÷ Qty.
- Average Catalog Margin = Σ Net Profit ÷ Σ Revenue over all sold products (revenue-weighted). (inferred)
- The same unit-cost caution applies as on P&L.

**Screenshots:** `18-reports-product-performance.png`, `gaps/t-reports-product-performance.png`

---

### Reminders: Action Center & Alert Dashboard (`/reminders`)

- **Purpose:** one inbox for actionable risks: low stock, expiring batches, customer receivables and supplier payables. It also shows aging and inventory-at-risk charts and a health score.

**Layout:**

1. **Header:** inbox icon + H1 `Action Center & Alert Dashboard`, sub-title "Smart inbox — act on stock, expiry, and ledger risks in one click." `Refresh alerts` button (outline) at top-right.
2. **KPI cards** (4 across, coloured icon tile top-right):

| Card | Figure | Icon |
|---|---|---|
| Total Overdue to Collect | Σ overdue customer dues | Red wallet |
| Total Payables Due | Σ supplier dues (orange) | Orange banknote |
| Stock Items at Risk | Count of products in low stock or expiring (amber) | Amber box |
| Health Score | `<n>/100` (green) | Green heart-pulse |

3. **Two charts:**

| Chart | Type | Shows |
|---|---|---|
| Aging Dues (Receivables vs Payables) | Grouped bar by age bucket (inferred) | "Outstanding balances by age bucket". Empty state: "No outstanding dues to visualize" |
| Inventory Value at Risk | Semi-donut / gauge ("Donut with inner shadow — Rs value by stock health"); center `TOTAL VALUE` + amount | Legend rows: dot, health state, amount under it, and % at the far right (seen: `Healthy Stock 100%`) |

4. **SMART INBOX** (warning-triangle label in small caps), a stack of collapsible accordion cards. **All four are expanded by default.**
   - Each card header has a coloured icon tile, a bold title, "<n> actionable alerts" under it, a grey count pill on the right and a chevron (^).
   - Tables have small grey caps headers.

| Panel (icon) | Table columns | Row action | Empty state |
|---|---|---|---|
| Low Stock Alert (amber box) | PRODUCT · CURRENT STOCK · REORDER LEVEL · RESTOCK CAPITAL · ACTION | Small outline button `+ Create PO` | — |
| Expiring Soon (30–60 days) (red warning triangle) | PRODUCT · BATCH · EXPIRY DATE · VALUE RISK · ACTIONS | (not seen; no data) | "No products expiring within the alert window." |
| Customer Dues (green people) | CUSTOMER · PHONE · DUE AMOUNT · ACTION | (not seen; no data. Likely collect / send reminder) | "No outstanding customer receivables." |
| Supplier Dues (grey $) | VENDOR · DUE AMOUNT · ACTION | (not seen; no data. Likely pay) | "No outstanding supplier payables." |

- The Low Stock list is not paginated: every alert row is listed (dozens of rows), which makes the page very long.

**Actions:**

| Button | Effect |
|---|---|
| `Refresh alerts` | Re-run all alert queries |
| Panel header / chevron | Expand or collapse the panel |
| `Create PO` | Open Purchases / Create Purchase Order prefilled with the product and its restock quantity (inferred; the quick-menu "Reorder => /purchases" supports this) |

**Behaviours / rules:**

- **Low stock:** Reorder Level > 0 and current stock ≤ reorder level (same rule as the Reports Inventory tab). Reorder level is a per-product field; most products use 5 by default.
- **RESTOCK CAPITAL** = (reorder level − current stock) × cost price. This is verified: one row with cost 2,800, stock 0 and reorder 5 shows 14,000. It is Rs 0.00 when cost is missing.
  - Our build might use a separate reorder quantity instead of the reorder level. (inferred)
- **Expiring Soon:** batches whose expiry falls inside the alert window. The window comes from Settings › Localization `Expiry Reminder (days)` (default 30); the panel title says 30–60 days. VALUE RISK = remaining qty × cost. (inferred)
- **Aging buckets:** use 0–30, 31–60, 61–90 and 90+ days by invoice due date, shown separately for receivables and payables. (inferred)
- **Inventory Value at Risk:** total stock value at cost, split by health state (Healthy Stock / Low Stock / Out of Stock / Expiring). Only Healthy appeared. (inferred)
  - Caution: this total was lower than Reports › Inventory "Stock Valuation" by exactly the value of the variant SKUs. **Use one valuation query for both screens.**
- **Health Score:** starts at 100 and loses points for risk counts. It showed 70 with about 38 low-stock items, so the deduction is probably capped per category. The exact formula is unknown, so define our own. (inferred)

**Screenshots:** `19-reminders.png`, `gaps/t-reminders.png`

---

### Payments In/Out (`/payments`)

- **Purpose:** record and list money received from customers (Payment In) and paid to suppliers (Payment Out) against their ledgers (khata).

**Layout:**

1. **Header:** H1 `Payments In/Out`, sub-title "GAAP-compliant cashflow dashboard — track payment in and payment out with live ledger visibility."
2. **KPI cards** (3 across, round icon at left):
   - `Payment In`: green down-arrow, Σ in.
   - `Payment Out`: red up-arrow, Σ out.
   - `Net Flow`: wallet icon, In − Out.
3. **Toolbar card:** search input (placeholder `Search by Customer/Supplier`) on the left; `+ New Transaction` button on the right.
4. **Table:** `Date` (sortable, default desc) | `TRANSACTION ID` | `PARTY NAME` | `TYPE` | `METHOD` | `Amount` (sortable) | `ACTION`.
5. **Empty state:** receipt icon in a circle, "No transactions found", "Record your first payment to start tracking customer and supplier ledger activity.", and a `+ New Transaction` button.

The full-height capture is the same as the viewport one: the page ends after the empty state.

**Actions:**

| Button | Effect |
|---|---|
| `New Transaction` (toolbar or empty state) | Opens the New Transaction drawer |
| Search | Filters by party name |
| ACTION column | Row actions; not captured because there are no rows (likely view / print receipt / delete) |

**Form: New Transaction** (right drawer). Sub-title "Record payment in or out with live ledger balance."

| Label | Type | Options | Notes |
|---|---|---|---|
| Party (Customer / Supplier) | select | `Select party…` + all customers and vendors | Required |
| Type | select | Payment In, Payment Out | Default Payment In. Half width, left |
| Method | select | Cash, Bank, Cheque | Default Cash. Half width, right |
| Amount | number | — | Required. Spinner |
| Note | text | — | Placeholder "Optional reference" |

Footer: `Cancel`, `Save` (with download icon).

**Behaviours / rules:**

- Payment In from a customer lowers that customer's receivable (udhaar). Payment Out to a vendor lowers the payable. Each payment writes a ledger entry for the party. (inferred, from "live ledger balance" and the `ledger_entries` / `payments` data)
- Cash payments post to the Cash in Hand account. Bank payments post to a bank account, but no account picker is shown, so use the default bank or add a picker. A Cheque payment should create a Pending cheque on the Cheques screen rather than move cash immediately. (inferred)
- `/payments?type=in` and `/payments?type=out` open the drawer with Type preselected. (inferred)
- "Live ledger balance" suggests showing the party's current balance once a party is selected (not visible in the empty capture). (inferred)

**Screenshots:** `27-payments.png`, `gaps/t-payments.png`, `forms/f27-payments--New-Transaction.png`

---

### Capital & Equity (`/finance/capital`)

- **Purpose:** owner's equity: capital injected, retained earnings, net worth, and a log of capital movements (injections and drawings).

**Layout:**

1. **Header:** H1 `Capital & Equity`, sub-title "GAAP owner's equity — capital injected, retained earnings, and net worth."
2. **KPI cards** (3 across, icon tile top-right):

| Card | Figure | Caption / extra |
|---|---|---|
| Total Capital Injected | Σ capital injections (indigo) | "Owner funds invested in the business"; outline button `✎ Update Setup` |
| Retained Earnings | Net profit − drawings (green) | "Net profit Rs <x> − drawings Rs <y>" |
| Total Business Net Worth | Capital + retained earnings | "Capital injected + retained earnings" |

3. **Two charts:**

| Chart | Type | Shows |
|---|---|---|
| Equity Composition | Donut ("Owner money vs earned profit — 2.5D depth view"); center `NET WORTH` + amount | Legend: `Capital Injected` % + amount, `Retained Earnings` % + amount |
| Net Worth Trend | Area chart | "Cumulative capital injected + retained earnings" over dates |

4. **Capital Movements** card:
   - Title, with sub-title "Injections increase capital; drawings reduce retained earnings and sync to bank."
   - `+ Record Movement` button at right.
   - Table:

| Date ↕ | Type ↕ | Reference ↕ | Note ↕ | Amount ↕ |
|---|---|---|---|---|
| `DD/MM/YYYY, HH:mm:ss` | pill badge with icon (green `Capital Injection`; a drawing badge is likely red/amber, inferred) | e.g. `SETUP` | text | signed, green `+Rs …` (drawings `-Rs …` red, inferred) |

   - There is no row actions column.

**Actions:**

| Button | Effect |
|---|---|
| `Update Setup` | Opens the "Update opening books" modal |
| `Record Movement` | Opens the Record Capital Movement drawer |
| Column headers | Sort |

**Form: Update opening books** (centered modal with a sparkle icon tile). Sub-title "Adjust your recorded initial investment and opening cash balance."

| Label | Type | Options | Notes |
|---|---|---|---|
| Initial Investment Amount | number | — | Required. Placeholder 0.00. Helper "How much money was put into the business to start." Building icon |
| Current Cash/Bank Balance | number | — | Required. Placeholder 0.00. Helper "Money currently available in cash or bank accounts." Wallet icon |

- Live preview line under the fields: "Preview: Capital Rs <x> · Opening cash Rs <y>".
- Buttons: full-width primary `Save Changes`, and a text `Cancel` under it.

**Form: Record Capital Movement** (right drawer). Sub-title for Capital Injection: "Owner adds money — increases equity and bank balance."

| Label | Type | Options | Notes |
|---|---|---|---|
| Movement Type | select | `Capital Injection — Owner adds money`, `Owner Drawing / Dividend — Owner takes money out` | Default Capital Injection |
| (effect chip) | read-only chip | — | Green chip with icon under the select: "Credits equity & bank" (for Injection). For a drawing it should read as a debit, and the sub-title changes to match (inferred) |
| Amount | number | — | Required. Placeholder 0.00 |
| Transfer To/From Bank | select | `Select bank or cash account…` + accounts as "`<Name> (<Type>) — Rs <balance>`" | Required |
| Reference | text | — | Placeholder "Cheque no., transfer ref…" |
| Note | text | — | Placeholder "Optional memo" |

- Footer: `Cancel`, `Save`.
- There is no date field, so the movement is stamped with the current date and time (inferred).

**Behaviours / rules:**

- The opening setup creates a `Capital Injection` movement with Reference `SETUP` and note "Opening capital — initial business investment".
- Total Capital Injected = Σ injections.
- Retained Earnings = cumulative net profit − Σ drawings. Net Worth = Capital Injected + Retained Earnings.
- **Capital Injection:** + capital and + the selected account balance (a bank ledger row is added).
- **Owner Drawing / Dividend:** − retained earnings and − the selected account ("sync to bank"). Validate Amount ≤ account balance. (inferred)
- Caution: in the reference, the "net profit" on this screen equals total cash sales (it does not match the P&L figure). Also, the opening cash entered in setup does not appear in the Cash in Hand balance. **Our build should use the same net-profit engine as P&L, and post opening cash as an opening balance on the cash account.**

**Screenshots:** `28-finance-capital.png`, `gaps/t-finance-capital.png`, `forms/f28-finance-capital--Update-Setup.png`, `gaps/f23-finance-capital--Record-Movement.png`

---

### Banks & Cash (`/banks`)

- **Purpose:** treasury: list of cash and bank accounts with balances, a liquidity chart, transfers between accounts, and a ledger of all account movements.

**Layout:**

1. **Header:**
   - H1 `Banks & Cash`, sub-title "Treasury Management Dashboard — Rs <total> total liquidity", where the total is computed live.
   - `⇆ Transfer Funds` button (filled) at top-right.
2. **Account cards row:**
   - One dark card per account: wallet icon + type label (`CASH` or a bank type), account name (e.g. "Cash in Hand"), small caps `CURRENT BALANCE`, and a big balance.
   - After the accounts, a dashed-border tile `+ Add New Account`.
3. **Liquidity Overview** card: donut ("Fund distribution across treasury accounts — 2.5D depth view"), center `TOTAL LIQUIDITY` + amount. Legend rows show `<Account> (<Type>)`, amount, and % at the far right.
4. **Transactions Ledger:**
   - Section title (outside a card) with sub-title "All treasury movements — transfers, payments, and account activity".
   - Table in a card:

| Date | Bank | Type | Reference/Note | Amount |
|---|---|---|---|---|
| `DD/MM/YYYY, HH:mm:ss` | account name | small green pill (e.g. `Sale`) | e.g. "Sale INV-0001" | right-aligned, green `+ Rs …` for in (red `- Rs …` for out, inferred) |

   - Newest rows first. There is no row actions column and no pagination (only a few rows exist).

**Actions:**

| Button | Effect |
|---|---|
| `Transfer Funds` | Opens the Transfer Funds drawer |
| `Add New Account` tile | Opens the Add New Account drawer |
| Account card | Possibly filters the ledger or opens account detail (not captured) |

**Form: Add New Account** (right drawer). Sub-title "Create a bank or cash account for treasury tracking."

| Label | Type | Options | Notes |
|---|---|---|---|
| Name | text | — | Required. Placeholder "e.g. HBL Main Account" |
| Account # | text | — | Placeholder "Optional account number" |
| Opening Balance | number | — | Placeholder 0.00 |
| Cash drawer / petty cash account | checkbox | — | Unchecked by default. Marks the account as type Cash instead of Bank |

Footer: `Cancel`, `Save`.

**Form: Transfer Funds** (right drawer). Sub-title "Move money between treasury accounts — contra entries recorded automatically."

| Label | Type | Options | Notes |
|---|---|---|---|
| From Account | select | `Select source account…` + accounts as "`<Name> (<Type>) — Rs <balance>`" | Required |
| (swap icon button ⇆) | button | — | Between the two selects; swaps From and To (inferred) |
| To Account | select | `Select destination account…` + the same list | Required |
| Amount | number | — | Required. Placeholder 0.00 |
| Note | text | — | Placeholder "Optional reference or memo" |

Footer: `Cancel`, `Transfer Funds`.

**Behaviours / rules:**

- A default account "Cash in Hand" (type CASH) always exists. Cash sales auto-post to it with Type `Sale` and reference `Sale <invoice no>`.
- Account balance = opening balance + Σ in − Σ out. Total liquidity = Σ account balances.
- A transfer creates two linked entries: an out entry on the source and an in entry on the destination ("contra entries"). Net liquidity is unchanged.
  - Validate From ≠ To, Amount > 0 and Amount ≤ source balance. (inferred)
- Other ledger Types (inferred): Transfer In/Out, Payment In/Out, Expense, Purchase, Capital Injection, Drawing, Cheque Cleared, Opening Balance.

**Screenshots:** `29-banks.png`, `gaps/t-banks.png`, `forms/f29-banks--Add-New-Account.png`, `forms/f30-banks--Transfer-Funds.png`

---

### Cheques (`/cheques`)

- **Purpose:** track post-dated cheques (PDCs), incoming from customers and outgoing to vendors, through Pending → Cleared / Bounced.

**Layout:**

1. **Header:** H1 `Cheques`, sub-title "GAAP-compliant post-dated cheque lifecycle — track pending, cleared, and bounced PDCs with bank and ledger integration." `+ Record Cheque` button at top-right.
2. **KPI cards** (3 across, round icon at left):
   - `Total Pending`: clock icon, amber amount.
   - `Cleared This Month`: check icon, green amount.
   - `Bounced`: x icon. Shown as "`<count>` (Rs <amount>)", with the count red and the amount grey.
3. **Two charts:**

| Chart | Type | Shows |
|---|---|---|
| Upcoming Clearances | Bar by month (inferred) | "Pending PDC value grouped by month". Empty state: "No pending cheques to forecast" |
| Cheque Status Distribution | Donut (inferred) | "Cleared vs Pending vs Bounced". Empty state: "No cheque activity to chart yet" |

4. **Table:** `Cheque #` | `Type` (sortable) | `Party` | `Bank` | `Date` (sortable, default ascending) | `Amount` (sortable) | `Status` (sortable) | `Actions`.
5. **Empty state:** cheque icon, "No cheques recorded yet", and a link-style button `Record your first cheque`. This is the end of the page.

**Actions:**

| Button | Effect |
|---|---|
| `Record Cheque` / `Record your first cheque` | Opens the Record Cheque drawer |
| Row Actions | Not captured (no rows). Expected: Mark Cleared, Mark Bounced, Edit, Delete (inferred) |

**Form: Record Cheque** (right drawer). Sub-title "Post-dated cheque (PDC) — incoming from customer or outgoing to vendor."

| Label | Type | Options | Notes |
|---|---|---|---|
| Type | radio (2-button segmented) | `Incoming` (↙), `Outgoing` (↗) | Default Incoming (highlighted) |
| Party (Customer) | select | `Select customer…` + customers | Required. For Outgoing, the label and list should switch to Vendor (inferred) |
| Bank | select | `Select bank…` + accounts (e.g. "Cash in Hand (Cash)") | Required |
| Cheque Number | text | — | Required. Placeholder "e.g. 004521" |
| Date | date | — | Required. Placeholder dd/mm/yyyy. This is the cheque (clearing) date. Half width |
| Amount | number | — | Required. Half width |
| Notes | textarea | — | Placeholder "Optional memo…" |

Footer: `Cancel` (text), `Save Cheque` (filled, wide).

**Behaviours / rules:**

- Statuses: **Pending** (on save), **Cleared**, **Bounced**.
- Total Pending = Σ amount where status is Pending. Cleared This Month = Σ amount cleared in the current calendar month. Bounced = count and Σ amount.
- Upcoming Clearances groups Pending cheques by the month of their Date.
- On **Clear** (inferred):
  - Incoming: credit the customer ledger (reduces receivable) and add money to the selected bank.
  - Outgoing: debit the vendor ledger (reduces payable) and take money from the bank.
- On **Bounce**, no money moves. Mark the cheque and keep or restore the party's due, optionally with a bounce charge. (inferred)
- A cheque whose date has passed and is still Pending should be highlighted, and could feed the Reminders inbox. (inferred)

**Screenshots:** `30-cheques.png`, `gaps/t-cheques.png`, `forms/f31-cheques--Record-Cheque.png`

---

### Expenses (`/expenses`)

- **Purpose:** record operating expenses (OpEx) by category and paying account, and analyse them over a period.

**Layout:**

1. **Header:** H1 `Expenses`, sub-title "GAAP-compliant operational expenditure intelligence". `+ Record Expense` button at top-right.
2. **Filter row:**
   - Left: pills `Today`, `This Week`, `This Month` (active by default).
   - Right: calendar icon, From date, the word `to`, To date. The default range is the first day of the month to today.
3. **KPI cards** (3 across, small icon top-right):

| Card | Figure | Caption |
|---|---|---|
| Total Expenses | Σ amount (red) | "<n> transactions" |
| Top Expense Category | Category name, or `—` | "No expenses in range" when empty; otherwise likely that category's amount (inferred) |
| Average Daily Expense | Amount (amber) | "Mean outflow per active day" |

4. **Two charts:**

| Chart | Type | Shows |
|---|---|---|
| Expenses by Category | Donut or bar (inferred) | "Where operational spend is concentrated" |
| Expense Trend | Line or bar by day (inferred) | "Daily outflows for the selected period" |

Empty state for both charts: "No expense data for this period".

5. **Expense Transactions** card:
   - Title, with sub-title "All operational outflows for the selected period".
   - Full-width table: `Date` | `Voucher #` | `Category` | `Paid From` | `Note` | `Amount` (right-aligned).
   - There is no row actions column and no sort chevrons.
   - Empty state: "No expenses recorded for this period" (centered grey). This is the end of the page.

**Actions:**

| Button | Effect |
|---|---|
| `Record Expense` | Opens the Record Expense drawer |
| Presets / dates | Re-filter KPIs, charts and table |

**Form: Record Expense** (right drawer). Sub-title "OpEx entry with automatic double-entry ledger posting."

| Label | Type | Options | Notes |
|---|---|---|---|
| Voucher / Receipt # | text | — | Placeholder "Auto-generated if left blank". Helper "Leave empty for automatic EXP-XXXX numbering." |
| Date | date | — | Required. Default today |
| Category | select | `Select category…`, the expense categories, and `+ Add New Category` | Choosing `+ Add New Category` creates a category inline (inferred) |
| Payment Method / Bank Account | select | `Select paying account…` + accounts as "`<Name> (<Type>) — Rs <balance>`" | Required. Defaults to Cash in Hand. Helper under it: "Available: Rs <balance of selected account>" |
| Amount | number | — | Required. Placeholder 0.00 |
| Note | textarea | — | Placeholder "Description or memo for this expense" |

Footer: `Cancel`, `Save Expense`.

**Behaviours / rules:**

- Voucher numbers auto-increment as `EXP-0001`, `EXP-0002`, and so on when left blank. (inferred: 4-digit pad)
- Saving posts double entry: debit the expense category and credit the paying account. The account balance on Banks & Cash drops, and a ledger row of type Expense appears. (inferred)
- Warn or block when Amount > Available for the selected account. (inferred)
- Average Daily Expense = Total ÷ number of distinct days with at least one expense in range.
- Expenses feed P&L "Expenses", the P&L Expense Breakdown, and Reports › Financial & Khata Money Out.

**Screenshots:** `31-expenses.png`, `gaps/t-expenses.png`, `forms/f32-expenses--Record-Expense.png`

---

### Taxes & Duties (`/finance/taxes`)

- **Purpose:** set the default POS tax rate and maintain the list of named sales taxes (GST, etc.), including which ones stack.

**Layout** (centered content column, narrower than other pages):

1. **Header:** `%` icon tile + H1 `Taxes & Duties`, sub-title "Configure sales taxes, GST rates, and duty stacking for POS".
2. **Card "Default POS Tax Rate":** sub-title "Applied when no specific tax is selected at checkout". Field `Tax % (default)` (number, value 0) with an inline `Save` button.
3. **Info line:** "Define sales taxes for POS. Enable **Combine** to stack multiple taxes on the same bill base."
4. **Card "Add New Tax":** inline form (see below) with an `Add Tax` button.
5. **Table:** `Name` (sortable, default ascending) | `Rate` | `Combine` | `Active` | `Actions`. Empty state: "No taxes configured yet." This is the end of the page.

**Form: Default POS Tax Rate** (inline)

| Label | Type | Options | Notes |
|---|---|---|---|
| Tax % (default) | number | — | Default 0. `Save` persists it |

**Form: Add New Tax** (inline card)

| Label | Type | Options | Notes |
|---|---|---|---|
| Tax Name | text | — | Required. Placeholder `e.g. "GST @ 18%"`. Error banner "Tax name is required." (red, full width above the button) |
| Rate (%) | number | — | — |
| Active | checkbox | — | Checked by default |
| Combine / Group Tax | checkbox | — | Checked by default |

Button: `Add Tax`.

**Behaviours / rules:**

- At POS checkout the cashier can pick a tax (see the POS Terminal "Tax" control in the POS section). With none picked, the Default POS Tax Rate applies.
- Only **Active** taxes are offered at POS.
- **Combine** taxes are all applied to the same bill base and summed, not compounded. For example, GST 17% + Further Tax 3% on a base of 1,000 gives 170 + 30 = 200. A non-combined tax is applied on its own. (inferred)
- Row Actions: likely Edit, Toggle Active, Delete (not captured; no rows).

**Screenshots:** `32-finance-taxes.png`, `gaps/t-finance-taxes.png`, `forms/f33-finance-taxes--Add-Tax.png`

---

### Users (`/users`)

- **Purpose:** manage staff logins (sub-users), their role and per-module permissions. A Master PIN guards changes.

**Layout:**

1. **Header:** H1 `Users`, sub-title "Manage staff accounts, roles, and granular permissions for your shop."
2. **Two charts:**

| Chart | Type | Shows |
|---|---|---|
| Staff Role Distribution | Donut; center total count + `TOTAL` | "Admins, managers, and cashiers across your team". Legend rows: role (`Admins`, and Managers / Cashiers when present), count, % |
| System Activity (Mock Trend) | Smooth area chart, Mon–Sun | "General system usage over the past week". This is **mock data** in the reference; replace with real activity, e.g. logins or transactions per day (inferred) |

3. **Users table card:**
   - Toolbar: search (`Search users…`) on the left; `Add New User` button (person-plus icon) on the right.
   - Columns: `USER PROFILE` (coloured avatar with initials, name, email under it) | `ROLE` (pill badge, e.g. `Admin`) | `STATUS` (green dot + `Active`) | `ADDED DATE` (shows `—` when unknown) | `ACTIONS` (pencil icon button, aria "Edit <name>").

**Actions:**

| Button | Effect |
|---|---|
| `Add New User` | Opens the Add New User drawer |
| Pencil (Edit) | Opens the Edit Permissions drawer |
| Search | Filters by name or email |

**Form: Add New User** (right drawer). Sub-title "Assign role defaults, then fine-tune module access."

| Label | Type | Options | Notes |
|---|---|---|---|
| Full Name | text | — | Required. Half width |
| Email | email | — | Required. Half width. Used as the login |
| Sub-User Password | password | — | Required |
| Role | select | Manager, Cashier | Default Cashier |
| Permissions Matrix › SALES › Create | toggle | — | Cashier preset: ON |
| SALES › View | toggle | — | Cashier preset: off |
| SALES › Delete | toggle | — | Cashier preset: off |
| INVENTORY › Add | toggle | — | Cashier preset: off |
| INVENTORY › Edit | toggle | — | Cashier preset: off |
| REPORTS › View | toggle | — | Cashier preset: off |
| SETTINGS › Manage | toggle | — | Cashier preset: off |
| Security Zone — Step-Up Authentication: Master PIN | 4 × password (1 digit each) | — | "Enter the 4-digit Master PIN to authorize this high-level security change." Shown in an amber panel with a lock icon |

- The matrix heading reads `Permissions Matrix` with the note "Role presets apply automatically. Override individual modules as needed."
- Permissions are grouped in 4 small cards in a 2 × 2 grid: SALES, INVENTORY, REPORTS, SETTINGS.
- Footer: `Cancel`, `Create User`.

**Form: Edit Permissions** (right drawer, opened from the pencil). Same sub-title.

| Label | Type | Options | Notes |
|---|---|---|---|
| Full Name | text | — | Required. Prefilled |
| Email | email | — | Prefilled and greyed (read-only; email can't be changed, inferred) |
| Role | select | Manager, Cashier | Prefilled |
| Permissions Matrix (same 7 toggles) | toggle | — | In the capture (owner account) every toggle is ON |
| Master PIN | 4 × password | — | Same Security Zone panel |

- There is no password field.
- Footer: `Cancel`, `Update User`.

**Behaviours / rules:**

- **Roles:**
  - **Admin:** the shop owner, created at signup. Not offered in the Role select.
  - **Manager:** preset all ON (inferred from the Edit capture).
  - **Cashier:** preset Sales › Create only.
- Changing Role resets the toggles to that role's preset. After that, each toggle can be overridden.
- Note: when editing an Admin, the select shows `Manager` because Admin isn't an option. The second capture shows the same. Our build should show Admin as fixed or read-only.
- Permission keys: `sales.create`, `sales.view`, `sales.delete`, `inventory.add`, `inventory.edit`, `reports.view`, `settings.manage`. They gate sidebar items and buttons. For example, without `reports.view` the Reports group is hidden. (inferred)
- Creating or updating a user requires the 4-digit **Master PIN** (step-up auth). Where the PIN is set is not captured; probably at signup or in the owner's profile (open question).
- Status: Active, and presumably Inactive / disabled (no toggle captured). ADDED DATE = created-at.

**Screenshots:** `33-users.png`, `gaps/t-users.png`, `forms/f34-users--Add-New-User.png`, `forms/f35-users--Edit-Mudassar-ali.png`, `gaps/f26-users--Edit-Mudassar-ali.png`

---

### Settings (`/settings`)

- **Purpose:** business configuration in three tabs: Company Profile (identity on documents), Receipt & POS (invoice templates, print layout, numbering), and Localization (currency, language, timezone, expiry alerts).

**Layout:**

1. **Header:** sliders icon tile + H1 `Settings`, sub-title "Core business configuration — modular ERP settings engine".
2. **Two columns:**
   - Left: vertical tab card with icons: `Company Profile` (default), `Receipt & POS`, `Localization`.
   - Right: a large card for the active tab, with a title and sub-title, the fields, a divider, and a `Save` button at bottom-left.

#### Tab: Company Profile

Sub-title "Business identity shown on invoices, receipts, and reports".

| Label | Type | Options | Notes |
|---|---|---|---|
| Name | text | — | Business name. Half width |
| Phone | text | — | Half width |
| Email | text | — | Half width |
| Tax ID / NTN | text | — | Half width. Printed when "Show Tax ID" is on |
| Address | text | — | Full width |
| Company Logo | file | — | Square thumbnail preview, then `Choose file` ("No file chosen"), then red link `Remove logo`. Helper "Shown on printed receipts. Max 500 KB." |

Button: `Save`.

#### Tab: Receipt & POS

- Title `Receipt & POS`, sub-title "Invoice configuration engine — templates, B2B layout, branding, and automation".
- Note: "Enterprise invoice configuration — templates, B2B layout, branding, and print automation. Settings persist locally on this device."
- Content is grouped in bordered sub-cards. The last group (Document Numbering & Legal Text) sits below a divider, outside the cards.
- Defaults below are as captured.

**Sub-card "Template & Size Engine"** ("Choose paper format, size, and visual invoice template"):

| Label | Type | Options | Notes |
|---|---|---|---|
| PAPER FORMAT | radio cards (icon + title + caption) | `Thermal Receipt` ("80mm / 58mm roll — retail POS"), `Standard Invoice` ("A4 / A5 — B2B wholesale & corporate") | Default Thermal Receipt |
| THERMAL WIDTH | segmented radio | `80mm`, `58mm` | Default 80mm. Shown for Thermal; an A4/A5 choice probably replaces it for Standard Invoice (inferred) |
| VISUAL TEMPLATE | radio cards | `Standard` ("Balanced retail layout"), `Compact (Save Paper)` ("Dense lines, minimal spacing"), `Supermarket` ("High-volume SKU layout") | Default Standard |

**Sub-card "Brand Configuration"** ("Theme A4/A5 invoices with your corporate identity"). Two columns:

| Label | Type | Options | Notes |
|---|---|---|---|
| Primary Brand Color | 7 round swatch buttons, then a color-picker square + hex text input | Swatches: #4f46e5, #0ea5e9, #059669, #d97706, #dc2626, #7c3aed, #18181b | Default #4F46E5 (first swatch shows a ring). Helper "Applied to invoice headers, accents, and table bands" |
| Typography | select | Inter, Roboto, Georgia, Times New Roman | Default Inter. Helper "Invoice body and heading font family" |
| Preview | live sample card | — | Top border in the brand color. Text "Preview" and "Tax Invoice — <font>" in the chosen font |

**Sub-card "Receipt Print Layout"** ("ERP-level fields and compliance toggles for every printout"). The toggles sit in a 2-column grid of bordered tiles; each tile has a label, an optional grey caption, and a switch on the right.

| Label | Type | Options | Notes |
|---|---|---|---|
| Show Logo | toggle | — | Default **ON** |
| Show Tax ID (GST / NTN) | toggle | — | Default **ON** |
| Show Customer Info | toggle | — | Default **ON** |
| Show MRP Column | toggle | — | Default **ON** |
| Show Savings | toggle | — | Default **ON**. "Total amount saved on bill" |
| Amount in Words | toggle | — | Default **ON** |
| Terms & Conditions | toggle | — | Default **ON**. Prints the T&C text below |
| QR Code (Scan & Pay) | toggle | — | Default off |
| Show Previous Balance / Ledger | toggle | — | Default off. "Credit / udhar running balance on invoice" |
| Show Bank Details | toggle | — | Default off. "Wire transfer instructions for B2B" |
| Show Salesman / Cashier Name | toggle | — | Default **ON** |
| Show Digital Signature Line | toggle | — | Default off. "Space for physical stamp or signature" |
| QR Code Type | select | Standard Link, Payment UPI, Tax Authority Compliant | Default Standard Link. Full-width tile. "Payload format when QR Code is enabled" |

**Sub-card "Print Automation"** ("Rules for silent printing after save or checkout"). Two tiles side by side:

| Label | Type | Options | Notes |
|---|---|---|---|
| Auto-Print on Save | toggle | — | Default off. "Send to printer immediately after invoice is saved" |
| Default Print Copies | number | — | Default 1. "1 = Customer · 2 = Customer + Merchant · 3 = Logistics". Four small grey icons follow the input (printer, grid, scan, sparkle); their purpose is unclear, possibly print-target shortcuts |

**Group "Document Numbering & Legal Text"** ("Server-synced fields shown on all invoice templates"):

| Label | Type | Options | Notes |
|---|---|---|---|
| Invoice Prefix | text | — | Half width. Seeded value `INV-` (sales show `INV-0001`) |
| Purchase Prefix | text | — | Half width. Seeded value `PUR-` |
| Invoice Footer / Thank You | text | — | Full width. A seeded thank-you sentence |
| Terms & Conditions | text | — | Full width. A seeded one-line returns policy. Printed when the T&C toggle is on |

Button: `Save`.

#### Tab: Localization

Sub-title "Currency, language, timezone, and inventory alert preferences".

| Label | Type | Options | Notes |
|---|---|---|---|
| Currency Symbol | text | — | e.g. `Rs`. Used as the prefix on every amount |
| Currency Code | text | — | ISO code, e.g. `PKR` |
| Language (default) | select | English, اردو | Default UI language; the top-bar toggle switches per session |
| Timezone | text | — | IANA name, e.g. `Asia/Karachi` (free text; a searchable select is better) |
| Expiry Reminder (days) | number | — | e.g. 30. Drives the Reminders "Expiring Soon" window (inferred) |

Button: `Save`.

**Behaviours / rules:**

- Company Profile fields and the logo print on receipts, invoices and report headers.
- Receipt & POS split storage: template, brand, layout toggles and print automation are **stored per device** ("persist locally on this device"), so each counter or printer can differ. Prefixes and legal text are **server-synced** for the tenant.
- Invoice numbering = Invoice Prefix + zero-padded running number (e.g. `INV-0001`). Purchases use Purchase Prefix the same way. (inferred)
- "Show Previous Balance / Ledger" prints the customer's khata balance before and after the bill. (inferred)
- Default Print Copies sets how many copies auto-print (1 customer, 2 + merchant, 3 + logistics).
- **No fiscal-year or week-start setting exists**, even though reports offer a "Fiscal Year" preset. Add one in our build (open question).
- RTL layout is needed when اردو is chosen (inferred).

**Screenshots:** `34-settings.png`, `gaps/t-settings.png`, `forms/f36-settings--Receipt-POS.png`, `gaps/f24-settings--Receipt-POS.png`, `forms/f37-settings--Localization.png`, `gaps/f25-settings--Localization.png`

---

### Database Backups (`/administration/backups`)

- **Purpose:** show storage use, download a full JSON backup of the shop's data, and import (merge) records from a backup file.

**Layout** (centered column; the whole page fits in 900px):

1. **Header:** database icon tile + H1 `Database Backups`, sub-title "Enterprise-grade data protection and recovery controls".
2. **Card "Database Health & Storage"** ("Live storage allocation — 2.5D depth view"):
   - Left: donut, center `STORAGE` / `<x>% Used`.
   - Right: legend rows with progress bars: `Used Space` <x>% (indigo bar) and `Free Space` <y>% (green bar).
   - Status line: "Database is healthy. Recommended to schedule regular backups."
3. **Two cards side by side:**

**Download Backup** (download icon):
- Description: "Download a full copy of your business data or import records from a backup file."
- Green info box (shield icon): "Creates a full JSON snapshot of products, sales, parties, and configuration. Store offline in a secure location."
- Full-width button `Download Backup`.

**Import Backup** (upload icon):
- Description: "Choose a .json backup file. Existing records (same name, SKU, username, etc.) are skipped; new records are added."
- Amber warning box: "Import merges new records only. Existing records with matching identifiers are skipped — review the file before importing production data."
- `Choose file` button.

**Actions:**

| Button | Effect |
|---|---|
| `Download Backup` | Generates and downloads a `.json` file of all tenant collections (products, sales, parties, settings, etc.) |
| `Choose file` | Opens a file picker (accept `.json`), then runs the import (inferred: show a confirm step and a result summary of added / skipped counts) |

**Forms:**

| Label | Type | Options | Notes |
|---|---|---|---|
| Choose file | file | — | `.json` only |

**Behaviours / rules:**

- The backup is a full JSON snapshot scoped to the current tenant.
- Import is **merge-only, never destructive**:
  - A record whose natural key matches an existing one is skipped. Keys: name for categories, brands and units; SKU or barcode for products; username or email for users; invoice no. for sales (inferred).
  - Only new records are inserted. There is no "restore and overwrite".
- Storage % compares used DB size with the plan quota. (inferred)
- Should be restricted to Admin, or to users with `settings.manage`. (inferred)
- "Recommended to schedule regular backups" hints at a future scheduled or auto backup (not present).

**Screenshots:** `35-administration-backups.png`, `gaps/t-administration-backups.png`

---

## Cross-screen accounting model (inferred, for our build)

Data collections seen in the reference's network log: `payments`, `ledger_entries`, `banks`, `bank_transactions`, `capital_transactions`, `cheques`, `expenses`, `expense_categories`, `taxes`, `settings`, `users`, `parties` (type `customer` | `vendor`), `sales`, `sale_items`, `sale_returns`, `purchases`. The app also reads a `financial-setup` record (opening capital and cash).

| Event | Party ledger | Treasury account | P&L / Equity |
|---|---|---|---|
| Cash sale | — | + Cash in Hand (Type `Sale`) | Revenue, COGS |
| Credit (udhaar) sale | + customer receivable | — | Revenue, COGS |
| Payment In (customer) | − receivable | + Cash/Bank | — |
| Purchase on credit | + vendor payable | — | (inventory) |
| Payment Out (vendor) | − payable | − Cash/Bank | — |
| Expense | — | − paying account | Expense (by category) |
| Cheque recorded | — (Pending) | — | — |
| Cheque cleared | ± party | ± selected bank | — |
| Cheque bounced | due restored | — | — |
| Transfer | — | − From, + To (contra) | — |
| Capital Injection | — | + selected account | + Capital |
| Owner Drawing / Dividend | — | − selected account | − Retained earnings |
| Opening setup | — | opening balance on Cash | Capital Injection `SETUP` |

- Receivables (Udhaar) = Σ customer balances. Payables (To Pay) = Σ vendor balances. These feed Reports › Financial & Khata, Reminders and the aging chart.
- **Figure mismatches in the reference.** Our build should avoid all of these:
  - P&L COGS appears to use carton cost against pieces sold, giving about −2800% margins.
  - Capital "net profit" equals cash sales rather than P&L net profit, and opening cash from setup is missing from the Cash in Hand balance.
  - Reminders "Inventory Value at Risk" excludes variant SKUs that Reports › Inventory "Stock Valuation" includes.
  - "Total Units" is shown as an unrounded float.
- Net profit and stock valuation should each come from **one engine**, reused by every screen.

## Open questions / gaps in the captures

- Not captured:
  - Reports › Inventory sub-tabs other than Analytics Overview (`Current Stock & Value`, `Low-Stock Report`, `Expiry Report`, `Non-Moving Items`).
  - The lower part of Reports › Financial & Khata (its sub-tab content), which has only a viewport capture.
- Row actions for Payments, Cheques, Taxes and the Customer/Supplier dues panels were not captured, because these tables have no rows. The same applies to any account detail view.
- Most report sub-tabs in the reference are placeholders ("Coming next…" or "Scaffold ready…"). Their columns above are our proposal.
- The meaning of the four small icons next to "Default Print Copies" is unclear.
- Where the Master PIN is set and reset is not shown.
- No fiscal-year or week-start configuration was found.
- The Health Score formula is unknown.
