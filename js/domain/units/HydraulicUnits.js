// Constantes e conversoes usadas pelo dominio hidraulico.

export const CONSTANTES_CONVERSAO = Object.freeze({
    barParaPa: 100000,
    gravidade: 9.81,
    lpsParaM3s: 0.001,
    m3sParaLps: 1000
});

export const PADROES_HIDRAULICOS = Object.freeze({
    epsilonVazaoLps: 0.0001,
    diametroPadraoTuboM: 0.08,
    fatorAtritoPadrao: 0.028,
    rugosidadePadraoMm: 0.045,
    comprimentoExtraPadraoM: 0,
    perdaLocalPadraoK: 0.8,
    perdaEntradaPadraoK: 0.35,
    velocidadeProjetoPadraoMps: 2.0,
    viscosidadePadraoPaS: 0.00089,
    calorEspecificoPadraoJkgK: 4182,
    pressaoVaporPadraoBar: 0.0317,
    pressaoAtmosfericaPadraoBar: 1.01325,
    vazaoMaximaRedeLps: 500,
    pressaoPadraoFonteBar: 0.5
});

export const BAR_TO_PA = CONSTANTES_CONVERSAO.barParaPa;
export const GRAVITY = CONSTANTES_CONVERSAO.gravidade;
export const EPSILON_FLOW = PADROES_HIDRAULICOS.epsilonVazaoLps;
export const DEFAULT_PIPE_DIAMETER_M = PADROES_HIDRAULICOS.diametroPadraoTuboM;
export const DEFAULT_PIPE_FRICTION = PADROES_HIDRAULICOS.fatorAtritoPadrao;
export const DEFAULT_PIPE_ROUGHNESS_MM = PADROES_HIDRAULICOS.rugosidadePadraoMm;
export const DEFAULT_PIPE_EXTRA_LENGTH_M = PADROES_HIDRAULICOS.comprimentoExtraPadraoM;
export const DEFAULT_PIPE_MINOR_LOSS = PADROES_HIDRAULICOS.perdaLocalPadraoK;
export const DEFAULT_ENTRY_LOSS = PADROES_HIDRAULICOS.perdaEntradaPadraoK;
export const DEFAULT_DESIGN_VELOCITY_MPS = PADROES_HIDRAULICOS.velocidadeProjetoPadraoMps;
export const DEFAULT_FLUID_VISCOSITY_PA_S = PADROES_HIDRAULICOS.viscosidadePadraoPaS;
export const DEFAULT_FLUID_SPECIFIC_HEAT_JKGK = PADROES_HIDRAULICOS.calorEspecificoPadraoJkgK;
export const DEFAULT_FLUID_VAPOR_PRESSURE_BAR = PADROES_HIDRAULICOS.pressaoVaporPadraoBar;
export const DEFAULT_ATMOSPHERIC_PRESSURE_BAR = PADROES_HIDRAULICOS.pressaoAtmosfericaPadraoBar;
export const MAX_NETWORK_FLOW_LPS = PADROES_HIDRAULICOS.vazaoMaximaRedeLps;
export const DEFAULT_SOURCE_PRESSURE_BAR = PADROES_HIDRAULICOS.pressaoPadraoFonteBar;

export function lpsToM3s(value) {
    return value * CONSTANTES_CONVERSAO.lpsParaM3s;
}

export function m3sToLps(value) {
    return value * CONSTANTES_CONVERSAO.m3sParaLps;
}

export function areaFromDiameter(diameterM) {
    return Math.PI * Math.pow(diameterM / 2, 2);
}

export function pressureFromHeadBar(headM, density) {
    return (density * GRAVITY * headM) / BAR_TO_PA;
}
