import {
    DEFAULT_ATMOSPHERIC_PRESSURE_BAR,
    DEFAULT_FLUID_SPECIFIC_HEAT_JKGK,
    DEFAULT_FLUID_VAPOR_PRESSURE_BAR,
    DEFAULT_FLUID_VISCOSITY_PA_S
} from '../units/HydraulicUnits.js';

const DEFAULT_FLUID_NAME = '\u00c1gua';
const DEFAULT_FLUID_DENSITY = 997.0;
const DEFAULT_FLUID_TEMPERATURE = 25.0;
const DEFAULT_FLUID_VISUAL_COLOR = '#3498db';

function positiveNumber(value, fallback, minimum = Number.EPSILON) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.max(minimum, numericValue);
}

function isMixture(fluido) {
    if (!fluido || !fluido.composicao) return false;
    return Object.keys(fluido.composicao).length > 1;
}

function getComponentRefState(name, fluido) {
    const normName = name.toLowerCase();
    let isPure = false;
    let preset = { temp: 25, density: 997, vaporPressure: 0.0317, viscosity: 0.00089 };

    if (normName.includes('água') || normName.includes('agua')) {
        isPure = fluido && (fluido.nome || '').toLowerCase().includes('água') && !isMixture(fluido);
        preset = { temp: 25, density: 997, vaporPressure: 0.0317, viscosity: 0.00089 };
    } else if (normName.includes('óleo') || normName.includes('oleo') || normName.includes('oil')) {
        isPure = fluido && ((fluido.nome || '').toLowerCase().includes('óleo') || (fluido.nome || '').toLowerCase().includes('oil')) && !isMixture(fluido);
        preset = { temp: 25, density: 860, vaporPressure: 0.003, viscosity: 0.035 };
    } else if (normName.includes('glicol') || normName.includes('glycol')) {
        isPure = fluido && ((fluido.nome || '').toLowerCase().includes('glicol') || (fluido.nome || '').toLowerCase().includes('glycol')) && !isMixture(fluido);
        preset = { temp: 25, density: 1045, vaporPressure: 0.02, viscosity: 0.0035 };
    } else {
        return {
            temp: fluido && fluido.refTemperatura !== undefined ? fluido.refTemperatura : DEFAULT_FLUID_TEMPERATURE,
            density: fluido && fluido.refDensidade !== undefined ? fluido.refDensidade : DEFAULT_FLUID_DENSITY,
            vaporPressure: fluido && fluido.refPressaoVaporBar !== undefined ? fluido.refPressaoVaporBar : DEFAULT_FLUID_VAPOR_PRESSURE_BAR,
            viscosity: fluido && fluido.refViscosidadeDinamicaPaS !== undefined ? fluido.refViscosidadeDinamicaPaS : DEFAULT_FLUID_VISCOSITY_PA_S
        };
    }

    return {
        temp: isPure && fluido.refTemperatura !== undefined ? fluido.refTemperatura : preset.temp,
        density: isPure && fluido.refDensidade !== undefined ? fluido.refDensidade : preset.density,
        vaporPressure: isPure && fluido.refPressaoVaporBar !== undefined ? fluido.refPressaoVaporBar : preset.vaporPressure,
        viscosity: isPure && fluido.refViscosidadeDinamicaPaS !== undefined ? fluido.refViscosidadeDinamicaPaS : preset.viscosity
    };
}

function getWaterDensityFactor(T) {
    const term1 = Math.pow(T - 3.98, 2) * (T + 286.9);
    const term2 = 508929.2 * (T + 68.12);
    return 1 - (term1 / term2);
}

