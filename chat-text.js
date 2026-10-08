// Shared plain-text rendering for teacher/parent chat and contact-book notices.
// Never interpret message text as HTML or accept executable URL schemes.
(() => {
    const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
    const urlPattern = /(?:https?:\/\/|www\.)[^\s<>"'`，。！？；：（）【】「」『』、…]+/gi;

    window.formatChatText = value => {
        const text = String(value ?? '');
        let cursor = 0;
        let html = '';
        for (const match of text.matchAll(urlPattern)) {
            let label = match[0].replace(/[.,!?;:]+$/g, '');
            // Keep balanced parentheses in URLs, but not surrounding prose.
            for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
                while (label.endsWith(close) && label.split(close).length > label.split(open).length) {
                    label = label.slice(0, -1).replace(/[.,!?;:]+$/g, '');
                }
            }
            const href = /^www\./i.test(label) ? `https://${label}` : label;
            let valid = false;
            try {
                const url = new URL(href);
                valid = ['https:', 'http:'].includes(url.protocol) && Boolean(url.hostname);
            } catch (_) { /* Invalid candidates remain ordinary text. */ }
            html += escapeHtml(text.slice(cursor, match.index));
            html += valid
                ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="chat-message-link" style="color:inherit;text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(label)}</a>${escapeHtml(match[0].slice(label.length))}`
                : escapeHtml(match[0]);
            cursor = match.index + match[0].length;
        }
        html += escapeHtml(text.slice(cursor));
        return `<span style="white-space:pre-wrap;overflow-wrap:anywhere">${html}</span>`;
    };
})();
