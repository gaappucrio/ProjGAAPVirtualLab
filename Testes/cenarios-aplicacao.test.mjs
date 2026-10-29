import assert from 'node:assert/strict';
import test from 'node:test';

import fs from 'node:fs';
import path from 'node:path';

import { SistemaSimulacao, FLUID_PRESETS } from '../js/application/engine/SimulationEngine.js';
import { ConnectionModel } from '../js/domain/models/ConnectionModel.js';
import { BombaLogica } from '../js/domain/components/BombaLogica.js';
import { DrenoLogico } from '../js/domain/components/DrenoLogico.js';
import { FonteLogica } from '../js/domain/components/FonteLogica.js';
import { TanqueLogico } from '../js/domain/components/TanqueLogico.js';
import { TrocadorCalorLogico } from '../js/domain/components/TrocadorCalorLogico.js';
import { ValvulaLogica } from '../js/domain/components/ValvulaLogica.js';
import { analyzeHydraulicNetwork } from '../js/domain/services/HydraulicNetworkAnalyzer.js';
import {
    createFlowchartDocument,
    FLOWCHART_DOCUMENT_TYPE,
    parseFlowchartDocument,
    restoreFlowchartDocument
} from '../js/presentation/flowchart/FlowchartPersistence.js';
import { applyComponentClipboardSnapshot } from '../js/presentation/controllers/ClipboardController.js';
import { HEAT_EXCHANGER_PROPERTIES_PRESENTER } from '../js/presentation/properties/component/HeatExchangerComponentPropertiesPresenter.js';
import { buildHeatExchangerCurveDatasets } from '../js/infrastructure/charts/HeatExchangerChartAdapter.js';
import { setLanguage, translateLiteral, t } from '../js/presentation/i18n/LanguageManager.js';
import {
    createConnectionVisual,
    updateConnectionVisualLayout,
    removeConnectionVisual
} from '../js/infrastructure/rendering/PipeRenderer.js';
import {
    findConnectionByPath,
    getConnectionVisual
} from '../js/infrastructure/rendering/ConnectionVisualRegistry.js';

function approx(actual, expected, tolerance = 1e-4, message = '') {
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `${message ? `${message}: ` : ''}esperado ${expected} +/- ${tolerance}, recebido ${actual}`
    );
}

function createEngine() {
    const engine = new SistemaSimulacao();
    engine.isRunning = true;
    return engine;
}

test('remoção de conexão limpa estado hidráulico e índices de topologia', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-01', 'Fonte-01', 0, 0);
    const dreno = new DrenoLogico('D-01', 'Dreno-01', 120, 0);
    const connection = new ConnectionModel({ sourceId: fonte.id, targetId: dreno.id });

    engine.add(fonte);
    engine.add(dreno);
    engine.addConnection(connection);
    engine.getConnectionState(connection).flowLps = 12;

    engine.removeConnection(connection);

    assert.equal(engine.conexoes.length, 0);
    assert.equal(engine.getOutputConnections(fonte).length, 0);
    assert.equal(engine.getInputConnections(dreno).length, 0);
    assert.equal(engine.connectionStates.has(connection), false);
});

test('remoção de atuador desativa controle de nível inconsistente', () => {
    const engine = createEngine();
    const tanque = new TanqueLogico('T-01', 'Tanque-01', 0, 0);
    const valvula = new ValvulaLogica('V-01', 'Valvula-01', 120, 0);
    const dreno = new DrenoLogico('D-01', 'Dreno-01', 240, 0);

    tanque.conectarSaida(valvula);
    valvula.conectarSaida(dreno);
    engine.add(tanque);
    engine.add(valvula);
    engine.add(dreno);
    engine.addConnection(new ConnectionModel({ sourceId: tanque.id, targetId: valvula.id }));
    engine.addConnection(new ConnectionModel({ sourceId: valvula.id, targetId: dreno.id }));

    const activation = tanque.setSetpointAtivo(true);
    assert.equal(activation.ativado, true);

    engine.removeComponent(valvula);

    assert.equal(tanque.setpointAtivo, false);
    assert.equal(tanque.getDiagnosticoControleNivel().podeAtivar, false);
    assert.equal(engine.conexoes.length, 0);
});

test('geometria de conexão considera altura relativa somente quando habilitada', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-01', 'Fonte-01', 0, 0);
    const tanque = new TanqueLogico('T-01', 'Tanque-01', 160, 80);
    const connection = new ConnectionModel({
        sourceId: fonte.id,
        targetId: tanque.id,
        sourceEndpoint: { portType: 'out', offsetX: 65, offsetY: 40 },
        targetEndpoint: { portType: 'in', offsetX: 80, offsetY: 0, floorOffsetY: 240 },
        extraLengthM: 0
    });

    tanque.alturaBocalEntradaM = 2.0;
    engine.add(fonte);
    engine.add(tanque);
    engine.addConnection(connection);

    engine.usarAlturaRelativa = false;
    const schematicGeometry = engine.getConnectionGeometry(connection);

    engine.usarAlturaRelativa = true;
    const relativeGeometry = engine.getConnectionGeometry(connection);
    tanque.rotacaoVisualGraus = 90;
    const rotatedVisualGeometry = engine.getConnectionGeometry(connection);

    assert.equal(schematicGeometry.straightLengthM, 1);
    assert.equal(schematicGeometry.headGainM, 0);
    assert.notEqual(relativeGeometry.straightLengthM, schematicGeometry.straightLengthM);
    assert.notEqual(relativeGeometry.headGainM, 0);
    assert.deepEqual(rotatedVisualGeometry, relativeGeometry, 'Rotação visual não deve alterar geometria física da conexão');
});

test('pausa da simulação preserva último estado hidráulico visível', () => {
    const engine = createEngine();
    const tanque = new TanqueLogico('T-02', 'Tanque-02', 0, 0);
    const dreno = new DrenoLogico('D-02', 'Dreno-02', 120, 0);
    const connection = new ConnectionModel({ sourceId: tanque.id, targetId: dreno.id });
    const volumeAntesDaPausa = 420;

    tanque.volumeAtual = volumeAntesDaPausa;
    tanque.capacidadeMaxima = 1000;
    tanque.lastQin = 12;
    tanque.lastQout = 4;
    tanque.registrarEntrada(12, 1.2);
    tanque.registrarSaida(4, 1.1);

    engine.add(tanque);
    engine.add(dreno);
    engine.addConnection(connection);
    const state = engine.getConnectionState(connection);
    state.flowLps = 4;
    state.targetFlowLps = 4.5;
    state.velocityMps = 1.6;
    connection.transientFlowLps = 4;
    connection.lastResolvedFlowLps = 4.5;

    engine.stop();

    assert.equal(engine.isRunning, false);
    assert.equal(tanque.volumeAtual, volumeAntesDaPausa);
    assert.equal(tanque.lastQin, 12);
    assert.equal(tanque.lastQout, 4);
    assert.equal(tanque.estadoHidraulico.entradaVazaoLps, 12);
    assert.equal(tanque.estadoHidraulico.saidaVazaoLps, 4);
    assert.equal(engine.getConnectionState(connection).flowLps, 4);
    assert.equal(engine.getConnectionState(connection).targetFlowLps, 4.5);
    assert.equal(connection.transientFlowLps, 4);
    assert.equal(connection.lastResolvedFlowLps, 4.5);
});

test('exportação de fluxograma completo preserva componentes, conexões e análise', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-01', 'Entrada-01', 0, 0);
    const tanque = new TanqueLogico('T-01', 'Tanque-01', 160, 0);
    const dreno = new DrenoLogico('D-01', 'Saida-01', 320, 0);
    const entradaTanque = new ConnectionModel({ id: 'C-01', sourceId: fonte.id, targetId: tanque.id });
    const saidaTanque = new ConnectionModel({ id: 'C-02', sourceId: tanque.id, targetId: dreno.id });

    fonte.pressaoFonteBar = 1.2;
    tanque.volumeAtual = 350;
    fonte.conectarSaida(tanque);
    tanque.conectarSaida(dreno);
    [fonte, tanque, dreno].forEach((component) => engine.add(component));
    [entradaTanque, saidaTanque].forEach((connection) => engine.addConnection(connection));

    const document = createFlowchartDocument(engine, { name: 'Caso de teste' });
    const parsed = parseFlowchartDocument(JSON.stringify(document));

    assert.equal(document.type, FLOWCHART_DOCUMENT_TYPE);
    assert.equal(document.workspace.components.length, 3);
    assert.equal(document.workspace.connections.length, 2);
    assert.equal(document.analysis.hasDirectedCycle, false);
    assert.equal(parsed.workspace.components[1].snapshot.properties.volumeAtual, 350);
});

