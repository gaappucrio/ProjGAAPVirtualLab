// Validação física do solver global contra soluções analíticas e contra um modelo de referência
// que reproduz as equações do modo dinâmico do DWSIM (levantadas do código-fonte DanWBR/dwsim):
//   - válvula Kv (líquido): W = Kv·√(1000·ρ·ΔP[bar])/3600  ⇒  Q = Kv·√(ΔP/SG)
//   - Tank: atmosférico, saída a 101325 Pa + ρ·9,8·nível
//   - integração: Euler explícito com passo fixo, vazões algébricas a cada passo.
import assert from 'node:assert/strict';
import test from 'node:test';

import { SistemaSimulacao } from '../js/application/engine/SimulationEngine.js';
import { ConnectionModel } from '../js/domain/models/ConnectionModel.js';
import { BombaLogica } from '../js/domain/components/BombaLogica.js';
import { DrenoLogico } from '../js/domain/components/DrenoLogico.js';
import { FonteLogica } from '../js/domain/components/FonteLogica.js';
import { TanqueLogico } from '../js/domain/components/TanqueLogico.js';
import { TrocadorCalorLogico } from '../js/domain/components/TrocadorCalorLogico.js';
import { ValvulaLogica, cvToKv } from '../js/domain/components/ValvulaLogica.js';

const RHO_AGUA = 997;
const TUBO_DESPREZIVEL = Object.freeze({ extraLengthM: 0, diameterM: 0.3 });

function approx(actual, expected, tolerance, label) {
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `${label}: esperado ${expected} +/- ${tolerance}, obtido ${actual}`
    );
}

function createEngine() {
    const engine = new SistemaSimulacao();
    engine.isRunning = true;
    engine.usarAlturaRelativa = false;
    return engine;
}

function conectar(engine, source, target, options = {}) {
    source.conectarSaida(target);
    const connection = new ConnectionModel({ sourceId: source.id, targetId: target.id, ...options });
    engine.addConnection(connection);
    return connection;
}

function criarValvula(id, cv) {
    const valvula = new ValvulaLogica(id, id, 0, 0);
    valvula.aplicarPerfilCaracteristica('custom');
    valvula.setCoeficienteVazao(cv);
    valvula.setCoeficientePerda(0);
    valvula.setTipoCaracteristica('linear');
    valvula.setAbertura(100);
    valvula.aberturaEfetiva = 100;
    return valvula;
}

function passo(engine, dt = 0.1) {
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

function simular(engine, passos, dt = 0.1) {
    for (let i = 0; i < passos; i += 1) passo(engine, dt);
}

// Vazão de líquido em L/s pela equação de Kv do DWSIM (SG = ρ/1000).
function vazaoKvDwsimLps(kv, deltaPBar, densidade = RHO_AGUA) {
    if (deltaPBar <= 0) return 0;
    return (kv * Math.sqrt((1000 * deltaPBar) / densidade)) / 3.6;
}

test('valvula em serie segue a equacao Kv do DWSIM e a pressao fecha no dreno', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-serie', 'F-serie', 0, 0);
    const valvula = criarValvula('V-serie', 60);
    const dreno = new DrenoLogico('D-serie', 'D-serie', 0, 0);
    fonte.pressaoFonteBar = 1.0;
    fonte.vazaoMaxima = 500;
    [fonte, valvula, dreno].forEach((c) => engine.add(c));
    conectar(engine, fonte, valvula, TUBO_DESPREZIVEL);
    const saida = conectar(engine, valvula, dreno, TUBO_DESPREZIVEL);

    simular(engine, 20);

    const esperadoLps = vazaoKvDwsimLps(cvToKv(60), 1.0);
    approx(valvula.fluxoReal, esperadoLps, 0.005 * esperadoLps, 'Vazao pela valvula (equacao Kv do DWSIM)');
    approx(engine.getConnectionState(saida).outletPressureBar, 0, 1e-9, 'Chegada no dreno na contrapressao');
    approx(valvula.deltaPAtualBar, 1.0, 0.005, 'Toda a pressao disponivel cai na valvula');
});

