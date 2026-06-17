import { BombaLogica } from '../../domain/components/BombaLogica.js';
import { ConnectionModel } from '../../domain/models/ConnectionModel.js';
import { TanqueLogico } from '../../domain/components/TanqueLogico.js';
import { ValvulaLogica } from '../../domain/components/ValvulaLogica.js';
import {
    createCompositePipePressureChart,
    createPipePressureChart,
    refreshCompositePipePressureChart,
    refreshPipePressureChart
} from '../../infrastructure/charts/PipePressureChartAdapter.js';
import { createPumpChart, refreshPumpChart } from '../../infrastructure/charts/PumpChartAdapter.js';
import { createValveChart, refreshValveChart } from '../../infrastructure/charts/ValveChartAdapter.js';
import {
    createEmptyMonitorChart,
    createTankVolumeChart,
    refreshEmptyMonitorChartPresentation,
    refreshTankVolumeChart
} from '../../infrastructure/charts/TankChartAdapter.js';
import { exportPumpDwsimJson } from '../export/PumpDwsimJsonExporter.js';
import { createMonitorSlotHistory } from '../monitoring/MonitorSlotHistory.js';
import { canMergePipeMonitorEntries, isPipeMonitorEntry } from '../monitoring/PipeMonitorGrouping.js';
import { resolvePipePressureProfileOptions } from '../monitoring/PipePressureProfile.js';
import { getUnitSymbol } from '../units/DisplayUnits.js';
import { t } from '../i18n/LanguageManager.js';

const MAX_MONITOR_CHART_HISTORY = 2;
const MONITOR_LIVE_REFRESH_INTERVAL_S = 0.1;
const MONITOR_TANK_SAMPLE_INTERVAL_S = 0.25;
const PIXELS_PER_METER_FOR_MONITOR_GAP = 80;

