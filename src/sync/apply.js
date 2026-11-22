// Turning synced JSON rows back into database rows, the same way on the server (push) and on a PC (pull).
const { MODELS } = require('../db');
const { delegate } = require('./registry');

// JSON (dates as ISO strings, BigInt as numbers) → values Prisma accepts, only the model's own scalar fields
function toData(model, row) {
    const fields = MODELS[model];
    if (!fields) throw new Error('Unknown table ' + model);
    const out = {};
    for (const f of fields) {
        if (!(f.name in row)) continue;
        const v = row[f.name];
        if (v === null || v === undefined) { out[f.name] = null; continue; }
        switch (f.type) {
            case 'DateTime': out[f.name] = new Date(v); break;
            case 'BigInt': out[f.name] = BigInt(Math.round(Number(v))); break;
            case 'Int': out[f.name] = Math.round(Number(v)); break;
            case 'Float': out[f.name] = Number(v); break;
            case 'Boolean': out[f.name] = v === true || v === 1 || v === 'true'; break;
            default: out[f.name] = String(v);
        }
    }
    return out;
}

// insert or update by id. lww: only overwrite when the incoming row is newer (server side). insertOnly: never update.
// returns 'created' | 'updated' | 'skipped'
async function upsertRow(db, model, data, { lww = false, tenantId, insertOnly = false } = {}) {
    const d = db[delegate(model)];
    const existing = await d.findUnique({ where: { id: data.id } });
    if (existing) {
        if (tenantId && model !== 'Tenant' && existing.tenantId !== tenantId) return 'skipped'; // never across clients
        if (insertOnly) return 'skipped';
        if (lww && existing.updatedAt && data.updatedAt && new Date(data.updatedAt) <= new Date(existing.updatedAt)) return 'skipped';
        const { id, ...rest } = data;
        await d.update({ where: { id }, data: rest });
        return 'updated';
    }
    await d.create({ data });
    return 'created';
}

module.exports = { toData, upsertRow };
