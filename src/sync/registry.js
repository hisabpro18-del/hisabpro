// Which tables sync between the cloud and the desktop PCs, and in which direction.
// The Postgres triggers (prisma/migrations/0002_sync_triggers), the SQLite outbox triggers (scripts/gen-sqlite.js)
// and the push/pull code (src/sync/*) are all built from this one list.

// BOTH: made and changed on PCs and on the web
const BOTH = [
    'Setting', 'Category', 'Brand', 'Unit', 'Color', 'Size', 'Product', 'ProductSerial', 'StockMovement',
    'Party', 'LedgerEntry', 'Account', 'AccountTxn',
    'Sale', 'SaleItem', 'SalePayment', 'HeldSale', 'SaleReturn', 'SaleReturnItem',
    'Purchase', 'PurchaseItem', 'PurchaseReturn', 'PurchaseReturnItem',
    'Payment', 'ExpenseCategory', 'Expense', 'Cheque', 'CapitalTxn', 'Tax',
    'Employee', 'Shift', 'Attendance', 'LeaveRequest', 'Payslip', 'Advance', 'JobPosting', 'Candidate',
    'Appraisal', 'Disciplinary', 'AssetAssignment',
    'PaymentPromise', 'MessageLog', 'DayClose',
];
// PULL: only the server changes them (the super admin manages users and the client); PCs receive them
const PULL_ONLY = ['Tenant', 'User'];
// PUSH: PCs send them up but never receive them back
const PUSH_ONLY = ['AuditLog'];
// never synced: Device, ChangeLog, Counter, Secret

const SYNCED = [...PULL_ONLY, ...BOTH, ...PUSH_ONLY];
const PULLABLE = new Set([...PULL_ONLY, ...BOTH]);
const PUSHABLE = new Set([...BOTH, ...PUSH_ONLY]);

// Prisma delegate name of a model: Product → product, AuditLog → auditLog
const delegate = model => model.charAt(0).toLowerCase() + model.slice(1);

module.exports = { BOTH, PULL_ONLY, PUSH_ONLY, SYNCED, PULLABLE, PUSHABLE, delegate };