test('ramos em paralelo veem o mesmo deltaP e dividem a vazao na proporcao dos Cv', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-par', 'F-par', 0, 0);
    const valvulaA = criarValvula('V-par-A', 100);
    const valvulaB = criarValvula('V-par-B', 50);
    const dreno = new DrenoLogico('D-par', 'D-par', 0, 0);
    fonte.pressaoFonteBar = 0.8;
    fonte.vazaoMaxima = 500;
    [fonte, valvulaA, valvulaB, dreno].forEach((c) => engine.add(c));
    conectar(engine, fonte, valvulaA, TUBO_DESPREZIVEL);
    conectar(engine, fonte, valvulaB, TUBO_DESPREZIVEL);
    conectar(engine, valvulaA, dreno, TUBO_DESPREZIVEL);
    conectar(engine, valvulaB, dreno, TUBO_DESPREZIVEL);

    simular(engine, 20);

    // Os nós são comuns; só as pequenas perdas dos tubos (vazões diferentes) separam os deltaP das válvulas.
    approx(valvulaA.deltaPAtualBar, valvulaB.deltaPAtualBar, 1e-4, 'Mesmo deltaP nos ramos paralelos');
    approx(valvulaA.fluxoReal / valvulaB.fluxoReal, 2, 0.005, 'Q_A/Q_B = Cv_A/Cv_B');
    approx(fonte.fluxoReal, valvulaA.fluxoReal + valvulaB.fluxoReal, 1e-9, 'Conservacao de massa no no da fonte');
});

test('bomba seguida de valvula opera na intersecao das curvas da bomba e do sistema', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-bomba', 'F-bomba', 0, 0);
    const bomba = new BombaLogica('P-bomba', 'P-bomba', 0, 0);
    const valvula = criarValvula('V-bomba', 160);
    const dreno = new DrenoLogico('D-bomba', 'D-bomba', 0, 0);
    fonte.pressaoFonteBar = 0.5;
    fonte.vazaoMaxima = 500;
    bomba.vazaoNominal = 45;
    bomba.pressaoMaxima = 5;
    bomba.grauAcionamento = 100;
    bomba.acionamentoEfetivo = 100;
    [fonte, bomba, valvula, dreno].forEach((c) => engine.add(c));
    conectar(engine, fonte, bomba, TUBO_DESPREZIVEL);
    conectar(engine, bomba, valvula, TUBO_DESPREZIVEL);
    conectar(engine, valvula, dreno, TUBO_DESPREZIVEL);

    simular(engine, 30);

    // Interseção independente: 0,5 + ΔP_bomba(Q) = ΔP_valvula(Q), resolvida por bisseção.
    const kv = cvToKv(160);
    const desbalanco = (q) => 0.5 + (5 * (1 - ((q / 45) ** 2))) - ((((3.6 * q) / kv) ** 2) * (RHO_AGUA / 999.016));
    let baixo = 0;
    let alto = 45;
    for (let i = 0; i < 60; i += 1) {
        const meio = (baixo + alto) / 2;
        if (desbalanco(meio) > 0) baixo = meio;
        else alto = meio;
    }
    approx(bomba.fluxoReal, baixo, 0.005 * baixo, 'Ponto de operacao bomba x sistema');
    assert.ok(bomba.fluxoReal > 30, `Bomba seguida de valvula aberta nao pode ficar sem vazao: ${bomba.fluxoReal}`);
    assert.equal(bomba.fatorCavitacaoAtual, 1, 'Sucao pressurizada nao cavita');
});

test('tanque aberto atinge o nivel de regime de Torricelli', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-torr', 'F-torr', 0, 0);
    const tanque = new TanqueLogico('T-torr', 'T-torr', 0, 0);
    const dreno = new DrenoLogico('D-torr', 'D-torr', 0, 0);
    fonte.pressaoFonteBar = 0.5;
    fonte.vazaoMaxima = 15;
    tanque.capacidadeMaxima = 1000;
    tanque.alturaUtilMetros = 2.4;
    tanque.volumeAtual = 0;
    tanque.coeficienteSaida = 0.82;
    [fonte, tanque, dreno].forEach((c) => engine.add(c));
    conectar(engine, fonte, tanque, TUBO_DESPREZIVEL);
    conectar(engine, tanque, dreno, TUBO_DESPREZIVEL);

    simular(engine, 6000);

    // Regime: Q = Cd·A_bocal·√(2gh)  ⇒  h = (Q/(Cd·A))²/(2g)
    const areaBocal = tanque.getAreaConexaoM2();
    const alturaEsperadaM = ((0.015 / (0.82 * areaBocal)) ** 2) / (2 * 9.81);
    approx(tanque.getAlturaLiquidoM(), alturaEsperadaM, 0.005 * alturaEsperadaM, 'Nivel de regime de Torricelli');
    approx(tanque.lastQout, 15, 0.01, 'Em regime a saida iguala a entrada');
});

