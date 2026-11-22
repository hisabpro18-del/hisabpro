// Creates (or updates the password of) the one HisabPro super admin from SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD.
require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

(async () => {
    const email = String(process.env.SUPER_ADMIN_EMAIL || '').toLowerCase().trim();
    const password = String(process.env.SUPER_ADMIN_PASSWORD || '');
    if (!email || password.length < 8) throw new Error('Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (8+ characters) in .env');
    const prisma = new PrismaClient();
    const hash = await bcrypt.hash(password, 10);
    const existing = await prisma.user.findUnique({ where: { email } });
    // a changed password ends the sessions signed in with the old one
    const changed = existing && !(await bcrypt.compare(password, existing.passwordHash));
    await prisma.user.upsert({
        where: { email },
        create: { email, name: 'HisabPro Admin', passwordHash: hash, role: 'SUPER_ADMIN', permissions: '[]' },
        update: { passwordHash: hash, role: 'SUPER_ADMIN', active: true, tenantId: null, lockedUntil: null, failedLogins: 0, ...(changed ? { tokenVersion: { increment: 1 } } : {}) },
    });
    console.log(`Super admin ready: ${email}`);
    await prisma.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
