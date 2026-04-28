import {
    COMPONENT_EVENTS,
    ComponentEventPayloads,
    ENGINE,
    ENGINE_EVENTS,
    InputValidator,
    TOOLTIP,
    TanqueLogico,
    baseFromDisplay,
    createElevationUpdater,
    displayBound,
    displayEditableUnitValue,
    displayStep,
    displayUnitValue,
    getUnitSymbol,
    hintAttr,
    labelStyle,
    makeLabel,
    makePort,
    makeUnitLabel,
    notifyPanelRefresh,
    renderPropertyTabs,
    subscribeUnitPreferences,
    validateInputWithFeedback,
    volumeText
} from '../shared/RegistryShared.js';

export const TANK_COMPONENT_SPEC = {
    Classe: TanqueLogico,
    prefixoTag: 'T',
    w: 160,
    h: 160,
    offX: 0,
    offY: -40,
    svg: (id, tag) => `
        <defs>
            <linearGradient id="grad-${id}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#3498db" stop-opacity="0.9"/>
                <stop offset="100%" stop-color="#2980b9" stop-opacity="0.95"/>
            </linearGradient>
            <clipPath id="clip-${id}">
                <path d="M 0 40 L 0 200 A 80 40 0 0 0 160 200 L 160 40 A 80 40 0 0 0 0 40 Z"/>
            </clipPath>
        </defs>
        <path d="M 0 40 L 0 200 A 80 40 0 0 0 160 200 L 160 40 A 80 40 0 0 0 0 40 Z" fill="#fff" stroke="none"/>
        <rect id="agua-${id}" x="0" y="240" width="160" height="0" fill="url(#grad-${id})" clip-path="url(#clip-${id})" />
        <line id="stream-${id}" x1="80" y1="0" x2="80" y2="240" stroke="#3498db" stroke-width="6" class="water-stream" opacity="0"/>
        <path d="M 0 40 L 0 200 A 80 40 0 0 0 160 200 L 160 40 A 80 40 0 0 0 0 40 Z" fill="none" stroke="#2c3e50" stroke-width="6"/>
        <g clip-path="url(#clip-${id})">
            <line id="sp-line-${id}" x1="0" y1="120" x2="160" y2="120" stroke="#e74c3c" stroke-width="3" stroke-dasharray="8,4" opacity="0"/>
        </g>
        <text id="sp-label-${id}" x="165" y="124" font-size="11" font-family="Arial" font-weight="bold" fill="#e74c3c" text-anchor="start" opacity="0">PA</text>
        <rect id="sp-badge-${id}" x="4" y="44" width="52" height="14" rx="4" fill="#e74c3c" opacity="0"/>
        <text id="sp-badge-txt-${id}" x="30" y="54" font-size="9" font-family="Arial" font-weight="bold" text-anchor="middle" fill="#fff" opacity="0">PA ativo</text>
        <text id="alt-util-${id}" x="80" y="205" font-family="Arial" font-size="12" font-weight="bold" text-anchor="middle" fill="#2c3e50"></text>
        <text id="cap-max-${id}" x="80" y="220" font-family="Arial" font-size="12" font-weight="bold" text-anchor="middle" fill="#2c3e50">Capacidade: ${volumeText(1000)}</text>
        <text id="tag-${id}" x="80" y="100" font-size="20" font-family="Arial" font-weight="bold" text-anchor="middle" fill="#1a252f">${tag}</text>
        <text id="vol-${id}" x="80" y="125" font-family="Arial" font-size="18" font-weight="bold" text-anchor="middle" fill="#1a252f">${volumeText(0)}</text>
        <g>${makePort(id, 80, 0, 'in')} ${makePort(id, 80, 240, 'out')}</g>
    `,
    setup: (visual, logica, id) => {
        const atualizarElevacoes = createElevationUpdater({ visual, logica, id, offsetY: -40 });
        const atualizarRotulosTanque = () => {
            visual.querySelector(`#vol-${id}`).textContent = volumeText(logica.volumeAtual);
            visual.querySelector(`#cap-max-${id}`).textContent = `Capacidade: ${volumeText(logica.capacidadeMaxima)}`;
            visual.querySelector(`#alt-util-${id}`).textContent = `Altura: ${displayUnitValue('length', logica.alturaUtilMetros, 2)} ${getUnitSymbol('length')}`;
        };
        const atualizarLinhaSetpoint = () => {
            const spFrac = logica.setpoint / 100;
            const spY = 240 - (spFrac * 240);
            const vis = logica.setpointAtivo ? '1' : '0';
            visual.querySelector(`#sp-line-${id}`).setAttribute('y1', spY);
            visual.querySelector(`#sp-line-${id}`).setAttribute('y2', spY);
            visual.querySelector(`#sp-line-${id}`).setAttribute('opacity', vis);
            visual.querySelector(`#sp-label-${id}`).setAttribute('y', Math.max(10, Math.min(235, spY + 4)));
            visual.querySelector(`#sp-label-${id}`).setAttribute('opacity', vis);
            visual.querySelector(`#sp-badge-${id}`).setAttribute('opacity', vis);
            visual.querySelector(`#sp-badge-txt-${id}`).setAttribute('opacity', vis);
        };

        logica.subscribe((dados) => {
            if (dados.tipo === COMPONENT_EVENTS.POSITION_UPDATE) atualizarElevacoes();
            if (dados.tipo === COMPONENT_EVENTS.VOLUME_UPDATE) {
                visual.querySelector(`#agua-${id}`).setAttribute('height', dados.perc * 240);
                visual.querySelector(`#agua-${id}`).setAttribute('y', 240 - (dados.perc * 240));
                atualizarRotulosTanque();
                visual.querySelector(`#stream-${id}`).style.opacity = dados.qIn > 0.1 ? '0.7' : '0';
            } else if (dados.tipo === COMPONENT_EVENTS.TAG_UPDATE) {
                visual.querySelector(`#tag-${id}`).textContent = logica.tag;
            } else if (dados.tipo === COMPONENT_EVENTS.SETPOINT_UPDATE) {
                atualizarLinhaSetpoint();
            }
        });

        ENGINE.subscribe((dados) => {
            if (dados.tipo === ENGINE_EVENTS.SIMULATION_CONFIG) atualizarElevacoes();
        });

        const unsubscribeUnits = subscribeUnitPreferences(() => {
            if (!visual.isConnected) {
                unsubscribeUnits();
                return;
            }
            atualizarRotulosTanque();
        });

        atualizarRotulosTanque();
        atualizarElevacoes();
    },
    propriedadesAdicionais: (comp) => {
        const diagnosticoControleNivel = comp.getDiagnosticoControleNivel?.() ?? {
            podeAtivar: true,
            motivoBloqueio: ''
        };
        const controleNivelDisponivel = diagnosticoControleNivel.podeAtivar !== false;
        const bloqueioControleAttr = controleNivelDisponivel ? '' : 'disabled';
        const corBordaControle = comp.setpointAtivo ? '#e74c3c' : (controleNivelDisponivel ? '#eee' : '#f39c12');
        const fundoControle = comp.setpointAtivo ? '#fdf5f4' : (controleNivelDisponivel ? '#f9fbfb' : '#fff8ee');
        const textoStatusControle = controleNivelDisponivel
            ? 'O controlador usa a válvula de saída para modular o escoamento e estabilizar o nível.'
            : diagnosticoControleNivel.motivoBloqueio;
        const corStatusControle = controleNivelDisponivel ? '#5f6f7f' : '#c0392b';

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
                <input type="text" id="disp-pressao-tanque" value="${displayUnitValue('pressure', comp.pressaoFundoBar, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Nível líquido', 'length', TOOLTIP.tankLiquidLevel)}
                <input type="text" id="disp-nível-tanque" value="${displayUnitValue('length', comp.getAlturaLiquidoM(), 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Vazão de entrada', 'flow', TOOLTIP.tankInletFlow)}
                <input type="text" id="disp-qin-tanque" value="${displayUnitValue('flow', comp.lastQin, 2)}" disabled>
            </div>
            <div class="prop-group">
                ${makeUnitLabel('Vazão de saída', 'flow', TOOLTIP.tankOutletFlow)}
                <input type="text" id="disp-qout-tanque" value="${displayUnitValue('flow', comp.lastQout, 2)}" disabled>
            </div>
            <div class="prop-group" id="grp-sp-main" style="border-color:${corBordaControle}; background:${fundoControle};">
                <label ${hintAttr(TOOLTIP.tankPiController)} style="color:#c0392b; font-size:13px; text-transform:uppercase; letter-spacing:0.5px;">
                    Controlador de nível (PI)
                </label>
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                    <input type="checkbox" id="input-sp-ativo" ${hintAttr(TOOLTIP.tankSpActive)} ${comp.setpointAtivo ? 'checked' : ''} ${bloqueioControleAttr} style="width:16px; height:16px; cursor:pointer;">
                    <span ${hintAttr(TOOLTIP.tankSpActive)} style="font-size:13px; font-weight:bold;">Ativar controle automático</span>
                </div>
                <p id="tank-sp-status-text" style="margin:0 0 10px; font-size:11px; color:${corStatusControle};">${textoStatusControle}</p>
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
    setupProps: (comp) => {
        const diagnosticoControleNivel = () => comp.getDiagnosticoControleNivel?.() ?? {
            podeAtivar: true,
            motivoBloqueio: ''
        };
        const atualizarEstadoControleNivel = () => {
            const diagnostico = diagnosticoControleNivel();
            const grp = document.getElementById('grp-sp-main');
            const statusEl = document.getElementById('tank-sp-status-text');
            const spAtivoEl = document.getElementById('input-sp-ativo');
            const mostrarParametros = comp.setpointAtivo ? 'block' : 'none';

            if (spAtivoEl) {
                spAtivoEl.disabled = !diagnostico.podeAtivar;
                spAtivoEl.checked = comp.setpointAtivo;
            }

            if (statusEl) {
                statusEl.textContent = diagnostico.podeAtivar
                    ? 'O controlador usa a válvula de saída para modular o escoamento e estabilizar o nível.'
                    : diagnostico.motivoBloqueio;
                statusEl.style.color = diagnostico.podeAtivar ? '#5f6f7f' : '#c0392b';
            }

            if (grp) {
                grp.style.borderColor = comp.setpointAtivo ? '#e74c3c' : (diagnostico.podeAtivar ? '#eee' : '#f39c12');
                grp.style.background = comp.setpointAtivo ? '#fdf5f4' : (diagnostico.podeAtivar ? '#f9fbfb' : '#fff8ee');
            }

            const kpGroup = document.getElementById('group-ctrl-params');
            const kiGroup = document.getElementById('group-ctrl-ki');
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

            const pressureDisplay = document.getElementById('disp-pressao-tanque');
            if (pressureDisplay) pressureDisplay.value = displayUnitValue('pressure', comp.pressaoFundoBar, 2);
            const levelDisplay = document.getElementById('disp-nível-tanque');
            if (levelDisplay) levelDisplay.value = displayUnitValue('length', comp.getAlturaLiquidoM(), 2);
            notifyPanelRefresh();
        };

        document.getElementById('input-cap').addEventListener('change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateVolume(baseFromDisplay('volume', value, 0), 10000, name),
                'Capacidade máxima',
                (validated) => {
                    comp.capacidadeMaxima = validated;
                    comp.volumeAtual = Math.min(comp.volumeAtual, comp.capacidadeMaxima);
                    document.getElementById('input-volume-tanque').max = displayBound('volume', comp.capacidadeMaxima);
                    comp.sincronizarMetricasFisicas();
                    emitirVolumeAtualizado();
                }
            );
        });

        document.getElementById('input-volume-tanque').addEventListener('change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(baseFromDisplay('volume', value, 0), 0, comp.capacidadeMaxima, name),
                'Volume atual',
                (validated) => {
                    comp.volumeAtual = Math.max(0, Math.min(comp.capacidadeMaxima, validated));
                    comp.volumeInicial = comp.volumeAtual;
                    comp.sincronizarMetricasFisicas();
                    emitirVolumeAtualizado();
                }
            );
        });

        document.getElementById('input-altura-tanque').addEventListener('change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateHeight(baseFromDisplay('length', value, 0), 100, name),
                'Altura útil',
                (validated) => {
                    comp.alturaUtilMetros = validated;
                    comp.alturaBocalEntradaM = Math.min(comp.alturaBocalEntradaM, comp.alturaUtilMetros);
                    comp.alturaBocalSaidaM = Math.min(comp.alturaBocalSaidaM, comp.alturaUtilMetros);
                    document.getElementById('input-altura-entrada-tanque').max = displayBound('length', comp.alturaUtilMetros);
                    document.getElementById('input-altura-saída-tanque').max = displayBound('length', comp.alturaUtilMetros);
                    document.getElementById('input-altura-entrada-tanque').value = displayEditableUnitValue('length', comp.alturaBocalEntradaM, 3);
                    document.getElementById('input-altura-saída-tanque').value = displayEditableUnitValue('length', comp.alturaBocalSaidaM, 3);
                    comp.sincronizarMetricasFisicas();
                    emitirVolumeAtualizado();
                }
            );
        });

        document.getElementById('input-altura-entrada-tanque').addEventListener('change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateHeight(baseFromDisplay('length', value, 0), comp.alturaUtilMetros, name),
                'Elevação do bocal de entrada',
                (validated) => {
                    comp.alturaBocalEntradaM = Math.max(0, Math.min(comp.alturaUtilMetros, validated));
                    comp.sincronizarMetricasFisicas();
                    emitirVolumeAtualizado();
                }
            );
        });

        document.getElementById('input-altura-saída-tanque').addEventListener('change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateHeight(baseFromDisplay('length', value, 0), comp.alturaUtilMetros, name),
                'Elevação do bocal de saída',
                (validated) => {
                    comp.alturaBocalSaidaM = Math.max(0, Math.min(comp.alturaUtilMetros, validated));
                    comp.sincronizarMetricasFisicas();
                    emitirVolumeAtualizado();
                }
            );
        });

        document.getElementById('input-cd-tanque').addEventListener('change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(value, 0.05, 1, name),
                'Coeficiente de descarga',
                (validated) => { comp.coeficienteSaida = validated; }
            );
        });

        document.getElementById('input-k-entrada-tanque').addEventListener('change', (event) => {
            validateInputWithFeedback(
                event.target,
                (value, name) => InputValidator.validateNumber(value, 0, 50, name),
                'Perda na entrada',
                (validated) => { comp.perdaEntradaK = validated; }
            );
        });

        const spAtivoEl = document.getElementById('input-sp-ativo');
        spAtivoEl.addEventListener('change', (event) => {
            comp.setSetpointAtivo(event.target.checked);
            atualizarEstadoControleNivel();
            notifyPanelRefresh();
        });

        const spSlider = document.getElementById('input-sp');
        const spNum = document.getElementById('val-sp');

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

        spSlider.addEventListener('input', (event) => updateFromSlider(event.target.value));
        spNum.addEventListener('change', (event) => updateFromInput(event.target.value));
        document.getElementById('input-kp').addEventListener('change', (event) => {
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
        document.getElementById('input-ki').addEventListener('change', (event) => {
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
