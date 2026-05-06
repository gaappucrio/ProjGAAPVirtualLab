import assert from 'node:assert/strict';
import test from 'node:test';

import { ENGINE } from '../js/application/engine/SimulationEngine.js';
import { BombaLogica } from '../js/domain/components/BombaLogica.js';
import { FonteLogica } from '../js/domain/components/FonteLogica.js';
import { TanqueLogico } from '../js/domain/components/TanqueLogico.js';
import { VALVE_PROFILE_DEFINITIONS, ValvulaLogica } from '../js/domain/components/ValvulaLogica.js';
import { ConnectionModel } from '../js/domain/models/ConnectionModel.js';
import {
    diameterFromFlowVelocity,
    diameterFromM3sVelocity,
    getSuggestedDiameterForConnection
} from '../js/domain/services/PipeHydraulics.js';
import { buildPumpCurveDatasets } from '../js/infrastructure/charts/PumpChartAdapter.js';
import { pressureFromHeadBar } from '../js/utils/Units.js';

function approx(actual, expected, tolerance, label) {
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `${label}: esperado ${expected}, obtido ${actual}`
    );
}

function resetEngine() {
    ENGINE.isRunning = false;
    ENGINE.componentes = [];
    ENGINE.conexoes = [];
    ENGINE.usarAlturaRelativa = true;
    ENGINE.fluidoOperante.densidade = 1000;
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
});

test('tempo de curso e rampa aceitam zero e respeitam a escala configurada', () => {
    resetEngine();
    ENGINE.isRunning = true;

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

test('resumo de ajuste de pressão no set point considera altura relativa ligada e desligada', () => {
    resetEngine();

    const fonte = new FonteLogica('F-01', 'Entrada-01', 0, 0);
    const tanque = new TanqueLogico('T-01', 'Tanque-01', 0, 0);
    fonte.conectarSaida(tanque);

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
    ENGINE.componentes = [fonte, tanque];

    const densidade = ENGINE.fluidoOperante.densidade;
    const pressaoSaidaAtualAtiva = pressureFromHeadBar(1.92 - 0.2, densidade);
    const pressaoSaidaSetpointAtiva = pressureFromHeadBar(1.2 - 0.2, densidade);
    const vazaoSetpointAtiva = 10 * Math.sqrt(pressaoSaidaSetpointAtiva / pressaoSaidaAtualAtiva);
    const pressaoBaseAtualAtiva = pressureFromHeadBar(1.92 - 1.0, densidade);
    const pressaoBaseSetpointAtiva = pressureFromHeadBar(1.2 - 1.0, densidade);
    const fatorAtivo = Math.pow(vazaoSetpointAtiva / 20, 2);
    const pressaoFonteAtivaEsperada = pressaoBaseSetpointAtiva + ((1.5 - pressaoBaseAtualAtiva) * fatorAtivo);

    const resumoAtivo = tanque.getResumoAjustePressaoSetpoint(ENGINE.fluidoOperante, true);
    approx(resumoAtivo.vazaoSaidaLimiteSetpointLps, vazaoSetpointAtiva, 1e-9, 'Vazão limite no set point com altura relativa');
    approx(resumoAtivo.ajustesFonte[0].pressaoRecomendadaBar, pressaoFonteAtivaEsperada, 1e-9, 'Pressão recomendada com altura relativa');
    tanque._atualizarAlertaSaturacao(ENGINE.fluidoOperante);
    assert.equal(tanque.alertaSaturacao?.ativo, true, 'Alerta deve usar a capacidade de saída estimada no nível do set point');

    const pressaoSaidaAtualSemAltura = pressureFromHeadBar(1.92, densidade);
    const pressaoSaidaSetpointSemAltura = pressureFromHeadBar(1.2, densidade);
    const vazaoSetpointSemAltura = 10 * Math.sqrt(pressaoSaidaSetpointSemAltura / pressaoSaidaAtualSemAltura);
    const fatorSemAltura = Math.pow(vazaoSetpointSemAltura / 20, 2);
    const pressaoFonteSemAlturaEsperada = 1.5 * fatorSemAltura;

    const resumoSemAltura = tanque.getResumoAjustePressaoSetpoint(ENGINE.fluidoOperante, false);
    approx(resumoSemAltura.pressaoBaseEntradaSetpointBar, 0, 1e-9, 'Contrapressão de entrada sem altura relativa');
    approx(resumoSemAltura.vazaoSaidaLimiteSetpointLps, vazaoSetpointSemAltura, 1e-9, 'Vazão limite no set point sem altura relativa');
    approx(resumoSemAltura.ajustesFonte[0].pressaoRecomendadaBar, pressaoFonteSemAlturaEsperada, 1e-9, 'Pressão recomendada sem altura relativa');

    ENGINE.usarAlturaRelativa = false;
    const resultado = tanque.aplicarAjustePressaoSetpoint();
    assert.equal(resultado.aplicado, true, 'O ajuste automático deveria ser aplicado');
    approx(fonte.pressaoFonteBar, pressaoFonteSemAlturaEsperada, 1e-9, 'Aplicação automática da pressão recomendada');
});
