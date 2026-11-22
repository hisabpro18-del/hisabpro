// HisabPro plans and their limits. Used by the super admin screens and enforced by the server (src/limits.js).
// Prices are rupees per year and still to be decided by the owner of HisabPro.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Plans = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // limits: users, devices (desktop PCs), products; null = unlimited
    const PLANS = [
        { id: 'starter', name: 'Starter', price: 12000, limits: { users: 3, devices: 1, products: 1000 } },
        { id: 'pro', name: 'Pro', price: 30000, limits: { users: 15, devices: 5, products: 10000 } },
        { id: 'enterprise', name: 'Enterprise', price: 90000, limits: null },
    ];
    const plan = id => PLANS.find(p => p.id === id) || null;
    const limitOf = (planId, kind) => { const p = plan(planId); return p && p.limits ? p.limits[kind] ?? null : null; };
    return { PLANS, plan, limitOf };
});
