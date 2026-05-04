import { getUnitSymbol, toDisplayValue } from '../../utils/Units.js';

const DEFAULT_PRESSURE_AXIS_MAX_BAR = 10;
const DEFAULT_NPSH_AXIS_MAX_M = 5;

export function buildPumpCurveDatasets(component) {
    const qMax = Math.max(1, component.vazaoNominal);
    const pressureUnit = getUnitSymbol('pressure');
    const flowUnit = getUnitSymbol('flow');
    const lengthUnit = getUnitSymbol('length');
    const headPoints = [];
    const efficiencyPoints = [];
    const npshPoints = [];

    for (let i = 0; i <= 18; i += 1) {
        const flowLps = (qMax * i) / 18;
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
        pressureAxisMax: toDisplayValue('pressure', Math.max(DEFAULT_PRESSURE_AXIS_MAX_BAR, component.pressaoMaxima || 0)),
        npshAxisMax: toDisplayValue('length', Math.max(DEFAULT_NPSH_AXIS_MAX_M, component.npshRequeridoM || 0))
    };
}

function getScaleProfile({ expanded = false } = {}) {
    return {
        titleFontSize: expanded ? 13 : 10,
        tickFontSize: expanded ? 12 : 10,
        secondaryTickFontSize: expanded ? 11 : 9,
        legendFontSize: expanded ? 12 : 10,
        legendPadding: expanded ? 16 : 12,
        legendBoxSize: expanded ? 10 : 8,
        maxTicksX: expanded ? 8 : 6,
        maxTicksY: expanded ? 6 : 5,
        pointRadius: expanded ? 7 : 5,
        pointHoverRadius: expanded ? 8 : 6,
        showSecondaryTitles: expanded,
        layoutPadding: expanded
            ? { top: 14, right: 18, left: 10, bottom: 6 }
            : { top: 8, right: 8, left: 4, bottom: 0 }
    };
}

export function applyPumpChartPresentation(chart, datasets, { expanded = false } = {}) {
    if (!chart) return;

    const profile = getScaleProfile({ expanded });

    chart.options.layout.padding = profile.layoutPadding;
    chart.options.plugins.legend.position = 'bottom';
    chart.options.plugins.legend.labels.boxWidth = profile.legendBoxSize;
    chart.options.plugins.legend.labels.boxHeight = profile.legendBoxSize;
    chart.options.plugins.legend.labels.padding = profile.legendPadding;
    chart.options.plugins.legend.labels.font = { size: profile.legendFontSize };

    chart.options.scales.x.title.text = `Vazão (${datasets.flowUnit})`;
    chart.options.scales.x.title.font = { size: profile.titleFontSize };
    chart.options.scales.x.ticks.font = { size: profile.tickFontSize };
    chart.options.scales.x.ticks.maxTicksLimit = profile.maxTicksX;

    chart.options.scales.yHead.title.text = `Carga (${datasets.pressureUnit})`;
    chart.options.scales.yHead.title.font = { size: profile.titleFontSize };
    chart.options.scales.yHead.ticks.font = { size: profile.tickFontSize };
    chart.options.scales.yHead.ticks.maxTicksLimit = profile.maxTicksY;
    chart.options.scales.yHead.min = 0;
    chart.options.scales.yHead.suggestedMax = datasets.pressureAxisMax;

    chart.options.scales.yEff.title.display = profile.showSecondaryTitles;
    chart.options.scales.yEff.title.text = 'Eficiência (%)';
    chart.options.scales.yEff.title.font = { size: profile.titleFontSize };
    chart.options.scales.yEff.ticks.font = { size: profile.secondaryTickFontSize };
    chart.options.scales.yEff.ticks.maxTicksLimit = profile.maxTicksY;

    chart.options.scales.yNpsh.title.display = profile.showSecondaryTitles;
    chart.options.scales.yNpsh.title.text = `NPSHr (${datasets.lengthUnit})`;
    chart.options.scales.yNpsh.title.font = { size: profile.titleFontSize };
    chart.options.scales.yNpsh.ticks.font = { size: profile.secondaryTickFontSize };
    chart.options.scales.yNpsh.ticks.maxTicksLimit = profile.maxTicksY;
    chart.options.scales.yNpsh.min = 0;
    chart.options.scales.yNpsh.suggestedMax = datasets.npshAxisMax;

    chart.data.datasets[3].pointRadius = profile.pointRadius;
    chart.data.datasets[3].pointHoverRadius = profile.pointHoverRadius;
}

