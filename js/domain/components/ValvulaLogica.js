import { clamp, ComponenteFisico, pressureLossFromFlow, rampToTarget } from './BaseComponente.js';
import { ComponentEventPayloads } from '../../application/events/EventPayloads.js';

const FATOR_MINIMO_AREA = 0.12;
const BASE_PERDA_POR_CV = 25;
const CV_CONTROLE_NIVEL_MAX = 800;
const K_CONTROLE_NIVEL_MIN = 0.02;
const PERFIL_PERSONALIZADO = 'custom';
const PERFIL_PADRAO = 'equal_percentage';
const PERFIS_CONTROLE_NIVEL = Object.freeze(['equal_percentage', 'linear', 'quick_opening']);
const LIMIAR_REFORCO_CONTROLE_NIVEL = 0.85;
const TIPOS_CARACTERISTICA = Object.freeze(['equal_percentage', 'linear', 'quick_opening']);

export const VALVE_PROFILE_DEFINITIONS = Object.freeze({
    equal_percentage: Object.freeze({
        id: 'equal_percentage',
        tipoCaracteristica: 'equal_percentage',
        cv: 4.0,
        perdaLocalK: 1.0,
        rangeabilidade: 30,
        tempoCursoSegundos: 6.0
    }),
    linear: Object.freeze({
        id: 'linear',
        tipoCaracteristica: 'linear',
        cv: 6.0,
        perdaLocalK: 0.75,
        rangeabilidade: 50,
        tempoCursoSegundos: 4.0
    }),
    quick_opening: Object.freeze({
        id: 'quick_opening',
        tipoCaracteristica: 'quick_opening',
        cv: 10.0,
        perdaLocalK: 0.35,
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

export class ValvulaLogica extends ComponenteFisico {
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.aberta = false;
        this.grauAbertura = 0;
        this.aberturaEfetiva = 0;
        this.fluxoReal = 0;
        const perfilPadrao = VALVE_PROFILE_DEFINITIONS[PERFIL_PADRAO];
        this.cv = perfilPadrao.cv;
        this.perdaLocalK = perfilPadrao.perdaLocalK;
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
            perdaLocalK: this.perdaLocalK,
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

    getCharacteristicFactor(opening) {
        const safeOpening = clamp(opening, 0, 1);
        if (this.tipoCaracteristica === 'linear') return safeOpening;
        if (this.tipoCaracteristica === 'quick_opening') return Math.sqrt(safeOpening);

        const minFactor = 1 / Math.max(2, this.rangeabilidade);
        const normalized = (Math.pow(this.rangeabilidade, safeOpening) - 1) / (this.rangeabilidade - 1);
        return clamp(minFactor + ((1 - minFactor) * normalized), minFactor, 1);
    }

    getAberturaNormalizadaAtual() {
        return clamp(this.aberturaEfetiva / 100.0, 0, 1);
    }

    getParametrosHidraulicos(opening = this.getAberturaNormalizadaAtual()) {
        const aberturaNormalizada = clamp(opening, 0, 1);
        const characteristicFactor = this.getCharacteristicFactor(aberturaNormalizada);
        const effectiveCv = Math.max(0.05, this.cv * Math.max(characteristicFactor, 0.05));
        const hydraulicAreaFactor = clamp((0.2 + (0.8 * characteristicFactor)), FATOR_MINIMO_AREA, 1);
        const hydraulicAreaM2 = this.getAreaConexaoM2() * hydraulicAreaFactor;
        const throttlingLoss = Math.max(0, (1 / Math.max(FATOR_MINIMO_AREA, characteristicFactor)) - 1);
        const lossFromCv = BASE_PERDA_POR_CV / Math.max(0.01, effectiveCv * effectiveCv);
        const localLossCoeff = Math.max(0.05, this.perdaLocalK + throttlingLoss + lossFromCv);

        return {
            opening: aberturaNormalizada,
            characteristicFactor,
            effectiveCv,
            hydraulicAreaM2,
            localLossCoeff
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

        this.grauAbertura = clamp(Number(valor) || 0, 0, 100);
        if (!this.getSimulationContext().isRunning) this.aberturaEfetiva = this.grauAbertura;
        this.aberta = this.aberturaEfetiva > 0.5;
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
        this.rangeabilidade = perfil.rangeabilidade;
        this.tempoCursoSegundos = perfil.tempoCursoSegundos;
    }

    aplicarPerfilCaracteristica(perfilId, options = {}) {
        if (!this._podeEditarParametros(options)) return false;

        this._aplicarPerfilBase(perfilId);
        this._notificarEstado();
        return true;
    }

    setCoeficienteVazao(valor, options = {}) {
        if (!this._podeEditarParametros(options)) return false;

        const numero = Number(valor);
        this.cv = clamp(Number.isFinite(numero) ? numero : this.cv, 0.05, CV_CONTROLE_NIVEL_MAX);
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
                cv: this.cv,
                perdaLocalK: this.perdaLocalK,
                perfilCaracteristica: this.perfilCaracteristica,
                tipoCaracteristica: this.tipoCaracteristica,
                rangeabilidade: this.rangeabilidade,
                tempoCursoSegundos: this.tempoCursoSegundos
            };
        }

        this._controleNivelAtivo = true;
        this._controleNivelOwnerId = ownerId;
    }

    _selecionarPerfilControleNivel(demanda, aberturaComandada) {
        const comando = clamp((Number(aberturaComandada) || 0) / 100, 0, 1);
        const perfilAtual = PERFIS_CONTROLE_NIVEL.includes(this.perfilCaracteristica)
            ? this.perfilCaracteristica
            : 'equal_percentage';

        // O controle fino deve acontecer pela abertura; o perfil só troca de faixa com histerese.
        if (perfilAtual === 'quick_opening') {
            if (comando <= 0.45) return 'linear';
            return 'quick_opening';
        }

        if (perfilAtual === 'linear') {
            if (comando >= 0.9) return 'quick_opening';
            if (comando <= 0.2) return 'equal_percentage';
            return 'linear';
        }

        if (comando >= 0.9) return 'quick_opening';
        if (comando >= 0.7) return 'linear';
        return 'equal_percentage';
    }

    aplicarControleNivel({ abertura, intensidade = 0, ownerId = null, cvMaximo = null } = {}) {
        this._iniciarControleNivel(ownerId);

        const demanda = clamp(Number(intensidade) || 0, 0, 1);
        const aberturaComandada = clamp(Number(abertura) || 0, 0, 100);
        const perfilControle = this._selecionarPerfilControleNivel(demanda, aberturaComandada);
        const parametrosPerfil = VALVE_PROFILE_DEFINITIONS[perfilControle];

        this._aplicarPerfilBase(perfilControle);

        const cvBase = Math.max(0.05, parametrosPerfil.cv);
        const kBase = Math.max(K_CONTROLE_NIVEL_MIN, parametrosPerfil.perdaLocalK);
        const demandaReforco = clamp((demanda - LIMIAR_REFORCO_CONTROLE_NIVEL) / (1 - LIMIAR_REFORCO_CONTROLE_NIVEL), 0, 1);
        const reforco = Math.pow(demandaReforco, 1.25);
        const limiteCv = cvMaximo !== null ? Math.max(CV_CONTROLE_NIVEL_MAX, cvMaximo) : CV_CONTROLE_NIVEL_MAX;
        const cvControleMaximo = Math.max(limiteCv, cvBase);

        this.cv = cvBase + ((cvControleMaximo - cvBase) * reforco);
        this.perdaLocalK = K_CONTROLE_NIVEL_MIN + ((kBase - K_CONTROLE_NIVEL_MIN) * Math.pow(1 - demanda, 1.5));

        return this.setAbertura(aberturaComandada, { fromSetpoint: true });
    }

    liberarControleNivel(ownerId = null) {
        if (!this._controleNivelAtivo) return;
        if (ownerId && this._controleNivelOwnerId && ownerId !== this._controleNivelOwnerId) return;

        if (this._parametrosManuaisControleNivel) {
            this.cv = this._parametrosManuaisControleNivel.cv;
            this.perdaLocalK = this._parametrosManuaisControleNivel.perdaLocalK;
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
        this.aberturaEfetiva = rampToTarget(previousOpening, this.grauAbertura, dt, this.tempoCursoSegundos);
        this.aberta = this.aberturaEfetiva > 0.5;

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

    getFluxoSaidaFromTank() {
        return this.fluxoReal;
    }
}
