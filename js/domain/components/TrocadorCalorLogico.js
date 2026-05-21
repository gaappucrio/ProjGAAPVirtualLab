import { ComponentEventPayloads } from '../events/ComponentEventPayloads.js';
import {
    DEFAULT_FLUID_SPECIFIC_HEAT_JKGK,
    EPSILON_FLOW,
    lpsToM3s
} from '../units/HydraulicUnits.js';
import { clamp, ComponenteFisico, pressureLossFromFlow } from './BaseComponente.js';
import { cloneFluido } from './Fluido.js';

const TEMPERATURA_SERVICO_PADRAO_C = 80;
const UA_PADRAO_W_K = 2500;
const PERDA_LOCAL_PADRAO_K = 1.8;
const EFETIVIDADE_MAXIMA_PADRAO = 0.95;

function numeroSeguro(value, fallback) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

export function calcularSaidaTrocadorCalor({
    temperaturaEntradaC,
    temperaturaServicoC,
    uaWPorK,
    vazaoLps,
    densidadeKgM3,
    calorEspecificoJkgK,
    efetividadeMaxima = EFETIVIDADE_MAXIMA_PADRAO
} = {}) {
    const inletTemperatureC = numeroSeguro(temperaturaEntradaC, 25);
    const serviceTemperatureC = numeroSeguro(temperaturaServicoC, TEMPERATURA_SERVICO_PADRAO_C);
    const safeUaWPorK = Math.max(0, numeroSeguro(uaWPorK, UA_PADRAO_W_K));
    const safeFlowLps = Math.max(0, numeroSeguro(vazaoLps, 0));
    const safeDensityKgM3 = Math.max(1, numeroSeguro(densidadeKgM3, 997));
    const safeSpecificHeatJkgK = Math.max(
        1,
        numeroSeguro(calorEspecificoJkgK, DEFAULT_FLUID_SPECIFIC_HEAT_JKGK)
    );
    const safeMaxEffectiveness = clamp(
        numeroSeguro(efetividadeMaxima, EFETIVIDADE_MAXIMA_PADRAO),
        0,
        0.999
    );

    if (safeFlowLps <= EPSILON_FLOW || safeUaWPorK <= 0) {
        return {
            temperaturaEntradaC: inletTemperatureC,
            temperaturaSaidaC: inletTemperatureC,
            deltaTemperaturaC: 0,
            cargaTermicaW: 0,
            efetividade: 0,
            vazaoMassaKgS: 0,
            capacidadeTermicaWPorK: 0
        };
    }

    const massFlowKgS = lpsToM3s(safeFlowLps) * safeDensityKgM3;
    const heatCapacityRateWPorK = massFlowKgS * safeSpecificHeatJkgK;
    const ntu = safeUaWPorK / Math.max(Number.EPSILON, heatCapacityRateWPorK);
    const efetividade = clamp(1 - Math.exp(-ntu), 0, safeMaxEffectiveness);
    const outletTemperatureC = inletTemperatureC + (efetividade * (serviceTemperatureC - inletTemperatureC));
    const heatDutyW = heatCapacityRateWPorK * (outletTemperatureC - inletTemperatureC);

    return {
        temperaturaEntradaC: inletTemperatureC,
        temperaturaSaidaC: outletTemperatureC,
        deltaTemperaturaC: outletTemperatureC - inletTemperatureC,
        cargaTermicaW: heatDutyW,
        efetividade,
        vazaoMassaKgS: massFlowKgS,
        capacidadeTermicaWPorK: heatCapacityRateWPorK
    };
}

