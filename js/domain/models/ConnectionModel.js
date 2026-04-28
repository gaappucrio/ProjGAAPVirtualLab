import {
    DEFAULT_PIPE_DIAMETER_M,
    DEFAULT_PIPE_EXTRA_LENGTH_M,
    DEFAULT_PIPE_MINOR_LOSS,
    DEFAULT_PIPE_ROUGHNESS_MM,
    areaFromDiameter
} from '../../utils/Units.js';

let nextConnectionSequence = 1;

function nextConnectionId() {
    const id = `conn-${String(nextConnectionSequence).padStart(4, '0')}`;
    nextConnectionSequence += 1;
    return id;
}

function normalizeEndpoint(endpoint, fallbackType) {
    const normalized = endpoint || {};
    return {
        portType: normalized.portType || fallbackType,
        offsetX: Number(normalized.offsetX) || 0,
        offsetY: Number(normalized.offsetY) || 0,
        floorOffsetY: Number(normalized.floorOffsetY) || 0,
        dynamicHeight: normalized.dynamicHeight || null
    };
}

export class ConnectionModel {
    constructor({
        id = nextConnectionId(),
        sourceId,
        targetId,
        sourceEndpoint,
        targetEndpoint,
        diameterM = DEFAULT_PIPE_DIAMETER_M,
        roughnessMm = DEFAULT_PIPE_ROUGHNESS_MM,
        extraLengthM = DEFAULT_PIPE_EXTRA_LENGTH_M,
        perdaLocalK = DEFAULT_PIPE_MINOR_LOSS,
        transientFlowLps = 0,
        lastResolvedFlowLps = 0
    }) {
        this.id = id;
        this.sourceId = sourceId;
        this.targetId = targetId;
        this.sourceEndpoint = normalizeEndpoint(sourceEndpoint, 'out');
        this.targetEndpoint = normalizeEndpoint(targetEndpoint, 'in');
        this.diameterM = Number(diameterM) || DEFAULT_PIPE_DIAMETER_M;
        this.roughnessMm = Number(roughnessMm) || DEFAULT_PIPE_ROUGHNESS_MM;
        this.extraLengthM = Number(extraLengthM) || DEFAULT_PIPE_EXTRA_LENGTH_M;
        this.perdaLocalK = Number(perdaLocalK) || DEFAULT_PIPE_MINOR_LOSS;
        this.transientFlowLps = Number(transientFlowLps) || 0;
        this.lastResolvedFlowLps = Number(lastResolvedFlowLps) || 0;
        this.areaM2 = areaFromDiameter(this.diameterM);
    }

    refreshDerivedState() {
        this.areaM2 = areaFromDiameter(this.diameterM);
        return this;
    }
}

