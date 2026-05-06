import {
    ensureConnectionProperties,
    getPipeHydraulics
} from '../../domain/services/PipeHydraulics.js';

export class HydraulicNetworkContext {
    constructor(engine) {
        this.engine = engine;
    }

    get componentes() {
        return this.engine.componentes;
    }

    get conexoes() {
        return this.engine.conexoes;
    }

    get fluidoOperante() {
        return this.engine.fluidoOperante;
    }

    getComponentFluid(component) {
        if (component?.fluidoEntrada) return component.fluidoEntrada;

        const visited = new Set();
        const queue = [component?.id].filter(Boolean);

        while (queue.length > 0) {
            const componentId = queue.shift();
            if (!componentId || visited.has(componentId)) continue;
            visited.add(componentId);

            const upstreamConnections = this.conexoes.filter((connection) => connection.targetId === componentId);
            for (const connection of upstreamConnections) {
                const source = this.getComponentById(connection.sourceId);
                if (source?.fluidoEntrada) return source.fluidoEntrada;
                if (source?.id && !visited.has(source.id)) queue.push(source.id);
            }
        }

        return this.fluidoOperante;
    }

    getConnectionFluid(connection) {
        return this.getComponentFluid(this.getComponentById(connection?.sourceId));
    }

    get usarAlturaRelativa() {
        return this.engine.usarAlturaRelativa;
    }

    resetHydraulicState() {
        this.engine.resetHydraulicState();
    }

    getComponentById(id) {
        return this.engine.getComponentById(id);
    }

    getOutputConnections(component) {
        return this.engine.getOutputConnections(component);
    }

    getConnectionState(connection) {
        return this.engine.getConnectionState(connection);
    }

    getConnectionGeometry(connection) {
        return this.engine.getConnectionGeometry(connection);
    }

    ensureConnectionProperties(connection) {
        return ensureConnectionProperties(connection);
    }

    getPipeHydraulics(connection, geometry, areaM2, flowLps, fluid = this.getConnectionFluid(connection)) {
        const resolvedFluid = fluid || this.fluidoOperante;

        return getPipeHydraulics(
            connection,
            geometry,
            areaM2,
            flowLps,
            resolvedFluid.densidade,
            resolvedFluid.viscosidadeDinamicaPaS
        );
    }
}
