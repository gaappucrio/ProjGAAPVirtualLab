import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { FLUID_PRESETS, SistemaSimulacao } from '../js/application/engine/SimulationEngine.js';
import { ConnectionModel } from '../js/domain/models/ConnectionModel.js';
import { analyzeHydraulicNetwork } from '../js/domain/services/HydraulicNetworkAnalyzer.js';
import { BombaLogica } from '../js/domain/components/BombaLogica.js';
import { DrenoLogico } from '../js/domain/components/DrenoLogico.js';
import { FonteLogica } from '../js/domain/components/FonteLogica.js';
import { TanqueLogico } from '../js/domain/components/TanqueLogico.js';
import { TrocadorCalorLogico } from '../js/domain/components/TrocadorCalorLogico.js';
import { ValvulaLogica } from '../js/domain/components/ValvulaLogica.js';
import { buildNetworkDiagnosticState } from '../js/presentation/controllers/NetworkDiagnosticsController.js';

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

function runAutomaticPhysicsStep(engine, dt = 0.1) {
    engine.componentes.forEach((component) => {
        component.atualizarDinamica(dt, engine.hydraulicContext.getComponentFluid(component) || engine.fluidoOperante);
    });
    engine.resolveHydraulicNetwork(dt);
    engine.componentes.forEach((component) => {
        const fluid = engine.hydraulicContext.getComponentFluid(component) || engine.fluidoOperante;
        if (component instanceof TanqueLogico) component.atualizarFisica(dt, fluid);
        else component.sincronizarMetricasFisicas(fluid);
    });
}

function runAutomaticPhysicsSteps(engine, steps = 60, dt = 0.1) {
    for (let i = 0; i < steps; i += 1) {
        runAutomaticPhysicsStep(engine, dt);
    }
}

function runControlledAutomaticPhysicsStep(engine, dt = 0.1) {
    engine.tickPipeline.updateHighLevelControls(dt);
    engine.componentes.forEach((component) => {
        component.atualizarDinamica(dt, engine.hydraulicContext.getComponentFluid(component) || engine.fluidoOperante);
    });
    engine.resolveHydraulicNetwork(dt);
    engine.componentes.forEach((component) => {
        const fluid = engine.hydraulicContext.getComponentFluid(component) || engine.fluidoOperante;
        if (component instanceof TanqueLogico) component.atualizarFisica(dt, fluid);
        else component.sincronizarMetricasFisicas(fluid);
    });
}

