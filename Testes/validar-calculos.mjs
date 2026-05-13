import assert from 'node:assert/strict';
import test from 'node:test';

import { FLUID_PRESETS, SistemaSimulacao } from '../js/application/engine/SimulationEngine.js';
import { BombaLogica } from '../js/domain/components/BombaLogica.js';
import { mixFluidos } from '../js/domain/components/Fluido.js';
import { FonteLogica } from '../js/domain/components/FonteLogica.js';
import { TanqueLogico } from '../js/domain/components/TanqueLogico.js';
import {
    TrocadorCalorLogico,
    calcularSaidaTrocadorCalor
} from '../js/domain/components/TrocadorCalorLogico.js';
import { VALVE_PROFILE_DEFINITIONS, ValvulaLogica } from '../js/domain/components/ValvulaLogica.js';
import { pressureLossFromFlow } from '../js/domain/components/BaseComponente.js';
import { ConnectionModel } from '../js/domain/models/ConnectionModel.js';
import {
    darcyFrictionFactor,
    diameterFromFlowVelocity,
    diameterFromM3sVelocity,
    ensureConnectionProperties,
    getCurrentDesignFlowCandidateLps,
    getSuggestedDiameterForConnection
} from '../js/domain/services/PipeHydraulics.js';
import { buildPumpCurveDatasets } from '../js/infrastructure/charts/PumpChartAdapter.js';
import { DEFAULT_ATMOSPHERIC_PRESSURE_BAR, pressureFromHeadBar } from '../js/utils/Units.js';

function approx(actual, expected, tolerance, label) {
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `${label}: esperado ${expected}, obtido ${actual}`
    );
}

function createEngine() {
    const engine = new SistemaSimulacao();
    engine.usarAlturaRelativa = true;
    engine.fluidoOperante.densidade = 1000;
    return engine;
}

test('dimensionamento por continuidade calcula diâmetro a partir de vazão e velocidade', () => {
    const flowM3s = 0.026995881908059335;
    const velocityMps = 5.370660060990888;

    approx(
        diameterFromM3sVelocity(flowM3s, velocityMps),
        0.08,
        1e-12,
        'Diâmetro por Q em m³/s e v em m/s'
    );
    approx(
        diameterFromFlowVelocity(flowM3s * 1000, velocityMps),
        0.08,
        1e-12,
        'Diâmetro por vazão interna em L/s e v em m/s'
    );
});

test('propriedades hidraulicas de conexao preservam zero fisico e reparam invalidos', () => {
    const semPerdas = new ConnectionModel({
        sourceId: 'F-01',
        targetId: 'D-01',
        diameterM: 0.05,
        roughnessMm: 0,
        extraLengthM: 0,
        perdaLocalK: 0
    });

    assert.equal(semPerdas.roughnessMm, 0);
    assert.equal(semPerdas.extraLengthM, 0);
    assert.equal(semPerdas.perdaLocalK, 0);
    assert.ok(semPerdas.areaM2 > 0, 'Diametro valido deve gerar area positiva');

    const corrigida = ensureConnectionProperties({
        diameterM: -0.1,
        roughnessMm: -1,
        extraLengthM: -2,
        perdaLocalK: -3,
        designVelocityMps: 0,
        designFlowLps: -4,
        transientFlowLps: Number.POSITIVE_INFINITY,
        lastResolvedFlowLps: Number.NaN
    });

    assert.ok(corrigida.diameterM > 0, 'Diametro invalido deve voltar ao padrao positivo');
    assert.ok(corrigida.roughnessMm >= 0, 'Rugosidade nao pode ficar negativa');
    assert.ok(corrigida.extraLengthM >= 0, 'Comprimento extra nao pode ficar negativo');
    assert.ok(corrigida.perdaLocalK >= 0, 'Perda local nao pode ficar negativa');
    assert.ok(corrigida.designVelocityMps > 0, 'Velocidade de projeto deve ficar positiva');
    assert.equal(corrigida.designFlowLps, 0);
    assert.equal(corrigida.transientFlowLps, 0);
    assert.equal(corrigida.lastResolvedFlowLps, 0);
    assert.ok(corrigida.areaM2 > 0, 'Conexao corrigida deve manter area hidraulica positiva');
});

