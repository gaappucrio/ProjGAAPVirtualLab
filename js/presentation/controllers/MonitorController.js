import { BombaLogica } from '../../domain/components/BombaLogica.js';
import { TanqueLogico } from '../../domain/components/TanqueLogico.js';
import { createPumpChart, refreshPumpChart } from '../../infrastructure/charts/PumpChartAdapter.js';
import {
    createEmptyMonitorChart,
    createTankVolumeChart,
    refreshEmptyMonitorChartPresentation,
    refreshTankVolumeChart
} from '../../infrastructure/charts/TankChartAdapter.js';
import { createMonitorSlotHistory } from '../monitoring/MonitorSlotHistory.js';
import { getUnitSymbol } from '../units/DisplayUnits.js';
import { t } from '../i18n/LanguageManager.js';

const MAX_MONITOR_CHART_HISTORY = 2;
const MONITOR_LIVE_REFRESH_INTERVAL_S = 0.1;
const MONITOR_TANK_SAMPLE_INTERVAL_S = 0.25;

export function createMonitorController({ engine }) {
    let compactChart = null;
    let liveRefreshTimer = 0;
    let tankSampleTimer = 0;
    let chartedTankId = null;
    let chartedPumpId = null;
    let monitorChartMode = 'empty';
    let expandedMonitorCharts = [null, null];
    const monitorTankSeries = new Map();
    const monitorChartHistory = createMonitorSlotHistory({
        maxEntries: MAX_MONITOR_CHART_HISTORY,
        onRemove: (entry) => {
            if (entry?.kind === 'tank') monitorTankSeries.delete(entry.id);
        }
    });

    function getCompactChartContext() {
        const canvas = document.getElementById('gaap-volume-chart');
        return canvas ? canvas.getContext('2d') : null;
    }

    function destroyCompactChart() {
        if (compactChart) {
            compactChart.destroy();
            compactChart = null;
        }
    }

    function isExpanded() {
        return document.getElementById('chart-wrapper')?.classList.contains('maximized') === true;
    }

    function setCompactMonitorMode(mode) {
        monitorChartMode = mode;
        const chartWrapper = document.getElementById('chart-wrapper');
        if (chartWrapper) chartWrapper.dataset.monitorMode = mode;
    }

    function getMonitorChartKind(component) {
        if (component instanceof TanqueLogico) return 'tank';
        if (component instanceof BombaLogica) return 'pump';
        return null;
    }

    function getMonitorChartKindLabel(kind) {
        if (kind === 'tank') return t('chart.tank');
        if (kind === 'pump') return t('chart.pump');
        return t('chart.component');
    }

    function getMonitorChartComponent(entry) {
        const component = engine.componentes.find((candidate) => candidate.id === entry.id);
        return getMonitorChartKind(component) === entry.kind ? component : null;
    }

    function pruneMonitorChartHistory() {
        monitorChartHistory.prune((entry) => Boolean(getMonitorChartComponent(entry)));
    }

    function getMonitorChartEntries() {
        pruneMonitorChartHistory();
        return monitorChartHistory.getEntries()
            .map((entry) => ({
                ...entry,
                component: getMonitorChartComponent(entry)
            }))
            .filter((entry) => entry.component);
    }

    function resetTankMonitorSeries(component) {
        const series = {
            labels: [Math.round(engine.elapsedTime)],
            values: [component.volumeAtual]
        };
        monitorTankSeries.set(component.id, series);
        return series;
    }

    function ensureTankMonitorSeries(component) {
        let series = monitorTankSeries.get(component.id);
        if (!series) {
            series = resetTankMonitorSeries(component);
        }
        return series;
    }

    function appendTankMonitorSample(component) {
        const series = ensureTankMonitorSeries(component);
        series.labels.push(Math.round(engine.elapsedTime));
        series.values.push(component.volumeAtual);
        if (series.labels.length > 60) {
            series.labels.shift();
            series.values.shift();
        }
        return series;
    }

    function rememberMonitorChartComponent(component) {
        const kind = getMonitorChartKind(component);
        if (!kind) return false;

        monitorChartHistory.remember({ id: component.id, kind });
        if (kind === 'tank') ensureTankMonitorSeries(component);
        return true;
    }

    function createEmptyCompactChart() {
        const ctx = getCompactChartContext();
        if (!ctx) return;

        destroyCompactChart();
        compactChart = createEmptyMonitorChart(ctx);

        setCompactMonitorMode('empty');
        chartedTankId = null;
        chartedPumpId = null;
    }

    function createTankMonitorChartInstance(ctx, component, { resetSeries = false } = {}) {
        const series = resetSeries
            ? resetTankMonitorSeries(component)
            : ensureTankMonitorSeries(component);

        return createTankVolumeChart(ctx, component, series);
    }

    function createTankCompactChart(component) {
        const ctx = getCompactChartContext();
        if (!ctx) return;

        destroyCompactChart();
        compactChart = createTankMonitorChartInstance(ctx, component);

        setCompactMonitorMode('tank');
        chartedTankId = component.id;
        chartedPumpId = null;
    }

    function syncTankMonitorChart(chart, component, { update = true } = {}) {
        if (!(component instanceof TanqueLogico) || !chart) return;
        refreshTankVolumeChart(chart, component, ensureTankMonitorSeries(component), { update });
    }

    function createPumpMonitorChartInstance(ctx, component) {
        return createPumpChart(ctx, component, { expanded: isExpanded() });
    }

    function createPumpCompactChart(component) {
        const ctx = getCompactChartContext();
        if (!ctx) return;

        destroyCompactChart();
        compactChart = createPumpMonitorChartInstance(ctx, component);

        setCompactMonitorMode('pump');
        chartedPumpId = component.id;
        chartedTankId = null;
    }

    function refreshPumpMonitorChartInstance(chart, component) {
        if (!(component instanceof BombaLogica) || !chart) return;
        refreshPumpChart(chart, component, { expanded: isExpanded() });
    }

    function refreshPumpCompactChart(component) {
        if (!(component instanceof BombaLogica) || !compactChart || monitorChartMode !== 'pump' || chartedPumpId !== component.id) {
            return;
        }

        refreshPumpChart(compactChart, component, { expanded: isExpanded() });
    }

    function refreshCompactPumpMonitorChart() {
        if (monitorChartMode !== 'pump' || !chartedPumpId || !compactChart) return;

        const pump = engine.componentes.find((component) => component.id === chartedPumpId);
        if (pump instanceof BombaLogica) {
            refreshPumpCompactChart(pump);
        }
    }

    function refreshPresentation() {
        if (!compactChart) return;

        if (monitorChartMode === 'pump') {
            const bomba = engine.componentes.find((component) => component.id === chartedPumpId);
            if (bomba instanceof BombaLogica) {
                refreshPumpCompactChart(bomba);
            }
            return;
        }

        if (monitorChartMode === 'empty') {
            refreshEmptyMonitorChartPresentation(compactChart);
            return;
        }

        if (monitorChartMode === 'tank' && chartedTankId) {
            const tank = engine.componentes.find((component) => component.id === chartedTankId);
            if (tank) syncTankMonitorChart(compactChart, tank, { update: false });
        }

        compactChart.update();
    }

    function getExpandedChartElements(index) {
        const slot = index + 1;
        const card = document.getElementById(`chart-compare-card-${slot}`);
        return {
            card,
            header: card?.querySelector('.chart-compare-card-header'),
            title: document.getElementById(`chart-compare-title-${slot}`),
            subtitle: document.getElementById(`chart-compare-subtitle-${slot}`),
            canvas: document.getElementById(`gaap-compare-chart-${slot}`),
            canvasWrap: document.getElementById(`chart-compare-wrap-${slot}`),
            empty: document.getElementById(`chart-compare-empty-${slot}`),
            dismissButton: document.getElementById(`chart-compare-dismiss-${slot}`)
        };
    }

    function removeMonitorChartAt(index) {
        const result = monitorChartHistory.removeAt(index);
        if (!result.changed) return;

        renderExpandedMonitorCharts();
    }

    function ensureExpandedChartDismissButton(elements, index) {
        if (!elements?.header) return null;

        let button = elements.dismissButton;
        if (!button) {
            button = document.createElement('button');
            button.id = `chart-compare-dismiss-${index + 1}`;
            button.type = 'button';
            button.className = 'chart-compare-dismiss';
            button.dataset.monitorDismissBound = 'true';
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                removeMonitorChartAt(index);
            });
            elements.header.appendChild(button);
        }

        button.textContent = 'x';
        button.title = t('chart.removeChart');
        button.setAttribute('aria-label', t('chart.removeChart'));

        return button;
    }

    function destroyExpandedMonitorCharts() {
        expandedMonitorCharts.forEach((chart) => {
            if (chart) chart.destroy();
        });
        expandedMonitorCharts = [null, null];
    }

    function getExpandedChartSubtitle(entry) {
        if (entry.kind === 'tank') {
            return `${t('chart.volume')} (${getUnitSymbol('volume')})`;
        }
        if (entry.kind === 'pump') {
            return t('chart.pumpSubtitle');
        }
        return '';
    }

    function updateExpandedMonitorHeader(entries) {
        const badge = document.getElementById('chart-max-badge');
        const status = document.getElementById('chart-max-status');

        if (badge) {
            const count = entries.length;
            badge.textContent = t('chart.badge', { count });
        }

        if (!status) return;

        if (entries.length >= 2) {
            status.textContent = t('chart.statusCompare');
        } else if (entries.length === 1) {
            status.textContent = t('chart.statusOne');
        } else {
            status.textContent = t('chart.statusEmpty');
        }
    }

    function createExpandedMonitorChart(canvas, component) {
        const ctx = canvas?.getContext('2d');
        if (!ctx) return null;

        if (component instanceof TanqueLogico) {
            return createTankMonitorChartInstance(ctx, component);
        }

        if (component instanceof BombaLogica) {
            return createPumpMonitorChartInstance(ctx, component);
        }

        return null;
    }

    function renderExpandedMonitorCharts() {
        const expanded = isExpanded();
        const compactStage = document.getElementById('chart-compact-stage');
        const compareGrid = document.getElementById('chart-compare-grid');

        if (!expanded) {
            if (compactStage) compactStage.hidden = false;
            if (compareGrid) compareGrid.hidden = true;
            destroyExpandedMonitorCharts();
            return;
        }

        const entries = getMonitorChartEntries();
        updateExpandedMonitorHeader(entries);

        if (compactStage) compactStage.hidden = true;
        if (compareGrid) compareGrid.hidden = false;

        destroyExpandedMonitorCharts();

        for (let index = 0; index < MAX_MONITOR_CHART_HISTORY; index += 1) {
            const elements = getExpandedChartElements(index);
            const entry = entries[index];
            const dismissButton = ensureExpandedChartDismissButton(elements, index);

            if (!elements.card) continue;

            if (!entry) {
                elements.card.hidden = index > 0;
                if (dismissButton) dismissButton.hidden = true;
                if (elements.title) elements.title.textContent = t('chart.waiting');
                if (elements.subtitle) elements.subtitle.textContent = '';
                if (elements.canvasWrap) elements.canvasWrap.hidden = true;
                if (elements.empty) {
                    elements.empty.hidden = false;
                    elements.empty.textContent = index === 0
                        ? t('chart.emptyPrimary')
                        : t('chart.emptySecondary');
                }
                continue;
            }

            elements.card.hidden = false;
            if (dismissButton) dismissButton.hidden = false;
            if (elements.title) elements.title.textContent = entry.component.tag || getMonitorChartKindLabel(entry.kind);
            if (elements.subtitle) elements.subtitle.textContent = getExpandedChartSubtitle(entry);
            if (elements.canvasWrap) elements.canvasWrap.hidden = false;
            if (elements.empty) elements.empty.hidden = true;
            if (elements.canvas) {
                elements.canvas.dataset.monitorEntryId = String(entry.id);
                elements.canvas.dataset.monitorEntryKind = entry.kind;
            }

            expandedMonitorCharts[index] = createExpandedMonitorChart(elements.canvas, entry.component);
        }

        requestAnimationFrame(() => {
            expandedMonitorCharts.forEach((chart) => chart?.resize());
        });
    }

    function refreshExpandedMonitorCharts() {
        if (!isExpanded()) return;

        const entries = getMonitorChartEntries();
        const activeCharts = expandedMonitorCharts.filter(Boolean).length;
        const shouldRebuild = entries.length !== activeCharts || entries.some((entry, index) => {
            const elements = getExpandedChartElements(index);
            return !expandedMonitorCharts[index]
                || elements.canvas?.dataset.monitorEntryId !== String(entry.id)
                || elements.canvas?.dataset.monitorEntryKind !== entry.kind;
        });

        if (shouldRebuild) {
            renderExpandedMonitorCharts();
            return;
        }

        updateExpandedMonitorHeader(entries);

        entries.forEach((entry, index) => {
            const chart = expandedMonitorCharts[index];
            const elements = getExpandedChartElements(index);
            const dismissButton = ensureExpandedChartDismissButton(elements, index);

            if (dismissButton) dismissButton.hidden = false;
            if (elements.title) elements.title.textContent = entry.component.tag || getMonitorChartKindLabel(entry.kind);
            if (elements.subtitle) elements.subtitle.textContent = getExpandedChartSubtitle(entry);

            if (entry.component instanceof TanqueLogico) {
                syncTankMonitorChart(chart, entry.component);
            } else if (entry.component instanceof BombaLogica) {
                refreshPumpMonitorChartInstance(chart, entry.component);
            }
        });
    }

    function updateLayout() {
        renderExpandedMonitorCharts();

        requestAnimationFrame(() => {
            if (compactChart) {
                compactChart.resize();
                refreshPresentation();
            }
            refreshExpandedMonitorCharts();
        });
    }

    function updateTrackedTankMonitorSeries() {
        const tankIds = new Set();

        if (monitorChartMode === 'tank' && chartedTankId) {
            tankIds.add(chartedTankId);
        }

        getMonitorChartEntries().forEach((entry) => {
            if (entry.kind === 'tank') tankIds.add(entry.id);
        });

        tankIds.forEach((tankId) => {
            const tank = engine.componentes.find((component) => component.id === tankId);
            if (tank instanceof TanqueLogico) {
                appendTankMonitorSample(tank);
            }
        });
    }

    function refreshCompactTankMonitorChart() {
        if (monitorChartMode !== 'tank' || !chartedTankId || !compactChart) return;

        const tank = engine.componentes.find((component) => component.id === chartedTankId);
        if (tank instanceof TanqueLogico) {
            syncTankMonitorChart(compactChart, tank);
        }
    }

    function refreshMonitorCharts({ appendTankSamples = false } = {}) {
        if (appendTankSamples) updateTrackedTankMonitorSeries();

        refreshCompactTankMonitorChart();
        refreshCompactPumpMonitorChart();
        refreshExpandedMonitorCharts();
    }

    function refreshPumpMonitorCharts(component) {
        if (!(component instanceof BombaLogica)) return;

        refreshPumpCompactChart(component);
        if (isExpanded()) refreshExpandedMonitorCharts();
    }

    function refreshSelection(component, connection) {
        if (component instanceof TanqueLogico) {
            rememberMonitorChartComponent(component);
            if (monitorChartMode !== 'tank' || chartedTankId !== component.id) {
                createTankCompactChart(component);
            }
            if (isExpanded()) renderExpandedMonitorCharts();
            return;
        }

        if (component instanceof BombaLogica) {
            rememberMonitorChartComponent(component);
            if (monitorChartMode !== 'pump' || chartedPumpId !== component.id) {
                createPumpCompactChart(component);
            } else {
                refreshPumpCompactChart(component);
            }
            if (isExpanded()) renderExpandedMonitorCharts();
            return;
        }

        if (connection || !(component instanceof TanqueLogico)) {
            if (monitorChartMode !== 'empty') {
                createEmptyCompactChart();
            }
            if (isExpanded()) refreshExpandedMonitorCharts();
        }
    }

    function handleSimulationUpdate(data) {
        const dt = Math.max(0, Number(data.dt) || 0);

        if (dt <= 0) {
            refreshMonitorCharts();
            return;
        }

        liveRefreshTimer += dt;
        tankSampleTimer += dt;

        if (liveRefreshTimer < MONITOR_LIVE_REFRESH_INTERVAL_S) return;

        liveRefreshTimer = 0;
        const appendTankSamples = tankSampleTimer >= MONITOR_TANK_SAMPLE_INTERVAL_S;
        if (appendTankSamples) tankSampleTimer = 0;
        refreshMonitorCharts({ appendTankSamples });
    }

    return {
        setup: createEmptyCompactChart,
        updateLayout,
        refreshSelection,
        refreshPresentation,
        refreshPump: refreshPumpMonitorCharts,
        handleSimulationUpdate
    };
}
