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
import {
    VALVE_FLOW_COEFFICIENT_UNITS,
    VALVE_PROFILE_DEFINITIONS
} from '../../../domain/components/ValvulaLogica.js';

function getThemeAwareValveAlertColors(isDark, severity) {
    if (severity === 'danger') {
        return isDark
            ? { severity, border: '#e74c3c', background: '#2d1b1b', color: '#ff6b6b', bodyColor: '#f7d8d4' }
            : { severity, border: '#c0392b', background: '#fdeaea', color: '#922b21', bodyColor: '#34495e' };
    }

    return isDark
        ? { severity: 'warning', border: '#f39c12', background: '#2d2418', color: '#f0b36b', bodyColor: '#f6dfbd' }
        : { severity: 'warning', border: '#e67e22', background: '#fff3e6', color: '#a84300', bodyColor: '#34495e' };
}

function getValveSizingAlertState(diagnostico) {
    const isDark = document.body.classList.contains('theme-dark');
    const severity = diagnostico?.status === 'undersized' ? 'danger' : 'warning';
    const colors = getThemeAwareValveAlertColors(isDark, severity);

    if (diagnostico?.status === 'undersized') {
        return {
            title: 'Válvula restritiva',
            message: 'A válvula manual está muito aberta e ainda consome uma parcela alta da pressão disponível. Aumente o Cv ou reduza K manual para liberar a passagem sem mascarar a perda nos canos.',
            ...colors
        };
    }

    return {
        title: 'Válvula no limite',
        message: 'A queda de pressão na válvula manual já é relevante para a abertura atual. O sistema ainda opera, mas vale revisar Cv, K ou o perfil se ela não deveria limitar a rede.',
        ...colors
    };
}

function formatValveSizingMetrics(diagnostico) {
    if (!diagnostico) return '';

    return [
        `ΔP: ${displayUnitValue('pressure', diagnostico.quedaPressaoBar, 2)}`,
        `Abertura: ${diagnostico.aberturaPercent.toFixed(1)}%`,
        `Cv: ${diagnostico.cvAtual.toFixed(1)} -> ${diagnostico.cvSugerido.toFixed(1)}`,
        `K: ${diagnostico.perdaLocalKAtual.toFixed(3)} -> ${diagnostico.perdaLocalKSugerida.toFixed(3)}`
    ].join(' | ');
}

function getValveCoefficientUnit(comp) {
    return comp.getUnidadeCoeficienteVazao?.() === VALVE_FLOW_COEFFICIENT_UNITS.KV
        ? VALVE_FLOW_COEFFICIENT_UNITS.KV
        : VALVE_FLOW_COEFFICIENT_UNITS.CV;
}

function getValveCoefficientUnitLabel(unit) {
    return unit === VALVE_FLOW_COEFFICIENT_UNITS.KV ? 'Kv' : 'Cv';
}

function getValveCoefficientDisplayValue(comp, unit = getValveCoefficientUnit(comp)) {
    return comp.getCoeficienteVazaoNaUnidade?.(unit) ?? comp.cv;
}

function getValveCoefficientMax(comp, unit = getValveCoefficientUnit(comp)) {
    return comp.getCoeficienteVazaoMaximoNaUnidade?.(unit)
        ?? (unit === VALVE_FLOW_COEFFICIENT_UNITS.KV ? 691.98 : 800);
}

function getValveCoefficientLabel(unit = VALVE_FLOW_COEFFICIENT_UNITS.CV) {
    return `Coeficiente de vazão (${getValveCoefficientUnitLabel(unit)})`;
}

function updateValveCoefficientInput(comp, cvInput, unitInput, labelEl) {
    const unit = getValveCoefficientUnit(comp);
    const displayValue = getValveCoefficientDisplayValue(comp, unit);
    const maxValue = getValveCoefficientMax(comp, unit);

    if (unitInput && !isActive(unitInput)) unitInput.value = unit;
    if (cvInput && !isActive(cvInput)) {
        cvInput.value = displayValue.toFixed(2);
        cvInput.max = maxValue.toFixed(2);
        cvInput.title = TOOLTIP.valveCv;
    }
    if (labelEl) {
        labelEl.textContent = getValveCoefficientLabel(unit);
        labelEl.title = TOOLTIP.valveCv;
    }
}

