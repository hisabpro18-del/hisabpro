const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');
const { prisma } = require('../src/db');

const pdf = text => 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 ' + text).toString('base64');

test('hrm: employees, shifts, attendance, leaves, payroll, advances, recruitment, performance', async t => {
    const h = await setup();
    const shifts = (await h.get('/api/hrm/shifts')).data;
    const morning = shifts.find(s => s.name === 'Morning'), night = shifts.find(s => s.name === 'Night');

    await t.test('a new client starts with the Morning, Evening and Night shifts', async () => {
        assert.deepEqual(shifts.map(s => s.name), ['Evening', 'Morning', 'Night']);
        assert.equal(morning.startTime, '09:00');
        assert.equal(night.endTime, '06:00');
    });

    let ahmed, sara, bilal;
    await t.test('employees get running codes EMP-0001, EMP-0002 …; CNIC is unique; required fields are checked', async () => {
        assert.equal((await h.get('/api/hrm/employees/next-code')).data.code, 'EMP-0001');
        const a = await h.post('/api/hrm/employees', { name: 'Ahmed Khan', cnic: '3520212345671', phone: '0300-1234567', department: 'Sales', designation: 'Sales Executive', joinDate: '2026-01-15', shiftId: morning.id, baseSalary: 5000000, bankName: 'HBL', iban: 'pk36 scbl 0000 0011 2345 6702' });
        assert.equal(a.status, 200, JSON.stringify(a.data));
        assert.equal(a.data.code, 'EMP-0001');
        ahmed = a.data.id;
        const s = await h.post('/api/hrm/employees', { name: 'Sara Ahmed', cnic: '35202-7654321-2', phone: '0301-7654321', department: 'Logistics', designation: 'Guard', joinDate: '2026-02-01', shiftId: night.id, baseSalary: 3000000 });
        assert.equal(s.data.code, 'EMP-0002');
        sara = s.data.id;
        const b = await h.post('/api/hrm/employees', { name: 'Bilal Raza', cnic: '42101-1111111-1', phone: '0333-1111111', department: 'Sales', designation: 'Cashier', joinDate: '2026-03-01', baseSalary: 2500000 });
        bilal = b.data.id;
        assert.equal((await h.get('/api/hrm/employees/next-code')).data.code, 'EMP-0004');

        const dupe = await h.post('/api/hrm/employees', { name: 'Other', cnic: '35202-1234567-1', phone: '1', designation: 'x' });
        assert.equal(dupe.status, 400);
        assert.match(dupe.data.error, /already belongs to Ahmed Khan/);
        assert.equal((await h.post('/api/hrm/employees', { cnic: '12345-1234567-9', phone: '1', designation: 'x' })).status, 400);
        assert.equal((await h.post('/api/hrm/employees', { name: 'X', cnic: '123', phone: '1', designation: 'x' })).status, 400);
        assert.equal((await h.post('/api/hrm/employees', { name: 'X', cnic: '12345-1234567-9', phone: '1', designation: 'x', department: 'Space' })).status, 400);

        const one = (await h.get('/api/hrm/employees/' + ahmed)).data;
        assert.equal(one.cnic, '35202-1234567-1');
        assert.equal(one.iban, 'PK36SCBL0000001123456702');
        assert.equal(one.baseSalary, 5000000);
        assert.equal(one.shift, 'Morning');
        assert.equal(one.status, 'ACTIVE');
        assert.deepEqual(one.documents, []);
    });

    await t.test('documents: up to four files of at most 250 KB, stored with the employee', async () => {
        const r = await h.put(`/api/hrm/employees/${ahmed}/documents/CNIC`, { name: 'cnic.pdf', dataUrl: pdf('cnic') });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        await h.put(`/api/hrm/employees/${ahmed}/documents/CV`, { name: 'cv.pdf', dataUrl: pdf('cv') });
        const big = await h.put(`/api/hrm/employees/${ahmed}/documents/CONTRACT`, { name: 'big.pdf', dataUrl: 'data:application/pdf;base64,' + Buffer.alloc(300 * 1024).toString('base64') });
        assert.equal(big.status, 400);
        assert.match(big.data.error, /250 KB/);
        const html = await h.put(`/api/hrm/employees/${ahmed}/documents/CONTRACT`, { name: 'x.html', dataUrl: 'data:text/html;base64,PGI+eDwvYj4=' });
        assert.equal(html.status, 400);
        const one = (await h.get('/api/hrm/employees/' + ahmed)).data;
        assert.deepEqual(one.documents.map(d => d.kind).sort(), ['CNIC', 'CV']);
        assert.equal(one.documents.find(d => d.kind === 'CV').dataUrl, pdf('cv'));
        await h.put(`/api/hrm/employees/${ahmed}/documents/CV`, { dataUrl: '' });
        assert.deepEqual((await h.get('/api/hrm/employees/' + ahmed)).data.documents.map(d => d.kind), ['CNIC']);
        const list = (await h.get('/api/hrm/employees')).data;
        assert.equal(list.length, 3);
        assert.ok(!('documents' in list[0]), 'the list does not carry the files');
        // editing other fields keeps the documents
        const upd = await h.put('/api/hrm/employees/' + ahmed, { designation: 'Senior Sales Executive' });
        assert.equal(upd.status, 200, JSON.stringify(upd.data));
        const after = (await h.get('/api/hrm/employees/' + ahmed)).data;
        assert.equal(after.designation, 'Senior Sales Executive');
        assert.equal(after.documents.length, 1);
    });

    await t.test('shifts: create with grace, unique names, cannot delete a shift in use', async () => {
        const r = await h.post('/api/hrm/shifts', { name: 'Split', startTime: '11:00', endTime: '19:00', graceMinutes: 5 });
        assert.equal(r.status, 200);
        assert.equal((await h.post('/api/hrm/shifts', { name: 'split', startTime: '10:00', endTime: '18:00' })).status, 400);
        assert.equal((await h.post('/api/hrm/shifts', { name: 'Bad', startTime: '25:00', endTime: '18:00' })).status, 400);
        const used = await h.del('/api/hrm/shifts/' + morning.id);
        assert.equal(used.status, 400);
        assert.equal((await h.del('/api/hrm/shifts/' + r.data.id)).status, 200);
        assert.equal((await h.get('/api/hrm/shifts')).data.length, 3);
    });

    await t.test('attendance: present within grace, late after it, overnight hours, re-marking updates the same row', async () => {
        const a = await h.post('/api/hrm/attendance', { employeeId: ahmed, date: '2026-10-05', checkIn: '09:10', checkOut: '17:00' });
        assert.equal(a.status, 200, JSON.stringify(a.data));
        assert.equal(a.data.status, 'PRESENT');
        assert.equal(a.data.hours, 7.83);
        assert.equal(a.data.shiftId, morning.id, 'the employee shift is used when none is sent');
        const b = await h.post('/api/hrm/attendance', { employeeId: ahmed, date: '2026-10-05', checkIn: '09:20', checkOut: '18:20' });
        assert.equal(b.data.status, 'LATE');
        assert.equal(b.data.hours, 9);
        assert.equal(b.data.id, a.data.id);
        assert.equal(b.data.updated, true);
        const rows = await prisma.attendance.count({ where: { tenantId: h.tenantId, employeeId: ahmed, date: '2026-10-05', deletedAt: null } });
        assert.equal(rows, 1);

        const n = await h.post('/api/hrm/attendance', { employeeId: sara, date: '2026-10-05', checkIn: '22:05', checkOut: '06:05' });
        assert.equal(n.data.status, 'PRESENT');
        assert.equal(n.data.hours, 8);
        const late = await h.post('/api/hrm/attendance', { employeeId: sara, date: '2026-10-06', checkIn: '00:30', checkOut: '06:00' });
        assert.equal(late.data.status, 'LATE', 'arriving after midnight for a 22:00 shift is late');
        assert.equal(late.data.hours, 5.5);

        const noShift = await h.post('/api/hrm/attendance', { employeeId: bilal, date: '2026-10-05', checkIn: '11:45', checkOut: '15:15' });
        assert.equal(noShift.data.status, 'PRESENT');
        assert.equal(noShift.data.hours, 3.5);
        const half = await h.post('/api/hrm/attendance', { employeeId: bilal, date: '2026-10-05', status: 'HALF_DAY', checkIn: '09:00', checkOut: '13:00' });
        assert.equal(half.data.status, 'HALF_DAY');
        assert.equal(half.data.hours, 4);
        const absent = await h.post('/api/hrm/attendance', { employeeId: bilal, date: '2026-10-05', status: 'ABSENT', checkIn: '09:00' });
        assert.equal(absent.data.status, 'ABSENT');
        assert.equal(absent.data.checkIn, '');
        assert.equal(absent.data.hours, 0);
        assert.equal((await h.post('/api/hrm/attendance', { employeeId: bilal, date: '2026-10-07' })).status, 400, 'check-in is needed for Present');

        const roster = (await h.get('/api/hrm/attendance?date=2026-10-05')).data;
        assert.equal(roster.rows.length, 3);
        assert.deepEqual(roster.summary, { PRESENT: 1, LATE: 1, ABSENT: 1, HALF_DAY: 0, LEAVE: 0, UNMARKED: 0 });
        const cleared = await h.del('/api/hrm/attendance/' + absent.data.id);
        assert.equal(cleared.status, 200);
        assert.equal((await h.get('/api/hrm/attendance?date=2026-10-05')).data.summary.UNMARKED, 1);
    });

    await t.test('bulk mark present: every active employee not yet marked, with their shift times', async () => {
        await h.post('/api/hrm/attendance', { employeeId: ahmed, date: '2026-10-08', status: 'ABSENT' });
        const r = await h.post('/api/hrm/attendance/bulk-present', { date: '2026-10-08' });
        assert.equal(r.status, 200);
        assert.equal(r.data.marked, 2);
        assert.equal(r.data.skipped, 1);
        const roster = (await h.get('/api/hrm/attendance?date=2026-10-08')).data;
        const s = roster.rows.find(x => x.employee.id === sara).record;
        assert.equal(s.checkIn, '22:00');
        assert.equal(s.checkOut, '06:00');
        assert.equal(s.hours, 8);
        assert.equal(roster.rows.find(x => x.employee.id === ahmed).record.status, 'ABSENT', 'already marked rows are kept');
        assert.equal((await h.post('/api/hrm/attendance/bulk-present', { date: '2026-10-08' })).data.marked, 0);
    });

    await t.test('leave: request, approve creates On Leave days not already marked, reject, overlaps refused', async () => {
        await h.post('/api/hrm/attendance', { employeeId: bilal, date: '2026-10-13', checkIn: '09:00', checkOut: '17:00' });
        const r = await h.post('/api/hrm/leaves', { employeeId: bilal, type: 'Sick', fromDate: '2026-10-12', toDate: '2026-10-14', reason: 'Fever' });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.days, 3);
        assert.equal(r.data.status, 'PENDING');
        const clash = await h.post('/api/hrm/leaves', { employeeId: bilal, fromDate: '2026-10-14', toDate: '2026-10-15' });
        assert.equal(clash.status, 400);
        assert.equal((await h.post('/api/hrm/leaves', { employeeId: bilal, fromDate: '2026-10-20', toDate: '2026-10-19' })).status, 400);

        const ap = await h.post(`/api/hrm/leaves/${r.data.id}/approve`);
        assert.equal(ap.status, 200);
        assert.equal(ap.data.marked, 2);
        const recs = await prisma.attendance.findMany({ where: { tenantId: h.tenantId, employeeId: bilal, deletedAt: null, date: { gte: '2026-10-12', lte: '2026-10-14' } }, orderBy: { date: 'asc' } });
        assert.deepEqual(recs.map(x => x.status), ['LEAVE', 'PRESENT', 'LEAVE']);
        assert.equal((await h.post(`/api/hrm/leaves/${r.data.id}/approve`)).status, 400, 'decided once');

        const other = await h.post('/api/hrm/leaves', { employeeId: ahmed, type: 'Casual', fromDate: '2026-10-20', toDate: '2026-10-20' });
        assert.equal(other.data.days, 1);
        assert.equal((await h.post(`/api/hrm/leaves/${other.data.id}/reject`)).status, 200);
        const list = (await h.get('/api/hrm/leaves')).data;
        assert.equal(list.rows.length, 2);
        assert.equal(list.rows.find(x => x.id === other.data.id).status, 'REJECTED');
        assert.equal(list.stats.pending, 0);
        if (list.year === '2026') {
            const taken = list.taken.find(x => x.employeeId === bilal);
            assert.equal(taken.Sick, 3);
            assert.equal(taken.total, 3);
        }
    });

    let cash, ahmedSlip;
    await t.test('payroll generation: reward bonuses become allowances, open advances are recovered (capped at the salary)', async () => {
        cash = (await h.get('/api/hrm/accounts')).data.find(a => a.name === 'Cash in Hand');
        assert.equal(cash.balance, 0);
        const rw = await h.post('/api/hrm/disciplinary', { kind: 'REWARD', employeeId: ahmed, date: '2026-10-10', title: 'Top seller', amount: 500000 });
        assert.equal(rw.status, 200, JSON.stringify(rw.data));
        await h.post('/api/hrm/disciplinary', { kind: 'REWARD', employeeId: ahmed, date: '2026-09-10', title: 'Last month bonus', amount: 100000 });
        const wn = await h.post('/api/hrm/disciplinary', { kind: 'WARNING', employeeId: ahmed, date: '2026-10-11', title: 'Late attendance', amount: 999 });
        assert.equal(wn.data.amount, 0, 'a warning carries no money');

        const adv = await h.post('/api/hrm/advances', { employeeId: ahmed, amount: 2000000, date: '2026-10-02', deductionMonth: '2026-10', accountId: cash.id, note: 'Full in October' });
        assert.equal(adv.status, 200, JSON.stringify(adv.data));
        assert.equal(adv.data.remaining, 2000000);
        await h.post('/api/hrm/advances', { employeeId: sara, amount: 10000000, date: '2026-10-02', deductionMonth: '2026-10', accountId: cash.id });
        await h.post('/api/hrm/advances', { employeeId: bilal, amount: 100000, date: '2026-10-02', deductionMonth: '2026-12', accountId: cash.id });
        assert.equal((await h.post('/api/hrm/advances', { employeeId: bilal, amount: 0, accountId: cash.id })).status, 400);
        assert.equal((await h.post('/api/hrm/advances', { employeeId: bilal, amount: 100 })).status, 400, 'an account is needed');
        assert.equal((await h.get('/api/hrm/accounts')).data.find(a => a.id === cash.id).balance, -12100000);

        const g = await h.post('/api/hrm/payroll/generate', { month: '2026-10' });
        assert.equal(g.status, 200, JSON.stringify(g.data));
        assert.equal(g.data.created, 3);
        assert.equal((await h.post('/api/hrm/payroll/generate', { month: '2026-10' })).data.created, 0, 'each employee once per month');
        const p = (await h.get('/api/hrm/payroll?month=2026-10')).data;
        const a = p.rows.find(r => r.employeeId === ahmed);
        assert.deepEqual([a.basic, a.allowances, a.deductions, a.advanceCut, a.net, a.status], [5000000, 500000, 0, 2000000, 3500000, 'DRAFT']);
        const s = p.rows.find(r => r.employeeId === sara);
        assert.deepEqual([s.advanceCut, s.net], [3000000, 0], 'recovery is capped so the net is not negative');
        const b = p.rows.find(r => r.employeeId === bilal);
        assert.deepEqual([b.advanceCut, b.net], [0, 2500000], 'an advance due in December is not taken in October');
        assert.equal(p.stats.generated, 3);
        assert.equal(p.stats.outstandingAdvances, 12100000);
        assert.equal(p.missing.length, 0);
        ahmedSlip = a.id;

        const e = await h.put('/api/hrm/payroll/' + ahmedSlip, { allowances: 500000, deductions: 100000 });
        assert.equal(e.status, 200, JSON.stringify(e.data));
        assert.equal(e.data.net, 3400000);
        assert.equal((await h.put('/api/hrm/payroll/' + ahmedSlip, { advanceCut: 9000000 })).status, 400, 'cannot recover more than is owed');
        assert.equal((await h.put('/api/hrm/payroll/' + ahmedSlip, { deductions: 99999999 })).status, 400);
    });

    await t.test('paying a payslip: expense = full salary cost (net + advance recovered), account moves by −net, advance recovered; paid slips are locked', async () => {
        assert.equal((await h.post(`/api/hrm/payroll/${ahmedSlip}/pay`, {})).status, 400, 'an account is needed');
        const r = await h.post(`/api/hrm/payroll/${ahmedSlip}/pay`, { accountId: cash.id });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.net, 3400000);
        assert.equal((await h.get('/api/hrm/accounts')).data.find(a => a.id === cash.id).balance, -12100000 - 3400000);
        const exp = await prisma.expense.findMany({ where: { tenantId: h.tenantId, deletedAt: null } });
        assert.equal(exp.length, 1);
        assert.equal(exp[0].categoryName, 'Salaries & Wages');
        assert.equal(Number(exp[0].amount), 3400000 + 2000000, 'expense = net 34,000 + advance recovered 20,000 (the salary cost)');
        assert.equal(exp[0].source, 'PAYROLL');
        assert.equal(exp[0].refId, ahmedSlip);
        assert.equal(exp[0].payee, 'Ahmed Khan');
        assert.equal(exp[0].accountId, cash.id);
        const cat = await prisma.expenseCategory.findFirst({ where: { id: exp[0].categoryId } });
        assert.equal(cat.name, 'Salaries & Wages');
        const txn = await prisma.accountTxn.findFirst({ where: { tenantId: h.tenantId, refId: ahmedSlip } });
        assert.equal(txn.type, 'PAYROLL');
        assert.equal(Number(txn.amount), -3400000);
        const adv = (await h.get('/api/hrm/advances')).data.find(a => a.employeeId === ahmed);
        assert.equal(adv.status, 'RECOVERED');
        assert.equal(adv.recovered, 2000000);
        assert.equal(adv.remaining, 0);
        assert.equal((await h.post(`/api/hrm/payroll/${ahmedSlip}/pay`, { accountId: cash.id })).status, 400, 'paid once');
        assert.equal((await h.put('/api/hrm/payroll/' + ahmedSlip, { deductions: 0 })).status, 400);
        assert.equal((await h.del('/api/hrm/payroll/' + ahmedSlip)).status, 400);
        assert.equal((await h.del('/api/hrm/advances/' + adv.id)).status, 400, 'a recovered advance cannot be voided');

        const all = await h.post('/api/hrm/payroll/pay-all', { month: '2026-10', accountId: cash.id });
        assert.equal(all.status, 200, JSON.stringify(all.data));
        assert.equal(all.data.paid, 2);
        assert.equal(all.data.total, 2500000);
        const p = (await h.get('/api/hrm/payroll?month=2026-10')).data;
        assert.ok(p.rows.every(x => x.status === 'PAID'));
        assert.equal(p.stats.paid, 5900000);
        assert.equal(p.trend.find(x => x.month === '2026-10').net, 5900000);
        const saraAdv = (await h.get('/api/hrm/advances')).data.find(a => a.employeeId === sara);
        assert.deepEqual([saraAdv.recovered, saraAdv.remaining, saraAdv.status], [3000000, 7000000, 'OPEN']);
        const exps = await prisma.expense.findMany({ where: { tenantId: h.tenantId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
        assert.equal(exps.length, 3, 'Sara is paid nothing in cash, but the 30,000 her salary recovers is still salary cost');
        assert.deepEqual(exps.map(x => Number(x.amount)).sort((a, b) => a - b), [2500000, 3000000, 5400000]);
        assert.equal(await prisma.accountTxn.count({ where: { tenantId: h.tenantId, deletedAt: null, type: 'PAYROLL' } }), 2, 'a zero net moves no money');
        assert.equal((await h.get('/api/hrm/accounts')).data.find(a => a.id === cash.id).balance, -12100000 - 5900000);

        // November: Sara's remaining advance is recovered again, the October bonus is not repeated
        await h.post('/api/hrm/payroll/generate', { month: '2026-11' });
        const nov = (await h.get('/api/hrm/payroll?month=2026-11')).data;
        assert.equal(nov.rows.find(x => x.employeeId === ahmed).allowances, 0);
        assert.equal(nov.rows.find(x => x.employeeId === sara).advanceCut, 3000000);
        const draft = nov.rows.find(x => x.employeeId === bilal);
        assert.equal((await h.del('/api/hrm/payroll/' + draft.id)).status, 200, 'a draft can be deleted and generated again');
        assert.equal((await h.post('/api/hrm/payroll/generate', { month: '2026-11' })).data.created, 1);

        // voiding an untouched advance puts the money back
        const before = (await h.get('/api/hrm/accounts')).data.find(a => a.id === cash.id).balance;
        const bilalAdv = (await h.get('/api/hrm/advances')).data.find(a => a.employeeId === bilal);
        assert.equal((await h.del('/api/hrm/advances/' + bilalAdv.id)).status, 200);
        assert.equal((await h.get('/api/hrm/accounts')).data.find(a => a.id === cash.id).balance, before + 100000);
    });

    await t.test('recruitment: postings, candidates, stage moves', async () => {
        const post = await h.post('/api/hrm/postings', { title: 'Cashier', department: 'Sales', openings: 2 });
        assert.equal(post.status, 200);
        const c = await h.post('/api/hrm/candidates', { name: 'Sara Ali', phone: '0300-0000000', postingId: post.data.id, appliedDate: '2026-11-01', resume: pdf('resume') });
        assert.equal(c.status, 200, JSON.stringify(c.data));
        assert.equal(c.data.stage, 'APPLIED');
        assert.equal(c.data.position, 'Cashier', 'the posting title fills the position');
        assert.equal((await h.post('/api/hrm/candidates', { name: 'No phone', position: 'x' })).status, 400);
        for (const stage of ['SCREENING', 'INTERVIEW', 'OFFER', 'HIRED']) {
            const m = await h.patch(`/api/hrm/candidates/${c.data.id}/stage`, { stage });
            assert.equal(m.status, 200);
            assert.equal(m.data.stage, stage);
        }
        assert.equal((await h.patch(`/api/hrm/candidates/${c.data.id}/stage`, { stage: 'LOST' })).status, 400);
        const r = (await h.get('/api/hrm/recruitment')).data;
        assert.equal(r.postings[0].applicants, 1);
        assert.equal(r.postings[0].hired, 1);
        assert.equal(r.candidates[0].stage, 'HIRED');
        assert.equal(r.candidates[0].hasResume, true);
        assert.ok(!('resume' in r.candidates[0]));
        assert.equal((await h.get(`/api/hrm/candidates/${c.data.id}/resume`)).data.resume, pdf('resume'));
        const closed = await h.put('/api/hrm/postings/' + post.data.id, { status: 'CLOSED' });
        assert.equal(closed.data.status, 'CLOSED');
        assert.equal((await h.del('/api/hrm/candidates/' + c.data.id)).status, 200);
        assert.equal((await h.get('/api/hrm/recruitment')).data.candidates.length, 0);
    });

    await t.test('performance: appraisals averaged by department, one per month; assets assigned and returned', async () => {
        assert.equal((await h.post('/api/hrm/appraisals', { employeeId: ahmed, period: '2026-10', rating: 5, feedback: 'Great' })).status, 200);
        assert.equal((await h.post('/api/hrm/appraisals', { employeeId: bilal, period: '2026-10', rating: 3 })).status, 200);
        assert.equal((await h.post('/api/hrm/appraisals', { employeeId: sara, period: '2026-10', rating: 4.5 })).status, 200);
        assert.equal((await h.post('/api/hrm/appraisals', { employeeId: ahmed, period: '2026-10', rating: 1 })).status, 400);
        assert.equal((await h.post('/api/hrm/appraisals', { employeeId: ahmed, period: '2026-11', rating: 6 })).status, 400);
        const ap = (await h.get('/api/hrm/appraisals')).data;
        assert.equal(ap.rows.length, 3);
        assert.deepEqual(ap.byDepartment, [{ department: 'Sales', average: 4, count: 2 }, { department: 'Logistics', average: 4.5, count: 1 }]);

        const a = await h.post('/api/hrm/assets', { name: 'MacBook Pro 14', code: 'ast-0042', category: 'Laptop', employeeId: ahmed, issueDate: '2026-10-01' });
        assert.equal(a.status, 200, JSON.stringify(a.data));
        assert.equal(a.data.code, 'AST-0042');
        assert.equal(a.data.status, 'IN_USE');
        assert.equal((await h.post('/api/hrm/assets', { name: 'Again', code: 'AST-0042', employeeId: sara })).status, 400, 'the same asset cannot be issued twice');
        const back = await h.post(`/api/hrm/assets/${a.data.id}/return`, { status: 'DAMAGED', returnDate: '2026-11-01' });
        assert.equal(back.data.status, 'DAMAGED');
        assert.ok(back.data.returnDate);
        assert.equal((await h.post('/api/hrm/assets', { name: 'Again', code: 'AST-0042', employeeId: sara })).status, 200, 'free again once returned');
        const d = (await h.get('/api/hrm/disciplinary')).data;
        assert.equal(d.filter(x => x.kind === 'REWARD').length, 2);
        assert.equal(d.filter(x => x.kind === 'WARNING').length, 1);
    });

    await t.test('dashboard: headcount, present today, on leave today, departments', async () => {
        const today = (await h.get('/api/hrm/meta')).data.today;
        await h.post('/api/hrm/attendance', { employeeId: ahmed, date: today, checkIn: '09:00', checkOut: '17:00' });
        await h.post('/api/hrm/employees', { name: 'Old Hand', cnic: '11111-1111111-1', phone: '1', designation: 'Driver', department: 'Logistics', status: 'INACTIVE', joinDate: '2025-01-01' });
        const lv = await h.post('/api/hrm/leaves', { employeeId: sara, fromDate: today, toDate: today });
        await h.post(`/api/hrm/leaves/${lv.data.id}/approve`);
        const d = (await h.get('/api/hrm/dashboard')).data;
        assert.equal(d.total, 4);
        assert.equal(d.active, 3);
        assert.equal(d.presentToday, 1);
        assert.equal(d.onLeaveToday, 1);
        assert.equal(d.todayStatus.LEAVE, 1);
        assert.equal(d.todayStatus.UNMARKED, 1);
        assert.deepEqual(d.byDepartment, [{ department: 'Sales', count: 2 }, { department: 'Logistics', count: 1 }]);
        // deleting an employee removes them from the lists
        assert.equal((await h.del('/api/hrm/employees/' + bilal)).status, 200);
        assert.equal((await h.get('/api/hrm/employees')).data.length, 3);
        assert.equal((await h.get('/api/hrm/dashboard')).data.active, 2);
    });

    await t.test('every action is written to the activity log', async () => {
        const logs = await prisma.auditLog.findMany({ where: { tenantId: h.tenantId, action: { startsWith: 'hrm.' } } });
        for (const a of ['hrm.employee_create', 'hrm.attendance_create', 'hrm.attendance_update', 'hrm.leave_approve', 'hrm.payroll_generate', 'hrm.payslip_pay', 'hrm.advance_create', 'hrm.candidate_stage', 'hrm.asset_return', 'hrm.employee_delete']) {
            assert.ok(logs.some(l => l.action === a), `${a} logged`);
        }
    });

    await t.test('a cashier cannot use HRM', async () => {
        const cashier = await h.user('CASHIER');
        assert.equal((await h.get('/api/hrm/employees', cashier)).status, 403);
        assert.equal((await h.post('/api/hrm/employees', { name: 'x' }, cashier)).status, 403);
        assert.equal((await h.get('/api/hrm/dashboard', cashier)).status, 403);
        const hr = await h.user('MANAGER', ['hrm.manage']);
        assert.equal((await h.get('/api/hrm/employees', hr)).status, 200);
    });
});

test('hrm: an advance claimed by two draft months is recovered once, whichever month is paid first', async () => {
    const h = await setup();
    const cash = (await h.get('/api/hrm/accounts')).data.find(a => a.name === 'Cash in Hand');
    const e = await h.post('/api/hrm/employees', { name: 'Zain Ali', cnic: '35202-2222222-2', phone: '0300-2222222', department: 'Sales', designation: 'Cashier', joinDate: '2026-01-01', baseSalary: 3000000 });
    assert.equal(e.status, 200, JSON.stringify(e.data));
    assert.equal((await h.post('/api/hrm/advances', { employeeId: e.data.id, amount: 1000000, date: '2026-09-01', deductionMonth: '2026-09', accountId: cash.id })).status, 200);
    await h.post('/api/hrm/payroll/generate', { month: '2026-09' });
    await h.post('/api/hrm/payroll/generate', { month: '2026-10' });
    const sep = (await h.get('/api/hrm/payroll?month=2026-09')).data.rows[0];
    const oct = (await h.get('/api/hrm/payroll?month=2026-10')).data.rows[0];
    assert.deepEqual([sep.advanceCut, oct.advanceCut], [1000000, 1000000], 'both drafts show the open advance');

    // October first (pay-all runs in one transaction), then September: the advance is taken once
    const all = await h.post('/api/hrm/payroll/pay-all', { month: '2026-10', accountId: cash.id });
    assert.equal(all.status, 200, JSON.stringify(all.data));
    assert.deepEqual([all.data.paid, all.data.total], [1, 2000000]);
    const sepNow = (await h.get('/api/hrm/payroll?month=2026-09')).data.rows[0];
    assert.deepEqual([sepNow.advanceCut, sepNow.net], [0, 3000000], 'the September draft now shows what paying it will do');
    const s = await h.post(`/api/hrm/payroll/${sep.id}/pay`, { accountId: cash.id });
    assert.equal(s.status, 200, JSON.stringify(s.data));
    assert.deepEqual([s.data.advanceCut, s.data.net], [0, 3000000], 'nothing left to recover, full salary paid');
    const adv = (await h.get('/api/hrm/advances')).data[0];
    assert.deepEqual([adv.recovered, adv.remaining, adv.status], [1000000, 0, 'RECOVERED']);
    assert.equal((await h.get('/api/hrm/accounts')).data.find(x => x.id === cash.id).balance, -1000000 - 2000000 - 3000000);
    const exps = await prisma.expense.findMany({ where: { tenantId: h.tenantId, deletedAt: null, source: 'PAYROLL' } });
    const byRef = Object.fromEntries(exps.map(x => [x.refId, Number(x.amount)]));
    assert.equal(byRef[oct.id], 2000000 + 1000000, 'October: expense = net + advance recovered');
    assert.equal(byRef[sep.id], 3000000, 'September: nothing recovered, expense = net');
    const txns = await prisma.accountTxn.findMany({ where: { tenantId: h.tenantId, deletedAt: null, type: 'PAYROLL' } });
    assert.deepEqual(txns.map(x => Number(x.amount)).sort((a, b) => a - b), [-3000000, -2000000], 'the account moves by −net only');
    // a paid slip stays as it was paid
    assert.equal((await h.put('/api/hrm/payroll/' + sep.id, { allowances: 100 })).status, 400);
    assert.equal((await h.del('/api/hrm/payroll/' + sep.id)).status, 400);
});
