import { MODO_SOLVER_GLOBAL } from '../../domain/context/SimulationContext.js';

export class SimulationConfigStore {
    constructor() {
        this.velocidade = 1.0;
        this.usarAlturaRelativa = false;
        this.modoSolver = MODO_SOLVER_GLOBAL;
    }
}
