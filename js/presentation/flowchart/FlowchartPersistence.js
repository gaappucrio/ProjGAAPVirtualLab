import { analyzeHydraulicNetwork } from '../../domain/services/HydraulicNetworkAnalyzer.js';
import { getLanguage } from '../i18n/LanguageManager.js';
import { createWorkspaceSnapshot, restoreWorkspaceSnapshot } from '../controllers/UndoController.js';

export const FLOWCHART_DOCUMENT_TYPE = 'gaap-virtual-lab-flowchart';
export const FLOWCHART_DOCUMENT_VERSION = 1;

function cloneJsonValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function safeFileNamePart(value) {
    const text = String(value || '').trim().toLowerCase();
    const normalized = text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized || 'fluxograma';
}

function summarizeNetworkAnalysis(analysis) {
    return {
        hasDirectedCycle: analysis.hasDirectedCycle,
        shouldUseNodalSolver: analysis.shouldUseNodalSolver,
        cyclicComponentIds: [...analysis.cyclicComponentIds],
        islands: analysis.islands.map((island) => ({
            componentIds: [...island.componentIds],
            connectionIds: [...island.connectionIds],
            hasDirectedCycle: island.hasDirectedCycle,
            hasPressureBoundary: island.hasPressureBoundary,
            hasActivePump: island.hasActivePump,
            isFloating: island.isFloating
        })),
        diagnostics: analysis.diagnostics.map((diagnostic) => ({ ...diagnostic }))
    };
}

export function createFlowchartDocument(engine, { name = 'Fluxograma GAAP' } = {}) {
    const workspace = createWorkspaceSnapshot(engine);
    const analysis = analyzeHydraulicNetwork({
        componentes: engine?.componentes || [],
        conexoes: engine?.conexoes || []
    });

    return {
        type: FLOWCHART_DOCUMENT_TYPE,
        version: FLOWCHART_DOCUMENT_VERSION,
        name,
        exportedAt: new Date().toISOString(),
        language: getLanguage(),
        app: 'GAAP Virtual Lab',
        workspace,
        analysis: summarizeNetworkAnalysis(analysis)
    };
}

function assertWorkspaceShape(workspace) {
    if (!workspace || typeof workspace !== 'object') {
        throw new Error('Arquivo de fluxograma invalido: workspace ausente.');
    }

    if (!Array.isArray(workspace.components) || !Array.isArray(workspace.connections)) {
        throw new Error('Arquivo de fluxograma invalido: componentes ou conexoes ausentes.');
    }

    workspace.components.forEach((entry) => {
        if (!entry?.id || !entry?.snapshot?.type) {
            throw new Error('Arquivo de fluxograma invalido: componente sem id ou tipo.');
        }
    });

    workspace.connections.forEach((connection) => {
        if (!connection?.sourceId || !connection?.targetId) {
            throw new Error('Arquivo de fluxograma invalido: conexao sem origem ou destino.');
        }
    });
}

export function parseFlowchartDocument(payload) {
    const document = typeof payload === 'string' ? JSON.parse(payload) : cloneJsonValue(payload);
    const workspace = document?.type === FLOWCHART_DOCUMENT_TYPE
        ? document.workspace
        : document;

    assertWorkspaceShape(workspace);

    return {
        document: document?.type === FLOWCHART_DOCUMENT_TYPE
            ? document
            : {
                type: FLOWCHART_DOCUMENT_TYPE,
                version: FLOWCHART_DOCUMENT_VERSION,
                name: 'Fluxograma importado',
                workspace
            },
        workspace
    };
}

export function restoreFlowchartDocument(engine, payload, { undoManager } = {}) {
    const { workspace, document } = parseFlowchartDocument(payload);
    if (engine?.componentes?.length || engine?.conexoes?.length) {
        undoManager?.record('import-flowchart');
    }

    const restored = restoreWorkspaceSnapshot(engine, workspace, { undoManager });
    return {
        restored,
        document
    };
}

export function getFlowchartFileName(document = {}) {
    const baseName = safeFileNamePart(document.name || 'fluxograma-gaap');
    return `${baseName}.gaap-flow.json`;
}

export function downloadFlowchartDocument(engine, options = {}) {
    if (typeof document === 'undefined') return null;

    const flowchart = createFlowchartDocument(engine, options);
    const blob = new Blob([JSON.stringify(flowchart, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = getFlowchartFileName(flowchart);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    return flowchart;
}

export function readFlowchartFile(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error('Nenhum arquivo selecionado.'));
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            try {
                resolve(parseFlowchartDocument(String(reader.result || '')));
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(reader.error || new Error('Falha ao ler arquivo.'));
        reader.readAsText(file, 'utf-8');
    });
}
