import { getUnitSymbol, toDisplayValue } from '../../utils/Units.js';
import { t } from '../../utils/I18n.js';

function volumeTickLabel(value) {
    return toDisplayValue('volume', value).toFixed(1);
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
                x: { title: { display: true, text: `${t('chart.time')} (s)` } },
                y: {
                    min: 0,
                    max: 1000,
                    title: { display: true, text: `${t('chart.volume')} (${getUnitSymbol('volume')})` },
                    ticks: {
                        callback: (value) => volumeTickLabel(value)
                    }
                }
            }
        }
    });
}

export function createTankVolumeChart(ctx, component, series) {
    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: [...series.labels],
            datasets: [{
                label: `${t('chart.volume')}: ${component.tag}`,
                data: [...series.values],
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
                x: { title: { display: true, text: `${t('chart.time')} (s)` } },
                y: {
                    min: 0,
                    max: component.capacidadeMaxima,
                    title: { display: true, text: `${t('chart.volume')} (${getUnitSymbol('volume')})` },
                    ticks: {
                        callback: (value) => volumeTickLabel(value)
                    }
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
    chart.update();
}

export function refreshTankVolumeChart(chart, component, series, { update = true } = {}) {
    if (!chart) return;

    chart.data.labels = [...series.labels];
    chart.data.datasets[0].label = `${t('chart.volume')}: ${component.tag}`;
    chart.data.datasets[0].data = [...series.values];
    chart.options.scales.y.max = component.capacidadeMaxima;
    chart.options.scales.x.title.text = `${t('chart.time')} (s)`;
    chart.options.scales.y.title.text = `${t('chart.volume')} (${getUnitSymbol('volume')})`;
    chart.options.plugins.tooltip.callbacks.label = (context) =>
        `${t('chart.volume')}: ${toDisplayValue('volume', context.parsed.y).toFixed(1)} ${getUnitSymbol('volume')}`;
    chart.options.scales.y.ticks.callback = (value) => volumeTickLabel(value);

    if (update) chart.update();
}
