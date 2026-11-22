## App shell & design

Sources: the read-only captures in `reference/khatapos/`. These are the page captures `00`–`06` and the form captures `forms/f01`–`f09` and `forms/f60`–`f71`. For the sidebar only, `07-products`, `27-payments` and `33-users` were also checked, to see the other groups expanded.

A second pass added **full-height** page captures in `gaps/`: `t-dashboard`, `t-pos`, `t-sales`, `t-sales-return`, `t-purchases` and `t-purchase-return`.

- The `00`–`06` and form screenshots are 1440×900 viewports.
- The `gaps/t-*.png` captures cover the whole scroll height: the dashboard is 1927px and the POS is 3244px. The four list pages fit within 900px.
- So every part of these six pages has now been seen. Only the dialogs and drawers are still limited to the viewport.

Business data (shop, product, customer and person names, addresses, amounts) is left out, except as short format examples. Placeholders such as `<Shop name>` and `<App name>` stand in for them.

Hex colours were sampled from the screenshots. They match the Tailwind palette, so Tailwind names are given next to them.

---

#### Overall look

- **Style.** Light, airy "soft enterprise" look:
  - warm off-white canvas and white cards with hairline borders;
  - very soft shadows, generous whitespace and rounded corners everywhere;
  - an **indigo** accent for navigation state and grand totals;
  - a **neutral warm-grey primary button** colour, which is the current "theme palette";
  - semantic **green / red / amber** for money values.
- **Font.** System UI stack: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Body text is ≈ `#1A1A1A`. The receipt/invoice preview uses a **monospace** font.
- **Icons.** Thin outline line icons (Lucide style), 16–18px, in nav items, buttons, KPI badges and empty states.
- **Density.** Medium:
  - nav items ≈ 44px tall;
  - table rows ≈ 57px;
  - inputs ≈ 36–40px; big POS inputs/buttons ≈ 64px.
- **Watermark.** Faint, widely letter-spaced product-name text in the bottom-right of the content area on every page. Replace it with our own or drop it.

**Colour tokens (as observed)**

| Token | Value | Where |
|---|---|---|
| Canvas (login body) | `#F0F0EE` | Login page background base (from JSON) |
| Login gradient | `#FEFEFE` → `#A2A29D` | Login background, top-left to bottom-right |
| Content background | `#FAFAFA` | Main content area of app pages |
| Top bar background | `#F1F1EF` | Header strip; also the background of the top-bar icon buttons |
| Sidebar background | `#FFFFFF` (near-white) | Sidebar |
| Card | `#FFFFFF`, 1px border ≈ `#E5E7EB` (gray-200) | All cards, panels, tables |
| Row divider | `#F1F5F9` (slate-100) | Table row borders |
| Table header bg / text | `#F9FBFD` / `#8F9BAC` (slate-400) | Uppercase column headers |
| Primary button | `#83837D` bg, white text | New Sale, Search, Charge, Add to cart, Close, active segments, selected chip |
| Primary disabled | `#B5B5B1` | Charge when cart empty, Save/Add to cart before valid |
| Accent | indigo-500 `#6366F1` (bars, dots), indigo-600 `#4F46E5` (active nav text), indigo-700 `#4338CA` (Sales KPI value, selected dropdown item) | Navigation state, POS **Total** |
| Accent tint | `#F1F5FF` / `#F5F7FF` | Active nav item background, Sales KPI card gradient |
| Success | emerald-50 `#ECFDF5` bg, emerald-600/700 `#059669` / `#047857` text | Live pill, Completed badge, positive deltas, revenue values, Cash & Bank |
| Danger | red-600 `#DC2626` | Negative money, Expenses, Payable, "Clear cart" icon |
| Destructive button | rose-600 `#E11D48` (approx.) | "Process Full Return" |
| Warning | amber-600 `#D97706` (Due), amber-700 `#B45309` (Receivable), orange (Remaining Balance / Due (Credit)) | Outstanding amounts |
| Muted text | gray/slate-500 | Subtitles, captions, placeholders |

**Radius, spacing, type**

- **Radius:**
  - cards ≈ 12px;
  - inputs and buttons ≈ 8px;
  - chips, badges and pills fully rounded;
  - centred modals ≈ 16px;
  - login card ≈ 24px;
  - top-bar icon buttons ≈ 8px (36×36).
- **Spacing:**
  - sidebar 256px fixed width;
  - top bar 64px;
  - content padding 24px;
  - card gaps 16px on list pages and 24px on the dashboard KPI grid;
  - card inner padding 20–24px.
- **Type scale:**

  | Element | Style |
  |---|---|
  | Page H1 | ≈ 24px bold (dashboard greeting ≈ 28px) |
  | Page subtitle | 14px muted |
  | Card title | 16px semibold |
  | KPI value | ≈ 24–26px bold, coloured by meaning |
  | Table body | 14px |
  | Table headers and eyebrow labels | 11–12px, uppercase, letter-spaced, semibold, muted |

  Examples of eyebrow labels: "DATE RANGE", "ACTION CENTER", "CUSTOM RANGE", "SELECT UNIT", "ACTIVE TAXES", and the drawer/dialog field labels.

**Formats**

- **Money:** `Rs 2,575.35`. That is a "Rs " prefix, thousands separators and 2 decimals.
  - Negative values: `Rs -1,234.56`.
  - Signed cashflow: `+Rs 1,000.00` / `−Rs 1,000.00`.
  - A zero due in tables shows `—`.
  - Some labels drop the decimals, e.g. "Line total: Rs 480" and "@ 4,800 / Ctn".
- **Dates:**
  - tables: `21 Nov 2026, 11:13 am`;
  - dashboard eyebrow: `SATURDAY, 21 NOVEMBER 2026`;
  - date inputs: `dd/mm/yyyy`;
  - receipt: `21/11/2026, 11:13:12` plus time `11:13 am`.
- **Quantities:** stock can be fractional, up to 3 decimals (e.g. "9.867 in stock"). Cart quantity shows 2 decimals for weighed lines (e.g. `0.10`).

---

#### Layout frame

- A fixed, full-height **left sidebar** (256px). To its right, a column with:
  - a sticky **top bar** (64px, bottom border);
  - a **scrollable content area**.
- The POS page uses the same frame. Its cart panel ("Current Sale") is docked at the right edge of the content area.

#### Sidebar

- **Header** (64px, bottom border): small square logo tile, then the **shop name** (16px semibold).
- **Navigation:**
  1. Top-level links with icons: **Dashboard** and **POS Terminal**.
  2. A thin divider.
  3. Collapsible groups. Each group header has an icon, a label (14px semibold) and a chevron on the right (down when collapsed, up when expanded).

