// Validação física do solver global contra soluções analíticas e contra um modelo de referência
// que reproduz as equações do modo dinâmico do DWSIM (levantadas do código-fonte DanWBR/dwsim):
//   - válvula Kv (líquido): W = Kv·√(1000·ρ·ΔP[bar])/3600  ⇒  Q = Kv·√(ΔP/SG)
//   - Tank: atmosférico, saída a 101325 Pa + ρ·9,8·nível
//   - integração: Euler explícito com passo fixo, vazões algébricas a cada passo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { SistemaSimulacao } from '../js/application/engine/SimulationEngine.js';
import { ConnectionModel } from '../js/domain/models/ConnectionModel.js';
import { BombaLogica } from '../js/domain/components/BombaLogica.js';
import { DrenoLogico } from '../js/domain/components/DrenoLogico.js';
import { FonteLogica } from '../js/domain/components/FonteLogica.js';
import { TanqueLogico } from '../js/domain/components/TanqueLogico.js';
import { TrocadorCalorLogico } from '../js/domain/components/TrocadorCalorLogico.js';
import { ValvulaLogica, cvToKv } from '../js/domain/components/ValvulaLogica.js';
import { referenciaPerdaBocal } from '../js/domain/components/BocalHidraulico.js';
import { restoreFlowchartDocument } from '../js/presentation/flowchart/FlowchartPersistence.js';
import { parseDwsimXml, readDwsimFile, translateDwsimToWorkspace } from '../js/presentation/import/DwsimImporter.js';

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
    tanque.tipoTanque = 'atmosferico';
    const dreno = new DrenoLogico('D-torr', 'D-torr', 0, 0);
    fonte.pressaoFonteBar = 0.5;
    fonte.vazaoMaxima = 15;
    tanque.capacidadeMaxima = 1000;
    tanque.alturaUtilMetros = 2.4;
    tanque.volumeAtual = 0;
    tanque.coeficienteSaida = 0.82;
    tanque.considerarPerdasBocais = true;
    tanque.usarGeometriaBocal = true;
    tanque.diametroConexaoM = 0.08;
    [fonte, tanque, dreno].forEach((c) => engine.add(c));
    conectar(engine, fonte, tanque, TUBO_DESPREZIVEL);
    conectar(engine, tanque, dreno, TUBO_DESPREZIVEL);

    simular(engine, 6000);

    // Orifício Ø 0,08 m abrindo num cano Ø 0,3 m (atrito desprezível), velocidade v_b no bocal:
    // ρgh = ρ/2·[(1/Cd² − 1)·v_b² + v_cano² + (v_b − v_cano)²]  (perda no bocal + energia cinética
    // que segue no cano + Borda-Carnot). Sem o cano largo, voltaria a Q = Cd·A·√(2gh).
    const areaBocal = (Math.PI * 0.08 ** 2) / 4;
    const razaoAreas = areaBocal / ((Math.PI * 0.3 ** 2) / 4);
    const kEfetivo = ((1 / (0.82 ** 2)) - 1) + (razaoAreas ** 2) + ((1 - razaoAreas) ** 2);
    const alturaEsperadaM = (kEfetivo * ((0.015 / areaBocal) ** 2)) / (2 * 9.81);
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
    assert.equal(vaso.vazaoTransbordoLps, 0, 'Vaso fechado nao transborda para a atmosfera');
});

// Vaso fechado alimentado acima da pressão máxima do colchão de gás (pré-carga 0,5 bar e piso de 2% de
// gás: 1,513·50 − 1,013 = 74,65 barg). Cheio de líquido, o vaso trava: só entra o que sai, sem sumir massa.
function montarVasoTravado(aberturaSaida) {
    const engine = createEngine();
    const fonte = new FonteLogica(`F-trava-${aberturaSaida}`, 'F', 0, 0);
    const vaso = new TanqueLogico(`T-trava-${aberturaSaida}`, 'T', 200, 0);
    const valvula = criarValvula(`V-trava-${aberturaSaida}`, 5);
    const dreno = new DrenoLogico(`D-trava-${aberturaSaida}`, 'D', 600, 0);
    fonte.pressaoFonteBar = 100;
    fonte.vazaoMaxima = 50;
    vaso.capacidadeMaxima = 1000;
    vaso.volumeAtual = 500;
    vaso.pressaoPreCargaBar = 0.5;
    valvula.setAbertura(aberturaSaida);
    valvula.aberturaEfetiva = aberturaSaida;
    [fonte, vaso, valvula, dreno].forEach((c) => engine.add(c));
    const entrada = conectar(engine, fonte, vaso, TUBO_DESPREZIVEL);
    conectar(engine, vaso, valvula, TUBO_DESPREZIVEL);
    conectar(engine, valvula, dreno, TUBO_DESPREZIVEL);

    let entrouL = 0;
    let saiuL = 0;
    for (let i = 0; i < 600; i += 1) {
        engine.tickPipeline.advance(0.1);
        entrouL += vaso.lastQin * 0.1;
        saiuL += vaso.lastQout * 0.1;
    }
    return { engine, vaso, entrada, furoL: 500 + entrouL - saiuL - vaso.volumeAtual };
}

