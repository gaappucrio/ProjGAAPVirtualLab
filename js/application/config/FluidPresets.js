import {
    DEFAULT_ATMOSPHERIC_PRESSURE_BAR,
    DEFAULT_FLUID_VAPOR_PRESSURE_BAR,
    DEFAULT_FLUID_VISCOSITY_PA_S
} from '../../utils/Units.js';

export const FLUID_PRESETS = Object.freeze({
    agua: Object.freeze({
        nome: 'Água',
        densidade: 997,
        temperatura: 25,
        viscosidadeDinamicaPaS: DEFAULT_FLUID_VISCOSITY_PA_S,
        pressaoVaporBar: DEFAULT_FLUID_VAPOR_PRESSURE_BAR,
        pressaoAtmosfericaBar: DEFAULT_ATMOSPHERIC_PRESSURE_BAR
    }),
    oleo_leve: Object.freeze({
        nome: 'Óleo leve',
        densidade: 860,
        temperatura: 25,
        viscosidadeDinamicaPaS: 0.035,
        pressaoVaporBar: 0.003,
        pressaoAtmosfericaBar: DEFAULT_ATMOSPHERIC_PRESSURE_BAR
    }),
    glicol_30: Object.freeze({
        nome: 'Glicol 30%',
        densidade: 1045,
        temperatura: 25,
        viscosidadeDinamicaPaS: 0.0035,
        pressaoVaporBar: 0.02,
        pressaoAtmosfericaBar: DEFAULT_ATMOSPHERIC_PRESSURE_BAR
    })
});
