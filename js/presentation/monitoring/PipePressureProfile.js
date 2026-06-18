const FLOW_EPSILON_LPS = 1e-9;

function finiteNumber(value, fallback = null) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

function resolveSourceOutletPressureBar(source) {
    const outletPressureBar = finiteNumber(source?.pressaoSaidaAtualBar);
    if (outletPressureBar !== null) return outletPressureBar;

    const inletPressureBar = finiteNumber(source?.pressaoEntradaAtualBar);
    const componentPressureDropBar = finiteNumber(source?.deltaPAtualBar);
    if (inletPressureBar !== null && componentPressureDropBar !== null && componentPressureDropBar > 0) {
        return Math.max(0, inletPressureBar - componentPressureDropBar);
    }

    return null;
}

function shouldPreferComponentOutletPressure(source) {
    const outletPressureBar = finiteNumber(source?.pressaoSaidaAtualBar);
    const componentPressureDropBar = finiteNumber(source?.deltaPAtualBar);
    return outletPressureBar !== null
        && componentPressureDropBar !== null
        && componentPressureDropBar > 0;
}

export function resolvePipePressureProfileOptions({ state = {}, source = null } = {}) {
    const sourceOutletPressureBar = resolveSourceOutletPressureBar(source);
    const sourcePressureBar = shouldPreferComponentOutletPressure(source)
        ? sourceOutletPressureBar
        : finiteNumber(state.pipeInletPressureBar, sourceOutletPressureBar);
    if (sourcePressureBar === null || state.flowLps <= FLOW_EPSILON_LPS) return {};

    const resolvedSourcePressureBar = finiteNumber(state.sourcePressureBar, 0);
    const resolvedEndPressureBar = finiteNumber(state.pressureBar, finiteNumber(state.outletPressureBar, 0));
    const branchPressureDropBar = finiteNumber(
        state.deltaPBar,
        Math.max(0, resolvedSourcePressureBar - resolvedEndPressureBar)
    );
    const sourceComponentPressureDropBar = Math.max(0, finiteNumber(source?.deltaPAtualBar, 0));
    const pipePressureDropBar = finiteNumber(state.pipePressureDropBar);

    return {
        sourcePressureBar,
        pressureDropBar: pipePressureDropBar !== null
            ? Math.max(0, pipePressureDropBar)
            : Math.max(0, branchPressureDropBar - sourceComponentPressureDropBar)
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