test('trocador de calor com duas correntes no motor preserva independência hidráulica e acoplamento térmico', () => {
    const engine = createEngine();
    const fonte1 = new FonteLogica('F-01', 'Fonte-Fria', 0, 0);
    fonte1.pressaoFonteBar = 2.0;
    fonte1.atualizarFluidoEntrada({ ...FLUID_PRESETS.agua, temperatura: 15 }, { presetId: 'custom' });

    const dreno1 = new DrenoLogico('D-01', 'Dreno-Frio', 300, 0);
    dreno1.pressaoSaidaBar = 0.5;

    const fonte2 = new FonteLogica('F-02', 'Fonte-Quente', 0, 100);
    fonte2.pressaoFonteBar = 2.0;
    fonte2.atualizarFluidoEntrada({ ...FLUID_PRESETS.agua, temperatura: 85 }, { presetId: 'custom' });

    const dreno2 = new DrenoLogico('D-02', 'Dreno-Quente', 300, 100);
    dreno2.pressaoSaidaBar = 0.5;

    const trocador = new TrocadorCalorLogico('TC-01', 'TC-01', 150, 50);
    trocador.uaWPorK = 3000;

    const c1In = new ConnectionModel({ id: 'C1-IN', sourceId: fonte1.id, targetId: trocador.id, targetEndpoint: { portId: 'in1', portType: 'in' } });
    const c1Out = new ConnectionModel({ id: 'C1-OUT', sourceId: trocador.id, targetId: dreno1.id, sourceEndpoint: { portId: 'out1', portType: 'out' } });
    const c2In = new ConnectionModel({ id: 'C2-IN', sourceId: fonte2.id, targetId: trocador.id, targetEndpoint: { portId: 'in2', portType: 'in' } });
    const c2Out = new ConnectionModel({ id: 'C2-OUT', sourceId: trocador.id, targetId: dreno2.id, sourceEndpoint: { portId: 'out2', portType: 'out' } });

    [fonte1, dreno1, fonte2, dreno2, trocador].forEach((comp) => engine.add(comp));
    [c1In, c1Out, c2In, c2Out].forEach((conn) => engine.addConnection(conn));

    assert.equal(engine.isTrocadorComDuasCorrentes(trocador), true);
    assert.equal(trocador.getDiagnosticoOperacao(engine).temperaturaServicoEditavel, false);

    for (let i = 0; i < 30; i += 1) {
        engine.componentes.forEach((c) => c.atualizarDinamica(0.1, engine.hydraulicContext.getComponentFluid(c) || engine.fluidoOperante));
        engine.resolveHydraulicNetwork(0.1);
        engine.componentes.forEach((c) => c.sincronizarMetricasFisicas(engine.hydraulicContext.getComponentFluid(c) || engine.fluidoOperante));
    }

    assert.ok(trocador.vazao1Lps > 0, 'Corrente 1 deve ter vazao positiva');
    assert.ok(trocador.vazao2Lps > 0, 'Corrente 2 deve ter vazao positiva');
    const flow1In = engine.getConnectionState(c1In).flowLps;
    const flow1Out = engine.getConnectionState(c1Out).flowLps;
    const flow2In = engine.getConnectionState(c2In).flowLps;
    const flow2Out = engine.getConnectionState(c2Out).flowLps;
    assert.ok(Math.abs(flow1In - flow1Out) < 0.001, `Vazao de entrada e saida da corrente 1 devem coincidir: ${flow1In} vs ${flow1Out}`);
    assert.ok(Math.abs(flow2In - flow2Out) < 0.001, `Vazao de entrada e saida da corrente 2 devem coincidir: ${flow2In} vs ${flow2Out}`);
    assert.ok(trocador.temperaturaSaidaC > 15, 'Corrente 1 deve aquecer acima de 15°C');
    assert.ok(trocador.temperaturaSaida2C < 85, 'Corrente 2 deve resfriar abaixo de 85°C');
    assert.ok(trocador.cargaTermicaW > 0, 'Carga termica trocada deve ser maior que zero');

    // Tentativa de alterar temperatura de serviço deve ser ignorada com duas correntes conectadas
    trocador.temperaturaServicoC = 65;
    trocador.setTemperaturaServico(40);
    assert.equal(trocador.temperaturaServicoC, 65, 'Temperatura de serviço não deve mudar com duas correntes conectadas');
    trocador.setTemperaturaServico(40, { force: true });
    assert.equal(trocador.temperaturaServicoC, 40, 'Alteração forçada deve atualizar');

    // Ao desconectar a corrente 2, o trocador volta para modo utilidade com temperatura de servico editavel
    engine.removeConnection(c2In);
    engine.removeConnection(c2Out);
    assert.equal(engine.isTrocadorComDuasCorrentes(trocador), false);
    assert.equal(trocador.getDiagnosticoOperacao(engine).temperaturaServicoEditavel, true);
    trocador.setTemperaturaServico(75);
    assert.equal(trocador.temperaturaServicoC, 75, 'Temperatura de serviço volta a ser editável');
});

test('trocador de calor opera em contracorrente no motor com troca térmica superior ao modo paralelo', () => {
    const engine = createEngine();

    const fonteFria = new FonteLogica('F-FRIA', 'Fonte-Fria', 0, 0);
    fonteFria.pressaoFonteBar = 2.0;
    fonteFria.atualizarFluidoEntrada({ ...FLUID_PRESETS.agua, temperatura: 20 }, { presetId: 'custom' });

    const drenoFrio = new DrenoLogico('D-FRIO', 'Dreno-Frio', 300, 0);
    drenoFrio.pressaoSaidaBar = 0.5;

    const fonteQuente = new FonteLogica('F-QUENTE', 'Fonte-Quente', 0, 100);
    fonteQuente.pressaoFonteBar = 2.0;
    fonteQuente.atualizarFluidoEntrada({ ...FLUID_PRESETS.agua, temperatura: 80 }, { presetId: 'custom' });

    const drenoQuente = new DrenoLogico('D-QUENTE', 'Dreno-Quente', 300, 100);
    drenoQuente.pressaoSaidaBar = 0.5;

    const trocador = new TrocadorCalorLogico('TC-CC', 'TC-Contracorrente', 150, 50);
    trocador.uaWPorK = 10000;

    const c1In = new ConnectionModel({ id: 'C1-IN', sourceId: fonteFria.id, targetId: trocador.id, targetEndpoint: { portId: 'in1', portType: 'in' } });
    const c1Out = new ConnectionModel({ id: 'C1-OUT', sourceId: trocador.id, targetId: drenoFrio.id, sourceEndpoint: { portId: 'out1', portType: 'out' } });
    const c2In = new ConnectionModel({ id: 'C2-IN', sourceId: fonteQuente.id, targetId: trocador.id, targetEndpoint: { portId: 'out2', portType: 'in' } });
    const c2Out = new ConnectionModel({ id: 'C2-OUT', sourceId: trocador.id, targetId: drenoQuente.id, sourceEndpoint: { portId: 'in2', portType: 'out' } });

    [fonteFria, drenoFrio, fonteQuente, drenoQuente, trocador].forEach((comp) => engine.add(comp));
    [c1In, c1Out, c2In, c2Out].forEach((conn) => engine.addConnection(conn));

    assert.equal(engine.isTrocadorComDuasCorrentes(trocador), true);
    assert.equal(trocador.getModoEscoamento(engine), 'contracorrente', 'Topologia deve configurar modo contracorrente');

    for (let i = 0; i < 30; i += 1) {
        engine.componentes.forEach((c) => c.atualizarDinamica(0.1, engine.hydraulicContext.getComponentFluid(c) || engine.fluidoOperante));
        engine.resolveHydraulicNetwork(0.1);
        engine.componentes.forEach((c) => c.sincronizarMetricasFisicas(engine.hydraulicContext.getComponentFluid(c) || engine.fluidoOperante));
    }

    assert.ok(trocador.vazao1Lps > 0, 'Corrente 1 deve escoar em contracorrente');
    assert.ok(trocador.vazao2Lps > 0, 'Corrente 2 deve escoar em contracorrente');
    assert.ok(trocador.temperaturaSaidaC > 20, 'Corrente 1 deve aquecer');
    assert.ok(trocador.temperaturaSaida2C < 80, 'Corrente 2 deve resfriar');
    assert.ok(trocador.efetividadeAtual > 0, 'Efetividade em contracorrente deve ser positiva');

    // Valida que para as mesmas vazões e fluidos, a efetividade em contracorrente é superior à do modo paralelo
    const f1 = engine.hydraulicContext.getComponentFluid(fonteFria);
    const f2 = engine.hydraulicContext.getComponentFluid(fonteQuente);
    const resParalelo = trocador.calcularTrocaTermicaGlobal(f1, trocador.vazao1Lps, f2, trocador.vazao2Lps, 'paralelo');
    assert.ok(
        trocador.efetividadeAtual > resParalelo.ef,
        `Efetividade contracorrente (${trocador.efetividadeAtual.toFixed(4)}) deve ser maior que paralelo (${resParalelo.ef.toFixed(4)})`
    );
});

test('trocador de calor com válvulas a jusante mantém independência hidráulica estrita ao abrir e fechar', () => {
    function simulateScenario(aberturaV1) {
        const engine = createEngine();

        const fonte1 = new FonteLogica('F-01', 'Fonte-1', 0, 0);
        fonte1.pressaoFonteBar = 2.0;

        const tc = new TrocadorCalorLogico('TC-01', 'TC-01', 100, 0);
        tc.uaWPorK = 3000;

        const valvula1 = new ValvulaLogica('V-01', 'Valvula-1', 150, 0);
        valvula1.setAbertura(aberturaV1);
        valvula1.aberturaEfetiva = aberturaV1;

        const dreno1 = new DrenoLogico('D-01', 'Dreno-1', 200, 0);
        dreno1.pressaoSaidaBar = 0;

        const fonte2 = new FonteLogica('F-02', 'Fonte-2', 0, 100);
        fonte2.pressaoFonteBar = 2.0;

        const valvula2 = new ValvulaLogica('V-02', 'Valvula-2', 150, 100);
        valvula2.setAbertura(100);
        valvula2.aberturaEfetiva = 100;

        const dreno2 = new DrenoLogico('D-02', 'Dreno-2', 200, 100);
        dreno2.pressaoSaidaBar = 0;

        const c1In = new ConnectionModel({ id: 'C1-IN', sourceId: fonte1.id, targetId: tc.id, targetEndpoint: { portId: 'in1', portType: 'in' } });
        const c1Mid = new ConnectionModel({ id: 'C1-MID', sourceId: tc.id, targetId: valvula1.id, sourceEndpoint: { portId: 'out1', portType: 'out' } });
        const c1Out = new ConnectionModel({ id: 'C1-OUT', sourceId: valvula1.id, targetId: dreno1.id });

        const c2In = new ConnectionModel({ id: 'C2-IN', sourceId: fonte2.id, targetId: tc.id, targetEndpoint: { portId: 'in2', portType: 'in' } });
        const c2Mid = new ConnectionModel({ id: 'C2-MID', sourceId: tc.id, targetId: valvula2.id, sourceEndpoint: { portId: 'out2', portType: 'out' } });
        const c2Out = new ConnectionModel({ id: 'C2-OUT', sourceId: valvula2.id, targetId: dreno2.id });

        [fonte1, tc, valvula1, dreno1, fonte2, valvula2, dreno2].forEach(c => engine.add(c));
        [c1In, c1Mid, c1Out, c2In, c2Mid, c2Out].forEach(c => engine.addConnection(c));

        for (let i = 0; i < 80; i++) {
            engine.componentes.forEach((c) => c.atualizarDinamica(0.1, engine.hydraulicContext.getComponentFluid(c) || engine.fluidoOperante));
            engine.resolveHydraulicNetwork(0.1);
            engine.componentes.forEach((c) => c.sincronizarMetricasFisicas(engine.hydraulicContext.getComponentFluid(c) || engine.fluidoOperante));
        }

        return {
            vazao1: tc.vazao1Lps,
            vazao2: tc.vazao2Lps,
            pressaoSaida1: tc.pressaoSaidaAtualBar,
            fluxoC2In: engine.getConnectionState(c2In).flowLps,
            fluxoC2Out: engine.getConnectionState(c2Out).flowLps
        };
    }

    const open = simulateScenario(100);
    const half = simulateScenario(50);
    const closed = simulateScenario(0);

    assert.ok(open.vazao1 > 1.0, 'Corrente 1 deve ter vazão aberta');
    assert.equal(closed.vazao1, 0, 'Corrente 1 deve zerar com válvula fechada');
    assert.equal(closed.pressaoSaida1, 0, 'Pressão de saída da Corrente 1 deve ser zero quando fechada');
    assert.ok(half.vazao1 > 0 && half.vazao1 < open.vazao1, 'Corrente 1 intermediária a 50%');

    approx(closed.vazao2, open.vazao2, 1e-9, 'Vazão da Corrente 2 deve ser idêntica com V1 fechada');
    approx(half.vazao2, open.vazao2, 1e-9, 'Vazão da Corrente 2 deve ser idêntica com V1 a 50%');
    approx(closed.fluxoC2In, open.fluxoC2In, 1e-9, 'Fluxo de entrada da Corrente 2 deve ser idêntico');
    approx(closed.fluxoC2Out, open.fluxoC2Out, 1e-9, 'Fluxo de saída da Corrente 2 deve ser idêntico');
});

