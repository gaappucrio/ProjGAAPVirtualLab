// ===============================================
// CONFIGURACAO: Dicionario de Componentes Visuais
// Ficheiro: js/RegistroComponentes.js
// ===============================================

import { ENGINE } from './MotorFisico.js'
import { TanqueLogico } from './componentes/TanqueLogico.js';
import { ValvulaLogica } from './componentes/ValvulaLogica.js';
import { BombaLogica } from './componentes/BombaLogica.js';
import { DrenoLogico } from './componentes/DrenoLogico.js';
import { FonteLogica } from './componentes/FonteLogica.js';
import { colorPort, labelStyle } from './Config.js'
import { formatUnitValue, getUnitSymbol, subscribeUnitPreferences, toBaseValue, toDisplayValue } from './utils/Units.js'
import { InputValidator, showInputError, clearInputError } from './utils/InputValidator.js'

const makePort = (id, cx, cy, inOut) => `<circle class="port-node unconnected" data-type="${inOut}" data-comp-id="${id}" cx="${cx}" cy="${cy}" r="5" fill="#fff" stroke="${colorPort}" stroke-width="2"/>`;
const escapeAttr = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
const hintAttr = (text) => `title="${escapeAttr(text)}"`;
const makeLabel = (text, hint) => `<label ${hintAttr(hint)}>${text}</label>`;
const makeUnitLabel = (text, category, hint) => makeLabel(`${text} (${getUnitSymbol(category)})`, hint);
const displayUnitValue = (category, baseValue, digits = null) => formatUnitValue(category, baseValue, digits);
const displayEditableUnitValue = (category, baseValue, digits = 3) => {
    const displayValue = toDisplayValue(category, baseValue);
    if (!Number.isFinite(displayValue)) return '';
    return Number(displayValue.toFixed(digits));
};
const displayBound = (category, baseValue, digits = 3) => Number(toDisplayValue(category, baseValue).toFixed(digits));
const displayStep = (category, baseStep, digits = 6) => Math.max(Number(toDisplayValue(category, baseStep).toFixed(digits)), Number.EPSILON);
const baseFromDisplay = (category, rawValue, fallback) => {
    const converted = toBaseValue(category, parseFloat(rawValue));
    return Number.isFinite(converted) ? converted : fallback;
};
const notifyPanelRefresh = () => ENGINE.notify({ tipo: 'update_painel', dt: 0 });
const volumeText = (baseValue, digits = null) => `${displayUnitValue('volume', baseValue, digits)} ${getUnitSymbol('volume')}`;

/**
 * Helper para validação de entrada com feedback visual
 * @param {HTMLInputElement} inputElement - elemento de input para validar
 * @param {Function} validatorFn - função validadora (usa InputValidator.validate*)
 * @param {string} fieldName - nome do campo para mensagens de erro
 * @param {Function} onSuccess - callback se validação passar (recebe valor convertido)
 * @param {*} fallback - valor padrão se validação falhar
 */
const validateInputWithFeedback = (inputElement, validatorFn, fieldName, onSuccess, fallback) => {
    if (!inputElement) return fallback;
    
    try {
        const result = validatorFn(inputElement.value, fieldName);
        
        if (!result.valid) {
            showInputError(inputElement, result.error);
            console.warn(`Validação falhou para ${fieldName}: ${result.error}`);
            return fallback;
        }
        
        clearInputError(inputElement);
        if (onSuccess) onSuccess(result.value);
        notifyPanelRefresh();
        return result.value;
    } catch (e) {
        console.error(`Erro ao validar ${fieldName}:`, e);
        showInputError(inputElement, `Erro: ${e.message}`);
        return fallback;
    }
};

const TOOLTIP = {
    sourcePressure: 'Pressão disponível na fronteira de entrada da planta.',
    sourceFlow: 'Limite máximo de vazão que a fonte consegue entregar.',
    sinkPressure: 'Contrapressão imposta na fronteira de saída da planta.',
    pumpDrive: 'Comando percentual aplicado ao acionamento da bomba.',
    pumpFlow: 'Vazão nominal máxima no ponto de projeto da bomba.',
    pumpPressure: 'Carga ou pressão máxima gerada na condição de vazão zero.',
    pumpEfficiency: 'Eficiência hidráulica máxima esperada perto do ponto de melhor eficiência.',
    pumpNpshr: 'NPSH requerido da bomba para evitar cavitação na condicao nominal.',
    pumpRamp: 'Tempo de resposta do acionamento da bomba ate atingir o novo comando.',
    pumpCurve: 'Curva nominal da bomba mostrando carga, eficiencia e NPSHr em função da vazão.',
    valveOpening: 'Posicao de abertura desejada para a válvula de controle.',
    valveCv: 'Capacidade intrínseca de vazão da válvula em plena abertura.',
    valveK: 'Perda localizada adicional introduzida pelo corpo e internos da válvula.',
    valveCharacteristic: 'Lei intrínseca que relaciona abertura e capacidade de passagem.',
    valveRangeability: 'Razão entre a maior e a menor capacidade controlável da válvula.',
    valveStroke: 'Tempo necessário para a válvula percorrer o curso até a nova posição.',
    tankCapacity: 'Volume total útil armazenável no tanque.',
    tankVolume: 'Volume atual de fluido dentro do tanque.',
    tankHeight: 'Altura útil de líquido usada para gerar carga hidrostática.',
    tankInletHeight: 'Cota vertical do bocal de entrada em relação ao fundo do tanque.',
    tankOutletHeight: 'Cota vertical do bocal de saída em relação ao fundo do tanque.',
    tankCd: 'Coeficiente de descarga efetivo da saída do tanque.',
    tankEntryK: 'Perda localizada de entrada associada ao enchimento do tanque.',
    tankSpActive: 'Liga ou desliga o controlador automático de nível do tanque.',
    tankSetpoint: 'Nível desejado para o controlador automático em percentual da capacidade útil.',
    tankKp: 'Ganho proporcional do controlador de nível.',
    tankKi: 'Ganho integral do controlador de nível.'
};

