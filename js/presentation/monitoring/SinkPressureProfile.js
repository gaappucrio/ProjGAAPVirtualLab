const FLOW_EPSILON_LPS = 1e-9;

function finiteNumber(value, fallback = null) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

function getInputConnections(engine, sink) {
    if (!engine || !sink) return [];
    if (typeof engine.getInputConnections === 'function') return engine.getInputConnections(sink) || [];
    return (engine.conexoes || []).filter((connection) => connection?.targetId === sink.id);
}

export function resolveSinkPressureProfile({ engine = null, sink = null } = {}) {
    const boundaryPressureBar = finiteNumber(sink?.pressaoSaidaBar, 0);
    const absorbedPressureBar = finiteNumber(sink?.pressaoEntradaAtualBar, boundaryPressureBar);
    const inputConnections = getInputConnections(engine, sink);
    let weightedFinalPressureBar = 0;
    let totalFlowLps = 0;
    const finiteEndpointPressures = [];

    inputConnections.forEach((connection) => {
        const state = engine?.getConnectionState?.(connection) || {};
        const endpointPressureBar = finiteNumber(
            state.pipeOutletPressureBar,
            finiteNumber(state.pressureBar)
        );
        if (endpointPressureBar === null) return;

        finiteEndpointPressures.push(endpointPressureBar);
        const flowLps = Math.max(0, finiteNumber(state.flowLps, 0));
        if (flowLps <= FLOW_EPSILON_LPS) return;

        weightedFinalPressureBar += endpointPressureBar * flowLps;
        totalFlowLps += flowLps;
    });

    const finalNetworkPressureBar = totalFlowLps > FLOW_EPSILON_LPS
        ? weightedFinalPressureBar / totalFlowLps
        : finiteEndpointPressures.at(-1) ?? absorbedPressureBar;

    return {
        boundaryPressureBar,
        absorbedPressureBar,
        finalNetworkPressureBar,
        entryPressureDropBar: Math.max(0, finalNetworkPressureBar - boundaryPressureBar)
    };
}
