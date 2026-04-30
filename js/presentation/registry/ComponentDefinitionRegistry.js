import { SOURCE_COMPONENT_SPEC, SINK_COMPONENT_SPEC } from './specs/BoundaryComponentSpecs.js';
import { PUMP_COMPONENT_SPEC, VALVE_COMPONENT_SPEC } from './specs/PumpValveComponentSpecs.js';
import { TANK_COMPONENT_SPEC } from './specs/TankComponentSpec.js';

export const REGISTRO_COMPONENTES = {
    source: SOURCE_COMPONENT_SPEC,
    sink: SINK_COMPONENT_SPEC,
    pump: PUMP_COMPONENT_SPEC,
    valve: VALVE_COMPONENT_SPEC,
    tank: TANK_COMPONENT_SPEC
};

export function getComponentDefinition(type) {
    return REGISTRO_COMPONENTES[type] || null;
}

export function hasComponentDefinition(type) {
    return Boolean(getComponentDefinition(type));
}

export function listComponentDefinitions() {
    return Object.entries(REGISTRO_COMPONENTES).map(([type, definition]) => ({
        type,
        definition
    }));
}
