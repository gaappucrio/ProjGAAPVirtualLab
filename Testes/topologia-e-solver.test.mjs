import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { FLUID_PRESETS, SistemaSimulacao } from '../js/application/engine/SimulationEngine.js';
import { ConnectionModel } from '../js/domain/models/ConnectionModel.js';
import { BombaLogica } from '../js/domain/components/BombaLogica.js';
import { DrenoLogico } from '../js/domain/components/DrenoLogico.js';
import { FonteLogica } from '../js/domain/components/FonteLogica.js';
import { TanqueLogico } from '../js/domain/components/TanqueLogico.js';
import { TrocadorCalorLogico } from '../js/domain/components/TrocadorCalorLogico.js';
import { ValvulaLogica } from '../js/domain/components/ValvulaLogica.js';

const DOMAIN_ROOT = path.resolve('js/domain');

function createEngine() {
    const engine = new SistemaSimulacao();
    engine.isRunning = true;
    engine.usarAlturaRelativa = false;
    return engine;
}

function runSinglePhysicsStep(engine, dt = 0.1) {
    engine.componentes.forEach((component) => {
        component.atualizarDinamica(dt, engine.hydraulicContext.getComponentFluid(component) || engine.fluidoOperante);
    });
    engine.resolvePushBasedNetwork(dt);
    engine.componentes.forEach((component) => {
        component.sincronizarMetricasFisicas(engine.hydraulicContext.getComponentFluid(component) || engine.fluidoOperante);
    });
}

function runPhysicsSteps(engine, steps = 120, dt = 0.1) {
    for (let i = 0; i < steps; i += 1) {
        runSinglePhysicsStep(engine, dt);
    }
}

function listDomainFiles(dirPath) {
    return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) return listDomainFiles(fullPath);
        return entry.isFile() && fullPath.endsWith('.js') ? [fullPath] : [];
    });
}

