# 4. HRM & Payroll module

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
