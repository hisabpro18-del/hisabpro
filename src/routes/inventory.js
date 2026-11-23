// Inventory: categories, brands, units, colours, sizes, products (variants, units, serials), stock adjustments, the POS catalog.
const express = require('express');
const { prisma, withTx, ci } = require('../db');
const { HttpError, str, need, num, bool, oneOf, date } = require('../lib/http');
const { B, N, paisa } = require('../lib/money');
const { authenticate, can } = require('../auth');
const { audit } = require('../audit');
const stock = require('../services/stock');
const limits = require('../limits');
const Calc = require('../../public/js/shared/calc');
const Perms = require('../../public/js/shared/permissions');

const router = express.Router();
router.use(authenticate);

const VIEW = can('inventory.add', 'inventory.edit', 'sales.create', 'purchases.manage', 'reports.view');
const ADD = can('inventory.add');
const EDIT = can('inventory.edit');

// ── master data (category, brand, unit, color, size) ──
const MASTER = {
    categories: {
        model: 'category', label: 'Category', order: [{ sortOrder: 'asc' }, { name: 'asc' }],
        read: b => ({ name: need(b.name, 'Name', 80), parentId: str(b.parentId, 60) || null, description: str(b.description, 300), color: str(b.color, 20), imageUrl: (() => { const u = str(b.imageUrl, 1000); if (u && !/^https:\/\//i.test(u)) throw new HttpError(400, 'Image URL must start with https://'); return u; })(), sortOrder: Math.round(num(b.sortOrder, 'Sort order', { max: 100000 })), active: b.active === undefined ? true : bool(b.active) }),
        usedBy: (tenantId, id) => prisma.product.count({ where: { tenantId, categoryId: id, deletedAt: null } }),
    },
    brands: {
        model: 'brand', label: 'Brand', order: [{ name: 'asc' }],
        read: b => ({ name: need(b.name, 'Name', 80), description: str(b.description, 300), active: b.active === undefined ? true : bool(b.active) }),
        usedBy: (tenantId, id) => prisma.product.count({ where: { tenantId, brandId: id, deletedAt: null } }),
    },
    units: {
        model: 'unit', label: 'Unit', order: [{ name: 'asc' }],
        read: b => ({ name: need(b.name, 'Name', 40), shortCode: need(b.shortCode, 'Short code', 12), isBase: bool(b.isBase) }),
        usedBy: async (tenantId, id) => prisma.product.count({ where: { tenantId, deletedAt: null, OR: [{ baseUnitId: id }, { altUnits: { contains: id } }] } }),
    },
    colors: {
        model: 'color', label: 'Color', order: [{ name: 'asc' }],
        read: b => { const hex = str(b.hex, 9); if (hex && !/^#[0-9a-fA-F]{3,8}$/.test(hex)) throw new HttpError(400, 'Hex must look like #EF4444.'); return { name: need(b.name, 'Name', 40), hex: hex ? hex.toUpperCase() : '#000000' }; },
        usedBy: (tenantId, id) => prisma.product.count({ where: { tenantId, colorId: id, deletedAt: null } }),
    },
    sizes: {
        model: 'size', label: 'Size', order: [{ sortOrder: 'asc' }, { name: 'asc' }],
        read: b => ({ name: need(b.name, 'Name', 20), sortOrder: Math.round(num(b.sortOrder, 'Sort order', { max: 100000 })) }),
        usedBy: (tenantId, id) => prisma.product.count({ where: { tenantId, sizeId: id, deletedAt: null } }),
    },
};
const master = kind => { const m = MASTER[kind]; if (!m) throw new HttpError(404, 'Not found.'); return m; };

router.get('/master/:kind', VIEW, async (req, res) => {
    const m = master(req.params.kind);
    const rows = await prisma[m.model].findMany({ where: { tenantId: req.user.tenantId, deletedAt: null }, orderBy: m.order });
    if (req.params.kind === 'categories') {
        const counts = await prisma.product.groupBy({ by: ['categoryId'], where: { tenantId: req.user.tenantId, deletedAt: null, parentId: null }, _count: true });
        return res.json(rows.map(r => ({ ...r, products: (counts.find(c => c.categoryId === r.id) || {})._count || 0 })));
    }
    res.json(rows);
});
router.post('/master/:kind', ADD, async (req, res) => {
    const m = master(req.params.kind);
    const data = m.read(req.body || {});
    const dupe = await prisma[m.model].findFirst({ where: { tenantId: req.user.tenantId, deletedAt: null, name: ci(data.name) } });
    if (dupe && dupe.name.toLowerCase() === data.name.toLowerCase()) throw new HttpError(400, `${m.label} "${data.name}" already exists.`);
    const row = await prisma[m.model].create({ data: { ...data, tenantId: req.user.tenantId } });
    await audit(req, { action: `inventory.${m.model}_create`, summary: `${m.label} "${row.name}" added` });
    res.json(row);
});
// categories / brands from a spreadsheet (core/importer.js): names unique (case-insensitive) in the file and in HisabPro;
// a category's parent is found by name (in HisabPro or the same file) and made when missing; loops are never made.
router.post('/master/:kind/import', ADD, async (req, res) => {
    const kind = req.params.kind;
    if (!['categories', 'brands'].includes(kind)) throw new HttpError(404, 'Not found.');
    const m = master(kind);
    const t = req.user.tenantId;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 3000) : [];
    if (!rows.length) throw new HttpError(400, 'The file has no rows.');
    const skipExisting = req.body.skipExisting === true;
    const all = await prisma[m.model].findMany({ where: { tenantId: t, deletedAt: null } });
    const existing = new Map(all.map(r => [r.name.toLowerCase(), r]));
    const problems = [], todo = [], seen = new Map();
    let skipped = 0;
    rows.forEach((r, i) => {
        const line = Number.isInteger(r.line) && r.line > 0 ? r.line : i + 1;
        const name = str(r.name, 80);
        if (!name) return problems.push(`Line ${line}: the name is empty.`);
        const k = name.toLowerCase();
        if (seen.has(k)) return problems.push(`Lines ${seen.get(k)} and ${line} have the same name "${name}".`);
        seen.set(k, line);
        if (existing.has(k)) { if (skipExisting) { skipped++; return; } return problems.push(`Line ${line}: ${m.label} "${name}" already exists.`); }
        const order = r.sortOrder === undefined || String(r.sortOrder).trim() === '' ? 0 : Number(r.sortOrder);
        if (!Number.isFinite(order)) problems.push(`Line ${line}: the sort order "${String(r.sortOrder).slice(0, 20)}" is not a number.`);
        todo.push({ line, name, parent: kind === 'categories' ? str(r.parent, 80) : '', description: str(r.description, 300), sortOrder: Number.isFinite(order) ? Math.max(0, Math.min(100000, Math.round(order))) : 0 });
    });
    if (problems.length) throw new HttpError(400, problems.slice(0, 15).join(' ') + (problems.length > 15 ? ` … and ${problems.length - 15} more.` : ''));
    if (!todo.length) return res.json({ imported: 0, skipped });
    const n = await withTx(t, async tx => {
        const idOf = new Map(all.map(r => [r.name.toLowerCase(), r.id]));
        const parentOf = new Map(all.map(r => [r.id, r.parentId || null]));
        const made = [];
        for (const r of todo) {
            const row = await tx[m.model].create({ data: kind === 'categories' ? { tenantId: t, name: r.name, description: r.description, sortOrder: r.sortOrder } : { tenantId: t, name: r.name, description: r.description } });
            idOf.set(r.name.toLowerCase(), row.id); parentOf.set(row.id, null); made.push([row, r]);
        }
        let extra = 0;
        if (kind === 'categories') for (const [row, r] of made) {
            if (!r.parent || r.parent.toLowerCase() === r.name.toLowerCase()) continue;
            let pid = idOf.get(r.parent.toLowerCase());
            if (!pid) { pid = (await tx.category.create({ data: { tenantId: t, name: r.parent } })).id; idOf.set(r.parent.toLowerCase(), pid); parentOf.set(pid, null); extra++; }
            // never a loop: the new parent must not be this category or one of its own sub-categories
            let up = pid, loop = false;
            for (let d = 0; up && d < 50; d++) { if (up === row.id) { loop = true; break; } up = parentOf.get(up); }
            if (loop) continue;
            await tx.category.update({ where: { id: row.id }, data: { parentId: pid } });
            parentOf.set(row.id, pid);
        }
        return made.length + extra;
    }, { timeout: 120000 });
    await audit(req, { action: `inventory.${m.model}_import`, summary: `${n} ${kind} imported from a file${skipped ? `, ${skipped} already in HisabPro skipped` : ''}` });
    res.json({ imported: n, skipped });
});

router.put('/master/:kind/:id', EDIT, async (req, res) => {
    const m = master(req.params.kind);
    const cur = await prisma[m.model].findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId, deletedAt: null } });
    if (!cur) throw new HttpError(404, `${m.label} not found.`);
    const data = m.read({ ...cur, ...req.body });
    const dupe = await prisma[m.model].findFirst({ where: { tenantId: req.user.tenantId, deletedAt: null, name: ci(data.name), id: { not: cur.id } } });
    if (dupe && dupe.name.toLowerCase() === data.name.toLowerCase()) throw new HttpError(400, `${m.label} "${data.name}" already exists.`);
    if (data.parentId === cur.id) throw new HttpError(400, 'A category cannot be its own parent.');
    const row = await prisma[m.model].update({ where: { id: cur.id }, data });
    await audit(req, { action: `inventory.${m.model}_update`, summary: `${m.label} "${cur.name}" changed${cur.name !== row.name ? ` (now "${row.name}")` : ''}` });
    res.json(row);
});
router.delete('/master/:kind/:id', EDIT, async (req, res) => {
    const m = master(req.params.kind);
    const cur = await prisma[m.model].findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId, deletedAt: null } });
    if (!cur) throw new HttpError(404, `${m.label} not found.`);
    const used = await m.usedBy(req.user.tenantId, cur.id);
    if (used) throw new HttpError(400, `${used} product(s) use this ${m.label.toLowerCase()}. Change them first.`);
    await prisma[m.model].update({ where: { id: cur.id }, data: { deletedAt: new Date() } });
    await audit(req, { action: `inventory.${m.model}_delete`, summary: `${m.label} "${cur.name}" deleted` });
    res.json({ ok: true });
});

