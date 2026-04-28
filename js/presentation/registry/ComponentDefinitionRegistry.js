import { REGISTRO_COMPONENTES as LEGACY_COMPONENT_REGISTRY } from './LegacyComponentRegistry.js';

export const REGISTRO_COMPONENTES = LEGACY_COMPONENT_REGISTRY;

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
