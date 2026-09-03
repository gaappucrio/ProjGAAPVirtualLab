import assert from 'node:assert/strict';
import test from 'node:test';

import { SistemaSimulacao, FLUID_PRESETS } from '../js/application/engine/SimulationEngine.js';
import { SelectionStore } from '../js/application/stores/SelectionStore.js';
import { ConnectionModel } from '../js/domain/models/ConnectionModel.js';
import { DrenoLogico } from '../js/domain/components/DrenoLogico.js';
import { FonteLogica } from '../js/domain/components/FonteLogica.js';
import { TanqueLogico } from '../js/domain/components/TanqueLogico.js';
import { TrocadorCalorLogico } from '../js/domain/components/TrocadorCalorLogico.js';
import { ValvulaLogica } from '../js/domain/components/ValvulaLogica.js';
import {
    createFlowchartDocument,
    FLOWCHART_DOCUMENT_TYPE,
    parseFlowchartDocument
} from '../js/presentation/flowchart/FlowchartPersistence.js';
import { createMonitorSlotHistory } from '../js/presentation/monitoring/MonitorSlotHistory.js';
import { setLanguage, translateDefaultComponentTag } from '../js/presentation/i18n/LanguageManager.js';

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

test('seleção múltipla mantém contrato de componente único e limpa conexões', () => {
    const store = new SelectionStore();
    const fonte = new FonteLogica('F-01', 'Fonte-01', 0, 0);
    const tanque = new TanqueLogico('T-01', 'Tanque-01', 120, 0);
    const connection = new ConnectionModel({ sourceId: fonte.id, targetId: tanque.id });

    store.selectComponents([fonte, tanque]);
    assert.deepEqual([...store.selectedComponents], [fonte, tanque]);
    assert.equal(store.selectedComponent, null, 'Seleção múltipla não deve fingir ser seleção simples');
    assert.equal(store.selectedConnection, null);

    store.toggleComponent(tanque);
    assert.deepEqual([...store.selectedComponents], [fonte]);
    assert.equal(store.selectedComponent, fonte, 'Ao sobrar um componente, o painel pode usar a seleção simples');

    store.selectConnection(connection);
    assert.equal(store.selectedConnection, connection);
    assert.equal(store.selectedComponent, null);
    assert.equal(store.selectedComponents.size, 0, 'Selecionar Cano deve limpar seleção múltipla');
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

    // Ao desconectar a corrente 2, o trocador volta para modo utilidade com temperatura de servico editavel
    engine.removeConnection(c2In);
    engine.removeConnection(c2Out);
    assert.equal(engine.isTrocadorComDuasCorrentes(trocador), false);
    assert.equal(trocador.getDiagnosticoOperacao(engine).temperaturaServicoEditavel, true);
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

test('alternância de idioma traduz tag padrão do trocador de calor entre TC e HX', () => {
    setLanguage('pt');
    assert.equal(translateDefaultComponentTag('TC-01'), 'TC-01');
    assert.equal(translateDefaultComponentTag('HX-01'), 'TC-01');

    setLanguage('en');
    assert.equal(translateDefaultComponentTag('TC-01'), 'HX-01');
    assert.equal(translateDefaultComponentTag('TC-02'), 'HX-02');
    assert.equal(translateDefaultComponentTag('HX-01'), 'HX-01');

    // Tags personalizadas não devem ser alteradas
    assert.equal(translateDefaultComponentTag('TC-Personalizado'), 'TC-Personalizado');
    assert.equal(translateDefaultComponentTag('MeuTrocador'), 'MeuTrocador');

    // Retorna para o idioma padrão
    setLanguage('pt');
    assert.equal(translateDefaultComponentTag('HX-01'), 'TC-01');
});

test('histórico de monitoramento aceita e gerencia trocador de calor', () => {
    const history = createMonitorSlotHistory({ maxEntries: 2 });
    const trocador = new TrocadorCalorLogico('TC-1', 'TC-01', 0, 0);
    const tanque = new TanqueLogico('T-1', 'Tanque-01', 50, 0);

    const r1 = history.remember({ id: trocador.id, kind: 'heatExchanger', label: trocador.tag, component: trocador });
    assert.equal(r1.changed, true);
    assert.equal(history.getEntries().filter(Boolean).length, 1);
    assert.equal(history.getEntries()[0].kind, 'heatExchanger');
    assert.equal(history.getEntries()[0].id, 'TC-1');

    const r2 = history.remember({ id: tanque.id, kind: 'tank', label: tanque.tag, component: tanque });
    assert.equal(r2.changed, true);
    assert.equal(history.getEntries().filter(Boolean).length, 2);
    assert.equal(history.getEntries()[0].kind, 'heatExchanger');
    assert.equal(history.getEntries()[1].kind, 'tank');
});

test('remoção de slot de monitoramento compacta entradas e limpa o slot secundário sem criar slots fantasmas', () => {
    const history = createMonitorSlotHistory({ maxEntries: 2 });
    const c1 = { id: 'P-1', kind: 'pump' };
    const c2 = { id: 'T-1', kind: 'tank' };

    history.remember(c1);
    history.remember(c2);
    assert.equal(history.getEntries().filter(Boolean).length, 2);
    assert.equal(history.getEntries()[0].id, 'P-1');
    assert.equal(history.getEntries()[1].id, 'T-1');

    // Ao remover o primeiro slot (índice 0), o segundo slot deve ser promovido para o índice 0 e o índice 1 deve ser null
    const resRemove0 = history.removeAt(0);
    assert.equal(resRemove0.changed, true);
    assert.equal(history.getEntries().filter(Boolean).length, 1);
    assert.equal(history.getEntries()[0].id, 'T-1');
    assert.equal(history.getEntries()[1], null);

    // Re-adicionando para testar remoção do índice 1
    history.remember(c1);
    assert.equal(history.getEntries().filter(Boolean).length, 2);
    assert.equal(history.getEntries()[0].id, 'T-1');
    assert.equal(history.getEntries()[1].id, 'P-1');

    const resRemove1 = history.removeAt(1);
    assert.equal(resRemove1.changed, true);
    assert.equal(history.getEntries().filter(Boolean).length, 1);
    assert.equal(history.getEntries()[0].id, 'T-1');
    assert.equal(history.getEntries()[1], null);
});