// ── products ──
const TYPES = ['STANDARD', 'VARIANT', 'SERIAL', 'SERVICE'];
const parseUnits = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };

function readAltUnits(list, baseUnitId) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const u of list.slice(0, 10)) {
        if (!u || !u.unitId) continue;
        if (u.unitId === baseUnitId) throw new HttpError(400, 'An alternate unit cannot be the base unit.');
        const factor = num(u.factor, 'Conversion', { min: 0.0001, max: 1e6, allowEmpty: false });
        out.push({ unitId: String(u.unitId), factor, price: u.price === '' || u.price === null || u.price === undefined || Number(u.price) === 0 ? null : paisa(u.price, 'Unit price') });
    }
    if (new Set(out.map(u => u.unitId)).size !== out.length) throw new HttpError(400, 'Each alternate unit can be listed once.');
    return out;
}

function readProduct(b) {
    const type = oneOf(b.type, TYPES, 'Product type', 'STANDARD');
    return {
        type,
        name: need(b.name, 'Name', 160),
        formula: str(b.formula, 160),
        sku: type === 'VARIANT' ? '' : str(b.sku, 60),
        barcode: type === 'VARIANT' ? '' : str(b.barcode, 60),
        categoryId: str(b.categoryId, 60) || null,
        brandId: str(b.brandId, 60) || null,
        imageUrl: (() => { const u = String(b.imageUrl || ''); if (u.length > 90000) throw new HttpError(400, 'The image is too large (keep it under about 60 KB).'); if (u && !/^(https:\/\/|data:image\/(png|jpe?g|webp);base64,)/i.test(u)) throw new HttpError(400, 'Image URL must start with https://'); return u; })(),
        active: b.active === undefined ? true : bool(b.active),
        retailPrice: B(paisa(b.retailPrice, 'Retail price')),
        wholesalePrice: b.wholesalePrice === '' || b.wholesalePrice === null || b.wholesalePrice === undefined || Number(b.wholesalePrice) === 0 ? null : B(paisa(b.wholesalePrice, 'Wholesale price')),
        cost: B(paisa(b.cost, 'Cost')),
        taxRate: num(b.taxRate, 'Tax %', { max: 100 }),
        baseUnitId: str(b.baseUnitId, 60) || null,
        reorderLevel: type === 'SERVICE' ? 0 : num(b.reorderLevel === undefined ? 10 : b.reorderLevel, 'Reorder level', { max: 1e9 }),
        expiryDate: b.expiryDate ? date(b.expiryDate) : null,
        weighed: bool(b.weighed),
    };
}

