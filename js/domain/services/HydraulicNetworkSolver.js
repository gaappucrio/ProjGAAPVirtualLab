import { BombaLogica } from '../components/BombaLogica.js';
import { FonteLogica } from '../components/FonteLogica.js';
import { TanqueLogico } from '../components/TanqueLogico.js';
import { TrocadorCalorLogico } from '../components/TrocadorCalorLogico.js';
import { ValvulaLogica } from '../components/ValvulaLogica.js';
import { EPSILON_FLOW } from '../units/HydraulicUnits.js';

const MAX_QUEUE_STEPS = 512;
const MAX_COMPONENT_VISITS = 8;

export class HydraulicNetworkSolver {
    constructor(hydraulicContext, hydraulicModel) {
        this.context = hydraulicContext;
        this.hydraulicModel = hydraulicModel;
        this.metrics = {
            lastIterations: 0,
            lastError: 0,
            maxIterationsHit: 0,
            convergedCount: 0,
            totalSolverCalls: 0
        };
    }

    resolve(dt) {
        const hydraulicModel = this.hydraulicModel;
        const network = this.context;
        this.metrics.totalSolverCalls++;
        network.resetHydraulicState();
        network.conexoes.forEach((conn) => {
            hydraulicModel.ensureConnectionProperties(conn);
            conn._activeTick = false;
        });

        const queue = [];
        let queueIndex = 0;
        const visits = new Map();
        const initialTankSources = [];
        let initialTanksQueued = false;
        const isStream2Port = (portId) => portId === 'in2' || portId === 'out2' || portId === '2';
        const getTargetStreamId = (targetComp, conn) => {
            if (!(targetComp instanceof TrocadorCalorLogico)) return null;
            return isStream2Port(conn?.targetEndpoint?.portId) ? 2 : 1;
        };

        const enqueue = (comp, streamId = null) => {
            if (!comp) return;
            const visitKey = (comp instanceof TrocadorCalorLogico && streamId) ? `${comp.id}:${streamId}` : comp.id;
            const nextVisits = (visits.get(visitKey) || 0) + 1;
            if (nextVisits > MAX_COMPONENT_VISITS) return;
            visits.set(visitKey, nextVisits);
            queue.push({ comp, streamId });
        };

        network.componentes.forEach((comp) => {
            if (comp instanceof FonteLogica) enqueue(comp);
        });
        network.componentes.forEach((comp) => {
            if (comp instanceof TanqueLogico && comp.volumeAtual > EPSILON_FLOW) initialTankSources.push(comp);
        });

        let steps = 0;

        while (steps < MAX_QUEUE_STEPS) {
            if (queueIndex >= queue.length) {
                if (initialTanksQueued) break;
                initialTanksQueued = true;
                initialTankSources.forEach((tank) => enqueue(tank));
                if (queueIndex >= queue.length) break;
            }

            steps += 1;
            const entry = queue[queueIndex++];
            const comp = entry.comp;
            const streamFilter = entry.streamId;
            if (!hydraulicModel.hasPendingEmission(comp, dt, streamFilter)) continue;

            if (comp instanceof TrocadorCalorLogico) {
                const allOutputs = network.getOutputConnections(comp);

                // Corrente 1 (in1 -> out1)
                if (streamFilter === null || streamFilter === 1) {
                    const pending1 = comp.getFluxoPendentePorStream?.(1) ?? comp.getFluxoPendenteLps();
                    const stream1Outputs = allOutputs.filter(conn => !isStream2Port(conn.sourceEndpoint?.portId));
                    if (pending1 > EPSILON_FLOW && stream1Outputs.length > 0) {
                        const supply1 = hydraulicModel.buildSupplyState(comp, dt, { streamId: 1, flowLimitLps: pending1 });
                        if (supply1 && supply1.availableFlowLps > EPSILON_FLOW) {
                            const visited = new Set([comp.id]);
                            const estimates1 = stream1Outputs
                                .map((conn) => ({ conn, estimate: hydraulicModel.estimateBranch(comp, conn, supply1, dt, visited) }))
                                .filter((item) => item.estimate.capacityLps > EPSILON_FLOW);
                            if (estimates1.length > 0) {
                                const totalCap1 = estimates1.reduce((sum, item) => sum + item.estimate.capacityLps, 0);
                                const totalFlow1 = Math.min(supply1.availableFlowLps, totalCap1);
                                estimates1.forEach((item) => {
                                    const share = totalCap1 > EPSILON_FLOW ? item.estimate.capacityLps / totalCap1 : 0;
                                    const branchFlow = totalFlow1 * share;
                                    if (branchFlow <= EPSILON_FLOW) return;
                                    const delivered = hydraulicModel.applyBranchFlow(comp, item.conn, supply1, item.estimate, branchFlow, dt);
                                    const target = network.getComponentById(item.conn.targetId);
                                    if (delivered > EPSILON_FLOW && (
                                        target instanceof BombaLogica || target instanceof ValvulaLogica || target instanceof TrocadorCalorLogico
                                    )) {
                                        enqueue(target, getTargetStreamId(target, item.conn));
                                    }
                                });
                            }
                        }
                    }
                }

                // Corrente 2 (in2 -> out2)
                if (streamFilter === null || streamFilter === 2) {
                    const pending2 = comp.getFluxoPendentePorStream?.(2) ?? 0;
                    const stream2Outputs = allOutputs.filter(conn => isStream2Port(conn.sourceEndpoint?.portId));
                    if (pending2 > EPSILON_FLOW && stream2Outputs.length > 0) {
                        const supply2 = hydraulicModel.buildSupplyState(comp, dt, { streamId: 2, flowLimitLps: pending2 });
                        if (supply2 && supply2.availableFlowLps > EPSILON_FLOW) {
                            const visited = new Set([comp.id]);
                            const estimates2 = stream2Outputs
                                .map((conn) => ({ conn, estimate: hydraulicModel.estimateBranch(comp, conn, supply2, dt, visited) }))
                                .filter((item) => item.estimate.capacityLps > EPSILON_FLOW);
                            if (estimates2.length > 0) {
                                const totalCap2 = estimates2.reduce((sum, item) => sum + item.estimate.capacityLps, 0);
                                const totalFlow2 = Math.min(supply2.availableFlowLps, totalCap2);
                                estimates2.forEach((item) => {
                                    const share = totalCap2 > EPSILON_FLOW ? item.estimate.capacityLps / totalCap2 : 0;
                                    const branchFlow = totalFlow2 * share;
                                    if (branchFlow <= EPSILON_FLOW) return;
                                    const delivered = hydraulicModel.applyBranchFlow(comp, item.conn, supply2, item.estimate, branchFlow, dt);
                                    const target = network.getComponentById(item.conn.targetId);
                                    if (delivered > EPSILON_FLOW && (
                                        target instanceof BombaLogica || target instanceof ValvulaLogica || target instanceof TrocadorCalorLogico
                                    )) {
                                        enqueue(target, getTargetStreamId(target, item.conn));
                                    }
                                });
                            }
                        }
                    }
                }
                continue;
            }

            const outputs = network.getOutputConnections(comp);
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
                const target = network.getComponentById(item.conn.targetId);
                if (deliveredFlow > EPSILON_FLOW && (
                    target instanceof BombaLogica
                    || target instanceof ValvulaLogica
                    || target instanceof TrocadorCalorLogico
                )) {
                    enqueue(target, getTargetStreamId(target, item.conn));
                }
            });

            if (comp instanceof FonteLogica || comp instanceof TanqueLogico) comp.marcarEmissaoIntrinseca();
            else if (emittedFlowLps > EPSILON_FLOW) comp.consumirEntrada(emittedFlowLps);
        }

        this.metrics.lastIterations = steps;
        if (steps === MAX_QUEUE_STEPS) {
            this.metrics.maxIterationsHit++;
        } else {
            this.metrics.convergedCount++;
        }

        hydraulicModel.relaxIdleConnections(dt);
        this.metrics.lastError = hydraulicModel.balancePassThroughMass();
    }

    getMetrics() {
        return { ...this.metrics };
    }
}