test('perda de pressao preserva coeficiente zero e atrito laminar Darcy', () => {
    approx(
        pressureLossFromFlow(10, 0.01, 1000, 0),
        0,
        1e-12,
        'Perda de pressao com K zero'
    );
    approx(
        darcyFrictionFactor(100, 0),
        0.64,
        1e-12,
        'Fator de Darcy laminar deve seguir 64/Re sem teto artificial'
    );
    approx(
        darcyFrictionFactor(2000, 0),
        0.032,
        1e-12,
        'Fator de Darcy laminar proximo da transicao'
    );
});

test('tanque normaliza altura util e bocais para manter hidrostatica fisica', () => {
    const tanque = new TanqueLogico('T-NORM', 'Tanque-Norm', 0, 0);
    const fluido = FLUID_PRESETS.agua;

    tanque.alturaUtilMetros = -2;
    tanque.alturaBocalEntradaM = -1;
    tanque.alturaBocalSaidaM = 99;
    tanque.normalizarAlturasBocais();

    assert.ok(tanque.alturaUtilMetros >= 0.5, 'Altura util deve permanecer positiva');
    assert.ok(tanque.alturaBocalEntradaM >= 0 && tanque.alturaBocalEntradaM <= tanque.alturaUtilMetros);
    assert.ok(tanque.alturaBocalSaidaM >= 0 && tanque.alturaBocalSaidaM <= tanque.alturaUtilMetros);
    approx(
        tanque.getPressaoHidrostaticaParaNivelBar(fluido, 1),
        pressureFromHeadBar(tanque.alturaUtilMetros, fluido.densidade),
        1e-12,
        'Pressao hidrostatica deve seguir rho*g*h'
    );
});

test('trocador de calor usa efetividade NTU e conserva sentido termico', () => {
    const resultado = calcularSaidaTrocadorCalor({
        temperaturaEntradaC: 20,
        temperaturaServicoC: 80,
        uaWPorK: 4182,
        vazaoLps: 1,
        densidadeKgM3: 1000,
        calorEspecificoJkgK: 4182,
        efetividadeMaxima: 0.99
    });

    const efetividadeEsperada = 1 - Math.exp(-1);
    approx(resultado.efetividade, efetividadeEsperada, 1e-12, 'Efetividade NTU');
    approx(resultado.temperaturaSaidaC, 20 + (efetividadeEsperada * 60), 1e-9, 'Temperatura de saida aquecida');
    approx(resultado.cargaTermicaW, resultado.capacidadeTermicaWPorK * resultado.deltaTemperaturaC, 1e-9, 'Carga termica por m_dot cp dT');

    const resfriamento = calcularSaidaTrocadorCalor({
        temperaturaEntradaC: 80,
        temperaturaServicoC: 20,
        uaWPorK: 4182,
        vazaoLps: 1,
        densidadeKgM3: 1000,
        calorEspecificoJkgK: 4182
    });

    assert.ok(resfriamento.temperaturaSaidaC < 80, 'Servico frio deve resfriar o fluido');
    assert.ok(resfriamento.cargaTermicaW < 0, 'Carga termica negativa indica resfriamento');
});

test('trocador de calor clona fluido de saida sem alterar composicao hidraulica', () => {
    const trocador = new TrocadorCalorLogico('HX-01', 'TC-01', 0, 0);
    const agua = FLUID_PRESETS.agua;

    trocador.temperaturaServicoC = 80;
    trocador.uaWPorK = 4182;
    const saida = trocador.getFluidoSaidaPara(agua, 1);

    assert.notEqual(saida, agua);
    assert.equal(saida.densidade, agua.densidade);
    assert.equal(saida.viscosidadeDinamicaPaS, agua.viscosidadeDinamicaPaS);
    assert.ok(saida.temperatura > agua.temperatura);
});

