import { resolvePipePressureProfile } from './PipePressureProfile.js';

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

function getConnectionSource(engine, connection) {
    if (!engine || !connection) return null;
    if (typeof engine.getComponentById === 'function') return engine.getComponentById(connection.sourceId);
    return (engine.componentes || []).find((component) => component?.id === connection.sourceId) || null;
}

export function resolveSinkPressureProfile({ engine = null, sink = null } = {}) {
    const boundaryPressureBar = finiteNumber(sink?.pressaoSaidaBar, 0);
    const absorbedPressureBar = finiteNumber(sink?.pressaoEntradaAtualBar, boundaryPressureBar);
    const inputConnections = getInputConnections(engine, sink);
    let weightedFinalPressureBar = 0;
    let weightedEntryPressureDropBar = 0;
    let totalFlowLps = 0;
    const finiteEndpointPressures = [];
    const finiteEntryPressureDrops = [];

    inputConnections.forEach((connection) => {
        const state = engine?.getConnectionState?.(connection) || {};
        const source = getConnectionSource(engine, connection);
        const pipeProfile = resolvePipePressureProfile({ state, source });
        const endpointPressureBar = finiteNumber(pipeProfile.endPressureBar);
        if (endpointPressureBar === null) return;

        const entryPressureDropBar = Math.max(0, finiteNumber(
            state.targetLossBar,
            Math.max(0, endpointPressureBar - finiteNumber(state.outletPressureBar, endpointPressureBar))
        ));
        finiteEndpointPressures.push(endpointPressureBar);
        finiteEntryPressureDrops.push(entryPressureDropBar);
        const flowLps = Math.max(0, finiteNumber(state.flowLps, 0));
        if (flowLps <= FLOW_EPSILON_LPS) return;

        weightedFinalPressureBar += endpointPressureBar * flowLps;
        weightedEntryPressureDropBar += entryPressureDropBar * flowLps;
        totalFlowLps += flowLps;
    });

    const finalNetworkPressureBar = totalFlowLps > FLOW_EPSILON_LPS
        ? weightedFinalPressureBar / totalFlowLps
        : finiteEndpointPressures.at(-1) ?? absorbedPressureBar;
    const entryPressureDropBar = totalFlowLps > FLOW_EPSILON_LPS
        ? weightedEntryPressureDropBar / totalFlowLps
        : finiteEntryPressureDrops.at(-1) ?? Math.max(0, finalNetworkPressureBar - absorbedPressureBar);

    return {
        boundaryPressureBar,
        absorbedPressureBar,
        finalNetworkPressureBar,
        entryPressureDropBar
    };
}
