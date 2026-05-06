import {
    DEFAULT_ATMOSPHERIC_PRESSURE_BAR,
    DEFAULT_FLUID_VAPOR_PRESSURE_BAR,
    DEFAULT_FLUID_VISCOSITY_PA_S
} from '../../utils/Units.js';

const DEFAULT_FLUID_NAME = '\u00c1gua';
const DEFAULT_FLUID_DENSITY = 997.0;
const DEFAULT_FLUID_TEMPERATURE = 25.0;

function positiveNumber(value, fallback, minimum = Number.EPSILON) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.max(minimum, numericValue);
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

function normalizeComposition(composition) {
    const entries = Object.entries(composition)
        .map(([name, fraction]) => [name, Number(fraction)])
        .filter(([, fraction]) => Number.isFinite(fraction) && fraction > 0);
    const total = entries.reduce((sum, [, fraction]) => sum + fraction, 0);
    if (total <= 0) return { [DEFAULT_FLUID_NAME]: 1 };

    return Object.fromEntries(entries.map(([name, fraction]) => [name, fraction / total]));
}

export class Fluido {
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
        this.pressaoVaporBar = DEFAULT_FLUID_VAPOR_PRESSURE_BAR;
        this.pressaoAtmosfericaBar = DEFAULT_ATMOSPHERIC_PRESSURE_BAR;
    }
}

export function updateFluidoProperties(fluido, dados = {}) {
    if (!fluido) return fluido;

    const previousName = fluido.nome;
    fluido.nome = dados.nome ?? fluido.nome ?? DEFAULT_FLUID_NAME;
    fluido.densidade = positiveNumber(dados.densidade, fluido.densidade ?? DEFAULT_FLUID_DENSITY, 1);
    fluido.temperatura = Number.isFinite(Number(dados.temperatura))
        ? Number(dados.temperatura)
        : (fluido.temperatura ?? DEFAULT_FLUID_TEMPERATURE);
    fluido.viscosidadeDinamicaPaS = positiveNumber(
        dados.viscosidadeDinamicaPaS,
        fluido.viscosidadeDinamicaPaS ?? DEFAULT_FLUID_VISCOSITY_PA_S,
        0.00001
    );
    fluido.viscosidade = fluido.viscosidadeDinamicaPaS;
    fluido.pressaoVaporBar = positiveNumber(
        dados.pressaoVaporBar,
        fluido.pressaoVaporBar ?? DEFAULT_FLUID_VAPOR_PRESSURE_BAR,
        0.0001
    );
    fluido.pressaoAtmosfericaBar = positiveNumber(
        dados.pressaoAtmosfericaBar,
        fluido.pressaoAtmosfericaBar ?? DEFAULT_ATMOSPHERIC_PRESSURE_BAR,
        0.5
    );
    const compositionSource = dados.composicao
        ?? (dados.nome !== undefined && dados.nome !== previousName ? { [fluido.nome]: 1 } : fluido.composicao)
        ?? { [fluido.nome]: 1 };
    fluido.composicao = normalizeComposition(compositionSource);

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
    return createFluidoFromProperties({
        nome: fluido?.nome ?? DEFAULT_FLUID_NAME,
        densidade: fluido?.densidade ?? DEFAULT_FLUID_DENSITY,
        temperatura: fluido?.temperatura ?? DEFAULT_FLUID_TEMPERATURE,
        viscosidadeDinamicaPaS: fluido?.viscosidadeDinamicaPaS ?? DEFAULT_FLUID_VISCOSITY_PA_S,
        pressaoVaporBar: fluido?.pressaoVaporBar ?? DEFAULT_FLUID_VAPOR_PRESSURE_BAR,
        pressaoAtmosfericaBar: fluido?.pressaoAtmosfericaBar ?? DEFAULT_ATMOSPHERIC_PRESSURE_BAR,
        composicao: fluido?.composicao,
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
    let temperature = 0;
    let logViscosity = 0;
    let vaporPressure = 0;
    let atmosphericPressure = 0;

    validContributions.forEach(({ fluido, weight }) => {
        const fraction = weight / totalWeight;
        density += fraction * positiveNumber(fluido.densidade, DEFAULT_FLUID_DENSITY, 1);
        temperature += fraction * (Number.isFinite(Number(fluido.temperatura)) ? Number(fluido.temperatura) : DEFAULT_FLUID_TEMPERATURE);
        logViscosity += fraction * Math.log(positiveNumber(fluido.viscosidadeDinamicaPaS, DEFAULT_FLUID_VISCOSITY_PA_S, 0.00001));
        vaporPressure += fraction * positiveNumber(fluido.pressaoVaporBar, DEFAULT_FLUID_VAPOR_PRESSURE_BAR, 0.0001);
        atmosphericPressure += fraction * positiveNumber(fluido.pressaoAtmosfericaBar, DEFAULT_ATMOSPHERIC_PRESSURE_BAR, 0.5);

        getFluidCompositionEntries(fluido).forEach(([componentName, componentFraction]) => {
            composition[componentName] = (composition[componentName] || 0) + (fraction * componentFraction);
        });
    });

    const normalizedComposition = normalizeComposition(composition);
    const compositionNames = Object.entries(normalizedComposition)
        .sort(([, a], [, b]) => b - a)
        .map(([componentName, fraction]) => `${componentName} ${(fraction * 100).toFixed(0)}%`);

    return createFluidoFromProperties({
        nome: compositionNames.length > 1 ? `${nome}: ${compositionNames.join(' / ')}` : compositionNames[0]?.replace(/\s\d+%$/, '') || nome,
        densidade: density,
        temperatura: temperature,
        viscosidadeDinamicaPaS: Math.exp(logViscosity),
        pressaoVaporBar: vaporPressure,
        pressaoAtmosfericaBar: atmosphericPressure,
        composicao: normalizedComposition
    });
}
