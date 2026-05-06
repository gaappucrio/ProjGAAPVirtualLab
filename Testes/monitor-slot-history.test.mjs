import test from 'node:test';
import assert from 'node:assert/strict';
import { createMonitorSlotHistory } from '../js/presentation/monitoring/MonitorSlotHistory.js';

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
