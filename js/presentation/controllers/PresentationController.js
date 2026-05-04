// ====================================
// COORDENADOR DE APRESENTAÇÃO: painel, monitoramento e eventos de UI
// Arquivo: js/presentation/controllers/PresentationController.js
// ====================================

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
import { renderConnectionProperties as renderConnectionPropertiesPresenter } from '../properties/ConnectionPropertiesPresenter.js';
import { renderComponentProperties as renderComponentPropertiesPresenter } from '../properties/ComponentPropertiesPresenter.js';
import { renderDefaultProperties as renderDefaultPropertiesPresenter } from '../properties/DefaultPropertiesPresenter.js';
import { updatePropertyPanelValues } from '../properties/PropertyLiveUpdater.js';

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
    restorePropertyPanelContextState(nextContextKey);
}

function renderDefaultProperties() {
    renderDefaultPropertiesPresenter({
        propContent: getPropContent(),
        onRerender: renderCurrentProperties
    });
}

function renderConnectionProperties(connection) {
    renderConnectionPropertiesPresenter({
        propContent: getPropContent(),
        connection,
        onRerender: renderCurrentProperties
    });
}

function renderComponentProperties(component) {
    renderComponentPropertiesPresenter({
        propContent: getPropContent(),
        component,
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
                monitorController
            });

            monitorController.handleSimulationUpdate(dados);
        }
    });

    renderCurrentProperties();
}

export function updatePipesVisualUI() {
    ENGINE.updatePipesVisual();
}


