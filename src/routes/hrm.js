// HRM & Payroll: employees (4-tab record with documents), shifts, attendance, leave requests, payroll and advances,
// recruitment (postings, candidates, pipeline), appraisals, warnings & rewards, asset assignments and the HR dashboard.
// Screens: public/js/pages/hrm.js. Spec: reference/REFERENCE.md "Part 4 — HRM & Payroll".
const express = require('express');
const { prisma, withTx, ci, MODELS } = require('../db');
const { HttpError, str, need, num, oneOf, date } = require('../lib/http');
const { B, N, paisa } = require('../lib/money');
const { ymd, startOf, addDays, DAY } = require('../lib/dates');
const { authenticate, can } = require('../auth');
const { audit } = require('../audit');
const treasury = require('../services/treasury');
const numbering = require('../services/numbering');
const settings = require('../services/settings');
const state = require('../sync/state');

const router = express.Router();
router.use(authenticate);
router.use(can('hrm.manage'));

const DEPARTMENTS = ['Sales', 'Logistics', 'Management', 'Operations', 'Finance', 'Human Resources'];
const BRANCHES = ['Head Office', 'Branch A', 'Branch B', 'Warehouse'];
const GENDERS = ['Male', 'Female', 'Other / Prefer not to say'];
const TAX_STATUS = ['Registered — NTN on file', 'Not registered', 'Exempt', 'Pending verification'];
const DOC_KINDS = { CNIC: 'CNIC Copy', CV: 'CV / Resume', EXPERIENCE: 'Experience Letter', CONTRACT: 'Employment Contract' };
const ATT_STATUS = ['PRESENT', 'LATE', 'ABSENT', 'HALF_DAY', 'LEAVE'];
const LEAVE_TYPES = ['Casual', 'Sick', 'Annual'];
const STAGES = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'];
const STAGE_LABEL = { APPLIED: 'Applied', SCREENING: 'Screening', INTERVIEW: 'Interviewing', OFFER: 'Offered', HIRED: 'Hired', REJECTED: 'Rejected' };
const ASSET_CATEGORIES = ['Laptop', 'Phone', 'Vehicle', 'Tablet', 'Access Card', 'Other'];
const ASSET_STATUS = ['IN_USE', 'RETURNED', 'DAMAGED'];
const SALARY_CATEGORY = 'Salaries & Wages';
const MAX_FILE = 600 * 1024; // bytes of one attached file (it is kept as a data: URL inside the row)
const FILE_TYPES = /^(application\/pdf|image\/(png|jpe?g|webp|gif)|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|text\/plain)$/i;

// ── small readers and helpers ──
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const isDay = s => DAY_RE.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
function day(v, label, dflt) {
    const s = str(v, 10) || dflt;
    if (!s || !isDay(s)) throw new HttpError(400, `${label}: choose a valid date.`);
    return s;
}
function monthOf(v, label, dflt) {
    const s = str(v, 7) || dflt;
    if (!s || !MONTH_RE.test(s)) throw new HttpError(400, `${label}: choose a valid month.`);
    return s;
}
function time(v, label) {
    const s = str(v, 5);
    if (s && !TIME_RE.test(s)) throw new HttpError(400, `${label} must look like 09:00.`);
    return s;
}
const mins = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY) + 1; // inclusive
const addMonths = (m, n) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
const monthLabel = m => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };
const monthRange = (m, tz) => ({ from: startOf(`${m}-01`, tz), to: startOf(`${addMonths(m, 1)}-01`, tz) });
const tzOf = async tenantId => (await settings.get(tenantId, 'localization')).timezone || 'Asia/Karachi';

// worked hours between two "HH:MM"; a check-out earlier than the check-in is the next morning (overnight shift)
function workedHours(checkIn, checkOut) {
    if (!checkIn || !checkOut) return 0;
    let d = mins(checkOut) - mins(checkIn);
    if (d < 0) d += 1440;
    return Math.round((d / 60) * 100) / 100;
}
// minutes after the shift start, in −720…719 (a night-shift arrival after midnight counts as late, not early)
const minutesLate = (checkIn, start) => ((((mins(checkIn) - mins(start) + 720) % 1440) + 1440) % 1440) - 720;
const autoStatus = (checkIn, shift) => (shift && checkIn && minutesLate(checkIn, shift.startTime) > (shift.graceMinutes || 0) ? 'LATE' : 'PRESENT');

// an attached file sent as a data: URL (PDF, image or Word), at most 600 KB
function dataUrl(v, label) {
    const s = String(v || '');
    if (!s) return '';
    const m = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/]+=*)$/i.exec(s);
    if (!m) throw new HttpError(400, `${label}: the file could not be read.`);
    if (!FILE_TYPES.test(m[1])) throw new HttpError(400, `${label}: use a PDF, an image or a Word file.`);
    const bytes = Math.floor((m[2].length * 3) / 4) - (m[2].endsWith('==') ? 2 : m[2].endsWith('=') ? 1 : 0);
    if (bytes > MAX_FILE) throw new HttpError(400, `${label} is larger than 600 KB.`);
    return s;
}

// employee columns without the documents (they can be megabytes; only the single-employee read loads them)
const EMP_SELECT = Object.fromEntries(MODELS.Employee.map(f => f.name).filter(n => n !== 'documents').map(n => [n, true]));
const parseDocs = s => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };

async function findEmployee(t, id, label = 'Employee') {
    if (!id) throw new HttpError(400, `${label}: choose an employee.`);
    const e = await prisma.employee.findFirst({ where: { id: String(id), tenantId: t, deletedAt: null }, select: EMP_SELECT });
    if (!e) throw new HttpError(400, `${label}: that employee was not found.`);
    return e;
}
// id → { name, code, department, … } for rows that point at employees (deleted ones keep their name).
// Inside withTx pass the tx as db: the desktop's SQLite has one connection, so the base client would wait forever.
async function employeeMap(t, ids, db = prisma) {
    const list = await db.employee.findMany({ where: { tenantId: t, id: { in: [...new Set(ids.filter(Boolean))] } }, select: { id: true, code: true, name: true, department: true, designation: true, status: true, phone: true, shiftId: true, deletedAt: true } });
    return Object.fromEntries(list.map(e => [e.id, e]));
}
const who = (map, id) => { const e = map[id]; return e ? { employeeName: e.name, employeeCode: e.code, department: e.department, designation: e.designation } : { employeeName: '(removed employee)', employeeCode: '', department: '', designation: '' }; };
async function findRow(model, t, id, label) {
    const row = await prisma[model].findFirst({ where: { id: String(id), tenantId: t, deletedAt: null } });
    if (!row) throw new HttpError(404, `${label} not found.`);
    return row;
}

// ── reference lists for the screens ──
router.get('/meta', async (req, res) => {
    const t = req.user.tenantId;
    const tz = await tzOf(t);
    const today = ymd(new Date(), tz);
    res.json({ departments: DEPARTMENTS, branches: BRANCHES, genders: GENDERS, taxStatus: TAX_STATUS, docKinds: DOC_KINDS, leaveTypes: LEAVE_TYPES, stages: STAGES, assetCategories: ASSET_CATEGORIES, today, month: today.slice(0, 7), timezone: tz });
});

