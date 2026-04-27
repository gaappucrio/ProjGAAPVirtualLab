// ====================================
// CONTROLLER: Interface e Propriedades
// Ficheiro: js/controllers/UIController.js
// ====================================

import { BombaLogica } from '../componentes/BombaLogica.js';
import { DrenoLogico } from '../componentes/DrenoLogico.js';
import { FonteLogica } from '../componentes/FonteLogica.js';
import { TanqueLogico } from '../componentes/TanqueLogico.js';
import { ValvulaLogica } from '../componentes/ValvulaLogica.js';
import {
    ENGINE,
    FLUID_PRESETS
} from '../MotorFisico.js';
import { REGISTRO_COMPONENTES } from '../RegistroComponentes.js';

import { clearInputError, InputValidator, showInputError } from '../utils/InputValidator.js';
import {
    bindPropertyTabs,
    getPropertyTabsState,
    renderPropertyTabs,
    restorePropertyTabsState
} from '../utils/PropertyTabs.js';
import { TOOLTIPS } from '../utils/Tooltips.js';
import {
    DEFAULT_PIPE_ROUGHNESS_MM,
    formatUnitValue,
    getUnitOptions,
    getUnitPreferences,
    getUnitStep,
    getUnitSymbol,
    setUnitPreference,
    toBaseValue,
    toDisplayValue
} from '../utils/Units.js';

let volumeChart;
let pumpCurveChart = null;
let chartUpdateTimer = 0;
let chartedTankId = null;
let chartedPumpId = null;
let monitorChartMode = 'empty';
const propertyPanelContextState = new Map();
let activePropertyContextKey = 'default';

export function setupUI() {
    setupPanelToggles();
    setupChart();
    setupSubscriptions();
}

function setupPanelToggles() {
    const toggleLeft = document.getElementById('toggle-left');
    const panelLeft = document.getElementById('palette');
    toggleLeft.addEventListener('click', () => {
        const isCollapsed = panelLeft.classList.toggle('collapsed');
        toggleLeft.classList.toggle('collapsed');
        toggleLeft.textContent = isCollapsed ? '▶' : '◀';
    });

    const toggleRight = document.getElementById('toggle-right');
    const panelRight = document.getElementById('properties');
    toggleRight.addEventListener('click', () => {
        const isCollapsed = panelRight.classList.toggle('collapsed');
        toggleRight.classList.toggle('collapsed');
        toggleRight.textContent = isCollapsed ? '◀' : '▶';
    });

    const btnMaxChart = document.getElementById('btn-max-chart');
    const chartWrapper = document.getElementById('chart-wrapper');
    const chartMaxHeader = document.getElementById('chart-max-header');
    const btnCloseMaxChart = document.getElementById('btn-close-max-chart');

    function toggleChartMaximize() {
        const isMax = chartWrapper.classList.toggle('maximized');
        btnMaxChart.textContent = isMax ? '✕ Fechar' : '⛶ Expandir';
        chartMaxHeader.style.display = isMax ? 'flex' : 'none';
        requestAnimationFrame(() => {
            if (volumeChart) {
                volumeChart.resize();
                refreshVolumeChartPresentation();
            }
        });
    }

    btnMaxChart.addEventListener('click', toggleChartMaximize);
    btnCloseMaxChart.addEventListener('click', toggleChartMaximize);

    if (window.innerWidth > 800) {
        panelLeft.classList.remove('collapsed');
        toggleLeft.classList.remove('collapsed');
        toggleLeft.textContent = '◀';

        panelRight.classList.remove('collapsed');
        toggleRight.classList.remove('collapsed');
        toggleRight.textContent = '▶';
    }
}

function setupChart() {
    createEmptyMonitorChart();
}

function getMonitorChartContext() {
    const canvas = document.getElementById('gaap-volume-chart');
    return canvas ? canvas.getContext('2d') : null;
}

function destroyMonitorChart() {
    if (volumeChart) {
        volumeChart.destroy();
        volumeChart = null;
    }
}

function isMonitorChartExpanded() {
    return document.getElementById('chart-wrapper')?.classList.contains('maximized') === true;
}

function createEmptyMonitorChart() {
    const ctx = getMonitorChartContext();
    if (!ctx) return;

    destroyMonitorChart();

    volumeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [0],
            datasets: [{
                label: 'Selecione um Tanque ou Bomba',
                data: [0],
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.2)',
                borderWidth: 2,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 6,
                hitRadius: 15,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                tooltip: {
                    backgroundColor: 'rgba(44, 62, 80, 0.9)',
                    titleFont: { size: 14 },
                    bodyFont: { size: 14, weight: 'bold' },
                    padding: 10,
                    callbacks: {
                        title: (ctx) => `Tempo: ${ctx[0].label}s`,
                        label: (ctx) => `Volume: ${toDisplayValue('volume', ctx.parsed.y).toFixed(1)} ${getUnitSymbol('volume')}`
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: 'Tempo (s)' } },
                y: {
                    min: 0,
                    max: 1000,
                    title: { display: true, text: `Volume (${getUnitSymbol('volume')})` },
                    ticks: {
                        callback: (value) => volumeTickLabel(value)
                    }
                }
            }
        }
    });

    monitorChartMode = 'empty';
    chartedTankId = null;
    chartedPumpId = null;
}

function createTankMonitorChart(component) {
    const ctx = getMonitorChartContext();
    if (!ctx) return;

    destroyMonitorChart();

    volumeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [Math.round(ENGINE.elapsedTime)],
            datasets: [{
                label: `Volume: ${component.tag}`,
                data: [component.volumeAtual],
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.2)',
                borderWidth: 2,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 6,
                hitRadius: 15,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                tooltip: {
                    backgroundColor: 'rgba(44, 62, 80, 0.9)',
                    titleFont: { size: 14 },
                    bodyFont: { size: 14, weight: 'bold' },
                    padding: 10,
                    callbacks: {
                        title: (ctx) => `Tempo: ${ctx[0].label}s`,
                        label: (ctx) => `Volume: ${toDisplayValue('volume', ctx.parsed.y).toFixed(1)} ${getUnitSymbol('volume')}`
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: 'Tempo (s)' } },
                y: {
                    min: 0,
                    max: component.capacidadeMaxima,
                    title: { display: true, text: `Volume (${getUnitSymbol('volume')})` },
                    ticks: {
                        callback: (value) => volumeTickLabel(value)
                    }
                }
            }
        }
    });

    monitorChartMode = 'tank';
    chartedTankId = component.id;
    chartedPumpId = null;
}

function getPropContent() {
    return document.getElementById('prop-content');
}

function getPropertyScrollContainer() {
    return document.querySelector('#properties .side-panel-content');
}

function getConnectionContextKey(connection) {
    if (!connection) return 'default';

    const sourceId = connection.sourceEl?.dataset?.compId || 'source';
    const targetId = connection.targetEl?.dataset?.compId || 'target';
    return `connection:${sourceId}->${targetId}`;
}

function getPropertyContextKey(component = ENGINE.selectedComponent, connection = ENGINE.selectedConnection) {
    if (connection) return getConnectionContextKey(connection);
    if (component) return `component:${component.id}`;
    return 'default';
}

function capturePropertyPanelContextState(contextKey = activePropertyContextKey) {
    if (!contextKey) return;

    const scrollContainer = getPropertyScrollContainer();
    const propContent = getPropContent();
    if (!scrollContainer || !propContent) return;

    propertyPanelContextState.set(contextKey, {
        scrollTop: scrollContainer.scrollTop,
        tabStates: getPropertyTabsState(propContent)
    });
}