function calculateDensityAtTemp(fluido, T) {
    const composition = fluido.composicao || { [fluido.nome || DEFAULT_FLUID_NAME]: 1 };
    let densitySum = 0;
    let totalFraction = 0;

    Object.entries(composition).forEach(([name, fraction]) => {
        totalFraction += fraction;
        const ref = getComponentRefState(name, fluido);
        const refDensity = ref.density;
        const refT = ref.temp;
        const normName = name.toLowerCase();

        let compDensity = refDensity;
        if (normName.includes('água') || normName.includes('agua')) {
            const factorRef = getWaterDensityFactor(refT);
            const factorT = getWaterDensityFactor(T);
            compDensity = refDensity * (factorT / Math.max(0.1, factorRef));
        } else if (normName.includes('óleo') || normName.includes('oleo') || normName.includes('oil')) {
            compDensity = refDensity * (1 - 0.00086 * (T - refT));
        } else if (normName.includes('glicol') || normName.includes('glycol')) {
            compDensity = refDensity * (1 - 0.00045 * (T - refT));
        } else {
            compDensity = refDensity * (1 - 0.0005 * (T - refT));
        }
        densitySum += fraction * Math.max(1.0, compDensity);
    });

    return totalFraction > 0 ? (densitySum / totalFraction) : DEFAULT_FLUID_DENSITY;
}

function calculateViscosityAtTemp(fluido, T) {
    const composition = fluido.composicao || { [fluido.nome || DEFAULT_FLUID_NAME]: 1 };
    let logViscSum = 0;
    let totalFraction = 0;

    const Tk = T + 273.15;

    Object.entries(composition).forEach(([name, fraction]) => {
        totalFraction += fraction;
        const ref = getComponentRefState(name, fluido);
        const refVisc = ref.viscosity;
        const refT = ref.temp;
        const refTk = refT + 273.15;
        const normName = name.toLowerCase();

        let compVisc = refVisc;
        if (normName.includes('água') || normName.includes('agua')) {
            const expRef = 247.8 / Math.max(10, refTk - 140);
            const expT = 247.8 / Math.max(10, Tk - 140);
            compVisc = refVisc * Math.pow(10, expT - expRef);
        } else if (normName.includes('óleo') || normName.includes('oleo') || normName.includes('oil')) {
            compVisc = refVisc * Math.exp(3645.4 * ((1 / Tk) - (1 / refTk)));
        } else if (normName.includes('glicol') || normName.includes('glycol')) {
            compVisc = refVisc * Math.exp(2190 * ((1 / Tk) - (1 / refTk)));
        } else {
            compVisc = refVisc * Math.exp(2500 * ((1 / Tk) - (1 / refTk)));
        }
        logViscSum += fraction * Math.log(Math.max(0.00001, compVisc));
    });

    return totalFraction > 0 ? Math.exp(logViscSum / totalFraction) : DEFAULT_FLUID_VISCOSITY_PA_S;
}

function calculateVaporPressureAtTemp(fluido, T) {
    const composition = fluido.composicao || { [fluido.nome || DEFAULT_FLUID_NAME]: 1 };
    let vaporPressureSum = 0;
    let totalFraction = 0;

    const Tk = T + 273.15;

    Object.entries(composition).forEach(([name, fraction]) => {
        totalFraction += fraction;
        const ref = getComponentRefState(name, fluido);
        const refVap = ref.vaporPressure;
        const refT = ref.temp;
        const refTk = refT + 273.15;
        const normName = name.toLowerCase();

        let compVap = refVap;
        if (normName.includes('água') || normName.includes('agua')) {
            const expRef = 1730.63 / Math.max(10, refT + 233.426);
            const expT = 1730.63 / Math.max(10, T + 233.426);
            compVap = refVap * Math.pow(10, expRef - expT);
        } else if (normName.includes('óleo') || normName.includes('oleo') || normName.includes('oil')) {
            compVap = refVap * Math.pow(10, 2033.7 * ((1 / refTk) - (1 / Tk)));
        } else if (normName.includes('glicol') || normName.includes('glycol')) {
            const expRef = 1730.63 / Math.max(10, refT + 233.426);
            const expT = 1730.63 / Math.max(10, T + 233.426);
            compVap = refVap * Math.pow(10, expRef - expT);
        } else {
            compVap = refVap * Math.exp(-4000 * ((1 / Tk) - (1 / refTk)));
        }
        vaporPressureSum += fraction * Math.max(0.0001, compVap);
    });

    return totalFraction > 0 ? (vaporPressureSum / totalFraction) : DEFAULT_FLUID_VAPOR_PRESSURE_BAR;
}