test('módulos de domínio não importam engine global, DOM, Chart ou controllers', () => {
    const domainFiles = listDomainFiles(DOMAIN_ROOT);
    const forbiddenImportPatterns = [
        /from\s+['"][^'"]*MotorFisico\.js['"]/,
        /from\s+['"][^'"]*controllers\/[^'"]*['"]/,
        /from\s+['"][^'"]*Chart[^'"]*['"]/,
        /from\s+['"][^'"]*document[^'"]*['"]/
    ];

    domainFiles.forEach((filePath) => {
        const content = fs.readFileSync(filePath, 'utf8');
        forbiddenImportPatterns.forEach((pattern) => {
            assert.ok(
                !pattern.test(content),
                `Import indevido encontrado em ${filePath}: ${pattern}`
            );
        });

        assert.ok(!content.includes('document.'), `Referência direta a document encontrada em ${filePath}`);
        assert.ok(!content.includes('Chart('), `Referência direta a Chart encontrada em ${filePath}`);
    });
});

test('trecho que sai da fonte usa o fluido definido na entrada', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-01', 'inlet-01', 0, 0);
    const dreno = new DrenoLogico('D-01', 'outlet-01', 160, 0);

    fonte.pressaoFonteBar = 2;
    fonte.vazaoMaxima = 40;
    fonte.atualizarFluidoEntrada({
        nome: 'Fluido viscoso',
        densidade: 1200,
        viscosidadeDinamicaPaS: 2,
        pressaoVaporBar: 0.002
    });
    dreno.pressaoSaidaBar = 0;
    fonte.conectarSaida(dreno);

    const connection = new ConnectionModel({ sourceId: fonte.id, targetId: dreno.id });
    engine.add(fonte);
    engine.add(dreno);
    engine.addConnection(connection);

    runSinglePhysicsStep(engine);

    const state = engine.getConnectionState(connection);
    assert.equal(engine.hydraulicContext.getConnectionFluid(connection), fonte.fluidoEntrada);
    assert.ok(state.flowLps > 0, 'A fonte deve fornecer vazao com o fluido de entrada');
    assert.ok(state.reynolds < 1000, 'Reynolds deve refletir a viscosidade configurada na entrada');
});

test('agua tem maior vazao que oleo leve em ramais equivalentes para tanque', () => {
    const measureFlowToTank = (presetId) => {
        const engine = createEngine();
        const fonte = new FonteLogica(`F-${presetId}`, `inlet-${presetId}`, 0, 0);
        const tanque = new TanqueLogico(`T-${presetId}`, `tank-${presetId}`, 160, 0);
        const connection = new ConnectionModel({ sourceId: fonte.id, targetId: tanque.id });

        fonte.pressaoFonteBar = 0.5;
        fonte.vazaoMaxima = 500;
        fonte.atualizarFluidoEntrada(FLUID_PRESETS[presetId], { presetId });
        tanque.volumeAtual = 0;
        tanque.capacidadeMaxima = 100000;
        fonte.conectarSaida(tanque);

        engine.add(fonte);
        engine.add(tanque);
        engine.addConnection(connection);
        runPhysicsSteps(engine, 120, 0.1);

        return engine.getConnectionState(connection).flowLps;
    };

    const waterFlowLps = measureFlowToTank('agua');
    const lightOilFlowLps = measureFlowToTank('oleo_leve');

    assert.ok(
        waterFlowLps > lightOilFlowLps,
        `Água deve escoar mais rápido que óleo leve em ramais iguais: água=${waterFlowLps}, óleo=${lightOilFlowLps}`
    );
});

test('bomba ativa na saida do tanque aumenta vazao sem pressao incoerente', () => {
    const measureTankDrainFlow = (usarAlturaRelativa, withPump) => {
        const engine = createEngine();
        engine.usarAlturaRelativa = usarAlturaRelativa;

        const tanque = new TanqueLogico('T-01', 'T-01', 180, 120);
        const dreno = new DrenoLogico('D-01', 'outlet-01', 520, 260);

        tanque.volumeAtual = 999;
        tanque.capacidadeMaxima = 1000;
        tanque.alturaUtilMetros = 2.4;
        tanque.fluidoConteudo = { ...FLUID_PRESETS.agua };
        tanque.conectarSaida(dreno);
        dreno.pressaoSaidaBar = 0;

        engine.add(tanque);
        engine.add(dreno);

        let pump = null;
        let pumpOutletConnection = null;

        if (withPump) {
            pump = new BombaLogica('P-01', 'P-01', 380, 210);
            pump.vazaoNominal = 45;
            pump.pressaoMaxima = 5;
            pump.grauAcionamento = 100;
            pump.acionamentoEfetivo = 100;
            tanque.saidas = [];
            tanque.conectarSaida(pump);
            pump.conectarSaida(dreno);
            const tankPump = new ConnectionModel({ sourceId: tanque.id, targetId: pump.id });
            pumpOutletConnection = new ConnectionModel({ sourceId: pump.id, targetId: dreno.id });
            engine.add(pump);
            engine.addConnection(tankPump);
            engine.addConnection(pumpOutletConnection);
        } else {
            const tankDrain = new ConnectionModel({ sourceId: tanque.id, targetId: dreno.id });
            engine.addConnection(tankDrain);
        }

        runPhysicsSteps(engine, 30, 0.1);

        if (!withPump) return { flowLps: dreno.vazaoRecebidaLps };

        const outletState = engine.getConnectionState(pumpOutletConnection);
        return {
            flowLps: outletState.flowLps,
            pump
        };
    };

    [false, true].forEach((usarAlturaRelativa) => {
        const direct = measureTankDrainFlow(usarAlturaRelativa, false);
        const pumped = measureTankDrainFlow(usarAlturaRelativa, true);

        assert.ok(
            pumped.flowLps > direct.flowLps * 1.5,
            `Bomba deve elevar a vazao do tanque: altura=${usarAlturaRelativa}, direto=${direct.flowLps}, bomba=${pumped.flowLps}`
        );
        assert.ok(
            pumped.pump.pressaoDescargaAtualBar > pumped.pump.pressaoSucaoAtualBar,
            `Pressao da bomba deve subir atraves do rotor: succao=${pumped.pump.pressaoSucaoAtualBar}, descarga=${pumped.pump.pressaoDescargaAtualBar}`
        );
        assert.ok(
            pumped.pump.fatorCavitacaoAtual > 0.95,
            `Bomba nao deveria cavitar nesse cenario base: fator=${pumped.pump.fatorCavitacaoAtual}`
        );
    });
});

test('bomba na saida de tanque vazio indica falta de liquido na succao', () => {
    const engine = createEngine();
    engine.usarAlturaRelativa = true;

    const tanque = new TanqueLogico('T-01', 'T-01', 180, 120);
    const bomba = new BombaLogica('P-01', 'P-01', 360, 180);
    const dreno = new DrenoLogico('D-01', 'outlet-01', 520, 240);

    tanque.volumeAtual = 0;
    tanque.capacidadeMaxima = 1000;
    tanque.alturaUtilMetros = 2.4;
    tanque.alturaBocalSaidaM = 0.1;
    tanque.fluidoConteudo = { ...FLUID_PRESETS.agua };
    bomba.vazaoNominal = 45;
    bomba.pressaoMaxima = 5;
    bomba.grauAcionamento = 100;
    bomba.acionamentoEfetivo = 100;

    tanque.conectarSaida(bomba);
    bomba.conectarSaida(dreno);

    const tankPump = new ConnectionModel({ sourceId: tanque.id, targetId: bomba.id });
    const pumpDrain = new ConnectionModel({ sourceId: bomba.id, targetId: dreno.id });

    engine.add(tanque);
    engine.add(bomba);
    engine.add(dreno);
    engine.addConnection(tankPump);
    engine.addConnection(pumpDrain);

    runPhysicsSteps(engine, 5, 0.1);

    assert.equal(tanque.volumeAtual, 0);
    assert.equal(bomba.fluxoReal, 0);
    assert.equal(bomba.npshDisponivelM, 0);
    assert.ok(bomba.margemNpshM < 0, `Bomba sem liquido deve ter margem negativa: ${bomba.margemNpshM}`);
    assert.equal(bomba.fatorCavitacaoAtual, 0);
    assert.equal(bomba.getCondicaoSucaoAtual(), 'Sem líquido suficiente');
});

test('bomba sem NPSHa suficiente entra em cavitacao e nao sustenta succao impossivel', () => {
    const engine = createEngine();
    engine.usarAlturaRelativa = true;

    const fonte = new FonteLogica('F-HIGH-LIFT', 'inlet-high-lift', 0, 1000);
    const bomba = new BombaLogica('P-HIGH-LIFT', 'P-HIGH-LIFT', 160, -1000);
    const dreno = new DrenoLogico('D-HIGH-LIFT', 'outlet-high-lift', 320, -900);

    fonte.pressaoFonteBar = 0.5;
    fonte.vazaoMaxima = 500;
    bomba.vazaoNominal = 45;
    bomba.pressaoMaxima = 5;
    bomba.grauAcionamento = 100;
    bomba.acionamentoEfetivo = 100;
    dreno.pressaoSaidaBar = 0;

    fonte.conectarSaida(bomba);
    bomba.conectarSaida(dreno);

    const entradaBomba = new ConnectionModel({ sourceId: fonte.id, targetId: bomba.id });
    const saidaBomba = new ConnectionModel({ sourceId: bomba.id, targetId: dreno.id });

    [fonte, bomba, dreno].forEach((component) => engine.add(component));
    [entradaBomba, saidaBomba].forEach((connection) => engine.addConnection(connection));

    runPhysicsSteps(engine, 20, 0.1);

    assert.equal(engine.getConnectionState(saidaBomba).flowLps, 0);
    assert.equal(bomba.fluxoReal, 0);
    assert.equal(bomba.fatorCavitacaoAtual, 0);
    assert.ok(bomba.margemNpshM < 0, `Bomba sem NPSHa deve ter margem negativa: ${bomba.margemNpshM}`);
    assert.equal(bomba.getCondicaoSucaoAtual(), 'Cavitando');
});

test('vazao em bomba responde a pressao de entrada sem interferencia do set point', () => {
    const medirVazaoComPressaoEntrada = (pressaoFonteBar) => {
        const engine = createEngine();
        const fonte = new FonteLogica(`F-${pressaoFonteBar}`, `Fonte-${pressaoFonteBar}`, 0, 0);
        const bomba = new BombaLogica(`B-${pressaoFonteBar}`, `Bomba-${pressaoFonteBar}`, 120, 0);
        const dreno = new DrenoLogico(`D-${pressaoFonteBar}`, `Dreno-${pressaoFonteBar}`, 240, 0);

        fonte.pressaoFonteBar = pressaoFonteBar;
        fonte.vazaoMaxima = 500;
        bomba.vazaoNominal = 90;
        bomba.pressaoMaxima = 2;
        bomba.grauAcionamento = 100;
        bomba.acionamentoEfetivo = 100;
        dreno.pressaoSaidaBar = 0;

        fonte.conectarSaida(bomba);
        bomba.conectarSaida(dreno);
        const entradaBomba = new ConnectionModel({ sourceId: fonte.id, targetId: bomba.id });
        const saidaBomba = new ConnectionModel({ sourceId: bomba.id, targetId: dreno.id });

        [fonte, bomba, dreno].forEach((component) => engine.add(component));
        [entradaBomba, saidaBomba].forEach((connection) => engine.addConnection(connection));
        runPhysicsSteps(engine, 40, 0.1);

        return {
            vazao: engine.getConnectionState(saidaBomba).flowLps,
            bomba
        };
    };

    const baixaPressao = medirVazaoComPressaoEntrada(0.1);
    const altaPressao = medirVazaoComPressaoEntrada(1.5);

    assert.ok(
        altaPressao.vazao > baixaPressao.vazao * 1.05,
        `A vazao deve crescer com maior pressao de entrada: baixa=${baixaPressao.vazao}, alta=${altaPressao.vazao}`
    );
    assert.ok(
        altaPressao.bomba.pressaoSucaoAtualBar > baixaPressao.bomba.pressaoSucaoAtualBar,
        'A pressao de succao da bomba deve refletir a pressao imposta na entrada'
    );
});

test('valvula totalmente aberta com Cv alto se aproxima de tubo equivalente', () => {
    const buildTank = (id) => {
        const tanque = new TanqueLogico(id, id, 0, 0);
        tanque.volumeAtual = 999;
        tanque.capacidadeMaxima = 1000;
        tanque.alturaUtilMetros = 2.4;
        tanque.fluidoConteudo = { ...FLUID_PRESETS.agua };
        return tanque;
    };

    const measureEquivalentPipe = () => {
        const engine = createEngine();
        const tanque = buildTank('T-pipe');
        const dreno = new DrenoLogico('D-pipe', 'D-pipe', 200, 0);
        const connection = new ConnectionModel({
            sourceId: tanque.id,
            targetId: dreno.id,
            extraLengthM: 1,
            perdaLocalK: 0
        });

        tanque.conectarSaida(dreno);
        engine.add(tanque);
        engine.add(dreno);
        engine.addConnection(connection);
        runPhysicsSteps(engine, 60, 0.1);

        return engine.getConnectionState(connection).flowLps;
    };

    const measureTransparentValve = () => {
        const engine = createEngine();
        const tanque = buildTank('T-valve');
        const valvula = new ValvulaLogica('V-transparent', 'V-transparent', 100, 0);
        const dreno = new DrenoLogico('D-valve', 'D-valve', 200, 0);

        valvula.aplicarPerfilCaracteristica('custom');
        valvula.setCoeficienteVazao(250);
        valvula.setCoeficientePerda(0);
        valvula.setTipoCaracteristica('linear');
        valvula.setAbertura(100);
        valvula.aberturaEfetiva = 100;

        tanque.conectarSaida(valvula);
        valvula.conectarSaida(dreno);

        const entradaValvula = new ConnectionModel({ sourceId: tanque.id, targetId: valvula.id, perdaLocalK: 0 });
        const saidaValvula = new ConnectionModel({ sourceId: valvula.id, targetId: dreno.id, perdaLocalK: 0 });

        [tanque, valvula, dreno].forEach((component) => engine.add(component));
        [entradaValvula, saidaValvula].forEach((connection) => engine.addConnection(connection));
        runPhysicsSteps(engine, 60, 0.1);

        return engine.getConnectionState(saidaValvula).flowLps;
    };

    const pipeFlow = measureEquivalentPipe();
    const valveFlow = measureTransparentValve();
    const relativeDifference = Math.abs(pipeFlow - valveFlow) / pipeFlow;

    assert.ok(
        relativeDifference < 0.03,
        `Valvula transparente deve se aproximar de tubo equivalente: tubo=${pipeFlow}, valvula=${valveFlow}`
    );
});

test('valvula mistura fluidos de multiplas entradas e entrega composicao ao tanque', () => {
    const engine = createEngine();
    const fonteAgua = new FonteLogica('F-agua', 'inlet-agua', 0, -40);
    const fonteOleo = new FonteLogica('F-oleo', 'inlet-oleo', 0, 40);
    const valvula = new ValvulaLogica('V-mix', 'V-mix', 140, 0);
    const tanque = new TanqueLogico('T-mix', 'tank-mix', 280, 0);

    fonteAgua.pressaoFonteBar = 1.5;
    fonteOleo.pressaoFonteBar = 1.5;
    fonteAgua.vazaoMaxima = 80;
    fonteOleo.vazaoMaxima = 80;
    fonteAgua.atualizarFluidoEntrada(FLUID_PRESETS.agua, { presetId: 'agua' });
    fonteOleo.atualizarFluidoEntrada(FLUID_PRESETS.oleo_leve, { presetId: 'oleo_leve' });
    valvula.aberta = true;
    valvula.grauAbertura = 100;
    valvula.aberturaEfetiva = 100;
    tanque.capacidadeMaxima = 100000;
    tanque.volumeAtual = 0;

    fonteAgua.conectarSaida(valvula);
    fonteOleo.conectarSaida(valvula);
    valvula.conectarSaida(tanque);

    const aguaValvula = new ConnectionModel({ sourceId: fonteAgua.id, targetId: valvula.id });
    const oleoValvula = new ConnectionModel({ sourceId: fonteOleo.id, targetId: valvula.id });
    const valvulaTanque = new ConnectionModel({ sourceId: valvula.id, targetId: tanque.id });

    [fonteAgua, fonteOleo, valvula, tanque].forEach((component) => engine.add(component));
    [aguaValvula, oleoValvula, valvulaTanque].forEach((connection) => engine.addConnection(connection));

    for (let i = 0; i < 3; i += 1) {
        engine.componentes.forEach((component) => component.atualizarDinamica(0.1, engine.fluidoOperante));
        engine.resolvePushBasedNetwork(0.1);
        tanque.atualizarFisica(0.1, engine.hydraulicContext.getComponentFluid(tanque));
        [fonteAgua, fonteOleo, valvula].forEach((component) => component.sincronizarMetricasFisicas(engine.hydraulicContext.getComponentFluid(component)));
    }

    const mixedState = engine.getConnectionState(valvulaTanque);
    const mixedFluid = mixedState.fluid;

    assert.ok(mixedState.flowLps > 0, 'A valvula deve entregar vazao ao tanque');
    assert.ok(mixedFluid.composicao['Água'] > 0, 'Mistura deve conter agua');
    assert.ok(mixedFluid.composicao['Óleo leve'] > 0, 'Mistura deve conter oleo leve');
    assert.ok(
        mixedFluid.densidade > FLUID_PRESETS.oleo_leve.densidade && mixedFluid.densidade < FLUID_PRESETS.agua.densidade,
        `Densidade misturada deve ficar entre oleo e agua: ${mixedFluid.densidade}`
    );
    assert.ok(tanque.fluidoConteudo.composicao['Água'] > 0, 'Tanque deve armazenar agua da mistura');
    assert.ok(tanque.fluidoConteudo.composicao['Óleo leve'] > 0, 'Tanque deve armazenar oleo da mistura');
});

test('topologia indexa componentes e conexões sem depender de DOM', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-01', 'Fonte-01', 0, 0);
    const valvula = new ValvulaLogica('V-01', 'Valvula-01', 80, 0);
    const dreno = new DrenoLogico('D-01', 'Dreno-01', 160, 0);

    engine.add(fonte);
    engine.add(valvula);
    engine.add(dreno);

    const conn1 = new ConnectionModel({ sourceId: fonte.id, targetId: valvula.id });
    const conn2 = new ConnectionModel({ sourceId: valvula.id, targetId: dreno.id });

    engine.addConnection(conn1);
    engine.addConnection(conn2);

    assert.equal(engine.getComponentById('F-01'), fonte, 'Lookup de componente deve vir do índice da topologia');
    assert.deepEqual(engine.getOutputConnections(fonte).map((conn) => conn.id), [conn1.id], 'Fonte deve enxergar a conexão de saída');
    assert.deepEqual(engine.getInputConnections(dreno).map((conn) => conn.id), [conn2.id], 'Dreno deve enxergar a conexão de entrada');

    engine.removeConnection(conn1);
    assert.equal(engine.getOutputConnections(fonte).length, 0, 'Remoção de conexão deve atualizar o índice de saída');

    engine.removeComponent(valvula);
    assert.equal(engine.getComponentById(valvula.id), null, 'Componente removido não deve permanecer no índice');
    assert.equal(engine.conexoes.length, 0, 'Conexões remanescentes do componente removido devem ser eliminadas');
});

test('solver mantém fluxo em série com conexão puramente lógica', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-01', 'Fonte-01', 0, 0);
    const valvula = new ValvulaLogica('V-01', 'Valvula-01', 80, 0);
    const dreno = new DrenoLogico('D-01', 'Dreno-01', 160, 0);

    fonte.pressaoFonteBar = 1.8;
    fonte.vazaoMaxima = 40;
    valvula.setAbertura(100);
    dreno.pressaoSaidaBar = 0;

    fonte.conectarSaida(valvula);
    valvula.conectarSaida(dreno);

    const entradaValvula = new ConnectionModel({ sourceId: fonte.id, targetId: valvula.id });
    const saidaValvula = new ConnectionModel({ sourceId: valvula.id, targetId: dreno.id });

    engine.add(fonte);
    engine.add(valvula);
    engine.add(dreno);
    engine.addConnection(entradaValvula);
    engine.addConnection(saidaValvula);

    runSinglePhysicsStep(engine);

    const entradaState = engine.getConnectionState(entradaValvula);
    const saidaState = engine.getConnectionState(saidaValvula);

    assert.ok(fonte.fluxoReal > 0, 'A fonte deve fornecer vazão');
    assert.ok(valvula.fluxoReal > 0, 'A válvula deve receber vazão na malha em série');
    assert.ok(dreno.vazaoRecebidaLps > 0, 'O dreno deve receber vazão na malha em série');
    assert.ok(Math.abs(entradaState.flowLps - saidaState.flowLps) < 1e-6, 'Conexões em série devem conservar a vazão');
    assert.ok(entradaState.sourcePressureBar > saidaState.outletPressureBar, 'Pressão deve cair de montante para jusante em ramo passivo');
    assert.ok(engine.conexoes.every((conn) => conn.lastResolvedFlowLps >= 0), 'As conexões devem registrar vazões resolvidas válidas');
});

