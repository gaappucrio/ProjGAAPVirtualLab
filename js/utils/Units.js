// =======================================
// UTILIDADE: Unidades e Conversões
// Arquivo: js/utils/Units.js
// =======================================

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
    viscosidadePadraoPaS: 0.00089,
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
export const DEFAULT_FLUID_VISCOSITY_PA_S = PADROES_HIDRAULICOS.viscosidadePadraoPaS;
export const DEFAULT_FLUID_VAPOR_PRESSURE_BAR = PADROES_HIDRAULICOS.pressaoVaporPadraoBar;
export const DEFAULT_ATMOSPHERIC_PRESSURE_BAR = PADROES_HIDRAULICOS.pressaoAtmosfericaPadraoBar;
export const MAX_NETWORK_FLOW_LPS = PADROES_HIDRAULICOS.vazaoMaximaRedeLps;
export const DEFAULT_SOURCE_PRESSURE_BAR = PADROES_HIDRAULICOS.pressaoPadraoFonteBar;

const UNIT_CONFIG = {
    pressure: {
        label: 'Pressão',
        default: 'kpa',
        units: {
            bar: { label: 'bar', symbol: 'bar', fromBase: (v) => v, toBase: (v) => v, step: 0.05, digits: 2 },
            kpa: { label: 'kPa', symbol: 'kPa', fromBase: (v) => v * 100, toBase: (v) => v / 100, step: 1, digits: 1 },
            psi: { label: 'psi', symbol: 'psi', fromBase: (v) => v * 14.5037738, toBase: (v) => v / 14.5037738, step: 0.5, digits: 1 },
            mca: { label: 'mca', symbol: 'mca', fromBase: (v) => v / 0.0980665, toBase: (v) => v * 0.0980665, step: 0.1, digits: 2 }
        }
    },
    flow: {
        label: 'Vazão',
        default: 'm3s',
        units: {
            m3s: { label: 'm³/s', symbol: 'm³/s', fromBase: (v) => v / 1000, toBase: (v) => v * 1000, step: 0.001, digits: 3 },
            lps: { label: 'L/s', symbol: 'L/s', fromBase: (v) => v, toBase: (v) => v, step: 0.1, digits: 2 },
            lpm: { label: 'L/min', symbol: 'L/min', fromBase: (v) => v * 60, toBase: (v) => v / 60, step: 1, digits: 1 },
            m3h: { label: 'm³/h', symbol: 'm³/h', fromBase: (v) => v * 3.6, toBase: (v) => v / 3.6, step: 0.1, digits: 2 },
            gpm: { label: 'gpm', symbol: 'gpm', fromBase: (v) => v * 15.8503231, toBase: (v) => v / 15.8503231, step: 0.5, digits: 1 }
        }
    },
    length: {
        label: 'Comprimento',
        default: 'm',
        units: {
            m: { label: 'm', symbol: 'm', fromBase: (v) => v, toBase: (v) => v, step: 0.05, digits: 2 },
            cm: { label: 'cm', symbol: 'cm', fromBase: (v) => v * 100, toBase: (v) => v / 100, step: 1, digits: 1 },
            mm: { label: 'mm', symbol: 'mm', fromBase: (v) => v * 1000, toBase: (v) => v / 1000, step: 1, digits: 0 },
            ft: { label: 'ft', symbol: 'ft', fromBase: (v) => v * 3.2808399, toBase: (v) => v / 3.2808399, step: 0.1, digits: 2 }
        }
    },
    volume: {
        label: 'Volume',
        default: 'm3',
        units: {
            l: { label: 'L', symbol: 'L', fromBase: (v) => v, toBase: (v) => v, step: 1, digits: 1 },
            m3: { label: 'm³', symbol: 'm³', fromBase: (v) => v / 1000, toBase: (v) => v * 1000, step: 0.01, digits: 3 },
            gal: { label: 'gal', symbol: 'gal', fromBase: (v) => v * 0.264172052, toBase: (v) => v / 0.264172052, step: 0.5, digits: 1 }
        }
    },
    temperature: {
        label: 'Temperatura',
        default: 'c',
        units: {
            c: { label: '°C', symbol: '°C', fromBase: (v) => v, toBase: (v) => v, step: 1, digits: 1 },
            f: { label: '°F', symbol: '°F', fromBase: (v) => ((v * 9) / 5) + 32, toBase: (v) => ((v - 32) * 5) / 9, step: 1, digits: 1 }
        }
    }
};

const unitPreferences = Object.fromEntries(
    Object.entries(UNIT_CONFIG).map(([category, config]) => [category, config.default])
);

const listeners = new Set();

function getUnitEntry(category) {
    const config = UNIT_CONFIG[category];
    const unitId = unitPreferences[category];
    return config?.units?.[unitId] || null;
}

export function getUnitConfig() {
    return UNIT_CONFIG;
}

export function getUnitPreferences() {
    return { ...unitPreferences };
}

export function getUnitOptions(category) {
    return Object.entries(UNIT_CONFIG[category]?.units || {}).map(([id, unit]) => ({
        id,
        label: unit.label,
        symbol: unit.symbol
    }));
}

export function getUnitSymbol(category) {
    return getUnitEntry(category)?.symbol || '';
}

export function getUnitStep(category) {
    return getUnitEntry(category)?.step ?? 1;
}

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

export function toDisplayValue(category, baseValue) {
    const unit = getUnitEntry(category);
    if (!unit || !Number.isFinite(baseValue)) return 0;
    return unit.fromBase(baseValue);
}

export function toBaseValue(category, displayValue) {
    const unit = getUnitEntry(category);
    if (!unit || !Number.isFinite(displayValue)) return NaN;
    return unit.toBase(displayValue);
}

export function formatUnitValue(category, baseValue, digits = null) {
    if (!Number.isFinite(baseValue)) return '';
    const unit = getUnitEntry(category);
    if (!unit) return String(baseValue);
    const resolvedDigits = digits ?? unit.digits ?? 2;
    return unit.fromBase(baseValue).toFixed(resolvedDigits);
}

export function setUnitPreference(category, unitId) {
    const config = UNIT_CONFIG[category];
    if (!config || !config.units[unitId] || unitPreferences[category] === unitId) return;

    unitPreferences[category] = unitId;
    listeners.forEach((listener) => listener(getUnitPreferences()));
}

export function subscribeUnitPreferences(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
