import assert from 'node:assert/strict';
import test from 'node:test';

import { SistemaSimulacao } from '../js/application/engine/SimulationEngine.js';
import { DrenoLogico } from '../js/domain/components/DrenoLogico.js';
import { FonteLogica } from '../js/domain/components/FonteLogica.js';
import { Observable } from '../js/domain/components/BaseComponente.js';
import { ComponentEventPayloads, EngineEventPayloads } from '../js/application/events/EventPayloads.js';
import { ConnectionModel } from '../js/domain/models/ConnectionModel.js';
import { createEventTracer, summarizePayload } from '../js/debug/EventTracer.js';

function createRecordingLogger() {
    const lines = [];
    return {
        lines,
        log: (...args) => lines.push(['log', ...args]),
        groupCollapsed: (...args) => lines.push(['group', ...args]),
        groupEnd: () => {},
        trace: () => {},
        info: () => {},
        table: () => {}
    };
}

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
    engine.addConnection(new ConnectionModel({ sourceId: fonte.id, targetId: dreno.id }));
    return { engine, fonte, dreno };
}

// O rastreador troca o protótipo global; garante que nada vaze para os outros testes.
function withTracer(t, engine, logger = createRecordingLogger()) {
    const originalNotify = Observable.prototype.notify;
    const tracer = createEventTracer({ engine, logger });
    t.after(() => {
        tracer.stop();
        Observable.prototype.notify = originalNotify;
    });
    return { tracer, logger, originalNotify };
}

test('rastreio: registra origem, tipo e resumo do payload', (t) => {
    const { engine, fonte } = createPlant();
    const { tracer } = withTracer(t, engine);

    tracer.start();
    engine.selectComponent(fonte);

    const [entry] = tracer.entries();
    assert.equal(entry.origem, 'engine');
    assert.equal(entry.tipo, 'selecao');
    assert.match(entry.resumo, /componente: inlet-01/);
    assert.equal(entry.emTick, false);
});

test('rastreio: stop restaura o notify original e para de registrar', (t) => {
    const { engine, fonte } = createPlant();
    const { tracer, originalNotify } = withTracer(t, engine);

    tracer.start();
    assert.notEqual(Observable.prototype.notify, originalNotify);
    tracer.stop();
    assert.equal(Observable.prototype.notify, originalNotify);
    assert.equal(engine.tickPipeline.run, Object.getPrototypeOf(engine.tickPipeline).run);

    engine.selectComponent(fonte);
    assert.equal(tracer.entries().length, 0);
});

test('rastreio: eventos disparados dentro de outro evento ganham profundidade', (t) => {
    const { engine, fonte } = createPlant();
    const { tracer } = withTracer(t, engine);

    fonte.subscribe(() => engine.notify(EngineEventPayloads.panelUpdate(0)));
    tracer.start({ ignorar: [] });
    fonte.notify(ComponentEventPayloads.tagUpdate());

    const [outer, inner] = tracer.entries();
    assert.equal(outer.origem, 'inlet-01 (F-01)');
    assert.equal(outer.profundidade, 0);
    assert.equal(inner.origem, 'engine');
    assert.equal(inner.profundidade, 1);
});

test('rastreio: filtros por tipo, tag e lista de ignorados', (t) => {
    const { engine, fonte, dreno } = createPlant();
    const { tracer } = withTracer(t, engine);

    tracer.start({ tag: 'outlet-01' });
    fonte.notify(ComponentEventPayloads.tagUpdate());
    dreno.notify(ComponentEventPayloads.tagUpdate());
    assert.deepEqual(tracer.entries().map((entry) => entry.origem), ['outlet-01 (D-01)']);

    tracer.start({ tipos: ['estado'] });
    dreno.notify(ComponentEventPayloads.tagUpdate());
    dreno.notify(ComponentEventPayloads.state({ aberta: true }));
    assert.deepEqual(tracer.entries().map((entry) => entry.tipo), ['estado']);

    tracer.start();
    engine.notify(EngineEventPayloads.panelUpdate(0.016));
    assert.equal(tracer.entries().length, 0, 'update_painel é ignorado por padrão');
});