// ═════════════════════════ Employees ═════════════════════════
function readEmployee(b) {
    const cnicDigits = str(b.cnic, 20).replace(/\D/g, '');
    if (!cnicDigits) throw new HttpError(400, 'CNIC is required.');
    if (cnicDigits.length !== 13) throw new HttpError(400, 'CNIC must have 13 digits, like 12345-1234567-1.');
    return {
        name: need(b.name, 'Full Name', 120),
        cnic: `${cnicDigits.slice(0, 5)}-${cnicDigits.slice(5, 12)}-${cnicDigits.slice(12)}`,
        phone: need(b.phone, 'Phone', 30),
        address: str(b.address, 500),
        dob: b.dob ? date(b.dob) : null,
        gender: oneOf(b.gender, GENDERS, 'Gender', 'Male'),
        branch: oneOf(b.branch, BRANCHES, 'Branch', 'Head Office'),
        department: oneOf(b.department, DEPARTMENTS, 'Department', 'Sales'),
        designation: need(b.designation, 'Designation', 120),
        joinDate: date(b.joinDate, new Date()),
        shiftId: str(b.shiftId, 60) || null,
        status: oneOf(b.status, ['ACTIVE', 'INACTIVE'], 'Status', 'ACTIVE'),
        baseSalary: B(paisa(b.baseSalary, 'Base Salary (Monthly)')),
        bankName: str(b.bankName, 120),
        iban: str(b.iban, 60).replace(/\s+/g, '').toUpperCase(),
        taxStatus: oneOf(b.taxStatus, TAX_STATUS, 'Tax / NTN Status', TAX_STATUS[0]),
    };
}
function readDocs(list) {
    if (!Array.isArray(list)) return [];
    const byKind = {};
    for (const d of list.slice(0, 8)) {
        if (!d || !DOC_KINDS[d.kind]) continue;
        const url = dataUrl(d.dataUrl, DOC_KINDS[d.kind]);
        if (url) byKind[d.kind] = { kind: d.kind, name: str(d.name, 160) || DOC_KINDS[d.kind], dataUrl: url };
    }
    return Object.values(byKind);
}
async function checkShift(t, shiftId) {
    if (!shiftId) return null;
    const s = await prisma.shift.findFirst({ where: { id: shiftId, tenantId: t, deletedAt: null } });
    if (!s) throw new HttpError(400, 'That shift was not found.');
    return s;
}
async function assertCnicFree(t, cnic, exceptId) {
    const hit = await prisma.employee.findFirst({ where: { tenantId: t, deletedAt: null, cnic, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { name: true, code: true } });
    if (hit) throw new HttpError(400, `CNIC ${cnic} already belongs to ${hit.name} (${hit.code}).`);
}
function employeeView(e, shifts, docs) {
    const s = e.shiftId && shifts[e.shiftId];
    return {
        id: e.id, code: e.code, name: e.name, cnic: e.cnic, phone: e.phone, address: e.address, dob: e.dob, gender: e.gender, branch: e.branch,
        department: e.department, designation: e.designation, joinDate: e.joinDate, shiftId: e.shiftId, shift: s ? s.name : '', shiftTimes: s ? `${s.startTime} – ${s.endTime}` : '',
        status: e.status, baseSalary: N(e.baseSalary), bankName: e.bankName, iban: e.iban, taxStatus: e.taxStatus, createdAt: e.createdAt,
        ...(docs ? { documents: docs } : {}),
    };
}
const shiftMap = async t => Object.fromEntries((await prisma.shift.findMany({ where: { tenantId: t } })).map(s => [s.id, s]));

router.get('/employees', async (req, res) => {
    const t = req.user.tenantId;
    const where = { tenantId: t, deletedAt: null };
    const q = str(req.query.q, 100);
    if (q) where.OR = [{ name: ci(q) }, { cnic: ci(q) }, { phone: ci(q) }, { code: ci(q) }];
    if (req.query.department) where.department = String(req.query.department);
    if (req.query.status) where.status = String(req.query.status);
    const [list, shifts] = await Promise.all([prisma.employee.findMany({ where, select: EMP_SELECT, orderBy: { code: 'asc' }, take: 5000 }), shiftMap(t)]);
    res.json(list.map(e => employeeView(e, shifts)));
});

// the code the next employee will get (shown read-only in the form; the real one is taken when saving)
router.get('/employees/next-code', async (req, res) => {
    const t = req.user.tenantId;
    const c = await prisma.counter.findUnique({ where: { id: `${t}:EMP` } });
    const code = state.deviceCode();
    res.json({ code: `EMP-${code ? code + '-' : ''}${String((c ? c.value : 0) + 1).padStart(4, '0')}` });
});

router.get('/employees/:id', async (req, res) => {
    const t = req.user.tenantId;
    const e = await findRow('employee', t, req.params.id, 'Employee');
    res.json(employeeView(e, await shiftMap(t), parseDocs(e.documents)));
});

router.post('/employees', async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const data = readEmployee(b);
    await checkShift(t, data.shiftId);
    await assertCnicFree(t, data.cnic);
    const docs = readDocs(b.documents);
    const e = await withTx(t, async tx => {
        const code = await numbering.number(tx, t, 'EMP', 'EMP-');
        return tx.employee.create({ data: { ...data, tenantId: t, code, documents: JSON.stringify(docs) }, select: { id: true, code: true, name: true } });
    });
    await audit(req, { action: 'hrm.employee_create', summary: `Employee "${e.name}" (${e.code}) added as ${data.designation}, ${data.department}${docs.length ? `, ${docs.length} document(s) attached` : ''}` });
    res.json({ id: e.id, code: e.code });
});

router.put('/employees/:id', async (req, res) => {
    const t = req.user.tenantId;
    const cur = await findRow('employee', t, req.params.id, 'Employee');
    const b = req.body || {};
    const data = readEmployee({ ...cur, baseSalary: N(cur.baseSalary), ...b });
    await checkShift(t, data.shiftId);
    await assertCnicFree(t, data.cnic, cur.id);
    if (Array.isArray(b.documents)) data.documents = JSON.stringify(readDocs(b.documents));
    await prisma.employee.update({ where: { id: cur.id }, data });
    const changes = ['name', 'cnic', 'phone', 'department', 'designation', 'branch', 'status', 'baseSalary', 'shiftId', 'bankName', 'iban'].filter(k => String(cur[k] ?? '') !== String(data[k] ?? ''));
    await audit(req, { action: 'hrm.employee_update', summary: `Employee "${cur.name}" (${cur.code}) changed${changes.length ? ': ' + changes.join(', ') : ''}${cur.status !== data.status ? ` (now ${data.status.toLowerCase()})` : ''}` });
    res.json({ ok: true });
});

// one document of an employee: { name, dataUrl } sets it, an empty dataUrl removes it (one file per request keeps bodies small)
router.put('/employees/:id/documents/:kind', async (req, res) => {
    const t = req.user.tenantId;
    const kind = oneOf(req.params.kind, Object.keys(DOC_KINDS), 'Document');
    const cur = await findRow('employee', t, req.params.id, 'Employee');
    const url = dataUrl((req.body || {}).dataUrl, DOC_KINDS[kind]);
    const docs = parseDocs(cur.documents).filter(d => d.kind !== kind);
    if (url) docs.push({ kind, name: str(req.body.name, 160) || DOC_KINDS[kind], dataUrl: url });
    await prisma.employee.update({ where: { id: cur.id }, data: { documents: JSON.stringify(docs) } });
    await audit(req, { action: 'hrm.employee_document', summary: `${DOC_KINDS[kind]} of "${cur.name}" (${cur.code}) ${url ? 'attached' : 'removed'}` });
    res.json({ ok: true, documents: docs.map(d => ({ kind: d.kind, name: d.name })) });
});

router.delete('/employees/:id', async (req, res) => {
    const t = req.user.tenantId;
    const cur = await prisma.employee.findFirst({ where: { id: req.params.id, tenantId: t, deletedAt: null }, select: EMP_SELECT });
    if (!cur) throw new HttpError(404, 'Employee not found.');
    await prisma.employee.update({ where: { id: cur.id }, data: { deletedAt: new Date() } });
    await audit(req, { action: 'hrm.employee_delete', summary: `Employee "${cur.name}" (${cur.code}) deleted (attendance, payslips and history are kept)` });
    res.json({ ok: true });
});

// ═════════════════════════ Shifts ═════════════════════════
router.get('/shifts', async (req, res) => {
    res.json(await prisma.shift.findMany({ where: { tenantId: req.user.tenantId, deletedAt: null }, orderBy: [{ name: 'asc' }, { createdAt: 'asc' }] }));
});
router.post('/shifts', async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const name = need(b.name, 'Shift Name', 60);
    const startTime = time(b.startTime, 'Start Time') || '09:00';
    const endTime = time(b.endTime, 'End Time') || '17:00';
    if (startTime === endTime) throw new HttpError(400, 'Start and end time cannot be the same.');
    const graceMinutes = Math.round(num(b.graceMinutes === '' || b.graceMinutes === undefined ? 15 : b.graceMinutes, 'Grace Period (Minutes)', { max: 240 }));
    const dupe = await prisma.shift.findFirst({ where: { tenantId: t, deletedAt: null, name: ci(name) } });
    if (dupe && dupe.name.toLowerCase() === name.toLowerCase()) throw new HttpError(400, `A shift named "${dupe.name}" already exists.`);
    const row = await prisma.shift.create({ data: { tenantId: t, name, startTime, endTime, graceMinutes } });
    await audit(req, { action: 'hrm.shift_create', summary: `Shift "${name}" added (${startTime} – ${endTime}, ${graceMinutes} min grace)` });
    res.json(row);
});
router.delete('/shifts/:id', async (req, res) => {
    const t = req.user.tenantId;
    const cur = await findRow('shift', t, req.params.id, 'Shift');
    const used = await prisma.employee.count({ where: { tenantId: t, deletedAt: null, shiftId: cur.id } });
    if (used) throw new HttpError(400, `${used} employee(s) are on the "${cur.name}" shift. Move them to another shift first.`);
    await prisma.shift.update({ where: { id: cur.id }, data: { deletedAt: new Date() } });
    await audit(req, { action: 'hrm.shift_delete', summary: `Shift "${cur.name}" deleted` });
    res.json({ ok: true });
});