test('fonte mantem propriedades de fluido de entrada independentes do fluido operante', () => {
    const fonte = new FonteLogica('F-01', 'inlet-01', 0, 0);

    assert.equal(fonte.fluidoEntrada.nome, '\u00c1gua');
    approx(fonte.fluidoEntrada.densidade, 997, 1e-12, 'densidade padrao do fluido de entrada');
    approx(fonte.fluidoEntrada.viscosidadeDinamicaPaS, 0.00089, 1e-12, 'viscosidade padrao do fluido de entrada');
    approx(fonte.fluidoEntrada.pressaoVaporBar, 0.0317, 1e-12, 'pressao de vapor padrao do fluido de entrada');

    fonte.atualizarFluidoEntrada({
        nome: 'Oleo teste',
        densidade: 850,
        temperatura: 40,
        viscosidadeDinamicaPaS: 0.02,
        pressaoVaporBar: 0.004,
        pressaoAtmosfericaBar: 1.02
    });

    assert.equal(fonte.fluidoEntrada.nome, 'Oleo teste');
    approx(fonte.fluidoEntrada.densidade, 850, 1e-12, 'densidade customizada do fluido de entrada');
    approx(fonte.fluidoEntrada.temperatura, 40, 1e-12, 'temperatura customizada do fluido de entrada');
    approx(fonte.fluidoEntrada.viscosidadeDinamicaPaS, 0.02, 1e-12, 'viscosidade customizada do fluido de entrada');
    approx(fonte.fluidoEntrada.pressaoVaporBar, 0.004, 1e-12, 'pressao de vapor customizada do fluido de entrada');
    approx(fonte.fluidoEntrada.pressaoAtmosfericaBar, 1.02, 1e-12, 'pressao atmosferica customizada do fluido de entrada');
});

test('presets de fluido usam a mesma pressao atmosferica padrao', () => {
    Object.entries(FLUID_PRESETS).forEach(([presetId, preset]) => {
        approx(
            preset.pressaoAtmosfericaBar,
            DEFAULT_ATMOSPHERIC_PRESSURE_BAR,
            1e-12,
            `pressao atmosferica padrao do preset ${presetId}`
        );
    });
});

test('mistura de fluidos pondera densidade e viscosidade por contribuicao', () => {
    const mistura = mixFluidos([
        { fluido: FLUID_PRESETS.agua, flowLps: 2 },
        { fluido: FLUID_PRESETS.oleo_leve, flowLps: 1 }
    ]);

    const densidadeEsperada = ((2 * FLUID_PRESETS.agua.densidade) + FLUID_PRESETS.oleo_leve.densidade) / 3;
    const viscosidadeEsperada = Math.exp(
        ((2 / 3) * Math.log(FLUID_PRESETS.agua.viscosidadeDinamicaPaS))
        + ((1 / 3) * Math.log(FLUID_PRESETS.oleo_leve.viscosidadeDinamicaPaS))
    );

    approx(mistura.densidade, densidadeEsperada, 1e-9, 'densidade da mistura');
    approx(mistura.viscosidadeDinamicaPaS, viscosidadeEsperada, 1e-12, 'viscosidade logaritmica da mistura');
    approx(mistura.composicao['Água'], 2 / 3, 1e-12, 'fracao de agua na mistura');
    approx(mistura.composicao['Óleo leve'], 1 / 3, 1e-12, 'fracao de oleo leve na mistura');
});

test('mistura de fluidos conserva energia sensivel ao calcular temperatura', () => {
    const fluidoFrio = {
        nome: 'Fluido frio',
        densidade: 1000,
        temperatura: 20,
        viscosidadeDinamicaPaS: 0.001,
        calorEspecificoJkgK: 4000,
        pressaoVaporBar: 0.02,
        pressaoAtmosfericaBar: DEFAULT_ATMOSPHERIC_PRESSURE_BAR
    };
    const fluidoQuente = {
        nome: 'Fluido quente',
        densidade: 800,
        temperatura: 100,
        viscosidadeDinamicaPaS: 0.002,
        calorEspecificoJkgK: 2000,
        pressaoVaporBar: 0.01,
        pressaoAtmosfericaBar: DEFAULT_ATMOSPHERIC_PRESSURE_BAR
    };

    const mistura = mixFluidos([
        { fluido: fluidoFrio, volumeL: 1 },
        { fluido: fluidoQuente, volumeL: 1 }
    ]);
    const capacidadeFrio = fluidoFrio.densidade * fluidoFrio.calorEspecificoJkgK;
    const capacidadeQuente = fluidoQuente.densidade * fluidoQuente.calorEspecificoJkgK;
    const temperaturaEsperada = (
        (capacidadeFrio * fluidoFrio.temperatura)
        + (capacidadeQuente * fluidoQuente.temperatura)
    ) / (capacidadeFrio + capacidadeQuente);
    const calorEspecificoEsperado = (capacidadeFrio + capacidadeQuente) / (fluidoFrio.densidade + fluidoQuente.densidade);

    approx(mistura.temperatura, temperaturaEsperada, 1e-12, 'Temperatura por balanco de energia sensivel');
    approx(mistura.calorEspecificoJkgK, calorEspecificoEsperado, 1e-12, 'Cp massico da mistura');
});

