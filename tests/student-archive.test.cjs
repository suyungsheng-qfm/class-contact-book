// Local regression checks: fake Sheets, Cache, IAM/Firestore; no live student data.
// Run with Node.js. The private backend must exist locally and is never uploaded.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const backend = fs.readFileSync(path.join(root, '統一後端.gs'), 'utf8');
const teacher = fs.readFileSync(path.join(root, 'teacher.html'), 'utf8');
let checks = 0;
function check(name, run) { run(); checks++; console.log(`PASS ${name}`); }

function fixture() {
    const sheets = new Map();
    const cache = new Map();
    const access = new Map();
    const state = { now: '2026-10-08T04:00:00Z', failAccess: false, failSheet: false };
    class FakeDate extends Date {
        constructor(...args) { super(...(args.length ? args : [state.now])); }
        static now() { return new Date(state.now).getTime(); }
    }
    class Sheet {
        constructor(rows = []) { this.rows = rows; }
        getLastRow() { return this.rows.length; }
        setFrozenRows() {}
        getDataRange() { return { getDisplayValues: () => this.rows.map(row => [...row]) }; }
        getRange(row, column, count, width) {
            const range = {
                getDisplayValues: () => Array.from({ length: count }, (_, i) => Array.from({ length: width }, (_, j) => String(this.rows[row - 1 + i]?.[column - 1 + j] ?? ''))),
                setNumberFormat: () => range,
                setValues: values => {
                    if (state.failSheet && row > 1) throw new Error('simulated sheet failure');
                    values.forEach((valuesRow, i) => {
                        this.rows[row - 1 + i] ||= [];
                        valuesRow.forEach((value, j) => { this.rows[row - 1 + i][column - 1 + j] = value; });
                    });
                    return range;
                }
            };
            return range;
        }
    }
    sheets.set('名單', new Sheet([['座號', '姓名', '學號', '驗證碼'], ['1', '測試甲', '1410700', '0123'], ['2', '測試乙', '1410702', '0456']]));
    const spreadsheet = { getSheetByName: name => sheets.get(name), insertSheet: name => { const sheet = new Sheet(); sheets.set(name, sheet); return sheet; } };
    const context = vm.createContext({
        Date: FakeDate, console,
        Utilities: {
            formatDate: date => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(date),
            getUuid: () => `archive-${Math.random()}`
        },
        CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key, value) => cache.set(key, value), remove: key => cache.delete(key) }) },
        SpreadsheetApp: { openById: () => spreadsheet, flush() {} },
        LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
        ScriptApp: { getOAuthToken: () => 'fake-token' },
        UrlFetchApp: { fetch: (url, options) => {
            if (state.failAccess) return { getResponseCode: () => 403 };
            assert.equal(options.method, 'patch');
            assert.equal(options.headers.Authorization, 'Bearer fake-token');
            const id = /student_status\/([^?]+)/.exec(url)[1];
            access.set(id, JSON.parse(options.payload).fields);
            return { getResponseCode: () => 200 };
        } }
    });
    vm.runInContext(backend, context);
    const request = (mode, startDate, studentId = '1410700') => context.handleStudentArchive({ mode, startDate, studentId }, { role: 'teacher' });
    return { context, sheets, cache, access, state, request, Sheet };
}