// codes must lead to one product (case ignored)
async function assertCodesFree(tenantId, sku, barcode, exceptIds = []) {
    for (const [field, val, label] of [['sku', sku, 'SKU'], ['barcode', barcode, 'Barcode']]) {
        if (!val) continue;
        const hit = await prisma.product.findFirst({ where: { tenantId, deletedAt: null, id: { notIn: exceptIds }, [field]: ci(val) } });
        if (hit && String(hit[field]).toLowerCase() === val.toLowerCase()) throw new HttpError(400, `${label} "${val}" is already used by "${hit.name}".`);
    }
}

async function namesMaps(tenantId) {
    const [cats, brands, units, colors, sizes] = await Promise.all([
        prisma.category.findMany({ where: { tenantId }, select: { id: true, name: true } }),
        prisma.brand.findMany({ where: { tenantId }, select: { id: true, name: true } }),
        prisma.unit.findMany({ where: { tenantId }, select: { id: true, name: true, shortCode: true } }),
        prisma.color.findMany({ where: { tenantId }, select: { id: true, name: true, hex: true } }),
        prisma.size.findMany({ where: { tenantId }, select: { id: true, name: true, sortOrder: true } }),
    ]);
    const m = a => Object.fromEntries(a.map(x => [x.id, x]));
    return { cats: m(cats), brands: m(brands), units: m(units), colors: m(colors), sizes: m(sizes) };
}

