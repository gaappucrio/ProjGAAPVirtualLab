import { FLUID_PRESETS } from '../../../application/config/FluidPresets.js';
import { DEFAULT_ATMOSPHERIC_PRESSURE_BAR } from '../../../domain/units/HydraulicUnits.js';
import {
    CUSTOM_FLUID_COLOR_OPTIONS,
    getFluidVisualStyle,
    resolveCustomFluidColor
} from '../../../infrastructure/rendering/FluidVisualStyle.js';
import { getUnitStep, toDisplayValue } from '../../units/DisplayUnits.js';
import { getFluidNameVariants, translateFluidName } from '../../i18n/LanguageManager.js';
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
    escapeHtml,
    getPresentationEngine,
    hintAttr,
    makeLabel,
    makeUnitLabel,
    notifyPanelRefresh,
    renderPropertyTabs,
    setValue,
    showInputError,
    validateInputWithFeedback,
    valueOf
} from '../PropertyPresenterShared.js';
import { resolveSinkPressureProfile } from '../../monitoring/SinkPressureProfile.js';
import { bindNozzleGeometryFields, renderNozzleGeometryFields } from './NozzleGeometryFields.js';

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
        Math.abs((preset.calorEspecificoJkgK || 0) - (fluido.calorEspecificoJkgK || 0)) < 1 &&
        Math.abs(preset.pressaoVaporBar - fluido.pressaoVaporBar) < 0.0001
    );

    const inferredPresetId = match ? match[0] : 'custom';
    comp.fluidoEntradaPresetId = inferredPresetId;
    return inferredPresetId;
}

function getDefaultCustomFluidColor(fluido) {
    return resolveCustomFluidColor(fluido?.corVisual)
        || resolveCustomFluidColor(getFluidVisualStyle(fluido).stroke)
        || CUSTOM_FLUID_COLOR_OPTIONS.find((option) => option.id === 'azul_claro')?.color
        || CUSTOM_FLUID_COLOR_OPTIONS[0].color;
}

function renderCustomColorSwatches(fluido, currentPreset) {
    const selectedColor = getDefaultCustomFluidColor(fluido);
    const swatches = CUSTOM_FLUID_COLOR_OPTIONS.map((option) => `
        <button
            type="button"
            class="fluid-color-swatch${selectedColor === option.color ? ' selected' : ''}"
            data-fluid-color="${option.color}"
            title="${option.label}"
            aria-label="${option.label}"
            aria-pressed="${selectedColor === option.color ? 'true' : 'false'}"
            style="--swatch-color: ${option.color};"
            ${currentPreset === 'custom' ? '' : 'disabled'}
        ></button>
    `).join('');

    return `
        <div class="prop-group source-fluid-color-group" ${currentPreset === 'custom' ? '' : 'hidden'}>
            <label>Cor do Fluido</label>
            <input type="hidden" id="input-source-fluid-color" value="${selectedColor}">
            <div class="fluid-color-grid">
                ${swatches}
            </div>
        </div>
    `;
}

// Texto de cada campo do fluido, igual na renderização e na ressincronização depois de aplicar.
function sourceFluidFieldValues(fluido) {
    return {
        'input-source-fluid-density': String(Number(Number(fluido.densidade).toFixed(2))),
        'input-source-fluid-temp': toDisplayValue('temperature', fluido.temperatura).toFixed(1),
        'input-source-fluid-viscosity': String(Number(Number(fluido.viscosidadeDinamicaPaS).toPrecision(4))),
        'input-source-fluid-cp': String(Number(Number(fluido.calorEspecificoJkgK).toFixed(1))),
        'input-source-fluid-vapor': displayUnitValue('pressure', fluido.pressaoVaporBar, 3),
        'input-source-fluid-atm': displayUnitValue('pressure', fluido.pressaoAtmosfericaBar, 3)
    };
}

