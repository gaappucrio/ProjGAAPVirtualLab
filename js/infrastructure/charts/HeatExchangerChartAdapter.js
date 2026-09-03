import { getUnitSymbol, toDisplayValue } from '../../presentation/units/DisplayUnits.js';
import { t } from '../../presentation/i18n/LanguageManager.js';
import {
    DEFAULT_FLUID_SPECIFIC_HEAT_JKGK,
    EPSILON_FLOW,
    lpsToM3s
} from '../../domain/units/HydraulicUnits.js';

const HEAT_EXCHANGER_CURVE_POINT_COUNT = 40;
const DEFAULT_WATER_DENSITY_KG_M3 = 997;

const HEAT_EXCHANGER_CHART_COLORS = Object.freeze({
    stream1: '#e74c3c',
    stream1Fill: 'rgba(231, 76, 60, 0.08)',
    stream2: '#3498db',
    stream2Fill: 'rgba(52, 152, 219, 0.08)',
    operation1: '#c0392b',
    operation1Border: '#ffd8d2',
    operation2: '#2980b9',
    operation2Border: '#d4edfa'
});

function getGridColors() {
    const isDark = typeof document !== 'undefined' && document.body?.classList?.contains('theme-dark');
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
    const decimals = Math.abs(numericValue) > 0 && Math.abs(numericValue) < 1 ? 2 : 1;
    return numericValue.toLocaleString(undefined, {
        maximumFractionDigits: decimals,
        minimumFractionDigits: 0
    });
}

function getScaleProfile({ expanded = false } = {}) {
    return {
        titleFontSize: expanded ? 13 : 10,
        tickFontSize: expanded ? 12 : 10,
        legendFontSize: expanded ? 12 : 9,
        legendPadding: expanded ? 14 : 10,
        legendBoxSize: expanded ? 10 : 8,
        maxTicksX: expanded ? 7 : 5,
        maxTicksY: expanded ? 6 : 5,
        pointRadius: expanded ? 6 : 5,
        pointHoverRadius: expanded ? 8 : 7,
        layoutPadding: expanded
            ? { top: 10, right: 10, left: 8, bottom: 2 }
            : { top: 8, right: 6, left: 4, bottom: 0 }
    };
}