function productView(p, maps, levels) {
    const alt = parseUnits(p.altUnits);
    return {
        id: p.id, type: p.type, name: p.name, formula: p.formula, sku: p.sku, barcode: p.barcode, categoryId: p.categoryId, brandId: p.brandId,
        category: p.categoryId && maps.cats[p.categoryId] ? maps.cats[p.categoryId].name : '', brand: p.brandId && maps.brands[p.brandId] ? maps.brands[p.brandId].name : '',
        parentId: p.parentId, colorId: p.colorId, sizeId: p.sizeId, variantLabel: p.variantLabel, imageUrl: p.imageUrl, active: p.active,
        retailPrice: N(p.retailPrice), wholesalePrice: p.wholesalePrice === null ? null : N(p.wholesalePrice), cost: N(p.cost), taxRate: p.taxRate,
        baseUnitId: p.baseUnitId, baseUnit: p.baseUnitId && maps.units[p.baseUnitId] ? maps.units[p.baseUnitId].shortCode : '',
        altUnits: alt.map(u => ({ ...u, name: maps.units[u.unitId] ? maps.units[u.unitId].shortCode : '?' })),
        reorderLevel: p.reorderLevel, expiryDate: p.expiryDate, weighed: p.weighed, stock: levels ? levels[p.id] || 0 : undefined, updatedAt: p.updatedAt,
    };
}

router.get('/products', VIEW, async (req, res) => {
    const t = req.user.tenantId;
    const q = str(req.query.q, 100);
    const where = { tenantId: t, deletedAt: null };
    if (req.query.parentsOnly !== '0') where.parentId = null; // the list shows a variant product once
    if (q) where.OR = [{ name: ci(q) }, { sku: ci(q) }, { barcode: ci(q) }, { formula: ci(q) }];
    if (req.query.categoryId) where.categoryId = String(req.query.categoryId);
    const list = await prisma.product.findMany({ where, orderBy: { name: 'asc' }, take: 5000 });
    const ids = list.map(p => p.id);
    // a variant parent shows the total stock of its children
    const children = await prisma.product.findMany({ where: { tenantId: t, deletedAt: null, parentId: { in: list.filter(p => p.type === 'VARIANT').map(p => p.id) } }, select: { id: true, parentId: true } });
    const levels = await stock.levels(t, [...ids, ...children.map(c => c.id)]);
    for (const c of children) levels[c.parentId] = Calc.q3((levels[c.parentId] || 0) + (levels[c.id] || 0));
    const maps = await namesMaps(t);
    res.json(list.map(p => ({ ...productView(p, maps, levels), variants: children.filter(c => c.parentId === p.id).length })));
});

router.get('/products/:id', VIEW, async (req, res) => {
    const t = req.user.tenantId;
    const p = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: t, deletedAt: null } });
    if (!p) throw new HttpError(404, 'Product not found.');
    const maps = await namesMaps(t);
    const variants = p.type === 'VARIANT' ? await prisma.product.findMany({ where: { tenantId: t, parentId: p.id, deletedAt: null }, orderBy: { name: 'asc' } }) : [];
    const levels = await stock.levels(t, [p.id, ...variants.map(v => v.id)]);
    const serials = p.type === 'SERIAL' ? await prisma.productSerial.findMany({ where: { tenantId: t, productId: p.id, deletedAt: null }, orderBy: { createdAt: 'asc' } }) : [];
    res.json({ ...productView(p, maps, levels), variants: variants.map(v => productView(v, maps, levels)), serials: serials.map(s => ({ id: s.id, serial: s.serial, status: s.status })) });
});

const serialLines = s => [...new Set(String(s || '').split(/[\n,]+/).map(x => x.trim()).filter(Boolean))].slice(0, 5000);

