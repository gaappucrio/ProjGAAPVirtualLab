import { camera } from './CameraController.js';

const MARQUEE_MIN_DISTANCE_PX = 4;

function clearVisualSelection() {
    document.querySelectorAll('.placed-component').forEach((element) => {
        element.classList.remove('selected');
    });

    document.querySelectorAll('.pipe-line').forEach((element) => {
        element.classList.remove('selected');
        element.setAttribute(
            'marker-end',
            element.classList.contains('active') ? 'url(#arrow-active)' : 'url(#arrow)'
        );
    });
}

function getWorkspacePoint(event, workspaceContainer) {
    const rect = workspaceContainer.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

function getSelectionRect(startPoint, currentPoint) {
    const left = Math.min(startPoint.x, currentPoint.x);
    const top = Math.min(startPoint.y, currentPoint.y);
    const width = Math.abs(currentPoint.x - startPoint.x);
    const height = Math.abs(currentPoint.y - startPoint.y);

    return {
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height
    };
}

function updateMarqueeElement(element, rect) {
    element.style.left = `${rect.left}px`;
    element.style.top = `${rect.top}px`;
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
}

function rectsIntersect(a, b) {
    return a.left <= b.right
        && a.right >= b.left
        && a.top <= b.bottom
        && a.bottom >= b.top;
}

function findComponentsInsideRect(selectionRect) {
    const workspaceContainer = document.getElementById('workspace');
    const containerRect = workspaceContainer.getBoundingClientRect();

    return [...document.querySelectorAll('#workspace-canvas .placed-component')]
        .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rectsIntersect(selectionRect, {
                left: rect.left - containerRect.left,
                top: rect.top - containerRect.top,
                right: rect.right - containerRect.left,
                bottom: rect.bottom - containerRect.top
            });
        })
        .map((element) => element.logica)
        .filter(Boolean);
}

function applyComponentSelectionVisuals(components) {
    const selectedIds = new Set(components.map((component) => component.id));
    document.querySelectorAll('#workspace-canvas .placed-component').forEach((element) => {
        element.classList.toggle('selected', selectedIds.has(element.dataset.id));
    });

    document.querySelectorAll('.pipe-line').forEach((element) => {
        element.classList.remove('selected');
        element.setAttribute(
            'marker-end',
            element.classList.contains('active') ? 'url(#arrow-active)' : 'url(#arrow)'
        );
    });
}

export function setupWorkspaceSelectionController({ engine }) {
    const workspaceContainer = document.getElementById('workspace');
    const workspaceCanvas = document.getElementById('workspace-canvas');
    let marqueeState = null;

    workspaceContainer?.addEventListener('mousedown', (event) => {
        if (event.button !== 0 || camera.isPanning) return;
        if (event.getModifierState?.('Space')) return;

        const clickedEmptyWorkspace = event.target === workspaceContainer
            || event.target === workspaceCanvas
            || event.target.id === 'pipe-layer';

        if (!clickedEmptyWorkspace) return;

        const startPoint = getWorkspacePoint(event, workspaceContainer);
        const marqueeElement = document.createElement('div');
        marqueeElement.className = 'workspace-selection-marquee';
        marqueeElement.hidden = true;
        workspaceContainer.appendChild(marqueeElement);

        marqueeState = {
            startPoint,
            currentPoint: startPoint,
            marqueeElement,
            hasDragged: false
        };

        event.preventDefault();
    });

    window.addEventListener('mousemove', (event) => {
        if (!marqueeState) return;

        marqueeState.currentPoint = getWorkspacePoint(event, workspaceContainer);
        const rect = getSelectionRect(marqueeState.startPoint, marqueeState.currentPoint);
        marqueeState.hasDragged = rect.width >= MARQUEE_MIN_DISTANCE_PX || rect.height >= MARQUEE_MIN_DISTANCE_PX;

        if (!marqueeState.hasDragged) return;

        marqueeState.marqueeElement.hidden = false;
        updateMarqueeElement(marqueeState.marqueeElement, rect);

        const selectedComponents = findComponentsInsideRect(rect);
        applyComponentSelectionVisuals(selectedComponents);
    });

    window.addEventListener('mouseup', () => {
        if (!marqueeState) return;

        const rect = getSelectionRect(marqueeState.startPoint, marqueeState.currentPoint);
        const selectedComponents = marqueeState.hasDragged ? findComponentsInsideRect(rect) : [];

        marqueeState.marqueeElement.remove();
        marqueeState = null;

        if (selectedComponents.length > 0) {
            engine.selectComponents(selectedComponents);
            applyComponentSelectionVisuals(selectedComponents);
            return;
        }

        engine.selectComponent(null);
        clearVisualSelection();
    });
}
