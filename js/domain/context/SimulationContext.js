const noop = () => false;

export function createSimulationContext(overrides = {}) {
    const queries = {
        isBombaBloqueadaPorSetpoint: noop,
        isValvulaBloqueadaPorSetpoint: noop,
        ...overrides.queries
    };

    return {
        isRunning: false,
        fluidoOperante: null,
        usarAlturaRelativa: true,
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