| Group (icon) | Items → route |
|---|---|
| Dashboard (grid/layout icon) | `/dashboard` (top-level link) |
| POS Terminal (shopping-cart) | `/pos` (top-level link) |
| **Sales** (trending-up) | Sales → `/sales`; Sales Return → `/sales-return` |
| **Purchasing** (shopping-bag) | Purchases → `/purchases`; Purchase Return → `/purchase-return` |
| **Inventory** (package/box) | Products → `/products`; Categories → `/categories`; Brands / Companies → `/brands`; Units → `/inventory/units`; Colors → `/inventory/colors`; Sizes → `/inventory/sizes`; Print Barcodes → `/inventory/barcodes` |
| **Parties** (users) | Customers → `/customers`; Vendors → `/vendors` |
| **Reports** (bar-chart) | Reports → `/reports`; Profit & Loss → `/reports/profit-loss`; Product Performance → `/reports/product-performance`; Reminders → `/reminders` |
| **HRM & PAYROLL** (users) | HR Dashboard (grid) → `/hrm/dashboard`; Employees (users) → `/hrm/employees`; Attendance & Shifts (clock) → `/hrm/attendance`; Leave Management (calendar) → `/hrm/leaves`; Payroll & Advances ($) → `/hrm/payroll`; Recruitment (briefcase) → `/hrm/recruitment`; Performance & Assets (star) → `/hrm/performance` |
| **Finance** (wallet) | Payments In/Out → `/payments`; Capital & Equity → `/finance/capital`; Banks & Cash → `/banks`; Cheques → `/cheques`; Expenses → `/expenses`; Taxes & Duties → `/finance/taxes` |
| **Administration** (gear) | Users → `/users`; Settings → `/settings`; Database Backups → `/administration/backups` |

- **Sub-items:**
  - indented ≈ 40px, 14px regular, with **no icons**;
  - a thin vertical guide line on the left joins the children of a group.
  - HRM & PAYROLL is the exception: its children have icons.
- **Active state:**
  - the active item has a pale indigo background (`#F1F5FF`), radius 8, indigo-600 text and a 3px indigo-500 bar on its left edge;
  - the **parent group header** of the active page gets the same tint, bar and indigo text, and is expanded.
- **Accordion (inferred).** Only one group appears open at a time, and the group that holds the current route opens automatically:
  - on `/sales`, Sales is open and HRM is closed;
  - on `/products`, Inventory is open;
  - on `/dashboard`, HRM & PAYROLL was open.
- **HRM & PAYROLL special styling:**
  - always drawn as a bordered "module card": 1px indigo-100 border, radius 12, and a faint indigo-to-mint gradient background;
  - label in UPPERCASE indigo;
  - when expanded, its children (with icons) render inside the card;
  - this looks like a highlighted or add-on module (inferred).
- **Scroll.** The nav list scrolls on its own. The header and the user card stay fixed.
- **User card** (pinned to the bottom, top border):
  - circular avatar with the user's initial (grey background);
  - user name (14px semibold) with the role under it (12px muted, e.g. "Admin");
  - a full-width outlined **Sign out** button that ends the session and returns to `/login`.

#### Top bar

- **Left:** shop name in muted grey, 14px. It is the same on every page and acts as a context label.
- **Right, in order:**
  1. **"Live / Online"** status pill: green dot and green text on an emerald-50 background, with an emerald border, fully rounded.
     - It shows the connection/sync state (inferred).
     - An offline state probably exists. The app polls a desktop/status endpoint, and the dashboard has an "All data synced" health item.
  2. **Language toggle**, a segmented control: **English** | **اردو**.
     - The active segment is filled with the primary grey and has white text; the other is transparent on the top-bar grey.
     - Choosing اردو should switch the UI to Urdu and RTL (inferred).
  3. **Night mode** icon button: sun icon, accessible name "Switch to night mode". Toggles the dark theme.
  4. **Theme Palette** icon button: palette icon. Opens a colour/palette picker that changes the primary colour (inferred; not captured).
  - Both icon buttons are 36×36 with a 1px border and radius 8.

#### Shared components and patterns

- **Page header:** H1, then a one-line muted description, with the primary action button on the right.
- **Stat card:** white card holding a label (14px muted) and a large value coloured by meaning (neutral count, green revenue, amber due).
- **List card header:** title on the left ("Recent Purchases", "Recent Returns") and "`N` records" muted on the right.
- **Tables:**
  - uppercase header row on a tinted background;
  - sortable headers show a small chevron, and the active sort chevron is darker;
  - checkbox column for bulk select;
  - money columns right-aligned;
  - a kebab (⋮) button per row opens an action menu;
  - empty state is centred muted text inside the table body.
- **Status badge:** pill with a leading dot, e.g. **Completed** in green on emerald-50.
- **Buttons:**
  - primary: filled warm grey, white text, optional leading icon such as "+";
  - secondary: white, 1px border, optional icon;
  - destructive: rose filled;
  - small ghost/icon buttons.
- **Keycap hint:** a small bordered key label inside an input or button, e.g. `F1`, `F2`, `F9`.
- **Segmented controls:** Visual / Touch ↔ Retail / Barcode; Walk-in Customer ↔ Credit (Udhar); % ↔ Rs; English ↔ اردو.
- **Centred modal:** white, radius 16. The backdrop is dimmed and **blurred**.
- **Right drawer:**
  - ≈ 448px wide, full height, slides over the page with a dimmed backdrop;
  - header with title, subtitle and ✕;
  - sticky footer with Cancel and Save.
- **Dropdown popover:** white with a soft shadow. The selected option is tinted indigo, with indigo text and a dot on the right.
- **Toast:** bottom-right, red-tinted for errors (e.g. "Failed to fetch").

#### Keyboard shortcuts seen

| Key | Where | Action |
|---|---|---|
| F1 | POS search box | Focus "Search / Barcode / Formula" (inferred from keycap) |
| F2 | POS customer box (Credit mode) | Focus the credit-customer search (inferred from keycap) |
| F9 | POS Charge button | Charge / complete the sale (inferred from keycap) |

#### Data model hints (inferred from the captured network calls)

- **Collections read by these screens:**
  - `settings`, `products`, `categories`, `brands`, `units`, `colors`, `sizes`;
  - `parties`, with `type` = `customer` | `vendor`;
  - `sales`: held carts are stored as sales with `status = "held"`;
  - `sale_items`;
  - `sale_returns`: the list fetches the latest 15, ordered by id descending;
  - `purchases`, ordered by id descending;
  - `payments`, `ledger_entries`, `banks`, `bank_transactions`, `cheques`, `capital_transactions`;
  - `expenses`, `expense_categories`, `taxes`, `users`.
- **Other endpoints:** auth session / me / access. "access" is checked on every page, which implies per-page permissions. Also: dashboard stats, a POS catalog endpoint, and tenant financial setup.

---

### Login (`/login`)

- **Purpose:** sign a tenant user into their shop workspace with email and password.