export function buildHeatExchangerCurveDatasets(component) {
    const tempUnit = getUnitSymbol('temperature');
    const t1In = finiteNumber(component?.temperaturaEntradaC, 25);
    const t1Out = finiteNumber(component?.temperaturaSaidaC, t1In);
    const duasCorrentes = component?.temDuasCorrentesConectadas?.() === true;
    const modo = component?.getModoEscoamento?.() || 'contracorrente';
    const tServico = finiteNumber(component?.temperaturaServicoC, 80);
    const t2In = duasCorrentes ? finiteNumber(component?.temperaturaEntrada2C, tServico) : tServico;
    const t2Out = duasCorrentes ? finiteNumber(component?.temperaturaSaida2C, tServico) : tServico;
    const ua = Math.max(0, finiteNumber(component?.uaWPorK, 2500));
    const v1 = Math.max(0, finiteNumber(component?.vazao1Lps ?? component?.fluxoReal, 0));
    const v2 = Math.max(0, finiteNumber(component?.vazao2Lps, 0));

    const context = component?.getSimulationContext?.() || {};
    const f1 = component?.getFluidoEntradaMisturadoPorPorta?.('in1')
        || context.queries?.getComponentFluid?.(component)
        || context.fluidoOperante;
    const cp1 = Math.max(1, finiteNumber(f1?.calorEspecificoJkgK, DEFAULT_FLUID_SPECIFIC_HEAT_JKGK));
    const den1 = Math.max(1, finiteNumber(f1?.densidade, DEFAULT_WATER_DENSITY_KG_M3));
    const m1 = lpsToM3s(v1) * den1;
    const c1 = m1 * cp1;

    const f2 = component?.getFluidoEntradaMisturadoPorPorta?.('in2') || context.fluidoOperante;
    const cp2 = Math.max(1, finiteNumber(f2?.calorEspecificoJkgK, DEFAULT_FLUID_SPECIFIC_HEAT_JKGK));
    const den2 = Math.max(1, finiteNumber(f2?.densidade, DEFAULT_WATER_DENSITY_KG_M3));
    const m2 = lpsToM3s(v2) * den2;
    const c2 = (duasCorrentes && v2 > EPSILON_FLOW) ? (m2 * cp2) : 0;

    const stream1Points = [];
    const stream2Points = [];

    for (let i = 0; i <= HEAT_EXCHANGER_CURVE_POINT_COUNT; i += 1) {
        const z = i / HEAT_EXCHANGER_CURVE_POINT_COUNT;
        const xPercent = z * 100;

        let t1 = t1In;
        let t2 = t2In;

        if (v1 <= EPSILON_FLOW || ua <= 0) {
            t1 = t1In;
            t2 = duasCorrentes ? t2In : tServico;
        } else if (!duasCorrentes || c2 <= 0) {
            // Modo utilidade térmica
            t2 = tServico;
            const ntu = ua / Math.max(Number.EPSILON, c1);
            if (ntu > 0.0001) {
                const decay = (1 - Math.exp(-ntu * z)) / (1 - Math.exp(-ntu));
                t1 = t1In + (t1Out - t1In) * decay;
            } else {
                t1 = t1In + (t1Out - t1In) * z;
            }
        } else if (modo === 'paralelo' || modo === 'cocorrente') {
            // Modo corrente paralela (co-corrente)
            const alpha = ua * ((1 / Math.max(Number.EPSILON, c1)) + (1 / Math.max(Number.EPSILON, c2)));
            let decay = z;
            if (alpha > 0.0001) {
                decay = (1 - Math.exp(-alpha * z)) / (1 - Math.exp(-alpha));
            }
            t1 = t1In + (t1Out - t1In) * decay;
            t2 = t2In + (t2Out - t2In) * decay;
        } else {
            // Modo contracorrente
            if (Math.abs(c1 - c2) < 0.001 * Math.max(c1, c2)) {
                t1 = t1In + (t1Out - t1In) * z;
                t2 = t2Out + (t2In - t2Out) * z;
            } else {
                const beta = ua * ((1 / Math.max(Number.EPSILON, c1)) - (1 / Math.max(Number.EPSILON, c2)));
                let decay = z;
                if (Math.abs(beta) > 0.0001) {
                    decay = (1 - Math.exp(-beta * z)) / (1 - Math.exp(-beta));
                }
                t1 = t1In + (t1Out - t1In) * decay;
                t2 = t2Out + (c1 / c2) * (t1 - t1In);
            }
        }

        stream1Points.push({
            x: xPercent,
            y: toDisplayValue('temperature', t1)
        });
        stream2Points.push({
            x: xPercent,
            y: toDisplayValue('temperature', t2)
        });
    }

    const in2X = (modo === 'paralelo' || modo === 'cocorrente') ? 0 : (duasCorrentes ? 100 : 0);
    const out2X = (modo === 'paralelo' || modo === 'cocorrente') ? 100 : (duasCorrentes ? 0 : 100);

    const operationPoints = [
        { x: 0, y: toDisplayValue('temperature', t1In), pointRole: 'in1' },
        { x: 100, y: toDisplayValue('temperature', t1Out), pointRole: 'out1' },
        { x: in2X, y: toDisplayValue('temperature', t2In), pointRole: 'in2' },
        { x: out2X, y: toDisplayValue('temperature', t2Out), pointRole: 'out2' }
    ];

    const allValues = [
        ...stream1Points.map((p) => p.y),
        ...stream2Points.map((p) => p.y),
        ...operationPoints.map((p) => p.y)
    ].filter(Number.isFinite);

    const minVal = allValues.length ? Math.min(...allValues) : 0;
    const maxVal = allValues.length ? Math.max(...allValues) : 100;
    const span = Math.max(5, maxVal - minVal);
    const yAxisMin = Math.floor(minVal - span * 0.1);
    const yAxisMax = Math.ceil(maxVal + span * 0.1);

    return {
        stream1Points,
        stream2Points,
        operationPoints,
        tempUnit,
        duasCorrentes,
        modo,
        t1In,
        t1Out,
        t2In,
        t2Out,
        tServico,
        yAxisMin,
        yAxisMax
    };
}

export function applyHeatExchangerChartPresentation(chart, datasets, { expanded = false } = {}) {
    if (!chart) return;

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

    chart.options.scales.x.title.text = `${t('chart.heatExchangerPosition')} (%)`;
    chart.options.scales.x.title.font = { size: profile.titleFontSize };
    chart.options.scales.x.title.color = colors.label;
    chart.options.scales.x.ticks.font = { size: profile.tickFontSize };
    chart.options.scales.x.ticks.maxTicksLimit = profile.maxTicksX;
    chart.options.scales.x.ticks.color = colors.tick;
    chart.options.scales.x.ticks.callback = (value) => `${formatAxisTick(value)}%`;
    chart.options.scales.x.min = 0;
    chart.options.scales.x.max = 100;
    chart.options.scales.x.grid.color = colors.grid;
    chart.options.scales.x.border.color = colors.border;

    chart.options.scales.y.title.text = `${t('chart.temperature')} (${datasets.tempUnit})`;
    chart.options.scales.y.title.font = { size: profile.titleFontSize };
    chart.options.scales.y.title.color = colors.label;
    chart.options.scales.y.ticks.font = { size: profile.tickFontSize };
    chart.options.scales.y.ticks.maxTicksLimit = profile.maxTicksY;
    chart.options.scales.y.ticks.color = colors.tick;
    chart.options.scales.y.ticks.callback = (value) => formatAxisTick(value);
    chart.options.scales.y.min = datasets.yAxisMin;
    chart.options.scales.y.max = datasets.yAxisMax;
    chart.options.scales.y.grid.color = colors.grid;
    chart.options.scales.y.border.color = colors.border;

    if (chart.data.datasets[2]) {
        chart.data.datasets[2].pointRadius = profile.pointRadius;
        chart.data.datasets[2].pointHoverRadius = profile.pointHoverRadius;
        chart.data.datasets[2].pointBorderWidth = expanded ? 2 : 1.5;
    }
}

