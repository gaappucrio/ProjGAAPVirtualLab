const noop = () => false;

// Modo do solver hidráulico: 'global' resolve pressões e vazões simultaneamente; 'legado' mantém o
// solver push-based anterior apenas para comparação durante a migração.
export const MODO_SOLVER_GLOBAL = 'global';
export const MODO_SOLVER_LEGADO = 'legado';

export function normalizarModoSolver(modo) {
    return modo === MODO_SOLVER_LEGADO ? MODO_SOLVER_LEGADO : MODO_SOLVER_GLOBAL;
}

export function createSimulationContext(overrides = {}) {
    const queries = {
        isBombaBloqueadaPorSetpoint: noop,
        isValvulaBloqueadaPorSetpoint: noop,
        isTrocadorComDuasCorrentes: noop,
        getComponentFluid: () => overrides.fluidoOperante || null,
        ...overrides.queries
    };

    return {
        isRunning: false,
        fluidoOperante: null,
        usarAlturaRelativa: false,
        modoSolver: MODO_SOLVER_GLOBAL,
        elapsedTime: 0,
        queries,
        ...overrides,
        queries
    };
}

export function mergeSimulationContext(base = {}, overrides = {}) {
    return createSimulationContext({
        ...base,
        ...overrides,
        queries: {
            ...(base.queries || {}),
            ...(overrides.queries || {})
        }
    });
}