**Layout**

1. Full-viewport soft diagonal gradient background, from white at the top-left to warm grey at the bottom-right.
2. **Top-right:** two icon buttons, **night mode** (sun) and **Theme Palette**. These are the same controls as in the app top bar.
3. **Centred card** (≈ 448px wide, radius ≈ 24px, soft shadow, translucent off-white), top to bottom:
   - square logo tile (≈ 112px);
   - heading **"Welcome to `<App name>`"** (≈ 24px bold);
   - subtitle **"Secure workspace · Tenant login"** (muted);
   - **EMAIL** label (uppercase, small, letter-spaced) and input;
   - **PASSWORD** label and input, with an eye icon button inside on the right;
   - full-width **Sign In** button (primary grey, ≈ 48px tall).
4. **Footer** at the bottom centre: "© 2026 `<App name>`" (muted, 13px).

**Actions**

| Control | What it does |
|---|---|
| Show password (eye icon) | Toggles the password field between masked and plain text. |
| Sign In | Authenticates, creates a server session, then redirects to `/dashboard`. |
| Switch to night mode | Toggles the dark theme. |
| Theme Palette | Opens the palette picker. |

#### Form: Sign in

| Label | Type | Options | Notes |
|---|---|---|---|
| EMAIL | text (email) | — | Placeholder `you@example.com`; required (inferred) |
| PASSWORD | password | — | Placeholder `••••••••`; eye toggle "Show password"; required (inferred) |

**Behaviours**

- Multi-tenant ("Tenant login"). The email decides which shop/tenant opens, and there is no separate shop field (inferred).
- Sign In is drawn muted, which looks disabled, until both fields are filled (inferred from the greyed button in an empty form).
- After login, the shop name appears in the sidebar and top bar, and the user's name and role appear in the user card.

**Screenshots:** `00-login.png`

---

### Dashboard (`/dashboard`)

- **Purpose:** business overview for a chosen period, with sales, profit, purchases, expenses, live balances, quick actions, trends, cashflow, low stock and health checks.

**Layout (top to bottom)**

1. **Header row**
   - **Left:**
     - eyebrow date, e.g. "SATURDAY, 21 NOVEMBER 2026" (uppercase, letter-spaced, muted);
     - H1 greeting **"Good Morning, `<Shop name>`"**. The greeting follows the time of day: a later capture shows "Good Afternoon".
   - **Right:** **DATE RANGE** picker button. This is a white card-button with:
     - a calendar icon in an indigo-tinted square;
     - the eyebrow "DATE RANGE" above the current value, e.g. "This Month";
     - a chevron.
2. **KPI row 1:** two wide hero cards, each half the width, with gradient tints.
3. **KPI row 2:** four cards.
4. **KPI row 3:** three cards. The fourth slot is empty.
5. **ACTION CENTER** card, full width:
   - eyebrow title "ACTION CENTER" on the left and "Core ledger actions" (muted) on the right;
   - a row of pill buttons, each with a coloured circular icon.
6. **Charts row:** two cards, both ≈ 330px tall.
   - **Revenue & Profit Trend:** wide card, ≈ 2/3 width.
   - **Sales by Category:** ≈ 1/3 width.
7. **Bottom row:** three equal-width cards, top-aligned, each as tall as its content.
   - **Cashflow Activity**
   - **Low Stock Alert**
   - **Action Items & Health**

**KPI cards**

| Card | Figure shown | Styling | Extra line(s) |
|---|---|---|---|
| Sales & Revenue | Sales total for the period | Indigo-tinted gradient card, indigo value, trending-up icon in an indigo circle | "`N` sales · Rs `X` volume"; delta "↗ +100% vs last period" (green) |
| Net Profit | Net profit after expenses for the period | Mint/green-tinted gradient card; value **red when negative**; $ icon in a green circle | "Net profit after expenses for selected period"; delta line |
| Purchases | Purchases total for the period | White card, dark value, package-plus icon in a grey circle | "↗ No change vs last period" (green) |
| Expenses | Expenses total for the period | Red value, receipt icon in a red circle | "↘ No change vs last period" (red; expenses are coloured inversely) |
| Receivable **LIVE** | Current total owed by customers | Amber/brown value, banknote icon in an amber circle; green "LIVE" badge next to the label | — (no delta) |
| Payable **LIVE** | Current total owed to vendors | Red value, receipt icon in a red circle; "LIVE" badge | — |
| Gross Profit | Gross profit for the period | Value red when negative, green otherwise; $ icon in a green circle | Delta line |
| Total Revenue | Revenue for the period | Green value, trending-up icon in a green circle | Delta line |
| Cash & Bank **LIVE** | Current cash plus bank balance | Green value, wallet icon in a green circle; "LIVE" badge | — |

**Charts and lists**

- **Revenue & Profit Trend**
  - Card header: title "Revenue & Profit Trend" and the muted subtitle "Daily revenue and net profit for the selected period".
  - **Smooth (curved) line chart with two series and no legend:**
    - **revenue**: indigo/violet line, with a very faint violet area fill under it;
    - **net profit**: green line, which dips below zero on loss days.
  - **Y axis** on the left with compact money ticks: "20k", "0", "-20k", "-40k", "-60k". The scale extends below zero to fit negative profit.
  - Light **dashed horizontal gridlines**; no vertical gridlines; no axis lines.
  - **X axis:** one point per day of the period, labelled every 2nd day ("1 Nov", "3 Nov" … "21 Nov").
  - The hover tooltip was not captured.
- **Sales by Category**
  - Card header: title and the muted subtitle "Category mix for the selected period".
  - **Donut chart:**
    - thick ring, ≈ 160px, with an empty centre (no total label);
    - one segment per category, with small white gaps between segments;
    - segments use soft gradient fills (blue, green, …).
  - **Legend** to the right of the donut: a coloured dot and the category name in uppercase, truncated with an ellipsis when long. No values or percentages are shown.
- **Cashflow Activity**
  - Header: title on the left, muted link **View ledger** on the right → `/payments`.
  - Rows are separated by dividers (5 shown). Each row has:
    - a round tinted icon: green circle with a down-arrow for "Payment In", red circle with an up-arrow for "Payment Out";
    - the title ("Payment In" / "Payment Out", 14px medium), with a muted sub-line "`<party>` · `<method or kind>`" (e.g. "· Cash", "· Card", "· Bank", "· Vendor", "· Expense");
    - a signed amount, right-aligned and semibold: green "+Rs …" or red "−Rs …".
- **Low Stock Alert**
  - Header: title only.
  - Up to 10 rows separated by dividers. Each row has:
    - the product name on one line, truncated with an ellipsis;
    - a muted sub-line with the status, e.g. "Out of stock";
    - a small red-tinted pill with the current quantity (e.g. "0");
    - a small primary-grey **Reorder** button with a refresh/rotate icon → `/purchases`.
