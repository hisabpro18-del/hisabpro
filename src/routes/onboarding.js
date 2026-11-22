// "Getting started" checklist for a new shop (shown on the dashboard until every step is done or it is hidden).
const express = require('express');
const { prisma } = require('../db');
const { authenticate, requireTenant } = require('../auth');
const settings = require('../services/settings');

const router = express.Router();
router.use(authenticate, requireTenant);

router.get('/', async (req, res) => {
    const t = req.user.tenantId;
    const where = { tenantId: t, deletedAt: null };
    const [company, fin, products, customers, sales, taxes, messages, purchases] = await Promise.all([
        settings.get(t, 'company'), settings.get(t, 'financialSetup'),
        prisma.product.count({ where }), prisma.party.count({ where: { ...where, type: 'CUSTOMER' } }), prisma.sale.count({ where }),
        prisma.tax.count({ where }), prisma.messageLog.count({ where }), prisma.purchase.count({ where }),
    ]);
    const steps = [
        { id: 'profile', label: 'Add your shop details and logo (they print on every bill)', done: !!(company.phone && company.address), href: '/settings' },
        { id: 'products', label: 'Add products — one by one, or import a CSV file', done: products > 0, href: '/products' },
        { id: 'opening', label: 'Set the opening cash in the drawer (Capital & Equity → setup)', done: !!fin.done, href: '/finance/capital' },
        { id: 'customers', label: 'Add your udhaar customers (shopkeepers) with their opening balance', done: customers > 0, href: '/customers' },
        { id: 'purchase', label: 'Record a purchase from a supplier (stock comes in)', done: purchases > 0, href: '/purchases' },
        { id: 'sale', label: 'Make your first sale on the POS (F9 to charge)', done: sales > 0, href: '/pos' },
        { id: 'taxes', label: 'Set up taxes, if you charge GST (optional)', done: taxes > 0, href: '/finance/taxes', optional: true },
        { id: 'reminder', label: 'Send a khata reminder on WhatsApp', done: messages > 0, href: '/khata', optional: true },
    ];
    res.json({ steps, done: steps.filter(s => s.done).length, total: steps.length });
});

module.exports = { router, mount: '/api/onboarding' };
