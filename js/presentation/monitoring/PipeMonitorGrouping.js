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