// ═════════════════════════ Attendance ═════════════════════════
const attView = a => ({ id: a.id, employeeId: a.employeeId, date: a.date, shiftId: a.shiftId, checkIn: a.checkIn, checkOut: a.checkOut, status: a.status, hours: a.hours, note: a.note });
const emptySummary = () => ({ PRESENT: 0, LATE: 0, ABSENT: 0, HALF_DAY: 0, LEAVE: 0, UNMARKED: 0 });

// the roster of a day: every active employee (and anyone else marked that day), with their record if any
router.get('/attendance', async (req, res) => {
    const t = req.user.tenantId;
    const tz = await tzOf(t);
    const today = ymd(new Date(), tz);
    const d = day(req.query.date, 'Date', today);
    const [active, recs, shifts] = await Promise.all([
        prisma.employee.findMany({ where: { tenantId: t, deletedAt: null, status: 'ACTIVE' }, select: EMP_SELECT, orderBy: { code: 'asc' } }),
        prisma.attendance.findMany({ where: { tenantId: t, date: d, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
        shiftMap(t),
    ]);
    const byEmp = {};
    for (const r of recs) if (!byEmp[r.employeeId]) byEmp[r.employeeId] = r;
    const extraIds = Object.keys(byEmp).filter(id => !active.some(e => e.id === id));
    const extra = extraIds.length ? await prisma.employee.findMany({ where: { tenantId: t, id: { in: extraIds } }, select: EMP_SELECT }) : [];
    const summary = emptySummary();
    const rows = [...active, ...extra].map(e => {
        const r = byEmp[e.id];
        summary[r ? r.status : 'UNMARKED']++;
        const sid = r ? r.shiftId : e.shiftId;
        const s = sid && shifts[sid];
        return { employee: employeeView(e, shifts), record: r ? attView(r) : null, shift: s ? { id: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime, graceMinutes: s.graceMinutes } : null };
    });
    res.json({ date: d, today, rows, summary });
});

// mark (or re-mark) one employee for one day; status PRESENT/LATE is worked out from the shift start + grace
router.post('/attendance', async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const tz = await tzOf(t);
    const emp = await findEmployee(t, b.employeeId);
    const d = day(b.date, 'Date', ymd(new Date(), tz));
    const shiftId = b.shiftId === undefined ? emp.shiftId : str(b.shiftId, 60) || null;
    const shift = await checkShift(t, shiftId);
    let status = oneOf(b.status || 'AUTO', [...ATT_STATUS, 'AUTO'], 'Status');
    let checkIn = time(b.checkIn, 'Check-In Time'), checkOut = time(b.checkOut, 'Check-Out Time');
    if (status === 'AUTO' || status === 'PRESENT' || status === 'LATE') {
        if (!checkIn) throw new HttpError(400, 'Enter the check-in time, or choose a status such as Absent or On Leave.');
        status = autoStatus(checkIn, shift);
    }
    if (status === 'ABSENT' || status === 'LEAVE') { checkIn = ''; checkOut = ''; }
    const hours = workedHours(checkIn, checkOut);
    const note = str(b.note, 300);
    const { row, updated } = await withTx(t, async tx => {
        const existing = await tx.attendance.findMany({ where: { tenantId: t, employeeId: emp.id, date: d, deletedAt: null }, orderBy: { createdAt: 'asc' } });
        const data = { shiftId: shift ? shift.id : null, checkIn, checkOut, status, hours, note };
        if (!existing.length) return { row: await tx.attendance.create({ data: { ...data, tenantId: t, employeeId: emp.id, date: d } }), updated: false };
        // copies made offline on two PCs: keep the first, retire the rest
        if (existing.length > 1) await tx.attendance.updateMany({ where: { id: { in: existing.slice(1).map(x => x.id) } }, data: { deletedAt: new Date() } });
        return { row: await tx.attendance.update({ where: { id: existing[0].id }, data }), updated: true };
    });
    const label = status.replace('_', ' ').toLowerCase();
    await audit(req, { action: updated ? 'hrm.attendance_update' : 'hrm.attendance_create', summary: `Attendance of "${emp.name}" on ${d} ${updated ? 'changed to' : 'marked'} ${label}${checkIn ? ` (${checkIn}${checkOut ? `–${checkOut}, ${hours}h` : ''})` : ''}` });
    res.json({ ...attView(row), updated });
});

router.delete('/attendance/:id', async (req, res) => {
    const t = req.user.tenantId;
    const cur = await findRow('attendance', t, req.params.id, 'Attendance record');
    await prisma.attendance.update({ where: { id: cur.id }, data: { deletedAt: new Date() } });
    const m = await employeeMap(t, [cur.employeeId]);
    await audit(req, { action: 'hrm.attendance_delete', summary: `Attendance of "${who(m, cur.employeeId).employeeName}" on ${cur.date} cleared` });
    res.json({ ok: true });
});

// every active employee not yet marked that day → Present, with their shift's times (no shift: 09:00–17:00)
router.post('/attendance/bulk-present', async (req, res) => {
    const t = req.user.tenantId;
    const tz = await tzOf(t);
    const d = day((req.body || {}).date, 'Date', ymd(new Date(), tz));
    const shifts = await shiftMap(t);
    const result = await withTx(t, async tx => {
        const emps = await tx.employee.findMany({ where: { tenantId: t, deletedAt: null, status: 'ACTIVE' }, select: { id: true, shiftId: true } });
        const marked = new Set((await tx.attendance.findMany({ where: { tenantId: t, date: d, deletedAt: null }, select: { employeeId: true } })).map(r => r.employeeId));
        const todo = emps.filter(e => !marked.has(e.id));
        if (todo.length) {
            await tx.attendance.createMany({ data: todo.map(e => {
                const s = e.shiftId && shifts[e.shiftId] && !shifts[e.shiftId].deletedAt ? shifts[e.shiftId] : null;
                const checkIn = s ? s.startTime : '09:00', checkOut = s ? s.endTime : '17:00';
                return { tenantId: t, employeeId: e.id, date: d, shiftId: s ? s.id : null, checkIn, checkOut, status: 'PRESENT', hours: workedHours(checkIn, checkOut), note: 'Bulk marked present' };
            }) });
        }
        return { marked: todo.length, skipped: emps.length - todo.length };
    });
    await audit(req, { action: 'hrm.attendance_bulk', summary: `Bulk mark present for ${d}: ${result.marked} employee(s) marked, ${result.skipped} already marked` });
    res.json({ date: d, ...result });
});

// ═════════════════════════ Leave requests ═════════════════════════
const leaveView = (l, m) => ({ id: l.id, employeeId: l.employeeId, ...who(m, l.employeeId), type: l.type, fromDate: l.fromDate, toDate: l.toDate, days: l.days, reason: l.reason, status: l.status, decidedBy: l.decidedBy, createdAt: l.createdAt });
// days of a leave that fall inside [a, b]
const overlapDays = (l, a, b) => { const f = l.fromDate > a ? l.fromDate : a, to = l.toDate < b ? l.toDate : b; return to < f ? 0 : daysBetween(f, to); };

router.get('/leaves', async (req, res) => {
    const t = req.user.tenantId;
    const tz = await tzOf(t);
    const today = ymd(new Date(), tz);
    const year = today.slice(0, 4), mStart = today.slice(0, 7) + '-01', mEnd = addDays(addMonths(today.slice(0, 7), 1) + '-01', -1);
    const list = await prisma.leaveRequest.findMany({ where: { tenantId: t, deletedAt: null }, orderBy: [{ createdAt: 'desc' }], take: 2000 });
    const m = await employeeMap(t, list.map(l => l.employeeId));
    const approved = list.filter(l => l.status === 'APPROVED');
    const takenBy = {};
    for (const l of approved) {
        const n = overlapDays(l, `${year}-01-01`, `${year}-12-31`);
        if (!n) continue;
        const row = takenBy[l.employeeId] || (takenBy[l.employeeId] = { employeeId: l.employeeId, ...who(m, l.employeeId), Casual: 0, Sick: 0, Annual: 0, total: 0 });
        row[l.type] = (row[l.type] || 0) + n; row.total += n;
    }
    res.json({
        rows: list.map(l => leaveView(l, m)),
        stats: {
            pending: list.filter(l => l.status === 'PENDING').length,
            approvedThisMonth: approved.filter(l => overlapDays(l, mStart, mEnd) > 0).length,
            onLeaveToday: new Set(approved.filter(l => l.fromDate <= today && l.toDate >= today).map(l => l.employeeId)).size,
        },
        taken: Object.values(takenBy).sort((a, b) => b.total - a.total),
        year, today,
    });
});

router.post('/leaves', async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const tz = await tzOf(t);
    const today = ymd(new Date(), tz);
    const emp = await findEmployee(t, b.employeeId);
    const type = oneOf(b.type, LEAVE_TYPES, 'Leave Type', 'Casual');
    const fromDate = day(b.fromDate, 'From Date', today);
    const toDate = day(b.toDate, 'To Date', fromDate);
    if (toDate < fromDate) throw new HttpError(400, 'To Date must be on or after From Date.');
    const days = daysBetween(fromDate, toDate);
    if (days > 366) throw new HttpError(400, 'A leave request can cover at most one year.');
    const clash = await prisma.leaveRequest.findFirst({ where: { tenantId: t, deletedAt: null, employeeId: emp.id, status: { in: ['PENDING', 'APPROVED'] }, fromDate: { lte: toDate }, toDate: { gte: fromDate } } });
    if (clash) throw new HttpError(400, `${emp.name} already has a ${clash.status.toLowerCase()} leave from ${clash.fromDate} to ${clash.toDate}.`);
    const row = await prisma.leaveRequest.create({ data: { tenantId: t, employeeId: emp.id, type, fromDate, toDate, days, reason: str(b.reason, 500) } });
    await audit(req, { action: 'hrm.leave_create', summary: `${type} leave requested for "${emp.name}": ${fromDate} to ${toDate} (${days} day${days === 1 ? '' : 's'})` });
    res.json(leaveView(row, { [emp.id]: emp }));
});

// approve: the leave days not yet marked in attendance become LEAVE rows
router.post('/leaves/:id/approve', async (req, res) => {
    const t = req.user.tenantId;
    const cur = await findRow('leaveRequest', t, req.params.id, 'Leave request');
    if (cur.status !== 'PENDING') throw new HttpError(400, `This request is already ${cur.status.toLowerCase()}.`);
    const m = await employeeMap(t, [cur.employeeId]);
    const emp = m[cur.employeeId];
    const marked = await withTx(t, async tx => {
        const again = await tx.leaveRequest.findFirst({ where: { id: cur.id, deletedAt: null } });
        if (!again || again.status !== 'PENDING') throw new HttpError(400, 'This request was already decided.');
        await tx.leaveRequest.update({ where: { id: cur.id }, data: { status: 'APPROVED', decidedBy: req.user.name || req.user.email } });
        const days = [];
        for (let d = cur.fromDate; d <= cur.toDate && days.length < 400; d = addDays(d, 1)) days.push(d);
        const have = new Set((await tx.attendance.findMany({ where: { tenantId: t, employeeId: cur.employeeId, deletedAt: null, date: { gte: cur.fromDate, lte: cur.toDate } }, select: { date: true } })).map(a => a.date));
        const todo = days.filter(d => !have.has(d));
        if (todo.length) await tx.attendance.createMany({ data: todo.map(d => ({ tenantId: t, employeeId: cur.employeeId, date: d, shiftId: emp ? emp.shiftId : null, status: 'LEAVE', hours: 0, note: `${cur.type} leave (approved)` })) });
        return todo.length;
    });
    await audit(req, { action: 'hrm.leave_approve', summary: `${cur.type} leave of "${emp ? emp.name : 'employee'}" (${cur.fromDate} to ${cur.toDate}) approved; ${marked} day(s) marked On Leave` });
    res.json({ ok: true, marked });
});

router.post('/leaves/:id/reject', async (req, res) => {
    const t = req.user.tenantId;
    const cur = await findRow('leaveRequest', t, req.params.id, 'Leave request');
    if (cur.status !== 'PENDING') throw new HttpError(400, `This request is already ${cur.status.toLowerCase()}.`);
    await prisma.leaveRequest.update({ where: { id: cur.id }, data: { status: 'REJECTED', decidedBy: req.user.name || req.user.email } });
    const m = await employeeMap(t, [cur.employeeId]);
    await audit(req, { action: 'hrm.leave_reject', summary: `${cur.type} leave of "${who(m, cur.employeeId).employeeName}" (${cur.fromDate} to ${cur.toDate}) rejected` });
    res.json({ ok: true });
});

// delete a request; an approved one also clears the On Leave days it marked
router.delete('/leaves/:id', async (req, res) => {
    const t = req.user.tenantId;
    const cur = await findRow('leaveRequest', t, req.params.id, 'Leave request');
    const cleared = await withTx(t, async tx => {
        await tx.leaveRequest.update({ where: { id: cur.id }, data: { deletedAt: new Date() } });
        if (cur.status !== 'APPROVED') return 0;
        const r = await tx.attendance.updateMany({ where: { tenantId: t, employeeId: cur.employeeId, deletedAt: null, status: 'LEAVE', date: { gte: cur.fromDate, lte: cur.toDate } }, data: { deletedAt: new Date() } });
        return r.count;
    });
    const m = await employeeMap(t, [cur.employeeId]);
    await audit(req, { action: 'hrm.leave_delete', summary: `${cur.status.toLowerCase()} ${cur.type} leave of "${who(m, cur.employeeId).employeeName}" (${cur.fromDate} to ${cur.toDate}) deleted${cleared ? `; ${cleared} On Leave day(s) cleared` : ''}` });
    res.json({ ok: true });
});

// ═════════════════════════ Payroll ═════════════════════════
const remaining = a => N(a.amount) - N(a.recovered);
// open advances of an employee due on or before a month (oldest first)
const openAdvances = (db, t, employeeId, month) => db.advance.findMany({ where: { tenantId: t, employeeId, deletedAt: null, status: 'OPEN', deductionMonth: { lte: month } }, orderBy: [{ deductionMonth: 'asc' }, { date: 'asc' }, { createdAt: 'asc' }] });
const slipView = (p, m) => ({
    id: p.id, employeeId: p.employeeId, ...who(m, p.employeeId), month: p.month, basic: N(p.basic), allowances: N(p.allowances), deductions: N(p.deductions),
    advanceCut: N(p.advanceCut), net: N(p.net), status: p.status, accountId: p.accountId, paidAt: p.paidAt, note: p.note,
});
const accountMethod = a => (a.type === 'CASH' ? 'CASH' : a.type === 'WALLET' ? 'WALLET' : 'BANK');

router.get('/payroll', async (req, res) => {
    const t = req.user.tenantId;
    const tz = await tzOf(t);
    const cur = ymd(new Date(), tz).slice(0, 7);
    const month = monthOf(req.query.month, 'Month', cur);
    const months = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5));
    const end = monthRange(month, tz).to;
    const [slips, active, advances, paid, accounts] = await Promise.all([
        prisma.payslip.findMany({ where: { tenantId: t, month, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
        prisma.employee.findMany({ where: { tenantId: t, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true, designation: true, department: true, baseSalary: true, joinDate: true }, orderBy: { code: 'asc' } }),
        prisma.advance.findMany({ where: { tenantId: t, deletedAt: null, status: 'OPEN' }, select: { amount: true, recovered: true } }),
        prisma.payslip.groupBy({ by: ['month'], where: { tenantId: t, deletedAt: null, status: 'PAID', month: { in: months } }, _sum: { net: true } }),
        prisma.account.findMany({ where: { tenantId: t }, select: { id: true, name: true } }),
    ]);
    const m = await employeeMap(t, slips.map(s => s.employeeId));
    const have = new Set(slips.map(s => s.employeeId));
    const acc = Object.fromEntries(accounts.map(a => [a.id, a.name]));
    // a draft shows what paying it will really do: an advance another month's payslip already recovered is not taken twice
    const draftEmp = [...new Set(slips.filter(s => s.status === 'DRAFT').map(s => s.employeeId))];
    const openAdv = draftEmp.length ? await prisma.advance.findMany({ where: { tenantId: t, deletedAt: null, status: 'OPEN', employeeId: { in: draftEmp }, deductionMonth: { lte: month } }, select: { employeeId: true, amount: true, recovered: true } }) : [];
    const effective = s => {
        if (s.status !== 'DRAFT') return {};
        const owed = openAdv.filter(a => a.employeeId === s.employeeId).reduce((sum, a) => sum + remaining(a), 0);
        const cut = Math.min(N(s.advanceCut), owed);
        return { advanceCut: cut, net: N(s.basic) + N(s.allowances) - N(s.deductions) - cut };
    };
    const rows = slips.map(s => ({ ...slipView(s, m), ...effective(s), accountName: s.accountId ? acc[s.accountId] || '' : '' })).sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
    res.json({
        month, current: cur, label: monthLabel(month), rows,
        missing: active.filter(e => !have.has(e.id) && e.joinDate < end).map(e => ({ employeeId: e.id, employeeName: e.name, employeeCode: e.code, designation: e.designation, department: e.department, basic: N(e.baseSalary) })),
        stats: {
            total: rows.reduce((s, r) => s + r.net, 0), paid: rows.filter(r => r.status === 'PAID').reduce((s, r) => s + r.net, 0),
            drafts: rows.filter(r => r.status === 'DRAFT').length, generated: rows.length,
            outstandingAdvances: advances.reduce((s, a) => s + remaining(a), 0),
        },
        trend: months.map(mo => ({ month: mo, label: monthLabel(mo), net: N((paid.find(p => p.month === mo) || { _sum: {} })._sum.net) })),
    });
});

// draft payslips for active employees who have none for the month: basic = base salary, allowances = that month's
// reward bonuses, advance recovery = open advances due by that month (capped so net is never below zero)
router.post('/payroll/generate', async (req, res) => {
    const t = req.user.tenantId;
    const tz = await tzOf(t);
    const month = monthOf((req.body || {}).month, 'Month', ymd(new Date(), tz).slice(0, 7));
    const { from, to } = monthRange(month, tz);
    const created = await withTx(t, async tx => {
        const emps = await tx.employee.findMany({ where: { tenantId: t, deletedAt: null, status: 'ACTIVE', joinDate: { lt: to } }, select: { id: true, baseSalary: true } });
        const have = new Set((await tx.payslip.findMany({ where: { tenantId: t, month, deletedAt: null }, select: { employeeId: true } })).map(p => p.employeeId));
        const todo = emps.filter(e => !have.has(e.id));
        if (!todo.length) return 0;
        const ids = todo.map(e => e.id);
        const rewards = await tx.disciplinary.groupBy({ by: ['employeeId'], where: { tenantId: t, deletedAt: null, kind: 'REWARD', employeeId: { in: ids }, date: { gte: from, lt: to } }, _sum: { amount: true } });
        const advs = await tx.advance.findMany({ where: { tenantId: t, deletedAt: null, status: 'OPEN', employeeId: { in: ids }, deductionMonth: { lte: month } }, select: { employeeId: true, amount: true, recovered: true } });
        for (const e of todo) {
            const basic = N(e.baseSalary);
            const allowances = N((rewards.find(r => r.employeeId === e.id) || { _sum: {} })._sum.amount);
            const owed = advs.filter(a => a.employeeId === e.id).reduce((s, a) => s + remaining(a), 0);
            const advanceCut = Math.max(0, Math.min(owed, basic + allowances));
            await tx.payslip.create({ data: { tenantId: t, employeeId: e.id, month, basic: B(basic), allowances: B(allowances), deductions: B(0), advanceCut: B(advanceCut), net: B(basic + allowances - advanceCut), status: 'DRAFT' } });
        }
        return todo.length;
    });
    await audit(req, { action: 'hrm.payroll_generate', summary: `Payroll ${monthLabel(month)}: ${created} draft payslip(s) generated` });
    res.json({ month, created });
});

// edit a draft: allowances, deductions, advance recovery (at most what is outstanding, and never below a zero net), note
router.put('/payroll/:id', async (req, res) => {
    const t = req.user.tenantId;
    const cur = await findRow('payslip', t, req.params.id, 'Payslip');
    if (cur.status !== 'DRAFT') throw new HttpError(400, 'A paid payslip cannot be changed.');
    const b = req.body || {};
    const basic = N(cur.basic);
    const allowances = b.allowances === undefined ? N(cur.allowances) : paisa(b.allowances, 'Allowances');
    const deductions = b.deductions === undefined ? N(cur.deductions) : paisa(b.deductions, 'Deductions');
    const gross = basic + allowances - deductions;
    if (gross < 0) throw new HttpError(400, 'Deductions cannot be more than the basic salary plus allowances.');
    const owed = (await openAdvances(prisma, t, cur.employeeId, cur.month)).reduce((s, a) => s + remaining(a), 0);
    const wanted = b.advanceCut === undefined ? N(cur.advanceCut) : paisa(b.advanceCut, 'Advance recovery');
    if (b.advanceCut !== undefined && wanted > owed) throw new HttpError(400, `Only ${(owed / 100).toFixed(2)} of advances is outstanding for this employee.`);
    const advanceCut = Math.min(wanted, owed, gross);
    const net = gross - advanceCut;
    // only while it is still a draft: a pay from another screen in the meantime must not be overwritten
    const upd = await prisma.payslip.updateMany({ where: { id: cur.id, tenantId: t, status: 'DRAFT', deletedAt: null }, data: { allowances: B(allowances), deductions: B(deductions), advanceCut: B(advanceCut), net: B(net), note: b.note === undefined ? cur.note : str(b.note, 300) } });
    if (!upd.count) throw new HttpError(400, 'This payslip was paid or removed in the meantime. Reload the page.');
    const row = await prisma.payslip.findFirst({ where: { id: cur.id, tenantId: t } });
    const m = await employeeMap(t, [cur.employeeId]);
    await audit(req, { action: 'hrm.payslip_update', summary: `Draft payslip ${monthLabel(cur.month)} of "${who(m, cur.employeeId).employeeName}" changed: net ${(N(cur.net) / 100).toFixed(2)} → ${(net / 100).toFixed(2)}` });
    res.json(slipView(row, m));
});

router.delete('/payroll/:id', async (req, res) => {
    const t = req.user.tenantId;
    const cur = await findRow('payslip', t, req.params.id, 'Payslip');
    if (cur.status !== 'DRAFT') throw new HttpError(400, 'A paid payslip cannot be deleted.');
    const del = await prisma.payslip.updateMany({ where: { id: cur.id, tenantId: t, status: 'DRAFT', deletedAt: null }, data: { deletedAt: new Date() } });
    if (!del.count) throw new HttpError(400, 'This payslip was paid in the meantime, so it cannot be deleted.');
    const m = await employeeMap(t, [cur.employeeId]);
    await audit(req, { action: 'hrm.payslip_delete', summary: `Draft payslip ${monthLabel(cur.month)} of "${who(m, cur.employeeId).employeeName}" deleted` });
    res.json({ ok: true });
});

async function salaryCategory(tx, t) {
    const list = await tx.expenseCategory.findMany({ where: { tenantId: t, deletedAt: null, name: ci('Salaries') } });
    const hit = list.find(c => c.name.toLowerCase() === SALARY_CATEGORY.toLowerCase());
    if (hit) return hit;
    return tx.expenseCategory.create({ data: { tenantId: t, name: SALARY_CATEGORY } });
}
async function payingAccount(tx, t, accountId) {
    if (!accountId) throw new HttpError(400, 'Choose the cash or bank account the salary is paid from.');
    const a = await tx.account.findFirst({ where: { id: String(accountId), tenantId: t, deletedAt: null } });
    if (!a) throw new HttpError(400, 'That cash/bank account was not found.');
    return a;
}
// pay one draft (inside the client's transaction): PAID, an expense, the account movement, and the advances it recovers
async function paySlip(tx, req, slip, emp, account, category) {
    const t = req.user.tenantId;
    // recheck the recovery against what is still outstanding (another month's payslip may have recovered it already)
    const advs = await openAdvances(tx, t, slip.employeeId, slip.month);
    const cut = Math.min(N(slip.advanceCut), advs.reduce((s, a) => s + remaining(a), 0));
    const net = N(slip.basic) + N(slip.allowances) - N(slip.deductions) - cut;
    const now = new Date();
    const name = emp ? emp.name : 'Employee', code = emp ? emp.code : '';
    await tx.payslip.update({ where: { id: slip.id }, data: { status: 'PAID', accountId: account.id, paidAt: now, advanceCut: B(cut), net: B(net) } });
    // the salary cost is the whole salary (net + the advance it recovers): the advance left the till earlier as an
    // ADVANCE account entry, which is not an expense. The account itself only moves by what is paid out now (−net).
    const cost = net + cut;
    if (cost > 0) {
        await tx.expense.create({ data: { tenantId: t, date: now, categoryId: category.id, categoryName: category.name, amount: B(cost), accountId: account.id, method: accountMethod(account), payee: name, reference: `Payslip ${slip.month}${code ? ' · ' + code : ''}`, note: `Salary for ${monthLabel(slip.month)}${cut ? ` (incl. advance recovered ${(cut / 100).toFixed(2)})` : ''}`, source: 'PAYROLL', refId: slip.id, userId: req.user.id } });
    }
    if (net > 0) await treasury.post(tx, { tenantId: t, accountId: account.id, type: 'PAYROLL', amount: -net, refId: slip.id, refNo: code, note: `Salary ${monthLabel(slip.month)} — ${name}`, date: now });
    let left = cut;
    for (const a of advs) {
        if (left <= 0) break;
        const take = Math.min(left, remaining(a));
        left -= take;
        const rec = N(a.recovered) + take;
        await tx.advance.update({ where: { id: a.id }, data: { recovered: B(rec), status: rec >= N(a.amount) ? 'RECOVERED' : 'OPEN' } });
    }
    return { net, cut };
}

router.post('/payroll/:id/pay', async (req, res) => {
    const t = req.user.tenantId;
    const cur = await findRow('payslip', t, req.params.id, 'Payslip');
    const m = await employeeMap(t, [cur.employeeId]);
    const r = await withTx(t, async tx => {
        const slip = await tx.payslip.findFirst({ where: { id: cur.id, deletedAt: null } });
        if (!slip || slip.status !== 'DRAFT') throw new HttpError(400, 'This payslip is already paid.');
        const account = await payingAccount(tx, t, (req.body || {}).accountId);
        const out = await paySlip(tx, req, slip, m[slip.employeeId], account, await salaryCategory(tx, t));
        return { ...out, account: account.name };
    });
    await audit(req, { action: 'hrm.payslip_pay', summary: `Salary ${monthLabel(cur.month)} of "${who(m, cur.employeeId).employeeName}" paid: ${(r.net / 100).toFixed(2)} from ${r.account}${r.cut ? ` (advance recovered ${(r.cut / 100).toFixed(2)})` : ''}` });
    res.json({ ok: true, net: r.net, advanceCut: r.cut });
});

router.post('/payroll/pay-all', async (req, res) => {
    const t = req.user.tenantId;
    const tz = await tzOf(t);
    const month = monthOf((req.body || {}).month, 'Month', ymd(new Date(), tz).slice(0, 7));
    const r = await withTx(t, async tx => {
        const account = await payingAccount(tx, t, (req.body || {}).accountId);
        const slips = await tx.payslip.findMany({ where: { tenantId: t, month, deletedAt: null, status: 'DRAFT' }, orderBy: { createdAt: 'asc' } });
        if (!slips.length) throw new HttpError(400, `There are no draft payslips for ${monthLabel(month)}.`);
        const m = await employeeMap(t, slips.map(s => s.employeeId), tx);
        const category = await salaryCategory(tx, t);
        let total = 0;
        for (const s of slips) total += (await paySlip(tx, req, s, m[s.employeeId], account, category)).net;
        return { paid: slips.length, total, account: account.name };
    });
    await audit(req, { action: 'hrm.payroll_pay_all', summary: `Payroll ${monthLabel(month)} paid: ${r.paid} payslip(s), ${(r.total / 100).toFixed(2)} from ${r.account}` });
    res.json({ month, paid: r.paid, total: r.total });
});

// cash and bank accounts with their balance (paying salaries and granting advances)
router.get('/accounts', async (req, res) => {
    const t = req.user.tenantId;
    const [list, bal] = await Promise.all([prisma.account.findMany({ where: { tenantId: t, deletedAt: null, active: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] }), treasury.balances(t)]);
    res.json(list.map(a => ({ id: a.id, name: a.name, type: a.type, bankName: a.bankName, accountNo: a.accountNo, isDefault: a.isDefault, balance: bal[a.id] || 0 })));
});

// ═════════════════════════ Advances ═════════════════════════
const advView = (a, m, acc) => ({ id: a.id, employeeId: a.employeeId, ...who(m, a.employeeId), amount: N(a.amount), recovered: N(a.recovered), remaining: remaining(a), date: a.date, deductionMonth: a.deductionMonth, accountId: a.accountId, accountName: (acc && acc[a.accountId]) || '', note: a.note, status: a.status });

router.get('/advances', async (req, res) => {
    const t = req.user.tenantId;
    const list = await prisma.advance.findMany({ where: { tenantId: t, deletedAt: null }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 2000 });
    const m = await employeeMap(t, list.map(a => a.employeeId));
    const acc = Object.fromEntries((await prisma.account.findMany({ where: { tenantId: t }, select: { id: true, name: true } })).map(a => [a.id, a.name]));
    res.json(list.map(a => advView(a, m, acc)));
});

// grant: the money leaves the chosen account now; it is recovered from the deduction month's payslip
router.post('/advances', async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const tz = await tzOf(t);
    const emp = await findEmployee(t, b.employeeId);
    const amount = paisa(b.amount, 'Advance Amount');
    if (!amount) throw new HttpError(400, 'Advance Amount is required.');
    const when = date(b.date, new Date());
    const deductionMonth = monthOf(b.deductionMonth, 'Deduction Month', ymd(new Date(), tz).slice(0, 7));
    const row = await withTx(t, async tx => {
        const account = await payingAccount(tx, t, b.accountId);
        const a = await tx.advance.create({ data: { tenantId: t, employeeId: emp.id, amount: B(amount), date: when, deductionMonth, accountId: account.id, note: str(b.note, 500) } });
        await treasury.post(tx, { tenantId: t, accountId: account.id, type: 'ADVANCE', amount: -amount, refId: a.id, refNo: emp.code, note: `Salary advance — ${emp.name}`, date: when });
        return { a, account };
    });
    await audit(req, { action: 'hrm.advance_create', summary: `Advance of ${(amount / 100).toFixed(2)} granted to "${emp.name}" from ${row.account.name}, recovered from ${monthLabel(deductionMonth)} payroll` });
    res.json(advView(row.a, { [emp.id]: emp }, { [row.account.id]: row.account.name }));
});

// void an advance nothing was recovered from yet: the row is retired and the money goes back to its account
router.delete('/advances/:id', async (req, res) => {
    const t = req.user.tenantId;
    const cur = await findRow('advance', t, req.params.id, 'Advance');
    if (N(cur.recovered) > 0) throw new HttpError(400, 'Part of this advance is already recovered from salary, so it cannot be voided.');
    const m = await employeeMap(t, [cur.employeeId]);
    await withTx(t, async tx => {
        const again = await tx.advance.findFirst({ where: { id: cur.id, deletedAt: null } });
        if (!again || N(again.recovered) > 0) throw new HttpError(400, 'This advance changed. Reload and try again.');
        await tx.advance.update({ where: { id: cur.id }, data: { deletedAt: new Date() } });
        await treasury.post(tx, { tenantId: t, accountId: cur.accountId, type: 'ADVANCE', amount: N(cur.amount), refId: cur.id, refNo: who(m, cur.employeeId).employeeCode, note: `Advance voided — ${who(m, cur.employeeId).employeeName}` });
    });
    await audit(req, { action: 'hrm.advance_void', summary: `Advance of ${(N(cur.amount) / 100).toFixed(2)} to "${who(m, cur.employeeId).employeeName}" voided; the money is back in its account` });
    res.json({ ok: true });
});

// ═════════════════════════ Recruitment ═════════════════════════
const candView = (c, postings) => ({ id: c.id, name: c.name, phone: c.phone, postingId: c.postingId, posting: c.postingId && postings[c.postingId] ? postings[c.postingId].title : '', department: c.postingId && postings[c.postingId] ? postings[c.postingId].department : '', position: c.position, stage: c.stage, appliedDate: c.appliedDate, hasResume: !!c.resume, note: c.note });

router.get('/recruitment', async (req, res) => {
    const t = req.user.tenantId;
    const [postings, candidates] = await Promise.all([
        prisma.jobPosting.findMany({ where: { tenantId: t, deletedAt: null }, orderBy: [{ status: 'desc' }, { createdAt: 'asc' }] }),
        prisma.candidate.findMany({ where: { tenantId: t, deletedAt: null }, orderBy: [{ appliedDate: 'desc' }, { createdAt: 'desc' }], select: { id: true, name: true, phone: true, postingId: true, position: true, stage: true, appliedDate: true, note: true, resume: false } }),
    ]);
    // a separate light query tells which candidates have a resume, without loading the files
    const withResume = new Set((await prisma.candidate.findMany({ where: { tenantId: t, deletedAt: null, NOT: { resume: '' } }, select: { id: true } })).map(c => c.id));
    const pm = Object.fromEntries(postings.map(p => [p.id, p]));
    res.json({
        postings: postings.map(p => ({ id: p.id, title: p.title, department: p.department, openings: p.openings, status: p.status, applicants: candidates.filter(c => c.postingId === p.id).length, hired: candidates.filter(c => c.postingId === p.id && c.stage === 'HIRED').length })),
        candidates: candidates.map(c => ({ ...candView({ ...c, resume: withResume.has(c.id) ? 'y' : '' }, pm) })),
    });
});

function readPosting(b) {
    return {
        title: need(b.title, 'Job Title', 120),
        department: oneOf(b.department, DEPARTMENTS, 'Department', 'Sales'),
        openings: Math.round(num(b.openings === '' || b.openings === undefined ? 1 : b.openings, 'Openings', { min: 1, max: 1000 })),
        status: oneOf(b.status, ['OPEN', 'CLOSED'], 'Status', 'OPEN'),
    };
}
router.post('/postings', async (req, res) => {
    const t = req.user.tenantId;
    const data = readPosting(req.body || {});
    const row = await prisma.jobPosting.create({ data: { ...data, tenantId: t } });
    await audit(req, { action: 'hrm.posting_create', summary: `Job posting "${row.title}" (${row.department}, ${row.openings} slot${row.openings === 1 ? '' : 's'}) added` });
    res.json(row);
});
router.put('/postings/:id', async (req, res) => {
    const t = req.user.tenantId;
    const cur = await findRow('jobPosting', t, req.params.id, 'Job posting');
    const data = readPosting({ ...cur, ...req.body });
    const row = await prisma.jobPosting.update({ where: { id: cur.id }, data });
    await audit(req, { action: 'hrm.posting_update', summary: `Job posting "${cur.title}" changed${cur.status !== row.status ? ` (now ${row.status.toLowerCase()})` : ''}` });
    res.json(row);
});
router.delete('/postings/:id', async (req, res) => {
    const t = req.user.tenantId;
    const cur = await findRow('jobPosting', t, req.params.id, 'Job posting');
    await prisma.jobPosting.update({ where: { id: cur.id }, data: { deletedAt: new Date() } });
    await audit(req, { action: 'hrm.posting_delete', summary: `Job posting "${cur.title}" deleted (its candidates are kept)` });
    res.json({ ok: true });
});

router.post('/candidates', async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const postingId = str(b.postingId, 60) || null;
    const posting = postingId ? await findRow('jobPosting', t, postingId, 'Job posting') : null;
    const position = str(b.position, 120) || (posting ? posting.title : '');
    if (!position) throw new HttpError(400, 'Position Title is required.');
    const row = await prisma.candidate.create({ data: {
        tenantId: t, name: need(b.name, 'Full Name', 120), phone: need(b.phone, 'Phone', 30), postingId, position,
        appliedDate: date(b.appliedDate, new Date()), resume: dataUrl(b.resume, 'Resume'), note: str(b.note, 500), stage: 'APPLIED',
    } });
    await audit(req, { action: 'hrm.candidate_create', summary: `Candidate "${row.name}" added for ${position}` });
    res.json(candView(row, posting ? { [posting.id]: posting } : {}));
});