export function createPumpChart(ctx, component, { expanded = false } = {}) {
    const datasets = buildPumpCurveDatasets(component);

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'Carga',
                    data: datasets.headPoints,
                    borderColor: '#2980b9',
                    backgroundColor: 'rgba(41, 128, 185, 0.12)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.22,
                    yAxisID: 'yHead',
                    pointRadius: 0
                },
                {
                    label: 'Eficiência',
                    data: datasets.efficiencyPoints,
                    borderColor: '#27ae60',
                    backgroundColor: 'rgba(39, 174, 96, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.22,
                    yAxisID: 'yEff',
                    pointRadius: 0
                },
                {
                    label: 'NPSHr',
                    data: datasets.npshPoints,
                    borderColor: '#e67e22',
                    backgroundColor: 'rgba(230, 126, 34, 0.1)',
                    borderDash: [6, 4],
                    borderWidth: 2,
                    fill: false,
                    tension: 0.22,
                    yAxisID: 'yNpsh',
                    pointRadius: 0
                },
                {
                    label: 'Operação',
                    type: 'scatter',
                    data: [{ x: datasets.currentFlow, y: datasets.currentHead }],
                    borderColor: '#c0392b',
                    backgroundColor: '#c0392b',
                    pointRadius: 5,
                    pointHoverRadius: 6,
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
                    callbacks: {
                        title: (ctx) => `Vazão: ${Number(ctx[0].parsed.x).toFixed(2)} ${datasets.flowUnit}`,
                        label: (ctx) => {
                            if (ctx.dataset.yAxisID === 'yHead') {
                                return `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.pressureUnit}`;
                            }
                            if (ctx.dataset.yAxisID === 'yEff') {
                                return `Eficiência: ${Number(ctx.parsed.y).toFixed(1)} %`;
                            }
                            if (ctx.dataset.yAxisID === 'yNpsh') {
                                return `NPSHr: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.lengthUnit}`;
                            }
                            return `Ponto atual: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.pressureUnit}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: `Vazão (${datasets.flowUnit})` },
                    ticks: { maxTicksLimit: 6 }
                },
                yHead: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: `Carga (${datasets.pressureUnit})` },
                    ticks: { maxTicksLimit: 5 }
                },
                yEff: {
                    type: 'linear',
                    position: 'right',
                    min: 0,
                    max: 100,
                    grid: { drawOnChartArea: false },
                    title: { display: false, text: 'Eficiência (%)' },
                    ticks: {
                        maxTicksLimit: 5,
                        callback: (value) => `${value}%`
                    }
                },
                yNpsh: {
                    type: 'linear',
                    position: 'right',
                    offset: true,
                    grid: { drawOnChartArea: false },
                    title: { display: false, text: `NPSHr (${datasets.lengthUnit})` },
                    ticks: { maxTicksLimit: 5 }
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
    chart.data.datasets[0].label = 'Carga';
    chart.data.datasets[0].data = datasets.headPoints;
    chart.data.datasets[1].label = 'Eficiência';
    chart.data.datasets[1].data = datasets.efficiencyPoints;
    chart.data.datasets[2].label = 'NPSHr';
    chart.data.datasets[2].data = datasets.npshPoints;
    chart.data.datasets[3].label = 'Operação';
    chart.data.datasets[3].data = [{ x: datasets.currentFlow, y: datasets.currentHead }];
    chart.options.plugins.tooltip.callbacks.title = (ctx) => `Vazão: ${Number(ctx[0].parsed.x).toFixed(2)} ${datasets.flowUnit}`;
    chart.options.plugins.tooltip.callbacks.label = (ctx) => {
        if (ctx.dataset.yAxisID === 'yHead') {
            return `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.pressureUnit}`;
        }
        if (ctx.dataset.yAxisID === 'yEff') {
            return `Eficiência: ${Number(ctx.parsed.y).toFixed(1)} %`;
        }
        if (ctx.dataset.yAxisID === 'yNpsh') {
            return `NPSHr: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.lengthUnit}`;
        }
        return `Ponto atual: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.pressureUnit}`;
    };

    applyPumpChartPresentation(chart, datasets, { expanded });
    chart.update('none');
}
