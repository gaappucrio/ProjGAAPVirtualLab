// =============================================
// CONTROLLER MAIN: Orquestrador da Aplicação
// Ficheiro: js/App.js
// =============================================

import { ENGINE, setPortStateUpdater } from './MotorFisico.js'
import { updatePortStates } from './FabricaEquipamentos.js'
import { setupUI } from './controllers/UIController.js'
import { setupCameraControl } from './controllers/CameraController.js'
import { setupPipeControl } from './controllers/PipeController.js'
import { setupDragDrop } from './controllers/DragDropController.js'

// Inicializar controllers
setupUI();
setupCameraControl();
setupPipeControl();
setupDragDrop();

// Registrar callbacks para resolver dependências circulares
setPortStateUpdater(() => updatePortStates());

// Controles gerais (iniciar, pausar, limpar)
const btnRun = document.getElementById('btn-run');
btnRun.addEventListener('click', () => {
    if (ENGINE.isRunning) {
        ENGINE.stop();
        btnRun.innerHTML = "▶ Iniciar Simulação Física";
        btnRun.style.background = "#2ecc71";
        btnRun.style.borderColor = "#27ae60";
    } else {
        ENGINE.start();
        btnRun.innerHTML = "⏸ Pausar Simulação";
        btnRun.style.background = "#e74c3c";
        btnRun.style.borderColor = "#c0392b";
    }
});

document.getElementById('btn-clear').addEventListener('click', () => {
    document.querySelectorAll('#workspace-canvas .placed-component').forEach(item => item.remove());
    ENGINE.clear();
});

// Controle de deleção com teclas
document.addEventListener('keydown', (e) => {
    if (e.target.tagName.toLowerCase() === 'input') return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
        const selectedCompDiv = document.querySelector('.placed-component.selected');
        if (selectedCompDiv) {
            const compId = selectedCompDiv.dataset.id;
            ENGINE.conexoes = ENGINE.conexoes.filter(conn => {
                if (conn.sourceEl.dataset.compId === compId || conn.targetEl.dataset.compId === compId) {
                    const src = ENGINE.componentes.find(c => c.id === conn.sourceEl.dataset.compId);
                    const tgt = ENGINE.componentes.find(c => c.id === conn.targetEl.dataset.compId);
                    if (src && tgt) src.desconectarSaida(tgt);
                    if (conn.label) conn.label.remove();
                    conn.path.remove();
                    return false;
                }
                return true;
            });
            ENGINE.componentes = ENGINE.componentes.filter(c => c.id !== compId);
            selectedCompDiv.remove();
            ENGINE.selectComponent(null);
            updatePortStates();
        }

        const selectedPipe = document.querySelector('.pipe-line.selected');
        if (selectedPipe) {
            const connIndex = ENGINE.conexoes.findIndex(c => c.path === selectedPipe);
            if (connIndex !== -1) {
                const conn = ENGINE.conexoes[connIndex];
                const src = ENGINE.componentes.find(c => c.id === conn.sourceEl.dataset.compId);
                const tgt = ENGINE.componentes.find(c => c.id === conn.targetEl.dataset.compId);
                if (src && tgt) src.desconectarSaida(tgt);
                if (conn.label) conn.label.remove();
                ENGINE.conexoes.splice(connIndex, 1);
                selectedPipe.remove();
                updatePortStates();
            }
        }
    }
});

console.log('✅ App.js loaded - All controllers initialized');
