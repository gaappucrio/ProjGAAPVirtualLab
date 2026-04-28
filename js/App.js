// =============================================
// CONTROLLER MAIN: Orquestrador da Aplicacao
// Ficheiro: js/App.js
// =============================================

import { ENGINE, setConnectionVisualUpdater, setPortStateUpdater } from './MotorFisico.js';
import { updatePortStates } from './FabricaEquipamentos.js';
import { setupUI } from './controllers/UIController.js';
import { setupCameraControl } from './controllers/CameraController.js';
import { setupPipeControl, updateAllPipes, updateConnectionVisualStates } from './controllers/PipeController.js';
import { setupDragDrop } from './controllers/DragDropController.js';
import { setupToolbar } from './presentation/controllers/ToolbarController.js';
import { connectionService } from './application/services/ConnectionServiceRuntime.js';
import { findConnectionByPath } from './infrastructure/rendering/ConnectionVisualRegistry.js';

setupUI();
setupCameraControl();
setupPipeControl();
setupDragDrop();

setPortStateUpdater(() => updatePortStates());
setConnectionVisualUpdater(() => updateConnectionVisualStates());

setupToolbar({
    onClearCanvas: () => {
        document.querySelectorAll('#workspace-canvas .placed-component').forEach((item) => item.remove());
    },
    onTopologyVisualChange: () => updateAllPipes()
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