function restorePropertyPanelContextState(contextKey, { onAfterRestore } = {}) {
    const scrollContainer = getPropertyScrollContainer();
    const propContent = getPropContent();
    if (!scrollContainer || !propContent) return;

    const savedState = propertyPanelContextState.get(contextKey);
    const restoredTabs = restorePropertyTabsState(propContent, savedState?.tabStates);

    requestAnimationFrame(() => {
        const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
        scrollContainer.scrollTop = Math.min(savedState?.scrollTop || 0, maxScroll);
        onAfterRestore?.(restoredTabs, savedState);
    });
}

function restorePumpCurveFromSavedContext(component, restoredTabs = []) {
    if (!(component instanceof BombaLogica)) return;

    const advancedActive = restoredTabs.some((tabState) => tabState.activeTab === 'advanced');
    if (!advancedActive) return;

    requestAnimationFrame(() => {
        if (!pumpCurveChart) {
            renderPumpCurveChart(component);
        }
        if (pumpCurveChart) {
            pumpCurveChart.resize();
            refreshPumpCurveChart(component);
        }
    });
}

function destroyPumpCurveChart() {
    if (pumpCurveChart) {
        pumpCurveChart.destroy();
        pumpCurveChart = null;
    }
}

function setFieldValue(id, value, category = null, digits = 2, suffix = '') {
    const element = document.getElementById(id);
    if (!element) return;
    element.value = category ? `${formatUnitValue(category, value, digits)}${suffix}` : value;
}

function displayUnitValue(category, baseValue, digits = null) {
    return formatUnitValue(category, baseValue, digits);
}

function displayEditableUnitValue(category, baseValue, digits = 3) {
    const displayValue = toDisplayValue(category, baseValue);
    if (!Number.isFinite(displayValue)) return '';
    return Number(displayValue.toFixed(digits));
}

function displayBound(category, baseValue, digits = 3) {
    return Number(toDisplayValue(category, baseValue).toFixed(digits));
}

function displayStep(category, baseStep, digits = 6) {
    return Math.max(Number(toDisplayValue(category, baseStep).toFixed(digits)), Number.EPSILON);
}

function formatMeasuredValue(category, baseValue, digits = 2) {
    return `${formatUnitValue(category, baseValue, digits)} ${getUnitSymbol(category)}`;
}

function getPumpNpshMargin(component) {
    const npshRequeridoAtualM = component.npshRequeridoAtualM ?? component.npshRequeridoM ?? 0;
    return component.getMargemNpshAtualM?.() ?? (component.npshDisponivelM - npshRequeridoAtualM);
}

function getPumpNpshCondition(component) {
    return component.getCondicaoSucaoAtual?.() ?? 'Sem leitura';
}

function getRecommendedSourcePressureText(alerta) {
    if (!alerta?.autoAjustavel || !Array.isArray(alerta.ajustesFonte) || alerta.ajustesFonte.length === 0) {
        return null;
    }

    const valores = alerta.ajustesFonte.map(ajuste => ajuste.pressaoRecomendadaBar);
    const menor = Math.min(...valores);
    const maior = Math.max(...valores);

    if (Math.abs(maior - menor) < 0.0005) {
        return formatMeasuredValue('pressure', maior, 2);
    }

    return `${formatMeasuredValue('pressure', menor, 2)} a ${formatMeasuredValue('pressure', maior, 2)}`;
}

function updateTankSaturationAlert(component) {
    const painelAlerta = document.getElementById('painel-alerta-saturacao');
    const textoAlerta = document.getElementById('texto-alerta-saturacao');
    const btnAjuste = document.getElementById('btn-aplicar-alerta-saturacao');
    const feedbackAjuste = document.getElementById('texto-acao-alerta-saturacao');

    if (!painelAlerta || !textoAlerta || !(component instanceof TanqueLogico)) return;

    const alerta = component.alertaSaturacao;
    if (!alerta?.ativo) {
        painelAlerta.style.display = 'none';
        if (feedbackAjuste) {
            feedbackAjuste.textContent = '';
            feedbackAjuste.dataset.state = '';
        }
        return;
    }

    const pressaoRecomendada = getRecommendedSourcePressureText(alerta);
    const textoModoAltura = alerta.usarAlturaRelativa
        ? `Com a altura relativa ativa, a recomendação considera a contrapressão no bocal de entrada no set point (${formatMeasuredValue('pressure', alerta.pressaoBaseEntradaSetpointBar, 2)}) e a pressão disponível de saída nesse mesmo nível (${formatMeasuredValue('pressure', alerta.pressaoSaidaSetpointBar, 2)}).`
        : `Com a altura relativa desativada, a entrada do tanque não considera contrapressão hidrostática; o ajuste usa somente a capacidade de saída estimada para o set point (${formatMeasuredValue('pressure', alerta.pressaoSaidaSetpointBar, 2)}).`;
    const textoPressao = pressaoRecomendada
        ? `Para estabilizar no set point de <b>${component.setpoint}%</b>, ajuste a pressão de alimentação para <b>${pressaoRecomendada}</b>.`
        : 'Nenhuma fonte de entrada foi encontrada para aplicar o ajuste automaticamente.';
    const textoBombas = alerta.possuiBombasMontante
        ? ` Há ${alerta.quantidadeBombasMontante} bomba(s) no trecho de entrada; o ajuste automático atua apenas nas fontes de alimentação.`
        : '';

    painelAlerta.style.display = 'block';
    textoAlerta.innerHTML = `
        A saída do tanque atingiu o limite físico para o controle de nível.
        ${textoPressao}
        A vazão máxima estimada de saída no set point é <b>${formatMeasuredValue('flow', alerta.vazaoSaidaLimiteSetpointLps, 2)}</b>.
        ${textoModoAltura}${textoBombas}
    `;

    if (btnAjuste) {
        btnAjuste.style.display = 'inline-flex';
        btnAjuste.disabled = !alerta.autoAjustavel;
        btnAjuste.textContent = alerta.autoAjustavel
            ? (alerta.ajustesFonte.length === 1
                ? 'Aplicar na fonte de entrada'
                : `Aplicar nas ${alerta.ajustesFonte.length} fontes de entrada`)
            : 'Ajuste automático indisponível';
    }

    if (feedbackAjuste && !alerta.autoAjustavel && !feedbackAjuste.dataset.state) {
        feedbackAjuste.textContent = 'Conecte uma fonte de entrada para permitir o ajuste automático.';
        feedbackAjuste.style.color = '#a84300';
    } else if (feedbackAjuste && alerta.autoAjustavel && !feedbackAjuste.dataset.state) {
        feedbackAjuste.textContent = '';
    }
}

function bindTankSaturationAlertActions(component) {
    if (!(component instanceof TanqueLogico)) return;

    const btnAjuste = document.getElementById('btn-aplicar-alerta-saturacao');
    const feedbackAjuste = document.getElementById('texto-acao-alerta-saturacao');
    if (!btnAjuste || !feedbackAjuste) return;

    btnAjuste.addEventListener('click', () => {
        const resultado = component.aplicarAjustePressaoSetpoint();
        if (resultado.aplicado) {
            feedbackAjuste.textContent = resultado.quantidadeFontes === 1
                ? 'Pressão de alimentação ajustada automaticamente.'
                : `Pressão ajustada automaticamente em ${resultado.quantidadeFontes} fontes de entrada.`;
            feedbackAjuste.style.color = '#1e8449';
            feedbackAjuste.dataset.state = 'success';
        } else {
            feedbackAjuste.textContent = resultado.motivo;
            feedbackAjuste.style.color = '#a84300';
            feedbackAjuste.dataset.state = 'warning';
        }

        ENGINE.notify({ tipo: 'update_painel', dt: 0 });
    });

    updateTankSaturationAlert(component);
}

