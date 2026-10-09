import { ComponentEventPayloads } from '../events/ComponentEventPayloads.js';
import {
    DEFAULT_ATMOSPHERIC_PRESSURE_BAR,
    DEFAULT_FLUID_DENSITY_KG_M3,
    DEFAULT_FLUID_SPECIFIC_HEAT_JKGK,
    EPSILON_FLOW,
    lpsToM3s
} from '../units/HydraulicUnits.js';
import { clamp, ComponenteFisico, pressureLossFromFlow } from './BaseComponente.js';
import { cloneFluido } from './Fluido.js';

const TEMPERATURA_SERVICO_PADRAO_C = 80;
const UA_PADRAO_W_K = 2500;
const AREA_PADRAO_M2 = 1.0;
const PERDA_LOCAL_PADRAO_K = 0;
// Sem limitador artificial por padrão: a efetividade vem só do ε-NTU, mantendo Q = UA·F_T·LMTD.
// Valores menores continuam disponíveis como limite opcional (ex.: incrustação).
const EFETIVIDADE_MAXIMA_PADRAO = 1.0;
// Volume de fluido retido em cada lado (ordem de grandeza de um trocador de bancada de ~1 m²).
// A saída responde ao ε-NTU com atraso de 1ª ordem, τ = V/Q (tempo de residência); 0 desliga o atraso.
const VOLUME_INTERNO_PADRAO_L = 2.0;
const VOLUME_INTERNO_MAXIMO_L = 10000;

// Líquido entra em ebulição quando Pv(T) atinge a pressão absoluta local; o modelo segue
// monofásico, então o risco é sinalizado em vez de simulado.
function avaliarRiscoEbulicao(fluidoEntrada, temperaturaSaidaC, pressaoSaidaBar, vazaoLps) {
    if (!fluidoEntrada || !(vazaoLps > EPSILON_FLOW) || !Number.isFinite(temperaturaSaidaC)) return false;
    const fluidoSaida = cloneFluido(fluidoEntrada, { temperatura: temperaturaSaidaC });
    const pressaoAbsolutaBar = Math.max(0, numeroSeguro(pressaoSaidaBar, 0))
        + numeroSeguro(fluidoSaida.pressaoAtmosfericaBar, DEFAULT_ATMOSPHERIC_PRESSURE_BAR);
    return numeroSeguro(fluidoSaida.pressaoVaporBar, 0) >= pressaoAbsolutaBar;
}

function numeroSeguro(value, fallback) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

export function calcularLmtd({ t1In, t1Out, t2In, t2Out, modo = 'contracorrente' } = {}) {
    let dtA = 0;
    let dtB = 0;

    if (modo === 'paralelo' || modo === 'cocorrente') {
        dtA = Math.abs(t1In - t2In);
        dtB = Math.abs(t1Out - t2Out);
    } else {
        dtA = Math.abs(t1In - t2Out);
        dtB = Math.abs(t1Out - t2In);
    }

    const minDt = Math.min(dtA, dtB);
    if (dtA <= 1e-6 || dtB <= 1e-6) {
        return { lmtd: 0, minDt, ft: 1.0 };
    }

    if (Math.abs(dtA - dtB) < 1e-4) {
        return { lmtd: (dtA + dtB) / 2, minDt, ft: 1.0 };
    }

    const lmtd = (dtA - dtB) / Math.log(dtA / dtB);
    return { lmtd: Math.max(0, lmtd), minDt, ft: 1.0 };
}