function runControlledAutomaticPhysicsSteps(engine, steps = 60, dt = 0.1) {
    for (let i = 0; i < steps; i += 1) {
        runControlledAutomaticPhysicsStep(engine, dt);
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

test('Cano que sai da fonte usa o fluido definido na entrada', () => {
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
        valvula.setCoeficienteVazao(800);
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

test('valvula controlada quase fechada nao vaza quando exibida como 0.0%', () => {
    const engine = createEngine();
    const tanque = new TanqueLogico('T-fecha-sp', 'T-fecha-sp', 0, 0);
    const valvula = new ValvulaLogica('V-fecha-sp', 'V-fecha-sp', 120, 0);
    const dreno = new DrenoLogico('D-fecha-sp', 'D-fecha-sp', 240, 0);

    tanque.volumeAtual = 800;
    tanque.capacidadeMaxima = 1000;
    tanque.alturaUtilMetros = 2.4;
    tanque.fluidoConteudo = { ...FLUID_PRESETS.agua };
    valvula.aplicarControleNivel({ abertura: 0.01, intensidade: 0.0001, ownerId: tanque.id });
    valvula.aberturaEfetiva = 0.01;

    tanque.conectarSaida(valvula);
    valvula.conectarSaida(dreno);

    const entradaValvula = new ConnectionModel({ sourceId: tanque.id, targetId: valvula.id });
    const saidaValvula = new ConnectionModel({ sourceId: valvula.id, targetId: dreno.id });

    [tanque, valvula, dreno].forEach((component) => engine.add(component));
    [entradaValvula, saidaValvula].forEach((connection) => engine.addConnection(connection));

    const volumeInicial = tanque.volumeAtual;
    runAutomaticPhysicsSteps(engine, 3, 0.1);

    assert.equal(valvula.grauAbertura, 0);
    assert.equal(valvula.getAberturaNormalizadaAtual(), 0);
    assert.equal(engine.getConnectionState(entradaValvula).flowLps, 0);
    assert.equal(engine.getConnectionState(saidaValvula).flowLps, 0);
    assert.equal(tanque.volumeAtual, volumeInicial);
});

test('conexoes adicionadas com simulacao em andamento entram em rampa hidraulica', () => {
    const engine = createEngine();
    engine.elapsedTime = 5;

    const tanque = new TanqueLogico('T-live-ramp', 'T-live-ramp', 0, 0);
    tanque.volumeAtual = 500;
    tanque.capacidadeMaxima = 1000;
    tanque.fluidoConteudo = { ...FLUID_PRESETS.agua };
    engine.add(tanque);

    const conexoes = [];
    for (let index = 0; index < 10; index += 1) {
        const valvula = new ValvulaLogica(`V-live-${index}`, `V-live-${index}`, 120, index * 20);
        const dreno = new DrenoLogico(`D-live-${index}`, `D-live-${index}`, 240, index * 20);

        valvula.aplicarPerfilCaracteristica('custom');
        valvula.setCoeficienteVazao(250);
        valvula.setCoeficientePerda(0);
        valvula.setTipoCaracteristica('linear');
        valvula.setAbertura(100);
        valvula.aberturaEfetiva = 100;

        engine.add(valvula);
        engine.add(dreno);
        tanque.conectarSaida(valvula);
        valvula.conectarSaida(dreno);

        const entradaValvula = new ConnectionModel({ sourceId: tanque.id, targetId: valvula.id });
        const saidaValvula = new ConnectionModel({ sourceId: valvula.id, targetId: dreno.id });
        engine.addConnection(entradaValvula);
        engine.addConnection(saidaValvula);
        conexoes.push(entradaValvula, saidaValvula);
    }

    assert.ok(
        conexoes.every((connection) => connection.startupRampDurationS > 0),
        'Conexoes criadas durante a simulacao devem receber rampa inicial'
    );

    const volumeInicial = tanque.volumeAtual;
    runAutomaticPhysicsStep(engine, 0.1);
    const primeiraVazaoSaida = tanque.lastQout;
    const primeiraQuedaL = volumeInicial - tanque.volumeAtual;

    assert.ok(
        primeiraQuedaL < 1,
        `A rampa deve evitar queda brusca no primeiro tick: queda=${primeiraQuedaL} L`
    );
    assert.ok(
        primeiraVazaoSaida < 5,
        `A vazao inicial deve ser suavizada antes de atingir o regime: qout=${primeiraVazaoSaida} L/s`
    );

    runAutomaticPhysicsSteps(engine, 14, 0.1);

    assert.ok(
        conexoes.every((connection) => connection.startupRampDurationS === 0),
        'A rampa deve terminar apos o periodo de partida'
    );
    assert.ok(
        tanque.lastQout > 20,
        `A rede deve atingir vazao normal apos a rampa: qout=${tanque.lastQout} L/s`
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

test('fonte limitada por vazao nao sustenta pressao nominal no dreno', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-limited', 'F-limited', 0, 0);
    const dreno = new DrenoLogico('D-limited', 'D-limited', 160, 0);

    fonte.pressaoFonteBar = 10;
    fonte.vazaoMaxima = 1;
    dreno.pressaoSaidaBar = 0;
    fonte.conectarSaida(dreno);

    const connection = new ConnectionModel({ sourceId: fonte.id, targetId: dreno.id });
    engine.add(fonte);
    engine.add(dreno);
    engine.addConnection(connection);

    runPhysicsSteps(engine, 60, 0.1);

    const state = engine.getConnectionState(connection);

    assert.ok(Math.abs(state.flowLps - fonte.vazaoMaxima) < 1e-6, `Fonte deve respeitar limite de vazao: ${state.flowLps}`);
    assert.ok(
        state.outletPressureBar <= dreno.pressaoSaidaBar + 1e-9,
        `Dreno de pressao fixa nao deve receber pressao nominal da fonte limitada: ${state.outletPressureBar}`
    );
    assert.ok(
        Math.abs(dreno.pressaoEntradaAtualBar - dreno.pressaoSaidaBar) < 1e-9,
        `Pressao final do dreno deve preservar zero como valor valido: ${dreno.pressaoEntradaAtualBar}`
    );
    assert.ok(
        state.sourcePressureBar < fonte.pressaoFonteBar * 0.01,
        `Pressao efetiva deve cair quando a fonte satura em vazao: ${state.sourcePressureBar}`
    );
    assert.ok(
        Math.abs(state.deltaPBar + state.targetLossBar - state.totalLossBar) < 1e-9,
        'Perdas registradas devem ser consistentes com a vazao efetiva'
    );
});

test('solver automatico usa modelo nodal em circuito fechado com bomba', () => {
    const engine = createEngine();
    const bomba = new BombaLogica('P-loop', 'P-loop', 0, 0);
    const valvula = new ValvulaLogica('V-loop', 'V-loop', 140, 0);

    bomba.vazaoNominal = 60;
    bomba.pressaoMaxima = 4;
    bomba.grauAcionamento = 100;
    bomba.acionamentoEfetivo = 100;
    valvula.aplicarPerfilCaracteristica('custom');
    valvula.setCoeficienteVazao(250);
    valvula.setCoeficientePerda(0);
    valvula.setTipoCaracteristica('linear');
    valvula.setAbertura(100);
    valvula.aberturaEfetiva = 100;

    bomba.conectarSaida(valvula);
    valvula.conectarSaida(bomba);

    const pumpValve = new ConnectionModel({ sourceId: bomba.id, targetId: valvula.id });
    const valvePump = new ConnectionModel({ sourceId: valvula.id, targetId: bomba.id });

    [bomba, valvula].forEach((component) => engine.add(component));
    [pumpValve, valvePump].forEach((connection) => engine.addConnection(connection));

    runAutomaticPhysicsSteps(engine, 8, 0.1);

    const pumpValveFlow = engine.getConnectionState(pumpValve).flowLps;
    const valvePumpFlow = engine.getConnectionState(valvePump).flowLps;
    const metrics = engine.getSolverMetrics();

    assert.equal(metrics.mode, 'nodal');
    assert.equal(metrics.networkAnalysis.hasDirectedCycle, true);
    assert.ok(
        pumpValveFlow > 0,
        `Circuito fechado primado com bomba ativa deve circular fluido: vazao=${pumpValveFlow}`
    );
    assert.ok(
        Math.abs(pumpValveFlow - valvePumpFlow) < 1e-4,
        `Circuito fechado deve conservar vazao no loop: ida=${pumpValveFlow}, retorno=${valvePumpFlow}`
    );
    assert.ok(
        bomba.pressaoDescargaAtualBar > bomba.pressaoSucaoAtualBar,
        'Bomba no circuito fechado deve elevar a pressao entre succao e descarga'
    );
});

test('bomba em circuito fechado nao atravessa valvula fechada', () => {
    const engine = createEngine();
    const bomba = new BombaLogica('P-loop-closed', 'P-loop-closed', 0, 0);
    const valvula = new ValvulaLogica('V-loop-closed', 'V-loop-closed', 140, 0);

    bomba.vazaoNominal = 60;
    bomba.pressaoMaxima = 4;
    bomba.grauAcionamento = 100;
    bomba.acionamentoEfetivo = 100;
    valvula.setAbertura(0);
    valvula.aberturaEfetiva = 0;

    bomba.conectarSaida(valvula);
    valvula.conectarSaida(bomba);

    const pumpValve = new ConnectionModel({ sourceId: bomba.id, targetId: valvula.id });
    const valvePump = new ConnectionModel({ sourceId: valvula.id, targetId: bomba.id });

    [bomba, valvula].forEach((component) => engine.add(component));
    [pumpValve, valvePump].forEach((connection) => engine.addConnection(connection));

    runAutomaticPhysicsSteps(engine, 4, 0.1);

    const metrics = engine.getSolverMetrics();

    assert.equal(metrics.mode, 'nodal');
    assert.equal(valvula.getAberturaNormalizadaAtual(), 0);
    assert.equal(engine.getConnectionState(pumpValve).flowLps, 0);
    assert.equal(engine.getConnectionState(valvePump).flowLps, 0);
    assert.equal(valvula.fluxoReal, 0);
    assert.equal(bomba.fluxoReal, 0);
    assert.ok(
        metrics.lastDiagnostics.some((diagnostic) => diagnostic.code === 'floating_closed_loop_blocked'),
        'Malha fechada bloqueada deve registrar diagnostico fisico explicito'
    );
});

test('malha com tanques nao escoa por bomba desligada nem valvula fechada', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-boundary-loop', 'Entrada-boundary-loop', 0, 0);
    const tanqueA = new TanqueLogico('T-boundary-A', 'T-boundary-A', 140, 0);
    const bomba = new BombaLogica('P-boundary-off', 'P-boundary-off', 280, 0);
    const tanqueB = new TanqueLogico('T-boundary-B', 'T-boundary-B', 420, 0);
    const valvula = new ValvulaLogica('V-boundary-closed', 'V-boundary-closed', 560, 0);

    fonte.pressaoFonteBar = 0.5;
    fonte.vazaoMaxima = 8.8889;
    tanqueA.volumeAtual = 900;
    tanqueA.capacidadeMaxima = 1000;
    tanqueB.volumeAtual = 850;
    tanqueB.capacidadeMaxima = 1000;
    bomba.grauAcionamento = 0;
    bomba.acionamentoEfetivo = 0;
    valvula.setAbertura(0);
    valvula.aberturaEfetiva = 0;

    fonte.conectarSaida(tanqueA);
    tanqueA.conectarSaida(bomba);
    bomba.conectarSaida(tanqueB);
    tanqueB.conectarSaida(valvula);
    valvula.conectarSaida(tanqueA);

    const fonteTanque = new ConnectionModel({ sourceId: fonte.id, targetId: tanqueA.id });
    const tanqueBomba = new ConnectionModel({ sourceId: tanqueA.id, targetId: bomba.id });
    const bombaTanque = new ConnectionModel({ sourceId: bomba.id, targetId: tanqueB.id });
    const tanqueValvula = new ConnectionModel({ sourceId: tanqueB.id, targetId: valvula.id });
    const valvulaTanque = new ConnectionModel({ sourceId: valvula.id, targetId: tanqueA.id });

    [fonte, tanqueA, bomba, tanqueB, valvula].forEach((component) => engine.add(component));
    [fonteTanque, tanqueBomba, bombaTanque, tanqueValvula, valvulaTanque].forEach((connection) => engine.addConnection(connection));

    runAutomaticPhysicsSteps(engine, 6, 0.1);

    const metrics = engine.getSolverMetrics();

    assert.equal(metrics.mode, 'nodal');
    assert.ok(engine.getConnectionState(fonteTanque).flowLps > 0, 'A fonte ainda deve conseguir alimentar o tanque a montante');
    assert.equal(engine.getConnectionState(tanqueBomba).flowLps, 0);
    assert.equal(engine.getConnectionState(bombaTanque).flowLps, 0);
    assert.equal(engine.getConnectionState(tanqueValvula).flowLps, 0);
    assert.equal(engine.getConnectionState(valvulaTanque).flowLps, 0);
    assert.equal(bomba.fluxoReal, 0);
    assert.equal(valvula.fluxoReal, 0);
    assert.ok(
        !metrics.lastDiagnostics.some((diagnostic) => diagnostic.code === 'nodal_singular_matrix'),
        'Atuadores totalmente fechados nao devem deixar nos mortos produzirem matriz singular'
    );
});

test('malha fechada passiva sem fronteira nao cria vazao artificial', () => {
    const engine = createEngine();
    const valvulaA = new ValvulaLogica('V-passiva-A', 'V-passiva-A', 0, 0);
    const valvulaB = new ValvulaLogica('V-passiva-B', 'V-passiva-B', 140, 0);

    [valvulaA, valvulaB].forEach((valvula) => {
        valvula.aplicarPerfilCaracteristica('quick_opening');
        valvula.setAbertura(100);
        valvula.aberturaEfetiva = 100;
    });

    valvulaA.conectarSaida(valvulaB);
    valvulaB.conectarSaida(valvulaA);

    const ida = new ConnectionModel({ sourceId: valvulaA.id, targetId: valvulaB.id });
    const volta = new ConnectionModel({ sourceId: valvulaB.id, targetId: valvulaA.id });

    [valvulaA, valvulaB].forEach((component) => engine.add(component));
    [ida, volta].forEach((connection) => engine.addConnection(connection));

    runAutomaticPhysicsStep(engine, 0.1);

    const metrics = engine.getSolverMetrics();
    assert.equal(metrics.mode, 'nodal');
    assert.equal(engine.getConnectionState(ida).flowLps, 0);
    assert.equal(engine.getConnectionState(volta).flowLps, 0);
    assert.ok(
        metrics.lastDiagnostics.some((diagnostic) => diagnostic.code === 'floating_passive_closed_loop'),
        'Malha passiva flutuante deve produzir diagnostico explicito'
    );
});

test('diagnostico de rede avisa malhas fechadas antes do solver nodal', () => {
    const bomba = new BombaLogica('P-loop-diag', 'P-loop-diag', 0, 0);
    const valvula = new ValvulaLogica('V-loop-diag', 'V-loop-diag', 140, 0);
    const connections = [
        new ConnectionModel({ sourceId: bomba.id, targetId: valvula.id }),
        new ConnectionModel({ sourceId: valvula.id, targetId: bomba.id })
    ];

    bomba.grauAcionamento = 100;
    bomba.acionamentoEfetivo = 100;
    bomba.vazaoNominal = 60;
    bomba.pressaoMaxima = 4;
    bomba.conectarSaida(valvula);
    valvula.conectarSaida(bomba);

    const analysis = analyzeHydraulicNetwork({
        componentes: [bomba, valvula],
        conexoes: connections
    });
    const diagnostic = buildNetworkDiagnosticState(analysis);

    assert.equal(analysis.hasDirectedCycle, true);
    assert.equal(diagnostic.visible, true);
    assert.equal(diagnostic.code, 'floating_active_closed_loop');
    assert.equal(diagnostic.activePumpFloatingCount, 1);
});

test('diagnostico de rede fica silencioso em rede aberta dirigida', () => {
    const fonte = new FonteLogica('F-open-diag', 'F-open-diag', 0, 0);
    const tanque = new TanqueLogico('T-open-diag', 'T-open-diag', 120, 0);
    const dreno = new DrenoLogico('D-open-diag', 'D-open-diag', 240, 0);
    const connections = [
        new ConnectionModel({ sourceId: fonte.id, targetId: tanque.id }),
        new ConnectionModel({ sourceId: tanque.id, targetId: dreno.id })
    ];

    fonte.conectarSaida(tanque);
    tanque.conectarSaida(dreno);

    const diagnostic = buildNetworkDiagnosticState(analyzeHydraulicNetwork({
        componentes: [fonte, tanque, dreno],
        conexoes: connections
    }));

    assert.equal(diagnostic.visible, false);
    assert.equal(diagnostic.code, 'open_network');
});

test('valvula em malha fechada com tanques nao cria fluido com altura relativa', () => {
    const engine = createEngine();
    engine.usarAlturaRelativa = true;

    const tanqueAlto = new TanqueLogico('T-03', 'T-03', 0, 300);
    const tanqueBaixo = new TanqueLogico('T-04', 'T-04', 0, 0);
    const valvula = new ValvulaLogica('V-03', 'V-03', 300, 0);

    [tanqueAlto, tanqueBaixo].forEach((tanque) => {
        tanque.capacidadeMaxima = 1000;
        tanque.alturaUtilMetros = 2.4;
        tanque.alturaBocalEntradaM = 0;
        tanque.alturaBocalSaidaM = 0;
        tanque.perdaEntradaK = 1;
        tanque.coeficienteSaida = 0.82;
    });
    tanqueAlto.volumeAtual = 85;
    tanqueBaixo.volumeAtual = 1000;
    valvula.aplicarPerfilCaracteristica('quick_opening');
    valvula.setAbertura(100);
    valvula.aberturaEfetiva = 100;

    [tanqueAlto, tanqueBaixo, valvula].forEach((component) => engine.add(component));

    const endpointTanque = { floorOffsetY: 160 };
    const endpointValvula = { offsetX: 0, offsetY: 0, floorOffsetY: 0 };
    const conectar = (source, target, sourceEndpoint, targetEndpoint) => {
        source.conectarSaida(target);
        const connection = new ConnectionModel({
            sourceId: source.id,
            targetId: target.id,
            sourceEndpoint,
            targetEndpoint
        });
        engine.addConnection(connection);
        return connection;
    };

    const tanqueAltoBaixo = conectar(
        tanqueAlto,
        tanqueBaixo,
        { portType: 'out', ...endpointTanque },
        { portType: 'in', ...endpointTanque }
    );
    const tanqueBaixoValvula = conectar(
        tanqueBaixo,
        valvula,
        { portType: 'out', ...endpointTanque },
        { portType: 'in', ...endpointValvula }
    );
    const valvulaTanqueAlto = conectar(
        valvula,
        tanqueAlto,
        { portType: 'out', ...endpointValvula },
        { portType: 'in', ...endpointTanque }
    );

    const volumeInicialL = tanqueAlto.volumeAtual + tanqueBaixo.volumeAtual;

    runAutomaticPhysicsSteps(engine, 20, 0.1);

    const volumeFinalL = tanqueAlto.volumeAtual + tanqueBaixo.volumeAtual;
    const vazaoEntradaValvulaLps = engine.getConnectionState(tanqueBaixoValvula).flowLps;
    const vazaoSaidaValvulaLps = engine.getConnectionState(valvulaTanqueAlto).flowLps;

    assert.equal(engine.getSolverMetrics().mode, 'nodal');
    assert.ok(
        Math.abs(volumeFinalL - volumeInicialL) < 1e-6,
        `Inventario total dos tanques deve ser conservado: inicial=${volumeInicialL}, final=${volumeFinalL}`
    );
    assert.ok(
        Math.abs(vazaoSaidaValvulaLps - vazaoEntradaValvulaLps) < 1e-6,
        `Valvula nao deve criar nem consumir massa: entrada=${vazaoEntradaValvulaLps}, saida=${vazaoSaidaValvulaLps}`
    );
    assert.equal(engine.getConnectionState(tanqueAltoBaixo).flowLps, 0);
});

test('malha fechada em ilha isolada nao altera sistema aberto com set point', () => {
    const configurarSistemaAberto = (engine) => {
        const tanqueSuperior = new TanqueLogico('T-01', 'T-01', 620, 0);
        const valvulaControle = new ValvulaLogica('V-01', 'V-01', 620, 180);
        const tanqueControlado = new TanqueLogico('T-02', 'T-02', 620, 360);
        const valvulaSaida = new ValvulaLogica('V-02', 'V-02', 620, 540);
        const dreno = new DrenoLogico('D-01', 'Saida-01', 780, 560);

        [tanqueSuperior, tanqueControlado].forEach((tanque) => {
            tanque.capacidadeMaxima = 1000;
            tanque.alturaUtilMetros = 2.4;
            tanque.fluidoConteudo = { ...FLUID_PRESETS.agua };
        });
        tanqueSuperior.volumeAtual = 999;
        tanqueControlado.volumeAtual = 497;
        tanqueControlado.setpoint = 50;
        [valvulaControle, valvulaSaida].forEach((valvula) => {
            valvula.aplicarPerfilCaracteristica('quick_opening');
            valvula.setAbertura(100);
            valvula.aberturaEfetiva = 100;
        });
        dreno.pressaoSaidaBar = 0;

        [tanqueSuperior, valvulaControle, tanqueControlado, valvulaSaida, dreno]
            .forEach((component) => engine.add(component));

        tanqueSuperior.conectarSaida(valvulaControle);
        valvulaControle.conectarSaida(tanqueControlado);
        tanqueControlado.conectarSaida(valvulaSaida);
        valvulaSaida.conectarSaida(dreno);

        const conexoes = [
            new ConnectionModel({ sourceId: tanqueSuperior.id, targetId: valvulaControle.id }),
            new ConnectionModel({ sourceId: valvulaControle.id, targetId: tanqueControlado.id }),
            new ConnectionModel({ sourceId: tanqueControlado.id, targetId: valvulaSaida.id }),
            new ConnectionModel({ sourceId: valvulaSaida.id, targetId: dreno.id })
        ];
        conexoes.forEach((connection) => engine.addConnection(connection));

        const resultadoSetpoint = tanqueControlado.setSetpointAtivo(true);
        assert.equal(resultadoSetpoint.ativado, true);

        return {
            tanqueSuperior,
            tanqueControlado,
            valvulaControle,
            valvulaSaida,
            conexoes
        };
    };

    const adicionarMalhaFechadaIsolada = (engine) => {
        const tanqueA = new TanqueLogico('T-03', 'T-03', 0, 0);
        const tanqueB = new TanqueLogico('T-04', 'T-04', 220, 0);

        [tanqueA, tanqueB].forEach((tanque) => {
            tanque.capacidadeMaxima = 1000;
            tanque.alturaUtilMetros = 2.4;
            tanque.fluidoConteudo = { ...FLUID_PRESETS.agua };
        });
        tanqueA.volumeAtual = 827;
        tanqueB.volumeAtual = 6;

        [tanqueA, tanqueB].forEach((component) => engine.add(component));
        tanqueA.conectarSaida(tanqueB);
        tanqueB.conectarSaida(tanqueA);

        [
            new ConnectionModel({ sourceId: tanqueA.id, targetId: tanqueB.id }),
            new ConnectionModel({ sourceId: tanqueB.id, targetId: tanqueA.id })
        ].forEach((connection) => engine.addConnection(connection));
    };

    const simular = (comMalhaFechada) => {
        const engine = createEngine();
        engine.usarAlturaRelativa = true;
        const sistemaAberto = configurarSistemaAberto(engine);
        if (comMalhaFechada) adicionarMalhaFechadaIsolada(engine);

        runControlledAutomaticPhysicsSteps(engine, 20, 0.1);

        return {
            metrics: engine.getSolverMetrics(),
            volumeSuperiorL: sistemaAberto.tanqueSuperior.volumeAtual,
            volumeControladoL: sistemaAberto.tanqueControlado.volumeAtual,
            aberturaEntrada: sistemaAberto.valvulaControle.grauAbertura,
            aberturaSaida: sistemaAberto.valvulaSaida.grauAbertura,
            vazoesLps: sistemaAberto.conexoes.map((connection) =>
                engine.getConnectionState(connection).flowLps
            )
        };
    };

    const semMalha = simular(false);
    const comMalha = simular(true);

    assert.equal(semMalha.metrics.mode, 'push');
    assert.equal(comMalha.metrics.mode, 'mixed');
    assert.ok(
        comMalha.metrics.islandMetrics.some((metrics) => metrics.mode === 'nodal')
        && comMalha.metrics.islandMetrics.some((metrics) => metrics.mode === 'push'),
        'Motor deve resolver ilhas independentes com solver apropriado para cada topologia'
    );
    assert.ok(
        Math.abs(comMalha.volumeSuperiorL - semMalha.volumeSuperiorL) < 1e-6,
        `T-01 isolado nao deve mudar por causa da malha fechada: base=${semMalha.volumeSuperiorL}, comMalha=${comMalha.volumeSuperiorL}`
    );
    assert.ok(
        Math.abs(comMalha.volumeControladoL - semMalha.volumeControladoL) < 1e-6,
        `T-02 isolado nao deve mudar por causa da malha fechada: base=${semMalha.volumeControladoL}, comMalha=${comMalha.volumeControladoL}`
    );
    assert.ok(
        Math.abs(comMalha.aberturaEntrada - semMalha.aberturaEntrada) < 1e-9,
        'Set point da ilha aberta nao deve receber interferencia da malha fechada'
    );
    semMalha.vazoesLps.forEach((flowLps, index) => {
        assert.ok(
            Math.abs(comMalha.vazoesLps[index] - flowLps) < 1e-6,
            `Conexao ${index} da ilha aberta deve manter a mesma vazao: base=${flowLps}, comMalha=${comMalha.vazoesLps[index]}`
        );
    });
});

test('recirculacao tanque bomba tanque conserva inventario do tanque', () => {
    const engine = createEngine();
    const tanque = new TanqueLogico('T-loop', 'T-loop', 0, 0);
    const bomba = new BombaLogica('P-tank-loop', 'P-tank-loop', 180, 0);

    tanque.volumeAtual = 600;
    tanque.capacidadeMaxima = 1000;
    tanque.alturaUtilMetros = 2.4;
    tanque.alturaBocalEntradaM = 1.2;
    tanque.alturaBocalSaidaM = 0.1;
    tanque.fluidoConteudo = { ...FLUID_PRESETS.agua };
    bomba.vazaoNominal = 45;
    bomba.pressaoMaxima = 3;
    bomba.grauAcionamento = 100;
    bomba.acionamentoEfetivo = 100;

    tanque.conectarSaida(bomba);
    bomba.conectarSaida(tanque);

    const tankPump = new ConnectionModel({ sourceId: tanque.id, targetId: bomba.id });
    const pumpTank = new ConnectionModel({ sourceId: bomba.id, targetId: tanque.id });

    [tanque, bomba].forEach((component) => engine.add(component));
    [tankPump, pumpTank].forEach((connection) => engine.addConnection(connection));

    const initialVolume = tanque.volumeAtual;
    runAutomaticPhysicsSteps(engine, 12, 0.1);

    const inletFlow = engine.getConnectionState(pumpTank).flowLps;
    const outletFlow = engine.getConnectionState(tankPump).flowLps;

    assert.equal(engine.getSolverMetrics().mode, 'nodal');
    assert.ok(inletFlow > 0, `Recirculacao deve ter vazao de retorno ao tanque: ${inletFlow}`);
    assert.ok(Math.abs(inletFlow - outletFlow) < 1e-4, `Tanque nao deve criar nem destruir massa no loop: in=${inletFlow}, out=${outletFlow}`);
    assert.ok(Math.abs(tanque.volumeAtual - initialVolume) < 1e-3, `Volume do tanque deve permanecer estavel: ${tanque.volumeAtual}`);
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
