#!/usr/bin/env node

import assert from 'node:assert/strict';

import { ConnectionService } from './js/application/services/ConnectionService.js';
import { EngineEventPayloads } from './js/application/events/EventPayloads.js';
import { TransientConnectionStore } from './js/application/stores/TransientConnectionStore.js';
import { ConnectionModel } from './js/domain/models/ConnectionModel.js';
import { calculateConnectionGeometry } from './js/domain/services/PortPositionCalculator.js';

function createPort({ compId, type, cx, cy, svgLeft = 0, svgTop = 0 }) {
    return {
        dataset: { compId, type },
        ownerSVGElement: { style: { left: `${svgLeft}px`, top: `${svgTop}px` } },
        getAttribute(name) {
            if (name === 'cx') return String(cx);
            if (name === 'cy') return String(cy);
            return null;
        }
    };
}

function runTest(name, fn) {
    try {
        fn();
        console.log(`PASS ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}`);
        throw error;
    }
}

runTest('ConnectionModel stays logical and computes derived area', () => {
    const connection = new ConnectionModel({
        sourceId: 'source-1',
        targetId: 'target-1',
        sourceEndpoint: { portType: 'out', offsetX: 65, offsetY: 40, floorOffsetY: 0 },
        targetEndpoint: { portType: 'in', offsetX: 15, offsetY: 40, floorOffsetY: 0 }
    });

    assert.equal(connection.sourceId, 'source-1');
    assert.equal(connection.targetId, 'target-1');
    assert.ok(connection.areaM2 > 0);
    assert.equal('sourceEl' in connection, false);
    assert.equal('targetEl' in connection, false);
});

runTest('TransientConnectionStore models start, preview and cancel', () => {
    const store = new TransientConnectionStore();
    const started = store.begin({
        sourceComponentId: 'pump-1',
        sourcePortType: 'out',
        sourceEndpoint: { portType: 'out', offsetX: 80, offsetY: 40, floorOffsetY: 0 },
        sourcePoint: { x: 100, y: 200 }
    });

    assert.equal(started.active, true);
    assert.deepEqual(started.previewPoint, { x: 100, y: 200 });

    const preview = store.updatePreview({ x: 240, y: 260 });
    assert.deepEqual(preview.previewPoint, { x: 240, y: 260 });

    const cancelled = store.cancel();
    assert.equal(cancelled.active, true);
    assert.equal(store.snapshot().active, false);
});

runTest('ConnectionService creates logical connections and emits engine events', () => {
    const events = [];
    const engine = {
        selectedConnection: null,
        _connections: [],
        addConnection(connection) {
            this._connections.push(connection);
            events.push(EngineEventPayloads.connectionCommitted(connection));
        },
        removeConnection(connection) {
            this._connections = this._connections.filter((entry) => entry !== connection);
            events.push(EngineEventPayloads.connectionRemoved(connection));
        },
        notify(payload) {
            events.push(payload);
        },
        getComponentById(id) {
            return componentsById.get(id) || null;
        },
        selectComponent(component) {
            this.selectedConnection = null;
            this.selectedComponent = component;
        }
    };

    const sourceComponent = {
        id: 'pump-1',
        alturaUtilMetros: undefined,
        outputs: [],
        conectarSaida(target) {
            this.outputs.push(target);
        },
        desconectarSaida(target) {
            this.outputs = this.outputs.filter((entry) => entry !== target);
        }
    };
    const targetComponent = {
        id: 'tank-1',
        alturaUtilMetros: 2.5,
        inputs: []
    };
    const componentsById = new Map([
        [sourceComponent.id, sourceComponent],
        [targetComponent.id, targetComponent]
    ]);

    const service = new ConnectionService(engine);
    const sourcePort = createPort({ compId: sourceComponent.id, type: 'out', cx: 80, cy: 40 });
    const targetPort = createPort({ compId: targetComponent.id, type: 'in', cx: 0, cy: 80, svgTop: 20 });

    const connection = service.connect(sourceComponent, sourcePort, targetComponent, targetPort);
    assert.ok(connection);
    assert.equal(connection.sourceId, sourceComponent.id);
    assert.equal(connection.targetId, targetComponent.id);
    assert.equal(engine._connections.length, 1);
    assert.equal(events.some((event) => event.tipo === 'conexao_confirmada'), true);
    assert.equal(events.some((event) => event.tipo === 'update_painel'), true);

    engine.selectedConnection = connection;
    service.remove(connection);
    assert.equal(engine._connections.length, 0);
    assert.equal(events.some((event) => event.tipo === 'conexao_removida'), true);
});

runTest('Engine event payloads formalize transient connection contract', () => {
    const started = EngineEventPayloads.connectionStarted({
        sourceComponentId: 'source-1',
        sourceEndpoint: { portType: 'out' },
        sourcePoint: { x: 10, y: 20 }
    });
    const preview = EngineEventPayloads.connectionPreview({
        sourceComponentId: 'source-1',
        sourcePoint: { x: 10, y: 20 },
        previewPoint: { x: 30, y: 40 }
    });
    const cancelled = EngineEventPayloads.connectionCancelled({ sourceComponentId: 'source-1' });

    assert.equal(started.tipo, 'conexao_iniciada');
    assert.equal(preview.tipo, 'conexao_preview');
    assert.equal(cancelled.tipo, 'conexao_cancelada');
});

runTest('Geometry stays calculable from pure points', () => {
    const connection = new ConnectionModel({
        sourceId: 'source-1',
        targetId: 'target-1',
        sourceEndpoint: { portType: 'out', offsetX: 0, offsetY: 0, floorOffsetY: 0 },
        targetEndpoint: { portType: 'in', offsetX: 0, offsetY: 0, floorOffsetY: 0 },
        extraLengthM: 0.5
    });

    const geometry = calculateConnectionGeometry(
        { x: 100, y: 120 },
        { x: 260, y: 200 },
        connection,
        true
    );

    assert.ok(geometry.lengthM > geometry.straightLengthM - 0.0001);
    assert.ok(Number.isFinite(geometry.headGainM));
});

console.log('All phase 1 tests passed.');
