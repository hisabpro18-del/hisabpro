// Reading lists from spreadsheet files (CSV) for the import dialogs: products, categories, brands, customers, vendors.
// Columns may come in any order: they are matched to HisabPro's fields by their header names (English, snake_case like
// "variant_sku", Urdu, common shop-system names); a file without a header row is read in the list's plain order.
// The import dialog lets the user correct any match. Shared: the browser uses it (core/importer.js); tests run it in node.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CsvImport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // header text → comparable words: "Variant_SKU" → "variant sku", "Cost per item (Rs)" → "cost per item rs"
    const norm = s => String(s == null ? '' : s).replace(/^﻿/, '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim();

    // What each list can hold. fields: [key, label]; exact: header names; contains: header words (tried in order, after
    // exact names); plain: the order of a file without a header; money: amounts (→ paisa); qty: quantities; dates: days.
    const SCHEMAS = {
        product: {
            fields: [['name', 'Name'], ['sku', 'SKU / code'], ['barcode', 'Barcode'], ['category', 'Category'], ['brand', 'Brand / company'],
                ['price', 'Retail price'], ['wholesale', 'Wholesale price'], ['cost', 'Cost price'], ['stock', 'Stock (opening)'],
                ['unit', 'Unit'], ['expiry', 'Expiry date'], ['variant', 'Variant (added to the name)']],
            exact: {
                name: ['name', 'product', 'product name', 'productname', 'item', 'item name', 'itemname', 'title', 'product title', 'نام', 'آئٹم'],
                sku: ['sku', 'code', 'item code', 'product code', 'sku code', 'variant sku', 'article', 'article no', 'reference', 'ref', 'product sku', 'item sku', 'کوڈ'],
                barcode: ['barcode', 'bar code', 'ean', 'ean13', 'upc', 'gtin', 'variant barcode', 'product barcode', 'بارکوڈ'],
                category: ['category', 'categories', 'product category', 'group', 'department', 'category name', 'کیٹیگری'],
                brand: ['brand', 'brand name', 'company', 'manufacturer', 'make', 'vendor', 'برانڈ', 'کمپنی'],
                price: ['price', 'retail price', 'retail', 'sale price', 'selling price', 'sell price', 'sales price', 'rate', 'unit price', 'variant price', 'mrp', 'قیمت'],
                wholesale: ['wholesale', 'wholesale price', 'trade price', 'wholesale rate', 'variant wholesale price', 'ہول سیل'],
                cost: ['cost', 'cost price', 'purchase price', 'buying price', 'buy price', 'cost per item', 'unit cost', 'variant cost', 'purchase rate', 'لاگت'],
                stock: ['stock', 'qty', 'quantity', 'opening stock', 'opening qty', 'on hand', 'in stock', 'inventory', 'stock qty', 'stock quantity', 'available', 'variant inventory qty', 'variant stock', 'variant quantity', 'variant qty', 'اسٹاک'],
                unit: ['unit', 'units', 'uom', 'unit of measure', 'base unit', 'یونٹ'],
                expiry: ['expiry', 'expiry date', 'exp', 'exp date', 'expires', 'expiration', 'expiration date', 'best before'],
                variant: ['variant', 'variant name', 'variant title', 'variant label', 'option', 'option1 value', 'option value'],
            },
            contains: [
                ['barcode', /\b(barcode|ean|upc|gtin)\b/], ['sku', /\bsku\b/], ['wholesale', /\bwholesale\b/], ['cost', /\bcost\b|\bpurchase (price|rate)\b/],
                ['stock', /\b(stock|qty|quantity|inventory)\b/], ['expiry', /\bexpir/], ['category', /\bcategor/], ['brand', /\bbrand\b/],
                ['price', /\b(price|rate|mrp)\b/], ['unit', /\b(unit|uom)\b/], ['variant', /\bvariant\b|\boption\b/], ['name', /\b(name|title)\b/], ['sku', /\bcode\b/],
            ],
            plain: ['name', 'sku', 'category', 'price', 'stock'],
            money: ['price', 'wholesale', 'cost'], qty: ['stock'], dates: ['expiry'],
            template: { file: 'hisabpro-products-template.csv', header: ['Name', 'SKU', 'Barcode', 'Category', 'Brand', 'Price', 'Wholesale', 'Cost', 'Stock', 'Unit', 'Expiry'],
                rows: [['Basmati Rice 5kg', 'RICE-5', '8964000123456', 'Grocery', 'Guard', '1450', '1380', '1300', '40', 'Pcs', ''],
                    ['Cooking Oil 1L', 'OIL-1', '', 'Cooking Oil & Ghee', 'Dalda', '620', '600', '575', '24', 'Pcs', '2027-06-30'],
                    ['Loose Daal Chana', 'DAAL-C', '', 'Grocery', '', '320', '300', '280', '50', 'Kg', '']] },
        },
        category: {
            fields: [['name', 'Category name'], ['parent', 'Parent category'], ['description', 'Description'], ['sortOrder', 'Sort order']],
            exact: {
                name: ['name', 'category', 'category name', 'categories', 'title', 'کیٹیگری', 'نام'],
                parent: ['parent', 'parent category', 'main category', 'parent name', 'under'],
                description: ['description', 'details', 'detail', 'about'],
                sortOrder: ['sort', 'sort order', 'order', 'position', 'sequence'],
            },
            contains: [['parent', /\bparent\b|\bmain\b/], ['sortOrder', /\b(sort|order|position)\b/], ['description', /\bdescri/], ['name', /\b(name|categor)\b/]],
            plain: ['name', 'parent', 'description'],
            qty: ['sortOrder'],
            template: { file: 'hisabpro-categories-template.csv', header: ['Category name', 'Parent category', 'Description'],
                rows: [['Grocery', '', 'Rice, daal, flour, sugar'], ['Rice', 'Grocery', ''], ['Cooking Oil & Ghee', '', ''], ['Cold Drinks & Water', '', ''], ['Soap & Wash', '', '']] },
        },
        brand: {
            fields: [['name', 'Brand / company'], ['description', 'Description']],
            exact: { name: ['name', 'brand', 'brand name', 'company', 'company name', 'manufacturer', 'برانڈ', 'کمپنی', 'نام'], description: ['description', 'details', 'detail', 'about'] },
            contains: [['description', /\bdescri/], ['name', /\b(name|brand|company)\b/]],
            plain: ['name', 'description'],
            template: { file: 'hisabpro-brands-template.csv', header: ['Brand / company', 'Description'], rows: [['Unilever', 'Surf, Lipton, Lux'], ['Nestle', 'Milkpak, Nido'], ['Dalda', 'Oil & ghee']] },
        },
        customer: {
            fields: [['name', 'Name'], ['phone', 'Mobile'], ['city', 'City'], ['address', 'Address'], ['balance', 'Old udhaar (they owe you)'], ['creditLimit', 'Credit limit'],
                ['group', 'Group (Retail / Wholesale)'], ['email', 'Email'], ['notes', 'Notes']],
            exact: {
                name: ['name', 'customer', 'customer name', 'party', 'party name', 'account', 'account name', 'shop', 'shop name', 'client', 'client name', 'نام', 'گاہک'],
                phone: ['phone', 'mobile', 'mobile no', 'mobile number', 'phone no', 'phone number', 'contact', 'contact no', 'contact number', 'cell', 'cell no', 'whatsapp', 'فون', 'موبائل'],
                city: ['city', 'town', 'area', 'شہر'], address: ['address', 'addr', 'location', 'پتہ'],
                balance: ['balance', 'opening balance', 'old balance', 'udhaar', 'udhar', 'udhaar balance', 'receivable', 'due', 'amount due', 'outstanding', 'closing balance', 'current balance', 'بقایا', 'ادھار'],
                creditLimit: ['credit limit', 'limit', 'max credit'], group: ['group', 'customer group', 'customer type', 'type'],
                email: ['email', 'e mail', 'email address'], notes: ['notes', 'note', 'remarks', 'remark', 'comment', 'comments'],
            },
            contains: [['creditLimit', /\blimit\b/], ['balance', /\b(balance|udhaa?r|due|outstanding|receivable)\b/], ['phone', /\b(phone|mobile|cell|contact|whatsapp)\b/],
                ['email', /\bmail\b/], ['address', /\baddress\b/], ['city', /\bcity\b/], ['group', /\bgroup\b/], ['notes', /\b(note|remark|comment)/], ['name', /\bname\b/]],
            plain: ['name', 'phone', 'city', 'balance'],
            money: ['balance', 'creditLimit'],
            template: { file: 'hisabpro-customers-template.csv', header: ['Name', 'Mobile', 'City', 'Address', 'Old udhaar', 'Credit limit', 'Group', 'Notes'],
                rows: [['Akram General Store', '0300-1234567', 'Lahore', 'Shop 12, Akbari Mandi', '25000', '50000', 'Wholesale', ''], ['Bilal Karyana', '0321-7654321', 'Lahore', '', '0', '', 'Retail', 'pays every Friday']] },
        },
        vendor: {
            fields: [['name', 'Company / vendor name'], ['contactPerson', 'Contact person'], ['phone', 'Mobile'], ['city', 'City'], ['address', 'Address'],
                ['balance', 'Old balance (you owe them)'], ['email', 'Email'], ['notes', 'Notes']],
            exact: {
                name: ['name', 'vendor', 'vendor name', 'supplier', 'supplier name', 'company', 'company name', 'party', 'party name', 'distributor', 'نام', 'سپلائر'],
                contactPerson: ['contact person', 'contact name', 'person', 'owner', 'salesman', 'representative'],
                phone: ['phone', 'mobile', 'mobile no', 'mobile number', 'phone no', 'phone number', 'contact', 'contact no', 'contact number', 'cell', 'cell no', 'whatsapp', 'فون', 'موبائل'],
                city: ['city', 'town', 'area', 'شہر'], address: ['address', 'addr', 'location', 'پتہ'],
                balance: ['balance', 'opening balance', 'old balance', 'payable', 'due', 'amount due', 'outstanding', 'closing balance', 'current balance', 'بقایا'],
                email: ['email', 'e mail', 'email address'], notes: ['notes', 'note', 'remarks', 'remark', 'comment', 'comments'],
            },
            contains: [['contactPerson', /\b(person|owner|salesman)\b/], ['balance', /\b(balance|due|outstanding|payable)\b/], ['phone', /\b(phone|mobile|cell|contact|whatsapp)\b/],
                ['email', /\bmail\b/], ['address', /\baddress\b/], ['city', /\bcity\b/], ['notes', /\b(note|remark|comment)/], ['name', /\b(name|company|supplier|vendor)\b/]],
            plain: ['name', 'phone', 'city', 'balance'],
            money: ['balance'],
            template: { file: 'hisabpro-vendors-template.csv', header: ['Company / vendor name', 'Contact person', 'Mobile', 'City', 'Address', 'Old balance', 'Notes'],
                rows: [['Faisal Flour Mills', 'Haji Saleem', '0300-1112233', 'Faisalabad', '', '150000', 'flour, suji'], ['Unilever Distributor', 'Imran', '0333-4445566', 'Lahore', '', '0', '']] },
        },
    };
    const schemaOf = kind => SCHEMAS[kind] || SCHEMAS.product;
    // kept for the product dialog and older callers
    const FIELDS = SCHEMAS.product.fields, PLAIN_ORDER = SCHEMAS.product.plain;

    // CSV text → rows of cells. Quoted cells may hold commas, quotes ("") and line breaks; the separator is found from the
    // first line (comma, semicolon or tab — Excel saves semicolons in some countries).
    function parse(text) {
        text = String(text || '').replace(/^﻿/, '');
        const first = text.split(/\r?\n/, 1)[0] || '';
        const count = ch => first.split(ch).length - 1;
        const sep = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0];
        const rows = [];
        let row = [], cur = '', quoted = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (quoted) {
                if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false; else cur += c;
            } else if (c === '"') quoted = true;
            else if (c === sep) { row.push(cur); cur = ''; }
            else if (c === '\n' || c === '\r') {
                if (c === '\r' && text[i + 1] === '\n') i++;
                row.push(cur); rows.push(row); row = []; cur = '';
            } else cur += c;
        }
        if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
        return rows.map(r => r.map(s => s.trim())).filter(r => r.some(s => s !== ''));
    }

    // header cells → { columnIndex: field } (each field at most once; exact names first, then words they contain)
    function matchHeader(cells, kind) {
        const s = schemaOf(kind);
        const map = {}, taken = new Set();
        const n = cells.map(norm);
        n.forEach((h, i) => { for (const [f, names] of Object.entries(s.exact)) if (!taken.has(f) && names.includes(h)) { map[i] = f; taken.add(f); break; } });
        n.forEach((h, i) => { if (map[i] !== undefined || !h) return; for (const [f, re] of s.contains) if (!taken.has(f) && re.test(h)) { map[i] = f; taken.add(f); break; } });
        return map;
    }
    // is the first row a header? (two or more cells look like column names, or one does and it is the name column)
    function looksLikeHeader(cells, kind) {
        const fields = Object.values(matchHeader(cells, kind));
        return fields.length >= 2 || fields.includes('name');
    }
    // the whole file → { header: [...] | null, mapping: { col: field }, body: rows, firstLine, columns }
    function read(text, kind = 'product') {
        const table = parse(text);
        if (!table.length) return { header: null, mapping: {}, body: [], firstLine: 1, columns: 0, kind };
        const columns = Math.max(...table.map(r => r.length));
        if (looksLikeHeader(table[0], kind)) return { header: table[0], mapping: matchHeader(table[0], kind), body: table.slice(1), firstLine: 2, columns, kind };
        const mapping = {};
        schemaOf(kind).plain.forEach((f, i) => { if (i < columns) mapping[i] = f; });
        return { header: null, mapping, body: table, firstLine: 1, columns, kind };
    }

    // numbers as shops write them: "Rs 1,250.00", "1 250", "PKR 99", "(500)" for minus → "1250.00"; anything else is left
    // as written (the server then reports it by line)
    const cleanNumber = v => {
        const s = String(v == null ? '' : v).trim();
        let c = s.replace(/^(rs\.?|pkr|₨)\s*/i, '').replace(/[,\s]/g, '');
        if (/^\(\d*\.?\d+\)$/.test(c)) c = '-' + c.slice(1, -1);
        return /^-?\d*\.?\d+$/.test(c) ? c : s;
    };
    // dates: 2026-12-31, 31/12/2026, 31-12-26, 31.12.2026 → 2026-12-31 (day first, as in Pakistan)
    function cleanDate(v) {
        const s = String(v == null ? '' : v).trim();
        if (!s) return '';
        let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
        if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
        m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
        if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        return s;
    }

    // rows for the server: amounts in paisa (toPaisa from the page), quantities and dates cleaned, the file's line numbers
    function toRows(file, mapping, toPaisa) {
        const s = schemaOf(file.kind);
        const out = [];
        file.body.forEach((cells, k) => {
            const get = f => { const col = Object.keys(mapping).find(c => mapping[c] === f); return col === undefined ? '' : String(cells[col] == null ? '' : cells[col]).trim(); };
            const row = { line: file.firstLine + k };
            for (const [f] of s.fields) {
                if (f === 'variant') continue;
                const v = get(f);
                if ((s.money || []).includes(f)) { const c = cleanNumber(v); row[f] = c === '' ? '' : (/^-?\d*\.?\d+$/.test(c) ? toPaisa(c) : c); }
                else if ((s.qty || []).includes(f)) row[f] = cleanNumber(v);
                else if ((s.dates || []).includes(f)) row[f] = cleanDate(v);
                else row[f] = v;
            }
            const variant = s.fields.some(f => f[0] === 'variant') ? get('variant') : '';
            if (row.name && variant) row.name = `${row.name} (${variant})`;
            if (Object.entries(row).some(([k2, v]) => k2 !== 'line' && v !== '')) out.push(row);
        });
        return out;
    }

    return { SCHEMAS, FIELDS, PLAIN_ORDER, schemaOf, parse, matchHeader, looksLikeHeader, read, toRows, cleanNumber, cleanDate };
});