- **Action Items & Health**
  - Header: title only.
  - Checklist rows separated by dividers:
    - items that are fine have a **green check-circle** icon, e.g. "All data synced", "No overdue vendor payments", "No pending receivables";
    - items that need attention have an **amber warning-triangle** icon, e.g. "`N` products need restocking".

**Actions**

| Control | Opens / does |
|---|---|
| DATE RANGE button | Opens the date-range popover (see form below). |
| New Sale | `/pos` |
| Payment In | `/payments?type=in` |
| Payment Out | `/payments?type=out` |
| Add Expense | `/expenses` |
| Add Product | `/products` |
| View ledger | `/payments` |
| Reorder (per low-stock row) | `/purchases` (probably to start a PO for that item; inferred) |

Action Center icon colours:

| Button | Icon | Colour |
|---|---|---|
| New Sale | cart | indigo |
| Payment In | down-arrow | green |
| Payment Out | up-arrow | red |
| Add Expense | receipt | orange |
| Add Product | package | blue |

#### Form: Date range popover (opened from DATE RANGE)

- Right-aligned dropdown card under the button. The button's chevron flips up while it is open.
- Preset list at the top. The selected preset has an indigo-tinted background, indigo text and an indigo dot on the right.
- A divider separates the presets from the "CUSTOM RANGE" section with two date inputs side by side.

| Label | Type | Options | Notes |
|---|---|---|---|
| (preset list) | radio-style list | Today, This Week, This Month, Last 30 Days, This Year | Default **This Month** |
| CUSTOM RANGE: From | date | — | Defaults to the start of the current preset (e.g. 01/11/2026) |
| CUSTOM RANGE: To | date | — | Defaults to today |

**Behaviours**

- The period-based cards (Sales & Revenue, Net Profit, Purchases, Expenses, Gross Profit, Total Revenue), the trend chart and the category chart all follow the date range.
- Cards marked **LIVE** (Receivable, Payable, Cash & Bank) are point-in-time balances that ignore the range (inferred).
- "vs last period" compares with the previous period of equal length (inferred). It shows "+100%" when the previous period was zero and "No change" when both are equal.
- Money colours follow meaning:
  - revenue and cash are green;
  - expenses and payable are red;
  - receivable is amber;
  - profit is red when negative.
- The low-stock list shows products at or below their reorder level, capped at 10 rows. The health line counts them, e.g. "10 products need restocking" (inferred).

**Screenshots:** `01-dashboard.png`, `gaps/t-dashboard.png` (full height), `forms/f60-dashboard--This-Month.png`

---

### POS Terminal (`/pos`)

- **Purpose:** the fast checkout screen. The cashier:
  - finds products by touch grid, barcode list or search;
  - builds the cart, including multi-unit and weighed-by-amount lines;
  - picks a walk-in or credit (Udhar) customer;
  - applies a discount and tax;
  - takes a single or split payment;
  - then charges, holds or prints an estimate.

**Layout**

The page has two columns inside the content area:

- **Left:** product browser, about 60% of the width.
- **Right:** **Current Sale** panel, ≈ 450px. White, full height, with a 1px left border `#E5E7EB`.

**Left column, top to bottom**

1. **Header row**
   - H1 **"POS Terminal"**.
   - Segmented control **Visual / Touch** | **Retail / Barcode**. The active segment is filled primary grey; the default is Visual / Touch.
   - Outlined button **View Held Sales**.
2. **Search bar** (full width)
   - Placeholder "Search / Barcode / Formula".
   - Keycap **F1** at the right end.
3. **Category chips** (wrapping rows of pill buttons)
   - **All** comes first and is selected by default (filled primary grey).
   - Then one chip per category: uppercase 12px, outlined, white.
   - Single-select filter.
4. **Visual / Touch mode: product tile grid**
   - 5 columns at 1440px; each tile ≈ 120×250, white, radius 12, 1px border.
   - **Image area** (top ≈ 45%): light grey `#F9FAFB` with a centred outline "box" placeholder icon when the product has no image.
   - **Stock badge** (top-right corner of the image area):
     - **"Out"**: red text on a red-50 pill, when stock is ≤ 0;
     - **"`<qty>` in stock"**: dark text on a white pill with a border. The quantity can be decimal, e.g. "9.867 in stock".
   - **Name:** uppercase, ≈ 16px, at most 2 lines, then an ellipsis.
   - **Sub-line:** category name (small, uppercase, muted). Variant products, such as colour variants listed as "Name (Variant)", show **"—"** instead.
   - **Price:** bold, e.g. "Rs 600.00". Unpriced items show "Rs 0.00".
   - Out-of-stock tiles are drawn faded (greyed name and price).
   - The last tapped or hovered tile gets a darker border and a shadow.
   - The grid renders the **whole filtered catalogue in one scroll**, with no pagination and no "load more". The full-height capture shows every product, 5 per row, ending in a partial last row.
5. **Retail / Barcode mode: compact product table** (replaces the grid; search and chips stay)
   - Columns: **SKU / BARCODE** (monospace, muted), **NAME**, **PRICE** (right-aligned), **STOCK** (right-aligned; "0" in red when out).
   - Out-of-stock rows are muted. In-stock rows use normal dark text.
   - Variant SKUs carry a suffix, e.g. a 12-digit code followed by "BLAC".

**Right column ("Current Sale" panel), top to bottom**

The panel is a white column that runs the full height of the page, with its content stacked at the top. The empty space below the footer buttons stays white.

1. **Panel header**
   - Title **"Current Sale"** (≈ 18px semibold).
   - Gear icon button **POS settings** on the right.
   - When the cart has items, the header also shows:
     - small grey buttons **Hold** (pause icon) and **Print Estimate** (printer icon);
     - a red trash icon button **Clear cart**.
2. **Customer status chip**
   - **"Walk-in"** (grey pill) in walk-in mode.
   - **"Credit (Udhar) — no customer"** (amber text, amber border, cream background) in credit mode before a customer is chosen.
3. **Segmented control:** **Walk-in Customer** | **Credit (Udhar)**. The default is Walk-in Customer.
4. **Customer input**
   - **Walk-in mode:** label "Customer name (receipt only)", then a text input prefilled with "Walk-in Customer".
   - **Credit mode:** search input with placeholder "Customer…" and keycap **F2**, plus a link **+ Add Credit Customer** under it.
5. **Cart lines**
   - Empty state: centred muted "Tap a product to begin".
   - Each line has:
     - **name**: one line, truncated with an ellipsis;
     - **variant label** under the name (e.g. the colour), small and muted;
     - **quantity stepper**: **−** button, quantity, **+** button. Multi-unit items show the unit abbreviation (e.g. "Ctn") under the quantity in tiny muted text;
     - round **W** button (weigh/amount entry);
     - **line total** in bold, e.g. "Rs 480.00";
     - trash icon **Remove item**.
   - Under each line: tiny muted link **+ Note / discount**.
