import { pressureLossFromFlow } from '../../domain/components/BaseComponente.js';
import {
    VALVE_FLOW_COEFFICIENT_UNITS,
    cvToKv
} from '../../domain/components/ValvulaLogica.js';
import { getUnitSymbol, toDisplayValue } from '../../presentation/units/DisplayUnits.js';
import { t } from '../../presentation/i18n/LanguageManager.js';

const VALVE_CURVE_POINT_COUNT = 40;
const DEFAULT_WATER_DENSITY_KG_M3 = 997;
const LOG_SCALE_SPAN_THRESHOLD = 25;

const VALVE_CHART_COLORS = Object.freeze({
    cv: '#3498db',
    cvFill: 'rgba(52, 152, 219, 0.08)',
    pressureDrop: '#e74c3c',
    pressureDropFill: 'rgba(231, 76, 60, 0.08)',
    lossCoeff: '#f39c12',
    lossCoeffFill: 'rgba(243, 156, 18, 0.08)',
    operation: '#1abc9c',
    operationBorder: '#d7fff7'
});

function getGridColors() {
    const isDark = document.body.classList.contains('theme-dark');
    return {
        grid: isDark ? 'rgba(125, 153, 174, 0.28)' : '#e1e8ed',
        border: isDark ? 'rgba(155, 178, 193, 0.45)' : '#c9d8df',
        tick: isDark ? '#b8c9d6' : '#6c8392',
        label: isDark ? '#d8e4ec' : '#49606f',
        legend: isDark ? '#c5d5df' : '#5f6f7f',
        tooltipBg: isDark ? 'rgba(12, 20, 29, 0.94)' : 'rgba(44, 62, 80, 0.92)',
        tooltipBorder: isDark ? '#3b4e5d' : '#d8e3ea'
    };
}

