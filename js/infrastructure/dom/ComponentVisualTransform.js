import { getComponentVisual } from './ComponentVisualRegistry.js';

export function normalizeRotationDegrees(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 0;
    return ((numericValue % 360) + 360) % 360;
}

function keepTagReadable(visualEl, componentId, rotationDeg) {
    const tagEl = visualEl?.querySelector?.(`[id="tag-${componentId}"]`);
    if (!tagEl) return;

    if (rotationDeg === 0) {
        tagEl.removeAttribute?.('transform');
        return;
    }

    const x = Number(tagEl.getAttribute?.('x'));
    const y = Number(tagEl.getAttribute?.('y'));
    const originX = Number.isFinite(x) ? x : 0;
    const originY = Number.isFinite(y) ? y : 0;
    tagEl.setAttribute?.('transform', `rotate(${-rotationDeg} ${originX} ${originY})`);
}

export function applyComponentVisualRotation(component, rotationDeg) {
    if (!component) return 0;

    const normalizedRotationDeg = normalizeRotationDegrees(rotationDeg);
    component.rotacaoVisualGraus = normalizedRotationDeg;

    const visual = getComponentVisual(component);
    if (visual?.visualEl) {
        visual.visualEl.style.transform = normalizedRotationDeg === 0
            ? ''
            : `rotate(${normalizedRotationDeg}deg)`;
        visual.visualEl.style.transformOrigin = 'center center';
        visual.visualEl.dataset.rotationDeg = String(normalizedRotationDeg);
        keepTagReadable(visual.visualEl, component.id, normalizedRotationDeg);
    }

    return normalizedRotationDeg;
}

export function rotateComponentVisualBy(component, deltaDeg) {
    return applyComponentVisualRotation(
        component,
        normalizeRotationDegrees(component?.rotacaoVisualGraus || 0) + deltaDeg
    );
}