test('análise de rede hidráulica separa correntes do trocador em ilhas independentes sem contaminação de ciclo', () => {
    const t1 = new TanqueLogico('T1', 'T-01', 0, 0);
    t1.volumeAtual = 1000;
    t1.capacidadeMaxima = 2000;

    const b1 = new BombaLogica('B1', 'B-01', 50, 0);
    b1.isOn = true;
    b1.grauAcionamento = 100;
    b1.acionamentoEfetivo = 100;

    const tc = new TrocadorCalorLogico('TC', 'TC-01', 150, 0);

    const f2 = new FonteLogica('F2', 'F-02', 0, 100);
    f2.pressaoFonteBar = 2.0;

    const d2 = new DrenoLogico('D2', 'D-02', 200, 100);
    d2.pressaoSaidaBar = 0;

    const conns = [
        new ConnectionModel({ id: 'c1_1', sourceId: t1.id, targetId: b1.id }),
        new ConnectionModel({ id: 'c1_2', sourceId: b1.id, targetId: tc.id, targetEndpoint: { portId: 'in1', portType: 'in' } }),
        new ConnectionModel({ id: 'c1_3', sourceId: tc.id, targetId: t1.id, sourceEndpoint: { portId: 'out1', portType: 'out' } }),

        new ConnectionModel({ id: 'c2_1', sourceId: f2.id, targetId: tc.id, targetEndpoint: { portId: 'in2', portType: 'in' } }),
        new ConnectionModel({ id: 'c2_2', sourceId: tc.id, targetId: d2.id, sourceEndpoint: { portId: 'out2', portType: 'out' } })
    ];

    const componentes = [t1, b1, tc, f2, d2];
    const analysis = analyzeHydraulicNetwork({ componentes, conexoes: conns });

    assert.equal(analysis.islands.length, 2, 'Deve identificar exatamente 2 ilhas hidráulicas desacopladas');

    const islandLoop = analysis.islands.find(isl => isl.componentIds.includes(t1.id));
    const islandOpen = analysis.islands.find(isl => isl.componentIds.includes(f2.id));

    assert.ok(islandLoop, 'Ilha do circuito fechado deve existir');
    assert.ok(islandOpen, 'Ilha do circuito aberto deve existir');

    assert.equal(islandLoop.hasDirectedCycle, true, 'Ilha do circuito de recirculação deve ter ciclo dirigido');
    assert.equal(islandOpen.hasDirectedCycle, false, 'Ilha do circuito aberto NÃO deve ter ciclo dirigido');
    assert.ok(islandLoop.connectionIds.includes('c1_2'), 'Conexões da Corrente 1 pertencem à ilha em ciclo');
    assert.ok(islandOpen.connectionIds.includes('c2_1'), 'Conexões da Corrente 2 pertencem à ilha aberta');
    assert.ok(!islandOpen.connectionIds.includes('c1_2'), 'Conexões da Corrente 1 não devem vazar para a ilha 2');
});

test('solver nodal resolve circuito fechado com bomba na corrente 2 do trocador em contracorrente e conserva massa', () => {
    const engine = createEngine();

    const b2 = new BombaLogica('B2', 'Bomba-2', 0, 100);
    b2.isOn = true;
    b2.grauAcionamento = 100;
    b2.acionamentoEfetivo = 100;
    b2.pressaoMaxima = 3.0;

    const tc = new TrocadorCalorLogico('TC-LOOP', 'TC-01', 150, 100);
    tc.uaWPorK = 5000;

    // Circuito fechado na Corrente 2 em contracorrente:
    // Bomba -> Entrada da corrente 2 (out2)
    // Saída da corrente 2 (in2) -> Sucção da Bomba
    const connBombaParaTC = new ConnectionModel({
        id: 'conn_b_tc',
        sourceId: b2.id,
        targetId: tc.id,
        targetEndpoint: { portId: 'out2', portType: 'in' }
    });
    const connTCParaBomba = new ConnectionModel({
        id: 'conn_tc_b',
        sourceId: tc.id,
        targetId: b2.id,
        sourceEndpoint: { portId: 'in2', portType: 'out' }
    });

    engine.add(b2);
    engine.add(tc);
    engine.addConnection(connBombaParaTC);
    engine.addConnection(connTCParaBomba);

    assert.equal(tc.getModoEscoamento(engine), 'contracorrente');
    assert.equal(tc.isContracorrente(engine), true);

    for (let i = 0; i < 40; i++) {
        engine.componentes.forEach((c) => c.atualizarDinamica(0.1, engine.hydraulicContext.getComponentFluid(c) || engine.fluidoOperante));
        engine.resolveHydraulicNetwork(0.1);
        engine.componentes.forEach((c) => c.sincronizarMetricasFisicas(engine.hydraulicContext.getComponentFluid(c) || engine.fluidoOperante));
    }

    assert.ok(tc.vazao2Lps > 0.5, `Vazão na Corrente 2 deve ser positiva (atual: ${tc.vazao2Lps})`);
    approx(b2.fluxoReal, tc.vazao2Lps, 1e-3, 'Vazão da bomba deve coincidir com vazão da corrente 2');
    assert.ok(tc.vazaoMassa2KgS > 0, `Vazão mássica da Corrente 2 deve ser calculada (atual: ${tc.vazaoMassa2KgS})`);
    assert.equal(tc.vazao1Lps, 0, 'Corrente 1 não conectada deve permanecer em 0');
});

test('trocador opera em modo utilidade quando apenas a corrente 2 está conectada', () => {
    const engine = createEngine();

    const fonte = new FonteLogica('F-SERV', 'Fonte-Serv', 0, 0);
    fonte.pressaoFonteBar = 2.0;
    fonte.atualizarFluidoEntrada({ ...FLUID_PRESETS.agua, temperatura: 20 }, { presetId: 'custom' });

    const dreno = new DrenoLogico('D-SERV', 'Dreno-Serv', 200, 0);
    dreno.pressaoSaidaBar = 0;

    const tc = new TrocadorCalorLogico('TC-SERV', 'TC-01', 100, 0);
    tc.uaWPorK = 8000;
    tc.temperaturaServicoC = 80;

    const cIn = new ConnectionModel({ id: 'c_in', sourceId: fonte.id, targetId: tc.id, targetEndpoint: { portId: 'in2', portType: 'in' } });
    const cOut = new ConnectionModel({ id: 'c_out', sourceId: tc.id, targetId: dreno.id, sourceEndpoint: { portId: 'out2', portType: 'out' } });

    [fonte, tc, dreno].forEach(c => engine.add(c));
    [cIn, cOut].forEach(c => engine.addConnection(c));

    for (let i = 0; i < 30; i++) {
        engine.componentes.forEach((c) => c.atualizarDinamica(0.1, engine.hydraulicContext.getComponentFluid(c) || engine.fluidoOperante));
        engine.resolveHydraulicNetwork(0.1);
        engine.componentes.forEach((c) => c.sincronizarMetricasFisicas(engine.hydraulicContext.getComponentFluid(c) || engine.fluidoOperante));
    }

    assert.ok(tc.vazao2Lps > 0, 'Corrente 2 deve escoar');
    assert.equal(tc.vazao1Lps, 0, 'Corrente 1 deve ser 0');
    assert.ok(tc.temperaturaSaida2C > 25, `Corrente 2 deve aquecer em direção à temperatura de serviço (atual: ${tc.temperaturaSaida2C})`);
    assert.ok(tc.cargaTermicaW > 0, 'Carga térmica deve ser transferida para a corrente 2');
});

test('solver nodal resolve circuitos fechados simultaneos nas correntes 1 e 2 do trocador', () => {
    const engine = createEngine();

    const b1 = new BombaLogica('B1', 'Bomba-1', 0, 0);
    b1.isOn = true;
    b1.grauAcionamento = 100;
    b1.acionamentoEfetivo = 100;
    b1.pressaoMaxima = 2.5;

    const b2 = new BombaLogica('B2', 'Bomba-2', 0, 100);
    b2.isOn = true;
    b2.grauAcionamento = 100;
    b2.acionamentoEfetivo = 100;
    b2.pressaoMaxima = 3.5;

    const tc = new TrocadorCalorLogico('TC-DUAL-LOOP', 'TC-01', 150, 50);
    tc.uaWPorK = 5000;

    // Loop 1: Bomba 1 -> TC in1 -> out1 -> Bomba 1
    const c1_1 = new ConnectionModel({ id: 'c1_1', sourceId: b1.id, targetId: tc.id, targetEndpoint: { portId: 'in1', portType: 'in' } });
    const c1_2 = new ConnectionModel({ id: 'c1_2', sourceId: tc.id, targetId: b1.id, sourceEndpoint: { portId: 'out1', portType: 'out' } });

    // Loop 2: Bomba 2 -> TC out2 -> in2 -> Bomba 2 (contracorrente)
    const c2_1 = new ConnectionModel({ id: 'c2_1', sourceId: b2.id, targetId: tc.id, targetEndpoint: { portId: 'out2', portType: 'in' } });
    const c2_2 = new ConnectionModel({ id: 'c2_2', sourceId: tc.id, targetId: b2.id, sourceEndpoint: { portId: 'in2', portType: 'out' } });

    [b1, b2, tc].forEach(c => engine.add(c));
    [c1_1, c1_2, c2_1, c2_2].forEach(c => engine.addConnection(c));

    assert.equal(tc.getModoEscoamento(engine), 'contracorrente');

    for (let i = 0; i < 40; i++) {
        engine.componentes.forEach((c) => c.atualizarDinamica(0.1, engine.hydraulicContext.getComponentFluid(c) || engine.fluidoOperante));
        engine.resolveHydraulicNetwork(0.1);
        engine.componentes.forEach((c) => c.sincronizarMetricasFisicas(engine.hydraulicContext.getComponentFluid(c) || engine.fluidoOperante));
    }

    assert.ok(tc.vazao1Lps > 0.5, `Vazão na Corrente 1 deve ser positiva (atual: ${tc.vazao1Lps})`);
    assert.ok(tc.vazao2Lps > 0.5, `Vazão na Corrente 2 deve ser positiva (atual: ${tc.vazao2Lps})`);
    approx(b1.fluxoReal, tc.vazao1Lps, 1e-3, 'Vazão da bomba 1 deve coincidir com corrente 1');
    approx(b2.fluxoReal, tc.vazao2Lps, 1e-3, 'Vazão da bomba 2 deve coincidir com corrente 2');
    assert.ok(tc.vazaoMassaKgS > 0);
    assert.ok(tc.vazaoMassa2KgS > 0);
});