router.patch('/candidates/:id/stage', async (req, res) => {
    const t = req.user.tenantId;
    const cur = await prisma.candidate.findFirst({ where: { id: req.params.id, tenantId: t, deletedAt: null }, select: { id: true, name: true, stage: true } });
    if (!cur) throw new HttpError(404, 'Candidate not found.');
    const stage = oneOf((req.body || {}).stage, STAGES, 'Stage');
    if (stage === cur.stage) return res.json({ ok: true, stage, changed: false });
    const row = await prisma.candidate.update({ where: { id: cur.id }, data: { stage }, select: { id: true, name: true, phone: true, postingId: true, position: true, stage: true, appliedDate: true, note: true } });
    await audit(req, { action: 'hrm.candidate_stage', summary: `Candidate "${cur.name}" moved from ${STAGE_LABEL[cur.stage] || cur.stage} to ${STAGE_LABEL[stage]}` });
    const posting = row.postingId ? await prisma.jobPosting.findFirst({ where: { id: row.postingId, tenantId: t } }) : null;
    res.json({ ok: true, changed: true, ...candView({ ...row, resume: '' }, posting ? { [posting.id]: posting } : {}) });
});

router.get('/candidates/:id/resume', async (req, res) => {
    const c = await findRow('candidate', req.user.tenantId, req.params.id, 'Candidate');
    if (!c.resume) throw new HttpError(404, 'This candidate has no resume attached.');
    res.json({ name: c.name, resume: c.resume });
});

