// =============================================
// COMPOSITION ROOT: Orquestrador da aplicação
// Arquivo: js/App.js
// =============================================

import {
    ENGINE,
    setComponentVisualCleanupHooks,
    setComponentVisualPositionResolver,
    setConnectionVisualUpdater,
    setPortStateUpdater
} from './application/engine/SimulationEngine.js';
import { ComponentEventPayloads, EngineEventPayloads } from './application/events/EventPayloads.js';
import { updatePortStates } from './infrastructure/dom/PortStateManager.js';
import {
    applyLanguageToDocument,
    subscribeLanguageChanges,
    translateDefaultComponentTag
} from './utils/LanguageManager.js';
import { setupPresentation as setupUI } from './presentation/controllers/PresentationController.js';
import { setupCameraControl } from './presentation/controllers/CameraController.js';
import { setupHelpController } from './presentation/controllers/HelpController.js';
import { setupPipeControl, updateAllPipes, updateConnectionVisualStates } from './presentation/controllers/PipeController.js';
import { setupDragDrop } from './presentation/controllers/DragDropController.js';
import { setupComponentRotationController } from './presentation/controllers/ComponentRotationController.js';
import { setupToolbar } from './presentation/controllers/ToolbarController.js';
import { setupClipboardController } from './presentation/controllers/ClipboardController.js';
import { setupDeleteSelectionController } from './presentation/controllers/DeleteSelectionController.js';
import { createConnectionServiceRuntime } from './application/services/ConnectionServiceRuntime.js';
import {
    clearComponentVisualRegistry,
    getRegisteredComponentVisualPosition,
    removeAllComponentVisualElements,
    unregisterComponentVisual
} from './infrastructure/dom/ComponentVisualRegistry.js';

const connectionService = createConnectionServiceRuntime(ENGINE);

function translateDefaultTagsForCurrentLanguage() {
    let updatedSelectionTag = false;

    ENGINE.componentes.forEach((component) => {
        const translatedTag = translateDefaultComponentTag(component.tag);
        if (translatedTag === component.tag) return;

        component.tag = translatedTag;
        component.notify(ComponentEventPayloads.tagUpdate());
        if (component === ENGINE.selectedComponent) updatedSelectionTag = true;
    });

    if (updatedSelectionTag) {
        ENGINE.notify(EngineEventPayloads.selection(ENGINE.selectedComponent, null));
    }
}

applyLanguageToDocument();

setupUI({ engine: ENGINE });
setupHelpController();
setupCameraControl();
setupPipeControl({ engine: ENGINE, connectionService });
setupDragDrop();
setupComponentRotationController({ engine: ENGINE, onRotate: updateAllPipes });
setupClipboardController({ engine: ENGINE });
setupDeleteSelectionController({ engine: ENGINE, connectionService });

setPortStateUpdater(() => updatePortStates());
setConnectionVisualUpdater(() => updateConnectionVisualStates());
setComponentVisualPositionResolver((component) => getRegisteredComponentVisualPosition(component));
setComponentVisualCleanupHooks({
    unregister: (component) => unregisterComponentVisual(component),
    clearAll: () => clearComponentVisualRegistry()
});

setupToolbar({
    engine: ENGINE,
    onClearCanvas: () => removeAllComponentVisualElements(),
    onTopologyVisualChange: () => updateAllPipes()
});

subscribeLanguageChanges(() => {
    applyLanguageToDocument();
    translateDefaultTagsForCurrentLanguage();
    updatePortStates();
    updateAllPipes();
});

console.log('App.js carregado - todos os controladores inicializados');
