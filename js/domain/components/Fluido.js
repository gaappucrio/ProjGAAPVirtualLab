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
