import assert from 'node:assert/strict';
import test from 'node:test';

import { SistemaSimulacao } from '../js/application/engine/SimulationEngine.js';
import { SimulationTickPipeline } from '../js/application/engine/SimulationTickPipeline.js';
import { DrenoLogico } from '../js/domain/components/DrenoLogico.js';
import { FonteLogica } from '../js/domain/components/FonteLogica.js';
import { TanqueLogico } from '../js/domain/components/TanqueLogico.js';
import { Observable } from '../js/domain/components/BaseComponente.js';
import { ConnectionModel } from '../js/domain/models/ConnectionModel.js';
import { createEventTracer } from '../js/debug/EventTracer.js';
import { wrapMethod } from '../js/debug/MethodWrap.js';
import { diffSnapshots, snapshotState } from '../js/debug/StateSnapshot.js';
import { createTickStepper } from '../js/debug/TickStepper.js';
import { TICK_PHASES } from '../js/debug/TickProfiler.js';

const silentLogger = {};

function createPlant() {
    const engine = new SistemaSimulacao();
    engine.usarAlturaRelativa = false;

    const fonte = new FonteLogica('F-01', 'inlet-01', 0, 0);
    const tanque = new TanqueLogico('T-01', 'tank-01', 160, 0);
    const dreno = new DrenoLogico('D-01', 'outlet-01', 320, 0);
    fonte.pressaoFonteBar = 2;
    fonte.vazaoMaxima = 40;
    fonte.conectarSaida(tanque);
    tanque.conectarSaida(dreno);

    [fonte, tanque, dreno].forEach((component) => engine.add(component));
    engine.addConnection(new ConnectionModel({ sourceId: fonte.id, targetId: tanque.id }));
    engine.addConnection(new ConnectionModel({ sourceId: tanque.id, targetId: dreno.id }));
    return { engine, fonte, tanque, dreno };
}

test('passo: avança o tempo simulado com dt fixo e deixa a simulação pausada', () => {
    const { engine } = createPlant();
    const stepper = createTickStepper({ engine, logger: silentLogger });

    const result = stepper.step(10, { dt: 0.05 });

    assert.equal(result.ticks, 10);
    assert.ok(Math.abs(result.tempoSimuladoS - 0.5) < 1e-9);
    assert.ok(Math.abs(engine.elapsedTime - 0.5) < 1e-9);
    assert.equal(engine.isRunning, false);
});

test('passo: respeita a velocidade da simulação ao converter dt', () => {
    const { engine } = createPlant();
    engine.velocidade = 4;
    const stepper = createTickStepper({ engine, logger: silentLogger });

    const result = stepper.step(1, { dt: 0.02 });
    assert.ok(Math.abs(result.tempoSimuladoS - 0.02) < 1e-9);
});

test('passo: lista o que mudou na planta (volume do tanque e vazão da conexão)', () => {
    const { engine } = createPlant();
    const stepper = createTickStepper({ engine, logger: silentLogger });

    const { mudancas } = stepper.step(30);

    assert.ok(mudancas.some((row) => row.onde === 'tank-01' && row.campo === 'volumeAtual' && row.delta > 0),
        'o tanque deve acumular volume vindo da fonte');
    assert.ok(mudancas.some((row) => row.onde.startsWith('conn-') && row.campo === 'flowLps'),
        'a vazão de alguma conexão deve aparecer na lista de mudanças');
});

test('passo: mede todas as fases na ordem real do pipeline', () => {
    const { engine } = createPlant();
    const stepper = createTickStepper({ engine, logger: silentLogger });

    const { fases } = stepper.step(3);

    assert.deepEqual(
        fases.slice(0, TICK_PHASES.length).map((row) => row.fase),
        TICK_PHASES.map((phase) => phase.method)
    );
    assert.equal(fases.at(-1).fase, 'TOTAL');
    assert.equal(fases.at(-1).descricao, '3 tick(s)');
});

