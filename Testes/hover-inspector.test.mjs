import assert from 'node:assert/strict';
import test from 'node:test';

import { SistemaSimulacao } from '../js/application/engine/SimulationEngine.js';
import { DrenoLogico } from '../js/domain/components/DrenoLogico.js';
import { FonteLogica } from '../js/domain/components/FonteLogica.js';
import { ConnectionModel } from '../js/domain/models/ConnectionModel.js';
import { setupDebugPanel } from '../js/debug/DebugPanel.js';
import { describeHoverTarget, resolveHoverTarget, setupHoverInspector } from '../js/debug/HoverInspector.js';
import { createTickStepper } from '../js/debug/TickStepper.js';

function createPlant() {
    const engine = new SistemaSimulacao();
    engine.usarAlturaRelativa = false;

    const fonte = new FonteLogica('F-01', 'inlet-01', 0, 0);
    const dreno = new DrenoLogico('D-01', 'outlet-01', 160, 0);
    fonte.pressaoFonteBar = 2;
    fonte.vazaoMaxima = 40;
    fonte.conectarSaida(dreno);
    engine.add(fonte);
    engine.add(dreno);
    const connection = engine.addConnection(new ConnectionModel({
        sourceId: fonte.id,
        targetId: dreno.id,
        sourceEndpoint: { portType: 'out', portId: 'out' },
        targetEndpoint: { portType: 'in', portId: 'in' }
    }));
    return { engine, fonte, dreno, connection };
}

// Imita o DOM real: .placed-component[data-id][data-type] contendo .port-node[data-comp-id].
function fakeElement(className, dataset = {}, parent = null) {
    return {
        className,
        dataset,
        closest(selector) {
            const wanted = selector.replace(/^\./, '');
            for (let node = this; node; node = node.parent) {
                if (node.className === wanted) return node;
            }
            return null;
        },
        parent
    };
}

const noConnection = () => null;

test('hover: componente do canvas mostra classe, id e arquivo de código', () => {
    const { engine, fonte } = createPlant();
    const visual = fakeElement('placed-component', { id: 'F-01', type: 'source' });
    const svgChild = fakeElement('svg-shape', {}, visual);

    const target = resolveHoverTarget(engine, svgChild, { findConnectionByPath: noConnection });
    assert.equal(target.kind, 'componente');
    assert.equal(target.object, fonte);

    const lines = describeHoverTarget(engine, target);
    assert.equal(lines[0], 'inlet-01 · FonteLogica');
    assert.ok(lines.includes('id: F-01'));
    assert.ok(lines.includes('código: js/domain/components/FonteLogica.js'));
    assert.ok(lines.some((line) => line.includes('desenho: tipo "source"')));
});

test('hover: item da paleta (fora do engine) é ignorado', () => {
    const { engine } = createPlant();
    const paletteItem = fakeElement('placed-component', { id: 'tank-palette', type: 'tank' });
    assert.equal(resolveHoverTarget(engine, paletteItem, { findConnectionByPath: noConnection }), null);
});

test('hover: porta mostra direção e conexões ligadas a ela', () => {
    const { engine, dreno, connection } = createPlant();
    const visual = fakeElement('placed-component', { id: 'D-01', type: 'sink' });
    const port = fakeElement('port-node', { compId: 'D-01', portId: 'in', type: 'in' }, visual);

    const target = resolveHoverTarget(engine, port, { findConnectionByPath: noConnection });
    assert.equal(target.kind, 'porta');
    assert.equal(target.object, dreno);

    const lines = describeHoverTarget(engine, target);
    assert.equal(lines[0], 'porta "in" (entrada) de outlet-01 (D-01)');
    assert.equal(lines[1], `conexões: ${connection.id}`);
});

