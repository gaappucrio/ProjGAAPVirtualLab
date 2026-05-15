import { subscribeLanguageChanges, t } from '../i18n/LanguageManager.js';

const MIN_MONITOR_HEIGHT_PX = 260;
const DESKTOP_MONITOR_MARGIN_PX = 24;
const MOBILE_MONITOR_MARGIN_PX = 16;
const DESKTOP_LAYOUT_BREAKPOINT_PX = 960;
const DEFAULT_PALETTE_WIDTH_PX = 280;
const DEFAULT_PROPERTIES_WIDTH_PX = 340;
const EXPANDED_MONITOR_GAP_PX = 10;
const COLLAPSED_MONITOR_GAP_PX = 16;
const POPUP_WORKSPACE_INSET_PX = 24;
const POPUP_MOBILE_INSET_PX = 12;

export function setupLayoutController({ onChartLayoutChange } = {}) {
    const toggleLeft = document.getElementById('toggle-left');
    const panelLeft = document.getElementById('palette');
    const toggleRight = document.getElementById('toggle-right');
    const panelRight = document.getElementById('properties');
    const sandboxContainer = document.querySelector('.sandbox-container');

    const getOpenPanelWidth = (panel, fallbackWidth) => {
        if (!panel || panel.classList.contains('collapsed')) return 0;
        const measuredWidth = panel.getBoundingClientRect().width;
        return Math.max(measuredWidth, fallbackWidth);
    };

    const updateFloatingLayoutMetrics = () => {
        const isDesktop = window.innerWidth > DESKTOP_LAYOUT_BREAKPOINT_PX;
        const paletteWidth = isDesktop ? getOpenPanelWidth(panelLeft, DEFAULT_PALETTE_WIDTH_PX) : 0;
        const propertiesWidth = isDesktop ? getOpenPanelWidth(panelRight, DEFAULT_PROPERTIES_WIDTH_PX) : 0;
        const monitorLeft = paletteWidth > 0
            ? paletteWidth + EXPANDED_MONITOR_GAP_PX
            : COLLAPSED_MONITOR_GAP_PX;
        const monitorRight = propertiesWidth > 0
            ? propertiesWidth + EXPANDED_MONITOR_GAP_PX
            : COLLAPSED_MONITOR_GAP_PX;

        sandboxContainer?.style.setProperty('--chart-max-left', `${Math.round(monitorLeft)}px`);
        sandboxContainer?.style.setProperty('--chart-max-right', `${Math.round(monitorRight)}px`);

        const rootStyle = document.documentElement.style;
        if (!sandboxContainer || !isDesktop) {
            rootStyle.setProperty('--tank-popup-left', `${POPUP_MOBILE_INSET_PX}px`);
            rootStyle.setProperty('--tank-popup-right', `${POPUP_MOBILE_INSET_PX}px`);
            return;
        }

        const rect = sandboxContainer.getBoundingClientRect();
        const popupLeft = Math.max(
            POPUP_MOBILE_INSET_PX,
            rect.left + paletteWidth + POPUP_WORKSPACE_INSET_PX
        );
        const popupRight = Math.max(
            POPUP_MOBILE_INSET_PX,
            window.innerWidth - rect.right + propertiesWidth + POPUP_WORKSPACE_INSET_PX
        );

        rootStyle.setProperty('--tank-popup-left', `${Math.round(popupLeft)}px`);
        rootStyle.setProperty('--tank-popup-right', `${Math.round(popupRight)}px`);
    };
    toggleLeft?.addEventListener('click', () => {
        const isCollapsed = panelLeft.classList.toggle('collapsed');
        toggleLeft.classList.toggle('collapsed');
        updateFloatingLayoutMetrics();
        onChartLayoutChange?.();
        toggleLeft.textContent = isCollapsed ? '▶' : '◀';
    });

    toggleRight?.addEventListener('click', () => {
        const isCollapsed = panelRight.classList.toggle('collapsed');
        toggleRight.classList.toggle('collapsed');
        updateFloatingLayoutMetrics();
        onChartLayoutChange?.();
        toggleRight.textContent = isCollapsed ? '◀' : '▶';
    });

    const btnMaxChart = document.getElementById('btn-max-chart');
    const chartWrapper = document.getElementById('chart-wrapper');
    const chartMaxHeader = document.getElementById('chart-max-header');
    const btnCloseMaxChart = document.getElementById('btn-close-max-chart');
    let resizeHandle = null;
    let resizeState = null;
    let resizeFrame = 0;

    const getMonitorViewportMargin = () => (
        window.innerWidth <= 960 ? MOBILE_MONITOR_MARGIN_PX : DESKTOP_MONITOR_MARGIN_PX
    );

    const getMaxMonitorHeight = () => Math.max(
        MIN_MONITOR_HEIGHT_PX,
        window.innerHeight - getMonitorViewportMargin()
    );

    const clampMonitorHeight = (heightPx) => Math.max(
        MIN_MONITOR_HEIGHT_PX,
        Math.min(getMaxMonitorHeight(), Number(heightPx) || MIN_MONITOR_HEIGHT_PX)
    );

    const scheduleChartLayout = () => {
        if (resizeFrame) return;
        resizeFrame = requestAnimationFrame(() => {
            resizeFrame = 0;
            onChartLayoutChange?.();
        });
    };

    const setMonitorHeight = (heightPx) => {
        if (!chartWrapper) return;
        chartWrapper.style.setProperty('--chart-max-height', `${clampMonitorHeight(heightPx)}px`);
        scheduleChartLayout();
    };

    const clampCurrentMonitorHeight = () => {
        if (!chartWrapper?.classList.contains('maximized')) return;
        setMonitorHeight(chartWrapper.getBoundingClientRect().height);
    };

    const finishResize = () => {
        if (!resizeState) return;

        if (resizeHandle?.hasPointerCapture?.(resizeState.pointerId)) {
            resizeHandle.releasePointerCapture(resizeState.pointerId);
        }
        resizeState = null;
        chartWrapper?.classList.remove('is-resizing');
        window.removeEventListener('pointermove', handleResizeMove);
        window.removeEventListener('pointerup', finishResize);
        window.removeEventListener('pointercancel', finishResize);
        scheduleChartLayout();
    };

    function handleResizeMove(event) {
        if (!resizeState) return;

        event.preventDefault();
        const nextHeight = resizeState.startHeight + (resizeState.startY - event.clientY);
        setMonitorHeight(nextHeight);
    }

    const startResize = (event) => {
        if (!chartWrapper?.classList.contains('maximized')) return;

        event.preventDefault();
        resizeState = {
            pointerId: event.pointerId,
            startY: event.clientY,
            startHeight: chartWrapper.getBoundingClientRect().height
        };
        chartWrapper.classList.add('is-resizing');
        resizeHandle?.setPointerCapture?.(event.pointerId);
        window.addEventListener('pointermove', handleResizeMove);
        window.addEventListener('pointerup', finishResize);
        window.addEventListener('pointercancel', finishResize);
    };

    const ensureResizeHandle = () => {
        if (!chartWrapper || resizeHandle) return;

        resizeHandle = document.createElement('div');
        resizeHandle.className = 'chart-resize-handle';
        resizeHandle.setAttribute('role', 'separator');
        resizeHandle.setAttribute('aria-orientation', 'horizontal');
        resizeHandle.title = t('chart.resizeMonitor');
        resizeHandle.addEventListener('pointerdown', startResize);
        chartWrapper.prepend(resizeHandle);
    };

    const updateChartButtonLabels = () => {
        const isMax = chartWrapper?.classList.contains('maximized') === true;
        if (btnMaxChart) btnMaxChart.textContent = isMax ? t('chart.close') : t('chart.expand');
        if (btnCloseMaxChart) btnCloseMaxChart.textContent = t('chart.closeChart');
        if (resizeHandle) resizeHandle.title = t('chart.resizeMonitor');
    };

    const toggleChartMaximize = () => {
        const isMax = chartWrapper?.classList.toggle('maximized') === true;
        ensureResizeHandle();
        updateChartButtonLabels();
        if (chartMaxHeader) chartMaxHeader.style.display = isMax ? 'flex' : 'none';
        if (isMax) clampCurrentMonitorHeight();
        else finishResize();
        requestAnimationFrame(() => {
            onChartLayoutChange?.();
        });
    };

    btnMaxChart?.addEventListener('click', toggleChartMaximize);
    btnCloseMaxChart?.addEventListener('click', toggleChartMaximize);
    window.addEventListener('resize', () => {
        updateFloatingLayoutMetrics();
        clampCurrentMonitorHeight();
    });

    if (window.innerWidth > 800) {
        panelLeft?.classList.remove('collapsed');
        toggleLeft?.classList.remove('collapsed');
        if (toggleLeft) toggleLeft.textContent = '◀';

        panelRight?.classList.remove('collapsed');
        toggleRight?.classList.remove('collapsed');
        if (toggleRight) toggleRight.textContent = '▶';
    }

    updateFloatingLayoutMetrics();
    updateChartButtonLabels();
    subscribeLanguageChanges(updateChartButtonLabels);
}
