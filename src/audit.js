// Append-only activity log: who did what, when, from where. Never throws into the caller (a log failure must not undo work).
const { prisma } = require('./db');

let deviceIdOf = () => null; // set by the desktop sync module, so entries made on a PC carry its id
const setDeviceResolver = fn => { deviceIdOf = fn; };

async function audit(req, { action, summary, details, tenantId, db }) {
    try {
        const u = req && req.user;
        await (db || prisma).auditLog.create({
            data: {
                tenantId: tenantId !== undefined ? tenantId : (u && u.tenantId) || null,
                userId: u ? (u.impersonatedBy || u.id) : null,
                userEmail: u ? (u.impersonatedBy ? `${u.adminEmail} (as owner)` : u.email) : 'system',
                action,
                summary: String(summary).slice(0, 1000),
                details: details ? JSON.stringify(details).slice(0, 8000) : null,
                ip: (req && (req.ip || '')) || '',
                deviceId: deviceIdOf(),
            },
        });
    } catch (e) {
        console.error('audit failed:', e.message);
    }
}

module.exports = { audit, setDeviceResolver };
