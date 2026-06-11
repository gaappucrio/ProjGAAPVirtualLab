import { getUnitSymbol, toDisplayValue } from '../../presentation/units/DisplayUnits.js';
import { t } from '../../presentation/i18n/LanguageManager.js';

const PIPE_PRESSURE_POINT_COUNT = 32;

const PIPE_CHART_COLORS = Object.freeze({
    pressure: '#1abc9c',
    pressureFill: 'rgba(26, 188, 156, 0.14)',
    endpoint: '#e67e22',
    endpointBorder: '#fff2df'
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

function hasFiniteNumber(value) {
    return Number.isFinite(Number(value));
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

function getPressureProfileEndpointBar(state = {}, overrides = {}) {
    const resolvedSourcePressureBar = finiteNumber(
        state.sourcePressureBar,
        finiteNumber(state.pressureBar, 0)
    );
    const hasResolvedEndPressure = hasFiniteNumber(state.pressureBar) || hasFiniteNumber(state.outletPressureBar);
    const resolvedEndPressureBar = finiteNumber(
        state.pressureBar,
        finiteNumber(state.outletPressureBar, 0)
    );
    const sourcePressureBar = finiteNumber(
        overrides.sourcePressureBar,
        resolvedSourcePressureBar
    );
    const fallbackPressureDropBar = hasResolvedEndPressure
        ? Math.max(0, resolvedSourcePressureBar - resolvedEndPressureBar)
        : Math.max(0, finiteNumber(state.totalLossBar, finiteNumber(state.deltaPBar, 0)));
    const pressureDropBar = finiteNumber(
        overrides.pressureDropBar,
        fallbackPressureDropBar
    );
    const estimatedEndPressureBar = Math.max(
        0,
        sourcePressureBar - Math.max(0, pressureDropBar)
    );
    const endPressureBar = hasFiniteNumber(overrides.sourcePressureBar)
        ? estimatedEndPressureBar
        : finiteNumber(state.pressureBar, finiteNumber(state.outletPressureBar, estimatedEndPressureBar));

    return {
        sourcePressureBar,
        endPressureBar
    };
}

function getPipeLengthM(connection, state = {}, geometry = {}) {
    const rawLengthM = Math.max(
        0,
        finiteNumber(state.lengthM, finiteNumber(geometry.lengthM, connection?.extraLengthM || 0))
    );
    return rawLengthM > 0 ? rawLengthM : 1;
}

export function buildPipePressureProfile(connection, state = {}, geometry = {}, options = {}) {
    const lengthM = getPipeLengthM(connection, state, geometry);
    const { sourcePressureBar, endPressureBar } = getPressureProfileEndpointBar(state, {
        sourcePressureBar: options.sourcePressureBar,
        pressureDropBar: options.pressureDropBar
    });
    const pressureUnit = getUnitSymbol('pressure');
    const lengthUnit = getUnitSymbol('length');
    const pressurePoints = [];
    const endpointPoints = [];

    for (let i = 0; i <= PIPE_PRESSURE_POINT_COUNT; i += 1) {
        const fraction = i / PIPE_PRESSURE_POINT_COUNT;
        const distanceM = lengthM * fraction;
        const pressureBar = sourcePressureBar + ((endPressureBar - sourcePressureBar) * fraction);
        pressurePoints.push({
            x: toDisplayValue('length', distanceM),
            y: toDisplayValue('pressure', pressureBar)
        });
    }

    endpointPoints.push(
        { x: toDisplayValue('length', 0), y: toDisplayValue('pressure', sourcePressureBar) },
        { x: toDisplayValue('length', lengthM), y: toDisplayValue('pressure', endPressureBar) }
    );

    const yValues = pressurePoints.map((point) => point.y);
    const maxPressure = Math.max(0, ...yValues);
    const minPressure = Math.min(0, ...yValues);

    return {
        pressurePoints,
        endpointPoints,
        lengthUnit,
        pressureUnit,
        lengthAxisMax: toDisplayValue('length', lengthM),
        pressureAxisMax: Math.max(1, maxPressure * 1.08),
        pressureAxisMin: minPressure < 0 ? minPressure * 1.08 : 0
    };
}

export function buildCompositePipePressureProfile(sections = []) {
    const pressureUnit = getUnitSymbol('pressure');
    const lengthUnit = getUnitSymbol('length');
    const pressurePoints = [];
    const endpointPoints = [];
    let offsetM = 0;

    sections.forEach((section, sectionIndex) => {
        const gapBeforeM = sectionIndex > 0
            ? Math.max(0, finiteNumber(section.gapBeforeM, 0))
            : 0;

        if (gapBeforeM > 0 && pressurePoints.length > 0) {
            pressurePoints.push({ x: toDisplayValue('length', offsetM), y: null });
            offsetM += gapBeforeM;
            pressurePoints.push({ x: toDisplayValue('length', offsetM), y: null });
        }

        const lengthM = getPipeLengthM(section.connection, section.state, section.geometry);
        const { sourcePressureBar, endPressureBar } = getPressureProfileEndpointBar(section.state, {
            sourcePressureBar: section.sourcePressureBar,
            pressureDropBar: section.pressureDropBar
        });

        for (let pointIndex = 0; pointIndex <= PIPE_PRESSURE_POINT_COUNT; pointIndex += 1) {
            const fraction = pointIndex / PIPE_PRESSURE_POINT_COUNT;
            const distanceM = offsetM + (lengthM * fraction);
            const pressureBar = sourcePressureBar + ((endPressureBar - sourcePressureBar) * fraction);
            pressurePoints.push({
                x: toDisplayValue('length', distanceM),
                y: toDisplayValue('pressure', pressureBar)
            });
        }

        endpointPoints.push(
            { x: toDisplayValue('length', offsetM), y: toDisplayValue('pressure', sourcePressureBar) },
            { x: toDisplayValue('length', offsetM + lengthM), y: toDisplayValue('pressure', endPressureBar) }
        );
        offsetM += lengthM;
    });

    const yValues = pressurePoints
        .map((point) => point.y)
        .filter((value) => Number.isFinite(Number(value)));
    const maxPressure = Math.max(0, ...yValues);
    const minPressure = Math.min(0, ...yValues);
    const lengthAxisMax = Math.max(1, toDisplayValue('length', offsetM || 1));

    return {
        pressurePoints,
        endpointPoints,
        lengthUnit,
        pressureUnit,
        lengthAxisMax,
        pressureAxisMax: Math.max(1, maxPressure * 1.08),
        pressureAxisMin: minPressure < 0 ? minPressure * 1.08 : 0
    };
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
        endpointRadius: expanded ? 5 : 4,
        layoutPadding: expanded
            ? { top: 10, right: 10, left: 8, bottom: 2 }
            : { top: 8, right: 6, left: 4, bottom: 0 }
    };
}

function applyPipePressureChartPresentation(chart, profileData, { expanded = false } = {}) {
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

    chart.options.scales.x.title.text = `${t('chart.distance')} (${profileData.lengthUnit})`;
    chart.options.scales.x.title.font = { size: profile.titleFontSize };
    chart.options.scales.x.title.color = colors.label;
    chart.options.scales.x.ticks.font = { size: profile.tickFontSize };
    chart.options.scales.x.ticks.maxTicksLimit = profile.maxTicksX;
    chart.options.scales.x.ticks.color = colors.tick;
    chart.options.scales.x.ticks.callback = (value) => formatAxisTick(value);
    chart.options.scales.x.min = 0;
    chart.options.scales.x.max = profileData.lengthAxisMax;
    chart.options.scales.x.grid.color = colors.grid;
    chart.options.scales.x.border.color = colors.border;

    chart.options.scales.y.title.text = `${t('chart.pressure')} (${profileData.pressureUnit})`;
    chart.options.scales.y.title.font = { size: profile.titleFontSize };
    chart.options.scales.y.title.color = colors.label;
    chart.options.scales.y.ticks.font = { size: profile.tickFontSize };
    chart.options.scales.y.ticks.maxTicksLimit = profile.maxTicksY;
    chart.options.scales.y.ticks.color = colors.tick;
    chart.options.scales.y.ticks.callback = (value) => formatAxisTick(value);
    chart.options.scales.y.min = profileData.pressureAxisMin;
    chart.options.scales.y.max = profileData.pressureAxisMax;
    chart.options.scales.y.grid.color = colors.grid;
    chart.options.scales.y.border.color = colors.border;

    chart.data.datasets[1].pointRadius = profile.endpointRadius;
    chart.data.datasets[1].pointHoverRadius = profile.endpointRadius + 2;
}

export function createPipePressureChart(
    ctx,
    connection,
    state,
    geometry,
    { expanded = false, label = '', sourcePressureBar = undefined, pressureDropBar = undefined } = {}
) {
    const profileData = buildPipePressureProfile(connection, state, geometry, {
        sourcePressureBar,
        pressureDropBar
    });

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: label ? `${t('chart.pressure')}: ${label}` : t('chart.pressure'),
                    data: profileData.pressurePoints,
                    borderColor: PIPE_CHART_COLORS.pressure,
                    backgroundColor: PIPE_CHART_COLORS.pressureFill,
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.12,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    borderCapStyle: 'round',
                    borderJoinStyle: 'round'
                },
                {
                    label: t('chart.endpoints'),
                    type: 'scatter',
                    data: profileData.endpointPoints,
                    borderColor: PIPE_CHART_COLORS.endpointBorder,
                    backgroundColor: PIPE_CHART_COLORS.endpoint,
                    pointRadius: 4,
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
                        title: (ctx) => `${t('chart.distance')}: ${Number(ctx[0].parsed.x).toFixed(2)} ${profileData.lengthUnit}`,
                        label: (ctx) => `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)} ${profileData.pressureUnit}`
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: `${t('chart.distance')} (${profileData.lengthUnit})` },
                    ticks: { maxTicksLimit: 6, color: getGridColors().tick },
                    grid: { color: getGridColors().grid },
                    border: { color: getGridColors().border }
                },
                y: {
                    type: 'linear',
                    title: { display: true, text: `${t('chart.pressure')} (${profileData.pressureUnit})` },
                    ticks: { maxTicksLimit: 5, color: getGridColors().tick },
                    grid: { color: getGridColors().grid },
                    border: { color: getGridColors().border }
                }
            }
        }
    });

    applyPipePressureChartPresentation(chart, profileData, { expanded });
    chart.update('none');
    return chart;
}