6. **Totals block** (divider above)
   - **Subtotal**, with the value on the right.
   - **Discount**: a mini segmented toggle **%** | **Rs** (Rs active by default), then a number input (placeholder 0, right-aligned).
   - **Tax ⌄**: clickable label with a chevron, and the value on the right. Clicking opens the "ACTIVE TAXES" popover.
   - **Total**: label and value both large (≈ 22px), bold, **indigo**.
7. **Payment box** (gray-50 background, radius 8)
   - Header "Payment", with a pill toggle **Split Payment** on the right.
   - **Single mode** (default): a method select (Cash / Card / Bank), a wide amount input (placeholder 0, right-aligned) and the link **+ Add Payment**.
   - **Split mode:** the pill is filled dark. The box shows three fixed rows, **Cash**, **Card** and **Bank**, each with an amount input. "+ Add Payment" is hidden.
8. **Balance rows**
   - **Paid**: the sum of entered payments.
   - **Remaining Balance**: orange label and value. Shown when the cart has items and Paid < Total.
   - **Due (Credit (Udhar))**: orange. Credit mode only.
9. **Quick-tender chips:** **Exact**, **Rs 500.00**, **Rs 1,000.00**, **Rs 5,000.00** (grey pills).
10. **Footer actions** (three big ≈ 64px buttons)
    - **Hold** (outlined).
    - **Print Estimate** (outlined, two-line label).
    - **Charge Rs `<total>`**: wide primary button with keycap **F9**. It is disabled (pale grey) while the cart is empty.

**Actions**

| Control | Opens / does |
|---|---|
| Visual / Touch | Shows the product tile grid. |
| Retail / Barcode | Shows the SKU/barcode table. |
| View Held Sales | Opens the **Held Sales** right drawer. |
| Search / Barcode / Formula (F1) | Filters products by name, SKU, barcode or "formula". A scanned barcode adds the item (inferred). |
| Category chip | Filters the grid or table to that category; **All** clears the filter. |
| Product tile or row (normal product) | Adds 1 to the cart at once. Tapping again adds 1 more (inferred). |
| Product tile (weighed / loose product) | Opens the **Weighed sale** dialog. |
| POS settings (gear) | Opens POS preferences (not captured). |
| Hold (header or footer) | Parks the current cart on the server as a held sale and clears the screen (inferred). |
| Print Estimate (header or footer) | Prints a quotation/estimate of the cart without recording a sale (inferred). |
| Clear cart (red trash) | Empties the cart. |
| Walk-in Customer / Credit (Udhar) | Switches the customer mode. |
| Customer… (F2) | Searches credit customers in the parties list. |
| + Add Credit Customer | Quick-adds a new customer (dialog not captured). |
| − / + | Decrease or increase the line quantity. |
| W | Re-opens the amount/weight entry for the line (inferred). |
| Remove item | Deletes the line. |
| + Note / discount | Adds a line note or line discount (editor not captured). |
| % / Rs | Sets the bill discount as a percentage or a fixed amount. |
| Tax ⌄ | Opens the **ACTIVE TAXES** popover. |
| Split Payment | Switches the payment box between single-method and Cash/Card/Bank split. |
| + Add Payment | Adds another method + amount row (inferred). |
| Exact | Sets the paid amount to the bill total (inferred). |
| Rs 500.00 / Rs 1,000.00 / Rs 5,000.00 | Quick cash tender amounts (inferred). |
| Charge Rs `<total>` (F9) | Completes the sale (see Behaviours). |

#### Form: Weighed sale dialog (tap a weighed product tile)

- Centred modal, ≈ 670px wide, radius 16, with the blurred backdrop.
- **Header:**
  - left: product name (≈ 18px bold) and subtitle **"Weighed sale @ `<base price>` / `<base unit>`"**, e.g. "@ 4,800 / Ctn";
  - right: **SELECT UNIT** select.
- **Body:** two large inputs side by side (≈ 64px tall, 24px text).
- **Footer band** (gray-50):
  - left: muted "Quantity auto-calculated";
  - right: bold **"Line total: Rs `<n>`"**;
  - buttons **Cancel** (outlined) and **Add to cart** (primary; disabled until the amount is greater than 0).

| Label | Type | Options | Notes |
|---|---|---|---|
| SELECT UNIT | select | `<Base unit> (base)`; `<Sub-unit> (1 <Base> = <n> <Sub>)`, e.g. "Ctn (base)", "Dzn (1 Ctn = 30 Dzn)" | Defaults to the base unit |
| TOTAL AMOUNT (RS) | number | — | Placeholder 0; autofocused; spinner arrows |
| QUANTITY (`<UNIT>`) | number | — | Placeholder 0. **Auto-calculated** = amount ÷ unit price, e.g. 480 ÷ 4,800 = 0.1. The label follows the selected unit, e.g. "QUANTITY (CTN)" (inferred). Typing a quantity may fill the amount in reverse (inferred). |
| Line total | read-only text | — | "Line total: Rs 0" → "Line total: Rs 480" |

After **Add to cart**, the line appears in the cart with quantity `0.10`, unit "Ctn" and total "Rs 480.00". "Remaining Balance Rs 480.00" also appears.

#### Form: ACTIVE TAXES popover (click "Tax ⌄")

- Floating card that opens **upward** over the Subtotal and Discount rows. The chevron flips up while it is open.
- Eyebrow "ACTIVE TAXES", then the list of taxes configured in Settings.
- Empty state: "No taxes configured. Add them in Settings."
- No inputs. It is read-only, or possibly lets you toggle taxes per sale (inferred).

#### Form: Payment (inline, single vs split)

| Label | Type | Options | Notes |
|---|---|---|---|
| (method), single mode | select | Cash, Card, Bank | Default Cash |
| (amount), single mode | number | — | Placeholder 0 |
| + Add Payment | link | — | Adds another payment row (inferred) |
| Split Payment | toggle (pill) | — | Off by default; when on, it is filled dark |
| Cash, split mode | number | — | Placeholder 0 |
| Card, split mode | number | — | Placeholder 0 |
| Bank, split mode | number | — | Placeholder 0 |
| Paid | read-only | — | Sum of the amounts |
| Remaining Balance | read-only | — | Total − Paid, in orange |
| Due (Credit (Udhar)) | read-only | — | Credit mode only; the amount posted to the customer's account |

#### Form: Customer section (inline)

| Label | Type | Options | Notes |
|---|---|---|---|
| Walk-in Customer / Credit (Udhar) | segmented toggle | Walk-in Customer, Credit (Udhar) | Default Walk-in Customer |
| Customer name (receipt only) | text | — | Walk-in mode; prefilled "Walk-in Customer"; printed on the receipt only |
| Customer… | text (search/autocomplete) | Customers from parties | Credit mode; keycap F2; required before charging on credit (inferred from "— no customer") |
| + Add Credit Customer | link → dialog | — | Quick-create a customer (not captured) |