function getFluidCompositionEntries(fluid) {
    if (!fluid) return [];
    if (fluid.composicao && typeof fluid.composicao === 'object') {
        return Object.entries(fluid.composicao)
            .map(([name, fraction]) => [name, Number(fraction)])
            .filter(([, fraction]) => Number.isFinite(fraction) && fraction > 0);
    }

    return [[fluid.nome || DEFAULT_FLUID_NAME, 1]];
}

function getFluidColorCompositionEntries(fluid) {
    if (!fluid) return [];
    if (fluid.corVisualComposicao && typeof fluid.corVisualComposicao === 'object') {
        return Object.entries(fluid.corVisualComposicao)
            .map(([color, fraction]) => [color, Number(fraction)])
            .filter(([, fraction]) => Number.isFinite(fraction) && fraction > 0);
    }

    return fluid.corVisual ? [[fluid.corVisual, 1]] : [];
}

function normalizeComposition(composition) {
    const entries = Object.entries(composition)
        .map(([name, fraction]) => [name, Number(fraction)])
        .filter(([, fraction]) => Number.isFinite(fraction) && fraction > 0);
    const total = entries.reduce((sum, [, fraction]) => sum + fraction, 0);
    if (total <= 0) return { [DEFAULT_FLUID_NAME]: 1 };

    return Object.fromEntries(entries.map(([name, fraction]) => [name, fraction / total]));
}

class Fluido {
    constructor(
        nome = DEFAULT_FLUID_NAME,
        densidade = DEFAULT_FLUID_DENSITY,
        viscosidadeDinamicaPaS = DEFAULT_FLUID_VISCOSITY_PA_S,
        temperatura = DEFAULT_FLUID_TEMPERATURE
    ) {
        this.nome = nome;
        this.densidade = densidade;
        this.viscosidade = viscosidadeDinamicaPaS;
        this.temperatura = temperatura;
        this.viscosidadeDinamicaPaS = viscosidadeDinamicaPaS;
        this.calorEspecificoJkgK = DEFAULT_FLUID_SPECIFIC_HEAT_JKGK;
        this.pressaoVaporBar = DEFAULT_FLUID_VAPOR_PRESSURE_BAR;
        this.pressaoAtmosfericaBar = DEFAULT_ATMOSPHERIC_PRESSURE_BAR;
        this.corVisual = DEFAULT_FLUID_VISUAL_COLOR;
        this.corVisualComposicao = { [DEFAULT_FLUID_VISUAL_COLOR]: 1 };
    }
}