test('vaso fechado cheio trava sem perder massa: com a saida fechada, para de entrar e a entrada ve a pressao da rede', () => {
    const { engine, vaso, entrada, furoL } = montarVasoTravado(0);

    approx(furoL, 0, 1e-6, 'Balanco de massa fecha (antes, 50 L/s sumiam no corte em 100%)');
    approx(vaso.volumeAtual, 980, 1e-6, 'O liquido para onde o gas atinge o piso de 2%');
    approx(vaso.lastQin, 0, 1e-9, 'Sem saida, nao entra mais nada');
    approx(engine.getConnectionState(entrada).outletPressureBar, 100, 1e-6, 'Trava hidraulica: a entrada fica na pressao da fonte');
});

test('vaso fechado cheio com a saida aberta fica passante: entra o que sai, sem perder massa', () => {
    const { vaso, furoL } = montarVasoTravado(100);

    approx(furoL, 0, 1e-6, 'Balanco de massa fecha');
    assert.ok(vaso.volumeAtual <= 980 + 1e-6, `Nivel nao passa do piso de gas: ${vaso.volumeAtual}`);
    assert.ok(vaso.lastQout > 1, `Ha escoamento pela saida: ${vaso.lastQout}`);
    approx(vaso.lastQin, vaso.lastQout, 1e-6, 'Entrada = saida');
});

test('vaso fechado enche ate o equilibrio de Boyle sem ultrapassa-lo (colchao implicito no passo)', () => {
    // Alimentação a 5 bar num vaso sem saída, pré-carga 0,5 bar, cano curto e largo (inércia desprezível).
    // Equilíbrio: V_gás = V·(P_pré + P_atm)/(P + P_atm). No Euler explícito, o passo de 0,1 s a 50 L/s
    // passava do ponto e, sem fluxo reverso, a pressão ficava presa acima da alimentação. A 10 L/s, a
    // ultrapassagem por inércia da água (física, cresce com a vazão) fica abaixo de 0,1%.
    const engine = createEngine();
    const fonte = new FonteLogica('F-boyle-impl', 'F', 0, 0);
    const vaso = new TanqueLogico('T-boyle-impl', 'T', 200, 0);
    fonte.pressaoFonteBar = 5;
    fonte.vazaoMaxima = 10;
    vaso.capacidadeMaxima = 1000;
    vaso.volumeAtual = 500;
    vaso.pressaoPreCargaBar = 0.5;
    [fonte, vaso].forEach((c) => engine.add(c));
    conectar(engine, fonte, vaso, TUBO_DESPREZIVEL);

    for (let i = 0; i < 600; i += 1) engine.tickPipeline.advance(0.1);

    const atmBar = 1.01325;
    const volumeEquilibrioL = 1000 * (1 - ((0.5 + atmBar) / (5 + atmBar)));
    approx(vaso.getPressaoGasBar(), 5, 0.005 * 5, 'O gas para na pressao da alimentacao');
    approx(vaso.volumeAtual, volumeEquilibrioL, 0.5, 'Volume de equilibrio de Boyle');
});