check('teacher-only management and strict dates', () => {
    const f = fixture();
    assert.equal(f.context.handleStudentArchive({ mode: 'archive' }, { role: 'parent' }).success, false);
    for (const date of ['2026-02-30', '2026/10/08', 'not-a-date']) assert.equal(f.request('archive', date).success, false);
    assert.equal(f.access.size, 0);
});
check('archive preserves roster, blocks credentials/session, and keeps leading zeros', () => {
    const f = fixture();
    assert.ok(f.context.verifyStudentLogin('1410700', '0123'));
    f.cache.set('session:test', JSON.stringify({ role: 'parent', user: { studentId: '1410700' } }));
    assert.equal(f.request('archive', '2026-10-08').success, true);
    assert.equal(f.context.verifyStudentLogin('1410700', '0123'), null);
    assert.equal(f.context.getSession('test'), null);
    assert.equal(f.context.fetchAllStudents().length, 2);
    assert.equal(f.context.isStudentArchivedOn('1410700', '2026-10-07'), false);
    assert.equal(f.context.isStudentArchivedOn('1410700', '2026-10-08'), true);
    assert.equal(f.access.get('1410700').blocked.booleanValue, true);
    assert.equal(f.access.get('1410700').effectiveAt.timestampValue, '2026-10-07T16:00:00.000Z');
    assert.equal(f.sheets.get('名單').rows[1][3], '0123');
    assert.equal(f.request('archive', '2026-10-09').success, false);
});
check('scheduled transfer is active before date; cancellation retains history', () => {
    const f = fixture();
    assert.equal(f.request('archive', '2026-10-10').success, true);
    assert.ok(f.context.verifyStudentLogin('1410700', '0123'));
    assert.equal(f.context.isStudentArchivedOn('1410700', '2026-10-10'), true);
    assert.equal(f.request('restore').success, true);
    assert.equal(f.context.readStudentArchives()[0].status, '已取消');
    assert.equal(f.context.isStudentArchivedOn('1410700', '2026-10-10'), false);
    assert.equal(f.access.get('1410700').blocked.booleanValue, false);
});
check('restore preserves past period and rejects overlapping backdated transfer', () => {
    const f = fixture();
    f.request('archive', '2026-10-06');
    assert.equal(f.request('restore').success, true);
    assert.ok(f.context.verifyStudentLogin('1410700', '0123'));
    assert.equal(f.context.isStudentArchivedOn('1410700', '2026-10-07'), true);
    assert.equal(f.context.isStudentArchivedOn('1410700', '2026-10-08'), false);
    assert.equal(f.request('archive', '2026-10-07').success, false);
    assert.equal(f.request('archive', '2026-10-09').success, true);
    assert.equal(f.context.readStudentArchives().length, 2);
});
check('Firestore failure cannot report successful archive', () => {
    const f = fixture(); f.state.failAccess = true;
    assert.throws(() => f.request('archive', '2026-10-08'), /HTTP 403/);
    assert.equal(f.context.readStudentArchives(true).length, 0);
    assert.ok(f.context.verifyStudentLogin('1410700', '0123'));
});
check('sheet failure rolls back access; restore failure remains blocked', () => {
    const f = fixture(); f.state.failSheet = true;
    assert.throws(() => f.request('archive', '2026-10-08'), /sheet failure/);
    assert.equal(f.access.get('1410700').blocked.booleanValue, false);
    f.state.failSheet = false; f.request('archive', '2026-10-07');
    f.state.failSheet = true;
    assert.throws(() => f.request('restore'), /sheet failure/);
    assert.equal(f.access.get('1410700').blocked.booleanValue, true);
    assert.equal(f.context.isStudentArchivedOn('1410700', '2026-10-08'), true);
});
check('roster removal keeps snapshot but cannot restore without credentials', () => {
    const f = fixture(); f.request('archive', '2026-10-07');
    f.sheets.get('名單').rows.splice(1, 1);
    const student = f.context.fetchAllStudents().find(item => item.studentId === '1410700');
    assert.equal(student.name, '測試甲');
    assert.equal(student.rosterMissing, true);
    assert.equal(f.request('restore').success, false);
});
check('parent notifications skip archived students but keep subscriptions', () => {
    const f = fixture();
    f.sheets.set('通知訂閱', new f.Sheet([['token', 'role', 'studentId'], ['token-a', 'parent', '1410700'], ['token-b', 'parent', '1410702'], ['token-t', 'teacher', '']]));
    f.request('archive', '2026-10-07');
    assert.deepEqual(Array.from(f.context.findNotificationTokens('parent', '')), ['token-b']);
    assert.deepEqual(Array.from(f.context.findNotificationTokens('teacher', '')), ['token-t']);
    f.request('restore');
    assert.deepEqual(Array.from(f.context.findNotificationTokens('parent', '')), ['token-a', 'token-b']);
});
check('frontend historical and current rosters use matching date boundaries', () => {
    const f = fixture(); f.request('archive', '2026-10-08');
    const code = teacher.slice(teacher.indexOf('        window.rosterDate ='), teacher.indexOf("        window.activeTab = 'calendar'"));
    const window = { allStudents: f.context.fetchAllStudents(), isTestStudent: student => student.studentId === '1410700' };
    vm.runInNewContext(code, { window, Date: f.context.Date, Intl });
    assert.equal(window.getActiveStudents('2026/10/07').length, 2);
    assert.equal(window.getActiveStudents('2026/10/08').length, 1);
    // Use a non-test student to verify form statistics as well.
    f.request('archive', '2026-10-08', '1410702');
    window.allStudents = f.context.fetchAllStudents();
    window.rosterDate = value => value ? String(value).replaceAll('/', '-').slice(0, 10) : '2026-10-08';
    assert.equal(window.getFormRoster({ deadline: '2026-10-07' }).length, 1);
    assert.equal(window.getFormRoster({ deadline: '2026-10-09' }).length, 0);
});
console.log(`${checks} archive regression groups passed. No remote data changed.`);
