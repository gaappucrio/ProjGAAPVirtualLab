import { BombaLogica } from '../components/BombaLogica.js';
import { DrenoLogico } from '../components/DrenoLogico.js';
import { FonteLogica } from '../components/FonteLogica.js';
import { TanqueLogico } from '../components/TanqueLogico.js';
import { EPSILON_FLOW } from '../units/HydraulicUnits.js';

function createEmptyIsland() {
    return {
        componentIds: [],
        connectionIds: [],
        hasDirectedCycle: false,
        hasPressureBoundary: false,
        hasActivePump: false,
        isFloating: false
    };
}

function isPressureBoundary(component) {
    return component instanceof FonteLogica
        || component instanceof DrenoLogico
        || component instanceof TanqueLogico;
}

function isActivePump(component) {
    return component instanceof BombaLogica && component.getDriveAtual() > EPSILON_FLOW;
}

function buildUndirectedAdjacency(componentes, conexoes) {
    const adjacency = new Map(componentes.map((component) => [component.id, new Set()]));

    conexoes.forEach((connection) => {
        if (!adjacency.has(connection.sourceId) || !adjacency.has(connection.targetId)) return;
        adjacency.get(connection.sourceId).add(connection.targetId);
        adjacency.get(connection.targetId).add(connection.sourceId);
    });

    return adjacency;
}

function findUndirectedIslands(componentes, conexoes) {
    const adjacency = buildUndirectedAdjacency(componentes, conexoes);
    const visited = new Set();
    const islands = [];

    componentes.forEach((component) => {
        if (visited.has(component.id)) return;

        const island = createEmptyIsland();
        const queue = [component.id];
        visited.add(component.id);

        while (queue.length > 0) {
            const componentId = queue.shift();
            island.componentIds.push(componentId);

            (adjacency.get(componentId) || []).forEach((nextId) => {
                if (visited.has(nextId)) return;
                visited.add(nextId);
                queue.push(nextId);
            });
        }

        const componentIdSet = new Set(island.componentIds);
        island.connectionIds = conexoes
            .filter((connection) => componentIdSet.has(connection.sourceId) && componentIdSet.has(connection.targetId))
            .map((connection) => connection.id);
        islands.push(island);
    });

    return islands;
}

function findDirectedCycleComponentIds(componentes, conexoes) {
    const adjacency = new Map(componentes.map((component) => [component.id, []]));
    conexoes.forEach((connection) => {
        if (!adjacency.has(connection.sourceId) || !adjacency.has(connection.targetId)) return;
        adjacency.get(connection.sourceId).push(connection.targetId);
    });

    const visiting = new Set();
    const visited = new Set();
    const cyclic = new Set();
    const stack = [];

    const visit = (componentId) => {
        if (visiting.has(componentId)) {
            const cycleStart = stack.indexOf(componentId);
            const cycleMembers = cycleStart >= 0 ? stack.slice(cycleStart) : [componentId];
            cycleMembers.forEach((id) => cyclic.add(id));
            return;
        }
        if (visited.has(componentId)) return;

        visiting.add(componentId);
        stack.push(componentId);

        (adjacency.get(componentId) || []).forEach((nextId) => visit(nextId));

        stack.pop();
        visiting.delete(componentId);
        visited.add(componentId);
    };

    componentes.forEach((component) => visit(component.id));
    return cyclic;
}

export function analyzeHydraulicNetwork({ componentes = [], conexoes = [] } = {}) {
    const componentById = new Map(componentes.map((component) => [component.id, component]));
    const cyclicComponentIds = findDirectedCycleComponentIds(componentes, conexoes);
    const islands = findUndirectedIslands(componentes, conexoes).map((island) => {
        const componentIds = island.componentIds;
        const hasDirectedCycle = componentIds.some((id) => cyclicComponentIds.has(id));
        const hasPressureBoundary = componentIds.some((id) => isPressureBoundary(componentById.get(id)));
        const hasActivePump = componentIds.some((id) => isActivePump(componentById.get(id)));

        return {
            ...island,
            hasDirectedCycle,
            hasPressureBoundary,
            hasActivePump,
            isFloating: !hasPressureBoundary
        };
    });

    const cyclicIslands = islands.filter((island) => island.hasDirectedCycle);
    const floatingCyclicIslands = cyclicIslands.filter((island) => island.isFloating);

    return {
        hasDirectedCycle: cyclicIslands.length > 0,
        shouldUseNodalSolver: cyclicIslands.length > 0,
        cyclicComponentIds: [...cyclicComponentIds],
        islands,
        cyclicIslands,
        floatingCyclicIslands,
        diagnostics: [
            ...floatingCyclicIslands.map((island) => ({
                code: island.hasActivePump
                    ? 'floating_closed_loop_reference_assumed'
                    : 'floating_passive_closed_loop',
                severity: island.hasActivePump ? 'warning' : 'info',
                componentIds: [...island.componentIds],
                message: island.hasActivePump
                    ? 'Malha fechada sem fonte, dreno ou tanque: o solver nodal usa uma referencia manometrica de 0 bar para calcular apenas pressoes relativas.'
                    : 'Malha fechada passiva sem fronteira de pressao: sem bomba ativa ou desnivel imposto, a solucao fisica e vazao zero.'
            }))
        ]
    };
}
