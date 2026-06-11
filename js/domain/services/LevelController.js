function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export const DEFAULT_LEVEL_CONTROLLER_CONFIG = Object.freeze({
    deadband: 0.0025,
    reactivationBand: 0.0075,
    outputMin: -1,
    outputMax: 1,
    derivativeScale: 1,
    fuzzyIntegralGain: 0.3,
    fuzzyIntegralLimit: 2.6
});

export const LEVEL_CONTROLLER_MODES = Object.freeze({
    PID: 'pid',
    FUZZY: 'fuzzy'
});

const FUZZY_TERMS = Object.freeze(['NB', 'NS', 'ZE', 'PS', 'PB']);

const FUZZY_ERROR_SETS = Object.freeze({
    NB: { kind: 'trap', points: [-1, -1, -0.45, -0.15] },
    NS: { kind: 'tri', points: [-0.45, -0.18, 0] },
    ZE: { kind: 'tri', points: [-0.08, 0, 0.08] },
    PS: { kind: 'tri', points: [0, 0.18, 0.45] },
    PB: { kind: 'trap', points: [0.15, 0.45, 1, 1] }
});

const FUZZY_RATE_SETS = Object.freeze({
    NB: { kind: 'trap', points: [-1, -1, -0.55, -0.15] },
    NS: { kind: 'tri', points: [-0.55, -0.18, 0] },
    ZE: { kind: 'tri', points: [-0.1, 0, 0.1] },
    PS: { kind: 'tri', points: [0, 0.18, 0.55] },
    PB: { kind: 'trap', points: [0.15, 0.55, 1, 1] }
});

const FUZZY_OUTPUT_SINGLETONS = Object.freeze({
    NB: -1,
    NS: -0.45,
    ZE: 0,
    PS: 0.45,
    PB: 1
});

const FUZZY_RULES = Object.freeze({
    NB: { NB: 'NB', NS: 'NB', ZE: 'NB', PS: 'NS', PB: 'ZE' },
    NS: { NB: 'NB', NS: 'NS', ZE: 'NS', PS: 'ZE', PB: 'PS' },
    ZE: { NB: 'NS', NS: 'ZE', ZE: 'ZE', PS: 'ZE', PB: 'PS' },
    PS: { NB: 'NS', NS: 'ZE', ZE: 'PS', PS: 'PS', PB: 'PB' },
    PB: { NB: 'ZE', NS: 'PS', ZE: 'PB', PS: 'PB', PB: 'PB' }
});

export function createLevelControllerState() {
    return {
        integral: 0,
        lastError: 0,
        derivative: 0,
        resting: false
    };
}

export function resetLevelControllerState(state = createLevelControllerState()) {
    state.integral = 0;
    state.lastError = 0;
    state.derivative = 0;
    state.resting = false;
    return state;
}

function triangleMembership(value, [a, b, c]) {
    if (value <= a || value >= c) return 0;
    if (value === b) return 1;
    if (value < b) return (value - a) / (b - a);
    return (c - value) / (c - b);
}

function trapezoidMembership(value, [a, b, c, d]) {
    if (value < a || value > d) return 0;
    if (value >= b && value <= c) return 1;
    if (value < b) return b === a ? 1 : (value - a) / (b - a);
    return d === c ? 1 : (d - value) / (d - c);
}

function membership(value, set) {
    return set.kind === 'trap'
        ? trapezoidMembership(value, set.points)
        : triangleMembership(value, set.points);
}

function fuzzify(value, sets) {
    return Object.fromEntries(
        FUZZY_TERMS.map((term) => [term, clamp(membership(value, sets[term]), 0, 1)])
    );
}

export function calculatePidLevelControl({
    setpoint,
    measurement,
    dt,
    kp = 0,
    ki = 0,
    kd = 0,
    state = createLevelControllerState(),
    config = DEFAULT_LEVEL_CONTROLLER_CONFIG
} = {}) {
    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    const safeKp = Number.isFinite(kp) ? kp : 0;
    const safeKi = Number.isFinite(ki) ? ki : 0;
    const safeKd = Number.isFinite(kd) ? kd : 0;
    const error = clamp((Number(setpoint) || 0) - (Number(measurement) || 0), -1, 1);
    const errorAbs = Math.abs(error);
    const deadband = Number.isFinite(config.deadband)
        ? Math.max(0, config.deadband)
        : DEFAULT_LEVEL_CONTROLLER_CONFIG.deadband;
    const reactivationBand = Number.isFinite(config.reactivationBand)
        ? Math.max(deadband, config.reactivationBand)
        : DEFAULT_LEVEL_CONTROLLER_CONFIG.reactivationBand;
    const outputMin = Number.isFinite(config.outputMin)
        ? config.outputMin
        : DEFAULT_LEVEL_CONTROLLER_CONFIG.outputMin;
    const outputMax = Number.isFinite(config.outputMax)
        ? config.outputMax
        : DEFAULT_LEVEL_CONTROLLER_CONFIG.outputMax;
    const shouldEnterRest = errorAbs <= deadband;
    const shouldMaintainRest = state.resting && errorAbs <= reactivationBand;

    if (shouldEnterRest || shouldMaintainRest) {
        state.integral = 0;
        state.lastError = error;
        state.derivative = 0;
        state.resting = true;

        return {
            u: 0,
            rawOutput: 0,
            error,
            integral: state.integral,
            derivative: state.derivative,
            inRest: true,
            saturated: false,
            mode: LEVEL_CONTROLLER_MODES.PID
        };
    }

    state.resting = false;

    if (state.lastError !== undefined && state.lastError * error < 0) {
        state.integral = 0;
    }

    const derivative = safeDt > 0 ? (error - (state.lastError || 0)) / safeDt : 0;
    state.lastError = error;
    state.integral += error * safeDt;

    const integralLimit = safeKi > 0 ? 1 / safeKi : 1;
    state.integral = clamp(state.integral, -integralLimit, integralLimit);
    state.derivative = Number.isFinite(derivative) ? derivative : 0;

    const rawOutput = (safeKp * error) + (safeKi * state.integral) + (safeKd * state.derivative);
    const u = clamp(rawOutput, outputMin, outputMax);

    return {
        u,
        rawOutput,
        error,
        integral: state.integral,
        derivative: state.derivative,
        inRest: false,
        saturated: u !== rawOutput,
        mode: LEVEL_CONTROLLER_MODES.PID
    };
}

