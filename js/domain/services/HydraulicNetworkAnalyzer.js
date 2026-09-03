import { TrocadorCalorLogico } from '../components/TrocadorCalorLogico.js';
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

function isStream2Port(portId) {
    return portId === 'in2' || portId === 'out2' || portId === '2';
}

function getComponentEndpointKey(comp, portId) {
    if (!comp) return '';
    if (comp instanceof TrocadorCalorLogico || comp?.tipo === 'trocador-calor') {
        return `${comp.id}:${isStream2Port(portId) ? 'stream2' : 'stream1'}`;
    }
    return comp.id;
}

function getEndpointKeysForComponent(comp, conexoes) {
    if (!(comp instanceof TrocadorCalorLogico || comp?.tipo === 'trocador-calor')) {
        return [comp.id];
    }
    const hasStream1 = conexoes.some((c) =>
        (c.sourceId === comp.id && !isStream2Port(c.sourceEndpoint?.portId)) ||
        (c.targetId === comp.id && !isStream2Port(c.targetEndpoint?.portId))
    );
    const hasStream2 = conexoes.some((c) =>
        (c.sourceId === comp.id && isStream2Port(c.sourceEndpoint?.portId)) ||
        (c.targetId === comp.id && isStream2Port(c.targetEndpoint?.portId))
    );
    const keys = [];
    if (hasStream1) keys.push(`${comp.id}:stream1`);
    if (hasStream2) keys.push(`${comp.id}:stream2`);
    if (keys.length === 0) keys.push(comp.id);
    return keys;
}

function buildUndirectedAdjacency(componentes, conexoes, endpointKeys) {
    const componentById = new Map(componentes.map((c) => [c.id, c]));
    const adjacency = new Map(endpointKeys.map((k) => [k, new Set()]));

    conexoes.forEach((connection) => {
        const source = componentById.get(connection.sourceId);
        const target = componentById.get(connection.targetId);
        if (!source || !target) return;

        const u = getComponentEndpointKey(source, connection.sourceEndpoint?.portId);
        const v = getComponentEndpointKey(target, connection.targetEndpoint?.portId);
        if (adjacency.has(u) && adjacency.has(v)) {
            adjacency.get(u).add(v);
            adjacency.get(v).add(u);
        }
    });

    return adjacency;
}

function findUndirectedIslands(componentes, conexoes) {
    const componentById = new Map(componentes.map((c) => [c.id, c]));
    const allEndpointKeys = componentes.flatMap((c) => getEndpointKeysForComponent(c, conexoes));
    const adjacency = buildUndirectedAdjacency(componentes, conexoes, allEndpointKeys);
    const visited = new Set();
    const islands = [];

    allEndpointKeys.forEach((startKey) => {
        if (visited.has(startKey)) return;

        const island = createEmptyIsland();
        const queue = [startKey];
        visited.add(startKey);
        const islandEndpointKeys = [];

        while (queue.length > 0) {
            const currentKey = queue.shift();
            islandEndpointKeys.push(currentKey);

            (adjacency.get(currentKey) || []).forEach((nextKey) => {
                if (visited.has(nextKey)) return;
                visited.add(nextKey);
                queue.push(nextKey);
            });
        }

        const endpointKeySet = new Set(islandEndpointKeys);
        island.endpointKeys = islandEndpointKeys;
        island.componentIds = [...new Set(islandEndpointKeys.map((k) => k.split(':')[0]))];
        island.connectionIds = conexoes
            .filter((connection) => {
                const source = componentById.get(connection.sourceId);
                const target = componentById.get(connection.targetId);
                const u = getComponentEndpointKey(source, connection.sourceEndpoint?.portId);
                const v = getComponentEndpointKey(target, connection.targetEndpoint?.portId);
                return endpointKeySet.has(u) && endpointKeySet.has(v);
            })
            .map((connection) => connection.id);

        islands.push(island);
    });

    return islands;
}

function findDirectedCycleComponentIds(componentes, conexoes) {
    const componentById = new Map(componentes.map((c) => [c.id, c]));
    const allEndpointKeys = componentes.flatMap((c) => getEndpointKeysForComponent(c, conexoes));
    const adjacency = new Map(allEndpointKeys.map((k) => [k, []]));

    conexoes.forEach((connection) => {
        const source = componentById.get(connection.sourceId);
        const target = componentById.get(connection.targetId);
        if (!source || !target) return;

        const u = getComponentEndpointKey(source, connection.sourceEndpoint?.portId);
        const v = getComponentEndpointKey(target, connection.targetEndpoint?.portId);
        if (adjacency.has(u) && adjacency.has(v)) {
            adjacency.get(u).push(v);
        }
    });

    const visiting = new Set();
    const visited = new Set();
    const cyclicEndpoints = new Set();
    const stack = [];

    const visit = (k) => {
        if (visiting.has(k)) {
            const cycleStart = stack.indexOf(k);
            const cycleMembers = cycleStart >= 0 ? stack.slice(cycleStart) : [k];
            cycleMembers.forEach((id) => cyclicEndpoints.add(id));
            return;
        }
        if (visited.has(k)) return;

        visiting.add(k);
        stack.push(k);

        (adjacency.get(k) || []).forEach((nextKey) => visit(nextKey));

        stack.pop();
        visiting.delete(k);
        visited.add(k);
    };

    allEndpointKeys.forEach((k) => visit(k));
    return cyclicEndpoints;
}

export function analyzeHydraulicNetwork({ componentes = [], conexoes = [] } = {}) {
    const componentById = new Map(componentes.map((component) => [component.id, component]));
    const cyclicEndpoints = findDirectedCycleComponentIds(componentes, conexoes);
    const cyclicComponentIds = new Set([...cyclicEndpoints].map((k) => k.split(':')[0]));
    const islands = findUndirectedIslands(componentes, conexoes).map((island) => {
        const componentIds = island.componentIds;
        const endpointKeys = island.endpointKeys || componentIds;
        const hasDirectedCycle = endpointKeys.some((k) => cyclicEndpoints.has(k));
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