function pumpCurveMarkup() {
    return `
                    <div class="prop-group">
                        ${makeLabel('Curva da Bomba', TOOLTIP.pumpCurve)}
                        <div style="position:relative; height:220px; margin-top:8px;">
                            <canvas id="pump-curve-chart"></canvas>
                        </div>
                        <p style="margin:8px 0 0; font-size:11px; line-height:1.45; color:#7f8c8d;">
                            Curva padrao: Q = vazao, H = carga/pressao gerada, eta = eficiencia e NPSHr = altura minima de sucção requerida.
                        </p>
                    </div>
                `;
}

export const REGISTRO_COMPONENTES = {
    'source': {
        Classe: FonteLogica,
        prefixoTag: 'Entrada',
        w: 40, h: 40, offX: -20, offY: -20,
        svg: (id, tag) => `
                    <circle cx="40" cy="40" r="25" fill="#3498db" stroke="#2980b9" stroke-width="4"/>
                    <path d="M 25 40 L 40 40 M 35 35 L 40 40 L 35 45" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
                    <text id="tag-${id}" x="40" y="80" font-size="11" ${labelStyle}>${tag}</text>
                    <g> ${makePort(id, 65, 40, 'out')} </g>
                `,
        setup: (visual, logica, id) => {
            logica.subscribe((d) => {
                if (d.tipo === 'tag_update') visual.querySelector(`#tag-${id}`).textContent = logica.tag;
            });
        },
        propriedadesAdicionais: (comp) => `
                    <div class="prop-group">
                        ${makeUnitLabel('Pressão de Alimentacao', 'pressure', TOOLTIP.sourcePressure)}
                        <input type="number" id="input-pressao-fonte" ${hintAttr(TOOLTIP.sourcePressure)} value="${displayEditableUnitValue('pressure', comp.pressaoFonteBar, 3)}" step="${displayStep('pressure', 0.01)}" min="${displayBound('pressure', 0.1)}" max="${displayBound('pressure', 20)}">
                    </div>
                    <div class="prop-group">
                        ${makeUnitLabel('Vazão Máxima', 'flow', TOOLTIP.sourceFlow)}
                        <input type="number" id="input-vazao-fonte-max" ${hintAttr(TOOLTIP.sourceFlow)} value="${displayEditableUnitValue('flow', comp.vazaoMaxima, 3)}" step="${displayStep('flow', 1)}" min="${displayBound('flow', 1)}" max="${displayBound('flow', 1000)}">
                    </div>
                    <div class="prop-group">
                        ${makeUnitLabel('Vazão Atual', 'flow', 'Vazão atualmente entregue pela fonte.')}
                        <input type="text" id="disp-vazao-fonte" value="${displayUnitValue('flow', comp.fluxoReal, 2)}" disabled>
                    </div>
                `,
        setupProps: (comp) => {
            const inputPressure = document.getElementById('input-pressao-fonte');
            const inputFlow = document.getElementById('input-vazao-fonte-max');
            
            inputPressure?.addEventListener('change', (e) => {
                validateInputWithFeedback(
                    inputPressure,
                    (v, name) => InputValidator.validatePressure(v, 100, name),
                    'Pressão da Fonte',
                    (val) => { comp.pressaoFonteBar = val; }
                );
            });
            
            inputFlow?.addEventListener('change', (e) => {
                validateInputWithFeedback(
                    inputFlow,
                    (v, name) => InputValidator.validateFlow(v, 500, name),
                    'Vazão Máxima',
                    (val) => { comp.vazaoMaxima = val; }
                );
            });
        }
    },
    'sink': {
        Classe: DrenoLogico,
        prefixoTag: 'Saída',
        w: 40, h: 40, offX: -20, offY: -20,
        svg: (id, tag) => `
                    <circle cx="40" cy="40" r="25" fill="#95a5a6" stroke="#7f8c8d" stroke-width="4"/>
                    <path d="M 35 30 L 45 30 M 40 30 L 40 45 M 35 40 L 40 45 L 45 40" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
                    <text id="tag-${id}" x="40" y="80" font-size="11" ${labelStyle}>${tag}</text>
                    <g> ${makePort(id, 15, 40, 'in')} </g>
                `,
        setup: (visual, logica, id) => {
            logica.subscribe((d) => {
                if (d.tipo === 'tag_update') visual.querySelector(`#tag-${id}`).textContent = logica.tag;
            });
        },
        propriedadesAdicionais: (comp) => `
                    <div class="prop-group">
                        ${makeUnitLabel('Pressão de Descarga', 'pressure', TOOLTIP.sinkPressure)}
                        <input type="number" id="input-pressao-dreno" ${hintAttr(TOOLTIP.sinkPressure)} value="${displayEditableUnitValue('pressure', comp.pressaoSaidaBar, 3)}" step="${displayStep('pressure', 0.01)}" min="${displayBound('pressure', 0)}" max="${displayBound('pressure', 10)}">
                    </div>
                    <div class="prop-group">
                        ${makeUnitLabel('Vazão Recebida', 'flow', 'Vazão atualmente absorvida pela saída.')}
                        <input type="text" id="disp-vazao-dreno" value="${displayUnitValue('flow', comp.vazaoRecebidaLps, 2)}" disabled>
                    </div>
                `,
        setupProps: (comp) => {
            const inputPressure = document.getElementById('input-pressao-dreno');
            
            inputPressure?.addEventListener('change', (e) => {
                validateInputWithFeedback(
                    inputPressure,
                    (v, name) => InputValidator.validatePressure(v, 100, name),
                    'Pressão de Saída',
                    (val) => { comp.pressaoSaidaBar = val; }
                );
            });
        }
    },
    'pump': {
        Classe: BombaLogica,
        prefixoTag: 'P',
        w: 80, h: 80, offX: 0, offY: 0,
        svg: (id, tag) => `
                    <circle cx="40" cy="40" r="34" fill="#fff" stroke="#2c3e50" stroke-width="6"/>
                    <circle id="led-${id}" cx="40" cy="40" r="10" fill="#e74c3c"/>
                    <text id="tag-${id}" x="40" y="88" font-size="12" ${labelStyle}>${tag}</text>
                    <g> ${makePort(id, 0, 40, 'in')} ${makePort(id, 80, 40, 'out')} </g>
                `,
        setup: (visual, logica, id) => {
            visual.addEventListener('dblclick', () => logica.toggle());
            logica.subscribe((d) => {
                if (d.tipo === 'estado') {
                    visual.querySelector(`#led-${id}`).setAttribute('fill', d.grau > 0 ? '#2ecc71' : '#e74c3c');
                } else if (d.tipo === 'tag_update') {
                    visual.querySelector(`#tag-${id}`).textContent = logica.tag;
                }
            });
        },
        propriedadesAdicionais: (comp) => `
                    <div class="prop-group">
                        <label ${hintAttr(TOOLTIP.pumpDrive)}>Acionamento do Motor
                            <span style="display:flex; align-items:center; gap:2px;">
                                <input type="number" id="val-acionamento" class="val-display-input" ${hintAttr(TOOLTIP.pumpDrive)} value="${Math.round(comp.grauAcionamento)}"> %
                            </span>
                        </label>
                        <input type="range" id="input-acionamento" min="0" max="100" value="${Math.round(comp.grauAcionamento)}" ${hintAttr(TOOLTIP.pumpDrive)}>
                    </div>
                    <div class="prop-group">
                        ${makeUnitLabel('Vazão Nominal Max', 'flow', TOOLTIP.pumpFlow)}
                        <input type="number" id="input-vazmax" ${hintAttr(TOOLTIP.pumpFlow)} value="${displayEditableUnitValue('flow', comp.vazaoNominal, 3)}" step="${displayStep('flow', 0.5)}" min="${displayBound('flow', 5)}">
                    </div>
                    <div class="prop-group">
                        ${makeUnitLabel('Pressão Máxima', 'pressure', TOOLTIP.pumpPressure)}
                        <input type="number" id="input-pressao-max-bomba" ${hintAttr(TOOLTIP.pumpPressure)} value="${displayEditableUnitValue('pressure', comp.pressaoMaxima, 3)}" step="${displayStep('pressure', 0.01)}" min="${displayBound('pressure', 0.5)}" max="${displayBound('pressure', 20)}">
                    </div>
                    <div class="prop-group">
                        ${makeLabel('Eficiência Hidráulica (0-1)', TOOLTIP.pumpEfficiency)}
                        <input type="number" id="input-eficiencia-bomba" ${hintAttr(TOOLTIP.pumpEfficiency)} value="${comp.eficienciaHidraulica}" step="0.01" min="0.2" max="1">
                    </div>
                    <div class="prop-group">
                        ${makeUnitLabel('NPSHr', 'length', TOOLTIP.pumpNpshr)}
                        <input type="number" id="input-npsh-bomba" ${hintAttr(TOOLTIP.pumpNpshr)} value="${displayEditableUnitValue('length', comp.npshRequeridoM, 3)}" step="${displayStep('length', 0.05)}" min="${displayBound('length', 0.5)}" max="${displayBound('length', 20)}">
                    </div>
                    <div class="prop-group">
                        ${makeLabel('Tempo de Rampa (s)', TOOLTIP.pumpRamp)}
                        <input type="number" id="input-rampa-bomba" ${hintAttr(TOOLTIP.pumpRamp)} value="${comp.tempoRampaSegundos}" step="0.1" min="0.1" max="20">
                    </div>
                    <div class="prop-group">
                        <label>Acionamento Efetivo (%)</label>
                        <input type="text" id="disp-acionamento-real-bomba" value="${comp.acionamentoEfetivo.toFixed(1)}" disabled>
                    </div>
                    <div class="prop-group">
                        ${makeUnitLabel('Vazão Atual', 'flow', 'Vazão atual de operacao da bomba.')}
                        <input type="text" id="disp-vazao-bomba" value="${displayUnitValue('flow', comp.fluxoReal, 2)}" disabled>
                    </div>
                    <div class="prop-group">
                        ${makeUnitLabel('Pressão de Sucção', 'pressure', 'Pressão medida na entrada da bomba.')}
                        <input type="text" id="disp-succao-bomba" value="${displayUnitValue('pressure', comp.pressaoSucaoAtualBar, 2)}" disabled>
                    </div>
                    <div class="prop-group">
                        ${makeUnitLabel('Pressão de Descarga', 'pressure', 'Pressão medida na saída da bomba.')}
                        <input type="text" id="disp-descarga-bomba" value="${displayUnitValue('pressure', comp.pressaoDescargaAtualBar, 2)}" disabled>
                    </div>
                    <div class="prop-group">
                        ${makeUnitLabel('NPSHa Atual', 'length', 'NPSH disponivel nas condicoes atuais de sucção.')}
                        <input type="text" id="disp-npsh-bomba" value="${displayUnitValue('length', comp.npshDisponivelM, 2)}" disabled>
                    </div>
                    <div class="prop-group">
                        <label>Saude Hidráulica</label>
                        <input type="text" id="disp-cavitacao-bomba" value="${(comp.fatorCavitacaoAtual * 100).toFixed(0)}%" disabled>
                    </div>
                    <div class="prop-group">
                        <label>Eficiência Atual</label>
                        <input type="text" id="disp-eficiencia-bomba" value="${(comp.eficienciaAtual * 100).toFixed(0)}%" disabled>
                    </div>
                    ${pumpCurveMarkup()}
                `,
        setupProps: (comp) => {
            const slider = document.getElementById('input-acionamento');
            const numInput = document.getElementById('val-acionamento');
            const refreshPumpPanel = () => {
                comp.notify({ tipo: 'estado', isOn: comp.isOn, grau: comp.grauAcionamento, grauEfetivo: comp.acionamentoEfetivo });
                notifyPanelRefresh();
            };

            const updateFromSlider = (val) => {
                numInput.value = val;
                comp.setAcionamento(val);
                refreshPumpPanel();
            };

            const updateFromInput = (val) => {
                let parsed = parseInt(val);
                if (isNaN(parsed)) parsed = 0;
                const clamped = Math.max(0, Math.min(100, parsed));
                numInput.value = clamped;
                slider.value = clamped;
                comp.setAcionamento(clamped);
                refreshPumpPanel();
            };

            slider.addEventListener('input', e => updateFromSlider(e.target.value));
            numInput.addEventListener('change', e => updateFromInput(e.target.value));
            document.getElementById('input-vazmax').addEventListener('change', e => {
                validateInputWithFeedback(
                    e.target,
                    (v, name) => InputValidator.validateFlow(v, 500, name),
                    'Vazão Nominal',
                    (val) => { comp.vazaoNominal = val; }
                );
            });
            document.getElementById('input-pressao-max-bomba').addEventListener('change', e => {
                validateInputWithFeedback(
                    e.target,
                    (v, name) => InputValidator.validatePressure(v, 100, name),
                    'Pressão Máxima',
                    (val) => { comp.pressaoMaxima = val; }
                );
            });
            document.getElementById('input-eficiencia-bomba').addEventListener('change', e => {
                validateInputWithFeedback(
                    e.target,
                    (v, name) => InputValidator.validateEfficiency(v, name),
                    'Eficiência',
                    (val) => { comp.eficienciaHidraulica = val / 100; }
                );
            });
            document.getElementById('input-npsh-bomba').addEventListener('change', e => {
                validateInputWithFeedback(
                    e.target,
                    (v, name) => InputValidator.validateNPSH(v, name),
                    'NPSH Requerido',
                    (val) => { comp.npshRequeridoM = val; }
                );
            });
            document.getElementById('input-rampa-bomba').addEventListener('change', e => {
                validateInputWithFeedback(
                    e.target,
                    (v, name) => InputValidator.validateNumber(v, 0.05, 10, name),
                    'Tempo de Rampa',
                    (val) => { comp.tempoRampaSegundos = val; }
                );
            });

            comp.subscribe(d => {
                if (d.tipo === 'estado' && slider) {
                    slider.value = d.grau;
                    numInput.value = d.grau;
                    const effectiveDisplay = document.getElementById('disp-acionamento-real-bomba');
                    if (effectiveDisplay) effectiveDisplay.value = (d.grauEfetivo ?? d.grau).toFixed(1); //
                }
            });
        }
    },
    'valve': {
        Classe: ValvulaLogica,
        prefixoTag: 'V',
        w: 40, h: 40, offX: -20, offY: -20,
        svg: (id, tag) => `
                    <rect x="10" y="34" width="60" height="12" fill="#95a5a6" stroke="#2c3e50" stroke-width="2"/>
                    <path id="corpo-${id}" d="M 20 20 L 20 60 L 60 20 L 60 60 Z" fill="#e74c3c" stroke="#2c3e50" stroke-width="3" stroke-linejoin="round"/>
                    <rect x="36" y="5" width="8" height="35" fill="#c0392b" stroke="#2c3e50" stroke-width="2"/>
                    <rect id="volante-${id}" x="25" y="0" width="30" height="10" fill="#e74c3c" stroke="#2c3e50" stroke-width="2" rx="3"/>
                    <text id="tag-${id}" x="40" y="85" font-size="12" ${labelStyle}>${tag}</text>
                    <g> ${makePort(id, 20, 40, 'in')} ${makePort(id, 60, 40, 'out')} </g>
                `,
        setup: (visual, logica, id) => {
            visual.addEventListener('dblclick', () => logica.toggle());
            logica.subscribe((d) => {
                if (d.tipo === 'estado') {
                    const perc = (typeof d.grauEfetivo === 'number' ? d.grauEfetivo : d.grau) / 100.0;
                    const r = Math.round(231 + (46 - 231) * perc);
                    const g = Math.round(76 + (204 - 76) * perc);
                    const b = Math.round(60 + (113 - 60) * perc);
                    const cor = `rgb(${r}, ${g}, ${b})`;
                    visual.querySelector(`#corpo-${id}`).setAttribute('fill', cor);
                    visual.querySelector(`#volante-${id}`).setAttribute('fill', cor);
                } else if (d.tipo === 'tag_update') {
                    visual.querySelector(`#tag-${id}`).textContent = logica.tag;
                }
            });
        },
        propriedadesAdicionais: (comp) => `
                    <div class="prop-group">
                        <label ${hintAttr(TOOLTIP.valveOpening)}>Abertura
                            <span style="display:flex; align-items:center; gap:2px;">
                                <input type="number" id="val-abertura" class="val-display-input" ${hintAttr(TOOLTIP.valveOpening)} value="${Math.round(comp.grauAbertura)}"> %
                            </span>
                        </label>
                        <input type="range" id="input-abertura" min="0" max="100" value="${Math.round(comp.grauAbertura)}" ${hintAttr(TOOLTIP.valveOpening)}>
                    </div>
                    <div class="prop-group">
                        ${makeLabel('Coeficiente de Vazão (Cv)', TOOLTIP.valveCv)}
                        <input type="number" id="input-cv" ${hintAttr(TOOLTIP.valveCv)} value="${comp.cv}" step="0.1" min="0.1" max="20">
                    </div>
                    <div class="prop-group">
                        ${makeLabel('Coeficiente de Perda (K)', TOOLTIP.valveK)}
                        <input type="number" id="input-perda-k" ${hintAttr(TOOLTIP.valveK)} value="${comp.perdaLocalK}" step="0.5" min="0.5" max="50">
                    </div>
                    <div class="prop-group">
                        ${makeLabel('Caracteristica da Valvula', TOOLTIP.valveCharacteristic)}
                        <select id="input-caracteristica-valvula" ${hintAttr(TOOLTIP.valveCharacteristic)}>
                            <option value="equal_percentage" ${comp.tipoCaracteristica === 'equal_percentage' ? 'selected' : ''}>Equal percentage</option>
                            <option value="linear" ${comp.tipoCaracteristica === 'linear' ? 'selected' : ''}>Linear</option>
                            <option value="quick_opening" ${comp.tipoCaracteristica === 'quick_opening' ? 'selected' : ''}>Quick opening</option>
                        </select>
                    </div>
                    <div class="prop-group">
                        ${makeLabel('Rangeabilidade', TOOLTIP.valveRangeability)}
                        <input type="number" id="input-rangeabilidade-valvula" ${hintAttr(TOOLTIP.valveRangeability)} value="${comp.rangeabilidade}" step="1" min="5" max="100">
                    </div>
                    <div class="prop-group">
                        ${makeLabel('Tempo de Curso (s)', TOOLTIP.valveStroke)}
                        <input type="number" id="input-curso-valvula" ${hintAttr(TOOLTIP.valveStroke)} value="${comp.tempoCursoSegundos}" step="0.1" min="0" max="60">
                    </div>
                    <div class="prop-group">
                        <label>Abertura Efetiva (%)</label>
                        <input type="text" id="disp-abertura-efetiva-valvula" value="${comp.aberturaEfetiva.toFixed(1)}" disabled>
                    </div>
                    <div class="prop-group">
                        ${makeUnitLabel('Vazão Atual', 'flow', 'Vazão atual na valvula.')}
                        <input type="text" id="disp-vazao-valvula" value="${displayUnitValue('flow', comp.fluxoReal, 2)}" disabled>
                    </div>
                    <div class="prop-group">
                        ${makeUnitLabel('DeltaP Atual', 'pressure', 'Queda de pressao atual atraves da valvula.')}
                        <input type="text" id="disp-deltap-valvula" value="${displayUnitValue('pressure', comp.deltaPAtualBar, 2)}" disabled>
                    </div>
                `,
        setupProps: (comp) => {
            const slider = document.getElementById('input-abertura');
            const numInput = document.getElementById('val-abertura');
            const refreshValvePanel = () => {
                comp.notify({ tipo: 'estado', aberta: comp.aberta, grau: comp.grauAbertura, grauEfetivo: comp.aberturaEfetiva });
                notifyPanelRefresh();
            };

            const updateFromSlider = (val) => {
                numInput.value = val;
                comp.setAbertura(val);
                refreshValvePanel();
            };

            const updateFromInput = (val) => {
                let parsed = parseInt(val);
                if (isNaN(parsed)) parsed = 0;
                const clamped = Math.max(0, Math.min(100, parsed));
                numInput.value = clamped;
                slider.value = clamped;
                comp.setAbertura(clamped);
                refreshValvePanel();
            };

            slider.addEventListener('input', e => updateFromSlider(e.target.value));
            numInput.addEventListener('change', e => updateFromInput(e.target.value));
            document.getElementById('input-cv').addEventListener('change', e => {
                validateInputWithFeedback(
                    e.target,
                    (v, name) => InputValidator.validateNumber(v, 0.05, 100, name),
                    'Coeficiente Cv',
                    (val) => { comp.cv = val; }
                );
            });
            document.getElementById('input-perda-k').addEventListener('change', e => {
                validateInputWithFeedback(
                    e.target,
                    (v, name) => InputValidator.validateNumber(v, 0.1, 100, name),
                    'Coeficiente de Perda K',
                    (val) => { comp.perdaLocalK = val; }
                );
            });
            document.getElementById('input-caracteristica-valvula').addEventListener('change', e => {
                comp.tipoCaracteristica = e.target.value;
                notifyPanelRefresh();
            });
            document.getElementById('input-rangeabilidade-valvula').addEventListener('change', e => {
                validateInputWithFeedback(
                    e.target,
                    (v, name) => InputValidator.validateNumber(v, 5, 1000, name),
                    'Rangeabilidade',
                    (val) => { comp.rangeabilidade = val; }
                );
            });
            document.getElementById('input-curso-valvula').addEventListener('change', e => {
                validateInputWithFeedback(
                    e.target,
                    (v, name) => InputValidator.validateNumber(v, 0, 30, name),
                    'Tempo de Curso',
                    (val) => { comp.tempoCursoSegundos = val; }
                );
            });

            comp.subscribe(d => {
                if (d.tipo === 'estado' && slider) {
                    slider.value = d.grau;
                    numInput.value = d.grau;
                    const effectiveDisplay = document.getElementById('disp-abertura-efetiva-valvula');
                    if (effectiveDisplay) effectiveDisplay.value = (d.grauEfetivo ?? d.grau).toFixed(1);
                }
            });
        }
    },
    'tank': {
        Classe: TanqueLogico,
        prefixoTag: 'T',
        w: 160, h: 160, offX: 0, offY: -40,
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
                    <text id="sp-label-${id}" x="165" y="124" font-size="11" font-family="Arial" font-weight="bold" fill="#e74c3c" text-anchor="start" opacity="0">SP</text>
                    <rect id="sp-badge-${id}" x="4" y="44" width="44" height="14" rx="4" fill="#e74c3c" opacity="0"/>
                    <text id="sp-badge-txt-${id}" x="26" y="54" font-size="9" font-family="Arial" font-weight="bold" text-anchor="middle" fill="#fff" opacity="0">SP ON</text>
                    <text id="cap-max-${id}" x="80" y="220" font-family="Arial" font-size="12" font-weight="bold" text-anchor="middle" fill="#2c3e50">Capacidade: ${volumeText(1000)}</text>
                    <text id="tag-${id}" x="80" y="100" font-size="20" font-family="Arial" font-weight="bold" text-anchor="middle" fill="#1a252f">${tag}</text>
                    <text id="vol-${id}" x="80" y="125" font-family="Arial" font-size="18" font-weight="bold" text-anchor="middle" fill="#1a252f">${volumeText(0)}</text>
                    <g> ${makePort(id, 80, 0, 'in')} ${makePort(id, 80, 240, 'out')} </g>
                `,
        setup: (visual, logica, id) => {
            const atualizarRotulosVolume = () => {
                visual.querySelector(`#vol-${id}`).textContent = volumeText(logica.volumeAtual);
                visual.querySelector(`#cap-max-${id}`).textContent = `Capacidade: ${volumeText(logica.capacidadeMaxima)}`;
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

            logica.subscribe((d) => {
                if (d.tipo === 'volume') {
                    visual.querySelector(`#agua-${id}`).setAttribute('height', d.perc * 240);
                    visual.querySelector(`#agua-${id}`).setAttribute('y', 240 - (d.perc * 240));
                    atualizarRotulosVolume();
                    visual.querySelector(`#stream-${id}`).style.opacity = d.qIn > 0.1 ? '0.7' : '0';
                } else if (d.tipo === 'tag_update') {
                    visual.querySelector(`#tag-${id}`).textContent = logica.tag;
                } else if (d.tipo === 'sp_update') {
                    atualizarLinhaSetpoint();
                }
            });

            const unsubscribeUnits = subscribeUnitPreferences(() => {
                if (!visual.isConnected) {
                    unsubscribeUnits();
                    return;
                }
                atualizarRotulosVolume();
            });

            atualizarRotulosVolume();
        },
        propriedadesAdicionais: (comp) => `
                    <div class="prop-group">
                        ${makeUnitLabel('Capacidade Total', 'volume', TOOLTIP.tankCapacity)}
                        <input type="number" id="input-cap" ${hintAttr(TOOLTIP.tankCapacity)} value="${displayEditableUnitValue('volume', comp.capacidadeMaxima, 3)}" step="${displayStep('volume', 10)}" min="${displayBound('volume', 100)}">
                    </div>
                    <div class="prop-group">
                        ${makeUnitLabel('Volume Atual', 'volume', TOOLTIP.tankVolume)}
                        <input type="number" id="input-volume-tanque" ${hintAttr(TOOLTIP.tankVolume)} value="${displayEditableUnitValue('volume', comp.volumeAtual, 3)}" step="${displayStep('volume', 10)}" min="${displayBound('volume', 0)}" max="${displayBound('volume', comp.capacidadeMaxima)}">
                    </div>
                    <div class="prop-group">
                        ${makeUnitLabel('Altura Útil', 'length', TOOLTIP.tankHeight)}
                        <input type="number" id="input-altura-tanque" ${hintAttr(TOOLTIP.tankHeight)} value="${displayEditableUnitValue('length', comp.alturaUtilMetros, 3)}" step="${displayStep('length', 0.05)}" min="${displayBound('length', 0.5)}" max="${displayBound('length', 10)}">
                    </div>
                    <div class="prop-group">
                        ${makeUnitLabel('Cota do Bocal de Entrada', 'length', TOOLTIP.tankInletHeight)}
                        <input type="number" id="input-altura-entrada-tanque" ${hintAttr(TOOLTIP.tankInletHeight)} value="${displayEditableUnitValue('length', comp.alturaBocalEntradaM, 3)}" step="${displayStep('length', 0.01)}" min="${displayBound('length', 0)}" max="${displayBound('length', comp.alturaUtilMetros)}">
                    </div>
                    <div class="prop-group">
                        ${makeUnitLabel('Cota do Bocal de Saída', 'length', TOOLTIP.tankOutletHeight)}
                        <input type="number" id="input-altura-saída-tanque" ${hintAttr(TOOLTIP.tankOutletHeight)} value="${displayEditableUnitValue('length', comp.alturaBocalSaidaM, 3)}" step="${displayStep('length', 0.01)}" min="${displayBound('length', 0)}" max="${displayBound('length', comp.alturaUtilMetros)}">
                    </div>
                    <div class="prop-group">
                        ${makeLabel('Coeficiente de Descarga (Cd)', TOOLTIP.tankCd)}
                        <input type="number" id="input-cd-tanque" ${hintAttr(TOOLTIP.tankCd)} value="${comp.coeficienteSaida}" step="0.01" min="0.1" max="1.5">
                    </div>
                    <div class="prop-group">
                        ${makeLabel('Perda na Entrada (K)', TOOLTIP.tankEntryK)}
                        <input type="number" id="input-k-entrada-tanque" ${hintAttr(TOOLTIP.tankEntryK)} value="${comp.perdaEntradaK}" step="0.1" min="0" max="50">
                    </div>
                    <div class="prop-group">
                        ${makeUnitLabel('Pressão no Fundo', 'pressure', 'Pressão hidrostática no fundo do tanque.')}
                        <input type="text" id="disp-pressao-tanque" value="${displayUnitValue('pressure', comp.pressaoFundoBar, 2)}" disabled>
                    </div>
                    <div class="prop-group">
                        ${makeUnitLabel('Nível Líquido', 'length', 'Altura atual do espelho de líquido em relação ao fundo.')}
                        <input type="text" id="disp-nível-tanque" value="${displayUnitValue('length', comp.getAlturaLiquidoM(), 2)}" disabled>
                    </div>
                    <div class="prop-group">
                        ${makeUnitLabel('Qin', 'flow', 'Vazão de entrada atual no tanque.')}
                        <input type="text" id="disp-qin-tanque" value="${displayUnitValue('flow', comp.lastQin, 2)}" disabled>
                    </div>
                    <div class="prop-group">
                        ${makeUnitLabel('Qout', 'flow', 'Vazão de saída atual do tanque.')}
                        <input type="text" id="disp-qout-tanque" value="${displayUnitValue('flow', comp.lastQout, 2)}" disabled>
                    </div>
                    <div class="prop-group" id="grp-sp-main" style="border-color: ${comp.setpointAtivo ? '#e74c3c' : '#eee'}; background: ${comp.setpointAtivo ? '#fdf5f4' : '#f9fbfb'};">
                        <label ${hintAttr('Controle automático do nível do tanque por sinal proporcional e integral.')} style="color: #c0392b; font-size:13px; text-transform:uppercase; letter-spacing:0.5px;">
                            Controlador de Nível (PI)
                        </label>
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                            <input type="checkbox" id="input-sp-ativo" ${hintAttr(TOOLTIP.tankSpActive)} ${comp.setpointAtivo ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;">
                            <span ${hintAttr(TOOLTIP.tankSpActive)} style="font-size:13px; font-weight:bold;">Ativar controle automático</span>
                        </div>
                        <label ${hintAttr(TOOLTIP.tankSetpoint)}>Setpoint
                            <span style="display:flex; align-items:center; gap:2px;">
                                <input type="number" id="val-sp" class="val-display-input" ${hintAttr(TOOLTIP.tankSetpoint)} value="${comp.setpoint}" min="0" max="100">%
                            </span>
                        </label>
                        <input type="range" id="input-sp" min="0" max="100" value="${comp.setpoint}" style="accent-color:#e74c3c;" ${hintAttr(TOOLTIP.tankSetpoint)}>
                    </div>
                    <div class="prop-group" id="group-ctrl-params" style="display:${comp.setpointAtivo ? 'block' : 'none'};">
                        ${makeLabel('Ganho Proporcional (Kp)', TOOLTIP.tankKp)}
                        <input type="number" id="input-kp" ${hintAttr(TOOLTIP.tankKp)} value="${comp.kp}" step="5" min="1" max="500">
                    </div>
                    <div class="prop-group" id="group-ctrl-ki" style="display:${comp.setpointAtivo ? 'block' : 'none'};">
                        ${makeLabel('Ganho Integral (Ki)', TOOLTIP.tankKi)}
                        <input type="number" id="input-ki" ${hintAttr(TOOLTIP.tankKi)} value="${comp.ki}" step="1" min="0" max="100">
                    </div>
                `,
        setupProps: (comp) => {
            const emitirVolumeAtualizado = () => {
                comp.notify({
                    tipo: 'volume',
                    perc: comp.capacidadeMaxima > 0 ? comp.volumeAtual / comp.capacidadeMaxima : 0,
                    abs: comp.volumeAtual,
                    qIn: comp.lastQin,
                    qOut: comp.lastQout,
                    pBottom: comp.pressaoFundoBar
                });

                const pressureDisplay = document.getElementById('disp-pressao-tanque');
                if (pressureDisplay) pressureDisplay.value = displayUnitValue('pressure', comp.pressaoFundoBar, 2);
                const levelDisplay = document.getElementById('disp-nível-tanque');
                if (levelDisplay) levelDisplay.value = displayUnitValue('length', comp.getAlturaLiquidoM(), 2);
                notifyPanelRefresh();
            };

            document.getElementById('input-cap').addEventListener('change', e => {
                validateInputWithFeedback(
                    e.target,
                    (v, name) => InputValidator.validateVolume(v, 10000, name),
                    'Capacidade Máxima',
                    (val) => {
                        comp.capacidadeMaxima = val;
                        comp.volumeAtual = Math.min(comp.volumeAtual, comp.capacidadeMaxima);
                        document.getElementById('input-volume-tanque').max = displayBound('volume', comp.capacidadeMaxima);
                        comp.sincronizarMetricasFisicas();
                        emitirVolumeAtualizado();
                    }
                );
            });

            document.getElementById('input-volume-tanque').addEventListener('change', e => {
                validateInputWithFeedback(
                    e.target,
                    (v, name) => InputValidator.validateVolume(v, comp.capacidadeMaxima, name),
                    'Volume Atual',
                    (val) => {
                        comp.volumeAtual = Math.max(0, Math.min(comp.capacidadeMaxima, val));
                        comp.volumeInicial = comp.volumeAtual;
                        comp.sincronizarMetricasFisicas();
                        emitirVolumeAtualizado();
                    }
                );
            });

            document.getElementById('input-altura-tanque').addEventListener('change', e => {
                validateInputWithFeedback(
                    e.target,
                    (v, name) => InputValidator.validateHeight(v, 100, name),
                    'Altura Útil',
                    (val) => {
                        comp.alturaUtilMetros = val;
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

            document.getElementById('input-altura-entrada-tanque').addEventListener('change', e => {
                validateInputWithFeedback(
                    e.target,
                    (v, name) => InputValidator.validateHeight(v, comp.alturaUtilMetros, name),
                    'Altura Bocal Entrada',
                    (val) => {
                        comp.alturaBocalEntradaM = Math.max(0, Math.min(comp.alturaUtilMetros, val));
                        comp.sincronizarMetricasFisicas();
                        emitirVolumeAtualizado();
                    }
                );
            });

            document.getElementById('input-altura-saída-tanque').addEventListener('change', e => {
                validateInputWithFeedback(
                    e.target,
                    (v, name) => InputValidator.validateHeight(v, comp.alturaUtilMetros, name),
                    'Altura Bocal Saída',
                    (val) => {
                        comp.alturaBocalSaidaM = Math.max(0, Math.min(comp.alturaUtilMetros, val));
                        comp.sincronizarMetricasFisicas();
                        emitirVolumeAtualizado();
                    }
                );
            });

            document.getElementById('input-cd-tanque').addEventListener('change', e => {
                validateInputWithFeedback(
                    e.target,
                    (v, name) => InputValidator.validateNumber(v, 0.05, 1, name),
                    'Coeficiente Descarga',
                    (val) => { comp.coeficienteSaida = val; }
                );
            });
            document.getElementById('input-k-entrada-tanque').addEventListener('change', e => {
                comp.perdaEntradaK = Math.max(0, parseFloat(e.target.value) || 1.0);
                notifyPanelRefresh();
            });

            const spAtivoEl = document.getElementById('input-sp-ativo');
            spAtivoEl.addEventListener('change', e => {
                comp.setpointAtivo = e.target.checked;
                comp.resetControlador();
                document.getElementById('group-ctrl-params').style.display = comp.setpointAtivo ? 'block' : 'none';
                document.getElementById('group-ctrl-ki').style.display = comp.setpointAtivo ? 'block' : 'none';
                const grp = document.getElementById('grp-sp-main');
                grp.style.borderColor = comp.setpointAtivo ? '#e74c3c' : '#eee';
                grp.style.background = comp.setpointAtivo ? '#fdf5f4' : '#f9fbfb';
                comp.notify({ tipo: 'sp_update' });
                notifyPanelRefresh();
            });

            const spSlider = document.getElementById('input-sp');
            const spNum = document.getElementById('val-sp');

            const updateFromSlider = (val) => {
                spNum.value = val;
                comp.setpoint = parseInt(val);
                comp.resetControlador();
                comp.notify({ tipo: 'sp_update' });
                notifyPanelRefresh();
            };

            const updateFromInput = (val) => {
                let parsed = parseInt(val);
                if (isNaN(parsed)) parsed = 0;
                const clamped = Math.max(0, Math.min(100, parsed));
                spNum.value = clamped;
                spSlider.value = clamped;
                comp.setpoint = clamped;
                comp.resetControlador();
                comp.notify({ tipo: 'sp_update' });
                notifyPanelRefresh();
            };

            spSlider.addEventListener('input', e => updateFromSlider(e.target.value));
            spNum.addEventListener('change', e => updateFromInput(e.target.value));
            document.getElementById('input-kp').addEventListener('change', e => {
                comp.kp = Math.max(1, parseFloat(e.target.value) || 50);
                comp.resetControlador();
                notifyPanelRefresh();
            });
            document.getElementById('input-ki').addEventListener('change', e => {
                comp.ki = Math.max(0, parseFloat(e.target.value) || 0);
                comp.resetControlador();
                notifyPanelRefresh();
            });
        }
    }
};