function getTooltipLabel(ctx, datasets) {
    const value = Number(ctx.parsed.y);
    if (!Number.isFinite(value)) return ctx.dataset.label;

    if (ctx.datasetIndex === 0) {
        return `${t('chart.stream1')}: ${value.toFixed(1)} ${datasets.tempUnit}`;
    }
    if (ctx.datasetIndex === 1) {
        const stream2Name = datasets.duasCorrentes ? t('chart.stream2') : t('chart.utility');
        return `${stream2Name}: ${value.toFixed(1)} ${datasets.tempUnit}`;
    }

    const raw = ctx.raw;
    const role = raw?.pointRole;
    let roleLabel = t('chart.operatingPoints');
    if (role === 'in1') roleLabel = t('chart.stream1Inlet');
    else if (role === 'out1') roleLabel = t('chart.stream1Outlet');
    else if (role === 'in2') roleLabel = datasets.duasCorrentes ? t('chart.stream2Inlet') : t('chart.utilityService');
    else if (role === 'out2') roleLabel = datasets.duasCorrentes ? t('chart.stream2Outlet') : t('chart.utilityService');

    return `${roleLabel}: ${value.toFixed(1)} ${datasets.tempUnit}`;
}

export function createHeatExchangerChart(ctx, component, { expanded = false } = {}) {
    const datasets = buildHeatExchangerCurveDatasets(component);

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: `${t('chart.stream1')} (${datasets.tempUnit})`,
                    data: datasets.stream1Points,
                    borderColor: HEAT_EXCHANGER_CHART_COLORS.stream1,
                    backgroundColor: HEAT_EXCHANGER_CHART_COLORS.stream1Fill,
                    borderWidth: 2.5,
                    fill: false,
                    tension: 0.24,
                    pointRadius: 0,
                    borderCapStyle: 'round',
                    borderJoinStyle: 'round'
                },
                {
                    label: `${datasets.duasCorrentes ? t('chart.stream2') : t('chart.utility')} (${datasets.tempUnit})`,
                    data: datasets.stream2Points,
                    borderColor: HEAT_EXCHANGER_CHART_COLORS.stream2,
                    backgroundColor: HEAT_EXCHANGER_CHART_COLORS.stream2Fill,
                    borderWidth: 2.5,
                    fill: false,
                    tension: 0.24,
                    pointRadius: 0,
                    borderCapStyle: 'round',
                    borderJoinStyle: 'round'
                },
                {
                    label: t('chart.operatingPoints'),
                    type: 'scatter',
                    data: datasets.operationPoints,
                    borderColor: HEAT_EXCHANGER_CHART_COLORS.operation1Border,
                    backgroundColor: (pointCtx) => {
                        const raw = pointCtx.raw;
                        return raw?.pointRole?.includes('2')
                            ? HEAT_EXCHANGER_CHART_COLORS.operation2
                            : HEAT_EXCHANGER_CHART_COLORS.operation1;
                    },
                    pointRadius: 5,
                    pointHoverRadius: 6,
                    pointBorderWidth: 1.5,
                    clip: false
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
                        title: (tooltipCtx) => `${t('chart.heatExchangerPosition')}: ${Number(tooltipCtx[0].parsed.x).toFixed(0)}%`,
                        label: (tooltipCtx) => getTooltipLabel(tooltipCtx, datasets)
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: `${t('chart.heatExchangerPosition')} (%)` },
                    ticks: { maxTicksLimit: 6, color: getGridColors().tick },
                    grid: { color: getGridColors().grid },
                    border: { color: getGridColors().border }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: `${t('chart.temperature')} (${datasets.tempUnit})` },
                    ticks: { maxTicksLimit: 5, color: getGridColors().tick },
                    grid: { color: getGridColors().grid },
                    border: { color: getGridColors().border }
                }
            }
        }
    });

    applyHeatExchangerChartPresentation(chart, datasets, { expanded });
    chart.update();
    return chart;
}

export function refreshHeatExchangerChart(chart, component, { expanded = false } = {}) {
    if (!chart) return;

    const datasets = buildHeatExchangerCurveDatasets(component);

    chart.data.datasets[0].label = `${t('chart.stream1')} (${datasets.tempUnit})`;
    chart.data.datasets[0].data = datasets.stream1Points;

    chart.data.datasets[1].label = `${datasets.duasCorrentes ? t('chart.stream2') : t('chart.utility')} (${datasets.tempUnit})`;
    chart.data.datasets[1].data = datasets.stream2Points;

    chart.data.datasets[2].label = t('chart.operatingPoints');
    chart.data.datasets[2].data = datasets.operationPoints;

    chart.options.plugins.tooltip.callbacks.title = (tooltipCtx) =>
        `${t('chart.heatExchangerPosition')}: ${Number(tooltipCtx[0].parsed.x).toFixed(0)}%`;
    chart.options.plugins.tooltip.callbacks.label = (tooltipCtx) => getTooltipLabel(tooltipCtx, datasets);

    applyHeatExchangerChartPresentation(chart, datasets, { expanded });
    chart.update();
}
