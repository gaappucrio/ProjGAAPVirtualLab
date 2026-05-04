// ====================================
// COORDENADOR DE APRESENTAÇÃO: painel, monitoramento e eventos de UI
// Arquivo: js/presentation/controllers/PresentationController.js
// ====================================

import { BombaLogica } from '../../domain/components/BombaLogica.js';
import { ENGINE } from '../../application/engine/SimulationEngine.js';
import { EngineEventPayloads } from '../../application/events/EventPayloads.js';

import {
    getPropertyTabsState,
    restorePropertyTabsState
} from '../../utils/PropertyTabs.js';
import { setupLayoutController } from './LayoutController.js';
import { createMonitorController } from './MonitorController.js';
import { createPropertyPanelContextStore } from './PropertyPanelContextController.js';
import { setupWorkspaceSelectionController } from './WorkspaceSelectionController.js';
import { createPumpChart, refreshPumpChart } from '../../infrastructure/charts/PumpChartAdapter.js';
import { renderConnectionProperties as renderConnectionPropertiesPresenter } from '../properties/ConnectionPropertiesPresenter.js';
import { renderComponentProperties as renderComponentPropertiesPresenter } from '../properties/ComponentPropertiesPresenter.js';
import { renderDefaultProperties as renderDefaultPropertiesPresenter } from '../properties/DefaultPropertiesPresenter.js';
import { updatePropertyPanelValues } from '../properties/PropertyLiveUpdater.js';

let pumpCurveChart = null;
const monitorController = createMonitorController({ engine: ENGINE });
const propertyPanelContext = createPropertyPanelContextStore({
    getContentElement: () => document.getElementById('prop-content'),
    getScrollContainer: () => document.querySelector('#properties .side-panel-content'),
    getPropertyTabsState,
    restorePropertyTabsState
});

export function setupPresentation() {
    setupLayoutController({
        onChartLayoutChange: () => {
            monitorController.updateLayout();
        }
    });
    monitorController.setup();
    setupSubscriptions();
}

function getPropContent() {
    return document.getElementById('prop-content');
}

function getConnectionContextKey(connection) {
    return propertyPanelContext.getConnectionContextKey(connection);
}

function getPropertyContextKey(component = ENGINE.selectedComponent, connection = ENGINE.selectedConnection) {
    return propertyPanelContext.getContextKey(component, connection);
}

function capturePropertyPanelContextState(contextKey = propertyPanelContext.getActiveContextKey()) {
    propertyPanelContext.capture(contextKey);
}

function restorePropertyPanelContextState(contextKey, { onAfterRestore } = {}) {
    propertyPanelContext.setActiveContextKey(contextKey);
    propertyPanelContext.restore(contextKey, {
        onAfterRestore: (restoredTabs) => onAfterRestore?.(restoredTabs)
    });
}

function restorePumpCurveFromSavedContext(component, restoredTabs = []) {
    if (!(component instanceof BombaLogica)) return;

    const advancedActive = restoredTabs.some((tabState) => tabState.activeTab === 'advanced');
    if (!advancedActive) return;

    requestAnimationFrame(() => {
        if (!pumpCurveChart) {
            renderPumpCurveChart(component);
        }
        if (pumpCurveChart) {
            pumpCurveChart.resize();
            refreshPumpCurveChart(component);
        }
    });
}

function destroyPumpCurveChart() {
    if (pumpCurveChart) {
        pumpCurveChart.destroy();
        pumpCurveChart = null;
    }
}

function renderCurrentProperties() {
    capturePropertyPanelContextState();

    const component = ENGINE.selectedComponent;
    const connection = ENGINE.selectedConnection;
    const nextContextKey = getPropertyContextKey(component, connection);

    monitorController.refreshSelection(component, connection);
    monitorController.refreshPresentation();

    if (connection) {
        renderConnectionProperties(connection);
    } else if (component) {
        renderComponentProperties(component);
    } else {
        renderDefaultProperties();
    }

    propertyPanelContext.setActiveContextKey(nextContextKey);
    restorePropertyPanelContextState(nextContextKey, {
        onAfterRestore: (restoredTabs) => restorePumpCurveFromSavedContext(component, restoredTabs)
    });
}

function renderPumpCurveChart(component) {
    const canvas = document.getElementById('pump-curve-chart');
    if (!canvas) {
        destroyPumpCurveChart();
        return;
    }

    destroyPumpCurveChart();
    pumpCurveChart = createPumpChart(canvas.getContext('2d'), component, { expanded: false });
}

function refreshPumpCurveChart(component) {
    if (!(component instanceof BombaLogica) || !pumpCurveChart) return;
    refreshPumpChart(pumpCurveChart, component, { expanded: false });
}

function ensurePumpCurveChart(component) {
    if (!pumpCurveChart) renderPumpCurveChart(component);
    if (!pumpCurveChart) return;

    pumpCurveChart.resize();
    refreshPumpCurveChart(component);
}

function renderDefaultProperties() {
    renderDefaultPropertiesPresenter({
        propContent: getPropContent(),
        onRerender: renderCurrentProperties,
        onDestroyPumpCurve: destroyPumpCurveChart
    });
}

function renderConnectionProperties(connection) {
    renderConnectionPropertiesPresenter({
        propContent: getPropContent(),
        connection,
        onRerender: renderCurrentProperties,
        onDestroyPumpCurve: destroyPumpCurveChart
    });
}

function renderComponentProperties(component) {
    renderComponentPropertiesPresenter({
        propContent: getPropContent(),
        component,
        onDestroyPumpCurve: destroyPumpCurveChart,
        onRenderPumpCurve: renderPumpCurveChart,
        onRefreshPumpCurve: refreshPumpCurveChart,
        onEnsurePumpCurve: ensurePumpCurveChart,
        onTankAdjustmentApplied: () => ENGINE.notify(EngineEventPayloads.panelUpdate(0))
    });
}

function setupSubscriptions() {
    setupWorkspaceSelectionController({ engine: ENGINE });

    ENGINE.subscribe((dados) => {
        if (dados.tipo === 'selecao') {
            renderCurrentProperties();
            return;
        }

        if (dados.tipo === 'config_simulacao' || dados.tipo === 'fluido_update') {
            renderCurrentProperties();
            return;
        }

        if (dados.tipo === 'update_painel') {
            updatePropertyPanelValues({
                engine: ENGINE,
                component: ENGINE.selectedComponent,
                connection: ENGINE.selectedConnection,
                monitorController,
                onRefreshPumpCurve: refreshPumpCurveChart
            });

            monitorController.handleSimulationUpdate(dados);
        }
    });

    renderCurrentProperties();
}

export function updatePipesVisualUI() {
    ENGINE.updatePipesVisual();
}


