// =============================================
// CONTROLLER MAIN: Orquestrador da Aplicacao
// Ficheiro: js/App.js
// =============================================

import { ENGINE, setPortStateUpdater, setConnectionFlowGetter } from './MotorFisico.js'
import { updatePortStates } from './FabricaEquipamentos.js'
import { setupUI } from './controllers/UIController.js'
import { setupCameraControl } from './controllers/CameraController.js'
import { setupPipeControl, getConnectionFlow } from './controllers/PipeController.js'
import { setupDragDrop } from './controllers/DragDropController.js'

setupUI();
setupCameraControl();
setupPipeControl();
setupDragDrop();

setPortStateUpdater(() => updatePortStates());
setConnectionFlowGetter((conn) => getConnectionFlow(conn));

const btnRun = document.getElementById('btn-run');
const btnClear = document.getElementById('btn-clear');
const relativeHeightToggle = document.getElementById('toggle-relative-height');
const relativeHeightNote = document.getElementById('toolbar-height-note');

function updateRunButtonUI(isRunning) {
    if (isRunning) {
        btnRun.innerHTML = '&#9208; Pausar Simulacao';
        btnRun.style.background = '#e74c3c';
        btnRun.style.borderColor = '#c0392b';
        return;
    }

    btnRun.innerHTML = '&#9654; Iniciar Simulacao Fisica';
    btnRun.style.background = '#2ecc71';
    btnRun.style.borderColor = '#27ae60';
}

function updateRelativeHeightUI(enabled) {
    if (enabled) {
        relativeHeightNote.textContent = 'Desniveis entre componentes afetam a pressao e a vazao.';
        relativeHeightNote.style.color = '#5f6f7f';
        relativeHeightNote.style.background = '#f4f7f8';
        relativeHeightNote.style.borderColor = '#ecf0f1';
        return;
    }

    relativeHeightNote.textContent = 'Modo sem altura relativa: a bomba perde utilidade para vencer desníveis.';
    relativeHeightNote.style.color = '#a84300';
    relativeHeightNote.style.background = '#fff4e8';
    relativeHeightNote.style.borderColor = '#f3c89f';
}

updateRunButtonUI(ENGINE.isRunning);
relativeHeightToggle.checked = ENGINE.usarAlturaRelativa;
updateRelativeHeightUI(ENGINE.usarAlturaRelativa);

btnRun.addEventListener('click', () => {
    if (ENGINE.isRunning) ENGINE.stop();
    else ENGINE.start();

    updateRunButtonUI(ENGINE.isRunning);
});

relativeHeightToggle.addEventListener('change', (e) => {
    ENGINE.setUsarAlturaRelativa(e.target.checked);
    updateRelativeHeightUI(ENGINE.usarAlturaRelativa);
});

btnClear.addEventListener('click', () => {
    document.querySelectorAll('#workspace-canvas .placed-component').forEach(item => item.remove());
    ENGINE.clear();
});

ENGINE.subscribe((dados) => {
    if (dados.tipo === 'estado_motor') {
        updateRunButtonUI(dados.rodando);
    }

    if (dados.tipo === 'config_simulacao') {
        relativeHeightToggle.checked = dados.usarAlturaRelativa;
        updateRelativeHeightUI(dados.usarAlturaRelativa);
    }
});

document.addEventListener('keydown', (e) => {
    if (e.target.tagName.toLowerCase() === 'input') return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
        const selectedCompDiv = document.querySelector('.placed-component.selected');
        if (selectedCompDiv) {
            const compId = selectedCompDiv.dataset.id;
            const comp = ENGINE.componentes.find(c => c.id === compId);
            if (comp) {
                ENGINE.removeComponent(comp);
                selectedCompDiv.remove();
                updatePortStates();
            }
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
                ENGINE.selectComponent(null);
                updatePortStates();
            }
        }
    }
});

console.log('App.js loaded - All controllers initialized');
