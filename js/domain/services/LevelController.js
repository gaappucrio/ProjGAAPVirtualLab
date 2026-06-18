import { clamp } from '../components/BaseComponente.js';

const DEFAULT_LEVEL_CONTROLLER_CONFIG = Object.freeze({
    deadband: 0.0025,
    reactivationBand: 0.0075,
    outputMin: -1,
    outputMax: 1
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
            saturated: false
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
        saturated: u !== rawOutput
    };
}

export function calculateLevelControl(options = {}) {
    return calculatePidLevelControl(options);
}
