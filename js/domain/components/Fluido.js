import {
    DEFAULT_ATMOSPHERIC_PRESSURE_BAR,
    DEFAULT_FLUID_SPECIFIC_HEAT_JKGK,
    DEFAULT_FLUID_VAPOR_PRESSURE_BAR,
    DEFAULT_FLUID_VISCOSITY_PA_S
} from '../units/HydraulicUnits.js';

const DEFAULT_FLUID_NAME = '\u00c1gua'; // Nome deafault do fluido com código Unicode para o caractere "Á" para evitar problemas de codificação em diferentes ambientes.
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

export const FLUID_FAMILY = Object.freeze({
    WATER: 'water',
    OIL: 'oil',
    GLYCOL: 'glycol',
    CUSTOM: 'custom'
});

/**
 * Classifica o nome de um fluido/componente em sua família físico-química padronizada.
 * Centraliza em uma única fonte da verdade o mapeamento de sinônimos e termos em português e inglês.
 */
export function getFluidFamily(name) {
    const norm = (name || '').toLowerCase();
    if (norm.includes('água') || norm.includes('agua') || norm.includes('water')) return FLUID_FAMILY.WATER;
    if (norm.includes('óleo') || norm.includes('oleo') || norm.includes('oil')) return FLUID_FAMILY.OIL;
    if (norm.includes('glicol') || norm.includes('glycol')) return FLUID_FAMILY.GLYCOL;
    return FLUID_FAMILY.CUSTOM;
}

const PRESET_REFERENCE_STATES = Object.freeze({
    [FLUID_FAMILY.WATER]: Object.freeze({ temp: 25, density: 997, vaporPressure: 0.0317, viscosity: 0.00089 }),
    [FLUID_FAMILY.OIL]: Object.freeze({ temp: 25, density: 860, vaporPressure: 0.003, viscosity: 0.035 }),
    [FLUID_FAMILY.GLYCOL]: Object.freeze({ temp: 25, density: 1045, vaporPressure: 0.02, viscosity: 0.0035 })
});

function getComponentRefState(name, fluido) {
    const family = getFluidFamily(name);
    const fluidFamily = getFluidFamily(fluido?.nome);
    const isPure = !isMixture(fluido) && fluidFamily === family && family !== FLUID_FAMILY.CUSTOM;

    if (family === FLUID_FAMILY.CUSTOM) {
        return {
            temp: fluido && fluido.refTemperatura !== undefined ? fluido.refTemperatura : DEFAULT_FLUID_TEMPERATURE,
            density: fluido && fluido.refDensidade !== undefined ? fluido.refDensidade : DEFAULT_FLUID_DENSITY,
            vaporPressure: fluido && fluido.refPressaoVaporBar !== undefined ? fluido.refPressaoVaporBar : DEFAULT_FLUID_VAPOR_PRESSURE_BAR,
            viscosity: fluido && fluido.refViscosidadeDinamicaPaS !== undefined ? fluido.refViscosidadeDinamicaPaS : DEFAULT_FLUID_VISCOSITY_PA_S
        };
    }

    const preset = PRESET_REFERENCE_STATES[family] || PRESET_REFERENCE_STATES[FLUID_FAMILY.WATER];

    return {
        temp: isPure && fluido.refTemperatura !== undefined ? fluido.refTemperatura : preset.temp,
        density: isPure && fluido.refDensidade !== undefined ? fluido.refDensidade : preset.density,
        vaporPressure: isPure && fluido.refPressaoVaporBar !== undefined ? fluido.refPressaoVaporBar : preset.vaporPressure,
        viscosity: isPure && fluido.refViscosidadeDinamicaPaS !== undefined ? fluido.refViscosidadeDinamicaPaS : preset.viscosity
    };
}

