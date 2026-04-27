import { ConnectionModel } from '../../domain/models/ConnectionModel.js';
import {
    DEFAULT_PIPE_DIAMETER_M,
    DEFAULT_PIPE_EXTRA_LENGTH_M,
    DEFAULT_PIPE_MINOR_LOSS,
    DEFAULT_PIPE_ROUGHNESS_MM
} from '../../utils/Units.js';
import { EngineEventPayloads } from '../events/EventPayloads.js';
import { createConnectionEndpointDefinition } from '../../infrastructure/dom/ComponentVisualRegistry.js';

function validateLevelControl(...components) {
    components.forEach((component) => {
        if (typeof component?.garantirConsistenciaControleNivel === 'function') {
            component.garantirConsistenciaControleNivel();
        }
    });
}

export class ConnectionService {
    constructor(engine, options = {}) {
        this.engine = engine;
        this.validateComponents = options.validateComponents || validateLevelControl;
    }

    buildConnection(sourceComponent, sourcePortEl, targetComponent, targetPortEl) {
        return new ConnectionModel({
            sourceId: sourceComponent.id,
            targetId: targetComponent.id,
            sourceEndpoint: createConnectionEndpointDefinition(sourceComponent, sourcePortEl),
            targetEndpoint: createConnectionEndpointDefinition(targetComponent, targetPortEl),
            diameterM: DEFAULT_PIPE_DIAMETER_M,
            roughnessMm: DEFAULT_PIPE_ROUGHNESS_MM,
            extraLengthM: DEFAULT_PIPE_EXTRA_LENGTH_M,
            perdaLocalK: DEFAULT_PIPE_MINOR_LOSS
        });
    }

    connect(sourceComponent, sourcePortEl, targetComponent, targetPortEl) {
        if (!sourceComponent || !targetComponent || sourceComponent === targetComponent) {
            return null;
        }

        sourceComponent.conectarSaida(targetComponent);
        this.validateComponents(sourceComponent, targetComponent);

        const connection = this.buildConnection(sourceComponent, sourcePortEl, targetComponent, targetPortEl);
        this.engine.addConnection(connection);
        this.engine.notify(EngineEventPayloads.panelUpdate(0));
        return connection;
    }

    remove(connection) {
        if (!connection) return null;

        const sourceComponent = this.engine.getComponentById(connection.sourceId);
        const targetComponent = this.engine.getComponentById(connection.targetId);

        if (sourceComponent && targetComponent) {
            sourceComponent.desconectarSaida(targetComponent);
            this.validateComponents(sourceComponent, targetComponent);
        }

        this.engine.removeConnection(connection);
        if (this.engine.selectedConnection === connection) {
            this.engine.selectComponent(null);
        }

        this.engine.notify(EngineEventPayloads.panelUpdate(0));
        return connection;
    }
}
