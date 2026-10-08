// Fake Firestore transactions only; never signs in or modifies real messages.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const teacher = fs.readFileSync(path.join(root, 'teacher.html'), 'utf8');
const parent = fs.readFileSync(path.join(root, 'guardians.html'), 'utf8');
const moderationStart = teacher.indexOf('        window.groupModerationBusy =');
const moderationCode = teacher.slice(moderationStart, teacher.indexOf('        // 🌟 處理老師端選擇圖片並非同步上傳', moderationStart));
const publicPath = 'artifacts/contact-chat/public/data/group_chat/message1';
const archivePath = 'artifacts/contact-chat/public/data/group_chat_hidden/message1';
const message = { studentId: '1410700', sender: 'parent', name: '測試家長', seatNo: '0', timestamp: '2026/10/09 12:30', sentAt: 100, text: '誤傳的原始內容', messageType: 'text', extraPrivateField: 'must-not-leak' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function fixture(original = message) {
    const docs = new Map([[publicPath, structuredClone(original)]]);
    const state = { confirm: true, authorized: true, failCommit: false, errors: [], transactions: 0 };
    const window = { CHAT_APP_ID: 'contact-chat', refreshUI() {}, previewImage() {} };
    const snapshot = ref => ({ exists: () => docs.has(ref), data: () => structuredClone(docs.get(ref)) });
    const context = vm.createContext({ window, URL, db: {}, document: { getElementById: () => null },
        checkFbAuth: () => state.authorized,
        Swal: { fire: async (...args) => { if (typeof args[0] === 'string') state.errors.push(args); return { isConfirmed: state.confirm }; } },
        doc: (_, ...parts) => parts.join('/'), serverTimestamp: () => 'fake-server-timestamp',
        getDoc: async ref => snapshot(ref),
        runTransaction: async (_, callback) => {
            state.transactions++;
            const writes = [];
            await callback({
                get: async ref => { assert.equal(writes.length, 0, 'all reads must precede writes'); return snapshot(ref); },
                set: (ref, data) => writes.push({ ref, data: structuredClone(data) }),
                update: (ref, data) => writes.push({ ref, data: structuredClone(data), merge: true })
            });
            if (state.failCommit) throw Object.assign(new Error('fake denied'), { code: 'permission-denied' });
            for (const write of writes) docs.set(write.ref, write.merge ? { ...docs.get(write.ref), ...write.data } : write.data);
        }
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'chat-text.js'), 'utf8'), context);
    vm.runInContext(moderationCode, context);
    return { window, docs, state };
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log(`PASS ${name}`); }
function renderGroup(source, entries, isParent) {
    const list = { innerHTML: '' };
    const window = { fbGroupChats: entries, expandedGroupMonths: null, groupModerationBusy: new Set(), currentUser: { studentId: '1410700' },
        restoreChatScrollPosition() {}, studentDataEscapeHtml: escape, parentQueryEscapeHtml: escape };
    const context = vm.createContext({ window, URL, document: { getElementById: id => id === 'groupChatMessageList' ? list : null } });
    vm.runInContext(fs.readFileSync(path.join(root, 'chat-text.js'), 'utf8'), context);
    const start = source.indexOf('        function renderGroupChat()');
    const end = source.indexOf(isParent ? '        function renderPrivateChat()' : '        function renderPrivateChatSidebar()', start);
    vm.runInContext(source.slice(start, end) + '\nrenderGroupChat();', context);
    return list.innerHTML;
}
(async () => {
    await test('hide preserves original in teacher archive and fully redacts shared fields', async () => {
        const f = fixture(); await f.window.moderateGroupMessage('message1', true);
        const hidden = f.docs.get(publicPath);
        assert.equal(hidden.hiddenByTeacher, true);
        assert.equal(hidden.text, '此訊息已由教師隱藏');
        assert.ok(!JSON.stringify(hidden).includes(message.text));
        assert.ok(!('extraPrivateField' in hidden));
        assert.deepEqual(f.docs.get(archivePath).originalData, message);
        assert.equal(hidden.sentAt, message.sentAt);
    });
    await test('image URL is removed from shared document and remains restorable', async () => {
        const original = { ...message, messageType: 'image', text: 'https://example.org/private-photo.jpg', imageUrl: 'https://example.org/extra.jpg' };
        const f = fixture(original); await f.window.moderateGroupMessage('message1', true);
        assert.ok(!JSON.stringify(f.docs.get(publicPath)).includes('https://'));
        await f.window.moderateGroupMessage('message1', false);
        assert.deepEqual(f.docs.get(publicPath), { ...original, hiddenByTeacher: false });
        assert.equal(f.docs.get(archivePath).status, 'restored');
    });
    await test('repeat hide cannot overwrite original with placeholder', async () => {
        const f = fixture(); await f.window.moderateGroupMessage('message1', true); await f.window.moderateGroupMessage('message1', true);
        assert.equal(f.docs.get(archivePath).originalData.text, message.text);
    });
    await test('transaction permission failure cannot partially hide or archive', async () => {
        const f = fixture(); f.state.failCommit = true; await f.window.moderateGroupMessage('message1', true);
        assert.deepEqual(f.docs.get(publicPath), message); assert.equal(f.docs.has(archivePath), false);
        assert.match(f.state.errors[0][1], /firestore.rules/);
        assert.equal(f.window.groupModerationBusy.size, 0);
    });
    await test('cancel and unauthenticated actions never write', async () => {
        const f = fixture(); f.state.confirm = false; await f.window.moderateGroupMessage('message1', true);
        f.state.authorized = false; f.state.confirm = true; await f.window.moderateGroupMessage('message1', true);
        assert.equal(f.state.transactions, 0); assert.deepEqual(f.docs.get(publicPath), message);
    });
    await test('own teacher and already withdrawn messages cannot be hidden', async () => {
        for (const original of [{ ...message, sender: 'teacher' }, { ...message, withdrawn: true }]) {
            const f = fixture(original); await f.window.moderateGroupMessage('message1', true);
            assert.equal(f.docs.has(archivePath), false); assert.equal(f.state.errors.length, 1);
        }
    });
    await test('missing archive cannot corrupt hidden shared document', async () => {
        const f = fixture(); await f.window.moderateGroupMessage('message1', true); f.docs.delete(archivePath);
        const before = structuredClone(f.docs.get(publicPath)); await f.window.moderateGroupMessage('message1', false);
        assert.deepEqual(f.docs.get(publicPath), before); assert.equal(f.state.errors.length, 1);
    });
    await test('older-client withdrawal cannot be revived by restore', async () => {
        const f = fixture(); await f.window.moderateGroupMessage('message1', true);
        f.docs.set(publicPath, { ...f.docs.get(publicPath), withdrawn: true, messageType: 'withdrawn', text: '訊息已收回' });
        await f.window.moderateGroupMessage('message1', false);
        assert.equal(f.docs.get(publicPath).text, '訊息已收回'); assert.equal(f.docs.get(publicPath).withdrawn, true);
    });
    await test('both group views mask text and images; only teachers see restore controls', async () => {
        const hidden = { ...message, id: 'message1', hiddenByTeacher: true, messageType: 'image', text: 'https://example.org/should-not-render.jpg' };
        const t = renderGroup(teacher, [hidden], false), p = renderGroup(parent, [hidden], true);
        for (const html of [t, p]) { assert.ok(html.includes('此訊息已由教師隱藏')); assert.ok(!html.includes(hidden.text)); }
        assert.ok(t.includes('恢復顯示')); assert.ok(t.includes('查看原訊息'));
        assert.ok(!p.includes('恢復顯示')); assert.ok(!p.includes('withdrawChatMessage'));
        const visible = renderGroup(teacher, [{ ...message, id: 'message1' }], false);
        assert.ok(visible.includes('隱藏訊息')); assert.ok(visible.includes(message.text));
    });
    await test('rules reserve moderation fields and restrict original documents to teachers', async () => {
        const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
        assert.match(rules, /group_chat_hidden\/\{messageId\}\s*\{\s*allow read, write: if isTeacher\(\);\s*\}/);
        assert.match(rules, /!request\.resource\.data\.keys\(\)\.hasAny\(\['hiddenByTeacher', 'hiddenAt', 'hiddenBy'\]\)/);
        assert.match(rules, /resource\.data\.get\('hiddenByTeacher', false\) != true/);
    });
    console.log(`${count} group moderation regression groups passed. No remote data changed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