test('rastreio: eventos do tick só entram na contagem, sem lotar o buffer nem o console', (t) => {
    const { engine, fonte } = createPlant();
    const { tracer, logger } = withTracer(t, engine);

    engine.isRunning = true;
    engine.lastTime = 0;
    tracer.start({ ignorar: [], max: 3 });
    engine.selectComponent(fonte);
    for (let i = 1; i <= 20; i += 1) engine.tickPipeline.run(i * 16);

    assert.deepEqual(tracer.entries().map((entry) => entry.tipo), ['selecao'],
        'a ação do usuário não pode ser expulsa do buffer pelos eventos de tick');
    const panel = tracer.summary().find((row) => row.tipo === 'update_painel');
    assert.equal(panel.qtd, 20);
    assert.equal(panel.emTick, 20);
    const liveHeaders = logger.lines.filter(([kind]) => kind === 'group');
    assert.equal(liveHeaders.length, 1, 'só a seleção aparece ao vivo');
    assert.match(liveHeaders[0][1], /engine → selecao/);

    tracer.start({ ignorar: [], incluirTick: true, pilha: false });
    engine.tickPipeline.run(400);
    const tickEntries = tracer.entries().filter((entry) => entry.emTick);
    assert.ok(tickEntries.length > 0);
    assert.ok(tickEntries.every((entry) => entry.tick === 1), 'start() zera a contagem de ticks');
    assert.ok(logger.lines.some(([, line]) => /\[tick 1\] engine → update_painel/.test(line)));
});

test('rastreio: filtro tag "engine" pega os eventos do motor', (t) => {
    const { engine, fonte } = createPlant();
    const { tracer } = withTracer(t, engine);

    tracer.start({ tag: 'engine' });
    engine.selectComponent(fonte);
    fonte.notify(ComponentEventPayloads.tagUpdate());
    assert.deepEqual(tracer.entries().map((entry) => entry.origem), ['engine']);

    tracer.start();
    engine.selectComponent(fonte);
    fonte.notify(ComponentEventPayloads.tagUpdate());
    assert.deepEqual(tracer.entries({ tag: 'engine' }).map((entry) => entry.tipo), ['selecao']);
});

test('rastreio: resumo agrupa por origem e tipo', (t) => {
    const { engine, fonte } = createPlant();
    const { tracer } = withTracer(t, engine);

    tracer.start();
    engine.selectComponent(fonte);
    engine.selectComponent(null);
    fonte.notify(ComponentEventPayloads.tagUpdate());

    const summary = tracer.summary();
    assert.deepEqual(summary[0], { origem: 'engine', tipo: 'selecao', qtd: 2, emTick: 0, msTotal: summary[0].msTotal });
    assert.equal(summary.length, 2);
});

test('rastreio: avisa sobre opção desconhecida e sugere a grafia certa', (t) => {
    const { engine } = createPlant();
    const warnings = [];
    const logger = { ...createRecordingLogger(), warn: (message) => warnings.push(message) };
    const { tracer } = withTracer(t, engine, logger);

    tracer.start({ incluirtick: true, xyz: 1 });

    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /"incluirtick".*"incluirTick"/);
    assert.match(warnings[1], /"xyz".*Opções válidas/);
});

test('rastreio: resumo do payload mostra tags em vez de objetos', () => {
    const fonte = new FonteLogica('F-01', 'inlet-01', 0, 0);
    const connection = new ConnectionModel({ id: 'conn-x', sourceId: 'a', targetId: 'b' });

    assert.equal(
        summarizePayload({ tipo: 'selecao', componente: fonte, conexao: connection, componentes: [fonte], grau: 1 / 3 }),
        'componente: inlet-01, conexao: conn-x, componentes: [inlet-01], grau: 0.3333'
    );
});

test('rastreio: tempos muito curtos se acumulam sem serem zerados pelo arredondamento', (t) => {
    const { engine, fonte } = createPlant();
    const originalNotify = Observable.prototype.notify;
    let clock = 0;
    const tracer = createEventTracer({ engine, logger: {}, now: () => { clock += 0.00015; return clock; } });
    t.after(() => {
        tracer.stop();
        Observable.prototype.notify = originalNotify;
    });

    tracer.start({ aoVivo: false });
    for (let i = 0; i < 5000; i += 1) fonte.notify(ComponentEventPayloads.tagUpdate());

    const [row] = tracer.summary();
    assert.equal(row.qtd, 5000);
    assert.ok(Math.abs(row.msTotal - 0.75) < 0.01, `esperado ~0,75 ms, veio ${row.msTotal}`);
});
