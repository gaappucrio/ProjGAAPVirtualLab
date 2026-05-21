import { ConnectionService } from '../../application/services/ConnectionService.js';
import { createConnectionEndpointDefinition } from './ConnectionVisualRegistry.js';

export class ConnectionServiceRuntimeAdapter {
    constructor(engine, service = new ConnectionService(engine)) {
        this.engine = engine;
        this.service = service;
    }

    buildConnection(sourceComponent, sourcePortEl, targetComponent, targetPortEl) {
        return this.service.buildConnection({
            sourceComponent,
            targetComponent,
            sourceEndpoint: createConnectionEndpointDefinition(sourceComponent, sourcePortEl),
            targetEndpoint: createConnectionEndpointDefinition(targetComponent, targetPortEl)
        });
    }

    connect(sourceComponent, sourcePortEl, targetComponent, targetPortEl) {
        return this.service.connect({
            sourceComponent,
            targetComponent,
            sourceEndpoint: createConnectionEndpointDefinition(sourceComponent, sourcePortEl),
            targetEndpoint: createConnectionEndpointDefinition(targetComponent, targetPortEl)
        });
    }

    remove(connection) {
        return this.service.remove(connection);
    }
}

export function createConnectionServiceRuntime(engine) {
    return new ConnectionServiceRuntimeAdapter(engine);
}
