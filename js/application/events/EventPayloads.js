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
    setpointUpdate: () => ({
        tipo: COMPONENT_EVENTS.SETPOINT_UPDATE
    }),
    volumeUpdate: (payload = {}) => ({
        tipo: COMPONENT_EVENTS.VOLUME_UPDATE,
        ...payload
    })
});
