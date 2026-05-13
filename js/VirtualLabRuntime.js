// =============================================
// RUNTIME: inicializacao da aplicacao no navegador
// Arquivo: js/VirtualLabRuntime.js
// =============================================

import {
    setComponentVisualCleanupHooks,
    setComponentVisualPositionResolver,
    setConnectionVisualUpdater,
    setPortStateUpdater
} from './application/engine/SimulationEngine.js';
import { ComponentEventPayloads, EngineEventPayloads } from './application/events/EventPayloads.js';
import { createConnectionServiceRuntime } from './application/services/ConnectionServiceRuntime.js';
import {
    clearComponentVisualRegistry,
    getRegisteredComponentVisualPosition,
    removeAllComponentVisualElements,
    unregisterComponentVisual
} from './infrastructure/dom/ComponentVisualRegistry.js';
import { updatePortStates } from './infrastructure/dom/PortStateManager.js';
import {
    applyLanguageToDocument,
    subscribeLanguageChanges,
    translateDefaultComponentTag
} from './utils/LanguageManager.js';
import { setupCameraControl } from './presentation/controllers/CameraController.js';
import { setupClipboardController } from './presentation/controllers/ClipboardController.js';
import { setupComponentRotationController } from './presentation/controllers/ComponentRotationController.js';
import { setupDeleteSelectionController } from './presentation/controllers/DeleteSelectionController.js';
import { setupDragDrop } from './presentation/controllers/DragDropController.js';
import { setupHelpController } from './presentation/controllers/HelpController.js';
import { setupLayoutController } from './presentation/controllers/LayoutController.js';
import { createMonitorController } from './presentation/controllers/MonitorController.js';
import { setupPipeControl, updateAllPipes, updateConnectionVisualStates } from './presentation/controllers/PipeController.js';
import { setupPropertyPanelController } from './presentation/controllers/PropertyPanelController.js';
import { setupToolbar } from './presentation/controllers/ToolbarController.js';
import { setupUndoController } from './presentation/controllers/UndoController.js';
import { setupWorkspaceSelectionController } from './presentation/controllers/WorkspaceSelectionController.js';

function setupEnginePresentationBridges() {
    setPortStateUpdater(() => updatePortStates());
    setConnectionVisualUpdater(() => updateConnectionVisualStates());
    setComponentVisualPositionResolver((component) => getRegisteredComponentVisualPosition(component));
    setComponentVisualCleanupHooks({
        unregister: (component) => unregisterComponentVisual(component),
        clearAll: () => clearComponentVisualRegistry()
    });
}

function translateDefaultTagsForCurrentLanguage(engine) {
    let updatedSelectionTag = false;

    engine.componentes.forEach((component) => {
        const translatedTag = translateDefaultComponentTag(component.tag);
        if (translatedTag === component.tag) return;

        component.tag = translatedTag;
        component.notify(ComponentEventPayloads.tagUpdate());
        if (component === engine.selectedComponent) updatedSelectionTag = true;
    });

    if (updatedSelectionTag) {
        engine.notify(EngineEventPayloads.selection(engine.selectedComponent, null));
    }
}

function setupLanguageRuntime(engine) {
    applyLanguageToDocument();

    subscribeLanguageChanges(() => {
        applyLanguageToDocument();
        translateDefaultTagsForCurrentLanguage(engine);
        updatePortStates();
        updateAllPipes();
    });
}

export function setupVirtualLabRuntime({ engine } = {}) {
    const connectionService = createConnectionServiceRuntime(engine);
    const monitorController = createMonitorController({ engine });
    const undoManager = setupUndoController({ engine });

    setupLanguageRuntime(engine);
    setupEnginePresentationBridges();

    setupLayoutController({
        onChartLayoutChange: () => monitorController.updateLayout()
    });
    monitorController.setup();
    setupWorkspaceSelectionController({ engine });
    setupPropertyPanelController({ engine, monitorController });
    setupHelpController();
    setupCameraControl();
    setupPipeControl({ engine, connectionService, undoManager });
    setupDragDrop({ undoManager });
    setupComponentRotationController({ engine, onRotate: updateAllPipes, undoManager });
    setupClipboardController({ engine, undoManager });
    setupDeleteSelectionController({ engine, connectionService, undoManager });
    setupToolbar({
        engine,
        undoManager,
        onClearCanvas: () => removeAllComponentVisualElements(),
        onTopologyVisualChange: () => updateAllPipes()
    });

    return {
        connectionService,
        monitorController,
        undoManager
    };
}
