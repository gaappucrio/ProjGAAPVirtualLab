import { FLUID_PRESETS } from '../../../application/config/FluidPresets.js';
import { formatUnitValue, getUnitStep, toDisplayValue } from '../../../utils/Units.js';
import { getFluidNameVariants, translateFluidName } from '../../../utils/I18n.js';
import {
    ComponentEventPayloads,
    InputValidator,
    TOOLTIP,
    TOOLTIPS,
    baseFromDisplay,
    bind,
    byId,
    clearInputError,
    displayBound,
    displayEditableUnitValue,
    displayStep,
    displayUnitValue,
    hintAttr,
    makeUnitLabel,
    notifyPanelRefresh,
    renderPropertyTabs,
    setValue,
    showInputError,
    validateInputWithFeedback,
    valueOf
} from '../PropertyPresenterShared.js';

function ensureSourceFluid(comp) {
    if (!comp.fluidoEntrada && typeof comp.atualizarFluidoEntrada === 'function') {
        comp.atualizarFluidoEntrada({});
    }

    return comp.fluidoEntrada;
}

function getCurrentSourceFluidPresetId(comp) {
    if (comp.fluidoEntradaPresetId === 'custom') return 'custom';
    if (comp.fluidoEntradaPresetId && FLUID_PRESETS[comp.fluidoEntradaPresetId]) {
        return comp.fluidoEntradaPresetId;
    }

    const fluido = ensureSourceFluid(comp);
    const match = Object.entries(FLUID_PRESETS).find(([, preset]) =>
        getFluidNameVariants(preset.nome).some((name) =>
            String(name || '').trim() === String(fluido.nome || '').trim()
        ) &&
        Math.abs(preset.densidade - fluido.densidade) < 0.5 &&
        Math.abs(preset.temperatura - fluido.temperatura) < 0.05 &&
        Math.abs(preset.viscosidadeDinamicaPaS - fluido.viscosidadeDinamicaPaS) < 0.00001 &&
        Math.abs(preset.pressaoVaporBar - fluido.pressaoVaporBar) < 0.0001
    );

    const inferredPresetId = match ? match[0] : 'custom';
    comp.fluidoEntradaPresetId = inferredPresetId;
    return inferredPresetId;
}

function renderSourceFluidFields(comp) {
    const fluido = ensureSourceFluid(comp);
    const currentPreset = getCurrentSourceFluidPresetId(comp);
    const fluidOptions = Object.entries(FLUID_PRESETS)
        .map(([id, preset]) => `<option value="${id}" ${currentPreset === id ? 'selected' : ''}>${preset.nome}</option>`)
        .join('');

    return `
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.preset}">Predefinição do Fluido</label>
            <select id="sel-source-fluid-preset" title="${TOOLTIPS.fluido.preset}">
                ${fluidOptions}
                <option value="custom" ${currentPreset === 'custom' ? 'selected' : ''}>Personalizado</option>
            </select>
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.nome}">Nome do Fluido</label>
            <input type="text" id="input-source-fluid-name" title="${TOOLTIPS.fluido.nome}" value="${fluido.nome}">
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.densidade}">Densidade (kg/m³)</label>
            <input type="number" id="input-source-fluid-density" title="${TOOLTIPS.fluido.densidade}" value="${fluido.densidade}" step="1" min="100">
        </div>
        <div class="prop-group">
            ${makeUnitLabel('Temperatura', 'temperature', TOOLTIPS.fluido.temperatura)}
            <input type="number" id="input-source-fluid-temp" title="${TOOLTIPS.fluido.temperatura}" value="${toDisplayValue('temperature', fluido.temperatura).toFixed(1)}" step="${getUnitStep('temperature')}" min="${toDisplayValue('temperature', -20).toFixed(1)}" max="${toDisplayValue('temperature', 200).toFixed(1)}">
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.viscosidade}">Viscosidade Dinâmica (Pa.s)</label>
            <input type="number" id="input-source-fluid-viscosity" title="${TOOLTIPS.fluido.viscosidade}" value="${fluido.viscosidadeDinamicaPaS}" step="0.0001" min="0.0001">
        </div>
        <div class="prop-group">
            ${makeUnitLabel('Pressão de Vapor', 'pressure', TOOLTIPS.fluido.pressaoVapor)}
            <input type="number" id="input-source-fluid-vapor" title="${TOOLTIPS.fluido.pressaoVapor}" value="${displayUnitValue('pressure', fluido.pressaoVaporBar, 3)}" step="${displayStep('pressure', 0.001)}" min="${displayBound('pressure', 0.0001)}" max="${displayBound('pressure', 5)}">
        </div>
        <div class="prop-group">
            ${makeUnitLabel('Pressão Atmosférica', 'pressure', TOOLTIPS.fluido.pressaoAtmosferica)}
            <input type="number" id="input-source-fluid-atm" title="${TOOLTIPS.fluido.pressaoAtmosferica}" value="${displayUnitValue('pressure', fluido.pressaoAtmosfericaBar, 3)}" step="${displayStep('pressure', 0.001)}" min="${displayBound('pressure', 0.5)}" max="${displayBound('pressure', 2)}">
        </div>
    `;
}

