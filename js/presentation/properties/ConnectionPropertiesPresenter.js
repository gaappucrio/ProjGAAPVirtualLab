import { EngineEventPayloads } from '../../application/events/EventPayloads.js';
import { getPresentationEngine } from '../context/PresentationEngineContext.js';
import { clearInputError, InputValidator, showInputError } from '../validation/InputValidator.js';
import { bindPropertyTabs, renderPropertyTabs } from '../../utils/PropertyTabs.js';
import { TOOLTIPS } from '../../utils/Tooltips.js';
import { localizeElement, translateLiteral } from '../../utils/LanguageManager.js';
import {
    DEFAULT_DESIGN_VELOCITY_MPS,
    DEFAULT_PIPE_ROUGHNESS_MM,
    getUnitSymbol
} from '../../utils/Units.js';
import { getSuggestedDiameterForConnection } from '../../domain/services/PipeHydraulics.js';
import {
    displayBound,
    displayEditableUnitValue,
    displayStep,
    displayUnitValue,
    rawBaseValue
} from './PropertyValueFormatters.js';
import { bind, setValue } from './PropertyDomAdapter.js';
import { bindUnitControls, renderUnitControls } from './PropertyUnitsPresenter.js';

function getConnectionDisplay(engine, connection) {
    const source = engine.componentes.find((component) => component.id === connection.sourceId);
    const target = engine.componentes.find((component) => component.id === connection.targetId);
    return {
        sourceLabel: source ? source.tag : connection.sourceId,
        targetLabel: target ? target.tag : connection.targetId
    };
}

function lengthInputValue(rawValue, fallback = NaN) {
    return rawBaseValue('length', rawValue, fallback);
}

function getSuggestedDiameterM(connection, state) {
    return getSuggestedDiameterForConnection(connection, state);
}

function formatFluidName(fluid) {
    return fluid?.nome || '-';
}