test('solver propaga temperatura alterada pelo trocador de calor', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-HX', 'Fonte-HX', 0, 0);
    const trocador = new TrocadorCalorLogico('HX-01', 'TC-01', 120, 0);
    const dreno = new DrenoLogico('D-HX', 'Dreno-HX', 240, 0);

    fonte.pressaoFonteBar = 2;
    fonte.vazaoMaxima = 40;
    fonte.atualizarFluidoEntrada({
        ...FLUID_PRESETS.agua,
        temperatura: 20
    }, { presetId: 'agua' });
    trocador.temperaturaServicoC = 80;
    trocador.uaWPorK = 8000;
    dreno.pressaoSaidaBar = 0;

    fonte.conectarSaida(trocador);
    trocador.conectarSaida(dreno);

    const entradaHx = new ConnectionModel({ sourceId: fonte.id, targetId: trocador.id });
    const saidaHx = new ConnectionModel({ sourceId: trocador.id, targetId: dreno.id });

    [fonte, trocador, dreno].forEach((component) => engine.add(component));
    [entradaHx, saidaHx].forEach((connection) => engine.addConnection(connection));

    runPhysicsSteps(engine, 30, 0.1);

    const entradaState = engine.getConnectionState(entradaHx);
    const saidaState = engine.getConnectionState(saidaHx);

    assert.ok(saidaState.flowLps > 0, 'O trocador deve entregar vazao ao dreno');
    assert.ok(trocador.fluxoReal > 0, 'O trocador deve registrar vazao passante');
    assert.ok(saidaState.fluid.temperatura > entradaState.fluid.temperatura, 'A conexao de saida deve carregar fluido aquecido');
    assert.ok(trocador.cargaTermicaW > 0, 'A carga termica deve ser positiva no aquecimento');
    assert.ok(
        Math.abs(fonte.fluxoReal - dreno.vazaoRecebidaLps) < 1e-6,
        'A vazao deve ser conservada atraves do trocador'
    );
});

