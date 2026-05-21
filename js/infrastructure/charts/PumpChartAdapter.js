import { getUnitSymbol, toDisplayValue } from '../../presentation/units/DisplayUnits.js';
import { t } from '../../presentation/i18n/LanguageManager.js';

const DEFAULT_NPSH_AXIS_MAX_M = 5;
const PUMP_CURVE_POINT_COUNT = 32;

const PUMP_CHART_COLORS = Object.freeze({
    head: '#3498db',
    headFill: 'rgba(52, 152, 219, 0.1)',
    efficiency: '#2ecc71',
    efficiencyFill: 'rgba(46, 204, 113, 0.1)',
    npsh: '#f39c12',
    npshFill: 'rgba(243, 156, 18, 0.1)',
    operation: '#e74c3c',
    operationBorder: '#ffd8d2'
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

function formatAxisTick(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return value;
    const decimals = Math.abs(numericValue) > 0 && Math.abs(numericValue) < 1 ? 3 : 1;
    return numericValue.toLocaleString(undefined, {
        maximumFractionDigits: decimals,
        minimumFractionDigits: 0
    });
}

function getMaxPointValue(points) {
    return Math.max(0, ...points.map((point) => Number(point.y) || 0));
}

export function buildPumpCurveDatasets(component) {
    const qMax = Math.max(1, component.vazaoNominal);
    const pressureUnit = getUnitSymbol('pressure');
    const flowUnit = getUnitSymbol('flow');
    const lengthUnit = getUnitSymbol('length');
    const headPoints = [];
    const efficiencyPoints = [];
    const npshPoints = [];

    for (let i = 0; i <= PUMP_CURVE_POINT_COUNT; i += 1) {
        const flowLps = (qMax * i) / PUMP_CURVE_POINT_COUNT;
        const flowDisplay = toDisplayValue('flow', flowLps);
        headPoints.push({ x: flowDisplay, y: toDisplayValue('pressure', component.getCurvaPressaoBar(flowLps, 1)) });
        efficiencyPoints.push({ x: flowDisplay, y: component.getCurvaEficiencia(flowLps, 1) * 100 });
        npshPoints.push({ x: flowDisplay, y: toDisplayValue('length', component.getCurvaNpshRequeridoM(flowLps, 1)) });
    }

    return {
        headPoints,
        efficiencyPoints,
        npshPoints,
        currentFlow: toDisplayValue('flow', component.fluxoReal),
        currentHead: toDisplayValue('pressure', component.cargaGeradaBar || 0),
        flowUnit,
        pressureUnit,
        lengthUnit,
        flowAxisMax: toDisplayValue('flow', Math.max(qMax, component.fluxoReal || 0)),
        pressureAxisMax: Math.max(
            1,
            getMaxPointValue(headPoints) * 1.08,
            toDisplayValue('pressure', Math.max(0, component.pressaoMaxima || 0)) * 1.08
        ),
        npshAxisMax: toDisplayValue('length', Math.max(DEFAULT_NPSH_AXIS_MAX_M, component.npshRequeridoM || 0))
    };
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
        showSecondaryTitles: false,
        layoutPadding: expanded
            ? { top: 10, right: 10, left: 8, bottom: 2 }
            : { top: 8, right: 6, left: 4, bottom: 0 }
    };
}

export function applyPumpChartPresentation(chart, datasets, { expanded = false } = {}) {
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

    chart.options.scales.x.title.text = `${t('chart.flow')} (${datasets.flowUnit})`;
    chart.options.scales.x.title.font = { size: profile.titleFontSize };
    chart.options.scales.x.title.color = colors.label;
    chart.options.scales.x.ticks.font = { size: profile.tickFontSize };
    chart.options.scales.x.ticks.maxTicksLimit = profile.maxTicksX;
    chart.options.scales.x.ticks.color = colors.tick;
    chart.options.scales.x.ticks.callback = (value) => formatAxisTick(value);
    chart.options.scales.x.min = 0;
    chart.options.scales.x.max = datasets.flowAxisMax;
    chart.options.scales.x.grid.color = colors.grid;
    chart.options.scales.x.border.color = colors.border;

    chart.options.scales.yHead.title.text = `${t('chart.head')} (${datasets.pressureUnit})`;
    chart.options.scales.yHead.title.font = { size: profile.titleFontSize };
    chart.options.scales.yHead.title.color = colors.label;
    chart.options.scales.yHead.ticks.font = { size: profile.tickFontSize };
    chart.options.scales.yHead.ticks.maxTicksLimit = profile.maxTicksY;
    chart.options.scales.yHead.min = 0;
    chart.options.scales.yHead.max = datasets.pressureAxisMax;
    chart.options.scales.yHead.suggestedMax = datasets.pressureAxisMax;
    chart.options.scales.yHead.ticks.color = colors.tick;
    chart.options.scales.yHead.ticks.callback = (value) => formatAxisTick(value);
    chart.options.scales.yHead.grid.color = colors.grid;
    chart.options.scales.yHead.border.color = colors.border;

    chart.options.scales.yEff.display = true;
    chart.options.scales.yEff.title.display = profile.showSecondaryTitles;
    chart.options.scales.yEff.title.text = `${t('chart.efficiency')} (%)`;
    chart.options.scales.yEff.title.font = { size: profile.titleFontSize };
    chart.options.scales.yEff.title.color = colors.label;
    chart.options.scales.yEff.ticks.font = { size: profile.secondaryTickFontSize };
    chart.options.scales.yEff.ticks.maxTicksLimit = profile.maxTicksY;
    chart.options.scales.yEff.ticks.color = colors.tick;
    chart.options.scales.yEff.border.color = colors.border;

    chart.options.scales.yNpsh.display = false;
    chart.options.scales.yNpsh.title.display = false;
    chart.options.scales.yNpsh.title.text = `NPSHr (${datasets.lengthUnit})`;
    chart.options.scales.yNpsh.title.font = { size: profile.titleFontSize };
    chart.options.scales.yNpsh.ticks.font = { size: profile.secondaryTickFontSize };
    chart.options.scales.yNpsh.ticks.maxTicksLimit = profile.maxTicksY;
    chart.options.scales.yNpsh.min = 0;
    chart.options.scales.yNpsh.max = datasets.npshAxisMax;
    chart.options.scales.yNpsh.suggestedMax = datasets.npshAxisMax;
    chart.options.scales.yNpsh.ticks.color = colors.tick;
    chart.options.scales.yNpsh.border.color = colors.border;

    chart.data.datasets[3].pointRadius = profile.pointRadius;
    chart.data.datasets[3].pointHoverRadius = profile.pointHoverRadius;
    chart.data.datasets[3].pointBorderWidth = expanded ? 2 : 1.5;
}

export function createPumpChart(ctx, component, { expanded = false } = {}) {
    const datasets = buildPumpCurveDatasets(component);

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: t('chart.head'),
                    data: datasets.headPoints,
                    borderColor: PUMP_CHART_COLORS.head,
                    backgroundColor: PUMP_CHART_COLORS.headFill,
                    borderWidth: 2.5,
                    fill: false,
                    tension: 0.28,
                    yAxisID: 'yHead',
                    pointRadius: 0,
                    borderCapStyle: 'round',
                    borderJoinStyle: 'round'
                },
                {
                    label: t('chart.efficiency'),
                    data: datasets.efficiencyPoints,
                    borderColor: PUMP_CHART_COLORS.efficiency,
                    backgroundColor: PUMP_CHART_COLORS.efficiencyFill,
                    borderWidth: 2.5,
                    fill: false,
                    tension: 0.28,
                    yAxisID: 'yEff',
                    pointRadius: 0,
                    borderCapStyle: 'round',
                    borderJoinStyle: 'round'
                },
                {
                    label: 'NPSHr',
                    data: datasets.npshPoints,
                    borderColor: PUMP_CHART_COLORS.npsh,
                    backgroundColor: PUMP_CHART_COLORS.npshFill,
                    borderDash: [6, 4],
                    borderWidth: 2,
                    fill: false,
                    tension: 0.28,
                    yAxisID: 'yNpsh',
                    pointRadius: 0,
                    borderCapStyle: 'round',
                    borderJoinStyle: 'round'
                },
                {
                    label: t('chart.operation'),
                    type: 'scatter',
                    data: [{ x: datasets.currentFlow, y: datasets.currentHead }],
                    borderColor: PUMP_CHART_COLORS.operationBorder,
                    backgroundColor: PUMP_CHART_COLORS.operation,
                    pointRadius: 5,
                    pointHoverRadius: 6,
                    pointBorderWidth: 1.5,
                    clip: false,
                    yAxisID: 'yHead'
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
                        title: (ctx) => `${t('chart.flow')}: ${Number(ctx[0].parsed.x).toFixed(2)} ${datasets.flowUnit}`,
                        label: (ctx) => {
                            if (ctx.dataset.yAxisID === 'yHead') {
                                return `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.pressureUnit}`;
                            }
                            if (ctx.dataset.yAxisID === 'yEff') {
                                return `${t('chart.efficiency')}: ${Number(ctx.parsed.y).toFixed(1)} %`;
                            }
                            if (ctx.dataset.yAxisID === 'yNpsh') {
                                return `NPSHr: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.lengthUnit}`;
                            }
                            return `${t('chart.currentPoint')}: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.pressureUnit}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: `${t('chart.flow')} (${datasets.flowUnit})` },
                    ticks: { maxTicksLimit: 6, color: getGridColors().tick },
                    grid: { color: getGridColors().grid },
                    border: { color: getGridColors().border }
                },
                yHead: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: `${t('chart.head')} (${datasets.pressureUnit})` },
                    ticks: { maxTicksLimit: 5, color: getGridColors().tick },
                    grid: { color: getGridColors().grid },
                    border: { color: getGridColors().border }
                },
                yEff: {
                    type: 'linear',
                    position: 'right',
                    min: 0,
                    max: 100,
                    grid: { drawOnChartArea: false },
                    border: { color: getGridColors().border },
                    title: { display: false, text: `${t('chart.efficiency')} (%)` },
                    ticks: {
                        maxTicksLimit: 5,
                        callback: (value) => `${value}%`,
                        color: getGridColors().tick
                    }
                },
                yNpsh: {
                    type: 'linear',
                    position: 'right',
                    offset: true,
                    display: false,
                    grid: { drawOnChartArea: false },
                    title: { display: false, text: `NPSHr (${datasets.lengthUnit})` },
                    ticks: { maxTicksLimit: 5, color: getGridColors().tick }
                }
            }
        }
    });

    applyPumpChartPresentation(chart, datasets, { expanded });
    chart.update('none');
    return chart;
}

export function refreshPumpChart(chart, component, { expanded = false } = {}) {
    if (!chart) return;

    const datasets = buildPumpCurveDatasets(component);
    chart.data.datasets[0].label = t('chart.head');
    chart.data.datasets[0].data = datasets.headPoints;
    chart.data.datasets[1].label = t('chart.efficiency');
    chart.data.datasets[1].data = datasets.efficiencyPoints;
    chart.data.datasets[2].label = 'NPSHr';
    chart.data.datasets[2].data = datasets.npshPoints;
    chart.data.datasets[3].label = t('chart.operation');
    chart.data.datasets[3].data = [{ x: datasets.currentFlow, y: datasets.currentHead }];
    chart.options.plugins.tooltip.callbacks.title = (ctx) => `${t('chart.flow')}: ${Number(ctx[0].parsed.x).toFixed(2)} ${datasets.flowUnit}`;
    chart.options.plugins.tooltip.callbacks.label = (ctx) => {
        if (ctx.dataset.yAxisID === 'yHead') {
            return `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.pressureUnit}`;
        }
        if (ctx.dataset.yAxisID === 'yEff') {
            return `${t('chart.efficiency')}: ${Number(ctx.parsed.y).toFixed(1)} %`;
        }
        if (ctx.dataset.yAxisID === 'yNpsh') {
            return `NPSHr: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.lengthUnit}`;
        }
        return `${t('chart.currentPoint')}: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.pressureUnit}`;
    };

    applyPumpChartPresentation(chart, datasets, { expanded });
    chart.update('none');
}
