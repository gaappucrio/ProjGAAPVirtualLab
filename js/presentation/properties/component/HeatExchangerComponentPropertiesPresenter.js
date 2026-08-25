import {
    InputValidator,
    TOOLTIP,
    baseFromDisplay,
    displayEditableUnitValue,
    displayStep,
    displayUnitValue,
    getPresentationEngine,
    hintAttr,
    makeLabel,
    makeUnitLabel,
    renderPropertyTabs,
    setValue,
    validateInputWithFeedback
} from '../PropertyPresenterShared.js';
import { bind } from '../PropertyDomAdapter.js';

function thermalPowerText(valueW) {
    const value = Number(valueW);
    if (!Number.isFinite(value)) return '0.00 kW';
    return `${(value / 1000).toFixed(2)} kW`;
}

function refreshNetworkAfterThermalChange() {
    const engine = getPresentationEngine();
    engine.clearConnectionDynamics?.();
    if (!engine.isRunning) engine.resetHydraulicState?.();
    engine.updatePipesVisual?.();
}

export const HEAT_EXCHANGER_PROPERTIES_PRESENTER = {
    render: (comp) => {
        const basicContent = `
            <div style="font-weight: bold; margin-bottom: 8px; color: #2c3e50; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">Troca Térmica Global</div>
            <div class="prop-group">
                ${makeUnitLabel('Temperatura de serviço', 'temperature', TOOLTIP.heatExchangerServiceTemperature)}
                <input type="number" id="input-hx-service-temp" ${hintAttr(TOOLTIP.heatExchangerServiceTemperature)} value="${displayEditableUnitValue('temperature', comp.temperaturaServicoC, 2)}" step="${displayStep('temperature', 1)}" min="${displayEditableUnitValue('temperature', -20, 2)}" max="${displayEditableUnitValue('temperature', 250, 2)}">
            </div>
            <div class="prop-group">
                ${makeLabel('Coeficiente global UA (W/K)', TOOLTIP.heatExchangerUA)}
                <input type="number" id="input-hx-ua" ${hintAttr(TOOLTIP.heatExchangerUA)} value="${comp.uaWPorK}" step="100" min="0" max="100000">
            </div>
            <div class="prop-group">
                ${makeLabel('Carga térmica', TOOLTIP.heatExchangerDuty)}
                <input type="text" id="disp-hx-duty" ${hintAttr(TOOLTIP.heatExchangerDuty)} value="${thermalPowerText(comp.cargaTermicaW)}" disabled>
            </div>
            <div class="prop-group">
                ${makeLabel('Efetividade atual', TOOLTIP.heatExchangerEffectiveness)}
                <input type="text" id="disp-hx-effectiveness" ${hintAttr(TOOLTIP.heatExchangerEffectiveness)} value="${(comp.efetividadeAtual * 100).toFixed(1)}%" disabled>
            </div>

            <div style="font-weight: bold; margin: 12px 0 8px 0; color: #2980b9; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">Corrente 1 (Processo - in1 / out1)</div>
            <div class="prop-group">
                ${makeUnitLabel('Vazão Corrente 1', 'flow', TOOLTIP.heatExchangerFlow)}
                <input type="text" id="disp-hx-flow" ${hintAttr(TOOLTIP.heatExchangerFlow)} value="${displayUnitValue('flow', comp.vazao1Lps ?? comp.fluxoReal, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Temperatura de entrada 1', 'temperature', TOOLTIP.heatExchangerInletTemperature1 || TOOLTIP.heatExchangerInletTemperature)}
                <input type="text" id="disp-hx-temp-in" ${hintAttr(TOOLTIP.heatExchangerInletTemperature1 || TOOLTIP.heatExchangerInletTemperature)} value="${displayUnitValue('temperature', comp.temperaturaEntradaC, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Temperatura de saída 1', 'temperature', TOOLTIP.heatExchangerOutletTemperature1 || TOOLTIP.heatExchangerOutletTemperature)}
                <input type="text" id="disp-hx-temp-out" ${hintAttr(TOOLTIP.heatExchangerOutletTemperature1 || TOOLTIP.heatExchangerOutletTemperature)} value="${displayUnitValue('temperature', comp.temperaturaSaidaC, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeLabel('Delta T Corrente 1 (°C)', TOOLTIP.heatExchangerDeltaT)}
                <input type="text" id="disp-hx-delta-t" ${hintAttr(TOOLTIP.heatExchangerDeltaT)} value="${(comp.deltaTemperaturaC || 0).toFixed(2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeLabel('Queda de pressão 1', TOOLTIP.heatExchangerPressureDrop)}
                <input type="text" id="disp-hx-deltap" ${hintAttr(TOOLTIP.heatExchangerPressureDrop)} value="${displayUnitValue('pressure', comp.deltaPAtualBar, 2)}" disabled>
            </div>

            <div style="font-weight: bold; margin: 12px 0 8px 0; color: #d35400; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">Corrente 2 (Serviço - in2 / out2)</div>
            <div class="prop-group">
                ${makeUnitLabel('Vazão Corrente 2', 'flow', TOOLTIP.heatExchangerFlow2 || TOOLTIP.heatExchangerFlow)}
                <input type="text" id="disp-hx-flow-2" ${hintAttr(TOOLTIP.heatExchangerFlow2 || TOOLTIP.heatExchangerFlow)} value="${displayUnitValue('flow', comp.vazao2Lps ?? 0, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Temperatura de entrada 2', 'temperature', TOOLTIP.heatExchangerInletTemperature2 || TOOLTIP.heatExchangerInletTemperature)}
                <input type="text" id="disp-hx-temp-in-2" ${hintAttr(TOOLTIP.heatExchangerInletTemperature2 || TOOLTIP.heatExchangerInletTemperature)} value="${displayUnitValue('temperature', comp.temperaturaEntrada2C ?? comp.temperaturaServicoC, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Temperatura de saída 2', 'temperature', TOOLTIP.heatExchangerOutletTemperature2 || TOOLTIP.heatExchangerOutletTemperature)}
                <input type="text" id="disp-hx-temp-out-2" ${hintAttr(TOOLTIP.heatExchangerOutletTemperature2 || TOOLTIP.heatExchangerOutletTemperature)} value="${displayUnitValue('temperature', comp.temperaturaSaida2C ?? comp.temperaturaServicoC, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeLabel('Delta T Corrente 2 (°C)', TOOLTIP.heatExchangerDeltaT2 || TOOLTIP.heatExchangerDeltaT)}
                <input type="text" id="disp-hx-delta-t-2" ${hintAttr(TOOLTIP.heatExchangerDeltaT2 || TOOLTIP.heatExchangerDeltaT)} value="${(comp.deltaTemperatura2C || 0).toFixed(2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeLabel('Queda de pressão 2', TOOLTIP.heatExchangerPressureDrop2 || TOOLTIP.heatExchangerPressureDrop)}
                <input type="text" id="disp-hx-deltap-2" ${hintAttr(TOOLTIP.heatExchangerPressureDrop2 || TOOLTIP.heatExchangerPressureDrop)} value="${displayUnitValue('pressure', comp.deltaP2AtualBar ?? 0, 2)}" disabled>
            </div>
        `;

        const advancedContent = `
            <div class="prop-group">
                ${makeLabel('Perda local K', TOOLTIP.heatExchangerK)}
                <input type="number" id="input-hx-loss-k" ${hintAttr(TOOLTIP.heatExchangerK)} value="${comp.perdaLocalK}" step="0.1" min="0" max="100">
            </div>
            <div class="prop-group">
                ${makeLabel('Efetividade máxima (%)', TOOLTIP.heatExchangerMaxEffectiveness)}
                <input type="number" id="input-hx-max-effectiveness" ${hintAttr(TOOLTIP.heatExchangerMaxEffectiveness)} value="${(comp.efetividadeMaxima * 100).toFixed(1)}" step="0.1" min="0" max="99.9">
            </div>
        `;

        return renderPropertyTabs({
            basicContent,
            advancedContent,
            advancedDescription: 'O trocador calcula a troca de calor entre a Corrente 1 e a Corrente 2 usando o método NTU em contracorrente. Se apenas uma corrente estiver conectada, ela troca calor com o meio de serviço configurado.'
        });
    },
    bind: (comp) => {
        bind('input-hx-service-temp', 'change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(baseFromDisplay('temperature', value), -20, 250, name),
                'Temperatura de serviço',
                (validated) => {
                    comp.setTemperaturaServico(validated);
                    refreshNetworkAfterThermalChange();
                    setValue('input-hx-service-temp', displayEditableUnitValue('temperature', comp.temperaturaServicoC, 2));
                }
            );
        });

        bind('input-hx-ua', 'change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(value, 0, 100000, name),
                'Coeficiente UA',
                (validated) => {
                    comp.setUA(validated);
                    refreshNetworkAfterThermalChange();
                }
            );
        });

        bind('input-hx-loss-k', 'change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(value, 0, 100, name),
                'Perda local',
                (validated) => {
                    comp.setPerdaLocal(validated);
                    refreshNetworkAfterThermalChange();
                }
            );
        });

        bind('input-hx-max-effectiveness', 'change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(value, 0, 99.9, name),
                'Efetividade máxima',
                (validated) => {
                    comp.setEfetividadeMaxima(validated);
                    refreshNetworkAfterThermalChange();
                    setValue('input-hx-max-effectiveness', (comp.efetividadeMaxima * 100).toFixed(1));
                }
            );
        });
    }
};

;
