// =======================================
// COMPATIBILIDADE: Wrapper do Solver Atual
// Arquivo: js/utils/FlowSolver.js
// =======================================

import { HydraulicNetworkSolver } from '../domain/services/HydraulicNetworkSolver.js';

/**
 * Wrapper legado mantido apenas para compatibilidade com imports antigos.
 * A implementação oficial do solver agora vive em `js/domain/services/HydraulicNetworkSolver.js`.
 */
export class FlowSolver {
    constructor() {
        this.solverByEngine = new WeakMap();
    }

    getSolver(engine) {
        if (!engine) {
            throw new Error('FlowSolver requer uma instância de engine para delegar ao solver atual.');
        }

        if (!this.solverByEngine.has(engine)) {
            this.solverByEngine.set(engine, new HydraulicNetworkSolver(engine));
        }

        return this.solverByEngine.get(engine);
    }

    resolvePushBasedNetwork(engine, _fluidoOperante, dt) {
        return this.getSolver(engine).resolve(dt);
    }

    getMetrics(engine) {
        return this.getSolver(engine).getMetrics();
    }
}

export const solver = new FlowSolver();
