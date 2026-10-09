// Tema visual e formatação de eixos compartilhados pelos adaptadores Chart.js.

export function getGridColors() {
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

export function formatAxisTick(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return value;
    const decimals = Math.abs(numericValue) > 0 && Math.abs(numericValue) < 1 ? 3 : 1;
    return numericValue.toLocaleString(undefined, {
        maximumFractionDigits: decimals,
        minimumFractionDigits: 0
    });
}