#### Form: Bill discount (inline)

| Label | Type | Options | Notes |
|---|---|---|---|
| Discount mode | segmented toggle | %, Rs | Default **Rs** |
| Discount | number | — | Placeholder 0; reduces Subtotal → Total |

#### Drawer: Held Sales (View Held Sales)

- Right drawer, ≈ 448px wide, full height, white, over a dimmed and blurred page.
- Header: title **"Held Sales"** and a close button **✕**. In the screenshot this header row sits hidden under the top bar, but it is present in the DOM.
- Section eyebrow **"SERVER HELD (`<count>`)"**, then the list of held carts.
- Empty state: centred muted "No held sales".
- Clicking a held sale resumes it into the cart (inferred). The "SERVER HELD" label suggests there may also be a local/offline held list (inferred).

**Behaviours and business rules**

- **Multi-unit products.** A product has a **base unit** (e.g. Ctn) and sub-units, each with a conversion factor (e.g. 1 Ctn = 30 Dzn).
  - Price and stock are kept in the base unit.
  - Sub-unit price = base price ÷ factor.
  - Selling in a sub-unit deducts fractional base stock.
  - Evidence: an invoice line of **4 Dzn × 160.00 = 640.00** on a product priced 4,800 / Ctn left stock at **9.867** out of 10 Ctn (10 − 4/30).
- **Weighed / sell-by-amount sale.** For loose or weighed items, the cashier types the **money amount**. The quantity is worked out from the unit price, and the line stores a fractional quantity (2 decimals shown).
- **Normal products** are added at quantity 1 with no dialog. **Variants** (e.g. colours) are separate sellable items. Each variant has its own SKU/barcode suffix, stock and price, and the cart line shows the variant name under the product name.
- **Search** matches name, SKU/barcode and a product "formula" field. The Products page also searches "name / SKU / formula", probably a generic/composition name (inferred).
- **Stock badge** comes from current stock. Whether "Out" items can still be sold was not captured.
- **Bill-level discount** (in % or Rs), plus a **per-line note/discount**.
- **Tax** is the sum of the active taxes set up in Settings (Finance → Taxes & Duties / Settings). It is 0 when none exist.
- **Payment methods** are Cash, Card and Bank. A sale can take several payments, through "+ Add Payment" or **Split Payment**.
- **Walk-in sales** are expected to be paid in full; the orange "Remaining Balance" flags any shortfall (inferred).
- **Credit (Udhar).** The unpaid balance becomes **Due** on the selected customer's ledger (receivable). A customer must be selected first (inferred).
- **Change / overpayment.** When Paid > Total, a "Change" row probably appears (inferred; not captured).
- **Hold** saves the cart as a sale with `status = held` on the server, and **View Held Sales** lists those carts.
- **Charge (F9)** is expected to (inferred):
  - finalise the sale and assign the next invoice number (format `INV-0001`);
  - record the payments to cash, card or bank;
  - deduct stock;
  - post any credit due to the customer ledger;
  - print or show the receipt.
- **Charge button label** always shows the live total, e.g. "Charge Rs 480.00".
- **Keyboard:** F1 focuses search, F2 focuses credit-customer search, F9 charges.

**Screenshots:** `02-pos.png`, `gaps/t-pos.png` (full height, whole catalogue grid), `forms/f01-pos--tile-CLEAR-SACHET-8ML.png`, `forms/f61-pos--tile-CLEAR-SACHET-8ML.png`, `forms/f62-pos--typed-480.png`, `forms/f63-pos--Add-to-cart.png`, `forms/f64-pos--Tax.png`, `forms/f65-pos--Split-Payment.png`, `forms/f66-pos--Credit-Udhar-.png`, `forms/f67-pos--tile-DOVE-SHAMPOO-Black-.png`, `forms/f02-pos--Retail-Barcode.png`, `forms/f03-pos--View-Held-Sales.png`

---

### Sales (`/sales`)

- **Purpose:** the sales ledger, listing every invoice with its status, total and due, plus filters, export and per-invoice actions (view, print, PDF, return).

**Layout (top to bottom)**

1. **Header:** H1 **"Sales"** and the subtitle "Enterprise sales ledger — invoices, payments, and returns in real time."
2. **Stat cards** (3 equal cards):

   | Card | Figure | Colour |
   |---|---|---|
   | Total | Number of invoices in the current filter | Muted grey |
   | Total Revenue | Sum of invoice totals | Green |
   | Due | Sum of outstanding dues | Amber |

3. **Filter bar card**
   - **Left:** search input with a magnifier icon (placeholder "Search by Invoice ID or Customer Name").
   - **Middle:**
     - status select ("All Statuses");
     - under it, a date range: **From** date, an en dash "–", then the **To** date.
   - **Right:** **Export CSV** (outlined, download icon) and **New Sale** (primary, "+" icon).
4. **Table card**

   | Column | Content |
   |---|---|
   | ☐ (select all) | Row checkbox |
   | INVOICE ⌄ | Bold invoice number, e.g. `INV-0001` |
   | DATE ⌄ | Muted, `21 Nov 2026, 11:13 am`. **Default sort**: its chevron is darker |
   | CUSTOMER ⌄ | Name, e.g. "Walk-in Customer" for walk-ins |
   | STATUS ⌄ | Badge, e.g. green "● Completed" |
   | TOTAL ⌄ | Right-aligned, bold |
   | DUE ⌄ | "—" when zero |
   | ACTIONS | ⋮ kebab button ("Actions for INV-xxxx") |

   Nothing sits below the table: the full-height capture shows no pagination or footer (with 3 rows).

**Actions**

| Control | Opens / does |
|---|---|
| Search | Live-filters by invoice ID or customer name. |
| Status select | Filters by status. |
| From / To | Filters by invoice date. |
| Export CSV | Downloads the filtered list as CSV (inferred: respects the filters). |
| New Sale | Goes to `/pos`. |
| Select all / row checkbox | Bulk selection. No bulk toolbar appeared in the captures, but one may show when rows are selected (inferred). |
| Column header | Sorts by that column. |
| ⋮ kebab | Opens the row menu (white popover, shadow, icons). |
| Menu → **View Details** (eye) | Opens the invoice preview modal. |
| Menu → **Print Invoice** (printer) | Prints the receipt/invoice. |
| Menu → **Download PDF** (file-down) | Downloads the invoice as PDF. |
| Menu → **Sales Return** (rotate-ccw) | Starts a return for this invoice, probably by opening `/sales-return` with the invoice prefilled (inferred). The item is clipped by the table card in the screenshot. |

#### Form: Filters

