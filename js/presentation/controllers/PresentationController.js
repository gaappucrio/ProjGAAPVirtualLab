// ====================================
// COORDENADOR DE APRESENTAÇÃO: painel, monitoramento e eventos de UI
// Arquivo: js/presentation/controllers/PresentationController.js
// ====================================

import { EngineEventPayloads } from '../../application/events/EventPayloads.js';

import {
    getPropertyTabsState,
    restorePropertyTabsState
} from '../../utils/PropertyTabs.js';
import { subscribeLanguageChanges } from '../../utils/I18n.js';
import { setupLayoutController } from './LayoutController.js';
import { createMonitorController } from './MonitorController.js';
import { createPropertyPanelContextStore } from './PropertyPanelContextController.js';
import { setupWorkspaceSelectionController } from './WorkspaceSelectionController.js';
import { renderConnectionProperties as renderConnectionPropertiesPresenter } from '../properties/ConnectionPropertiesPresenter.js';
import { renderComponentProperties as renderComponentPropertiesPresenter } from '../properties/ComponentPropertiesPresenter.js';
import { renderDefaultProperties as renderDefaultPropertiesPresenter } from '../properties/DefaultPropertiesPresenter.js';
import { updatePropertyPanelValues } from '../properties/PropertyLiveUpdater.js';
import { setPresentationEngine } from '../context/PresentationEngineContext.js';

const propertyPanelContext = createPropertyPanelContextStore({
    getContentElement: () => document.getElementById('prop-content'),
    getScrollContainer: () => document.querySelector('#properties .side-panel-content'),
    getPropertyTabsState,
    restorePropertyTabsState
});

let presentationEngine = null;
let monitorController = null;

function getEngine() {
    if (!presentationEngine) throw new Error('Engine não foi injetado no coordenador de apresentação.');
    return presentationEngine;
}

export function setupPresentation({ engine } = {}) {
    presentationEngine = engine;
    setPresentationEngine(engine);
    monitorController = createMonitorController({ engine });

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

function getPropertyContextKey(component = getEngine().selectedComponent, connection = getEngine().selectedConnection) {
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

    const engine = getEngine();
    const component = engine.selectedComponent;
    const connection = engine.selectedConnection;
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
        onTankAdjustmentApplied: () => getEngine().notify(EngineEventPayloads.panelUpdate(0))
    });
}

function setupSubscriptions() {
    const engine = getEngine();
    setupWorkspaceSelectionController({ engine });
    subscribeLanguageChanges(() => {
        renderCurrentProperties();
        monitorController.refreshPresentation();
        monitorController.updateLayout();
    });

    engine.subscribe((dados) => {
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
                engine,
                component: engine.selectedComponent,
                connection: engine.selectedConnection,
                monitorController
            });

            monitorController.handleSimulationUpdate(dados);
        }
    });

    renderCurrentProperties();
}

export function updatePipesVisualUI() {
    getEngine().updatePipesVisual();
}