router.post('/products', ADD, async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const data = readProduct(b);
    data.altUnits = JSON.stringify(readAltUnits(b.altUnits, data.baseUnitId));
    const opening = data.type === 'SERVICE' || data.type === 'VARIANT' ? 0 : num(b.openingStock, 'Opening stock', { max: 1e9 });
    const serials = data.type === 'SERIAL' ? serialLines(b.serials) : [];
    const variants = data.type === 'VARIANT' ? readVariants(b.variants) : [];
    if (data.type === 'VARIANT' && !variants.length) throw new HttpError(400, 'Pick at least one colour or size for a variant product.');
    await assertCodesFree(t, data.sku, data.barcode);
    for (const v of variants) await assertCodesFree(t, v.sku, v.barcode);
    await limits.assertRoom(t, 'products', data.type === 'VARIANT' ? variants.length : 1);
    const maps = await namesMaps(t);
    const created = await withTx(t, async tx => {
        const p = await tx.product.create({ data: { ...data, tenantId: t } });
        if (opening) await stock.move(tx, { tenantId: t, productId: p.id, qty: opening, type: 'OPENING', unitCost: N(data.cost), refNo: 'Opening stock', userId: req.user.id });
        if (serials.length) {
            await tx.productSerial.createMany({ data: serials.map(s => ({ tenantId: t, productId: p.id, serial: s })) });
            if (!opening) await stock.move(tx, { tenantId: t, productId: p.id, qty: serials.length, type: 'OPENING', unitCost: N(data.cost), refNo: 'Opening serials', userId: req.user.id });
        }
        for (const v of variants) await createVariant(tx, t, p, data, v, maps, req.user.id);
        return p;
    });
    await audit(req, { action: 'inventory.product_create', summary: `Product "${created.name}" added (${data.type.toLowerCase()}${variants.length ? `, ${variants.length} variants` : ''}${opening ? `, opening stock ${opening}` : ''})` });
    res.json({ id: created.id });
});

function readVariants(list) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, 300).map(v => ({
        id: v.id ? String(v.id) : null, colorId: str(v.colorId, 60) || null, sizeId: str(v.sizeId, 60) || null,
        sku: str(v.sku, 60), barcode: str(v.barcode, 60),
        retailPrice: v.retailPrice === undefined || v.retailPrice === '' ? null : paisa(v.retailPrice, 'Variant price'),
        wholesalePrice: v.wholesalePrice === undefined || v.wholesalePrice === '' || Number(v.wholesalePrice) === 0 ? null : paisa(v.wholesalePrice, 'Variant wholesale price'),
        cost: v.cost === undefined || v.cost === '' ? null : paisa(v.cost, 'Variant cost'),
        openingStock: num(v.openingStock, 'Variant opening stock', { max: 1e9 }), active: v.active === undefined ? true : bool(v.active),
    })).filter(v => v.colorId || v.sizeId);
}
const variantLabel = (v, maps) => [v.colorId && maps.colors[v.colorId] ? maps.colors[v.colorId].name : '', v.sizeId && maps.sizes[v.sizeId] ? maps.sizes[v.sizeId].name : ''].filter(Boolean).join(' / ');

async function createVariant(tx, t, parent, data, v, maps, userId) {
    const label = variantLabel(v, maps);
    const child = await tx.product.create({ data: {
        tenantId: t, type: 'STANDARD', name: `${data.name} (${label})`, formula: data.formula, sku: v.sku, barcode: v.barcode, categoryId: data.categoryId, brandId: data.brandId,
        parentId: parent.id, colorId: v.colorId, sizeId: v.sizeId, variantLabel: label, imageUrl: data.imageUrl, active: v.active,
        retailPrice: v.retailPrice === null ? data.retailPrice : B(v.retailPrice), wholesalePrice: v.wholesalePrice === null ? data.wholesalePrice : B(v.wholesalePrice),
        cost: v.cost === null ? data.cost : B(v.cost), taxRate: data.taxRate, baseUnitId: data.baseUnitId, altUnits: data.altUnits, reorderLevel: data.reorderLevel, expiryDate: data.expiryDate, weighed: data.weighed,
    } });
    if (v.openingStock) await stock.move(tx, { tenantId: t, productId: child.id, qty: v.openingStock, type: 'OPENING', unitCost: N(child.cost), refNo: 'Opening stock', userId });
    return child;
}

