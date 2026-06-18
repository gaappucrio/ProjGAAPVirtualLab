import {
    downloadFlowchartDocument,
    readFlowchartFile,
    restoreFlowchartDocument
} from '../flowchart/FlowchartPersistence.js';
import { subscribeLanguageChanges, t } from '../i18n/LanguageManager.js';

function alertUser(message) {
    if (typeof globalThis.alert === 'function') globalThis.alert(message);
}

export function setupFlowchartController({ engine, undoManager } = {}) {
    if (!engine || typeof document === 'undefined') return null;

    const btnExportFlowchart = document.getElementById('btn-export-flowchart');
    const btnImportFlowchart = document.getElementById('btn-import-flowchart');
    const importInput = document.getElementById('input-import-flowchart');
    const exportText = btnExportFlowchart?.querySelector('span');
    const importText = btnImportFlowchart?.querySelector('span');

    const updateLabels = () => {
        if (exportText) exportText.textContent = t('toolbar.exportFlowchart');
        if (importText) importText.textContent = t('toolbar.importFlowchart');
        if (btnExportFlowchart) btnExportFlowchart.title = t('toolbar.exportFlowchartTitle');
        if (btnImportFlowchart) btnImportFlowchart.title = t('toolbar.importFlowchartTitle');
    };

    btnExportFlowchart?.addEventListener('click', () => {
        downloadFlowchartDocument(engine, { name: 'Fluxograma GAAP' });
    });

    btnImportFlowchart?.addEventListener('click', () => {
        importInput?.click();
    });

    importInput?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const { document: flowchart } = await readFlowchartFile(file);
            restoreFlowchartDocument(engine, flowchart, { undoManager });
        } catch (error) {
            alertUser(error?.message || t('toolbar.importFlowchartError'));
        } finally {
            event.target.value = '';
        }
    });

    updateLabels();
    const unsubscribeLanguage = subscribeLanguageChanges(updateLabels);

    return () => unsubscribeLanguage();
}
