import { subscribeLanguageChanges, t } from '../../utils/I18n.js';

export function setupLayoutController({ onChartLayoutChange } = {}) {
    const toggleLeft = document.getElementById('toggle-left');
    const panelLeft = document.getElementById('palette');
    toggleLeft?.addEventListener('click', () => {
        const isCollapsed = panelLeft.classList.toggle('collapsed');
        toggleLeft.classList.toggle('collapsed');
        toggleLeft.textContent = isCollapsed ? '▶' : '◀';
    });

    const toggleRight = document.getElementById('toggle-right');
    const panelRight = document.getElementById('properties');
    toggleRight?.addEventListener('click', () => {
        const isCollapsed = panelRight.classList.toggle('collapsed');
        toggleRight.classList.toggle('collapsed');
        toggleRight.textContent = isCollapsed ? '◀' : '▶';
    });

    const btnMaxChart = document.getElementById('btn-max-chart');
    const chartWrapper = document.getElementById('chart-wrapper');
    const chartMaxHeader = document.getElementById('chart-max-header');
    const btnCloseMaxChart = document.getElementById('btn-close-max-chart');

    const updateChartButtonLabels = () => {
        const isMax = chartWrapper?.classList.contains('maximized') === true;
        if (btnMaxChart) btnMaxChart.textContent = isMax ? t('chart.close') : t('chart.expand');
        if (btnCloseMaxChart) btnCloseMaxChart.textContent = t('chart.closeChart');
    };

    const toggleChartMaximize = () => {
        const isMax = chartWrapper?.classList.toggle('maximized') === true;
        updateChartButtonLabels();
        if (chartMaxHeader) chartMaxHeader.style.display = isMax ? 'flex' : 'none';
        requestAnimationFrame(() => {
            onChartLayoutChange?.();
        });
    };

    btnMaxChart?.addEventListener('click', toggleChartMaximize);
    btnCloseMaxChart?.addEventListener('click', toggleChartMaximize);

    if (window.innerWidth > 800) {
        panelLeft?.classList.remove('collapsed');
        toggleLeft?.classList.remove('collapsed');
        if (toggleLeft) toggleLeft.textContent = '◀';

        panelRight?.classList.remove('collapsed');
        toggleRight?.classList.remove('collapsed');
        if (toggleRight) toggleRight.textContent = '▶';
    }

    updateChartButtonLabels();
    subscribeLanguageChanges(updateChartButtonLabels);
}
