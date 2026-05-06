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

export const COMPONENT_EVENTS = Object.freeze({
    STATE: 'estado',
    CONNECTION: 'conexao',
    POSITION_UPDATE: 'pos_update',
    TAG_UPDATE: 'tag_update',
    PRESSURE_UPDATE: 'pressao_update',
    SETPOINT_UPDATE: 'sp_update',
    SETPOINT_AUTO_PRESSURE: 'sp_pressao_autoajustada',
    CONTROL_UPDATE: 'ctrl_update',
    VOLUME_UPDATE: 'volume'
});
