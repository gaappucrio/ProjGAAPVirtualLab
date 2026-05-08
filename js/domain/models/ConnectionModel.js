import {
    DEFAULT_PIPE_DIAMETER_M,
    DEFAULT_PIPE_EXTRA_LENGTH_M,
    DEFAULT_PIPE_MINOR_LOSS,
    DEFAULT_PIPE_ROUGHNESS_MM,
    DEFAULT_DESIGN_VELOCITY_MPS,
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

function finiteNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
}

function positiveNumber(value, fallback) {
    const numericValue = finiteNumber(value);
    return numericValue !== null && numericValue > 0 ? numericValue : fallback;
}

function nonNegativeNumber(value, fallback) {
    const numericValue = finiteNumber(value);
    return numericValue !== null && numericValue >= 0 ? numericValue : fallback;
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
        designVelocityMps = DEFAULT_DESIGN_VELOCITY_MPS,
        designFlowLps = 0,
        transientFlowLps = 0,
        lastResolvedFlowLps = 0
    }) {
        this.id = id;
        this.sourceId = sourceId;
        this.targetId = targetId;
        this.sourceEndpoint = normalizeEndpoint(sourceEndpoint, 'out');
        this.targetEndpoint = normalizeEndpoint(targetEndpoint, 'in');
        this.diameterM = positiveNumber(diameterM, DEFAULT_PIPE_DIAMETER_M);
        this.roughnessMm = nonNegativeNumber(roughnessMm, DEFAULT_PIPE_ROUGHNESS_MM);
        this.extraLengthM = nonNegativeNumber(extraLengthM, DEFAULT_PIPE_EXTRA_LENGTH_M);
        this.perdaLocalK = nonNegativeNumber(perdaLocalK, DEFAULT_PIPE_MINOR_LOSS);
        this.designVelocityMps = positiveNumber(designVelocityMps, DEFAULT_DESIGN_VELOCITY_MPS);
        this.designFlowLps = nonNegativeNumber(designFlowLps, 0);
        this.transientFlowLps = nonNegativeNumber(transientFlowLps, 0);
        this.lastResolvedFlowLps = nonNegativeNumber(lastResolvedFlowLps, 0);
        this.areaM2 = areaFromDiameter(this.diameterM);
    }

    refreshDerivedState() {
        this.areaM2 = areaFromDiameter(this.diameterM);
        return this;
    }
}
