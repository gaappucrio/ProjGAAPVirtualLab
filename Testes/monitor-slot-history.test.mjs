import test from 'node:test';
import assert from 'node:assert/strict';
import { createMonitorSlotHistory } from '../js/presentation/monitoring/MonitorSlotHistory.js';
import { canMergePipeMonitorEntries } from '../js/presentation/monitoring/PipeMonitorGrouping.js';

test('histórico do monitor preserva a posição ao clicar em gráfico já exibido', () => {
    const removed = [];
    const history = createMonitorSlotHistory({
        maxEntries: 2,
        onRemove: (entry) => removed.push(entry)
    });

    history.remember({ id: 'tank-1', kind: 'tank' });
    history.remember({ id: 'pump-1', kind: 'pump' });

    const repeatResult = history.remember({ id: 'tank-1', kind: 'tank' });

    assert.equal(repeatResult.changed, false);
    assert.deepEqual(history.getEntries(), [
        { id: 'tank-1', kind: 'tank' },
        { id: 'pump-1', kind: 'pump' }
    ]);
    assert.deepEqual(removed, []);
});

test('histórico do monitor substitui apenas o slot mais antigo ao entrar terceiro gráfico', () => {
    const removed = [];
    const history = createMonitorSlotHistory({
        maxEntries: 2,
        onRemove: (entry) => removed.push(entry)
    });

    history.remember({ id: 'tank-1', kind: 'tank' });
    history.remember({ id: 'pump-1', kind: 'pump' });
    history.remember({ id: 'tank-2', kind: 'tank' });

    assert.deepEqual(history.getEntries(), [
        { id: 'pump-1', kind: 'pump' },
        { id: 'tank-2', kind: 'tank' }
    ]);
    assert.deepEqual(removed, [
        { id: 'tank-1', kind: 'tank' }
    ]);
});

test('histórico do monitor permite remover um slot e compacta os restantes', () => {
    const removed = [];
    const history = createMonitorSlotHistory({
        maxEntries: 2,
        onRemove: (entry) => removed.push(entry)
    });

    history.remember({ id: 'tank-1', kind: 'tank' });
    history.remember({ id: 'pump-1', kind: 'pump' });

    const result = history.removeAt(0);

    assert.equal(result.changed, true);
    assert.deepEqual(history.getEntries(), [
        { id: 'pump-1', kind: 'pump' }
    ]);
    assert.deepEqual(removed, [
        { id: 'tank-1', kind: 'tank' }
    ]);

    const unchanged = history.removeAt(5);
    assert.equal(unchanged.changed, false);
    assert.deepEqual(history.getEntries(), [
        { id: 'pump-1', kind: 'pump' }
    ]);
});

test('histórico do monitor troca dois slots ao arrastar um card', () => {
    const history = createMonitorSlotHistory({ maxEntries: 2 });

    history.remember({ id: 'tank-1', kind: 'tank' });
    history.remember({ id: 'pump-1', kind: 'pump' });

    const result = history.swapAt(0, 1);

    assert.equal(result.changed, true);
    assert.deepEqual(history.getEntries(), [
        { id: 'pump-1', kind: 'pump' },
        { id: 'tank-1', kind: 'tank' }
    ]);

    const unchanged = history.swapAt(0, 0);
    assert.equal(unchanged.changed, false);
});

test('histórico do monitor aglutina canos em um único slot', () => {
    const history = createMonitorSlotHistory({ maxEntries: 2 });

    history.remember({ id: 'conn-a', kind: 'pipe' });
    history.remember({ id: 'conn-b', kind: 'pipe' });

    const result = history.mergePipesAt(1, 0);

    assert.equal(result.changed, true);
    assert.deepEqual(history.getEntries(), [
        {
            id: 'pipe-group:conn-a|conn-b',
            kind: 'pipeGroup',
            ids: ['conn-a', 'conn-b']
        }
    ]);

    const duplicateResult = history.remember({ id: 'conn-a', kind: 'pipe' });
    assert.equal(duplicateResult.changed, false);
    assert.deepEqual(history.getEntries(), [
        {
            id: 'pipe-group:conn-a|conn-b',
            kind: 'pipeGroup',
            ids: ['conn-a', 'conn-b']
        }
    ]);
});

test('aglutinação de canos exige trechos do mesmo sistema hidráulico', () => {
    const connections = [
        { id: 'conn-a', sourceId: 'entrada-1', targetId: 'tanque-1' },
        { id: 'conn-b', sourceId: 'tanque-1', targetId: 'valvula-1' },
        { id: 'conn-c', sourceId: 'entrada-2', targetId: 'saida-2' }
    ];

    assert.equal(
        canMergePipeMonitorEntries(
            { id: 'conn-a', kind: 'pipe' },
            { id: 'conn-b', kind: 'pipe' },
            connections
        ),
        true
    );
    assert.equal(
        canMergePipeMonitorEntries(
            { id: 'conn-a', kind: 'pipe' },
            { id: 'conn-c', kind: 'pipe' },
            connections
        ),
        false
    );
    assert.equal(
        canMergePipeMonitorEntries(
            { id: 'pipe-group:conn-a|conn-b', kind: 'pipeGroup', ids: ['conn-a', 'conn-b'] },
            { id: 'conn-c', kind: 'pipe' },
            connections
        ),
        false
    );
});
