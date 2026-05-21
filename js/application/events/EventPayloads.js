import { ComponentEventPayloads } from '../../domain/events/ComponentEventPayloads.js';
import { ENGINE_EVENTS } from './EventTypes.js';

export { ComponentEventPayloads };

export const EngineEventPayloads = Object.freeze({
    selection: (component = null, connection = null, components = []) => ({
        tipo: ENGINE_EVENTS.SELECTION,
        componente: component,
        conexao: connection,
        componentes: components
    }),
    motorState: (rodando) => ({
        tipo: ENGINE_EVENTS.MOTOR_STATE,
        rodando
    }),
    simulationConfig: (usarAlturaRelativa) => ({
        tipo: ENGINE_EVENTS.SIMULATION_CONFIG,
        usarAlturaRelativa
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

