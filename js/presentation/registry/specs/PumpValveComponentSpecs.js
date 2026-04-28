import {
    BombaLogica,
    COMPONENT_EVENTS,
    ComponentEventPayloads,
    ENGINE,
    ENGINE_EVENTS,
    InputValidator,
    TOOLTIP,
    ValvulaLogica,
    baseFromDisplay,
    createElevationUpdater,
    displayBound,
    displayEditableUnitValue,
    displayStep,
    displayUnitValue,
    hintAttr,
    labelStyle,
    makeLabel,
    makePort,
    makeUnitLabel,
    notifyPanelRefresh,
    renderPropertyTabs,
    validateInputWithFeedback
} from '../shared/RegistryShared.js';

function pumpCurveMarkup() {
    return `
        <div class="prop-group">
            ${makeLabel('Curva da bomba', TOOLTIP.pumpCurve)}
            <div style="position:relative; height:280px; margin-top:8px;">
                <canvas id="pump-curve-chart"></canvas>
            </div>
            <p style="margin:8px 0 0; font-size:11px; line-height:1.45; color:#7f8c8d;">
                Curva padrão: Q = vazão, H = carga/pressão gerada, η = eficiência e NPSHr = altura mínima de sucção requerida.
            </p>
        </div>
    `;
}

export const PUMP_COMPONENT_SPEC = {
    Classe: BombaLogica,
    prefixoTag: 'P',
    w: 80,
    h: 80,
    offX: 0,
    offY: 0,
    svg: (id, tag) => `
        <circle cx="40" cy="40" r="34" fill="#fff" stroke="#2c3e50" stroke-width="6"/>
        <circle id="led-${id}" cx="40" cy="40" r="10" fill="#e74c3c"/>
        <text id="tag-${id}" x="40" y="88" font-size="12" ${labelStyle}>${tag}</text>
        <g>${makePort(id, 0, 40, 'in')} ${makePort(id, 80, 40, 'out')}</g>
    `,
    setup: (visual, logica, id) => {
        const atualizarElevacoes = createElevationUpdater({ visual, logica, id, offsetY: 0 });

        visual.addEventListener('dblclick', () => logica.toggle());

        logica.subscribe((dados) => {
            if (dados.tipo === COMPONENT_EVENTS.POSITION_UPDATE) atualizarElevacoes();
            if (dados.tipo === COMPONENT_EVENTS.STATE) {
                visual.querySelector(`#led-${id}`).setAttribute('fill', dados.grau > 0 ? '#2ecc71' : '#e74c3c');
            } else if (dados.tipo === COMPONENT_EVENTS.TAG_UPDATE) {
                visual.querySelector(`#tag-${id}`).textContent = logica.tag;
            }
        });

        ENGINE.subscribe((dados) => {
            if (dados.tipo === ENGINE_EVENTS.SIMULATION_CONFIG) atualizarElevacoes();
        });

        atualizarElevacoes();
    },
    propriedadesAdicionais: (comp) => {
        const bloqueadaPorSetpoint = ENGINE.isBombaBloqueadaPorSetpoint?.(comp) === true;
        const bloqueioAttr = bloqueadaPorSetpoint ? 'disabled' : '';
        const npshRequeridoAtualM = comp.npshRequeridoAtualM ?? comp.npshRequeridoM;
        const margemNpshM = comp.getMargemNpshAtualM?.() ?? (comp.npshDisponivelM - npshRequeridoAtualM);
        const condicaoSucao = comp.getCondicaoSucaoAtual?.()
            ?? (margemNpshM < 0 ? 'Risco de cavitação' : margemNpshM < 0.5 ? 'No limite' : 'Com folga');

        const basicContent = `
            <div class="prop-group">
                <label ${hintAttr(TOOLTIP.pumpDrive)}>Acionamento do motor
                    <span style="display:flex; align-items:center; gap:2px;">
                        <input type="number" id="val-acionamento" class="val-display-input" ${hintAttr(TOOLTIP.pumpDrive)} value="${Math.round(comp.grauAcionamento)}" ${bloqueioAttr}> %
                    </span>
                </label>
                <input type="range" id="input-acionamento" min="0" max="100" value="${Math.round(comp.grauAcionamento)}" ${hintAttr(TOOLTIP.pumpDrive)} ${bloqueioAttr}>
                ${bloqueadaPorSetpoint ? '<p style="margin:6px 0 0; font-size:11px; color:#c0392b;">Bomba mantida ligada pelo controlador de nível do tanque.</p>' : ''}
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Vazão nominal máx.', 'flow', TOOLTIP.pumpFlow)}
                <input type="number" id="input-vazmax" ${hintAttr(TOOLTIP.pumpFlow)} value="${displayEditableUnitValue('flow', comp.vazaoNominal, 3)}" step="${displayStep('flow', 0.5)}" min="${displayBound('flow', 5)}" max="${displayBound('flow', 500)}">
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Pressão máxima', 'pressure', TOOLTIP.pumpPressure)}
                <input type="number" id="input-pressao-max-bomba" ${hintAttr(TOOLTIP.pumpPressure)} value="${displayEditableUnitValue('pressure', comp.pressaoMaxima, 3)}" step="${displayStep('pressure', 0.01)}" min="${displayBound('pressure', 0.5)}" max="${displayBound('pressure', 20)}">
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Vazão atual', 'flow', TOOLTIP.pumpCurrentFlow)}
                <input type="text" id="disp-vazao-bomba" value="${displayUnitValue('flow', comp.fluxoReal, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Pressão de sucção', 'pressure', TOOLTIP.pumpSuctionPressure)}
                <input type="text" id="disp-succao-bomba" value="${displayUnitValue('pressure', comp.pressaoSucaoAtualBar, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Pressão de descarga', 'pressure', TOOLTIP.pumpDischargePressure)}
                <input type="text" id="disp-descarga-bomba" value="${displayUnitValue('pressure', comp.pressaoDescargaAtualBar, 2)}" disabled>
            </div>
        `;

        const advancedContent = `
            <div class="prop-group" style="background:#f7fbff; border:1px solid #d6eaf8; border-radius:8px; padding:10px 12px;">
                <p style="margin:0; font-size:11px; line-height:1.5; color:#5d6d7e;">
                    <strong>NPSHa atual</strong> mostra o que o sistema está entregando na sucção agora.
                    <strong>NPSHr atual</strong> mostra o que a bomba está exigindo agora no ponto de operação.
                    <strong>Folga contra cavitação</strong> é a diferença entre os dois; valor negativo indica risco de cavitação.
                </p>
            </div>
            <div class="prop-group">
                ${makeLabel('Eficiência hidráulica (%)', TOOLTIP.pumpEfficiency)}
                <input type="number" id="input-eficiencia-bomba" ${hintAttr(TOOLTIP.pumpEfficiency)} value="${(comp.eficienciaHidraulica * 100).toFixed(0)}" step="1" min="20" max="100">
            </div>
            <div class="prop-group">
                ${makeUnitLabel('NPSHr de referência', 'length', TOOLTIP.pumpNpshr)}
                <input type="number" id="input-npsh-bomba" ${hintAttr(TOOLTIP.pumpNpshr)} value="${displayEditableUnitValue('length', comp.npshRequeridoM, 3)}" step="${displayStep('length', 0.05)}" min="${displayBound('length', 0.5)}" max="${displayBound('length', 50)}">
            </div>
            <div class="prop-group">
                ${makeLabel('Tempo de rampa (s)', TOOLTIP.pumpRamp)}
                <input type="number" id="input-rampa-bomba" ${hintAttr(TOOLTIP.pumpRamp)} value="${comp.tempoRampaSegundos}" step="0.1" min="0" max="20">
            </div>
            <div class="prop-group">
                <label>Acionamento efetivo (%)</label>
                <input type="text" id="disp-acionamento-real-bomba" value="${comp.acionamentoEfetivo.toFixed(1)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('NPSHa atual', 'length', TOOLTIP.pumpCurrentNpsha)}
                <input type="text" id="disp-npsha-bomba" value="${displayUnitValue('length', comp.npshDisponivelM, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('NPSHr atual', 'length', TOOLTIP.pumpCurrentNpshr)}
                <input type="text" id="disp-npshr-atual-bomba" value="${displayUnitValue('length', npshRequeridoAtualM, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Folga contra cavitação', 'length', TOOLTIP.pumpNpshMargin)}
                <input type="text" id="disp-margem-npsh-bomba" value="${displayUnitValue('length', margemNpshM, 2)}" disabled>
            </div>
            <div class="prop-group">
                <label ${hintAttr(TOOLTIP.pumpNpshCondition)}>Condição de sucção</label>
                <input type="text" id="disp-condicao-npsh-bomba" value="${condicaoSucao}" disabled>
            </div>
            <div class="prop-group">
                <label>Saúde hidráulica</label>
                <input type="text" id="disp-cavitacao-bomba" value="${(comp.fatorCavitacaoAtual * 100).toFixed(0)}%" disabled>
            </div>
            <div class="prop-group">
                <label>Eficiência atual</label>
                <input type="text" id="disp-eficiencia-bomba" value="${(comp.eficienciaAtual * 100).toFixed(0)}%" disabled>
            </div>
            ${pumpCurveMarkup()}
        `;

        return renderPropertyTabs({
            basicContent,
            advancedContent,
            advancedDescription: 'Parâmetros de curva, cavitação e dinâmica da bomba. Os campos “atuais” mostram a condição instantânea da sucção e ajudam a entender se a bomba está operando com folga ou perto da cavitação.'
        });
    },
    setupProps: (comp) => {
        const slider = document.getElementById('input-acionamento');
        const numInput = document.getElementById('val-acionamento');
        const bombaBloqueadaPorSetpoint = () => ENGINE.isBombaBloqueadaPorSetpoint?.(comp) === true;
        const sincronizarBloqueioSetpoint = () => {
            const bloqueada = bombaBloqueadaPorSetpoint();
            if (slider) slider.disabled = bloqueada;
            if (numInput) numInput.disabled = bloqueada;
        };
        const refreshPumpPanel = () => {
            comp.notify(ComponentEventPayloads.state({
                isOn: comp.isOn,
                grau: comp.grauAcionamento,
                grauEfetivo: comp.acionamentoEfetivo,
                bloqueadaPorSetpoint: bombaBloqueadaPorSetpoint()
            }));
            notifyPanelRefresh();
        };

        const updateFromSlider = (value) => {
            numInput.value = value;
            comp.setAcionamento(value);
            refreshPumpPanel();
        };

        const updateFromInput = (value) => {
            let parsed = parseInt(value, 10);
            if (Number.isNaN(parsed)) parsed = 0;
            const clamped = Math.max(0, Math.min(100, parsed));
            numInput.value = clamped;
            slider.value = clamped;
            comp.setAcionamento(clamped);
            refreshPumpPanel();
        };

        slider.addEventListener('input', (event) => updateFromSlider(event.target.value));
        numInput.addEventListener('change', (event) => updateFromInput(event.target.value));
        document.getElementById('input-vazmax').addEventListener('change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateFlow(baseFromDisplay('flow', value, 0), 500, name),
                'Vazão nominal',
                (validated) => { comp.vazaoNominal = validated; }
            );
        });
        document.getElementById('input-pressao-max-bomba').addEventListener('change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validatePressure(baseFromDisplay('pressure', value, 0), 20, name),
                'Pressão máxima',
                (validated) => { comp.pressaoMaxima = validated; }
            );
        });
        document.getElementById('input-eficiencia-bomba').addEventListener('change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(value, 20, 100, name),
                'Eficiência',
                (validated) => { comp.eficienciaHidraulica = validated / 100; }
            );
        });
        document.getElementById('input-npsh-bomba').addEventListener('change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNPSH(baseFromDisplay('length', value, 0), name),
                'NPSH requerido',
                (validated) => { comp.npshRequeridoM = validated; }
            );
        });
        document.getElementById('input-rampa-bomba').addEventListener('change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(value, 0, 20, name),
                'Tempo de rampa',
                (validated) => { comp.tempoRampaSegundos = validated; }
            );
        });

        comp.subscribe((dados) => {
            if (dados.tipo === COMPONENT_EVENTS.STATE && slider) {
                sincronizarBloqueioSetpoint();
                slider.value = dados.grau;
                numInput.value = dados.grau;
                const effectiveDisplay = document.getElementById('disp-acionamento-real-bomba');
                if (effectiveDisplay) effectiveDisplay.value = (dados.grauEfetivo ?? dados.grau).toFixed(1);
            }
        });

        sincronizarBloqueioSetpoint();
    }
};