| Label (aria) | Type | Options | Notes |
|---|---|---|---|
| Search by Invoice ID or Customer Name | text (search) | — | Placeholder is the same as the label |
| Filter by status | select | All Statuses, Completed, Pending / Due, Refunded | Default All Statuses |
| From date | date | — | Defaults to the 1st of the current month (e.g. 01/11/2026) |
| To date | date | — | Defaults to today |
| Select all sales / Select sale `<INV>` | checkbox | — | Header checkbox and one per row |

#### Modal: Invoice preview (View Details)

- Centred modal, ≈ 450px wide.
- **Header:** the invoice number as the title (e.g. `INV-0001`) and **✕**.
- **Body:** an 80mm thermal-receipt preview (monospace, white paper on a grey surround). Top to bottom:
  1. "TAX INVOICE" (bold, centred);
  2. shop logo, shop name (bold), address line, and "Tel: `<phone>`";
  3. key–value rows: **Cashier** (logged-in user), **Bill No**, **Date** (`dd/mm/yyyy, hh:mm:ss`), **Time** (`hh:mm am`);
  4. column header "Qty | Rate | MRP | Amount";
  5. numbered item lines: "1. `<product name>`", then "`qty` | `rate` | `mrp` | `amount`";
  6. a rule, then "Total Item: `N` | Total Qty: `N`";
  7. **Bill Amount**, then **Net Payable** (bold);
  8. "Amount in Words:" followed by e.g. "Six Hundred Forty Rupees Only";
  9. **Cash Received** (the payment line);
  10. "Terms & Conditions", e.g. "Goods once sold are not returnable without receipt.";
  11. a **barcode** of the invoice number, with the number printed under it;
  12. "Thank you for your business!".
- **Footer:** **Print** (outlined) and **Close** (primary).

**Behaviours**

- Status values: Completed, Pending / Due (partially paid or credit sale) and Refunded (fully returned) (inferred from the filter options).
- Two invoice-number styles appeared: a short sequence (`INV-0001`) and a long one (`INV-982400001`). The long form may be generated offline or per device (inferred).
- Receipt fields come from Settings (shop name, address, phone, logo, terms) and the logged-in cashier (inferred).
- "Amount in Words" is spelled out in English with "Rupees Only".

**Screenshots:** `03-sales.png`, `gaps/t-sales.png` (full height; same content), `forms/f04-sales--Actions-for-INV-0001.png`, `forms/f68-sales--Actions-for-INV-0001.png`, `forms/f05-sales--View-Details.png` (no modal captured), `forms/f69-sales--View-Details.png` (modal captured)

---

### Sales Return: "Refund & Credit Note" (`/sales-return`)

- **Purpose:** look up a past invoice, return some or all of its items (with or without restocking), and issue a credit note or refund.

**Layout (top to bottom)**

1. **Header:** H1 **"Refund & Credit Note"** and the subtitle "Look up an invoice, process partial or full returns, and issue credit notes."
2. **Invoice Lookup card**
   - Label "Invoice Lookup".
   - A large search input with a magnifier icon (placeholder "Enter Invoice # or Sale ID…"), taking ≈ 85% of the width.
   - A primary **Search** button (magnifier icon).
3. **Process Return card.** Appears after a successful lookup, between the lookup card and the list.
   - **Header, left:** "Process Return" with "Invoice `INV-0001`" under it.
   - **Header, right:** meta chips with icons:
     - calendar: invoice date-time;
     - user: customer name;
     - wallet: invoice total.
   - **Items table:**

     | Column | Content |
     |---|---|
     | PRODUCT | Product name |
     | SOLD QTY | Quantity sold |
     | PREV. RETURNED | Quantity already returned |
     | RETURN PRICE | Unit price, e.g. "Rs 160.00" |
     | RETURN QTY | Number input, default 0 |
     | RESTOCK? | Checkbox, checked, labelled "Yes" |
     | REFUND AMOUNT | Calculated, e.g. "Rs 0.00" |

   - **Footer row:**
     - left: "Return Reason (optional)" text input;
     - centre-right: "TOTAL REFUND AMOUNT" eyebrow over a large bold value;
     - buttons **Process Partial Return** (outlined, rotate icon; looks disabled while every quantity is 0) and **Process Full Return** (rose/red filled, rotate icon).
4. **Recent Returns card**
   - Title on the left, "`N` records" on the right.
   - Table columns: **RETURN ID**, **ORIGINAL INVOICE #**, **DATE**, **TOTAL REFUNDED**, **ACTIONS**.
   - Empty state: "No returns yet."

**Actions**

| Control | Opens / does |
|---|---|
| Search | Looks up the invoice by number or sale ID and opens the Process Return card. On a network error a red toast says "Failed to fetch". |
| Return Qty input | Sets the quantity to return per line. Refund Amount and the total update. |
| Restock? | When checked, the returned quantity goes back into stock; uncheck for damaged goods. |
| Process Partial Return | Returns only the entered quantities. |
| Process Full Return | Returns all remaining quantities of the invoice. |
| Recent Returns → ACTIONS | Per-return actions such as view or print the credit note (inferred; list was empty). |

#### Form: Process Return

| Label | Type | Options | Notes |
|---|---|---|---|
| Invoice Lookup | text | — | Placeholder "Enter Invoice # or Sale ID…" |
| RETURN QTY (per line) | number | — | Default 0. Maximum = sold − previously returned (inferred) |
| RESTOCK? (per line) | checkbox | — | Default checked, labelled "Yes" |
| REFUND AMOUNT (per line) | read-only | — | = Return Qty × Return Price |
| Return Reason (optional) | text | — | Placeholder "Defective, wrong item, customer request…" |
| TOTAL REFUND AMOUNT | read-only | — | Sum of the line refunds |

**Behaviours**

- Supports **partial and repeated returns**: "PREV. RETURNED" tracks earlier returns per line.
- A return creates a credit note record (RETURN ID) linked to the original invoice. It should reduce revenue, adjust stock when Restock is ticked, and refund cash or credit the customer's account (inferred).
- A fully returned invoice should show status **Refunded** in the Sales list (inferred).
- Recent Returns loads the latest 15 returns, newest first (from the request log).

**Screenshots:** `04-sales-return.png`, `gaps/t-sales-return.png` (full height; nothing below the Recent Returns card), `forms/f06-sales-return--typed-INV-0001.png`, `forms/f70-sales-return--typed-INV-0001.png`, `forms/f07-sales-return--Search.png` (error toast), `forms/f71-sales-return--Search.png` (Process Return card)

---

### Purchases (`/purchases`)

- **Purpose:** record purchase orders from suppliers, bringing stock in and recording vendor payables and payments in one step, and list past purchases.

**Layout (top to bottom)**

