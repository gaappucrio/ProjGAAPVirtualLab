import { COMPONENT_EVENTS } from './ComponentEventTypes.js';

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
    setpointUpdate: (payload = {}) => ({
        tipo: COMPONENT_EVENTS.SETPOINT_UPDATE,
        ...payload
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
