const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');

// a real 1×1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('settings: read, validated saves, permissions, logo rules, read-only users', async t => {
    const h = await setup({ name: 'Settings Shop' });
    const cashier = await h.user('CASHIER');

    await t.test('any signed-in user of the client reads the settings', async () => {
        const r = await h.get('/api/settings');
        assert.equal(r.status, 200);
        assert.deepEqual(Object.keys(r.data).sort(), ['company', 'localization', 'numbering', 'pos', 'receipt']);
        assert.equal(r.data.company.name, 'Settings Shop');
        assert.equal(r.data.receipt.showLogo, true, 'spec default ON');
        assert.equal(r.data.receipt.showQr, false, 'spec default off');
        assert.equal(r.data.localization.expiryReminderDays, 30);
        assert.equal((await h.get('/api/settings', cashier)).status, 200);
    });

    await t.test('only settings.manage may save (a cashier gets 403)', async () => {
        assert.equal((await h.put('/api/settings/company', { name: 'Hacked' }, cashier)).status, 403);
        assert.equal((await h.get('/api/settings/users', cashier)).status, 403);
    });

    await t.test('company profile: name required, email checked, saved name reaches the session', async () => {
        assert.equal((await h.put('/api/settings/company', { name: '' })).status, 400);
        assert.equal((await h.put('/api/settings/company', { email: 'not-an-email' })).status, 400);
        const ok = await h.put('/api/settings/company', { name: 'Minha Traders', phone: '0315', email: 'shop@example.com', taxId: 'NTN-1', address: 'Sahiwal' });
        assert.equal(ok.status, 200, JSON.stringify(ok.data));
        assert.equal(ok.data.name, 'Minha Traders');
        const me = (await h.get('/api/auth/me')).data;
        assert.equal(me.tenant.name, 'Minha Traders');
        assert.equal(me.settings.company.address, 'Sahiwal');
    });

    await t.test('logo: PNG/JPEG data URL up to 150 KB; too large or another type is refused', async () => {
        const ok = await h.put('/api/settings/company', { logo: PNG });
        assert.equal(ok.status, 200, JSON.stringify(ok.data));
        assert.equal((await h.get('/api/settings')).data.company.logo, PNG);
        const big = 'data:image/png;base64,' + 'A'.repeat(Math.ceil(160 * 1024 * 4 / 3));
        const tooBig = await h.put('/api/settings/company', { logo: big });
        assert.equal(tooBig.status, 400);
        assert.match(tooBig.data.error, /150 KB/);
        assert.equal((await h.put('/api/settings/company', { logo: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' })).status, 400);
        assert.equal((await h.put('/api/settings/company', { logo: 'https://example.com/logo.png' })).status, 400);
        assert.equal((await h.get('/api/settings')).data.company.logo, PNG, 'a refused logo leaves the saved one');
        assert.equal((await h.put('/api/settings/company', { logo: '' })).data.logo, '', 'Remove logo');
    });

    await t.test('receipt & POS: choices and toggles checked', async () => {
        assert.equal((await h.put('/api/settings/receipt', { paper: 'FAX' })).status, 400);
        assert.equal((await h.put('/api/settings/receipt', { brandColor: 'blue' })).status, 400);
        assert.equal((await h.put('/api/settings/receipt', { copies: 5 })).status, 400);
        const ok = await h.put('/api/settings/receipt', { paper: 'STANDARD', width: 'A4', template: 'COMPACT', brandColor: '#059669', font: 'Georgia', showQr: true, showLogo: false, qrType: 'PAYMENT', copies: 2 });
        assert.equal(ok.status, 200, JSON.stringify(ok.data));
        assert.equal(ok.data.brandColor, '#059669');
        assert.equal(ok.data.showQr, true);
        assert.equal(ok.data.showLogo, false);
        assert.equal(ok.data.copies, 2);
        assert.equal(ok.data.showMrp, true, 'fields not sent keep their value');
        const pos = await h.put('/api/settings/pos', { allowNegativeStock: false, defaultMode: 'BARCODE' });
        assert.equal(pos.data.allowNegativeStock, false);
        assert.equal((await h.put('/api/settings/pos', { defaultMode: 'GRID' })).status, 400);
    });

    await t.test('numbering: prefixes checked, and the next sale uses the new invoice prefix', async () => {
        assert.equal((await h.put('/api/settings/numbering', { invoicePrefix: 'S A' })).status, 400);
        assert.equal((await h.put('/api/settings/numbering', { invoicePrefix: '' })).status, 400);
        const ok = await h.put('/api/settings/numbering', { invoicePrefix: 'SI-', footer: 'Shukriya!', terms: 'No returns after 7 days.' });
        assert.equal(ok.status, 200);
        await h.put('/api/settings/pos', { allowNegativeStock: true });
        const p = (await h.post('/api/inventory/products', { name: 'Tea', retailPrice: 10000, openingStock: 5 })).data.id;
        const sale = await h.post('/api/pos/sales', { items: [{ productId: p, qty: 1 }], payments: [{ method: 'CASH', amount: 10000 }] });
        assert.match(sale.data.number, /^SI-\d{4}$/);
    });

    await t.test('localization: time zone, currency code, reminder days and fiscal month checked', async () => {
        assert.equal((await h.put('/api/settings/localization', { timezone: 'Mars/Base' })).status, 400);
        assert.equal((await h.put('/api/settings/localization', { currencyCode: 'RUPEES' })).status, 400);
        assert.equal((await h.put('/api/settings/localization', { expiryReminderDays: 0 })).status, 400);
        assert.equal((await h.put('/api/settings/localization', { fiscalStartMonth: 13 })).status, 400);
        assert.equal((await h.put('/api/settings/localization', { currencySymbol: '' })).status, 400);
        const ok = await h.put('/api/settings/localization', { currencySymbol: 'Rs', currencyCode: 'pkr', language: 'ur', timezone: 'Asia/Dubai', expiryReminderDays: 45, fiscalStartMonth: 1 });
        assert.equal(ok.status, 200, JSON.stringify(ok.data));
        assert.equal(ok.data.currencyCode, 'PKR');
        assert.equal(ok.data.timezone, 'Asia/Dubai');
        assert.equal(ok.data.expiryReminderDays, 45);
        assert.equal((await h.put('/api/settings/financialSetup', { done: true })).status, 404, 'only the five screen sections are editable here');
    });

    await t.test('users: read-only list (no password data), role mix and 7 days of activity', async () => {
        const r = await h.get('/api/settings/users');
        assert.equal(r.status, 200);
        assert.equal(r.data.users.length, 2);
        const owner = r.data.users.find(u => u.role === 'OWNER');
        assert.equal(owner.roleLabel, 'Admin');
        assert.equal(owner.email, h.email);
        assert.ok(owner.createdAt);
        assert.ok(owner.lastLoginAt, 'signed in by the test');
        for (const u of r.data.users) for (const k of ['passwordHash', 'tokenVersion', 'failedLogins']) assert.ok(!(k in u), `${k} must not be sent`);
        assert.ok(!JSON.stringify(r.data).includes('$2'), 'no bcrypt hash anywhere');
        assert.deepEqual(r.data.roles, { OWNER: 1, MANAGER: 0, CASHIER: 1 });
        assert.equal(r.data.activity.length, 7);
        const today = r.data.activity[6];
        assert.ok(today.signIns >= 2, 'owner and cashier signed in today');
        assert.ok(today.sales >= 1);
        // nothing here creates or changes users
        assert.notEqual((await h.post('/api/settings/users', { name: 'x', email: 'x@y.z', role: 'MANAGER' })).status, 200);
        assert.notEqual((await h.put('/api/settings/users', { name: 'x' })).status, 200);
        assert.notEqual((await h.del('/api/settings/users')).status, 200);
    });
});
