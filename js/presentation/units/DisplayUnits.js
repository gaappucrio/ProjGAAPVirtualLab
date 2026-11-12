// Preferencias e conversoes de exibicao da interface.

const P_ATM_DISPLAY_BAR = 1.01325;

// factor: unidade por bar. plainSymbol: símbolo sem g (usado em ΔP e em pressões já absolutas na base).
function pressureUnit(label, plainSymbol, factor, step, digits, absolute) {
    const offsetBar = absolute ? P_ATM_DISPLAY_BAR : 0;
    return {
        label,
        symbol: label,
        plainSymbol,
        factor,
        fromBase: (v) => (v + offsetBar) * factor,
        toBase: (v) => (v / factor) - offsetBar,
        step,
        digits
    };
}

const UNIT_CONFIG = {
    // Pressão: g = manométrica, sem g = absoluta (padrão, como no DWSIM) (Patm somada na exibição).
    // O estado interno do solver continua manométrico em bar. Nomes como no DWSIM (kPag, barg, psig).
    pressure: {
        label: 'Pressão',
        default: 'kpa',
        units: {
            kpag: pressureUnit('kPag', 'kPa', 100, 1, 1, false),
            kpa: pressureUnit('kPa', 'kPa', 100, 1, 1, true),
            barg: pressureUnit('barg', 'bar', 1, 0.05, 2, false),
            bar: pressureUnit('bar', 'bar', 1, 0.05, 2, true),
            psig: pressureUnit('psig', 'psi', 14.5037738, 0.5, 1, false),
            psi: pressureUnit('psi', 'psi', 14.5037738, 0.5, 1, true),
            mca: pressureUnit('mca', 'mca', 1 / 0.0980665, 0.1, 2, false)
        }
    },
    flow: {
        label: 'Vazão',
        default: 'm3h',
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
            f: { label: '°F', symbol: '°F', fromBase: (v) => ((v * 9) / 5) + 32, toBase: (v) => ((v - 32) * 5) / 9, step: 1, digits: 1 },
            k: { label: 'K', symbol: 'K', fromBase: (v) => v + 273.15, toBase: (v) => v - 273.15, step: 1, digits: 1 }
        }
    }
};

const unitPreferences = Object.fromEntries(
    Object.entries(UNIT_CONFIG).map(([category, config]) => [category, config.default])
);

const listeners = new Set();

function getUnitEntry(category) {
    if (category === 'pressureDiff') {
        // ΔP, carga e pressões já absolutas na base (vapor, atmosférica): só o fator da unidade escolhida, sem deslocamento.
        const selected = UNIT_CONFIG.pressure.units[unitPreferences.pressure];
        if (!selected) return null;
        return {
            label: selected.plainSymbol,
            symbol: selected.plainSymbol,
            fromBase: (v) => v * selected.factor,
            toBase: (v) => v / selected.factor,
            step: selected.step,
            digits: selected.digits
        };
    }
    const config = UNIT_CONFIG[category];
    const unitId = unitPreferences[category];
    return config?.units?.[unitId] || null;
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
