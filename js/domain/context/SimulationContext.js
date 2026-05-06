const noop = () => false;

export function createSimulationContext(overrides = {}) {
    const queries = {
        isBombaBloqueadaPorSetpoint: noop,
        isValvulaBloqueadaPorSetpoint: noop,
        getComponentFluid: () => overrides.fluidoOperante || null,
        ...overrides.queries
    };

    return {
        isRunning: false,
        fluidoOperante: null,
        usarAlturaRelativa: false,
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