test('inercia do fluido: tubo longo acelera conforme dQ/dt = A/(rho L) * deltaP', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-inercia', 'F-inercia', 0, 0);
    const dreno = new DrenoLogico('D-inercia', 'D-inercia', 0, 0);
    fonte.pressaoFonteBar = 1.0;
    fonte.vazaoMaxima = 500;
    [fonte, dreno].forEach((c) => engine.add(c));
    const tubo = conectar(engine, fonte, dreno, { extraLengthM: 499, diameterM: 0.08 });

    passo(engine, 0.1);
    const primeiraVazao = engine.getConnectionState(tubo).flowLps;
    // Partindo do repouso, no primeiro passo a perda por atrito é desprezível frente à inércia:
    // Q ≈ ΔP·dt/I, com I = ρL/A (convertido para bar por L/s²).
    const inertancia = (RHO_AGUA * 500) / (tubo.areaM2 * 1e8);
    approx(primeiraVazao, (1.0 * 0.1) / inertancia, 0.05 * ((1.0 * 0.1) / inertancia), 'Aceleracao inicial pela inercia');

    const vazoes = [primeiraVazao];
    for (let i = 0; i < 1200; i += 1) {
        passo(engine, 0.1);
        vazoes.push(engine.getConnectionState(tubo).flowLps);
    }
    assert.ok(vazoes.every((q, i) => i === 0 || q >= vazoes[i - 1] - 1e-9), 'Partida monotonica, sem oscilacao numerica');

    // Regime permanente igual ao quase-estático: toda a pressão vira perda distribuída.
    const estado = engine.getConnectionState(tubo);
    approx(estado.pipePressureDropBar, 1.0, 1e-3, 'Em regime o atrito consome toda a pressao');
});

test('valvula fechada retem a pressao de montante como um manometro real', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-fechada', 'F-fechada', 0, 0);
    const valvula = criarValvula('V-fechada', 100);
    const dreno = new DrenoLogico('D-fechada', 'D-fechada', 0, 0);
    fonte.pressaoFonteBar = 2.0;
    valvula.setAbertura(0);
    valvula.aberturaEfetiva = 0;
    [fonte, valvula, dreno].forEach((c) => engine.add(c));
    conectar(engine, fonte, valvula, TUBO_DESPREZIVEL);
    conectar(engine, valvula, dreno, TUBO_DESPREZIVEL);

    simular(engine, 5);

    assert.equal(valvula.fluxoReal, 0);
    approx(valvula.pressaoEntradaAtualBar, 2.0, 1e-9, 'Pressao estatica a montante');
    approx(valvula.pressaoSaidaAtualBar, 0, 1e-9, 'Pressao a jusante na contrapressao do dreno');
    approx(valvula.deltaPAtualBar, 2.0, 1e-9, 'Diferencial de bloqueio');
});

test('vaso fechado com colchao de gas enche ate equilibrar a pressao de alimentacao (Boyle)', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-vaso', 'F-vaso', 0, 0);
    const vaso = new TanqueLogico('T-vaso', 'T-vaso', 0, 0);
    fonte.pressaoFonteBar = 2.0;
    fonte.vazaoMaxima = 5;
    vaso.tipoTanque = 'fechado';
    vaso.pressaoPreCargaBar = 0.5;
    vaso.capacidadeMaxima = 1000;
    vaso.volumeAtual = 0;
    [fonte, vaso].forEach((c) => engine.add(c));
    conectar(engine, fonte, vaso, TUBO_DESPREZIVEL);

    simular(engine, 3000);

    // (P_pre + P_atm)·V_total = (P_alim + P_atm)·V_gas  ⇒  V_liq = V_total·(1 − (P_pre+P_atm)/(P_alim+P_atm))
    const atm = vaso.getFluidoConteudo().pressaoAtmosfericaBar;
    const volumeEsperadoL = 1000 * (1 - ((0.5 + atm) / (2.0 + atm)));
    approx(vaso.volumeAtual, volumeEsperadoL, 0.01 * volumeEsperadoL, 'Volume de equilibrio do vaso hidropneumatico');
    assert.ok(vaso.lastQin < 0.05, `A entrada cessa no equilibrio: ${vaso.lastQin}`);
});

