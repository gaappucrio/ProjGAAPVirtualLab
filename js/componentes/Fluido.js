import {
    DEFAULT_ATMOSPHERIC_PRESSURE_BAR,
    DEFAULT_FLUID_VAPOR_PRESSURE_BAR,
    DEFAULT_FLUID_VISCOSITY_PA_S
} from '../utils/Units.js';


export class Fluido {
    constructor(
        nome,
        densidade,
        pressao,
        temperatura,
        viscosidadeDinamicaPaS = DEFAULT_FLUID_VISCOSITY_PA_S,
        pressaoVaporBar = DEFAULT_FLUID_VAPOR_PRESSURE_BAR,
        pressaoAtmosfericaBar = DEFAULT_ATMOSPHERIC_PRESSURE_BAR
    ) {
        this.nome = nome;
        this.densidade = densidade;
        this.pressao = pressao;
        this.temperatura = temperatura;
        this.viscosidadeDinamicaPaS = viscosidadeDinamicaPaS;
        this.pressaoVaporBar = pressaoVaporBar;
        this.pressaoAtmosfericaBar = pressaoAtmosfericaBar;
    }
}
