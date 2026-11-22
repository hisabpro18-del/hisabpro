// Roles and permission keys. The same file is used by the server (every route checks it) and the browser (menus and
// buttons). Only the super admin creates users and sets their role and permissions.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Perms = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const GROUPS = [
        { id: 'SALES', label: 'Sales', keys: [['sales.create', 'Create'], ['sales.view', 'View'], ['sales.delete', 'Returns & delete']] },
        { id: 'INVENTORY', label: 'Inventory', keys: [['inventory.add', 'Add'], ['inventory.edit', 'Edit']] },
        { id: 'PURCHASING', label: 'Purchasing & Parties', keys: [['purchases.manage', 'Purchases'], ['parties.manage', 'Customers & vendors']] },
        { id: 'FINANCE', label: 'Finance', keys: [['finance.manage', 'Payments, banks, expenses']] },
        { id: 'HRM', label: 'HRM & Payroll', keys: [['hrm.manage', 'Manage']] },
        { id: 'REPORTS', label: 'Reports', keys: [['reports.view', 'View']] },
        { id: 'SETTINGS', label: 'Settings', keys: [['settings.manage', 'Manage']] },
    ];
    const ALL = GROUPS.flatMap(g => g.keys.map(k => k[0]));
    const ROLES = ['OWNER', 'MANAGER', 'CASHIER'];
    const ROLE_LABEL = { SUPER_ADMIN: 'Super Admin', OWNER: 'Owner', MANAGER: 'Manager', CASHIER: 'Cashier' };
    // what a new user of that role starts with (the super admin can change each one)
    const PRESETS = {
        OWNER: ALL,
        MANAGER: ALL.filter(k => k !== 'settings.manage'),
        CASHIER: ['sales.create'], // the POS customer search / quick add needs only this; parties.manage edits balances and limits
    };

    const clean = list => ALL.filter(k => (Array.isArray(list) ? list : []).includes(k));
    const parse = s => { try { return clean(JSON.parse(s || '[]')); } catch { return []; } };
    // An owner always has everything; the others have what is ticked
    const has = (user, key) => !!user && (user.role === 'OWNER' || (user.permissions || []).includes(key));

    return { GROUPS, ALL, ROLES, ROLE_LABEL, PRESETS, clean, parse, has };
});
