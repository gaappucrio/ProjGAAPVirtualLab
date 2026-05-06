import { ENGINE } from '../../application/engine/SimulationEngine.js';
import { COMPONENT_EVENTS, ENGINE_EVENTS } from '../../application/events/EventTypes.js';
import { colorPort, labelStyle } from '../../Config.js';
import {
    formatUnitValue,
    getUnitSymbol,
    subscribeUnitPreferences
} from '../../utils/Units.js';
import { subscribeLanguageChanges, t } from '../../utils/I18n.js';

export {
    ENGINE,
    COMPONENT_EVENTS,
    ENGINE_EVENTS,
    getUnitSymbol,
    labelStyle,
    subscribeUnitPreferences
};

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
    const update = () => {
        ['in', 'out'].forEach((tipo) => {
            const el = visual.querySelector(`#elev-${tipo}-${id}`);
            if (!el) return;

            if (ENGINE.usarAlturaRelativa) {
                const cy = parseFloat(el.getAttribute('data-cy'));
                const logicalY = logica.y + offsetY + cy;
                const elevM = (logicalY / 80).toFixed(2);
                el.textContent = `${t('visual.elevation')}: ${elevM} m`;
                el.setAttribute('opacity', '1');
            } else {
                el.setAttribute('opacity', '0');
            }
        });
    };

    subscribeLanguageChanges(update);
    return update;
}

export const displayUnitValue = (category, baseValue, digits = null) => formatUnitValue(category, baseValue, digits);
export const volumeText = (baseValue, digits = null) => `${displayUnitValue('volume', baseValue, digits)} ${getUnitSymbol('volume')}`;
