// Resize the chat screen once; keep its composer in the normal flex layout.
(() => {
    const composerSelector = '#groupChatInputArea, #privateChatInputArea';
    const inputSelector = '#groupChatInput, #privateChatInput';
    let activeComposer = null;
    let scheduled = false;
    let restingHeight = window.visualViewport?.height || window.innerHeight;
    let viewportWidth = window.innerWidth;
    let focusPendingUntil = 0;

    const setViewportValue = (name, value) => {
        const style = document.documentElement.style;
        if (style.getPropertyValue(name) === value) return false;
        style.setProperty(name, value);
        return true;
    };

    const sync = () => {
        scheduled = false;
        const viewport = window.visualViewport;
        const height = Math.round(viewport?.height || window.innerHeight);
        const mobile = window.matchMedia('(max-width: 1023px)').matches;
        const chatVisible = document.body.classList.contains('chat-page-active');
        const input = document.activeElement;
        const composer = input?.matches?.(inputSelector) ? input.closest(composerSelector) : null;
        const candidate = composer || activeComposer;
        if (Math.abs(window.innerWidth - viewportWidth) > 50) {
            viewportWidth = window.innerWidth;
            restingHeight = Math.max(height, window.innerHeight);
        }
        const keyboardOpen = restingHeight - height > 100 || window.innerHeight - height > 100;
        const composing = Boolean(mobile && chatVisible && candidate?.getClientRects().length
            && (keyboardOpen || (composer && Date.now() < focusPendingUntil)));
        const scrollArea = candidate ? document.getElementById(candidate.id === 'groupChatInputArea' ? 'groupChatScrollArea' : 'privateChatScrollArea') : null;
        const followLatest = scrollArea && (scrollArea.dataset.followLatest === 'true'
            || scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight <= 32);
        const composingChanged = document.body.classList.contains('chat-composing') !== composing;
        document.body.classList.toggle('chat-composing', composing);
        activeComposer = composing ? candidate : null;

        const heightChanged = setViewportValue('--app-height', `${height}px`);
        setViewportValue('--app-viewport-top', `${mobile && chatVisible ? Math.max(0, Math.round(viewport?.offsetTop || 0)) : 0}px`);
        if (!composer && !composing) restingHeight = height;
        if (followLatest && (heightChanged || composingChanged)) {
            window.requestAnimationFrame(() => { scrollArea.scrollTop = scrollArea.scrollHeight; });
        }
    };

    const scheduleSync = () => {
        if (scheduled) return;
        scheduled = true;
        window.requestAnimationFrame(sync);
    };

    const beginComposing = input => {
        if (!input.matches?.(inputSelector)) return;
        if (!activeComposer) restingHeight = Math.max(restingHeight, window.visualViewport?.height || window.innerHeight);
        focusPendingUntil = Date.now() + 650;
        scheduleSync();
        window.setTimeout(scheduleSync, 700);
    };
    document.addEventListener('focusin', event => beginComposing(event.target));
    document.addEventListener('pointerdown', event => beginComposing(event.target), { passive: true });
    document.addEventListener('focusout', event => {
        if (event.target.matches?.(inputSelector)) window.setTimeout(scheduleSync, 0);
    });
    window.addEventListener('resize', scheduleSync);
    window.addEventListener('pageshow', scheduleSync);
    window.addEventListener('orientationchange', () => window.setTimeout(scheduleSync, 150));
    window.visualViewport?.addEventListener('resize', scheduleSync);
    window.visualViewport?.addEventListener('scroll', scheduleSync);
    window.syncChatViewport = scheduleSync;
    sync();

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
