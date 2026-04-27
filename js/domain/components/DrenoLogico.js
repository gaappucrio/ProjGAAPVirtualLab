import { ComponenteFisico, flowFromBernoulli } from './BaseComponente.js';
import { pressureFromHeadBar } from '../../utils/Units.js';

export class DrenoLogico extends ComponenteFisico {
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.pressaoSaidaBar = 0.0;
        this.perdaEntradaK = 1.1;
        this.vazaoRecebidaLps = 0;
    }

    sincronizarMetricasFisicas() {
        super.sincronizarMetricasFisicas();
        this.vazaoRecebidaLps = this.estadoHidraulico.entradaVazaoLps;
    }

    getFluxoSaidaFromTank(nivelNormalizado) {
        const { fluidoOperante } = this.getSimulationContext();
        const densidade = fluidoOperante?.densidade || 1000;
        const headBar = pressureFromHeadBar(Math.max(0, nivelNormalizado) * 2.4, densidade);
        return flowFromBernoulli(headBar, this.getAreaConexaoM2(), densidade, 1 + this.perdaEntradaK);
    }
}