export function renderConnectionProperties({
    propContent,
    connection,
    onRerender
}) {
    const engine = getPresentationEngine();
    engine.ensureConnectionProperties(connection);
    const state = engine.getConnectionState(connection);
    const labels = getConnectionDisplay(engine, connection);
    const geometry = engine.getConnectionGeometry(connection);
    const suggestedDiameterM = getSuggestedDiameterM(connection, state);
    const currentFluid = state.fluid || engine.hydraulicContext?.getConnectionFluid?.(connection);

    const basicContent = `
        <div class="prop-group">
            <label title="${TOOLTIPS.conexao.trecho}">${TOOLTIPS.conexao.titulo}</label>
            <input type="text" title="${TOOLTIPS.conexao.trecho}" value="${labels.sourceLabel} -> ${labels.targetLabel}" disabled>
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.conexao.diametro}">Diâmetro Interno (${getUnitSymbol('length')})</label>
            <input type="number" id="input-pipe-diameter" title="${TOOLTIPS.conexao.diametro}" value="${displayEditableUnitValue('length', connection.diameterM, 4)}" step="${displayStep('length', 0.005)}" min="${displayBound('length', 0.01)}" max="${displayBound('length', 0.3)}">
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.conexao.velocidadeProjeto}">Velocidade de Projeto (m/s)</label>
            <input type="number" id="input-pipe-design-velocity" title="${TOOLTIPS.conexao.velocidadeProjeto}" value="${connection.designVelocityMps || DEFAULT_DESIGN_VELOCITY_MPS}" step="0.1" min="0.1" max="8">
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.conexao.diametroSugerido}">Diâmetro Sugerido (${getUnitSymbol('length')})</label>
            <input type="text" id="disp-pipe-suggested-diameter" title="${TOOLTIPS.conexao.diametroSugerido}" value="${displayUnitValue('length', suggestedDiameterM, 4)}" disabled>
            <button id="btn-apply-pipe-suggested-diameter" type="button" title="${TOOLTIPS.conexao.aplicarDiametroSugerido}" ${suggestedDiameterM > 0 ? '' : 'disabled'} style="margin-top:6px; padding:6px 8px; border:1px solid #bdc3c7; border-radius:4px; background:#fff; font-size:11px; cursor:pointer;">Aplicar diâmetro sugerido</button>
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.conexao.vazaoAtual}">Vazão Atual (${getUnitSymbol('flow')})</label>
            <input type="text" id="disp-pipe-flow" title="${TOOLTIPS.conexao.vazaoAtual}" value="${displayUnitValue('flow', state.flowLps, 2)}" disabled>
        </div>
        <div class="prop-group">
            <label title="Fluido atualmente transportado neste trecho.">Fluido no Trecho</label>
            <input type="text" id="disp-pipe-fluid" title="Fluido atualmente transportado neste trecho." value="${formatFluidName(currentFluid)}" disabled>
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.conexao.vazaoAlvo}">Vazão Alvo (${getUnitSymbol('flow')})</label>
            <input type="text" id="disp-pipe-target-flow" title="${TOOLTIPS.conexao.vazaoAlvo}" value="${displayUnitValue('flow', state.targetFlowLps, 2)}" disabled>
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.conexao.deltaPTrecho}">Queda de Pressão no Trecho (${getUnitSymbol('pressure')})</label>
            <input type="text" id="disp-pipe-deltap" title="${TOOLTIPS.conexao.deltaPTrecho}" value="${displayUnitValue('pressure', state.deltaPBar, 3)}" disabled>
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.conexao.comprimentoTotal}">Comprimento Total (${getUnitSymbol('length')})</label>
            <input type="text" id="disp-pipe-length" title="${TOOLTIPS.conexao.comprimentoTotal}" value="${displayUnitValue('length', state.lengthM || geometry.lengthM, 2)}" disabled>
        </div>
    `;

    const advancedContent = `
        <div class="prop-group">
            <label title="${TOOLTIPS.conexao.comprimentoExtra}">Comprimento Extra (${getUnitSymbol('length')})</label>
            <input type="number" id="input-pipe-extra-length" title="${TOOLTIPS.conexao.comprimentoExtra}" value="${displayEditableUnitValue('length', connection.extraLengthM || 0, 4)}" step="${displayStep('length', 0.1)}" min="${displayBound('length', 0)}" max="${displayBound('length', 500)}">
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.conexao.rugosidade}">Rugosidade Absoluta (${getUnitSymbol('length')})</label>
            <input type="number" id="input-pipe-roughness" title="${TOOLTIPS.conexao.rugosidade}" value="${displayEditableUnitValue('length', (connection.roughnessMm || DEFAULT_PIPE_ROUGHNESS_MM) / 1000, 6)}" step="${displayStep('length', 0.000005, 6)}" min="${displayBound('length', 0.000001, 6)}" max="${displayBound('length', 0.005, 6)}">
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.conexao.perdaLocal}">Perda Local K</label>
            <input type="number" id="input-pipe-loss-k" title="${TOOLTIPS.conexao.perdaLocal}" value="${connection.perdaLocalK}" step="0.1" min="0" max="100">
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.conexao.velocidade}">Velocidade (m/s)</label>
            <input type="text" id="disp-pipe-velocity" title="${TOOLTIPS.conexao.velocidade}" value="${state.velocityMps.toFixed(2)}" disabled>
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.conexao.reynolds}">Reynolds</label>
            <input type="text" id="disp-pipe-reynolds" title="${TOOLTIPS.conexao.reynolds}" value="${Math.round(state.reynolds)}" disabled>
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.conexao.fatorAtritoDarcy}">Fator de Atrito Darcy</label>
            <input type="text" id="disp-pipe-friction" title="${TOOLTIPS.conexao.fatorAtritoDarcy}" value="${state.frictionFactor.toFixed(4)}" disabled>
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.conexao.regime}">Regime</label>
            <input type="text" id="disp-pipe-regime" title="${TOOLTIPS.conexao.regime}" value="${translateLiteral(state.regime)}" disabled>
        </div>
        <div class="prop-group">
            <label title="Densidade do fluido ou mistura que está no trecho.">Densidade do Fluido (kg/m³)</label>
            <input type="text" id="disp-pipe-fluid-density" title="Densidade do fluido ou mistura que está no trecho." value="${(currentFluid?.densidade || 0).toFixed(1)}" disabled>
        </div>
        <div class="prop-group">
            <label title="Viscosidade dinâmica do fluido ou mistura que está no trecho.">Viscosidade do Fluido (Pa.s)</label>
            <input type="text" id="disp-pipe-fluid-viscosity" title="Viscosidade dinâmica do fluido ou mistura que está no trecho." value="${(currentFluid?.viscosidadeDinamicaPaS || 0).toFixed(5)}" disabled>
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.conexao.respostaHidraulica}">Resposta Hidráulica (s)</label>
            <input type="text" id="disp-pipe-response" title="${TOOLTIPS.conexao.respostaHidraulica}" value="${state.responseTimeS.toFixed(2)}" disabled>
        </div>
    `;

    propContent.innerHTML = `
        ${renderUnitControls()}
        ${renderPropertyTabs({
            basicContent,
            advancedContent,
            advancedDescription: 'Os parâmetros desta aba refinam perdas distribuídas, perdas locais e a resposta transitória da linha. São úteis quando você quer aproximar melhor a hidráulica do trecho.'
        })}
    `;
    localizeElement(propContent);

    bindUnitControls({ onChange: onRerender });
    bindPropertyTabs(propContent);

    const validatePipeInput = (element, validator, fieldName, setter) => {
        if (!element) return;
        try {
            const result = validator(element.value, fieldName);
            if (!result.valid) {
                showInputError(element, result.error);
                console.warn(`Validação falhou para ${fieldName}: ${result.error}`);
                return;
            }
            clearInputError(element);
            setter(result.value);
            engine.ensureConnectionProperties(connection);
            engine.clearConnectionDynamics?.();
            if (!engine.isRunning) engine.resetHydraulicState?.();
            engine.updatePipesVisual?.();
            engine.notify(EngineEventPayloads.panelUpdate(0));
        } catch (error) {
            console.error(`Erro ao validar ${fieldName}:`, error);
            showInputError(element, `Erro: ${error.message}`);
        }
    };

    bind('input-pipe-diameter', 'change', (event) => {
        validatePipeInput(
            event.target,
            (value, name) => InputValidator.validateNumber(lengthInputValue(value), 0.01, 0.3, name),
            'Diâmetro',
            (value) => { connection.diameterM = value; }
        );
    });

    bind('input-pipe-extra-length', 'change', (event) => {
        validatePipeInput(
            event.target,
            (value, name) => InputValidator.validateNumber(lengthInputValue(value), 0, 500, name),
            'Comprimento Extra',
            (value) => { connection.extraLengthM = value; }
        );
    });

    bind('input-pipe-roughness', 'change', (event) => {
        validatePipeInput(
            event.target,
            (value, name) => InputValidator.validateNumber(lengthInputValue(value), 0.000001, 0.005, name),
            'Rugosidade',
            (value) => { connection.roughnessMm = value * 1000; }
        );
    });

    bind('input-pipe-loss-k', 'change', (event) => {
        validatePipeInput(
            event.target,
            (value, name) => InputValidator.validateNumber(value, 0, 100, name),
            'Coeficiente Perda',
            (value) => { connection.perdaLocalK = value; }
        );
    });

    bind('input-pipe-design-velocity', 'change', (event) => {
        validatePipeInput(
            event.target,
            (value, name) => InputValidator.validateNumber(value, 0.1, 8, name),
            'Velocidade de projeto',
            (value) => {
                connection.designVelocityMps = value;
                const suggested = getSuggestedDiameterM(connection, engine.getConnectionState(connection));
                setValue('disp-pipe-suggested-diameter', displayUnitValue('length', suggested, 4));
            }
        );
    });

    bind('btn-apply-pipe-suggested-diameter', 'click', () => {
        const suggested = getSuggestedDiameterM(connection, engine.getConnectionState(connection));
        if (suggested <= 0) return;

        connection.diameterM = suggested;
        engine.ensureConnectionProperties(connection);
        setValue('input-pipe-diameter', displayEditableUnitValue('length', connection.diameterM, 4));
        setValue('disp-pipe-suggested-diameter', displayUnitValue('length', suggested, 4));
        engine.clearConnectionDynamics?.();
        if (!engine.isRunning) engine.resetHydraulicState?.();
        engine.updatePipesVisual?.();
        engine.notify(EngineEventPayloads.panelUpdate(0));
    });
}
