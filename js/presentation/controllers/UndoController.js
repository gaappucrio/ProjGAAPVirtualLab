import { EngineEventPayloads } from '../../application/events/EventPayloads.js';
import { ConnectionModel } from '../../domain/models/ConnectionModel.js';
import { FabricaDeEquipamentos, updatePortStates } from '../../infrastructure/dom/ComponentVisualFactory.js';
import { applyComponentVisualRotation } from '../../infrastructure/dom/ComponentVisualTransform.js';
import { createComponentClipboardSnapshot, applyComponentClipboardSnapshot, cloneSnapshotValue, syncComponentVisualState } from './ClipboardController.js';
import { makeComponentDraggable } from './DragDropController.js';
import { updateAllPipes } from './PipeController.js';

const MAX_HISTORY_SIZE = 50;

function isEditablePropertyTarget(target) {
    if (!(target instanceof Element)) return false;
    if (target.disabled || target.id?.startsWith('unit-pref-')) return false;

    const tagName = target.tagName.toLowerCase();
    return tagName === 'input'
        || tagName === 'textarea'
        || tagName === 'select'
        || tagName === 'button'
        || target.isContentEditable;
}

function snapshotSignature(snapshot) {
    return JSON.stringify(snapshot);
}

function trimStack(stack, maxSize) {
    while (stack.length > maxSize) stack.shift();
}

export function createUndoRedoHistory({
    captureSnapshot,
    restoreSnapshot,
    signatureFactory = snapshotSignature,
    maxHistorySize = MAX_HISTORY_SIZE
} = {}) {
    const undoStack = [];
    const redoStack = [];
    let restoring = false;

    const createEntry = (label, snapshot) => ({
        label,
        snapshot,
        signature: signatureFactory(snapshot)
    });

    const pushUndo = (entry) => {
        undoStack.push(entry);
        trimStack(undoStack, maxHistorySize);
    };

    const pushRedo = (entry) => {
        redoStack.push(entry);
        trimStack(redoStack, maxHistorySize);
    };

    const restoreEntry = (entry) => {
        restoring = true;
        try {
            return restoreSnapshot(entry.snapshot);
        } finally {
            restoring = false;
        }
    };

    return {
        record(label = 'change') {
            if (restoring || typeof captureSnapshot !== 'function') return false;

            const snapshot = captureSnapshot();
            const entry = createEntry(label, snapshot);
            const latest = undoStack[undoStack.length - 1];
            if (latest?.signature === entry.signature) return false;

            pushUndo(entry);
            redoStack.length = 0;
            return true;
        },
        undo() {
            if (restoring || undoStack.length === 0 || typeof captureSnapshot !== 'function') return false;

            const current = createEntry('redo-current', captureSnapshot());
            let entry = undoStack.pop();
            while (entry && entry.signature === current.signature) {
                entry = undoStack.pop();
            }

            if (!entry) return false;

            pushRedo(current);
            return restoreEntry(entry);
        },
        redo() {
            if (restoring || redoStack.length === 0 || typeof captureSnapshot !== 'function') return false;

            const current = createEntry('undo-current', captureSnapshot());
            let entry = redoStack.pop();
            while (entry && entry.signature === current.signature) {
                entry = redoStack.pop();
            }

            if (!entry) return false;

            pushUndo(current);
            return restoreEntry(entry);
        },
        isRestoring() {
            return restoring;
        },
        canRedo() {
            return redoStack.length > 0;
        }
    };
}

function removeWorkspaceComponentVisuals() {
    document.querySelectorAll('#workspace-canvas .placed-component').forEach((element) => element.remove());
}

function createConnectionSnapshot(connection) {
    return {
        id: connection.id,
        sourceId: connection.sourceId,
        targetId: connection.targetId,
        sourceEndpoint: cloneSnapshotValue(connection.sourceEndpoint),
        targetEndpoint: cloneSnapshotValue(connection.targetEndpoint),
        diameterM: connection.diameterM,
        roughnessMm: connection.roughnessMm,
        extraLengthM: connection.extraLengthM,
        perdaLocalK: connection.perdaLocalK,
        designVelocityMps: connection.designVelocityMps,
        designFlowLps: connection.designFlowLps,
        transientFlowLps: connection.transientFlowLps,
        lastResolvedFlowLps: connection.lastResolvedFlowLps
    };
}

export function createWorkspaceSnapshot(engine) {
    return {
        config: {
            usarAlturaRelativa: engine?.usarAlturaRelativa === true
        },
        components: (engine?.componentes || [])
            .map((component) => ({
                id: component.id,
                snapshot: createComponentClipboardSnapshot(component)
            }))
            .filter((entry) => entry.snapshot),
        connections: (engine?.conexoes || []).map((connection) => createConnectionSnapshot(connection)),
        selection: {
            componentIds: (engine?.selectedComponents || []).map((component) => component.id),
            connectionId: engine?.selectedConnection?.id || null
        }
    };
}

