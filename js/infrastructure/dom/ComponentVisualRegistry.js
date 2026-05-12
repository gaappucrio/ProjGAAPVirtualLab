function parseStyleNumber(styleValue) {
    const parsed = parseFloat(styleValue || '0');
    return Number.isFinite(parsed) ? parsed : 0;
}

const visualsByComponentId = new Map();

function resolveComponentId(componentOrId) {
    if (typeof componentOrId === 'string') return componentOrId;
    return componentOrId?.id || null;
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

export function registerComponentVisual(component, visualEl) {
    const componentId = resolveComponentId(component);
    if (!componentId || !visualEl) return null;

    const entry = {
        componentId,
        visualEl,
        ports: {
            in: visualEl.querySelector('.port-node[data-type="in"]'),
            out: visualEl.querySelector('.port-node[data-type="out"]')
        }
    };

    visualsByComponentId.set(componentId, entry);
    return entry;
}

export function getComponentVisual(componentOrId) {
    const componentId = resolveComponentId(componentOrId);
    if (!componentId) return null;
    return visualsByComponentId.get(componentId) || null;
}

export function getComponentPortElement(componentOrId, portType) {
    const visual = getComponentVisual(componentOrId);
    if (!visual) return null;
    return visual.ports?.[portType] || null;
}

export function getRegisteredComponentVisualPosition(componentOrId) {
    const visual = getComponentVisual(componentOrId);
    const fallbackX = typeof componentOrId?.x === 'number' ? componentOrId.x : 0;
    const fallbackY = typeof componentOrId?.y === 'number' ? componentOrId.y : 0;

    if (!visual?.visualEl) {
        return { x: fallbackX, y: fallbackY };
    }

    return {
        x: parseStyleNumber(visual.visualEl.style.left) || fallbackX,
        y: parseStyleNumber(visual.visualEl.style.top) || fallbackY
    };
}

export function unregisterComponentVisual(componentOrId) {
    const componentId = resolveComponentId(componentOrId);
    if (!componentId) return null;

    const visual = visualsByComponentId.get(componentId) || null;
    visualsByComponentId.delete(componentId);
    return visual;
}

export function clearComponentVisualRegistry() {
    visualsByComponentId.clear();
}

export function removeAllComponentVisualElements() {
    visualsByComponentId.forEach((entry) => {
        entry.visualEl?.remove();
    });
    clearComponentVisualRegistry();
}
