// =========================================
// CONTROLADOR: Interação visual de tubos
// Arquivo: js/presentation/controllers/PipeController.js
// =========================================

import { EngineEventPayloads } from '../../application/events/EventPayloads.js';
import { ENGINE_EVENTS } from '../../application/events/EventTypes.js';
import { TransientConnectionStore } from '../../application/stores/TransientConnectionStore.js';
import { camera } from './CameraController.js';
import { EPSILON_FLOW, formatUnitValue, getUnitSymbol } from '../../utils/Units.js';
import { translateLiteral } from '../../utils/I18n.js';
import { updatePortStates } from '../../utils/PortStateManager.js';
import {
    getComponentPortElement
} from '../../infrastructure/dom/ComponentVisualRegistry.js';
import {
    createConnectionEndpointDefinition,
    getConnectionVisual
} from '../../infrastructure/rendering/ConnectionVisualRegistry.js';
import {
    createConnectionVisual,
    createTransientConnectionVisual,
    drawConnectionCurve,
    removeConnectionVisual,
    removeTransientConnectionVisual,
    updateConnectionFlowVisual,
    updateConnectionVisualLayout,
    updateTransientConnectionVisual
} from '../../infrastructure/rendering/PipeRenderer.js';

const transientConnection = new TransientConnectionStore();
let transientPath = null;
let pipeControlInitialized = false;
let connectionEventAdapterInitialized = false;
let engine = null;
let connectionService = null;

function getEngine() {
    if (!engine) throw new Error('Engine não foi injetado no controlador de tubos.');
    return engine;
}

function getPipeLayer() {
    return document.getElementById('pipe-layer');
}

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
    getEngine().selectConnection(connection);
    document.querySelectorAll('.placed-component').forEach((element) => element.classList.remove('selected'));
    resetPipeSelection();
    pathEl.classList.add('selected');
    pathEl.setAttribute('marker-end', 'url(#arrow-selected)');
}

function clearTransientVisual() {
    removeTransientConnectionVisual(transientPath);
    transientPath = null;
}

function applyTransientVisualState() {
    if (!transientPath) return;

    const currentEngine = getEngine();
    transientPath.setAttribute('class', `pipe-line${currentEngine.isRunning ? ' active' : ''}`);
    transientPath.setAttribute('marker-end', currentEngine.isRunning ? 'url(#arrow-active)' : 'url(#arrow)');
}

function renderTransientConnection(draft = transientConnection.snapshot()) {
    if (!draft.active || !draft.sourcePoint || !draft.previewPoint) {
        clearTransientVisual();
        return;
    }

    if (!transientPath) {
        transientPath = createTransientConnectionVisual(getPipeLayer(), getEngine().isRunning);
    }

    applyTransientVisualState();
    updateTransientConnectionVisual(transientPath, draft.sourcePoint, draft.previewPoint);
}

function cancelTransientConnection() {
    const draft = transientConnection.cancel();
    if (!draft.active) return;

    getEngine().notify(EngineEventPayloads.connectionCancelled({
        sourceComponentId: draft.sourceComponentId
    }));
}

