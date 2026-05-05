import { ComponentEventPayloads, EngineEventPayloads } from '../../application/events/EventPayloads.js';
import { COMPONENT_EVENTS, ENGINE_EVENTS } from '../../application/events/EventTypes.js';
import { InputValidator, clearInputError, showInputError } from '../validation/InputValidator.js';
import { getPresentationEngine } from '../context/PresentationEngineContext.js';
import { renderPropertyTabs } from '../../utils/PropertyTabs.js';
import { TOOLTIPS } from '../../utils/Tooltips.js';
import {
    bind,
    byId,
    isActive,
    setDisabled,
    setDisplay,
    setHtml,
    setText,
    setValue,
    setValueWhenBlurred,
    valueOf
} from './PropertyDomAdapter.js';
import {
    formatUnitValue,
    getUnitSymbol,
    subscribeUnitPreferences,
    toBaseValue,
    toDisplayValue
} from '../../utils/Units.js';

export {
    getPresentationEngine,
    ComponentEventPayloads,
    EngineEventPayloads,
    COMPONENT_EVENTS,
    ENGINE_EVENTS,
    InputValidator,
    clearInputError,
    showInputError,
    renderPropertyTabs,
    subscribeUnitPreferences,
    getUnitSymbol,
    TOOLTIPS,
    bind,
    byId,
    isActive,
    setDisabled,
    setDisplay,
    setHtml,
    setText,
    setValue,
    setValueWhenBlurred,
    valueOf
};

export const TOOLTIP = TOOLTIPS.componentes;

const escapeAttr = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export const hintAttr = (text) => `title="${escapeAttr(text)}"`;
export const makeLabel = (text, hint) => `<label ${hintAttr(hint)}>${text}</label>`;
export const makeUnitLabel = (text, category, hint) => makeLabel(`${text} (${getUnitSymbol(category)})`, hint);
export const displayUnitValue = (category, baseValue, digits = null) => formatUnitValue(category, baseValue, digits);
export const displayEditableUnitValue = (category, baseValue, digits = 3) => {
    const displayValue = toDisplayValue(category, baseValue);
    if (!Number.isFinite(displayValue)) return '';
    return Number(displayValue.toFixed(digits));
};
export const displayBound = (category, baseValue, digits = 3) => Number(toDisplayValue(category, baseValue).toFixed(digits));
export const displayStep = (category, baseStep, digits = 6) => Math.max(Number(toDisplayValue(category, baseStep).toFixed(digits)), Number.EPSILON);
export const baseFromDisplay = (category, rawValue, fallback) => {
    const converted = toBaseValue(category, parseFloat(rawValue));
    return Number.isFinite(converted) ? converted : fallback;
};
export const notifyPanelRefresh = () => getPresentationEngine().notify(EngineEventPayloads.panelUpdate(0));
export const volumeText = (baseValue, digits = null) => `${displayUnitValue('volume', baseValue, digits)} ${getUnitSymbol('volume')}`;

export const validateInputWithFeedback = (inputElement, validatorFn, fieldName, onSuccess, fallback) => {
    if (!inputElement) return fallback;

    try {
        const result = validatorFn(inputElement.value, fieldName);

        if (!result.valid) {
            showInputError(inputElement, result.error);
            console.warn(`Validação falhou para ${fieldName}: ${result.error}`);
            return fallback;
        }

        clearInputError(inputElement);
        if (onSuccess) onSuccess(result.value);
        notifyPanelRefresh();
        return result.value;
    } catch (error) {
        console.error(`Erro ao validar ${fieldName}:`, error);
        showInputError(inputElement, `Erro: ${error.message}`);
        return fallback;
    }
};
