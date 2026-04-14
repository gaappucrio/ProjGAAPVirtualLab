import { clamp, ComponenteFisico, pressureLossFromFlow, smoothFirstOrder } from './BaseComponente.js';
import { ENGINE } from '../MotorFisico.js';

const FATOR_MINIMO_AREA = 0.12;
const BASE_PERDA_POR_CV = 25;
const CV_CONTROLE_NIVEL_MAX = 250;
const K_CONTROLE_NIVEL_MIN = 0.02;

export class ValvulaLogica extends ComponenteFisico {
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.aberta = false;
        this.grauAbertura = 0;
        this.aberturaEfetiva = 0;
        this.fluxoReal = 0;
        this.cv = 4.0; // Coeficiente de vazão nominal da válvula.
        this.perdaLocalK = 1.0; // Perda localizada adicional do corpo da válvula.
        this.tipoCaracteristica = 'equal_percentage';
        this.rangeabilidade = 30;
        this.deltaPAtualBar = 0;
        this.tempoCursoSegundos = 0.0;
        this._controleNivelAtivo = false;
        this._controleNivelOwnerId = null;
        this._parametrosManuaisControleNivel = null;
    }

    _notificarEstado(extra = {}) {
        this.notify({
            tipo: 'estado',
            aberta: this.aberta,
            grau: this.grauAbertura,
            grauEfetivo: this.aberturaEfetiva,
            cv: this.cv,
            perdaLocalK: this.perdaLocalK,
            controleSetpoint: this.estaControladaPorSetpoint(),
            ...extra
        });
    }

    estaControladaPorSetpoint() {
        return this._controleNivelAtivo || ENGINE.isValvulaBloqueadaPorSetpoint?.(this) === true;
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

        // Aberturas pequenas reduzem a área útil, mas o Cv segue como principal
        // controlador da capacidade da válvula.
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
        if (!ENGINE.isRunning) this.aberturaEfetiva = this.grauAbertura;
        this.aberta = this.aberturaEfetiva > 0.5;
        this._notificarEstado();
        return true;
    }

    setCoeficienteVazao(valor, options = {}) {
        if (this.estaControladaPorSetpoint() && options.fromSetpoint !== true) {
            this._notificarEstado({ bloqueadaPorSetpoint: true });
            return false;
        }

        this.cv = clamp(Number(valor) || this.cv, 0.05, CV_CONTROLE_NIVEL_MAX);
        this._notificarEstado();
        return true;
    }

    setCoeficientePerda(valor, options = {}) {
        if (this.estaControladaPorSetpoint() && options.fromSetpoint !== true) {
            this._notificarEstado({ bloqueadaPorSetpoint: true });
            return false;
        }

        this.perdaLocalK = clamp(Number(valor) || 0, 0, 100);
        this._notificarEstado();
        return true;
    }

    _iniciarControleNivel(ownerId) {
        if (!this._controleNivelAtivo) {
            this._parametrosManuaisControleNivel = {
                cv: this.cv,
                perdaLocalK: this.perdaLocalK
            };
        }

        this._controleNivelAtivo = true;
        this._controleNivelOwnerId = ownerId;
    }

    aplicarControleNivel({ abertura, intensidade = 0, ownerId = null } = {}) {
        this._iniciarControleNivel(ownerId);

        const demanda = clamp(Number(intensidade) || 0, 0, 1);
        const aberturaComandada = clamp(Number(abertura) || 0, 0, 100);
        const parametrosManuais = this._parametrosManuaisControleNivel || {
            cv: this.cv,
            perdaLocalK: this.perdaLocalK
        };

        const cvBase = Math.max(0.05, parametrosManuais.cv);
        const kBase = Math.max(K_CONTROLE_NIVEL_MIN, parametrosManuais.perdaLocalK);
        const reforco = Math.pow(demanda, 1.25);
        const cvControleMaximo = Math.max(CV_CONTROLE_NIVEL_MAX, cvBase);

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
        }

        this._controleNivelAtivo = false;
        this._controleNivelOwnerId = null;
        this._parametrosManuaisControleNivel = null;
        this._notificarEstado({ controleSetpoint: false });
    }

    atualizarDinamica(dt) {
        const previousOpening = this.aberturaEfetiva;
        this.aberturaEfetiva = smoothFirstOrder(previousOpening, this.grauAbertura, dt, this.tempoCursoSegundos);
        this.aberta = this.aberturaEfetiva > 0.5;

        if (Math.abs(this.aberturaEfetiva - previousOpening) > 0.05) {
            this._notificarEstado();
        }
    }

    sincronizarMetricasFisicas() {
        super.sincronizarMetricasFisicas();
        this.fluxoReal = this.estadoHidraulico.saidaVazaoLps;

        const parametros = this.getParametrosHidraulicos();
        this.deltaPAtualBar = parametros.opening > 0
            ? pressureLossFromFlow(this.fluxoReal, parametros.hydraulicAreaM2, ENGINE.fluidoOperante.densidade, parametros.localLossCoeff)
            : 0;

        this.pressaoSaidaAtualBar = Math.max(0, this.pressaoEntradaAtualBar - this.deltaPAtualBar);
    }

    getFluxoSaidaFromTank() {
        return this.fluxoReal;
    }
}