test('reproduz o modelo de referencia do DWSIM dinamico: alimentacao, valvula Kv, tanque atmosferico, valvula Kv', () => {
    const pressaoAlimentacaoBar = 1.0;
    const cvEntrada = 40;
    const cvSaida = 100;
    const capacidadeL = 2000;
    const alturaM = 2.0;
    const volumeInicialL = 200;
    const dt = 0.1;
    const amostrasS = [60, 120, 240, 360, 480, 600];

    // Modelo de referência (equações do DWSIM dinâmico).
    const areaTanqueM2 = (capacidadeL / 1000) / alturaM;
    let volumeRefM3 = volumeInicialL / 1000;
    const referencia = new Map();
    for (let passoAtual = 1; passoAtual <= 6000; passoAtual += 1) {
        const nivelM = volumeRefM3 / areaTanqueM2;
        const pressaoTanqueBar = (RHO_AGUA * 9.8 * nivelM) / 1e5;
        const entradaLps = vazaoKvDwsimLps(cvToKv(cvEntrada), pressaoAlimentacaoBar);
        const saidaLps = vazaoKvDwsimLps(cvToKv(cvSaida), pressaoTanqueBar);
        volumeRefM3 += ((entradaLps - saidaLps) / 1000) * dt;
        const tempoS = Math.round(passoAtual * dt * 10) / 10;
        if (amostrasS.includes(tempoS)) referencia.set(tempoS, { nivelM: volumeRefM3 / areaTanqueM2, saidaLps });
    }

    // Mesmo fluxograma no GAAP, com tubos e bocal de perda desprezível (o DWSIM dinâmico não modela tubos).
    const engine = createEngine();
    const fonte = new FonteLogica('F-ref', 'Feed', 0, 0);
    const valvulaEntrada = criarValvula('V-01', cvEntrada);
    const tanque = new TanqueLogico('T-ref', 'Tank', 0, 0);
    const valvulaSaida = criarValvula('V-02', cvSaida);
    const produto = new DrenoLogico('D-ref', 'Product', 0, 0);
    fonte.pressaoFonteBar = pressaoAlimentacaoBar;
    fonte.vazaoMaxima = 500;
    tanque.capacidadeMaxima = capacidadeL;
    tanque.alturaUtilMetros = alturaM;
    tanque.volumeAtual = volumeInicialL;
    tanque.coeficienteSaida = 1;
    tanque.diametroConexaoM = 0.3;
    [fonte, valvulaEntrada, tanque, valvulaSaida, produto].forEach((c) => engine.add(c));
    conectar(engine, fonte, valvulaEntrada, TUBO_DESPREZIVEL);
    conectar(engine, valvulaEntrada, tanque, TUBO_DESPREZIVEL);
    conectar(engine, tanque, valvulaSaida, TUBO_DESPREZIVEL);
    conectar(engine, valvulaSaida, produto, TUBO_DESPREZIVEL);

    for (let passoAtual = 1; passoAtual <= 6000; passoAtual += 1) {
        passo(engine, dt);
        const tempoS = Math.round(passoAtual * dt * 10) / 10;
        if (!amostrasS.includes(tempoS)) continue;
        const esperado = referencia.get(tempoS);
        approx(tanque.getAlturaLiquidoM(), esperado.nivelM, 0.01 * esperado.nivelM, `Nivel em t=${tempoS}s`);
        approx(tanque.lastQout, esperado.saidaLps, 0.01 * esperado.saidaLps, `Vazao de saida em t=${tempoS}s`);
    }

    // Regime analítico das duas equações de Kv: (Kv1/Kv2)²·ΔP_alim = ρ·g·h.
    const nivelRegimeM = (((cvEntrada / cvSaida) ** 2) * pressaoAlimentacaoBar * 1e5) / (RHO_AGUA * 9.8);
    simular(engine, 12000, dt);
    approx(tanque.getAlturaLiquidoM(), nivelRegimeM, 0.01 * nivelRegimeM, 'Nivel de regime');
});

