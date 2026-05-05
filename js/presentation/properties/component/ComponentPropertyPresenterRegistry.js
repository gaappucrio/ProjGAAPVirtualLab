import {
    SINK_PROPERTIES_PRESENTER,
    SOURCE_PROPERTIES_PRESENTER
} from './BoundaryComponentPropertiesPresenter.js';
import { PUMP_PROPERTIES_PRESENTER } from './PumpComponentPropertiesPresenter.js';
import { TANK_PROPERTIES_PRESENTER } from './TankComponentPropertiesPresenter.js';
import { VALVE_PROPERTIES_PRESENTER } from './ValveComponentPropertiesPresenter.js';

const COMPONENT_PROPERTY_PRESENTERS = {
    source: SOURCE_PROPERTIES_PRESENTER,
    sink: SINK_PROPERTIES_PRESENTER,
    pump: PUMP_PROPERTIES_PRESENTER,
    valve: VALVE_PROPERTIES_PRESENTER,
    tank: TANK_PROPERTIES_PRESENTER
};

export function getComponentPropertyPresenter(type) {
    return COMPONENT_PROPERTY_PRESENTERS[type] || SOURCE_PROPERTIES_PRESENTER;
}
