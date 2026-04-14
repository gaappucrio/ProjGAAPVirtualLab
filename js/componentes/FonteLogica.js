import { ComponenteFisico, MAX_NETWORK_FLOW_LPS } from './BaseComponente.js';


export class FonteLogica extends ComponenteFisico {
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.pressaoFonteBar = 1.0;
        this.vazaoMaxima = MAX_NETWORK_FLOW_LPS;
        this.fluxoReal = 0;
    }

    sincronizarMetricasFisicas() {
        super.sincronizarMetricasFisicas();
        this.pressaoSaidaAtualBar = this.pressaoFonteBar;
        this.fluxoReal = this.estadoHidraulico.saidaVazaoLps;
    }
}
