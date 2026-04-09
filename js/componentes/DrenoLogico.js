import { ComponenteFisico, flowFromBernoulli, pressureFromHeadBar } from './BaseComponente.js';
import { ENGINE } from '../MotorFisico.js';


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
        const headBar = pressureFromHeadBar(Math.max(0, nivelNormalizado) * 2.4, ENGINE.fluidoOperante.densidade);
        return flowFromBernoulli(headBar, this.getAreaConexaoM2(), ENGINE.fluidoOperante.densidade, 1 + this.perdaEntradaK);
    }
}