router.put('/products/:id', EDIT, async (req, res) => {
    const t = req.user.tenantId;
    const cur = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: t, deletedAt: null } });
    if (!cur) throw new HttpError(404, 'Product not found.');
    const b = req.body || {};
    const data = readProduct({ ...b, type: cur.parentId ? 'STANDARD' : (b.type || cur.type) });
    if (cur.type === 'VARIANT' && data.type !== 'VARIANT') throw new HttpError(400, 'A variant product cannot change type.');
    if (cur.type !== 'VARIANT' && data.type === 'VARIANT') throw new HttpError(400, 'Create a new product of type Variant instead.');
    data.altUnits = JSON.stringify(readAltUnits(b.altUnits, data.baseUnitId));
    await assertCodesFree(t, data.sku, data.barcode, [cur.id]);
    const variants = cur.type === 'VARIANT' ? readVariants(b.variants) : [];
    const existing = cur.type === 'VARIANT' ? await prisma.product.findMany({ where: { tenantId: t, parentId: cur.id, deletedAt: null } }) : [];
    for (const v of variants) await assertCodesFree(t, v.sku, v.barcode, [cur.id, ...existing.map(e => e.id)]);
    const fresh = variants.filter(v => !v.id || !existing.some(e => e.id === v.id));
    if (fresh.length) await limits.assertRoom(t, 'products', fresh.length);
    const serials = cur.type === 'SERIAL' ? serialLines(b.serials) : [];
    const maps = await namesMaps(t);
    await withTx(t, async tx => {
        await tx.product.update({ where: { id: cur.id }, data });
        if (cur.type === 'VARIANT') {
            for (const e of existing) {
                const v = variants.find(x => x.id === e.id);
                const shared = { name: `${data.name} (${e.variantLabel})`, formula: data.formula, categoryId: data.categoryId, brandId: data.brandId, taxRate: data.taxRate, baseUnitId: data.baseUnitId, altUnits: data.altUnits, reorderLevel: data.reorderLevel, expiryDate: data.expiryDate, weighed: data.weighed, imageUrl: e.imageUrl || data.imageUrl };
                if (v) Object.assign(shared, { sku: v.sku, barcode: v.barcode, active: v.active, ...(v.retailPrice !== null ? { retailPrice: B(v.retailPrice) } : {}), ...(v.wholesalePrice !== null ? { wholesalePrice: B(v.wholesalePrice) } : {}), ...(v.cost !== null ? { cost: B(v.cost) } : {}) });
                await tx.product.update({ where: { id: e.id }, data: shared });
            }
            for (const v of fresh) await createVariant(tx, t, cur, data, v, maps, req.user.id);
        }
        if (serials.length) {
            const have = new Set((await tx.productSerial.findMany({ where: { tenantId: t, productId: cur.id, deletedAt: null } })).map(s => s.serial.toLowerCase()));
            const add = serials.filter(s => !have.has(s.toLowerCase()));
            if (add.length) {
                await tx.productSerial.createMany({ data: add.map(s => ({ tenantId: t, productId: cur.id, serial: s })) });
                await stock.move(tx, { tenantId: t, productId: cur.id, qty: add.length, type: 'ADJUSTMENT', unitCost: N(data.cost), refNo: 'Serials added', note: `${add.length} serial(s) added`, userId: req.user.id });
            }
        }
    });
    const changes = ['name', 'sku', 'barcode', 'retailPrice', 'wholesalePrice', 'cost', 'taxRate', 'active'].filter(k => String(cur[k]) !== String(data[k]));
    await audit(req, { action: 'inventory.product_update', summary: `Product "${cur.name}" changed${changes.length ? ': ' + changes.join(', ') : ''}${fresh.length ? `; ${fresh.length} variant(s) added` : ''}` });
    res.json({ ok: true });
});

router.delete('/products/:id', EDIT, async (req, res) => {
    const t = req.user.tenantId;
    const cur = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: t, deletedAt: null } });
    if (!cur) throw new HttpError(404, 'Product not found.');
    const now = new Date();
    await withTx(t, async tx => {
        await tx.product.update({ where: { id: cur.id }, data: { deletedAt: now } });
        if (cur.type === 'VARIANT') await tx.product.updateMany({ where: { tenantId: t, parentId: cur.id, deletedAt: null }, data: { deletedAt: now } });
    });
    await audit(req, { action: 'inventory.product_delete', summary: `Product "${cur.name}" deleted (its sales and stock history are kept)` });
    res.json({ ok: true });
});

