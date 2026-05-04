import { ENGINE, FLUID_PRESETS } from '../../application/engine/SimulationEngine.js';
import { clearInputError, InputValidator, showInputError } from '../validation/InputValidator.js';
import { bindPropertyTabs, renderPropertyTabs } from '../../utils/PropertyTabs.js';
import { TOOLTIPS } from '../../utils/Tooltips.js';
import {
    formatUnitValue,
    getUnitStep,
    getUnitSymbol,
    toDisplayValue
} from '../../utils/Units.js';
import {
    displayBound,
    displayStep,
    displayUnitValue,
    inputBaseValue
} from './PropertyValueFormatters.js';
import { bindUnitControls, renderUnitControls } from './PropertyUnitsPresenter.js';

function getCurrentFluidPresetId() {
    const match = Object.entries(FLUID_PRESETS).find(([, preset]) =>
        String(preset.nome || '').trim() === String(ENGINE.fluidoOperante.nome || '').trim() &&
        Math.abs(preset.densidade - ENGINE.fluidoOperante.densidade) < 0.5 &&
        Math.abs(preset.temperatura - ENGINE.fluidoOperante.temperatura) < 0.05 &&
        Math.abs(preset.viscosidadeDinamicaPaS - ENGINE.fluidoOperante.viscosidadeDinamicaPaS) < 0.00001 &&
        Math.abs(preset.pressaoVaporBar - ENGINE.fluidoOperante.pressaoVaporBar) < 0.0001
    );
    return match ? match[0] : 'custom';
}

function temperatureInputValue(id, fallback) {
    return inputBaseValue('temperature', id, fallback);
}

function pressureInputValue(id, fallback) {
    return inputBaseValue('pressure', id, fallback);
}