function updateTankControlAvailabilityUI(component) {
    if (!(component instanceof TanqueLogico)) return;

    const diagnostico = component.getDiagnosticoControleNivel?.() ?? {
        podeAtivar: true,
        motivoBloqueio: ''
    };
    const spAtivoEl = document.getElementById('input-sp-ativo');
    const statusEl = document.getElementById('tank-sp-status-text');
    const grp = document.getElementById('grp-sp-main');
    const kpGroup = document.getElementById('group-ctrl-params');
    const kiGroup = document.getElementById('group-ctrl-ki');

    if (spAtivoEl) {
        spAtivoEl.disabled = !diagnostico.podeAtivar;
        spAtivoEl.checked = component.setpointAtivo;
    }

    if (statusEl) {
        statusEl.textContent = diagnostico.podeAtivar
            ? 'O controlador usa a válvula de saída para modular o escoamento e estabilizar o nível.'
            : diagnostico.motivoBloqueio;
        statusEl.style.color = diagnostico.podeAtivar ? '#5f6f7f' : '#c0392b';
    }

    if (grp) {
        grp.style.borderColor = component.setpointAtivo
            ? '#e74c3c'
            : (diagnostico.podeAtivar ? '#eee' : '#f39c12');
        grp.style.background = component.setpointAtivo
            ? '#fdf5f4'
            : (diagnostico.podeAtivar ? '#f9fbfb' : '#fff8ee');
    }

    const mostrarParametros = component.setpointAtivo ? 'block' : 'none';
    if (kpGroup) kpGroup.style.display = mostrarParametros;
    if (kiGroup) kiGroup.style.display = mostrarParametros;
}

function renderUnitControls() {
    const prefs = getUnitPreferences();
    const categories = [
        { id: 'pressure', label: 'Pressão', hint: 'Unidade usada para exibir e editar pressão.' },
        { id: 'flow', label: 'Vazão', hint: 'Unidade usada para exibir e editar vazão.' },
        { id: 'length', label: 'Comprimento', hint: 'Unidade usada para exibir e editar comprimentos e cotas.' },
        { id: 'volume', label: 'Volume', hint: 'Unidade usada para exibir e editar volumes e capacidades.' },
        { id: 'temperature', label: 'Temperatura', hint: 'Unidade usada para exibir e editar temperatura.' }
    ];

    const selectors = categories.map(({ id, label, hint }) => {
        const options = getUnitOptions(id)
            .map((option) => `<option value="${option.id}" ${prefs[id] === option.id ? 'selected' : ''}>${option.label}</option>`)
            .join('');

        return `
            <div>
                <label title="${hint}" style="font-size:11px; color:#7f8c8d; margin-bottom:4px;">${label}</label>
                <select id="unit-pref-${id}" title="${hint}">
                    ${options}
                </select>
            </div>
        `;
    }).join('');

    return `
        <div class="prop-group">
            <label title="${TOOLTIPS.unidades.painel}">Unidades de Exibição</label>
            <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px;">
                ${selectors}
            </div>
            <p style="margin:8px 0 0; font-size:11px; color:#7f8c8d;">${TOOLTIPS.unidades.resumoSi}</p>
        </div>
    `;
}

function bindUnitControls() {
    ['pressure', 'flow', 'length', 'volume', 'temperature'].forEach((category) => {
        const select = document.getElementById(`unit-pref-${category}`);
        if (!select) return;
        select.addEventListener('change', (e) => {
            setUnitPreference(category, e.target.value);
            renderCurrentProperties();
        });
    });
}

function renderCurrentProperties() {
    capturePropertyPanelContextState();

    const component = ENGINE.selectedComponent;
    const connection = ENGINE.selectedConnection;
    const nextContextKey = getPropertyContextKey(component, connection);

    refreshChartSelection(component, connection);
    refreshVolumeChartPresentation();

    if (connection) {
        renderConnectionProperties(connection);
    } else if (component) {
        renderComponentProperties(component);
    } else {
        renderDefaultProperties();
    }

    activePropertyContextKey = nextContextKey;
    restorePropertyPanelContextState(nextContextKey, {
        onAfterRestore: (restoredTabs) => restorePumpCurveFromSavedContext(component, restoredTabs)
    });
}

function pressureInputValue(id, fallback) {
    const value = toBaseValue('pressure', parseFloat(document.getElementById(id).value));
    return Number.isFinite(value) ? value : fallback;
}

function temperatureInputValue(id, fallback) {
    const value = toBaseValue('temperature', parseFloat(document.getElementById(id).value));
    return Number.isFinite(value) ? value : fallback;
}

function lengthInputValue(rawValue, fallback = NaN) {
    const value = toBaseValue('length', parseFloat(rawValue));
    return Number.isFinite(value) ? value : fallback;
}

function volumeTickLabel(value) {
    return toDisplayValue('volume', value).toFixed(1);
}

function getCurrentFluidPresetId() {
    const match = Object.entries(FLUID_PRESETS).find(([, preset]) =>
        Math.abs(preset.densidade - ENGINE.fluidoOperante.densidade) < 0.5 &&
        Math.abs(preset.viscosidadeDinamicaPaS - ENGINE.fluidoOperante.viscosidadeDinamicaPaS) < 0.00001 &&
        Math.abs(preset.pressaoVaporBar - ENGINE.fluidoOperante.pressaoVaporBar) < 0.0001
    );
    return match ? match[0] : 'custom';
}

function refreshVolumeChartPresentation() {
    if (!volumeChart) return;

    if (monitorChartMode === 'pump') {
        const bomba = ENGINE.componentes.find((component) => component.id === chartedPumpId);
        if (bomba instanceof BombaLogica) {
            refreshMonitorPumpChart(bomba);
        }
        return;
    }

    if (monitorChartMode === 'empty') {
        volumeChart.data.datasets[0].label = 'Selecione um Tanque ou Bomba';
        volumeChart.options.scales.y.max = 1000;
    }

    volumeChart.options.scales.y.title.text = `Volume (${getUnitSymbol('volume')})`;
    volumeChart.options.plugins.tooltip.callbacks.label = (ctx) => `Volume: ${toDisplayValue('volume', ctx.parsed.y).toFixed(1)} ${getUnitSymbol('volume')}`;
    volumeChart.options.scales.y.ticks.callback = (value) => volumeTickLabel(value);

    if (monitorChartMode === 'tank' && chartedTankId) {
        const tank = ENGINE.componentes.find((component) => component.id === chartedTankId);
        if (tank) volumeChart.options.scales.y.max = tank.capacidadeMaxima;
    }

    volumeChart.update();
}

function buildPumpCurveDatasets(component) {
    const qMax = Math.max(1, component.vazaoNominal);
    const pressureUnit = getUnitSymbol('pressure');
    const flowUnit = getUnitSymbol('flow');
    const lengthUnit = getUnitSymbol('length');
    const headPoints = [];
    const efficiencyPoints = [];
    const npshPoints = [];

    for (let i = 0; i <= 18; i += 1) {
        const flowLps = (qMax * i) / 18;
        const flowDisplay = toDisplayValue('flow', flowLps);
        headPoints.push({ x: flowDisplay, y: toDisplayValue('pressure', component.getCurvaPressaoBar(flowLps, 1)) });
        efficiencyPoints.push({ x: flowDisplay, y: component.getCurvaEficiencia(flowLps, 1) * 100 });
        npshPoints.push({ x: flowDisplay, y: toDisplayValue('length', component.getCurvaNpshRequeridoM(flowLps, 1)) });
    }

    return {
        headPoints,
        efficiencyPoints,
        npshPoints,
        currentFlow: toDisplayValue('flow', component.fluxoReal),
        currentHead: toDisplayValue('pressure', component.cargaGeradaBar || 0),
        flowUnit,
        pressureUnit,
        lengthUnit
    };
}

