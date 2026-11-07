// Local Firestore and upload mocks; never changes a real assignment or Drive file.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../teacher.html'), 'utf8');
const editor = source.slice(source.indexOf('        window.getHomeworkCollection ='), source.indexOf('        window.copyHomeworkLink ='));
const original = {
    id: 'homework1', title: '課堂作業', subject: '', deadline: '', description: '', status: 'published',
    updatedAt: 5, publishedMessageId: 'card1', images: ['a', 'b', 'c'].map(key => ({ fileId: key, name: `${key}.jpg`, url: `https://example.test/${key}`, caption: `說明 ${key}` }))
};
const file = (name = 'new.jpg', size = 120, type = 'image/jpeg') => ({ name, size, type, lastModified: 1 });

function fixture() {
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, { value: '', textContent: '', innerHTML: '', classList: { add() {}, remove() {} }, reset() {}, scrollTo() {} });
        return elements.get(id);
    };
    const status = () => element('homeworkStatus').textContent;
    const state = { remote: structuredClone(original), uploads: [], commits: [], notifications: [], revoked: [], transactions: 0, failUpload: '', failCommit: false, authorized: true };
    const window = { fbHomework: [structuredClone(original)], sessionToken: 'mock', CHAT_APP_ID: 'contact-chat', HOMEWORK_APP_ID: 'contact-homework', switchTab() {}, switchClassworkSection() {}, getPreciseTime: () => '10:00', sendMessageNotification: value => state.notifications.push(value) };
    const db = {};
    const commit = writes => {
        if (state.failCommit) throw new Error('模擬儲存失敗');
        state.commits.push(...writes);
        for (const { ref, data } of writes) if (ref.id === original.id) state.remote = { ...state.remote, ...structuredClone(data) };
    };
    vm.runInNewContext(editor, {
        window, db, document: { getElementById: element }, GAS_API_URL: 'mock', console: { error() {} },
        URL: { createObjectURL: chosen => `blob:${chosen.name}`, revokeObjectURL: url => state.revoked.push(url) },
        checkFbAuth: () => state.authorized,
        collection: (_, ...parts) => parts.join('/'), doc: (_, ...parts) => ({ id: parts.at(-1) || 'new' }),
        fetch: async (_, request) => {
            const data = JSON.parse(request.body);
            state.uploads.push(data);
            if (state.failUpload && data.name.endsWith(state.failUpload)) throw new Error('模擬上傳失敗');
            const fileId = `uploaded${state.uploads.length}`;
            return { text: async () => JSON.stringify({ success: true, fileId, fileName: data.name, imageUrl: `https://example.test/${fileId}` }) };
        },
        runTransaction: async (_, callback) => {
            state.transactions++;
            const writes = [];
            await callback({ get: async () => ({ exists: () => Boolean(state.remote), data: () => structuredClone(state.remote) }), update: (ref, data) => writes.push({ ref, data, type: 'update' }) });
            commit(writes);
        },
        writeBatch: () => {
            const writes = [];
            return { set: (ref, data) => writes.push({ ref, data, type: 'set' }), commit: async () => commit(writes) };
        }
    });
    window.readHomeworkFile = async () => 'fake-file-content';
    const control = { disabled: false };
    const save = () => window.publishHomework({ preventDefault() {}, currentTarget: { querySelectorAll: () => [control] } });
    const replace = (index, selected) => window.replaceHomeworkExistingImage(index, { files: selected ? [selected] : [], value: 'chosen' });
    const append = (...selected) => { window.homeworkFiles = selected; window.homeworkNewImageCaptions = selected.map(f => f.name); };
    window.editHomework(original.id);
    return { window, state, element, status, save, replace, append, control };
}

