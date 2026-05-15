import { ENGINE_EVENTS } from '../../application/events/EventTypes.js';
import {
    isEnglishLanguage,
    setLanguage,
    subscribeLanguageChanges,
    t
} from '../i18n/LanguageManager.js';
import { exportSimulationData } from '../export/SimulationDataExporter.js';

const THEME_STORAGE_KEY = 'gaap-lab-theme';
const DARK_THEME_CLASS = 'theme-dark';

function readStoredTheme() {
    try {
        return globalThis.localStorage?.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
        return 'light';
    }
}

function storeTheme(theme) {
    try {
        globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme);
    } catch {
        // Ignora ambientes sem localStorage.
    }
}

export function setupToolbar({ engine, onClearCanvas, onTopologyVisualChange, onThemeChange, undoManager } = {}) {
    const btnRun = document.getElementById('btn-run');
    const btnClear = document.getElementById('btn-clear');
    const relativeHeightToggle = document.getElementById('toggle-relative-height');
    const relativeHeightNote = document.getElementById('toolbar-height-note');
    const relativeHeightLabel = relativeHeightToggle?.closest('label');
    const relativeHeightText = relativeHeightLabel?.querySelector('span');
    const languageToggle = document.getElementById('toggle-language');
    const languageLabel = languageToggle?.closest('label');
    const languageText = languageLabel?.querySelector('span');
    const themeButton = document.getElementById('btn-theme-toggle');
    const btnExportData = document.getElementById('btn-export-data');
    const exportDataText = btnExportData?.querySelector('span');
    let currentTheme = readStoredTheme();

    function applyTheme(theme) {
        currentTheme = theme === 'dark' ? 'dark' : 'light';
        document.body.classList.toggle(DARK_THEME_CLASS, currentTheme === 'dark');
        document.documentElement.dataset.theme = currentTheme;
        storeTheme(currentTheme);

        onThemeChange?.();

        if (themeButton) {
            const dark = currentTheme === 'dark';
            themeButton.classList.toggle('is-dark', dark);
            themeButton.setAttribute('aria-pressed', String(dark));
            themeButton.title = dark ? t('toolbar.themeDarkTitle') : t('toolbar.themeLightTitle');
            themeButton.setAttribute('aria-label', themeButton.title);
        }
    }

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
        if (relativeHeightNote) relativeHeightNote.dataset.state = enabled ? 'enabled' : 'disabled';

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
        if (themeButton) {
            themeButton.title = currentTheme === 'dark'
                ? t('toolbar.themeDarkTitle')
                : t('toolbar.themeLightTitle');
            themeButton.setAttribute('aria-label', themeButton.title);
        }
    }

    applyTheme(currentTheme);
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
        undoManager?.record('toggle-relative-height');
        engine.setUsarAlturaRelativa(e.target.checked);
        updateRelativeHeightUI(engine.usarAlturaRelativa);
        onTopologyVisualChange?.();
    });

    languageToggle?.addEventListener('change', (event) => {
        setLanguage(event.target.checked ? 'en' : 'pt');
    });

    themeButton?.addEventListener('click', () => {
        applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });

    btnExportData?.addEventListener('click', () => {
        exportSimulationData(engine);
    });

    btnClear.addEventListener('click', () => {
        if (engine.componentes.length > 0 || engine.conexoes.length > 0) {
            undoManager?.record('clear-canvas');
        }
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