test('vaso fechado nos casos dificeis do colchao: massa conservada e estados ativos convergem', () => {
    const vasoDe = (id, volumeL) => {
        const vaso = new TanqueLogico(id, id, 200, 0);
        vaso.capacidadeMaxima = 1000;
        vaso.volumeAtual = volumeL;
        vaso.pressaoPreCargaBar = 0.5;
        return vaso;
    };
    const rodar = (engine, vasos) => {
        const inicialL = vasos.map((v) => v.volumeAtual);
        const balancoL = vasos.map(() => 0);
        let maxPasses = 0;
        for (let i = 0; i < 100; i += 1) {
            engine.tickPipeline.advance(0.1);
            vasos.forEach((v, k) => { balancoL[k] += (v.lastQin - v.lastQout) * 0.1; });
            maxPasses = Math.max(maxPasses, engine.globalHydraulicSolver.getMetrics().lastStatusPasses);
        }
        return { furosL: vasos.map((v, k) => inicialL[k] + balancoL[k] - v.volumeAtual), maxPasses };
    };

    // Duas fontes (100 e 80 bar, teto de 10 L/s cada) num vaso travado: antes apareciam 9.100 L/s.
    const duas = createEngine();
    const f1 = new FonteLogica('F-duas-1', 'F', 0, 0);
    const f2 = new FonteLogica('F-duas-2', 'F', 0, 200);
    const travado = vasoDe('T-duas', 979.9);
    f1.pressaoFonteBar = 100;
    f2.pressaoFonteBar = 80;
    f1.vazaoMaxima = 10;
    f2.vazaoMaxima = 10;
    [f1, f2, travado].forEach((c) => duas.add(c));
    conectar(duas, f1, travado, TUBO_DESPREZIVEL);
    conectar(duas, f2, travado, TUBO_DESPREZIVEL);
    const r1 = rodar(duas, [travado]);
    approx(r1.furosL[0], 0, 1e-6, 'Duas fontes: balanco de massa');
    approx(travado.volumeAtual, 980, 1e-6, 'Duas fontes: vaso trava no piso de gas');
    assert.ok(r1.maxPasses < 12, `Duas fontes: estados convergem (${r1.maxPasses} passes)`);

    // Bomba (shutoff 100 bar) de um vaso para outro travado: antes, ping-pong da bomba e 980,3 L.
    const serie = createEngine();
    const origem = vasoDe('T-serie-1', 500);
    const destino = vasoDe('T-serie-2', 979.9);
    const bomba = new BombaLogica('P-serie', 'P', 400, 0);
    bomba.vazaoNominal = 45;
    bomba.pressaoMaxima = 100;
    bomba.grauAcionamento = 100;
    bomba.acionamentoEfetivo = 100;
    [origem, bomba, destino].forEach((c) => serie.add(c));
    conectar(serie, origem, bomba, TUBO_DESPREZIVEL);
    conectar(serie, bomba, destino, TUBO_DESPREZIVEL);
    const r2 = rodar(serie, [origem, destino]);
    r2.furosL.forEach((furoL, k) => approx(furoL, 0, 1e-6, `Vasos em serie: balanco de massa do vaso ${k + 1}`));
    assert.ok(destino.volumeAtual <= 980 + 1e-6, `Vaso de destino nao passa do piso: ${destino.volumeAtual}`);
    assert.ok(r2.maxPasses < 12, `Vasos em serie: estados convergem (${r2.maxPasses} passes)`);

    // Origem quase vazia (0,3 L) bombeando para um vaso a meio: antes, a bomba virava curto no fluxo
    // reverso, as passadas esgotavam e o destino ganhava 7 L do nada.
    const quaseVazio = createEngine();
    const poucoLiquido = vasoDe('T-pouco-1', 0.3);
    const meio = vasoDe('T-pouco-2', 600);
    const bombaPouco = new BombaLogica('P-pouco', 'P', 400, 0);
    bombaPouco.vazaoNominal = 45;
    bombaPouco.pressaoMaxima = 100;
    bombaPouco.grauAcionamento = 100;
    bombaPouco.acionamentoEfetivo = 100;
    [poucoLiquido, bombaPouco, meio].forEach((c) => quaseVazio.add(c));
    conectar(quaseVazio, poucoLiquido, bombaPouco, TUBO_DESPREZIVEL);
    conectar(quaseVazio, bombaPouco, meio, TUBO_DESPREZIVEL);
    const r4 = rodar(quaseVazio, [poucoLiquido, meio]);
    r4.furosL.forEach((furoL, k) => approx(furoL, 0, 1e-6, `Origem quase vazia: balanco de massa do vaso ${k + 1}`));
    approx(meio.volumeAtual - 600, 0.3 - poucoLiquido.volumeAtual, 1e-6, 'O destino ganha so o que a origem perdeu');
    assert.ok(r4.maxPasses < 12, `Origem quase vazia: estados convergem (${r4.maxPasses} passes)`);

    // Fonte com teto (5 L/s) igual ao espaço livre do passo (0,5 L em 0,1 s): os dois tetos fecham o
    // balanço, mas deixavam o trecho sem referência de pressão.
    const iguais = createEngine();
    const fonteIgual = new FonteLogica('F-igual', 'F', 0, 0);
    const vasoIgual = vasoDe('T-igual', 979.5);
    fonteIgual.pressaoFonteBar = 100;
    fonteIgual.vazaoMaxima = 5;
    [fonteIgual, vasoIgual].forEach((c) => iguais.add(c));
    const entradaIgual = conectar(iguais, fonteIgual, vasoIgual, TUBO_DESPREZIVEL);
    const r5 = rodar(iguais, [vasoIgual]);
    approx(r5.furosL[0], 0, 1e-6, 'Tetos iguais: balanco de massa');
    approx(vasoIgual.volumeAtual, 980, 1e-6, 'Tetos iguais: vaso trava no piso de gas');
    approx(iguais.getConnectionState(entradaIgual).outletPressureBar, 100, 1e-3, 'Tetos iguais: a entrada fica na pressao da fonte');
    assert.ok(r5.maxPasses < 12, `Tetos iguais: estados convergem (${r5.maxPasses} passes)`);

    // Vaso travado que fica isolado (válvula de entrada fecha): volta à pressão do gás, sem guardar a da trava.
    const isolado = createEngine();
    const fonteIsolado = new FonteLogica('F-isolado', 'F', 0, 0);
    const valvulaIsolado = criarValvula('V-isolado', 100);
    const vasoIsolado = vasoDe('T-isolado', 979);
    fonteIsolado.pressaoFonteBar = 100;
    fonteIsolado.vazaoMaxima = 50;
    [fonteIsolado, valvulaIsolado, vasoIsolado].forEach((c) => isolado.add(c));
    conectar(isolado, fonteIsolado, valvulaIsolado, TUBO_DESPREZIVEL);
    const entradaIsolado = conectar(isolado, valvulaIsolado, vasoIsolado, TUBO_DESPREZIVEL);
    rodar(isolado, [vasoIsolado]);
    approx(isolado.getConnectionState(entradaIsolado).outletPressureBar, 100, 1e-3, 'Travado: bocal na pressao da fonte');
    valvulaIsolado.setAbertura(0);
    valvulaIsolado.aberturaEfetiva = 0;
    rodar(isolado, [vasoIsolado]);
    approx(isolado.getConnectionState(entradaIsolado).outletPressureBar, vasoIsolado.getPressaoGasBar(), 1e-3,
        'Isolado: o bocal volta a pressao do gas');

    // Enchimento rápido (teto de 1000 L/s) abaixo do limite do gás: a curva não pode ficar plana na borda.
    const rapido = createEngine();
    const fonte = new FonteLogica('F-rapido', 'F', 0, 0);
    const enchendo = vasoDe('T-rapido', 900);
    fonte.pressaoFonteBar = 50;
    fonte.vazaoMaxima = 1000;
    [fonte, enchendo].forEach((c) => rapido.add(c));
    conectar(rapido, fonte, enchendo, TUBO_DESPREZIVEL);
    const r3 = rodar(rapido, [enchendo]);
    approx(r3.furosL[0], 0, 1e-6, 'Enchimento rapido: balanco de massa');
    assert.ok(r3.maxPasses < 12, `Enchimento rapido: estados convergem (${r3.maxPasses} passes)`);
});