// O painel só é redesenhado na troca de seleção. Sem isto, os campos ficavam com o valor antigo e,
// como value ≠ defaultValue, a próxima edição de temperatura reenviava ρ/μ/Pv do preset como
// "editados", travando-os na temperatura do preset.
function syncSourceFluidInputs(fluido, { manterNomeDigitado = false } = {}) {
    Object.entries(sourceFluidFieldValues(fluido)).forEach(([id, text]) => {
        const input = byId(id);
        if (!input) return;
        input.value = text;
        input.defaultValue = text;
    });
    // O nome é aplicado a cada tecla: reescrevê-lo durante a digitação apagaria espaços no fim.
    const inputName = byId('input-source-fluid-name');
    if (inputName) {
        if (!manterNomeDigitado) inputName.value = translateFluidName(fluido.nome);
        inputName.defaultValue = inputName.value;
    }
}

// Ponto único de aplicação: grava no domínio e realinha seletor, cores e campos com o estado real.
function applySourceFluid(comp, dados, presetId, { manterNomeDigitado = false } = {}) {
    comp.atualizarFluidoEntrada(dados, { presetId });
    const presetSelect = byId('sel-source-fluid-preset');
    if (presetSelect) presetSelect.value = presetId;
    updateCustomColorControls(presetId === 'custom');
    syncSourceFluidInputs(comp.fluidoEntrada, { manterNomeDigitado });
    comp.notify(ComponentEventPayloads.state({ fluidUpdate: true }));
    notifyPanelRefresh();
}

// Piso da pressão manométrica da fonte: o zero absoluto na Patm do próprio fluido de entrada.
function sourceAtmosphericBar(comp) {
    const patm = Number(comp?.fluidoEntrada?.pressaoAtmosfericaBar);
    return Number.isFinite(patm) && patm > 0 ? patm : DEFAULT_ATMOSPHERIC_PRESSURE_BAR;
}

