// =======================================
// UTILIDADE: Cálculos Hidráulicos de Tubulação
// Arquivo: js/utils/PipeHydraulics.js
// =======================================

import {
    DEFAULT_PIPE_FRICTION,
    DEFAULT_PIPE_ROUGHNESS_MM,
    DEFAULT_PIPE_DIAMETER_M,
    DEFAULT_PIPE_EXTRA_LENGTH_M,
    DEFAULT_PIPE_MINOR_LOSS,
    DEFAULT_FLUID_VISCOSITY_PA_S,
    lpsToM3s,
    areaFromDiameter
} from './Units.js';
import { clamp } from '../componentes/BaseComponente.js';
import { calculateConnectionGeometry } from '../domain/services/PortPositionCalculator.js';

const PIXELS_PER_METER = 80;

/**
 * Classificação do regime de escoamento baseado em Reynolds
 */
export function classifyFlowRegime(reynolds) {
    if (reynolds <= 0) return 'sem fluxo';
    if (reynolds < 2300) return 'laminar';
    if (reynolds < 4000) return 'transição';
    return 'turbulento';
}

/**
 * Calcula número de Reynolds para um escoamento
 */
export function reynoldsFromFlow(flowLps, diameterM, areaM2, density, viscosityPaS) {
    if (flowLps <= 0 || diameterM <= 0 || areaM2 <= 0) return 0;
    const velocity = lpsToM3s(flowLps) / areaM2;
    return (density * velocity * diameterM) / Math.max(0.00001, viscosityPaS);
}

/**
 * Fator de fricção de Darcy usando correlação de Colebrook-White
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
 * Calcula geometria da conexão (comprimento equivalente, ganho de carga)
 */
export function getConnectionGeometry(conn, sourceEl, targetEl, usarAlturaRelativa) {
    const getLogicalPortPosition = (portEl) => {
        if (!portEl) return { x: 0, y: 0 };
        const parentComponent = portEl.closest('.placed-component');
        const svgEl = portEl.ownerSVGElement;
        const compX = parentComponent ? parseFloat(parentComponent.style.left || '0') : 0;
        const compY = parentComponent ? parseFloat(parentComponent.style.top || '0') : 0;
        const svgX = svgEl ? parseFloat(svgEl.style.left || '0') : 0;
        const svgY = svgEl ? parseFloat(svgEl.style.top || '0') : 0;
        const localX = parseFloat(portEl.getAttribute('cx') || '0');
        const localY = parseFloat(portEl.getAttribute('cy') || '0');

        // Coordenada Y visual padrão
        let logicalY = compY + svgY + localY;

        // --- NOVA LÓGICA DE ALTURA REAL PARA O TANQUE ---
        // Acessamos a lógica do componente diretamente do elemento DOM
        const logicComp = parentComponent ? parentComponent.logica : null;

        // Verificamos se é um Tanque através da existência da propriedade 'alturaUtilMetros'
        if (logicComp && typeof logicComp.alturaUtilMetros !== 'undefined') {
            const tipoPorta = portEl.dataset.type; // 'in' ou 'out'

            // Definimos o "chão" geométrico como a base do SVG do tanque (cy = 240)
            const chaoGeometricoY = compY + svgY + 240;

            // Subimos a partir do chão calculando (Altura Lógica * 80 pixels)
            if (tipoPorta === 'out') {
                logicalY = chaoGeometricoY - (logicComp.alturaBocalSaidaM * 80);
            } else if (tipoPorta === 'in') {
                logicalY = chaoGeometricoY - (logicComp.alturaBocalEntradaM * 80);
            }
        }

        return { x: compX + svgX + localX, y: logicalY };
    };

    const p1 = getLogicalPortPosition(sourceEl);
    const p2 = getLogicalPortPosition(targetEl);
    
    return calculateConnectionGeometry(p1, p2, conn, usarAlturaRelativa);
}

/**
 * Calcula geometria da conexão usando pontos pré-calculados (versão pura)
 * Esta é a versão que não depende de DOM.
 * 
 * @param {Object} sourcePoint - {x, y} posição do porto de saída
 * @param {Object} targetPoint - {x, y} posição do porto de entrada
 * @param {Object} conn - ConnectionModel
 * @param {boolean} usarAlturaRelativa - Se deve usar altura visual
 * @returns {Object} { straightLengthM, lengthM, headGainM }
 */
export function getConnectionGeometryFromPoints(sourcePoint, targetPoint, conn, usarAlturaRelativa) {
    return calculateConnectionGeometry(sourcePoint, targetPoint, conn, usarAlturaRelativa);
}

/**
 * Obtém propriedades hidráulicas da tubulação
 */
export function getPipeHydraulics(conn, geometry, areaM2, flowLps, density, viscosityPaS) {
    const reynolds = reynoldsFromFlow(flowLps, conn.diameterM, areaM2, density, viscosityPaS);
    const relativeRoughness = conn.diameterM > 0 ? (Math.max(0, conn.roughnessMm || 0) / 1000) / conn.diameterM : 0;
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
 * Calcula tempo de resposta da conexão
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
 * Garante que conexão tem todas as propriedades necessárias
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