function restoreSelection(engine, snapshot) {
    const selectedComponentIds = new Set(snapshot.selection?.componentIds || []);
    const selectedComponents = engine.componentes.filter((component) => selectedComponentIds.has(component.id));

    document.querySelectorAll('#workspace-canvas .placed-component').forEach((element) => {
        element.classList.toggle('selected', selectedComponentIds.has(element.dataset.id));
    });

    document.querySelectorAll('.pipe-line').forEach((element) => {
        element.classList.remove('selected');
        element.setAttribute('marker-end', element.classList.contains('active') ? 'url(#arrow-active)' : 'url(#arrow)');
    });

    const selectedConnection = snapshot.selection?.connectionId
        ? engine.conexoes.find((connection) => connection.id === snapshot.selection.connectionId)
        : null;

    if (selectedConnection) {
        engine.selectConnection(selectedConnection);
        return;
    }

    if (selectedComponents.length > 1) {
        engine.selectComponents(selectedComponents);
        return;
    }

    engine.selectComponent(selectedComponents[0] || null);
}

export function restoreWorkspaceSnapshot(engine, snapshot, { undoManager } = {}) {
    if (!engine || !snapshot || typeof document === 'undefined') return false;

    if (engine.isRunning) engine.stop();

    removeWorkspaceComponentVisuals();
    engine.clear();
    engine.setUsarAlturaRelativa?.(snapshot.config?.usarAlturaRelativa === true);

    const workspaceCanvas = document.getElementById('workspace-canvas');
    const componentsById = new Map();

    snapshot.components.forEach((entry) => {
        const componentSnapshot = entry.snapshot;
        const visual = FabricaDeEquipamentos.criar(
            componentSnapshot.type,
            componentSnapshot.x,
            componentSnapshot.y,
            false,
            { id: entry.id, tag: componentSnapshot.tag }
        );

        if (!visual?.logica || !workspaceCanvas) return;

        applyComponentClipboardSnapshot(componentSnapshot, visual.logica, { tag: componentSnapshot.tag });
        visual.logica.x = componentSnapshot.x;
        visual.logica.y = componentSnapshot.y;
        visual.style.left = `${componentSnapshot.x}px`;
        visual.style.top = `${componentSnapshot.y}px`;
        workspaceCanvas.appendChild(visual);
        makeComponentDraggable(visual, { undoManager });
        applyComponentVisualRotation(visual.logica, visual.logica.rotacaoVisualGraus);
        syncComponentVisualState(visual.logica);
        componentsById.set(entry.id, visual.logica);
    });

    snapshot.connections.forEach((connectionSnapshot) => {
        const sourceComponent = componentsById.get(connectionSnapshot.sourceId);
        const targetComponent = componentsById.get(connectionSnapshot.targetId);
        if (!sourceComponent || !targetComponent) return;

        sourceComponent.conectarSaida(targetComponent);
        engine.addConnection(new ConnectionModel({
            ...connectionSnapshot,
            sourceEndpoint: cloneSnapshotValue(connectionSnapshot.sourceEndpoint),
            targetEndpoint: cloneSnapshotValue(connectionSnapshot.targetEndpoint)
        }));
    });

    engine.componentes.forEach((component) => {
        component.garantirConsistenciaControleNivel?.();
    });

    updatePortStates();
    updateAllPipes();
    restoreSelection(engine, snapshot);
    engine.notify(EngineEventPayloads.panelUpdate(0));

    return true;
}

export function setupUndoController({ engine } = {}) {
    if (!engine || typeof document === 'undefined') return null;

    let propertyEditActive = false;
    let activePropertyTarget = null;

    const undoManager = createUndoRedoHistory({
        captureSnapshot: () => createWorkspaceSnapshot(engine),
        restoreSnapshot: (snapshot) => restoreWorkspaceSnapshot(engine, snapshot, { undoManager })
    });

    document.addEventListener('keydown', (event) => {
        const key = String(event.key || '').toLowerCase();
        if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

        const shouldUndo = !event.shiftKey && key === 'z';
        const shouldRedo = key === 'y' || (event.shiftKey && key === 'z');
        if (!shouldUndo && !shouldRedo) return;

        const handled = shouldUndo ? undoManager.undo() : undoManager.redo();

        if (handled) {
            event.preventDefault();
            event.stopPropagation();
        }
    }, { capture: true });

    document.addEventListener('input', (event) => {
        const propContent = document.getElementById('prop-content');
        if (!propContent?.contains(event.target) || !isEditablePropertyTarget(event.target)) return;

        if (!propertyEditActive || activePropertyTarget !== event.target) {
            undoManager.record('property-edit');
            propertyEditActive = true;
            activePropertyTarget = event.target;
        }
    }, { capture: true });

    document.addEventListener('change', (event) => {
        const propContent = document.getElementById('prop-content');
        if (!propContent?.contains(event.target) || !isEditablePropertyTarget(event.target)) return;

        if (!propertyEditActive || activePropertyTarget !== event.target) {
            undoManager.record('property-change');
        }

        queueMicrotask(() => {
            propertyEditActive = false;
            activePropertyTarget = null;
        });
    }, { capture: true });

    document.addEventListener('click', (event) => {
        const propContent = document.getElementById('prop-content');
        if (!propContent?.contains(event.target) || !isEditablePropertyTarget(event.target)) return;
        undoManager.record('property-click');
    }, { capture: true });

    document.addEventListener('dblclick', (event) => {
        const componentElement = event.target instanceof Element
            ? event.target.closest('#workspace-canvas .placed-component')
            : null;

        if (componentElement?.logica) {
            undoManager.record('component-toggle');
        }
    }, { capture: true });

    document.addEventListener('focusout', (event) => {
        if (activePropertyTarget !== event.target) return;
        propertyEditActive = false;
        activePropertyTarget = null;
    }, { capture: true });

    return undoManager;
}