router.delete('/candidates/:id', async (req, res) => {
    const t = req.user.tenantId;
    const cur = await prisma.candidate.findFirst({ where: { id: req.params.id, tenantId: t, deletedAt: null }, select: { id: true, name: true } });
    if (!cur) throw new HttpError(404, 'Candidate not found.');
    await prisma.candidate.update({ where: { id: cur.id }, data: { deletedAt: new Date() } });
    await audit(req, { action: 'hrm.candidate_delete', summary: `Candidate "${cur.name}" removed from the pipeline` });
    res.json({ ok: true });
});

// ═════════════════════════ Performance: appraisals ═════════════════════════
router.get('/appraisals', async (req, res) => {
    const t = req.user.tenantId;
    const list = await prisma.appraisal.findMany({ where: { tenantId: t, deletedAt: null }, orderBy: [{ period: 'desc' }, { createdAt: 'desc' }], take: 3000 });
    const m = await employeeMap(t, list.map(a => a.employeeId));
    const rows = list.map(a => ({ id: a.id, employeeId: a.employeeId, ...who(m, a.employeeId), period: a.period, rating: a.rating, feedback: a.feedback }));
    const dep = {};
    for (const r of rows) { if (!r.department) continue; const d = dep[r.department] || (dep[r.department] = { department: r.department, sum: 0, count: 0 }); d.sum += r.rating; d.count++; }
    res.json({ rows, byDepartment: DEPARTMENTS.filter(d => dep[d]).concat(Object.keys(dep).filter(d => !DEPARTMENTS.includes(d))).map(d => ({ department: d, average: Math.round((dep[d].sum / dep[d].count) * 100) / 100, count: dep[d].count })) });
});
router.post('/appraisals', async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const emp = await findEmployee(t, b.employeeId);
    const period = monthOf(b.period, 'Review Period');
    const rating = Math.round(num(b.rating === '' || b.rating === undefined ? 4 : b.rating, 'Rating', { min: 0, max: 5 }) * 10) / 10;
    const dupe = await prisma.appraisal.findFirst({ where: { tenantId: t, deletedAt: null, employeeId: emp.id, period } });
    if (dupe) throw new HttpError(400, `${emp.name} already has an appraisal for ${monthLabel(period)}.`);
    const row = await prisma.appraisal.create({ data: { tenantId: t, employeeId: emp.id, period, rating, feedback: str(b.feedback, 2000) } });
    await audit(req, { action: 'hrm.appraisal_create', summary: `Appraisal of "${emp.name}" for ${monthLabel(period)}: rating ${rating}/5` });
    res.json(row);
});
router.delete('/appraisals/:id', async (req, res) => {
    const t = req.user.tenantId;
    const cur = await findRow('appraisal', t, req.params.id, 'Appraisal');
    await prisma.appraisal.update({ where: { id: cur.id }, data: { deletedAt: new Date() } });
    const m = await employeeMap(t, [cur.employeeId]);
    await audit(req, { action: 'hrm.appraisal_delete', summary: `Appraisal of "${who(m, cur.employeeId).employeeName}" for ${monthLabel(cur.period)} deleted` });
    res.json({ ok: true });
});

