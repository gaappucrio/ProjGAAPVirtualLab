import { ComponenteFisico } from './BaseComponente.js';
import { createFluidoFromProperties, updateFluidoProperties } from './Fluido.js';
import { DEFAULT_SOURCE_MAX_FLOW_LPS, DEFAULT_SOURCE_PRESSURE_BAR } from '../units/HydraulicUnits.js';

export class FonteLogica extends ComponenteFisico {
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.pressaoFonteBar = DEFAULT_SOURCE_PRESSURE_BAR;
        this.vazaoMaxima = DEFAULT_SOURCE_MAX_FLOW_LPS;
        this.fluxoReal = 0;
        this.fluidoEntrada = createFluidoFromProperties();
        this.fluidoEntradaPresetId = 'agua';
    }

    atualizarFluidoEntrada(dados = {}, { presetId = this.fluidoEntradaPresetId } = {}) {
        this.fluidoEntradaPresetId = presetId || 'custom';
        return updateFluidoProperties(this.fluidoEntrada, dados);
    }

    sincronizarMetricasFisicas() {
        super.sincronizarMetricasFisicas();
        this.pressaoSaidaAtualBar = this.pressaoFonteBar;
        this.fluxoReal = this.estadoHidraulico.saidaVazaoLps;
    }
}