function bindConnectionVisual(connection) {
    if (getConnectionVisual(connection)) return;

    createConnectionVisual(getPipeLayer(), connection, {
        onMouseDown: (currentConnection, event, pathEl) => {
            selectConnectionPath(currentConnection, pathEl);
            event.stopPropagation();
        },
        onDoubleClick: (currentConnection, event) => {
            connectionService.remove(currentConnection);
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

function syncConnectionLayout(connection) {
    const renderPoints = getConnectionRenderPoints(connection);
    if (!renderPoints) return;

    updateConnectionVisualLayout(
        connection,
        renderPoints.sourcePoint,
        renderPoints.targetPoint,
        getEngine().getConnectionGeometry(connection),
        getEngine().usarAlturaRelativa
    );
}

export function getConnectionFlow(connection) {
    const flow = getEngine().resolveConnectionDisplayFlow(connection);
    if (flow === null || flow === undefined) return flow;
    if (flow <= EPSILON_FLOW) return 0;
    return flow;
}

function updateConnectionVisualState(connection) {
    const currentEngine = getEngine();
    const state = currentEngine.getConnectionState(connection);
    const flow = currentEngine.isRunning ? state.flowLps : 0;
    const labelFlow = getConnectionFlow(connection);

    updateConnectionFlowVisual(connection, {
        active: flow > 0.05,
        flowLabel: (!currentEngine.isRunning || labelFlow === null || labelFlow === undefined || labelFlow <= EPSILON_FLOW)
            ? ''
            : `${formatUnitValue('flow', labelFlow, 2)} ${getUnitSymbol('flow')}`,
        markerId: flow > 0.05 ? 'url(#arrow-active)' : 'url(#arrow)',
        stateText: `${formatUnitValue('flow', flow, 2)} ${getUnitSymbol('flow')} | ${state.velocityMps.toFixed(2)} m/s | Re ${Math.round(state.reynolds)} | ${translateLiteral(state.regime)}`
    });
}

export function updateConnectionVisualStates() {
    getEngine().conexoes.forEach((connection) => {
        updateConnectionVisualState(connection);
    });
}

export function updateAllPipes() {
    getEngine().conexoes.forEach((connection) => {
        syncConnectionLayout(connection);
    });

    updateConnectionVisualStates();
}

export function drawCurve(x1, y1, x2, y2) {
    return drawConnectionCurve(x1, y1, x2, y2);
}

function setupConnectionEventAdapter() {
    if (connectionEventAdapterInitialized) return;
    connectionEventAdapterInitialized = true;

    getEngine().subscribe((payload) => {
        switch (payload.tipo) {
            case ENGINE_EVENTS.CONNECTION_STARTED:
            case ENGINE_EVENTS.CONNECTION_PREVIEW:
                renderTransientConnection();
                return;
            case ENGINE_EVENTS.CONNECTION_CANCELLED:
                clearTransientVisual();
                return;
            case ENGINE_EVENTS.CONNECTION_COMMITTED:
                clearTransientVisual();
                bindConnectionVisual(payload.conexao);
                syncConnectionLayout(payload.conexao);
                updateConnectionVisualState(payload.conexao);
                updatePortStates();
                return;
            case ENGINE_EVENTS.CONNECTION_REMOVED:
                removeConnectionVisual(payload.conexao);
                updatePortStates();
                return;
            case ENGINE_EVENTS.MOTOR_STATE:
                applyTransientVisualState();
                updateConnectionVisualStates();
                return;
            default:
                return;
        }
    });
}

export function setupPipeControl({ engine: injectedEngine, connectionService: injectedConnectionService } = {}) {
    if (pipeControlInitialized) return;
    engine = injectedEngine;
    connectionService = injectedConnectionService;
    pipeControlInitialized = true;
    setupConnectionEventAdapter();

    const workspaceContainer = document.getElementById('workspace');
    const workspaceCanvas = document.getElementById('workspace-canvas');

    workspaceContainer.addEventListener('mousedown', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (!target.classList.contains('port-node') || target.dataset.type !== 'out') return;

        const sourceComponent = getEngine().getComponentById(target.dataset.compId);
        if (!sourceComponent) return;

        const sourcePoint = getPortCoords(target);
        const sourceEndpoint = createConnectionEndpointDefinition(sourceComponent, target);

        transientConnection.begin({
            sourceComponentId: sourceComponent.id,
            sourcePortType: 'out',
            sourceEndpoint,
            sourcePoint
        });

        getEngine().notify(EngineEventPayloads.connectionStarted({
            sourceComponentId: sourceComponent.id,
            sourceEndpoint,
            sourcePoint
        }));

        event.stopPropagation();
    });

    workspaceContainer.addEventListener('mousemove', (event) => {
        const draft = transientConnection.snapshot();
        if (!draft.active || !draft.sourcePoint) return;

        const canvasRect = workspaceCanvas.getBoundingClientRect();
        const previewPoint = {
            x: (event.clientX - canvasRect.left) / camera.scale,
            y: (event.clientY - canvasRect.top) / camera.scale
        };

        transientConnection.updatePreview(previewPoint);

        getEngine().notify(EngineEventPayloads.connectionPreview({
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

        const sourceComponent = getEngine().getComponentById(draft.sourceComponentId);
        const targetComponent = getEngine().getComponentById(dropTarget.dataset.compId);
        const sourcePort = getComponentPortElement(draft.sourceComponentId, draft.sourcePortType || 'out');

        if (!sourceComponent || !targetComponent || !sourcePort || sourceComponent === targetComponent) {
            cancelTransientConnection();
            return;
        }

        const confirmedDraft = transientConnection.confirm();
        const connection = connectionService.connect(sourceComponent, sourcePort, targetComponent, dropTarget);

        if (!connection && confirmedDraft.active) {
            getEngine().notify(EngineEventPayloads.connectionCancelled({
                sourceComponentId: confirmedDraft.sourceComponentId
            }));
        }
    });
}
