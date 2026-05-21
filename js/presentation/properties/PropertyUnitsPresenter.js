import { bindUnitsPanel, renderUnitsPanel } from '../controllers/UnitsController.js';
import { TOOLTIPS } from './PropertyTooltips.js';
import {
    getUnitOptions,
    getUnitPreferences,
    setUnitPreference
} from '../units/DisplayUnits.js';

export function renderUnitControls() {
    return renderUnitsPanel({
        getUnitOptions,
        getUnitPreferences,
        tooltips: TOOLTIPS
    });
}

export function bindUnitControls({ onChange } = {}) {
    bindUnitsPanel({
        setUnitPreference,
        onChange
    });
}
