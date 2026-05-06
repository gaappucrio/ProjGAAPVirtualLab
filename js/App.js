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
import { updatePortStates } from './utils/PortStateManager.js';
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
import { setupToolbar } from './presentation/controllers/ToolbarController.js';
import { createConnectionServiceRuntime } from './application/services/ConnectionServiceRuntime.js';
import { findConnectionByPath } from './infrastructure/rendering/ConnectionVisualRegistry.js';
import {
    clearComponentVisualRegistry,
    getRegisteredComponentVisualPosition,
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

setPortStateUpdater(() => updatePortStates());
setConnectionVisualUpdater(() => updateConnectionVisualStates());
setComponentVisualPositionResolver((component) => getRegisteredComponentVisualPosition(component));
setComponentVisualCleanupHooks({
    unregister: (component) => unregisterComponentVisual(component),
    clearAll: () => clearComponentVisualRegistry()
});

setupToolbar({
    engine: ENGINE,
    onClearCanvas: () => {
        document.querySelectorAll('#workspace-canvas .placed-component').forEach((item) => item.remove());
    },
    onTopologyVisualChange: () => updateAllPipes()
});

subscribeLanguageChanges(() => {
    applyLanguageToDocument();
    translateDefaultTagsForCurrentLanguage();
    updatePortStates();
    updateAllPipes();
});

document.addEventListener('keydown', (e) => {
    if (e.target.tagName.toLowerCase() === 'input') return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
        const selectedCompDiv = document.querySelector('.placed-component.selected');
        if (selectedCompDiv) {
            const compId = selectedCompDiv.dataset.id;
            const comp = ENGINE.componentes.find((c) => c.id === compId);
            if (comp) {
                ENGINE.removeComponent(comp);
                selectedCompDiv.remove();
                updatePortStates();
            }
        }

        const selectedPipe = document.querySelector('.pipe-line.selected');
        if (selectedPipe) {
            const conn = findConnectionByPath(selectedPipe);
            if (conn) {
                connectionService.remove(conn);
                ENGINE.selectComponent(null);
                updatePortStates();
            }
        }
    }
});

console.log('App.js carregado - todos os controladores inicializados');
