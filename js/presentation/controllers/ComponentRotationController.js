import { ComponentEventPayloads } from '../../application/events/EventPayloads.js';
import { rotateComponentVisualBy } from '../../infrastructure/dom/ComponentVisualTransform.js';

const ROTATION_STEP_DEG = 45;
const WHEEL_STEP_THRESHOLD_PX = 80;

function wheelDeltaToPixels(event) {
    if (!event) return 0;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * 800;
    return event.deltaY;
}

function getSelectedComponents(engine) {
    if (engine?.selectedComponents?.length) return engine.selectedComponents;
    if (engine?.selectedComponent) return [engine.selectedComponent];

    return [...document.querySelectorAll('#workspace-canvas .placed-component.selected')]
        .map((element) => element.logica)
        .filter(Boolean);
}

function findComponentElement(target) {
    if (!(target instanceof Element)) return null;
    return target.closest('#workspace-canvas .placed-component');
}

export function rotateComponentsByWheelSteps(components, wheelSteps) {
    const deltaDeg = wheelSteps * ROTATION_STEP_DEG;

    return [...new Set((components || []).filter(Boolean))].map((component) => {
        const rotationDeg = rotateComponentVisualBy(component, deltaDeg);
        component.notify?.(ComponentEventPayloads.positionUpdate());
        return {
            component,
            rotationDeg
        };
    });
}

export function setupComponentRotationController({ engine, onRotate } = {}) {
    if (!engine || typeof document === 'undefined') return;

    const workspaceContainer = document.getElementById('workspace');
    if (!workspaceContainer) return;

    let wheelAccumulatorPx = 0;

    workspaceContainer.addEventListener('wheel', (event) => {
        const componentElement = findComponentElement(event.target);
        if (!componentElement?.logica) return;

        const selectedComponents = getSelectedComponents(engine);
        const selectedIds = new Set(selectedComponents.map((component) => component.id));
        if (!selectedIds.has(componentElement.logica.id)) return;

        event.preventDefault();
        event.stopPropagation();

        wheelAccumulatorPx += wheelDeltaToPixels(event);
        if (Math.abs(wheelAccumulatorPx) < WHEEL_STEP_THRESHOLD_PX) return;

        const wheelSteps = Math.trunc(wheelAccumulatorPx / WHEEL_STEP_THRESHOLD_PX);
        wheelAccumulatorPx -= wheelSteps * WHEEL_STEP_THRESHOLD_PX;

        rotateComponentsByWheelSteps(selectedComponents, wheelSteps);
        onRotate?.();
    }, { capture: true, passive: false });
}
