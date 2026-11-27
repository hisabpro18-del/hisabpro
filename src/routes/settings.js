// Settings (Company Profile, Receipt & POS, Localization) and the read-only Users list of the client.
// In HisabPro only the super admin creates and changes users, so /users only reads.
const express = require('express');
const { prisma } = require('../db');
const { HttpError, str, need, num, bool, oneOf, isEmail } = require('../lib/http');
const { authenticate, requireTenant, can } = require('../auth');
const { audit } = require('../audit');
const settings = require('../services/settings');
const dates = require('../lib/dates');
const Perms = require('../../public/js/shared/permissions');

const router = express.Router();
router.use(authenticate);

const EDITABLE = ['company', 'receipt', 'numbering', 'localization', 'pos'];
const LOGO_MAX = 150 * 1024; // bytes of the image itself (kept small: the database plan is 500 MB)
const has = (b, k) => b[k] !== undefined;

// decoded size of a base64 data: URL
const dataUrlBytes = s => { const b64 = s.slice(s.indexOf(',') + 1); return Math.floor(b64.length * 3 / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0); };
function readLogo(v) {
    const s = String(v ?? '');
    if (!s) return '';
    if (!/^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/]+={0,2}$/.test(s)) throw new HttpError(400, 'The logo must be a PNG or JPG image.');
    if (dataUrlBytes(s) > LOGO_MAX) throw new HttpError(400, 'The logo is larger than 150 KB. Choose a smaller image.');
    return s;
}
const isTz = z => { try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch { return false; } };
const PREFIX = /^[A-Za-z0-9\-_/#.]{1,12}$/;

// only the fields sent are checked and changed
const READ = {
    company(b) {
        const o = {};
        if (has(b, 'name')) o.name = need(b.name, 'Business name', 120);
        if (has(b, 'phone')) o.phone = str(b.phone, 40);
        if (has(b, 'email')) { o.email = str(b.email, 200); if (o.email && !isEmail(o.email)) throw new HttpError(400, 'Enter a valid email address.'); }
        if (has(b, 'taxId')) o.taxId = str(b.taxId, 60);
        if (has(b, 'address')) o.address = str(b.address, 300);
        if (has(b, 'logo')) o.logo = readLogo(b.logo);
        if (has(b, 'whatsapp')) {
            // the receipt QR opens wa.me/<number>: it needs a mobile (0300-1234567) or a number with its country code (+971 …)
            o.whatsapp = str(b.whatsapp, 30);
            const d = o.whatsapp.replace(/\D/g, '');
            if (o.whatsapp && !require('../services/sms').msisdn(o.whatsapp) && !(/^\s*(\+|00)/.test(o.whatsapp) && d.length >= 10 && d.length <= 17)) throw new HttpError(400, 'Enter the WhatsApp mobile number like 0300-1234567 (or +971 50 123 4567 outside Pakistan).');
        }
        return o;
    },
    receipt(b) {
        const o = {};
        if (has(b, 'paper')) o.paper = oneOf(b.paper, ['THERMAL', 'STANDARD'], 'Paper format');
        if (has(b, 'width')) o.width = oneOf(String(b.width), ['80', '58', 'A4', 'A5'], 'Paper width');
        if (has(b, 'template')) o.template = oneOf(b.template, ['STANDARD', 'COMPACT', 'SUPERMARKET'], 'Visual template');
        if (has(b, 'brandColor')) { o.brandColor = str(b.brandColor, 9); if (!/^#[0-9a-fA-F]{6}$/.test(o.brandColor)) throw new HttpError(400, 'Brand color must look like #4F46E5.'); o.brandColor = o.brandColor.toUpperCase(); }
        if (has(b, 'font')) o.font = oneOf(b.font, ['Inter', 'Roboto', 'Georgia', 'Times New Roman'], 'Typography');
        for (const k of ['showLogo', 'showTaxId', 'showCustomer', 'showMrp', 'showSavings', 'amountInWords', 'showTerms', 'showQr', 'showPrevBalance', 'showBank', 'showCashier', 'showSignature', 'autoPrint', 'showBarcode', 'showWhatsappQr', 'showShopName']) if (has(b, k)) o[k] = bool(b[k]);
        if (has(b, 'qrType')) o.qrType = oneOf(b.qrType, ['STANDARD', 'PAYMENT', 'TAX'], 'QR Code Type');
        if (has(b, 'copies')) { const n = num(b.copies, 'Default Print Copies', { min: 1, max: 3, allowEmpty: false }); if (!Number.isInteger(n)) throw new HttpError(400, 'Default Print Copies must be 1, 2 or 3.'); o.copies = n; }
        if (has(b, 'bankDetails')) o.bankDetails = str(b.bankDetails, 500);
        if (has(b, 'boldText')) o.boldText = bool(b.boldText);
        if (has(b, 'logoSize')) o.logoSize = oneOf(String(b.logoSize).toUpperCase(), ['S', 'M', 'L'], 'Logo size');
        if (has(b, 'textSize')) o.textSize = Number(oneOf(String(b.textSize), ['12', '13', '14'], 'Thermal text size'));
        return o;
    },
    numbering(b) {
        const o = {};
        for (const [k, label] of [['invoicePrefix', 'Invoice Prefix'], ['purchasePrefix', 'Purchase Prefix']]) {
            if (!has(b, k)) continue;
            o[k] = need(b[k], label, 12);
            if (!PREFIX.test(o[k])) throw new HttpError(400, `${label} can use letters, numbers and - _ / # . (up to 12).`);
        }
        if (has(b, 'footer')) o.footer = str(b.footer, 300);
        if (has(b, 'terms')) o.terms = str(b.terms, 1000);
        return o;
    },
    localization(b) {
        const o = {};
        if (has(b, 'currencySymbol')) o.currencySymbol = need(b.currencySymbol, 'Currency Symbol', 6);
        if (has(b, 'currencyCode')) { o.currencyCode = need(b.currencyCode, 'Currency Code', 10).toUpperCase(); if (!/^[A-Z]{3}$/.test(o.currencyCode)) throw new HttpError(400, 'Currency Code is 3 letters, e.g. PKR.'); }
        if (has(b, 'language')) o.language = oneOf(b.language, ['en', 'ur'], 'Language');
        if (has(b, 'timezone')) { o.timezone = need(b.timezone, 'Timezone', 60); if (!isTz(o.timezone)) throw new HttpError(400, `"${o.timezone}" is not a known time zone. Use a name like Asia/Karachi.`); }
        if (has(b, 'expiryReminderDays')) { const n = num(b.expiryReminderDays, 'Expiry Reminder (days)', { min: 1, max: 365, allowEmpty: false }); if (!Number.isInteger(n)) throw new HttpError(400, 'Expiry Reminder (days) must be a whole number.'); o.expiryReminderDays = n; }
        if (has(b, 'fiscalStartMonth')) { const n = num(b.fiscalStartMonth, 'Fiscal year start', { min: 1, max: 12, allowEmpty: false }); if (!Number.isInteger(n)) throw new HttpError(400, 'Fiscal year start must be a month (1–12).'); o.fiscalStartMonth = n; }
        return o;
    },
    pos(b) {
        const o = {};
        if (has(b, 'allowNegativeStock')) o.allowNegativeStock = bool(b.allowNegativeStock);
        if (has(b, 'defaultMode')) o.defaultMode = oneOf(b.defaultMode, ['VISUAL', 'BARCODE'], 'Default POS mode');
        if (has(b, 'wholesaleMode')) o.wholesaleMode = bool(b.wholesaleMode);
        return o;
    },
};

router.get('/', requireTenant, async (req, res) => {
    const all = await settings.getAll(req.user.tenantId);
    res.json(Object.fromEntries(EDITABLE.map(k => [k, all[k]])));
});

// ── Users (read-only) with the role mix and the last 7 days of activity ──
router.get('/users', can('settings.manage'), async (req, res) => {
    const t = req.user.tenantId;
    const users = await prisma.user.findMany({
        where: { tenantId: t, deletedAt: null }, orderBy: [{ createdAt: 'asc' }],
        select: { id: true, name: true, email: true, role: true, active: true, createdAt: true, lastLoginAt: true, permissions: true },
    });
    const tz = (await settings.get(t, 'localization')).timezone;
    const today = dates.ymd(new Date(), tz);
    const r = dates.range('custom', { from: dates.addDays(today, -6), to: today, tz });
    const [logins, sales] = await Promise.all([
        prisma.auditLog.findMany({ where: { tenantId: t, createdAt: { gte: r.from, lt: r.to }, action: 'auth.login' }, select: { action: true, createdAt: true } }),
        prisma.sale.findMany({ where: { tenantId: t, deletedAt: null, createdAt: { gte: r.from, lt: r.to } }, select: { createdAt: true } }),
    ]);
    const logs = [...logins, ...sales.map(s => ({ action: 'sale', createdAt: s.createdAt }))];
    const activity = r.days.map(d => ({ day: d, label: new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }), signIns: 0, sales: 0 }));
    const byDay = Object.fromEntries(activity.map(a => [a.day, a]));
    for (const l of logs) { const a = byDay[dates.ymd(l.createdAt, tz)]; if (a) a[l.action === 'auth.login' ? 'signIns' : 'sales']++; }
    const roles = { OWNER: 0, MANAGER: 0, CASHIER: 0 };
    for (const u of users) roles[u.role] = (roles[u.role] || 0) + 1;
    res.json({
        users: users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, roleLabel: u.role === 'OWNER' ? 'Admin' : Perms.ROLE_LABEL[u.role] || u.role, active: u.active, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, permissions: u.role === 'OWNER' ? Perms.ALL.length : Perms.parse(u.permissions).length })),
        roles, activity,
    });
});

router.put('/:key', can('settings.manage'), async (req, res) => {
    const key = req.params.key;
    if (!EDITABLE.includes(key)) throw new HttpError(404, 'Unknown settings section.');
    const patch = READ[key](req.body || {});
    if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to save.');
    const saved = await settings.put(req.user.tenantId, key, patch);
    const label = { company: 'Company Profile', receipt: 'Receipt & POS', numbering: 'Document numbering', localization: 'Localization', pos: 'POS preferences' }[key];
    await audit(req, { action: 'settings.update', summary: `${label} settings changed (${Object.keys(patch).filter(k => k !== 'logo').concat(patch.logo !== undefined ? ['logo'] : []).join(', ')})` });
    res.json(saved);
});

module.exports = { router, mount: '/api/settings' };
