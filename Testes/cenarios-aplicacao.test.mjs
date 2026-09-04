import assert from 'node:assert/strict';
import test from 'node:test';

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
    parseFlowchartDocument
} from '../js/presentation/flowchart/FlowchartPersistence.js';

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





