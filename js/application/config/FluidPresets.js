import {
    DEFAULT_ATMOSPHERIC_PRESSURE_BAR,
    DEFAULT_FLUID_VAPOR_PRESSURE_BAR,
    DEFAULT_FLUID_VISCOSITY_PA_S
} from '../../domain/units/HydraulicUnits.js';

export const FLUID_PRESETS = Object.freeze({
    agua: Object.freeze({
        nome: 'Água',
        densidade: 997,
        temperatura: 25,
        viscosidadeDinamicaPaS: DEFAULT_FLUID_VISCOSITY_PA_S,
        calorEspecificoJkgK: 4182,
        pressaoVaporBar: DEFAULT_FLUID_VAPOR_PRESSURE_BAR,
        pressaoAtmosfericaBar: DEFAULT_ATMOSPHERIC_PRESSURE_BAR,
        corVisual: '#3498db'
    }),
    oleo_leve: Object.freeze({
        nome: 'Óleo leve',
        densidade: 860,
        temperatura: 25,
        viscosidadeDinamicaPaS: 0.035,
        calorEspecificoJkgK: 2000,
        pressaoVaporBar: 0.003,
        pressaoAtmosfericaBar: DEFAULT_ATMOSPHERIC_PRESSURE_BAR,
        corVisual: '#f1c40f'
    }),
    glicol_30: Object.freeze({
        nome: 'Glicol 30%',
        densidade: 1045,
        temperatura: 25,
        viscosidadeDinamicaPaS: 0.0035,
        calorEspecificoJkgK: 3800,
        pressaoVaporBar: 0.02,
        pressaoAtmosfericaBar: DEFAULT_ATMOSPHERIC_PRESSURE_BAR,
        corVisual: '#8b5a2b'
    })
});