test('passo: a lista de fases do medidor corresponde aos métodos chamados por run()', () => {
    const calls = [];
    const pipeline = new SimulationTickPipeline({ engine: { isRunning: true, lastTime: 0, velocidade: 1, elapsedTime: 0, notify() {} } });
    TICK_PHASES.filter(({ owner }) => owner === 'pipeline').forEach(({ method }) => {
        pipeline[method] = () => calls.push(method);
    });
    pipeline.engine.updatePipesVisual = () => calls.push('updatePipesVisual');

    pipeline.run(16);

    assert.deepEqual(calls, TICK_PHASES.map(({ method }) => method),
        'se o pipeline mudar de ordem ou ganhar fases, atualize TICK_PHASES em js/debug/TickProfiler.js');
});

test('passo: se a simulação estiver rodando, pausa via engine.stop()', () => {
    const { engine } = createPlant();
    const stepper = createTickStepper({ engine, logger: silentLogger });
    let stopCalls = 0;
    engine.isRunning = true;
    engine.stop = () => { stopCalls += 1; engine.isRunning = false; };

    stepper.step(1);
    assert.ok(stopCalls >= 1);
    assert.equal(engine.isRunning, false);
});

test('passo: ao terminar avisa a UI como o botão ⏸ (desliga a animação de fluxo)', () => {
    const { engine } = createPlant();
    const motorStates = [];
    engine.subscribe((event) => {
        if (event.tipo === 'estado_motor') motorStates.push(event.rodando);
    });

    createTickStepper({ engine, logger: silentLogger }).step(3);
    assert.deepEqual(motorStates, [false]);
});

test('passo: dt inválido usa o padrão em vez de corromper o relógio', () => {
    const { engine } = createPlant();
    const warnings = [];
    const stepper = createTickStepper({ engine, logger: { warn: (message) => warnings.push(message) } });

    const invalid = stepper.step(1, { dt: 'abc' });
    assert.ok(Math.abs(invalid.tempoSimuladoS - 1 / 60) < 1e-9);
    assert.ok(Number.isFinite(engine.lastTime));
    assert.equal(warnings.length, 1);

    stepper.step(1, { dt: Infinity });
    assert.ok(Number.isFinite(engine.lastTime), 'Infinity também é rejeitado');
    assert.equal(warnings.length, 2);

    const next = stepper.step(1, { dt: 0.05 });
    assert.ok(Math.abs(next.tempoSimuladoS - 0.05) < 1e-9, 'os passos seguintes continuam funcionando');
});

test('passo: medir() exige simulação rodando e restaura os métodos ao final', async () => {
    const { engine } = createPlant();
    let scheduled = null;
    const stepper = createTickStepper({ engine, logger: silentLogger, schedule: (fn) => { scheduled = fn; } });

    assert.deepEqual(await stepper.measure(1), []);

    engine.isRunning = true;
    const pending = stepper.measure(1);
    assert.ok(Object.hasOwn(engine.tickPipeline, 'run'), 'medidor instalado durante a medição');
    engine.tickPipeline.run(16);
    scheduled();
    const rows = await pending;

    assert.equal(rows.at(-1).descricao, '1 tick(s)');
    assert.equal(Object.hasOwn(engine.tickPipeline, 'run'), false);
    assert.equal(Object.hasOwn(engine, 'updatePipesVisual'), false);
});

test('passo: rastreador e medidor podem ser desligados em qualquer ordem', (t) => {
    const { engine } = createPlant();
    const originalNotify = Observable.prototype.notify;
    const tracer = createEventTracer({ engine, logger: silentLogger });
    t.after(() => {
        tracer.stop();
        Observable.prototype.notify = originalNotify;
    });

    tracer.start({ ignorar: [], incluirTick: true });
    const stepper = createTickStepper({ engine, logger: silentLogger });
    stepper.step(2);
    assert.ok(tracer.entries().some((entry) => entry.emTick && entry.tick === 2),
        'o rastreador continua contando ticks com o medidor por cima');

    tracer.stop();
    assert.equal(Observable.prototype.notify, originalNotify);
    assert.equal(Object.hasOwn(engine.tickPipeline, 'run'), false);
});

