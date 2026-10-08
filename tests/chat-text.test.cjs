const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const window = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'chat-text.js'), 'utf8'), { window, URL });
const render = window.formatChatText;
let count = 0;
function test(name, fn) { fn(); count++; console.log(`PASS ${name}`); }
test('HTTPS and query parameters are clickable and escaped', () => {
    const html = render('https://example.com/?a=1&b=2#photo');
    assert.match(html, /href="https:\/\/example.com\/\?a=1&amp;b=2#photo"/);
    assert.match(html, /target="_blank" rel="noopener noreferrer"/);
});
test('HTTP, www, and multiple links', () => {
    const html = render('http://example.com\nwww.example.org');
    assert.equal((html.match(/<a /g) || []).length, 2);
    assert.match(html, /href="https:\/\/www.example.org"/);
});
test('Chinese punctuation is not part of link', () => {
    const html = render('請看：https://example.com。謝謝！');
    assert.match(html, />https:\/\/example.com<\/a>。謝謝！/);
});
test('ASCII surrounding punctuation and balanced URL parentheses', () => {
    assert.match(render('(https://example.com/test).'), />https:\/\/example.com\/test<\/a>\)\./);
    assert.match(render('https://example.com/a_(b)'), /href="https:\/\/example.com\/a_\(b\)"/);
});
test('Chinese URL paths and encoded characters', () => {
    assert.match(render('https://example.com/作業?q=%22hello%22'), /href="https:\/\/example.com\/作業\?q=%22hello%22"/);
});
test('message HTML cannot execute', () => {
    const html = render('<img src=x onerror="alert(1)"> <script>alert(1)</script>');
    assert.ok(!html.includes('<img'));
    assert.ok(!html.includes('<script'));
    assert.match(html, /&lt;img/);
});
test('unsafe schemes and invalid candidates remain plain text', () => {
    const html = render('javascript:alert(1) data:text/html,test https:// http://');
    assert.ok(!html.includes('<a '));
});
test('attribute injection is escaped', () => {
    const html = render('https://example.com/" onclick="alert(1)');
    assert.ok(!html.includes(' onclick="'));
    assert.match(html, /&quot; onclick=&quot;/);
});
test('whitespace, line breaks, and long URL wrapping are retained', () => {
    const html = render('第一行\n  第二行 https://example.com/' + 'a'.repeat(300));
    assert.match(html, /white-space:pre-wrap/);
    assert.match(html, /第一行\n  第二行/);
    assert.match(html, /overflow-wrap:anywhere/);
});
test('all four chat views and release resources use the shared renderer', () => {
    for (const file of ['teacher.html', 'guardians.html']) {
        const html = fs.readFileSync(path.join(root, file), 'utf8');
        assert.equal((html.match(/window\.formatChatText\(msg\.text\)/g) || []).length, 2);
        assert.ok(html.includes('<script src="./chat-text.js"></script>'));
    }
    for (const file of ['service-worker.js', '.github/workflows/deploy-pages.yml']) {
        assert.ok(fs.readFileSync(path.join(root, file), 'utf8').includes('chat-text.js'));
    }
});
console.log(`${count} chat text regression groups passed.`);
