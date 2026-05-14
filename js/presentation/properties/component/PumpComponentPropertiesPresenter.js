import {
    COMPONENT_EVENTS,
    ComponentEventPayloads,
    InputValidator,
    TOOLTIP,
    baseFromDisplay,
    bind,
    byId,
    displayBound,
    displayEditableUnitValue,
    displayStep,
    displayUnitValue,
    getPresentationEngine,
    hintAttr,
    makeLabel,
    makeUnitLabel,
    notifyPanelRefresh,
    renderPropertyTabs,
    setValue,
    validateInputWithFeedback
} from '../PropertyPresenterShared.js';

function getThemeAwareAlertColors(isDark, severity) {
    if (severity === 'error') {
        return isDark ? {
            border: '#e74c3c',
            background: '#2d1b1b',
            color: '#ff6b6b'
        } : {
            border: '#c0392b',
            background: '#fdeaea',
            color: '#922b21'
        };
    }
    if (severity === 'warning') {
        return isDark ? {
            border: '#f39c12',
            background: '#2d2418',
            color: '#f0b36b'
        } : {
            border: '#e67e22',
            background: '#fff3e6',
            color: '#a84300'
        };
    }
    if (severity === 'caution') {
        return isDark ? {
            border: '#f1c40f',
            background: '#2d2a18',
            color: '#f4d03f'
        } : {
            border: '#f39c12',
            background: '#fff8e5',
            color: '#8a5a00'
        };
    }
    if (severity === 'success') {
        return isDark ? {
            border: '#27ae60',
            background: '#1b2d1f',
            color: '#58d68d'
        } : {
            border: '#27ae60',
            background: '#edf8f1',
            color: '#1e8449'
        };
    }
    // neutral
    return isDark ? {
        border: '#7f8c8d',
        background: '#1a252f',
        color: '#95a5a6'
    } : {
        border: '#95a5a6',
        background: '#ecf0f1',
        color: '#34495e'
    };
}

function getPumpSuctionAlertState(condition) {
    const isDark = document.body.classList.contains('theme-dark');
    
    if (condition === 'Sem líquido suficiente') {
        const colors = getThemeAwareAlertColors(isDark, 'error');
        return {
            title: 'Sem líquido suficiente na sucção',
            message: 'A bomba está acionada, mas não recebeu fluido suficiente. Verifique o nível do tanque, o bocal de saída e as conexões a montante.',
            ...colors
        };
    }
    if (condition === 'Cavitando') {
        const colors = getThemeAwareAlertColors(isDark, 'error');
        return {
            title: 'Bomba cavitando',
            message: 'O NPSHa está abaixo do NPSHr e o desempenho já foi reduzido pelo solver. A bomba não deve conseguir sustentar essa vazão sem melhorar a sucção.',
            ...colors
        };
    }
    if (condition === 'Risco de cavitação') {
        const colors = getThemeAwareAlertColors(isDark, 'warning');
        return {
            title: 'Risco de cavitação',
            message: 'O NPSHa está menor que o NPSHr. Aumente a pressão ou o nível na sucção, reduza perdas a montante ou diminua a vazão da bomba.',
            ...colors
        };
    }
    if (condition === 'No limite') {
        const colors = getThemeAwareAlertColors(isDark, 'caution');
        return {
            title: 'Sucção no limite',
            message: 'A folga entre NPSHa e NPSHr está baixa. A bomba ainda opera, mas pequenas perdas ou queda de nível podem levar à cavitação.',
            ...colors
        };
    }
    if (condition === 'Sem bombeamento') {
        const colors = getThemeAwareAlertColors(isDark, 'neutral');
        return {
            title: 'Sem bombeamento',
            message: 'A bomba está sem acionamento efetivo. As condições de sucção serão avaliadas quando houver bombeamento.',
            ...colors
        };
    }
    const colors = getThemeAwareAlertColors(isDark, 'success');
    return {
        title: 'Sucção com folga',
        message: 'A bomba possui líquido e margem positiva entre NPSHa e NPSHr nas condições atuais.',
        ...colors
    };
}

function renderPumpSuctionAlert(comp, condition, marginM) {
    const state = getPumpSuctionAlertState(condition);
    const npsha = displayUnitValue('length', comp.npshDisponivelM, 2);
    const npshr = displayUnitValue('length', comp.npshRequeridoAtualM ?? comp.npshRequeridoM, 2);
    const margin = displayUnitValue('length', marginM, 2);
    return `
        <div id="painel-alerta-succao-bomba" class="prop-group" style="border-left:4px solid ${state.border}; border-color:${state.border}; background:${state.background}; padding:10px 12px;">
            <h4 id="titulo-alerta-succao-bomba" style="margin:0 0 6px; color:${state.color}; font-size:13px;">${state.title}</h4>
            <p id="texto-alerta-succao-bomba" style="margin:0; font-size:11px; line-height:1.45; color:#34495e;">${state.message}</p>
            <p id="metricas-alerta-succao-bomba" style="margin:8px 0 0; font-size:11px; color:${state.color};">
                NPSHa: ${npsha} | NPSHr: ${npshr} | Folga: ${margin}
            </p>
        </div>
    `;
}