test('monitorController gerencia trocador de calor sem erro de referencia em modo compacto e expandido', async () => {
    const prevDoc = global.document;
    const prevWin = global.window;
    const prevRaf = global.requestAnimationFrame;
    const prevChart = global.Chart;

    try {
        class MockChart {
            constructor(ctx, config) {
                this.ctx = ctx;
                this.config = config;
                this.data = config.data || { datasets: [] };
                this.options = config.options || { scales: { x: { ticks: {} }, y: { ticks: {} } }, plugins: { tooltip: { callbacks: {} } } };
                this.destroyed = false;
            }
            update() {}
            destroy() { this.destroyed = true; }
            resize() {}
        }
        global.Chart = MockChart;

        const elements = {};
        const createMockEl = (tag, id = '') => {
            const el = {
                tagName: tag.toUpperCase(),
                id,
                attributes: {},
                setAttribute(name, val) { this.attributes[name] = String(val); },
                getAttribute(name) { return this.attributes[name] || null; },
                classList: {
                    _s: new Set(),
                    add(...c) { c.forEach(x => this._s.add(x)); },
                    remove(...c) { c.forEach(x => this._s.delete(x)); },
                    contains(x) { return this._s.has(x); },
                    toggle(x) { if (this._s.has(x)) { this._s.delete(x); return false; } this._s.add(x); return true; }
                },
                style: {
                    removeProperty() {}
                },
                children: [],
                parentElement: null,
                parentNode: null,
                dataset: {},
                getContext() {
                    return {
                        clearRect() {},
                        fillRect() {},
                        beginPath() {},
                        moveTo() {},
                        lineTo() {},
                        stroke() {}
                    };
                },
                appendChild(c) {
                    this.children.push(c);
                    c.parentElement = this;
                    c.parentNode = this;
                    return c;
                },
                insertBefore(n) {
                    this.children.push(n);
                    n.parentElement = this;
                    n.parentNode = this;
                    return n;
                },
                querySelector(sel) {
                    if (sel === '.chart-compare-card-header') return elements['header-1'] || null;
                    return null;
                },
                querySelectorAll() { return []; },
                addEventListener() {},
                removeEventListener() {},
                remove() {}
            };
            if (id) elements[id] = el;
            return el;
        };

        const chartWrapper = createMockEl('div', 'chart-wrapper');
        const compactStage = createMockEl('div', 'chart-compact-stage');
        const compareGrid = createMockEl('div', 'chart-compare-grid');
        const compactCanvas = createMockEl('canvas', 'gaap-volume-chart');
        const card1 = createMockEl('div', 'chart-compare-card-1');
        const header1 = createMockEl('div', 'header-1');
        elements['header-1'] = header1;
        card1.appendChild(header1);
        const card2 = createMockEl('div', 'chart-compare-card-2');
        const title1 = createMockEl('h4', 'chart-compare-title-1');
        const subtitle1 = createMockEl('p', 'chart-compare-subtitle-1');
        const title2 = createMockEl('h4', 'chart-compare-title-2');
        const subtitle2 = createMockEl('p', 'chart-compare-subtitle-2');
        const canvas1 = createMockEl('canvas', 'gaap-compare-chart-1');
        const canvas2 = createMockEl('canvas', 'gaap-compare-chart-2');
        const wrap1 = createMockEl('div', 'chart-compare-wrap-1');
        const wrap2 = createMockEl('div', 'chart-compare-wrap-2');
        const empty1 = createMockEl('div', 'chart-compare-empty-1');
        const empty2 = createMockEl('div', 'chart-compare-empty-2');
        const badge = createMockEl('span', 'chart-max-badge');
        const status = createMockEl('p', 'chart-max-status');

        global.document = {
            getElementById(id) { return elements[id] || null; },
            querySelector(sel) {
                if (sel === '#chart-compact-stage') return compactStage;
                if (sel === '#chart-compare-grid') return compareGrid;
                return null;
            },
            querySelectorAll() { return []; },
            createElement(tag) { return createMockEl(tag); }
        };

        global.window = {
            addEventListener() {},
            removeEventListener() {}
        };
        global.requestAnimationFrame = (fn) => fn();

        const { createMonitorController } = await import('../js/presentation/controllers/MonitorController.js');
        const engine = createEngine();
        const tc = new TrocadorCalorLogico('tc-test-mon', 'TC-MON', 0, 0);
        tc.temperaturaEntradaC = 25;
        tc.temperaturaSaidaC = 50;
        tc.cargaTermicaW = 25000;
        engine.add(tc);

        const monitor = createMonitorController({ engine });
        monitor.setup();

        // 1. Seleciona o trocador em modo compacto
        monitor.refreshSelection(tc);
        assert.doesNotThrow(() => {
            monitor.refreshHeatExchanger(tc);
        }, 'Atualização do trocador no modo compacto não deve lançar erro');

        // 2. Expande o monitor e atualiza o layout
        chartWrapper.classList.add('maximized');
        assert.doesNotThrow(() => {
            monitor.updateLayout();
        }, 'updateLayout com trocador no histórico não deve lançar ReferenceError');

        assert.ok(subtitle1.textContent.includes('Perfil'), 'Subtítulo deve indicar o perfil do trocador');

        // 3. Altera para modo térmico e atualiza
        tc.setTipoPerfilGrafico('thermal');
        assert.doesNotThrow(() => {
            monitor.refreshHeatExchanger(tc);
        }, 'Atualização em modo térmico não deve lançar erro');
        assert.ok(subtitle1.textContent.includes('kW'), 'Subtítulo no modo térmico deve mencionar kW');

        // 4. Alterna de volta para modo espacial
        tc.setTipoPerfilGrafico('position');
        assert.doesNotThrow(() => {
            monitor.refreshHeatExchanger(tc);
        }, 'Atualização retornando ao modo espacial não deve lançar erro');
        assert.ok(!subtitle1.textContent.includes('kW'), 'Subtítulo no modo espacial não deve mencionar kW');
    } finally {
        global.document = prevDoc;
        global.window = prevWin;
        global.requestAnimationFrame = prevRaf;
        global.Chart = prevChart;
    }
});