// ═════════════════════════ Performance: warnings & rewards ═════════════════════════
const discView = (d, m) => ({ id: d.id, employeeId: d.employeeId, ...who(m, d.employeeId), kind: d.kind, date: d.date, title: d.title, description: d.description, amount: N(d.amount) });
router.get('/disciplinary', async (req, res) => {
    const t = req.user.tenantId;
    const list = await prisma.disciplinary.findMany({ where: { tenantId: t, deletedAt: null }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 3000 });
    const m = await employeeMap(t, list.map(d => d.employeeId));
    res.json(list.map(d => discView(d, m)));
});
router.post('/disciplinary', async (req, res) => {
    const t = req.user.tenantId;
    const b = req.body || {};
    const kind = oneOf(b.kind, ['WARNING', 'REWARD'], 'Record type');
    const emp = await findEmployee(t, b.employeeId);
    const amount = kind === 'REWARD' ? paisa(b.amount, 'Bonus Amount') : 0;
    const row = await prisma.disciplinary.create({ data: { tenantId: t, employeeId: emp.id, kind, date: date(b.date, new Date()), title: need(b.title, 'Title', 160), description: str(b.description, 2000), amount: B(amount) } });
    await audit(req, { action: kind === 'REWARD' ? 'hrm.reward_create' : 'hrm.warning_create', summary: kind === 'REWARD' ? `Reward "${row.title}" logged for "${emp.name}"${amount ? ` with a bonus of ${(amount / 100).toFixed(2)}` : ''}` : `Warning "${row.title}" logged for "${emp.name}"` });
    res.json(discView(row, { [emp.id]: emp }));
});
router.delete('/disciplinary/:id', async (req, res) => {
    const t = req.user.tenantId;
    const cur = await findRow('disciplinary', t, req.params.id, 'Record');
    await prisma.disciplinary.update({ where: { id: cur.id }, data: { deletedAt: new Date() } });
    const m = await employeeMap(t, [cur.employeeId]);
    await audit(req, { action: 'hrm.disciplinary_delete', summary: `${cur.kind === 'REWARD' ? 'Reward' : 'Warning'} "${cur.title}" of "${who(m, cur.employeeId).employeeName}" deleted` });
    res.json({ ok: true });
});