async function run() {
    let count = 0;
    const test = async (label, fn) => { await fn(); count++; console.log(`PASS ${label}`); };
    await test('staged removal, restore, replacement, undo and cancel do not upload or change the published assignment', () => {
        const f = fixture();
        assert.match(f.element('homeworkExistingImagesEditor').innerHTML, /替換第 1 張圖片/);
        f.window.setHomeworkImageRemoved(0, true);
        assert.match(f.element('homeworkExistingImagesEditor').innerHTML, /第 1 張待移除/);
        f.window.setHomeworkImageRemoved(0, false);
        f.replace(1, file());
        assert.match(f.element('homeworkExistingImagesEditor').innerHTML, /待替換：new\.jpg/);
        f.replace(1, null);
        assert.equal(f.window.homeworkExistingImages[1].replacementFile.name, 'new.jpg');
        f.window.undoHomeworkImageReplacement(1);
        assert.equal(f.window.homeworkExistingImages[1].replacementFile, undefined);
        f.replace(0, file('cancel.jpg'));
        f.window.cancelHomeworkEdit();
        assert.deepEqual(f.state.revoked, ['blob:new.jpg', 'blob:cancel.jpg']);
        assert.equal(f.state.uploads.length, 0);
        assert.deepEqual(f.state.remote, original);
    });
    await test('mixed remove, replace and append update images only; the old card and homework ID are preserved', async () => {
        const f = fixture();
        f.window.setHomeworkImageRemoved(0, true);
        f.replace(1, file('replacement.jpg'));
        f.append(file('append.jpg'));
        await f.save();
        assert.deepEqual(f.state.remote.images.map(i => i.fileId), ['uploaded1', 'c', 'uploaded2']);
        assert.equal(f.state.remote.images[0].caption, '說明 b');
        assert.equal(f.state.remote.images[0].name, '01_replacement.jpg');
        assert.equal(f.state.remote.publishedMessageId, 'card1');
        assert.deepEqual(f.state.commits.map(x => [x.type, x.ref.id]), [['update', original.id]]);
        assert.ok(f.state.uploads.every(upload => upload.homeworkId === original.id));
        assert.equal(f.state.notifications.length, 0);
        assert.doesNotMatch(JSON.stringify(f.state.remote.images), /replacementFile|replacementPreview|removed|blob:/);
    });
    await test('can remove the last image without a new upload or card', async () => {
        const f = fixture(); original.images.forEach((_, i) => f.window.setHomeworkImageRemoved(i, true));
        await f.save(); assert.equal(f.state.remote.images.length, 0); assert.equal(f.state.uploads.length, 0);
        assert.equal(f.state.commits.length, 1);
    });
    await test('invalid file and over-limit file leave the previous draft unchanged', () => {
        const f = fixture(); f.replace(0, file('good.jpg'));
        f.replace(0, file('no.pdf', 100, 'application/pdf')); assert.match(f.status(), /圖片檔案/);
        f.replace(0, file('big.jpg', 8 * 1024 * 1024 + 1)); assert.match(f.status(), /8MB/);
        assert.equal(f.window.homeworkExistingImages[0].replacementFile.name, 'good.jpg');
    });
    await test('upload failure keeps original visible and retries only the failed upload', async () => {
        const f = fixture(); f.replace(0, file('one.heic', 100, '')); f.replace(1, file('two.jpg'));
        f.state.failUpload = 'two.jpg'; await f.save();
        assert.deepEqual(f.state.remote, original); assert.equal(f.state.commits.length, 0);
        assert.equal(f.window.homeworkExistingImages[1].replacementFile.name, 'two.jpg');
        assert.equal(f.state.uploads[0].mimeType, 'image/heic');
        assert.match(f.status(), /模擬上傳失敗/);
        f.state.failUpload = ''; await f.save();
        assert.equal(f.state.uploads.length, 3); assert.equal(f.state.remote.images[0].fileId, 'uploaded1');
    });
    await test('failed database commit keeps old data and permits retry without reupload', async () => {
        const f = fixture(); f.replace(0, file()); f.state.failCommit = true;
        const saving = f.save(); assert.equal(f.control.disabled, true);
        await f.save(); await saving;
        assert.equal(f.control.disabled, false); assert.equal(f.state.uploads.length, 1); assert.deepEqual(f.state.remote, original);
        f.state.failCommit = false; await f.save();
        assert.equal(f.state.uploads.length, 1); assert.equal(f.state.remote.images[0].fileId, 'uploaded1');
    });
    await test('cross-device edits, retraction or a missing assignment cannot create or overwrite a card', async () => {
        for (const change of [{ updatedAt: 6 }, { status: 'retracted' }, null]) {
            const f = fixture(); f.state.remote = change ? { ...original, ...change } : null;
            await f.save(); assert.equal(f.state.commits.length, 0); assert.equal(f.state.notifications.length, 0);
        }
        const f = fixture(); f.window.fbHomework = []; f.append(file()); await f.save();
        assert.equal(f.state.uploads.length, 0); assert.equal(f.state.commits.length, 0);
    });
    await test('title edits update the same card without resetting its send time', async () => {
        const f = fixture(); f.element('homeworkTitle').value = '更正標題'; await f.save();
        const card = f.state.commits.find(entry => entry.ref.id === 'card1');
        assert.equal(card.type, 'update'); assert.equal(card.data.homeworkTitle, '更正標題');
        assert.equal(card.data.sentAt, undefined); assert.equal(card.data.timestamp, undefined);
        assert.equal(f.state.notifications.length, 0);
    });
    await test('new assignments still create exactly one card and notification', async () => {
        const f = fixture(); f.window.cancelHomeworkEdit(); f.element('homeworkTitle').value = '新作業';
        await f.save(); assert.equal(f.state.commits.length, 0);
        f.append(file()); await f.save();
        assert.equal(f.state.commits.filter(write => write.type === 'set').length, 2);
        assert.equal(f.state.commits.filter(write => write.data.messageType === 'homework').length, 1);
        assert.equal(f.state.notifications.length, 1);
    });
    console.log(`${count} homework image regression groups passed. No remote data changed.`);
}
module.exports = { editor, fixture, original };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
