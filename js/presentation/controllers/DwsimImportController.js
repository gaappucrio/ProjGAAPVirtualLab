// =============================================
// CONTROLLER: Botão "Importar DWSIM" no toolbar
// Arquivo: js/presentation/controllers/DwsimImportController.js
// =============================================
//
// Liga o botão #btn-import-dwsim ao input de arquivo #input-import-dwsim,
// chama o importDwsimDocument e exibe feedback (alerta) ao usuário.

import { importDwsimDocument } from '../import/DwsimImporter.js';
import { subscribeLanguageChanges, t } from '../i18n/LanguageManager.js';

function alertUser(message) {
    if (typeof globalThis.alert === 'function') {
        globalThis.alert(message);
        return;
    }
    // Fallback para ambientes sem alert (testes): registra no console.
    console.warn('[DwsimImportController]', message);
}

export function setupDwsimImportController({ engine, undoManager } = {}) {
    if (!engine || typeof document === 'undefined') return null;

    const btnImport = document.getElementById('btn-import-dwsim');
    const importInput = document.getElementById('input-import-dwsim');
    const importText = btnImport?.querySelector('span');

    const updateLabels = () => {
        if (importText) importText.textContent = t('toolbar.importDwsim');
        if (btnImport) btnImport.title = t('toolbar.importDwsimTitle');
    };

    btnImport?.addEventListener('click', () => {
        importInput?.click();
    });

    importInput?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const result = await importDwsimDocument(engine, file, { undoManager });

            if (!result.restored || result.workspace.components.length === 0) {
                alertUser(t('toolbar.importDwsimEmpty'));
                return;
            }

            const { stats } = result;
            const successMsg = t('toolbar.importDwsimSuccess', { count: stats.created });
            const skippedMsg = stats.skipped > 0
                ? '\n' + t('toolbar.importDwsimSkipped', { count: stats.skipped })
                : '';
            alertUser(successMsg + skippedMsg);
        } catch (error) {
            console.error('Falha ao importar DWSIM:', error);
            alertUser(`${t('toolbar.importDwsimError')}\n${error?.message || ''}`);
        } finally {
            event.target.value = '';
        }
    });

    updateLabels();
    const unsubscribeLanguage = subscribeLanguageChanges(updateLabels);

    return () => unsubscribeLanguage();
}