test('mistura do tanque considera volume que saiu no mesmo passo', () => {
    const tanque = new TanqueLogico('T-MIX', 'Tanque-Mix', 0, 0);
    const agua = FLUID_PRESETS.agua;
    const oleo = FLUID_PRESETS.oleo_leve;

    tanque.fluidoConteudo = mixFluidos([{ fluido: agua, volumeL: 100 }]);
    tanque.volumeAtual = 70;
    tanque.lastQin = 50;
    tanque.lastQout = 80;
    tanque.atualizarMisturaConteudo(1, oleo, 100);

    const densidadeEsperada = ((20 * agua.densidade) + (50 * oleo.densidade)) / 70;
    approx(tanque.fluidoConteudo.densidade, densidadeEsperada, 1e-9, 'Densidade apos entrada e saida simultaneas');
    approx(tanque.fluidoConteudo.composicao[agua.nome], 20 / 70, 1e-12, 'Fracao retida de agua no tanque');
    approx(tanque.fluidoConteudo.composicao[oleo.nome], 50 / 70, 1e-12, 'Fracao retida de oleo no tanque');
});

test('fonte preserva preset custom mesmo com propriedades iguais a um preset', () => {
    const fonte = new FonteLogica('F-02', 'inlet-02', 0, 0);

    fonte.atualizarFluidoEntrada({
        nome: '\u00c1gua',
        densidade: 997,
        temperatura: 25,
        viscosidadeDinamicaPaS: 0.00089,
        pressaoVaporBar: 0.0317
    }, { presetId: 'custom' });

    assert.equal(fonte.fluidoEntradaPresetId, 'custom');
});

test('diâmetro sugerido usa vazão de projeto estável ao aplicar repetidas vezes', () => {
    const connection = new ConnectionModel({
        sourceId: 'F-01',
        targetId: 'D-01',
        designVelocityMps: 2
    });
    const initialState = {
        flowLps: 20,
        targetFlowLps: 20
    };

    const firstSuggestion = getSuggestedDiameterForConnection(connection, initialState);
    connection.diameterM = firstSuggestion;
    connection.refreshDerivedState();

    const recalculatedStateAfterApply = {
        flowLps: 12,
        targetFlowLps: 12
    };
    const secondSuggestion = getSuggestedDiameterForConnection(connection, recalculatedStateAfterApply);

    approx(connection.designFlowLps, 20, 1e-12, 'Vazão de projeto preservada');
    approx(secondSuggestion, firstSuggestion, 1e-12, 'Diâmetro sugerido deve permanecer estável');

    connection.designFlowLps = getCurrentDesignFlowCandidateLps(connection, {
        flowLps: 8,
        targetFlowLps: 14
    });
    const updatedSuggestion = getSuggestedDiameterForConnection(connection, recalculatedStateAfterApply);

    approx(connection.designFlowLps, 14, 1e-12, 'Vazão de projeto pode ser atualizada explicitamente pela vazão alvo atual');
    approx(updatedSuggestion, diameterFromFlowVelocity(14, 2), 1e-12, 'Diâmetro sugerido deve refletir a nova vazão de projeto');
});

test('tempo de curso e rampa aceitam zero e respeitam a escala configurada', () => {
    const valvula = new ValvulaLogica('V-01', 'V-01', 0, 0);
    valvula.aberturaEfetiva = 0;
    valvula.grauAbertura = 100;
    valvula.tempoCursoSegundos = 10;
    valvula.atualizarDinamica(1);
    approx(valvula.aberturaEfetiva, 10, 1e-9, 'Tempo de curso da válvula');

    valvula.aberturaEfetiva = 20;
    valvula.grauAbertura = 70;
    valvula.tempoCursoSegundos = 10;
    valvula.atualizarDinamica(2);
    approx(valvula.aberturaEfetiva, 40, 1e-9, 'Tempo de curso em deslocamento parcial da válvula');

    valvula.grauAbertura = 0;
    valvula.atualizarDinamica(3);
    approx(valvula.aberturaEfetiva, 10, 1e-9, 'Tempo de curso no fechamento parcial da válvula');

    valvula.tempoCursoSegundos = 0;
    valvula.atualizarDinamica(0.5);
    approx(valvula.aberturaEfetiva, 0, 1e-9, 'Tempo de curso zero da válvula');

    const bomba = new BombaLogica('B-01', 'B-01', 0, 0);
    bomba.acionamentoEfetivo = 0;
    bomba.grauAcionamento = 100;
    bomba.tempoRampaSegundos = 4;
    bomba.atualizarDinamica(1);
    approx(bomba.acionamentoEfetivo, 25, 1e-9, 'Tempo de rampa da bomba');

    bomba.tempoRampaSegundos = 0;
    bomba.atualizarDinamica(0.2);
    approx(bomba.acionamentoEfetivo, 100, 1e-9, 'Tempo de rampa zero da bomba');
});