// ═════════════════════════ Performance: assets ═════════════════════════
const assetView = (a, m) => ({ id: a.id, name: a.name, code: a.code, category: a.category, employeeId: a.employeeId, ...who(m, a.employeeId), issueDate: a.issueDate, returnDate: a.returnDate, status: a.status, note: a.note });
function readAsset(b) {
    const status = oneOf(b.status, ASSET_STATUS, 'Status', 'IN_USE');
    const issueDate = date(b.issueDate, new Date());
    const returnDate = b.returnDate ? date(b.returnDate) : null;
    if (returnDate && returnDate < issueDate) throw new HttpError(400, 'Return Date cannot be before the Issue Date.');
    return { name: need(b.name, 'Asset Name', 120), code: str(b.code, 40).toUpperCase(), category: oneOf(b.category, ASSET_CATEGORIES, 'Category', 'Laptop'), employeeId: str(b.employeeId, 60), issueDate, returnDate, status, note: str(b.note, 500) };
}
async function assertAssetCodeFree(t, code, exceptId) {
    if (!code) return;
    const hit = await prisma.assetAssignment.findFirst({ where: { tenantId: t, deletedAt: null, code: ci(code), status: 'IN_USE', ...(exceptId ? { id: { not: exceptId } } : {}) } });
    if (hit && hit.code.toLowerCase() === code.toLowerCase()) throw new HttpError(400, `Asset ${code} is already issued (${hit.name}). Mark it returned first.`);
}
router.get('/assets', async (req, res) => {
    const t = req.user.tenantId;
    const list = await prisma.assetAssignment.findMany({ where: { tenantId: t, deletedAt: null }, orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }], take: 3000 });
    const m = await employeeMap(t, list.map(a => a.employeeId));
    res.json(list.map(a => assetView(a, m)));
});
router.post('/assets', async (req, res) => {
    const t = req.user.tenantId;
    const data = readAsset(req.body || {});
    const emp = await findEmployee(t, data.employeeId, 'Assign To');
    if (data.status === 'IN_USE') await assertAssetCodeFree(t, data.code);
    const row = await prisma.assetAssignment.create({ data: { ...data, tenantId: t } });
    await audit(req, { action: 'hrm.asset_create', summary: `Asset "${row.name}"${row.code ? ` (${row.code})` : ''} assigned to "${emp.name}"` });
    res.json(assetView(row, { [emp.id]: emp }));
});
router.put('/assets/:id', async (req, res) => {
    const t = req.user.tenantId;
    const cur = await findRow('assetAssignment', t, req.params.id, 'Asset');
    const data = readAsset({ ...cur, ...req.body });
    const emp = await findEmployee(t, data.employeeId, 'Assign To');
    if (data.status === 'IN_USE') await assertAssetCodeFree(t, data.code, cur.id);
    const row = await prisma.assetAssignment.update({ where: { id: cur.id }, data });
    await audit(req, { action: 'hrm.asset_update', summary: `Asset "${cur.name}" changed${cur.status !== row.status ? ` (now ${row.status.replace('_', ' ').toLowerCase()})` : ''}${cur.employeeId !== row.employeeId ? `; now with "${emp.name}"` : ''}` });
    res.json(assetView(row, { [emp.id]: emp }));
});
// mark returned (or damaged) with a return date (default today)
router.post('/assets/:id/return', async (req, res) => {
    const t = req.user.tenantId;
    const cur = await findRow('assetAssignment', t, req.params.id, 'Asset');
    const b = req.body || {};
    const status = oneOf(b.status, ['RETURNED', 'DAMAGED'], 'Status', 'RETURNED');
    const returnDate = date(b.returnDate, new Date());
    const row = await prisma.assetAssignment.update({ where: { id: cur.id }, data: { status, returnDate } });
    const m = await employeeMap(t, [cur.employeeId]);
    await audit(req, { action: 'hrm.asset_return', summary: `Asset "${cur.name}" ${status === 'DAMAGED' ? 'returned damaged' : 'returned'} by "${who(m, cur.employeeId).employeeName}"` });
    res.json(assetView(row, m));
});
router.delete('/assets/:id', async (req, res) => {
    const t = req.user.tenantId;
    const cur = await findRow('assetAssignment', t, req.params.id, 'Asset');
    await prisma.assetAssignment.update({ where: { id: cur.id }, data: { deletedAt: new Date() } });
    await audit(req, { action: 'hrm.asset_delete', summary: `Asset record "${cur.name}"${cur.code ? ` (${cur.code})` : ''} deleted` });
    res.json({ ok: true });
});

