import { ENGINE_EVENTS } from '../../application/events/EventTypes.js';
import { analyzeHydraulicNetwork } from '../../domain/services/HydraulicNetworkAnalyzer.js';
import { subscribeLanguageChanges, t } from '../i18n/LanguageManager.js';

export function buildNetworkDiagnosticState(analysis) {
    if (!analysis?.hasDirectedCycle) {
        return {
            visible: false,
            severity: 'info',
            code: 'open_network'
        };
    }

    const cyclicIslandCount = analysis.cyclicIslands?.length || 0;
    const floatingCount = analysis.floatingCyclicIslands?.length || 0;
    const activePumpFloatingCount = (analysis.floatingCyclicIslands || [])
        .filter((island) => island.hasActivePump)
        .length;

    if (floatingCount > 0) {
        return {
            visible: true,
            severity: activePumpFloatingCount > 0 ? 'warning' : 'info',
            code: activePumpFloatingCount > 0
                ? 'floating_active_closed_loop'
                : 'floating_passive_closed_loop',
            cyclicIslandCount,
            floatingCount,
            activePumpFloatingCount
        };
    }

    return {
        visible: true,
        severity: 'warning',
        code: 'closed_loop_nodal',
        cyclicIslandCount,
        floatingCount: 0,
        activePumpFloatingCount: 0
    };
}

function messageForState(state) {
    if (!state.visible) return '';
    if (state.code === 'floating_passive_closed_loop') {
        return t('networkDiagnostics.floatingPassive', { count: state.floatingCount });
    }
    if (state.code === 'floating_active_closed_loop') {
        return t('networkDiagnostics.floatingActive', { count: state.activePumpFloatingCount });
    }
    return t('networkDiagnostics.closedLoop', { count: state.cyclicIslandCount });
}

export function setupNetworkDiagnosticsController({ engine } = {}) {
    if (!engine || typeof document === 'undefined') return null;

    const banner = document.getElementById('network-diagnostics-banner');
    if (!banner) return null;

    const render = () => {
        const analysis = analyzeHydraulicNetwork({
            componentes: engine.componentes,
            conexoes: engine.conexoes
        });
        const state = buildNetworkDiagnosticState(analysis);

        banner.hidden = !state.visible;
        banner.style.display = state.visible ? 'block' : 'none';
        banner.dataset.severity = state.severity;
        banner.textContent = messageForState(state);
    };

    const unsubscribeEngine = engine.subscribe((event) => {
        if ([
            ENGINE_EVENTS.SELECTION,
            ENGINE_EVENTS.PANEL_UPDATE,
            ENGINE_EVENTS.CONNECTION_COMMITTED,
            ENGINE_EVENTS.CONNECTION_REMOVED
        ].includes(event.tipo)) {
            render();
        }
    });
    const unsubscribeLanguage = subscribeLanguageChanges(render);

    render();

    return () => {
        unsubscribeEngine();
        unsubscribeLanguage();
    };
}
