import { clamp } from '../components/BaseComponente.js';
import { EPSILON_FLOW } from '../units/HydraulicUnits.js';

const CV_MIN = 0.05;
const CV_MAX = 800;
const K_MIN = 0;
const K_MAX = 100;
const OPENING_WARNING_PERCENT = 72;
const OPENING_DANGER_PERCENT = 88;
const PRESSURE_DROP_WARNING_BAR = 0.08;
const PRESSURE_DROP_DANGER_BAR = 0.2;
const PRESSURE_FRACTION_WARNING = 0.24;
const PRESSURE_FRACTION_DANGER = 0.42;
const K_WARNING = 8;
const K_DANGER = 18;
const TARGET_PRESSURE_FRACTION = 0.18;
const MIN_TARGET_DELTA_P_BAR = 0.03;

function finiteNumber(value, fallback = 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

function getFlowLps(valve) {
    return Math.max(
        0,
        finiteNumber(valve?.fluxoReal, 0),
        finiteNumber(valve?.estadoHidraulico?.saidaVazaoLps, 0),
        finiteNumber(valve?.estadoHidraulico?.entradaVazaoLps, 0)
    );
}

function getPressureDropBar(valve) {
    const directDrop = finiteNumber(valve?.deltaPAtualBar, NaN);
    if (Number.isFinite(directDrop)) return Math.max(0, directDrop);

    const inletPressureBar = finiteNumber(valve?.pressaoEntradaAtualBar, 0);
    const outletPressureBar = finiteNumber(valve?.pressaoSaidaAtualBar, 0);
    return Math.max(0, inletPressureBar - outletPressureBar);
}

function pressureDropFraction(valve, deltaPBar) {
    const inletPressureBar = Math.max(0, finiteNumber(valve?.pressaoEntradaAtualBar, 0));
    const outletPressureBar = Math.max(0, finiteNumber(valve?.pressaoSaidaAtualBar, 0));
    const availablePressureBar = Math.max(inletPressureBar, outletPressureBar + deltaPBar, deltaPBar);
    if (availablePressureBar <= EPSILON_FLOW) return 0;
    return clamp(deltaPBar / availablePressureBar, 0, 1);
}

function severityFrom({ flowLps, openingPercent, deltaPBar, fraction, localLossCoeff }) {
    if (flowLps <= EPSILON_FLOW || openingPercent <= 0 || deltaPBar <= EPSILON_FLOW) return 'ok';

    const danger = openingPercent >= OPENING_DANGER_PERCENT
        && (
            deltaPBar >= PRESSURE_DROP_DANGER_BAR
            || fraction >= PRESSURE_FRACTION_DANGER
            || localLossCoeff >= K_DANGER
        );
    if (danger) return 'undersized';

    const warning = openingPercent >= OPENING_WARNING_PERCENT
        && (
            deltaPBar >= PRESSURE_DROP_WARNING_BAR
            || fraction >= PRESSURE_FRACTION_WARNING
            || localLossCoeff >= K_WARNING
        );
    return warning ? 'attention' : 'ok';
}

function buildSuggestions(valve, deltaPBar, fraction) {
    const currentCv = Math.max(CV_MIN, finiteNumber(valve?.cv, CV_MIN));
    const currentK = clamp(finiteNumber(valve?.perdaLocalK, 0), K_MIN, K_MAX);
    const inletPressureBar = Math.max(0, finiteNumber(valve?.pressaoEntradaAtualBar, deltaPBar));
    const targetDeltaPBar = Math.max(
        MIN_TARGET_DELTA_P_BAR,
        Math.min(deltaPBar, inletPressureBar * TARGET_PRESSURE_FRACTION)
    );
    const pressureRatio = deltaPBar > targetDeltaPBar
        ? Math.sqrt(deltaPBar / targetDeltaPBar)
        : 1;
    const frictionRatio = deltaPBar > EPSILON_FLOW
        ? clamp(targetDeltaPBar / deltaPBar, 0, 1)
        : 1;

    const suggestedCv = clamp(currentCv * pressureRatio, currentCv, CV_MAX);
    const suggestedK = clamp(currentK * frictionRatio, K_MIN, currentK);

    return {
        cvSugerido: suggestedCv,
        perdaLocalKSugerida: suggestedK,
        quedaPressaoAlvoBar: targetDeltaPBar,
        fracaoQuedaPressao: fraction,
        aplicavel: suggestedCv > currentCv + 0.05 || suggestedK < currentK - 0.001
    };
}

export function diagnosticarDimensionamentoValvula(valve) {
    const parametros = valve?.getParametrosHidraulicos?.() ?? {};
    const flowLps = getFlowLps(valve);
    const openingPercent = Math.max(0, finiteNumber(valve?.aberturaEfetiva, 0));
    const deltaPBar = getPressureDropBar(valve);
    const fraction = pressureDropFraction(valve, deltaPBar);
    const localLossCoeff = Math.max(0, finiteNumber(parametros.localLossCoeff, 0));
    const severity = severityFrom({
        flowLps,
        openingPercent,
        deltaPBar,
        fraction,
        localLossCoeff
    });

    return {
        status: severity,
        ativo: severity !== 'ok',
        fluxoLps: flowLps,
        aberturaPercent: openingPercent,
        quedaPressaoBar: deltaPBar,
        perdaLocalTotalK: localLossCoeff,
        cvAtual: Math.max(CV_MIN, finiteNumber(valve?.cv, CV_MIN)),
        perdaLocalKAtual: clamp(finiteNumber(valve?.perdaLocalK, 0), K_MIN, K_MAX),
        ...buildSuggestions(valve, deltaPBar, fraction)
    };
}

export function aplicarAjusteDimensionamentoValvula(valve) {
    const diagnostico = diagnosticarDimensionamentoValvula(valve);
    if (!diagnostico.ativo || !diagnostico.aplicavel) {
        return {
            aplicado: false,
            diagnostico
        };
    }

    if (valve?.estaControladaPorSetpoint?.()) {
        return {
            aplicado: false,
            bloqueadoPorSetpoint: true,
            diagnostico
        };
    }

    valve?.aplicarPerfilCaracteristica?.('custom');
    const cvAplicado = valve?.setCoeficienteVazao?.(diagnostico.cvSugerido) !== false;
    const kAplicado = valve?.setCoeficientePerda?.(diagnostico.perdaLocalKSugerida) !== false;

    return {
        aplicado: cvAplicado || kAplicado,
        diagnostico,
        cvAplicado: valve?.cv,
        perdaLocalKAplicada: valve?.perdaLocalK
    };
}
