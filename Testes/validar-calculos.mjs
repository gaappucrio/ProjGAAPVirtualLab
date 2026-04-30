import assert from 'node:assert/strict';
import test from 'node:test';

import { ENGINE } from '../js/application/engine/SimulationEngine.js';
import { BombaLogica } from '../js/domain/components/BombaLogica.js';
import { FonteLogica } from '../js/domain/components/FonteLogica.js';
import { TanqueLogico } from '../js/domain/components/TanqueLogico.js';
import { ValvulaLogica } from '../js/domain/components/ValvulaLogica.js';
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

test('tempo de curso e rampa aceitam zero e respeitam a escala configurada', () => {
    resetEngine();
    ENGINE.isRunning = true;

    const valvula = new ValvulaLogica('V-01', 'V-01', 0, 0);
    valvula.aberturaEfetiva = 0;
    valvula.grauAbertura = 100;
    valvula.tempoCursoSegundos = 10;
    valvula.atualizarDinamica(1);
    approx(valvula.aberturaEfetiva, 10, 1e-9, 'Tempo de curso da válvula');

    valvula.tempoCursoSegundos = 0;
    valvula.atualizarDinamica(0.5);
    approx(valvula.aberturaEfetiva, 100, 1e-9, 'Tempo de curso zero da válvula');

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
