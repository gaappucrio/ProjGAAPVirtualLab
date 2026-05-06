const FLUID_BASE_COLORS = Object.freeze({
    agua: '#3498db',
    oleo_leve: '#f1c40f',
    glicol_30: '#8b5a2b'
});

const DEFAULT_FLUID_COLOR = FLUID_BASE_COLORS.agua;

export const CUSTOM_FLUID_COLOR_OPTIONS = Object.freeze([
    { id: 'cinza', label: 'Cinza', color: '#7f8c8d' },
    { id: 'roxo', label: 'Roxo', color: '#8e44ad' },
    { id: 'rosa', label: 'Rosa', color: '#ff7eb6' },
    { id: 'vermelho', label: 'Vermelho', color: '#e74c3c' },
    { id: 'azul_claro', label: 'Azul claro', color: '#5dade2' },
    { id: 'laranja', label: 'Laranja', color: '#e67e22' },
    { id: 'verde_escuro', label: 'Verde escuro', color: '#145a32' },
    { id: 'magenta', label: 'Magenta', color: '#ff00ff' },
    { id: 'ciano', label: 'Ciano', color: '#00cfe8' },
    { id: 'verde', label: 'Verde', color: '#2ecc71' }
]);

function normalizeFluidName(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function getFluidKeyFromName(name) {
    const normalized = normalizeFluidName(name);
    if (!normalized) return null;
    if (normalized.includes('oleo') || normalized.includes('oil')) return 'oleo_leve';
    if (normalized.includes('glicol') || normalized.includes('glycol')) return 'glicol_30';
    if (normalized.includes('agua') || normalized.includes('water')) return 'agua';
    return null;
}

function getKnownColor(name) {
    const key = getFluidKeyFromName(name);
    return key ? FLUID_BASE_COLORS[key] : null;
}

function parseHexColor(hexColor) {
    const normalized = String(hexColor || '').trim().replace('#', '');
    const fullHex = normalized.length === 3
        ? normalized.split('').map((char) => `${char}${char}`).join('')
        : normalized;

    if (!/^[0-9a-f]{6}$/i.test(fullHex)) return null;

    return {
        r: parseInt(fullHex.slice(0, 2), 16),
        g: parseInt(fullHex.slice(2, 4), 16),
        b: parseInt(fullHex.slice(4, 6), 16)
    };
}

export function resolveCustomFluidColor(color) {
    const normalizedColor = String(color || '').trim().toLowerCase();
    return CUSTOM_FLUID_COLOR_OPTIONS.find((option) => option.color === normalizedColor)?.color || null;
}

function toHexChannel(value) {
    return Math.round(Math.max(0, Math.min(255, value)))
        .toString(16)
        .padStart(2, '0');
}

function toHexColor({ r, g, b }) {
    return `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`;
}

function blendColors(baseColor, overlayColor, overlayWeight) {
    const base = parseHexColor(baseColor);
    const overlay = parseHexColor(overlayColor);
    if (!base || !overlay) return baseColor;

    const weight = Math.max(0, Math.min(1, overlayWeight));
    return toHexColor({
        r: (base.r * (1 - weight)) + (overlay.r * weight),
        g: (base.g * (1 - weight)) + (overlay.g * weight),
        b: (base.b * (1 - weight)) + (overlay.b * weight)
    });
}

function getContrastColor(hexColor) {
    const parsed = parseHexColor(hexColor);
    if (!parsed) return '#ffffff';

    const luminance = ((0.299 * parsed.r) + (0.587 * parsed.g) + (0.114 * parsed.b)) / 255;
    return luminance > 0.64 ? '#2c3e50' : '#ffffff';
}

function resolveCompositionColor(composicao) {
    if (!composicao || typeof composicao !== 'object') return null;

    const weightedChannels = Object.entries(composicao)
        .map(([name, fraction]) => ({
            color: parseHexColor(name) || parseHexColor(getKnownColor(name)),
            weight: Number(fraction)
        }))
        .filter((entry) => entry.color && Number.isFinite(entry.weight) && entry.weight > 0);

    const totalWeight = weightedChannels.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) return null;

    return toHexColor(weightedChannels.reduce((acc, { color, weight }) => {
        const fraction = weight / totalWeight;
        acc.r += color.r * fraction;
        acc.g += color.g * fraction;
        acc.b += color.b * fraction;
        return acc;
    }, { r: 0, g: 0, b: 0 }));
}

export function getFluidVisualStyle(fluid = null) {
    const baseColor = resolveCustomFluidColor(fluid?.corVisual)
        || resolveCompositionColor(fluid?.corVisualComposicao)
        || resolveCompositionColor(fluid?.composicao)
        || getKnownColor(fluid?.nome)
        || DEFAULT_FLUID_COLOR;

    return {
        stroke: baseColor,
        stream: baseColor,
        fillStart: blendColors(baseColor, '#ffffff', 0.16),
        fillEnd: blendColors(baseColor, '#000000', 0.12),
        contrast: getContrastColor(baseColor)
    };
}