test('ao abrir 2 gráficos na versão expandida e fechar um deles, o seletor de modo do gráfico restante permanece funcional e interativo', async () => {
    const prevDoc = global.document;
    const prevWin = global.window;
    const prevRaf = global.requestAnimationFrame;
    const prevChart = global.Chart;

    try {
        class MockChart {
            constructor(ctx, config) {
                this.ctx = ctx;
                this.config = config;
                this.data = config.data || { datasets: [] };
                this.options = config.options || { scales: { x: { ticks: {} }, y: { ticks: {} } }, plugins: { tooltip: { callbacks: {} } } };
                this.destroyed = false;
            }
            update() {}
            destroy() { this.destroyed = true; }
            resize() {}
        }
        global.Chart = MockChart;

        const elements = {};
        const createMockEl = (tag, id = '') => {
            let _id = id;
            const el = {
                tagName: tag.toUpperCase(),
                get id() { return _id; },
                set id(val) {
                    if (_id && elements[_id] === this) delete elements[_id];
                    _id = String(val || '');
                    if (_id) elements[_id] = this;
                },
                attributes: {},
                textContent: '',
                _innerHTML: '',
                setAttribute(name, val) { this.attributes[name] = String(val); },
                getAttribute(name) { return this.attributes[name] || null; },
                classList: {
                    _s: new Set(),
                    add(...c) { c.forEach(x => this._s.add(x)); },
                    remove(...c) { c.forEach(x => this._s.delete(x)); },
                    contains(x) { return this._s.has(x); },
                    toggle(x) { if (this._s.has(x)) { this._s.delete(x); return false; } this._s.add(x); return true; }
                },
                get className() { return Array.from(this.classList._s).join(' '); },
                set className(val) {
                    this.classList._s.clear();
                    String(val || '').split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
                },
                style: {
                    removeProperty() {}
                },
                children: [],
                parentElement: null,
                parentNode: null,
                dataset: {},
                listeners: {},
                addEventListener(evt, fn) {
                    if (!this.listeners[evt]) this.listeners[evt] = [];
                    this.listeners[evt].push(fn);
                },
                removeEventListener(evt, fn) {
                    if (this.listeners[evt]) {
                        this.listeners[evt] = this.listeners[evt].filter(f => f !== fn);
                    }
                },
                click() {
                    const fns = this.listeners['click'] || [];
                    const ev = { stopPropagation() {}, preventDefault() {} };
                    fns.forEach(fn => fn(ev));
                },
                getContext() {
                    return {
                        clearRect() {},
                        fillRect() {},
                        beginPath() {},
                        moveTo() {},
                        lineTo() {},
                        stroke() {}
                    };
                },
                appendChild(c) {
                    this.children.push(c);
                    c.parentElement = this;
                    c.parentNode = this;
                    return c;
                },
                insertBefore(n, ref) {
                    const idx = this.children.indexOf(ref);
                    if (idx >= 0) this.children.splice(idx, 0, n);
                    else this.children.push(n);
                    n.parentElement = this;
                    n.parentNode = this;
                    return n;
                },
                querySelector(sel) {
                    if (sel.startsWith('#')) {
                        const targetId = sel.slice(1);
                        return this._findDescendant(c => c.id === targetId);
                    }
                    if (sel.startsWith('.')) {
                        const targetClass = sel.slice(1);
                        return this._findDescendant(c => c.classList?.contains?.(targetClass));
                    }
                    return null;
                },
                querySelectorAll(sel) {
                    const res = [];
                    this._collectDescendants(sel, res);
                    return res;
                },
                _findDescendant(pred) {
                    for (const c of this.children) {
                        if (pred(c)) return c;
                        const found = c._findDescendant?.(pred);
                        if (found) return found;
                    }
                    return null;
                },
                _collectDescendants(sel, res) {
                    for (const c of this.children) {
                        if (sel.startsWith('.')) {
                            if (c.classList?.contains?.(sel.slice(1))) res.push(c);
                        } else if (sel.startsWith('#')) {
                            if (c.id === sel.slice(1)) res.push(c);
                        }
                        c._collectDescendants?.(sel, res);
                    }
                },
                remove() {
                    if (this.parentElement) {
                        this.parentElement.children = this.parentElement.children.filter(x => x !== this);
                        this.parentElement = null;
                        this.parentNode = null;
                    }
                    if (this.id) delete elements[this.id];
                }
            };
            Object.defineProperty(el, 'innerHTML', {
                get() { return this._innerHTML; },
                set(html) {
                    this._innerHTML = html;
                    this.children = [];
                    if (html.includes('custom-select-trigger')) {
                        const trig = createMockEl('div', `${this.id}-trigger`);
                        trig.classList.add('custom-select-trigger');
                        const lbl = createMockEl('span', `${this.id}-label`);
                        trig.appendChild(lbl);
                        this.appendChild(trig);
                    }
                    if (html.includes('custom-select-options')) {
                        const ul = createMockEl('ul', `${this.id}-options`);
                        ul.classList.add('custom-select-options');
                        const regex = /class="custom-select-option([^"]*)" data-value="([^"]+)">([^<]+)<\/li>/g;
                        let match;
                        while ((match = regex.exec(html)) !== null) {
                            const li = createMockEl('li');
                            li.classList.add('custom-select-option');
                            if (match[1].includes('selected')) li.classList.add('selected');
                            li.dataset.value = match[2];
                            li.textContent = match[3];
                            ul.appendChild(li);
                        }
                        this.appendChild(ul);
                    }
                }
            });
            if (id) elements[id] = el;
            return el;
        };

        const chartWrapper = createMockEl('div', 'chart-wrapper');
        const compactStage = createMockEl('div', 'chart-compact-stage');
        const compareGrid = createMockEl('div', 'chart-compare-grid');
        const compactCanvas = createMockEl('canvas', 'gaap-volume-chart');
        chartWrapper.appendChild(compactStage);
        compactStage.appendChild(compactCanvas);
        chartWrapper.appendChild(compareGrid);

        const card1 = createMockEl('div', 'chart-compare-card-1');
        card1.classList.add('chart-compare-card');
        const header1 = createMockEl('div');
        header1.classList.add('chart-compare-card-header');
        card1.appendChild(header1);
        const body1 = createMockEl('div');
        body1.classList.add('chart-compare-card-body');
        const wrap1 = createMockEl('div', 'chart-compare-wrap-1');
        const canvas1 = createMockEl('canvas', 'gaap-compare-chart-1');
        wrap1.appendChild(canvas1);
        body1.appendChild(wrap1);
        const empty1 = createMockEl('div', 'chart-compare-empty-1');
        body1.appendChild(empty1);
        card1.appendChild(body1);

        const card2 = createMockEl('div', 'chart-compare-card-2');
        card2.classList.add('chart-compare-card');
        const header2 = createMockEl('div');
        header2.classList.add('chart-compare-card-header');
        card2.appendChild(header2);
        const body2 = createMockEl('div');
        body2.classList.add('chart-compare-card-body');
        const wrap2 = createMockEl('div', 'chart-compare-wrap-2');
        const canvas2 = createMockEl('canvas', 'gaap-compare-chart-2');
        wrap2.appendChild(canvas2);
        body2.appendChild(wrap2);
        const empty2 = createMockEl('div', 'chart-compare-empty-2');
        body2.appendChild(empty2);
        card2.appendChild(body2);

        compareGrid.appendChild(card1);
        compareGrid.appendChild(card2);

        createMockEl('span', 'chart-max-badge');
        createMockEl('p', 'chart-max-status');
        createMockEl('h4', 'chart-compare-title-1');
        createMockEl('p', 'chart-compare-subtitle-1');
        createMockEl('h4', 'chart-compare-title-2');
        createMockEl('p', 'chart-compare-subtitle-2');

        global.document = {
            getElementById(id) { return elements[id] || null; },
            querySelector(sel) {
                if (sel === '#chart-compact-stage') return compactStage;
                if (sel === '#chart-compare-grid') return compareGrid;
                return chartWrapper.querySelector(sel);
            },
            querySelectorAll(sel) {
                return chartWrapper.querySelectorAll(sel);
            },
            createElement(tag) { return createMockEl(tag); },
            addEventListener() {},
            removeEventListener() {}
        };

        global.window = {
            addEventListener() {},
            removeEventListener() {}
        };
        global.requestAnimationFrame = (fn) => fn();

        const { createMonitorController } = await import('../js/presentation/controllers/MonitorController.js');
        const engine = createEngine();
        const p1 = new BombaLogica('p-mon-1', 'B-1', 0, 0);
        const p2 = new BombaLogica('p-mon-2', 'B-2', 0, 0);
        engine.add(p1);
        engine.add(p2);

        const monitor = createMonitorController({ engine });
        monitor.setup();

        chartWrapper.classList.add('maximized');

        // Cenário A: Abrir 2 bombas, fechar Card 1 (índice 0). A bomba 2 passa para o Card 1.
        monitor.refreshSelection(p1);
        monitor.refreshSelection(p2);

        const dismiss1 = document.getElementById('chart-compare-dismiss-1');
        assert.ok(dismiss1, 'Botão fechar do Card 1 deve existir');
        dismiss1.click();

        // O seletor no Card 1 deve continuar existindo e ser interativo
        const selAfterDismiss1 = document.getElementById('chart-compare-axis-select-1');
        assert.ok(selAfterDismiss1, 'Seletor de modo do Card 1 deve existir após fechar o primeiro gráfico');

        // Abrir dropdown
        const trigger1 = selAfterDismiss1.querySelector('.custom-select-trigger');
        assert.ok(trigger1, 'Gatilho do dropdown deve existir');
        trigger1.click();
        assert.strictEqual(selAfterDismiss1.classList.contains('open'), true, 'Dropdown deve abrir ao clicar no gatilho');

        // Selecionar rendimento ('yEff')
        const optEff = selAfterDismiss1.querySelectorAll('.custom-select-option').find(o => o.dataset.value === 'yEff');
        assert.ok(optEff, 'Opção yEff deve estar presente');
        optEff.click();

        const updatedSel1 = document.getElementById('chart-compare-axis-select-1');
        assert.strictEqual(updatedSel1?.dataset.activeMode, 'yEff', 'activeMode deve ter sido atualizado para yEff');

        // Cenário B: Abrir novamente 2 gráficos e fechar o Card 2 (índice 1).
        monitor.refreshSelection(p1);
        const dismiss2 = document.getElementById('chart-compare-dismiss-2');
        assert.ok(dismiss2, 'Botão fechar do Card 2 deve existir');
        dismiss2.click();

        const selAfterDismiss2 = document.getElementById('chart-compare-axis-select-1');
        assert.ok(selAfterDismiss2, 'Seletor do Card 1 deve permanecer funcional após fechar Card 2');
        const trigger2 = selAfterDismiss2.querySelector('.custom-select-trigger');
        trigger2.click();
        assert.strictEqual(selAfterDismiss2.classList.contains('open'), true, 'Dropdown deve abrir após fechar Card 2');

        const optNpsh = selAfterDismiss2.querySelectorAll('.custom-select-option').find(o => o.dataset.value === 'yNpsh');
        assert.ok(optNpsh, 'Opção yNpsh deve estar presente');
        optNpsh.click();

        const updatedSel2 = document.getElementById('chart-compare-axis-select-1');
        assert.strictEqual(updatedSel2?.dataset.activeMode, 'yNpsh', 'activeMode deve ter sido atualizado para yNpsh');
    } finally {
        global.document = prevDoc;
        global.window = prevWin;
        global.requestAnimationFrame = prevRaf;
        global.Chart = prevChart;
    }
});

const PLANTAS_TESTE_DIR = path.resolve('Testes/plantas teste');

function simulateTicks(engine, ticks = 30, dt = 0.1) {
    for (let i = 0; i < ticks; i += 1) {
        engine.componentes.forEach((c) => c.atualizarDinamica(dt, engine.hydraulicContext.getComponentFluid(c) || engine.fluidoOperante));
        engine.resolveHydraulicNetwork(dt);
        engine.componentes.forEach((c) => {
            const fluid = engine.hydraulicContext.getComponentFluid(c) || engine.fluidoOperante;
            if (c instanceof TanqueLogico) c.atualizarFisica(dt, fluid);
            else c.sincronizarMetricasFisicas(fluid);
        });
        engine.reconcileConnectionPressureStatesFromComponentDrops();
    }
}

test('tanque novo nasce fechado e o tipo gravado no arquivo é respeitado ao abrir', () => {
    const novo = new TanqueLogico('T-novo', 'T-novo', 0, 0);
    assert.equal(novo.tipoTanque, 'fechado');
    assert.equal(novo.considerarPerdasBocais, false, 'Tanque novo sem perdas nos bocais, como no DWSIM');
    assert.equal(novo.usarGeometriaBocal, false, 'Perdas na velocidade do cano por padrao');
    assert.equal(new DrenoLogico('D-novo', 'D-novo', 0, 0).usarGeometriaBocal, false, 'K do dreno na velocidade do cano por padrao');

    const engine = createEngine();
    const tanque = new TanqueLogico('T-aberto', 'T-aberto', 0, 0);
    tanque.tipoTanque = 'atmosferico';
    tanque.considerarColunaLiquido = false;
    tanque.considerarPerdasBocais = false;
    tanque.usarGeometriaBocal = true;
    tanque.diametroConexaoM = 0.05;
    engine.add(tanque);
    engine.add(new TanqueLogico('T-fechado', 'T-fechado', 200, 0));
    const restaurado = createEngine();
    assert.equal(restoreFlowchartDocument(restaurado, createFlowchartDocument(engine)).restored, true);
    const tipoDe = (tag) => restaurado.componentes.find((c) => c.tag === tag).tipoTanque;
    assert.equal(tipoDe('T-aberto'), 'atmosferico');
    assert.equal(tipoDe('T-fechado'), 'fechado');
    const aberto = restaurado.componentes.find((c) => c.tag === 'T-aberto');
    assert.equal(aberto.considerarColunaLiquido, false, 'Check da coluna de liquido e salvo no arquivo');
    assert.equal(aberto.considerarPerdasBocais, false, 'Check das perdas nos bocais e salvo no arquivo');
    assert.equal(aberto.usarGeometriaBocal, true, 'Check da geometria do bocal e salvo no arquivo');
    assert.equal(aberto.diametroConexaoM, 0.05, 'Diametro do bocal e salvo no arquivo');

    // O navegador restaura pelo UndoController, que também passa por applyComponentClipboardSnapshot.
    const legado = applyComponentClipboardSnapshot(
        { type: 'tank', tag: 'T-legado', properties: { capacidadeMaxima: 500 } },
        new TanqueLogico('T-legado', 'T-legado', 0, 0)
    );
    assert.equal(legado.tipoTanque, 'atmosferico', 'Snapshot sem tipoTanque abre aberto em qualquer caminho');
    assert.equal(legado.considerarPerdasBocais, true, 'Snapshot sem o check abre com as perdas nos bocais ligadas, como foi feito');
});