test('hover: cano mostra origem, destino e vazão atual', () => {
    const { engine, connection } = createPlant();
    createTickStepper({ engine, logger: {} }).step(30);
    const pipePath = fakeElement('pipe-line');

    const target = resolveHoverTarget(engine, pipePath, { findConnectionByPath: (el) => (el === pipePath ? connection : null) });
    assert.equal(target.kind, 'conexao');

    const lines = describeHoverTarget(engine, target);
    assert.equal(lines[0], `${connection.id} · ConnectionModel (cano)`);
    assert.equal(lines[1], 'inlet-01 (F-01) → outlet-01 (D-01)');
    assert.match(lines[3], /^vazão: [1-9][\d.]* L\/s/);
});

test('hover: cano já removido do engine não é mostrado', () => {
    const { engine, connection } = createPlant();
    engine.removeConnection(connection);
    const pipePath = fakeElement('pipe-line');

    assert.equal(resolveHoverTarget(engine, pipePath, { findConnectionByPath: () => connection }), null);
});

// DOM mínimo: só o que o painel e o tooltip usam.
function createFakeDocument() {
    const elements = [];
    const listeners = {};
    const createElement = (tagName) => {
        const element = {
            tagName,
            id: '',
            style: {},
            textContent: '',
            offsetWidth: 0,
            offsetHeight: 0,
            children: [],
            attributes: {},
            classes: new Set(),
            get classList() {
                return { add: (name) => this.classes.add(name), remove: (name) => this.classes.delete(name) };
            },
            setAttribute(name, value) { this.attributes[name] = value; },
            appendChild(child) { this.children.push(child); elements.push(child); return child; },
            addEventListener(type, handler) { (this.handlers ??= {})[type] = handler; }
        };
        return element;
    };
    const body = createElement('body');
    return {
        body,
        createElement,
        getElementById: (id) => elements.find((element) => element.id === id) || null,
        addEventListener: (type, handler) => { listeners[type] = handler; },
        dispatch: (type, event) => listeners[type]?.(event)
    };
}

const fakeWindow = { requestAnimationFrame: (fn) => fn(), setInterval: () => 0, innerWidth: 1000, innerHeight: 800 };

test('hover: mousemove mostra o tooltip, guarda ultimoHover e pode ser desligado', () => {
    const { engine, fonte } = createPlant();
    const doc = createFakeDocument();
    const api = {};
    const hover = setupHoverInspector({ engine, api, doc, win: fakeWindow, findConnectionByPath: noConnection });
    const tooltip = doc.getElementById('gaap-debug-hover');

    const visual = fakeElement('placed-component', { id: 'F-01', type: 'source' });
    doc.dispatch('mousemove', { target: visual, buttons: 0, clientX: 10, clientY: 20 });
    assert.equal(tooltip.style.display, 'block');
    assert.match(tooltip.textContent, /^inlet-01 · FonteLogica/);
    assert.equal(api.ultimoHover, fonte);

    doc.dispatch('mousemove', { target: visual, buttons: 1, clientX: 10, clientY: 20 });
    assert.equal(tooltip.style.display, 'none', 'some enquanto arrasta');

    hover.setEnabled(false);
    doc.dispatch('mousemove', { target: visual, buttons: 0, clientX: 10, clientY: 20 });
    assert.equal(tooltip.style.display, 'none');
});

test('hover: tag com HTML entra como texto, sem virar markup', () => {
    const { engine, fonte } = createPlant();
    fonte.tag = '<img src=x onerror=alert(1)>';
    const doc = createFakeDocument();
    setupHoverInspector({ engine, api: {}, doc, win: fakeWindow, findConnectionByPath: noConnection });

    doc.dispatch('mousemove', { target: fakeElement('placed-component', { id: 'F-01', type: 'source' }), buttons: 0, clientX: 0, clientY: 0 });
    const tooltip = doc.getElementById('gaap-debug-hover');
    assert.ok(tooltip.textContent.startsWith('<img src=x onerror=alert(1)> · FonteLogica'));
    assert.equal(tooltip.innerHTML, undefined, 'o tooltip nunca usa innerHTML');
});