// stock adjustment: by a difference (+/−) or to a counted quantity
router.post('/products/:id/adjust', EDIT, async (req, res) => {
    const t = req.user.tenantId;
    const p = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: t, deletedAt: null } });
    if (!p) throw new HttpError(404, 'Product not found.');
    if (p.type === 'SERVICE' || p.type === 'VARIANT') throw new HttpError(400, p.type === 'SERVICE' ? 'A service has no stock.' : 'Adjust each variant separately.');
    const b = req.body || {};
    const mode = oneOf(b.mode, ['DIFF', 'SET'], 'Mode', 'DIFF');
    const note = need(b.note, 'Reason', 200);
    const result = await withTx(t, async tx => {
        const now = await stock.level(t, p.id, tx);
        const qty = mode === 'SET' ? Calc.q3(num(b.qty, 'Counted quantity', { min: -1e9, max: 1e9, allowEmpty: false }) - now) : num(b.qty, 'Quantity', { min: -1e9, max: 1e9, allowEmpty: false });
        if (!qty) throw new HttpError(400, 'Nothing to change: the quantity is the same.');
        await stock.move(tx, { tenantId: t, productId: p.id, qty, type: 'ADJUSTMENT', unitCost: N(p.cost), refNo: 'Adjustment', note, userId: req.user.id });
        return { before: now, after: Calc.q3(now + qty), qty };
    });
    await audit(req, { action: 'inventory.stock_adjust', summary: `Stock of "${p.name}": ${result.before} → ${result.after} (${result.qty > 0 ? '+' : ''}${result.qty}); ${note}` });
    res.json(result);
});

router.get('/products/:id/movements', VIEW, async (req, res) => {
    const t = req.user.tenantId;
    const rows = await prisma.stockMovement.findMany({ where: { tenantId: t, productId: req.params.id, deletedAt: null }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 500 });
    res.json(rows.map(r => ({ id: r.id, date: r.date, type: r.type, qty: r.qty, refNo: r.refNo, note: r.note, unitCost: N(r.unitCost) })));
});

// CSV import: rows [{ name, sku, category, price (paisa), stock }]; categories are created by name when missing
// Products from a spreadsheet (CSV). The browser reads the file and matches its columns to these fields (any column order,
// common header names, or the plain Name, SKU, Category, Price, Stock order), and sends rows:
//   { line, name, sku, barcode, category, brand, unit, price, wholesale, cost (paisa), stock, expiry (YYYY-MM-DD) }
// skipExisting: rows whose SKU or barcode a product already has are left out (re-uploading a list adds only new ones).
router.post('/products/import', ADD, async (req, res) => {
    const t = req.user.tenantId;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 5000) : [];
    if (!rows.length) throw new HttpError(400, 'The file has no rows.');
    const skipExisting = req.body.skipExisting === true;
    const problems = [];
    const blank = v => v === undefined || v === null || String(v).trim() === '';
    const amount = (v, label, line) => {
        if (blank(v)) return null;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > 1e13) { problems.push(`Line ${line}: the ${label} "${String(v).slice(0, 40)}" is not a number.`); return null; }
        return Calc.round(n);
    };
    const clean = rows.map((r, i) => {
        const line = Number.isInteger(r.line) && r.line > 0 ? r.line : i + 1;
        const name = str(r.name, 160);
        if (!name) problems.push(`Line ${line}: the name is empty.`);
        const qty = blank(r.stock) ? 0 : Number(r.stock);
        if (!Number.isFinite(qty) || qty < 0 || qty > 1e9) problems.push(`Line ${line}: the stock "${String(r.stock).slice(0, 40)}" is not a number.`);
        const expiry = str(r.expiry, 10);
        if (expiry && (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || Number.isNaN(Date.parse(expiry + 'T00:00:00Z')))) problems.push(`Line ${line}: the expiry date "${expiry}" is not a date.`);
        return {
            line, name, sku: str(r.sku, 60), barcode: str(r.barcode, 60), category: str(r.category, 80), brand: str(r.brand, 80), unit: str(r.unit, 20),
            price: amount(r.price, 'price', line) || 0, wholesale: amount(r.wholesale, 'wholesale price', line), cost: amount(r.cost, 'cost', line) || 0,
            stock: Number.isFinite(qty) && qty > 0 ? Calc.q3(qty) : 0, expiry: expiry || null,
        };
    });
    // codes: unique in the file, and not already used by another product (or skipped when asked)
    const existing = await prisma.product.findMany({ where: { tenantId: t, deletedAt: null }, select: { name: true, sku: true, barcode: true } });
    const used = { sku: new Map(), barcode: new Map() };
    for (const p of existing) for (const f of ['sku', 'barcode']) if (p[f]) used[f].set(p[f].toLowerCase(), p.name);
    const inFile = { sku: new Map(), barcode: new Map() };
    let skipped = 0;
    for (const r of clean) {
        const taken = ['sku', 'barcode'].map(f => r[f] && used[f].get(r[f].toLowerCase()) ? [f, used[f].get(r[f].toLowerCase())] : null).find(Boolean);
        if (taken) {
            if (skipExisting) { r.skip = true; skipped++; continue; }
            problems.push(`Line ${r.line}: ${taken[0] === 'sku' ? 'SKU' : 'Barcode'} "${r[taken[0]]}" is already used by "${taken[1]}".`);
        }
        for (const f of ['sku', 'barcode']) {
            if (!r[f]) continue;
            const k = r[f].toLowerCase();
            if (inFile[f].has(k)) problems.push(`Lines ${inFile[f].get(k)} and ${r.line} have the same ${f === 'sku' ? 'SKU' : 'barcode'} "${r[f]}".`);
            else inFile[f].set(k, r.line);
        }
    }
    if (problems.length) throw new HttpError(400, problems.slice(0, 15).join(' ') + (problems.length > 15 ? ` … and ${problems.length - 15} more.` : ''));
    const todo = clean.filter(r => !r.skip);
    if (!todo.length) return res.json({ imported: 0, skipped });
    await limits.assertRoom(t, 'products', todo.length);
    const n = await withTx(t, async tx => {
        const units = await tx.unit.findMany({ where: { tenantId: t, deletedAt: null } });
        const unitOf = new Map();
        for (const u of units) for (const k of [u.shortCode, u.name]) if (k) unitOf.set(k.toLowerCase(), u.id);
        const pcs = unitOf.get('pcs') || (units[0] && units[0].id) || null;
        const cats = new Map((await tx.category.findMany({ where: { tenantId: t, deletedAt: null } })).map(c => [c.name.toLowerCase(), c.id]));
        const brands = new Map((await tx.brand.findMany({ where: { tenantId: t, deletedAt: null } })).map(c => [c.name.toLowerCase(), c.id]));
        const idFor = async (map, model, name) => {
            if (!name) return null;
            const k = name.toLowerCase();
            if (!map.has(k)) map.set(k, (await tx[model].create({ data: { tenantId: t, name } })).id);
            return map.get(k);
        };
        for (const r of todo) {
            const p = await tx.product.create({ data: {
                tenantId: t, type: 'STANDARD', name: r.name, sku: r.sku, barcode: r.barcode,
                categoryId: await idFor(cats, 'category', r.category), brandId: await idFor(brands, 'brand', r.brand),
                retailPrice: B(r.price), wholesalePrice: r.wholesale ? B(r.wholesale) : null, cost: B(r.cost),
                baseUnitId: (r.unit && unitOf.get(r.unit.toLowerCase())) || pcs, expiryDate: r.expiry ? new Date(r.expiry + 'T00:00:00Z') : null,
            } });
            if (r.stock) await stock.move(tx, { tenantId: t, productId: p.id, qty: r.stock, type: 'OPENING', refNo: 'CSV import', userId: req.user.id });
        }
        return todo.length;
    }, { timeout: 180000 });
    await audit(req, { action: 'inventory.product_import', summary: `${n} product(s) imported from a file${skipped ? `, ${skipped} already in HisabPro skipped` : ''}` });
    res.json({ imported: n, skipped });
});

