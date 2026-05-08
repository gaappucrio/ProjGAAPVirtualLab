import {
    formatUnitValue,
    getUnitSymbol,
    toBaseValue,
    toDisplayValue
} from '../../utils/Units.js';
import { parseStrictNumber } from '../validation/InputValidator.js';
import { byId, valueOf } from './PropertyDomAdapter.js';

export function setFieldValue(id, value, category = null, digits = 2, suffix = '') {
    const element = byId(id);
    if (!element) return;
    element.value = category ? `${formatUnitValue(category, value, digits)}${suffix}` : value;
}

export function displayUnitValue(category, baseValue, digits = null) {
    return formatUnitValue(category, baseValue, digits);
}

export function displayEditableUnitValue(category, baseValue, digits = 3) {
    const displayValue = toDisplayValue(category, baseValue);
    if (!Number.isFinite(displayValue)) return '';
    return Number(displayValue.toFixed(digits));
}

export function displayBound(category, baseValue, digits = 3) {
    return Number(toDisplayValue(category, baseValue).toFixed(digits));
}

export function displayStep(category, baseStep, digits = 6) {
    return Math.max(Number(toDisplayValue(category, baseStep).toFixed(digits)), Number.EPSILON);
}

export function inputBaseValue(category, id, fallback) {
    const displayValue = parseStrictNumber(valueOf(id));
    if (!Number.isFinite(displayValue)) return fallback;
    const value = toBaseValue(category, displayValue);
    return Number.isFinite(value) ? value : fallback;
}

export function rawBaseValue(category, rawValue, fallback = NaN) {
    const displayValue = parseStrictNumber(rawValue);
    if (!Number.isFinite(displayValue)) return fallback;
    const value = toBaseValue(category, displayValue);
    return Number.isFinite(value) ? value : fallback;
}

export function formatMeasuredValue(category, baseValue, digits = 2) {
    return `${formatUnitValue(category, baseValue, digits)} ${getUnitSymbol(category)}`;
}
