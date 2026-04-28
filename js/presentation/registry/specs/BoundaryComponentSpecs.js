import {
    COMPONENT_EVENTS,
    DrenoLogico,
    ENGINE,
    ENGINE_EVENTS,
    FonteLogica,
    InputValidator,
    TOOLTIP,
    baseFromDisplay,
    createElevationUpdater,
    displayBound,
    displayEditableUnitValue,
    displayStep,
    displayUnitValue,
    hintAttr,
    labelStyle,
    makePort,
    makeUnitLabel,
    validateInputWithFeedback
} from '../shared/RegistryShared.js';

export const SOURCE_COMPONENT_SPEC = {
    Classe: FonteLogica,
    prefixoTag: 'Entrada',
    w: 40,
    h: 40,
    offX: -20,
    offY: -20,
    svg: (id, tag) => `
        <circle cx="40" cy="40" r="25" fill="#3498db" stroke="#2980b9" stroke-width="4"/>
        <path d="M 25 40 L 40 40 M 35 35 L 40 40 L 35 45" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
        <text id="tag-${id}" x="40" y="80" font-size="11" ${labelStyle}>${tag}</text>
        <g>${makePort(id, 65, 40, 'out')}</g>
    `,
    setup: (visual, logica, id) => {
        const atualizarElevacoes = createElevationUpdater({ visual, logica, id, offsetY: -20 });

        logica.subscribe((dados) => {
            if (dados.tipo === COMPONENT_EVENTS.POSITION_UPDATE) atualizarElevacoes();
            if (dados.tipo === COMPONENT_EVENTS.TAG_UPDATE) {
                visual.querySelector(`#tag-${id}`).textContent = logica.tag;
            }
        });

        ENGINE.subscribe((dados) => {
            if (dados.tipo === ENGINE_EVENTS.SIMULATION_CONFIG) atualizarElevacoes();
        });

        atualizarElevacoes();
    },
    propriedadesAdicionais: (comp) => `
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
    setupProps: (comp) => {
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

export const SINK_COMPONENT_SPEC = {
    Classe: DrenoLogico,
    prefixoTag: 'Saída',
    w: 40,
    h: 40,
    offX: -20,
    offY: -20,
    svg: (id, tag) => `
        <circle cx="40" cy="40" r="25" fill="#95a5a6" stroke="#7f8c8d" stroke-width="4"/>
        <path d="M 35 30 L 45 30 M 40 30 L 40 45 M 35 40 L 40 45 L 45 40" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
        <text id="tag-${id}" x="40" y="80" font-size="11" ${labelStyle}>${tag}</text>
        <g>${makePort(id, 15, 40, 'in')}</g>
    `,
    setup: (visual, logica, id) => {
        const atualizarElevacoes = createElevationUpdater({ visual, logica, id, offsetY: -20 });

        logica.subscribe((dados) => {
            if (dados.tipo === COMPONENT_EVENTS.POSITION_UPDATE) atualizarElevacoes();
            if (dados.tipo === COMPONENT_EVENTS.TAG_UPDATE) {
                visual.querySelector(`#tag-${id}`).textContent = logica.tag;
            }
        });

        ENGINE.subscribe((dados) => {
            if (dados.tipo === ENGINE_EVENTS.SIMULATION_CONFIG) atualizarElevacoes();
        });

        atualizarElevacoes();
    },
    propriedadesAdicionais: (comp) => `
        <div class="prop-group">
            ${makeUnitLabel('Pressão de descarga', 'pressure', TOOLTIP.sinkPressure)}
            <input type="number" id="input-pressao-dreno" ${hintAttr(TOOLTIP.sinkPressure)} value="${displayEditableUnitValue('pressure', comp.pressaoSaidaBar, 3)}" step="${displayStep('pressure', 0.01)}" min="${displayBound('pressure', 0)}" max="${displayBound('pressure', 10)}">
        </div>
        <div class="prop-group">
            ${makeUnitLabel('Vazão recebida', 'flow', TOOLTIP.sinkCurrentFlow)}
            <input type="text" id="disp-vazao-dreno" value="${displayUnitValue('flow', comp.vazaoRecebidaLps, 2)}" disabled>
        </div>
    `,
    setupProps: (comp) => {
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
