import { COMPONENT_EVENTS, ENGINE_EVENTS } from './EventTypes.js';

export const EngineEventPayloads = Object.freeze({
    selection: (component = null, connection = null) => ({
        tipo: ENGINE_EVENTS.SELECTION,
        componente: component,
        conexao: connection
    }),
    motorState: (rodando) => ({
        tipo: ENGINE_EVENTS.MOTOR_STATE,
        rodando
    }),
    simulationConfig: (usarAlturaRelativa) => ({
        tipo: ENGINE_EVENTS.SIMULATION_CONFIG,
        usarAlturaRelativa
    }),
    fluidUpdate: (fluido) => ({
        tipo: ENGINE_EVENTS.FLUID_UPDATE,
        fluido
    }),
    panelUpdate: (dt = 0) => ({
        tipo: ENGINE_EVENTS.PANEL_UPDATE,
        dt
    }),
    connectionStarted: ({ sourceComponentId, sourceEndpoint, sourcePoint }) => ({
        tipo: ENGINE_EVENTS.CONNECTION_STARTED,
        sourceComponentId,
        sourceEndpoint,
        sourcePoint
    }),
    connectionPreview: ({ sourceComponentId, sourcePoint, previewPoint }) => ({
        tipo: ENGINE_EVENTS.CONNECTION_PREVIEW,
        sourceComponentId,
        sourcePoint,
        previewPoint
    }),
    connectionCommitted: (connection) => ({
        tipo: ENGINE_EVENTS.CONNECTION_COMMITTED,
        conexao: connection
    }),
    connectionCancelled: ({ sourceComponentId } = {}) => ({
        tipo: ENGINE_EVENTS.CONNECTION_CANCELLED,
        sourceComponentId: sourceComponentId || null
    }),
    connectionRemoved: (connection) => ({
        tipo: ENGINE_EVENTS.CONNECTION_REMOVED,
        conexao: connection
    })
});

export const ComponentEventPayloads = Object.freeze({
    state: (payload = {}) => ({
        tipo: COMPONENT_EVENTS.STATE,
        ...payload
    }),
    connection: (source, target) => ({
        tipo: COMPONENT_EVENTS.CONNECTION,
        source,
        target
    }),
    positionUpdate: () => ({
        tipo: COMPONENT_EVENTS.POSITION_UPDATE
    }),
    tagUpdate: () => ({
        tipo: COMPONENT_EVENTS.TAG_UPDATE
    }),
    pressureUpdate: (payload = {}) => ({
        tipo: COMPONENT_EVENTS.PRESSURE_UPDATE,
        ...payload
    }),
    setpointUpdate: () => ({
        tipo: COMPONENT_EVENTS.SETPOINT_UPDATE
    }),
    setpointAutoPressure: (payload = {}) => ({
        tipo: COMPONENT_EVENTS.SETPOINT_AUTO_PRESSURE,
        ...payload
    }),
    controlUpdate: (payload = {}) => ({
        tipo: COMPONENT_EVENTS.CONTROL_UPDATE,
        ...payload
    }),
    volumeUpdate: (payload = {}) => ({
        tipo: COMPONENT_EVENTS.VOLUME_UPDATE,
        ...payload
    })
});
