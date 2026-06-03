const FLOW_EPSILON_LPS = 1e-9;

function finiteNumber(value, fallback = null) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

function resolveSourceOutletPressureBar(source) {
    const inletPressureBar = finiteNumber(source?.pressaoEntradaAtualBar);
    const componentPressureDropBar = finiteNumber(source?.deltaPAtualBar);
    if (inletPressureBar !== null && componentPressureDropBar !== null && componentPressureDropBar > 0) {
        return Math.max(0, inletPressureBar - componentPressureDropBar);
    }

    return finiteNumber(source?.pressaoSaidaAtualBar);
}

export function resolvePipePressureProfileOptions({ state = {}, source = null } = {}) {
    const sourcePressureBar = resolveSourceOutletPressureBar(source);
    if (sourcePressureBar === null || state.flowLps <= FLOW_EPSILON_LPS) return {};

    const resolvedSourcePressureBar = finiteNumber(state.sourcePressureBar, 0);
    const resolvedEndPressureBar = finiteNumber(state.pressureBar, finiteNumber(state.outletPressureBar, 0));
    const branchPressureDropBar = finiteNumber(
        state.deltaPBar,
        Math.max(0, resolvedSourcePressureBar - resolvedEndPressureBar)
    );
    const sourceComponentPressureDropBar = Math.max(0, finiteNumber(source?.deltaPAtualBar, 0));

    return {
        sourcePressureBar,
        pressureDropBar: Math.max(0, branchPressureDropBar - sourceComponentPressureDropBar)
    };
}

export function resolvePipePressureProfile({ state = {}, source = null } = {}) {
    const options = resolvePipePressureProfileOptions({ state, source });
    const sourcePressureBar = finiteNumber(options.sourcePressureBar, finiteNumber(state.sourcePressureBar, 0));
    const pressureDropBar = finiteNumber(
        options.pressureDropBar,
        Math.max(0, sourcePressureBar - finiteNumber(state.pressureBar, finiteNumber(state.outletPressureBar, 0)))
    );

    return {
        sourcePressureBar,
        pressureDropBar,
        endPressureBar: Math.max(0, sourcePressureBar - pressureDropBar)
    };
}
