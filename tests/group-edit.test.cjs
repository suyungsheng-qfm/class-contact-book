// Local mocks only: never signs in, sends notifications, or changes live messages.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const teacher = fs.readFileSync(path.join(root, 'teacher.html'), 'utf8');
const parent = fs.readFileSync(path.join(root, 'guardians.html'), 'utf8');
const start = teacher.indexOf('        window.groupEditBusy =');
const editCode = teacher.slice(start, teacher.indexOf('        // 🌟 處理老師端選擇圖片並非同步上傳', start));
const message = { id: 'message1', sender: 'teacher', studentId: 'teacher', messageType: 'text', text: '原本內容', timestamp: '2026/10/11 12:30', sentAt: 100 };
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function fixture(original = message) {
    const stored = structuredClone(original);
    delete stored.id;
    const state = { stored, authorized: true, attempts: [], dialogs: [], validations: [], updates: [], transactions: 0, fail: false, beforeSave: null, modal: null };
    const window = { CHAT_APP_ID: 'contact-chat', fbGroupChats: [structuredClone(original)], refreshUI() {} };
    const context = vm.createContext({ window, db: {},
        checkFbAuth: () => state.authorized,
        doc: (_, ...parts) => parts.join('/'), serverTimestamp: () => 'fake-server-time',
        Swal: {
            isLoading: () => false,
            showValidationMessage: text => state.validations.push(text),
            fire: async options => {
                state.dialogs.push(options);
                if (state.modal) return state.modal(options);
                for (const value of state.attempts) {
                    if (state.beforeSave) state.beforeSave();
                    if (await options.preConfirm(value)) return { isConfirmed: true };
                }
                return { isConfirmed: false };
            }
        },
        runTransaction: async (_, callback) => {
            state.transactions++;
            const writes = [];
            await callback({
                get: async () => ({ exists: () => Boolean(state.stored), data: () => structuredClone(state.stored) }),
                update: (ref, data) => writes.push({ ref, data: structuredClone(data) })
            });
            if (state.fail) throw Object.assign(new Error('connection failed'), { code: state.fail === 'permission' ? 'permission-denied' : 'unavailable' });
            for (const write of writes) { state.updates.push(write); state.stored = { ...state.stored, ...write.data }; }
        }
    });
    vm.runInContext(editCode, context);
    return { window, state };
}
function renderGroup(source, entries, isParent) {
    const list = { innerHTML: '' };
    const window = { fbGroupChats: entries, expandedGroupMonths: null, currentUser: { studentId: '1410700' },
        restoreChatScrollPosition() {}, studentDataEscapeHtml: escape, parentQueryEscapeHtml: escape };
    const context = vm.createContext({ window, URL, document: { getElementById: id => id === 'groupChatMessageList' ? list : null } });
    vm.runInContext(fs.readFileSync(path.join(root, 'chat-text.js'), 'utf8'), context);
    vm.runInContext(editCode, context);
    const begin = source.indexOf('        function renderGroupChat()');
    const end = source.indexOf(isParent ? '        function renderPrivateChat()' : '        function renderPrivateChatSidebar()', begin);
    vm.runInContext(source.slice(begin, end) + '\nrenderGroupChat();', context);
    return list.innerHTML;
}
async function run() {
    let count = 0;
    const test = async (name, fn) => { await fn(); count++; console.log(`PASS ${name}`); };
    await test('save edits only text and edit metadata, preserving order and identity', async () => {
        const f = fixture(); f.state.attempts = ['  新內容\nhttps://example.com  '];
        await f.window.editGroupMessage('message1');
        assert.equal(f.state.stored.text, '新內容\nhttps://example.com');
        assert.equal(f.state.stored.edited, true);
        assert.equal(f.state.stored.editedAt, 'fake-server-time');
        assert.equal(f.state.stored.timestamp, message.timestamp);
        assert.equal(f.state.stored.sentAt, message.sentAt);
        assert.deepEqual(Object.keys(f.state.updates[0].data).sort(), ['edited', 'editedAt', 'text']);
        assert.equal(f.state.updates[0].ref, 'artifacts/contact-chat/public/data/group_chat/message1');
        assert.equal(f.window.groupEditBusy.size, 0);
    });
    await test('cancel or unchanged text never writes or marks edited', async () => {
        for (const attempts of [[], [message.text]]) {
            const f = fixture(); f.state.attempts = attempts; await f.window.editGroupMessage('message1');
            assert.equal(f.state.transactions, 0); assert.equal(f.state.stored.edited, undefined);
        }
    });
    await test('empty input is rejected and remains editable', async () => {
        const f = fixture(); f.state.attempts = [' \n ', '非空白']; await f.window.editGroupMessage('message1');
        assert.equal(f.state.validations.length, 1); assert.equal(f.state.transactions, 1); assert.equal(f.state.stored.text, '非空白');
    });
    await test('only own ordinary text including legacy text is editable', async () => {
        for (const extra of [{ sender: 'parent' }, { messageType: 'image' }, { messageType: 'form' }, { messageType: 'homework' },
            { messageType: 'call_request' }, { messageType: 'leave_request' }, { withdrawn: true }, { messageType: 'withdrawn' },
            { hiddenByTeacher: true }, { formId: 'form1', messageType: undefined }, { homeworkId: 'hw1', messageType: undefined }]) {
            const f = fixture({ ...message, ...extra }); f.state.attempts = ['不允許']; await f.window.editGroupMessage('message1');
            assert.equal(f.state.dialogs.length, 0); assert.equal(f.state.transactions, 0);
        }
        const legacy = fixture({ ...message, messageType: undefined }); legacy.state.attempts = ['舊訊息修改'];
        await legacy.window.editGroupMessage('message1'); assert.equal(legacy.state.stored.text, '舊訊息修改');
    });
    await test('authentication and missing message guard against stale actions', async () => {
        const f = fixture(); f.state.authorized = false; await f.window.editGroupMessage('message1');
        f.state.authorized = true; await f.window.editGroupMessage('missing'); assert.equal(f.state.dialogs.length, 0);
        f.state.attempts = ['新內容']; f.state.beforeSave = () => { f.state.authorized = false; };
        await f.window.editGroupMessage('message1'); assert.equal(f.state.transactions, 0); assert.match(f.state.validations[0], /重新登入/);
    });
    await test('server-side withdrawal, type change and deletion cannot be revived', async () => {
        for (const stored of [null, { ...message, withdrawn: true }, { ...message, messageType: 'withdrawn' },
            { ...message, sender: 'parent' }, { ...message, messageType: 'image' }, { ...message, hiddenByTeacher: true }]) {
            const f = fixture(); f.state.stored = stored; f.state.attempts = ['新內容']; await f.window.editGroupMessage('message1');
            assert.equal(f.state.updates.length, 0); assert.match(f.state.validations[0], /無法編輯/);
        }
    });
    await test('cross-device edits are never overwritten', async () => {
        const f = fixture(); f.state.stored.text = '另一台修改'; f.state.attempts = ['本機修改']; await f.window.editGroupMessage('message1');
        assert.equal(f.state.stored.text, '另一台修改'); assert.equal(f.state.updates.length, 0); assert.match(f.state.validations[0], /其他裝置/);
    });
    await test('network and permission failures preserve original; draft can retry in same modal', async () => {
        for (const fail of [true, 'permission']) {
            const f = fixture(); f.state.fail = fail;
            f.state.modal = async options => {
                assert.equal(options.inputValue, message.text);
                assert.equal(await options.preConfirm('保留草稿'), false);
                assert.equal(f.state.stored.text, message.text);
                assert.equal(f.state.updates.length, 0);
                f.state.fail = false;
                assert.equal(await options.preConfirm('保留草稿'), true);
                return { isConfirmed: true };
            };
            await f.window.editGroupMessage('message1');
            assert.equal(f.state.stored.text, '保留草稿'); assert.equal(f.state.dialogs.length, 1);
            assert.equal(f.state.validations.length, 1); assert.equal(f.window.groupEditBusy.size, 0);
        }
    });
    await test('duplicate taps open only one editor and lock actions until modal closes', async () => {
        const f = fixture(); let release;
        f.state.modal = () => new Promise(resolve => { release = resolve; });
        const editing = f.window.editGroupMessage('message1');
        assert.equal(f.window.groupEditBusy.has('message1'), true);
        await f.window.editGroupMessage('message1'); assert.equal(f.state.dialogs.length, 1);
        release({ isConfirmed: false }); await editing; assert.equal(f.window.groupEditBusy.size, 0);
    });
    await test('encoded message IDs cannot break inline buttons and decode to document ID', async () => {
        const id = "teacher'訊息";
        const f = fixture({ ...message, id }); f.state.attempts = ['新內容'];
        await f.window.editGroupMessage(encodeURIComponent(id).replace(/'/g, '%27'));
        assert.ok(f.state.updates[0].ref.endsWith(id));
        const html = renderGroup(teacher, [{ ...message, id }], false);
        assert.ok(!html.includes("editGroupMessage('teacher'")); assert.ok(html.includes('%27'));
    });
    await test('teacher controls are mobile sized and appear only on own ordinary text', async () => {
        const editable = renderGroup(teacher, [message], false);
        assert.ok(editable.includes('editGroupMessage(')); assert.ok(editable.includes('收回'));
        assert.match(editable, /class="min-h-11[^"\n]*">編輯<\/button>/);
        for (const extra of [{ sender: 'parent' }, { messageType: 'image' }, { messageType: 'form', formId: 'f1' },
            { messageType: 'homework', homeworkId: 'h1' }, { withdrawn: true, messageType: 'withdrawn' }]) {
            assert.ok(!renderGroup(teacher, [{ ...message, ...extra }], false).includes('editGroupMessage('));
        }
    });
    await test('both views show edited marker and safe links without creating parent edit controls', async () => {
        const edited = { ...message, edited: true, text: 'https://example.com\n<img src=x onerror=alert(1)>' };
        for (const html of [renderGroup(teacher, [edited], false), renderGroup(parent, [edited], true)]) {
            assert.ok(html.includes('已編輯')); assert.ok(html.includes('href="https://example.com"'));
            assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('<img src=x'));
        }
        assert.ok(!renderGroup(parent, [edited], true).includes('editGroupMessage('));
        for (const extra of [{ withdrawn: true, messageType: 'withdrawn' }, { hiddenByTeacher: true }]) {
            for (const [source, isParent] of [[teacher, false], [parent, true]]) {
                assert.ok(!renderGroup(source, [{ ...edited, ...extra }], isParent).includes('已編輯'));
            }
        }
    });
    await test('editing never sends notifications or creates new documents', async () => {
        assert.ok(!editCode.includes('sendMessageNotification')); assert.ok(!editCode.includes('addDoc('));
        assert.ok(!editCode.includes('sentAt:')); assert.ok(!editCode.includes('timestamp:'));
        const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
        const group = rules.slice(rules.indexOf('match /artifacts/contact-chat/public/data/group_chat/'), rules.indexOf('// Original text/images'));
        assert.match(group, /allow update: if isTeacher\(\) \|\|/);
        assert.match(group, /onlyWithdrawsMessage\(\)/);
    });
    console.log(`${count} group editing regression groups passed. No remote data changed.`);
}
module.exports = { renderGroup, teacher, parent, message };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