function pressureInputValue(id, fallback) {
    return baseFromDisplay('pressure', valueOf(id), fallback);
}

function temperatureInputValue(id, fallback) {
    return baseFromDisplay('temperature', valueOf(id), fallback);
}

function applySourceFluidFromInputs(comp, { preferredPresetId = null } = {}) {
    const fluido = ensureSourceFluid(comp);
    const inputDensity = byId('input-source-fluid-density');
    const inputViscosity = byId('input-source-fluid-viscosity');
    const inputVapor = byId('input-source-fluid-vapor');
    const inputAtm = byId('input-source-fluid-atm');

    const densityResult = InputValidator.validateDensity(inputDensity.value, 'Densidade');
    if (!densityResult.valid) {
        showInputError(inputDensity, densityResult.error);
        return;
    }
    clearInputError(inputDensity);

    const viscosityResult = InputValidator.validateViscosity(inputViscosity.value, 'Viscosidade');
    if (!viscosityResult.valid) {
        showInputError(inputViscosity, viscosityResult.error);
        return;
    }
    clearInputError(inputViscosity);

    const vaporResult = InputValidator.validatePressure(
        pressureInputValue('input-source-fluid-vapor', fluido.pressaoVaporBar),
        5,
        'Pressão de Vapor'
    );
    if (!vaporResult.valid) {
        showInputError(inputVapor, vaporResult.error);
        return;
    }
    clearInputError(inputVapor);

    const atmResult = InputValidator.validatePressure(
        pressureInputValue('input-source-fluid-atm', fluido.pressaoAtmosfericaBar),
        2,
        'Pressão Atmosférica'
    );
    if (!atmResult.valid) {
        showInputError(inputAtm, atmResult.error);
        return;
    }
    clearInputError(inputAtm);

    const nextPresetId = preferredPresetId || 'custom';
    comp.atualizarFluidoEntrada(
        {
            nome: InputValidator.sanitizeText(valueOf('input-source-fluid-name'), 50),
            densidade: densityResult.value,
            temperatura: temperatureInputValue('input-source-fluid-temp', fluido.temperatura),
            viscosidadeDinamicaPaS: viscosityResult.value,
            pressaoVaporBar: vaporResult.value,
            pressaoAtmosfericaBar: atmResult.value
        },
        { presetId: nextPresetId }
    );

    const presetSelect = byId('sel-source-fluid-preset');
    if (presetSelect) {
        presetSelect.value = nextPresetId;
    }

    comp.notify(ComponentEventPayloads.state({ fluidUpdate: true }));
    notifyPanelRefresh();
}

function bindSourceFluidProperties(comp) {
    const fluido = ensureSourceFluid(comp);
    setValue('input-source-fluid-name', translateFluidName(fluido.nome));

    bind('sel-source-fluid-preset', 'change', (event) => {
        const presetId = event.target.value;
        if (presetId === 'custom') {
            comp.fluidoEntradaPresetId = 'custom';
            comp.notify(ComponentEventPayloads.state({ fluidUpdate: true }));
            notifyPanelRefresh();
            return;
        }

        const preset = FLUID_PRESETS[presetId];
        if (!preset) return;

        setValue('input-source-fluid-name', translateFluidName(preset.nome));
        setValue('input-source-fluid-density', preset.densidade);
        setValue('input-source-fluid-viscosity', preset.viscosidadeDinamicaPaS);
        setValue('input-source-fluid-temp', toDisplayValue('temperature', preset.temperatura).toFixed(1));
        setValue('input-source-fluid-vapor', formatUnitValue('pressure', preset.pressaoVaporBar, 3));
        setValue('input-source-fluid-atm', formatUnitValue('pressure', preset.pressaoAtmosfericaBar, 3));
        applySourceFluidFromInputs(comp, { preferredPresetId: presetId });
    });

    [
        'input-source-fluid-name',
        'input-source-fluid-density',
        'input-source-fluid-viscosity',
        'input-source-fluid-temp',
        'input-source-fluid-vapor',
        'input-source-fluid-atm'
    ].forEach((id) => {
        bind(id, id === 'input-source-fluid-name' ? 'input' : 'change', () => applySourceFluidFromInputs(comp));
    });
}