export function updateFluidoProperties(fluido, dados = {}) {
    if (!fluido) return fluido;

    const previousName = fluido.nome;
    fluido.nome = dados.nome ?? fluido.nome ?? DEFAULT_FLUID_NAME;

    if (fluido.refTemperatura === undefined) {
        fluido.refTemperatura = fluido.temperatura !== undefined ? fluido.temperatura : DEFAULT_FLUID_TEMPERATURE;
        fluido.refDensidade = fluido.densidade !== undefined ? fluido.densidade : DEFAULT_FLUID_DENSITY;
        fluido.refViscosidadeDinamicaPaS = fluido.viscosidadeDinamicaPaS !== undefined ? fluido.viscosidadeDinamicaPaS : DEFAULT_FLUID_VISCOSITY_PA_S;
        fluido.refPressaoVaporBar = fluido.pressaoVaporBar !== undefined ? fluido.pressaoVaporBar : DEFAULT_FLUID_VAPOR_PRESSURE_BAR;
    }

    if (dados.refTemperatura !== undefined) fluido.refTemperatura = dados.refTemperatura;
    if (dados.refDensidade !== undefined) fluido.refDensidade = dados.refDensidade;
    if (dados.refViscosidadeDinamicaPaS !== undefined) fluido.refViscosidadeDinamicaPaS = dados.refViscosidadeDinamicaPaS;
    if (dados.refPressaoVaporBar !== undefined) fluido.refPressaoVaporBar = dados.refPressaoVaporBar;

    const hasExplicitDensity = dados.densidade !== undefined;
    const hasExplicitTemp = dados.temperatura !== undefined;
    const hasExplicitVisc = dados.viscosidadeDinamicaPaS !== undefined;
    const hasExplicitVapor = dados.pressaoVaporBar !== undefined;

    if (hasExplicitDensity || hasExplicitTemp || hasExplicitVisc || hasExplicitVapor) {
        if (hasExplicitDensity && dados.refDensidade === undefined) {
            fluido.refDensidade = positiveNumber(dados.densidade, DEFAULT_FLUID_DENSITY, 1);
        }
        if (hasExplicitVisc && dados.refViscosidadeDinamicaPaS === undefined) {
            fluido.refViscosidadeDinamicaPaS = positiveNumber(dados.viscosidadeDinamicaPaS, DEFAULT_FLUID_VISCOSITY_PA_S, 0.00001);
        }
        if (hasExplicitVapor && dados.refPressaoVaporBar === undefined) {
            fluido.refPressaoVaporBar = positiveNumber(dados.pressaoVaporBar, DEFAULT_FLUID_VAPOR_PRESSURE_BAR, 0.0001);
        }
        if (dados.refTemperatura === undefined) {
            fluido.refTemperatura = hasExplicitTemp ? Number(dados.temperatura) : fluido.temperatura;
        }
    }

    const targetTemp = hasExplicitTemp
        ? Number(dados.temperatura)
        : (fluido.temperatura ?? DEFAULT_FLUID_TEMPERATURE);
    fluido.temperatura = targetTemp;

    if (dados.corVisual !== undefined) {
        fluido.corVisual = dados.corVisual ? String(dados.corVisual) : null;
    }

    const colorCompositionSource = dados.corVisualComposicao
        ?? (dados.corVisual !== undefined && fluido.corVisual ? { [fluido.corVisual]: 1 } : fluido.corVisualComposicao);
    fluido.corVisualComposicao = colorCompositionSource ? normalizeComposition(colorCompositionSource) : null;
    const compositionSource = dados.composicao
        ?? (dados.nome !== undefined && dados.nome !== previousName ? { [fluido.nome]: 1 } : fluido.composicao)
        ?? { [fluido.nome]: 1 };
    fluido.composicao = normalizeComposition(compositionSource);

    if (hasExplicitDensity) {
        fluido.densidade = positiveNumber(dados.densidade, fluido.densidade ?? DEFAULT_FLUID_DENSITY, 1);
    } else {
        fluido.densidade = calculateDensityAtTemp(fluido, targetTemp);
    }

    if (hasExplicitVisc) {
        fluido.viscosidadeDinamicaPaS = positiveNumber(dados.viscosidadeDinamicaPaS, fluido.viscosidadeDinamicaPaS ?? DEFAULT_FLUID_VISCOSITY_PA_S, 0.00001);
    } else {
        fluido.viscosidadeDinamicaPaS = calculateViscosityAtTemp(fluido, targetTemp);
    }
    fluido.viscosidade = fluido.viscosidadeDinamicaPaS;

    fluido.calorEspecificoJkgK = positiveNumber(
        dados.calorEspecificoJkgK,
        fluido.calorEspecificoJkgK ?? DEFAULT_FLUID_SPECIFIC_HEAT_JKGK,
        1
    );

    if (hasExplicitVapor) {
        fluido.pressaoVaporBar = positiveNumber(dados.pressaoVaporBar, fluido.pressaoVaporBar ?? DEFAULT_FLUID_VAPOR_PRESSURE_BAR, 0.0001);
    } else {
        fluido.pressaoVaporBar = calculateVaporPressureAtTemp(fluido, targetTemp);
    }

    fluido.pressaoAtmosfericaBar = positiveNumber(
        dados.pressaoAtmosfericaBar,
        fluido.pressaoAtmosfericaBar ?? DEFAULT_ATMOSPHERIC_PRESSURE_BAR,
        0.5
    );

    return fluido;
}