test('vaso cheio e fonte no teto em ramos separados: os dois tetos ficam ativos, sem ping-pong de estados', () => {
    const engine = createEngine();
    const fonteVaso = new FonteLogica('F-pp-1', 'F', 0, 0);
    const vaso = new TanqueLogico('T-pp', 'T', 200, 0);
    const fonteDreno = new FonteLogica('F-pp-2', 'F', 0, 200);
    const dreno = new DrenoLogico('D-pp', 'D', 200, 200);
    fonteVaso.pressaoFonteBar = 100;
    fonteVaso.vazaoMaxima = 50;
    vaso.capacidadeMaxima = 1000;
    vaso.volumeAtual = 979;
    vaso.pressaoPreCargaBar = 0.5;
    fonteDreno.pressaoFonteBar = 5;
    fonteDreno.vazaoMaxima = 10;
    [fonteVaso, vaso, fonteDreno, dreno].forEach((c) => engine.add(c));
    conectar(engine, fonteVaso, vaso, TUBO_DESPREZIVEL);
    conectar(engine, fonteDreno, dreno, TUBO_DESPREZIVEL);

    for (let i = 0; i < 50; i += 1) engine.tickPipeline.advance(0.1);

    approx(vaso.volumeAtual, 980, 1e-6, 'Vaso trava no piso de gas');
    approx(dreno.vazaoRecebidaLps, 10, 1e-6, 'A outra fonte continua no teto de 10 L/s');
    assert.ok(engine.globalHydraulicSolver.getMetrics().lastStatusPasses < 12, 'Estados ativos convergem antes do limite de passes');
});

test('vaso travado destrava quando a alimentacao cai e a saida abre, sem perder massa', () => {
    const { engine, vaso } = montarVasoTravado(0);
    const fonte = engine.componentes.find((c) => c instanceof FonteLogica);
    const valvula = engine.componentes.find((c) => c instanceof ValvulaLogica);
    fonte.pressaoFonteBar = 40;
    valvula.setAbertura(100);
    valvula.aberturaEfetiva = 100;

    const volumeInicialL = vaso.volumeAtual;
    let balancoL = 0;
    for (let i = 0; i < 600; i += 1) {
        engine.tickPipeline.advance(0.1);
        balancoL += (vaso.lastQin - vaso.lastQout) * 0.1;
    }

    assert.ok(vaso.volumeAtual < volumeInicialL - 1, `O vaso esvazia: ${vaso.volumeAtual}`);
    approx(volumeInicialL + balancoL - vaso.volumeAtual, 0, 1e-6, 'Balanco de massa fecha ao destravar');
});

test('tanque aberto continua transbordando pelo ladrao, sem o teto de entrada do vaso fechado', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-ladrao', 'F', 0, 0);
    const tanque = new TanqueLogico('T-ladrao', 'T', 200, 0);
    fonte.pressaoFonteBar = 2;
    fonte.vazaoMaxima = 5;
    tanque.tipoTanque = 'atmosferico';
    tanque.capacidadeMaxima = 1000;
    tanque.volumeAtual = 999;
    [fonte, tanque].forEach((c) => engine.add(c));
    conectar(engine, fonte, tanque, TUBO_DESPREZIVEL);

    for (let i = 0; i < 20; i += 1) engine.tickPipeline.advance(0.1);

    assert.equal(tanque.getVolumeMaximoLiquidoL(), null, 'Tanque aberto nao tem limite de volume do colchao');
    approx(tanque.lastQin, 5, 1e-6, 'A fonte continua entrando');
    approx(tanque.vazaoTransbordoLps, 5, 1e-6, 'O excedente sai pelo ladrao e e contabilizado');
});

test('coluna de liquido do tanque pode ser desligada: bocais e fundo passam a ver so o gas', () => {
    const vaso = new TanqueLogico('T-coluna', 'T-coluna', 0, 0);
    const fluido = vaso.getFluidoConteudo();
    vaso.capacidadeMaxima = 1000;
    vaso.volumeAtual = 600;
    const gasBar = vaso.getPressaoGasBar(fluido);
    const colunaBar = (fluido.densidade * 9.80665 * 0.6 * vaso.alturaUtilMetros) / 1e5;

    approx(vaso.getPressaoBocalSaidaBar(fluido, false) - gasBar, colunaBar, 1e-3, 'Saida com coluna = gas + rho g h');
    approx(vaso.getPressaoGasBar(fluido) + vaso.getPressaoHidrostaticaBar(fluido) - gasBar, colunaBar, 1e-3, 'Fundo com coluna');

    vaso.considerarColunaLiquido = false;
    approx(vaso.getPressaoBocalSaidaBar(fluido, false), gasBar, 1e-12, 'Saida sem coluna = gas');
    approx(vaso.getPressaoBocalEntradaBar(fluido, true), gasBar, 1e-12, 'Entrada sem coluna = gas, mesmo com altura relativa');
    approx(vaso.getPressaoHidrostaticaBar(fluido), 0, 1e-12, 'Fundo sem coluna');
});