test('hover e painel: chamar o setup duas vezes não duplica elementos', () => {
    const { engine } = createPlant();
    const doc = createFakeDocument();
    const api = { monitor: { report: () => [] } };

    assert.ok(setupHoverInspector({ engine, api, doc, win: fakeWindow }));
    assert.equal(setupHoverInspector({ engine, api, doc, win: fakeWindow }), null);
    assert.ok(setupDebugPanel({ api, engine, doc, schedule: () => 0 }));
    assert.equal(setupDebugPanel({ api, engine, doc, schedule: () => 0 }), null);
    assert.deepEqual(doc.body.children.map((element) => element.id).sort(),
        ['gaap-debug-hover', 'gaap-debug-panel', 'gaap-debug-style']);
});

test('painel: mostra estado da simulação e quantidade de violações', () => {
    const { engine } = createPlant();
    const doc = createFakeDocument();
    let violations = [];
    let refresh = null;
    const api = { monitor: { report: () => violations } };

    const panel = setupDebugPanel({ api, engine, doc, schedule: (fn) => { refresh = fn; } });
    const status = panel.children[1];
    assert.match(status.textContent, /⏸ pausado · t = 0\.00 s · ✔ sem violações/);

    violations = [{}, {}];
    refresh();
    assert.match(status.textContent, /⚠ 2 violação\(ões\)/);
});

function findButton(panel, label) {
    const row = panel.children[2];
    return row.children.find((button) => button.textContent.startsWith(label));
}

test('painel: botão hover indica o estado pela cor e acompanha mudanças pelo console', () => {
    const { engine } = createPlant();
    const doc = createFakeDocument();
    let enabled = true;
    let refresh = null;
    const api = {
        monitor: { report: () => [] },
        hover: () => { enabled = !enabled; },
        hoverLigado: () => enabled
    };

    const panel = setupDebugPanel({ api, engine, doc, schedule: (fn) => { refresh = fn; }, setTimer: () => 0 });
    const button = findButton(panel, 'hover');
    assert.equal(button.textContent, 'hover');
    assert.equal(button.attributes['aria-pressed'], 'true');
    assert.match(button.title, /ligado/);

    button.handlers.click();
    assert.equal(button.textContent, 'hover', 'o texto não muda; o estado é mostrado pela cor');
    assert.equal(button.attributes['aria-pressed'], 'false');
    assert.match(button.title, /desligado/);

    enabled = true; // como se fosse __GAAP.hover() no console
    refresh();
    assert.equal(button.attributes['aria-pressed'], 'true');
});

test('painel: botões de ação piscam ao clicar e medir mostra "medindo…"', async () => {
    const { engine } = createPlant();
    const doc = createFakeDocument();
    const timers = [];
    let finishMeasure = null;
    const calls = [];
    const api = {
        monitor: { report: () => [] },
        passo: (n) => calls.push(`passo(${n})`),
        medir: () => new Promise((resolve) => { finishMeasure = resolve; })
    };

    const panel = setupDebugPanel({ api, engine, doc, schedule: () => 0, setTimer: (fn) => timers.push(fn) });
    const stepButton = findButton(panel, '+1 tick');
    stepButton.handlers.click();
    assert.deepEqual(calls, ['passo(1)']);
    assert.ok(stepButton.classes.has('gaap-debug-flash'));
    timers.shift()();
    assert.equal(stepButton.classes.has('gaap-debug-flash'), false);

    engine.isRunning = true;
    const measureButton = findButton(panel, 'medir');
    measureButton.handlers.click();
    assert.equal(measureButton.textContent, 'medindo…');
    assert.equal(measureButton.disabled, true);

    finishMeasure([]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(measureButton.textContent, 'medir 3 s');
    assert.equal(measureButton.disabled, false);
});
