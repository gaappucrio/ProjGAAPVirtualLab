import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { SistemaSimulacao } from '../js/application/engine/SimulationEngine.js';
import { DrenoLogico } from '../js/domain/components/DrenoLogico.js';
import { FonteLogica } from '../js/domain/components/FonteLogica.js';
import { TanqueLogico } from '../js/domain/components/TanqueLogico.js';
import { TrocadorCalorLogico } from '../js/domain/components/TrocadorCalorLogico.js';
import { ValvulaLogica } from '../js/domain/components/ValvulaLogica.js';
import { ConnectionModel } from '../js/domain/models/ConnectionModel.js';
import { restoreFlowchartDocument } from '../js/presentation/flowchart/FlowchartPersistence.js';
import { checkInvariants, createInvariantMonitor, solverHitsDuringTick } from '../js/debug/InvariantChecker.js';
import { createTickStepper } from '../js/debug/TickStepper.js';

const silentLogger = {};
const PLANTAS_TESTE_DIR = path.resolve('Testes/plantas teste');

function createEngine() {
    const engine = new SistemaSimulacao();
    engine.usarAlturaRelativa = false;
    return engine;
}

function connect(engine, source, target) {
    source.conectarSaida(target);
    return engine.addConnection(new ConnectionModel({ sourceId: source.id, targetId: target.id }));
}

function createValveLine() {
    const engine = createEngine();
    const fonte = new FonteLogica('F-01', 'inlet-01', 0, 0);
    const valvula = new ValvulaLogica('V-01', 'valve-01', 160, 0);
    const dreno = new DrenoLogico('D-01', 'outlet-01', 320, 0);
    fonte.pressaoFonteBar = 2;
    fonte.vazaoMaxima = 40;
    [fonte, valvula, dreno].forEach((component) => engine.add(component));
    const entrada = connect(engine, fonte, valvula);
    const saida = connect(engine, valvula, dreno);
    valvula.setAbertura(100);
    return { engine, fonte, valvula, dreno, entrada, saida };
}

function rulesOf(violations) {
    return violations.map((violation) => `${violation.regra}@${violation.onde}`);
}

['teste planta.json', 'teste_trocatroca.json'].forEach((fileName) => {
    test(`checagens: planta de teste "${fileName}" roda 600 ticks sem violações`, () => {
        const engine = createEngine();
        const raw = fs.readFileSync(path.join(PLANTAS_TESTE_DIR, fileName), 'utf8');
        assert.equal(restoreFlowchartDocument(engine, raw).restored, true);

        const monitor = createInvariantMonitor({ engine, logger: silentLogger });
        monitor.start();
        createTickStepper({ engine, logger: silentLogger }).step(600);
        monitor.stop();

        assert.deepEqual(monitor.report(), []);
    });
});

test('checagens: linha simples resolvida não gera violação', () => {
    const { engine, saida } = createValveLine();
    createTickStepper({ engine, logger: silentLogger }).step(60);
    assert.ok(engine.connectionStateStore.get(saida).flowLps > 0, 'a válvula aberta deve deixar passar vazão');
    assert.deepEqual(checkInvariants(engine), []);
});

test('checagens: detecta NaN, vazão negativa e pressão abaixo do vácuo', () => {
    const { engine, entrada, saida, valvula } = createValveLine();
    createTickStepper({ engine, logger: silentLogger }).step(5);

    valvula.pressaoSaidaAtualBar = Number.NaN;
    engine.connectionStateStore.get(entrada).pipeOutletPressureBar = -2;
    const saidaState = engine.connectionStateStore.get(saida);
    saidaState.flowLps = -saidaState.flowLps;

    const rules = rulesOf(checkInvariants(engine));
    assert.ok(rules.includes('NAO_FINITO@valve-01'));
    assert.ok(rules.includes(`PRESSAO_ABAIXO_VACUO@${entrada.id}`));
    assert.ok(rules.includes(`VAZAO_NEGATIVA@${saida.id}`));
});

test('checagens: detecta desbalanço de massa em componente passante', () => {
    const { engine, saida } = createValveLine();
    createTickStepper({ engine, logger: silentLogger }).step(30);

    engine.connectionStateStore.get(saida).flowLps *= 0.5;

    const violations = checkInvariants(engine);
    assert.deepEqual(rulesOf(violations), ['BALANCO_PASSANTE@valve-01']);
    assert.match(violations[0].detalhe, /entra .* × sai .* L\/s/);
});