test('solver distribui fluxo em bifurcação simples', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-01', 'Fonte-01', 0, 0);
    const drenoA = new DrenoLogico('D-01', 'Dreno-01', 120, -40);
    const drenoB = new DrenoLogico('D-02', 'Dreno-02', 120, 40);

    fonte.pressaoFonteBar = 2.0;
    fonte.vazaoMaxima = 60;

    fonte.conectarSaida(drenoA);
    fonte.conectarSaida(drenoB);

    const ramoA = new ConnectionModel({ sourceId: fonte.id, targetId: drenoA.id });
    const ramoB = new ConnectionModel({ sourceId: fonte.id, targetId: drenoB.id });

    engine.add(fonte);
    engine.add(drenoA);
    engine.add(drenoB);
    engine.addConnection(ramoA);
    engine.addConnection(ramoB);

    runSinglePhysicsStep(engine);

    const flowA = engine.getConnectionState(ramoA).flowLps;
    const flowB = engine.getConnectionState(ramoB).flowLps;

    assert.ok(drenoA.vazaoRecebidaLps > 0, 'O primeiro ramo da bifurcação deve receber fluxo');
    assert.ok(drenoB.vazaoRecebidaLps > 0, 'O segundo ramo da bifurcação deve receber fluxo');
    assert.ok(Math.abs(flowA - flowB) < 1e-6, `Ramos equivalentes devem receber vazões equivalentes: A=${flowA}, B=${flowB}`);
    assert.ok(fonte.fluxoReal >= drenoA.vazaoRecebidaLps + drenoB.vazaoRecebidaLps - 1e-9, 'A fonte deve suprir a soma dos ramos');
});