function getPumpMonitorScaleProfile() {
    const expanded = isMonitorChartExpanded();
    return {
        expanded,
        titleFontSize: expanded ? 13 : 10,
        tickFontSize: expanded ? 12 : 10,
        secondaryTickFontSize: expanded ? 11 : 9,
        legendFontSize: expanded ? 12 : 10,
        legendPadding: expanded ? 16 : 12,
        legendBoxSize: expanded ? 10 : 8,
        maxTicksX: expanded ? 8 : 6,
        maxTicksY: expanded ? 6 : 5,
        pointRadius: expanded ? 7 : 5,
        pointHoverRadius: expanded ? 8 : 6,
        showSecondaryTitles: expanded,
        layoutPadding: expanded
            ? { top: 14, right: 18, left: 10, bottom: 6 }
            : { top: 8, right: 8, left: 4, bottom: 0 }
    };
}

function applyPumpMonitorChartPresentation(chart, datasets) {
    if (!chart) return;

    const profile = getPumpMonitorScaleProfile();

    chart.options.layout.padding = profile.layoutPadding;
    chart.options.plugins.legend.position = 'bottom';
    chart.options.plugins.legend.labels.boxWidth = profile.legendBoxSize;
    chart.options.plugins.legend.labels.boxHeight = profile.legendBoxSize;
    chart.options.plugins.legend.labels.padding = profile.legendPadding;
    chart.options.plugins.legend.labels.font = { size: profile.legendFontSize };

    chart.options.scales.x.title.text = `Vazão (${datasets.flowUnit})`;
    chart.options.scales.x.title.font = { size: profile.titleFontSize };
    chart.options.scales.x.ticks.font = { size: profile.tickFontSize };
    chart.options.scales.x.ticks.maxTicksLimit = profile.maxTicksX;

    chart.options.scales.yHead.title.text = `Carga (${datasets.pressureUnit})`;
    chart.options.scales.yHead.title.font = { size: profile.titleFontSize };
    chart.options.scales.yHead.ticks.font = { size: profile.tickFontSize };
    chart.options.scales.yHead.ticks.maxTicksLimit = profile.maxTicksY;

    chart.options.scales.yEff.title.display = profile.showSecondaryTitles;
    chart.options.scales.yEff.title.text = 'Eficiência (%)';
    chart.options.scales.yEff.title.font = { size: profile.titleFontSize };
    chart.options.scales.yEff.ticks.font = { size: profile.secondaryTickFontSize };
    chart.options.scales.yEff.ticks.maxTicksLimit = profile.maxTicksY;

    chart.options.scales.yNpsh.title.display = profile.showSecondaryTitles;
    chart.options.scales.yNpsh.title.text = `NPSHr (${datasets.lengthUnit})`;
    chart.options.scales.yNpsh.title.font = { size: profile.titleFontSize };
    chart.options.scales.yNpsh.ticks.font = { size: profile.secondaryTickFontSize };
    chart.options.scales.yNpsh.ticks.maxTicksLimit = profile.maxTicksY;

    chart.data.datasets[3].pointRadius = profile.pointRadius;
    chart.data.datasets[3].pointHoverRadius = profile.pointHoverRadius;
}

function createPumpMonitorChart(component) {
    const ctx = getMonitorChartContext();
    if (!ctx) return;

    const datasets = buildPumpCurveDatasets(component);
    destroyMonitorChart();

    volumeChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'Carga',
                    data: datasets.headPoints,
                    borderColor: '#2980b9',
                    backgroundColor: 'rgba(41, 128, 185, 0.12)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.22,
                    yAxisID: 'yHead',
                    pointRadius: 0
                },
                {
                    label: 'Eficiência',
                    data: datasets.efficiencyPoints,
                    borderColor: '#27ae60',
                    backgroundColor: 'rgba(39, 174, 96, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.22,
                    yAxisID: 'yEff',
                    pointRadius: 0
                },
                {
                    label: 'NPSHr',
                    data: datasets.npshPoints,
                    borderColor: '#e67e22',
                    backgroundColor: 'rgba(230, 126, 34, 0.1)',
                    borderDash: [6, 4],
                    borderWidth: 2,
                    fill: false,
                    tension: 0.22,
                    yAxisID: 'yNpsh',
                    pointRadius: 0
                },
                {
                    label: 'Operação',
                    type: 'scatter',
                    data: [{ x: datasets.currentFlow, y: datasets.currentHead }],
                    borderColor: '#c0392b',
                    backgroundColor: '#c0392b',
                    pointRadius: 5,
                    pointHoverRadius: 6,
                    yAxisID: 'yHead'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'nearest', intersect: false },
            layout: { padding: { top: 8, right: 8, left: 4, bottom: 0 } },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 8,
                        boxHeight: 8,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 12,
                        font: { size: 10 }
                    }
                },
                tooltip: {
                    callbacks: {
                        title: (ctx) => `Vazão: ${Number(ctx[0].parsed.x).toFixed(2)} ${datasets.flowUnit}`,
                        label: (ctx) => {
                            if (ctx.dataset.yAxisID === 'yHead') {
                                return `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.pressureUnit}`;
                            }
                            if (ctx.dataset.yAxisID === 'yEff') {
                                return `Eficiência: ${Number(ctx.parsed.y).toFixed(1)} %`;
                            }
                            if (ctx.dataset.yAxisID === 'yNpsh') {
                                return `NPSHr: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.lengthUnit}`;
                            }
                            return `Ponto atual: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.pressureUnit}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: `Vazão (${datasets.flowUnit})` },
                    ticks: { maxTicksLimit: 6 }
                },
                yHead: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: `Carga (${datasets.pressureUnit})` },
                    ticks: { maxTicksLimit: 5 }
                },
                yEff: {
                    type: 'linear',
                    position: 'right',
                    min: 0,
                    max: 100,
                    grid: { drawOnChartArea: false },
                    title: { display: false, text: 'Eficiência (%)' },
                    ticks: {
                        maxTicksLimit: 5,
                        callback: (value) => `${value}%`
                    }
                },
                yNpsh: {
                    type: 'linear',
                    position: 'right',
                    offset: true,
                    grid: { drawOnChartArea: false },
                    title: { display: false, text: `NPSHr (${datasets.lengthUnit})` },
                    ticks: { maxTicksLimit: 5 }
                }
            }
        }
    });

    applyPumpMonitorChartPresentation(volumeChart, datasets);
    volumeChart.update();

    monitorChartMode = 'pump';
    chartedPumpId = component.id;
    chartedTankId = null;
}

function refreshMonitorPumpChart(component) {
    if (!(component instanceof BombaLogica) || !volumeChart || monitorChartMode !== 'pump' || chartedPumpId !== component.id) {
        return;
    }

    const datasets = buildPumpCurveDatasets(component);
    volumeChart.data.datasets[0].label = 'Carga';
    volumeChart.data.datasets[0].data = datasets.headPoints;
    volumeChart.data.datasets[1].label = 'Eficiência';
    volumeChart.data.datasets[1].data = datasets.efficiencyPoints;
    volumeChart.data.datasets[2].label = 'NPSHr';
    volumeChart.data.datasets[2].data = datasets.npshPoints;
    volumeChart.data.datasets[3].label = 'Operação';
    volumeChart.data.datasets[3].data = [{ x: datasets.currentFlow, y: datasets.currentHead }];
    volumeChart.options.plugins.tooltip.callbacks.title = (ctx) => `Vazão: ${Number(ctx[0].parsed.x).toFixed(2)} ${datasets.flowUnit}`;
    volumeChart.options.plugins.tooltip.callbacks.label = (ctx) => {
        if (ctx.dataset.yAxisID === 'yHead') {
            return `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.pressureUnit}`;
        }
        if (ctx.dataset.yAxisID === 'yEff') {
            return `Eficiência: ${Number(ctx.parsed.y).toFixed(1)} %`;
        }
        if (ctx.dataset.yAxisID === 'yNpsh') {
            return `NPSHr: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.lengthUnit}`;
        }
        return `Ponto atual: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.pressureUnit}`;
    };

    applyPumpMonitorChartPresentation(volumeChart, datasets);
    volumeChart.update();
}

function renderPumpCurveChart(component) {
    const canvas = document.getElementById('pump-curve-chart');
    if (!canvas) {
        destroyPumpCurveChart();
        return;
    }

    const datasets = buildPumpCurveDatasets(component);
    destroyPumpCurveChart();

    pumpCurveChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'Carga',
                    data: datasets.headPoints,
                    borderColor: '#2980b9',
                    backgroundColor: 'rgba(41, 128, 185, 0.12)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.22,
                    yAxisID: 'yHead',
                    pointRadius: 0
                },
                {
                    label: 'Eficiência',
                    data: datasets.efficiencyPoints,
                    borderColor: '#27ae60',
                    backgroundColor: 'rgba(39, 174, 96, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.22,
                    yAxisID: 'yEff',
                    pointRadius: 0
                },
                {
                    label: 'NPSHr',
                    data: datasets.npshPoints,
                    borderColor: '#e67e22',
                    backgroundColor: 'rgba(230, 126, 34, 0.1)',
                    borderDash: [6, 4],
                    borderWidth: 2,
                    fill: false,
                    tension: 0.22,
                    yAxisID: 'yNpsh',
                    pointRadius: 0
                },
                {
                    label: 'Operação',
                    type: 'scatter',
                    data: [{ x: datasets.currentFlow, y: datasets.currentHead }],
                    borderColor: '#c0392b',
                    backgroundColor: '#c0392b',
                    pointRadius: 5,
                    pointHoverRadius: 6,
                    yAxisID: 'yHead'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'nearest', intersect: false },
            layout: {
                padding: {
                    top: 6,
                    right: 6,
                    left: 2,
                    bottom: 0
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 8,
                        boxHeight: 8,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 12,
                        font: { size: 10 }
                    }
                },
                tooltip: {
                    callbacks: {
                        title: (ctx) => `Vazão: ${Number(ctx[0].parsed.x).toFixed(2)} ${datasets.flowUnit}`,
                        label: (ctx) => {
                            if (ctx.dataset.yAxisID === 'yHead') {
                                return `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.pressureUnit}`;
                            }
                            if (ctx.dataset.yAxisID === 'yEff') {
                                return `Eficiência: ${Number(ctx.parsed.y).toFixed(1)} %`;
                            }
                            if (ctx.dataset.yAxisID === 'yNpsh') {
                                return `NPSHr: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.lengthUnit}`;
                            }
                            return `Ponto atual: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.pressureUnit}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: `Vazão (${datasets.flowUnit})`,
                        font: { size: 10 },
                        padding: { top: 6 }
                    },
                    ticks: {
                        font: { size: 10 },
                        maxTicksLimit: 6
                    }
                },
                yHead: {
                    type: 'linear',
                    position: 'left',
                    title: {
                        display: true,
                        text: `Carga (${datasets.pressureUnit})`,
                        font: { size: 10 }
                    },
                    ticks: {
                        font: { size: 10 },
                        maxTicksLimit: 5
                    }
                },
                yEff: {
                    type: 'linear',
                    position: 'right',
                    min: 0,
                    max: 100,
                    grid: { drawOnChartArea: false },
                    title: { display: false, text: 'Eficiência (%)' },
                    ticks: {
                        font: { size: 9 },
                        maxTicksLimit: 5,
                        callback: (value) => `${value}%`
                    }
                },
                yNpsh: {
                    type: 'linear',
                    position: 'right',
                    offset: true,
                    grid: { drawOnChartArea: false },
                    title: { display: false, text: `NPSHr (${datasets.lengthUnit})` },
                    ticks: {
                        font: { size: 9 },
                        maxTicksLimit: 5
                    }
                }
            }
        }
    });
}