function montarTrocadorUtilidade({ volumeInternoL = 2, vazaoLps = 1 } = {}) {
    const engine = createEngine();
    const fonte = new FonteLogica('F-hx', 'F-hx', 0, 0);
    const trocador = new TrocadorCalorLogico('HX-lag', 'HX-lag', 0, 0);
    const dreno = new DrenoLogico('D-hx', 'D-hx', 0, 0);
    fonte.pressaoFonteBar = 2.0;
    fonte.vazaoMaxima = vazaoLps;
    trocador.temperaturaServicoC = 80;
    trocador.uaWPorK = 4000;
    trocador.setVolumeInterno(volumeInternoL);
    [fonte, trocador, dreno].forEach((c) => engine.add(c));
    conectar(engine, fonte, trocador, { ...TUBO_DESPREZIVEL, targetEndpoint: { portId: 'in1', portType: 'in' } });
    const saida = conectar(engine, trocador, dreno, { ...TUBO_DESPREZIVEL, sourceEndpoint: { portId: 'out1', portType: 'out' } });
    return { engine, trocador, saida };
}

test('trocador: saida responde com atraso de 1a ordem tau = V/Q e converge ao e-NTU', () => {
    const dt = 0.1;
    const { engine, trocador, saida } = montarTrocadorUtilidade({ volumeInternoL: 2, vazaoLps: 1 });

    engine.tickPipeline.advance(dt);
    approx(trocador.vazao1Lps, 1, 1e-6, 'Vazao limitada pela fonte');
    const capacidadeWK = trocador.vazaoMassaKgS * 4182;
    const alvoC = 25 + ((1 - Math.exp(-trocador.uaWPorK / capacidadeWK)) * (80 - 25));
    approx(trocador.temperaturaSaidaAlvoC, alvoC, 1e-9, 'Alvo de regime pelo e-NTU');
    approx(trocador.temperaturaSaidaC, 25, 1e-9, 'Na partida sai o fluido que estava parado no trocador');

    // Integração exata do atraso: a cada passo seguinte o desvio cai por exp(-dt/tau), tau = 2 L / 1 L/s.
    const tauS = trocador.getConstanteTempoTermicaS(1);
    approx(tauS, 2, 1e-6, 'Constante de tempo = tempo de residencia');
    for (let passoAtual = 1; passoAtual <= 20; passoAtual += 1) engine.tickPipeline.advance(dt);
    const fracaoEsperada = 1 - Math.exp(-(20 * dt) / tauS);
    approx((trocador.temperaturaSaidaC - 25) / (alvoC - 25), fracaoEsperada, 1e-6, 'Resposta apos 1 tau (63,2%)');
    approx(engine.getConnectionState(saida).fluid.temperatura, trocador.temperaturaSaidaC, 1e-12, 'Cano a jusante recebe a temperatura que sai do trocador');

    for (let passoAtual = 0; passoAtual < 600; passoAtual += 1) engine.tickPipeline.advance(dt);
    approx(trocador.temperaturaSaidaC, alvoC, 1e-9, 'Regime permanente = e-NTU');
    approx(trocador.cargaTermicaW, capacidadeWK * (trocador.temperaturaSaidaC - 25), 1e-6 * trocador.cargaTermicaW, 'Em regime Q = m cp dT');
});

test('trocador: volume interno nulo reproduz a resposta instantanea do e-NTU', () => {
    const { engine, trocador } = montarTrocadorUtilidade({ volumeInternoL: 0, vazaoLps: 1 });
    engine.tickPipeline.advance(0.1);
    approx(trocador.temperaturaSaidaC, trocador.temperaturaSaidaAlvoC, 1e-12, 'Sem volume retido nao ha atraso');
    assert.ok(trocador.temperaturaSaidaC > 40, `Saida ja aquecida no primeiro passo: ${trocador.temperaturaSaidaC}`);
});

test('trocador: maior vazao reduz o tempo de residencia e acelera a resposta', () => {
    const lenta = montarTrocadorUtilidade({ volumeInternoL: 5, vazaoLps: 0.5 });
    const rapida = montarTrocadorUtilidade({ volumeInternoL: 5, vazaoLps: 2 });
    for (let passoAtual = 0; passoAtual < 30; passoAtual += 1) {
        lenta.engine.tickPipeline.advance(0.1);
        rapida.engine.tickPipeline.advance(0.1);
    }
    approx(lenta.trocador.getConstanteTempoTermicaS(1), 10, 1e-6, 'tau = 5 L / 0,5 L/s');
    approx(rapida.trocador.getConstanteTempoTermicaS(1), 2.5, 1e-6, 'tau = 5 L / 2 L/s');
    const fracao = ({ trocador }) => (trocador.temperaturaSaidaC - 25) / (trocador.temperaturaSaidaAlvoC - 25);
    assert.ok(fracao(rapida) > fracao(lenta), `Resposta mais rapida com mais vazao: ${fracao(rapida)} vs ${fracao(lenta)}`);
});

