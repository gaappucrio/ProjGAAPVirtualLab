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
const PERDA_LOCAL_PADRAO_K = 0;
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
    calcularTrocaTermicaGlobal(fluido1, vazao1, fluido2, vazao2) {
        const t1 = numeroSeguro(fluido1?.temperatura, 25);
        const t2 = (fluido2 && vazao2 > EPSILON_FLOW) ? numeroSeguro(fluido2.temperatura, 25) : this.temperaturaServicoC;
        const ua = this.uaWPorK;

        if (vazao1 <= EPSILON_FLOW || ua <= 0) {
            return { t1Out: t1, t2Out: t2, duty: 0, ef: 0, dt1: 0, dt2: 0 };
        }

        const cp1 = numeroSeguro(fluido1?.calorEspecificoJkgK, DEFAULT_FLUID_SPECIFIC_HEAT_JKGK);
        const den1 = numeroSeguro(fluido1?.densidade, 997);
        const m1 = lpsToM3s(vazao1) * den1;
        const c1 = m1 * cp1;

        let c2 = 0;
        let cmin = c1;
        let cmax = c1;
        let cr = 0;

        if (fluido2 && vazao2 > EPSILON_FLOW) {
            const cp2 = numeroSeguro(fluido2.calorEspecificoJkgK, DEFAULT_FLUID_SPECIFIC_HEAT_JKGK);
            const den2 = numeroSeguro(fluido2.densidade, 997);
            const m2 = lpsToM3s(vazao2) * den2;
            c2 = m2 * cp2;
            cmin = Math.min(c1, c2);
            cmax = Math.max(c1, c2);
            cr = cmin / cmax;
        }

        const ntu = ua / cmin;
        let efetividade = 0;

        if (cr === 0) {
            // Infinite capacity for stream 2 (constant temp)
            efetividade = 1 - Math.exp(-ntu);
        } else if (Math.abs(cr - 1) < 0.001) {
            // Counter-flow limit when Cr = 1
            efetividade = ntu / (1 + ntu);
        } else {
            // Counter-flow general formula
            const expTerm = Math.exp(-ntu * (1 - cr));
            efetividade = (1 - expTerm) / (1 - cr * expTerm);
        }

        efetividade = clamp(efetividade, 0, this.efetividadeMaxima);

        const maxHeat = cmin * (t1 > t2 ? (t1 - t2) : (t2 - t1));
        const duty = maxHeat * efetividade;

        const t1Out = t1 + (t1 > t2 ? -duty / c1 : duty / c1);
        let t2Out = t2;
        
        if (c2 > 0) {
            t2Out = t2 + (t1 > t2 ? duty / c2 : -duty / c2);
        }

        return { t1Out, t2Out, duty, ef: efetividade, dt1: t1Out - t1, dt2: t2Out - t2 };
    }

    getFluidoSaidaPara(fluidoEntrada, vazaoLps = this.fluxoReal) {
        const resultado = this.calcularTrocaTermicaGlobal(fluidoEntrada, vazaoLps, null, 0);
        return cloneFluido(fluidoEntrada, {
            temperatura: resultado.t1Out
        });
    }

    getFluidoSaidaAtual(fallback = null, vazaoLps = null, portId = null) {
        const f1 = this.getFluidoEntradaMisturadoPorPorta('in1', fallback);
        const f2 = this.getFluidoEntradaMisturadoPorPorta('in2');
        const v1 = this.getVazaoEntradaPorPorta('in1');
        const v2 = this.getVazaoEntradaPorPorta('in2');

        const resultado = this.calcularTrocaTermicaGlobal(f1, v1, f2, v2);

        if (portId === 'out2' || portId === 'in2') {
            return f2 ? cloneFluido(f2, { temperatura: resultado.t2Out }) : null;
        }
        return f1 ? cloneFluido(f1, { temperatura: resultado.t1Out }) : cloneFluido(fallback, { temperatura: resultado.t1Out });
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
        this.fluxoReal = this.getVazaoEntradaPorPorta('in1'); // primary flow for UI
        
        const f1 = this.getFluidoEntradaMisturadoPorPorta('in1', fluidoFallback);
        const f2 = this.getFluidoEntradaMisturadoPorPorta('in2');
        const v1 = this.getVazaoEntradaPorPorta('in1');
        const v2 = this.getVazaoEntradaPorPorta('in2');
        
        const resultado = this.calcularTrocaTermicaGlobal(f1, v1, f2, v2);
        const parametros = this.getParametrosHidraulicos();

        this.temperaturaEntradaC = f1?.temperatura || 25;
        this.temperaturaSaidaC = resultado.t1Out;
        this.temperaturaSaida2C = resultado.t2Out;
        this.deltaTemperaturaC = resultado.dt1;
        this.deltaTemperatura2C = resultado.dt2;
        this.cargaTermicaW = resultado.duty;
        this.efetividadeAtual = resultado.ef;
        this.vazaoMassaKgS = lpsToM3s(v1) * (f1?.densidade || 997);
        this.deltaPAtualBar = pressureLossFromFlow(
            this.fluxoReal,
            parametros.hydraulicAreaM2,
            f1?.densidade || 997,
            parametros.localLossCoeff
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