test('tanque ideal (sem coluna nem perdas nos bocais) e passante como o vaso do DWSIM estacionario', async () => {
    const arquivo = path.resolve('Testes/plantas dwsim/entradaBombaTanqueValvulaSPsaidacompipes.dwxmz');
    const buffer = fs.readFileSync(arquivo);
    const xml = await readDwsimFile({
        arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    });
    const engine = new SistemaSimulacao();
    restoreFlowchartDocument(engine, translateDwsimToWorkspace(parseDwsimXml(xml)).workspace);
    const porTag = (tag) => engine.componentes.find((c) => c.tag === tag);
    const tanque = porTag('TANK-1');
    // Sem o PID, a válvula fica nos 50% gravados, como no DWSIM estacionário.
    tanque.setSetpointAtivo(false);
    tanque.considerarColunaLiquido = false;
    tanque.considerarPerdasBocais = false;

    engine.isRunning = true;
    for (let t = 0; t < 1800 && !engine.getSteadyStateStatus()?.steady; t += 0.1) engine.tickPipeline.advance(0.1);
    assert.equal(engine.getSteadyStateStatus()?.steady, true, 'Atinge o regime permanente');

    // DWSIM: P entrada = P saída = 4,3096 barg no tanque; descarga da bomba a 4,3135 barg.
    approx(tanque.pressaoEntradaAtualBar, tanque.pressaoSaidaAtualBar, 1e-6, 'Tanque passante: P entrada = P saida');
    approx(tanque.pressaoSaidaAtualBar, 4.3096, 0.02, 'P do tanque igual a do DWSIM');
    approx(porTag('PUMP-1').pressaoDescargaAtualBar, 4.3135, 0.02, 'Descarga da bomba igual a do DWSIM');
    approx(tanque.lastQin, tanque.lastQout, 1e-3, 'Entrada = saida no regime permanente');
    approx(porTag('10').getPressaoSaidaBar(), porTag('10').pressaoFonteBar, 1e-6, 'A fonte segura a pressao gravada (sem teto de vazao)');
});

// Bernoulli com atrito feito à mão, independente do solver: Colebrook (não o Swamee-Jain do código)
// e g = 9,80665. A altura relativa converte 80 px do desenho em 1 m; y cresce para baixo.
const G_PADRAO = 9.80665;
const CANO_BERNOULLI = Object.freeze({ diameterM: 0.05, roughnessMm: 0.045, extraLengthM: 0, perdaLocalK: 0 });

function fatorAtritoColebrook(reynolds, rugosidadeRelativa) {
    let f = 0.02;
    for (let i = 0; i < 50; i += 1) {
        f = (-2 * Math.log10((rugosidadeRelativa / 3.7) + (2.51 / (reynolds * Math.sqrt(f))))) ** -2;
    }
    return f;
}

// Resolve ΔP_motriz = Σ perdas(Q) por bisseção; perdasPa(qM3s, f) devolve a soma das perdas em Pa.
function vazaoBernoulliLps(motrizPa, perdasPa, fluido, cano = CANO_BERNOULLI) {
    if (motrizPa <= 0) return 0;
    const area = (Math.PI * cano.diameterM ** 2) / 4;
    let baixo = 0;
    let alto = 1;
    assert.ok(perdasPa(alto, 0.008) > motrizPa, 'Bissecao: 1 m3/s precisa ser vazao demais');
    for (let i = 0; i < 100; i += 1) {
        const q = (baixo + alto) / 2;
        const reynolds = (fluido.densidade * (q / area) * cano.diameterM) / fluido.viscosidadeDinamicaPaS;
        const f = fatorAtritoColebrook(reynolds, (cano.roughnessMm / 1000) / cano.diameterM);
        if (perdasPa(q, f) < motrizPa) baixo = q;
        else alto = q;
    }
    return baixo * 1000;
}

function criarEngineAlturaRelativa() {
    const engine = createEngine();
    engine.usarAlturaRelativa = true;
    return engine;
}