export const PUMP_PROPERTIES_PRESENTER = {
    render: (comp) => {
        const engine = getPresentationEngine();
        const bloqueadaPorSetpoint = engine.isBombaBloqueadaPorSetpoint?.(comp) === true;
        const bloqueioAttr = bloqueadaPorSetpoint ? 'disabled' : '';
        const acionamentoExibido = Math.round(bloqueadaPorSetpoint
            ? (comp.getAcionamentoAlvo?.() ?? 100)
            : comp.grauAcionamento);
        const npshRequeridoAtualM = comp.npshRequeridoAtualM ?? comp.npshRequeridoM;
        const margemNpshM = comp.getMargemNpshAtualM?.() ?? (comp.npshDisponivelM - npshRequeridoAtualM);
        const condicaoSucao = comp.getCondicaoSucaoAtual?.()
            ?? (margemNpshM < 0 ? 'Risco de cavitação' : margemNpshM < 0.5 ? 'No limite' : 'Com folga');

        const basicContent = `
            ${renderPumpSuctionAlert(comp, condicaoSucao, margemNpshM)}
            <div class="prop-group">
                <label ${hintAttr(TOOLTIP.pumpDrive)}>Acionamento do motor
                    <span style="display:flex; align-items:center; gap:2px;">
                        <input type="number" id="val-acionamento" class="val-display-input" ${hintAttr(TOOLTIP.pumpDrive)} value="${acionamentoExibido}" ${bloqueioAttr}> %
                    </span>
                </label>
                <input type="range" id="input-acionamento" min="0" max="100" value="${acionamentoExibido}" ${hintAttr(TOOLTIP.pumpDrive)} ${bloqueioAttr}>
                ${bloqueadaPorSetpoint ? '<p style="margin:6px 0 0; font-size:11px; color:#c0392b;">Bomba fixa em 100% durante o set point; o PI ajusta apenas válvulas.</p>' : ''}
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
        const engine = getPresentationEngine();
        const slider = byId('input-acionamento');
        const numInput = byId('val-acionamento');
        const bombaBloqueadaPorSetpoint = () => engine.isBombaBloqueadaPorSetpoint?.(comp) === true;
        const sincronizarBloqueioSetpoint = () => {
            const bloqueada = bombaBloqueadaPorSetpoint();
            if (slider) slider.disabled = bloqueada;
            if (numInput) numInput.disabled = bloqueada;
        };
        const refreshPumpPanel = () => {
            const bloqueada = bombaBloqueadaPorSetpoint();
            comp.notify(ComponentEventPayloads.state({
                isOn: comp.isOn,
                grau: bloqueada ? (comp.getAcionamentoAlvo?.() ?? 100) : comp.grauAcionamento,
                grauManual: comp.grauAcionamento,
                grauEfetivo: comp.acionamentoEfetivo,
                bloqueadaPorSetpoint: bloqueada
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

        bind('input-acionamento', 'input', (event) => updateFromSlider(event.target.value));
        bind('val-acionamento', 'change', (event) => updateFromInput(event.target.value));
        bind('input-vazmax', 'change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateFlow(baseFromDisplay('flow', value), 500, name),
                'Vazão nominal',
                (validated) => {
                    comp.vazaoNominal = validated;
                    comp.recalcularMetricasDerivadasCurva?.();
                }
            );
        });
        bind('input-pressao-max-bomba', 'change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validatePressure(baseFromDisplay('pressure', value), 20, name),
                'Pressão máxima',
                (validated) => {
                    comp.pressaoMaxima = validated;
                    comp.recalcularMetricasDerivadasCurva?.();
                }
            );
        });
        bind('input-eficiencia-bomba', 'change', (event) => {
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
        bind('input-npsh-bomba', 'change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNPSH(baseFromDisplay('length', value), name),
                'NPSH requerido',
                (validated) => {
                    comp.npshRequeridoM = validated;
                    comp.recalcularMetricasDerivadasCurva?.();
                }
            );
        });
        bind('input-rampa-bomba', 'change', (event) => {
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
                setValue('disp-acionamento-real-bomba', (dados.grauEfetivo ?? dados.grau).toFixed(1));
            }
        });

        sincronizarBloqueioSetpoint();
    }
};
