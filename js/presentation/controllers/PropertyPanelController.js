// ====================================
// CONTROLLER: painel de propriedades e atualizacao ao vivo
// Arquivo: js/presentation/controllers/PropertyPanelController.js
// ====================================

import {
    getPropertyTabsState,
    restorePropertyTabsState
} from '../properties/PropertyTabs.js';
import { subscribeLanguageChanges } from '../i18n/LanguageManager.js';
import { createPropertyPanelContextStore } from './PropertyPanelContextController.js';
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

let propertyPanelEngine = null;

function getEngine() {
    if (!propertyPanelEngine) throw new Error('Engine nao foi injetado no painel de propriedades.');
    return propertyPanelEngine;
}

function getPropContent() {
    return document.getElementById('prop-content');
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

export function setupPropertyPanelController({ engine, monitorController } = {}) {
    propertyPanelEngine = engine;
    setPresentationEngine(engine);

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
            component
        });
    }

    function renderCurrentProperties() {
        capturePropertyPanelContextState();

        const currentEngine = getEngine();
        const component = currentEngine.selectedComponent;
        const connection = currentEngine.selectedConnection;
        const nextContextKey = getPropertyContextKey(component, connection);

        monitorController?.refreshSelection(component, connection);
        monitorController?.refreshPresentation();

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

    subscribeLanguageChanges(() => {
        renderCurrentProperties();
        monitorController?.refreshPresentation();
        monitorController?.updateLayout();
    });

    engine.subscribe((dados) => {
        if (dados.tipo === 'selecao' || dados.tipo === 'config_simulacao') {
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

            monitorController?.handleSimulationUpdate(dados);
        }
    });

    renderCurrentProperties();

    return {
        renderCurrentProperties
    };
}

export function updatePipesVisualUI() {
    getEngine().updatePipesVisual();
}
