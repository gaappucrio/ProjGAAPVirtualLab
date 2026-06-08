import { clamp, ComponenteFisico, pressureLossFromFlow, rampToTarget } from './BaseComponente.js';
import { ComponentEventPayloads } from '../events/ComponentEventPayloads.js';
import {
    aplicarAjusteDimensionamentoValvula,
    diagnosticarDimensionamentoValvula
} from '../services/ValveSizingDiagnostics.js';

const FATOR_MINIMO_AREA = 0.12;
const CV_MAX = 800;
const PERFIL_PERSONALIZADO = 'custom';
const PERFIL_PADRAO = 'equal_percentage';
const GPM_PER_M3S = 15850.323141489;
const PA_PER_PSI = 6894.757293168;
const WATER_DENSITY_REFERENCE_KG_M3 = 999.016;
const KV_PER_CV = 0.8649786130809;
const TIPOS_CARACTERISTICA = Object.freeze(['equal_percentage', 'linear', 'quick_opening']);
const LIMIAR_FECHAMENTO_PERCENTUAL = 0.05;
const LIMIAR_FECHAMENTO_NORMALIZADO = LIMIAR_FECHAMENTO_PERCENTUAL / 100;
const CONSIDERAR_PERDA_ESTRANGULAMENTO_PADRAO = false;

export const VALVE_FLOW_COEFFICIENT_UNITS = Object.freeze({
    CV: 'cv',
    KV: 'kv'
});

export const VALVE_PROFILE_DEFINITIONS = Object.freeze({
    equal_percentage: Object.freeze({
        id: 'equal_percentage',
        tipoCaracteristica: 'equal_percentage',
        cv: 160.0,
        perdaLocalK: 0,
        considerarPerdaEstrangulamento: CONSIDERAR_PERDA_ESTRANGULAMENTO_PADRAO,
        rangeabilidade: 30,
        tempoCursoSegundos: 6.0
    }),
    linear: Object.freeze({
        id: 'linear',
        tipoCaracteristica: 'linear',
        cv: 220.0,
        perdaLocalK: 0,
        considerarPerdaEstrangulamento: CONSIDERAR_PERDA_ESTRANGULAMENTO_PADRAO,
        rangeabilidade: 50,
        tempoCursoSegundos: 4.0
    }),
    quick_opening: Object.freeze({
        id: 'quick_opening',
        tipoCaracteristica: 'quick_opening',
        cv: 280.0,
        perdaLocalK: 0,
        considerarPerdaEstrangulamento: CONSIDERAR_PERDA_ESTRANGULAMENTO_PADRAO,
        rangeabilidade: 15,
        tempoCursoSegundos: 2.0
    }),
    custom: Object.freeze({
        id: PERFIL_PERSONALIZADO,
        personalizado: true
    })
});

function normalizarTipoCaracteristica(tipo) {
    return TIPOS_CARACTERISTICA.includes(tipo) ? tipo : PERFIL_PADRAO;
}

function normalizarPerfil(perfilId) {
    return VALVE_PROFILE_DEFINITIONS[perfilId] ? perfilId : PERFIL_PADRAO;
}

function normalizarUnidadeCoeficienteVazao(unidade) {
    return unidade === VALVE_FLOW_COEFFICIENT_UNITS.KV
        ? VALVE_FLOW_COEFFICIENT_UNITS.KV
        : VALVE_FLOW_COEFFICIENT_UNITS.CV;
}

function normalizarAberturaPercentual(valor) {
    const abertura = clamp(Number(valor) || 0, 0, 100);
    return abertura <= LIMIAR_FECHAMENTO_PERCENTUAL ? 0 : abertura;
}

export function cvToKv(cv) {
    const numero = Number(cv);
    return (Number.isFinite(numero) ? numero : 0) * KV_PER_CV;
}

export function kvToCv(kv) {
    const numero = Number(kv);
    return (Number.isFinite(numero) ? numero : 0) / KV_PER_CV;
}

