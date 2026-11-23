import { ComponenteFisico } from './BaseComponente.js';

export class DrenoLogico extends ComponenteFisico {
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.pressaoSaidaBar = 0.0;
        this.perdaEntradaK = 0;
        // Aba Avançado: o K incide na velocidade do bocal (diametroConexaoM) e não na do cano.
        this.usarGeometriaBocal = false;
        this.vazaoRecebidaLps = 0;
        // Resultado do solver: true quando a pressão de entrada é calculada (dreno monitor) e não imposta.
        this.pressaoMonitorada = false;
    }

    // Sem solução hidráulica não há modo monitor: o painel volta a mostrar a pressão imposta.
    resetEstadoHidraulico() {
        super.resetEstadoHidraulico();
        this.pressaoMonitorada = false;
    }

    sincronizarMetricasFisicas() {
        super.sincronizarMetricasFisicas();
        this.vazaoRecebidaLps = this.estadoHidraulico.entradaVazaoLps;
    }
}
