// Client settings: one row per key, id = `${tenantId}:${key}`, value = JSON merged over these defaults.
const { prisma } = require('../db');

const DEFAULTS = {
    company: { name: '', phone: '', email: '', taxId: '', address: '', logo: '' },
    receipt: {
        paper: 'THERMAL', width: '80', template: 'STANDARD', brandColor: '#4f46e5', font: 'Inter',
        showLogo: true, showTaxId: true, showCustomer: true, showMrp: true, showSavings: true, amountInWords: true,
        showTerms: true, showQr: false, showPrevBalance: false, showBank: false, showCashier: true, showSignature: false,
        qrType: 'STANDARD', autoPrint: false, copies: 1, bankDetails: '',
    },
    numbering: {
        invoicePrefix: 'INV-', purchasePrefix: 'PUR-',
        footer: 'Thank you for your business!',
        terms: 'Goods once sold are not returnable without receipt.',
    },
    localization: { currencySymbol: 'Rs', currencyCode: 'PKR', language: 'en', timezone: 'Asia/Karachi', expiryReminderDays: 30, fiscalStartMonth: 7 },
    pos: { allowNegativeStock: true, defaultMode: 'VISUAL', wholesaleMode: false },
    financialSetup: { done: false, openingCapital: 0, openingCash: 0 },
    // khata reminders: WhatsApp (one click, free) and SMS (automatic, through the shop's SMS gateway; the API key is a Secret)
    messaging: {
        language: 'ur', smsEnabled: false, provider: 'LOG', httpMethod: 'GET', urlTemplate: '', bodyTemplate: '', successText: '', senderId: '',
        autoPromise: true, daysBefore: 0, sendHour: 10, autoThanks: false, autoCreditSms: false,
        // every Urdu line starts with an Urdu word or an emoji: WhatsApp sets a line's direction from its first letter
        promiseUr: 'محترم {name} 🌹\n\n{shop} کی طرف سے یاد دہانی: آپ نے {when} {amount} کی ادائیگی کا وعدہ کیا تھا۔ 🔔\n\n💰 آپ کا موجودہ بقایا: {balance}\n\nبراہ کرم اپنی سہولت کے مطابق ادائیگی فرما دیں۔\n\n📞 رابطہ: {phone}\n\nشکریہ! 🙏\n{shop}',
        promiseEn: 'Dear {name},\n\nA reminder from {shop}: you promised to pay {amount} {whenEn}.\n\nYour current balance: {balance}\n\nPlease make the payment at your convenience.\nContact: {phone}\n\nThank you!\n{shop}',
        balanceUr: 'محترم {name} 🌹\n\n{shop} کے کھاتے میں آپ کا بقایا {balance} ہے۔\n\nبراہ کرم جلد از جلد ادائیگی فرما دیں۔ 🙏\n\n📞 رابطہ: {phone}\n{shop}',
        balanceEn: 'Dear {name},\n\nYour balance in the {shop} khata is {balance}.\n\nPlease clear it at your earliest convenience.\nContact: {phone}\n{shop}',
        thanksUr: 'محترم {name} 🌹\n\n{shop} میں آپ کی {amount} کی ادائیگی وصول ہو گئی۔ ✅\n\n💰 باقی بقایا: {balance}\n\nشکریہ! 🙏\n{shop}',
        thanksEn: 'Dear {name},\n\nWe have received your payment of {amount} at {shop}. Thank you!\n\nRemaining balance: {balance}\n{shop}',
        billUr: 'محترم {name} 🌹\n\n{shop} سے آپ کا بل {number}\n🧾 کل رقم: {total}\n✅ ادا شدہ: {paid}\n📌 بقایا: {due}\n\n💰 کل کھاتہ: {balance}\n\nشکریہ! 🙏',
        billEn: 'Dear {name},\n\nYour bill {number} from {shop}\nTotal: {total}\nPaid: {paid}\nDue: {due}\n\nKhata balance: {balance}\n\nThank you!',
    },
};
const KEYS = Object.keys(DEFAULTS);

const parse = s => { try { return JSON.parse(s) || {}; } catch { return {}; } };

async function get(tenantId, key, db = prisma) {
    const row = await db.setting.findUnique({ where: { id: `${tenantId}:${key}` } });
    // only this client's own, live row (the same rule as getAll)
    const own = row && row.tenantId === tenantId && !row.deletedAt;
    return { ...DEFAULTS[key], ...(own ? parse(row.value) : {}) };
}
async function getAll(tenantId, db = prisma) {
    const rows = await db.setting.findMany({ where: { tenantId, deletedAt: null } });
    const out = {};
    for (const k of KEYS) out[k] = { ...DEFAULTS[k], ...parse((rows.find(r => r.key === k) || {}).value) };
    return out;
}
// only the fields the defaults know are kept, with the default's type
async function put(tenantId, key, patch, db = prisma) {
    const cur = await get(tenantId, key, db);
    const next = { ...cur };
    for (const [k, dv] of Object.entries(DEFAULTS[key])) {
        if (patch[k] === undefined) continue;
        if (typeof dv === 'boolean') next[k] = patch[k] === true || patch[k] === 'true';
        else if (typeof dv === 'number') next[k] = Number(patch[k]) || 0;
        else next[k] = String(patch[k] ?? '').slice(0, k === 'logo' ? 700000 : 2000);
    }
    const id = `${tenantId}:${key}`;
    await db.setting.upsert({ where: { id }, create: { id, tenantId, key, value: JSON.stringify(next) }, update: { tenantId, key, value: JSON.stringify(next), deletedAt: null } });
    return next;
}

module.exports = { DEFAULTS, KEYS, get, getAll, put };