function renderSourceFluidFields(comp) {
    const fluido = ensureSourceFluid(comp);
    const campos = sourceFluidFieldValues(fluido);
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
            <input type="text" id="input-source-fluid-name" title="${TOOLTIPS.fluido.nome}" value="${escapeHtml(fluido.nome)}">
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.densidade}">Densidade (kg/m³)</label>
            <input type="number" id="input-source-fluid-density" title="${TOOLTIPS.fluido.densidade}" value="${campos['input-source-fluid-density']}" step="any" min="100">
        </div>
        <div class="prop-group">
            ${makeUnitLabel('Temperatura', 'temperature', TOOLTIPS.fluido.temperatura)}
            <input type="number" id="input-source-fluid-temp" title="${TOOLTIPS.fluido.temperatura}" value="${campos['input-source-fluid-temp']}" step="${getUnitStep('temperature')}" min="${toDisplayValue('temperature', -20).toFixed(1)}" max="${toDisplayValue('temperature', 200).toFixed(1)}">
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.viscosidade}">Viscosidade Dinâmica (Pa.s)</label>
            <input type="number" id="input-source-fluid-viscosity" title="${TOOLTIPS.fluido.viscosidade}" value="${campos['input-source-fluid-viscosity']}" step="0.0001" min="0.0001">
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.calorEspecifico}">Calor Específico (J/kg.K)</label>
            <input type="number" id="input-source-fluid-cp" title="${TOOLTIPS.fluido.calorEspecifico}" value="${campos['input-source-fluid-cp']}" step="any" min="500" max="10000">
        </div>
        <div class="prop-group">
            ${makeUnitLabel('Pressão de Vapor', 'pressure', TOOLTIPS.fluido.pressaoVapor)}
            <input type="number" id="input-source-fluid-vapor" title="${TOOLTIPS.fluido.pressaoVapor}" value="${campos['input-source-fluid-vapor']}" step="${displayStep('pressure', 0.001)}" min="${displayBound('pressure', 0.0001)}" max="${displayBound('pressure', 5)}">
        </div>
        <div class="prop-group">
            ${makeUnitLabel('Pressão Atmosférica', 'pressure', TOOLTIPS.fluido.pressaoAtmosferica)}
            <input type="number" id="input-source-fluid-atm" title="${TOOLTIPS.fluido.pressaoAtmosferica}" value="${campos['input-source-fluid-atm']}" step="${displayStep('pressure', 0.001)}" min="${displayBound('pressure', 0.5)}" max="${displayBound('pressure', 2)}">
        </div>
        ${renderCustomColorSwatches(fluido, currentPreset)}
    `;
}

function pressureInputValue(id, fallback) {
    return baseFromDisplay('pressure', valueOf(id), fallback);
}

function temperatureInputValue(id, fallback) {
    return baseFromDisplay('temperature', valueOf(id), fallback);
}

function getSourceFluidColorValue(fluido, presetId) {
    if (presetId !== 'custom') return FLUID_PRESETS[presetId]?.corVisual || null;
    return resolveCustomFluidColor(valueOf('input-source-fluid-color')) || getDefaultCustomFluidColor(fluido);
}

function applySourceFluidFromInputs(comp) {
    const fluido = ensureSourceFluid(comp);
    const inputDensity = byId('input-source-fluid-density');
    const inputViscosity = byId('input-source-fluid-viscosity');
    const inputSpecificHeat = byId('input-source-fluid-cp');
    const inputTemp = byId('input-source-fluid-temp');
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

    const specificHeatResult = InputValidator.validateNumber(inputSpecificHeat.value, 500, 10000, 'Calor específico');
    if (!specificHeatResult.valid) {
        showInputError(inputSpecificHeat, specificHeatResult.error);
        return;
    }
    clearInputError(inputSpecificHeat);

    const temperatureResult = InputValidator.validateNumber(
        temperatureInputValue('input-source-fluid-temp', NaN),
        -20,
        200,
        'Temperatura'
    );
    if (!temperatureResult.valid) {
        showInputError(inputTemp, temperatureResult.error);
        return;
    }
    clearInputError(inputTemp);

    const vaporResult = InputValidator.validatePressure(
        pressureInputValue('input-source-fluid-vapor', NaN),
        5,
        'Pressão de Vapor'
    );
    if (!vaporResult.valid) {
        showInputError(inputVapor, vaporResult.error);
        return;
    }
    clearInputError(inputVapor);

    const atmResult = InputValidator.validatePressure(
        pressureInputValue('input-source-fluid-atm', NaN),
        2,
        'Pressão Atmosférica'
    );
    if (!atmResult.valid) {
        showInputError(inputAtm, atmResult.error);
        return;
    }
    clearInputError(inputAtm);

    // Só vai ao domínio o que o aluno editou. O resto fica como está (cp, Patm, nome) ou é recalculado
    // na nova temperatura (ρ, μ, Pv). Reenviar o texto da tela arredondaria valores: 25 °C exibido como
    // 298,1 K voltava como 24,95 °C, e Patm 1,01325 virava 1,013.
    const inputName = byId('input-source-fluid-name');
    const edited = (input) => Boolean(input) && input.value !== input.defaultValue;
    const dados = {
        ...(edited(inputName) ? { nome: InputValidator.sanitizeText(inputName.value, 50) } : {}),
        ...(edited(inputTemp) ? { temperatura: temperatureResult.value } : {}),
        ...(edited(inputSpecificHeat) ? { calorEspecificoJkgK: specificHeatResult.value } : {}),
        ...(edited(inputAtm) ? { pressaoAtmosfericaBar: atmResult.value } : {}),
        ...(edited(inputDensity) ? { densidade: densityResult.value } : {}),
        ...(edited(inputViscosity) ? { viscosidadeDinamicaPaS: viscosityResult.value } : {}),
        ...(edited(inputVapor) ? { pressaoVaporBar: vaporResult.value } : {})
    };
    if (Object.keys(dados).length === 0) return;

    applySourceFluid(
        comp,
        { ...dados, corVisual: getSourceFluidColorValue(fluido, 'custom') },
        'custom',
        { manterNomeDigitado: dados.nome !== undefined }
    );
}

function updateCustomColorControls(isCustom) {
    const group = byId('input-source-fluid-color')?.closest?.('.source-fluid-color-group');
    if (!group) return;

    group.hidden = !isCustom;
    group.querySelectorAll('.fluid-color-swatch').forEach((button) => {
        button.disabled = !isCustom;
    });
}

function setSelectedCustomColor(color) {
    const resolvedColor = resolveCustomFluidColor(color);
    if (!resolvedColor) return;

    setValue('input-source-fluid-color', resolvedColor);
    document.querySelectorAll?.('.fluid-color-swatch').forEach((button) => {
        const selected = button.dataset.fluidColor === resolvedColor;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
}

function bindSourceFluidProperties(comp) {
    const fluido = ensureSourceFluid(comp);
    syncSourceFluidInputs(fluido);

    bind('sel-source-fluid-preset', 'change', (event) => {
        const presetId = event.target.value;
        if (presetId === 'custom') {
            setSelectedCustomColor(getDefaultCustomFluidColor(comp.fluidoEntrada));
            applySourceFluid(comp, { corVisual: getSourceFluidColorValue(comp.fluidoEntrada, 'custom') }, 'custom');
            return;
        }

        const preset = FLUID_PRESETS[presetId];
        if (!preset) return;
        // Valores exatos do preset, sem passar pelo texto arredondado dos campos.
        applySourceFluid(comp, {
            nome: preset.nome,
            densidade: preset.densidade,
            temperatura: preset.temperatura,
            viscosidadeDinamicaPaS: preset.viscosidadeDinamicaPaS,
            calorEspecificoJkgK: preset.calorEspecificoJkgK,
            pressaoVaporBar: preset.pressaoVaporBar,
            pressaoAtmosfericaBar: preset.pressaoAtmosfericaBar,
            corVisual: preset.corVisual || null
        }, presetId);
    });

    // Trocar a cor não mexe nas propriedades físicas (antes reancorava ρ/μ/Pv no texto arredondado).
    document.querySelectorAll?.('.fluid-color-swatch').forEach((button) => {
        button.addEventListener('click', () => {
            if (button.disabled) return;
            setSelectedCustomColor(button.dataset.fluidColor);
            applySourceFluid(comp, { corVisual: getSourceFluidColorValue(comp.fluidoEntrada, 'custom') }, 'custom');
        });
    });

    [
        'input-source-fluid-name',
        'input-source-fluid-density',
        'input-source-fluid-viscosity',
        'input-source-fluid-cp',
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
                <input type="number" id="input-pressao-fonte" ${hintAttr(TOOLTIP.sourcePressure)} value="${displayEditableUnitValue('pressure', comp.pressaoFonteBar, 3)}" step="${displayStep('pressure', 0.01)}" min="${displayBound('pressure', -sourceAtmosphericBar(comp))}" max="${displayBound('pressure', 20)}">
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
                (value, name) => InputValidator.validateGaugePressure(baseFromDisplay('pressure', value), 20, name, sourceAtmosphericBar(comp)),
                'Pressão da fonte',
                (value) => { comp.pressaoFonteBar = value; }
            );
        });

        bind('input-vazao-fonte-max', 'change', () => {
            validateInputWithFeedback(
                inputFlow,
                (value, name) => InputValidator.validateFlow(baseFromDisplay('flow', value), 500, name),
                'Vazão máxima',
                (value) => { comp.vazaoMaxima = value; }
            );
        });

        bindSourceFluidProperties(comp);
    }
};

export const SINK_PROPERTIES_PRESENTER = {
    render: (comp) => {
        const pressureProfile = resolveSinkPressureProfile({
            engine: getPresentationEngine(),
            sink: comp
        });
        const basicContent = `
            <div class="prop-group">
                ${makeUnitLabel('Contrapressão imposta', 'pressure', TOOLTIP.sinkPressure)}
                <input type="number" id="input-pressao-dreno" ${hintAttr(TOOLTIP.sinkPressure)} value="${displayEditableUnitValue('pressure', comp.pressaoSaidaBar, 3)}" step="${displayStep('pressure', 0.01)}" min="${displayBound('pressure', -DEFAULT_ATMOSPHERIC_PRESSURE_BAR)}" max="${displayBound('pressure', 10)}">
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Vazão recebida', 'flow', TOOLTIP.sinkCurrentFlow)}
                <input type="text" id="disp-vazao-dreno" ${hintAttr(TOOLTIP.sinkCurrentFlow)} value="${displayUnitValue('flow', comp.vazaoRecebidaLps, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Pressão final da rede', 'pressure', TOOLTIP.sinkFinalPressure)}
                <input type="text" id="disp-pressao-final-dreno" ${hintAttr(TOOLTIP.sinkFinalPressure)} value="${displayUnitValue('pressure', pressureProfile.finalNetworkPressureBar, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Queda na entrada da saída', 'pressure', TOOLTIP.sinkEntryPressureDrop)}
                <input type="text" id="disp-deltap-entrada-dreno" ${hintAttr(TOOLTIP.sinkEntryPressureDrop)} value="${displayUnitValue('pressure', pressureProfile.entryPressureDropBar, 2)}" disabled>
            </div>
            <div class="prop-group">
                <label title="Fluido atualmente recebido nesta saída.">Fluido Recebido</label>
                <input type="text" id="disp-dreno-fluid" title="Fluido atualmente recebido nesta saída." value="${comp.getFluidoEntradaMisturado?.()?.nome || '-'}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Temperatura do Fluido', 'temperature', 'Temperatura do fluido recebido nesta saída.')}
                <input type="text" id="disp-dreno-fluid-temp" title="Temperatura do fluido recebido nesta saída." value="${displayUnitValue('temperature', comp.getFluidoEntradaMisturado?.()?.temperatura ?? 25, 2)}" disabled>
            </div>
        `;
        const advancedContent = `
            <div class="prop-group">
                ${makeLabel('Perda de entrada (K)', TOOLTIP.sinkEntryK)}
                <input type="number" id="input-k-entrada-dreno" ${hintAttr(TOOLTIP.sinkEntryK)} value="${comp.perdaEntradaK}" step="0.1" min="0" max="50">
            </div>
            ${renderNozzleGeometryFields(comp, 'dreno')}
        `;

        return renderPropertyTabs({
            basicContent,
            advancedContent,
            advancedDescription: 'A contrapressão é a fronteira imposta pela saída. A pressão final da rede é medida antes da perda de entrada configurada pelo K do dreno.'
        });
    },
    bind: (comp) => {
        const inputPressure = byId('input-pressao-dreno');
        const inputEntryK = byId('input-k-entrada-dreno');

        bind('input-pressao-dreno', 'change', () => {
            validateInputWithFeedback(
                inputPressure,
                (value, name) => InputValidator.validateGaugePressure(baseFromDisplay('pressure', value), 10, name),
                'Contrapressão da saída',
                (value) => {
                    comp.pressaoSaidaBar = value;
                    notifyPanelRefresh();
                }
            );
        });

        bind('input-k-entrada-dreno', 'change', () => {
            validateInputWithFeedback(
                inputEntryK,
                (value, name) => InputValidator.validateNumber(value, 0, 50, name),
                'Perda de entrada da saída',
                (value) => {
                    comp.perdaEntradaK = value;
                    notifyPanelRefresh();
                }
            );
        });

        bindNozzleGeometryFields(comp, 'dreno');
    }
};
