import { ComponenteFisico } from './BaseComponente.js';
import { DEFAULT_SOURCE_PRESSURE_BAR, MAX_NETWORK_FLOW_LPS } from '../../utils/Units.js';

export class FonteLogica extends ComponenteFisico {
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.pressaoFonteBar = DEFAULT_SOURCE_PRESSURE_BAR;
        this.vazaoMaxima = MAX_NETWORK_FLOW_LPS;
        this.fluxoReal = 0;
    }

    sincronizarMetricasFisicas() {
        super.sincronizarMetricasFisicas();
        this.pressaoSaidaAtualBar = this.pressaoFonteBar;
        this.fluxoReal = this.estadoHidraulico.saidaVazaoLps;
    }
}
