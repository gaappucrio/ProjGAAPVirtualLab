import { EPSILON_FLOW } from '../units/HydraulicUnits.js';

export function calculateResidenceTimeS(volumeL, flowLps) {
    const safeVolumeL = Number(volumeL);
    const safeFlowLps = Math.abs(Number(flowLps));

    if (!Number.isFinite(safeVolumeL) || safeVolumeL <= 0) return null;
    if (!Number.isFinite(safeFlowLps) || safeFlowLps <= EPSILON_FLOW) return null;

    return safeVolumeL / safeFlowLps;
}

export function calculateConnectionResidenceTimeS(connection, geometry = {}, flowLps = 0) {
    const areaM2 = Number(connection?.areaM2);
    const lengthM = Number(geometry?.lengthM ?? geometry?.straightLengthM);

    if (!Number.isFinite(areaM2) || areaM2 <= 0) return null;
    if (!Number.isFinite(lengthM) || lengthM <= 0) return null;

    const volumeL = areaM2 * lengthM * 1000;
    return calculateResidenceTimeS(volumeL, flowLps);
}

export function getTankResidenceFlowBasis(tank) {
    const outflowLps = Math.abs(Number(tank?.lastQout));
    if (Number.isFinite(outflowLps) && outflowLps > EPSILON_FLOW) {
        return { flowLps: outflowLps, basis: 'outlet' };
    }

    const inflowLps = Math.abs(Number(tank?.lastQin));
    if (Number.isFinite(inflowLps) && inflowLps > EPSILON_FLOW) {
        return { flowLps: inflowLps, basis: 'inlet' };
    }

    return { flowLps: 0, basis: 'none' };
}

export function calculateTankResidenceTimeS(tank) {
    const { flowLps, basis } = getTankResidenceFlowBasis(tank);
    return {
        timeS: calculateResidenceTimeS(tank?.volumeAtual, flowLps),
        flowLps,
        basis
    };
}