// ── the POS catalog: everything sellable, with stock, prices, units and category names ──
router.get('/catalog', can('sales.create', 'purchases.manage', 'inventory.add', 'inventory.edit'), async (req, res) => {
    const t = req.user.tenantId;
    const list = await prisma.product.findMany({ where: { tenantId: t, deletedAt: null, active: true, type: { not: 'VARIANT' } }, orderBy: { name: 'asc' } });
    const maps = await namesMaps(t);
    const levels = await stock.levels(t, list.map(p => p.id));
    const serialCounts = await prisma.productSerial.groupBy({ by: ['productId'], where: { tenantId: t, deletedAt: null, status: 'IN_STOCK' }, _count: true });
    // cashiers do not see what the shop paid for goods
    const seeCost = ['inventory.add', 'inventory.edit', 'purchases.manage', 'reports.view'].some(k => Perms.has(req.user, k));
    res.json(list.map(p => { const v = { ...productView(p, maps, levels), serialsInStock: (serialCounts.find(s => s.productId === p.id) || {})._count || 0 }; if (!seeCost) delete v.cost; return v; }));
});

// serials in stock of a product (POS picks one)
router.get('/products/:id/serials', can('sales.create', 'inventory.edit', 'purchases.manage'), async (req, res) => {
    const rows = await prisma.productSerial.findMany({ where: { tenantId: req.user.tenantId, productId: req.params.id, deletedAt: null, status: req.query.all ? undefined : 'IN_STOCK' }, orderBy: { serial: 'asc' } });
    res.json(rows.map(s => ({ id: s.id, serial: s.serial, status: s.status })));
});

module.exports = { router, mount: '/api/inventory', namesMaps, productView, parseUnits };
