import assert from 'node:assert/strict';
import test from 'node:test';

import { FLUID_PRESETS, SistemaSimulacao } from '../js/application/engine/SimulationEngine.js';
import { createSimulationContext } from '../js/domain/context/SimulationContext.js';
import { ConnectionModel } from '../js/domain/models/ConnectionModel.js';
import { DrenoLogico } from '../js/domain/components/DrenoLogico.js';
import { FonteLogica } from '../js/domain/components/FonteLogica.js';
import { TanqueLogico } from '../js/domain/components/TanqueLogico.js';
import { ValvulaLogica } from '../js/domain/components/ValvulaLogica.js';

function createEngine() {
    const engine = new SistemaSimulacao();
    engine.isRunning = true;
    return engine;
}

test('altura relativa vem desligada por padrão', () => {
    const engine = new SistemaSimulacao();
    const context = createSimulationContext();

    assert.equal(engine.usarAlturaRelativa, false);
    assert.equal(context.usarAlturaRelativa, false);
});

test('fluido inicial corresponde visualmente ao preset Água', () => {
    const engine = new SistemaSimulacao();
    const agua = FLUID_PRESETS.agua;

    assert.equal(engine.fluidoOperante.nome, agua.nome);
    assert.equal(engine.fluidoOperante.densidade, agua.densidade);
    assert.equal(engine.fluidoOperante.temperatura, agua.temperatura);
    assert.equal(engine.fluidoOperante.viscosidadeDinamicaPaS, agua.viscosidadeDinamicaPaS);
    assert.equal(engine.fluidoOperante.pressaoVaporBar, agua.pressaoVaporBar);
});

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

    assert.equal(schematicGeometry.straightLengthM, 1);
    assert.equal(schematicGeometry.headGainM, 0);
    assert.notEqual(relativeGeometry.straightLengthM, schematicGeometry.straightLengthM);
    assert.notEqual(relativeGeometry.headGainM, 0);
});

test('pausa da simulação zera vazões atuais do tanque sem alterar volume', () => {
    const tanque = new TanqueLogico('T-02', 'Tanque-02', 0, 0);
    const volumeAntesDaPausa = 420;

    tanque.volumeAtual = volumeAntesDaPausa;
    tanque.capacidadeMaxima = 1000;
    tanque.lastQin = 12;
    tanque.lastQout = 4;
    tanque.registrarEntrada(12, 1.2);
    tanque.registrarSaida(4, 1.1);

    let ultimoEventoVolume = null;
    tanque.subscribe((dados) => {
        if (dados.tipo === 'volume') ultimoEventoVolume = dados;
    });

    tanque.onSimulationStop();

    assert.equal(tanque.volumeAtual, volumeAntesDaPausa);
    assert.equal(tanque.lastQin, 0);
    assert.equal(tanque.lastQout, 0);
    assert.equal(tanque.estadoHidraulico.entradaVazaoLps, 0);
    assert.equal(tanque.estadoHidraulico.saidaVazaoLps, 0);
    assert.equal(ultimoEventoVolume.qIn, 0);
    assert.equal(ultimoEventoVolume.qOut, 0);
});
