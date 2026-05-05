import { ENGINE_EVENTS } from '../../application/events/EventTypes.js';

export function setupToolbar({ engine, onClearCanvas, onTopologyVisualChange } = {}) {
    const btnRun = document.getElementById('btn-run');
    const btnClear = document.getElementById('btn-clear');
    const relativeHeightToggle = document.getElementById('toggle-relative-height');
    const relativeHeightNote = document.getElementById('toolbar-height-note');

    function updateRunButtonUI(isRunning) {
        if (isRunning) {
            btnRun.innerHTML = '&#9208; Pausar Simulação';
            btnRun.style.background = '#e74c3c';
            btnRun.style.borderColor = '#c0392b';
            return;
        }

        btnRun.innerHTML = '&#9654; Iniciar Simulação Física';
        btnRun.style.background = '#2ecc71';
        btnRun.style.borderColor = '#27ae60';
    }

    function updateRelativeHeightUI(enabled) {
        if (enabled) {
            relativeHeightNote.textContent = 'Desníveis entre componentes afetam a pressão e a vazão.';
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

    updateRunButtonUI(engine.isRunning);
    relativeHeightToggle.checked = engine.usarAlturaRelativa;
    updateRelativeHeightUI(engine.usarAlturaRelativa);

    btnRun.addEventListener('click', () => {
        if (engine.isRunning) engine.stop();
        else engine.start();

        updateRunButtonUI(engine.isRunning);
    });

    relativeHeightToggle.addEventListener('change', (e) => {
        engine.setUsarAlturaRelativa(e.target.checked);
        updateRelativeHeightUI(engine.usarAlturaRelativa);
        onTopologyVisualChange?.();
    });

    btnClear.addEventListener('click', () => {
        onClearCanvas?.();
        engine.clear();
    });

    return engine.subscribe((dados) => {
        if (dados.tipo === ENGINE_EVENTS.MOTOR_STATE) {
            updateRunButtonUI(dados.rodando);
        }

        if (dados.tipo === ENGINE_EVENTS.SIMULATION_CONFIG) {
            relativeHeightToggle.checked = dados.usarAlturaRelativa;
            updateRelativeHeightUI(dados.usarAlturaRelativa);
        }
    });
}