export const SOURCE_PROPERTIES_PRESENTER = {
    render: (comp) => {
        const basicContent = `
            <div class="prop-group">
                ${makeUnitLabel('Pressão de alimentação', 'pressure', TOOLTIP.sourcePressure)}
                <input type="number" id="input-pressao-fonte" ${hintAttr(TOOLTIP.sourcePressure)} value="${displayEditableUnitValue('pressure', comp.pressaoFonteBar, 3)}" step="${displayStep('pressure', 0.01)}" min="${displayBound('pressure', 0)}" max="${displayBound('pressure', 20)}">
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Vazão máxima', 'flow', TOOLTIP.sourceFlow)}
                <input type="number" id="input-vazao-fonte-max" ${hintAttr(TOOLTIP.sourceFlow)} value="${displayEditableUnitValue('flow', comp.vazaoMaxima, 3)}" step="${displayStep('flow', 1)}" min="${displayBound('flow', 1)}" max="${displayBound('flow', 500)}">
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Vazão atual', 'flow', TOOLTIP.sourceCurrentFlow)}
                <input type="text" id="disp-vazao-fonte" ${hintAttr(TOOLTIP.sourceCurrentFlow)} value="${displayUnitValue('flow', comp.fluxoReal, 2)}" disabled>
            </div>
        `;

        return renderPropertyTabs({
            basicContent,
            advancedLabel: 'Fluido',
            advancedDescription: 'Propriedades registradas nesta fronteira de entrada para suportar futuras misturas de fluidos.',
            advancedContent: renderSourceFluidFields(comp)
        });
    },
    bind: (comp) => {
        const inputPressure = byId('input-pressao-fonte');
        const inputFlow = byId('input-vazao-fonte-max');

        bind('input-pressao-fonte', 'change', () => {
            validateInputWithFeedback(
                inputPressure,
                (value, name) => InputValidator.validatePressure(baseFromDisplay('pressure', value, 0), 20, name),
                'Pressão da fonte',
                (value) => { comp.pressaoFonteBar = value; }
            );
        });

        bind('input-vazao-fonte-max', 'change', () => {
            validateInputWithFeedback(
                inputFlow,
                (value, name) => InputValidator.validateFlow(baseFromDisplay('flow', value, 0), 500, name),
                'Vazão máxima',
                (value) => { comp.vazaoMaxima = value; }
            );
        });

        bindSourceFluidProperties(comp);
    }
};

export const SINK_PROPERTIES_PRESENTER = {
    render: (comp) => `
        <div class="prop-group">
            ${makeUnitLabel('Pressão de descarga', 'pressure', TOOLTIP.sinkPressure)}
            <input type="number" id="input-pressao-dreno" ${hintAttr(TOOLTIP.sinkPressure)} value="${displayEditableUnitValue('pressure', comp.pressaoSaidaBar, 3)}" step="${displayStep('pressure', 0.01)}" min="${displayBound('pressure', 0)}" max="${displayBound('pressure', 10)}">
        </div>
        <div class="prop-group">
            ${makeUnitLabel('Vazão recebida', 'flow', TOOLTIP.sinkCurrentFlow)}
            <input type="text" id="disp-vazao-dreno" ${hintAttr(TOOLTIP.sinkCurrentFlow)} value="${displayUnitValue('flow', comp.vazaoRecebidaLps, 2)}" disabled>
        </div>
    `,
    bind: (comp) => {
        const inputPressure = byId('input-pressao-dreno');

        bind('input-pressao-dreno', 'change', () => {
            validateInputWithFeedback(
                inputPressure,
                (value, name) => InputValidator.validatePressure(baseFromDisplay('pressure', value, 0), 10, name),
                'Pressão de saída',
                (value) => { comp.pressaoSaidaBar = value; }
            );
        });
    }
};
