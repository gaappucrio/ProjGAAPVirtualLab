const visualsByConnection = new WeakMap();
const connectionsByPath = new Map();

export { createConnectionEndpointDefinition } from '../dom/ComponentVisualRegistry.js';

export function registerConnectionVisual(connection, visualRefs) {
    visualsByConnection.set(connection, visualRefs);
    if (visualRefs?.path) {
        connectionsByPath.set(visualRefs.path, connection);
    }
}

export function getConnectionVisual(connection) {
    return visualsByConnection.get(connection) || null;
}

export function findConnectionByPath(pathEl) {
    return connectionsByPath.get(pathEl) || null;
}

export function unregisterConnectionVisual(connection) {
    const visualRefs = visualsByConnection.get(connection) || null;
    if (visualRefs?.path) {
        connectionsByPath.delete(visualRefs.path);
    }
    visualsByConnection.delete(connection);
    return visualRefs;
}

