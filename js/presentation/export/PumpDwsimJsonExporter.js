import { BombaLogica } from '../../domain/components/BombaLogica.js';
import { BAR_TO_PA, GRAVITY, lpsToM3s } from '../../domain/units/HydraulicUnits.js';

const PUMP_CURVE_POINT_COUNT = 32;
const FALLBACK_FLUID_DENSITY_KG_M3 = 1000;
const DEFAULT_IMPELLER_DIAMETER_MM = 200;
const DEFAULT_IMPELLER_SPEED_RPM = 1450;

function numberOrZero(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
}

function round(value, digits = 8) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 0;
    const factor = 10 ** digits;
    return Math.round(numericValue * factor) / factor;
}

function pressureBarToHeadM(pressureBar, densityKgM3) {
    const safeDensity = Math.max(1, numberOrZero(densityKgM3) || FALLBACK_FLUID_DENSITY_KG_M3);
    return (numberOrZero(pressureBar) * BAR_TO_PA) / (safeDensity * GRAVITY);
}

function pressureRiseToPowerKw(pressureBar, flowLps, efficiencyFraction) {
    const flowM3s = lpsToM3s(Math.max(0, numberOrZero(flowLps)));
    const pressurePa = Math.max(0, numberOrZero(pressureBar) * BAR_TO_PA);
    const safeEfficiency = Math.max(0.01, numberOrZero(efficiencyFraction));
    return (pressurePa * flowM3s) / safeEfficiency / 1000;
}

function resolvePumpFluid(engine, pump) {
    return engine?.hydraulicContext?.getComponentFluid?.(pump)
        || engine?.fluidoOperante
        || null;
}

function buildNominalCurve(pump, densityKgM3) {
    const qMax = Math.max(1, numberOrZero(pump.vazaoNominal));
    const points = [];

    for (let index = 0; index <= PUMP_CURVE_POINT_COUNT; index += 1) {
        const flowLps = (qMax * index) / PUMP_CURVE_POINT_COUNT;
        const pressureRiseBar = pump.getCurvaPressaoBar(flowLps, 1);
        const efficiencyFraction = pump.getCurvaEficiencia(flowLps, 1);
        points.push({
            flow_m3_s: round(lpsToM3s(flowLps), 9),
            head_m: round(pressureBarToHeadM(pressureRiseBar, densityKgM3), 6),
            power_kW: round(pressureRiseToPowerKw(pressureRiseBar, flowLps, efficiencyFraction), 6),
            efficiency_percent: round(efficiencyFraction * 100, 4),
            npshr_m: round(pump.getCurvaNpshRequeridoM(flowLps, 1), 6)
        });
    }

    return points;
}

function createDwsimCurve({ points, yKey, enabled, name, id, yunit, xunit = 'm3/s' }) {
    return {
        X: points.map((point) => point.flow_m3_s),
        Y: points.map((point) => point[yKey]),
        Enabled: enabled,
        Name: name,
        ID: id,
        CvType: 0,
        yunit,
        xunit
    };
}

function buildSafeFilenamePart(value) {
    return String(value || 'bomba')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
        || 'bomba';
}

function buildPumpJsonFilename(pump) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `gaap-dwsim-pump-${buildSafeFilenamePart(pump?.tag || pump?.id)}-${stamp}.json`;
}

export function buildPumpDwsimJsonData(engine, pump) {
    if (!(pump instanceof BombaLogica)) return null;

    const fluid = resolvePumpFluid(engine, pump);
    const densityKgM3 = numberOrZero(fluid?.densidade) || FALLBACK_FLUID_DENSITY_KG_M3;
    const points = buildNominalCurve(pump, densityKgM3);
    const pumpName = pump.tag || pump.id || 'GAAP Pump';
    const curveSetId = pump.id || pumpName;

    return {
        Name: pumpName,
        Description: `Curvas exportadas do GAAP Virtual Lab para ${pumpName}. Base de fluido: ${fluid?.nome || 'nao informado'}.`,
        ImpellerDiameter: DEFAULT_IMPELLER_DIAMETER_MM,
        ImpellerSpeed: DEFAULT_IMPELLER_SPEED_RPM,
        ImpellerDiameterUnit: 'mm',
        CurveHead: createDwsimCurve({
            points,
            yKey: 'head_m',
            enabled: true,
            name: `${pumpName} Head`,
            id: `${curveSetId}-head`,
            yunit: 'm'
        }),
        CurvePower: createDwsimCurve({
            points,
            yKey: 'power_kW',
            enabled: true,
            name: `${pumpName} Power`,
            id: `${curveSetId}-power`,
            yunit: 'kW'
        }),
        CurveEfficiency: createDwsimCurve({
            points,
            yKey: 'efficiency_percent',
            enabled: true,
            name: `${pumpName} Efficiency`,
            id: `${curveSetId}-efficiency`,
            yunit: '%'
        }),
        CurveNPSHr: createDwsimCurve({
            points,
            yKey: 'npshr_m',
            enabled: true,
            name: `${pumpName} NPSHr`,
            id: `${curveSetId}-npshr`,
            yunit: 'm'
        })
    };
}

export function exportPumpDwsimJson(engine, pump) {
    if (!(pump instanceof BombaLogica) || typeof document === 'undefined') return false;

    const data = buildPumpDwsimJsonData(engine, pump);
    if (!data) return false;

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = buildPumpJsonFilename(pump);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return true;
}
