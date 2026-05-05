import {
    COMPONENT_EVENTS,
    ComponentEventPayloads,
    InputValidator,
    TOOLTIP,
    bind,
    byId,
    displayUnitValue,
    getPresentationEngine,
    hintAttr,
    isActive,
    makeLabel,
    makeUnitLabel,
    notifyPanelRefresh,
    renderPropertyTabs,
    setValue,
    validateInputWithFeedback
} from '../PropertyPresenterShared.js';
import { VALVE_PROFILE_DEFINITIONS } from '../../../domain/components/ValvulaLogica.js';

export const VALVE_PROPERTIES_PRESENTER = {
    render: (comp) => {
        const engine = getPresentationEngine();
        const controladaPorSetpoint = engine.isValvulaBloqueadaPorSetpoint?.(comp) === true || comp.estaControladaPorSetpoint?.() === true;
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
        const engine = getPresentationEngine();
        const slider = byId('input-abertura');
        const numInput = byId('val-abertura');
        const cvInput = byId('input-cv');
        const perdaInput = byId('input-perda-k');
        const perfilInput = byId('input-perfil-valvula');
        const caracteristicaInput = byId('input-caracteristica-valvula');
        const rangeabilidadeInput = byId('input-rangeabilidade-valvula');
        const cursoInput = byId('input-curso-valvula');
        const valvulaBloqueadaPorSetpoint = () => engine.isValvulaBloqueadaPorSetpoint?.(comp) === true || comp.estaControladaPorSetpoint?.() === true;
        const getPerfilAtual = () => VALVE_PROFILE_DEFINITIONS[comp.perfilCaracteristica] ? comp.perfilCaracteristica : 'custom';
        const perfilEhPersonalizado = () => getPerfilAtual() === 'custom';
        const atualizarDescricaoPerfil = () => {
            const textoPerfil = byId('texto-perfil-valvula');
            const dica = TOOLTIP.valveProfiles[getPerfilAtual()] ?? TOOLTIP.valveProfile;
            if (perfilInput) perfilInput.title = dica;
            if (textoPerfil) {
                textoPerfil.textContent = dica;
                textoPerfil.title = dica;
            }
        };
        const atualizarDescricaoCaracteristica = () => {
            const textoCaracteristica = byId('texto-caracteristica-valvula');
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

        bind('input-abertura', 'input', (event) => updateFromSlider(event.target.value));
        bind('val-abertura', 'change', (event) => updateFromInput(event.target.value));
        bind('input-perfil-valvula', 'change', (event) => {
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
        bind('input-cv', 'change', (event) => {
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
        bind('input-perda-k', 'change', (event) => {
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
        bind('input-caracteristica-valvula', 'change', (event) => {
            if (!parametrosAvancadosEditaveis()) {
                event.target.value = comp.tipoCaracteristica;
                sincronizarBloqueioSetpoint();
                return;
            }
            comp.setTipoCaracteristica(event.target.value);
            atualizarDescricaoCaracteristica();
            notifyPanelRefresh();
        });
        bind('input-rangeabilidade-valvula', 'change', (event) => {
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
        bind('input-curso-valvula', 'change', (event) => {
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
                if (perfilInput && !isActive(perfilInput)) perfilInput.value = getPerfilAtual();
                if (caracteristicaInput && !isActive(caracteristicaInput)) caracteristicaInput.value = comp.tipoCaracteristica;
                if (cvInput && !isActive(cvInput)) cvInput.value = comp.cv.toFixed(2);
                if (perdaInput && !isActive(perdaInput)) perdaInput.value = comp.perdaLocalK.toFixed(3);
                if (rangeabilidadeInput && !isActive(rangeabilidadeInput)) rangeabilidadeInput.value = comp.rangeabilidade;
                if (cursoInput && !isActive(cursoInput)) cursoInput.value = comp.tempoCursoSegundos;
                atualizarDescricaoPerfil();
                atualizarDescricaoCaracteristica();
                setValue('disp-abertura-efetiva-valvula', (dados.grauEfetivo ?? dados.grau).toFixed(1));
            }
        });

        sincronizarBloqueioSetpoint();
        atualizarDescricaoPerfil();
        atualizarDescricaoCaracteristica();
    }
};