test('solver conserva massa em cadeia longa de componentes passantes', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-01', 'Fonte-01', 0, 0);
    const dreno = new DrenoLogico('D-01', 'Dreno-01', 600, 0);
    const valvulas = Array.from({ length: 5 }, (_, index) => {
        const valvula = new ValvulaLogica(`V-${index + 1}`, `Válvula-${index + 1}`, 80 * (index + 1), 0);
        valvula.aplicarPerfilCaracteristica('quick_opening');
        valvula.setCoeficienteVazao(60);
        valvula.setCoeficientePerda(0.1);
        valvula.setAbertura(100);
        return valvula;
    });

    fonte.pressaoFonteBar = 2.0;
    fonte.vazaoMaxima = 150;

    [fonte, ...valvulas, dreno].forEach((component) => engine.add(component));
    [fonte, ...valvulas].forEach((source, index, chain) => {
        const target = index === chain.length - 1 ? dreno : chain[index + 1];
        source.conectarSaida(target);
        engine.addConnection(new ConnectionModel({ sourceId: source.id, targetId: target.id }));
    });

    runPhysicsSteps(engine, 180);

    assert.ok(dreno.vazaoRecebidaLps > 0, 'A cadeia longa ainda deve entregar alguma vazão com válvulas abertas');
    assert.ok(
        Math.abs(fonte.fluxoReal - dreno.vazaoRecebidaLps) < 1e-6,
        'A vazão da fonte deve ser igual à vazão recebida no final da cadeia'
    );
    valvulas.forEach((valvula) => {
        assert.ok(
            Math.abs(valvula.estadoHidraulico.entradaVazaoLps - valvula.estadoHidraulico.saidaVazaoLps) < 1e-6,
            `${valvula.id} deve conservar massa entre entrada e saída`
        );
    });
});

test('solver conserva massa em rede com 30 componentes e múltiplas saídas', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-30', 'Fonte-30', 0, 0);
    const drenos = Array.from({ length: 29 }, (_, index) =>
        new DrenoLogico(`D-${index + 1}`, `Saída-${index + 1}`, 120, index * 20)
    );

    fonte.pressaoFonteBar = 2.0;
    fonte.vazaoMaxima = 500;

    [fonte, ...drenos].forEach((component) => engine.add(component));
    drenos.forEach((dreno) => {
        fonte.conectarSaida(dreno);
        engine.addConnection(new ConnectionModel({ sourceId: fonte.id, targetId: dreno.id }));
    });

    runPhysicsSteps(engine, 180);

    const totalSaidasLps = drenos.reduce((sum, dreno) => sum + dreno.vazaoRecebidaLps, 0);
    assert.equal(engine.componentes.length, 30);
    assert.ok(totalSaidasLps > 0, 'A rede de 30 componentes deve manter escoamento');
    assert.ok(
        Math.abs(fonte.fluxoReal - totalSaidasLps) < 1e-6,
        'A vazão da fonte deve bater com a soma das múltiplas saídas'
    );
});
