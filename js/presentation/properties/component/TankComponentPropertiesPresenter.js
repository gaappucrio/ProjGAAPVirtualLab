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
    hintAttr,
    makeLabel,
    makeUnitLabel,
    notifyPanelRefresh,
    renderPropertyTabs,
    setValue,
    validateInputWithFeedback
} from '../PropertyPresenterShared.js';
import { translateLiteral } from '../../i18n/LanguageManager.js';

function getTankControlVisualState(active, available) {
    if (active) return 'active';
    return available ? 'ready' : 'blocked';
}

function syncTankControlVisualState(groupEl, state) {
    if (!groupEl) return;

    groupEl.dataset.controlState = state;
    groupEl.classList.toggle('is-active', state === 'active');
    groupEl.classList.toggle('is-ready', state === 'ready');
    groupEl.classList.toggle('is-blocked', state === 'blocked');
}

export const TANK_PROPERTIES_PRESENTER = {
    render: (comp) => {
        const diagnosticoControleNivel = comp.getDiagnosticoControleNivel?.() ?? {
            podeAtivar: true,
            motivoBloqueio: ''
        };
        const controleNivelDisponivel = diagnosticoControleNivel.podeAtivar !== false;
        const bloqueioControleAttr = controleNivelDisponivel ? '' : 'disabled';
        const isDark = document.body.classList.contains('theme-dark');
        const corBordaControle = comp.setpointAtivo 
            ? '#e74c3c' 
            : (controleNivelDisponivel 
                ? (isDark ? '#2d3d4b' : '#eee') 
                : '#f39c12');
        const fundoControle = comp.setpointAtivo 
            ? (isDark ? '#2d1b1b' : '#fdf5f4') 
            : (controleNivelDisponivel 
                ? (isDark ? '#1d2a35' : '#f9fbfb') 
                : (isDark ? '#2d2418' : '#fff8ee'));
        const textoStatusControle = controleNivelDisponivel
            ? translateLiteral('O controlador usa a válvula de saída para modular o escoamento e estabilizar o nível.')
            : translateLiteral(diagnosticoControleNivel.motivoBloqueio);
        const corStatusControle = controleNivelDisponivel 
            ? (isDark ? '#93a8b8' : '#5f6f7f') 
            : (isDark ? '#ff6b6b' : '#c0392b');
        const estadoVisualControle = getTankControlVisualState(comp.setpointAtivo, controleNivelDisponivel);
        const fluidoConteudo = comp.getFluidoConteudo?.() || comp.fluidoConteudo;

        const basicContent = `
            <div class="prop-group">
                ${makeUnitLabel('Capacidade total', 'volume', TOOLTIP.tankCapacity)}
                <input type="number" id="input-cap" ${hintAttr(TOOLTIP.tankCapacity)} value="${displayEditableUnitValue('volume', comp.capacidadeMaxima, 3)}" step="${displayStep('volume', 10)}" min="${displayBound('volume', 100)}">
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Volume atual', 'volume', TOOLTIP.tankVolume)}
                <input type="number" id="input-volume-tanque" ${hintAttr(TOOLTIP.tankVolume)} value="${displayEditableUnitValue('volume', comp.volumeAtual, 3)}" step="${displayStep('volume', 10)}" min="${displayBound('volume', 0)}" max="${displayBound('volume', comp.capacidadeMaxima)}">
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Altura útil', 'length', TOOLTIP.tankHeight)}
                <input type="number" id="input-altura-tanque" ${hintAttr(TOOLTIP.tankHeight)} value="${displayEditableUnitValue('length', comp.alturaUtilMetros, 3)}" step="${displayStep('length', 0.05)}" min="${displayBound('length', 0.5)}" max="${displayBound('length', 10)}">
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Pressão no fundo', 'pressure', TOOLTIP.tankBottomPressure)}
                <input type="text" id="disp-pressao-tanque" ${hintAttr(TOOLTIP.tankBottomPressure)} value="${displayUnitValue('pressure', comp.pressaoFundoBar, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Nível líquido', 'length', TOOLTIP.tankLiquidLevel)}
                <input type="text" id="disp-nível-tanque" ${hintAttr(TOOLTIP.tankLiquidLevel)} value="${displayUnitValue('length', comp.getAlturaLiquidoM(), 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Vazão de entrada', 'flow', TOOLTIP.tankInletFlow)}
                <input type="text" id="disp-qin-tanque" ${hintAttr(TOOLTIP.tankInletFlow)} value="${displayUnitValue('flow', comp.lastQin, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Vazão de saída', 'flow', TOOLTIP.tankOutletFlow)}
                <input type="text" id="disp-qout-tanque" ${hintAttr(TOOLTIP.tankOutletFlow)} value="${displayUnitValue('flow', comp.lastQout, 2)}" disabled>
            </div>
            <div class="prop-group">
                <label title="Fluido ou mistura atualmente armazenado no tanque.">Fluido no Tanque</label>
                <input type="text" id="disp-tank-fluid" title="Fluido ou mistura atualmente armazenado no tanque." value="${fluidoConteudo?.nome || '-'}" disabled>
            </div>
            <div class="prop-group">
                <label title="Densidade do fluido ou mistura armazenado no tanque.">Densidade do Fluido (kg/m³)</label>
                <input type="text" id="disp-tank-fluid-density" title="Densidade do fluido ou mistura armazenado no tanque." value="${(fluidoConteudo?.densidade || 0).toFixed(1)}" disabled>
            </div>
            <div class="prop-group tank-control-panel is-${estadoVisualControle}" id="grp-sp-main" data-control-state="${estadoVisualControle}" style="border-color:${corBordaControle}; background:${fundoControle};">
                <label class="tank-control-title" ${hintAttr(TOOLTIP.tankPiController)} style="color:#c0392b; font-size:13px; text-transform:uppercase; letter-spacing:0.5px;">
                    Controlador de nível (PI)
                </label>
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                    <input type="checkbox" id="input-sp-ativo" ${hintAttr(TOOLTIP.tankSpActive)} ${comp.setpointAtivo ? 'checked' : ''} ${bloqueioControleAttr} style="width:16px; height:16px; cursor:pointer;">
                    <span class="tank-control-switch-label" ${hintAttr(TOOLTIP.tankSpActive)} style="font-size:13px; font-weight:bold;">Ativar controle automático</span>
                </div>
                <p id="tank-sp-status-text" ${hintAttr(TOOLTIP.tankSpActive)} style="margin:0 0 10px; font-size:11px; color:${corStatusControle};">${textoStatusControle}</p>
                <label ${hintAttr(TOOLTIP.tankSetpoint)}>Ponto de ajuste
                    <span style="display:flex; align-items:center; gap:2px;">
                        <input type="number" id="val-sp" class="val-display-input" ${hintAttr(TOOLTIP.tankSetpoint)} value="${comp.setpoint}" min="0" max="100">%
                    </span>
                </label>
                <input type="range" id="input-sp" min="0" max="100" value="${comp.setpoint}" style="accent-color:#e74c3c;" ${hintAttr(TOOLTIP.tankSetpoint)}>
            </div>
        `;

        const advancedContent = `
            <div class="prop-group">
                ${makeUnitLabel('Elevação do bocal de entrada', 'length', TOOLTIP.tankInletHeight)}
                <input type="number" id="input-altura-entrada-tanque" ${hintAttr(TOOLTIP.tankInletHeight)} value="${displayEditableUnitValue('length', comp.alturaBocalEntradaM, 3)}" step="${displayStep('length', 0.01)}" min="${displayBound('length', 0)}" max="${displayBound('length', comp.alturaUtilMetros)}">
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Elevação do bocal de saída', 'length', TOOLTIP.tankOutletHeight)}
                <input type="number" id="input-altura-saída-tanque" ${hintAttr(TOOLTIP.tankOutletHeight)} value="${displayEditableUnitValue('length', comp.alturaBocalSaidaM, 3)}" step="${displayStep('length', 0.01)}" min="${displayBound('length', 0)}" max="${displayBound('length', comp.alturaUtilMetros)}">
            </div>
            <div class="prop-group">
                ${makeLabel('Coeficiente de descarga (Cd)', TOOLTIP.tankCd)}
                <input type="number" id="input-cd-tanque" ${hintAttr(TOOLTIP.tankCd)} value="${comp.coeficienteSaida}" step="0.01" min="0.1" max="1">
            </div>
            <div class="prop-group">
                ${makeLabel('Perda na entrada (K)', TOOLTIP.tankEntryK)}
                <input type="number" id="input-k-entrada-tanque" ${hintAttr(TOOLTIP.tankEntryK)} value="${comp.perdaEntradaK}" step="0.1" min="0" max="50">
            </div>
            <div class="prop-group" id="group-ctrl-params" style="display:${comp.setpointAtivo ? 'block' : 'none'};">
                ${makeLabel('Ganho proporcional (Kp)', TOOLTIP.tankKp)}
                <input type="number" id="input-kp" ${hintAttr(TOOLTIP.tankKp)} value="${comp.kp}" step="5" min="1" max="500">
            </div>
            <div class="prop-group" id="group-ctrl-ki" style="display:${comp.setpointAtivo ? 'block' : 'none'};">
                ${makeLabel('Ganho integral (Ki)', TOOLTIP.tankKi)}
                <input type="number" id="input-ki" ${hintAttr(TOOLTIP.tankKi)} value="${comp.ki}" step="1" min="0" max="100">
            </div>
        `;

        return renderPropertyTabs({
            basicContent,
            advancedContent,
            advancedDescription: 'Aqui ficam os parâmetros de bocais, perdas e sintonia do controlador PI. Eles refinam a dinâmica do tanque e costumam ser ajustados só em estudos mais detalhados.'
        });
    },
    bind: (comp) => {
        const diagnosticoControleNivel = () => comp.getDiagnosticoControleNivel?.() ?? {
            podeAtivar: true,
            motivoBloqueio: ''
        };
        const atualizarEstadoControleNivel = () => {
            const diagnostico = diagnosticoControleNivel();
            const grp = byId('grp-sp-main');
            const statusEl = byId('tank-sp-status-text');
            const spAtivoEl = byId('input-sp-ativo');
            const mostrarParametros = comp.setpointAtivo ? 'block' : 'none';
            const isDark = document.body.classList.contains('theme-dark');

            if (spAtivoEl) {
                spAtivoEl.disabled = !diagnostico.podeAtivar;
                spAtivoEl.checked = comp.setpointAtivo;
            }

            if (statusEl) {
                statusEl.textContent = diagnostico.podeAtivar
                    ? translateLiteral('O controlador usa a válvula de saída para modular o escoamento e estabilizar o nível.')
                    : translateLiteral(diagnostico.motivoBloqueio);
                statusEl.style.color = diagnostico.podeAtivar 
                    ? (isDark ? '#93a8b8' : '#5f6f7f') 
                    : (isDark ? '#ff6b6b' : '#c0392b');
            }

            if (grp) {
                syncTankControlVisualState(grp, getTankControlVisualState(comp.setpointAtivo, diagnostico.podeAtivar));

                if (comp.setpointAtivo) {
                    grp.style.borderColor = isDark ? '#e74c3c' : '#e74c3c';
                    grp.style.background = isDark ? '#2d1b1b' : '#fdf5f4';
                } else if (diagnostico.podeAtivar) {
                    grp.style.borderColor = isDark ? '#2d3d4b' : '#eee';
                    grp.style.background = isDark ? '#1d2a35' : '#f9fbfb';
                } else {
                    grp.style.borderColor = isDark ? '#f39c12' : '#f39c12';
                    grp.style.background = isDark ? '#2d2418' : '#fff8ee';
                }
            }

            const kpGroup = byId('group-ctrl-params');
            const kiGroup = byId('group-ctrl-ki');
            if (kpGroup) kpGroup.style.display = mostrarParametros;
            if (kiGroup) kiGroup.style.display = mostrarParametros;
        };

        const emitirVolumeAtualizado = () => {
            comp.notify(ComponentEventPayloads.volumeUpdate({
                perc: comp.capacidadeMaxima > 0 ? comp.volumeAtual / comp.capacidadeMaxima : 0,
                abs: comp.volumeAtual,
                qIn: comp.lastQin,
                qOut: comp.lastQout,
                pBottom: comp.pressaoFundoBar
            }));

            setValue('disp-pressao-tanque', displayUnitValue('pressure', comp.pressaoFundoBar, 2));
            setValue('disp-nível-tanque', displayUnitValue('length', comp.getAlturaLiquidoM(), 2));
            const fluidoAtual = comp.getFluidoConteudo?.() || comp.fluidoConteudo;
            setValue('disp-tank-fluid', fluidoAtual?.nome || '-');
            setValue('disp-tank-fluid-density', fluidoAtual?.densidade ? fluidoAtual.densidade.toFixed(1) : '0.0');
            notifyPanelRefresh();
        };

        bind('input-cap', 'change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateVolume(baseFromDisplay('volume', value), 10000, name),
                'Capacidade máxima',
                (validated) => {
                    comp.capacidadeMaxima = validated;
                    comp.volumeAtual = Math.min(comp.volumeAtual, comp.capacidadeMaxima);
                    const volumeInput = byId('input-volume-tanque');
                    if (volumeInput) volumeInput.max = displayBound('volume', comp.capacidadeMaxima);
                    comp.sincronizarMetricasFisicas();
                    emitirVolumeAtualizado();
                }
            );
        });

        bind('input-volume-tanque', 'change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(baseFromDisplay('volume', value), 0, comp.capacidadeMaxima, name),
                'Volume atual',
                (validated) => {
                    comp.volumeAtual = Math.max(0, Math.min(comp.capacidadeMaxima, validated));
                    comp.volumeInicial = comp.volumeAtual;
                    comp.sincronizarMetricasFisicas();
                    emitirVolumeAtualizado();
                }
            );
        });

        bind('input-altura-tanque', 'change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(baseFromDisplay('length', value), 0.5, 10, name),
                'Altura útil',
                (validated) => {
                    comp.alturaUtilMetros = validated;
                    comp.normalizarAlturasBocais?.();
                    const inletHeight = byId('input-altura-entrada-tanque');
                    const outletHeight = byId('input-altura-saída-tanque');
                    if (inletHeight) inletHeight.max = displayBound('length', comp.alturaUtilMetros);
                    if (outletHeight) outletHeight.max = displayBound('length', comp.alturaUtilMetros);
                    setValue('input-altura-tanque', displayEditableUnitValue('length', comp.alturaUtilMetros, 3));
                    setValue('input-altura-entrada-tanque', displayEditableUnitValue('length', comp.alturaBocalEntradaM, 3));
                    setValue('input-altura-saída-tanque', displayEditableUnitValue('length', comp.alturaBocalSaidaM, 3));
                    comp.sincronizarMetricasFisicas();
                    emitirVolumeAtualizado();
                }
            );
        });

        bind('input-altura-entrada-tanque', 'change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(baseFromDisplay('length', value), 0, comp.alturaUtilMetros, name),
                'Elevação do bocal de entrada',
                (validated) => {
                    comp.alturaBocalEntradaM = Math.max(0, Math.min(comp.alturaUtilMetros, validated));
                    comp.sincronizarMetricasFisicas();
                    emitirVolumeAtualizado();
                }
            );
        });

        bind('input-altura-saída-tanque', 'change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(baseFromDisplay('length', value), 0, comp.alturaUtilMetros, name),
                'Elevação do bocal de saída',
                (validated) => {
                    comp.alturaBocalSaidaM = Math.max(0, Math.min(comp.alturaUtilMetros, validated));
                    comp.sincronizarMetricasFisicas();
                    emitirVolumeAtualizado();
                }
            );
        });

        bind('input-cd-tanque', 'change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(value, 0.05, 1, name),
                'Coeficiente de descarga',
                (validated) => { comp.coeficienteSaida = validated; }
            );
        });

        bind('input-k-entrada-tanque', 'change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(value, 0, 50, name),
                'Perda na entrada',
                (validated) => { comp.perdaEntradaK = validated; }
            );
        });

        bind('input-sp-ativo', 'change', (event) => {
            comp.setSetpointAtivo(event.target.checked);
            atualizarEstadoControleNivel();
            notifyPanelRefresh();
        });

        const spSlider = byId('input-sp');
        const spNum = byId('val-sp');

        const updateFromSlider = (value) => {
            spNum.value = value;
            comp.setpoint = parseInt(value, 10);
            comp.resetControlador();
            comp.notify(ComponentEventPayloads.setpointUpdate());
            notifyPanelRefresh();
        };

        const updateFromInput = (value) => {
            let parsed = parseInt(value, 10);
            if (Number.isNaN(parsed)) parsed = 0;
            const clamped = Math.max(0, Math.min(100, parsed));
            spNum.value = clamped;
            spSlider.value = clamped;
            comp.setpoint = clamped;
            comp.resetControlador();
            comp.notify(ComponentEventPayloads.setpointUpdate());
            notifyPanelRefresh();
        };

        bind('input-sp', 'input', (event) => updateFromSlider(event.target.value));
        bind('val-sp', 'change', (event) => updateFromInput(event.target.value));
        bind('input-kp', 'change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(value, 1, 500, name),
                'Ganho proporcional',
                (validated) => {
                    comp.kp = validated;
                    comp.resetControlador();
                }
            );
        });
        bind('input-ki', 'change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(value, 0, 100, name),
                'Ganho integral',
                (validated) => {
                    comp.ki = validated;
                    comp.resetControlador();
                }
            );
        });

        comp.subscribe((dados) => {
            if (dados.tipo === COMPONENT_EVENTS.SETPOINT_UPDATE) {
                atualizarEstadoControleNivel();
            }
        });

        atualizarEstadoControleNivel();
    }
};