test('característica da válvula altera capacidade hidráulica na mesma abertura', () => {
    const valvula = new ValvulaLogica('V-02', 'V-02', 0, 0);
    valvula.aberturaEfetiva = 50;
    valvula.cv = 10;
    valvula.perdaLocalK = 1;
    valvula.rangeabilidade = 30;

    const parametrosPorTipo = (tipo) => {
        valvula.tipoCaracteristica = tipo;
        return valvula.getParametrosHidraulicos();
    };

    const igualPorcentagem = parametrosPorTipo('equal_percentage');
    const linear = parametrosPorTipo('linear');
    const aberturaRapida = parametrosPorTipo('quick_opening');

    assert.ok(
        igualPorcentagem.characteristicFactor < linear.characteristicFactor
            && linear.characteristicFactor < aberturaRapida.characteristicFactor,
        'As características devem gerar fatores de abertura diferentes'
    );
    assert.ok(
        igualPorcentagem.effectiveCv < linear.effectiveCv
            && linear.effectiveCv < aberturaRapida.effectiveCv,
        'A característica deve alterar o Cv efetivo usado pela simulação'
    );
    assert.ok(
        igualPorcentagem.hydraulicAreaM2 < linear.hydraulicAreaM2
            && linear.hydraulicAreaM2 < aberturaRapida.hydraulicAreaM2,
        'A característica deve alterar a área hidráulica efetiva'
    );
    assert.ok(
        igualPorcentagem.localLossCoeff > linear.localLossCoeff
            && linear.localLossCoeff > aberturaRapida.localLossCoeff,
        'A característica deve alterar a perda local efetiva'
    );
});

test('valvula aberta com K zero nao aplica perda minima escondida', () => {
    const valvula = new ValvulaLogica('V-zero', 'V-zero', 0, 0);
    valvula.aplicarPerfilCaracteristica('custom');
    valvula.setCoeficienteVazao(250);
    valvula.setCoeficientePerda(0);
    valvula.setTipoCaracteristica('linear');
    valvula.aberturaEfetiva = 100;

    const parametros = valvula.getParametrosHidraulicos();

    approx(parametros.localLossCoeff, 25 / (250 * 250), 1e-12, 'Perda local deve vir apenas do Cv efetivo');
    assert.ok(parametros.localLossCoeff < 0.001, 'Valvula com Cv alto e K zero deve ser praticamente transparente');
});

test('perfis da válvula aplicam propriedades e modo personalizado libera edição fina', () => {
    const valvula = new ValvulaLogica('V-03', 'V-03', 0, 0);
    const perfilRapido = VALVE_PROFILE_DEFINITIONS.quick_opening;

    assert.equal(valvula.aplicarPerfilCaracteristica('quick_opening'), true);
    assert.equal(valvula.perfilCaracteristica, 'quick_opening');
    assert.equal(valvula.tipoCaracteristica, perfilRapido.tipoCaracteristica);
    approx(valvula.cv, perfilRapido.cv, 1e-12, 'Cv do perfil de abertura rápida');
    approx(valvula.perdaLocalK, perfilRapido.perdaLocalK, 1e-12, 'K do perfil de abertura rápida');
    assert.equal(valvula.rangeabilidade, perfilRapido.rangeabilidade);
    assert.equal(valvula.tempoCursoSegundos, perfilRapido.tempoCursoSegundos);

    valvula.aberturaEfetiva = 0;
    valvula.grauAbertura = 100;
    valvula.atualizarDinamica(1);
    approx(
        valvula.aberturaEfetiva,
        100 / perfilRapido.tempoCursoSegundos,
        1e-9,
        'Perfil de abertura rápida deve influenciar o tempo de curso'
    );

    assert.equal(valvula.aplicarPerfilCaracteristica('custom'), true);
    assert.equal(valvula.perfilCaracteristica, 'custom');
    assert.equal(valvula.setCoeficienteVazao(12), true);
    assert.equal(valvula.setCoeficientePerda(0.6), true);
    assert.equal(valvula.setTipoCaracteristica('linear'), true);
    assert.equal(valvula.setRangeabilidade(80), true);
    assert.equal(valvula.setTempoCurso(2), true);

    assert.equal(valvula.perfilCaracteristica, 'custom');
    approx(valvula.cv, 12, 1e-12, 'Cv personalizado');
    approx(valvula.perdaLocalK, 0.6, 1e-12, 'K personalizado');
    assert.equal(valvula.tipoCaracteristica, 'linear');
    assert.equal(valvula.rangeabilidade, 80);
    assert.equal(valvula.tempoCursoSegundos, 2);
});

