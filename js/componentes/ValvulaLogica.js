import { clamp, ComponenteFisico, pressureLossFromFlow, smoothFirstOrder } from './BaseComponente.js';
import { ENGINE } from '../MotorFisico.js';


export class ValvulaLogica extends ComponenteFisico {
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.aberta = false;
        this.grauAbertura = 0;
        this.aberturaEfetiva = 0;
        this.fluxoReal = 0; 
        this.cv = 4.0; // Coeficiente de vazão (Cv) da válvula, ajustável para simular diferentes tipos de válvulas
        this.perdaLocalK = 1.0; // Coeficiente de perda local da válvula
        this.tipoCaracteristica = 'equal_percentage'; // significa
        this.rangeabilidade = 30; // Relação entre a abertura máxima e a mínima
        this.deltaPAtualBar = 0; // Queda de pressão atual através da válvula, em bar
        this.tempoCursoSegundos = 0.0; // Tempo que a válvula leva para ir de totalmente fechada a totalmente aberta, em segundos
    }

    getCharacteristicFactor(opening) {
        const safeOpening = clamp(opening, 0, 1);
        if (this.tipoCaracteristica === 'linear')
            return safeOpening;
        if (this.tipoCaracteristica === 'quick_opening') 
            return Math.sqrt(safeOpening);
        const minFactor = 1 / Math.max(2, this.rangeabilidade);
        const normalized = (Math.pow(this.rangeabilidade, safeOpening) - 1) / (this.rangeabilidade - 1);
        return clamp(minFactor + ((1 - minFactor) * normalized), minFactor, 1);
    }

    toggle() {
        this.setAbertura(this.grauAbertura > 0 ? 0 : 100);
    }

    getAberturaNormalizadaAtual() {
        return clamp(this.aberturaEfetiva / 100.0, 0, 1);
    }

    setAbertura(valor) {
        this.grauAbertura = clamp(Number(valor) || 0, 0, 100);
        if (!ENGINE.isRunning) this.aberturaEfetiva = this.grauAbertura;
        this.aberta = this.aberturaEfetiva > 0.5;
        this.notify({ tipo: 'estado', aberta: this.aberta, grau: this.grauAbertura, grauEfetivo: this.aberturaEfetiva });
    }

    atualizarDinamica(dt) {
        const previousOpening = this.aberturaEfetiva;
        this.aberturaEfetiva = smoothFirstOrder(previousOpening, this.grauAbertura, dt, this.tempoCursoSegundos);
        this.aberta = this.aberturaEfetiva > 0.5;

        if (Math.abs(this.aberturaEfetiva - previousOpening) > 0.05) {
            this.notify({ tipo: 'estado', aberta: this.aberta, grau: this.grauAbertura, grauEfetivo: this.aberturaEfetiva });
        }
    }

    sincronizarMetricasFisicas() {
        super.sincronizarMetricasFisicas();
        this.fluxoReal = this.estadoHidraulico.saidaVazaoLps;
        const opening = this.getAberturaNormalizadaAtual();
        const cvFactor = Math.max(0.2, this.cv);
        const characteristicFactor = this.getCharacteristicFactor(opening);
        const areaM2 = this.getAreaConexaoM2() * Math.max(0.08, characteristicFactor);
        const localLossCoeff = this.perdaLocalK + (1.0 / Math.max(0.025, Math.pow(Math.max(characteristicFactor, 0.01), 2.1) * cvFactor));
        this.deltaPAtualBar = opening > 0
            ? pressureLossFromFlow(this.fluxoReal, areaM2, ENGINE.fluidoOperante.densidade, localLossCoeff)
            : 0;
        this.pressaoSaidaAtualBar = Math.max(0, this.pressaoEntradaAtualBar - this.deltaPAtualBar);
    }

    getFluxoSaidaFromTank() {
        return this.fluxoReal;
    }
}