test('indicador de regime permanente: so declara regime apos o nivel estabilizar e volta ao transiente com perturbacao', () => {
    const dt = 0.1;
    const engine = createEngine();
    const fonte = new FonteLogica('F-ss', 'Feed', 0, 0);
    const valvulaEntrada = criarValvula('V-ss-in', 40);
    const tanque = new TanqueLogico('T-ss', 'Tank', 0, 0);
    const valvulaSaida = criarValvula('V-ss-out', 100);
    const produto = new DrenoLogico('D-ss', 'Product', 0, 0);
    fonte.pressaoFonteBar = 1.0;
    fonte.vazaoMaxima = 500;
    // Tanque de 0,1 m² (tau ~ 2·A·h/Q ~ 34 s): o regime chega em alguns minutos de simulação.
    tanque.capacidadeMaxima = 200;
    tanque.alturaUtilMetros = 2.0;
    tanque.volumeAtual = 20;
    tanque.coeficienteSaida = 1;
    tanque.diametroConexaoM = 0.3;
    [fonte, valvulaEntrada, tanque, valvulaSaida, produto].forEach((c) => engine.add(c));
    conectar(engine, fonte, valvulaEntrada, TUBO_DESPREZIVEL);
    conectar(engine, valvulaEntrada, tanque, TUBO_DESPREZIVEL);
    conectar(engine, tanque, valvulaSaida, TUBO_DESPREZIVEL);
    conectar(engine, valvulaSaida, produto, TUBO_DESPREZIVEL);

    let primeiroRegimeS = null;
    for (let passoAtual = 1; passoAtual <= 20000 && primeiroRegimeS === null; passoAtual += 1) {
        engine.tickPipeline.advance(dt);
        const status = engine.getSteadyStateStatus();
        if (status.steady) {
            assert.ok(Math.abs(tanque.lastQin - tanque.lastQout) <= 1e-3, 'Nao pode declarar regime com o tanque acumulando');
            primeiroRegimeS = engine.elapsedTime;
        }
    }
    assert.ok(primeiroRegimeS !== null, 'O sistema deve atingir regime permanente');
    const status = engine.getSteadyStateStatus();
    approx(primeiroRegimeS - status.steadySinceS, status.holdTimeS, dt + 1e-9, 'Regime confirmado apos a janela de observacao');
    const nivelRegimeM = (((40 / 100) ** 2) * 1e5) / (RHO_AGUA * 9.8);
    approx(tanque.getAlturaLiquidoM(), nivelRegimeM, 0.01 * nivelRegimeM, 'Nivel no momento do regime = nivel analitico');

    valvulaSaida.setAbertura(50);
    valvulaSaida.aberturaEfetiva = 50;
    engine.tickPipeline.advance(dt);
    assert.equal(engine.getSteadyStateStatus().steady, false, 'Perturbacao na valvula devolve o sistema ao transiente');
    assert.equal(engine.getSteadyStateStatus().dominantVariation.kind, 'flow', 'A maior variacao imediata e a vazao');
});

test('indicador de regime permanente acompanha o atraso termico do trocador', () => {
    const dt = 0.1;
    const { engine, trocador } = montarTrocadorUtilidade({ volumeInternoL: 20, vazaoLps: 1 });
    let regimeS = null;
    for (let passoAtual = 1; passoAtual <= 3000 && regimeS === null; passoAtual += 1) {
        engine.tickPipeline.advance(dt);
        if (engine.getSteadyStateStatus().steady) regimeS = engine.elapsedTime;
    }
    assert.ok(regimeS !== null, 'Deve atingir regime');
    // tau = 20 s: dT/dt = desvio/tau só fica abaixo de 1e-3 °C/s após ~tau·ln(dT0/(tau·1e-3)) ≈ 140 s.
    const taxaC = Math.abs(trocador.temperaturaSaidaAlvoC - trocador.temperaturaSaidaC) / 20;
    assert.ok(taxaC <= 1e-3 + 1e-9, `Taxa termica dentro da tolerancia ao declarar regime: ${taxaC} °C/s`);
    assert.ok(regimeS > 120, `Regime so depois do transiente termico: ${regimeS} s`);
});
