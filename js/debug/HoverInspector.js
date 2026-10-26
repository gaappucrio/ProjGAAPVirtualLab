// =============================================
// DEBUG: tooltip "o que é isto?" ao passar o mouse
// Arquivo: js/debug/HoverInspector.js
// Mostra classe, id, arquivo de código e valores atuais de componentes, portas
// e canos. O último objeto apontado fica em __GAAP.ultimoHover para o console.
// O texto entra via textContent (sem HTML), então tags com < > não viram markup.
// =============================================

import { findConnectionByPath as defaultFindConnectionByPath } from '../infrastructure/rendering/ConnectionVisualRegistry.js';
import { componentRow, connectionRow, describeComponent } from './DebugRows.js';

const PORT_DIRECTIONS = Object.freeze({ in: 'entrada', out: 'saída', inout: 'entrada/saída' });
const TOOLTIP_ID = 'gaap-debug-hover';
const REFRESH_MS = 250;
const CURSOR_OFFSET_PX = 14;

const TOOLTIP_STYLE = [
    'position:fixed', 'z-index:100000', 'pointer-events:none', 'display:none',
    'max-width:420px', 'padding:6px 8px', 'white-space:pre',
    'font:11px/1.35 ui-monospace,Consolas,monospace', 'color:#f5f5f5',
    'background:rgba(20,24,32,0.95)', 'border:1px solid #f0a020', 'border-radius:6px',
    'box-shadow:0 4px 12px rgba(0,0,0,0.35)'
].join(';');

export function resolveHoverTarget(engine, element, { findConnectionByPath = defaultFindConnectionByPath } = {}) {
    if (!element) return null;

    const port = element.closest?.('.port-node');
    if (port) {
        const component = engine.getComponentById(port.dataset?.compId);
        if (component) {
            return {
                kind: 'porta',
                object: component,
                portId: port.dataset.portId || port.dataset.type,
                direction: port.dataset.type
            };
        }
    }

    const connection = findConnectionByPath(element);
    if (connection && engine.conexoes.includes(connection)) return { kind: 'conexao', object: connection };

    const visual = element.closest?.('.placed-component');
    if (visual) {
        // Itens da paleta também são .placed-component, mas não estão no engine.
        const component = engine.getComponentById(visual.dataset?.id);
        if (component) return { kind: 'componente', object: component, visualType: visual.dataset.type };
    }

    return null;
}

function isStillInEngine(engine, target) {
    if (target.kind === 'conexao') return engine.conexoes.includes(target.object);
    return engine.getComponentById(target.object.id) === target.object;
}

function connectionsAtPort(engine, component, portId) {
    const inputs = engine.getInputConnections(component)
        .filter((connection) => (connection.targetEndpoint?.portId || 'in') === portId);
    const outputs = engine.getOutputConnections(component)
        .filter((connection) => (connection.sourceEndpoint?.portId || 'out') === portId);
    return [...inputs, ...outputs];
}

export function describeHoverTarget(engine, target) {
    if (!target) return [];

    if (target.kind === 'conexao') {
        const row = connectionRow(engine, target.object);
        return [
            `${row.id} · ConnectionModel (cano)`,
            `${row.de} → ${row.para}`,
            `código: js/domain/models/ConnectionModel.js`,
            `vazão: ${row.vazaoLps} L/s · regime: ${row.regime}`,
            `P entrada/saída: ${row.pEntradaBar} / ${row.pSaidaBar} bar · perda: ${row.perdaBar} bar`,
            `console: __GAAP.ultimoHover`
        ];
    }

    const component = target.object;
    const row = componentRow(component);

    if (target.kind === 'porta') {
        const connections = connectionsAtPort(engine, component, target.portId);
        return [
            `porta "${target.portId}" (${PORT_DIRECTIONS[target.direction] || target.direction}) de ${describeComponent(component)}`,
            connections.length > 0
                ? `conexões: ${connections.map((connection) => connection.id).join(', ')}`
                : 'conexões: nenhuma',
            `console: __GAAP.ultimoHover`
        ];
    }

    return [
        `${row.tag} · ${row.tipo}`,
        `id: ${row.id}`,
        `código: js/domain/components/${row.tipo}.js`,
        `desenho: tipo "${target.visualType}" em js/infrastructure/dom/ComponentVisualSpecs.js`,
        `Q entrada/saída: ${row.qEntradaLps} / ${row.qSaidaLps} L/s`,
        `P entrada/saída: ${row.pEntradaBar} / ${row.pSaidaBar} bar`,
        `console: __GAAP.ultimoHover`
    ];
}

export function setupHoverInspector({
    engine,
    api,
    doc = globalThis.document,
    win = globalThis.window,
    findConnectionByPath = defaultFindConnectionByPath
} = {}) {
    if (!doc?.body || doc.getElementById?.(TOOLTIP_ID)) return null;

    const tooltip = doc.createElement('div');
    tooltip.id = TOOLTIP_ID;
    tooltip.setAttribute('style', TOOLTIP_STYLE);
    doc.body.appendChild(tooltip);

    let enabled = true;
    let currentTarget = null;
    let lastPointer = { x: 0, y: 0 };
    let framePending = false;
    let pendingEvent = null;

    const hide = () => {
        tooltip.style.display = 'none';
        currentTarget = null;
    };

    const place = () => {
        const viewportWidth = win?.innerWidth ?? Infinity;
        const viewportHeight = win?.innerHeight ?? Infinity;
        let left = lastPointer.x + CURSOR_OFFSET_PX;
        let top = lastPointer.y + CURSOR_OFFSET_PX;
        const { offsetWidth = 0, offsetHeight = 0 } = tooltip;
        if (left + offsetWidth > viewportWidth) left = lastPointer.x - CURSOR_OFFSET_PX - offsetWidth;
        if (top + offsetHeight > viewportHeight) top = lastPointer.y - CURSOR_OFFSET_PX - offsetHeight;
        tooltip.style.left = `${Math.max(0, left)}px`;
        tooltip.style.top = `${Math.max(0, top)}px`;
    };

    const render = () => {
        if (!currentTarget || !isStillInEngine(engine, currentTarget)) return hide();
        tooltip.textContent = describeHoverTarget(engine, currentTarget).join('\n');
        tooltip.style.display = 'block';
        place();
    };

    const handleMove = () => {
        framePending = false;
        const event = pendingEvent;
        if (!enabled || !event || event.buttons !== 0) return hide();

        lastPointer = { x: event.clientX, y: event.clientY };
        currentTarget = resolveHoverTarget(engine, event.target, { findConnectionByPath });
        if (currentTarget && api) api.ultimoHover = currentTarget.object;
        render();
    };

    doc.addEventListener('mousemove', (event) => {
        pendingEvent = event;
        if (framePending) return;
        framePending = true;
        (win?.requestAnimationFrame ?? ((fn) => fn()))(handleMove);
    });
    doc.addEventListener('mouseleave', hide);

    // Mantém os valores atualizados com o mouse parado e a simulação rodando.
    (win?.setInterval ?? globalThis.setInterval)(() => {
        if (enabled && currentTarget) render();
    }, REFRESH_MS);

    return {
        get enabled() {
            return enabled;
        },
        setEnabled(value) {
            enabled = value !== false;
            if (!enabled) hide();
            return enabled;
        }
    };
}
