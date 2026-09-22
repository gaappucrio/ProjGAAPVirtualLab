export function isPipeMonitorEntry(entry) {
    return entry?.kind === 'pipe' || entry?.kind === 'pipeGroup';
}

export function getPipeMonitorEntryIds(entry) {
    if (entry?.kind === 'pipeGroup' && Array.isArray(entry.ids)) {
        return [...new Set(entry.ids.filter(Boolean))];
    }

    return entry?.kind === 'pipe' && entry.id ? [entry.id] : [];
}

function getConnectionEndpoints(connection) {
    return [connection?.sourceId, connection?.targetId].filter(Boolean);
}

function buildConnectionLookup(connections = []) {
    return new Map(connections.map((connection) => [connection.id, connection]));
}

function buildComponentAdjacency(connections = []) {
    const adjacency = new Map();

    const ensureComponent = (componentId) => {
        if (!adjacency.has(componentId)) adjacency.set(componentId, new Set());
        return adjacency.get(componentId);
    };

    connections.forEach((connection) => {
        const [sourceId, targetId] = getConnectionEndpoints(connection);
        if (!sourceId || !targetId) return;

        ensureComponent(sourceId).add(targetId);
        ensureComponent(targetId).add(sourceId);
    });

    return adjacency;
}

function buildDirectedComponentAdjacency(connections = []) {
    const adjacency = new Map();

    const ensureComponent = (componentId) => {
        if (!adjacency.has(componentId)) adjacency.set(componentId, new Set());
        return adjacency.get(componentId);
    };

    connections.forEach((connection) => {
        const [sourceId, targetId] = getConnectionEndpoints(connection);
        if (!sourceId || !targetId) return;

        ensureComponent(sourceId).add(targetId);
        ensureComponent(targetId);
    });

    return adjacency;
}

function findReachableComponents(startComponentId, adjacency) {
    const visited = new Set();
    const queue = [startComponentId];

    while (queue.length > 0) {
        const componentId = queue.shift();
        if (!componentId || visited.has(componentId)) continue;

        visited.add(componentId);
        (adjacency.get(componentId) || []).forEach((nextComponentId) => {
            if (!visited.has(nextComponentId)) queue.push(nextComponentId);
        });
    }

    return visited;
}

function hasDirectedPath(sourceComponentId, targetComponentId, adjacency) {
    if (!sourceComponentId || !targetComponentId) return false;
    if (sourceComponentId === targetComponentId) return true;
    return findReachableComponents(sourceComponentId, adjacency).has(targetComponentId);
}

function isConnectionBeforeInRoute(a, b, directedAdjacency) {
    const [, aTargetId] = getConnectionEndpoints(a);
    const [bSourceId] = getConnectionEndpoints(b);
    return hasDirectedPath(aTargetId, bSourceId, directedAdjacency);
}

function canOrderConnectionsOnDirectedRoute(connections = [], allConnections = []) {
    if (connections.length <= 1) return true;

    const directedAdjacency = buildDirectedComponentAdjacency(allConnections);
    const orderedConnections = [...connections].sort((a, b) => {
        if (isConnectionBeforeInRoute(a, b, directedAdjacency)) return -1;
        if (isConnectionBeforeInRoute(b, a, directedAdjacency)) return 1;
        return 0;
    });

    return orderedConnections.every((connection, index) => {
        if (index === 0) return true;
        return isConnectionBeforeInRoute(orderedConnections[index - 1], connection, directedAdjacency);
    });
}

export function canMergePipeMonitorEntries(sourceEntry, targetEntry, connections = []) {
    if (!isPipeMonitorEntry(sourceEntry) || !isPipeMonitorEntry(targetEntry)) return false;

    const ids = [...new Set([
        ...getPipeMonitorEntryIds(targetEntry),
        ...getPipeMonitorEntryIds(sourceEntry)
    ])];
    if (ids.length === 0) return false;

    const connectionById = buildConnectionLookup(connections);
    const selectedConnections = ids.map((id) => connectionById.get(id));
    if (selectedConnections.some((connection) => !connection)) return false;

    const firstComponentId = getConnectionEndpoints(selectedConnections[0])[0];
    if (!firstComponentId) return false;

    const reachableComponents = findReachableComponents(
        firstComponentId,
        buildComponentAdjacency(connections)
    );

    return selectedConnections.every((connection) =>
        getConnectionEndpoints(connection).every((componentId) => reachableComponents.has(componentId))
    ) && canOrderConnectionsOnDirectedRoute(selectedConnections, connections);
}