function finiteNumber(value, fallback = 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

function formatAxisTick(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return value;
    const decimals = Math.abs(numericValue) > 0 && Math.abs(numericValue) < 1 ? 3 : 1;
    return numericValue.toLocaleString(undefined, {
        maximumFractionDigits: decimals,
        minimumFractionDigits: 0
    });
}

function getPositiveValues(points) {
    return points
        .map((point) => Number(point.y))
        .filter((value) => Number.isFinite(value) && value > 0);
}

function getMaxPointValue(points) {
    return Math.max(0, ...points.map((point) => Number(point.y) || 0));
}

function getMinPositivePointValue(points, fallback = 0.001) {
    const values = getPositiveValues(points);
    if (values.length === 0) return fallback;
    return Math.min(...values);
}

function shouldUseLogScale(points) {
    const positiveValues = getPositiveValues(points);
    if (positiveValues.length < 2) return false;
    return Math.max(...positiveValues) / Math.min(...positiveValues) > LOG_SCALE_SPAN_THRESHOLD;
}

function getValveFluid(component) {
    const context = component.getSimulationContext?.() || {};
    return context.queries?.getComponentFluid?.(component)
        || context.fluidoOperante
        || { densidade: DEFAULT_WATER_DENSITY_KG_M3 };
}

function getValveCoefficientUnit(component) {
    return component.getUnidadeCoeficienteVazao?.() === VALVE_FLOW_COEFFICIENT_UNITS.KV
        ? VALVE_FLOW_COEFFICIENT_UNITS.KV
        : VALVE_FLOW_COEFFICIENT_UNITS.CV;
}

function getValveCoefficientUnitLabel(unit) {
    return unit === VALVE_FLOW_COEFFICIENT_UNITS.KV ? 'Kv' : 'Cv';
}

function displayCoefficientFromCv(cv, unit) {
    return unit === VALVE_FLOW_COEFFICIENT_UNITS.KV ? cvToKv(cv) : cv;
}

function getEffectiveCoefficientLabel(datasets) {
    return t('chart.effectiveFlowCoefficient', { unit: datasets.coefficientUnitLabel });
}

function getScaleProfile({ expanded = false } = {}) {
    return {
        titleFontSize: expanded ? 13 : 10,
        tickFontSize: expanded ? 12 : 10,
        secondaryTickFontSize: expanded ? 11 : 9,
        legendFontSize: expanded ? 12 : 9,
        legendPadding: expanded ? 14 : 10,
        legendBoxSize: expanded ? 10 : 8,
        maxTicksX: expanded ? 7 : 5,
        maxTicksY: expanded ? 6 : 5,
        pointRadius: expanded ? 6 : 5,
        pointHoverRadius: expanded ? 8 : 7,
        showSecondaryTitles: expanded,
        layoutPadding: expanded
            ? { top: 10, right: 10, left: 8, bottom: 2 }
            : { top: 8, right: 6, left: 4, bottom: 0 }
    };
}

function buildValveCurveDatasets(component) {
    const pressureUnit = getUnitSymbol('pressure');
    const flowUnit = getUnitSymbol('flow');
    const fluid = getValveFluid(component);
    const coefficientUnit = getValveCoefficientUnit(component);
    const coefficientUnitLabel = getValveCoefficientUnitLabel(coefficientUnit);
    const density = finiteNumber(fluid?.densidade, DEFAULT_WATER_DENSITY_KG_M3);
    const currentFlowLps = Math.max(0, finiteNumber(component.fluxoReal, 0));
    const currentOpeningPercent = Math.max(0, Math.min(100, finiteNumber(
        component.aberturaEfetiva,
        finiteNumber(component.grauAbertura, 0)
    )));
    const currentParams = component.getParametrosHidraulicos?.(currentOpeningPercent / 100)
        || { effectiveCv: 0, localLossCoeff: 0, hydraulicAreaM2: 0 };
    const cvPoints = [];
    const pressureDropPoints = [];
    const lossCoeffPoints = [];

    for (let i = 0; i <= VALVE_CURVE_POINT_COUNT; i += 1) {
        const openingPercent = (100 * i) / VALVE_CURVE_POINT_COUNT;
        const opening = openingPercent / 100;
        const params = component.getParametrosHidraulicos(opening);
        const isOpen = params.opening > 0 && params.hydraulicAreaM2 > 0;
        const pressureDropBar = isOpen
            ? pressureLossFromFlow(currentFlowLps, params.hydraulicAreaM2, density, params.localLossCoeff)
            : null;

        cvPoints.push({
            x: openingPercent,
            y: finiteNumber(displayCoefficientFromCv(params.effectiveCv, coefficientUnit), 0)
        });
        pressureDropPoints.push({
            x: openingPercent,
            y: pressureDropBar === null ? null : toDisplayValue('pressure', pressureDropBar)
        });
        lossCoeffPoints.push({
            x: openingPercent,
            y: isOpen ? finiteNumber(params.localLossCoeff, 0) : null
        });
    }

    const estimatedCurrentPressureDropBar = pressureLossFromFlow(
        currentFlowLps,
        currentParams.hydraulicAreaM2,
        density,
        currentParams.localLossCoeff
    );
    const measuredCurrentPressureDropBar = finiteNumber(component.deltaPAtualBar, NaN);
    const currentPressureDropBar = measuredCurrentPressureDropBar > 0
        ? measuredCurrentPressureDropBar
        : estimatedCurrentPressureDropBar;
    const currentPressureDrop = toDisplayValue('pressure', Math.max(0, currentPressureDropBar));
    const currentFlow = toDisplayValue('flow', currentFlowLps);
    const pressureAxisMax = Math.max(1, getMaxPointValue(pressureDropPoints) * 1.08, currentPressureDrop * 1.08);
    const lossCoeffAxisMax = Math.max(1, getMaxPointValue(lossCoeffPoints) * 1.08);
    const useLogPressureScale = shouldUseLogScale(pressureDropPoints);
    const useLogLossCoeffScale = shouldUseLogScale(lossCoeffPoints);

    return {
        cvPoints,
        pressureDropPoints,
        lossCoeffPoints,
        currentOpeningPercent,
        currentPressureDrop,
        currentEffectiveCv: finiteNumber(currentParams.effectiveCv, 0),
        currentEffectiveFlowCoefficient: finiteNumber(displayCoefficientFromCv(currentParams.effectiveCv, coefficientUnit), 0),
        coefficientUnit,
        coefficientUnitLabel,
        currentLossCoeff: finiteNumber(currentParams.localLossCoeff, 0),
        currentFlow,
        flowUnit,
        pressureUnit,
        cvAxisMax: Math.max(
            1,
            getMaxPointValue(cvPoints) * 1.08,
            finiteNumber(displayCoefficientFromCv(component.cv, coefficientUnit), 0) * 1.08
        ),
        pressureAxisMin: useLogPressureScale
            ? getMinPositivePointValue(pressureDropPoints) * 0.85
            : 0,
        pressureAxisMax,
        lossCoeffAxisMin: useLogLossCoeffScale
            ? getMinPositivePointValue(lossCoeffPoints) * 0.85
            : 0,
        lossCoeffAxisMax,
        useLogPressureScale,
        useLogLossCoeffScale
    };
}

function applyValveChartPresentation(chart, datasets, { expanded = false } = {}) {
    if (!chart) return;

    const yAxisMode = chart.yAxisMode || 'yPressure';
    const profile = getScaleProfile({ expanded });
    const colors = getGridColors();

    chart.options.layout.padding = profile.layoutPadding;
    chart.options.plugins.legend.position = 'bottom';
    chart.options.plugins.legend.align = 'center';
    chart.options.plugins.legend.labels.boxWidth = profile.legendBoxSize;
    chart.options.plugins.legend.labels.boxHeight = profile.legendBoxSize;
    chart.options.plugins.legend.labels.padding = profile.legendPadding;
    chart.options.plugins.legend.labels.font = { size: profile.legendFontSize };
    chart.options.plugins.legend.labels.color = colors.legend;

    chart.options.scales.x.title.text = `${t('chart.opening')} (%)`;
    chart.options.scales.x.title.font = { size: profile.titleFontSize };
    chart.options.scales.x.title.color = colors.label;
    chart.options.scales.x.ticks.font = { size: profile.tickFontSize };
    chart.options.scales.x.ticks.maxTicksLimit = profile.maxTicksX;
    chart.options.scales.x.ticks.color = colors.tick;
    chart.options.scales.x.ticks.callback = (value) => formatAxisTick(value);
    chart.options.scales.x.min = 0;
    chart.options.scales.x.max = 100;
    chart.options.scales.x.grid.color = colors.grid;
    chart.options.scales.x.border.color = colors.border;

    chart.options.scales.yPressure.type = datasets.useLogPressureScale ? 'logarithmic' : 'linear';
    chart.options.scales.yPressure.title.text = `${t('chart.estimatedPressureDrop')} (${datasets.pressureUnit})`;
    chart.options.scales.yPressure.title.font = { size: profile.titleFontSize };
    chart.options.scales.yPressure.title.color = colors.label;
    chart.options.scales.yPressure.ticks.font = { size: profile.tickFontSize };
    chart.options.scales.yPressure.ticks.maxTicksLimit = profile.maxTicksY;
    chart.options.scales.yPressure.ticks.color = colors.tick;
    chart.options.scales.yPressure.ticks.callback = (value) => formatAxisTick(value);
    chart.options.scales.yPressure.min = datasets.pressureAxisMin;
    chart.options.scales.yPressure.max = datasets.pressureAxisMax;
    chart.options.scales.yPressure.border.color = colors.border;

    chart.options.scales.yCv.title.text = getEffectiveCoefficientLabel(datasets);
    chart.options.scales.yCv.title.font = { size: profile.titleFontSize };
    chart.options.scales.yCv.title.color = colors.label;
    chart.options.scales.yCv.ticks.font = { size: profile.secondaryTickFontSize };
    chart.options.scales.yCv.ticks.maxTicksLimit = profile.maxTicksY;
    chart.options.scales.yCv.ticks.color = colors.tick;
    chart.options.scales.yCv.ticks.callback = (value) => formatAxisTick(value);
    chart.options.scales.yCv.min = 0;
    chart.options.scales.yCv.max = datasets.cvAxisMax;
    chart.options.scales.yCv.border.color = colors.border;

    if (yAxisMode === 'yPressure') {
        chart.options.scales.yPressure.display = true;
        chart.options.scales.yPressure.position = 'left';
        chart.options.scales.yPressure.grid.drawOnChartArea = true;
        chart.options.scales.yPressure.grid.color = colors.grid;
        chart.options.scales.yPressure.title.display = true;

        chart.options.scales.yCv.display = true;
        chart.options.scales.yCv.position = 'right';
        chart.options.scales.yCv.grid.drawOnChartArea = false;
        chart.options.scales.yCv.title.display = profile.showSecondaryTitles;
    } else if (yAxisMode === 'yCv') {
        chart.options.scales.yCv.display = true;
        chart.options.scales.yCv.position = 'left';
        chart.options.scales.yCv.grid.drawOnChartArea = true;
        chart.options.scales.yCv.grid.color = colors.grid;
        chart.options.scales.yCv.title.display = true;

        chart.options.scales.yPressure.display = true;
        chart.options.scales.yPressure.position = 'right';
        chart.options.scales.yPressure.grid.drawOnChartArea = false;
        chart.options.scales.yPressure.title.display = profile.showSecondaryTitles;
    }

    chart.data.datasets[2].pointRadius = profile.pointRadius;
    chart.data.datasets[2].pointHoverRadius = profile.pointHoverRadius;
    chart.data.datasets[2].pointBorderWidth = expanded ? 2 : 1.5;
}

function getTooltipLabel(ctx, datasets) {
    const value = Number(ctx.parsed.y);
    if (!Number.isFinite(value)) return ctx.dataset.label;

    if (ctx.dataset.yAxisID === 'yPressure') {
        return `${ctx.dataset.label}: ${value.toFixed(2)}`;
    }
    if (ctx.dataset.yAxisID === 'yCv') {
        return `${ctx.dataset.label}: ${value.toFixed(2)}`;
    }
    return `${t('chart.currentPoint')}: ${value.toFixed(2)}`;
}

export function createValveChart(ctx, component, { expanded = false, yAxisMode = 'yPressure' } = {}) {
    const datasets = buildValveCurveDatasets(component);

    let currentY = datasets.currentPressureDrop;
    if (yAxisMode === 'yCv') {
        currentY = datasets.currentEffectiveFlowCoefficient;
    }

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: getEffectiveCoefficientLabel(datasets),
                    data: datasets.cvPoints,
                    borderColor: VALVE_CHART_COLORS.cv,
                    backgroundColor: VALVE_CHART_COLORS.cvFill,
                    borderWidth: 2.5,
                    fill: false,
                    tension: 0.24,
                    yAxisID: 'yCv',
                    pointRadius: 0,
                    borderCapStyle: 'round',
                    borderJoinStyle: 'round'
                },
                {
                    label: `${t('chart.estimatedPressureDrop')} (${datasets.pressureUnit})`,
                    data: datasets.pressureDropPoints,
                    borderColor: VALVE_CHART_COLORS.pressureDrop,
                    backgroundColor: VALVE_CHART_COLORS.pressureDropFill,
                    borderWidth: 2.5,
                    fill: false,
                    tension: 0.24,
                    yAxisID: 'yPressure',
                    pointRadius: 0,
                    borderCapStyle: 'round',
                    borderJoinStyle: 'round'
                },
                {
                    label: t('chart.operation'),
                    type: 'scatter',
                    data: [{ x: datasets.currentOpeningPercent, y: currentY }],
                    borderColor: VALVE_CHART_COLORS.operationBorder,
                    backgroundColor: VALVE_CHART_COLORS.operation,
                    pointRadius: 5,
                    pointHoverRadius: 6,
                    pointBorderWidth: 1.5,
                    clip: false,
                    yAxisID: yAxisMode
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'nearest', intersect: false },
            layout: { padding: { top: 8, right: 8, left: 4, bottom: 0 } },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 8,
                        boxHeight: 8,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 12,
                        font: { size: 10 }
                    }
                },
                tooltip: {
                    backgroundColor: getGridColors().tooltipBg,
                    borderColor: getGridColors().tooltipBorder,
                    borderWidth: 1,
                    padding: 10,
                    displayColors: true,
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    callbacks: {
                        title: (ctx) => `${t('chart.opening')}: ${Number(ctx[0].parsed.x).toFixed(1)}%`,
                        label: (ctx) => getTooltipLabel(ctx, datasets)
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: `${t('chart.opening')} (%)` },
                    ticks: { maxTicksLimit: 6, color: getGridColors().tick },
                    grid: { color: getGridColors().grid },
                    border: { color: getGridColors().border }
                },
                yPressure: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: `${t('chart.estimatedPressureDrop')} (${datasets.pressureUnit})` },
                    ticks: { maxTicksLimit: 5, color: getGridColors().tick },
                    grid: { color: getGridColors().grid },
                    border: { color: getGridColors().border }
                },
                yCv: {
                    type: 'linear',
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    border: { color: getGridColors().border },
                    title: { display: true, text: getEffectiveCoefficientLabel(datasets) },
                    ticks: { maxTicksLimit: 5, color: getGridColors().tick }
                }
            }
        }
    });

    chart.yAxisMode = yAxisMode;
    applyValveChartPresentation(chart, datasets, { expanded });
    chart.update();
    return chart;
}

