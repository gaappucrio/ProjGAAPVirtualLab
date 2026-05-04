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
    areaFromDiameter,
    lpsToM3s
} from '../../utils/Units.js';
import { clamp } from '../components/BaseComponente.js';
import { calculateConnectionGeometry } from './PortPositionCalculator.js';

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
    const velocity = lpsToM3s(flowLps) / areaM2;
    return (density * velocity * diameterM) / Math.max(0.00001, viscosityPaS);
}

/**
 * Fator de friccao de Darcy usando correlacao de Swamee-Jain, com
 * interpolacao suave na faixa de transicao.
 */
export function darcyFrictionFactor(reynolds, relativeRoughness) {
    if (!Number.isFinite(reynolds) || reynolds <= 0) return DEFAULT_PIPE_FRICTION;
    if (reynolds < 2300) return clamp(64 / reynolds, 0.008, 0.15);

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
    if (typeof conn.diameterM !== 'number') conn.diameterM = DEFAULT_PIPE_DIAMETER_M;
    if (typeof conn.roughnessMm !== 'number') conn.roughnessMm = DEFAULT_PIPE_ROUGHNESS_MM;
    if (typeof conn.extraLengthM !== 'number') conn.extraLengthM = DEFAULT_PIPE_EXTRA_LENGTH_M;
    if (typeof conn.perdaLocalK !== 'number') conn.perdaLocalK = DEFAULT_PIPE_MINOR_LOSS;
    if (typeof conn.transientFlowLps !== 'number') conn.transientFlowLps = 0;
    if (typeof conn.lastResolvedFlowLps !== 'number') conn.lastResolvedFlowLps = 0;

    conn.areaM2 = areaFromDiameter(conn.diameterM);
    return conn;
}
