import {
    ENGINE,
    InputValidator,
    TOOLTIP,
    baseFromDisplay,
    displayBound,
    displayEditableUnitValue,
    displayStep,
    displayUnitValue,
    hintAttr,
    makeUnitLabel,
    validateInputWithFeedback
} from '../PropertyPresenterShared.js';

export const SOURCE_PROPERTIES_PRESENTER = {
    render: (comp) => `
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
            <input type="text" id="disp-vazao-fonte" value="${displayUnitValue('flow', comp.fluxoReal, 2)}" disabled>
        </div>
    `,
    bind: (comp) => {
        const inputPressure = document.getElementById('input-pressao-fonte');
        const inputFlow = document.getElementById('input-vazao-fonte-max');

        inputPressure?.addEventListener('change', () => {
            validateInputWithFeedback(
                inputPressure,
                (value, name) => InputValidator.validatePressure(baseFromDisplay('pressure', value, 0), 20, name),
                'Pressão da fonte',
                (value) => { comp.pressaoFonteBar = value; }
            );
        });

        inputFlow?.addEventListener('change', () => {
            validateInputWithFeedback(
                inputFlow,
                (value, name) => InputValidator.validateFlow(baseFromDisplay('flow', value, 0), 500, name),
                'Vazão máxima',
                (value) => { comp.vazaoMaxima = value; }
            );
        });
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
            <input type="text" id="disp-vazao-dreno" value="${displayUnitValue('flow', comp.vazaoRecebidaLps, 2)}" disabled>
        </div>
    `,
    bind: (comp) => {
        const inputPressure = document.getElementById('input-pressao-dreno');

        inputPressure?.addEventListener('change', () => {
            validateInputWithFeedback(
                inputPressure,
                (value, name) => InputValidator.validatePressure(baseFromDisplay('pressure', value, 0), 10, name),
                'Pressão de saída',
                (value) => { comp.pressaoSaidaBar = value; }
            );
        });
    }
};
