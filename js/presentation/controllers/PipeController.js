// =========================================
// CONTROLADOR: Interação visual de tubos
// Arquivo: js/presentation/controllers/PipeController.js
// =========================================

import { EngineEventPayloads } from '../../application/events/EventPayloads.js';
import { ENGINE_EVENTS } from '../../application/events/EventTypes.js';
import { TransientConnectionStore } from '../../application/stores/TransientConnectionStore.js';
import { camera } from './CameraController.js';
import { EPSILON_FLOW } from '../../domain/units/HydraulicUnits.js';
import { formatUnitValue, getUnitSymbol } from '../units/DisplayUnits.js';
import { translateLiteral } from '../i18n/LanguageManager.js';
import { updatePortStates } from '../../infrastructure/dom/PortStateManager.js';
import {
    getComponentPortElement,
    getComponentVisual
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
import { getFluidVisualStyle } from '../../infrastructure/rendering/FluidVisualStyle.js';

const transientConnection = new TransientConnectionStore();
let transientPath = null;
let pipeControlInitialized = false;
let connectionEventAdapterInitialized = false;
let engine = null;
let connectionService = null;
let undoManager = null;

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
            undoManager?.record('remove-connection');
            connectionService.remove(currentConnection);
            event.stopPropagation();
        }
    });
}

function getConnectionRenderPoints(connection) {
    const source = getEngine().getComponentById(connection.sourceId);
    const target = getEngine().getComponentById(connection.targetId);
    const sourcePort = getComponentPortElement(connection.sourceId, connection.sourceEndpoint?.portType || 'out');
    const targetPort = getComponentPortElement(connection.targetId, connection.targetEndpoint?.portType || 'in');

    if (!sourcePort || !targetPort) return null;

    return {
        sourcePoint: getPortCoords(sourcePort),
        targetPoint: getPortCoords(targetPort),
        sourceDirection: getPortOutwardDirection(source, connection.sourceEndpoint, 'out'),
        targetDirection: invertDirection(getPortOutwardDirection(target, connection.targetEndpoint, 'in'))
    };
}

function normalizeVector(vector, fallback = { x: 1, y: 0 }) {
    const magnitude = Math.hypot(vector?.x || 0, vector?.y || 0);
    if (magnitude < 0.0001) return fallback;
    return {
        x: vector.x / magnitude,
        y: vector.y / magnitude
    };
}

function rotateVector(vector, rotationDeg = 0) {
    const radians = (Number(rotationDeg) || 0) * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    return {
        x: (vector.x * cos) - (vector.y * sin),
        y: (vector.x * sin) + (vector.y * cos)
    };
}

function invertDirection(vector) {
    return {
        x: -(vector?.x || 0),
        y: -(vector?.y || 0)
    };
}

function getPortOutwardDirection(component, endpoint, fallbackPortType) {
    const visual = getComponentVisual(component);
    const visualEl = visual?.visualEl;
    const width = Number(visualEl?.dataset?.logW);
    const height = Number(visualEl?.dataset?.logH);
    const fallback = fallbackPortType === 'in' ? { x: -1, y: 0 } : { x: 1, y: 0 };

    if (!Number.isFinite(width) || !Number.isFinite(height) || !endpoint) {
        return rotateVector(fallback, component?.rotacaoVisualGraus || 0);
    }

    const baseDirection = normalizeVector({
        x: Number(endpoint.offsetX) - (width / 2),
        y: Number(endpoint.offsetY) - (height / 2)
    }, fallback);

    return rotateVector(baseDirection, component?.rotacaoVisualGraus || 0);
}

function syncConnectionLayout(connection) {
    const renderPoints = getConnectionRenderPoints(connection);
    if (!renderPoints) return;

    updateConnectionVisualLayout(
        connection,
        renderPoints.sourcePoint,
        renderPoints.targetPoint,
        getEngine().getConnectionGeometry(connection),
        getEngine().usarAlturaRelativa,
        {
            sourceDirection: renderPoints.sourceDirection,
            targetDirection: renderPoints.targetDirection
        }
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
    const flow = state.flowLps;
    const labelFlow = getConnectionFlow(connection);
    const fluid = state.fluid || currentEngine.hydraulicContext?.getConnectionFluid(connection);

    updateConnectionFlowVisual(connection, {
        active: currentEngine.isRunning && flow > 0.05,
        flowLabel: (labelFlow === null || labelFlow === undefined || labelFlow <= EPSILON_FLOW)
            ? ''
            : `${formatUnitValue('flow', labelFlow, 2)} ${getUnitSymbol('flow')}`,
        markerId: currentEngine.isRunning && flow > 0.05 ? 'url(#arrow-active)' : 'url(#arrow)',
        stateText: `${formatUnitValue('flow', flow, 2)} ${getUnitSymbol('flow')} | ${state.velocityMps.toFixed(2)} m/s | Re ${Math.round(state.reynolds)} | ${translateLiteral(state.regime)}`,
        fluidStyle: getFluidVisualStyle(fluid)
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

export function setupPipeControl({ engine: injectedEngine, connectionService: injectedConnectionService, undoManager: injectedUndoManager } = {}) {
    if (pipeControlInitialized) return;
    engine = injectedEngine;
    connectionService = injectedConnectionService;
    undoManager = injectedUndoManager;
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
        undoManager?.record('add-connection');
        const connection = connectionService.connect(sourceComponent, sourcePort, targetComponent, dropTarget);

        if (!connection && confirmedDraft.active) {
            getEngine().notify(EngineEventPayloads.connectionCancelled({
                sourceComponentId: confirmedDraft.sourceComponentId
            }));
        }
    });
}