test('controle de nível escolhe perfil automaticamente e restaura perfil manual ao liberar', () => {
    const valvula = new ValvulaLogica('V-04', 'V-04', 0, 0);

    valvula.aplicarPerfilCaracteristica('custom');
    valvula.setCoeficienteVazao(7);
    valvula.setCoeficientePerda(1.3);
    valvula.setTipoCaracteristica('equal_percentage');
    valvula.setRangeabilidade(120);
    valvula.setTempoCurso(1.5);

    valvula.aplicarControleNivel({
        abertura: 20,
        intensidade: 0.2,
        ownerId: 'T-01'
    });
    assert.equal(valvula.perfilCaracteristica, 'equal_percentage');
    assert.equal(valvula.tempoCursoSegundos, VALVE_PROFILE_DEFINITIONS.equal_percentage.tempoCursoSegundos);
    approx(valvula.cv, VALVE_PROFILE_DEFINITIONS.equal_percentage.cv, 1e-12, 'Cv deve ficar no perfil enquanto a abertura controla a vazão');

    valvula.aplicarControleNivel({
        abertura: 50,
        intensidade: 0.5,
        ownerId: 'T-01'
    });
    assert.equal(valvula.perfilCaracteristica, 'equal_percentage');
    approx(valvula.cv, VALVE_PROFILE_DEFINITIONS.equal_percentage.cv, 1e-12, 'Perfil não deve trocar em ajuste moderado');

    valvula.aplicarControleNivel({
        abertura: 75,
        intensidade: 0.75,
        ownerId: 'T-01'
    });
    assert.equal(valvula.perfilCaracteristica, 'linear');
    assert.equal(valvula.tempoCursoSegundos, VALVE_PROFILE_DEFINITIONS.linear.tempoCursoSegundos);
    approx(valvula.cv, VALVE_PROFILE_DEFINITIONS.linear.cv, 1e-12, 'Cv deve seguir o perfil linear antes do reforço de alta demanda');

    valvula.aplicarControleNivel({
        abertura: 90,
        intensidade: 0.9,
        ownerId: 'T-01'
    });

    assert.equal(valvula.perfilCaracteristica, 'quick_opening');
    assert.equal(valvula.tipoCaracteristica, 'quick_opening');
    assert.equal(valvula.tempoCursoSegundos, VALVE_PROFILE_DEFINITIONS.quick_opening.tempoCursoSegundos);
    assert.ok(valvula.cv > VALVE_PROFILE_DEFINITIONS.quick_opening.cv, 'Controle de nível deve reforçar o Cv do perfil escolhido');
    assert.ok(valvula.perdaLocalK < VALVE_PROFILE_DEFINITIONS.quick_opening.perdaLocalK, 'Controle de nível deve reduzir K para atender alta demanda');

    valvula.aplicarControleNivel({
        abertura: 50,
        intensidade: 0.5,
        ownerId: 'T-01'
    });
    assert.equal(valvula.perfilCaracteristica, 'quick_opening', 'Histerese deve evitar troca de perfil por ajuste intermediário');

    valvula.aplicarControleNivel({
        abertura: 40,
        intensidade: 0.4,
        ownerId: 'T-01'
    });
    assert.equal(valvula.perfilCaracteristica, 'linear', 'Perfil só deve descer faixa após redução maior de abertura');

    valvula.liberarControleNivel('T-01');

    assert.equal(valvula.perfilCaracteristica, 'custom');
    approx(valvula.cv, 7, 1e-12, 'Cv restaurado após liberar controle de nível');
    approx(valvula.perdaLocalK, 1.3, 1e-12, 'K restaurado após liberar controle de nível');
    assert.equal(valvula.tipoCaracteristica, 'equal_percentage');
    assert.equal(valvula.rangeabilidade, 120);
    assert.equal(valvula.tempoCursoSegundos, 1.5);
});

