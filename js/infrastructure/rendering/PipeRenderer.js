import { getConnectionVisual, registerConnectionVisual, unregisterConnectionVisual } from './ConnectionVisualRegistry.js';

function markerIdFromColor(color) {
    return `arrow-fluid-${String(color || '').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'default'}`;
}

function getOrCreateDefs(svgElement) {
    let defs = svgElement?.querySelector('defs');
    if (!defs && svgElement) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svgElement.prepend(defs);
    }

    return defs;
}

function ensureFluidArrowMarker(svgElement, color) {
    if (!svgElement || !color) return null;

    const markerId = markerIdFromColor(color);
    if (svgElement.querySelector(`#${markerId}`)) return `url(#${markerId})`;

    const defs = getOrCreateDefs(svgElement);
    if (!defs) return null;

    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', markerId);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    path.setAttribute('fill', color);
    path.style.transition = 'fill 0.5s ease';

    marker.appendChild(path);
    defs.appendChild(marker);

    return `url(#${markerId})`;
}

function normalizeDirection(direction, fallback) {
    const magnitude = Math.hypot(direction?.x || 0, direction?.y || 0);
    if (magnitude < 0.0001) return fallback;
    return {
        x: direction.x / magnitude,
        y: direction.y / magnitude
    };
}

export function drawConnectionCurve(x1, y1, x2, y2, options = {}) {
    if (!options.sourceDirection && !options.targetDirection) {
        const dx = Math.abs(x2 - x1) * 0.5;
        return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    }

    const distance = Math.hypot(x2 - x1, y2 - y1);
    const controlDistance = Math.max(40, distance * 0.35);
    const sourceDirection = normalizeDirection(options.sourceDirection, { x: 1, y: 0 });
    const targetDirection = normalizeDirection(options.targetDirection, { x: 1, y: 0 });
    const c1x = x1 + (sourceDirection.x * controlDistance);
    const c1y = y1 + (sourceDirection.y * controlDistance);
    const c2x = x2 - (targetDirection.x * controlDistance);
    const c2y = y2 - (targetDirection.y * controlDistance);

    return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
}

export function createConnectionVisual(pipeLayer, connection, handlers = {}) {
    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('class', 'pipe-line');
    pathEl.setAttribute('marker-end', 'url(#arrow)');

    const labelEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    labelEl.setAttribute('class', 'pipe-flow-label');
    labelEl.setAttribute('text-anchor', 'middle');

    const heightLabelEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    heightLabelEl.setAttribute('class', 'pipe-flow-label');
    heightLabelEl.setAttribute('fill', '#e67e22');
    heightLabelEl.setAttribute('text-anchor', 'middle');

    if (handlers.onMouseDown) {
        pathEl.addEventListener('mousedown', (event) => handlers.onMouseDown(connection, event, pathEl));
    }

    if (handlers.onDoubleClick) {
        pathEl.addEventListener('dblclick', (event) => handlers.onDoubleClick(connection, event, pathEl));
    }

    pipeLayer.appendChild(pathEl);
    pipeLayer.appendChild(labelEl);
    pipeLayer.appendChild(heightLabelEl);

    registerConnectionVisual(connection, {
        path: pathEl,
        label: labelEl,
        labelHeight: heightLabelEl
    });

    return getConnectionVisual(connection);
}

export function createTransientConnectionVisual(pipeLayer, active = false) {
    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('class', `pipe-line${active ? ' active' : ''}`);
    pathEl.setAttribute('marker-end', active ? 'url(#arrow-active)' : 'url(#arrow)');
    pipeLayer.appendChild(pathEl);
    return pathEl;
}

export function updateTransientConnectionVisual(pathEl, sourcePoint, targetPoint) {
    if (!pathEl || !sourcePoint || !targetPoint) return;
    pathEl.setAttribute('d', drawConnectionCurve(sourcePoint.x, sourcePoint.y, targetPoint.x, targetPoint.y));
}

export function removeTransientConnectionVisual(pathEl) {
    pathEl?.remove();
}

export function updateConnectionVisualLayout(connection, sourcePoint, targetPoint, geometry, showRelativeHeight, options = {}) {
    const visual = getConnectionVisual(connection);
    if (!visual) return;

    const midX = (sourcePoint.x + targetPoint.x) / 2;
    const midY = (sourcePoint.y + targetPoint.y) / 2;

    visual.path.setAttribute('d', drawConnectionCurve(
        sourcePoint.x,
        sourcePoint.y,
        targetPoint.x,
        targetPoint.y,
        options
    ));
    visual.label?.setAttribute('x', midX);
    visual.label?.setAttribute('y', midY - 10);
    visual.labelHeight?.setAttribute('x', midX);
    visual.labelHeight?.setAttribute('y', midY + 15);

    if (!visual.labelHeight) return;

    if (showRelativeHeight && Math.abs(geometry.headGainM) > 0.01) {
        const signal = geometry.headGainM > 0 ? '+' : '';
        visual.labelHeight.textContent = `Δy: ${signal}${geometry.headGainM.toFixed(2)} m`;
    } else {
        visual.labelHeight.textContent = '';
    }
}

export function updateConnectionFlowVisual(connection, {
    active,
    flowLabel,
    markerId,
    stateText,
    fluidStyle = null
}) {
    const visual = getConnectionVisual(connection);
    if (!visual) return;

    const isSelected = visual.path.classList.contains('selected');
    const activeStroke = active ? fluidStyle?.stroke : '';

    visual.path.classList.toggle('active', active);
    visual.path.style.stroke = activeStroke && !isSelected ? activeStroke : '';

    if (!isSelected) {
        const fluidMarkerId = activeStroke
            ? ensureFluidArrowMarker(visual.path.ownerSVGElement, activeStroke)
            : null;
        visual.path.setAttribute('marker-end', fluidMarkerId || markerId);
    }
    visual.path.setAttribute('data-hydraulic-state', stateText);

    if (visual.label) {
        visual.label.textContent = flowLabel || '';
    }
}

export function removeConnectionVisual(connection) {
    const visual = unregisterConnectionVisual(connection);
    if (!visual) return;

    visual.label?.remove();
    visual.labelHeight?.remove();
    visual.path?.remove();
}