function refreshPumpCurveChart(component) {
    if (!(component instanceof BombaLogica) || !pumpCurveChart) return;
    const datasets = buildPumpCurveDatasets(component);
    pumpCurveChart.data.datasets[0].label = 'Carga';
    pumpCurveChart.data.datasets[0].data = datasets.headPoints;
    pumpCurveChart.data.datasets[1].label = 'Eficiência';
    pumpCurveChart.data.datasets[1].data = datasets.efficiencyPoints;
    pumpCurveChart.data.datasets[2].label = 'NPSHr';
    pumpCurveChart.data.datasets[2].data = datasets.npshPoints;
    pumpCurveChart.data.datasets[3].label = 'Operação';
    pumpCurveChart.data.datasets[3].data = [{ x: datasets.currentFlow, y: datasets.currentHead }];
    pumpCurveChart.options.scales.x.title.text = `Vazão (${datasets.flowUnit})`;
    pumpCurveChart.options.scales.yHead.title.text = `Carga (${datasets.pressureUnit})`;
    pumpCurveChart.options.scales.yNpsh.title.text = `NPSHr (${datasets.lengthUnit})`;
    pumpCurveChart.options.plugins.tooltip.callbacks.title = (ctx) => `Vazão: ${Number(ctx[0].parsed.x).toFixed(2)} ${datasets.flowUnit}`;
    pumpCurveChart.options.plugins.tooltip.callbacks.label = (ctx) => {
        if (ctx.dataset.yAxisID === 'yHead') {
            return `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.pressureUnit}`;
        }
        if (ctx.dataset.yAxisID === 'yEff') {
            return `Eficiência: ${Number(ctx.parsed.y).toFixed(1)} %`;
        }
        if (ctx.dataset.yAxisID === 'yNpsh') {
            return `NPSHr: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.lengthUnit}`;
        }
        return `Ponto atual: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.pressureUnit}`;
    };
    pumpCurveChart.update();
}

