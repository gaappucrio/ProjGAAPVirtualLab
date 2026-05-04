import {
    COMPONENT_EVENTS,
    ComponentEventPayloads,
    ENGINE,
    InputValidator,
    TOOLTIP,
    baseFromDisplay,
    displayBound,
    displayEditableUnitValue,
    displayStep,
    displayUnitValue,
    hintAttr,
    makeLabel,
    makeUnitLabel,
    notifyPanelRefresh,
    renderPropertyTabs,
    validateInputWithFeedback
} from '../PropertyPresenterShared.js';
import { VALVE_PROFILE_DEFINITIONS } from '../../../domain/components/ValvulaLogica.js';

export const PUMP_PROPERTIES_PRESENTER = {
    render: (comp) => {
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
                <input type="text" id="disp-vazao-bomba" ${hintAttr(TOOLTIP.pumpCurrentFlow)} value="${displayUnitValue('flow', comp.fluxoReal, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Pressão de sucção', 'pressure', TOOLTIP.pumpSuctionPressure)}
                <input type="text" id="disp-succao-bomba" ${hintAttr(TOOLTIP.pumpSuctionPressure)} value="${displayUnitValue('pressure', comp.pressaoSucaoAtualBar, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Pressão de descarga', 'pressure', TOOLTIP.pumpDischargePressure)}
                <input type="text" id="disp-descarga-bomba" ${hintAttr(TOOLTIP.pumpDischargePressure)} value="${displayUnitValue('pressure', comp.pressaoDescargaAtualBar, 2)}" disabled>
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
                ${makeLabel('Acionamento efetivo (%)', TOOLTIP.pumpEffectiveDrive)}
                <input type="text" id="disp-acionamento-real-bomba" ${hintAttr(TOOLTIP.pumpEffectiveDrive)} value="${comp.acionamentoEfetivo.toFixed(1)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('NPSHa atual', 'length', TOOLTIP.pumpCurrentNpsha)}
                <input type="text" id="disp-npsha-bomba" ${hintAttr(TOOLTIP.pumpCurrentNpsha)} value="${displayUnitValue('length', comp.npshDisponivelM, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('NPSHr atual', 'length', TOOLTIP.pumpCurrentNpshr)}
                <input type="text" id="disp-npshr-atual-bomba" ${hintAttr(TOOLTIP.pumpCurrentNpshr)} value="${displayUnitValue('length', npshRequeridoAtualM, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Folga contra cavitação', 'length', TOOLTIP.pumpNpshMargin)}
                <input type="text" id="disp-margem-npsh-bomba" ${hintAttr(TOOLTIP.pumpNpshMargin)} value="${displayUnitValue('length', margemNpshM, 2)}" disabled>
            </div>
            <div class="prop-group">
                <label ${hintAttr(TOOLTIP.pumpNpshCondition)}>Condição de sucção</label>
                <input type="text" id="disp-condicao-npsh-bomba" ${hintAttr(TOOLTIP.pumpNpshCondition)} value="${condicaoSucao}" disabled>
            </div>
            <div class="prop-group">
                ${makeLabel('Saúde hidráulica', TOOLTIP.pumpHydraulicHealth)}
                <input type="text" id="disp-cavitacao-bomba" ${hintAttr(TOOLTIP.pumpHydraulicHealth)} value="${(comp.fatorCavitacaoAtual * 100).toFixed(0)}%" disabled>
            </div>
            <div class="prop-group">
                ${makeLabel('Eficiência atual', TOOLTIP.pumpCurrentEfficiency)}
                <input type="text" id="disp-eficiencia-bomba" ${hintAttr(TOOLTIP.pumpCurrentEfficiency)} value="${(comp.eficienciaAtual * 100).toFixed(0)}%" disabled>
            </div>
        `;

        return renderPropertyTabs({
            basicContent,
            advancedContent,
            advancedDescription: 'Parâmetros de curva, cavitação e dinâmica da bomba. Os campos atuais mostram a condição instantânea da sucção e ajudam a entender se a bomba está operando com folga ou perto da cavitação.'
        });
    },
    bind: (comp) => {
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
                (validated) => {
                    comp.vazaoNominal = validated;
                    comp.recalcularMetricasDerivadasCurva?.();
                }
            );
        });
        document.getElementById('input-pressao-max-bomba').addEventListener('change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validatePressure(baseFromDisplay('pressure', value, 0), 20, name),
                'Pressão máxima',
                (validated) => {
                    comp.pressaoMaxima = validated;
                    comp.recalcularMetricasDerivadasCurva?.();
                }
            );
        });
        document.getElementById('input-eficiencia-bomba').addEventListener('change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(value, 20, 100, name),
                'Eficiência',
                (validated) => {
                    comp.eficienciaHidraulica = validated / 100;
                    comp.recalcularMetricasDerivadasCurva?.();
                }
            );
        });
        document.getElementById('input-npsh-bomba').addEventListener('change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNPSH(baseFromDisplay('length', value, 0), name),
                'NPSH requerido',
                (validated) => {
                    comp.npshRequeridoM = validated;
                    comp.recalcularMetricasDerivadasCurva?.();
                }
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

export const VALVE_PROPERTIES_PRESENTER = {
    render: (comp) => {
        const controladaPorSetpoint = ENGINE.isValvulaBloqueadaPorSetpoint?.(comp) === true || comp.estaControladaPorSetpoint?.() === true;
        const bloqueioAttr = controladaPorSetpoint ? 'disabled' : '';
        const characteristicHints = TOOLTIP.valveCharacteristics;
        const profileHints = TOOLTIP.valveProfiles;
        const perfilAtual = VALVE_PROFILE_DEFINITIONS[comp.perfilCaracteristica]
            ? comp.perfilCaracteristica
            : (VALVE_PROFILE_DEFINITIONS[comp.tipoCaracteristica] ? comp.tipoCaracteristica : 'custom');
        const perfilPersonalizado = perfilAtual === 'custom';
        const bloqueioParametrosAttr = controladaPorSetpoint || !perfilPersonalizado ? 'disabled' : '';
        const selectedProfileHint = profileHints[perfilAtual] ?? TOOLTIP.valveProfile;
        const selectedCharacteristicHint = characteristicHints[comp.tipoCaracteristica] ?? TOOLTIP.valveCharacteristic;
        const basicContent = `
            <div class="prop-group">
                <label ${hintAttr(TOOLTIP.valveOpening)}>Abertura
                    <span style="display:flex; align-items:center; gap:2px;">
                        <input type="number" id="val-abertura" class="val-display-input" ${hintAttr(TOOLTIP.valveOpening)} value="${Math.round(comp.grauAbertura)}" ${bloqueioAttr}> %
                    </span>
                </label>
                <input type="range" id="input-abertura" min="0" max="100" value="${Math.round(comp.grauAbertura)}" ${hintAttr(TOOLTIP.valveOpening)} ${bloqueioAttr}>
                ${controladaPorSetpoint ? '<p style="margin:6px 0 0; font-size:11px; color:#c0392b;">Válvula sob controle do ponto de ajuste do tanque. Abertura e perfil são ajustados automaticamente.</p>' : ''}
            </div>
            <div class="prop-group">
                ${makeLabel('Abertura efetiva (%)', TOOLTIP.valveEffectiveOpening)}
                <input type="text" id="disp-abertura-efetiva-valvula" ${hintAttr(TOOLTIP.valveEffectiveOpening)} value="${comp.aberturaEfetiva.toFixed(1)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Vazão atual', 'flow', TOOLTIP.valveCurrentFlow)}
                <input type="text" id="disp-vazao-valvula" ${hintAttr(TOOLTIP.valveCurrentFlow)} value="${displayUnitValue('flow', comp.fluxoReal, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Queda de pressão atual', 'pressure', TOOLTIP.valveCurrentDeltaP)}
                <input type="text" id="disp-deltap-valvula" ${hintAttr(TOOLTIP.valveCurrentDeltaP)} value="${displayUnitValue('pressure', comp.deltaPAtualBar, 2)}" disabled>
            </div>
        `;
        const advancedContent = `
            <div class="prop-group">
                ${makeLabel('Perfil da válvula', TOOLTIP.valveProfile)}
                <select id="input-perfil-valvula" ${hintAttr(selectedProfileHint)} ${bloqueioAttr}>
                    <option value="equal_percentage" title="${profileHints.equal_percentage}" ${perfilAtual === 'equal_percentage' ? 'selected' : ''}>Controle fino</option>
                    <option value="linear" title="${profileHints.linear}" ${perfilAtual === 'linear' ? 'selected' : ''}>Resposta linear</option>
                    <option value="quick_opening" title="${profileHints.quick_opening}" ${perfilAtual === 'quick_opening' ? 'selected' : ''}>Abertura rápida</option>
                    <option value="custom" title="${profileHints.custom}" ${perfilAtual === 'custom' ? 'selected' : ''}>Personalizado</option>
                </select>
                <p id="texto-perfil-valvula" title="${selectedProfileHint}" style="margin:6px 0 0; font-size:11px; line-height:1.45; color:#5f6f7f;">${selectedProfileHint}</p>
                ${!controladaPorSetpoint && !perfilPersonalizado ? '<p style="margin:6px 0 0; font-size:11px; line-height:1.45; color:#7f8c8d;">Para alterar Cv, K, curva, rangeabilidade ou tempo de curso individualmente, selecione o perfil Personalizado.</p>' : ''}
                ${controladaPorSetpoint ? '<p style="margin:6px 0 0; font-size:11px; line-height:1.45; color:#c0392b;">Com o ponto de ajuste ativo, o tanque escolhe automaticamente o perfil mais adequado para a demanda de controle.</p>' : ''}
            </div>
            <div class="prop-group">
                ${makeLabel('Coeficiente de vazão (Cv)', TOOLTIP.valveCv)}
                <input type="number" id="input-cv" ${hintAttr(TOOLTIP.valveCv)} value="${comp.cv.toFixed(2)}" step="0.1" min="0.1" max="250" ${bloqueioParametrosAttr}>
            </div>
            <div class="prop-group">
                ${makeLabel('Coeficiente de perda (K)', TOOLTIP.valveK)}
                <input type="number" id="input-perda-k" ${hintAttr(TOOLTIP.valveK)} value="${comp.perdaLocalK.toFixed(3)}" step="0.01" min="0.0" max="100" ${bloqueioParametrosAttr}>
            </div>
            <div class="prop-group">
                ${makeLabel('Característica da válvula', TOOLTIP.valveCharacteristic)}
                <select id="input-caracteristica-valvula" ${hintAttr(selectedCharacteristicHint)} ${bloqueioParametrosAttr}>
                    <option value="equal_percentage" title="${characteristicHints.equal_percentage}" ${comp.tipoCaracteristica === 'equal_percentage' ? 'selected' : ''}>Igual porcentagem</option>
                    <option value="linear" title="${characteristicHints.linear}" ${comp.tipoCaracteristica === 'linear' ? 'selected' : ''}>Linear</option>
                    <option value="quick_opening" title="${characteristicHints.quick_opening}" ${comp.tipoCaracteristica === 'quick_opening' ? 'selected' : ''}>Abertura rápida</option>
                </select>
                <p id="texto-caracteristica-valvula" title="${selectedCharacteristicHint}" style="margin:6px 0 0; font-size:11px; line-height:1.45; color:#5f6f7f;">${selectedCharacteristicHint}</p>
            </div>
            <div class="prop-group">
                ${makeLabel('Rangeabilidade', TOOLTIP.valveRangeability)}
                <input type="number" id="input-rangeabilidade-valvula" ${hintAttr(TOOLTIP.valveRangeability)} value="${comp.rangeabilidade}" step="1" min="5" max="1000" ${bloqueioParametrosAttr}>
            </div>
            <div class="prop-group">
                ${makeLabel('Tempo de curso (s)', TOOLTIP.valveStroke)}
                <input type="number" id="input-curso-valvula" ${hintAttr(TOOLTIP.valveStroke)} value="${comp.tempoCursoSegundos}" step="0.1" min="0" max="60" ${bloqueioParametrosAttr}>
            </div>
        `;

        return renderPropertyTabs({
            basicContent,
            advancedContent,
            advancedDescription: 'Aba indicada para escolher perfis de válvula. Use Personalizado quando quiser ajustar Cv, K, característica, rangeabilidade e tempo de curso individualmente.'
        });
    },
    bind: (comp) => {
        const slider = document.getElementById('input-abertura');
        const numInput = document.getElementById('val-abertura');
        const cvInput = document.getElementById('input-cv');
        const perdaInput = document.getElementById('input-perda-k');
        const perfilInput = document.getElementById('input-perfil-valvula');
        const caracteristicaInput = document.getElementById('input-caracteristica-valvula');
        const rangeabilidadeInput = document.getElementById('input-rangeabilidade-valvula');
        const cursoInput = document.getElementById('input-curso-valvula');
        const valvulaBloqueadaPorSetpoint = () => ENGINE.isValvulaBloqueadaPorSetpoint?.(comp) === true || comp.estaControladaPorSetpoint?.() === true;
        const getPerfilAtual = () => VALVE_PROFILE_DEFINITIONS[comp.perfilCaracteristica] ? comp.perfilCaracteristica : 'custom';
        const perfilEhPersonalizado = () => getPerfilAtual() === 'custom';
        const atualizarDescricaoPerfil = () => {
            const textoPerfil = document.getElementById('texto-perfil-valvula');
            const dica = TOOLTIP.valveProfiles[getPerfilAtual()] ?? TOOLTIP.valveProfile;
            if (perfilInput) perfilInput.title = dica;
            if (textoPerfil) {
                textoPerfil.textContent = dica;
                textoPerfil.title = dica;
            }
        };
        const atualizarDescricaoCaracteristica = () => {
            const textoCaracteristica = document.getElementById('texto-caracteristica-valvula');
            const dica = TOOLTIP.valveCharacteristics[comp.tipoCaracteristica] ?? TOOLTIP.valveCharacteristic;
            if (caracteristicaInput) caracteristicaInput.title = dica;
            if (textoCaracteristica) {
                textoCaracteristica.textContent = dica;
                textoCaracteristica.title = dica;
            }
        };
        const sincronizarBloqueioSetpoint = () => {
            const bloqueada = valvulaBloqueadaPorSetpoint();
            const bloqueioParametros = bloqueada || !perfilEhPersonalizado();
            [slider, numInput, perfilInput].forEach((input) => {
                if (input) input.disabled = bloqueada;
            });
            [cvInput, perdaInput, caracteristicaInput, rangeabilidadeInput, cursoInput].forEach((input) => {
                if (input) input.disabled = bloqueioParametros;
            });
        };
        const parametrosAvancadosEditaveis = () => !valvulaBloqueadaPorSetpoint() && perfilEhPersonalizado();
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
        perfilInput.addEventListener('change', (event) => {
            if (valvulaBloqueadaPorSetpoint()) {
                event.target.value = getPerfilAtual();
                sincronizarBloqueioSetpoint();
                return;
            }

            comp.aplicarPerfilCaracteristica(event.target.value);
            atualizarDescricaoPerfil();
            atualizarDescricaoCaracteristica();
            notifyPanelRefresh();
        });
        cvInput.addEventListener('change', (event) => {
            if (!parametrosAvancadosEditaveis()) {
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
            if (!parametrosAvancadosEditaveis()) {
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
            if (!parametrosAvancadosEditaveis()) {
                event.target.value = comp.tipoCaracteristica;
                sincronizarBloqueioSetpoint();
                return;
            }
            comp.setTipoCaracteristica(event.target.value);
            atualizarDescricaoCaracteristica();
            notifyPanelRefresh();
        });
        rangeabilidadeInput.addEventListener('change', (event) => {
            if (!parametrosAvancadosEditaveis()) {
                event.target.value = comp.rangeabilidade;
                sincronizarBloqueioSetpoint();
                return;
            }
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(value, 5, 1000, name),
                'Rangeabilidade',
                (validated) => { comp.setRangeabilidade(validated); }
            );
        });
        cursoInput.addEventListener('change', (event) => {
            if (!parametrosAvancadosEditaveis()) {
                event.target.value = comp.tempoCursoSegundos;
                sincronizarBloqueioSetpoint();
                return;
            }
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(value, 0, 60, name),
                'Tempo de curso',
                (validated) => { comp.setTempoCurso(validated); }
            );
        });

        comp.subscribe((dados) => {
            if (dados.tipo === COMPONENT_EVENTS.STATE && slider) {
                sincronizarBloqueioSetpoint();
                slider.value = dados.grau;
                numInput.value = dados.grau;
                if (perfilInput && document.activeElement !== perfilInput) perfilInput.value = getPerfilAtual();
                if (caracteristicaInput && document.activeElement !== caracteristicaInput) caracteristicaInput.value = comp.tipoCaracteristica;
                if (cvInput && document.activeElement !== cvInput) cvInput.value = comp.cv.toFixed(2);
                if (perdaInput && document.activeElement !== perdaInput) perdaInput.value = comp.perdaLocalK.toFixed(3);
                if (rangeabilidadeInput && document.activeElement !== rangeabilidadeInput) rangeabilidadeInput.value = comp.rangeabilidade;
                if (cursoInput && document.activeElement !== cursoInput) cursoInput.value = comp.tempoCursoSegundos;
                atualizarDescricaoPerfil();
                atualizarDescricaoCaracteristica();
                const effectiveDisplay = document.getElementById('disp-abertura-efetiva-valvula');
                if (effectiveDisplay) effectiveDisplay.value = (dados.grauEfetivo ?? dados.grau).toFixed(1);
            }
        });

        sincronizarBloqueioSetpoint();
        atualizarDescricaoPerfil();
        atualizarDescricaoCaracteristica();
    }
};