export function calculateFuzzyLevelControl({
    setpoint,
    measurement,
    dt,
    state = createLevelControllerState(),
    config = DEFAULT_LEVEL_CONTROLLER_CONFIG
} = {}) {
    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    const error = clamp((Number(setpoint) || 0) - (Number(measurement) || 0), -1, 1);
    const errorAbs = Math.abs(error);
    const deadband = Number.isFinite(config.deadband)
        ? Math.max(0, config.deadband)
        : DEFAULT_LEVEL_CONTROLLER_CONFIG.deadband;
    const reactivationBand = Number.isFinite(config.reactivationBand)
        ? Math.max(deadband, config.reactivationBand)
        : DEFAULT_LEVEL_CONTROLLER_CONFIG.reactivationBand;
    const outputMin = Number.isFinite(config.outputMin)
        ? config.outputMin
        : DEFAULT_LEVEL_CONTROLLER_CONFIG.outputMin;
    const outputMax = Number.isFinite(config.outputMax)
        ? config.outputMax
        : DEFAULT_LEVEL_CONTROLLER_CONFIG.outputMax;
    const derivativeScale = Number.isFinite(config.derivativeScale) && config.derivativeScale > 0
        ? config.derivativeScale
        : DEFAULT_LEVEL_CONTROLLER_CONFIG.derivativeScale;
    const fuzzyIntegralGain = Number.isFinite(config.fuzzyIntegralGain) && config.fuzzyIntegralGain > 0
        ? config.fuzzyIntegralGain
        : DEFAULT_LEVEL_CONTROLLER_CONFIG.fuzzyIntegralGain;
    const fuzzyIntegralLimit = Number.isFinite(config.fuzzyIntegralLimit) && config.fuzzyIntegralLimit > 0
        ? config.fuzzyIntegralLimit
        : DEFAULT_LEVEL_CONTROLLER_CONFIG.fuzzyIntegralLimit;
    const shouldEnterRest = errorAbs <= deadband;
    const shouldMaintainRest = state.resting && errorAbs <= reactivationBand;

    if (shouldEnterRest || shouldMaintainRest) {
        state.integral = 0;
        state.lastError = error;
        state.derivative = 0;
        state.resting = true;

        return {
            u: 0,
            rawOutput: 0,
            error,
            integral: 0,
            derivative: 0,
            inRest: true,
            saturated: false,
            mode: LEVEL_CONTROLLER_MODES.FUZZY
        };
    }

    state.resting = false;
    if (state.lastError !== undefined && state.lastError * error < 0) {
        state.integral = 0;
    }

    const derivative = safeDt > 0 ? (error - (state.lastError || 0)) / safeDt : 0;
    state.lastError = error;
    state.derivative = Number.isFinite(derivative) ? derivative : 0;
    state.integral += error * safeDt;
    state.integral = clamp(state.integral, -fuzzyIntegralLimit, fuzzyIntegralLimit);

    const normalizedRate = clamp(state.derivative / derivativeScale, -1, 1);
    const errorMembership = fuzzify(error, FUZZY_ERROR_SETS);
    const rateMembership = fuzzify(normalizedRate, FUZZY_RATE_SETS);
    let weightedSum = 0;
    let activationSum = 0;

    FUZZY_TERMS.forEach((errorTerm) => {
        FUZZY_TERMS.forEach((rateTerm) => {
            const activation = Math.min(errorMembership[errorTerm], rateMembership[rateTerm]);
            if (activation <= 0) return;

            const outputTerm = FUZZY_RULES[errorTerm][rateTerm];
            weightedSum += activation * FUZZY_OUTPUT_SINGLETONS[outputTerm];
            activationSum += activation;
        });
    });

    const fuzzyOutput = activationSum > 0 ? weightedSum / activationSum : 0;
    const rawOutput = fuzzyOutput + (fuzzyIntegralGain * state.integral);
    const u = clamp(rawOutput, outputMin, outputMax);
    if (u !== rawOutput && fuzzyIntegralGain > 0) {
        state.integral = clamp((u - fuzzyOutput) / fuzzyIntegralGain, -fuzzyIntegralLimit, fuzzyIntegralLimit);
    }

    return {
        u,
        rawOutput,
        error,
        integral: state.integral,
        derivative: state.derivative,
        inRest: false,
        saturated: u !== rawOutput,
        mode: LEVEL_CONTROLLER_MODES.FUZZY
    };
}

export function calculateLevelControl(options = {}) {
    return options.mode === LEVEL_CONTROLLER_MODES.FUZZY
        ? calculateFuzzyLevelControl(options)
        : calculatePidLevelControl(options);
}
