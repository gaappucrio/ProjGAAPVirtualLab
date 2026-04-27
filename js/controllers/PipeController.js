// =========================================
// CONTROLLER: Motor Vetorial de Tubos
// Ficheiro: js/controllers/PipeController.js
// =========================================

import { ENGINE } from '../MotorFisico.js';
import { connectionService } from '../application/services/ConnectionServiceRuntime.js';
import { EngineEventPayloads } from '../application/events/EventPayloads.js';
import { TransientConnectionStore } from '../application/stores/TransientConnectionStore.js';
import { camera } from './CameraController.js';
import { updatePortStates } from '../utils/PortStateManager.js';
import {
    createConnectionEndpointDefinition,
    getComponentPortElement
} from '../infrastructure/dom/ComponentVisualRegistry.js';
import {
    createConnectionVisual,
    createTransientConnectionVisual,
    removeConnectionVisual,
    removeTransientConnectionVisual,
    updateConnectionVisualLayout,
    updateTransientConnectionVisual
} from '../infrastructure/rendering/PipeRenderer.js';

const pipeLayer = document.getElementById('pipe-layer');
const transientConnection = new TransientConnectionStore();
let transientPath = null;

export function getPortCoords(portEl) {
    const rect = portEl.getBoundingClientRect();
    const canvasRect = document.getElementById('workspace-canvas').getBoundingClientRect();
    return {
        x: (rect.left + (rect.width / 2) - canvasRect.left) / camera.scale,
        y: (rect.top + (rect.height / 2) - canvasRect.top) / camera.scale
    };
}

function resetPipeSelection() {
    document.querySelectorAll('.pipe-line').forEach((element) => {
        element.classList.remove('selected');
        if (element.classList.contains('active')) {
            element.setAttribute('marker-end', 'url(#arrow-active)');
        } else {
            element.setAttribute('marker-end', 'url(#arrow)');
        }
    });
}

function selectConnectionPath(connection, pathEl) {
    ENGINE.selectConnection(connection);
    document.querySelectorAll('.placed-component').forEach((element) => element.classList.remove('selected'));
    resetPipeSelection();
    pathEl.classList.add('selected');
    pathEl.setAttribute('marker-end', 'url(#arrow-selected)');
}

function clearTransientConnection() {
    transientConnection.clear();
    removeTransientConnectionVisual(transientPath);
    transientPath = null;
}

function cancelTransientConnection() {
    const draft = transientConnection.cancel();
    removeTransientConnectionVisual(transientPath);
    transientPath = null;

    if (draft.active) {
        ENGINE.notify(EngineEventPayloads.connectionCancelled({
            sourceComponentId: draft.sourceComponentId
        }));
    }
}

function bindConnectionVisual(connection) {
    createConnectionVisual(pipeLayer, connection, {
        onMouseDown: (currentConnection, event, pathEl) => {
            selectConnectionPath(currentConnection, pathEl);
            event.stopPropagation();
        },
        onDoubleClick: (currentConnection, event) => {
            connectionService.remove(currentConnection);
            removeConnectionVisual(currentConnection);
            updatePortStates();
            event.stopPropagation();
        }
    });
}

function getConnectionRenderPoints(connection) {
    const sourcePort = getComponentPortElement(connection.sourceId, connection.sourceEndpoint?.portType || 'out');
    const targetPort = getComponentPortElement(connection.targetId, connection.targetEndpoint?.portType || 'in');

    if (!sourcePort || !targetPort) return null;

    return {
        sourcePoint: getPortCoords(sourcePort),
        targetPoint: getPortCoords(targetPort)
    };
}

export function getConnectionFlow(conn) {
    if (!ENGINE.isRunning) return null;

    const state = ENGINE.getConnectionState(conn);
    if (!state || state.flowLps <= 0.0001) return 0;
    return state.flowLps;
}

export function updateAllPipes() {
    ENGINE.conexoes.forEach((connection) => {
        const renderPoints = getConnectionRenderPoints(connection);
        if (!renderPoints) return;

        updateConnectionVisualLayout(
            connection,
            renderPoints.sourcePoint,
            renderPoints.targetPoint,
            ENGINE.getConnectionGeometry(connection),
            ENGINE.usarAlturaRelativa
        );
    });
}

export function setupPipeControl() {
    const workspaceContainer = document.getElementById('workspace');
    const workspaceCanvas = document.getElementById('workspace-canvas');

    workspaceContainer.addEventListener('mousedown', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (!target.classList.contains('port-node') || target.dataset.type !== 'out') return;

        const sourceComponent = ENGINE.getComponentById(target.dataset.compId);
        if (!sourceComponent) return;

        const sourcePoint = getPortCoords(target);
        const sourceEndpoint = createConnectionEndpointDefinition(sourceComponent, target);

        transientConnection.begin({
            sourceComponentId: sourceComponent.id,
            sourcePortType: 'out',
            sourceEndpoint,
            sourcePoint
        });

        transientPath = createTransientConnectionVisual(pipeLayer, ENGINE.isRunning);
        updateTransientConnectionVisual(transientPath, sourcePoint, sourcePoint);

        ENGINE.notify(EngineEventPayloads.connectionStarted({
            sourceComponentId: sourceComponent.id,
            sourceEndpoint,
            sourcePoint
        }));

        event.stopPropagation();
    });

    workspaceContainer.addEventListener('mousemove', (event) => {
        const draft = transientConnection.snapshot();
        if (!draft.active || !transientPath || !draft.sourcePoint) return;

        const canvasRect = workspaceCanvas.getBoundingClientRect();
        const previewPoint = {
            x: (event.clientX - canvasRect.left) / camera.scale,
            y: (event.clientY - canvasRect.top) / camera.scale
        };

        transientConnection.updatePreview(previewPoint);
        updateTransientConnectionVisual(transientPath, draft.sourcePoint, previewPoint);

        ENGINE.notify(EngineEventPayloads.connectionPreview({
            sourceComponentId: draft.sourceComponentId,
            sourcePoint: draft.sourcePoint,
            previewPoint
        }));
    });

    window.addEventListener('mouseup', (event) => {
        const draft = transientConnection.snapshot();
        if (!draft.active) return;

        const dropTarget = event.target instanceof Element ? event.target : null;
        const isInputPort = dropTarget?.classList.contains('port-node') && dropTarget.dataset.type === 'in';

        if (!isInputPort) {
            cancelTransientConnection();
            return;
        }

        const sourceComponent = ENGINE.getComponentById(draft.sourceComponentId);
        const targetComponent = ENGINE.getComponentById(dropTarget.dataset.compId);
        const sourcePort = getComponentPortElement(draft.sourceComponentId, draft.sourcePortType || 'out');

        if (!sourceComponent || !targetComponent || !sourcePort || sourceComponent === targetComponent) {
            cancelTransientConnection();
            return;
        }

        const connection = connectionService.connect(sourceComponent, sourcePort, targetComponent, dropTarget);
        clearTransientConnection();

        if (!connection) {
            updatePortStates();
            return;
        }

        bindConnectionVisual(connection);
        updateAllPipes();
        updatePortStates();
    });
}