1. **Header:**
   - left: H1 **"Purchases"** and the subtitle "Purchase orders, stock inwarding, and vendor payables";
   - right: primary **+ Create Purchase Order**.
2. **Recent Purchases card**
   - Title on the left, "`N` records" on the right.
   - Table columns: **PO NUMBER**, **DATE**, **SUPPLIER**, **TOTAL**, **PAID**, **DUE**, **STATUS**, **ACTIONS**.
   - Empty state: "No purchases yet — create your first purchase order."

**Actions**

| Control | Opens / does |
|---|---|
| Create Purchase Order | Opens the **Create Purchase Order** right drawer. |
| ✕ (accessible name "Close purchase order panel") / Cancel | Closes the drawer without saving. |
| Add Row | Adds a line-item row. |
| Remove line | Deletes a line-item row. |
| Save | Saves the PO (disabled until valid). |
| Row ACTIONS | Per-PO actions such as view, print or pay (inferred; list was empty). |

#### Form: Create Purchase Order (right drawer, ≈ 448px)

- **Header:** title "Create Purchase Order" and the subtitle "Record stock inwarding, vendor ledger, and payment in one batch."
- **Body:**
  1. DATE and SUPPLIER side by side.
  2. **Line Items** card, with **+ Add Row** in its header.
  3. Two cards side by side: **Order Summary** and **Payment**.
- **Sticky footer:** **Cancel** (outlined) and **Save** (primary; greyed while invalid).
- The line-items table is wider than the drawer: only PRODUCT and UNIT COST are visible, and the other columns scroll horizontally.

| Label | Type | Options | Notes |
|---|---|---|---|
| DATE | date | — | Calendar icon in the label; defaults to today (e.g. 21/11/2026) |
| SUPPLIER | text (search/autocomplete) | Vendors (parties with type = vendor) | Placeholder "Search supplier…"; required (inferred) |
| **Line Items**, repeatable via **Add Row** | | | |
| PRODUCT | text (search/autocomplete) | Products | Placeholder "Search product…" |
| UNIT COST | number | — | Purchase cost per unit; may prefill from the product's cost (inferred) |
| QTY | number | — | Quantity received |
| SUBTOTAL | read-only | — | = Unit Cost × Qty; "—" when empty |
| (remove) | icon button "Remove line" | — | Deletes the row |
| **Order Summary** | | | |
| Subtotal | read-only | — | Sum of line subtotals |
| Discount | number + select | Value, % | Default **Value** |
| Tax % | number | — | Percentage on the discounted subtotal (inferred) |
| Grand Total | read-only | — | = Subtotal − Discount + Tax |
| **Payment** | | | |
| Amount Paid | number | — | Paid now |
| Payment Method | select | Cash, Bank | Default Cash |
| Due | read-only | — | = Grand Total − Amount Paid; shown in a grey box |

**Behaviours**

- Saving a PO is expected to (inferred from the subtitle):
  - **increase stock** (stock inwarding);
  - post the **Due** as a payable on the vendor's ledger;
  - record the **Amount Paid** as a payment out from Cash or Bank.
- Unit choice per line (base unit vs sub-unit) was not visible in the clipped table. Check this on Products/Units.
- List statuses will probably be Paid / Partial / Due, based on the PAID and DUE columns (inferred).
- The dashboard "Reorder" buttons link here.

**Screenshots:** `05-purchases.png`, `gaps/t-purchases.png` (full height; nothing below the Recent Purchases card), `forms/f08-purchases--Create-Purchase-Order.png`

---

### Purchase Return (`/purchase-return`)

- **Purpose:** return goods to a supplier against a purchase order. This issues a debit note, reduces stock and reduces the vendor payable.

**Layout (top to bottom)**

1. **Header:** H1 **"Purchase Return"** and the subtitle "Debit note & supplier return engine — reverse purchases, adjust inventory, and update payables."
2. **Two-column master–detail**, with equal-width cards:
   - **Left card, "Select Invoice":**
     - subtitle "Recent purchase orders";
     - search input with a magnifier icon (placeholder "Search by PO number or supplier…");
     - divider, then the list of POs;
     - empty state: "No purchases found."
   - **Right card, detail panel:**
     - empty state: a centred outline box icon, "Select a purchase invoice" (semibold) and "Choose a PO from the left panel to process a debit note." (muted).

**Actions**

| Control | Opens / does |
|---|---|
| Search by PO number or supplier… | Filters the PO list. |
| PO row (left list) | Loads that PO into the right panel to build a debit note. Not captured because no POs exist. |

#### Form: Select Invoice

| Label | Type | Options | Notes |
|---|---|---|---|
| (search) | text | — | Placeholder "Search by PO number or supplier…" |

The right-panel return form was not captured. By analogy with Sales Return, expect (inferred):

- per-line Return Qty, against purchased and previously returned quantities;
- unit cost and line amount;
- a reason;
- a total, with "process" buttons.

**Behaviours (inferred)**

- A debit note reduces stock by the returned quantities.
- It reduces the vendor payable, or records a refund received.
- It links back to the original PO.

**Screenshots:** `06-purchase-return.png`, `gaps/t-purchase-return.png` (full height; same content), `forms/f09-purchase-return--Select-Invoice.png` (clicking "Select Invoice" changed nothing)

---

## Gaps and things to verify before building

- **Pagination is unknown.** Every list had at most 3 rows, and the full-height captures show no pagination controls. The POS grid renders the whole catalogue at once. Decide our own paging for long lists.
- **Dashboard data looked odd.** Net and Gross Profit were strongly negative while Purchases and Expenses were 0. The Cashflow Activity rows looked like demo placeholders, because the Payments In/Out page had no transactions. Don't derive formulas from these figures.
- **f05 (View Details):** no modal was captured; the menu had closed. **f69** has the invoice modal.
- **f07 (Sales Return Search):** the first attempt showed a "Failed to fetch" toast. The retry, **f71**, loaded the Process Return card.
- **f04 / f68:** the 4th menu item, "Sales Return", is clipped by the table card's overflow. The label comes from the JSON.
- **f03 (Held Sales):** the drawer's title "Held Sales" and ✕ sit hidden behind the top bar in the screenshot. They are present in the JSON.
- **f08 (Create PO):** the QTY, SUBTOTAL and remove columns are cut off horizontally. They are known from the JSON.
- **f09:** identical to the page; there were no POs to select. The purchase-return detail form is unknown.
- **Not captured:**
  - POS settings (gear), Theme Palette, the night-mode result and the Urdu/RTL layout;
  - the Hold, Print Estimate and Charge results (receipt after a sale, change due);
  - + Add Credit Customer, + Note / discount, + Add Payment and the W button;
  - out-of-stock tile behaviour when tapped.
- **Weighed dialog labels:** the JSON labels both inputs "TOTAL AMOUNT (RS)" (a label-association quirk). On screen, the second one is "QUANTITY (CTN)".