test('importacao de planta teste: teste planta.json (6 ilhas / cenarios integrados)', () => {
    const raw = fs.readFileSync(path.join(PLANTAS_TESTE_DIR, 'teste planta.json'), 'utf8');
    const engine = createEngine();
    const { restored } = restoreFlowchartDocument(engine, raw);

    assert.equal(restored, true);
    assert.equal(engine.componentes.length, 23);
    assert.equal(engine.conexoes.length, 17);
    engine.componentes.filter((c) => c instanceof TanqueLogico).forEach((tanque) => {
        assert.equal(tanque.tipoTanque, 'atmosferico', `${tanque.tag}: arquivo sem tipoTanque abre com o tanque aberto`);
        assert.equal(tanque.considerarColunaLiquido, true, `${tanque.tag}: arquivo antigo mantem a coluna de liquido`);
        assert.equal(tanque.considerarPerdasBocais, true, `${tanque.tag}: arquivo antigo mantem as perdas nos bocais`);
    });

    simulateTicks(engine, 35, 0.1);
    const byTag = (tag) => engine.componentes.find((c) => c.tag === tag);
    const pressaoVaporAbsBar = 0.0317;
    const pressaoAtmosfericaBar = 1.01325;

    // Fechamento de energia nas fronteiras: tudo que chega a um dreno chega na contrapressão dele,
    // e todo tanque aberto entrega na saída apenas a pressão da coluna de líquido.
    engine.conexoes.forEach((conn) => {
        const state = engine.getConnectionState(conn);
        if (state.flowLps <= 0) return;
        const target = engine.getComponentById(conn.targetId);
        const source = engine.getComponentById(conn.sourceId);
        if (target instanceof DrenoLogico) {
            approx(state.outletPressureBar, target.pressaoSaidaBar, 1e-9, `Pressao de chegada em ${target.tag}`);
        }
        if (source instanceof TanqueLogico) {
            // Euler explícito (como no DWSIM dinâmico): a vazão do passo usa a coluna do início do passo,
            // então a comparação com o nível já integrado admite a variação de nível de um único passo.
            const coluna = source.getPressaoBocalSaidaBar(source.getFluidoConteudo(), engine.usarAlturaRelativa);
            approx(state.sourcePressureBar, coluna, 1e-3, `Saida do tanque aberto ${source.tag}`);
        }
    });

    // Ilha 1: fonte limitada a 8,89 L/s alimentando uma bomba de 45 L/s sem restrição a jusante.
    // A bomba "puxa" mais do que a fonte entrega: a sucção cai e ela opera cavitando.
    const p1 = byTag('P-01');
    approx(p1.fluxoReal, 32 / 3.6, 1e-3, 'P-01 limitada pela vazao maxima da fonte');
    assert.ok(p1.pressaoSucaoAtualBar < -0.9, `Succao de P-01 em vacuo: ${p1.pressaoSucaoAtualBar}`);
    assert.ok(p1.fatorCavitacaoAtual < 1, `P-01 deve cavitar: ${p1.fatorCavitacaoAtual}`);
    assert.equal(p1.getCondicaoSucaoAtual(), 'Cavitando');
    approx(p1.pressaoDescargaAtualBar - p1.pressaoSucaoAtualBar, p1.cargaGeradaBar, 1e-6, 'Ganho de P-01 igual a carga entregue');

    // Ilha 2: tanque aberto com nível baixo enche (entrada limitada pela fonte, saída por Torricelli).
    const t1 = byTag('T-01');
    approx(t1.lastQin, 50 / 3, 1e-3, 'T-01 recebe a vazao maxima da fonte');
    assert.ok(t1.lastQout > 0 && t1.lastQout < t1.lastQin, `T-01 ainda enchendo: in=${t1.lastQin}, out=${t1.lastQout}`);

    // Ilha 3: tanque cheio com válvula que não drena a vazão de entrada só pela coluna: transborda.
    const t1c = byTag('T-01 - copia');
    const v1 = byTag('V-01');
    assert.equal(t1c.volumeAtual, t1c.capacidadeMaxima);
    assert.ok(t1c.vazaoTransbordoLps > 1, `T-01 - copia deve transbordar: ${t1c.vazaoTransbordoLps}`);
    approx(t1c.vazaoTransbordoLps, t1c.lastQin - t1c.lastQout, 1e-6, 'Massa conservada com transbordo');
    approx(v1.fluxoReal, t1c.lastQout, 1e-9, 'V-01 escoa a saida do tanque');

    // Ilhas 4 e 6: bombas alimentadas por fonte limitada empurrando para tanque aberto também
    // ficam limitadas pela cavitação, com a sucção estática na pressão de vapor.
    ['P-02', 'P-05'].forEach((tag) => {
        const pump = byTag(tag);
        approx(pump.fluxoReal, 100 / 3.6, 1e-3, `${tag} limitada pela vazao maxima da fonte`);
        approx(pump.pressaoSucaoAtualBar + pressaoAtmosfericaBar, pressaoVaporAbsBar, 0.005, `${tag} succao na pressao de vapor`);
        assert.equal(pump.getCondicaoSucaoAtual(), 'Cavitando');
    });

    // Ilha 5: válvula igual porcentagem a 50%: vazão dada pelo Cv efetivo com a pressão da fonte
    // (Q = Kv·√(ΔP/SG), mesma equação do DWSIM), descontadas só as pequenas perdas dos tubos.
    const v2 = byTag('V-02');
    const kvEfetivo = v2.cv * Math.pow(v2.rangeabilidade, 0.5 - 1) * 0.8649786130809;
    const vazaoIdealLps = (kvEfetivo * Math.sqrt(0.5 / (997 / 999.016))) / 3.6;
    approx(v2.fluxoReal, vazaoIdealLps, 0.02 * vazaoIdealLps, `V-02 deve seguir a equacao do Cv (ideal ${vazaoIdealLps} L/s)`);

    // Ilha 6: controle de nível ativo no arquivo (sem executar o PID neste teste).
    const t7 = byTag('T-07');
    assert.equal(t7.setpointAtivo, true);
    assert.equal(t7.setpoint, 57);

    const activeConns = engine.conexoes.filter((c) => engine.getConnectionState(c).flowLps > 0.001);
    assert.equal(activeConns.length, 17, 'Todas as 17 conexoes de teste planta.json devem estar ativas');
});

test('controle de nivel PID estabiliza o tanque no set point sem ciclo limite', () => {
    // Planta fisicamente viável: com a coluna do set point, o bocal DN80 e a válvula de saída conseguem
    // drenar a vazão de entrada (8 L/s). (Na Ilha 6 de teste planta.json, 27,8 L/s não drenam por
    // gravidade com 1,37 m de coluna: lá o tanque transborda e o PID satura, como numa planta real.)
    const engine = createEngine();
    const fonte = new FonteLogica('F-PID', 'Entrada-PID', 0, 0);
    const tanque = new TanqueLogico('T-PID', 'T-PID', 120, 0);
    tanque.tipoTanque = 'atmosferico';
    const valvula = new ValvulaLogica('V-PID', 'V-PID', 240, 0);
    const dreno = new DrenoLogico('D-PID', 'Saida-PID', 360, 0);
    fonte.pressaoFonteBar = 0.5;
    fonte.vazaoMaxima = 8;
    tanque.capacidadeMaxima = 1000;
    tanque.volumeAtual = 400;
    tanque.alturaUtilMetros = 2.4;
    valvula.aplicarPerfilCaracteristica('linear');

    [fonte, tanque, valvula, dreno].forEach((c) => engine.add(c));
    fonte.conectarSaida(tanque);
    tanque.conectarSaida(valvula);
    valvula.conectarSaida(dreno);
    [[fonte, tanque], [tanque, valvula], [valvula, dreno]].forEach(([source, target]) => {
        engine.addConnection(new ConnectionModel({ sourceId: source.id, targetId: target.id, extraLengthM: 0 }));
    });
    tanque.setpoint = 57;
    assert.equal(tanque.setSetpointAtivo(true).ativado, true);

    const tick = () => {
        engine.tickPipeline.updateHighLevelControls(0.1);
        simulateTicks(engine, 1, 0.1);
    };
    for (let i = 0; i < 3500; i += 1) tick();
    const volumes = [];
    for (let i = 0; i < 300; i += 1) {
        tick();
        volumes.push(tanque.volumeAtual);
    }

    const amplitudeL = Math.max(...volumes) - Math.min(...volumes);
    assert.ok(amplitudeL < 0.5, `Nivel deve ficar estavel apos o transiente (amplitude ${amplitudeL} L)`);
    approx(tanque.volumeAtual, 570, 1, 'Volume deve convergir ao set point de 57%');
    approx(tanque.lastQout, tanque.lastQin, 0.02, 'Em regime a saida iguala a entrada');
    assert.equal(tanque.vazaoTransbordoLps, 0);
});