test('controle de nível atua nas válvulas e mantem bomba operacional em 100%', () => {
    const engine = createEngine();
    engine.isRunning = true;

    const fonte = new FonteLogica('F-SP', 'Entrada-SP', 0, 0);
    const bomba = new BombaLogica('B-SP', 'Bomba-SP', 80, 0);
    const tanque = new TanqueLogico('T-SP', 'Tanque-SP', 160, 0);
    const valvula = new ValvulaLogica('V-SP', 'Valvula-SP', 240, 0);

    fonte.conectarSaida(bomba);
    bomba.conectarSaida(tanque);
    tanque.conectarSaida(valvula);
    [fonte, bomba, tanque, valvula].forEach((component) => engine.add(component));

    bomba.grauAcionamento = 35;
    bomba.acionamentoEfetivo = 35;
    tanque.capacidadeMaxima = 1000;
    tanque.volumeAtual = 800;
    tanque.setpoint = 50;

    const resultado = tanque.setSetpointAtivo(true);
    assert.equal(resultado.ativado, true);
    assert.equal(engine.isBombaBloqueadaPorSetpoint(bomba), true);
    assert.equal(tanque.isBombaControladaPorSetpoint(bomba), true);
    assert.equal(bomba.grauAcionamento, 35, 'Ativar set point não deve sobrescrever o comando manual armazenado');
    assert.equal(bomba.getAcionamentoAlvo(), 100, 'Bomba associada ao set point deve operar com alvo fixo de 100%');

    tanque._rodarControlador(0.1);
    bomba.atualizarDinamica(0.8);

    assert.equal(valvula.estaControladaPorSetpoint(), true, 'A válvula deve ficar sob controle do set point');
    assert.ok(valvula.grauAbertura > 0, 'O PI deve modular a válvula de saída para reduzir nível alto');
    assert.equal(bomba.grauAcionamento, 35, 'Rodar o PI não deve alterar parametros da bomba');
    assert.ok(bomba.acionamentoEfetivo > 35, 'A dinâmica da bomba deve caminhar para 100% enquanto o set point está ativo');

    assert.equal(bomba.setAcionamento(20), false);
    assert.equal(bomba.grauAcionamento, 35, 'A bomba não deve aceitar comando manual enquanto está fixa em 100% pelo set point');
    assert.equal(bomba.getAcionamentoAlvo(), 100);

    tanque.setSetpointAtivo(false);
    assert.equal(engine.isBombaBloqueadaPorSetpoint(bomba), false);
    assert.equal(bomba.getAcionamentoAlvo(), 35, 'Ao desligar o set point, o alvo volta ao comando manual preservado');
    assert.equal(bomba.setAcionamento(20), true);
    assert.equal(bomba.grauAcionamento, 20, 'Ao desligar o set point, a bomba volta a aceitar comando manual');
});

test('fator de cavitação da bomba permanece finito com NPSHa inválido', () => {
    const bomba = new BombaLogica('B-NPSH', 'B-NPSH', 0, 0);

    approx(bomba.calcularFatorCavitacao(3, 2.5), 1, 1e-12, 'NPSHa suficiente não limita a bomba');
    approx(bomba.calcularFatorCavitacao(-1, 2.5), 0.12, 1e-12, 'NPSHa negativo deve limitar sem NaN');
    approx(bomba.calcularFatorCavitacao(Number.NaN, 2.5), 0.12, 1e-12, 'NPSHa inválido deve limitar sem NaN');
});

test('curva da bomba reflete alteração de NPSHr sem esconder a mudança pela escala', () => {
    const bomba = new BombaLogica('B-02', 'B-02', 0, 0);

    bomba.npshRequeridoM = 2.5;
    bomba.recalcularMetricasDerivadasCurva();
    const curvaBase = buildPumpCurveDatasets(bomba);

    bomba.npshRequeridoM = 5;
    bomba.recalcularMetricasDerivadasCurva();
    const curvaAjustada = buildPumpCurveDatasets(bomba);

    assert.equal(bomba.npshRequeridoAtualM, 5);
    assert.ok(curvaAjustada.npshPoints.at(-1).y > curvaBase.npshPoints.at(-1).y);
    assert.equal(curvaBase.npshAxisMax, curvaAjustada.npshAxisMax);
});