test('wrapMethod: desligar fora de ordem remove a camada certa e não deixa resíduo', () => {
    class Base { value() { return 'base'; } }
    const target = new Base();

    const restoreInner = wrapMethod(target, 'value', (prev) => function inner() { return `inner(${prev.call(this)})`; });
    const restoreOuter = wrapMethod(target, 'value', (prev) => function outer() { return `outer(${prev.call(this)})`; });
    assert.equal(target.value(), 'outer(inner(base))');

    assert.equal(restoreInner(), true);
    assert.equal(target.value(), 'outer(base)');
    assert.equal(restoreInner(), false, 'restaurar duas vezes não faz nada');
    assert.equal(restoreOuter(), true);
    assert.equal(target.value(), 'base');
    assert.equal(Object.hasOwn(target, 'value'), false, 'volta a usar o método do protótipo');
});

test('wrapMethod: ciclos repetidos de liga/desliga não empilham wrappers mortos', () => {
    const { engine } = createPlant();
    const originalNotify = Observable.prototype.notify;
    const tracer = createEventTracer({ engine, logger: silentLogger });
    const stepper = createTickStepper({ engine, logger: silentLogger });

    for (let cycle = 0; cycle < 5; cycle += 1) {
        tracer.start();
        const restoreExtra = wrapMethod(engine.tickPipeline, 'run', (prev) => function extra(...args) { return prev.apply(this, args); });
        stepper.step(1);
        tracer.stop();
        restoreExtra();
    }

    assert.equal(Observable.prototype.notify, originalNotify);
    assert.equal(Object.hasOwn(engine.tickPipeline, 'run'), false);
    assert.equal(Object.hasOwn(engine, 'updatePipesVisual'), false);
});

test('snapshot: detecta NaN e campos novos ou removidos', () => {
    const before = new Map([
        ['a\u0000x', { onde: 'a', campo: 'x', valor: 1 }],
        ['a\u0000y', { onde: 'a', campo: 'y', valor: 2 }]
    ]);
    const after = new Map([
        ['a\u0000x', { onde: 'a', campo: 'x', valor: Number.NaN }],
        ['a\u0000z', { onde: 'a', campo: 'z', valor: 'novo' }]
    ]);

    const rows = diffSnapshots(before, after);
    assert.deepEqual(rows.map((row) => row.campo), ['x', 'y', 'z']);
    assert.ok(Number.isNaN(rows[0].depois));
});

test('snapshot: foto genérica inclui estado dos componentes e das conexões', () => {
    const { engine } = createPlant();
    createTickStepper({ engine, logger: silentLogger }).step(1);

    const snapshot = snapshotState(engine);
    const fields = [...snapshot.values()].map(({ onde, campo }) => `${onde}.${campo}`);
    assert.ok(fields.includes('tank-01.volumeAtual'));
    assert.ok(fields.includes('inlet-01.estadoHidraulico.saidaVazaoLps'));
    assert.ok(fields.some((field) => /^conn-\d+\.flowLps$/.test(field)));
});

test('passo: eventos disparados pelo próprio passo não aparecem como ação do usuário no rastreio', (t) => {
    const { engine } = createPlant();
    const originalNotify = Observable.prototype.notify;
    const liveHeaders = [];
    const stepper = createTickStepper({ engine, logger: silentLogger });
    const tracer = createEventTracer({
        engine,
        logger: { groupCollapsed: (line) => liveHeaders.push(line), log: () => {}, trace: () => {}, groupEnd: () => {} },
        isInsideStep: () => stepper.stepping
    });
    t.after(() => {
        tracer.stop();
        Observable.prototype.notify = originalNotify;
    });

    tracer.start();
    for (let i = 0; i < 5; i += 1) stepper.step(1);

    assert.deepEqual(liveHeaders, [], 'nada do passo é impresso ao vivo');
    assert.equal(stepper.stepping, false);
    const motor = tracer.summary().find((row) => row.tipo === 'estado_motor');
    assert.equal(motor.qtd, 5);
    assert.equal(motor.emTick, 5, 'o stop() do fim do passo conta como parte do passo');
});
