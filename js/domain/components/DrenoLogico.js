import { ComponenteFisico } from './BaseComponente.js';

export class DrenoLogico extends ComponenteFisico {
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.pressaoSaidaBar = 0.0;
        this.perdaEntradaK = 0;
        // Aba Avançado: o K incide na velocidade do bocal (diametroConexaoM) e não na do cano.
        this.usarGeometriaBocal = false;
        this.vazaoRecebidaLps = 0;
    }

    sincronizarMetricasFisicas() {
        super.sincronizarMetricasFisicas();
        this.vazaoRecebidaLps = this.estadoHidraulico.entradaVazaoLps;
    }
}
