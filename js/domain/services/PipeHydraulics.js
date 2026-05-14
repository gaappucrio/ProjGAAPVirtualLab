// =======================================
// DOMAIN: Cálculos Hidráulicos de Tubulação
// Arquivo: js/domain/services/PipeHydraulics.js
// =======================================

import {
    DEFAULT_FLUID_VISCOSITY_PA_S,
    DEFAULT_PIPE_DIAMETER_M,
    DEFAULT_PIPE_EXTRA_LENGTH_M,
    DEFAULT_PIPE_FRICTION,
    DEFAULT_PIPE_MINOR_LOSS,
    DEFAULT_PIPE_ROUGHNESS_MM,
    DEFAULT_DESIGN_VELOCITY_MPS,
    areaFromDiameter,
    lpsToM3s
} from '../units/HydraulicUnits.js';
import { clamp } from '../components/BaseComponente.js';
import { calculateConnectionGeometry } from './PortPositionCalculator.js';

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

/**
 * Calcula o diâmetro interno sugerido a partir da vazão em m³/s e da
 * velocidade média desejada. É a forma direta de d = sqrt(4Q / (pi v)).
 */
export function diameterFromM3sVelocity(flowM3s, velocityMps) {
    if (flowM3s <= 0 || velocityMps <= 0) return 0;
    return Math.sqrt((4 * flowM3s) / (Math.PI * velocityMps));
}

/**
 * Versão compatível com a base interna do simulador, onde vazão é L/s.
 */
export function diameterFromFlowVelocity(flowLps, velocityMps = DEFAULT_DESIGN_VELOCITY_MPS) {
    return diameterFromM3sVelocity(lpsToM3s(flowLps), velocityMps);
}

export function getCurrentDesignFlowCandidateLps(conn, state = {}) {
    return Math.max(
        0,
        state.targetFlowLps || 0,
        state.flowLps || 0,
        conn?.lastResolvedFlowLps || 0
    );
}

export function ensureConnectionDesignFlowLps(conn, state = {}) {
    if (!conn) return 0;

    const currentCandidateLps = getCurrentDesignFlowCandidateLps(conn, state);
    if (!Number.isFinite(conn.designFlowLps) || conn.designFlowLps <= 0) {
        conn.designFlowLps = currentCandidateLps;
    }

    return Math.max(0, conn.designFlowLps || 0);
}

export function getSuggestedDiameterForConnection(conn, state = {}) {
    const designVelocityMps = positiveNumber(conn?.designVelocityMps, DEFAULT_DESIGN_VELOCITY_MPS);
    return diameterFromFlowVelocity(ensureConnectionDesignFlowLps(conn, state), designVelocityMps);
}

/**
 * Classifica o regime de escoamento pelo número de Reynolds.
 */
export function classifyFlowRegime(reynolds) {
    if (reynolds <= 0) return 'sem fluxo';
    if (reynolds < 2300) return 'laminar';
    if (reynolds < 4000) return 'transição';
    return 'turbulento';
}

/**
 * Calcula o número de Reynolds para um escoamento.
 */
export function reynoldsFromFlow(flowLps, diameterM, areaM2, density, viscosityPaS) {
    if (flowLps <= 0 || diameterM <= 0 || areaM2 <= 0) return 0;
    const safeDensity = positiveNumber(density, 0);
    if (safeDensity <= 0) return 0;
    const velocity = lpsToM3s(flowLps) / areaM2;
    return (safeDensity * velocity * diameterM) / positiveNumber(viscosityPaS, DEFAULT_FLUID_VISCOSITY_PA_S);
}

/**
 * Fator de friccao de Darcy usando correlacao de Swamee-Jain, com
 * interpolacao suave na faixa de transicao.
 */
