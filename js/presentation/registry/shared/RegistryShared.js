import { ENGINE } from '../../../MotorFisico.js';
import { ComponentEventPayloads, EngineEventPayloads } from '../../../application/events/EventPayloads.js';
import { COMPONENT_EVENTS, ENGINE_EVENTS } from '../../../application/events/EventTypes.js';
import { BombaLogica } from '../../../componentes/BombaLogica.js';
import { DrenoLogico } from '../../../componentes/DrenoLogico.js';
import { FonteLogica } from '../../../componentes/FonteLogica.js';
import { TanqueLogico } from '../../../componentes/TanqueLogico.js';
import { ValvulaLogica } from '../../../componentes/ValvulaLogica.js';
import { colorPort, labelStyle } from '../../../Config.js';
import { InputValidator, clearInputError, showInputError } from '../../../utils/InputValidator.js';
import { renderPropertyTabs } from '../../../utils/PropertyTabs.js';
import { TOOLTIPS } from '../../../utils/Tooltips.js';
import {
    formatUnitValue,
    getUnitSymbol,
    subscribeUnitPreferences,
    toBaseValue,
    toDisplayValue
} from '../../../utils/Units.js';

export {
    ENGINE,
    ComponentEventPayloads,
    EngineEventPayloads,
    COMPONENT_EVENTS,
    ENGINE_EVENTS,
    BombaLogica,
    DrenoLogico,
    FonteLogica,
    TanqueLogico,
    ValvulaLogica,
    InputValidator,
    clearInputError,
    showInputError,
    renderPropertyTabs,
    subscribeUnitPreferences,
    getUnitSymbol,
    labelStyle,
    TOOLTIPS
};

export const TOOLTIP = TOOLTIPS.componentes;

export const makePort = (id, cx, cy, inOut) => {
    const isInput = inOut === 'in';
    const textX = isInput ? cx - 10 : cx + 10;
    const anchor = isInput ? 'end' : 'start';

    return `
        <circle class="port-node unconnected" data-type="${inOut}" data-comp-id="${id}" cx="${cx}" cy="${cy}" r="5" fill="#fff" stroke="${colorPort}" stroke-width="2"/>
        <text id="elev-${inOut}-${id}" x="${textX}" y="${cy + 3}" font-size="10" font-family="monospace" fill="#e67e22" font-weight="bold" text-anchor="${anchor}" opacity="0" data-cy="${cy}" pointer-events="none"></text>
    `;
};

export function createElevationUpdater({ visual, logica, id, offsetY }) {
    return () => {
        ['in', 'out'].forEach((tipo) => {
            const el = visual.querySelector(`#elev-${tipo}-${id}`);
            if (!el) return;

            if (ENGINE.usarAlturaRelativa) {
                const cy = parseFloat(el.getAttribute('data-cy'));
                const logicalY = logica.y + offsetY + cy;
                const elevM = (logicalY / 80).toFixed(2);
                el.textContent = `Elev.: ${elevM} m`;
                el.setAttribute('opacity', '1');
            } else {
                el.setAttribute('opacity', '0');
            }
        });
    };
}

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
export const notifyPanelRefresh = () => ENGINE.notify(EngineEventPayloads.panelUpdate(0));
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