export class TrocadorCalorLogico extends ComponenteFisico {
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.temperaturaServicoC = TEMPERATURA_SERVICO_PADRAO_C;
        this.uaWPorK = UA_PADRAO_W_K;
        this.perdaLocalK = PERDA_LOCAL_PADRAO_K;
        this.efetividadeMaxima = EFETIVIDADE_MAXIMA_PADRAO;
        this.fluxoReal = 0;
        this.temperaturaEntradaC = 25;
        this.temperaturaSaidaC = 25;
        this.deltaTemperaturaC = 0;
        this.cargaTermicaW = 0;
        this.efetividadeAtual = 0;
        this.vazaoMassaKgS = 0;
        this.deltaPAtualBar = 0;
        this._ultimoEstadoNotificado = '';
    }

    getParametrosHidraulicos() {
        return {
            hydraulicAreaM2: this.getAreaConexaoM2(),
            localLossCoeff: Math.max(0, numeroSeguro(this.perdaLocalK, PERDA_LOCAL_PADRAO_K))
        };
    }

    calcularTrocaTermica(fluidoEntrada, vazaoLps = this.fluxoReal) {
        return calcularSaidaTrocadorCalor({
            temperaturaEntradaC: fluidoEntrada?.temperatura,
            temperaturaServicoC: this.temperaturaServicoC,
            uaWPorK: this.uaWPorK,
            vazaoLps,
            densidadeKgM3: fluidoEntrada?.densidade,
            calorEspecificoJkgK: fluidoEntrada?.calorEspecificoJkgK,
            efetividadeMaxima: this.efetividadeMaxima
        });
    }

    getFluidoSaidaPara(fluidoEntrada, vazaoLps = this.fluxoReal) {
        const resultado = this.calcularTrocaTermica(fluidoEntrada, vazaoLps);
        return cloneFluido(fluidoEntrada, {
            temperatura: resultado.temperaturaSaidaC
        });
    }

    getFluidoSaidaAtual(fallback = null, vazaoLps = null) {
        const fluidoEntrada = this.getFluidoEntradaMisturado(fallback);
        const vazaoReferenciaLps = vazaoLps
            ?? this.estadoHidraulico?.saidaVazaoLps
            ?? this.estadoHidraulico?.entradaVazaoLps
            ?? this.fluxoReal;
        return this.getFluidoSaidaPara(fluidoEntrada, vazaoReferenciaLps);
    }

    setTemperaturaServico(valor) {
        const numero = Number(valor);
        this.temperaturaServicoC = clamp(Number.isFinite(numero) ? numero : this.temperaturaServicoC, -20, 250);
        this._notificarEstado(true);
    }

    setUA(valor) {
        const numero = Number(valor);
        this.uaWPorK = clamp(Number.isFinite(numero) ? numero : this.uaWPorK, 0, 100000);
        this._notificarEstado(true);
    }

    setPerdaLocal(valor) {
        const numero = Number(valor);
        this.perdaLocalK = clamp(Number.isFinite(numero) ? numero : this.perdaLocalK, 0, 100);
        this._notificarEstado(true);
    }

    setEfetividadeMaxima(valorPercentual) {
        const numero = Number(valorPercentual);
        const percentual = clamp(Number.isFinite(numero) ? numero : this.efetividadeMaxima * 100, 0, 99.9);
        this.efetividadeMaxima = percentual / 100;
        this._notificarEstado(true);
    }

    _notificarEstado(force = false) {
        const estado = [
            this.fluxoReal.toFixed(4),
            this.temperaturaEntradaC.toFixed(2),
            this.temperaturaSaidaC.toFixed(2),
            this.cargaTermicaW.toFixed(1),
            this.efetividadeAtual.toFixed(4),
            this.deltaPAtualBar.toFixed(5)
        ].join('|');

        if (!force && estado === this._ultimoEstadoNotificado) return;
        this._ultimoEstadoNotificado = estado;
        this.notify(ComponentEventPayloads.state({
            fluxoReal: this.fluxoReal,
            temperaturaEntradaC: this.temperaturaEntradaC,
            temperaturaSaidaC: this.temperaturaSaidaC,
            deltaTemperaturaC: this.deltaTemperaturaC,
            cargaTermicaW: this.cargaTermicaW,
            efetividadeAtual: this.efetividadeAtual,
            deltaPAtualBar: this.deltaPAtualBar
        }));
    }

    sincronizarMetricasFisicas(fluidoFallback = null) {
        super.sincronizarMetricasFisicas();
        this.fluxoReal = this.estadoHidraulico.saidaVazaoLps || 0;
        const fluidoEntrada = this.getFluidoEntradaMisturado(fluidoFallback);
        const resultado = this.calcularTrocaTermica(fluidoEntrada, this.fluxoReal);
        const parametros = this.getParametrosHidraulicos();

        this.temperaturaEntradaC = resultado.temperaturaEntradaC;
        this.temperaturaSaidaC = resultado.temperaturaSaidaC;
        this.deltaTemperaturaC = resultado.deltaTemperaturaC;
        this.cargaTermicaW = resultado.cargaTermicaW;
        this.efetividadeAtual = resultado.efetividade;
        this.vazaoMassaKgS = resultado.vazaoMassaKgS;
        this.deltaPAtualBar = pressureLossFromFlow(
            this.fluxoReal,
            parametros.hydraulicAreaM2,
            fluidoEntrada?.densidade || 997,
            1 + parametros.localLossCoeff
        );
        this.pressaoSaidaAtualBar = Math.max(0, this.pressaoEntradaAtualBar - this.deltaPAtualBar);
        this._notificarEstado();
    }

    onSimulationStop() {
        this.fluxoReal = 0;
        this.deltaTemperaturaC = 0;
        this.cargaTermicaW = 0;
        this.efetividadeAtual = 0;
        this.vazaoMassaKgS = 0;
        this.deltaPAtualBar = 0;
        this._notificarEstado(true);
    }
}
