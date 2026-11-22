// English / اردو. Text is written in English and passed through t(); Urdu shows when chosen (top bar), right-to-left.
// Missing Urdu falls back to English, so screens can be translated bit by bit.
(function () {
    'use strict';
    const UR = {
        'Dashboard': 'ڈیش بورڈ', 'POS Terminal': 'پی او ایس ٹرمینل', 'Sales': 'سیلز', 'Sales Return': 'سیلز ریٹرن', 'Purchasing': 'خریداری',
        'Purchases': 'خریداریاں', 'Purchase Return': 'خریداری واپسی', 'Inventory': 'انوینٹری', 'Products': 'مصنوعات', 'Categories': 'کیٹیگریز',
        'Brands / Companies': 'برانڈز / کمپنیاں', 'Units': 'یونٹس', 'Colors': 'رنگ', 'Sizes': 'سائز', 'Print Barcodes': 'بارکوڈ پرنٹ',
        'Parties': 'پارٹیاں', 'Customers': 'گاہک', 'Vendors': 'سپلائرز', 'Reports': 'رپورٹس', 'Profit & Loss': 'نفع و نقصان',
        'Product Performance': 'پروڈکٹ کارکردگی', 'Reminders': 'یاد دہانیاں', 'HRM & PAYROLL': 'ایچ آر اور تنخواہ', 'HR Dashboard': 'ایچ آر ڈیش بورڈ',
        'Employees': 'ملازمین', 'Attendance & Shifts': 'حاضری اور شفٹیں', 'Leave Management': 'چھٹیاں', 'Payroll & Advances': 'تنخواہ اور ایڈوانس',
        'Recruitment': 'بھرتی', 'Performance & Assets': 'کارکردگی اور اثاثے', 'Finance': 'مالیات', 'Payments In/Out': 'وصولی / ادائیگی',
        'Capital & Equity': 'سرمایہ', 'Banks & Cash': 'بینک اور کیش', 'Cheques': 'چیک', 'Expenses': 'اخراجات', 'Taxes & Duties': 'ٹیکس',
        'Administration': 'انتظامیہ', 'Users': 'صارفین', 'Settings': 'ترتیبات', 'Database Backups': 'ڈیٹا بیک اپ', 'Sign out': 'سائن آؤٹ',
        'Live / Online': 'آن لائن', 'Offline': 'آف لائن', 'Syncing': 'ہم آہنگی جاری', 'Search': 'تلاش', 'Save': 'محفوظ کریں', 'Cancel': 'منسوخ',
        'Close': 'بند کریں', 'Edit': 'ترمیم', 'Delete': 'حذف کریں', 'Add': 'شامل کریں', 'New': 'نیا', 'Print': 'پرنٹ', 'Total': 'کل', 'Subtotal': 'ذیلی کل',
        'Discount': 'رعایت', 'Tax': 'ٹیکس', 'Paid': 'ادا شدہ', 'Due': 'بقایا', 'Cash': 'نقد', 'Card': 'کارڈ', 'Bank': 'بینک', 'Charge': 'وصول کریں',
        'Hold': 'روکیں', 'Current Sale': 'موجودہ فروخت', 'Walk-in Customer': 'عام گاہک', 'Credit (Udhar)': 'ادھار', 'Tap a product to begin': 'شروع کرنے کے لیے پروڈکٹ منتخب کریں',
        'Split Payment': 'تقسیم ادائیگی', 'Remaining Balance': 'باقی رقم', 'Change': 'بقایا واپسی', 'View Held Sales': 'رکی ہوئی فروخت',
        'Search / Barcode / Formula': 'تلاش / بارکوڈ / فارمولا', 'All': 'سب', 'Customer name (receipt only)': 'گاہک کا نام (رسید کے لیے)',
        'Sign In': 'سائن ان', 'Email': 'ای میل', 'Password': 'پاس ورڈ', 'Secure workspace · Tenant login': 'محفوظ ورک اسپیس · دکان لاگ ان',
        'Good Morning': 'صبح بخیر', 'Good Afternoon': 'سہ پہر بخیر', 'Good Evening': 'شام بخیر', 'DATE RANGE': 'تاریخ کی حد', 'This Month': 'اس مہینے',
        'Today': 'آج', 'This Week': 'اس ہفتے', 'Last 30 Days': 'پچھلے 30 دن', 'Last Month': 'پچھلا مہینہ', 'This Year': 'اس سال', 'Fiscal Year': 'مالی سال',
        'Sales & Revenue': 'فروخت اور آمدنی', 'Net Profit': 'خالص منافع', 'Receivable': 'وصولی', 'Payable': 'ادائیگی', 'Gross Profit': 'مجموعی منافع',
        'Total Revenue': 'کل آمدنی', 'Cash & Bank': 'کیش اور بینک', 'New Sale': 'نئی فروخت', 'Payment In': 'وصولی', 'Payment Out': 'ادائیگی',
        'Add Expense': 'خرچ شامل کریں', 'Add Product': 'پروڈکٹ شامل کریں', 'Low Stock Alert': 'کم اسٹاک', 'Name': 'نام', 'Phone': 'فون', 'Address': 'پتہ',
        'Date': 'تاریخ', 'Amount': 'رقم', 'Status': 'حالت', 'Actions': 'عمل', 'Balance': 'بیلنس', 'Quantity': 'مقدار', 'Price': 'قیمت', 'Stock': 'اسٹاک',
        'Invoice': 'انوائس', 'Customer': 'گاہک', 'Supplier': 'سپلائر', 'Nothing here yet.': 'ابھی کچھ نہیں۔', 'Export CSV': 'CSV ڈاؤن لوڈ',
        'Promise': 'وعدہ', 'Ledger': 'کھاتہ', 'Remind': 'یاد دلائیں', 'Receive': 'وصول کریں', 'Khata Book (کھاتہ)': 'کھاتہ بک', 'Khata Book': 'کھاتہ بک',
        'Promises & Reminders (وعدے)': 'وعدے اور یاد دہانیاں', 'Day Close (Z-report)': 'دن کا حساب (Z رپورٹ)', 'Day Close': 'دن کا حساب', 'Khata (Udhaar)': 'کھاتہ (ادھار)',
        'Receive udhaar': 'ادھار وصول کریں', 'Retail price': 'ریٹیل قیمت', 'Wholesale price': 'ہول سیل قیمت', 'Search': 'تلاش',
        'Search / Barcode / Formula — 24*code adds 24': 'تلاش / بارکوڈ — 24*کوڈ = 24 عدد', 'Getting started with HisabPro': 'HisabPro شروع کریں',
        'Statement (English)': 'اسٹیٹمنٹ (انگریزی)', 'Both': 'دونوں', 'Share balance on WhatsApp': 'WhatsApp پر بقایا بھیجیں', 'Receive payment': 'ادائیگی وصول کریں',
        'Later': 'بعد میں', 'Kept': 'پورا ہوا', 'Broken': 'ٹوٹ گیا', 'Add promise': 'وعدہ شامل کریں', 'Send reminder': 'یاد دہانی بھیجیں', 'Messaging settings': 'پیغامات کی ترتیبات', 'Message log': 'پیغامات کا ریکارڈ',
    };
    let MAP = null;
    const lang = () => {
        let l = null; try { l = localStorage.getItem('hp.lang'); } catch { }
        if (!l) { const s = HP.session && HP.session.settings && HP.session.settings.localization; l = s && s.language; }
        return l === 'ur' ? 'ur' : 'en';
    };
    const t = s => (lang() === 'ur' && (map().get(s) || UR[s])) || s;
    function apply() {
        const ur = lang() === 'ur';
        document.documentElement.lang = ur ? 'ur' : 'en';
        document.documentElement.dir = ur ? 'rtl' : 'ltr';
        if (ur && document.body) translate(document.body);
    }
    function setLang(l) { try { localStorage.setItem('hp.lang', l); } catch { } apply(); }

    // ── live translation of whatever the screens draw (so every page is Urdu without changing its code) ──
    // the full dictionary (public/js/core/i18n-ur.js → window.HP_UR) plus the core words above, which win
    const map = () => MAP || (MAP = new Map(Object.entries(Object.assign({}, UR, window.HP_UR || {})))); // the full dictionary wins
    const PATTERNS = [
        [/^([\d.,]+) records?$/, '$1 ریکارڈ'], [/^([\d.,]+) in stock$/, '$1 اسٹاک میں'], [/^in (\d+) days?$/, '$1 دن میں'],
        [/^(\d+) days? late$/, '$1 دن تاخیر'], [/^(\d+) days? ago$/, '$1 دن پہلے'], [/^(\d+) in cart$/, 'کارٹ میں $1'],
        [/^(\d+) items?$/, '$1 آئٹمز'], [/^(\d+) products?$/, '$1 مصنوعات'], [/^(\d+) customers owe$/, '$1 گاہکوں پر بقایا'],
        [/^Charge (.+)$/, 'وصول کریں $1'], [/^Good Morning, (.+)$/, 'صبح بخیر، $1'], [/^Good Afternoon, (.+)$/, 'سہ پہر بخیر، $1'], [/^Good Evening, (.+)$/, 'شام بخیر، $1'],
        [/^Balance (.+)$/, 'بقایا $1'], [/^(.+) each$/, '$1 فی یونٹ'], [/^Page (\d+) of (\d+)$/, 'صفحہ $1 از $2'], [/^Import (\d+) products$/, '$1 مصنوعات امپورٹ کریں'],
        [/^Next item × (.+)$/, 'اگلا آئٹم × $1'], [/^(\d+) reminders sent today$/, 'آج $1 یاد دہانیاں بھیجی گئیں'], [/^(\d+) of (\d+) done — each step opens the right screen\.$/, '$2 میں سے $1 مکمل — ہر قدم متعلقہ صفحہ کھولتا ہے'], [/^(\d+) promises$/, '$1 وعدے'], [/^paid (.+) so far$/, 'اب تک ادا: $1'], [/^last (.+)$/, 'پچھلا ریٹ $1'],
    ];
    const lookup = s => {
        const m = map(), hit = m.get(s);
        if (hit) return hit;
        for (const [re, rep] of PATTERNS) if (re.test(s)) return s.replace(re, rep);
        return null;
    };
    const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);
    const skipEl = el => !el || SKIP.has(el.tagName) || (el.closest && el.closest('[data-no-tr], #print-root'));
    function trText(node) {
        const v = node.nodeValue, s = v && v.trim();
        if (!s || s.length > 220 || !/[A-Za-z]/.test(s)) return;
        const u = lookup(s);
        if (u && u !== s) node.nodeValue = v.replace(s, u);
    }
    const ATTRS = ['placeholder', 'title', 'aria-label'];
    function trEl(el) {
        for (const a of ATTRS) { const v = el.getAttribute(a); if (v) { const u = lookup(v.trim()); if (u && u !== v) el.setAttribute(a, u); } }
    }
    function translate(root) {
        if (lang() !== 'ur' || !root) return;
        if (root.nodeType === 3) { if (!skipEl(root.parentElement)) trText(root); return; }
        if (root.nodeType !== 1 || skipEl(root)) return;
        trEl(root);
        root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el => { if (!skipEl(el)) trEl(el); });
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => (skipEl(n.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
        for (let n = w.nextNode(); n; n = w.nextNode()) trText(n);
    }
    const obs = new MutationObserver(muts => {
        if (lang() !== 'ur') return;
        for (const m of muts) {
            if (m.type === 'childList') m.addedNodes.forEach(translate);
            else if (m.type === 'characterData') { if (!skipEl(m.target.parentElement)) trText(m.target); }
            else if (m.type === 'attributes' && !skipEl(m.target)) trEl(m.target);
        }
    });
    document.addEventListener('DOMContentLoaded', () => {
        obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
        if (lang() === 'ur') translate(document.body);
    });
    apply();
    Object.assign(window.HP, { t, lang, setLang, translate });
})();