export const VALVE_COMPONENT_SPEC = {
    Classe: ValvulaLogica,
    prefixoTag: 'V',
    w: 40,
    h: 40,
    offX: -20,
    offY: -20,
    svg: (id, tag) => `
        <rect x="10" y="34" width="60" height="12" fill="#95a5a6" stroke="#2c3e50" stroke-width="2"/>
        <path id="corpo-${id}" d="M 20 20 L 20 60 L 60 20 L 60 60 Z" fill="#e74c3c" stroke="#2c3e50" stroke-width="3" stroke-linejoin="round"/>
        <rect x="36" y="5" width="8" height="35" fill="#c0392b" stroke="#2c3e50" stroke-width="2"/>
        <rect id="volante-${id}" x="25" y="0" width="30" height="10" fill="#e74c3c" stroke="#2c3e50" stroke-width="2" rx="3"/>
        <text id="tag-${id}" x="40" y="85" font-size="12" ${labelStyle}>${tag}</text>
        <g>${makePort(id, 20, 40, 'in')} ${makePort(id, 60, 40, 'out')}</g>
    `,
    setup: (visual, logica, id) => {
        const atualizarElevacoes = createElevationUpdater({ visual, logica, id, offsetY: -20 });

        visual.addEventListener('dblclick', () => logica.toggle());

        logica.subscribe((dados) => {
            if (dados.tipo === COMPONENT_EVENTS.POSITION_UPDATE) atualizarElevacoes();
            if (dados.tipo === COMPONENT_EVENTS.STATE) {
                const perc = (typeof dados.grauEfetivo === 'number' ? dados.grauEfetivo : dados.grau) / 100.0;
                const r = Math.round(231 + (46 - 231) * perc);
                const g = Math.round(76 + (204 - 76) * perc);
                const b = Math.round(60 + (113 - 60) * perc);
                const cor = `rgb(${r}, ${g}, ${b})`;
                visual.querySelector(`#corpo-${id}`).setAttribute('fill', cor);
                visual.querySelector(`#volante-${id}`).setAttribute('fill', cor);
            } else if (dados.tipo === COMPONENT_EVENTS.TAG_UPDATE) {
                visual.querySelector(`#tag-${id}`).textContent = logica.tag;
            }
        });

        ENGINE.subscribe((dados) => {
            if (dados.tipo === ENGINE_EVENTS.SIMULATION_CONFIG) atualizarElevacoes();
        });

        atualizarElevacoes();
    },
    propriedadesAdicionais: (comp) => {
        const controladaPorSetpoint = ENGINE.isValvulaBloqueadaPorSetpoint?.(comp) === true || comp.estaControladaPorSetpoint?.() === true;
        const bloqueioAttr = controladaPorSetpoint ? 'disabled' : '';
        const basicContent = `
            <div class="prop-group">
                <label ${hintAttr(TOOLTIP.valveOpening)}>Abertura
                    <span style="display:flex; align-items:center; gap:2px;">
                        <input type="number" id="val-abertura" class="val-display-input" ${hintAttr(TOOLTIP.valveOpening)} value="${Math.round(comp.grauAbertura)}" ${bloqueioAttr}> %
                    </span>
                </label>
                <input type="range" id="input-abertura" min="0" max="100" value="${Math.round(comp.grauAbertura)}" ${hintAttr(TOOLTIP.valveOpening)} ${bloqueioAttr}>
                ${controladaPorSetpoint ? '<p style="margin:6px 0 0; font-size:11px; color:#c0392b;">Válvula sob controle do ponto de ajuste do tanque. Abertura, Cv e K são ajustados automaticamente.</p>' : ''}
            </div>
            <div class="prop-group">
                <label>Abertura efetiva (%)</label>
                <input type="text" id="disp-abertura-efetiva-valvula" value="${comp.aberturaEfetiva.toFixed(1)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Vazão atual', 'flow', TOOLTIP.valveCurrentFlow)}
                <input type="text" id="disp-vazao-valvula" value="${displayUnitValue('flow', comp.fluxoReal, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Queda de pressão atual', 'pressure', TOOLTIP.valveCurrentDeltaP)}
                <input type="text" id="disp-deltap-valvula" value="${displayUnitValue('pressure', comp.deltaPAtualBar, 2)}" disabled>
            </div>
        `;
        const advancedContent = `
            <div class="prop-group">
                ${makeLabel('Coeficiente de vazão (Cv)', TOOLTIP.valveCv)}
                <input type="number" id="input-cv" ${hintAttr(TOOLTIP.valveCv)} value="${comp.cv.toFixed(2)}" step="0.1" min="0.1" max="250" ${bloqueioAttr}>
            </div>
            <div class="prop-group">
                ${makeLabel('Coeficiente de perda (K)', TOOLTIP.valveK)}
                <input type="number" id="input-perda-k" ${hintAttr(TOOLTIP.valveK)} value="${comp.perdaLocalK.toFixed(3)}" step="0.01" min="0.0" max="100" ${bloqueioAttr}>
            </div>
            <div class="prop-group">
                ${makeLabel('Característica da válvula', TOOLTIP.valveCharacteristic)}
                <select id="input-caracteristica-valvula" ${hintAttr(TOOLTIP.valveCharacteristic)} ${bloqueioAttr}>
                    <option value="equal_percentage" ${comp.tipoCaracteristica === 'equal_percentage' ? 'selected' : ''}>Igual porcentagem</option>
                    <option value="linear" ${comp.tipoCaracteristica === 'linear' ? 'selected' : ''}>Linear</option>
                    <option value="quick_opening" ${comp.tipoCaracteristica === 'quick_opening' ? 'selected' : ''}>Abertura rápida</option>
                </select>
            </div>
            <div class="prop-group">
                ${makeLabel('Rangeabilidade', TOOLTIP.valveRangeability)}
                <input type="number" id="input-rangeabilidade-valvula" ${hintAttr(TOOLTIP.valveRangeability)} value="${comp.rangeabilidade}" step="1" min="5" max="1000" ${bloqueioAttr}>
            </div>
            <div class="prop-group">
                ${makeLabel('Tempo de curso (s)', TOOLTIP.valveStroke)}
                <input type="number" id="input-curso-valvula" ${hintAttr(TOOLTIP.valveStroke)} value="${comp.tempoCursoSegundos}" step="0.1" min="0" max="60" ${bloqueioAttr}>
            </div>
        `;

        return renderPropertyTabs({
            basicContent,
            advancedContent,
            advancedDescription: 'Aba indicada para parametrização fina da válvula. Cv, K, característica e rangeabilidade mudam diretamente a capacidade de passagem e a sensibilidade do controle.'
        });
    },
    setupProps: (comp) => {
        const slider = document.getElementById('input-abertura');
        const numInput = document.getElementById('val-abertura');
        const cvInput = document.getElementById('input-cv');
        const perdaInput = document.getElementById('input-perda-k');
        const caracteristicaInput = document.getElementById('input-caracteristica-valvula');
        const rangeabilidadeInput = document.getElementById('input-rangeabilidade-valvula');
        const cursoInput = document.getElementById('input-curso-valvula');
        const valvulaBloqueadaPorSetpoint = () => ENGINE.isValvulaBloqueadaPorSetpoint?.(comp) === true || comp.estaControladaPorSetpoint?.() === true;
        const sincronizarBloqueioSetpoint = () => {
            const bloqueada = valvulaBloqueadaPorSetpoint();
            [slider, numInput, cvInput, perdaInput, caracteristicaInput, rangeabilidadeInput, cursoInput].forEach((input) => {
                if (input) input.disabled = bloqueada;
            });
        };
        const refreshValvePanel = () => {
            comp.notify(ComponentEventPayloads.state({
                aberta: comp.aberta,
                grau: comp.grauAbertura,
                grauEfetivo: comp.aberturaEfetiva
            }));
            notifyPanelRefresh();
        };

        const updateFromSlider = (value) => {
            if (valvulaBloqueadaPorSetpoint()) {
                sincronizarBloqueioSetpoint();
                return;
            }
            numInput.value = value;
            comp.setAbertura(value);
            refreshValvePanel();
        };

        const updateFromInput = (value) => {
            if (valvulaBloqueadaPorSetpoint()) {
                sincronizarBloqueioSetpoint();
                return;
            }
            let parsed = parseInt(value, 10);
            if (Number.isNaN(parsed)) parsed = 0;
            const clamped = Math.max(0, Math.min(100, parsed));
            numInput.value = clamped;
            slider.value = clamped;
            comp.setAbertura(clamped);
            refreshValvePanel();
        };

        slider.addEventListener('input', (event) => updateFromSlider(event.target.value));
        numInput.addEventListener('change', (event) => updateFromInput(event.target.value));
        cvInput.addEventListener('change', (event) => {
            if (valvulaBloqueadaPorSetpoint()) {
                event.target.value = comp.cv.toFixed(2);
                sincronizarBloqueioSetpoint();
                return;
            }
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(value, 0.05, 250, name),
                'Coeficiente Cv',
                (validated) => { comp.setCoeficienteVazao(validated); }
            );
        });
        perdaInput.addEventListener('change', (event) => {
            if (valvulaBloqueadaPorSetpoint()) {
                event.target.value = comp.perdaLocalK.toFixed(3);
                sincronizarBloqueioSetpoint();
                return;
            }
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(value, 0, 100, name),
                'Coeficiente de perda K',
                (validated) => { comp.setCoeficientePerda(validated); }
            );
        });
        caracteristicaInput.addEventListener('change', (event) => {
            if (valvulaBloqueadaPorSetpoint()) {
                event.target.value = comp.tipoCaracteristica;
                sincronizarBloqueioSetpoint();
                return;
            }
            comp.tipoCaracteristica = event.target.value;
            notifyPanelRefresh();
        });
        rangeabilidadeInput.addEventListener('change', (event) => {
            if (valvulaBloqueadaPorSetpoint()) {
                event.target.value = comp.rangeabilidade;
                sincronizarBloqueioSetpoint();
                return;
            }
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(value, 5, 1000, name),
                'Rangeabilidade',
                (validated) => { comp.rangeabilidade = validated; }
            );
        });
        cursoInput.addEventListener('change', (event) => {
            if (valvulaBloqueadaPorSetpoint()) {
                event.target.value = comp.tempoCursoSegundos;
                sincronizarBloqueioSetpoint();
                return;
            }
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(value, 0, 60, name),
                'Tempo de curso',
                (validated) => { comp.tempoCursoSegundos = validated; }
            );
        });

        comp.subscribe((dados) => {
            if (dados.tipo === COMPONENT_EVENTS.STATE && slider) {
                sincronizarBloqueioSetpoint();
                slider.value = dados.grau;
                numInput.value = dados.grau;
                if (cvInput && document.activeElement !== cvInput) cvInput.value = comp.cv.toFixed(2);
                if (perdaInput && document.activeElement !== perdaInput) perdaInput.value = comp.perdaLocalK.toFixed(3);
                const effectiveDisplay = document.getElementById('disp-abertura-efetiva-valvula');
                if (effectiveDisplay) effectiveDisplay.value = (dados.grauEfetivo ?? dados.grau).toFixed(1);
            }
        });

        sincronizarBloqueioSetpoint();
    }
};
