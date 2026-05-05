import { calculatePortPosition } from '../../domain/services/PortPositionCalculator.js';
import { getConnectionGeometryFromPoints } from '../../domain/services/PipeHydraulics.js';

const defaultVisualPosition = (component) => ({
    x: typeof component?.x === 'number' ? component.x : 0,
    y: typeof component?.y === 'number' ? component.y : 0
});

function endpointToPortOptions(endpoint = {}) {
    return {
        offsetX: endpoint.offsetX,
        offsetY: endpoint.offsetY,
        floorOffsetY: endpoint.floorOffsetY || 0
    };
}

export class ConnectionGeometryService {
    constructor({
        topology,
        getUsarAlturaRelativa,
        getComponentVisualPosition = defaultVisualPosition
    }) {
        this.topology = topology;
        this.getUsarAlturaRelativa = getUsarAlturaRelativa;
        this.getComponentVisualPosition = getComponentVisualPosition;
    }

    setComponentVisualPositionResolver(resolver) {
        this.getComponentVisualPosition = typeof resolver === 'function'
            ? resolver
            : defaultVisualPosition;
    }

    getConnectionGeometry(connection) {
        const sourceComponent = this.topology.getComponentById(connection.sourceId);
        const targetComponent = this.topology.getComponentById(connection.targetId);

        if (!sourceComponent || !targetComponent) {
            return {
                straightLengthM: 1.0,
                lengthM: 1.0 + (connection.extraLengthM || 0),
                headGainM: 0
            };
        }

        const usarAlturaRelativa = this.getUsarAlturaRelativa() === true;
        const sourcePoint = calculatePortPosition(
            sourceComponent,
            connection.sourceEndpoint.portType,
            endpointToPortOptions(connection.sourceEndpoint),
            this.getComponentVisualPosition(sourceComponent),
            usarAlturaRelativa
        );
        const targetPoint = calculatePortPosition(
            targetComponent,
            connection.targetEndpoint.portType,
            endpointToPortOptions(connection.targetEndpoint),
            this.getComponentVisualPosition(targetComponent),
            usarAlturaRelativa
        );

        return getConnectionGeometryFromPoints(sourcePoint, targetPoint, connection, usarAlturaRelativa);
    }
}
