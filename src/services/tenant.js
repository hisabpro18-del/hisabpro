// What a new client starts with: its settings, default units / colours / sizes, a Cash in Hand account and expense categories.
const settings = require('./settings');

const UNITS = [['Box', 'Box', true], ['Carton', 'Ctn', true], ['Dozen', 'Dzn', false], ['Gram', 'g', false], ['Inch', 'in', false], ['Kilogram', 'Kg', true],
    ['Liter', 'L', true], ['Meter', 'm', true], ['Milliliter', 'ML', false], ['Pack', 'Pack', false], ['Pieces', 'Pcs', true]];
const COLORS = [['Black', '#171717'], ['Blue', '#3B82F6'], ['Brown', '#92400E'], ['Gray', '#6B7280'], ['Green', '#22C55E'], ['Navy', '#1E3A8A'],
    ['Orange', '#F97316'], ['Pink', '#EC4899'], ['Purple', '#A855F7'], ['Red', '#EF4444'], ['White', '#FAFAFA'], ['Yellow', '#EAB308']];
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '28', '30', '32', '34', '36', '38', '40', '42', '44'];
const EXPENSE_CATEGORIES = ['Rent', 'Utilities', 'Salaries & Wages', 'Transport', 'Repairs & Maintenance', 'Marketing', 'Office Supplies', 'Miscellaneous'];
const SHIFTS = [['Morning', '09:00', '17:00', 15], ['Evening', '14:00', '22:00', 10], ['Night', '22:00', '06:00', 10]];

async function seedTenant(tx, tenantId, { name, mobile }) {
    await settings.put(tenantId, 'company', { name, phone: mobile || '' }, tx);
    for (const k of ['receipt', 'numbering', 'localization', 'pos', 'financialSetup']) await settings.put(tenantId, k, {}, tx);
    await tx.unit.createMany({ data: UNITS.map(([n, c, b]) => ({ tenantId, name: n, shortCode: c, isBase: b })) });
    await tx.color.createMany({ data: COLORS.map(([n, h]) => ({ tenantId, name: n, hex: h })) });
    await tx.size.createMany({ data: SIZES.map((n, i) => ({ tenantId, name: n, sortOrder: i + 1 })) });
    await tx.expenseCategory.createMany({ data: EXPENSE_CATEGORIES.map(n => ({ tenantId, name: n })) });
    await tx.shift.createMany({ data: SHIFTS.map(([n, a, b, g]) => ({ tenantId, name: n, startTime: a, endTime: b, graceMinutes: g })) });
    await tx.account.create({ data: { tenantId, name: 'Cash in Hand', type: 'CASH', isDefault: true } });
}

module.exports = { seedTenant, EXPENSE_CATEGORIES };