test('diagnóstico de saturação dimensiona bomba sem ajustar fonte de entrada', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-01', 'Entrada-01', 0, 0);
    const bomba = new BombaLogica('B-01', 'Bomba-01', 80, 0);
    const tanque = new TanqueLogico('T-01', 'Tanque-01', 160, 0);
    const valvula = new ValvulaLogica('V-01', 'Valvula-01', 240, 0);

    fonte.conectarSaida(bomba);
    bomba.conectarSaida(tanque);
    tanque.conectarSaida(valvula);
    [fonte, bomba, tanque, valvula].forEach((component) => engine.add(component));

    tanque.capacidadeMaxima = 1000;
    tanque.volumeAtual = 800;
    tanque.alturaUtilMetros = 2.4;
    tanque.alturaBocalEntradaM = 1.0;
    tanque.alturaBocalSaidaM = 0.2;
    tanque.setpoint = 50;
    tanque.lastQin = 20;
    tanque.lastQout = 10;
    tanque.setpointAtivo = true;
    tanque._ultimoEstadoControle = { u: -1, erro: -0.3 };
    fonte.pressaoFonteBar = 1.5;
    bomba.vazaoNominal = 45;
    bomba.pressaoMaxima = 5;

    const densidade = engine.fluidoOperante.densidade;
    const pressaoSaidaAtualAtiva = pressureFromHeadBar(1.92 - 0.2, densidade);
    const pressaoSaidaSetpointAtiva = pressureFromHeadBar(1.2 - 0.2, densidade);
    const vazaoSetpointAtiva = 10 * Math.sqrt(pressaoSaidaSetpointAtiva / pressaoSaidaAtualAtiva);

    const resumoAtivo = tanque.getResumoAjustePressaoSetpoint(engine.fluidoOperante, true);
    approx(resumoAtivo.vazaoSaidaLimiteSetpointLps, vazaoSetpointAtiva, 1e-9, 'Vazão limite no set point com altura relativa');
    assert.equal(resumoAtivo.autoAjustavel, true);
    assert.deepEqual(resumoAtivo.ajustesFonte, []);
    assert.equal(resumoAtivo.ajustesBomba.length, 1);
    approx(
        resumoAtivo.ajustesBomba[0].vazaoNominalRecomendadaLps,
        vazaoSetpointAtiva * 0.98,
        1e-9,
        'Bomba deve ser dimensionada abaixo da capacidade de saída no set point'
    );
    tanque._atualizarAlertaSaturacao(engine.fluidoOperante);
    assert.equal(tanque.alertaSaturacao?.ativo, true, 'Alerta deve usar a capacidade de saída estimada no nível do set point');

    tanque.lastQin = 10;
    tanque.lastQout = 12;
    tanque._atualizarAlertaSaturacao(engine.fluidoOperante);
    assert.equal(tanque.alertaSaturacao, null, 'Alerta não deve aparecer durante drenagem transitória em direção ao set point');
    tanque.lastQin = 20;
    tanque.lastQout = 10;

    const pressaoSaidaAtualSemAltura = pressureFromHeadBar(1.92, densidade);
    const pressaoSaidaSetpointSemAltura = pressureFromHeadBar(1.2, densidade);
    const vazaoSetpointSemAltura = 10 * Math.sqrt(pressaoSaidaSetpointSemAltura / pressaoSaidaAtualSemAltura);

    const resumoSemAltura = tanque.getResumoAjustePressaoSetpoint(engine.fluidoOperante, false);
    approx(resumoSemAltura.pressaoBaseEntradaSetpointBar, 0, 1e-9, 'Contrapressão de entrada sem altura relativa');
    approx(resumoSemAltura.vazaoSaidaLimiteSetpointLps, vazaoSetpointSemAltura, 1e-9, 'Vazão limite no set point sem altura relativa');
    assert.equal(resumoSemAltura.autoAjustavel, true);
    approx(
        resumoSemAltura.ajustesBomba[0].vazaoNominalRecomendadaLps,
        vazaoSetpointSemAltura * 0.98,
        1e-9,
        'Dimensionamento também deve existir sem altura relativa'
    );

    engine.usarAlturaRelativa = false;
    const resultado = tanque.aplicarAjustePressaoSetpoint();

    assert.equal(resultado.aplicado, true);
    assert.equal(resultado.quantidadeBombas, 1);
    approx(bomba.vazaoNominal, vazaoSetpointSemAltura * 0.98, 1e-9, 'Vazão nominal da bomba deve receber o dimensionamento');
    approx(bomba.pressaoMaxima, 5, 1e-12, 'Pressão máxima já suficiente deve ser preservada');
    approx(fonte.pressaoFonteBar, 1.5, 1e-12, 'Pressão da fonte deve permanecer manual');
});
