// ==================================
// MODELO: Logica e Fisica do Sistema
// Ficheiro: js/componentes/TanqueLogico.js
// ==================================
import { BombaLogica } from './BombaLogica.js';
import { clamp, ComponenteFisico, flowFromBernoulli, pressureFromHeadBar } from './BaseComponente.js';
import { ValvulaLogica } from './ValvulaLogica.js';
import { ENGINE } from '../MotorFisico.js';


export class TanqueLogico extends ComponenteFisico {
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.capacidadeMaxima = 1000.0;
        this.volumeAtual = 0;
        this.lastQin = 0;
        this.lastQout = 0;
        this.alturaUtilMetros = 2.4;
        this.coeficienteSaida = 0.82;
        this.perdaEntradaK = 1.0;
        this.alturaBocalEntradaM = 2.2;
        this.alturaBocalSaidaM = 0.1;
        this.volumeInicial = 0;
        this.pressaoFundoBar = 0;
        this.setpointAtivo = false;
        this.setpoint = 50;
        this.kp = 250;
        this.ki = 25;
        this._ctrlIntegral = 0;
        this._lastErro = 0;
    }

    getNivelNormalizado() {
        return this.capacidadeMaxima > 0 ? clamp(this.volumeAtual / this.capacidadeMaxima, 0, 1) : 0;
    }

    getAlturaLiquidoM() {
        return this.getNivelNormalizado() * this.alturaUtilMetros;
    }

    normalizarAlturasBocais() {
        this.alturaBocalEntradaM = clamp(this.alturaBocalEntradaM, 0, this.alturaUtilMetros);
        this.alturaBocalSaidaM = clamp(this.alturaBocalSaidaM, 0, this.alturaUtilMetros);
    }

    getPressaoHidrostaticaBar(fluido) {
        return pressureFromHeadBar(this.getAlturaLiquidoM(), fluido.densidade);
    }

    getPressaoDisponivelSaidaBar(fluido, considerarAlturaBocal = true) {
        this.normalizarAlturasBocais();
        const availableHeadM = considerarAlturaBocal
            ? Math.max(0, this.getAlturaLiquidoM() - this.alturaBocalSaidaM)
            : Math.max(0, this.getAlturaLiquidoM());
        return pressureFromHeadBar(availableHeadM, fluido.densidade);
    }

    getBackPressureAtInletBar(fluido, considerarAlturaBocal = true) {
        this.normalizarAlturasBocais();
        if (!considerarAlturaBocal) return 0;
        const submergedHeightM = Math.max(0, this.getAlturaLiquidoM() - this.alturaBocalEntradaM);
        return pressureFromHeadBar(submergedHeightM, fluido.densidade);
    }

    _rodarControlador(dt) {
        if (!this.setpointAtivo) return;

        const erro = (this.setpoint / 100) - this.getNivelNormalizado();
        if (this._lastErro !== undefined && (this._lastErro * erro < 0)) this._ctrlIntegral = 0;
        this._lastErro = erro;
        this._ctrlIntegral += erro * dt;

        const clampInt = this.ki > 0 ? 1 / this.ki : 1;
        this._ctrlIntegral = Math.max(-clampInt, Math.min(clampInt, this._ctrlIntegral));

        const u = Math.max(-1, Math.min(1, this.kp * erro + this.ki * this._ctrlIntegral));
        const grauEntrada = Math.max(0, u * 100);
        const grauSaida = Math.max(0, -u * 100);

        this.inputs.forEach(c => {
            if (c instanceof ValvulaLogica) c.setAbertura(grauEntrada);
            else if (c instanceof BombaLogica) c.setAcionamento(grauEntrada);
        });

        this.outputs.forEach(c => {
            if (c instanceof ValvulaLogica) c.setAbertura(grauSaida);
            else if (c instanceof BombaLogica) c.setAcionamento(grauSaida);
        });

        this.notify({ tipo: 'ctrl_update', grau: u * 100, erro: erro });
    }

    resetControlador() {
        this._ctrlIntegral = 0;
        this._lastErro = 0;
    }

    atualizarFisica(dt, fluido) {
        this.normalizarAlturasBocais();
        this.lastQin = this.estadoHidraulico.entradaVazaoLps;
        this.lastQout = this.estadoHidraulico.saidaVazaoLps;
        this.volumeAtual += (this.lastQin - this.lastQout) * dt;
        this.volumeAtual = clamp(this.volumeAtual, 0, this.capacidadeMaxima);
        this.pressaoFundoBar = this.getPressaoHidrostaticaBar(fluido);
        this.sincronizarMetricasFisicas(fluido);

        this.notify({
            tipo: 'volume',
            perc: this.capacidadeMaxima > 0 ? this.volumeAtual / this.capacidadeMaxima : 0,
            abs: this.volumeAtual,
            qIn: this.lastQin,
            qOut: this.lastQout,
            pBottom: this.pressaoFundoBar
        });
    }

    sincronizarMetricasFisicas(fluido) {
        this.normalizarAlturasBocais();
        super.sincronizarMetricasFisicas(fluido);
        this.pressaoFundoBar = this.getPressaoHidrostaticaBar(fluido || ENGINE.fluidoOperante);
    }

    getFluxoSaida() {
        return this.lastQout || 0;
    }

    getFluxoSaidaFromTank(nivelMontante) {
        const headBar = pressureFromHeadBar(
            Math.max(0, (nivelMontante * this.alturaUtilMetros) - this.alturaBocalSaidaM),
            ENGINE.fluidoOperante.densidade
        );
        return flowFromBernoulli(
            headBar,
            this.getAreaConexaoM2(),
            ENGINE.fluidoOperante.densidade,
            1.0 / Math.max(0.15, this.coeficienteSaida * this.coeficienteSaida)
        );
    }
}
