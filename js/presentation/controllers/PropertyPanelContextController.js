export function createPropertyPanelContextStore({
    getContentElement,
    getScrollContainer,
    getPropertyTabsState,
    restorePropertyTabsState
}) {
    const contextState = new Map();
    let activeContextKey = 'default';

    function getConnectionContextKey(connection) {
        const sourceId = connection?.sourceId || 'src';
        const targetId = connection?.targetId || 'dst';
        return `connection:${sourceId}->${targetId}`;
    }

    function getContextKey(component = null, connection = null) {
        if (connection) return getConnectionContextKey(connection);
        if (component?.id) return `component:${component.id}`;
        return 'default';
    }

    function capture(contextKey = activeContextKey) {
        const propContent = getContentElement?.();
        const scrollContainer = getScrollContainer?.();
        if (!propContent || !scrollContainer) return;

        contextState.set(contextKey, {
            scrollTop: scrollContainer.scrollTop,
            tabs: getPropertyTabsState(propContent)
        });
    }

    function restore(contextKey, { onAfterRestore } = {}) {
        activeContextKey = contextKey || 'default';
        const savedState = contextState.get(activeContextKey);
        if (!savedState) return;

        const propContent = getContentElement?.();
        const scrollContainer = getScrollContainer?.();
        if (!propContent || !scrollContainer) return;

        const restoredTabs = restorePropertyTabsState(propContent, savedState.tabs);

        requestAnimationFrame(() => {
            const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
            scrollContainer.scrollTop = Math.min(savedState.scrollTop ?? 0, maxScrollTop);
            onAfterRestore?.(restoredTabs);
        });
    }

    function setActiveContextKey(contextKey) {
        activeContextKey = contextKey || 'default';
    }

    function getActiveContextKey() {
        return activeContextKey;
    }

    return {
        getConnectionContextKey,
        getContextKey,
        capture,
        restore,
        setActiveContextKey,
        getActiveContextKey
    };
}