export function refreshPipePressureChart(
    chart,
    connection,
    state,
    geometry,
    { expanded = false, label = '', sourcePressureBar = undefined, pressureDropBar = undefined } = {}
) {
    if (!chart) return;

    const profileData = buildPipePressureProfile(connection, state, geometry, {
        sourcePressureBar,
        pressureDropBar
    });
    chart.data.datasets[0].label = label ? `${t('chart.pressure')}: ${label}` : t('chart.pressure');
    chart.data.datasets[0].data = profileData.pressurePoints;
    chart.data.datasets[1].label = t('chart.endpoints');
    chart.data.datasets[1].data = profileData.endpointPoints;
    chart.options.plugins.tooltip.callbacks.title = (ctx) =>
        `${t('chart.distance')}: ${Number(ctx[0].parsed.x).toFixed(2)} ${profileData.lengthUnit}`;
    chart.options.plugins.tooltip.callbacks.label = (ctx) =>
        `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)} ${profileData.pressureUnit}`;

    applyPipePressureChartPresentation(chart, profileData, { expanded });
    chart.update('none');
}

export function createCompositePipePressureChart(
    ctx,
    sections = [],
    { expanded = false, label = '' } = {}
) {
    const profileData = buildCompositePipePressureProfile(sections);

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: label ? `${t('chart.pressure')}: ${label}` : t('chart.pressure'),
                    data: profileData.pressurePoints,
                    borderColor: PIPE_CHART_COLORS.pressure,
                    backgroundColor: PIPE_CHART_COLORS.pressureFill,
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.12,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    spanGaps: false,
                    borderCapStyle: 'round',
                    borderJoinStyle: 'round'
                },
                {
                    label: t('chart.endpoints'),
                    type: 'scatter',
                    data: profileData.endpointPoints,
                    borderColor: PIPE_CHART_COLORS.endpointBorder,
                    backgroundColor: PIPE_CHART_COLORS.endpoint,
                    pointRadius: 4,
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
                        title: (ctx) => `${t('chart.distance')}: ${Number(ctx[0].parsed.x).toFixed(2)} ${profileData.lengthUnit}`,
                        label: (ctx) => Number.isFinite(Number(ctx.parsed.y))
                            ? `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)} ${profileData.pressureUnit}`
                            : ''
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: `${t('chart.distance')} (${profileData.lengthUnit})` },
                    ticks: { maxTicksLimit: 6, color: getGridColors().tick },
                    grid: { color: getGridColors().grid },
                    border: { color: getGridColors().border }
                },
                y: {
                    type: 'linear',
                    title: { display: true, text: `${t('chart.pressure')} (${profileData.pressureUnit})` },
                    ticks: { maxTicksLimit: 5, color: getGridColors().tick },
                    grid: { color: getGridColors().grid },
                    border: { color: getGridColors().border }
                }
            }
        }
    });

    applyPipePressureChartPresentation(chart, profileData, { expanded });
    chart.update('none');
    return chart;
}

export function refreshCompositePipePressureChart(
    chart,
    sections = [],
    { expanded = false, label = '' } = {}
) {
    if (!chart) return;

    const profileData = buildCompositePipePressureProfile(sections);
    chart.data.datasets[0].label = label ? `${t('chart.pressure')}: ${label}` : t('chart.pressure');
    chart.data.datasets[0].data = profileData.pressurePoints;
    chart.data.datasets[1].label = t('chart.endpoints');
    chart.data.datasets[1].data = profileData.endpointPoints;
    chart.options.plugins.tooltip.callbacks.title = (ctx) =>
        `${t('chart.distance')}: ${Number(ctx[0].parsed.x).toFixed(2)} ${profileData.lengthUnit}`;
    chart.options.plugins.tooltip.callbacks.label = (ctx) => Number.isFinite(Number(ctx.parsed.y))
        ? `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)} ${profileData.pressureUnit}`
        : '';

    applyPipePressureChartPresentation(chart, profileData, { expanded });
    chart.update('none');
}
