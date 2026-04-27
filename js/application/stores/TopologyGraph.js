export class TopologyGraph {
    constructor() {
        this._components = [];
        this._connections = [];
        this.componentById = new Map();
        this.outputConnectionsById = new Map();
        this.inputConnectionsById = new Map();
    }

    get components() {
        return this._components;
    }

    set components(nextComponents) {
        this._components = Array.isArray(nextComponents) ? [...nextComponents] : [];
        this.rebuildIndexes();
    }

    get connections() {
        return this._connections;
    }

    set connections(nextConnections) {
        this._connections = Array.isArray(nextConnections) ? [...nextConnections] : [];
        this.rebuildIndexes();
    }

    addComponent(component) {
        this._components.push(component);
        this.componentById.set(component.id, component);
        this.outputConnectionsById.set(component.id, this.outputConnectionsById.get(component.id) || []);
        this.inputConnectionsById.set(component.id, this.inputConnectionsById.get(component.id) || []);
    }

    removeComponent(component) {
        this._components = this._components.filter((entry) => entry.id !== component.id);
        this.componentById.delete(component.id);
        this.outputConnectionsById.delete(component.id);
        this.inputConnectionsById.delete(component.id);
        // Remove conexões que envolvem este componente (usando sourceId/targetId em vez de dataset)
        this._connections = this._connections.filter((conn) =>
            conn.sourceId !== component.id && conn.targetId !== component.id
        );
        this.rebuildConnectionIndexes();
    }

    addConnection(connection) {
        this._connections.push(connection);
        this.indexConnection(connection);
    }

    removeConnection(connection) {
        this._connections = this._connections.filter((entry) => entry !== connection);
        this.rebuildConnectionIndexes();
    }

    getComponentById(id) {
        return this.componentById.get(id) || null;
    }

    getOutputConnections(componentOrId) {
        const id = typeof componentOrId === 'string' ? componentOrId : componentOrId?.id;
        return [...(this.outputConnectionsById.get(id) || [])];
    }

    getInputConnections(componentOrId) {
        const id = typeof componentOrId === 'string' ? componentOrId : componentOrId?.id;
        return [...(this.inputConnectionsById.get(id) || [])];
    }

    clear() {
        this._components = [];
        this._connections = [];
        this.componentById.clear();
        this.outputConnectionsById.clear();
        this.inputConnectionsById.clear();
    }

    rebuildIndexes() {
        this.componentById.clear();
        this._components.forEach((component) => {
            this.componentById.set(component.id, component);
        });
        this.rebuildConnectionIndexes();
    }

    rebuildConnectionIndexes() {
        this.outputConnectionsById.clear();
        this.inputConnectionsById.clear();

        this._components.forEach((component) => {
            this.outputConnectionsById.set(component.id, []);
            this.inputConnectionsById.set(component.id, []);
        });

        this._connections.forEach((connection) => this.indexConnection(connection));
    }

    indexConnection(connection) {
        const sourceId = connection.sourceId;
        const targetId = connection.targetId;

        if (sourceId) {
            const outputConnections = this.outputConnectionsById.get(sourceId) || [];
            outputConnections.push(connection);
            this.outputConnectionsById.set(sourceId, outputConnections);
        }

        if (targetId) {
            const inputConnections = this.inputConnectionsById.get(targetId) || [];
            inputConnections.push(connection);
            this.inputConnectionsById.set(targetId, inputConnections);
        }
    }
}
