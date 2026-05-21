import { EngineEventPayloads } from '../../application/events/EventPayloads.js';
import { ENGINE_EVENTS } from '../../application/events/EventTypes.js';
import { subscribeLanguageChanges } from '../i18n/LanguageManager.js';
import { refreshTankSaturationAlertForComponents } from '../properties/TankSaturationAlertPresenter.js';

const REFRESH_EVENTS = new Set([
    ENGINE_EVENTS.SELECTION,
    ENGINE_EVENTS.MOTOR_STATE,
    ENGINE_EVENTS.SIMULATION_CONFIG,
    ENGINE_EVENTS.PANEL_UPDATE,
    ENGINE_EVENTS.CONNECTION_COMMITTED,
    ENGINE_EVENTS.CONNECTION_REMOVED
]);

export function setupTankSaturationAlertController({ engine } = {}) {
    if (!engine) throw new Error('Engine nao foi injetado no alerta global de saturacao do tanque.');

    const refresh = () => refreshTankSaturationAlertForComponents(engine.componentes, {
        onAdjustmentApplied: () => engine.notify(EngineEventPayloads.panelUpdate(0))
    });

    subscribeLanguageChanges(refresh);

    engine.subscribe((payload = {}) => {
        if (REFRESH_EVENTS.has(payload.tipo)) refresh();
    });

    refresh();

    return {
        refresh
    };
}
