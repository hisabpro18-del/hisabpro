// Running document numbers: INV-0001 on the web, INV-D1-0001 on desktop PC "D1" (each PC counts on its own, so numbers
// made offline never collide and a printed receipt never needs renumbering).
const state = require('../sync/state');

async function next(tx, tenantId, key) {
    const id = `${tenantId}:${key}`;
    const row = await tx.counter.upsert({ where: { id }, create: { id, tenantId, key, value: 1 }, update: { value: { increment: 1 } } });
    return row.value;
}

async function number(tx, tenantId, key, prefix, pad = 4) {
    const n = await next(tx, tenantId, key);
    const code = state.deviceCode();
    return `${prefix}${code ? code + '-' : ''}${String(n).padStart(pad, '0')}`;
}

module.exports = { next, number };