export function createFluidoFromProperties(dados = {}) {
    const fluido = new Fluido(
        dados.nome ?? DEFAULT_FLUID_NAME,
        positiveNumber(dados.densidade, DEFAULT_FLUID_DENSITY, 1),
        positiveNumber(dados.viscosidadeDinamicaPaS, DEFAULT_FLUID_VISCOSITY_PA_S, 0.00001),
        Number.isFinite(Number(dados.temperatura)) ? Number(dados.temperatura) : DEFAULT_FLUID_TEMPERATURE
    );

    return updateFluidoProperties(fluido, dados);
}

export function cloneFluido(fluido, overrides = {}) {
    const newTemp = overrides.temperatura !== undefined ? overrides.temperatura : (fluido?.temperatura ?? DEFAULT_FLUID_TEMPERATURE);
    const tempChanged = overrides.temperatura !== undefined && overrides.temperatura !== fluido?.temperatura;

    const baseProps = {
        nome: fluido?.nome ?? DEFAULT_FLUID_NAME,
        temperatura: newTemp,
        calorEspecificoJkgK: fluido?.calorEspecificoJkgK ?? DEFAULT_FLUID_SPECIFIC_HEAT_JKGK,
        pressaoAtmosfericaBar: fluido?.pressaoAtmosfericaBar ?? DEFAULT_ATMOSPHERIC_PRESSURE_BAR,
        composicao: fluido?.composicao,
        corVisual: fluido?.corVisual,
        corVisualComposicao: fluido?.corVisualComposicao,
        refTemperatura: fluido?.refTemperatura ?? fluido?.temperatura ?? DEFAULT_FLUID_TEMPERATURE,
        refDensidade: fluido?.refDensidade ?? fluido?.densidade ?? DEFAULT_FLUID_DENSITY,
        refPressaoVaporBar: fluido?.refPressaoVaporBar ?? fluido?.pressaoVaporBar ?? DEFAULT_FLUID_VAPOR_PRESSURE_BAR,
        refViscosidadeDinamicaPaS: fluido?.refViscosidadeDinamicaPaS ?? fluido?.viscosidadeDinamicaPaS ?? DEFAULT_FLUID_VISCOSITY_PA_S
    };

    if (!tempChanged) {
        baseProps.densidade = fluido?.densidade ?? DEFAULT_FLUID_DENSITY;
        baseProps.pressaoVaporBar = fluido?.pressaoVaporBar ?? DEFAULT_FLUID_VAPOR_PRESSURE_BAR;
        baseProps.viscosidadeDinamicaPaS = fluido?.viscosidadeDinamicaPaS ?? DEFAULT_FLUID_VISCOSITY_PA_S;
    }

    return createFluidoFromProperties({
        ...baseProps,
        ...overrides
    });
}

