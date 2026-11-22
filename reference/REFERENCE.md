# Reference app — screen spec

_Captured 2026-11-21, read-only (every write request was blocked; nothing in the account changed). Screenshots are in
`reference/khatapos/` (kept out of git: they show the shop's data). This is the spec our POS copies: layout, flows, fields
and behaviour, under our own name and branding. Plan: [../PLAN.md](../PLAN.md)._

How it was captured:
- `reference/khatapos/NN-*.png/.json` — every menu page (first pass, 1440×900).
- `reference/khatapos/forms/fNN-*` — every "Add / New" form, tab and dialog, plus the POS cart and checkout steps.
- `reference/khatapos/gaps/t-*` — full-height pages; `gaps/fNN-*` — product form tabs, employee tabs, HR forms, missing dialogs.
- Labels are exact; business data is left out. "(inferred)" marks a rule worked out rather than seen.

## Contents
- [Part 1 — App shell, design and selling](#part-1--app-shell-design-and-selling)
  - Login `/login`
  - Dashboard `/dashboard`
  - POS Terminal `/pos`
  - Sales `/sales`
  - Sales Return: "Refund & Credit Note" `/sales-return`
  - Purchases `/purchases`
  - Purchase Return `/purchase-return`
- [Part 2 — Inventory and parties](#part-2--inventory-and-parties)
  - Products `/products`
  - Categories `/categories`
  - Brands / Companies `/brands`
  - Units `/inventory/units`
  - Colors `/inventory/colors`
  - Sizes `/inventory/sizes`
  - Print Barcodes `/inventory/barcodes`
  - Customers `/customers`
  - Vendors `/vendors`
- [Part 3 — Reports, finance and administration](#part-3--reports-finance-and-administration)
  - Reports `/reports`
  - Profit & Loss `/reports/profit-loss`
  - Product Performance `/reports/product-performance`
  - Reminders: Action Center & Alert Dashboard `/reminders`
  - Payments In/Out `/payments`
  - Capital & Equity `/finance/capital`
  - Banks & Cash `/banks`
  - Cheques `/cheques`
  - Expenses `/expenses`
  - Taxes & Duties `/finance/taxes`
  - Users `/users`
  - Settings `/settings`
  - Database Backups `/administration/backups`
- [Part 4 — HRM & Payroll](#part-4--hrm--payroll)
  - HR Dashboard `/hrm/dashboard`
  - Employees `/hrm/employees`
  - Attendance & Shifts `/hrm/attendance`
  - Leave Management `/hrm/leaves`
  - Payroll & Advances `/hrm/payroll`
  - Recruitment `/hrm/recruitment`
  - Performance & Assets `/hrm/performance`


---

# Part 1 — App shell, design and selling

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

---

# Part 2 — Inventory and parties

This section covers the Inventory master-data screens (Products, Categories, Brands / Companies, Units, Colors, Sizes, Print Barcodes) and the Parties screens (Customers, Vendors), with every dialog or drawer opened from them.

Sources are read-only captures in `reference/khatapos/`:
- **First pass:** page captures `07`–`15` and form captures `forms/f10`–`f19`. These are 1440×900 viewport shots.
- **Second pass, in `gaps/`:**
  - Full-height page captures `t-*`.
  - Every tab of the product drawer (`gaps/f01`–`f07`).
  - The import dialog (`gaps/f08`) and the edit-unit dialog (`gaps/f09`).

Business data (product, party and person names, amounts) is left out except as short format examples.

---

## Shared shell (applies to every screen below)

- **Left sidebar** (about 255px wide, white). Top: store logo tile and store name. Nav items, each with an icon:
  - Dashboard
  - POS Terminal
  - Collapsible groups with a chevron: Sales, Purchasing, **Inventory**, **Parties**, Reports, HRM & PAYROLL (styled as a highlighted bordered card), Finance, Administration.
  - **Inventory** sub-items, in order: Products (`/products`), Categories (`/categories`), Brands / Companies (`/brands`), Units (`/inventory/units`), Colors (`/inventory/colors`), Sizes (`/inventory/sizes`), Print Barcodes (`/inventory/barcodes`).
  - **Parties** sub-items: Customers (`/customers`), Vendors (`/vendors`).
  - The active group is tinted, with an accent bar on the left. The active sub-item is tinted and bold, with an accent bar on the left.
  - Bottom of the sidebar: user block (avatar circle with an initial, user name, role such as "Admin") and a full-width **Sign out** button.
- **Top bar** (grey): store name as a breadcrumb on the left. On the right, in order:
  - "Live / Online" status pill (green dot)
  - Language segmented toggle **English** / **اردو** (Urdu)
  - Night-mode toggle (sun icon, accessible name "Switch to night mode")
  - **Theme Palette** button (palette icon)
- **Content area**: light grey background. The page title is an H1, usually with a one-line grey subtitle under it. A faint product watermark sits bottom-right.
- **Common list patterns**:
  - Tables sit inside a white rounded card with uppercase grey column headers.
  - Row actions are text buttons: **Edit** (grey, pencil icon) and **Delete** (red, trash icon).
  - Primary buttons are dark filled; secondary buttons are white and outlined.

---

### Products (`/products`)

- **Purpose:** master list of all sellable items. From here you create, edit, delete, import and export products, and configure which product-form features are shown.

**Layout (top to bottom, left to right)**
1. **Header row:** H1 "Products" on the left. No subtitle. On the right, a button group:
   - Gear icon button (accessible name **Product UI Settings**)
   - **Import CSV** (upload icon, outlined)
   - **Export CSV** (outlined)
   - **+ New** (primary, dark)
2. **Search:** one text input (about 385px wide), placeholder **"Search (name / SKU / formula)"**. There are no other filters, tabs or KPI cards.
3. **Table** (white card). Columns, left to right:

| Column | Content / format |
|---|---|
| NAME | Product name (bold-ish, dark). Under it in small grey text: `SKU: <code>` (e.g. `SKU: CL5`) |
| TYPE | Grey pill badge with the product type, e.g. **Standard** (other values from the form: Variant, Serialized / IMEI, Service) |
| BRAND | Brand name, or "—" when none |
| CATEGORY | Category name in grey/blue-grey text (link-like) |
| PRICE | Right-aligned currency, format `Rs 4,800.00`. Shows `Rs 0.00` when not set |
| WHOLESALE | Right-aligned currency in grey (`Rs 4,700.00`), or "—" when not set |
| STOCK | Right-aligned number. Shown in **orange** when 0 and in dark text when positive, including values below the default Reorder Level of 10 (e.g. `9.5`). Can be fractional (e.g. `9.8667`, `9.5`) |
| EXPIRY | Expiry date, or "—" |
| ACTIONS | **Edit** (grey text) and **Delete** (red text) |

- **Sorting:** alphabetical by name (inferred: the list is A→Z).
- **Pagination:** none. The full-height capture `gaps/t-products.png` shows all 44 rows on one page with no pager or "load more" under the table.
- Long names wrap onto two lines; the SKU line stays under the name.
- **Empty state:** not captured.

**Actions**

| Button | Opens / does |
|---|---|
| Gear (**Product UI Settings**) | Opens the right-side drawer "Product UI Settings" (feature toggles, see below) |
| **Import CSV** | Opens the centred modal "Import Products (CSV)" (see below) |
| **Export CSV** | Downloads the product list as CSV (inferred) |
| **+ New** | Opens the right-side drawer "New Products" |
| Row **Edit** | Opens the same drawer titled "Edit Products", prefilled |
| Row **Delete** | Deletes the product. A confirmation step was not captured (inferred: confirm before delete) |
| Search box | Filters the table live by product name, SKU or Formula / Generic (inferred from the placeholder) |

#### Form: New Products / Edit Products (right-side drawer)

- **Container:** right-side drawer, about 450px wide, full height, with a dimmed overlay on the page. Header: title **"New Products"** (or **"Edit Products"** in edit mode), subtitle **"Full product engine — pricing, units, variants & inventory"**, close (×) top-right. Sticky footer: **Cancel** (outlined), **Save** (primary).
- **Tabs** (horizontal, underline style): **General Info** (active by default) | **Pricing & Units** | **Inventory & Variants** | **Advanced**.

**Tab: General Info** (Standard product; `forms/f10`, `gaps/f01`, `gaps/f05`, which are identical)

| Label | Type | Options | Notes |
|---|---|---|---|
| Name * | text | — | Required (asterisk). Placeholder "Product name". Full width |
| Product Type | radio (2×2 selectable cards) | **Standard** "Normal inventory item"; **Variant** "Color / Size matrix"; **Serialized / IMEI** "Unique serial per unit"; **Service** "Intangible — no stock tracking" | Default **Standard** (card is highlighted). Each card has a bold title and a grey description |
| Formula / Generic | text | — | Half width, left. Generic / chemical formula name, e.g. for pharmacy (inferred). Included in list search |
| SKU | text + icon button | — | Half width, right. A magic-wand icon button (**Generate SKU**) next to it auto-generates a code. Edit example: short alphanumeric code like `CL5` |
| Barcode | text + icon button | — | Half width, left. Magic-wand icon button (**Generate Barcode**). Helper text: "Supports hardware scanner — focus field and scan". Edit example: 12-digit numeric code |
| Category | select | **None**, then every category name (alphabetical) | Half width, right. Default "None" |
| Brand | select | **None**, then the brands list (empty in capture) | Half width, left. Default "None" |
| *Media Center* (section card, image icon + heading) | — | — | Groups the image fields below |
| (image drop zone) | file (drag & drop) | — | Dashed box: "Drag & drop image", "PNG, JPG up to 800 KB" |
| (image preview) | display | — | Box next to the drop zone. Shows "No image selected" until an image is set |
| Image URL | text | — | Placeholder "https://…" |
| Fetch Suggestions | button | — | Helper: "Matches your inventory catalog instantly. Unknown items show professional retail packaging. For exact local brands, paste a Google Image URL." Suggests product images from the name (inferred) |
| Active | checkbox | — | Small checkbox with a label, under the Media Center card. **Checked** by default |

**General Info when Product Type = Variant** (`gaps/f06`)
- The **SKU** and **Barcode** fields disappear, together with their Generate buttons.
- The grid reflows: Formula / Generic (left) and Category (right) share the first row, with Brand below.
- Name, Product Type, Media Center and Active are unchanged.
- Codes are probably set per variant instead (inferred). The generated variant grid was not captured.

**Tab: Pricing & Units** (captured for a Standard product, `gaps/f02`)

| Label | Type | Options | Notes |
|---|---|---|---|
| Retail Price | number | — | First row, one third of the width. Empty by default. It is the price **per 1 base unit** (see the Base Unit helper). Feeds the PRICE column |
| Wholesale Price | number | — | First row, middle. A small "?" help badge sits next to the label. Helper text under the field: "This price applies when Wholesale Mode is active at the POS." Feeds the WHOLESALE column. Hidden when the **Wholesale Pricing** setting is off (inferred) |
| Cost | number | — | First row, right. Purchase cost per base unit (inferred) |
| Tax % | number | — | Second row, one third of the width. Default **0** |
| *Advanced UoM Matrix* (tinted section card) | — | — | Card heading. Description: "Stock is tracked in the base unit. Set retail price per base unit; alternate units auto-price from the conversion rule (override for bulk discounts)." Hidden when the **Unit Conversion** setting is off (inferred) |
| Base Unit (inventory) | searchable select (combobox, search icon + chevron) | Units master; placeholder "Search units…" | Helper "Retail price above is per 1 base unit." Empty by default |
| ALTERNATE SALE UNITS | repeatable rows | Units master | Uppercase sub-heading with a **+ Add unit row** link-button on the right. Empty state in a dashed box: "No alternate units. POS sells in base unit only." The row fields were not captured. Inferred from the description and the POS picker "Dzn (1 Ctn = 30 Dzn)": unit, conversion factor (units per 1 base unit), and an optional price override |

**Tab: Inventory & Variants: Standard product** (`gaps/f03`)

| Label | Type | Options | Notes |
|---|---|---|---|
| Opening Stock | number | — | Small field, left. Empty by default. Quantity in the base unit (inferred) |
| Reorder Level | number | — | Small field, right. Default **10**. Threshold for reorder / low-stock alerts (inferred) |
| Expiry Date | date | — | Native date picker, shown as `dd/mm/yyyy`, about two thirds of the width. Empty by default. Feeds the EXPIRY column and the barcode "Show Expiry" element. Hidden when the **Expiry Dates** setting is off (inferred) |

**Tab: Inventory & Variants: Variant product** (`gaps/f07`)

| Label | Type | Options | Notes |
|---|---|---|---|
| *Variant Options* | heading | — | Replaces Opening Stock, Reorder Level and Expiry Date. Those fields are **not shown** for Variant products |
| Colors | searchable multi-select (bordered card with a search input) | Colors master; placeholder "Search colors…" | Left card |
| Sizes | searchable multi-select (bordered card with a search input) | Sizes master (in sort order, inferred); placeholder "Search sizes…" | Right card, beside Colors |

**Variant matrix**
- You pick one or more Colors and one or more Sizes. The product then becomes a matrix of Color × Size combinations.
- What appears after picking (the generated combination grid with per-variant SKU, barcode, stock and price) was **not captured**, because nothing was selected. Each combination is likely its own stock-keeping row (inferred).
- The **Variant Matrix** toggle in Product UI Settings probably controls whether the Variant type and this section are offered (inferred).

**Tab: Advanced** (`gaps/f04`)
- For a new Standard product this tab is **empty**: no fields render, only the Cancel / Save footer.
- It may hold fields for the Serialized / IMEI or Service types, which were not captured.
- Build it as an empty placeholder until verified.

**Not captured:**
- The Serialized / IMEI and Service product types, and how they change the tabs. For example, an IMEI/serial list and stock fields hidden for Service (both inferred).
- The Pricing & Units tab for a Variant product.

**Edit mode** (`forms/f12`, General Info only)
- Title "Edit Products".
- Fields are prefilled with the saved values: Name, Type, SKU, Barcode, Category, Brand.
- The other tabs in edit mode were not captured (expected to match the New form, prefilled).

#### Form: Product UI Settings (right-side drawer)

- **Container:** right-side drawer, same width as the product drawer. The title **"Product UI Settings"** is in the JSON but scrolled out of view in the screenshot.
- **Intro:** "Tailor the product form to your business type. Settings are saved locally per device."
- **Footer:** full-width outlined button **Reset to defaults**.

| Label | Type | Options | Notes |
|---|---|---|---|
| Variant Matrix | toggle | on/off | Description "Color / Size options for apparel & shoes". Shown **on** in capture |
| IMEI / Serial | toggle | on/off | "Serialized inventory tracking". Shown **on** |
| Wholesale Pricing | toggle | on/off | "B2B price field alongside retail". Shown **on** |
| Expiry Dates | toggle | on/off | "Pharmacy / grocery expiry tracking". Shown **on** |
| Unit Conversion | toggle | on/off | "Box → Pcs, Kg → Gram conversions". Shown **on** |

- Each toggle sits in its own bordered row card: bold title and grey description on the left, switch on the right.
- There is no Save button. Changes apply immediately (inferred).

#### Form: Import Products (CSV) (centred modal, about 510px wide; `gaps/f08`)

- **Header:** file icon, title **"Import Products (CSV)"**, close (×).
- **Footer:** **Cancel** (outlined) and **Import 0 products** (primary). The import button is shown disabled/greyed while no file is loaded; its count updates to the number of parsed rows (inferred from the "0").

| Label | Type | Options | Notes |
|---|---|---|---|
| (drop zone) | file (drag & drop or click) | — | Large dashed box with an upload icon: "Drop CSV here or click to browse". Accepts .csv (inferred) |
| (format hint) | display | — | "Columns: Name, SKU, Category, Price, Stock (header row optional)" |

- **Steps shown:** pick or drop a file, then click "Import N products". There is no template download, column-mapping step or options in the dialog.
- A preview of parsed rows after a file is chosen was not captured (inferred: possibly shown in the same modal).
- **Expected file format** (stated): five columns in this order: **Name, SKU, Category, Price, Stock**. The header row is optional.
- **Mapping** (inferred):
  - Price → Retail Price.
  - Stock → Opening Stock in the base unit.
  - Category is matched by name. What happens to unknown category names is not shown.
  - Rows import as Standard products.

**Behaviours / business rules (Products)**
- **Product types:**
  - Standard: stock-tracked.
  - Variant: color/size matrix built from the Colors and Sizes masters.
  - Serialized / IMEI: a unique serial per unit.
  - Service: no stock tracking.
- **Feature flags are per device:** the Product UI Settings are stored in local storage (stated in the UI: "saved locally per device"). They only hide or show form sections; they do not change data (inferred). "Reset to defaults" turns all five back to their defaults (all on, inferred from the capture).
- **Multi-unit selling (Advanced UoM Matrix):**
  - Each product has one **Base Unit (inventory)**. Stock is tracked in it, and Retail Price is per 1 base unit (stated).
  - **Alternate sale units** auto-price from their conversion rule, and the price can be overridden for bulk discounts (stated).
  - With no alternate units, the POS sells in the base unit only (stated).
  - Stock goes **fractional** when an alternate unit is sold. For example, `9.8667` cartons = 9 cartons + 26 of 30, and `9.5` = 9 cartons + 12 of 24 (inferred from list values and the POS unit picker "1 Ctn = 30 Dzn").
- **Reorder Level:** defaults to 10 per product. Even so, the list highlights only zero stock in orange, and 9.5 shows in dark text. So the orange colour means out of stock, and Reorder Level probably drives reminders or reorder reports instead (inferred).
- **Tax %:** set per product, default 0. Applied on sale (inferred).
- **Wholesale price:** applies "when Wholesale Mode is active at the POS" (stated). It is probably also tied to the "Wholesale" customer group (inferred, see Customers).
- **Variant products:** carry no product-level SKU, Barcode, Opening Stock, Reorder Level or Expiry Date. Those fields are replaced by the Colors × Sizes option pickers.
- **SKU / Barcode:**
  - Both can be auto-generated by the magic-wand buttons. The generated barcode is a 12-digit numeric code (EAN/UPC-style, inferred).
  - The barcode field accepts input from a USB/HID scanner.
  - SKU should be unique (inferred).
- **Search** covers name, SKU and Formula / Generic. The generic name supports pharmacy-style lookup (inferred).
- **Images:**
  - Upload is limited to PNG/JPG up to 800 KB.
  - An external image URL is also accepted.
  - "Fetch Suggestions" auto-suggests stock imagery.
- **CSV import:** the fixed five-column format above. **CSV export:** downloads the list. Its columns were not captured (inferred: at least the import columns, so a round trip works).
- **Data:** the request log shows a `products` collection loaded in full, plus `categories` and `brands` for the selects. Opening the page calls a master-data seed endpoint (inferred: it seeds default units, colors and sizes on first use).

**Screenshots:**
- `07-products.png`
- `forms/f10-products---New.png`, `forms/f11-products--Product-UI-Settings.png`, `forms/f12-products--Edit.png`
- `gaps/t-products.png`
- `gaps/f01-products---New.png`, `gaps/f02-products--Pricing-Units.png`, `gaps/f03-products--Inventory-Variants.png`, `gaps/f04-products--Advanced.png`, `gaps/f05-products--General-Info.png`
- `gaps/f06-products--Variant-Color-Size-matrix.png`, `gaps/f07-products--Inventory-Variants.png`
- `gaps/f08-products--Import-CSV.png`

---

### Categories (`/categories`)

- **Purpose:** master data for the product hierarchy (categories and sub-categories). Used for POS category filters and product assignment.

**Layout**
1. **Header:** H1 "Categories". Subtitle: "Master data engine for product hierarchy, POS visuals, and catalog organization."
2. **Toolbar row:** search input with a magnifier icon on the left (about 450px), placeholder **"Search categories..."**. Primary button **+ Add Category** on the right.
3. **Table** (white card). Columns:

| Column | Content / format |
|---|---|
| IMAGE | Round thumbnail. Shows a grey placeholder image icon when no image URL is set |
| NAME | Category name (uppercase as entered). Under it, small grey product-count text when the category has products, e.g. "14 products" or "1 product" (singular/plural). No count line when the category is empty |
| PARENT CATEGORY | Parent name, or "—" for top-level |
| STATUS | Green pill **Active** (inactive state not captured; inferred grey "Inactive" pill) |
| ACTIONS | **Edit** (pencil icon, grey), **Delete** (trash icon, red) |

- **Sorting:** by name ascending (the request log orders categories by `name asc`).
- **Pagination:** none. The full-height capture shows all 18 rows on one page, every one Active and top-level ("—"), with no pager.
- **Empty state:** not captured (inferred: same pattern as Brands, i.e. icon, "No categories yet", and an add button).

**Actions**

| Button | Opens / does |
|---|---|
| **+ Add Category** | Opens the centred modal "Add Category" |
| Row **Edit** | Opens the same modal prefilled (title / button text not captured; inferred "Edit Category" / "Save") |
| Row **Delete** | Deletes the category. Confirmation not captured (inferred: blocked or warned when products or sub-categories are linked) |
| Search | Filters rows by name (inferred) |

#### Form: Add Category (centred modal, about 510px wide)

- **Header:** title **"Add Category"**, subtitle **"Create a master category or sub-category for your catalog."**, close (×).
- **Footer:** **Cancel** (outlined) and **Create Category** (primary; shown disabled/greyed while the name is empty).

| Label | Type | Options | Notes |
|---|---|---|---|
| Category Name * | text | — | Required (red asterisk). Placeholder "e.g. Beverages, Spices, Cold Drinks". Autofocused |
| Parent Category | select | **None (top-level category)**, then all existing categories | Default "None (top-level category)" |
| Category Image URL | text | — | Placeholder "https://example.com/category-image.png" |
| (image preview) | display | — | Dashed box with an image icon: "Image preview will appear here". Shows the image from the URL |
| Active on POS | toggle | on/off | Default **on**. Description "Visible in POS category filters and product assignment." |

**Behaviours / business rules**
- Two-level (or deeper) hierarchy via Parent Category. Any category can be chosen as a parent (inferred: prevent choosing the category itself or its descendants).
- Inactive categories are hidden from the POS category filter and from the product form's Category select (inferred from the toggle text).
- The product count is computed live from products assigned to the category.
- The image is a URL only on this form (no upload). It appears as a tile visual on the POS (inferred from "POS visuals").

**Screenshots:** `08-categories.png`, `gaps/t-categories.png`, `forms/f13-categories--Add-Category.png`

---

### Brands / Companies (`/brands`)

- **Purpose:** master data for manufacturers and suppliers, used to organise products by brand and for catalogs.

**Layout**
1. **Header:** H1 "Brands / Companies". Subtitle: "Master data engine for manufacturers, suppliers, and catalog branding."
2. **Toolbar row:** search input with a magnifier icon, placeholder **"Search brands..."**. Primary button **+ Add Brand** on the right.
3. **Content card**, empty state as captured:
   - Briefcase icon in a rounded square
   - Heading **"No brands yet"**
   - Text: "Register manufacturers and suppliers to organize products, power B2B catalogs, and enrich your POS experience."
   - Primary button **+ Add your first brand**
4. **Table when populated:** not captured. Inferred columns: LOGO, NAME (with product count), CONTACT INFO, STATUS (Active pill), ACTIONS (Edit / Delete). This mirrors the Categories table.

**Actions**

| Button | Opens / does |
|---|---|
| **+ Add Brand** | Opens the centred modal "Add Brand" |
| **+ Add your first brand** | Same modal (empty-state CTA) |
| Search | Filters brands by name (inferred) |
| Row Edit / Delete | Not captured (inferred, same as Categories) |

#### Form: Add Brand (centred modal, about 510px wide)

- **Header:** title **"Add Brand"**, subtitle **"Register a manufacturer or supplier for product cataloging."**, close (×).
- **Footer:** **Cancel** and **Create Brand** (primary; disabled while the name is empty).

| Label | Type | Options | Notes |
|---|---|---|---|
| Brand / Company Name * | text | — | Required. Placeholder lists three well-known example brand names ("e.g. …, …, …"). Autofocused |
| Brand Logo URL | text | — | Placeholder "https://example.com/brand-logo.png" |
| (logo preview) | display | — | Dashed box: "Logo preview will appear here" |
| Contact Info | text | — | Placeholder "Phone number, email, or website for reordering" |
| Active | toggle | on/off | Default **on**. "Visible when assigning brands to products and in catalogs." |

**Behaviours / business rules**
- Only active brands appear in the product form's Brand select (inferred).
- Contact Info is free text for reorder contact. Brands are separate from Vendors (the vendor ledger is under Parties).
- Brands are listed by name ascending (request log: `brands` ordered by `name asc`).

**Screenshots:** `09-brands.png`, `gaps/t-brands.png` (same empty state), `forms/f14-brands--Add-Brand.png`

---

### Units (`/inventory/units`)

- **Purpose:** master data for measurement units, used in product pricing and POS unit conversions.

**Layout**
1. **Header:** H1 "Units". Subtitle: "Master data for measurement units — used in product pricing and POS conversions." Primary button **+ New** top-right.
2. **No search, filters or KPI cards.**
3. **Table:**

| Column | Content |
|---|---|
| NAME | Unit name, e.g. "Kilogram" |
| SHORT CODE | Abbreviation, e.g. "Kg" |
| BASE UNIT | "Yes" / "No" |
| ACTIONS | **Edit** (pencil), **Delete** (trash, red) |

- **Default (seeded) rows**, sorted by name (generic system defaults, worth seeding in our build):

| Name | Short code | Base unit |
|---|---|---|
| Box | Box | Yes |
| Carton | Ctn | Yes |
| Dozen | Dzn | No |
| Gram | g | No |
| Inch | in | No |
| Kilogram | Kg | Yes |
| Liter | L | Yes |
| Meter | m | Yes |
| Milliliter | ML | No |
| Pack | Pack | No |
| Pieces | Pcs | Yes |

**Actions**

| Button | Opens / does |
|---|---|
| **+ New** | Opens the small centred modal "New Unit" |
| Row **Edit** | Opens the modal "Edit Unit", prefilled (see below) |
| Row **Delete** | Deletes the unit (inferred: blocked if any product uses it) |

- The full-height capture shows all 11 rows; there is no pagination or search.

#### Form: New Unit (centred modal, about 450px wide)

- **Header:** title **"New Unit"**, close (×). No subtitle.
- **Footer:** **Cancel**, **Save** (primary).

| Label | Type | Options | Notes |
|---|---|---|---|
| Name | text | — | Placeholder "Kilogram, Box, Pieces…". Required (inferred; no asterisk shown) |
| Short Code | text | — | Placeholder "Kg, Box, Pcs…" |
| Is base storage unit | checkbox | — | Default unchecked |

#### Form: Edit Unit (centred modal, same size; `gaps/f09`)

- **Header:** title **"Edit Unit"**, close (×).
- **Footer:** **Cancel**, **Save**.
- Same fields as New Unit, prefilled from the row:

| Label | Type | Options | Notes |
|---|---|---|---|
| Name | text | — | Prefilled with the unit name (e.g. "Box"). Same placeholder as New Unit |
| Short Code | text | — | Prefilled (e.g. "Box") |
| Is base storage unit | checkbox | — | Reflects the saved value: checked for a unit whose BASE UNIT is "Yes" |

**Behaviours / business rules**
- "Base storage unit" marks units that stock can be held in (Box, Carton, Kg, Liter, Meter, Pieces).
- Non-base units (Dozen, Gram, Milliliter, Pack, Inch) are sale or sub-units linked to a base unit through a per-product conversion factor. For example, the POS shows "Dzn (1 Ctn = 30 Dzn)" (inferred).
- The unit list is ordered by name (request log: `units` ordered by `name asc`).
- Defaults are created by a master-data seed call when the page is first opened (inferred from the `/api/inventory/master-data/seed` request).

**Screenshots:** `10-inventory-units.png`, `gaps/t-inventory-units.png`, `forms/f15-inventory-units---New.png`, `gaps/f09-inventory-units--Edit.png`

---

### Colors (`/inventory/colors`)

- **Purpose:** standard color master data for variant products (apparel, footwear).

**Layout**
1. **Header:** H1 "Colors". Subtitle: "Standard color master data for variant products (apparel, footwear)." Primary button **+ New** top-right.
2. **No search or filters.**
3. **Table:**

| Column | Content |
|---|---|
| NAME | Round color swatch dot (filled with the hex value; light colors get a thin border), then the color name |
| HEX | Hex code in uppercase, e.g. `#3B82F6` |
| ACTIONS | **Edit**, **Delete** |

- **Default (seeded) rows**, sorted by name: Black `#171717`, Blue `#3B82F6`, Brown `#92400E`, Gray `#6B7280`, Green `#22C55E`, Navy `#1E3A8A`, Orange `#F97316`, Pink `#EC4899`, Purple `#A855F7`, Red `#EF4444`, White `#FAFAFA`, Yellow `#EAB308`.

**Actions**

| Button | Opens / does |
|---|---|
| **+ New** | Opens the modal "New Color" |
| Row **Edit** | Same modal prefilled (inferred) |
| Row **Delete** | Deletes the color (inferred: blocked if used by variants) |

#### Form: New Color (centred modal, about 450px wide)

- **Header:** title **"New Color"**, close (×).
- **Footer:** **Cancel**, **Save**.

| Label | Type | Options | Notes |
|---|---|---|---|
| Name | text | — | Placeholder "Red, Navy Blue…". Required (inferred) |
| Hex (optional) | text | — | Placeholder "#EF4444". Plain text, not a color picker. Optional; without it the swatch shows a neutral default (inferred) |

**Behaviours / business rules**
- Colors are one axis of the Variant matrix (Product Type = Variant, Variant Matrix setting on) (inferred).
- Ordered by name (request log).
- Seeded by default (inferred).

**Screenshots:** `11-inventory-colors.png`, `gaps/t-inventory-colors.png`, `forms/f16-inventory-colors---New.png`

---

### Sizes (`/inventory/sizes`)

- **Purpose:** size master data for the variant matrix (S/M/L, numeric waist sizes, etc.).

**Layout**
1. **Header:** H1 "Sizes". Subtitle: "Size master data for variant matrix (S/M/L, numeric waist sizes, etc.)." Primary button **+ New** top-right.
2. **No search or filters.**
3. **Table:**

| Column | Content |
|---|---|
| NAME | Size label |
| SORT ORDER | Integer |
| ACTIONS | **Edit**, **Delete** |

- **Default (seeded) rows**, in sort order: XS (1), S (2), M (3), L (4), XL (5), XXL (6), 28 (7), 30 (8), 32 (9), 34 (10), 36 (11), 38 (12), 40 (13), 42 (14), 44 (15).
- The full-height capture shows all 15 rows on one page, with no pagination.

**Actions**

| Button | Opens / does |
|---|---|
| **+ New** | Opens the modal "New Size" |
| Row **Edit** | Same modal prefilled (inferred) |
| Row **Delete** | Deletes the size (inferred) |

#### Form: New Size (centred modal, about 450px wide)

- **Header:** title **"New Size"**, close (×).
- **Footer:** **Cancel**, **Save**.

| Label | Type | Options | Notes |
|---|---|---|---|
| Name | text | — | Placeholder "S, M, L, 32, 34…". Required (inferred) |
| Sort Order | number | — | Default **0**. Controls the order in lists and in the variant matrix |

**Behaviours / business rules**
- The list is ordered by `sort_order` ascending (request log), not alphabetically.
- Sizes are the second axis of the Variant matrix (inferred).
- Seeded by default (inferred).

**Screenshots:** `12-inventory-sizes.png`, `gaps/t-inventory-sizes.png`, `forms/f17-inventory-sizes---New.png`

---

### Print Barcodes (`/inventory/barcodes`)

- **Purpose:** build a queue of products and print barcode labels on any thermal or label printer. You choose a template and dimensions, toggle label elements, and check the live preview.

**Layout**
1. **Header:** square tile with a barcode icon, then H1 "Print Barcodes". Subtitle: "Universal labeling — templates, custom dimensions, any thermal printer."
2. **Two-column body:**
   - **Left column** (about 455px), two stacked cards:
     - **SEARCH & QUEUE** card: search input (type search, magnifier icon), placeholder **"Search by product name or SKU…"**. Typing shows matching products to add to the queue (inferred).
     - **PRINT QUEUE** card: empty state text "Search and add products to build your print queue." When populated, it lists the queued products, probably with a label quantity per product and a remove action (inferred).
   - **Right column** (wide), card **LABEL SETTINGS & LIVE PREVIEW**, top to bottom:
     1. **Label Template:** 2×2 grid of selectable template cards, each with an icon, a title, a mini wireframe preview and a description.
        - **Standard Retail** (tag icon): "Barcode center, store top, name & price bottom". Selected by default (accent border and tint).
        - **Jewelry / Mini Tag** (diamond icon): "Compact horizontal — price left, tiny barcode right".
        - **Minimalist** (barcode icon): "Barcode and SKU only — no names or prices".
        - **Wholesale / Logistics** (truck icon): "Full product details, thick barcode, large MRP".
     2. **Label Dimensions (mm)** (ruler/box icon): four number inputs in one row (Width, Height, Row Gap, Column Gap). Under them, computed helper text **"Effective roll width (1-up): 50 mm"**.
     3. **Roll Layout:** select (full width).
     4. **Label Elements to Print:** list of toggle rows (bordered row cards, switch on the right).
     5. **Global Font Size:** select.
     6. **Live Preview:** large dashed box with the empty-state text "Add a product to the queue to preview a label". Caption under it: "Actual size: 50 × 25 mm — scaled to fit preview".
     7. **Print Labels:** full-width primary button with a printer icon at the bottom of the card. Shown faded/disabled while the queue is empty.
   - The full-height capture `gaps/t-inventory-barcodes.png` shows the whole panel.

**Actions**

| Control | Does |
|---|---|
| Product search | Finds products by name or SKU and adds them to the print queue (inferred) |
| Template cards | Switch the label layout. The live preview updates |
| Dimension inputs / Roll Layout / toggles / font size | Update the live preview and the print layout |
| **Print Labels** | Renders the labels for every queued product and opens the browser print dialog (inferred). Disabled while the queue is empty (shown faded in the capture) |

#### Form: Label settings (inline panel, part of the page)

| Label | Type | Options | Notes |
|---|---|---|---|
| Label Template | radio (cards) | Standard Retail; Jewelry / Mini Tag; Minimalist; Wholesale / Logistics | Default Standard Retail |
| Width (mm) | number | — | Default **50** |
| Height (mm) | number | — | Default **25** |
| Row Gap (mm) | number | — | Default **2** |
| Column Gap (mm) | number | — | Default **2** |
| (Effective roll width) | display, auto-calculated | — | "Effective roll width (1-up): 50 mm". Recomputes with the layout |
| Roll Layout | select | Single Column; Double Column (2-up); Triple Column (3-up) | Default Single Column |
| Show Store Name | toggle | on/off | Default **on** |
| Show Product Name | toggle | on/off | Default **on** |
| Show Price / MRP | toggle | on/off | Default **on** |
| Show SKU | toggle | on/off | Default **off** |
| Show Expiry | toggle | on/off | Default **off**. Helper "Only shown when product has an expiry date" |
| Global Font Size | select | Small — fits long product names; Medium — balanced; Large — short names only | Default **Medium — balanced** |

**Behaviours / business rules**
- **Effective roll width** = (Width × columns) + (Column Gap × (columns − 1)). For example, 2-up gives 50×2 + 2 = 102 mm (inferred formula; 1-up = 50 mm is shown).
- Row Gap is the vertical feed gap between labels.
- **Templates:** each template sets which elements show and where. Minimalist ignores the name and price toggles (inferred from "no names or prices").
- **Expiry on labels:** the expiry element prints only for products that have an expiry date (stated). It is tied to the product Expiry Dates feature.
- **Barcode value:** the product's Barcode field, falling back to SKU (inferred).
- **Settings persistence:** settings probably persist per device like Product UI Settings (inferred; not stated).
- Works with any printer through the browser print path at the exact label size in millimetres (inferred from "any thermal printer" and "Actual size").

**Screenshots:** `13-inventory-barcodes.png`, `gaps/t-inventory-barcodes.png`

---

### Customers (`/customers`)

- **Purpose:** customer relationship and ledger screen, with credit limits, receivables and risk at a glance.

**Layout**
1. **Header:** H1 "Customers". Subtitle: "Customer relationship & ledger — credit limits, receivables, and risk at a glance." No header button is visible in the capture.
2. **KPI cards** (3 equal cards in a row; each has a round tinted icon on the left, then a label and a large figure):

| Card label | Figure | Style |
|---|---|---|
| Total Customers | Count of customers (e.g. `0`) | Indigo people icon. Figure in dark text |
| Total Receivables | Sum of outstanding customer balances, currency (e.g. `Rs 0.00`) | Rose banknote icon. Figure in **red** |
| Over-Limit Customers | Count of customers whose balance exceeds their credit limit | Green warning-triangle icon. Figure in **green** (likely turns red or amber when > 0, inferred) |

3. **Content card**, empty state as loaded in `gaps/t-customers.png`. It mirrors the Vendors empty state:
   - User-plus icon in a raised rounded square, with a soft glow behind it
   - Heading **"No customers yet"**
   - Text: "Build your customer ledger with credit limits, groups, and receivable tracking — ready for POS credit sales."
   - Primary button **+ Add First Customer**
   - The first-pass capture `14-customers.png` caught this card while it was still loading, showing a centred spinner. Use the same spinner as the loading state.
4. **Populated table:** not captured. Inferred columns: NAME (with phone), GROUP, PHONE, CITY, BALANCE / RECEIVABLE, CREDIT LIMIT (with an over-limit badge), ACTIONS (Edit / Ledger / Delete).
5. **Search and header button:** neither is shown in the empty state. Both probably appear once data exists, e.g. a search box and an "Add Customer" button (inferred).

**Actions**

| Button | Opens / does |
|---|---|
| **+ Add First Customer** | Opens the right-side drawer "New Customer" |
| Row actions | Not captured (inferred: Edit, View ledger, Delete) |

#### Form: New Customer (right-side drawer, about 510px wide)

- **Header:** title **"New Customer"**, subtitle **"Customer relationship & credit profile"**, close (×, accessible name "Close drawer").
- **Footer** (sticky): **Cancel**, **Save** (primary).
- The form is split into uppercase grey section headings.

| Section | Label | Type | Options | Notes |
|---|---|---|---|---|
| BASIC INFO | Name | text | — | Autofocused. Required (inferred; no asterisk shown) |
| BASIC INFO | Phone | text | — | Half width, left |
| BASIC INFO | Email | email | — | Half width, right |
| BASIC INFO | Customer Group | select | Retail; Wholesale; VIP | Default **Retail** |
| FINANCIAL & RISK | Opening Receivable | number | — | Placeholder "0.00". Helper "Sets the initial receivable balance for this customer." |
| FINANCIAL & RISK | Credit Limit | number | — | Default **0**. Helper "Set to 0 for unlimited credit" |
| FINANCIAL & RISK | Tax ID / NTN | text | — | Tax registration number |
| FINANCIAL & RISK | Cashier Notes | textarea | — | Placeholder "Instructions for cashiers (e.g. VIP handling, delivery prefs)" |
| LOCATION | Address | text | — | Below the fold (from JSON) |
| LOCATION | City | text | — | Below the fold (from JSON) |

**Behaviours / business rules**
- **Receivables ledger:** Opening Receivable seeds the customer balance. Credit sales on the POS add to it and Payments In reduce it (inferred). Total Receivables = sum of all customer balances.
- **Credit limit:** 0 means unlimited (stated). If limit > 0 and balance > limit, the customer counts as **Over-Limit** (inferred). The POS should warn or block credit sales beyond the limit (inferred).
- **Customer Group:** Retail, Wholesale or VIP. Wholesale customers likely get the product's Wholesale price at the POS. VIP may get special handling (inferred).
- **Cashier Notes:** shown to the cashier when the customer is picked at the POS (inferred from the placeholder).
- **Data:** customers and vendors share one `parties` collection with a `type` field (`customer` / `vendor`), according to the request log.

**Screenshots:** `14-customers.png` (content card still loading), `gaps/t-customers.png` (loaded empty state), `forms/f18-customers--Add-First-Customer.png`

---

### Vendors (`/vendors`)

- **Purpose:** supplier ledger and accounts payable screen, with payment terms, payables and payout (bank) details.

**Layout**
1. **Header:** H1 "Vendors". Subtitle: "Supplier ledger & accounts payable — payment terms, payables, and payout details." No header button in the empty state.
2. **KPI cards** (3 in a row, icon on the left):

| Card label | Figure | Style |
|---|---|---|
| Total Vendors | Count of vendors | Indigo building icon |
| Total Payables | Sum of outstanding vendor balances, currency (`Rs 0.00`) | Indigo people icon. Figure in **indigo** |
| Recent Inwards | Count, with sub-caption "Added this month" | Grey truck icon. Probably vendors added (or purchase inwards recorded) in the current month (inferred) |

3. **Content card**, empty state:
   - Truck icon in a raised rounded square
   - Heading **"No vendors yet"**
   - Text: "Build your supplier ledger with payment terms, bank details, and payable tracking — ready for purchase orders and payment out."
   - Primary button **+ Add First Vendor**
4. **Populated table:** not captured. Inferred columns: COMPANY (with contact person), PHONE, PAYMENT TERMS, PAYABLE, ACTIONS (Edit / Ledger / Delete). Search and an "Add Vendor" button probably appear once data exists (inferred).

**Actions**

| Button | Opens / does |
|---|---|
| **+ Add First Vendor** | Opens the right-side drawer "New Vendor" |
| Row actions | Not captured (inferred: Edit, View ledger, Delete) |

#### Form: New Vendor (right-side drawer, about 510px wide)

- **Header:** title **"New Vendor"**, subtitle **"Supplier ledger & accounts payable profile"**, close (×, "Close drawer").
- **Footer:** **Cancel**, **Save**.

| Section | Label | Type | Options | Notes |
|---|---|---|---|---|
| COMPANY INFO | Company Name | text | — | Placeholder "Supplier / brand name". Autofocused. Required (inferred) |
| COMPANY INFO | Contact Person | text | — | Placeholder "Primary contact at the company" |
| COMPANY INFO | Phone | text | — | Half width, left |
| COMPANY INFO | Email | email | — | Half width, right |
| FINANCIAL & TERMS | Opening Payable | number | — | Placeholder "0.00". Helper "Sets the initial payable balance — becomes the vendor's live payable on save." |
| FINANCIAL & TERMS | Tax ID / NTN | text | — | |
| FINANCIAL & TERMS | Payment Terms | select | Cash on Delivery; Due on Receipt; Net 15; Net 30; Net 45; Net 60; Prepaid | Default **Net 30** |
| FINANCIAL & TERMS | Internal Notes | textarea | — | Placeholder "Notes for the purchasing team (not shown on POs)" |
| LOCATION & PAYOUT | Address | text | — | Below the fold (from JSON) |
| LOCATION & PAYOUT | Bank Details / IBAN | textarea | — | Placeholder "Account number, bank name, IBAN for quick payments". Below the fold |

**Behaviours / business rules**
- **Payables ledger:** Opening Payable becomes the vendor's live payable on save (stated). Purchases on credit add to it and Payments Out reduce it (inferred). Total Payables = sum of vendor balances.
- **Payment Terms:** set the due date of purchase invoices, e.g. Net 30 = due 30 days after the purchase date (inferred). The due dates can feed Reminders (inferred).
- **Internal Notes:** internal only, never printed on purchase orders (stated).
- **Bank Details / IBAN:** shown when making a Payment Out (inferred from "for quick payments").
- **Purchase Order link:** vendors populate the SUPPLIER select on the Purchase Order form. The request log loads `parties` where `type == vendor` on the Purchases page.

**Screenshots:** `15-vendors.png`, `gaps/t-vendors.png` (same empty state), `forms/f19-vendors--Add-First-Vendor.png`

---

## Gaps and things to verify before building

- **Product types and form states still not captured:**
  - The **Serialized / IMEI** and **Service** product types, and how they change the tabs, including whether the Advanced tab gets fields for them.
  - The variant combination grid after choosing colors and sizes.
  - The Pricing & Units tab for a Variant product.
  - The fields inside an **alternate sale unit row**.
- **Edit forms still not captured:**
  - **Edit product** beyond General Info.
  - **Edit category**.
  - The edit modals for Brand, Color and Size, which are expected to mirror their New/Add forms the way Edit Unit does.
- **Other screens and flows not captured:**
  - Delete confirmations.
  - The Import CSV preview / result after a file is chosen, and the Export CSV columns.
  - Populated tables for Brands, Customers and Vendors (all were empty).
- **Below the fold, so taken from the JSON only:** the Location sections of the customer and vendor drawers. Their fields are known; only the exact layout is not.

---

# Part 3 — Reports, finance and administration

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

---

# Part 4 — HRM & Payroll

Seven screens under the sidebar group **HRM & PAYROLL**: HR Dashboard, Employees, Attendance & Shifts, Leave Management, Payroll & Advances, Recruitment, Performance & Assets.

## Module-wide conventions

- **Sidebar group**: "HRM & PAYROLL" (people icon, collapsible, expanded with a light tinted panel while any HRM page is active). Items, in order, each with an icon:
  | Item | Route | Icon |
  |---|---|---|
  | HR Dashboard | `/hrm/dashboard` | grid |
  | Employees | `/hrm/employees` | people |
  | Attendance & Shifts | `/hrm/attendance` | clock |
  | Leave Management | `/hrm/leaves` | calendar |
  | Payroll & Advances | `/hrm/payroll` | dollar sign |
  | Recruitment | `/hrm/recruitment` | briefcase |
  | Performance & Assets | `/hrm/performance` | star |
  The active item is a filled pill. The Finance and Administration groups follow below in the sidebar.
- **Top bar** is the app's shared one (business name on left; "Live / Online" status pill, English / اردو language toggle, night-mode toggle, theme palette button on right). Not repeated per screen below.
- **Page header pattern**: small uppercase coloured eyebrow label (section family) → H1 page title → one-line grey subtitle; primary action button top-right.
  | Screen | Eyebrow |
  |---|---|
  | HR Dashboard | HRM & PAYROLL |
  | Employees | (none) |
  | Attendance & Shifts | TIME & ACTION |
  | Leave Management | TIME & ACTION |
  | Payroll & Advances | COMPENSATION & TREASURY |
  | Recruitment | TALENT ACQUISITION |
  | Performance & Assets | TALENT & OPERATIONS |
- **KPI card pattern**: white rounded card, coloured square icon tile on the left, uppercase grey label, big bold figure below.
- **Tables**: uppercase grey column headers on a light header band; when empty, a single centred grey sentence in the table body (exact texts listed per screen).
- **Charts**: titled card with a small subtitle; when there is no data, a centred grey empty-state sentence in the chart area. Two charts are labelled "2.5D depth view" (3D-look bars).
- **Drawers, modals and inline forms**:
  - **Right-side drawer**: "Add New Employee", "Mark Attendance", "Add Candidate", "Grant Advance", "Assign Asset". About 450 px wide, with the page blurred and dimmed behind. Header has a coloured eyebrow, title and subtitle, with an X close top-right. Sticky footer has Cancel (outline) and a primary button.
  - **Centred modal**: "Biometric / QR".
  - **Inline form card** on the page: "Create Shift", "New Leave Request", "Add Appraisal", "Log Warning", "Log Reward". Warning and reward cards have a coloured left border (red / green).
  - Tab switches are client-side and the URL does not change: "Daily Roster / Manage Shifts", "Payroll Processing / Advances & Loans", the three Performance tabs, and the four tabs inside the employee drawer.
- **Formats seen**: dates in inputs dd/mm/yyyy (default = today); month inputs show "November 2026"; shift times shown 24 h "09:00 – 17:00", time inputs show 12 h "09:00 AM"; money "Rs 0.00" (currency prefix + 2 decimals), amount inputs placeholder "0.00"; phone placeholder "03xx-xxxxxxx"; CNIC (national ID) placeholder "12345-1234567-1"; employee IDs "EMP-…"; asset codes "AST-…".
- **Departments** (employee form, employee filter, job postings): Sales, Logistics, Management, Operations, Finance, Human Resources.
- **Branches** (employee form): Head Office, Branch A, Branch B, Warehouse.
- **Active employees**: employees have a Status of Active or Inactive (Employment Details tab). Attendance and Payroll only list active employees (their empty states say "No active employees…"), and the dashboard says "N active of M total employees".

---

### HR Dashboard (`/hrm/dashboard`)

- **Purpose**: Workforce overview, headcount analytics, and quick links into every HRM module.

**Layout (top to bottom, left to right)**
1. Header: eyebrow "HRM & PAYROLL", title "HR Dashboard", subtitle "Workforce overview, headcount analytics, and quick module access." No header button.
2. Three KPI cards in one row (equal width):
   | Label | Figure | Icon |
   |---|---|---|
   | TOTAL EMPLOYEES | count of all employees | people |
   | ACTIVE TODAY | count of employees active/present today (inferred: marked Present/Late in today's attendance) | person with check |
   | NEW JOINEES (THIS MONTH) | count of employees whose Joining Date is in the current month | person with plus |
3. Two cards side by side:
   - Left (~40%): **Workforce Distribution**, a chart of headcount by department (type not visible because there was no data; inferred donut/pie or bar by department). Empty state: "No workforce data yet".
   - Right (~60%): **Quick Access**, a 2-column × 3-row grid of link tiles. Each tile has a coloured icon square, a bold title, a grey subtitle and a right arrow:
     | Tile title | Subtitle | Icon (colour) | Goes to |
     |---|---|---|---|
     | Employees | Onboard & manage workforce | people (indigo) | `/hrm/employees` |
     | Attendance & Shifts | Track daily presence | clock (green) | `/hrm/attendance` |
     | Leave Management | Requests & approvals | calendar (purple) | `/hrm/leaves` |
     | Payroll & Advances | Salaries & disbursements | dollar (amber) | `/hrm/payroll` |
     | Recruitment | Hiring pipeline & Kanban | briefcase (blue) | `/hrm/recruitment` |
     | Performance & Assets | Appraisals, rewards & hardware | star (red) | `/hrm/performance` |
4. Full-width strip card **Employee Registry**: subtitle "N active of M total employees" (e.g. "0 active of 0 total employees"); "Manage Employees" button on the right. This is the last element on the page (confirmed by the full-height capture).

**Actions**
| Button | Does |
|---|---|
| Quick Access tiles (×6) | Navigate to the module page listed above |
| Manage Employees | Navigates to `/hrm/employees` |

**Forms/dialogs**: none.

**Behaviours / rules**
- All figures are live counts from the employee and attendance records (inferred).
- "N active of M total" counts employees with Status = Active against all employees.
- Workforce Distribution groups employees by department (inferred; the Employees page uses the same chart with a department filter beside it).

**Screenshots**: `20-hrm-dashboard.png/.json`, `gaps/t-hrm-dashboard.png/.json`

---

### Employees (`/hrm/employees`)

- **Purpose**: Core workforce registry: onboard, search, filter and manage employees.

**Layout**
1. Header: title "Employees", subtitle "Core workforce registry — onboard, search, and manage your team." Top-right primary button "+ Add New Employee".
2. Same three KPI cards as the dashboard: TOTAL EMPLOYEES, ACTIVE TODAY (green icon here), NEW JOINEES (THIS MONTH).
3. Full-width chart card **Workforce Distribution**. Empty state: "No workforce data yet".
4. Table card (last element on the page):
   - Toolbar: search box with magnifier icon, placeholder "Search by Name, CNIC, Phone…" (wide, left); select **Filter by Department** (right).
     - Options: Filter by Department (= all), Sales, Logistics, Management, Operations, Finance, Human Resources.
   - Columns: **PROFILE | DESIGNATION & DEPT | PHONE | JOINING DATE | STATUS | ACTIONS**
     - PROFILE: name, likely with avatar/initials and Employee ID or CNIC (inferred).
     - DESIGNATION & DEPT: Designation with Department as a second line (inferred from the combined header).
     - STATUS: Active / Inactive badge (values from the form).
     - ACTIONS: row actions such as view/edit/delete (inferred; not visible with no data).
   - Empty state: "No employees found. Add your first team member to get started."

**Actions**
| Button | Does |
|---|---|
| + Add New Employee | Opens the "Add New Employee" right drawer |
| Search box | Filters rows live by name, CNIC or phone |
| Filter by Department | Filters rows by department |
| Row ACTIONS | Edit / view / remove the employee (inferred) |

**Forms/dialogs**

#### Drawer: Add New Employee
- Header: eyebrow "EMPLOYEE ONBOARDING", title "Add New Employee", subtitle "Complete all sections — switch tabs without losing your progress." X button (aria "Close employee drawer").
- Body is split: a **vertical tab list on the left** and the fields on the right in a 2-column grid. Tabs (with icons): **Personal Info** (person-circle, active by default), **Employment Details** (briefcase), **Financials** (card), **Documents** (file). Switching tabs keeps what you typed: it is one form, saved once.
- Footer (same on every tab): "Cancel" (outline), "Save Employee" (primary).

Tab **Personal Info**:
| Label | Type | Options | Notes |
|---|---|---|---|
| Full Name * | text | | Required. Placeholder "e.g. Ahmed Khan". Full width |
| CNIC * | text | | Required. Placeholder "12345-1234567-1" (national ID, 5-7-1 digits with dashes). Half width, same row as Phone |
| Phone * | text | | Required. Placeholder "03xx-xxxxxxx" |
| Address | textarea | | Placeholder "Street, city, postal code". Full width |
| Date of Birth | date | | Half width, same row as Gender |
| Gender | select | Male; Female; Other / Prefer not to say | Default "Male" |

Tab **Employment Details**:
| Label | Type | Options | Notes |
|---|---|---|---|
| Employee ID * | text | | Required. Pre-filled with an auto-generated ID in the format "EMP-000…" (truncated in the capture). Greyed background, so it looks system-generated/read-only. Left column |
| Branch | select | Head Office; Branch A; Branch B; Warehouse | Default "Head Office". Right column |
| Department * | select | Sales; Logistics; Management; Operations; Finance; Human Resources | Required. Default "Sales" |
| Designation * | text | | Required. Placeholder "e.g. Sales Executive" |
| Joining Date * | date | | Required. Default today |
| Shift Schedule | select | Morning (9 AM – 5 PM); Evening (2 PM – 10 PM); Night (10 PM – 6 AM); Flexible / Remote | Default "Morning (9 AM – 5 PM)" |
| Status | select | Active; Inactive | Default "Active" |

Tab **Financials**:
| Label | Type | Options | Notes |
|---|---|---|---|
| Base Salary (Monthly) * | number | | Required. Placeholder "50000" (format example only). Left column |
| Bank Name | text | | Placeholder "e.g. HBL, Meezan Bank". Right column |
| IBAN / Account Number | text | | Placeholder "PKxxXXXX..." (monospace). Full width |
| Tax / NTN Status | select | Registered — NTN on file; Not registered; Exempt; Pending verification | Default "Registered — NTN on file". Full width |

Tab **Documents**: intro text "Attach onboarding documents. File names are stored with the employee record." Then four stacked upload cards, each with a bold title, a grey helper line and a "Browse" button on the right. All are optional (no asterisk).
| Label | Type | Options | Notes |
|---|---|---|---|
| CNIC Copy | file | | Helper "Front & back scan (PDF or image)" |
| CV / Resume | file | | Helper "Latest curriculum vitae" |
| Experience Letter | file | | Helper "From previous employer (if applicable)" |
| Employment Contract | file | | Helper "Signed offer / contract letter" |

**Behaviours / rules**
- Required across all tabs: Full Name, CNIC, Phone (Personal Info); Employee ID, Department, Designation, Joining Date (Employment Details); Base Salary (Monthly) (Financials). Save should validate every tab and jump to the first tab with an error (inferred).
- Employee ID is auto-generated in sequence, e.g. EMP-0001, EMP-0002 (inferred from the pre-filled "EMP-000…"). CNIC should be unique per employee (inferred, since search uses CNIC).
- Status defaults to Active. Active employees appear straight away in the Attendance roster and in Payroll for the current month (inferred from those screens' "No active employees" empty states).
- **Shift Schedule is a fixed list** in the reference (Morning / Evening / Night / Flexible / Remote). It is not linked to the shifts set up under Attendance → Manage Shifts. Recommendation: fill this select from the configured shifts so the shift and grace period carry into attendance.
- Base Salary (Monthly) is the BASIC SALARY in the payroll table (inferred). The form has **no allowances field**, so allowances must be entered during payroll processing (inferred).
- Documents: the reference says only "File names are stored with the employee record". Our build should store the files themselves.
- KPI "NEW JOINEES (THIS MONTH)" uses Joining Date.

**Screenshots**: `21-hrm-employees.png/.json`, `forms/f38-hrm-employees--Add-New-Employee.png/.json`, `gaps/t-hrm-employees.png/.json`, `gaps/f10-hrm-employees--Add-New-Employee.png/.json`, `gaps/f11-hrm-employees--Employment-Details.png/.json`, `gaps/f12-hrm-employees--Financials.png/.json`, `gaps/f13-hrm-employees--Documents.png/.json`

---

### Attendance & Shifts (`/hrm/attendance`)

- **Purpose**: Daily attendance roster with clock-in/out entry, plus shift setup (times and grace periods for late detection).

**Layout**
1. Header: eyebrow "TIME & ACTION", title "Attendance & Shifts", subtitle "Live daily roster, clock-in engine, and shift configuration."
   - Top-right: a separate outline button **"Biometric / QR"** (sliders icon), then a 2-option segmented toggle **"Daily Roster"** (clipboard icon, default) | **"Manage Shifts"** (sliders icon).
2. Content depends on the toggle (sub-views below).

#### View: Daily Roster (default)
1. Chart card **Today's Attendance Status**: summary of statuses for the selected date (chart type not visible because there was no data; inferred donut or bars of Present / Late / Absent / On Leave counts). Empty state: "No roster data for this date".
2. Table card (last element on the page):
   - Toolbar left: calendar icon + **date input** (default today, dd/mm/yyyy). It picks the roster date.
   - Toolbar right: **"Bulk Mark Present"** (outline, double-check icon) and **"Mark Attendance"** (primary).
   - Columns: **EMPLOYEE PROFILE | SHIFT | CHECK-IN | CHECK-OUT | WORKING HOURS | STATUS | ACTIONS**
   - Empty state: "No active employees. Add employees in the HR module first."

#### View: Manage Shifts
Two columns:
- Left card **Create Shift**, subtitle "Define schedules and grace periods for late detection." (form below), full-width primary button "+ Add Shift".
- Right card **Configured Shifts**, subtitle "N shifts active" (e.g. "18 shifts active"). A list with one row per shift:
  - Line 1: shift name (e.g. "Morning").
  - Line 2: "HH:MM – HH:MM · N min grace" (e.g. "09:00 – 17:00 · 15 min grace").
  - Right: trash icon button (aria "Delete <shift name>").
  - Example shifts in the reference: Morning 09:00–17:00 (15 min grace), Evening 14:00–22:00 (10 min), Night 22:00–06:00 (10 min, crosses midnight). The reference data repeats each one several times (seed duplicates). The JSON lists 18 rows, sorted by name (Evening ×6, Morning ×6, Night ×6), all in the same row format.

**Actions**
| Button | Does |
|---|---|
| Biometric / QR | Opens the "Biometric / QR Settings" centred modal |
| Daily Roster | Shows the roster view (chart + table) |
| Manage Shifts | Shows the shift create form + configured shifts list |
| Date input (roster) | Reloads the chart and table for that date |
| Bulk Mark Present | Marks every active employee as Present for the selected date in one go (inferred: uses each employee's shift times as check-in/out) |
| Mark Attendance | Opens the "Mark Attendance" right drawer |
| Row ACTIONS | Edit / clear that employee's attendance for the date (inferred) |
| + Add Shift | Saves the Create Shift form and adds it to Configured Shifts |
| Trash icon (per shift) | Deletes that shift (aria "Delete <name>") |

**Forms/dialogs**

#### Inline form: Create Shift (Manage Shifts view)
| Label | Type | Options | Notes |
|---|---|---|---|
| Shift Name * | text | | Required. Placeholder "e.g. Morning, Night" |
| Start Time | time | | Default 09:00 AM. Half width |
| End Time | time | | Default 05:00 PM. Half width |
| Grace Period (Minutes) | number | | Default/placeholder 15. Helper text: "Arrivals after start + grace are marked Late." |
Button: "+ Add Shift".

#### Drawer: Mark Attendance
- Header: eyebrow "CLOCK-IN ENGINE", title "Mark Attendance", subtitle "Working hours auto-calculate from check-in and check-out times." X (aria "Close attendance drawer").
- Footer: "Cancel", "Save Attendance" (primary).

| Label | Type | Options | Notes |
|---|---|---|---|
| Employee * | select | "Select employee…" + active employees | Required |
| Date * | date | | Required. Default today |
| Shift | select | "No shift assigned" + one per configured shift, shown as "<Name> (HH:MM – HH:MM)", e.g. "Morning (09:00 – 17:00)" | Default "No shift assigned" (inferred: pre-fills from the employee's assigned shift) |
| Check-In Time | time | | Default 09:00 AM. Half width |
| Check-Out Time | time | | Default 05:00 PM. Half width |
| WORKING HOURS (read-only panel) | computed display | | Clock icon; shows "8h (8.00h)" (hours/minutes + decimal hours) and "Preview status: Present". Updates live |
| Note / Remarks | textarea | | Placeholder "e.g. Late due to traffic" |

#### Modal: Biometric / QR Settings (UI-only placeholder)
- Centred modal. Eyebrow "ADVANCED INTEGRATION", title "Biometric / QR Settings", subtitle "Placeholder for future API mapping — ZKTeco, thumb scanners, and QR check-in." X close.
- Two dashed-border option cards:
  1. **ZKTeco / Biometric Devices** (fingerprint icon). Text: "Map device IP, port, and employee PIN sync. Supports attendance push webhooks."
  2. **QR Code Check-In** (QR icon). Text: "Generate branch QR codes for mobile scan attendance. API endpoint configuration coming soon."
- Amber notice: "UI-only placeholder. Hardware integrations will connect via secure API keys in a future release."
- Footer: "Close" only (no save).

| Label | Type | Options | Notes |
|---|---|---|---|
| (Device IP) | text | | Placeholder "Device IP". In the ZKTeco card |
| (Port) | text | | Placeholder "Port (4370)" (ZKTeco default port). In the ZKTeco card |
| (Webhook URL) | text | | Placeholder "Webhook URL (placeholder)". In the QR card |

**Behaviours / rules**
- **Working hours** = Check-Out − Check-In, shown as "Xh Ym (X.XXh)" (inferred format beyond the "8h (8.00h)" example). For overnight shifts (e.g. Night 22:00–06:00) the check-out on the next day must wrap past midnight (inferred).
- **Late detection** (stated): an arrival after shift start + grace minutes is **Late**; otherwise **Present**. The drawer previews the status before saving.
- Other statuses likely: Absent (no record for an active employee), Half Day (short hours), On Leave (approved leave covering the date). Inferred; only "Present" and "Late" appear in the reference.
- The roster lists **every active employee** for the chosen date, whether marked or not (inferred from the empty-state text), so unmarked employees can be bulk-marked.
- One attendance record per employee per date (inferred; editing replaces it).
- Shifts are reusable templates (name, start, end, grace). The Mark Attendance "Shift" select reads them, but the employee form's "Shift Schedule" uses its own fixed list (see Employees). Our build should use one shared shift list.
- Recommendation: enforce unique shift names (the reference shows the same shift many times, and the Mark Attendance dropdown listed 7 copies of each while the list said "18 shifts active").

**Screenshots**: `22-hrm-attendance.png/.json`, `forms/f39-hrm-attendance--Manage-Shifts.png/.json`, `forms/f40-hrm-attendance--Mark-Attendance.png/.json`, `forms/f41-hrm-attendance--Daily-Roster.png/.json` (same as the default view), `forms/f42-hrm-attendance--Biometric-QR.png/.json`, `gaps/t-hrm-attendance.png/.json`

---

### Leave Management (`/hrm/leaves`)

- **Purpose**: Submit leave requests and run them through an approval pipeline (casual, sick, annual).

**Layout**
1. Header: eyebrow "TIME & ACTION", title "Leave Management", subtitle "Approval pipeline for casual, sick, and annual leave requests." Top-right primary button "+ New Leave Request".
2. Three KPI cards. Here the coloured icon tile shows the count itself, and the big number repeats it:
   | Label | Figure | Tile colour |
   |---|---|---|
   | PENDING REQUESTS | count of requests with status Pending | amber |
   | APPROVED THIS MONTH | count of requests approved in the current month | green |
   | EMPLOYEES ON LEAVE TODAY | count of employees with an approved leave covering today | indigo |
3. (When opened) inline card **Submit Leave Request** (form below), inserted between the KPI cards and the table.
4. Table (last element on the page): **EMPLOYEE | LEAVE TYPE | FROM DATE | TO DATE | DURATION (DAYS) | REASON | STATUS | ACTIONS**
   - Empty state: "No leave requests yet. Submit a request to start the approval pipeline."

**Actions**
| Button | Does |
|---|---|
| + New Leave Request | Expands the inline "Submit Leave Request" card |
| Cancel (in form) | Collapses the form without saving |
| Submit Request | Creates the request with status Pending (inferred) and adds a table row |
| Row ACTIONS | Approve / Reject a pending request (inferred; possibly delete) |

**Forms/dialogs**

#### Inline form: Submit Leave Request
| Label | Type | Options | Notes |
|---|---|---|---|
| Employee * | select | "Select employee…" + employees | Required. Left half |
| Leave Type | select | Casual; Sick; Annual | Default "Casual". Right half |
| From Date | date | | Required in markup. Default today. Left half |
| To Date | date | | Required in markup. Default today. Right half |
| Reason | textarea | | Placeholder "Brief reason for leave". Full width |
| Duration (read-only) | computed text | | Bottom-left: "Duration: 1 day". Updates live from the dates |
Buttons (bottom-right): "Cancel", "Submit Request" (primary).

**Behaviours / rules**
- **Duration (days)** = To Date − From Date + 1 (inclusive; same day = "1 day") (inferred from the default display). Plural "days" for more than 1 (inferred).
- To Date must be on or after From Date (inferred).
- **Status flow**: Pending → Approved or Rejected (inferred from the KPI labels and "approval pipeline").
- Leave types: Casual, Sick, Annual. **No leave balances or entitlements are shown anywhere** in the reference. If we want balances (e.g. yearly quota per type), they are new (inferred gap).
- Approved leave should show as "On Leave" in the Attendance roster, and unpaid leave feeds Payroll deductions (inferred; the payroll formula names "unpaid leave"). The reference does not show which types are paid.

**Screenshots**: `23-hrm-leaves.png/.json`, `forms/f43-hrm-leaves--New-Leave-Request.png/.json`, `gaps/t-hrm-leaves.png/.json`

---

### Payroll & Advances (`/hrm/payroll`)

- **Purpose**: Process monthly salaries, track employee advances/loans that are recovered from salary, and print payslips.

**Layout**
1. Header: eyebrow "COMPENSATION & TREASURY", title "Payroll & Advances", subtitle "Process salaries, manage employee advances, and generate print-ready corporate payslips." No header button.
2. Row:
   - Left (~2/3): chart card **Payroll Expense Trend**, subtitle "Last 6 months — 2.5D depth view". A 3D-look bar chart of total paid payroll per month for the last 6 months (inferred: one bar per month). Empty state: "No paid payroll runs yet — process salaries to populate this chart".
   - Right (~1/3): three stacked KPI cards:
     | Label | Figure | Icon |
     |---|---|---|
     | TOTAL PAYROLL COST (THIS MONTH) | sum of net (or gross) salaries for the current month, "Rs 0.00" | dollar in circle (green) |
     | OUTSTANDING ADVANCES | sum of advances not yet recovered, "Rs 0.00" | wallet (amber) |
     | PAYSLIPS GENERATED | count of payslips generated (inferred: this month) | document (indigo) |
3. Full-width 2-segment tab bar: **Payroll Processing** (default) | **Advances & Loans**.

#### Tab: Payroll Processing
- Heading "Monthly Payroll — <Month YYYY>" (current month, e.g. "Monthly Payroll — November 2026"); subtitle "Net = Basic + Allowances − Deductions (advances, fines, unpaid leave)".
- Table: **EMPLOYEE | BASIC SALARY | ALLOWANCES (+) | DEDUCTIONS (−) | NET SALARY | STATUS | ACTIONS**
- Empty state: "No active employees. Add employees to begin payroll processing."
- The full-height capture shows the table card is the last element on the page. There is **no month picker, no "process all" button and no totals footer**; the month is fixed to the current month.

#### Tab: Advances & Loans
- Heading "Employee Advances & Loans"; subtitle "Track disbursements and scheduled payroll recoveries." Right: primary button "+ Grant Advance".
- Table: **EMPLOYEE | ADVANCE AMOUNT | DATE GIVEN | DEDUCTION MONTH | STATUS**
- Empty state: "No advances recorded. Grant an advance to begin tracking recoveries."

**Actions**
| Button | Does |
|---|---|
| Payroll Processing / Advances & Loans | Switch tab |
| Row ACTIONS (payroll) | Likely "Pay / Mark Paid" (process salary) and "Payslip" (open a print-ready payslip). Possibly an edit for allowances/deductions, since the employee form has no allowances field (inferred) |
| + Grant Advance | Opens the "Grant Advance" right drawer |

**Forms/dialogs**

#### Drawer: Grant Advance
- Header: eyebrow "TREASURY DISBURSEMENT" (amber), title "Grant Advance", subtitle "Record a salary advance or employee loan for scheduled recovery." X close.
- Footer: "Cancel", "Grant Advance" (primary).

| Label | Type | Options | Notes |
|---|---|---|---|
| Employee * | select | "Select employee…" + employees | Required |
| Advance Amount * | number | | Required. Placeholder "0.00" |
| Date Given | date | | Default today. Required in markup (no asterisk shown) |
| Deduction Month | month | | Default current month (e.g. "November 2026"). Required in markup (no asterisk shown) |
| Disbursement Bank Account * | select | "Select treasury account…" + treasury accounts, shown as "<Account> — <number or N/A>", e.g. "Cash in Hand — N/A" | Required. Lists the cash/bank accounts from Finance → Banks & Cash (inferred) |
| Repayment Schedule / Note | textarea | | Placeholder "e.g. Deduct in full from March payroll, or 50% over two months" |

**Behaviours / rules**
- **Net Salary = Basic Salary + Allowances − Deductions**, where Deductions = advances due this month + fines + unpaid-leave deductions (stated on the page).
- One payroll row per active employee for the current month (inferred). Basic Salary = the employee's "Base Salary (Monthly)" (Financials tab). Allowances are not part of the employee record, so they are entered per month in payroll (inferred).
- **Granting an advance is a treasury outflow**: money leaves the chosen Disbursement Bank Account (or Cash in Hand). This should post as a payment-out in Finance (inferred from the field).
- **Advance recovery**: the advance is deducted in the payroll of its **Deduction Month**. Its status moves from Outstanding/Pending to Recovered/Deducted when that month is paid (inferred). OUTSTANDING ADVANCES = sum of advances not yet recovered.
- Recovery over several months (instalments) is only free text in "Repayment Schedule / Note"; the only structured recovery field is the single Deduction Month. Our build could add an instalment count/amount (recommendation).
- Payroll **STATUS**: e.g. Pending → Paid. Only paid runs feed the trend chart ("No paid payroll runs yet") (inferred). Paying salaries is also a cash outflow and may post to Finance (inferred).
- Unpaid leave deduction is likely (Basic ÷ working days) × unpaid leave days (inferred; formula not shown).
- "Fines" have no visible source: the Log Warning form has no amount field. Fines are probably entered as a payroll deduction or derived from late attendance (inferred).
- Rewards logged with a Bonus Amount (Performance → Warnings & Rewards) probably feed Allowances for that month (inferred).
- Payslip: a printable per-employee document showing basic, allowances, deductions breakdown and net (inferred from "print-ready corporate payslips").

**Screenshots**: `24-hrm-payroll.png/.json`, `forms/f44-hrm-payroll--Advances-Loans.png/.json`, `gaps/t-hrm-payroll.png/.json`, `gaps/f14-hrm-payroll--Advances-Loans.png/.json`, `gaps/f15-hrm-payroll--Grant-Advance.png/.json`

---

### Recruitment (`/hrm/recruitment`)

- **Purpose**: Show open job postings and move applicants through a Kanban hiring pipeline.

**Layout**
1. Header: eyebrow "TALENT ACQUISITION", title "Recruitment", subtitle "Active job postings and applicant pipeline — Kanban hiring board." Top-right primary button "+ Add Candidate".
2. Section **Active Job Postings**: a 4-column grid of cards. Each card has:
   - top-left briefcase icon tile; top-right green badge "OPEN";
   - job title (bold), e.g. "Cashier"; department below (grey), e.g. "Sales";
   - bottom row: people icon + "N applicants" (left); "N slots" / "1 slot" in accent colour (right).
   - Reference examples: Cashier / Sales / 2 slots; HR Coordinator / Human Resources / 1 slot; Sales Executive / Sales / 3 slots; Warehouse Associate / Logistics / 2 slots (each shown twice, seed duplicates).
3. Section **Applicant Pipeline** (last element on the page): 4 equal Kanban columns, each a bordered panel (~250 px tall when empty) with an uppercase header and a count badge:
   | Column | Empty text |
   |---|---|
   | APPLIED | Drop candidates here |
   | INTERVIEWING | Drop candidates here |
   | OFFERED | Drop candidates here |
   | HIRED / REJECTED | Drop candidates here |

**Actions**
| Button | Does |
|---|---|
| + Add Candidate | Opens the "Add Candidate" right drawer |
| Drag a candidate card between columns | Changes its pipeline stage ("Drop candidates here") |
| Job posting card | Possibly filters the pipeline to that posting (inferred; no visible control) |

There is **no button to create or close a job posting** on this screen; the postings looked seeded (gap: we need a "New Job Posting" form with Title, Department, Slots, Status Open/Closed, inferred).

**Forms/dialogs**

#### Drawer: Add Candidate
- Header: eyebrow "TALENT ACQUISITION", title "Add Candidate", subtitle "Log a new applicant to the recruitment pipeline." X close.
- Footer: "Cancel", "Add Candidate" (primary).

| Label | Type | Options | Notes |
|---|---|---|---|
| Full Name * | text | | Required. Placeholder "e.g. Sara Ahmed" |
| Phone * | text | | Required. Placeholder "03xx-xxxxxxx" |
| Applied Position * | select | "Select or type below…" + one per job posting as "<Title> — <Department>", e.g. "Cashier — Sales" | Choose an open posting |
| Position Title * | text | | Required. Placeholder "e.g. Sales Executive". Free text for a position not in the list (the select prompt says "Select or type below…"); picking a posting likely fills it (inferred) |
| Resume Upload | file | | Dashed drop zone with a "Browse Resume" button (inferred: PDF/DOC) |
| Applied Date | date | | Default today. Marked required in markup though no asterisk is shown |

**Behaviours / rules**
- A new candidate starts in **APPLIED** (inferred).
- Pipeline stages: Applied → Interviewing → Offered → Hired / Rejected (stated column names). The last column holds both outcomes, so a card needs a Hired/Rejected flag (inferred).
- Column count badges = number of candidate cards in each column.
- "N applicants" on a posting = number of candidates linked to that posting; "slots" = number of openings (inferred). A posting could auto-close when hires reach slots (inferred, not shown).
- Hiring a candidate could pre-fill "Add New Employee" (inferred, not shown).

**Screenshots**: `25-hrm-recruitment.png/.json`, `forms/f45-hrm-recruitment--Add-Candidate.png/.json`, `gaps/t-hrm-recruitment.png/.json`

---

### Performance & Assets (`/hrm/performance`)

- **Purpose**: Employee appraisals and KPIs, disciplinary warnings and rewards, and a register of company assets issued to employees.

**Layout**
1. Header: eyebrow "TALENT & OPERATIONS", title "Performance & Assets", subtitle "Appraisals, disciplinary records, rewards, and company asset registry." No header button.
2. Full-width 3-segment tab bar with icons: **Appraisals & KPIs** (star, default) | **Warnings & Rewards** (shield) | **Asset Management** (laptop).

#### Tab: Appraisals & KPIs
1. Chart card **Department-wise Performance**, subtitle "Average appraisal rating by department — 2.5D depth view". A 3D-look bar chart, one bar per department, height = average rating (0–5). Empty state: "No appraisal data yet — add employee reviews to populate this chart".
2. Right-aligned primary button "+ Add Appraisal".
3. (When opened) inline form card (below), between the button and the table.
4. Table (last element on the page): **EMPLOYEE | REVIEW PERIOD | RATING | FEEDBACK** (no actions column).
   - Empty state: "No appraisals yet. Add employee performance reviews to get started."

#### Tab: Warnings & Rewards
1. Top-right two tinted buttons: **"Log Warning"** (red tint, shield icon) and **"Log Reward"** (green tint, award-ribbon icon). The button whose form is open shows a stronger tint.
2. (When opened) inline form card "Official Warning" or "Reward / Bonus" (below), full width above the two record cards.
3. Two cards side by side:
   - **Official Warnings** (red top border, red shield icon + red title). Empty state: "No warnings on record".
   - **Rewards & Bonuses** (green top border, green award icon + green title). Empty state: "No rewards on record".
   - Records show as list items inside each card (inferred).

#### Tab: Asset Management
1. Right-aligned primary button "+ Assign Asset".
2. Table: **ASSET ID / NAME | ASSIGNED TO | ISSUE DATE | RETURN DATE | STATUS**
   - Empty state: "No assets assigned. Track laptops, phones, and vehicles here."

**Actions**
| Button | Does |
|---|---|
| Appraisals & KPIs / Warnings & Rewards / Asset Management | Switch tab |
| + Add Appraisal | Expands the inline appraisal form |
| Save Appraisal / Cancel | Save or close the appraisal form |
| Log Warning | Expands the inline "Official Warning" form |
| Log Reward | Expands the inline "Reward / Bonus" form |
| Save Record / Cancel | Save or close the warning/reward form |
| + Assign Asset | Opens the "Assign Asset" right drawer |

**Forms/dialogs**

#### Inline form: Add Appraisal
| Label | Type | Options | Notes |
|---|---|---|---|
| Employee * | select | "Select employee…" + employees | Required. Left half |
| Review Period * | month | | Required. Month + year picker. Right half |
| Rating (0–5) | number | | Default 4. Range 0–5. Left half |
| Feedback | textarea | | Placeholder "Performance summary, goals, areas of improvement…" |
Buttons: "Cancel", "Save Appraisal" (primary). Feedback and the buttons come from the JSON (see notes).

#### Inline form: Log Warning ("Official Warning" card, red left border)
| Label | Type | Options | Notes |
|---|---|---|---|
| Employee * | select | "Select employee…" + employees | Required. Left half |
| Date | date | | Default today. Right half |
| Title * | text | | Required. Placeholder "e.g. Late attendance — written warning". Full width |
| Description | textarea | | No placeholder. Full width |
Buttons (bottom-right): "Cancel", "Save Record" (primary).

#### Inline form: Log Reward ("Reward / Bonus" card, green left border)
| Label | Type | Options | Notes |
|---|---|---|---|
| Employee * | select | "Select employee…" + employees | Required. Left half |
| Date | date | | Default today. Right half |
| Title * | text | | Required. Placeholder "e.g. Q1 performance bonus". Full width |
| Bonus Amount | number | | Placeholder "0.00". Half width, optional |
| Description | textarea | | No placeholder. Full width |
Buttons (bottom-right): "Cancel", "Save Record" (primary).

#### Drawer: Assign Asset
- Header: eyebrow "ASSET REGISTRY" (purple), title "Assign Asset", subtitle "Track company hardware, vehicles, and equipment issued to staff." X close.
- Footer: "Cancel", "Assign Asset" (primary).

| Label | Type | Options | Notes |
|---|---|---|---|
| Asset Name * | text | | Required. Placeholder "e.g. MacBook Pro 14" |
| Asset ID / Code | text | | Placeholder "e.g. AST-0042" (monospace) |
| Category | select | Laptop; Phone; Vehicle; Tablet; Access Card; Other | Default "Laptop" |
| Assign To * | select | "Select employee…" + employees | Required |
| Issue Date | date | | Default today. Required in markup (no asterisk shown). Half width |
| Return Date | date | | Empty by default (dd/mm/yyyy). Half width |
| Status | select | In Use; Returned; Damaged | Default "In Use" |
| Note | textarea | | Placeholder "Serial number, condition, accessories included…" |

**Behaviours / rules**
- Rating scale 0–5. The chart averages ratings per department, using each employee's Department (inferred). One appraisal per employee per review month (inferred).
- Warnings and rewards are dated records per employee, each with a required Title. Only rewards carry money (Bonus Amount, optional), which probably feeds payroll Allowances for that month (inferred). Warnings have no fine field.
- Assets: the table's "ASSET ID / NAME" combines Asset ID / Code and Asset Name. Asset status values are **In Use**, **Returned** and **Damaged**. Return Date is filled when the asset comes back, and status then changes to Returned or Damaged (inferred). Outstanding (In Use) assets should be checked when an employee is set to Inactive (inferred).

**Screenshots**: `26-hrm-performance.png/.json`, `forms/f46-hrm-performance--Add-Appraisal.png/.json`, `forms/f47-hrm-performance--Warnings-Rewards.png/.json`, `forms/f48-hrm-performance--Asset-Management.png/.json`, `gaps/t-hrm-performance.png/.json`, `gaps/f16-hrm-performance--Warnings-Rewards.png/.json`, `gaps/f17-hrm-performance--Log-Warning.png/.json`, `gaps/f18-hrm-performance--Warnings-Rewards.png/.json`, `gaps/f19-hrm-performance--Log-Reward.png/.json`, `gaps/f20-hrm-performance--Asset-Management.png/.json`, `gaps/f21-hrm-performance--Assign-Asset.png/.json`

---

## Capture gaps and notes

- The full-height captures only show each page's **default view** (Daily Roster; Appraisals with the form closed). So two things are still known only from the JSON of the original viewport captures:
  - the rest of the Configured Shifts list, which is the same row format repeated;
  - the lower part of the open Add Appraisal form (Feedback, Cancel, Save Appraisal).
- All tables were empty, so there are **no example rows, row ACTIONS buttons or status badge styles** for employees, attendance, leaves, payroll, advances, appraisals, warnings/rewards or assets. Values marked (inferred) for row actions and status flows still need confirming.
- The reference account had **no employees**, so no chart rendered. Chart types for "Workforce Distribution" and "Today's Attendance Status" are unknown. The two "2.5D depth view" charts are bar charts with a 3D look.
- Seeded shifts and job postings appear **duplicated** in the reference (e.g. 18 shifts = 3 names × 6; the Mark Attendance dropdown showed 7 of each). Treat this as a data glitch, not a feature.
- Not present in the reference UI: leave balances, a payroll month selector, a job-posting editor, and the design of a candidate card on the Kanban board.