function renderDefaultProperties() {
    destroyPumpCurveChart();
    const propContent = getPropContent();
    const currentPreset = getCurrentFluidPresetId();
    const fluidOptions = Object.entries(FLUID_PRESETS)
        .map(([id, preset]) => `<option value="${id}" ${currentPreset === id ? 'selected' : ''}>${preset.nome}</option>`)
        .join('');
    const basicContent = `
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.velocidadeSimulacao}">Velocidade da Simulação</label>
            <select id="sel-vel">
                <option value="1">1x (Tempo real)</option>
                <option value="2">2x (Acelerado)</option>
                <option value="5">5x (Rápido)</option>
            </select>
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.preset}">Predefinição do Fluido</label>
            <select id="sel-fluid-preset" title="${TOOLTIPS.fluido.preset}">
                ${fluidOptions}
                <option value="custom" ${currentPreset === 'custom' ? 'selected' : ''}>Personalizado</option>
            </select>
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.nome}">Nome do Fluido</label>
            <input type="text" id="input-fluid-name" title="${TOOLTIPS.fluido.nome}" value="${ENGINE.fluidoOperante.nome}">
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.densidade}">Densidade (kg/m³)</label>
            <input type="number" id="input-fluid-density" title="${TOOLTIPS.fluido.densidade}" value="${ENGINE.fluidoOperante.densidade}" step="1" min="100">
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.temperatura}">Temperatura (${getUnitSymbol('temperature')})</label>
            <input type="number" id="input-fluid-temp" title="${TOOLTIPS.fluido.temperatura}" value="${toDisplayValue('temperature', ENGINE.fluidoOperante.temperatura).toFixed(1)}" step="${getUnitStep('temperature')}" min="${toDisplayValue('temperature', -20).toFixed(1)}" max="${toDisplayValue('temperature', 200).toFixed(1)}">
        </div>
        <p style="font-size: 12px; color:#95a5a6; text-align:center;">${TOOLTIPS.painel.estadoVazio}</p>
    `;
    const advancedContent = `
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.viscosidade}">Viscosidade Dinâmica (Pa.s)</label>
            <input type="number" id="input-fluid-viscosity" title="${TOOLTIPS.fluido.viscosidade}" value="${ENGINE.fluidoOperante.viscosidadeDinamicaPaS}" step="0.0001" min="0.0001">
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.pressaoVapor}">Pressão de Vapor (${getUnitSymbol('pressure')} absoluta)</label>
            <input type="number" id="input-fluid-vapor" title="${TOOLTIPS.fluido.pressaoVapor}" value="${displayUnitValue('pressure', ENGINE.fluidoOperante.pressaoVaporBar, 3)}" step="${displayStep('pressure', 0.001)}" min="${displayBound('pressure', 0.0001)}" max="${displayBound('pressure', 5)}">
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.pressaoAtmosferica}">Pressão Atmosférica (${getUnitSymbol('pressure')} absoluta)</label>
            <input type="number" id="input-fluid-atm" title="${TOOLTIPS.fluido.pressaoAtmosferica}" value="${displayUnitValue('pressure', ENGINE.fluidoOperante.pressaoAtmosfericaBar, 3)}" step="${displayStep('pressure', 0.001)}" min="${displayBound('pressure', 0.5)}" max="${displayBound('pressure', 2)}">
        </div>
    `;

    propContent.innerHTML = `
        ${renderUnitControls()}
        ${renderPropertyTabs({
            basicContent,
            advancedContent,
            advancedDescription: 'Viscosidade e pressões absolutas influenciam atrito, cavitação e disponibilidade de sucção. Em usos mais simples, a aba Geral costuma bastar.'
        })}
    `;

    bindUnitControls();
    bindPropertyTabs(propContent);
    document.getElementById('sel-vel').value = ENGINE.velocidade;
    document.getElementById('sel-vel').addEventListener('change', (e) => {
        ENGINE.velocidade = parseFloat(e.target.value);
    });

    const applyFluidFromInputs = () => {
        const fluidData = {};
        const inputDensity = document.getElementById('input-fluid-density');
        const inputViscosity = document.getElementById('input-fluid-viscosity');
        const inputVapor = document.getElementById('input-fluid-vapor');
        const inputAtm = document.getElementById('input-fluid-atm');

        // Validar densidade
        const densityResult = InputValidator.validateDensity(inputDensity.value, 'Densidade');
        if (!densityResult.valid) {
            showInputError(inputDensity, densityResult.error);
            return;
        }
        fluidData.densidade = densityResult.value;
        clearInputError(inputDensity);

        // Validar viscosidade
        const viscosityResult = InputValidator.validateViscosity(inputViscosity.value, 'Viscosidade');
        if (!viscosityResult.valid) {
            showInputError(inputViscosity, viscosityResult.error);
            return;
        }
        fluidData.viscosidadeDinamicaPaS = viscosityResult.value;
        clearInputError(inputViscosity);

        // Validar pressão de vapor
        const vaporResult = InputValidator.validatePressure(pressureInputValue('input-fluid-vapor', ENGINE.fluidoOperante.pressaoVaporBar), 5, 'Pressão de Vapor');
        if (!vaporResult.valid) {
            showInputError(inputVapor, vaporResult.error);
            return;
        }
        fluidData.pressaoVaporBar = vaporResult.value;
        clearInputError(inputVapor);

        // Validar pressão atmosférica
        const atmResult = InputValidator.validatePressure(pressureInputValue('input-fluid-atm', ENGINE.fluidoOperante.pressaoAtmosfericaBar), 2, 'Pressão Atmosférica');
        if (!atmResult.valid) {
            showInputError(inputAtm, atmResult.error);
            return;
        }
        fluidData.pressaoAtmosfericaBar = atmResult.value;
        clearInputError(inputAtm);

        // Campos sempre válidos
        fluidData.nome = InputValidator.sanitizeText(document.getElementById('input-fluid-name').value, 50);
        fluidData.temperatura = temperatureInputValue('input-fluid-temp', ENGINE.fluidoOperante.temperatura);

        ENGINE.atualizarFluido(fluidData);
        document.getElementById('sel-fluid-preset').value = 'custom';
    };

    document.getElementById('sel-fluid-preset').addEventListener('change', (e) => {
        const preset = FLUID_PRESETS[e.target.value];
        if (!preset) return;
        document.getElementById('input-fluid-name').value = preset.nome;
        document.getElementById('input-fluid-density').value = preset.densidade;
        document.getElementById('input-fluid-viscosity').value = preset.viscosidadeDinamicaPaS;
        document.getElementById('input-fluid-temp').value = toDisplayValue('temperature', preset.temperatura).toFixed(1);
        document.getElementById('input-fluid-vapor').value = formatUnitValue('pressure', preset.pressaoVaporBar, 3);
        applyFluidFromInputs();
    });

    [
        'input-fluid-name',
        'input-fluid-density',
        'input-fluid-viscosity',
        'input-fluid-temp',
        'input-fluid-vapor',
        'input-fluid-atm'
    ].forEach((id) => {
        document.getElementById(id).addEventListener(id === 'input-fluid-name' ? 'input' : 'change', applyFluidFromInputs);
    });
}

function getConnectionDisplay(conn) {
    const source = ENGINE.componentes.find(c => c.id === conn.sourceEl.dataset.compId);
    const target = ENGINE.componentes.find(c => c.id === conn.targetEl.dataset.compId);
    return {
        sourceLabel: source ? source.tag : conn.sourceEl.dataset.compId,
        targetLabel: target ? target.tag : conn.targetEl.dataset.compId
    };
}