function renderValveSizingAlert(comp, controladaPorSetpoint) {
    const diagnostico = comp.getDiagnosticoDimensionamento?.();
    const visible = diagnostico?.ativo === true;
    const state = getValveSizingAlertState(diagnostico);
    const actionDisabled = controladaPorSetpoint || !diagnostico?.aplicavel;
    const display = visible ? 'block' : 'none';

    return `
        <div id="painel-alerta-dimensionamento-valvula" class="prop-group gaap-alert gaap-alert--${state.severity}" data-alert-severity="${state.severity}" style="display:${display}; border-left:4px solid ${state.border}; border-color:${state.border}; background:${state.background}; padding:10px 12px;">
            <h4 id="titulo-alerta-dimensionamento-valvula" class="gaap-alert__title" style="margin:0 0 6px; color:${state.color}; font-size:13px;">${state.title}</h4>
            <p id="texto-alerta-dimensionamento-valvula" class="gaap-alert__body" style="margin:0; font-size:11px; line-height:1.45; color:${state.bodyColor};">${state.message}</p>
            <p id="metricas-alerta-dimensionamento-valvula" class="gaap-alert__metrics" style="margin:8px 0 0; font-size:11px; color:${state.color};">${formatValveSizingMetrics(diagnostico)}</p>
            <button id="btn-ajustar-dimensionamento-valvula" class="gaap-alert__action" type="button" ${actionDisabled ? 'disabled' : ''} style="margin-top:9px; padding:7px 10px; border:1px solid ${state.border}; border-radius:4px; background:#fff; color:${state.color}; font-size:12px; font-weight:700; cursor:pointer;">
                Ajustar Cv e K
            </button>
            <p id="feedback-alerta-dimensionamento-valvula" class="gaap-alert__feedback" hidden style="margin:8px 0 0; font-size:11px; color:${state.color};"></p>
        </div>
    `;
}

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
        const unidadeCoeficiente = getValveCoefficientUnit(comp);
        const valorCoeficiente = getValveCoefficientDisplayValue(comp, unidadeCoeficiente);
        const maxCoeficiente = getValveCoefficientMax(comp, unidadeCoeficiente);
        const considerarPerdaEstrangulamento = comp.considerarPerdaEstrangulamento === true;
        const basicContent = `
            <div class="prop-group">
                <label ${hintAttr(TOOLTIP.valveOpening)}>Abertura
                    <span style="display:flex; align-items:center; gap:2px;">
                        <input type="number" id="val-abertura" class="val-display-input" ${hintAttr(TOOLTIP.valveOpening)} value="${Math.round(comp.grauAbertura)}" ${bloqueioAttr}> %
                    </span>
                </label>
                <input type="range" id="input-abertura" min="0" max="100" value="${Math.round(comp.grauAbertura)}" ${hintAttr(TOOLTIP.valveOpening)} ${bloqueioAttr}>
                ${controladaPorSetpoint ? '<p style="margin:6px 0 0; font-size:11px; color:#c0392b;">Válvula sob controle do ponto de ajuste do tanque. O PA modula a abertura; o perfil ainda pode ser alterado na aba Avançado.</p>' : ''}
            </div>
            ${renderValveSizingAlert(comp, controladaPorSetpoint)}
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
                <select id="input-perfil-valvula" ${hintAttr(selectedProfileHint)}>
                    <option value="equal_percentage" title="${profileHints.equal_percentage}" ${perfilAtual === 'equal_percentage' ? 'selected' : ''}>Controle fino</option>
                    <option value="linear" title="${profileHints.linear}" ${perfilAtual === 'linear' ? 'selected' : ''}>Resposta linear</option>
                    <option value="quick_opening" title="${profileHints.quick_opening}" ${perfilAtual === 'quick_opening' ? 'selected' : ''}>Abertura rápida</option>
                    <option value="custom" title="${profileHints.custom}" ${perfilAtual === 'custom' ? 'selected' : ''}>Personalizado</option>
                </select>
                <p id="texto-perfil-valvula" title="${selectedProfileHint}" style="margin:6px 0 0; font-size:11px; line-height:1.45; color:#5f6f7f;">${selectedProfileHint}</p>
                ${!controladaPorSetpoint && !perfilPersonalizado ? '<p style="margin:6px 0 0; font-size:11px; line-height:1.45; color:#7f8c8d;">Para alterar unidade, Cv/Kv, K, estrangulamento, curva, rangeabilidade ou tempo de curso individualmente, selecione o perfil Personalizado.</p>' : ''}
                ${controladaPorSetpoint ? '<p style="margin:6px 0 0; font-size:11px; line-height:1.45; color:#c0392b;">Com o ponto de ajuste ativo, trocar o perfil altera a geometria/curva usada pelo controle. Cv/Kv, K, estrangulamento, curva, rangeabilidade e tempo de curso continuam bloqueados para evitar ajustes finos acidentais durante a malha fechada.</p>' : ''}
            </div>
            <div class="prop-group">
                ${makeLabel('Unidade do coeficiente de vazão', TOOLTIP.valveFlowCoefficientUnit)}
                <select id="input-unidade-coeficiente-valvula" ${hintAttr(TOOLTIP.valveFlowCoefficientUnit)}>
                    <option value="cv" ${unidadeCoeficiente === VALVE_FLOW_COEFFICIENT_UNITS.CV ? 'selected' : ''}>Cv</option>
                    <option value="kv" ${unidadeCoeficiente === VALVE_FLOW_COEFFICIENT_UNITS.KV ? 'selected' : ''}>Kv</option>
                </select>
            </div>
            <div class="prop-group">
                <label id="label-coeficiente-valvula" ${hintAttr(TOOLTIP.valveCv)}>${getValveCoefficientLabel(unidadeCoeficiente)}</label>
                <input type="number" id="input-cv" ${hintAttr(TOOLTIP.valveCv)} value="${valorCoeficiente.toFixed(2)}" step="0.1" min="0.1" max="${maxCoeficiente.toFixed(2)}" ${bloqueioParametrosAttr}>
            </div>
            <div class="prop-group">
                ${makeLabel('Coeficiente de perda (K)', TOOLTIP.valveK)}
                <input type="number" id="input-perda-k" ${hintAttr(TOOLTIP.valveK)} value="${comp.perdaLocalK.toFixed(3)}" step="0.01" min="0.0" max="100" ${bloqueioParametrosAttr}>
            </div>
            <div class="prop-group">
                <label ${hintAttr(TOOLTIP.valveThrottlingLoss)} style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="input-perda-estrangulamento-valvula" ${hintAttr(TOOLTIP.valveThrottlingLoss)} ${considerarPerdaEstrangulamento ? 'checked' : ''} ${bloqueioParametrosAttr}>
                    <span>Considerar perda de estrangulamento</span>
                </label>
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
            advancedDescription: 'Aba indicada para escolher perfis de válvula. Use Personalizado quando quiser ajustar unidade, Cv/Kv, K, estrangulamento, característica, rangeabilidade e tempo de curso individualmente.'
        });
    },
    bind: (comp) => {
        const engine = getPresentationEngine();
        const slider = byId('input-abertura');
        const numInput = byId('val-abertura');
        const cvInput = byId('input-cv');
        const unidadeCoeficienteInput = byId('input-unidade-coeficiente-valvula');
        const coeficienteLabel = byId('label-coeficiente-valvula');
        const perdaInput = byId('input-perda-k');
        const perdaEstrangulamentoInput = byId('input-perda-estrangulamento-valvula');
        const perfilInput = byId('input-perfil-valvula');
        const caracteristicaInput = byId('input-caracteristica-valvula');
        const rangeabilidadeInput = byId('input-rangeabilidade-valvula');
        const cursoInput = byId('input-curso-valvula');
        const ajusteDimensionamentoButton = byId('btn-ajustar-dimensionamento-valvula');
        const feedbackDimensionamento = byId('feedback-alerta-dimensionamento-valvula');
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
            [slider, numInput].forEach((input) => {
                if (input) input.disabled = bloqueada;
            });
            if (perfilInput) perfilInput.disabled = false;
            [cvInput, perdaInput, perdaEstrangulamentoInput, caracteristicaInput, rangeabilidadeInput, cursoInput].forEach((input) => {
                if (input) input.disabled = bloqueioParametros;
            });
            if (unidadeCoeficienteInput) unidadeCoeficienteInput.disabled = false;
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
            comp.aplicarPerfilCaracteristica(event.target.value, { allowDuringSetpoint: true });
            atualizarDescricaoPerfil();
            atualizarDescricaoCaracteristica();
            updateValveCoefficientInput(comp, cvInput, unidadeCoeficienteInput, coeficienteLabel);
            notifyPanelRefresh();
        });
        bind('input-unidade-coeficiente-valvula', 'change', (event) => {
            comp.setUnidadeCoeficienteVazao?.(event.target.value);
            updateValveCoefficientInput(comp, cvInput, unidadeCoeficienteInput, coeficienteLabel);
            notifyPanelRefresh();
        });
        bind('input-cv', 'change', (event) => {
            if (!parametrosAvancadosEditaveis()) {
                updateValveCoefficientInput(comp, cvInput, unidadeCoeficienteInput, coeficienteLabel);
                sincronizarBloqueioSetpoint();
                return;
            }
            const unidade = getValveCoefficientUnit(comp);
            const label = getValveCoefficientLabel(unidade);
            const maximo = getValveCoefficientMax(comp, unidade);
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(value, 0.05, maximo, name),
                label,
                (validated) => { comp.setCoeficienteVazao(validated, { unidade }); }
            );
            updateValveCoefficientInput(comp, cvInput, unidadeCoeficienteInput, coeficienteLabel);
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
        bind('input-perda-estrangulamento-valvula', 'change', (event) => {
            if (!parametrosAvancadosEditaveis()) {
                event.target.checked = comp.considerarPerdaEstrangulamento === true;
                sincronizarBloqueioSetpoint();
                return;
            }
            comp.setConsiderarPerdaEstrangulamento?.(event.target.checked);
            notifyPanelRefresh();
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
        bind('btn-ajustar-dimensionamento-valvula', 'click', () => {
            const resultado = comp.aplicarAjusteDimensionamento?.();
            if (feedbackDimensionamento) {
                feedbackDimensionamento.hidden = false;
                feedbackDimensionamento.dataset.state = resultado?.aplicado ? 'success' : 'warning';
                feedbackDimensionamento.textContent = resultado?.aplicado
                    ? 'Parâmetros ajustados para reduzir a restrição da válvula.'
                    : (resultado?.bloqueadoPorSetpoint
                        ? 'Desative o set point do tanque para editar esta válvula manualmente.'
                        : 'A válvula já está dentro dos limites de ajuste automático.');
            }
            notifyPanelRefresh();
        });

        const unsubscribeComponent = comp.subscribe((dados) => {
            if (dados.tipo === COMPONENT_EVENTS.STATE && slider) {
                sincronizarBloqueioSetpoint();
                slider.value = dados.grau;
                numInput.value = dados.grau;
                if (perfilInput && !isActive(perfilInput)) perfilInput.value = getPerfilAtual();
                if (caracteristicaInput && !isActive(caracteristicaInput)) caracteristicaInput.value = comp.tipoCaracteristica;
                updateValveCoefficientInput(comp, cvInput, unidadeCoeficienteInput, coeficienteLabel);
                if (perdaInput && !isActive(perdaInput)) perdaInput.value = comp.perdaLocalK.toFixed(3);
                if (perdaEstrangulamentoInput && !isActive(perdaEstrangulamentoInput)) {
                    perdaEstrangulamentoInput.checked = comp.considerarPerdaEstrangulamento === true;
                }
                if (rangeabilidadeInput && !isActive(rangeabilidadeInput)) rangeabilidadeInput.value = comp.rangeabilidade;
                if (cursoInput && !isActive(cursoInput)) cursoInput.value = comp.tempoCursoSegundos;
                if (ajusteDimensionamentoButton) {
                    const diagnostico = comp.getDiagnosticoDimensionamento?.();
                    ajusteDimensionamentoButton.disabled = valvulaBloqueadaPorSetpoint() || !diagnostico?.aplicavel;
                }
                atualizarDescricaoPerfil();
                atualizarDescricaoCaracteristica();
                setValue('disp-abertura-efetiva-valvula', (dados.grauEfetivo ?? dados.grau).toFixed(1));
            }
        });

        sincronizarBloqueioSetpoint();
        atualizarDescricaoPerfil();
        atualizarDescricaoCaracteristica();
        updateValveCoefficientInput(comp, cvInput, unidadeCoeficienteInput, coeficienteLabel);
        return unsubscribeComponent;
    }
};