function getWaterDensityFactor(T) {
    const safeT = Math.max(-30, Math.min(350, Number(T) || 0));
    const term1 = Math.pow(safeT - 3.98, 2) * (safeT + 286.9);
    const term2 = 508929.2 * (safeT + 68.12);
    return Math.max(0.1, 1 - (term1 / term2));
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
        const family = getFluidFamily(name);

        let compDensity = refDensity;
        switch (family) {
            case FLUID_FAMILY.WATER: {
                const factorRef = getWaterDensityFactor(refT);
                const factorT = getWaterDensityFactor(T);
                compDensity = refDensity * (factorT / Math.max(0.1, factorRef));
                break;
            }
            case FLUID_FAMILY.OIL:
                compDensity = refDensity * (1 - 0.00086 * (T - refT));
                break;
            case FLUID_FAMILY.GLYCOL:
                compDensity = refDensity * (1 - 0.00045 * (T - refT));
                break;
            default:
                compDensity = refDensity * (1 - 0.0005 * (T - refT));
                break;
        }

        densitySum += fraction * Math.max(100.0, compDensity);
    });

    return totalFraction > 0 ? (densitySum / totalFraction) : DEFAULT_FLUID_DENSITY;
}

function calculateViscosityAtTemp(fluido, T) {
    const composition = fluido.composicao || { [fluido.nome || DEFAULT_FLUID_NAME]: 1 };
    let logViscSum = 0;
    let totalFraction = 0;

    const Tk = Math.max(1, (Number(T) || 0) + 273.15);

    Object.entries(composition).forEach(([name, fraction]) => {
        totalFraction += fraction;
        const ref = getComponentRefState(name, fluido);
        const refVisc = ref.viscosity;
        const refT = ref.temp;
        const refTk = Math.max(1, (Number(refT) || 0) + 273.15);
        const family = getFluidFamily(name);

        let compVisc = refVisc;
        switch (family) {
            case FLUID_FAMILY.WATER: {
                const expRef = 247.8 / Math.max(10, refTk - 140);
                const expT = 247.8 / Math.max(10, Tk - 140);
                compVisc = refVisc * Math.pow(10, expT - expRef);
                break;
            }
            case FLUID_FAMILY.OIL:
                compVisc = refVisc * Math.exp(3645.4 * ((1 / Tk) - (1 / refTk)));
                break;
            case FLUID_FAMILY.GLYCOL:
                compVisc = refVisc * Math.exp(2190 * ((1 / Tk) - (1 / refTk)));
                break;
            default:
                compVisc = refVisc * Math.exp(2500 * ((1 / Tk) - (1 / refTk)));
                break;
        }

        logViscSum += fraction * Math.log(Math.max(0.00001, compVisc));
    });

    return totalFraction > 0 ? Math.exp(logViscSum / totalFraction) : DEFAULT_FLUID_VISCOSITY_PA_S;
}

/**
 * Calcula a pressão de vapor saturado (Pvap) do fluido na temperatura T (°C), retornando o valor em bar.
 * Essa grandeza é essencial para o cálculo de NPSHa e previsão de cavitação em bombas centrífugas.
 *
 * Modelos empregados:
 * 1. Misturas: aproximação linear pela Lei de Raoult (Pvap = Σ xi * Pvap,i).
 * 2. Água: Equação de Antoine diferencial com constantes canônicas (B = 1730.63, C = 233.426).
 * 3. Óleos: Relação empírica tipo Clausius-Clapeyron base 10 (ΔHvap/R*ln(10) ≈ 2033.7, baixa volatilidade).
 * 4. Glicol: Modelo substituto com constantes de Antoine adaptadas ao Pvap de referência.
 * 5. Outros fluidos: Equação de Clausius-Clapeyron integrada com -ΔHvap/R ≈ -4000 K (padrão Trouton).
 */