function renderConnectionProperties(conn) {
    destroyPumpCurveChart();
    const propContent = getPropContent();
    ENGINE.ensureConnectionProperties(conn);
    const state = ENGINE.getConnectionState(conn);
    const labels = getConnectionDisplay(conn);
    const geometry = ENGINE.getConnectionGeometry(conn);
    const basicContent = `
        <div class="prop-group">
            <label>${TOOLTIPS.conexao.titulo}</label>
            <input type="text" value="${labels.sourceLabel} -> ${labels.targetLabel}" disabled>
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.conexao.diametro}">Diâmetro Interno (${getUnitSymbol('length')})</label>
            <input type="number" id="input-pipe-diameter" title="${TOOLTIPS.conexao.diametro}" value="${displayEditableUnitValue('length', conn.diameterM, 4)}" step="${displayStep('length', 0.005)}" min="${displayBound('length', 0.01)}" max="${displayBound('length', 0.3)}">
        </div>
        <div class="prop-group">
            <label>Vazão Atual (${getUnitSymbol('flow')})</label>
            <input type="text" id="disp-pipe-flow" value="${displayUnitValue('flow', state.flowLps, 2)}" disabled>
        </div>
        <div class="prop-group">
            <label>Vazão Alvo (${getUnitSymbol('flow')})</label>
            <input type="text" id="disp-pipe-target-flow" value="${displayUnitValue('flow', state.targetFlowLps, 2)}" disabled>
        </div>
        <div class="prop-group">
            <label>Queda de Pressão no Trecho (${getUnitSymbol('pressure')})</label>
            <input type="text" id="disp-pipe-deltap" value="${displayUnitValue('pressure', state.deltaPBar, 3)}" disabled>
        </div>
        <div class="prop-group">
            <label>Comprimento Total (${getUnitSymbol('length')})</label>
            <input type="text" id="disp-pipe-length" value="${displayUnitValue('length', state.lengthM || geometry.lengthM, 2)}" disabled>
        </div>
    `;
    const advancedContent = `
        <div class="prop-group">
            <label title="${TOOLTIPS.conexao.comprimentoExtra}">Comprimento Extra (${getUnitSymbol('length')})</label>
            <input type="number" id="input-pipe-extra-length" title="${TOOLTIPS.conexao.comprimentoExtra}" value="${displayEditableUnitValue('length', conn.extraLengthM || 0, 4)}" step="${displayStep('length', 0.1)}" min="${displayBound('length', 0)}" max="${displayBound('length', 500)}">
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.conexao.rugosidade}">Rugosidade Absoluta (${getUnitSymbol('length')})</label>
            <input type="number" id="input-pipe-roughness" title="${TOOLTIPS.conexao.rugosidade}" value="${displayEditableUnitValue('length', (conn.roughnessMm || DEFAULT_PIPE_ROUGHNESS_MM) / 1000, 6)}" step="${displayStep('length', 0.000005, 6)}" min="${displayBound('length', 0.000001, 6)}" max="${displayBound('length', 0.005, 6)}">
        </div>
        <div class="prop-group">
            <label title="${TOOLTIPS.conexao.perdaLocal}">Perda Local K</label>
            <input type="number" id="input-pipe-loss-k" title="${TOOLTIPS.conexao.perdaLocal}" value="${conn.perdaLocalK}" step="0.1" min="0" max="100">
        </div>
        <div class="prop-group">
            <label>Velocidade (m/s)</label>
            <input type="text" id="disp-pipe-velocity" value="${state.velocityMps.toFixed(2)}" disabled>
        </div>
        <div class="prop-group">
            <label>Reynolds</label>
            <input type="text" id="disp-pipe-reynolds" value="${Math.round(state.reynolds)}" disabled>
        </div>
        <div class="prop-group">
            <label>Fator de Atrito Darcy</label>
            <input type="text" id="disp-pipe-friction" value="${state.frictionFactor.toFixed(4)}" disabled>
        </div>
        <div class="prop-group">
            <label>Regime</label>
            <input type="text" id="disp-pipe-regime" value="${state.regime}" disabled>
        </div>
        <div class="prop-group">
            <label>Resposta Hidráulica (s)</label>
            <input type="text" id="disp-pipe-response" value="${state.responseTimeS.toFixed(2)}" disabled>
        </div>
    `;

    propContent.innerHTML = `
        ${renderUnitControls()}
        ${renderPropertyTabs({
            basicContent,
            advancedContent,
            advancedDescription: 'Os parâmetros desta aba refinam perdas distribuídas, perdas locais e a resposta transitória da linha. São úteis quando você quer aproximar melhor a hidráulica do trecho.'
        })}
    `;

    bindUnitControls();
    bindPropertyTabs(propContent);

    const validatePipeInput = (element, validator, fieldName, setter) => {
        if (!element) return;
        try {
            const result = validator(element.value, fieldName);
            if (!result.valid) {
                showInputError(element, result.error);
                console.warn(`Validação falhou para ${fieldName}: ${result.error}`);
                return;
            }
            clearInputError(element);
            setter(result.value);
        } catch (e) {
            console.error(`Erro ao validar ${fieldName}:`, e);
            showInputError(element, `Erro: ${e.message}`);
        }
    };

    document.getElementById('input-pipe-diameter').addEventListener('change', (e) => {
        validatePipeInput(
            e.target,
            (v, name) => InputValidator.validateNumber(lengthInputValue(v), 0.01, 0.3, name),
            'Diâmetro',
            (val) => { conn.diameterM = val; }
        );
    });

    document.getElementById('input-pipe-extra-length').addEventListener('change', (e) => {
        validatePipeInput(
            e.target,
            (v, name) => InputValidator.validateNumber(lengthInputValue(v), 0, 500, name),
            'Comprimento Extra',
            (val) => { conn.extraLengthM = val; }
        );
    });

    document.getElementById('input-pipe-roughness').addEventListener('change', (e) => {
        validatePipeInput(
            e.target,
            (v, name) => InputValidator.validateNumber(lengthInputValue(v), 0.000001, 0.005, name),
            'Rugosidade',
            (val) => { conn.roughnessMm = val * 1000; }
        );
    });

    document.getElementById('input-pipe-loss-k').addEventListener('change', (e) => {
        validatePipeInput(
            e.target,
            (v, name) => InputValidator.validateNumber(v, 0, 100, name),
            'Coeficiente Perda',
            (val) => { conn.perdaLocalK = val; }
        );
    });
}

function renderComponentProperties(component) {
    const propContent = getPropContent();

    let tipoChave = 'source';
    if (component instanceof DrenoLogico) tipoChave = 'sink';
    else if (component instanceof BombaLogica) tipoChave = 'pump';
    else if (component instanceof ValvulaLogica) tipoChave = 'valve';
    else if (component instanceof TanqueLogico) tipoChave = 'tank';

    const spec = REGISTRO_COMPONENTES[tipoChave];

    propContent.innerHTML = `
        <div id="painel-alerta-saturacao" style="display: none; background-color: #fdeaea; border-left: 4px solid #e74c3c; padding: 10px; margin-bottom: 15px; border-radius: 4px;">
            <h4 style="margin: 0 0 5px 0; color: #c0392b; font-size: 13px;">Saída Saturada no Set Point</h4>
            <p id="texto-alerta-saturacao" style="margin: 0; font-size: 11px; color: #333;"></p>
            <button id="btn-aplicar-alerta-saturacao" type="button" style="display:none; margin-top:10px; padding:7px 10px; border:1px solid #c0392b; border-radius:4px; background:#fff; color:#c0392b; font-size:12px; font-weight:600; cursor:pointer;"></button>
            <p id="texto-acao-alerta-saturacao" style="margin:8px 0 0; font-size:11px;"></p>
        </div>
        ${renderUnitControls()}
        <div class="prop-group">
            <label title="${TOOLTIPS.painel.tagComponente}">Tag (Nome)</label>
            <input type="text" id="input-tag" title="${TOOLTIPS.painel.tagComponente}" value="${component.tag}">
        </div>
        ${spec.propriedadesAdicionais(component)}
    `;

    bindUnitControls();
    bindPropertyTabs(propContent);
    document.getElementById('input-tag').addEventListener('input', (e) => {
        component.tag = e.target.value;
        component.notify({ tipo: 'tag_update' });
    });

    if (spec.setupProps) spec.setupProps(component);
    if (component instanceof TanqueLogico) bindTankSaturationAlertActions(component);
    if (component instanceof BombaLogica) {
        renderPumpCurveChart(component);
        propContent.querySelector('.prop-tab-button[data-tab-target="advanced"]')?.addEventListener('click', () => {
            requestAnimationFrame(() => {
                if (!pumpCurveChart) renderPumpCurveChart(component);
                if (pumpCurveChart) {
                    pumpCurveChart.resize();
                    refreshPumpCurveChart(component);
                }
            });
        });
    } else destroyPumpCurveChart();
}

function refreshChartSelection(component, connection) {
    if (component instanceof TanqueLogico) {
        if (monitorChartMode !== 'tank' || chartedTankId !== component.id) {
            createTankMonitorChart(component);
        }
        return;
    }

    if (component instanceof BombaLogica) {
        if (monitorChartMode !== 'pump' || chartedPumpId !== component.id) {
            createPumpMonitorChart(component);
        } else {
            refreshMonitorPumpChart(component);
        }
        return;
    }

    if (connection || !(component instanceof TanqueLogico)) {
        if (monitorChartMode !== 'empty') {
            createEmptyMonitorChart();
        }
    }
}

