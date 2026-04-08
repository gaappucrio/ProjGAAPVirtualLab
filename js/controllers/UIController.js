// ====================================
// CONTROLLER: Interface e Propriedades
// Ficheiro: js/controllers/UIController.js
// ====================================

import {
    ENGINE,
    FLUID_PRESETS,
    TanqueLogico,
    BombaLogica,
    ValvulaLogica,
    FonteLogica,
    DrenoLogico
} from '../MotorFisico.js'
import { REGISTRO_COMPONENTES } from '../RegistroComponentes.js'
import { getConnectionFlow } from './PipeController.js'
import {
    formatUnitValue,
    getUnitOptions,
    getUnitPreferences,
    getUnitStep,
    getUnitSymbol,
    setUnitPreference,
    toBaseValue,
    toDisplayValue
} from '../utils/Units.js'

let volumeChart;
let pumpCurveChart = null;
let chartUpdateTimer = 0;
let chartedTankId = null;

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
        if (volumeChart) volumeChart.resize();
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
    const ctx = document.getElementById('gaap-volume-chart').getContext('2d');

    volumeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [0],
            datasets: [{
                label: 'Selecione um Tanque',
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
}

function getPropContent() {
    return document.getElementById('prop-content');
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

function renderUnitControls() {
    const prefs = getUnitPreferences();
    const categories = [
        { id: 'pressure', label: 'Pressao', hint: 'Unidade usada para exibir e editar pressao.' },
        { id: 'flow', label: 'Vazao', hint: 'Unidade usada para exibir e editar vazao.' },
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
            <label title="Configura as unidades exibidas e editadas no painel.">Unidades de Exibicao</label>
            <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px;">
                ${selectors}
            </div>
            <p style="margin:8px 0 0; font-size:11px; color:#7f8c8d;">Padrao SI: kPa, m3/s, m, m3 e C.</p>
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
    const component = ENGINE.selectedComponent;
    const connection = ENGINE.selectedConnection;

    refreshChartSelection(component, connection);
    refreshVolumeChartPresentation();

    if (connection) {
        renderConnectionProperties(connection);
        return;
    }

    if (component) {
        renderComponentProperties(component);
        return;
    }

    renderDefaultProperties();
}

function pressureInputValue(id, fallback) {
    const value = toBaseValue('pressure', parseFloat(document.getElementById(id).value));
    return Number.isFinite(value) ? value : fallback;
}

function temperatureInputValue(id, fallback) {
    const value = toBaseValue('temperature', parseFloat(document.getElementById(id).value));
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
    volumeChart.options.scales.y.title.text = `Volume (${getUnitSymbol('volume')})`;
    volumeChart.options.plugins.tooltip.callbacks.label = (ctx) => `Volume: ${toDisplayValue('volume', ctx.parsed.y).toFixed(1)} ${getUnitSymbol('volume')}`;
    volumeChart.options.scales.y.ticks.callback = (value) => volumeTickLabel(value);

    if (chartedTankId) {
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
                    label: `Carga (${datasets.pressureUnit})`,
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
                    label: 'Eficiencia (%)',
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
                    label: `NPSHr (${datasets.lengthUnit})`,
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
                    label: 'Ponto Atual',
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
            plugins: {
                legend: {
                    labels: {
                        boxWidth: 10,
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    callbacks: {
                        title: (ctx) => `Vazao: ${Number(ctx[0].parsed.x).toFixed(2)} ${datasets.flowUnit}`,
                        label: (ctx) => {
                            if (ctx.dataset.yAxisID === 'yHead') {
                                return `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.pressureUnit}`;
                            }
                            if (ctx.dataset.yAxisID === 'yEff') {
                                return `Eficiencia: ${Number(ctx.parsed.y).toFixed(1)} %`;
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
                    title: { display: true, text: `Vazao (${datasets.flowUnit})` }
                },
                yHead: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: `Carga (${datasets.pressureUnit})` }
                },
                yEff: {
                    type: 'linear',
                    position: 'right',
                    min: 0,
                    max: 100,
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'Eficiencia (%)' }
                },
                yNpsh: {
                    type: 'linear',
                    position: 'right',
                    offset: true,
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: `NPSHr (${datasets.lengthUnit})` }
                }
            }
        }
    });
}

function refreshPumpCurveChart(component) {
    if (!(component instanceof BombaLogica) || !pumpCurveChart) return;
    const datasets = buildPumpCurveDatasets(component);
    pumpCurveChart.data.datasets[0].label = `Carga (${datasets.pressureUnit})`;
    pumpCurveChart.data.datasets[0].data = datasets.headPoints;
    pumpCurveChart.data.datasets[1].data = datasets.efficiencyPoints;
    pumpCurveChart.data.datasets[2].label = `NPSHr (${datasets.lengthUnit})`;
    pumpCurveChart.data.datasets[2].data = datasets.npshPoints;
    pumpCurveChart.data.datasets[3].data = [{ x: datasets.currentFlow, y: datasets.currentHead }];
    pumpCurveChart.options.scales.x.title.text = `Vazao (${datasets.flowUnit})`;
    pumpCurveChart.options.scales.yHead.title.text = `Carga (${datasets.pressureUnit})`;
    pumpCurveChart.options.scales.yNpsh.title.text = `NPSHr (${datasets.lengthUnit})`;
    pumpCurveChart.options.plugins.tooltip.callbacks.title = (ctx) => `Vazao: ${Number(ctx[0].parsed.x).toFixed(2)} ${datasets.flowUnit}`;
    pumpCurveChart.options.plugins.tooltip.callbacks.label = (ctx) => {
        if (ctx.dataset.yAxisID === 'yHead') {
            return `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)} ${datasets.pressureUnit}`;
        }
        if (ctx.dataset.yAxisID === 'yEff') {
            return `Eficiencia: ${Number(ctx.parsed.y).toFixed(1)} %`;
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

    propContent.innerHTML = `
        ${renderUnitControls()}
        <div class="prop-group">
            <label title="Multiplicador de tempo da simulacao fisica.">Velocidade da Simulacao</label>
            <select id="sel-vel">
                <option value="1">1x (Tempo Real)</option>
                <option value="2">2x (Acelerado)</option>
                <option value="5">5x (Rapido)</option>
            </select>
        </div>
        <div class="prop-group">
            <label title="Seleciona um conjunto tipico de propriedades fisicas do fluido.">Preset do Fluido</label>
            <select id="sel-fluid-preset" title="Seleciona um conjunto tipico de propriedades fisicas do fluido.">
                ${fluidOptions}
                <option value="custom" ${currentPreset === 'custom' ? 'selected' : ''}>Personalizado</option>
            </select>
        </div>
        <div class="prop-group">
            <label title="Nome exibido para o fluido operante atual.">Nome do Fluido</label>
            <input type="text" id="input-fluid-name" title="Nome exibido para o fluido operante atual." value="${ENGINE.fluidoOperante.nome}">
        </div>
        <div class="prop-group">
            <label title="Massa especifica do fluido usada nas equacoes hidraulicas.">Densidade (kg/m3)</label>
            <input type="number" id="input-fluid-density" title="Massa especifica do fluido usada nas equacoes hidraulicas." value="${ENGINE.fluidoOperante.densidade}" step="1" min="1">
        </div>
        <div class="prop-group">
            <label title="Viscosidade dinamica usada para Reynolds e perdas por atrito.">Viscosidade Dinamica (Pa.s)</label>
            <input type="number" id="input-fluid-viscosity" title="Viscosidade dinamica usada para Reynolds e perdas por atrito." value="${ENGINE.fluidoOperante.viscosidadeDinamicaPaS}" step="0.0001" min="0.00001">
        </div>
        <div class="prop-group">
            <label title="Temperatura do fluido operante para referencia do caso.">Temperatura (${getUnitSymbol('temperature')})</label>
            <input type="number" id="input-fluid-temp" title="Temperatura do fluido operante para referencia do caso." value="${toDisplayValue('temperature', ENGINE.fluidoOperante.temperatura).toFixed(1)}" step="${getUnitStep('temperature')}" min="${toDisplayValue('temperature', -20).toFixed(1)}" max="${toDisplayValue('temperature', 200).toFixed(1)}">
        </div>
        <div class="prop-group">
            <label title="Pressao de vapor absoluta usada no calculo de cavitacao.">Pressao de Vapor (${getUnitSymbol('pressure')} abs)</label>
            <input type="number" id="input-fluid-vapor" title="Pressao de vapor absoluta usada no calculo de cavitacao." value="${displayUnitValue('pressure', ENGINE.fluidoOperante.pressaoVaporBar, 3)}" step="${displayStep('pressure', 0.001)}" min="${displayBound('pressure', 0.0001)}" max="${displayBound('pressure', 5)}">
        </div>
        <div class="prop-group">
            <label title="Pressao atmosferica absoluta usada como referencia externa.">Pressao Atmosferica (${getUnitSymbol('pressure')} abs)</label>
            <input type="number" id="input-fluid-atm" title="Pressao atmosferica absoluta usada como referencia externa." value="${displayUnitValue('pressure', ENGINE.fluidoOperante.pressaoAtmosfericaBar, 3)}" step="${displayStep('pressure', 0.001)}" min="${displayBound('pressure', 0.5)}" max="${displayBound('pressure', 2)}">
        </div>
        <p style="font-size: 12px; color:#95a5a6; text-align:center;">Clique em um componente ou em um cano para editar os parametros fisicos da planta.</p>
    `;

    bindUnitControls();
    document.getElementById('sel-vel').value = ENGINE.velocidade;
    document.getElementById('sel-vel').addEventListener('change', (e) => {
        ENGINE.velocidade = parseFloat(e.target.value);
    });

    const applyFluidFromInputs = () => {
        ENGINE.atualizarFluido({
            nome: document.getElementById('input-fluid-name').value,
            densidade: parseFloat(document.getElementById('input-fluid-density').value),
            viscosidadeDinamicaPaS: parseFloat(document.getElementById('input-fluid-viscosity').value),
            temperatura: temperatureInputValue('input-fluid-temp', ENGINE.fluidoOperante.temperatura),
            pressaoVaporBar: pressureInputValue('input-fluid-vapor', ENGINE.fluidoOperante.pressaoVaporBar),
            pressaoAtmosfericaBar: pressureInputValue('input-fluid-atm', ENGINE.fluidoOperante.pressaoAtmosfericaBar)
        });
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

    propContent.innerHTML = `
        ${renderUnitControls()}
        <div class="prop-group">
            <label>Conexao</label>
            <input type="text" value="${labels.sourceLabel} -> ${labels.targetLabel}" disabled>
        </div>
        <div class="prop-group">
            <label title="Diametro hidraulico interno usado para calcular area de escoamento.">Diametro Interno (${getUnitSymbol('length')})</label>
            <input type="number" id="input-pipe-diameter" title="Diametro hidraulico interno usado para calcular area de escoamento." value="${displayEditableUnitValue('length', conn.diameterM, 4)}" step="${displayStep('length', 0.005)}" min="${displayBound('length', 0.01)}" max="${displayBound('length', 1)}">
        </div>
        <div class="prop-group">
            <label title="Comprimento adicional equivalente alem da geometria desenhada.">Comprimento Extra (${getUnitSymbol('length')})</label>
            <input type="number" id="input-pipe-extra-length" title="Comprimento adicional equivalente alem da geometria desenhada." value="${displayEditableUnitValue('length', conn.extraLengthM || 0, 4)}" step="${displayStep('length', 0.1)}" min="${displayBound('length', 0)}" max="${displayBound('length', 500)}">
        </div>
        <div class="prop-group">
            <label title="Rugosidade absoluta da parede interna do trecho.">Rugosidade Absoluta (${getUnitSymbol('length')})</label>
            <input type="number" id="input-pipe-roughness" title="Rugosidade absoluta da parede interna do trecho." value="${displayEditableUnitValue('length', (conn.roughnessMm || 0.045) / 1000, 6)}" step="${displayStep('length', 0.000005, 6)}" min="${displayBound('length', 0.000001, 6)}" max="${displayBound('length', 0.005, 6)}">
        </div>
        <div class="prop-group">
            <label title="Perda localizada adicional causada por curvas, acessorios ou singularidades.">Perda Local K</label>
            <input type="number" id="input-pipe-loss-k" title="Perda localizada adicional causada por curvas, acessorios ou singularidades." value="${conn.perdaLocalK}" step="0.1" min="0" max="100">
        </div>
        <div class="prop-group">
            <label>Vazao Atual (${getUnitSymbol('flow')})</label>
            <input type="text" id="disp-pipe-flow" value="${displayUnitValue('flow', state.flowLps, 2)}" disabled>
        </div>
        <div class="prop-group">
            <label>Vazao Alvo (${getUnitSymbol('flow')})</label>
            <input type="text" id="disp-pipe-target-flow" value="${displayUnitValue('flow', state.targetFlowLps, 2)}" disabled>
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
            <label>DeltaP no Trecho (${getUnitSymbol('pressure')})</label>
            <input type="text" id="disp-pipe-deltap" value="${displayUnitValue('pressure', state.deltaPBar, 3)}" disabled>
        </div>
        <div class="prop-group">
            <label>Comprimento Total (${getUnitSymbol('length')})</label>
            <input type="text" id="disp-pipe-length" value="${displayUnitValue('length', state.lengthM || geometry.lengthM, 2)}" disabled>
        </div>
        <div class="prop-group">
            <label>Resposta Hidraulica (s)</label>
            <input type="text" id="disp-pipe-response" value="${state.responseTimeS.toFixed(2)}" disabled>
        </div>
    `;

    bindUnitControls();
    document.getElementById('input-pipe-diameter').addEventListener('change', (e) => {
        const converted = toBaseValue('length', parseFloat(e.target.value));
        conn.diameterM = Math.max(0.01, Number.isFinite(converted) ? converted : conn.diameterM);
    });
    document.getElementById('input-pipe-extra-length').addEventListener('change', (e) => {
        const converted = toBaseValue('length', parseFloat(e.target.value));
        conn.extraLengthM = Math.max(0, Number.isFinite(converted) ? converted : conn.extraLengthM);
    });
    document.getElementById('input-pipe-roughness').addEventListener('change', (e) => {
        const converted = toBaseValue('length', parseFloat(e.target.value));
        conn.roughnessMm = Math.max(0.001, (Number.isFinite(converted) ? converted : (conn.roughnessMm / 1000)) * 1000);
    });
    document.getElementById('input-pipe-loss-k').addEventListener('change', (e) => {
        conn.perdaLocalK = Math.max(0, parseFloat(e.target.value) || 0);
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
        ${renderUnitControls()}
        <div class="prop-group">
            <label title="Identificacao visual do equipamento no diagrama.">Tag (Nome)</label>
            <input type="text" id="input-tag" title="Identificacao visual do equipamento no diagrama." value="${component.tag}">
        </div>
        ${spec.propriedadesAdicionais(component)}
    `;

    bindUnitControls();
    document.getElementById('input-tag').addEventListener('input', (e) => {
        component.tag = e.target.value;
        component.notify({ tipo: 'tag_update' });
    });

    if (spec.setupProps) spec.setupProps(component);
    if (component instanceof BombaLogica) renderPumpCurveChart(component);
    else destroyPumpCurveChart();
}

function refreshChartSelection(component, connection) {
    if (component instanceof TanqueLogico) {
        if (chartedTankId !== component.id) {
            chartedTankId = component.id;
            volumeChart.data.labels = [Math.round(ENGINE.elapsedTime)];
            volumeChart.data.datasets[0].data = [component.volumeAtual];
            volumeChart.data.datasets[0].label = `Volume: ${component.tag}`;
            volumeChart.options.scales.y.max = component.capacidadeMaxima;
            volumeChart.update();
        }
        return;
    }

    if (connection || !(component instanceof TanqueLogico)) {
        chartedTankId = null;
        volumeChart.data.labels = [Math.round(ENGINE.elapsedTime)];
        volumeChart.data.datasets[0].data = [0];
        volumeChart.data.datasets[0].label = 'Selecione um Tanque';
        volumeChart.options.scales.y.max = 1000;
        volumeChart.update();
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
                setFieldValue('disp-nivel-tanque', component.getAlturaLiquidoM(), 'length', 2);
                setFieldValue('disp-qin-tanque', component.lastQin, 'flow', 2);
                setFieldValue('disp-qout-tanque', component.lastQout, 'flow', 2);
            }

            if (component instanceof ValvulaLogica) {
                const abEl = document.getElementById('input-abertura');
                const numInput = document.getElementById('val-abertura');
                if (abEl && document.activeElement !== numInput && document.activeElement !== abEl) {
                    abEl.value = Math.round(component.grauAbertura);
                    if (numInput) numInput.value = Math.round(component.grauAbertura);
                }
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
                setFieldValue('disp-npsh-bomba', component.npshDisponivelM, 'length', 2);
                if (document.getElementById('disp-eficiencia-bomba')) document.getElementById('disp-eficiencia-bomba').value = (component.eficienciaAtual * 100).toFixed(0) + '%';
                refreshPumpCurveChart(component);
            }

            chartUpdateTimer += dados.dt;
            if (chartUpdateTimer >= 1.0) {
                chartUpdateTimer = 0;
                if (chartedTankId) {
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