function calculateVaporPressureAtTemp(fluido, T) {
    // Obtém a composição da mistura ou cria um componente único para fluidos puros
    const composition = fluido.composicao || { [fluido.nome || DEFAULT_FLUID_NAME]: 1 };
    let vaporPressureSum = 0;
    let totalFraction = 0;

    // Higienização de temperatura: evita valores criogênicos extremos e divergências numéricas
    const safeT = Math.max(-50, Number(T) || 0);
    const Tk = Math.max(1, safeT + 273.15); // Temperatura absoluta em Kelvin (mínimo de 1 K contra divisão por zero)

    // Avalia a contribuição de cada componente segundo sua fração
    Object.entries(composition).forEach(([name, fraction]) => {
        totalFraction += fraction;

        // Recupera o estado de referência do componente (Tref, Pref de vapor)
        const ref = getComponentRefState(name, fluido);
        const refVap = ref.vaporPressure;
        const refT = Math.max(-50, Number(ref.temp) || 0);
        const refTk = Math.max(1, refT + 273.15);
        const family = getFluidFamily(name);

        let compVap = refVap;
        switch (family) {
            case FLUID_FAMILY.WATER: {
                // Equação de Antoine diferencial para água (log10(P/Pref) = B/(Tref+C) - B/(T+C)):
                // B = 1730.63, C = 233.426 válidos para a faixa de 1 °C a 100 °C.
                const expRef = 1730.63 / Math.max(10, refT + 233.426);
                const expT = 1730.63 / Math.max(10, safeT + 233.426);
                compVap = refVap * Math.pow(10, expRef - expT);
                break;
            }
            case FLUID_FAMILY.OIL:
                // Correlação tipo Clausius-Clapeyron na base 10 para hidrocarbonetos/óleos de baixa volatilidade:
                // O fator 2033.7 corresponde a ΔHvap / (R * ln(10)), implicando ΔHvap ≈ 39 kJ/mol.
                compVap = refVap * Math.pow(10, 2033.7 * ((1 / refTk) - (1 / Tk)));
                break;
            case FLUID_FAMILY.GLYCOL: {
                // Modelo substituto simplificado para soluções glicoladas utilizando a inclinação de Antoine
                // acoplada à pressão de vapor de referência do glicol (Pref = 0.02 bar a 25 °C).
                const expRef = 1730.63 / Math.max(10, refT + 233.426);
                const expT = 1730.63 / Math.max(10, safeT + 233.426);
                compVap = refVap * Math.pow(10, expRef - expT);
                break;
            }
            default:
                // Clausius-Clapeyron genérico na base e para fluidos não tabelados:
                // Assume -ΔHvap / R ≈ -4000 K (entalpia de vaporização média de ~33.2 kJ/mol).
                compVap = refVap * Math.exp(-4000 * ((1 / Tk) - (1 / refTk)));
                break;
        }

        // Ponderação pela Lei de Raoult com piso mínimo de segurança de 0.0001 bar (10 Pa) contra valores não-físicos
        vaporPressureSum += fraction * Math.max(0.0001, compVap);
    });

    // Normaliza pela fração total da mistura ou retorna a pressão de vapor padrão em caso de fração nula
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
        fluido.refTemperatura = dados.refTemperatura !== undefined ? dados.refTemperatura : DEFAULT_FLUID_TEMPERATURE;
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

    if (hasExplicitDensity || hasExplicitVisc || hasExplicitVapor) {
        if (hasExplicitDensity && dados.refDensidade === undefined) {
            fluido.refDensidade = positiveNumber(dados.densidade, DEFAULT_FLUID_DENSITY, 1);
        }
        if (hasExplicitVisc && dados.refViscosidadeDinamicaPaS === undefined) {
            fluido.refViscosidadeDinamicaPaS = positiveNumber(dados.viscosidadeDinamicaPaS, DEFAULT_FLUID_VISCOSITY_PA_S, 0.00001);
        }
        if (hasExplicitVapor && dados.refPressaoVaporBar === undefined) {
            fluido.refPressaoVaporBar = positiveNumber(dados.pressaoVaporBar, DEFAULT_FLUID_VAPOR_PRESSURE_BAR, 0.0001);
        }
        if (dados.refTemperatura === undefined && hasExplicitTemp) {
            fluido.refTemperatura = Number(dados.temperatura);
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
