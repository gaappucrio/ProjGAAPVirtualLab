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
            <div class="prop-group">
                ${makeUnitLabel('Temperatura de serviço', 'temperature', TOOLTIP.heatExchangerServiceTemperature)}
                <input type="number" id="input-hx-service-temp" ${hintAttr(TOOLTIP.heatExchangerServiceTemperature)} value="${displayEditableUnitValue('temperature', comp.temperaturaServicoC, 2)}" step="${displayStep('temperature', 1)}" min="${displayEditableUnitValue('temperature', -20, 2)}" max="${displayEditableUnitValue('temperature', 250, 2)}">
            </div>
            <div class="prop-group">
                ${makeLabel('Coeficiente global UA (W/K)', TOOLTIP.heatExchangerUA)}
                <input type="number" id="input-hx-ua" ${hintAttr(TOOLTIP.heatExchangerUA)} value="${comp.uaWPorK}" step="100" min="0" max="100000">
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Temperatura de entrada', 'temperature', TOOLTIP.heatExchangerInletTemperature)}
                <input type="text" id="disp-hx-temp-in" ${hintAttr(TOOLTIP.heatExchangerInletTemperature)} value="${displayUnitValue('temperature', comp.temperaturaEntradaC, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Temperatura de saída', 'temperature', TOOLTIP.heatExchangerOutletTemperature)}
                <input type="text" id="disp-hx-temp-out" ${hintAttr(TOOLTIP.heatExchangerOutletTemperature)} value="${displayUnitValue('temperature', comp.temperaturaSaidaC, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeLabel('Delta T (°C)', TOOLTIP.heatExchangerDeltaT)}
                <input type="text" id="disp-hx-delta-t" ${hintAttr(TOOLTIP.heatExchangerDeltaT)} value="${comp.deltaTemperaturaC.toFixed(2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeLabel('Carga térmica', TOOLTIP.heatExchangerDuty)}
                <input type="text" id="disp-hx-duty" ${hintAttr(TOOLTIP.heatExchangerDuty)} value="${thermalPowerText(comp.cargaTermicaW)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Vazão atual', 'flow', TOOLTIP.heatExchangerFlow)}
                <input type="text" id="disp-hx-flow" ${hintAttr(TOOLTIP.heatExchangerFlow)} value="${displayUnitValue('flow', comp.fluxoReal, 2)}" disabled>
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
            <div class="prop-group">
                ${makeLabel('Efetividade atual', TOOLTIP.heatExchangerEffectiveness)}
                <input type="text" id="disp-hx-effectiveness" ${hintAttr(TOOLTIP.heatExchangerEffectiveness)} value="${(comp.efetividadeAtual * 100).toFixed(1)}%" disabled>
            </div>
            <div class="prop-group">
                ${makeLabel('Queda de pressão atual', TOOLTIP.heatExchangerPressureDrop)}
                <input type="text" id="disp-hx-deltap" ${hintAttr(TOOLTIP.heatExchangerPressureDrop)} value="${displayUnitValue('pressure', comp.deltaPAtualBar, 2)}" disabled>
            </div>
        `;

        return renderPropertyTabs({
            basicContent,
            advancedContent,
            advancedDescription: 'O trocador usa um modelo de efetividade NTU com meio de serviço em temperatura constante: quanto maior UA e menor m_dot*cp, mais a saída se aproxima da temperatura de serviço.'
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

export { thermalPowerText };