// ═════════════════════════ HR dashboard ═════════════════════════
router.get('/dashboard', async (req, res) => {
    const t = req.user.tenantId;
    const tz = await tzOf(t);
    const today = ymd(new Date(), tz);
    const month = today.slice(0, 7);
    const { from, to } = monthRange(month, tz);
    const [emps, att, leaves, slips] = await Promise.all([
        prisma.employee.findMany({ where: { tenantId: t, deletedAt: null }, select: { id: true, status: true, department: true, joinDate: true } }),
        prisma.attendance.findMany({ where: { tenantId: t, date: today, deletedAt: null }, select: { employeeId: true, status: true }, orderBy: { createdAt: 'asc' } }),
        prisma.leaveRequest.findMany({ where: { tenantId: t, deletedAt: null, status: 'APPROVED', fromDate: { lte: today }, toDate: { gte: today } }, select: { employeeId: true } }),
        prisma.payslip.findMany({ where: { tenantId: t, deletedAt: null, month }, select: { net: true, status: true } }),
    ]);
    const active = emps.filter(e => e.status === 'ACTIVE');
    const activeIds = new Set(active.map(e => e.id));
    const status = {};
    for (const a of att) if (!status[a.employeeId]) status[a.employeeId] = a.status;
    const todayCounts = emptySummary();
    for (const e of active) todayCounts[status[e.id] || 'UNMARKED']++;
    const onLeave = new Set([...leaves.map(l => l.employeeId), ...Object.keys(status).filter(id => status[id] === 'LEAVE')].filter(id => activeIds.has(id)));
    const byDep = {};
    for (const e of active) byDep[e.department] = (byDep[e.department] || 0) + 1;
    res.json({
        today, month, label: monthLabel(month),
        total: emps.length, active: active.length,
        presentToday: active.filter(e => ['PRESENT', 'LATE', 'HALF_DAY'].includes(status[e.id])).length,
        onLeaveToday: onLeave.size,
        newJoinees: emps.filter(e => e.joinDate >= from && e.joinDate < to).length,
        payroll: { net: slips.reduce((s, p) => s + N(p.net), 0), paid: slips.filter(p => p.status === 'PAID').reduce((s, p) => s + N(p.net), 0), count: slips.length },
        byDepartment: Object.entries(byDep).sort((a, b) => b[1] - a[1]).map(([department, count]) => ({ department, count })),
        todayStatus: todayCounts,
    });
});

module.exports = { router, mount: '/api/hrm', workedHours, autoStatus, minutesLate };