export function refreshValveChart(chart, component, { expanded = false } = {}) {
    if (!chart) return;

    const yAxisMode = chart.yAxisMode || 'yPressure';
    const datasets = buildValveCurveDatasets(component);

    let currentY = datasets.currentPressureDrop;
    if (yAxisMode === 'yCv') {
        currentY = datasets.currentEffectiveFlowCoefficient;
    }

    chart.data.datasets[0].label = getEffectiveCoefficientLabel(datasets);
    chart.data.datasets[0].data = datasets.cvPoints;
    chart.data.datasets[1].label = `${t('chart.estimatedPressureDrop')} (${datasets.pressureUnit})`;
    chart.data.datasets[1].data = datasets.pressureDropPoints;
    chart.data.datasets[2].label = t('chart.operation');
    chart.data.datasets[2].data = [{ x: datasets.currentOpeningPercent, y: currentY }];
    chart.data.datasets[2].yAxisID = yAxisMode;
    chart.options.plugins.tooltip.callbacks.title = (ctx) =>
        `${t('chart.opening')}: ${Number(ctx[0].parsed.x).toFixed(1)}%`;
    chart.options.plugins.tooltip.callbacks.label = (ctx) => getTooltipLabel(ctx, datasets);

    applyValveChartPresentation(chart, datasets, { expanded });
    chart.update();
}