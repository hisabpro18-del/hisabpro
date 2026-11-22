# Section 2: Inventory and Parties

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
