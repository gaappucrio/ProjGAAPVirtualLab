import { bindUnitsPanel, renderUnitsPanel } from '../controllers/UnitsController.js';
import { TOOLTIPS } from '../../utils/Tooltips.js';
import {
    getUnitOptions,
    getUnitPreferences,
    setUnitPreference
} from '../../utils/Units.js';

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
