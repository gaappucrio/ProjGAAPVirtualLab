// =============================================
// CONTROLLER MAIN: Orquestrador da Aplicacao
// Ficheiro: js/App.js
// =============================================

import { ENGINE, setPortStateUpdater, setConnectionFlowGetter } from './MotorFisico.js';
import { updatePortStates } from './FabricaEquipamentos.js';
import { setupUI } from './controllers/UIController.js';
import { setupCameraControl } from './controllers/CameraController.js';
import { setupPipeControl, getConnectionFlow, updateAllPipes } from './controllers/PipeController.js';
import { setupDragDrop } from './controllers/DragDropController.js';
import { setupToolbar } from './presentation/controllers/ToolbarController.js';

setupUI();
setupCameraControl();
setupPipeControl();
setupDragDrop();

setPortStateUpdater(() => updatePortStates());
setConnectionFlowGetter((conn) => getConnectionFlow(conn));

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
            const connIndex = ENGINE.conexoes.findIndex((c) => c.path === selectedPipe);
            if (connIndex !== -1) {
                const conn = ENGINE.conexoes[connIndex];
                const src = ENGINE.componentes.find((c) => c.id === conn.sourceEl.dataset.compId);
                const tgt = ENGINE.componentes.find((c) => c.id === conn.targetEl.dataset.compId);
                if (src && tgt) src.desconectarSaida(tgt);
                if (conn.label) conn.label.remove();
                if (conn.labelHeight) conn.labelHeight.remove();
                ENGINE.removeConnection(conn);
                selectedPipe.remove();
                ENGINE.selectComponent(null);
                updatePortStates();
            }
        }
    }
});

console.log('App.js carregado - todos os controladores inicializados');
