// Fills a client with a realistic month of a wholesale + retail karyana / general store, through the real APIs:
// products (carton / piece / loose by kg), shopkeeper customers on udhaar, suppliers, purchases, 30 days of sales, khata
// payments and promises, expenses, staff and payroll. Usage: npm run seed:demo [-- "Client name"]   (default: Minha traders)
require('dotenv').config({ quiet: true });
BigInt.prototype.toJSON = function () { return Number(this); };
const { createApp } = require('../server');
const { prisma } = require('../src/db');

const CLIENT = process.argv[2] || 'Minha traders';
const DAY = 86400000;
let base, token;
async function call(method, p, body, tk = token) {
    const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${JSON.stringify(data)}`);
    return data;
}
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[rnd(0, a.length - 1)];
const rs = n => Math.round(n * 100); // rupees → paisa

// move a document (and everything it wrote) back to a past day, as if it happened then
async function backdate(id, when) {
    const t = { date: when, createdAt: when };
    await prisma.sale.updateMany({ where: { id }, data: t });
    await prisma.stockMovement.updateMany({ where: { refId: id }, data: t });
    await prisma.accountTxn.updateMany({ where: { refId: id }, data: t });
    await prisma.ledgerEntry.updateMany({ where: { refId: id }, data: t });
    await prisma.payment.updateMany({ where: { id }, data: t });
}

(async () => {
    const srv = createApp().listen(0);
    await new Promise(r => srv.once('listening', r));
    base = `http://127.0.0.1:${srv.address().port}`;
    const admin = (await call('POST', '/api/auth/login', { email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD }, null)).token;
    let tenant = (await call('GET', '/api/admin/clients?q=' + encodeURIComponent(CLIENT), null, admin)).find(c => c.name.toLowerCase() === CLIENT.toLowerCase());
    if (!tenant) {
        const id = (await call('POST', '/api/admin/clients', { name: CLIENT, mobile: '0300-1234567', ownerName: 'Shop Owner', ownerEmail: `owner@${CLIENT.toLowerCase().replace(/[^a-z0-9]+/g, '')}.demo`, ownerPassword: 'Owner@12345', plan: 'pro', accessUnit: 'YEAR', accessCount: 1 }, admin)).id;
        tenant = { id, name: CLIENT };
    }
    token = (await call('POST', `/api/admin/clients/${tenant.id}/workspace`, {}, admin)).token;
    console.log(`Seeding "${tenant.name}" …`);

    await call('PUT', '/api/settings/company', { name: tenant.name, phone: '0300-1234567', email: 'info@minhatraders.pk', taxId: '1234567-8', address: 'Shop 14, Akbari Mandi, Lahore' });
    await call('PUT', '/api/settings/receipt', { showPrevBalance: true, showSavings: true });
    await call('PUT', '/api/settings/numbering', { footer: 'شکریہ! Thank you for shopping with us.', terms: 'Goods once sold are not returnable without receipt. Expiry items exchanged within 3 days.' });

    const units = Object.fromEntries((await call('GET', '/api/inventory/master/units')).map(u => [u.shortCode, u.id]));
    const cats = {};
    for (const c of ['Detergents', 'Soap & Wash', 'Hair Care', 'Tea & Beverages', 'Cooking Oil & Ghee', 'Dairy', 'Spices', 'Grocery (Loose)', 'Cold Drinks & Water', 'Snacks & Biscuits', 'Toothpaste']) {
        const existing = (await call('GET', '/api/inventory/master/categories')).find(x => x.name.toLowerCase() === c.toLowerCase());
        cats[c] = existing ? existing.id : (await call('POST', '/api/inventory/master/categories', { name: c })).id;
    }
    const brands = {};
    for (const b of ['Unilever', 'Nestle', 'P&G', 'Shan', 'Tapal', 'Colgate', 'Coca-Cola', 'PepsiCo', 'Dalda', 'Local']) {
        const existing = (await call('GET', '/api/inventory/master/brands')).find(x => x.name === b);
        brands[b] = existing ? existing.id : (await call('POST', '/api/inventory/master/brands', { name: b })).id;
    }
    // [name, category, brand, base unit, retail per base, wholesale per base, cost per base, alt [[unit, factor]], opening, loose]
    const P = [
        ['Surf Excel 1kg', 'Detergents', 'Unilever', 'Ctn', 4800, 4650, 4400, [['Pcs', 12]], 20],
        ['Surf Excel 500g', 'Detergents', 'Unilever', 'Ctn', 5040, 4900, 4600, [['Pcs', 24]], 15],
        ['Ariel 1kg', 'Detergents', 'P&G', 'Ctn', 5160, 5000, 4750, [['Pcs', 12]], 12],
        ['Lux Soap 98g', 'Soap & Wash', 'Unilever', 'Ctn', 7200, 6960, 6600, [['Pcs', 72], ['Dzn', 6]], 10],
        ['Lifebuoy Soap 98g', 'Soap & Wash', 'Unilever', 'Ctn', 6480, 6264, 5900, [['Pcs', 72], ['Dzn', 6]], 10],
        ['Safeguard Soap 105g', 'Soap & Wash', 'P&G', 'Ctn', 7920, 7650, 7200, [['Pcs', 72], ['Dzn', 6]], 6],
        ['Sunsilk Shampoo 180ml', 'Hair Care', 'Unilever', 'Ctn', 9600, 9300, 8800, [['Pcs', 24]], 8],
        ['Clear Shampoo Sachet 8ml', 'Hair Care', 'Unilever', 'Ctn', 4800, 4650, 4400, [['Dzn', 30], ['Pcs', 360]], 10],
        ['Head & Shoulders 185ml', 'Hair Care', 'P&G', 'Ctn', 15600, 15100, 14200, [['Pcs', 24]], 4],
        ['Tapal Danedar 950g', 'Tea & Beverages', 'Tapal', 'Ctn', 15960, 15600, 14800, [['Pcs', 12]], 10],
        ['Lipton Yellow Label 190g', 'Tea & Beverages', 'Unilever', 'Ctn', 11040, 10750, 10100, [['Pcs', 24]], 8],
        ['Tapal Family Mixture 430g', 'Tea & Beverages', 'Tapal', 'Ctn', 15360, 14900, 14000, [['Pcs', 24]], 6],
        ['Dalda Cooking Oil 1L Pouch', 'Cooking Oil & Ghee', 'Dalda', 'Ctn', 7440, 7260, 6900, [['Pcs', 12]], 25],
        ['Dalda Banaspati 5kg Tin', 'Cooking Oil & Ghee', 'Dalda', 'Pcs', 2650, 2580, 2450, [], 30],
        ['Olpers Milk 1L', 'Dairy', 'Local', 'Ctn', 3600, 3480, 3300, [['Pcs', 12]], 20],
        ['Nestle Milkpak 1L', 'Dairy', 'Nestle', 'Ctn', 3720, 3600, 3420, [['Pcs', 12]], 20],
        ['Shan Biryani Masala 50g', 'Spices', 'Shan', 'Ctn', 9600, 9200, 8600, [['Pcs', 72], ['Dzn', 6]], 5],
        ['Shan Karahi Masala 50g', 'Spices', 'Shan', 'Ctn', 9600, 9200, 8600, [['Pcs', 72], ['Dzn', 6]], 5],
        ['National Salt 800g', 'Spices', 'Local', 'Ctn', 1800, 1700, 1550, [['Pcs', 24]], 15],
        ['Sugar (Cheeni)', 'Grocery (Loose)', 'Local', 'Kg', 165, 158, 150, [], 500, true],
        ['Basmati Rice', 'Grocery (Loose)', 'Local', 'Kg', 380, 365, 340, [], 300, true],
        ['Daal Chana', 'Grocery (Loose)', 'Local', 'Kg', 290, 280, 260, [], 150, true],
        ['Atta 10kg Bag', 'Grocery (Loose)', 'Local', 'Pcs', 1350, 1310, 1250, [], 60],
        ['Coca-Cola 1.5L', 'Cold Drinks & Water', 'Coca-Cola', 'Ctn', 1260, 1200, 1110, [['Pcs', 6]], 40],
        ['Pepsi 1.5L', 'Cold Drinks & Water', 'PepsiCo', 'Ctn', 1260, 1200, 1110, [['Pcs', 6]], 40],
        ['Nestle Pure Life 1.5L', 'Cold Drinks & Water', 'Nestle', 'Ctn', 720, 690, 640, [['Pcs', 6]], 30],
        ['Lays Masala 70g', 'Snacks & Biscuits', 'PepsiCo', 'Box', 1200, 1150, 1080, [['Pcs', 12]], 20],
        ['Peek Freans Sooper (Half Roll)', 'Snacks & Biscuits', 'Local', 'Box', 720, 690, 650, [['Pcs', 12]], 25],
        ['Colgate Toothpaste 100g', 'Toothpaste', 'Colgate', 'Ctn', 6480, 6260, 5900, [['Pcs', 36]], 6],
        ['Sensodyne 70g', 'Toothpaste', 'Local', 'Pcs', 450, 435, 400, [], 2],
    ];
    const existing = await call('GET', '/api/inventory/catalog');
    const products = [];
    let n = 0;
    for (const [name, cat, brand, bu, retail, wholesale, cost, alt, opening, loose] of P) {
        let p = existing.find(x => x.name === name);
        if (!p) {
            const id = (await call('POST', '/api/inventory/products', {
                name, categoryId: cats[cat], brandId: brands[brand], sku: 'MT' + String(++n).padStart(3, '0'), barcode: '2' + String(Date.now()).slice(-6) + String(n).padStart(5, '0'),
                baseUnitId: units[bu], altUnits: alt.map(([u, f]) => ({ unitId: units[u], factor: f })), retailPrice: rs(retail), wholesalePrice: rs(wholesale), cost: rs(cost),
                openingStock: opening, reorderLevel: loose ? 50 : 3, weighed: !!loose,
                expiryDate: /Milk|Olpers/.test(name) ? new Date(Date.now() + 20 * DAY).toISOString().slice(0, 10) : '',
            })).id;
            p = (await call('GET', '/api/inventory/catalog')).find(x => x.id === id);
        }
        products.push(p);
    }
    console.log(`  ${products.length} products`);

    // suppliers and customers (shopkeepers who buy wholesale on udhaar, plus a few retail regulars)
    const parties = await call('GET', '/api/parties');
    const party = async (type, name, extra) => parties.find(x => x.name === name && x.type === type) || call('POST', '/api/parties', { type, name, ...extra });
    const vendors = [];
    for (const [nm, ph, ob] of [['Unilever Distributor — Ravi Traders', '0301-4440001', 250000], ['Nestle Distributor — Shalimar Agency', '0301-4440002', 0], ['Shan Foods Agency', '0301-4440003', 80000], ['Local Grain Supplier — Haji Sahib', '0301-4440004', 0]])
        vendors.push(await party('VENDOR', nm, { phone: ph, paymentTerms: 'NET_15', openingBalance: rs(ob) }));
    const shops = [];
    for (const [nm, ph, limit, ob] of [['Bismillah General Store', '0300-1110001', 150000, 35000], ['Al-Madina Karyana', '0300-1110002', 100000, 12000], ['Ali Kiryana Store', '0300-1110003', 80000, 0], ['Faisal Traders', '0300-1110004', 200000, 60000], ['Usman Store (Gulberg)', '0300-1110005', 60000, 0], ['Rehman Mart', '0300-1110006', 120000, 18500], ['Shah Jee Store', '0300-1110007', 50000, 0], ['Sadiq Brothers', '0300-1110008', 0, 9000]])
        shops.push(await party('CUSTOMER', nm, { phone: ph, group: 'WHOLESALE', creditLimit: rs(limit), openingBalance: rs(ob), city: 'Lahore', notes: nm === 'Faisal Traders' ? 'Pays on Fridays after jumma' : '' }));
    const regulars = [];
    for (const [nm, ph] of [['Ahmed Raza', '0321-5550001'], ['Mrs. Kiran', '0321-5550002']]) regulars.push(await party('CUSTOMER', nm, { phone: ph, group: 'RETAIL' }));
    console.log(`  ${vendors.length} suppliers, ${shops.length + regulars.length} customers`);

    // opening cash, a bank account and taxes off (karyana)
    const accounts = await call('GET', '/api/finance/accounts');
    if (!accounts.find(a => a.type === 'BANK')) await call('POST', '/api/finance/accounts', { name: 'Meezan Bank — Current', type: 'BANK', bankName: 'Meezan Bank', accountNo: '0101-0123456789', openingBalance: rs(450000) });
    try { await call('POST', '/api/finance/capital/setup', { openingCapital: rs(2500000), openingCash: rs(150000) }); } catch { /* already set */ }

    const today = new Date();
    const dayAt = (daysAgo, h, m) => { const d = new Date(today.getTime() - daysAgo * DAY); d.setHours(h, m, rnd(0, 59), 0); return d; };
    // purchases over the month
    for (let i = 0; i < 6; i++) {
        const v = vendors[i % vendors.length];
        const lines = Array.from({ length: rnd(3, 6) }, () => pick(products)).filter((p, k, a) => a.indexOf(p) === k).map(p => ({ productId: p.id, unitId: p.baseUnitId, qty: p.weighed ? rnd(50, 150) : rnd(3, 10), cost: Math.round(p.cost * (0.98 + Math.random() * 0.04)) }));
        const when = new Date(today.getTime() - (28 - i * 5) * DAY).toISOString().slice(0, 10);
        const pur = await call('POST', '/api/purchases', { vendorId: v.id, date: when, items: lines, paid: 0, paymentMethod: 'CASH' });
        const full = await call('GET', '/api/purchases/' + pur.id);
        if (i % 2 === 0) await call('POST', `/api/purchases/${pur.id}/pay`, { amount: Math.round(full.total * 0.6), method: 'BANK', date: when });
    }
    console.log('  purchases done');

    // 30 days of sales: retail walk-ins, wholesale shopkeepers on udhaar (part payments)
    let count = 0;
    for (let d = 29; d >= 0; d--) {
        const perDay = rnd(6, 12);
        for (let k = 0; k < perDay; k++) {
            const wholesale = Math.random() < 0.4;
            const items = [];
            for (const p of Array.from({ length: wholesale ? rnd(3, 6) : rnd(1, 4) }, () => pick(products)).filter((p, i, a) => a.indexOf(p) === i)) {
                if (p.weighed) items.push({ productId: p.id, qty: wholesale ? rnd(10, 40) : rnd(1, 5) });
                else if (wholesale) items.push({ productId: p.id, unitId: p.baseUnitId, qty: rnd(1, 3) });
                else { const pcs = (p.altUnits || []).find(u => u.name === 'Pcs'); items.push({ productId: p.id, unitId: pcs ? pcs.unitId : p.baseUnitId, qty: rnd(1, 4) }); }
            }
            const body = wholesale
                ? { mode: 'CREDIT', customerId: pick(shops).id, priceMode: 'WHOLESALE', items, overrideLimit: true, payments: [] }
                : { mode: Math.random() < 0.1 ? 'CREDIT' : 'WALKIN', customerId: null, items, payments: [] };
            if (body.mode === 'CREDIT' && !body.customerId) body.customerId = pick(regulars).id;
            // price check without saving: total via a dry calculation is not offered, so pay after: walk-ins pay exact cash
            try {
                if (body.mode === 'WALKIN') body.payments = [{ method: Math.random() < 0.15 ? 'CARD' : 'CASH', amount: 1e12 }];
                let s;
                try { s = await call('POST', '/api/pos/sales', body); }
                catch (e) {
                    // walk-in with a too-large tender on card is refused: retry as exact cash
                    if (body.mode === 'WALKIN') { body.payments = [{ method: 'CASH', amount: 1e12 }]; s = await call('POST', '/api/pos/sales', body); } else throw e;
                }
                if (body.mode === 'CREDIT' && Math.random() < 0.5) {
                    // part payment at the counter on some wholesale bills (a second sale-linked payment through the khata)
                    const part = Math.round(s.total * (0.3 + Math.random() * 0.4) / 10000) * 10000;
                    if (part > 0) { const r = await call('POST', '/api/khata/receive', { partyId: body.customerId, amount: part, method: 'CASH', note: 'Part payment on ' + s.number }); await backdate(r.id, dayAt(d, 18, rnd(0, 59))); }
                }
                if (Number(s.change) > 0) await prisma.sale.update({ where: { id: s.id }, data: { tendered: BigInt(s.paid), change: 0n } }); // paid exact
                await backdate(s.id, dayAt(d, rnd(9, 21), rnd(0, 59)));
                count++;
            } catch (e) { if (!/stock/i.test(e.message)) console.log('  sale skipped:', e.message.slice(0, 160)); }
        }
    }
    console.log(`  ${count} sales over 30 days`);

    // a few returns
    const recent = (await call('GET', '/api/pos/sales?limit=40')).sales.filter(s => s.status === 'COMPLETED').slice(5, 8);
    for (const s of recent) { const full = await call('GET', '/api/pos/sales/' + s.id); await call('POST', '/api/pos/returns', { saleId: s.id, items: [{ saleItemId: full.items[0].id, qty: Math.min(1, full.items[0].qty), restock: true }], reason: 'Damaged packing' }); }

    // expenses through the month
    const ecats = await call('GET', '/api/finance/expense-categories');
    const cat = nm => (ecats.find(c => c.name === nm) || {}).id;
    for (const [nm, amt, ago, payee] of [['Rent', 85000, 20, 'Landlord — Mian Sahib'], ['Utilities', 23450, 12, 'LESCO electricity'], ['Utilities', 3200, 10, 'PTCL internet'], ['Transport', 4500, 15, 'Loader rickshaw'], ['Transport', 3800, 6, 'Loader rickshaw'], ['Repairs & Maintenance', 6500, 8, 'Freezer repair'], ['Miscellaneous', 1500, 3, 'Tea & refreshments']])
        await call('POST', '/api/finance/expenses', { categoryId: cat(nm), amount: rs(amt), payee, date: new Date(today.getTime() - ago * DAY).toISOString().slice(0, 10), method: 'CASH' });

    // khata promises: one due today, one overdue, one next week
    const iso = n2 => { const d = new Date(today.getTime() + n2 * DAY); return d.toISOString().slice(0, 10); };
    const summary = await call('GET', '/api/khata/summary');
    const owing = summary.rows.filter(r => r.balance > 0).sort((a, b) => b.balance - a.balance);
    if (owing[0]) await call('POST', '/api/khata/promises', { partyId: owing[0].id, amount: Math.round(owing[0].balance / 2 / 100) * 100, promisedDate: iso(0), note: 'Will pay after collection' });
    if (owing[1]) { const pr = await call('POST', '/api/khata/promises', { partyId: owing[1].id, amount: Math.round(owing[1].balance / 3 / 100) * 100, promisedDate: iso(0), note: 'Promised last week' }); await prisma.paymentPromise.update({ where: { id: pr.id }, data: { promisedDate: iso(-4), createdAt: new Date(today.getTime() - 10 * DAY) } }); }
    if (owing[2]) await call('POST', '/api/khata/promises', { partyId: owing[2].id, amount: Math.round(owing[2].balance / 100) * 100, promisedDate: iso(6), note: 'Full payment next week' });

    // staff and payroll
    const emps = await call('GET', '/api/hrm/employees');
    if (!emps.length) {
        for (const [nm, cnic, ph, dep, des, sal] of [['Muhammad Asif', '35202-1234567-1', '0333-7770001', 'Sales', 'Counter Salesman', 35000], ['Bilal Ahmed', '35202-1234567-3', '0333-7770002', 'Logistics', 'Delivery Rider', 28000], ['Sana Iqbal', '35202-1234567-4', '0333-7770003', 'Finance', 'Accountant', 45000]])
            await call('POST', '/api/hrm/employees', { name: nm, cnic, phone: ph, department: dep, designation: des, baseSalary: rs(sal), joinDate: '2026-01-10' });
        await call('POST', '/api/hrm/attendance/bulk-present', {});
    }
    console.log('  expenses, promises, staff done');
    console.log(`Done. Open the client in the super admin → Clients → "${tenant.name}" → Open workspace, or sign in as its owner.`);
    srv.close(); await prisma.$disconnect(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
