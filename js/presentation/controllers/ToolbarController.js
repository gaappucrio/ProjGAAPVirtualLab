import { ENGINE_EVENTS } from '../../application/events/EventTypes.js';
import {
    isEnglishLanguage,
    setLanguage,
    subscribeLanguageChanges,
    t
} from '../../utils/LanguageManager.js';
import { exportSimulationData } from '../export/SimulationDataExporter.js';

export function setupToolbar({ engine, onClearCanvas, onTopologyVisualChange } = {}) {
    const btnRun = document.getElementById('btn-run');
    const btnClear = document.getElementById('btn-clear');
    const relativeHeightToggle = document.getElementById('toggle-relative-height');
    const relativeHeightNote = document.getElementById('toolbar-height-note');
    const relativeHeightLabel = relativeHeightToggle?.closest('label');
    const relativeHeightText = relativeHeightLabel?.querySelector('span');
    const languageToggle = document.getElementById('toggle-language');
    const languageLabel = languageToggle?.closest('label');
    const languageText = languageLabel?.querySelector('span');
    const btnExportData = document.getElementById('btn-export-data');
    const exportDataText = btnExportData?.querySelector('span');

    function updateRunButtonUI(isRunning) {
        if (isRunning) {
            btnRun.innerHTML = t('toolbar.pause');
            btnRun.style.background = '#e74c3c';
            btnRun.style.borderColor = '#c0392b';
            return;
        }

        btnRun.innerHTML = t('toolbar.start');
        btnRun.style.background = '#2ecc71';
        btnRun.style.borderColor = '#27ae60';
    }

    function updateRelativeHeightUI(enabled) {
        if (relativeHeightText) relativeHeightText.textContent = t('toolbar.relativeHeight');

        if (enabled) {
            relativeHeightNote.textContent = t('toolbar.heightEnabled');
            relativeHeightNote.style.color = '#5f6f7f';
            relativeHeightNote.style.background = '#f4f7f8';
            relativeHeightNote.style.borderColor = '#ecf0f1';
            return;
        }

        relativeHeightNote.textContent = t('toolbar.heightDisabled');
        relativeHeightNote.style.color = '#a84300';
        relativeHeightNote.style.background = '#fff4e8';
        relativeHeightNote.style.borderColor = '#f3c89f';
    }

    function updateLanguageUI() {
        if (btnClear) btnClear.textContent = t('toolbar.clear');
        if (exportDataText) exportDataText.textContent = t('toolbar.exportData');
        if (btnExportData) btnExportData.title = t('toolbar.exportDataTitle');
        if (languageToggle) languageToggle.checked = isEnglishLanguage();
        if (languageLabel) languageLabel.title = t('toolbar.languageTitle');
        if (languageText) languageText.textContent = t('toolbar.language');
    }

    updateRunButtonUI(engine.isRunning);
    relativeHeightToggle.checked = engine.usarAlturaRelativa;
    updateRelativeHeightUI(engine.usarAlturaRelativa);
    updateLanguageUI();

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

    languageToggle?.addEventListener('change', (event) => {
        setLanguage(event.target.checked ? 'en' : 'pt');
    });

    btnExportData?.addEventListener('click', () => {
        exportSimulationData(engine);
    });

    btnClear.addEventListener('click', () => {
        onClearCanvas?.();
        engine.clear();
    });

    const unsubscribeEngine = engine.subscribe((dados) => {
        if (dados.tipo === ENGINE_EVENTS.MOTOR_STATE) {
            updateRunButtonUI(dados.rodando);
        }

        if (dados.tipo === ENGINE_EVENTS.SIMULATION_CONFIG) {
            relativeHeightToggle.checked = dados.usarAlturaRelativa;
            updateRelativeHeightUI(dados.usarAlturaRelativa);
        }
    });

    const unsubscribeLanguage = subscribeLanguageChanges(() => {
        updateRunButtonUI(engine.isRunning);
        updateRelativeHeightUI(engine.usarAlturaRelativa);
        updateLanguageUI();
    });

    return () => {
        unsubscribeEngine();
        unsubscribeLanguage();
    };
}