export function darcyFrictionFactor(reynolds, relativeRoughness) {
    if (!Number.isFinite(reynolds) || reynolds <= 0) return DEFAULT_PIPE_FRICTION;
    if (reynolds < 2300) return 64 / reynolds;

    const turbulent = 0.25 / Math.pow(
        Math.log10((relativeRoughness / 3.7) + (5.74 / Math.pow(reynolds, 0.9))),
        2
    );

    if (reynolds < 4000) {
        const laminar = 64 / reynolds;
        const blend = (reynolds - 2300) / (4000 - 2300);
        const lerp = (start, end, t) => start + ((end - start) * t);
        return clamp(lerp(laminar, turbulent, blend), 0.008, 0.15);
    }

    return clamp(turbulent, 0.008, 0.15);
}

/**
 * Calcula a geometria da conexão usando pontos lógicos pré-calculados.
 */
export function getConnectionGeometryFromPoints(sourcePoint, targetPoint, conn, usarAlturaRelativa) {
    return calculateConnectionGeometry(sourcePoint, targetPoint, conn, usarAlturaRelativa);
}

/**
 * Obtém propriedades hidráulicas da tubulação para uma vazão.
 */
export function getPipeHydraulics(conn, geometry, areaM2, flowLps, density, viscosityPaS) {
    const reynolds = reynoldsFromFlow(flowLps, conn.diameterM, areaM2, density, viscosityPaS);
    const relativeRoughness = conn.diameterM > 0
        ? (Math.max(0, conn.roughnessMm || 0) / 1000) / conn.diameterM
        : 0;
    const frictionFactor = darcyFrictionFactor(reynolds, relativeRoughness);
    const velocityMps = areaM2 > 0 ? lpsToM3s(flowLps) / areaM2 : 0;

    return {
        velocityMps,
        reynolds,
        relativeRoughness,
        frictionFactor,
        regime: classifyFlowRegime(reynolds),
        distributedLossCoeff: frictionFactor * (geometry.lengthM / Math.max(conn.diameterM, 0.001))
    };
}

/**
 * Calcula o tempo de resposta hidráulica da conexão.
 */
export function getConnectionResponseTimeS(conn, geometry, fluidoOperante) {
    ensureConnectionProperties(conn);
    const lineVolumeL = geometry.lengthM * conn.areaM2 * 1000;
    const densityFactor = clamp(fluidoOperante.densidade / 997, 0.55, 1.8);
    const viscosityFactor = clamp(fluidoOperante.viscosidadeDinamicaPaS / DEFAULT_FLUID_VISCOSITY_PA_S, 0.5, 8);
    const baseTimeS = 0.08 + (geometry.lengthM * 0.035) + (lineVolumeL * 0.018 * densityFactor);
    return clamp(baseTimeS * Math.pow(viscosityFactor, 0.12), 0.05, 2.8);
}

/**
 * Garante que a conexão tenha parâmetros hidráulicos padrão.
 */
export function ensureConnectionProperties(conn) {
    conn.diameterM = positiveNumber(conn.diameterM, DEFAULT_PIPE_DIAMETER_M);
    conn.roughnessMm = nonNegativeNumber(conn.roughnessMm, DEFAULT_PIPE_ROUGHNESS_MM);
    conn.extraLengthM = nonNegativeNumber(conn.extraLengthM, DEFAULT_PIPE_EXTRA_LENGTH_M);
    conn.perdaLocalK = nonNegativeNumber(conn.perdaLocalK, DEFAULT_PIPE_MINOR_LOSS);
    conn.designVelocityMps = positiveNumber(conn.designVelocityMps, DEFAULT_DESIGN_VELOCITY_MPS);
    conn.designFlowLps = nonNegativeNumber(conn.designFlowLps, 0);
    conn.transientFlowLps = nonNegativeNumber(conn.transientFlowLps, 0);
    conn.lastResolvedFlowLps = nonNegativeNumber(conn.lastResolvedFlowLps, 0);

    conn.areaM2 = areaFromDiameter(conn.diameterM);
    return conn;
}