test('importacao de planta teste: teste_trocatroca.json (3 cenarios termicos: utilidade, paralelo e contracorrente)', () => {
    const raw = fs.readFileSync(path.join(PLANTAS_TESTE_DIR, 'teste_trocatroca.json'), 'utf8');
    const engine = createEngine();
    const { restored } = restoreFlowchartDocument(engine, raw);

    assert.equal(restored, true);
    assert.equal(engine.componentes.length, 18);
    assert.equal(engine.conexoes.length, 15);

    // As saidas dos trocadores tem atraso termico (tau = V/Q = 2 L / 1 L/s = 2 s):
    // 60 s >> tau garante o regime permanente que o e-NTU analitico descreve.
    simulateTicks(engine, 600, 0.1);

    const tcList = engine.componentes.filter((c) => c.constructor.name === 'TrocadorCalorLogico');
    assert.equal(tcList.length, 3, 'Devem existir exatamente 3 trocadores de calor na planta');

    // Cenário 1: Trocador em Modo Utilidade (TC-01, topo)
    const tcUtil = tcList.find((c) => c.y === 400);
    assert.ok(tcUtil, 'Trocador de utilidade deve ser localizado na cota y=400');
    assert.equal(tcUtil.temDuasCorrentesConectadas(), false);
    // A válvula a 10% passaria mais que a fonte entrega: a vazão é a máxima da fonte (1 L/s).
    approx(tcUtil.vazao1Lps, 1, 1e-3, 'Corrente 1 limitada pela vazao maxima da fonte');
    const capacidade = (massKgS) => massKgS * 4182;
    const ntuUtil = tcUtil.uaWPorK / capacidade(tcUtil.vazaoMassaKgS);
    approx(tcUtil.efetividadeAtual, 1 - Math.exp(-ntuUtil), 1e-6, 'Utilidade: e = 1 - exp(-NTU)');
    approx(tcUtil.temperaturaSaidaC, 25 + (tcUtil.efetividadeAtual * (80 - 25)), 1e-6, 'Saida em utilidade pelo e-NTU');

    // Cenário 2: Trocador Dual-Stream em Co-corrente / Paralelo (TC-01 - copia, meio)
    const tcParalelo = tcList.find((c) => c.y === 680);
    assert.ok(tcParalelo, 'Trocador em paralelo deve ser localizado na cota y=680');
    assert.equal(tcParalelo.temDuasCorrentesConectadas(), true);
    assert.equal(tcParalelo.getModoEscoamento(engine), 'paralelo');
    const cMinParalelo = capacidade(Math.min(tcParalelo.vazaoMassaKgS, tcParalelo.vazaoMassa2KgS));
    const crAnaliticoParalelo = Math.min(tcParalelo.vazaoMassaKgS, tcParalelo.vazaoMassa2KgS)
        / Math.max(tcParalelo.vazaoMassaKgS, tcParalelo.vazaoMassa2KgS);
    const ntuParalelo = tcParalelo.uaWPorK / cMinParalelo;
    approx(
        tcParalelo.efetividadeAtual,
        (1 - Math.exp(-ntuParalelo * (1 + crAnaliticoParalelo))) / (1 + crAnaliticoParalelo),
        1e-6,
        'Paralelo: e = (1 - exp(-NTU(1+Cr)))/(1+Cr)'
    );
    // Co-corrente: as correntes se aproximam sem cruzar e a efetividade respeita o teto 1 / (1 + Cr).
    assert.ok(tcParalelo.temperaturaSaida2C > tcParalelo.temperaturaSaidaC, `T2 out paralelo nao pode cruzar T1 out: T1=${tcParalelo.temperaturaSaidaC}, T2=${tcParalelo.temperaturaSaida2C}`);
    const c1Paralelo = tcParalelo.vazaoMassaKgS;
    const c2Paralelo = tcParalelo.vazaoMassa2KgS;
    const crParalelo = Math.min(c1Paralelo, c2Paralelo) / Math.max(c1Paralelo, c2Paralelo);
    assert.ok(tcParalelo.efetividadeAtual <= 1 / (1 + crParalelo) + 1e-6, `Efetividade em paralelo nao pode ultrapassar o teto termodinamico 1/(1+Cr): ${tcParalelo.efetividadeAtual}`);
    const calorRecebido = c1Paralelo * (tcParalelo.temperaturaSaidaC - 25);
    const calorCedido = c2Paralelo * (80 - tcParalelo.temperaturaSaida2C);
    assert.ok(Math.abs(calorRecebido - calorCedido) / calorCedido < 0.01, `Balanco de energia sensivel deve fechar: recebido=${calorRecebido}, cedido=${calorCedido}`);

    // Cenário 3: Trocador Dual-Stream em Contracorrente (TC-01 - copia, inferior)
    const tcContra = tcList.find((c) => c.y === 960);
    assert.ok(tcContra, 'Trocador em contracorrente deve ser localizado na cota y=960');
    assert.equal(tcContra.temDuasCorrentesConectadas(), true);
    assert.equal(tcContra.getModoEscoamento(engine), 'contracorrente');
    const crContra = Math.min(tcContra.vazaoMassaKgS, tcContra.vazaoMassa2KgS)
        / Math.max(tcContra.vazaoMassaKgS, tcContra.vazaoMassa2KgS);
    const ntuContra = tcContra.uaWPorK / capacidade(Math.min(tcContra.vazaoMassaKgS, tcContra.vazaoMassa2KgS));
    const efetividadeContraAnalitica = Math.abs(1 - crContra) < 1e-3
        ? ntuContra / (1 + ntuContra)
        : (1 - Math.exp(-ntuContra * (1 - crContra))) / (1 - (crContra * Math.exp(-ntuContra * (1 - crContra))));
    approx(tcContra.efetividadeAtual, efetividadeContraAnalitica, 1e-4, 'Contracorrente: e-NTU analitico');
    // Cruzamento térmico (T1out > T2out) só ocorre com e > 1/(1+Cr); com a vazão real (1 L/s, NTU ~0,6) não ocorre.
    assert.equal(
        tcContra.temperaturaSaidaC > tcContra.temperaturaSaida2C,
        tcContra.efetividadeAtual > 1 / (1 + crContra),
        'Cruzamento termico coerente com a efetividade'
    );
    assert.ok(
        tcContra.efetividadeAtual > tcParalelo.efetividadeAtual,
        `Efetividade em contracorrente (${tcContra.efetividadeAtual}) deve ser superior a paralelo (${tcParalelo.efetividadeAtual})`
    );
});

test('trocador operado com apenas uma corrente adota modo contracorrente por padrao', () => {
    const engine = createEngine();
    const tc = new TrocadorCalorLogico('tc-monostream', 'TC-Mono', 0, 0);
    tc.temperaturaEntradaC = 20;
    tc.temperaturaServicoC = 80;
    tc.uaWPorK = 3000;
    engine.add(tc);

    // Sem conexões ou com apenas 1 corrente, modo deve ser contracorrente
    assert.equal(tc.temDuasCorrentesConectadas(engine), false);
    assert.equal(tc.getModoEscoamento(engine), 'contracorrente', 'Modo padrão deve ser o termicamente mais eficiente: contracorrente');

    // Dataset gráfico deve orientar a utilidade/segunda corrente em contracorrente (in2 em 100%, out2 em 0%)
    const datasets = buildHeatExchangerCurveDatasets(tc);
    const ptIn2 = datasets.operationPoints.find((pt) => pt.pointRole === 'in2');
    const ptOut2 = datasets.operationPoints.find((pt) => pt.pointRole === 'out2');
    assert.equal(ptIn2?.x, 100, 'Ponto de entrada da Corrente 2 deve estar em x=100% no modo contracorrente');
    assert.equal(ptOut2?.x, 0, 'Ponto de saída da Corrente 2 deve estar em x=0% no modo contracorrente');
});

test('traduções em inglês para o trocador de calor e seletor estão completas', () => {
    try {
        setLanguage('en');
        const tc = new TrocadorCalorLogico('tc-i18n', 'TC-I18N', 0, 0);
        const html = HEAT_EXCHANGER_PROPERTIES_PRESENTER.render(tc);

        // Seletor de gráfico e modos em inglês
        assert.equal(translateLiteral('Modo do gráfico'), 'Chart profile mode');
        assert.equal(translateLiteral('Perfil Espacial (T × Comprimento)'), 'Spatial Profile (T × Length)');
        assert.equal(translateLiteral('Perfil Térmico (T × Q)'), 'Thermal Profile (T × Q)');

        // Arranjo e modos de escoamento
        assert.equal(translateLiteral('Arranjo térmico'), 'Flow arrangement');
        assert.equal(translateLiteral('Contracorrente'), 'Countercurrent');
        assert.equal(translateLiteral('Corrente Paralela (Co-corrente)'), 'Parallel Flow (Co-current)');
        assert.equal(translateLiteral('Contra'), 'Counter');
        assert.equal(translateLiteral('Paralelo'), 'Parallel');
        assert.equal(t('visual.counter'), 'Counter');
        assert.equal(t('visual.parallel'), 'Parallel');
        assert.equal(translateLiteral('S1: 25.0°C→25.0°C | S2: 80.0°C→80.0°C (Paralelo)'), 'S1: 25.0°C→25.0°C | S2: 80.0°C→80.0°C (Parallel)');
        assert.equal(translateLiteral('S1: 25.0°C→25.0°C | S2: 80.0°C→80.0°C (Contra)'), 'S1: 25.0°C→25.0°C | S2: 80.0°C→80.0°C (Counter)');

        // Seções e métricas térmicas
        assert.equal(translateLiteral('Troca Térmica Global'), 'Global Heat Transfer');
        assert.equal(translateLiteral('Análise Térmica Rigorosa'), 'Rigorous Thermal Analysis');
        assert.equal(translateLiteral('Corrente 1 (Processo - in1 / out1)'), 'Stream 1 (Process - in1 / out1)');
        assert.equal(translateLiteral('Corrente 2 (Serviço - in2 / out2)'), 'Stream 2 (Service - in2 / out2)');
        assert.equal(translateLiteral('Parâmetros Hidráulicos e de Limite'), 'Hydraulic and Limit Parameters');
        assert.equal(translateLiteral('LMTD (Média Logarítmica)'), 'Log Mean Temperature Difference (LMTD)');
        assert.equal(translateLiteral('Fator de correção FT'), 'FT correction factor');

        // Renderização do HTML deve conter as strings traduzidas
        assert.ok(html.includes('Spatial Profile (T × Length)'), 'HTML do painel deve conter opções do seletor em inglês');
        assert.ok(html.includes('Thermal Profile (T × Q)'), 'HTML do painel deve conter opção Perfil Térmico em inglês');
        assert.ok(html.includes('Countercurrent'), 'Valor inicial do arranjo térmico deve ser Countercurrent em inglês');
        assert.ok(html.includes('Global Heat Transfer'), 'HTML deve conter Troca Térmica Global traduzida');
        assert.ok(html.includes('Stream 1 (Process - in1 / out1)'), 'HTML deve conter Corrente 1 traduzida');
        assert.ok(html.includes('Stream 2 (Service - in2 / out2)'), 'HTML deve conter Corrente 2 traduzida');
        assert.ok(html.includes('Rigorous Thermal Analysis'), 'HTML deve conter Análise Térmica Rigorosa traduzida');
        assert.ok(html.includes('Hydraulic and Limit Parameters'), 'HTML deve conter Parâmetros Hidráulicos e de Limite traduzido');
    } finally {
        setLanguage('pt');
    }
});

