import { ConnectionModel } from '../../domain/models/ConnectionModel.js';
import {
    DEFAULT_PIPE_DIAMETER_M,
    DEFAULT_PIPE_EXTRA_LENGTH_M,
    DEFAULT_PIPE_MINOR_LOSS,
    DEFAULT_PIPE_ROUGHNESS_MM
} from '../../utils/Units.js';
import { EngineEventPayloads } from '../events/EventPayloads.js';

function validateLevelControl(...components) {
    components.forEach((component) => {
        if (typeof component?.garantirConsistenciaControleNivel === 'function') {
            component.garantirConsistenciaControleNivel();
        }
    });
}

function normalizeConnectionInput(sourceComponentOrPayload, sourceEndpoint, targetComponent, targetEndpoint) {
    if (sourceComponentOrPayload && typeof sourceComponentOrPayload === 'object' && 'sourceComponent' in sourceComponentOrPayload) {
        return sourceComponentOrPayload;
    }

    return {
        sourceComponent: sourceComponentOrPayload,
        sourceEndpoint,
        targetComponent,
        targetEndpoint
    };
}

function hasExpectedPortType(endpoint, expectedPortType) {
    return endpoint && endpoint.portType === expectedPortType;
}

export class ConnectionService {
    constructor(engine, options = {}) {
        this.engine = engine;
        this.validateComponents = options.validateComponents || validateLevelControl;
    }

    buildConnection(sourceComponentOrPayload, sourceEndpoint, targetComponent, targetEndpoint) {
        const payload = normalizeConnectionInput(
            sourceComponentOrPayload,
            sourceEndpoint,
            targetComponent,
            targetEndpoint
        );

        return new ConnectionModel({
            sourceId: payload.sourceComponent.id,
            targetId: payload.targetComponent.id,
            sourceEndpoint: payload.sourceEndpoint,
            targetEndpoint: payload.targetEndpoint,
            diameterM: DEFAULT_PIPE_DIAMETER_M,
            roughnessMm: DEFAULT_PIPE_ROUGHNESS_MM,
            extraLengthM: DEFAULT_PIPE_EXTRA_LENGTH_M,
            perdaLocalK: DEFAULT_PIPE_MINOR_LOSS
        });
    }

    connect(sourceComponentOrPayload, sourceEndpoint, targetComponent, targetEndpoint) {
        const payload = normalizeConnectionInput(
            sourceComponentOrPayload,
            sourceEndpoint,
            targetComponent,
            targetEndpoint
        );
        const { sourceComponent, targetComponent: destinationComponent, sourceEndpoint: outputEndpoint, targetEndpoint: inputEndpoint } = payload;

        if (!sourceComponent || !destinationComponent || sourceComponent === destinationComponent) {
            return null;
        }

        if (!hasExpectedPortType(outputEndpoint, 'out') || !hasExpectedPortType(inputEndpoint, 'in')) {
            return null;
        }

        sourceComponent.conectarSaida(destinationComponent);
        this.validateComponents(sourceComponent, destinationComponent);

        const connection = this.buildConnection(payload);
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
            if (typeof this.engine.selectConnection === 'function') {
                this.engine.selectConnection(null);
            } else if (typeof this.engine.selectComponent === 'function') {
                this.engine.selectComponent(null);
            }
        }

        this.engine.notify(EngineEventPayloads.panelUpdate(0));
        return connection;
    }
}