function setupSubscriptions() {
    const workspaceContainer = document.getElementById('workspace');
    const workspaceCanvas = document.getElementById('workspace-canvas');

    document.getElementById('workspace').addEventListener('mousedown', (e) => {
        if (e.target === workspaceContainer || e.target === workspaceCanvas || e.target.id === 'pipe-layer') {
            ENGINE.selectComponent(null);
            document.querySelectorAll('.placed-component').forEach(el => el.classList.remove('selected'));
            document.querySelectorAll('.pipe-line').forEach(el => {
                el.classList.remove('selected');
                if (el.classList.contains('active')) el.setAttribute('marker-end', 'url(#arrow-active)');
                else el.setAttribute('marker-end', 'url(#arrow)');
            });
        }
    });

    ENGINE.subscribe((dados) => {
        if (dados.tipo === 'selecao') {
            renderCurrentProperties();
            return;
        }

        if (dados.tipo === 'config_simulacao' || dados.tipo === 'fluido_update') {
            renderCurrentProperties();
            return;
        }

        if (dados.tipo === 'update_painel') {
            const component = ENGINE.selectedComponent;
            const connection = ENGINE.selectedConnection;

            if (connection) {
                const state = ENGINE.getConnectionState(connection);
                setFieldValue('disp-pipe-flow', state.flowLps, 'flow', 2);
                setFieldValue('disp-pipe-target-flow', state.targetFlowLps, 'flow', 2);
                if (document.getElementById('disp-pipe-velocity')) document.getElementById('disp-pipe-velocity').value = state.velocityMps.toFixed(2);
                if (document.getElementById('disp-pipe-reynolds')) document.getElementById('disp-pipe-reynolds').value = Math.round(state.reynolds);
                if (document.getElementById('disp-pipe-friction')) document.getElementById('disp-pipe-friction').value = state.frictionFactor.toFixed(4);
                if (document.getElementById('disp-pipe-regime')) document.getElementById('disp-pipe-regime').value = state.regime;
                setFieldValue('disp-pipe-deltap', state.deltaPBar, 'pressure', 3);
                setFieldValue('disp-pipe-length', state.lengthM, 'length', 2);
                if (document.getElementById('disp-pipe-response')) document.getElementById('disp-pipe-response').value = state.responseTimeS.toFixed(2);
            }

            if (component instanceof FonteLogica) {
                setFieldValue('disp-vazao-fonte', component.fluxoReal, 'flow', 2);
            }

            if (component instanceof DrenoLogico) {
                setFieldValue('disp-vazao-dreno', component.vazaoRecebidaLps, 'flow', 2);
            }

            if (component instanceof TanqueLogico) {
                if (document.getElementById('input-volume-tanque') && document.activeElement !== document.getElementById('input-volume-tanque')) {
                    document.getElementById('input-volume-tanque').value = toDisplayValue('volume', component.volumeAtual).toFixed(2);
                }
                setFieldValue('disp-pressao-tanque', component.pressaoFundoBar, 'pressure', 2);
                setFieldValue('disp-nível-tanque', component.getAlturaLiquidoM(), 'length', 2);
                setFieldValue('disp-qin-tanque', component.lastQin, 'flow', 2);
                setFieldValue('disp-qout-tanque', component.lastQout, 'flow', 2);
                updateTankSaturationAlert(component);
                updateTankControlAvailabilityUI(component);
                // NOVO: Atualizar o painel de alerta
                const painelAlerta = document.getElementById('painel-alerta-saturacao');
                const textoAlerta = document.getElementById('texto-alerta-saturacao');

                if (false && painelAlerta && textoAlerta) {
                    if (component.alertaSaturacao && component.alertaSaturacao.ativo) {
                        painelAlerta.style.display = 'block';
                        const qMax = component.alertaSaturacao.qMax;
                        const pMax = component.alertaSaturacao.pMax;
                        textoAlerta.innerHTML = `A tubulação/válvula de saída atingiu seu limite físico. Para estabilizar no Setpoint atual, reduza a pressão de entrada para fornecer no máximo <b>${pMax.toFixed(2)} </b><b>${getUnitSymbol('pressure')}</b>.`;
                    } else {
                        painelAlerta.style.display = 'none';
                    }
                }
            }

            if (component instanceof ValvulaLogica) {
                const abEl = document.getElementById('input-abertura');
                const numInput = document.getElementById('val-abertura');
                const cvInput = document.getElementById('input-cv');
                const perdaInput = document.getElementById('input-perda-k');
                const caracteristicaInput = document.getElementById('input-caracteristica-valvula');
                const rangeabilidadeInput = document.getElementById('input-rangeabilidade-valvula');
                const cursoInput = document.getElementById('input-curso-valvula');
                const bloqueadaPorSetpoint = ENGINE.isValvulaBloqueadaPorSetpoint?.(component) === true || component.estaControladaPorSetpoint?.() === true;

                [abEl, numInput, cvInput, perdaInput, caracteristicaInput, rangeabilidadeInput, cursoInput]
                    .forEach(input => {
                        if (input) input.disabled = bloqueadaPorSetpoint;
                    });

                if (abEl && document.activeElement !== numInput && document.activeElement !== abEl) {
                    abEl.value = Math.round(component.grauAbertura);
                    if (numInput) numInput.value = Math.round(component.grauAbertura);
                }
                if (cvInput && document.activeElement !== cvInput) cvInput.value = component.cv.toFixed(2);
                if (perdaInput && document.activeElement !== perdaInput) perdaInput.value = component.perdaLocalK.toFixed(3);
                if (document.getElementById('disp-abertura-efetiva-valvula')) document.getElementById('disp-abertura-efetiva-valvula').value = component.aberturaEfetiva.toFixed(1);
                setFieldValue('disp-vazao-valvula', component.fluxoReal, 'flow', 2);
                setFieldValue('disp-deltap-valvula', component.deltaPAtualBar, 'pressure', 2);
            }

            if (component instanceof BombaLogica) {
                const acEl = document.getElementById('input-acionamento');
                const numInput = document.getElementById('val-acionamento');
                if (acEl && document.activeElement !== numInput && document.activeElement !== acEl) {
                    acEl.value = Math.round(component.grauAcionamento);
                    if (numInput) numInput.value = Math.round(component.grauAcionamento);
                }
                if (document.getElementById('disp-acionamento-real-bomba')) document.getElementById('disp-acionamento-real-bomba').value = component.acionamentoEfetivo.toFixed(1);
                setFieldValue('disp-vazao-bomba', component.fluxoReal, 'flow', 2);
                setFieldValue('disp-succao-bomba', component.pressaoSucaoAtualBar, 'pressure', 2);
                setFieldValue('disp-descarga-bomba', component.pressaoDescargaAtualBar, 'pressure', 2);
                if (document.getElementById('disp-cavitacao-bomba')) document.getElementById('disp-cavitacao-bomba').value = (component.fatorCavitacaoAtual * 100).toFixed(0) + '%';
                setFieldValue('disp-npsha-bomba', component.npshDisponivelM, 'length', 2);
                setFieldValue('disp-npshr-atual-bomba', component.npshRequeridoAtualM ?? component.npshRequeridoM, 'length', 2);
                setFieldValue('disp-margem-npsh-bomba', getPumpNpshMargin(component), 'length', 2);
                if (document.getElementById('disp-condicao-npsh-bomba')) document.getElementById('disp-condicao-npsh-bomba').value = getPumpNpshCondition(component);
                if (document.getElementById('disp-eficiencia-bomba')) document.getElementById('disp-eficiencia-bomba').value = (component.eficienciaAtual * 100).toFixed(0) + '%';
                refreshPumpCurveChart(component);
                refreshMonitorPumpChart(component);
            }

            chartUpdateTimer += dados.dt;
            if (chartUpdateTimer >= 1.0) {
                chartUpdateTimer = 0;
                if (monitorChartMode === 'tank' && chartedTankId) {
                    const tank = ENGINE.componentes.find(c => c.id === chartedTankId);
                    if (tank) {
                        volumeChart.data.labels.push(Math.round(ENGINE.elapsedTime));
                        volumeChart.data.datasets[0].data.push(tank.volumeAtual);
                        if (volumeChart.data.labels.length > 60) {
                            volumeChart.data.labels.shift();
                            volumeChart.data.datasets[0].data.shift();
                        }
                        volumeChart.update();
                    }
                }
            }
        }
    });

    renderCurrentProperties();
}

export function updatePipesVisualUI() {
    ENGINE.updatePipesVisual();
}
