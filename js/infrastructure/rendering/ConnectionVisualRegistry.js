const visualsByConnection = new WeakMap();
const connectionsByPath = new Map();

function parseStyleNumber(styleValue) {
    const parsed = parseFloat(styleValue || '0');
    return Number.isFinite(parsed) ? parsed : 0;
}

export function createConnectionEndpointDefinition(component, portEl) {
    const svgEl = portEl?.ownerSVGElement;
    const offsetX = parseStyleNumber(svgEl?.style.left) + parseFloat(portEl?.getAttribute('cx') || '0');
    const offsetY = parseStyleNumber(svgEl?.style.top) + parseFloat(portEl?.getAttribute('cy') || '0');
    const portType = portEl?.dataset?.type === 'in' ? 'in' : 'out';
    const isTankLike = component && typeof component.alturaUtilMetros === 'number';

    return {
        portType,
        offsetX,
        offsetY,
        floorOffsetY: isTankLike ? parseStyleNumber(svgEl?.style.top) + 240 : 0,
        dynamicHeight: isTankLike ? (portType === 'in' ? 'tank_inlet' : 'tank_outlet') : null
    };
}

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

