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

    getPipeHydraulics(connection, geometry, areaM2, flowLps) {
        return getPipeHydraulics(
            connection,
            geometry,
            areaM2,
            flowLps,
            this.fluidoOperante.densidade,
            this.fluidoOperante.viscosidadeDinamicaPaS
        );
    }
}
