import { getUnitSymbol, toDisplayValue } from '../../presentation/units/DisplayUnits.js';
import { t } from '../../presentation/i18n/LanguageManager.js';
import { getFluidVisualStyle } from '../rendering/FluidVisualStyle.js';

const DEFAULT_TANK_CHART_LINE_COLOR = '#3498db';

function getGridColors() {
    const isDark = document.body.classList.contains('theme-dark');
    return {
        grid: isDark ? '#3a4a5c' : '#e1e8ed',
        tick: isDark ? '#93a8b8' : '#6c8392'
    };
}

function volumeTickLabel(value) {
    return toDisplayValue('volume', value).toFixed(1);
}

function hexToRgba(hexColor, alpha = 0.2) {
    const normalized = String(hexColor || '').trim().replace('#', '');
    const fullHex = normalized.length === 3
        ? normalized.split('').map((char) => `${char}${char}`).join('')
        : normalized;

    if (!/^[0-9a-f]{6}$/i.test(fullHex)) {
        return `rgba(52, 152, 219, ${alpha})`;
    }

    const r = parseInt(fullHex.slice(0, 2), 16);
    const g = parseInt(fullHex.slice(2, 4), 16);
    const b = parseInt(fullHex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function resolveTankChartColors(component) {
    const fluid = component?.getFluidoConteudo?.() || component?.fluidoConteudo || null;
    const lineColor = getFluidVisualStyle(fluid).stroke || DEFAULT_TANK_CHART_LINE_COLOR;

    return {
        lineColor,
        fillColor: hexToRgba(lineColor, 0.2)
    };
}

function applyTankChartColors(dataset, component) {
    if (!dataset) return;

    const colors = resolveTankChartColors(component);
    dataset.borderColor = colors.lineColor;
    dataset.backgroundColor = colors.fillColor;
}

export function createEmptyMonitorChart(ctx) {
    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: [0],
            datasets: [{
                label: t('chart.selectMonitorable'),
                data: [0],
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.2)',
                borderWidth: 2,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 6,
                hitRadius: 15,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                tooltip: {
                    backgroundColor: 'rgba(44, 62, 80, 0.9)',
                    titleFont: { size: 14 },
                    bodyFont: { size: 14, weight: 'bold' },
                    padding: 10,
                    callbacks: {
                        title: (context) => `${t('chart.time')}: ${context[0].label}s`,
                        label: (context) => `${t('chart.volume')}: ${toDisplayValue('volume', context.parsed.y).toFixed(1)} ${getUnitSymbol('volume')}`
                    }
                }
            },
            scales: {
                x: { 
                    title: { display: true, text: `${t('chart.time')} (s)` },
                    ticks: { color: getGridColors().tick },
                    grid: { color: getGridColors().grid }
                },
                y: {
                    min: 0,
                    max: 1000,
                    title: { display: true, text: `${t('chart.volume')} (${getUnitSymbol('volume')})` },
                    ticks: {
                        callback: (value) => volumeTickLabel(value),
                        color: getGridColors().tick
                    },
                    grid: { color: getGridColors().grid }
                }
            }
        }
    });
}

export function createTankVolumeChart(ctx, component, series) {
    const colors = resolveTankChartColors(component);

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: [...series.labels],
            datasets: [{
                label: `${t('chart.volume')}: ${component.tag}`,
                data: [...series.values],
                borderColor: colors.lineColor,
                backgroundColor: colors.fillColor,
                borderWidth: 2,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 6,
                hitRadius: 15,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                tooltip: {
                    backgroundColor: 'rgba(44, 62, 80, 0.9)',
                    titleFont: { size: 14 },
                    bodyFont: { size: 14, weight: 'bold' },
                    padding: 10,
                    callbacks: {
                        title: (context) => `${t('chart.time')}: ${context[0].label}s`,
                        label: (context) => `${t('chart.volume')}: ${toDisplayValue('volume', context.parsed.y).toFixed(1)} ${getUnitSymbol('volume')}`
                    }
                }
            },
            scales: {
                x: { 
                    title: { display: true, text: `${t('chart.time')} (s)` },
                    ticks: { color: getGridColors().tick },
                    grid: { color: getGridColors().grid }
                },
                y: {
                    min: 0,
                    max: component.capacidadeMaxima,
                    title: { display: true, text: `${t('chart.volume')} (${getUnitSymbol('volume')})` },
                    ticks: {
                        callback: (value) => volumeTickLabel(value),
                        color: getGridColors().tick
                    },
                    grid: { color: getGridColors().grid }
                }
            }
        }
    });
}

export function refreshEmptyMonitorChartPresentation(chart) {
    if (!chart) return;

    chart.data.datasets[0].label = t('chart.selectMonitorable');
    chart.options.scales.y.max = 1000;
    chart.options.scales.x.title.text = `${t('chart.time')} (s)`;
    chart.options.scales.y.title.text = `${t('chart.volume')} (${getUnitSymbol('volume')})`;
    chart.options.plugins.tooltip.callbacks.label = (context) =>
        `${t('chart.volume')}: ${toDisplayValue('volume', context.parsed.y).toFixed(1)} ${getUnitSymbol('volume')}`;
    chart.options.scales.y.ticks.callback = (value) => volumeTickLabel(value);
    chart.options.scales.x.ticks.color = getGridColors().tick;
    chart.options.scales.x.grid.color = getGridColors().grid;
    chart.options.scales.y.ticks.color = getGridColors().tick;
    chart.options.scales.y.grid.color = getGridColors().grid;
    chart.update();
}

export function refreshTankVolumeChart(chart, component, series, { update = true } = {}) {
    if (!chart) return;

    chart.data.labels = [...series.labels];
    chart.data.datasets[0].label = `${t('chart.volume')}: ${component.tag}`;
    chart.data.datasets[0].data = [...series.values];
    applyTankChartColors(chart.data.datasets[0], component);
    chart.options.scales.y.max = component.capacidadeMaxima;
    chart.options.scales.x.title.text = `${t('chart.time')} (s)`;
    chart.options.scales.y.title.text = `${t('chart.volume')} (${getUnitSymbol('volume')})`;
    chart.options.plugins.tooltip.callbacks.label = (context) =>
        `${t('chart.volume')}: ${toDisplayValue('volume', context.parsed.y).toFixed(1)} ${getUnitSymbol('volume')}`;
    chart.options.scales.y.ticks.callback = (value) => volumeTickLabel(value);
    chart.options.scales.x.ticks.color = getGridColors().tick;
    chart.options.scales.x.grid.color = getGridColors().grid;
    chart.options.scales.y.ticks.color = getGridColors().tick;
    chart.options.scales.y.grid.color = getGridColors().grid;

    if (update) chart.update();
}