export function mixFluidos(contributions = [], fallback = null, { nome = 'Mistura' } = {}) {
    const validContributions = contributions
        .map((entry) => ({
            fluido: entry?.fluido || entry?.fluid,
            weight: Number(entry?.peso ?? entry?.weight ?? entry?.volumeL ?? entry?.flowLps ?? entry?.vazaoLps)
        }))
        .filter((entry) => entry.fluido && Number.isFinite(entry.weight) && entry.weight > 0);

    if (validContributions.length === 0) {
        return fallback ? cloneFluido(fallback) : createFluidoFromProperties();
    }

    if (validContributions.length === 1) {
        return cloneFluido(validContributions[0].fluido);
    }

    const totalWeight = validContributions.reduce((sum, entry) => sum + entry.weight, 0);
    const composition = {};
    let density = 0;
    let thermalEnergyWeighted = 0;
    let logViscosity = 0;
    let heatCapacityMassWeight = 0;
    let heatCapacityWeighted = 0;
    let vaporPressure = 0;
    let atmosphericPressure = 0;
    const colorComposition = {};

    validContributions.forEach(({ fluido, weight }) => {
        const fraction = weight / totalWeight;
        const fluidDensity = positiveNumber(fluido.densidade, DEFAULT_FLUID_DENSITY, 1);
        const fluidTemperature = Number.isFinite(Number(fluido.temperatura)) ? Number(fluido.temperatura) : DEFAULT_FLUID_TEMPERATURE;
        const fluidSpecificHeat = positiveNumber(
            fluido.calorEspecificoJkgK,
            DEFAULT_FLUID_SPECIFIC_HEAT_JKGK,
            1
        );
        density += fraction * fluidDensity;
        logViscosity += fraction * Math.log(positiveNumber(fluido.viscosidadeDinamicaPaS, DEFAULT_FLUID_VISCOSITY_PA_S, 0.00001));
        const massWeight = weight * fluidDensity;
        const heatCapacityContribution = massWeight * fluidSpecificHeat;
        heatCapacityMassWeight += massWeight;
        heatCapacityWeighted += heatCapacityContribution;
        thermalEnergyWeighted += heatCapacityContribution * fluidTemperature;
        vaporPressure += fraction * positiveNumber(fluido.pressaoVaporBar, DEFAULT_FLUID_VAPOR_PRESSURE_BAR, 0.0001);
        atmosphericPressure += fraction * positiveNumber(fluido.pressaoAtmosfericaBar, DEFAULT_ATMOSPHERIC_PRESSURE_BAR, 0.5);

        getFluidCompositionEntries(fluido).forEach(([componentName, componentFraction]) => {
            composition[componentName] = (composition[componentName] || 0) + (fraction * componentFraction);
        });

        getFluidColorCompositionEntries(fluido).forEach(([color, colorFraction]) => {
            colorComposition[color] = (colorComposition[color] || 0) + (fraction * colorFraction);
        });
    });

    const normalizedComposition = normalizeComposition(composition);
    const normalizedColorComposition = Object.keys(colorComposition).length > 0
        ? normalizeComposition(colorComposition)
        : null;
    const colorCompositionEntries = normalizedColorComposition ? Object.entries(normalizedColorComposition) : [];
    const dominantVisualColor = colorCompositionEntries.length === 1 ? colorCompositionEntries[0][0] : null;
    const compositionNames = Object.entries(normalizedComposition)
        .sort(([, a], [, b]) => b - a)
        .map(([componentName, fraction]) => `${componentName} ${(fraction * 100).toFixed(0)}%`);

    return createFluidoFromProperties({
        nome: compositionNames.length > 1 ? `${nome}: ${compositionNames.join(' / ')}` : compositionNames[0]?.replace(/\s\d+%$/, '') || nome,
        densidade: density,
        temperatura: heatCapacityWeighted > 0
            ? thermalEnergyWeighted / heatCapacityWeighted
            : DEFAULT_FLUID_TEMPERATURE,
        viscosidadeDinamicaPaS: Math.exp(logViscosity),
        calorEspecificoJkgK: heatCapacityMassWeight > 0
            ? heatCapacityWeighted / heatCapacityMassWeight
            : DEFAULT_FLUID_SPECIFIC_HEAT_JKGK,
        pressaoVaporBar: vaporPressure,
        pressaoAtmosfericaBar: atmosphericPressure,
        composicao: normalizedComposition,
        corVisual: dominantVisualColor,
        corVisualComposicao: normalizedColorComposition
    });
}