test('checagens: detecta tanque inconsistente com conexões e volume fora dos limites', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-01', 'inlet-01', 0, 0);
    const tanque = new TanqueLogico('T-01', 'tank-01', 160, 0);
    fonte.pressaoFonteBar = 2;
    fonte.vazaoMaxima = 40;
    [fonte, tanque].forEach((component) => engine.add(component));
    connect(engine, fonte, tanque);
    createTickStepper({ engine, logger: silentLogger }).step(30);
    assert.deepEqual(checkInvariants(engine), []);

    tanque.lastQin += 5;
    tanque.volumeAtual = tanque.capacidadeMaxima + 1;

    const rules = rulesOf(checkInvariants(engine));
    assert.ok(rules.includes('BALANCO_TANQUE@tank-01'));
    assert.ok(rules.includes('VOLUME_FORA_LIMITES@tank-01'));
});

test('checagens: detecta trocador violando a 2ª lei', () => {
    const engine = createEngine();
    const trocador = new TrocadorCalorLogico('TC-01', 'hx-01', 0, 0);
    engine.add(trocador);
    trocador.vazao1Lps = 1;
    trocador.temperaturaEntradaC = 20;
    trocador.temperaturaServicoC = 80;
    trocador.temperaturaSaidaC = 50;
    assert.deepEqual(checkInvariants(engine), []);

    trocador.temperaturaSaidaC = 85;
    assert.deepEqual(rulesOf(checkInvariants(engine)), ['TEMPERATURA_TROCADOR@hx-01']);
});

test('checagens: contagem do solver trata métricas por tick (ilhas) e acumuladas (rede única)', () => {
    assert.equal(solverHitsDuringTick({ scoped: false, mode: 'push', hits: 3 }, { scoped: false, mode: 'push', hits: 5 }), 2);
    assert.equal(solverHitsDuringTick({ scoped: false, mode: 'push', hits: 3 }, { scoped: false, mode: 'push', hits: 3 }), 0);
    assert.equal(solverHitsDuringTick({ scoped: true, mode: 'mixed', hits: 1 }, { scoped: true, mode: 'mixed', hits: 1 }), 1);
    assert.equal(solverHitsDuringTick({ scoped: true, mode: 'mixed', hits: 0 }, { scoped: false, mode: 'push', hits: 9 }), 0);
    assert.equal(solverHitsDuringTick({ scoped: false, mode: 'push', hits: 2 }, { scoped: false, mode: 'nodal', hits: 7 }), 0);
});

test('checagens: monitor agrupa repetições e avisa só na primeira ocorrência', () => {
    const { engine, valvula } = createValveLine();
    const warnings = [];
    const monitor = createInvariantMonitor({ engine, logger: { warn: (message) => warnings.push(message) } });
    const stepper = createTickStepper({ engine, logger: silentLogger });

    monitor.start();
    stepper.step(5);
    const originalSync = valvula.sincronizarMetricasFisicas.bind(valvula);
    valvula.sincronizarMetricasFisicas = (...args) => {
        originalSync(...args);
        valvula.pressaoSaidaAtualBar = Number.NaN;
    };
    stepper.step(10);
    monitor.stop();

    const [row] = monitor.report();
    assert.equal(row.regra, 'NAO_FINITO');
    assert.equal(row.onde, 'valve-01');
    assert.equal(row.vezes, 10);
    assert.equal(row.primeiroTick, 6);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /valve-01 · pressaoSaidaAtualBar = NaN · tick 6/);
});

test('checagens: pausarNoErro interrompe passo(n) no tick da violação', () => {
    const { engine, valvula } = createValveLine();
    const monitor = createInvariantMonitor({ engine, logger: silentLogger });
    const stepper = createTickStepper({ engine, logger: silentLogger, shouldHalt: () => monitor.consumeHalt() });

    let ticks = 0;
    const originalSync = valvula.sincronizarMetricasFisicas.bind(valvula);
    valvula.sincronizarMetricasFisicas = (...args) => {
        originalSync(...args);
        ticks += 1;
        if (ticks >= 7) valvula.pressaoSaidaAtualBar = Number.NaN;
    };

    monitor.start({ pausarNoErro: true });
    const result = stepper.step(100);
    monitor.stop();

    assert.equal(result.interrompido, true);
    assert.equal(result.ticks, 7);
    assert.equal(engine.isRunning, false);
});
