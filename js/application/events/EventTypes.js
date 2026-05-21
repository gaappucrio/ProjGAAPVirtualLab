import { COMPONENT_EVENTS } from '../../domain/events/ComponentEventTypes.js';

export { COMPONENT_EVENTS };

export const ENGINE_EVENTS = Object.freeze({
    SELECTION: 'selecao',
    MOTOR_STATE: 'estado_motor',
    SIMULATION_CONFIG: 'config_simulacao',
    PANEL_UPDATE: 'update_painel',
    CONNECTION_STARTED: 'conexao_iniciada',
    CONNECTION_PREVIEW: 'conexao_preview',
    CONNECTION_COMMITTED: 'conexao_confirmada',
    CONNECTION_CANCELLED: 'conexao_cancelada',
    CONNECTION_REMOVED: 'conexao_removida'
});