export function renderDefaultProperties({
    propContent,
    onRerender,
    onDestroyPumpCurve
}) {
    onDestroyPumpCurve?.();

    const currentPreset = getCurrentFluidPresetId();
    const fluidOptions = Object.entries(FLUID_PRESETS)
        .map(([id, preset]) => `<option value="${id}" ${currentPreset === id ? 'selected' : ''}>${preset.nome}</option>`)
        .join('');

    const basicContent = `
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.velocidadeSimulacao}">Velocidade da Simulação</label>
            <select id="sel-vel">
                <option value="1">1x (Tempo real)</option>
                <option value="2">2x (Acelerado)</option>
                <option value="5">5x (Rápido)</option>
            </select>
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.preset}">Predefinição do Fluido</label>
            <select id="sel-fluid-preset" title="${TOOLTIPS.fluido.preset}">
                ${fluidOptions}
                <option value="custom" ${currentPreset === 'custom' ? 'selected' : ''}>Personalizado</option>
            </select>
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.nome}">Nome do Fluido</label>
            <input type="text" id="input-fluid-name" title="${TOOLTIPS.fluido.nome}" value="${ENGINE.fluidoOperante.nome}">
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.densidade}">Densidade (kg/m³)</label>
            <input type="number" id="input-fluid-density" title="${TOOLTIPS.fluido.densidade}" value="${ENGINE.fluidoOperante.densidade}" step="1" min="100">
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.temperatura}">Temperatura (${getUnitSymbol('temperature')})</label>
            <input type="number" id="input-fluid-temp" title="${TOOLTIPS.fluido.temperatura}" value="${toDisplayValue('temperature', ENGINE.fluidoOperante.temperatura).toFixed(1)}" step="${getUnitStep('temperature')}" min="${toDisplayValue('temperature', -20).toFixed(1)}" max="${toDisplayValue('temperature', 200).toFixed(1)}">
        </div>
        <p style="font-size: 12px; color:#95a5a6; text-align:center;">${TOOLTIPS.painel.estadoVazio}</p>
    `;

    const advancedContent = `
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.viscosidade}">Viscosidade Dinâmica (Pa.s)</label>
            <input type="number" id="input-fluid-viscosity" title="${TOOLTIPS.fluido.viscosidade}" value="${ENGINE.fluidoOperante.viscosidadeDinamicaPaS}" step="0.0001" min="0.0001">
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.pressaoVapor}">Pressão de Vapor (${getUnitSymbol('pressure')} absoluta)</label>
            <input type="number" id="input-fluid-vapor" title="${TOOLTIPS.fluido.pressaoVapor}" value="${displayUnitValue('pressure', ENGINE.fluidoOperante.pressaoVaporBar, 3)}" step="${displayStep('pressure', 0.001)}" min="${displayBound('pressure', 0.0001)}" max="${displayBound('pressure', 5)}">
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.pressaoAtmosferica}">Pressão Atmosférica (${getUnitSymbol('pressure')} absoluta)</label>
            <input type="number" id="input-fluid-atm" title="${TOOLTIPS.fluido.pressaoAtmosferica}" value="${displayUnitValue('pressure', ENGINE.fluidoOperante.pressaoAtmosfericaBar, 3)}" step="${displayStep('pressure', 0.001)}" min="${displayBound('pressure', 0.5)}" max="${displayBound('pressure', 2)}">
        </div>
    `;

    propContent.innerHTML = `
        ${renderUnitControls()}
        ${renderPropertyTabs({
            basicContent,
            advancedContent,
            advancedDescription: 'Viscosidade e pressões absolutas influenciam atrito, cavitação e disponibilidade de sucção. Em usos mais simples, a aba Geral costuma bastar.'
        })}
    `;

    bindUnitControls({ onChange: onRerender });
    bindPropertyTabs(propContent);
    document.getElementById('sel-vel').value = ENGINE.velocidade;
    document.getElementById('sel-vel').addEventListener('change', (event) => {
        ENGINE.velocidade = parseFloat(event.target.value);
    });

    const applyFluidFromInputs = ({ preferredPresetId = null } = {}) => {
        const fluidData = {};
        const inputDensity = document.getElementById('input-fluid-density');
        const inputViscosity = document.getElementById('input-fluid-viscosity');
        const inputVapor = document.getElementById('input-fluid-vapor');
        const inputAtm = document.getElementById('input-fluid-atm');

        const densityResult = InputValidator.validateDensity(inputDensity.value, 'Densidade');
        if (!densityResult.valid) {
            showInputError(inputDensity, densityResult.error);
            return;
        }
        fluidData.densidade = densityResult.value;
        clearInputError(inputDensity);

        const viscosityResult = InputValidator.validateViscosity(inputViscosity.value, 'Viscosidade');
        if (!viscosityResult.valid) {
            showInputError(inputViscosity, viscosityResult.error);
            return;
        }
        fluidData.viscosidadeDinamicaPaS = viscosityResult.value;
        clearInputError(inputViscosity);

        const vaporResult = InputValidator.validatePressure(pressureInputValue('input-fluid-vapor', ENGINE.fluidoOperante.pressaoVaporBar), 5, 'Pressão de Vapor');
        if (!vaporResult.valid) {
            showInputError(inputVapor, vaporResult.error);
            return;
        }
        fluidData.pressaoVaporBar = vaporResult.value;
        clearInputError(inputVapor);

        const atmResult = InputValidator.validatePressure(pressureInputValue('input-fluid-atm', ENGINE.fluidoOperante.pressaoAtmosfericaBar), 2, 'Pressão Atmosférica');
        if (!atmResult.valid) {
            showInputError(inputAtm, atmResult.error);
            return;
        }
        fluidData.pressaoAtmosfericaBar = atmResult.value;
        clearInputError(inputAtm);

        fluidData.nome = InputValidator.sanitizeText(document.getElementById('input-fluid-name').value, 50);
        fluidData.temperatura = temperatureInputValue('input-fluid-temp', ENGINE.fluidoOperante.temperatura);

        ENGINE.atualizarFluido(fluidData);

        const presetSelect = document.getElementById('sel-fluid-preset');
        if (presetSelect) {
            presetSelect.value = preferredPresetId || getCurrentFluidPresetId();
        }
    };

    document.getElementById('sel-fluid-preset').addEventListener('change', (event) => {
        const preset = FLUID_PRESETS[event.target.value];
        if (!preset) return;

        document.getElementById('input-fluid-name').value = preset.nome;
        document.getElementById('input-fluid-density').value = preset.densidade;
        document.getElementById('input-fluid-viscosity').value = preset.viscosidadeDinamicaPaS;
        document.getElementById('input-fluid-temp').value = toDisplayValue('temperature', preset.temperatura).toFixed(1);
        document.getElementById('input-fluid-vapor').value = formatUnitValue('pressure', preset.pressaoVaporBar, 3);
        applyFluidFromInputs({ preferredPresetId: event.target.value });
    });

    [
        'input-fluid-name',
        'input-fluid-density',
        'input-fluid-viscosity',
        'input-fluid-temp',
        'input-fluid-vapor',
        'input-fluid-atm'
    ].forEach((id) => {
        document.getElementById(id).addEventListener(id === 'input-fluid-name' ? 'input' : 'change', applyFluidFromInputs);
    });
}