test('Bernoulli com atrito no cano inclinado: descida, subida e cano sem vazao batem com a conta a mao', () => {
    // Fonte em (0, 0) e dreno em (240, dy): Δz = dy/80 e L = √(240² + dy²)/80.
    // Descarga livre (K = 0 no dreno): P_fonte + ρgΔz = f·(L/D)·ρv²/2.
    // No último caso entram K local e comprimento extra no cano (L = desenho + extra, Δz só do desenho)
    // e K no bocal do dreno, aplicado na área do bocal (Ø 0,08 m), não na do cano.
    const casos = [
        { nome: 'descida de 2 m', pressaoBar: 0.3, dyPx: 160 },
        { nome: 'subida de 2 m', pressaoBar: 0.5, dyPx: -160 },
        { nome: 'subida maior que a pressao da fonte', pressaoBar: 0.1, dyPx: -160 },
        { nome: 'descida com K local, comprimento extra e K no dreno', pressaoBar: 0.3, dyPx: 160, perdaLocalK: 2, extraLengthM: 5, kDreno: 1 },
        { nome: 'K no dreno com a geometria do bocal (Ø 0,08 m)', pressaoBar: 0.3, dyPx: 160, kDreno: 1, geometriaBocal: true }
    ];

    casos.forEach(({ nome, pressaoBar, dyPx, perdaLocalK = 0, extraLengthM = 0, kDreno = 0, geometriaBocal = false }) => {
        const engine = criarEngineAlturaRelativa();
        const fonte = new FonteLogica(`F-bern-${nome}`, 'F', 0, 0);
        const dreno = new DrenoLogico(`D-bern-${nome}`, 'D', 240, dyPx);
        fonte.pressaoFonteBar = pressaoBar;
        fonte.vazaoMaxima = 500;
        dreno.perdaEntradaK = kDreno;
        dreno.diametroConexaoM = 0.08;
        dreno.usarGeometriaBocal = geometriaBocal;
        [fonte, dreno].forEach((c) => engine.add(c));
        const cano = conectar(engine, fonte, dreno, { ...CANO_BERNOULLI, perdaLocalK, extraLengthM });

        for (let i = 0; i < 600; i += 1) engine.tickPipeline.advance(0.1);

        const fluido = engine.fluidoOperante;
        const deltaZ = dyPx / 80;
        const comprimentoM = (Math.hypot(240, dyPx) / 80) + extraLengthM;
        const area = (Math.PI * CANO_BERNOULLI.diameterM ** 2) / 4;
        // Padrão (DWSIM): K do dreno na velocidade do cano. Com a geometria do bocal: K na velocidade
        // do bocal + expansão de Borda-Carnot do cano Ø 0,05 para o bocal Ø 0,08, (1 − A_cano/A_bocal)²·v_cano².
        const areaDreno = (Math.PI * 0.08 ** 2) / 4;
        const termoDreno = (q) => (geometriaBocal
            ? (kDreno * ((q / areaDreno) ** 2)) + (((1 - (area / areaDreno)) ** 2) * ((q / area) ** 2))
            : kDreno * ((q / area) ** 2));
        const esperadoLps = vazaoBernoulliLps(
            (pressaoBar * 1e5) + (fluido.densidade * G_PADRAO * deltaZ),
            (q, f) => (fluido.densidade / 2) * (
                ((perdaLocalK + (f * (comprimentoM / CANO_BERNOULLI.diameterM))) * ((q / area) ** 2))
                + termoDreno(q)
            ),
            fluido
        );
        const estado = engine.getConnectionState(cano);

        approx(estado.headGainM, deltaZ, 1e-9, `${nome}: desnivel lido do desenho`);
        approx(estado.lengthM, comprimentoM, 1e-9, `${nome}: comprimento lido do desenho`);
        if (esperadoLps === 0) {
            assert.equal(estado.flowLps, 0, `${nome}: a fonte nao vence a coluna e o cano fica parado`);
        } else {
            approx(estado.flowLps, esperadoLps, 0.01 * esperadoLps, `${nome}: vazao de Bernoulli com atrito`);
        }
    });
});

test('referencia das perdas no bocal: cano por padrao, bocal + transicao com a geometria ligada', () => {
    const areaDe = (d) => (Math.PI * d ** 2) / 4;
    const bocal = (diametroM, usarGeometriaBocal) => ({ usarGeometriaBocal, getAreaConexaoM2: () => areaDe(diametroM) });
    const cano = areaDe(0.05);

    // Padrão (DWSIM): o K vai inteiro para a velocidade do cano, qualquer que seja o bocal.
    assert.deepEqual(referenciaPerdaBocal(bocal(0.08, false), 1.5, cano, 'saida'), { areaM2: cano, lossCoeff: 1.5 });

    // Bocal do mesmo diâmetro do cano: sem transição, igual ao padrão.
    const igual = referenciaPerdaBocal(bocal(0.05, true), 1.5, cano, 'saida', { kEnergiaCinetica: 1 });
    approx(igual.areaM2, cano, 1e-15, 'Bocal = cano: mesma area');
    approx(igual.lossCoeff, 1.5, 1e-12, 'Bocal = cano: mesmo K');

    // Entrada do tanque (K = 1 do jato), cano Ø 0,05 → bocal Ø 0,08: expansão (1 − A_c/A_b)² em v_cano,
    // convertida para v_bocal por (A_b/A_c)².
    const r = cano / areaDe(0.08);
    const entrada = referenciaPerdaBocal(bocal(0.08, true), 1, cano, 'entrada');
    approx(entrada.lossCoeff, 1 + (((1 - r) ** 2) / (r ** 2)), 1e-12, 'Entrada: K do jato + Borda-Carnot');

    // Entrada num bocal menor (Ø 0,05 ← cano Ø 0,08): contração 0,5·(1 − A_b/A_c) já em v_bocal.
    const contracao = referenciaPerdaBocal(bocal(0.05, true), 0, areaDe(0.08), 'entrada');
    approx(contracao.lossCoeff, 0.5 * (1 - r), 1e-12, 'Entrada: contracao');

    // Saída do tanque, bocal Ø 0,05 → cano Ø 0,08: (1/Cd² − 1) + carga cinética do cano (A_b/A_c)² + Borda-Carnot.
    const kCd = 1 / (0.82 ** 2);
    const saida = referenciaPerdaBocal(bocal(0.05, true), kCd, areaDe(0.08), 'saida', { kEnergiaCinetica: 1 });
    approx(saida.lossCoeff, (kCd - 1) + (r ** 2) + ((1 - r) ** 2), 1e-12, 'Saida: energia cinetica cobrada uma vez');
});

test('Bernoulli sem vazao: valvula fechada 2 m abaixo da fonte ve P_fonte + rho g dz', () => {
    const engine = criarEngineAlturaRelativa();
    const fonte = new FonteLogica('F-bern-est', 'F', 0, 0);
    const valvula = criarValvula('V-bern-est', 100);
    const dreno = new DrenoLogico('D-bern-est', 'D', 480, 160);
    valvula.x = 240;
    valvula.y = 160;
    valvula.setAbertura(0);
    valvula.aberturaEfetiva = 0;
    fonte.pressaoFonteBar = 0.3;
    fonte.vazaoMaxima = 500;
    [fonte, valvula, dreno].forEach((c) => engine.add(c));
    const descida = conectar(engine, fonte, valvula, CANO_BERNOULLI);
    conectar(engine, valvula, dreno, CANO_BERNOULLI);

    for (let i = 0; i < 50; i += 1) engine.tickPipeline.advance(0.1);

    const esperadoBar = 0.3 + ((engine.fluidoOperante.densidade * G_PADRAO * 2) / 1e5);
    const estado = engine.getConnectionState(descida);
    assert.equal(estado.flowLps, 0, 'Valvula fechada nao deixa passar vazao');
    approx(estado.outletPressureBar, esperadoBar, 1e-3 * esperadoBar, 'Hidrostatica: P = P_fonte + rho g dz');
});