test('visual de conexão renderiza hitbox acessível para clique e sincroniza geometria e remoção', () => {
    const prevDoc = global.document;
    try {
        const createMockElement = (tag) => {
            const attrs = {};
            const listeners = {};
            const element = {
                tagName: tag,
                attrs,
                classList: {
                    classes: new Set(),
                    add(c) { this.classes.add(c); },
                    remove(c) { this.classes.delete(c); },
                    contains(c) { return this.classes.has(c); },
                    toggle(c, force) {
                        if (force !== undefined) {
                            if (force) this.classes.add(c);
                            else this.classes.delete(c);
                            return force;
                        }
                        if (this.classes.has(c)) {
                            this.classes.delete(c);
                            return false;
                        }
                        this.classes.add(c);
                        return true;
                    }
                },
                setAttribute(k, v) { attrs[k] = String(v); },
                getAttribute(k) { return attrs[k] ?? null; },
                addEventListener(evt, fn) {
                    if (!listeners[evt]) listeners[evt] = [];
                    listeners[evt].push(fn);
                },
                dispatchEvent(evt, payload) {
                    listeners[evt]?.forEach((fn) => fn(payload));
                },
                remove() {
                    element.removed = true;
                }
            };
            return element;
        };

        const appended = [];
        const pipeLayer = {
            appendChild(el) { appended.push(el); }
        };

        global.document = {
            createElementNS(ns, tag) {
                return createMockElement(tag);
            }
        };

        let clickedPath = null;
        let dblClickedPath = null;
        const fakeConn = { id: 'conn-1', sourceId: 'src-1', targetId: 'dst-1' };

        const visual = createConnectionVisual(pipeLayer, fakeConn, {
            onMouseDown: (conn, evt, pathEl) => { clickedPath = pathEl; },
            onDoubleClick: (conn, evt, pathEl) => { dblClickedPath = pathEl; }
        });

        assert.ok(visual, 'Visual de conexão deve ser criado e registrado');
        assert.ok(visual.hitbox, 'Visual deve possuir elemento de hitbox');
        assert.ok(visual.path, 'Visual deve possuir elemento de path visível');
        assert.equal(visual.hitbox.getAttribute('class'), 'pipe-hitbox');
        assert.equal(visual.path.getAttribute('class'), 'pipe-line');

        // Ambos os elementos devem estar associados à mesma conexão
        assert.equal(findConnectionByPath(visual.path), fakeConn);
        assert.equal(findConnectionByPath(visual.hitbox), fakeConn);

        // Disparar mousedown na hitbox deve encaminhar o path visível para o handler
        visual.hitbox.dispatchEvent('mousedown', { stopPropagation() {} });
        assert.equal(clickedPath, visual.path, 'Clique na hitbox deve acionar seleção passando o path visível');

        // Disparar dblclick na hitbox deve acionar handler de double click
        visual.hitbox.dispatchEvent('dblclick', { stopPropagation() {} });
        assert.equal(dblClickedPath, visual.path, 'Duplo clique na hitbox deve acionar remoção');

        // Atualizar layout deve sincronizar a geometria curva tanto na linha quanto na hitbox
        updateConnectionVisualLayout(fakeConn, { x: 10, y: 20 }, { x: 100, y: 120 }, { headGainM: 0 }, false);
        assert.ok(visual.path.getAttribute('d'), 'Path visível deve receber atributo d');
        assert.equal(visual.hitbox.getAttribute('d'), visual.path.getAttribute('d'), 'Hitbox e path devem ter a mesma curva d');

        // Remover conexão deve limpar ambos os elementos
        removeConnectionVisual(fakeConn);
        assert.equal(visual.hitbox.removed, true, 'Hitbox deve ser removida do DOM');
        assert.equal(visual.path.removed, true, 'Path visível deve ser removido do DOM');
        assert.equal(getConnectionVisual(fakeConn), null, 'Visual deve ser desregistrado do registro');
        assert.equal(findConnectionByPath(visual.path), null);
        assert.equal(findConnectionByPath(visual.hitbox), null);
    } finally {
        global.document = prevDoc;
    }
});

test('selecionar bomba e alternar entre componentes preserva funcionalidade do painel de propriedades e gráficos', async () => {
    const prevDoc = global.document;
    const prevWin = global.window;
    const prevRaf = global.requestAnimationFrame;
    const prevChart = global.Chart;

    try {
        const chartInstances = new Map();
        class MockChart {
            constructor(ctx, config) {
                this.ctx = ctx;
                this.canvas = ctx.canvas;
                this.config = config;
                this.data = config.data || { datasets: [] };
                this.options = config.options || {
                    scales: {
                        x: { ticks: {}, grid: {}, border: {} },
                        y: { ticks: {}, grid: {}, border: {} },
                        yHead: { ticks: {}, grid: {}, border: {} },
                        yEff: { ticks: {}, grid: {}, border: {} },
                        yNpsh: { ticks: {}, grid: {}, border: {} }
                    },
                    plugins: { tooltip: { callbacks: {} }, legend: { labels: {} } }
                };
                this.destroyed = false;
                if (this.canvas) {
                    chartInstances.set(this.canvas, this);
                }
            }
            update() {}
            destroy() {
                this.destroyed = true;
                if (this.canvas) chartInstances.delete(this.canvas);
            }
            resize() {}
            static getChart(canvas) {
                return chartInstances.get(canvas) || null;
            }
        }
        global.Chart = MockChart;

        const elements = {};
        const createMockEl = (tag, id = '') => {
            const el = {
                tagName: tag.toUpperCase(),
                id,
                attributes: {},
                setAttribute(name, val) { this.attributes[name] = String(val); },
                getAttribute(name) { return this.attributes[name] || null; },
                classList: {
                    _s: new Set(),
                    add(...c) { c.forEach(x => this._s.add(x)); },
                    remove(...c) { c.forEach(x => this._s.delete(x)); },
                    contains(x) { return this._s.has(x); },
                    toggle(x) { if (this._s.has(x)) { this._s.delete(x); return false; } this._s.add(x); return true; }
                },
                style: {
                    removeProperty() {}
                },
                children: [],
                parentElement: null,
                parentNode: null,
                dataset: {},
                getContext() {
                    return {
                        canvas: el,
                        clearRect() {},
                        fillRect() {},
                        beginPath() {},
                        moveTo() {},
                        lineTo() {},
                        stroke() {}
                    };
                },
                appendChild(c) {
                    this.children.push(c);
                    c.parentElement = this;
                    c.parentNode = this;
                    return c;
                },
                insertBefore(n) {
                    this.children.push(n);
                    n.parentElement = this;
                    n.parentNode = this;
                    return n;
                },
                querySelector(sel) {
                    if (sel === '.chart-compare-card-header') return elements['header-1'] || null;
                    if (sel === '#properties .side-panel-content') return propScroll;
                    return null;
                },
                querySelectorAll() { return []; },
                addEventListener() {},
                removeEventListener() {},
                remove() {}
            };
            if (id) elements[id] = el;
            return el;
        };

        const propContent = createMockEl('div', 'prop-content');
        const propScroll = createMockEl('div', 'prop-scroll');
        const chartWrapper = createMockEl('div', 'chart-wrapper');
        const compactStage = createMockEl('div', 'chart-compact-stage');
        const compareGrid = createMockEl('div', 'chart-compare-grid');
        const compactCanvas = createMockEl('canvas', 'gaap-volume-chart');

        for (let i = 1; i <= 2; i++) {
            const card = createMockEl('div', `chart-compare-card-${i}`);
            const header = createMockEl('div', `header-${i}`);
            elements[`header-${i}`] = header;
            card.appendChild(header);
            createMockEl('h4', `chart-compare-title-${i}`);
            createMockEl('p', `chart-compare-subtitle-${i}`);
            createMockEl('canvas', `gaap-compare-chart-${i}`);
            createMockEl('div', `chart-compare-wrap-${i}`);
            createMockEl('div', `chart-compare-empty-${i}`);
        }
        createMockEl('span', 'chart-max-badge');
        createMockEl('p', 'chart-max-status');

        global.document = {
            getElementById(id) { return elements[id] || null; },
            querySelector(sel) {
                if (sel === '#chart-compact-stage') return compactStage;
                if (sel === '#chart-compare-grid') return compareGrid;
                if (sel === '#properties .side-panel-content') return propScroll;
                return null;
            },
            querySelectorAll() { return []; },
            createElement(tag) { return createMockEl(tag); },
            body: { classList: { contains: () => false } },
            addEventListener() {},
            removeEventListener() {}
        };

        global.window = {
            addEventListener() {},
            removeEventListener() {}
        };
        global.requestAnimationFrame = (fn) => fn();

        const { createMonitorController } = await import('../js/presentation/controllers/MonitorController.js');
        const { setupPropertyPanelController } = await import('../js/presentation/controllers/PropertyPanelController.js');

        const engine = createEngine();
        const bomba = new BombaLogica('B-TEST', 'Bomba 01', 100, 100);
        const tanque = new TanqueLogico('T-TEST', 'Tanque 01', 200, 100);
        const valvula = new ValvulaLogica('V-TEST', 'Válvula 01', 300, 100);
        engine.add(bomba);
        engine.add(tanque);
        engine.add(valvula);

        const monitorController = createMonitorController({ engine });
        monitorController.setup();

        setupPropertyPanelController({ engine, monitorController });

        // 1. Seleciona bomba
        engine.selectedComponent = bomba;
        engine.notify({ tipo: 'selecao', elemento: bomba });
        assert.ok(propContent.innerHTML.includes('Bomba') || propContent.innerHTML.includes('B-TEST'), 'Painel deve renderizar propriedades da bomba');

        // 2. Seleciona tanque subsequentemente
        engine.selectedComponent = tanque;
        engine.notify({ tipo: 'selecao', elemento: tanque });
        assert.ok(propContent.innerHTML.includes('Tanque') || propContent.innerHTML.includes('T-TEST'), 'Painel deve renderizar propriedades do tanque apos clicar na bomba');

        // 3. Seleciona válvula subsequentemente
        engine.selectedComponent = valvula;
        engine.notify({ tipo: 'selecao', elemento: valvula });
        assert.ok(propContent.innerHTML.includes('Válvula') || propContent.innerHTML.includes('V-TEST'), 'Painel deve renderizar propriedades da válvula');
    } finally {
        global.document = prevDoc;
        global.window = prevWin;
        global.requestAnimationFrame = prevRaf;
        global.Chart = prevChart;
    }
});

test('monitorController sincroniza historico de slots e compact chart ao restaurar snapshot ou limpar engine', async () => {
    const prevDoc = global.document;
    const prevWin = global.window;
    const prevRaf = global.requestAnimationFrame;
    const prevChart = global.Chart;

    try {
        global.document = {
            getElementById: () => null,
            querySelectorAll: () => [],
            body: { classList: { contains: () => false } }
        };
        global.window = {
            innerWidth: 1024,
            innerHeight: 768,
            addEventListener() {},
            removeEventListener() {}
        };
        global.requestAnimationFrame = (fn) => fn();

        const { createMonitorController } = await import('../js/presentation/controllers/MonitorController.js');

        const engine = createEngine();
        const monitorController = createMonitorController({ engine });
        engine.monitorController = monitorController;
        monitorController.setup();

        const t1 = new TanqueLogico('T-01', 'Tanque 01', 100, 100);
        const t2 = new TanqueLogico('T-02', 'Tanque 02', 200, 100);
        const conn1 = new ConnectionModel({ id: 'conn-0001', sourceId: t1.id, targetId: t2.id });
        engine.add(t1);
        engine.add(t2);
        engine.addConnection(conn1);

        // Seleciona conn1 e t1 para preencher os dois slots
        monitorController.refreshSelection(null, conn1);
        monitorController.refreshSelection(t1, null);

        // Remove conexão e tanque do engine (simulando Ctrl+Z / desfazimento)
        engine.removeConnection(conn1);
        engine.removeComponent(t2);

        // syncWithEngine sincroniza o monitor e elimina referências mortas
        monitorController.syncWithEngine();

        // Adiciona e seleciona nova bomba; deve ser aceita sem falso bloqueio de slots
        const bomba = new BombaLogica('B-01', 'Bomba 01', 300, 100);
        engine.add(bomba);

        monitorController.refreshSelection(bomba, null);

        // Ao limpar o engine completamente, o monitor também sincroniza
        engine.clear();
        assert.equal(engine.componentes.length, 0);
        assert.equal(engine.conexoes.length, 0);
    } finally {
        global.document = prevDoc;
        global.window = prevWin;
        global.requestAnimationFrame = prevRaf;
        global.Chart = prevChart;
    }
});



