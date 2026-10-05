// Keep the active chat composer just above the mobile keyboard's visible edge.
(() => {
    const composerSelector = '#groupChatInputArea, #privateChatInputArea';
    const inputSelector = '#groupChatInput, #privateChatInput';
    let activeComposer = null;
    let scheduled = false;

    const sync = () => {
        scheduled = false;
        const input = document.activeElement;
        const composer = input?.matches?.(inputSelector) ? input.closest(composerSelector) : null;
        const nextComposer = window.matchMedia('(max-width: 1023px)').matches && composer?.getClientRects().length ? composer : null;

        if (activeComposer && activeComposer !== nextComposer) activeComposer.classList.remove('chat-composer-docked');
        activeComposer = nextComposer;
        document.body.classList.toggle('chat-composing', Boolean(activeComposer));
        if (!activeComposer) return;

        activeComposer.classList.add('chat-composer-docked');
        const page = activeComposer.parentElement;
        const pageRect = page.getBoundingClientRect();
        const viewport = window.visualViewport;
        const visibleBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
        const composerHeight = activeComposer.getBoundingClientRect().height;
        activeComposer.style.setProperty('--chat-composer-top', `${Math.max(0, Math.round(visibleBottom - composerHeight))}px`);
        activeComposer.style.setProperty('--chat-composer-left', `${Math.round(pageRect.left)}px`);
        activeComposer.style.setProperty('--chat-composer-width', `${Math.round(pageRect.width)}px`);
        page.style.setProperty('--chat-composer-height', `${Math.ceil(composerHeight)}px`);
    };

    const scheduleSync = () => {
        if (scheduled) return;
        scheduled = true;
        window.requestAnimationFrame(sync);
    };

    document.addEventListener('focusin', event => {
        if (!event.target.matches?.(inputSelector)) return;
        scheduleSync();
        window.setTimeout(() => {
            scheduleSync();
            const scrollArea = document.getElementById(event.target.id === 'groupChatInput' ? 'groupChatScrollArea' : 'privateChatScrollArea');
            if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;
        }, 120);
    });
    document.addEventListener('focusout', event => {
        if (event.target.matches?.(inputSelector)) window.setTimeout(scheduleSync, 0);
    });
    document.addEventListener('input', event => {
        if (event.target.matches?.(inputSelector)) scheduleSync();
    });
    window.addEventListener('resize', scheduleSync);
    window.visualViewport?.addEventListener('resize', scheduleSync);
    window.visualViewport?.addEventListener('scroll', scheduleSync);

    // Opening a private chat should show its latest message, including after images load.
    window.showLatestPrivateChatMessage = () => {
        const scrollArea = document.getElementById('privateChatScrollArea');
        if (!scrollArea) return;
        scrollArea.dataset.followLatest = 'true';
        scrollArea.style.scrollBehavior = 'auto';
        if (!scrollArea.dataset.followLatestReady) {
            const stopFollowing = () => { delete scrollArea.dataset.followLatest; };
            scrollArea.addEventListener('wheel', stopFollowing, { passive: true });
            scrollArea.addEventListener('touchstart', stopFollowing, { passive: true });
            scrollArea.addEventListener('pointerdown', stopFollowing, { passive: true });
            scrollArea.addEventListener('load', event => {
                if (event.target.tagName === 'IMG' && scrollArea.dataset.followLatest === 'true') {
                    scrollArea.scrollTop = scrollArea.scrollHeight;
                }
            }, true);
            scrollArea.dataset.followLatestReady = 'true';
        }
        const scrollToLatest = () => {
            if (scrollArea.dataset.followLatest === 'true') scrollArea.scrollTop = scrollArea.scrollHeight;
        };
        window.requestAnimationFrame(scrollToLatest);
        window.setTimeout(scrollToLatest, 100);
    };
})();