test('Torricelli com atrito: tanque aberto com nivel fixo drenando por cano 2,1 m abaixo do bocal', () => {
    // Bocal de saída a 0,1 m do fundo e dreno 2 m abaixo do fundo: Δz do cano = 2,1 m.
    // Perdas: bocal 1/Cd² + atrito no cano; descarga livre no dreno.
    // Padrão (DWSIM): 1/Cd² na velocidade do cano. Com a geometria do bocal (Ø 0,08 m → cano Ø 0,05 m):
    // (1/Cd² − 1)·v_bocal² + v_cano² + contração 0,5·(1 − A_cano/A_bocal)·v_cano².
    // Com a coluna desligada, só o ρgΔz do cano empurra o líquido.
    [[true, false], [false, false], [true, true], [false, true]].forEach(([considerarColuna, geometriaBocal]) => {
        const engine = criarEngineAlturaRelativa();
        const tanque = new TanqueLogico(`T-torr-atr-${considerarColuna}-${geometriaBocal}`, 'T', 0, 0);
        const dreno = new DrenoLogico(`D-torr-atr-${considerarColuna}-${geometriaBocal}`, 'D', 240, 160);
        tanque.tipoTanque = 'atmosferico';
        tanque.capacidadeMaxima = 1000;
        tanque.alturaUtilMetros = 2.4;
        tanque.alturaBocalSaidaM = 0.1;
        tanque.coeficienteSaida = 0.82;
        tanque.considerarPerdasBocais = true;
        tanque.diametroConexaoM = 0.08;
        tanque.usarGeometriaBocal = geometriaBocal;
        tanque.considerarColunaLiquido = considerarColuna;
        dreno.perdaEntradaK = 0;
        [tanque, dreno].forEach((c) => engine.add(c));
        const cano = conectar(engine, tanque, dreno, CANO_BERNOULLI);

        for (let i = 0; i < 600; i += 1) {
            tanque.volumeAtual = 600;
            engine.tickPipeline.advance(0.1);
        }

        const fluido = engine.fluidoOperante;
        const nivelM = 0.6 * 2.4;
        const deltaZ = (160 + (0.1 * 80)) / 80;
        const comprimentoM = Math.hypot(240, 168) / 80;
        const areaCano = (Math.PI * CANO_BERNOULLI.diameterM ** 2) / 4;
        const areaBocal = (Math.PI * 0.08 ** 2) / 4;
        const cargaM = (considerarColuna ? nivelM - 0.1 : 0) + deltaZ;
        const termoBocal = (q) => (geometriaBocal
            ? ((((1 / (0.82 ** 2)) - 1) * ((q / areaBocal) ** 2))
                + ((1 + (0.5 * (1 - (areaCano / areaBocal)))) * ((q / areaCano) ** 2)))
            : ((q / areaCano) ** 2) / (0.82 ** 2));
        const esperadoLps = vazaoBernoulliLps(
            fluido.densidade * G_PADRAO * cargaM,
            (q, f) => (fluido.densidade / 2) * (
                termoBocal(q)
                + (f * (comprimentoM / CANO_BERNOULLI.diameterM) * ((q / areaCano) ** 2))
            ),
            fluido
        );
        const rotulo = `${considerarColuna ? 'com' : 'sem'} coluna, ${geometriaBocal ? 'com' : 'sem'} geometria do bocal`;

        approx(engine.getConnectionState(cano).headGainM, deltaZ, 1e-9, `${rotulo}: desnivel bocal -> dreno`);
        approx(engine.getConnectionState(cano).flowLps, esperadoLps, 0.01 * esperadoLps, `${rotulo}: vazao de Torricelli com atrito`);
    });
});

