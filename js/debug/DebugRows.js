// =============================================
// DEBUG: linhas resumidas de componentes e conexões
// Arquivo: js/debug/DebugRows.js
// Usadas pelas tabelas do console (__GAAP.componentes/conexoes) e pelo tooltip.
// =============================================

export function round(value, digits = 4) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return value;
    const factor = 10 ** digits;
    return Math.round(numericValue * factor) / factor;
}

export function describeComponent(component) {
    return component ? `${component.tag} (${component.id})` : '?';
}

export function componentRow(component) {
    return {
        id: component.id,
        tag: component.tag,
        tipo: component.constructor.name,
        qEntradaLps: round(component.estadoHidraulico?.entradaVazaoLps),
        qSaidaLps: round(component.estadoHidraulico?.saidaVazaoLps),
        pEntradaBar: round(component.getPressaoEntradaBar?.()),
        pSaidaBar: round(component.getPressaoSaidaBar?.())
    };
}

// Lê o estado sem criar entradas novas no store (getConnectionState criaria).
export function connectionRow(engine, connection) {
    const state = engine.connectionStateStore.get(connection) || {};
    return {
        id: connection.id,
        de: describeComponent(engine.getComponentById(connection.sourceId)),
        para: describeComponent(engine.getComponentById(connection.targetId)),
        vazaoLps: round(state.flowLps ?? 0),
        pEntradaBar: round(state.pipeInletPressureBar ?? 0),
        pSaidaBar: round(state.pipeOutletPressureBar ?? 0),
        perdaBar: round(state.totalLossBar ?? 0),
        regime: state.regime ?? 'sem estado'
    };
}