function cvToLossCoeff(cv, areaM2) {
    const safeCv = Math.max(0.05, Number(cv) || 0);
    const safeAreaM2 = Math.max(0, Number(areaM2) || 0);
    if (safeAreaM2 <= 0) return 1e6;

    return (
        (2 * PA_PER_PSI * GPM_PER_M3S * GPM_PER_M3S)
        / WATER_DENSITY_REFERENCE_KG_M3
    ) * ((safeAreaM2 * safeAreaM2) / (safeCv * safeCv));
}

export class ValvulaLogica extends ComponenteFisico {
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.aberta = false;
        this.grauAbertura = 0;
        this.aberturaEfetiva = 0;
        this.fluxoReal = 0;
        const perfilPadrao = VALVE_PROFILE_DEFINITIONS[PERFIL_PADRAO];
        this.cv = perfilPadrao.cv;
        this.unidadeCoeficienteVazao = VALVE_FLOW_COEFFICIENT_UNITS.CV;
        this.perdaLocalK = perfilPadrao.perdaLocalK;
        this.considerarPerdaEstrangulamento = perfilPadrao.considerarPerdaEstrangulamento;
        this.perfilCaracteristica = perfilPadrao.id;
        this.tipoCaracteristica = perfilPadrao.tipoCaracteristica;
        this.rangeabilidade = perfilPadrao.rangeabilidade;
        this.deltaPAtualBar = 0;
        this.tempoCursoSegundos = perfilPadrao.tempoCursoSegundos;
        this._controleNivelAtivo = false;
        this._controleNivelOwnerId = null;
        this._parametrosManuaisControleNivel = null;
    }

    _notificarEstado(extra = {}) {
        this.notify(ComponentEventPayloads.state({
            aberta: this.aberta,
            grau: this.grauAbertura,
            grauEfetivo: this.aberturaEfetiva,
            cv: this.cv,
            unidadeCoeficienteVazao: this.unidadeCoeficienteVazao,
            perdaLocalK: this.perdaLocalK,
            considerarPerdaEstrangulamento: this.considerarPerdaEstrangulamento,
            perfilCaracteristica: this.perfilCaracteristica,
            tipoCaracteristica: this.tipoCaracteristica,
            rangeabilidade: this.rangeabilidade,
            tempoCursoSegundos: this.tempoCursoSegundos,
            controleSetpoint: this.estaControladaPorSetpoint(),
            ...extra
        }));
    }

    estaControladaPorSetpoint() {
        return this._controleNivelAtivo || this.getSimulationContext().queries.isValvulaBloqueadaPorSetpoint(this) === true;
    }

    getUnidadeCoeficienteVazao() {
        this.unidadeCoeficienteVazao = normalizarUnidadeCoeficienteVazao(this.unidadeCoeficienteVazao);
        return this.unidadeCoeficienteVazao;
    }

    getCoeficienteVazaoNaUnidade(unidade = this.getUnidadeCoeficienteVazao()) {
        const unidadeNormalizada = normalizarUnidadeCoeficienteVazao(unidade);
        return unidadeNormalizada === VALVE_FLOW_COEFFICIENT_UNITS.KV
            ? cvToKv(this.cv)
            : this.cv;
    }

    getCoeficienteVazaoMaximoNaUnidade(unidade = this.getUnidadeCoeficienteVazao()) {
        const unidadeNormalizada = normalizarUnidadeCoeficienteVazao(unidade);
        return unidadeNormalizada === VALVE_FLOW_COEFFICIENT_UNITS.KV
            ? cvToKv(CV_MAX)
            : CV_MAX;
    }

    setUnidadeCoeficienteVazao(unidade, options = {}) {
        const unidadeNormalizada = normalizarUnidadeCoeficienteVazao(unidade);
        if (unidadeNormalizada === this.getUnidadeCoeficienteVazao()) return true;

        this.unidadeCoeficienteVazao = unidadeNormalizada;
        if (options.silent !== true) this._notificarEstado();
        return true;
    }

    getCharacteristicFactor(opening) {
        const safeOpening = clamp(opening, 0, 1);
        if (safeOpening <= LIMIAR_FECHAMENTO_NORMALIZADO) return 0;
        if (this.tipoCaracteristica === 'linear') return safeOpening;
        if (this.tipoCaracteristica === 'quick_opening') return Math.sqrt(safeOpening);

        const minFactor = 1 / Math.max(2, this.rangeabilidade);
        const normalized = (Math.pow(this.rangeabilidade, safeOpening) - 1) / (this.rangeabilidade - 1);
        return clamp(minFactor + ((1 - minFactor) * normalized), minFactor, 1);
    }

    getAberturaNormalizadaAtual() {
        return normalizarAberturaPercentual(this.aberturaEfetiva) / 100.0;
    }

    getParametrosHidraulicos(opening = this.getAberturaNormalizadaAtual()) {
        const aberturaNormalizada = clamp(opening, 0, 1);
        if (aberturaNormalizada <= LIMIAR_FECHAMENTO_NORMALIZADO) {
            return {
                opening: 0,
                characteristicFactor: 0,
                effectiveCv: 0,
                hydraulicAreaM2: 0,
                localLossCoeff: 1e6,
                lossFromCv: 0,
                throttlingLoss: 0,
                appliedThrottlingLoss: 0
            };
        }

        const characteristicFactor = this.getCharacteristicFactor(aberturaNormalizada);
        const effectiveCv = Math.max(0.05, this.cv * Math.max(characteristicFactor, 0.05));
        const hydraulicAreaFactor = clamp((0.2 + (0.8 * characteristicFactor)), FATOR_MINIMO_AREA, 1);
        const hydraulicAreaM2 = this.getAreaConexaoM2() * hydraulicAreaFactor;
        const throttlingLoss = Math.max(0, (1 / Math.max(FATOR_MINIMO_AREA, characteristicFactor)) - 1);
        const lossFromCv = cvToLossCoeff(effectiveCv, hydraulicAreaM2);
        const appliedThrottlingLoss = this.considerarPerdaEstrangulamento ? throttlingLoss : 0;
        const localLossCoeff = Math.max(0, this.perdaLocalK + appliedThrottlingLoss + lossFromCv);

        return {
            opening: aberturaNormalizada,
            characteristicFactor,
            effectiveCv,
            hydraulicAreaM2,
            localLossCoeff,
            lossFromCv,
            throttlingLoss,
            appliedThrottlingLoss
        };
    }

    toggle() {
        this.setAbertura(this.grauAbertura > 0 ? 0 : 100);
    }

    setAbertura(valor, options = {}) {
        if (this.estaControladaPorSetpoint() && options.fromSetpoint !== true) {
            this._notificarEstado({ bloqueadaPorSetpoint: true });
            return false;
        }

        this.grauAbertura = normalizarAberturaPercentual(valor);
        if (!this.getSimulationContext().isRunning) this.aberturaEfetiva = this.grauAbertura;
        this.aberta = this.getAberturaNormalizadaAtual() > 0;
        this._notificarEstado();
        return true;
    }

    _podeEditarParametros(options = {}) {
        if (this.estaControladaPorSetpoint() && options.fromSetpoint !== true) {
            this._notificarEstado({ bloqueadaPorSetpoint: true });
            return false;
        }

        return true;
    }

    _marcarPerfilPersonalizado(options = {}) {
        if (options.fromProfile === true || options.fromSetpoint === true) return;
        this.perfilCaracteristica = PERFIL_PERSONALIZADO;
    }

    _aplicarPerfilBase(perfilId) {
        const perfilNormalizado = normalizarPerfil(perfilId);
        const perfil = VALVE_PROFILE_DEFINITIONS[perfilNormalizado];

        this.perfilCaracteristica = perfilNormalizado;
        if (perfil.personalizado) return;

        this.tipoCaracteristica = perfil.tipoCaracteristica;
        this.cv = perfil.cv;
        this.perdaLocalK = perfil.perdaLocalK;
        this.considerarPerdaEstrangulamento = perfil.considerarPerdaEstrangulamento ?? CONSIDERAR_PERDA_ESTRANGULAMENTO_PADRAO;
        this.rangeabilidade = perfil.rangeabilidade;
        this.tempoCursoSegundos = perfil.tempoCursoSegundos;
    }

    aplicarPerfilCaracteristica(perfilId, options = {}) {
        if (!this._podeEditarParametros(options)) return false;

        this._aplicarPerfilBase(perfilId);
        this._notificarEstado();
        return true;
    }

    setCoeficienteVazaoCv(valor, options = {}) {
        return this.setCoeficienteVazao(valor, {
            ...options,
            unidade: VALVE_FLOW_COEFFICIENT_UNITS.CV
        });
    }

    setCoeficienteVazao(valor, options = {}) {
        if (!this._podeEditarParametros(options)) return false;

        const numero = Number(valor);
        const unidade = normalizarUnidadeCoeficienteVazao(options.unidade ?? options.unit ?? VALVE_FLOW_COEFFICIENT_UNITS.CV);
        const valorCv = unidade === VALVE_FLOW_COEFFICIENT_UNITS.KV
            ? kvToCv(numero)
            : numero;
        this.cv = clamp(Number.isFinite(valorCv) ? valorCv : this.cv, 0.05, CV_MAX);
        this._marcarPerfilPersonalizado(options);
        this._notificarEstado();
        return true;
    }

    setCoeficientePerda(valor, options = {}) {
        if (!this._podeEditarParametros(options)) return false;

        const numero = Number(valor);
        this.perdaLocalK = clamp(Number.isFinite(numero) ? numero : 0, 0, 100);
        this._marcarPerfilPersonalizado(options);
        this._notificarEstado();
        return true;
    }

    setConsiderarPerdaEstrangulamento(valor, options = {}) {
        if (!this._podeEditarParametros(options)) return false;

        this.considerarPerdaEstrangulamento = valor === true
            || valor === 'true'
            || valor === '1'
            || valor === 1;
        this._marcarPerfilPersonalizado(options);
        this._notificarEstado();
        return true;
    }

    setTipoCaracteristica(valor, options = {}) {
        if (!this._podeEditarParametros(options)) return false;

        this.tipoCaracteristica = normalizarTipoCaracteristica(valor);
        this._marcarPerfilPersonalizado(options);
        this._notificarEstado();
        return true;
    }

    setRangeabilidade(valor, options = {}) {
        if (!this._podeEditarParametros(options)) return false;

        const numero = Number(valor);
        this.rangeabilidade = clamp(Number.isFinite(numero) ? numero : this.rangeabilidade, 5, 1000);
        this._marcarPerfilPersonalizado(options);
        this._notificarEstado();
        return true;
    }

    setTempoCurso(valor, options = {}) {
        if (!this._podeEditarParametros(options)) return false;

        const numero = Number(valor);
        this.tempoCursoSegundos = clamp(Number.isFinite(numero) ? numero : this.tempoCursoSegundos, 0, 60);
        this._marcarPerfilPersonalizado(options);
        this._notificarEstado();
        return true;
    }

    _iniciarControleNivel(ownerId) {
        if (!this._controleNivelAtivo) {
            this._parametrosManuaisControleNivel = {
                aberta: this.aberta,
                grauAbertura: this.grauAbertura,
                aberturaEfetiva: this.aberturaEfetiva,
                cv: this.cv,
                unidadeCoeficienteVazao: this.unidadeCoeficienteVazao,
                perdaLocalK: this.perdaLocalK,
                considerarPerdaEstrangulamento: this.considerarPerdaEstrangulamento,
                perfilCaracteristica: this.perfilCaracteristica,
                tipoCaracteristica: this.tipoCaracteristica,
                rangeabilidade: this.rangeabilidade,
                tempoCursoSegundos: this.tempoCursoSegundos
            };
        }

        this._controleNivelAtivo = true;
        this._controleNivelOwnerId = ownerId;
    }

    aplicarControleNivel({ abertura, ownerId = null, fechamentoImediato = false } = {}) {
        this._iniciarControleNivel(ownerId);

        const aberturaComandada = clamp(Number(abertura) || 0, 0, 100);
        const aplicado = this.setAbertura(aberturaComandada, { fromSetpoint: true });
        if (aplicado && fechamentoImediato === true && aberturaComandada <= LIMIAR_FECHAMENTO_PERCENTUAL) {
            this.aberturaEfetiva = 0;
            this.aberta = false;
            this._notificarEstado();
        }

        return aplicado;
    }

    liberarControleNivel(ownerId = null) {
        if (!this._controleNivelAtivo) return;
        if (ownerId && this._controleNivelOwnerId && ownerId !== this._controleNivelOwnerId) return;

        if (this._parametrosManuaisControleNivel) {
            this.aberta = this._parametrosManuaisControleNivel.aberta;
            this.grauAbertura = this._parametrosManuaisControleNivel.grauAbertura;
            this.aberturaEfetiva = this._parametrosManuaisControleNivel.aberturaEfetiva;
            this.cv = this._parametrosManuaisControleNivel.cv;
            this.unidadeCoeficienteVazao = normalizarUnidadeCoeficienteVazao(this._parametrosManuaisControleNivel.unidadeCoeficienteVazao);
            this.perdaLocalK = this._parametrosManuaisControleNivel.perdaLocalK;
            this.considerarPerdaEstrangulamento = this._parametrosManuaisControleNivel.considerarPerdaEstrangulamento === true;
            this.perfilCaracteristica = this._parametrosManuaisControleNivel.perfilCaracteristica;
            this.tipoCaracteristica = this._parametrosManuaisControleNivel.tipoCaracteristica;
            this.rangeabilidade = this._parametrosManuaisControleNivel.rangeabilidade;
            this.tempoCursoSegundos = this._parametrosManuaisControleNivel.tempoCursoSegundos;
        }

        this._controleNivelAtivo = false;
        this._controleNivelOwnerId = null;
        this._parametrosManuaisControleNivel = null;
        this._notificarEstado({ controleSetpoint: false });
    }

    atualizarDinamica(dt) {
        const previousOpening = this.aberturaEfetiva;
        const nextOpening = rampToTarget(previousOpening, this.grauAbertura, dt, this.tempoCursoSegundos);
        this.aberturaEfetiva = this.grauAbertura <= LIMIAR_FECHAMENTO_PERCENTUAL
            && nextOpening <= LIMIAR_FECHAMENTO_PERCENTUAL
            ? 0
            : nextOpening;
        this.aberta = this.getAberturaNormalizadaAtual() > 0;

        if (Math.abs(this.aberturaEfetiva - previousOpening) > 0.05) {
            this._notificarEstado();
        }
    }

    sincronizarMetricasFisicas() {
        super.sincronizarMetricasFisicas();
        this.fluxoReal = this.estadoHidraulico.saidaVazaoLps;
        const parametros = this.getParametrosHidraulicos();
        const context = this.getSimulationContext();
        const fluid = context.queries.getComponentFluid?.(this) || context.fluidoOperante;
        this.deltaPAtualBar = parametros.opening > 0 && fluid
            ? pressureLossFromFlow(this.fluxoReal, parametros.hydraulicAreaM2, fluid.densidade, parametros.localLossCoeff)
            : 0;

        this.pressaoSaidaAtualBar = Math.max(0, this.pressaoEntradaAtualBar - this.deltaPAtualBar);
    }

    getDiagnosticoDimensionamento() {
        return diagnosticarDimensionamentoValvula(this);
    }

    aplicarAjusteDimensionamento() {
        const resultado = aplicarAjusteDimensionamentoValvula(this);
        this._notificarEstado({
            ajusteDimensionamento: resultado
        });
        return resultado;
    }

    getFluxoSaidaFromTank() {
        return this.fluxoReal;
    }
}
