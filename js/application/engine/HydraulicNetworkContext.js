import {
    ensureConnectionProperties,
    getPipeHydraulics
} from '../../domain/services/PipeHydraulics.js';
import { mixFluidos } from '../../domain/components/Fluido.js';

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
        if (typeof component?.getFluidoSaidaAtual === 'function') {
            return component.getFluidoSaidaAtual(this.fluidoOperante);
        }
        if (typeof component?.getFluidoEntradaMisturado === 'function' && component.estadoHidraulico?.entradaFluidoContribuicoes?.length > 0) {
            return component.getFluidoEntradaMisturado(this.fluidoOperante);
        }

        const visited = new Set();
        const queue = [component?.id].filter(Boolean);
        const upstreamContributions = [];

        while (queue.length > 0) {
            const componentId = queue.shift();
            if (!componentId || visited.has(componentId)) continue;
            visited.add(componentId);

            const upstreamConnections = this.getInputConnections(componentId);
            for (const connection of upstreamConnections) {
                const state = this.getConnectionState(connection);
                if (state?.fluid && (state.flowLps > 0 || state.targetFlowLps > 0 || connection.lastResolvedFlowLps > 0)) {
                    upstreamContributions.push({
                        fluido: state.fluid,
                        weight: state.flowLps || state.targetFlowLps || connection.lastResolvedFlowLps
                    });
                    continue;
                }

                const source = this.getComponentById(connection.sourceId);
                if (source?.fluidoEntrada) {
                    upstreamContributions.push({
                        fluido: source.fluidoEntrada,
                        weight: connection.lastResolvedFlowLps || 1
                    });
                    continue;
                }
                if (source?.id && !visited.has(source.id)) queue.push(source.id);
            }
        }

        return upstreamContributions.length > 0
            ? mixFluidos(upstreamContributions, this.fluidoOperante)
            : this.fluidoOperante;
    }

    getConnectionFluid(connection) {
        const state = connection ? this.getConnectionState(connection) : null;
        if (state?.fluid) return state.fluid;
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

    getInputConnections(component) {
        return this.engine.getInputConnections(component);
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