test('tanque fechado transmite pressao do colchao de gas aos bocais e ao diagnostico de setpoint', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-vaso-sp', 'F-vaso-sp', 0, 0);
    const vaso = new TanqueLogico('T-vaso-sp', 'T-vaso-sp', 0, 0);
    const valvulaSaida = criarValvula('V-vaso-out', 80);
    const dreno = new DrenoLogico('D-vaso-sp', 'D-vaso-sp', 0, 0);

    fonte.pressaoFonteBar = 3.0;
    fonte.vazaoMaxima = 20;
    vaso.tipoTanque = 'fechado';
    vaso.pressaoPreCargaBar = 1.0;
    vaso.capacidadeMaxima = 1000;
    vaso.volumeAtual = 500;
    vaso.setpoint = 50;
    [fonte, vaso, valvulaSaida, dreno].forEach((c) => engine.add(c));
    conectar(engine, fonte, vaso, TUBO_DESPREZIVEL);
    conectar(engine, vaso, valvulaSaida, TUBO_DESPREZIVEL);
    conectar(engine, valvulaSaida, dreno, TUBO_DESPREZIVEL);

    passo(engine, 0.1);

    const fluido = vaso.getFluidoConteudo();
    const pressaoGasEsperadaBar = ((1.0 + fluido.pressaoAtmosfericaBar) * 2) - fluido.pressaoAtmosfericaBar;
    approx(vaso.getPressaoGasBar(fluido), pressaoGasEsperadaBar, 0.05, 'Pressao do colchao de gas a 50% de nivel');
    assert.ok(
        vaso.pressaoSaidaAtualBar > pressaoGasEsperadaBar,
        `Bocal de saida soma colchao de gas e coluna hidrostatica: ${vaso.pressaoSaidaAtualBar} > ${pressaoGasEsperadaBar}`
    );

    const resumoSp = vaso.getResumoAjustePressaoSetpoint(fluido, false);
    approx(
        resumoSp.pressaoSaidaSetpointBar,
        vaso.getPressaoBocalSaidaParaNivelBar(fluido, 0.5, false),
        1e-9,
        'Resumo do setpoint no vaso fechado considera a pressao do gas na saida'
    );
    approx(
        resumoSp.pressaoBaseEntradaSetpointBar,
        vaso.getPressaoBocalEntradaParaNivelBar(fluido, 0.5, false),
        1e-9,
        'Resumo do setpoint no vaso fechado considera a contrapressao do gas na entrada'
    );
    assert.equal(vaso.vazaoTransbordoLps, 0, 'Vaso fechado nao gera vazao de transbordo atmosferico');
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
    tanque.tipoTanque = 'atmosferico';
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
    tanque.tipoTanque = 'atmosferico';
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

test('bomba sobe de 0 a 32 m3/h sem zerar na presenca de ramos bloqueados e cavitacao no limite da fonte', () => {
    const engine = createEngine();
    const fonte1 = new FonteLogica('F-b1', 'F-b1', 0, 100);
    const bomba1 = new BombaLogica('P-b1', 'P-b1', 200, 100);
    const fonte2 = new FonteLogica('F-b2', 'F-b2', 0, 200);
    const bomba2 = new BombaLogica('P-b2', 'P-b2', 200, 200);
    const tanque = new TanqueLogico('T-b', 'T-b', 400, 150);
    const valvulaFechada = criarValvula('V-fechada', 60);
    valvulaFechada.setAbertura(0);
    valvulaFechada.aberturaEfetiva = 0;
    const dreno = new DrenoLogico('D-b', 'D-b', 800, 150);

    [fonte1, bomba1, fonte2, bomba2, tanque, valvulaFechada, dreno].forEach((c) => engine.add(c));
    conectar(engine, fonte1, bomba1);
    conectar(engine, bomba1, tanque);
    conectar(engine, fonte2, bomba2);
    conectar(engine, bomba2, tanque);
    conectar(engine, tanque, valvulaFechada);
    conectar(engine, valvulaFechada, dreno);
    bomba1.setAcionamento(100);
    bomba2.setAcionamento(100);

    const dt = 0.016;
    let vazaoAnteriorM3h = 0;
    let atingiu32M3h = false;

    for (let i = 1; i <= 300; i += 1) {
        engine.tickPipeline.advance(dt);
        const vazaoM3h = bomba1.fluxoReal * 3.6;
        assert.ok(Number.isFinite(vazaoM3h), `Vazao finita no passo ${i}`);
        assert.ok(
            vazaoM3h >= vazaoAnteriorM3h - 1e-3,
            `Bomba nao pode cair abruptamente no passo ${i}: ${vazaoAnteriorM3h.toFixed(2)} -> ${vazaoM3h.toFixed(2)} m3/h`
        );
        if (Math.abs(vazaoM3h - 32) <= 0.05) atingiu32M3h = true;
        if (atingiu32M3h) {
            approx(vazaoM3h, 32, 0.05, `Bomba sustenta 32 m3/h no passo ${i}`);
        }
        vazaoAnteriorM3h = vazaoM3h;
    }

    assert.ok(atingiu32M3h, 'Bomba deve atingir 32 m3/h e permanecer estavel');
});

test('bomba succionando de tanque alimentado a 32 m3/h estabiliza em 32 m3/h sem zerar com altura relativa e jitter de dt', () => {
    const engine = createEngine();
    engine.usarAlturaRelativa = true;
    const fonte = new FonteLogica('F-tq-b', 'F-tq-b', 0, 100);
    const tanque = new TanqueLogico('T-tq-b', 'T-tq-b', 200, 100);
    const bomba = new BombaLogica('P-tq-b', 'P-tq-b', 400, 100);
    const dreno = new DrenoLogico('D-tq-b', 'D-tq-b', 600, 100);

    [fonte, tanque, bomba, dreno].forEach((c) => engine.add(c));
    conectar(engine, fonte, tanque);
    conectar(engine, tanque, bomba);
    conectar(engine, bomba, dreno);
    bomba.setAcionamento(100);

    let iniciouBombeamento = false;
    for (let i = 1; i <= 900; i += 1) {
        const dt = 0.016 + (0.002 * Math.sin(i));
        engine.tickPipeline.advance(dt);
        const vazaoM3h = bomba.fluxoReal * 3.6;
        if (vazaoM3h > 1) iniciouBombeamento = true;
        if (iniciouBombeamento) {
            assert.ok(
                vazaoM3h > 0.5,
                `Bomba nao pode zerar apos iniciar bombeamento (passo ${i}: ${vazaoM3h.toFixed(2)} m3/h)`
            );
        }
    }

    approx(bomba.fluxoReal * 3.6, 32, 0.05, 'Bomba estabiliza na vazao de entrada do tanque (32 m3/h)');
});
