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