const PIXELS_PER_METER_FOR_MONITOR_GAP = 80;

function getConnectionLengthM(engine, connection) {
    const geometry = engine?.getConnectionGeometry?.(connection);
    return Math.max(0, Number(geometry?.lengthM) || 0);
}

function getVisualGapBetweenComponentsM(engine, sourceComponentId, targetComponentId) {
    const source = engine?.getComponentById?.(sourceComponentId);
    const target = engine?.getComponentById?.(targetComponentId);
    if (!source || !target) return 1;

    const dx = (Number(target.x) || 0) - (Number(source.x) || 0);
    const dy = (Number(target.y) || 0) - (Number(source.y) || 0);
    return Math.max(1, Math.sqrt((dx * dx) + (dy * dy)) / PIXELS_PER_METER_FOR_MONITOR_GAP);
}

export function getShortestUnselectedPathLengthM(engine, sourceComponentId, targetComponentId, blockedConnectionIds = new Set()) {
    if (!sourceComponentId || !targetComponentId) return null;
    if (sourceComponentId === targetComponentId) return 0;

    const distances = new Map([[sourceComponentId, 0]]);
    const queue = [sourceComponentId];

    while (queue.length > 0) {
        queue.sort((a, b) => distances.get(a) - distances.get(b));
        const currentId = queue.shift();
        const currentDistance = distances.get(currentId);

        if (currentId === targetComponentId) return currentDistance;

        (engine?.conexoes || []).forEach((connection) => {
            if (blockedConnectionIds.has(connection.id) || connection.sourceId !== currentId) return;

            const nextDistance = currentDistance + getConnectionLengthM(engine, connection);
            const previousDistance = distances.get(connection.targetId);
            if (previousDistance !== undefined && previousDistance <= nextDistance) return;

            distances.set(connection.targetId, nextDistance);
            queue.push(connection.targetId);
        });
    }

    return null;
}

export function isConnectionBefore(engine, a, b, blockedConnectionIds = new Set()) {
    if (!a || !b) return false;
    if (a.targetId === b.sourceId) return true;
    return getShortestUnselectedPathLengthM(engine, a.targetId, b.sourceId, blockedConnectionIds) !== null;
}

export function orderPipeGroupConnections(connections, engine) {
    const selectedIds = new Set(connections.map((connection) => connection.id));
    return [...connections].sort((a, b) => {
        if (isConnectionBefore(engine, a, b, selectedIds)) return -1;
        if (isConnectionBefore(engine, b, a, selectedIds)) return 1;

        const sourceA = engine?.getComponentById?.(a.sourceId);
        const sourceB = engine?.getComponentById?.(b.sourceId);
        const xA = Number(sourceA?.x) || 0;
        const xB = Number(sourceB?.x) || 0;
        if (xA !== xB) return xA - xB;
        return (Number(sourceA?.y) || 0) - (Number(sourceB?.y) || 0);
    });
}

function getPipeGapBeforeSection(engine, previousConnection, currentConnection, blockedConnectionIds) {
    if (!previousConnection || !currentConnection) return 0;
    if (previousConnection.targetId === currentConnection.sourceId) return 0;

    const pathLengthM = getShortestUnselectedPathLengthM(
        engine,
        previousConnection.targetId,
        currentConnection.sourceId,
        blockedConnectionIds
    );
    return pathLengthM ?? getVisualGapBetweenComponentsM(engine, previousConnection.targetId, currentConnection.sourceId);
}

export function buildPipeGroupSections(connections = [], { engine, resolvePipePressureProfileOptions, getConnectionMonitorLabel } = {}) {
    const orderedConnections = orderPipeGroupConnections(connections, engine);
    const selectedIds = new Set(orderedConnections.map((connection) => connection.id));

    return orderedConnections.map((connection, index) => {
        const state = engine?.getConnectionState?.(connection);
        const source = engine?.getComponentById?.(connection?.sourceId);
        const previousConnection = index > 0 ? orderedConnections[index - 1] : null;

        return {
            connection,
            state,
            geometry: engine?.getConnectionGeometry?.(connection),
            label: getConnectionMonitorLabel?.(connection) ?? '',
            gapBeforeM: getPipeGapBeforeSection(engine, previousConnection, connection, selectedIds),
            ...(resolvePipePressureProfileOptions?.({ state, source }) || {})
        };
    });
}