export class TrocadorCalorLogico extends ComponenteFisico {
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.temperaturaServicoC = TEMPERATURA_SERVICO_PADRAO_C;
        this.uaWPorK = UA_PADRAO_W_K;
        this.areaM2 = AREA_PADRAO_M2;
        this.perdaLocalK = PERDA_LOCAL_PADRAO_K;
        this.efetividadeMaxima = EFETIVIDADE_MAXIMA_PADRAO;
        this.volumeInternoL = VOLUME_INTERNO_PADRAO_L;
        this.fluxoReal = 0;
        this.vazao1Lps = 0;
        this.vazao2Lps = 0;
        this.temperaturaEntradaC = 25;
        this.temperaturaSaidaC = 25;
        this.temperaturaEntrada2C = this.temperaturaServicoC;
        this.temperaturaSaida2C = this.temperaturaServicoC;
        this.deltaTemperaturaC = 0;
        this.deltaTemperatura2C = 0;
        this.cargaTermicaW = 0;
        this.cargaTermicaMaximaW = 0;
        this.lmtdC = 0;
        this.fatorCorrecaoLmtd = 1.0;
        this.pinchPointMinDeltaTC = 0;
        this.tipoPerfilGrafico = 'position';
        this.efetividadeAtual = 0;
        this.vazaoMassaKgS = 0;
        this.vazaoMassa2KgS = 0;
        this.deltaPAtualBar = 0;
        this.deltaP2AtualBar = 0;
        this.riscoEbulicao1 = false;
        this.riscoEbulicao2 = false;
        // Regime alvo (ε-NTU) e temperatura que de fato sai de cada lado (estado do atraso térmico).
        this.temperaturaSaidaAlvoC = this.temperaturaSaidaC;
        this.temperaturaSaida2AlvoC = this.temperaturaSaida2C;
        this._temperaturaSaidaEstado = { 1: null, 2: null };
        this._dinamicaTermicaAtiva = false;
        this._ultimoEstadoNotificado = '';
    }

    temRiscoEbulicao() {
        return this.riscoEbulicao1 || this.riscoEbulicao2;
    }

    getConstanteTempoTermicaS(streamId = 1) {
        if (!(this.volumeInternoL > 0)) return 0;
        const vazaoLps = streamId === 2 ? this.vazao2Lps : this.vazao1Lps;
        return vazaoLps > EPSILON_FLOW ? this.volumeInternoL / vazaoLps : Infinity;
    }

    // Temperatura na porta de saída: fora da simulação (ou com volume nulo) é o próprio alvo ε-NTU;
    // na partida, antes de o lado acumular estado, sai o fluido que estava parado na temperatura de entrada.
    getTemperaturaSaidaEfetivaC(streamId, alvoC, entradaC = alvoC) {
        if (!this._dinamicaTermicaAtiva || !(this.volumeInternoL > 0)) return alvoC;
        const estado = this._temperaturaSaidaEstado[streamId];
        if (Number.isFinite(estado)) return estado;
        return Number.isFinite(entradaC) ? entradaC : alvoC;
    }

    // Cada lado se comporta como um volume de mistura: dT/dt = (T_alvo − T)/τ, integrado de forma exata
    // para o passo (estável para qualquer dt). Sem vazão (τ → ∞) o fluido retido mantém a temperatura.
    atualizarDinamica(dt) {
        if (!(dt > 0)) return;
        this._dinamicaTermicaAtiva = true;
        [1, 2].forEach((streamId) => {
            const estado = this._temperaturaSaidaEstado[streamId];
            const alvo = streamId === 2 ? this.temperaturaSaida2AlvoC : this.temperaturaSaidaAlvoC;
            const tau = this.getConstanteTempoTermicaS(streamId);
            if (!Number.isFinite(estado) || !Number.isFinite(alvo) || !Number.isFinite(tau)) return;
            const fracao = tau > 0 ? 1 - Math.exp(-dt / tau) : 1;
            this._temperaturaSaidaEstado[streamId] = estado + ((alvo - estado) * fracao);
        });
    }

    _sincronizarEstadoTermico(streamId, vazaoLps, entradaC, alvoC) {
        if (!this._dinamicaTermicaAtiva) return;
        if (!(this.volumeInternoL > 0)) {
            this._temperaturaSaidaEstado[streamId] = alvoC;
            return;
        }
        if (!Number.isFinite(this._temperaturaSaidaEstado[streamId]) && vazaoLps > EPSILON_FLOW && Number.isFinite(entradaC)) {
            this._temperaturaSaidaEstado[streamId] = entradaC;
        }
    }

    getParametrosHidraulicos() {
        return {
            hydraulicAreaM2: this.getAreaConexaoM2(),
            localLossCoeff: Math.max(0, numeroSeguro(this.perdaLocalK, PERDA_LOCAL_PADRAO_K))
        };
    }

    isContracorrente(engine = null) {
        return this.getModoEscoamento(engine) === 'contracorrente';
    }

    getModoEscoamento(engine = null) {
        // Ao operar com apenas uma corrente (modo utilidade), o padrão físico
        // é o arranjo termicamente mais eficiente: contracorrente.
        if (!this.temDuasCorrentesConectadas(engine)) {
            return 'contracorrente';
        }

        const context = this.getSimulationContext();
        let inputConnections = [];
        let outputConnections = [];

        if (engine && typeof engine.getInputConnections === 'function') {
            inputConnections = engine.getInputConnections(this) || [];
            outputConnections = engine.getOutputConnections?.(this) || [];
        } else if (typeof context?.queries?.getInputConnections === 'function') {
            inputConnections = context.queries.getInputConnections(this) || [];
            outputConnections = context.queries.getOutputConnections?.(this) || [];
        }

        // 1. Conexões de entrada na Corrente 2
        const in2Right = inputConnections.some((c) => {
            const portId = c.targetEndpoint?.portId || '';
            const isStream2 = portId === 'out2' || portId === 'in2' || portId === '2' || portId.includes('2');
            return isStream2 && portId === 'out2';
        });

        if (in2Right) {
            return 'contracorrente';
        }

        const in2Left = inputConnections.some((c) => {
            const portId = c.targetEndpoint?.portId || '';
            const isStream2 = portId === 'out2' || portId === 'in2' || portId === '2' || portId.includes('2');
            return isStream2 && portId === 'in2';
        });

        if (in2Left) {
            return 'paralelo';
        }

        // 2. Conexões de saída na Corrente 2
        const out2Left = outputConnections.some((c) => {
            const portId = c.sourceEndpoint?.portId || '';
            const isStream2 = portId === 'out2' || portId === 'in2' || portId === '2' || portId.includes('2');
            return isStream2 && portId === 'in2';
        });

        if (out2Left) {
            return 'contracorrente';
        }

        const out2Right = outputConnections.some((c) => {
            const portId = c.sourceEndpoint?.portId || '';
            const isStream2 = portId === 'out2' || portId === 'in2' || portId === '2' || portId.includes('2');
            return isStream2 && portId === 'out2';
        });

        if (out2Right) {
            return 'paralelo';
        }

        // 3. Contribuições ativas de fluxo
        const inContribs = this.estadoHidraulico?.entradaFluidoContribuicoes || [];
        if (inContribs.some((c) => c.portId === 'out2')) return 'contracorrente';
        if (inContribs.some((c) => c.portId === 'in2')) return 'paralelo';

        const outContribs = this.estadoHidraulico?.saidaFluidoContribuicoes || [];
        if (outContribs.some((c) => c.portId === 'in2')) return 'contracorrente';
        if (outContribs.some((c) => c.portId === 'out2')) return 'paralelo';

        return 'contracorrente';
    }

    calcularTrocaTermicaGlobal(fluido1, vazao1, fluido2, vazao2, modo = this.getModoEscoamento()) {
        const t1 = numeroSeguro(fluido1?.temperatura, 25);
        const t2 = (fluido2 && vazao2 > EPSILON_FLOW) ? numeroSeguro(fluido2.temperatura, 25) : this.temperaturaServicoC;
        const ua = this.uaWPorK;

        const isDual = this.temDuasCorrentesConectadas();
        const modoEfetivo = !isDual ? 'contracorrente' : modo;

        if (ua <= 0) {
            return { t1Out: t1, t2Out: t2, duty: 0, ef: 0, dt1: 0, dt2: 0, modo: modoEfetivo, maxHeat: 0, lmtd: 0, ft: 1.0, minDt: 0 };
        }

        if (isDual) {
            if (vazao1 <= EPSILON_FLOW || vazao2 <= EPSILON_FLOW) {
                return { t1Out: t1, t2Out: t2, duty: 0, ef: 0, dt1: 0, dt2: 0, modo: modoEfetivo, maxHeat: 0, lmtd: 0, ft: 1.0, minDt: 0 };
            }
        } else {
            if (vazao1 <= EPSILON_FLOW && vazao2 <= EPSILON_FLOW) {
                return { t1Out: t1, t2Out: t2, duty: 0, ef: 0, dt1: 0, dt2: 0, modo: modoEfetivo, maxHeat: 0, lmtd: 0, ft: 1.0, minDt: 0 };
            }
            if (vazao1 <= EPSILON_FLOW && vazao2 > EPSILON_FLOW) {
                const cp2 = Math.max(1, numeroSeguro(fluido2?.calorEspecificoJkgK, DEFAULT_FLUID_SPECIFIC_HEAT_JKGK));
                const den2 = Math.max(1, numeroSeguro(fluido2?.densidade, DEFAULT_FLUID_DENSITY_KG_M3));
                const m2 = lpsToM3s(vazao2) * den2;
                const c2 = m2 * cp2;
                if (c2 <= 0) {
                    return { t1Out: t1, t2Out: t2, duty: 0, ef: 0, dt1: 0, dt2: 0, modo: modoEfetivo, maxHeat: 0, lmtd: 0, ft: 1.0, minDt: 0 };
                }
                const ntu = ua / c2;
                const efetividade = clamp(1 - Math.exp(-ntu), 0, this.efetividadeMaxima);
                const maxHeat = c2 * Math.abs(t2 - this.temperaturaServicoC);
                const duty = maxHeat * efetividade;
                let t2Out = t2 + (this.temperaturaServicoC > t2 ? duty / c2 : -duty / c2);
                const minT = Math.min(t2, this.temperaturaServicoC);
                const maxT = Math.max(t2, this.temperaturaServicoC);
                t2Out = clamp(t2Out, minT, maxT);
                const lmtdCalc = calcularLmtd({
                    t1In: t2,
                    t1Out: t2Out,
                    t2In: this.temperaturaServicoC,
                    t2Out: this.temperaturaServicoC,
                    modo: 'contracorrente'
                });
                return {
                    t1Out: t1,
                    t2Out,
                    duty,
                    ef: efetividade,
                    dt1: 0,
                    dt2: t2Out - t2,
                    modo: 'contracorrente',
                    maxHeat,
                    lmtd: lmtdCalc.lmtd,
                    ft: lmtdCalc.ft,
                    minDt: lmtdCalc.minDt
                };
            }
        }

        const cp1 = Math.max(1, numeroSeguro(fluido1?.calorEspecificoJkgK, DEFAULT_FLUID_SPECIFIC_HEAT_JKGK));
        const den1 = Math.max(1, numeroSeguro(fluido1?.densidade, DEFAULT_FLUID_DENSITY_KG_M3));
        const m1 = lpsToM3s(vazao1) * den1;
        const c1 = m1 * cp1;

        let c2 = 0;
        let cmin = c1;
        let cmax = c1;
        let cr = 0;

        if (fluido2 && vazao2 > EPSILON_FLOW) {
            const cp2 = Math.max(1, numeroSeguro(fluido2.calorEspecificoJkgK, DEFAULT_FLUID_SPECIFIC_HEAT_JKGK));
            const den2 = Math.max(1, numeroSeguro(fluido2.densidade, DEFAULT_FLUID_DENSITY_KG_M3));
            const m2 = lpsToM3s(vazao2) * den2;
            c2 = m2 * cp2;
            cmin = Math.min(c1, c2);
            cmax = Math.max(c1, c2);
            cr = cmin / cmax;
        }

        const ntu = ua / Math.max(Number.EPSILON, cmin);
        let efetividade = 0;

        if (cr === 0) {
            // Infinite capacity for stream 2 (constant utility temp)
            efetividade = 1 - Math.exp(-ntu);
        } else if (modo === 'paralelo' || modo === 'cocorrente') {
            // Co-corrente (Corrente Paralela)
            efetividade = (1 - Math.exp(-ntu * (1 + cr))) / (1 + cr);
        } else {
            // Contracorrente
            if (Math.abs(cr - 1) < 0.001) {
                efetividade = ntu / (1 + ntu);
            } else {
                const expTerm = Math.exp(-ntu * (1 - cr));
                efetividade = (1 - expTerm) / (1 - cr * expTerm);
            }
        }

        efetividade = clamp(efetividade, 0, this.efetividadeMaxima);

        const maxHeat = cmin * Math.abs(t1 - t2);
        const duty = maxHeat * efetividade;

        let t1Out = t1 + (t1 > t2 ? -duty / c1 : duty / c1);
        let t2Out = t2;
        
        if (c2 > 0) {
            t2Out = t2 + (t1 > t2 ? duty / c2 : -duty / c2);
        }

        // Limites físicos da Segunda Lei da Termodinâmica:
        // Nenhuma corrente pode ultrapassar a faixa térmica imposta pelas entradas.
        const minT = Math.min(t1, t2);
        const maxT = Math.max(t1, t2);
        t1Out = clamp(t1Out, minT, maxT);
        t2Out = clamp(t2Out, minT, maxT);

        // Em escoamento paralelo (cocorrente), as temperaturas convergem mas nunca se cruzam
        if ((modo === 'paralelo' || modo === 'cocorrente') && c2 > 0) {
            if (t1 >= t2 && t1Out < t2Out) {
                const tEq = (c1 * t1 + c2 * t2) / Math.max(Number.EPSILON, c1 + c2);
                t1Out = tEq;
                t2Out = tEq;
            } else if (t1 < t2 && t1Out > t2Out) {
                const tEq = (c1 * t1 + c2 * t2) / Math.max(Number.EPSILON, c1 + c2);
                t1Out = tEq;
                t2Out = tEq;
            }
        }

        const lmtdCalc = calcularLmtd({
            t1In: t1,
            t1Out,
            t2In: c2 > 0 ? t2 : this.temperaturaServicoC,
            t2Out: c2 > 0 ? t2Out : this.temperaturaServicoC,
            modo: modoEfetivo
        });

        return {
            t1Out,
            t2Out,
            duty,
            ef: efetividade,
            dt1: t1Out - t1,
            dt2: t2Out - t2,
            modo: modoEfetivo,
            maxHeat,
            lmtd: lmtdCalc.lmtd,
            ft: lmtdCalc.ft,
            minDt: lmtdCalc.minDt
        };
    }

    getFluxoPendentePorStream(streamId = 1) {
        if (streamId === 2) {
            return Math.max(0, this.getVazaoEntradaPorPorta('in2') - this.getVazaoSaidaPorPorta('out2'));
        }
        return Math.max(0, this.getVazaoEntradaPorPorta('in1') - this.getVazaoSaidaPorPorta('out1'));
    }

    getFluidoSaidaPara(fluidoEntrada, vazaoLps = this.fluxoReal, streamId = 1) {
        if (streamId === 2) {
            const f1 = this.getFluidoEntradaMisturadoPorPorta('in1')
                || (Number.isFinite(this.temperaturaEntradaC) ? cloneFluido(fluidoEntrada, { temperatura: this.temperaturaEntradaC }) : null);
            const v1 = Math.max(this.getVazaoEntradaPorPorta('in1') || 0, this.vazao1Lps || 0);
            const v2 = Math.max(vazaoLps || 0, this.getVazaoEntradaPorPorta('in2') || 0, this.vazao2Lps || 0);
            const resultado = this.calcularTrocaTermicaGlobal(f1, v1, fluidoEntrada, v2);
            return cloneFluido(fluidoEntrada, {
                temperatura: this.getTemperaturaSaidaEfetivaC(2, resultado.t2Out, fluidoEntrada?.temperatura)
            });
        }
        const f2 = this.getFluidoEntradaMisturadoPorPorta('in2')
            || (Number.isFinite(this.temperaturaEntrada2C) ? cloneFluido(fluidoEntrada, { temperatura: this.temperaturaEntrada2C }) : null);
        const v1 = Math.max(vazaoLps || 0, this.getVazaoEntradaPorPorta('in1') || 0, this.vazao1Lps || 0);
        const v2 = Math.max(this.getVazaoEntradaPorPorta('in2') || 0, this.vazao2Lps || 0);
        const resultado = this.calcularTrocaTermicaGlobal(fluidoEntrada, v1, f2, v2);
        return cloneFluido(fluidoEntrada, {
            temperatura: this.getTemperaturaSaidaEfetivaC(1, resultado.t1Out, fluidoEntrada?.temperatura)
        });
    }

    getFluidoSaidaAtual(fallback = null, vazaoLps = null, portId = null) {
        const f1 = this.getFluidoEntradaMisturadoPorPorta('in1', fallback);
        const f2 = this.getFluidoEntradaMisturadoPorPorta('in2');
        const v1 = Math.max(this.getVazaoEntradaPorPorta('in1') || 0, this.vazao1Lps || 0);
        const v2 = Math.max(this.getVazaoEntradaPorPorta('in2') || 0, this.vazao2Lps || 0);

        const resultado = this.calcularTrocaTermicaGlobal(f1, v1, f2, v2);

        if (portId === 'out2' || portId === 'in2' || portId === '2') {
            const baseFluid = f2 || fallback || this.getSimulationContext()?.fluidoOperante;
            return baseFluid
                ? cloneFluido(baseFluid, { temperatura: this.getTemperaturaSaidaEfetivaC(2, resultado.t2Out, f2?.temperatura) })
                : null;
        }
        const baseFluid = f1 || fallback || this.getSimulationContext()?.fluidoOperante;
        return baseFluid
            ? cloneFluido(baseFluid, { temperatura: this.getTemperaturaSaidaEfetivaC(1, resultado.t1Out, f1?.temperatura) })
            : null;
    }

    temDuasCorrentesConectadas(engine = null) {
        if (engine && typeof engine.isTrocadorComDuasCorrentes === 'function') {
            return engine.isTrocadorComDuasCorrentes(this);
        }
        const context = this.getSimulationContext();
        if (typeof context?.queries?.isTrocadorComDuasCorrentes === 'function') {
            const resultado = context.queries.isTrocadorComDuasCorrentes(this);
            if (typeof resultado === 'boolean') return resultado;
        }
        if (this.vazao2Lps > EPSILON_FLOW && (this.vazao1Lps > EPSILON_FLOW || this.fluxoReal > EPSILON_FLOW)) {
            return true;
        }
        const temEntrada1 = (this.getVazaoEntradaPorPorta('in1') || 0) > EPSILON_FLOW;
        const temEntrada2 = (this.getVazaoEntradaPorPorta('in2') || 0) > EPSILON_FLOW;
        if (temEntrada1 && temEntrada2) {
            return true;
        }
        return false;
    }

    getDiagnosticoOperacao(engine = null) {
        const duasCorrentes = this.temDuasCorrentesConectadas(engine);
        return {
            duasCorrentesConectadas: duasCorrentes,
            temperaturaServicoEditavel: !duasCorrentes,
            titulo: 'Duas Correntes Conectadas',
            mensagem: duasCorrentes
                ? 'O trocador opera com troca térmica acoplada entre as Correntes 1 e 2. A temperatura de serviço fixa está desabilitada pois a temperatura da Corrente 2 governa o processo.'
                : 'Operação com utilidade: a troca térmica utiliza a temperatura de serviço configurada.'
        };
    }

    setTemperaturaServico(valor, options = {}) {
        if (this.temDuasCorrentesConectadas(options.engine) && options.force !== true) {
            this._notificarEstado(true);
            return this.temperaturaServicoC;
        }
        const numero = Number(valor);
        this.temperaturaServicoC = clamp(Number.isFinite(numero) ? numero : this.temperaturaServicoC, -20, 250);
        this._notificarEstado(true);
        return this.temperaturaServicoC;
    }

    get uWPorM2K() {
        return this.uaWPorK / Math.max(0.0001, this.areaM2 || 1.0);
    }

    setArea(valor) {
        const numero = Math.max(0.01, Number(valor) || 1.0);
        const currentU = this.uWPorM2K;
        this.areaM2 = numero;
        this.uaWPorK = clamp(this.areaM2 * currentU, 0, 100000);
        this._notificarEstado(true);
    }

    setU(valor) {
        const numero = Math.max(0, Number(valor) || 0);
        this.uaWPorK = clamp((this.areaM2 || 1.0) * numero, 0, 100000);
        this._notificarEstado(true);
    }

    setTipoPerfilGrafico(tipo) {
        this.tipoPerfilGrafico = tipo === 'thermal' ? 'thermal' : 'position';
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
        const percentual = clamp(Number.isFinite(numero) ? numero : this.efetividadeMaxima * 100, 0, 100);
        this.efetividadeMaxima = percentual / 100;
        this._notificarEstado(true);
    }

    setVolumeInterno(valor) {
        const numero = Number(valor);
        this.volumeInternoL = clamp(Number.isFinite(numero) ? numero : this.volumeInternoL, 0, VOLUME_INTERNO_MAXIMO_L);
        this._notificarEstado(true);
        return this.volumeInternoL;
    }

    _notificarEstado(force = false) {
        const duasCorrentes = this.temDuasCorrentesConectadas();
        const estado = [
            this.fluxoReal.toFixed(4),
            (this.vazao1Lps || 0).toFixed(4),
            (this.vazao2Lps || 0).toFixed(4),
            this.temperaturaEntradaC.toFixed(2),
            this.temperaturaSaidaC.toFixed(2),
            (this.temperaturaEntrada2C || 0).toFixed(2),
            (this.temperaturaSaida2C || 0).toFixed(2),
            this.cargaTermicaW.toFixed(1),
            this.cargaTermicaMaximaW.toFixed(1),
            this.lmtdC.toFixed(2),
            this.efetividadeAtual.toFixed(4),
            this.deltaPAtualBar.toFixed(5),
            (this.deltaP2AtualBar || 0).toFixed(5),
            (this.areaM2 || 1).toFixed(3),
            this.uWPorM2K.toFixed(1),
            this.tipoPerfilGrafico,
            duasCorrentes ? 'dual' : 'single',
            this.temRiscoEbulicao() ? 'boiling' : 'liquid'
        ].join('|');

        if (!force && estado === this._ultimoEstadoNotificado) return;
        this._ultimoEstadoNotificado = estado;
        this.notify(ComponentEventPayloads.state({
            fluxoReal: this.fluxoReal,
            vazao1Lps: this.vazao1Lps,
            vazao2Lps: this.vazao2Lps,
            vazaoMassaKgS: this.vazaoMassaKgS,
            vazaoMassa2KgS: this.vazaoMassa2KgS,
            temperaturaEntradaC: this.temperaturaEntradaC,
            temperaturaSaidaC: this.temperaturaSaidaC,
            temperaturaEntrada2C: this.temperaturaEntrada2C,
            temperaturaSaida2C: this.temperaturaSaida2C,
            deltaTemperaturaC: this.deltaTemperaturaC,
            deltaTemperatura2C: this.deltaTemperatura2C,
            cargaTermicaW: this.cargaTermicaW,
            cargaTermicaMaximaW: this.cargaTermicaMaximaW,
            lmtdC: this.lmtdC,
            fatorCorrecaoLmtd: this.fatorCorrecaoLmtd,
            pinchPointMinDeltaTC: this.pinchPointMinDeltaTC,
            areaM2: this.areaM2,
            uWPorM2K: this.uWPorM2K,
            tipoPerfilGrafico: this.tipoPerfilGrafico,
            efetividadeAtual: this.efetividadeAtual,
            deltaPAtualBar: this.deltaPAtualBar,
            deltaP2AtualBar: this.deltaP2AtualBar,
            duasCorrentesConectadas: duasCorrentes,
            riscoEbulicao: this.temRiscoEbulicao()
        }));
    }

    sincronizarMetricasFisicas(fluidoFallback = null) {
        super.sincronizarMetricasFisicas();
        this.vazao1Lps = this.getVazaoEntradaPorPorta('in1');
        this.vazao2Lps = this.getVazaoEntradaPorPorta('in2');
        this.fluxoReal = this.vazao1Lps + this.vazao2Lps;
        
        const f1 = this.getFluidoEntradaMisturadoPorPorta('in1', fluidoFallback);
        const f2 = this.getFluidoEntradaMisturadoPorPorta('in2');
        
        const resultado = this.calcularTrocaTermicaGlobal(f1, this.vazao1Lps, f2, this.vazao2Lps);
        const parametros = this.getParametrosHidraulicos();

        this.temperaturaEntradaC = f1?.temperatura ?? 25;
        this.temperaturaEntrada2C = (f2 && this.vazao2Lps > EPSILON_FLOW) ? f2.temperatura : (f2?.temperatura ?? this.temperaturaServicoC);
        this.temperaturaSaidaAlvoC = resultado.t1Out;
        this.temperaturaSaida2AlvoC = resultado.t2Out;
        this._sincronizarEstadoTermico(1, this.vazao1Lps, this.temperaturaEntradaC, resultado.t1Out);
        this._sincronizarEstadoTermico(2, this.vazao2Lps, this.temperaturaEntrada2C, resultado.t2Out);
        // Indicação de um termopar na saída; carga, ε e LMTD seguem o regime ε-NTU da troca na parede.
        this.temperaturaSaidaC = this.getTemperaturaSaidaEfetivaC(1, resultado.t1Out, this.temperaturaEntradaC);
        this.temperaturaSaida2C = this.getTemperaturaSaidaEfetivaC(2, resultado.t2Out, this.temperaturaEntrada2C);
        this.deltaTemperaturaC = resultado.dt1 + (this.temperaturaSaidaC - resultado.t1Out);
        this.deltaTemperatura2C = resultado.dt2 + (this.temperaturaSaida2C - resultado.t2Out);
        this.cargaTermicaW = resultado.duty;
        this.cargaTermicaMaximaW = resultado.maxHeat || 0;
        this.lmtdC = resultado.lmtd || 0;
        this.fatorCorrecaoLmtd = resultado.ft || 1.0;
        this.pinchPointMinDeltaTC = resultado.minDt || 0;
        this.efetividadeAtual = resultado.ef;
        this.vazaoMassaKgS = lpsToM3s(this.vazao1Lps) * (f1?.densidade || DEFAULT_FLUID_DENSITY_KG_M3);
        this.vazaoMassa2KgS = lpsToM3s(this.vazao2Lps) * (f2?.densidade || DEFAULT_FLUID_DENSITY_KG_M3);
        this.deltaPAtualBar = pressureLossFromFlow(
            this.vazao1Lps,
            parametros.hydraulicAreaM2,
            f1?.densidade || DEFAULT_FLUID_DENSITY_KG_M3,
            parametros.localLossCoeff
        );
        this.deltaP2AtualBar = pressureLossFromFlow(
            this.vazao2Lps,
            parametros.hydraulicAreaM2,
            f2?.densidade || DEFAULT_FLUID_DENSITY_KG_M3,
            parametros.localLossCoeff
        );
        this.pressaoEntrada1AtualBar = this.getPressaoEntradaPortaBar('in1');
        this.pressaoEntrada2AtualBar = this.getPressaoEntradaPortaBar('in2');
        const p1In = Number.isFinite(this.pressaoEntrada1AtualBar) && this.pressaoEntrada1AtualBar > 0
            ? this.pressaoEntrada1AtualBar
            : (this.vazao1Lps > EPSILON_FLOW && Number.isFinite(this.pressaoEntradaAtualBar) && this.pressaoEntradaAtualBar > 0 ? this.pressaoEntradaAtualBar : 0);
        const p2In = Number.isFinite(this.pressaoEntrada2AtualBar) && this.pressaoEntrada2AtualBar > 0
            ? this.pressaoEntrada2AtualBar
            : (this.vazao2Lps > EPSILON_FLOW && Number.isFinite(this.pressaoEntradaAtualBar) && this.pressaoEntradaAtualBar > 0 ? this.pressaoEntradaAtualBar : 0);
        this.pressaoSaidaAtualBar = this.vazao1Lps > EPSILON_FLOW ? Math.max(0, p1In - this.deltaPAtualBar) : 0;
        this.pressaoSaida2AtualBar = this.vazao2Lps > EPSILON_FLOW ? Math.max(0, p2In - this.deltaP2AtualBar) : 0;
        this.riscoEbulicao1 = avaliarRiscoEbulicao(f1, this.temperaturaSaidaC, this.pressaoSaidaAtualBar, this.vazao1Lps);
        this.riscoEbulicao2 = avaliarRiscoEbulicao(f2, this.temperaturaSaida2C, this.pressaoSaida2AtualBar, this.vazao2Lps);
        this._notificarEstado();
    }

    onSimulationStop() {
        this.fluxoReal = 0;
        this.vazao1Lps = 0;
        this.vazao2Lps = 0;
        this.deltaTemperaturaC = 0;
        this.deltaTemperatura2C = 0;
        this.cargaTermicaW = 0;
        this.cargaTermicaMaximaW = 0;
        this.lmtdC = 0;
        this.pinchPointMinDeltaTC = 0;
        this.efetividadeAtual = 0;
        this.vazaoMassaKgS = 0;
        this.vazaoMassa2KgS = 0;
        this.deltaPAtualBar = 0;
        this.deltaP2AtualBar = 0;
        this.pressaoEntrada1AtualBar = 0;
        this.pressaoEntrada2AtualBar = 0;
        this.pressaoSaidaAtualBar = 0;
        this.pressaoSaida2AtualBar = 0;
        this.riscoEbulicao1 = false;
        this.riscoEbulicao2 = false;
        this._notificarEstado(true);
    }
}
