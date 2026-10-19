// =============================================
// DEBUG: foto do estado da planta e diferença entre duas fotos
// Arquivo: js/debug/StateSnapshot.js
// Captura genérica: todo campo primitivo (número, booleano, texto) dos
// componentes, do estadoHidraulico e do estado de cada conexão. Assim continua
// valendo se os nomes dos campos mudarem numa refatoração.
// =============================================

const NUMBER_TOLERANCE = 1e-9;

function isPrimitive(value) {
    return typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string';
}

function collectPrimitives(source, onde, prefix, snapshot) {
    if (!source || typeof source !== 'object') return;
    Object.entries(source).forEach(([key, value]) => {
        if (!isPrimitive(value)) return;
        snapshot.set(`${onde}\u0000${prefix}${key}`, { onde, campo: `${prefix}${key}`, valor: value });
    });
}

export function snapshotState(engine) {
    const snapshot = new Map();

    engine.componentes.forEach((component) => {
        collectPrimitives(component, component.tag, '', snapshot);
        collectPrimitives(component.estadoHidraulico, component.tag, 'estadoHidraulico.', snapshot);
    });

    engine.conexoes.forEach((connection) => {
        collectPrimitives(engine.connectionStateStore.get(connection), connection.id, '', snapshot);
    });

    return snapshot;
}

function round(value, digits = 6) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return value;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function hasChanged(before, after) {
    if (typeof before === 'number' && typeof after === 'number') {
        if (Number.isNaN(before) || Number.isNaN(after)) return Number.isNaN(before) !== Number.isNaN(after);
        return Math.abs(after - before) > NUMBER_TOLERANCE;
    }
    return before !== after;
}

export function diffSnapshots(before, after) {
    const keys = new Set([...before.keys(), ...after.keys()]);
    const rows = [];

    keys.forEach((key) => {
        const previous = before.get(key);
        const next = after.get(key);
        const valueBefore = previous?.valor;
        const valueAfter = next?.valor;
        if (!hasChanged(valueBefore, valueAfter)) return;

        const { onde, campo } = next || previous;
        rows.push({
            onde,
            campo,
            antes: round(valueBefore),
            depois: round(valueAfter),
            delta: typeof valueBefore === 'number' && typeof valueAfter === 'number'
                ? round(valueAfter - valueBefore)
                : ''
        });
    });

    return rows;
}