export function createMonitorController({ engine }) {
    let compactChart = null;
    let liveRefreshTimer = 0;
    let tankSampleTimer = 0;
    let chartedTankId = null;
    let chartedPumpId = null;
    let chartedValveId = null;
    let chartedConnectionId = null;
    let monitorChartMode = 'empty';
    let expandedMonitorCharts = [null, null];
    let draggedMonitorIndex = null;
    let blockedMonitorSelectionLabel = '';
    let expandedChartYAxisModes = ['yHead', 'yHead'];
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
        const wrapper = document.getElementById('chart-wrapper');
        return wrapper?.classList.contains('maximized') === true && wrapper?.classList.contains('is-closing') === false;
    }

    function setCompactMonitorMode(mode) {
        monitorChartMode = mode;
        const chartWrapper = document.getElementById('chart-wrapper');
        if (chartWrapper) chartWrapper.dataset.monitorMode = mode;
    }

    function getMonitorChartKind(component) {
        if (component instanceof TanqueLogico) return 'tank';
        if (component instanceof BombaLogica) return 'pump';
        if (component instanceof ValvulaLogica) return 'valve';
        if (component instanceof ConnectionModel) return 'pipe';
        return null;
    }

    function getMonitorChartKindLabel(kind) {
        if (kind === 'tank') return t('chart.tank');
        if (kind === 'pump') return t('chart.pump');
        if (kind === 'valve') return t('chart.valve');
        if (kind === 'pipe') return t('chart.pipe');
        if (kind === 'pipeGroup') return t('chart.pipeGroup');
        return t('chart.component');
    }

    function getPipeGroupConnections(entry) {
        if (entry?.kind !== 'pipeGroup' || !Array.isArray(entry.ids)) return [];

        return entry.ids
            .map((id) => engine.conexoes.find((candidate) => candidate.id === id))
            .filter((connection) => connection instanceof ConnectionModel);
    }

    function getMonitorChartComponent(entry) {
        if (entry.kind === 'pipeGroup') {
            const connections = getPipeGroupConnections(entry);
            return connections.length > 0 ? connections : null;
        }

        if (entry.kind === 'pipe') {
            const connection = engine.conexoes.find((candidate) => candidate.id === entry.id);
            return getMonitorChartKind(connection) === entry.kind ? connection : null;
        }

        const component = engine.componentes.find((candidate) => candidate.id === entry.id);
        return getMonitorChartKind(component) === entry.kind ? component : null;
    }

    function getConnectionMonitorLabel(connection) {
        const source = engine.getComponentById?.(connection?.sourceId);
        const target = engine.getComponentById?.(connection?.targetId);
        const sourceLabel = source?.tag || connection?.sourceId || t('chart.pipe');
        const targetLabel = target?.tag || connection?.targetId || t('chart.pipe');
        return `${sourceLabel} -> ${targetLabel}`;
    }

    function getMonitorComponentLabel(component, kind = getMonitorChartKind(component)) {
        if (kind === 'pipe') return getConnectionMonitorLabel(component);
        return component?.tag || getMonitorChartKindLabel(kind);
    }

    function getPipePressureProfileOptions(connection) {
        const state = engine.getConnectionState(connection);
        const source = engine.getComponentById?.(connection?.sourceId);
        return resolvePipePressureProfileOptions({ state, source });
    }

    function getConnectionLengthM(connection) {
        const geometry = engine.getConnectionGeometry(connection);
        return Math.max(0, Number(geometry?.lengthM) || 0);
    }

    function getVisualGapBetweenComponentsM(sourceComponentId, targetComponentId) {
        const source = engine.getComponentById?.(sourceComponentId);
        const target = engine.getComponentById?.(targetComponentId);
        if (!source || !target) return 1;

        const dx = (Number(target.x) || 0) - (Number(source.x) || 0);
        const dy = (Number(target.y) || 0) - (Number(source.y) || 0);
        return Math.max(1, Math.sqrt((dx * dx) + (dy * dy)) / PIXELS_PER_METER_FOR_MONITOR_GAP);
    }

    function getShortestUnselectedPathLengthM(sourceComponentId, targetComponentId, blockedConnectionIds = new Set()) {
        if (!sourceComponentId || !targetComponentId) return null;
        if (sourceComponentId === targetComponentId) return 0;

        const distances = new Map([[sourceComponentId, 0]]);
        const queue = [sourceComponentId];

        while (queue.length > 0) {
            queue.sort((a, b) => distances.get(a) - distances.get(b));
            const currentId = queue.shift();
            const currentDistance = distances.get(currentId);

            if (currentId === targetComponentId) return currentDistance;

            engine.conexoes.forEach((connection) => {
                if (blockedConnectionIds.has(connection.id) || connection.sourceId !== currentId) return;

                const nextDistance = currentDistance + getConnectionLengthM(connection);
                const previousDistance = distances.get(connection.targetId);
                if (previousDistance !== undefined && previousDistance <= nextDistance) return;

                distances.set(connection.targetId, nextDistance);
                queue.push(connection.targetId);
            });
        }

        return null;
    }

    function isConnectionBefore(a, b, blockedConnectionIds = new Set()) {
        if (!(a instanceof ConnectionModel) || !(b instanceof ConnectionModel)) return false;
        if (a.targetId === b.sourceId) return true;
        return getShortestUnselectedPathLengthM(a.targetId, b.sourceId, blockedConnectionIds) !== null;
    }

    function orderPipeGroupConnections(connections) {
        const selectedIds = new Set(connections.map((connection) => connection.id));
        return [...connections].sort((a, b) => {
            if (isConnectionBefore(a, b, selectedIds)) return -1;
            if (isConnectionBefore(b, a, selectedIds)) return 1;

            const sourceA = engine.getComponentById?.(a.sourceId);
            const sourceB = engine.getComponentById?.(b.sourceId);
            const xA = Number(sourceA?.x) || 0;
            const xB = Number(sourceB?.x) || 0;
            if (xA !== xB) return xA - xB;
            return (Number(sourceA?.y) || 0) - (Number(sourceB?.y) || 0);
        });
    }

    function getPipeGapBeforeSection(previousConnection, currentConnection, blockedConnectionIds) {
        if (!previousConnection || !currentConnection) return 0;
        if (previousConnection.targetId === currentConnection.sourceId) return 0;

        const pathLengthM = getShortestUnselectedPathLengthM(
            previousConnection.targetId,
            currentConnection.sourceId,
            blockedConnectionIds
        );
        return pathLengthM ?? getVisualGapBetweenComponentsM(previousConnection.targetId, currentConnection.sourceId);
    }

    function buildPipeGroupSections(connections = []) {
        const orderedConnections = orderPipeGroupConnections(connections);
        const selectedIds = new Set(orderedConnections.map((connection) => connection.id));

        return orderedConnections.map((connection, index) => {
            const state = engine.getConnectionState(connection);
            const source = engine.getComponentById?.(connection?.sourceId);
            const previousConnection = index > 0 ? orderedConnections[index - 1] : null;

            return {
                connection,
                state,
                geometry: engine.getConnectionGeometry(connection),
                label: getConnectionMonitorLabel(connection),
                gapBeforeM: getPipeGapBeforeSection(previousConnection, connection, selectedIds),
                ...resolvePipePressureProfileOptions({ state, source })
            };
        });
    }

    function getMonitorChartTitle(entry) {
        if (entry?.kind === 'pipe') return getConnectionMonitorLabel(entry.component);
        if (entry?.kind === 'pipeGroup') {
            return t('chart.pipeGroupTitle', { count: entry.component?.length || 0 });
        }
        return entry?.component?.tag || getMonitorChartKindLabel(entry?.kind);
    }

    function isMonitorChartEntryValid(entry) {
        if (entry?.kind === 'pipeGroup') {
            return Array.isArray(entry.ids)
                && entry.ids.length > 0
                && getPipeGroupConnections(entry).length === entry.ids.length
                && canMergePipeMonitorEntries(entry, entry, engine.conexoes);
        }

        return Boolean(getMonitorChartComponent(entry));
    }

    function pruneMonitorChartHistory() {
        monitorChartHistory.prune(isMonitorChartEntryValid);
    }

    function getMonitorChartEntries() {
        pruneMonitorChartHistory();
        return monitorChartHistory.getEntries()
            .map((entry) => entry
                ? {
                    ...entry,
                    component: getMonitorChartComponent(entry)
                }
                : null);
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

        const result = monitorChartHistory.remember({ id: component.id, kind });
        const alreadyDisplayed = monitorChartHistory.getEntries()
            .some((entry) => entry?.id === component.id && entry.kind === kind);
        blockedMonitorSelectionLabel = result.changed || alreadyDisplayed
            ? ''
            : getMonitorComponentLabel(component, kind);
        if (kind === 'tank') ensureTankMonitorSeries(component);
        return result.changed;
    }

    function createEmptyCompactChart() {
        const ctx = getCompactChartContext();
        if (!ctx) return;

        destroyCompactChart();
        compactChart = createEmptyMonitorChart(ctx);

        setCompactMonitorMode('empty');
        chartedTankId = null;
        chartedPumpId = null;
        chartedValveId = null;
        chartedConnectionId = null;
        refreshCompactPumpExportButton(null);
        refreshCompactChartAxisSelector();
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
        chartedValveId = null;
        chartedConnectionId = null;
        refreshCompactPumpExportButton(null);
        refreshCompactChartAxisSelector();
    }

    function syncTankMonitorChart(chart, component, { update = true } = {}) {
        if (!(component instanceof TanqueLogico) || !chart) return;
        refreshTankVolumeChart(chart, component, ensureTankMonitorSeries(component), { update });
    }

    function createPumpMonitorChartInstance(ctx, component, { yAxisMode } = {}) {
        return createPumpChart(ctx, component, { expanded: isExpanded(), yAxisMode });
    }

    function createValveMonitorChartInstance(ctx, component, { yAxisMode } = {}) {
        return createValveChart(ctx, component, { expanded: isExpanded(), yAxisMode });
    }

    function createPipeMonitorChartInstance(ctx, connection) {
        return createPipePressureChart(
            ctx,
            connection,
            engine.getConnectionState(connection),
            engine.getConnectionGeometry(connection),
            {
                expanded: isExpanded(),
                label: getConnectionMonitorLabel(connection),
                ...getPipePressureProfileOptions(connection)
            }
        );
    }

    function getPipeGroupLabel(connections = []) {
        return t('chart.pipeGroupLegend', { count: connections.length });
    }

    function createPipeGroupMonitorChartInstance(ctx, connections = []) {
        return createCompositePipePressureChart(
            ctx,
            buildPipeGroupSections(connections),
            {
                expanded: isExpanded(),
                label: getPipeGroupLabel(connections)
            }
        );
    }

    function handlePumpExportClick(event) {
        event.preventDefault();
        event.stopPropagation();

        const pumpId = event.currentTarget?.dataset?.pumpId;
        const pump = engine.componentes.find((component) => component.id === pumpId);
        if (pump instanceof BombaLogica) {
            exportPumpDwsimJson(engine, pump);
        }
    }

    function ensurePumpExportButton(container, id) {
        if (!container) return null;

        let button = document.getElementById(id);
        if (!button) {
            button = document.createElement('button');
            button.id = id;
            button.type = 'button';
            button.className = 'chart-pump-export-button';
            button.addEventListener('click', handlePumpExportClick);
            container.appendChild(button);
        }

        if (button.parentElement !== container) {
            container.appendChild(button);
        }

        button.classList.toggle('is-header-action', container.classList.contains('chart-compare-card-header'));
        button.classList.toggle('is-compact-action', id === 'chart-pump-export-compact');
        button.textContent = 'JSON';
        button.title = t('chart.exportPumpJsonTitle');
        button.setAttribute('aria-label', t('chart.exportPumpJson'));
        return button;
    }

    function setPumpExportButtonState(button, component) {
        if (!button) return;

        if (component instanceof BombaLogica) {
            button.hidden = false;
            button.dataset.pumpId = component.id;
            button.title = t('chart.exportPumpJsonTitle');
            button.setAttribute('aria-label', t('chart.exportPumpJson'));
            return;
        }

        button.hidden = true;
        delete button.dataset.pumpId;
    }

    function refreshCompactPumpExportButton(component = null) {
        const button = ensurePumpExportButton(
            document.getElementById('chart-compact-stage'),
            'chart-pump-export-compact'
        );

        setPumpExportButtonState(button, component);
    }

    function createPumpCompactChart(component) {
        const ctx = getCompactChartContext();
        if (!ctx) return;

        destroyCompactChart();
        compactChart = createPumpMonitorChartInstance(ctx, component);

        setCompactMonitorMode('pump');
        chartedPumpId = component.id;
        chartedTankId = null;
        chartedValveId = null;
        chartedConnectionId = null;
        refreshCompactPumpExportButton(component);
        refreshCompactChartAxisSelector();
    }

    function refreshPumpMonitorChartInstance(chart, component) {
        if (!(component instanceof BombaLogica) || !chart) return;
        refreshPumpChart(chart, component, { expanded: isExpanded() });
    }

    function createValveCompactChart(component) {
        const ctx = getCompactChartContext();
        if (!ctx) return;

        destroyCompactChart();
        compactChart = createValveMonitorChartInstance(ctx, component);

        setCompactMonitorMode('valve');
        chartedValveId = component.id;
        chartedPumpId = null;
        chartedTankId = null;
        chartedConnectionId = null;
        refreshCompactPumpExportButton(null);
        refreshCompactChartAxisSelector();
    }

    function refreshValveMonitorChartInstance(chart, component) {
        if (!(component instanceof ValvulaLogica) || !chart) return;
        refreshValveChart(chart, component, { expanded: isExpanded() });
    }

    function createPipeCompactChart(connection) {
        const ctx = getCompactChartContext();
        if (!ctx) return;

        destroyCompactChart();
        compactChart = createPipeMonitorChartInstance(ctx, connection);

        setCompactMonitorMode('pipe');
        chartedConnectionId = connection.id;
        chartedPumpId = null;
        chartedValveId = null;
        chartedTankId = null;
        refreshCompactPumpExportButton(null);
        refreshCompactChartAxisSelector();
    }

    function refreshPipeMonitorChartInstance(chart, connection) {
        if (!(connection instanceof ConnectionModel) || !chart) return;
        refreshPipePressureChart(
            chart,
            connection,
            engine.getConnectionState(connection),
            engine.getConnectionGeometry(connection),
            {
                expanded: isExpanded(),
                label: getConnectionMonitorLabel(connection),
                ...getPipePressureProfileOptions(connection)
            }
        );
    }

    function refreshPipeGroupMonitorChartInstance(chart, connections = []) {
        if (!chart || !Array.isArray(connections) || connections.length === 0) return;

        refreshCompositePipePressureChart(
            chart,
            buildPipeGroupSections(connections),
            {
                expanded: isExpanded(),
                label: getPipeGroupLabel(connections)
            }
        );
    }

    function refreshPipeCompactChart(connection) {
        if (!(connection instanceof ConnectionModel) || !compactChart || monitorChartMode !== 'pipe' || chartedConnectionId !== connection.id) {
            return;
        }

        refreshPipeMonitorChartInstance(compactChart, connection);
        refreshCompactPumpExportButton(null);
    }

    function refreshCompactPipeMonitorChart() {
        if (monitorChartMode !== 'pipe' || !chartedConnectionId || !compactChart) return;

        const connection = engine.conexoes.find((candidate) => candidate.id === chartedConnectionId);
        if (connection instanceof ConnectionModel) {
            refreshPipeCompactChart(connection);
        }
    }

    function refreshValveCompactChart(component) {
        if (!(component instanceof ValvulaLogica) || !compactChart || monitorChartMode !== 'valve' || chartedValveId !== component.id) {
            return;
        }

        refreshValveMonitorChartInstance(compactChart, component);
        refreshCompactPumpExportButton(null);
    }

    function refreshCompactValveMonitorChart() {
        if (monitorChartMode !== 'valve' || !chartedValveId || !compactChart) return;

        const valve = engine.componentes.find((component) => component.id === chartedValveId);
        if (valve instanceof ValvulaLogica) {
            refreshValveCompactChart(valve);
        }
    }

    function refreshPumpCompactChart(component) {
        if (!(component instanceof BombaLogica) || !compactChart || monitorChartMode !== 'pump' || chartedPumpId !== component.id) {
            return;
        }

        refreshPumpChart(compactChart, component, { expanded: isExpanded() });
        refreshCompactPumpExportButton(component);
    }

    function refreshCompactPumpMonitorChart() {
        if (monitorChartMode !== 'pump' || !chartedPumpId || !compactChart) return;

        const pump = engine.componentes.find((component) => component.id === chartedPumpId);
        if (pump instanceof BombaLogica) {
            refreshPumpCompactChart(pump);
        }
    }

    function getValidDefaultYAxisMode(kind, storedMode) {
        if (kind === 'pump') {
            return ['yHead', 'yEff', 'yNpsh'].includes(storedMode) ? storedMode : 'yHead';
        }
        if (kind === 'valve') {
            return ['yPressure', 'yCv', 'yLoss'].includes(storedMode) ? storedMode : 'yPressure';
        }
        return null;
    }

    function getAxisOptions(kind, component) {
        if (kind === 'pump') {
            return [
                { value: 'yHead', label: t('chart.head') },
                { value: 'yEff', label: `${t('chart.efficiency')} (%)` },
                { value: 'yNpsh', label: 'NPSHr' }
            ];
        }
        if (kind === 'valve') {
            let unitLabel = 'Cv/Kv';
            if (component) {
                const unit = component.getUnidadeCoeficienteVazao?.();
                unitLabel = unit === 'KV' ? 'Kv' : 'Cv';
            }
            return [
                { value: 'yPressure', label: t('chart.estimatedPressureDrop') },
                { value: 'yCv', label: t('chart.effectiveFlowCoefficient', { unit: unitLabel }) },
                { value: 'yLoss', label: t('chart.equivalentK') }
            ];
        }
        return [];
    }

    function ensureChartAxisSelector(container, id, kind, chart, onSelect, component) {
        if (!container) return null;

        let selector = document.getElementById(id);
        if (kind !== 'pump' && kind !== 'valve') {
            if (selector) selector.style.display = 'none';
            return null;
        }

        if (!selector) {
            selector = document.createElement('select');
            selector.id = id;
            selector.className = 'chart-axis-select';
            
            const refElement = container.querySelector('.chart-compare-dismiss') || container.querySelector('.chart-pump-export-button');
            if (refElement) {
                container.insertBefore(selector, refElement);
            } else {
                container.appendChild(selector);
            }
        }

        if (selector.parentElement !== container) {
            const refElement = container.querySelector('.chart-compare-dismiss') || container.querySelector('.chart-pump-export-button');
            if (refElement) {
                container.insertBefore(selector, refElement);
            } else {
                container.appendChild(selector);
            }
        }

        selector.style.display = '';

        const expectedOptions = getAxisOptions(kind, component);
        const currentOptions = Array.from(selector.options).map(o => o.value);
        const optionsMatch = expectedOptions.length === currentOptions.length &&
            expectedOptions.every((opt, idx) => opt.value === currentOptions[idx]);

        if (!optionsMatch) {
            selector.innerHTML = '';
            expectedOptions.forEach(opt => {
                const optionElement = document.createElement('option');
                optionElement.value = opt.value;
                optionElement.textContent = opt.label;
                selector.appendChild(optionElement);
            });
        }

        const activeMode = chart?.yAxisMode || (kind === 'pump' ? 'yHead' : 'yPressure');
        selector.value = activeMode;

        // Use direct property binding to completely replace old listeners and avoid stale closures
        selector.onchange = (event) => {
            const newMode = event.target.value;
            onSelect(newMode);
        };

        return selector;
    }

    function refreshCompactChartAxisSelector() {
        const id = 'chart-compact-axis-select';
        const selector = document.getElementById(id);
        if (selector) selector.remove();
    }

    function ensureExpandedChartAxisSelector(elements, index, entry) {
        if (!elements?.header) return null;

        const id = `chart-compare-axis-select-${index + 1}`;
        const selector = document.getElementById(id);

        if (!entry || !isExpanded()) {
            if (selector) selector.style.display = 'none';
            return null;
        }

        const kind = entry.kind;
        const chart = expandedMonitorCharts[index];

        return ensureChartAxisSelector(
            elements.header,
            id,
            kind,
            chart,
            (newMode) => {
                expandedChartYAxisModes[index] = newMode;
                if (expandedMonitorCharts[index]) {
                    expandedMonitorCharts[index].destroy();
                    expandedMonitorCharts[index] = null;
                }
                refreshExpandedMonitorCharts();
            },
            entry.component
        );
    }

    function refreshPresentation() {
        if (!compactChart) return;

        refreshCompactChartAxisSelector();

        if (monitorChartMode === 'pump') {
            const bomba = engine.componentes.find((component) => component.id === chartedPumpId);
            if (bomba instanceof BombaLogica) {
                refreshPumpCompactChart(bomba);
            } else {
                refreshCompactPumpExportButton(null);
            }
            return;
        }

        if (monitorChartMode === 'valve') {
            const valve = engine.componentes.find((component) => component.id === chartedValveId);
            if (valve instanceof ValvulaLogica) {
                refreshValveCompactChart(valve);
            } else {
                createEmptyCompactChart();
            }
            return;
        }

        if (monitorChartMode === 'pipe') {
            const connection = engine.conexoes.find((candidate) => candidate.id === chartedConnectionId);
            if (connection instanceof ConnectionModel) {
                refreshPipeCompactChart(connection);
            } else {
                createEmptyCompactChart();
            }
            return;
        }

        if (monitorChartMode === 'empty') {
            refreshCompactPumpExportButton(null);
            refreshEmptyMonitorChartPresentation(compactChart);
            return;
        }

        if (monitorChartMode === 'tank' && chartedTankId) {
            const tank = engine.componentes.find((component) => component.id === chartedTankId);
            if (tank) syncTankMonitorChart(compactChart, tank, { update: false });
        }

        refreshCompactPumpExportButton(null);
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
            dismissButton: document.getElementById(`chart-compare-dismiss-${slot}`),
            exportButton: document.getElementById(`chart-compare-export-${slot}`)
        };
    }

    function removeMonitorChartAt(index) {
        const result = monitorChartHistory.removeAt(index);
        if (!result.changed) return;

        blockedMonitorSelectionLabel = '';
        renderExpandedMonitorCharts();
    }

    function isPipeLikeEntry(entry) {
        return isPipeMonitorEntry(entry);
    }

    function getMonitorHistoryEntryAt(index) {
        return monitorChartHistory.getEntries()[index] || null;
    }

    function applyMonitorCardDrop(sourceIndex, targetIndex) {
        const sourceEntry = getMonitorHistoryEntryAt(sourceIndex);
        const targetEntry = getMonitorHistoryEntryAt(targetIndex);
        if (!sourceEntry || !targetEntry || sourceIndex === targetIndex) return false;

        const shouldMergePipeProfiles = isPipeLikeEntry(sourceEntry)
            && isPipeLikeEntry(targetEntry)
            && canMergePipeMonitorEntries(sourceEntry, targetEntry, engine.conexoes);
        const result = shouldMergePipeProfiles
            ? monitorChartHistory.mergePipesAt(sourceIndex, targetIndex)
            : monitorChartHistory.swapAt(sourceIndex, targetIndex);

        if (result.changed) {
            blockedMonitorSelectionLabel = '';
            renderExpandedMonitorCharts();
        }
        return result.changed;
    }

    function clearMonitorDragState() {
        draggedMonitorIndex = null;
        document.querySelectorAll('.chart-compare-card.is-dragging, .chart-compare-card.is-drop-target')
            .forEach((card) => {
                card.classList.remove('is-dragging', 'is-drop-target');
            });
    }

    function bindExpandedChartCardDrag(elements, index, entry) {
        const card = elements?.card;
        if (!card) return;

        card.dataset.monitorIndex = String(index);
        card.draggable = Boolean(entry);
        card.title = entry ? t('chart.dragHint') : '';

        if (card.dataset.monitorDragBound === 'true') return;

        card.dataset.monitorDragBound = 'true';
        card.addEventListener('dragstart', (event) => {
            if (!card.draggable || event.target?.closest?.('button')) {
                event.preventDefault();
                return;
            }

            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', card.dataset.monitorIndex || '');
            draggedMonitorIndex = Number(card.dataset.monitorIndex);
            card.classList.add('is-dragging');
        });
        card.addEventListener('dragover', (event) => {
            const sourceIndex = Number(draggedMonitorIndex);
            const targetIndex = Number(card.dataset.monitorIndex);
            if (!Number.isInteger(sourceIndex) || sourceIndex === targetIndex || !card.draggable) return;

            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            card.classList.add('is-drop-target');
        });
        card.addEventListener('dragleave', () => {
            card.classList.remove('is-drop-target');
        });
        card.addEventListener('drop', (event) => {
            const sourceIndex = Number.isInteger(draggedMonitorIndex)
                ? draggedMonitorIndex
                : Number(event.dataTransfer.getData('text/plain'));
            const targetIndex = Number(card.dataset.monitorIndex);
            event.preventDefault();
            clearMonitorDragState();
            applyMonitorCardDrop(sourceIndex, targetIndex);
        });
        card.addEventListener('dragend', clearMonitorDragState);
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

    function ensureExpandedPumpExportButton(elements, index) {
        return ensurePumpExportButton(elements?.header, `chart-compare-export-${index + 1}`);
    }

    function destroyExpandedMonitorCharts() {
        expandedMonitorCharts.forEach((chart) => {
            if (chart) chart.destroy();
        });
        expandedMonitorCharts = [null, null];
        for (let i = 1; i <= 2; i++) {
            const selector = document.getElementById(`chart-compare-axis-select-${i}`);
            if (selector) selector.remove();
        }
    }

    function getExpandedChartSubtitle(entry) {
        if (entry.kind === 'tank') {
            return `${t('chart.volume')} (${getUnitSymbol('volume')})`;
        }
        if (entry.kind === 'pump') {
            return t('chart.pumpSubtitle');
        }
        if (entry.kind === 'valve') {
            return t('chart.valveSubtitle');
        }
        if (entry.kind === 'pipe') {
            return t('chart.pipeSubtitle', {
                pressureUnit: getUnitSymbol('pressure'),
                lengthUnit: getUnitSymbol('length')
            });
        }
        if (entry.kind === 'pipeGroup') {
            return t('chart.pipeGroupSubtitle', {
                count: entry.component?.length || 0,
                pressureUnit: getUnitSymbol('pressure'),
                lengthUnit: getUnitSymbol('length')
            });
        }
        return '';
    }

    function updateExpandedMonitorHeader(entries) {
        const badge = document.getElementById('chart-max-badge');
        const status = document.getElementById('chart-max-status');

        if (badge) {
            const count = entries.filter(Boolean).length;
            badge.textContent = t('chart.badge', { count });
        }

        if (!status) return;

        const activeCount = entries.filter(Boolean).length;
        if (blockedMonitorSelectionLabel) {
            status.textContent = t('chart.statusSlotsFull', { item: blockedMonitorSelectionLabel });
        } else if (activeCount >= 2) {
            status.textContent = t('chart.statusCompare');
        } else if (activeCount === 1) {
            status.textContent = t('chart.statusOne');
        } else {
            status.textContent = t('chart.statusEmpty');
        }
    }

    function createExpandedMonitorChart(canvas, component, { yAxisMode } = {}) {
        const ctx = canvas?.getContext('2d');
        if (!ctx) return null;

        if (component instanceof TanqueLogico) {
            return createTankMonitorChartInstance(ctx, component);
        }

        if (component instanceof BombaLogica) {
            return createPumpMonitorChartInstance(ctx, component, { yAxisMode });
        }

        if (component instanceof ValvulaLogica) {
            return createValveMonitorChartInstance(ctx, component, { yAxisMode });
        }

        if (component instanceof ConnectionModel) {
            return createPipeMonitorChartInstance(ctx, component);
        }

        if (Array.isArray(component) && component.every((item) => item instanceof ConnectionModel)) {
            return createPipeGroupMonitorChartInstance(ctx, component);
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
            const exportButton = ensureExpandedPumpExportButton(elements, index);
            const dismissButton = ensureExpandedChartDismissButton(elements, index);
            bindExpandedChartCardDrag(elements, index, entry);

            if (!elements.card) continue;

            if (!entry) {
                elements.card.hidden = index > 0;
                if (dismissButton) dismissButton.hidden = true;
                setPumpExportButtonState(exportButton, null);
                ensureExpandedChartAxisSelector(elements, index, null);
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
            setPumpExportButtonState(exportButton, entry.component);
            if (elements.title) elements.title.textContent = getMonitorChartTitle(entry);
            if (elements.subtitle) elements.subtitle.textContent = getExpandedChartSubtitle(entry);
            if (elements.canvasWrap) elements.canvasWrap.hidden = false;
            if (elements.empty) elements.empty.hidden = true;
            if (elements.canvas) {
                elements.canvas.dataset.monitorEntryId = String(entry.id);
                elements.canvas.dataset.monitorEntryKind = entry.kind;
            }

            const activeMode = getValidDefaultYAxisMode(entry.kind, expandedChartYAxisModes[index]);
            expandedChartYAxisModes[index] = activeMode;

            expandedMonitorCharts[index] = createExpandedMonitorChart(elements.canvas, entry.component, { yAxisMode: activeMode });
            if (expandedMonitorCharts[index]) {
                expandedMonitorCharts[index].yAxisMode = activeMode;
            }
            ensureExpandedChartAxisSelector(elements, index, entry);
        }

        requestAnimationFrame(() => {
            expandedMonitorCharts.forEach((chart) => chart?.resize());
        });
    }

    function refreshExpandedMonitorCharts() {
        if (!isExpanded()) return;

        const entries = getMonitorChartEntries();
        const activeEntryCount = entries.filter(Boolean).length;
        const activeChartCount = expandedMonitorCharts.filter(Boolean).length;
        const shouldRebuild = activeEntryCount !== activeChartCount || entries.some((entry, index) => {
            const elements = getExpandedChartElements(index);
            if (!entry) return Boolean(expandedMonitorCharts[index]);
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
            if (!entry) return;

            const chart = expandedMonitorCharts[index];
            const elements = getExpandedChartElements(index);
            const exportButton = ensureExpandedPumpExportButton(elements, index);
            const dismissButton = ensureExpandedChartDismissButton(elements, index);

            if (dismissButton) dismissButton.hidden = false;
            setPumpExportButtonState(exportButton, entry.component);
            if (elements.title) elements.title.textContent = getMonitorChartTitle(entry);
            if (elements.subtitle) elements.subtitle.textContent = getExpandedChartSubtitle(entry);

            ensureExpandedChartAxisSelector(elements, index, entry);

            if (entry.component instanceof TanqueLogico) {
                syncTankMonitorChart(chart, entry.component);
            } else if (entry.component instanceof BombaLogica) {
                refreshPumpMonitorChartInstance(chart, entry.component);
            } else if (entry.component instanceof ValvulaLogica) {
                refreshValveMonitorChartInstance(chart, entry.component);
            } else if (entry.component instanceof ConnectionModel) {
                refreshPipeMonitorChartInstance(chart, entry.component);
            } else if (Array.isArray(entry.component)) {
                refreshPipeGroupMonitorChartInstance(chart, entry.component);
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
            if (!entry) return;
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
        refreshCompactValveMonitorChart();
        refreshCompactPipeMonitorChart();
        refreshExpandedMonitorCharts();
    }

    function refreshPumpMonitorCharts(component) {
        if (!(component instanceof BombaLogica)) return;

        refreshPumpCompactChart(component);
        if (isExpanded()) refreshExpandedMonitorCharts();
    }

    function refreshValveMonitorCharts(component) {
        if (!(component instanceof ValvulaLogica)) return;

        refreshValveCompactChart(component);
        if (isExpanded()) refreshExpandedMonitorCharts();
    }

    function refreshSelection(component, connection) {
        if (connection instanceof ConnectionModel) {
            rememberMonitorChartComponent(connection);
            if (monitorChartMode !== 'pipe' || chartedConnectionId !== connection.id) {
                createPipeCompactChart(connection);
            } else {
                refreshPipeCompactChart(connection);
            }
            if (isExpanded()) renderExpandedMonitorCharts();
            return;
        }

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

        if (component instanceof ValvulaLogica) {
            rememberMonitorChartComponent(component);
            if (monitorChartMode !== 'valve' || chartedValveId !== component.id) {
                createValveCompactChart(component);
            } else {
                refreshValveCompactChart(component);
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
        refreshValve: refreshValveMonitorCharts,
        handleSimulationUpdate
    };
}
