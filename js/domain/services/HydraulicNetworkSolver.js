import { BombaLogica } from '../components/BombaLogica.js';
import { FonteLogica } from '../components/FonteLogica.js';
import { TanqueLogico } from '../components/TanqueLogico.js';
import { ValvulaLogica } from '../components/ValvulaLogica.js';
import { EPSILON_FLOW } from '../../utils/Units.js';

const MAX_QUEUE_STEPS = 512;
const MAX_COMPONENT_VISITS = 8;
const DEBUG_PHYSICS = false;

export class HydraulicNetworkSolver {
    constructor(engine) {
        this.engine = engine;
        this.metrics = {
            lastIterations: 0,
            lastError: 0,
            maxIterationsHit: 0,
            convergedCount: 0,
            totalSolverCalls: 0
        };
    }

    resolve(dt) {
        const hydraulicModel = this.engine.hydraulicBranchModel || this.engine;
        this.metrics.totalSolverCalls++;
        this.engine.resetHydraulicState();
        this.engine.conexoes.forEach((conn) => {
            hydraulicModel.ensureConnectionProperties(conn);
            conn._activeTick = false;
        });

        const queue = [];
        let queueIndex = 0;
        const visits = new Map();
        const enqueue = (comp) => {
            if (!comp) return;
            const nextVisits = (visits.get(comp.id) || 0) + 1;
            if (nextVisits > MAX_COMPONENT_VISITS) return;
            visits.set(comp.id, nextVisits);
            queue.push(comp);
        };

        this.engine.componentes.forEach((comp) => {
            if (comp instanceof FonteLogica) enqueue(comp);
            else if (comp instanceof TanqueLogico && comp.volumeAtual > EPSILON_FLOW) enqueue(comp);
        });

        let steps = 0;
        if (DEBUG_PHYSICS) console.log(`[Solver] Iniciando com ${this.engine.componentes.length} componentes, máx ${MAX_QUEUE_STEPS} iterações`);

        while (queueIndex < queue.length && steps < MAX_QUEUE_STEPS) {
            steps += 1;
            const comp = queue[queueIndex++];
            if (!hydraulicModel.hasPendingEmission(comp, dt)) continue;

            const outputs = this.engine.getOutputConnections(comp);
            if (outputs.length === 0) continue;

            const supply = hydraulicModel.buildSupplyState(comp, dt);
            if (!supply || supply.availableFlowLps <= EPSILON_FLOW) continue;

            const visited = new Set([comp.id]);
            const estimates = outputs
                .map((conn) => ({ conn, estimate: hydraulicModel.estimateBranch(comp, conn, supply, dt, visited) }))
                .filter((item) => item.estimate.capacityLps > EPSILON_FLOW);

            if (estimates.length === 0) {
                if (comp instanceof FonteLogica || comp instanceof TanqueLogico) comp.marcarEmissaoIntrinseca();
                continue;
            }

            const totalCapacity = estimates.reduce((sum, item) => sum + item.estimate.capacityLps, 0);
            const totalFlow = Math.min(supply.availableFlowLps, totalCapacity);
            if (totalFlow <= EPSILON_FLOW) {
                if (comp instanceof FonteLogica || comp instanceof TanqueLogico) comp.marcarEmissaoIntrinseca();
                continue;
            }

            let emittedFlowLps = 0;

            estimates.forEach((item) => {
                const share = totalCapacity > EPSILON_FLOW ? item.estimate.capacityLps / totalCapacity : 0;
                const branchFlow = totalFlow * share;
                if (branchFlow <= EPSILON_FLOW) return;

                const deliveredFlow = hydraulicModel.applyBranchFlow(comp, item.conn, supply, item.estimate, branchFlow, dt);
                emittedFlowLps += deliveredFlow;
                const target = this.engine.getComponentById(item.conn.targetId);
                if (deliveredFlow > EPSILON_FLOW && (target instanceof BombaLogica || target instanceof ValvulaLogica)) {
                    enqueue(target);
                }
            });

            if (comp instanceof FonteLogica || comp instanceof TanqueLogico) comp.marcarEmissaoIntrinseca();
            else if (emittedFlowLps > EPSILON_FLOW) comp.consumirEntrada(emittedFlowLps);
        }

        this.metrics.lastIterations = steps;
        if (steps === MAX_QUEUE_STEPS) {
            this.metrics.maxIterationsHit++;
            if (DEBUG_PHYSICS) console.warn(`[Solver] Limite de iterações atingido (${MAX_QUEUE_STEPS}). Queue final: ${queue.length - queueIndex} componentes pendentes.`);
        } else {
            this.metrics.convergedCount++;
            if (DEBUG_PHYSICS) console.log(`[Solver] Convergiu em ${steps} iterações com sucesso.`);
        }

        hydraulicModel.relaxIdleConnections(dt);
    }

    getMetrics() {
        return { ...this.metrics };
    }
}
