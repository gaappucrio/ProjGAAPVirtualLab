import { getConnectionVisual, registerConnectionVisual, unregisterConnectionVisual } from './ConnectionVisualRegistry.js';

export function drawConnectionCurve(x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1) * 0.5;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
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

export function updateConnectionVisualLayout(connection, sourcePoint, targetPoint, geometry, showRelativeHeight) {
    const visual = getConnectionVisual(connection);
    if (!visual) return;

    const midX = (sourcePoint.x + targetPoint.x) / 2;
    const midY = (sourcePoint.y + targetPoint.y) / 2;

    visual.path.setAttribute('d', drawConnectionCurve(sourcePoint.x, sourcePoint.y, targetPoint.x, targetPoint.y));
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
    stateText
}) {
    const visual = getConnectionVisual(connection);
    if (!visual) return;

    visual.path.classList.toggle('active', active);
    if (!visual.path.classList.contains('selected')) {
        visual.path.setAttribute('marker-end', markerId);
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

