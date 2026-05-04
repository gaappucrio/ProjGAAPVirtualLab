import { ENGINE } from '../../application/engine/SimulationEngine.js';
import { EngineEventPayloads } from '../../application/events/EventPayloads.js';
import { clearInputError, InputValidator, showInputError } from '../validation/InputValidator.js';
import { bindPropertyTabs, renderPropertyTabs } from '../../utils/PropertyTabs.js';
import { TOOLTIPS } from '../../utils/Tooltips.js';
import {
    DEFAULT_PIPE_ROUGHNESS_MM,
    getUnitSymbol
} from '../../utils/Units.js';
import {
    displayBound,
    displayEditableUnitValue,
    displayStep,
    displayUnitValue,
    rawBaseValue
} from './PropertyValueFormatters.js';
import { bindUnitControls, renderUnitControls } from './PropertyUnitsPresenter.js';

function getConnectionDisplay(connection) {
    const source = ENGINE.componentes.find((component) => component.id === connection.sourceId);
    const target = ENGINE.componentes.find((component) => component.id === connection.targetId);
    return {
        sourceLabel: source ? source.tag : connection.sourceId,
        targetLabel: target ? target.tag : connection.targetId
    };
}

function lengthInputValue(rawValue, fallback = NaN) {
    return rawBaseValue('length', rawValue, fallback);
}

export function renderConnectionProperties({
    propContent,
    connection,
    onRerender,
    onDestroyPumpCurve
}) {
    onDestroyPumpCurve?.();

    ENGINE.ensureConnectionProperties(connection);
    const state = ENGINE.getConnectionState(connection);
    const labels = getConnectionDisplay(connection);
    const geometry = ENGINE.getConnectionGeometry(connection);

    const basicContent = `
        <div class="prop-group">
            <label>${TOOLTIPS.conexao.titulo}</label>
            <input type="text" value="${labels.sourceLabel} -> ${labels.targetLabel}" disabled>
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.conexao.diametro}">Diâmetro Interno (${getUnitSymbol('length')})</label>
            <input type="number" id="input-pipe-diameter" title="${TOOLTIPS.conexao.diametro}" value="${displayEditableUnitValue('length', connection.diameterM, 4)}" step="${displayStep('length', 0.005)}" min="${displayBound('length', 0.01)}" max="${displayBound('length', 0.3)}">
        </div>
        <div class="prop-group">
            <label>Vazão Atual (${getUnitSymbol('flow')})</label>
            <input type="text" id="disp-pipe-flow" value="${displayUnitValue('flow', state.flowLps, 2)}" disabled>
        </div>
        <div class="prop-group">
            <label>Vazão Alvo (${getUnitSymbol('flow')})</label>
            <input type="text" id="disp-pipe-target-flow" value="${displayUnitValue('flow', state.targetFlowLps, 2)}" disabled>
        </div>
        <div class="prop-group">
            <label>Queda de Pressão no Trecho (${getUnitSymbol('pressure')})</label>
            <input type="text" id="disp-pipe-deltap" value="${displayUnitValue('pressure', state.deltaPBar, 3)}" disabled>
        </div>
        <div class="prop-group">
            <label>Comprimento Total (${getUnitSymbol('length')})</label>
            <input type="text" id="disp-pipe-length" value="${displayUnitValue('length', state.lengthM || geometry.lengthM, 2)}" disabled>
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
            <label>Velocidade (m/s)</label>
            <input type="text" id="disp-pipe-velocity" value="${state.velocityMps.toFixed(2)}" disabled>
        </div>
        <div class="prop-group">
            <label>Reynolds</label>
            <input type="text" id="disp-pipe-reynolds" value="${Math.round(state.reynolds)}" disabled>
        </div>
        <div class="prop-group">
            <label>Fator de Atrito Darcy</label>
            <input type="text" id="disp-pipe-friction" value="${state.frictionFactor.toFixed(4)}" disabled>
        </div>
        <div class="prop-group">
            <label>Regime</label>
            <input type="text" id="disp-pipe-regime" value="${state.regime}" disabled>
        </div>
        <div class="prop-group">
            <label>Resposta Hidráulica (s)</label>
            <input type="text" id="disp-pipe-response" value="${state.responseTimeS.toFixed(2)}" disabled>
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
            ENGINE.ensureConnectionProperties(connection);
            ENGINE.clearConnectionDynamics?.();
            if (!ENGINE.isRunning) ENGINE.resetHydraulicState?.();
            ENGINE.updatePipesVisual?.();
            ENGINE.notify(EngineEventPayloads.panelUpdate(0));
        } catch (error) {
            console.error(`Erro ao validar ${fieldName}:`, error);
            showInputError(element, `Erro: ${error.message}`);
        }
    };

    document.getElementById('input-pipe-diameter').addEventListener('change', (event) => {
        validatePipeInput(
            event.target,
            (value, name) => InputValidator.validateNumber(lengthInputValue(value), 0.01, 0.3, name),
            'Diâmetro',
            (value) => { connection.diameterM = value; }
        );
    });

    document.getElementById('input-pipe-extra-length').addEventListener('change', (event) => {
        validatePipeInput(
            event.target,
            (value, name) => InputValidator.validateNumber(lengthInputValue(value), 0, 500, name),
            'Comprimento Extra',
            (value) => { connection.extraLengthM = value; }
        );
    });

    document.getElementById('input-pipe-roughness').addEventListener('change', (event) => {
        validatePipeInput(
            event.target,
            (value, name) => InputValidator.validateNumber(lengthInputValue(value), 0.000001, 0.005, name),
            'Rugosidade',
            (value) => { connection.roughnessMm = value * 1000; }
        );
    });

    document.getElementById('input-pipe-loss-k').addEventListener('change', (event) => {
        validatePipeInput(
            event.target,
            (value, name) => InputValidator.validateNumber(value, 0, 100, name),
            'Coeficiente Perda',
            (value) => { connection.perdaLocalK = value; }
        );
    });
}
