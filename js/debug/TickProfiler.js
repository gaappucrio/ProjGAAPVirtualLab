// =============================================
// DEBUG: medidor de tempo por fase do tick
// Arquivo: js/debug/TickProfiler.js
// A lista de fases abaixo segue a ordem real de SimulationTickPipeline.run().
// =============================================

import { wrapMethod } from './MethodWrap.js';

export const TICK_PHASES = Object.freeze([
    { owner: 'pipeline', method: 'updateHighLevelControls', descricao: 'controle de nível (PID) dos tanques' },
    { owner: 'pipeline', method: 'updateComponentDynamics', descricao: 'rampas de bombas e curso de válvulas' },
    { owner: 'pipeline', method: 'solveHydraulicNetwork', descricao: 'solver hidráulico (push ou nodal)' },
    { owner: 'pipeline', method: 'syncPhysicalMetrics', descricao: 'inventário dos tanques e métricas dos componentes' },
    { owner: 'engine', method: 'updatePipesVisual', descricao: 'visual dos canos + avisos de setpoint' }
]);

const REST_LABEL = 'restante (evento update_painel → painéis e gráficos)';

function round(value, digits = 3) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

export function createTickProfiler({ engine, now = () => globalThis.performance.now() } = {}) {
    let active = false;
    let restoreFns = [];
    let ticks = [];
    let currentTick = null;

    const createPhaseWrapper = (method) => (original) => function profiledPhase(...args) {
        if (!active || !currentTick) return original.apply(this, args);

        const start = now();
        try {
            return original.apply(this, args);
        } finally {
            currentTick.fases[method] = (currentTick.fases[method] || 0) + (now() - start);
        }
    };

    const createRunWrapper = (original) => function profiledRun(...args) {
        if (!active || currentTick || !engine.isRunning) return original.apply(this, args);

        currentTick = { fases: {}, totalMs: 0 };
        const start = now();
        try {
            return original.apply(this, args);
        } finally {
            currentTick.totalMs = now() - start;
            ticks.push(currentTick);
            currentTick = null;
        }
    };

    const profiler = {
        get ativo() {
            return active;
        },

        start() {
            ticks = [];
            if (active) return;

            active = true;
            const pipeline = engine.tickPipeline;
            restoreFns = [
                wrapMethod(pipeline, 'run', createRunWrapper),
                ...TICK_PHASES.map(({ owner, method }) =>
                    wrapMethod(owner === 'engine' ? engine : pipeline, method, createPhaseWrapper(method))
                )
            ];
        },

        stop() {
            active = false;
            restoreFns.forEach((restore) => restore());
            restoreFns = [];
            return profiler.report();
        },

        report() {
            if (ticks.length === 0) return [];

            const stats = (values) => ({
                mediaMs: round(values.reduce((sum, value) => sum + value, 0) / values.length),
                maxMs: round(Math.max(...values))
            });

            const rows = TICK_PHASES.map(({ method, descricao }, index) => ({
                ordem: index + 1,
                fase: method,
                descricao,
                ...stats(ticks.map((tick) => tick.fases[method] || 0))
            }));

            const rest = ticks.map((tick) => Math.max(0,
                tick.totalMs - TICK_PHASES.reduce((sum, { method }) => sum + (tick.fases[method] || 0), 0)
            ));
            rows.push({ ordem: rows.length + 1, fase: 'notify(panelUpdate)', descricao: REST_LABEL, ...stats(rest) });
            rows.push({ ordem: '', fase: 'TOTAL', descricao: `${ticks.length} tick(s)`, ...stats(ticks.map((tick) => tick.totalMs)) });
            return rows;
        },

        get tickCount() {
            return ticks.length;
        }
    };

    return profiler;
}
