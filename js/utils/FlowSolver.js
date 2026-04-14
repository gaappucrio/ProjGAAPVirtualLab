// =======================================
// UTILIDADE: Solucionador de Rede Hidráulica
// Arquivo: js/utils/FlowSolver.js
// =======================================

import { getPipeHydraulics, getConnectionGeometry, ensureConnectionProperties } from './PipeHydraulics.js';
import { clamp } from '../componentes/BaseComponente.js';
import { EPSILON_FLOW } from './Units.js';

const MAX_QUEUE_STEPS = 512;
const MAX_COMPONENT_VISITS = 8;

/**
 * Classe para resolver a rede de fluxo hidráulico
 */
export class FlowSolver {
    constructor() {
        this.metrics = {
            iterationsPerTick: 0,
            totalIterations: 0,
            maxIterationHits: 0,
            convergenceRate: 0,
            lastConvergenceTime: 0
        };
    }

    /**
     * Calcula perda de pressão em uma conexão
     */
    calculateConnectionLoss(conn, geometry, flowLps, fluidoOperante) {
        const areaM2 = conn.areaM2 || 0.005;
        const hydraulics = getPipeHydraulics(conn, geometry, areaM2, flowLps, fluidoOperante.densidade, fluidoOperante.viscosidadeDinamicaPaS);
        
        const velocityMps = hydraulics.velocityMps;
        const distributed = 0.5 * fluidoOperante.densidade * (velocityMps ** 2) * hydraulics.distributedLossCoeff;
        const localized = 0.5 * fluidoOperante.densidade * (velocityMps ** 2) * (conn.perdaLocalK || 0);
        
        return Math.max(0, distributed + localized);
    }

    /**
     * Resolve fluxo e pressão na rede usando algoritmo push-based
     */
    resolvePushBasedNetwork(engine, fluidoOperante, dt) {
        const startTime = performance.now();
        const visited = new Set();
        const queue = [];
        let iterationCount = 0;
        let convergenceAchieved = false;

        // Fonte: inicia fila com componentes fornecedores de energia
        const sources = engine.getComponentsByType('source');
        sources.forEach(source => {
            if (source.componentState) queue.push(source);
        });

        // Processa fila até convergência ou limite de iterações
        while (queue.length > 0 && iterationCount < MAX_QUEUE_STEPS) {
            iterationCount++;
            const comp = queue.shift();
            const compId = comp.id || String(Math.random());

            if (!visited.has(compId)) {
                visited.add(compId);
                comp.updatePressure(fluidoOperante, dt);
                comp.requestFlowFromConnections(fluidoOperante, dt);
            }

            // Adiciona componentes conectados à fila se precisam de update
            const connections = engine.getConnectionsFrom(comp) || [];
            connections.forEach(conn => {
                const target = conn.componenteDestino;
                const visitCount = (visited.has(target.id || String(Math.random())) ? 1 : 0);
                
                if (visitCount < MAX_COMPONENT_VISITS) {
                    queue.push(target);
                }
            });
        }

        // Verifica convergência
        let totalFlowChange = 0;
        engine.allConnections.forEach(conn => {
            const flowChange = Math.abs(conn.transientFlowLps - conn.lastResolvedFlowLps);
            totalFlowChange += flowChange;
        });

        convergenceAchieved = totalFlowChange < EPSILON_FLOW * engine.allConnections.length;

        // Atualiza métricas
        this.metrics.iterationsPerTick = iterationCount;
        this.metrics.totalIterations += iterationCount;
        if (iterationCount >= MAX_QUEUE_STEPS) this.metrics.maxIterationHits++;
        this.metrics.convergenceRate = convergenceAchieved ? 1.0 : Math.max(0, 1 - (totalFlowChange / (EPSILON_FLOW * Math.max(1, engine.allConnections.length))));
        this.metrics.lastConvergenceTime = performance.now() - startTime;

        return {
            converged: convergenceAchieved,
            iterationCount,
            convergenceRate: this.metrics.convergenceRate,
            solveTimeMs: this.metrics.lastConvergenceTime
        };
    }

    /**
     * Obtém métricas do solucionador
     */
    getMetrics() {
        return { ...this.metrics };
    }

    /**
     * Reseta métricas
     */
    resetMetrics() {
        this.metrics = {
            iterationsPerTick: 0,
            totalIterations: 0,
            maxIterationHits: 0,
            convergenceRate: 0,
            lastConvergenceTime: 0
        };
    }
}

// Instância singleton do solucionador
export const solver = new FlowSolver();
