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

let volumeChart;
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
                        label: (ctx) => `Volume: ${ctx.parsed.y.toFixed(1)} Litros`
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: 'Tempo (s)' } },
                y: { min: 0, max: 1000, title: { display: true, text: 'Volume (L)' } }
            }
        }
    });
}

function getPropContent() {
    return document.getElementById('prop-content');
}

function getCurrentFluidPresetId() {
    const match = Object.entries(FLUID_PRESETS).find(([, preset]) =>
        Math.abs(preset.densidade - ENGINE.fluidoOperante.densidade) < 0.5 &&
        Math.abs(preset.viscosidadeDinamicaPaS - ENGINE.fluidoOperante.viscosidadeDinamicaPaS) < 0.00001 &&
        Math.abs(preset.pressaoVaporBar - ENGINE.fluidoOperante.pressaoVaporBar) < 0.0001
    );
    return match ? match[0] : 'custom';
}

function renderDefaultProperties() {
    const propContent = getPropContent();
    const currentPreset = getCurrentFluidPresetId();
    const fluidOptions = Object.entries(FLUID_PRESETS)
        .map(([id, preset]) => `<option value="${id}" ${currentPreset === id ? 'selected' : ''}>${preset.nome}</option>`)
        .join('');

    propContent.innerHTML = `
        <div class="prop-group">
            <label>Velocidade da Simulacao</label>
            <select id="sel-vel">
                <option value="1">1x (Tempo Real)</option>
                <option value="2">2x (Acelerado)</option>
                <option value="5">5x (Rapido)</option>
            </select>
        </div>
        <div class="prop-group">
            <label>Preset do Fluido</label>
            <select id="sel-fluid-preset">
                ${fluidOptions}
                <option value="custom" ${currentPreset === 'custom' ? 'selected' : ''}>Personalizado</option>
            </select>
        </div>
        <div class="prop-group">
            <label>Nome do Fluido</label>
            <input type="text" id="input-fluid-name" value="${ENGINE.fluidoOperante.nome}">
        </div>
        <div class="prop-group">
            <label>Densidade (kg/m3)</label>
            <input type="number" id="input-fluid-density" value="${ENGINE.fluidoOperante.densidade}" step="1" min="1">
        </div>
        <div class="prop-group">
            <label>Viscosidade Dinamica (Pa.s)</label>
            <input type="number" id="input-fluid-viscosity" value="${ENGINE.fluidoOperante.viscosidadeDinamicaPaS}" step="0.0001" min="0.00001">
        </div>
        <div class="prop-group">
            <label>Temperatura (C)</label>
            <input type="number" id="input-fluid-temp" value="${ENGINE.fluidoOperante.temperatura}" step="1" min="-20" max="200">
        </div>
        <div class="prop-group">
            <label>Pressao de Vapor (bar abs)</label>
            <input type="number" id="input-fluid-vapor" value="${ENGINE.fluidoOperante.pressaoVaporBar}" step="0.001" min="0.0001" max="5">
        </div>
        <div class="prop-group">
            <label>Pressao Atmosferica (bar abs)</label>
            <input type="number" id="input-fluid-atm" value="${ENGINE.fluidoOperante.pressaoAtmosfericaBar}" step="0.01" min="0.5" max="2">
        </div>
        <p style="font-size: 12px; color:#95a5a6; text-align:center;">Clique em um componente ou em um cano para editar os parametros fisicos da planta.</p>
    `;

    document.getElementById('sel-vel').value = ENGINE.velocidade;
    document.getElementById('sel-vel').addEventListener('change', (e) => {
        ENGINE.velocidade = parseFloat(e.target.value);
    });

    const applyFluidFromInputs = () => {
        ENGINE.atualizarFluido({
            nome: document.getElementById('input-fluid-name').value,
            densidade: parseFloat(document.getElementById('input-fluid-density').value),
            viscosidadeDinamicaPaS: parseFloat(document.getElementById('input-fluid-viscosity').value),
            temperatura: parseFloat(document.getElementById('input-fluid-temp').value),
            pressaoVaporBar: parseFloat(document.getElementById('input-fluid-vapor').value),
            pressaoAtmosfericaBar: parseFloat(document.getElementById('input-fluid-atm').value)
        });
        document.getElementById('sel-fluid-preset').value = 'custom';
    };

    document.getElementById('sel-fluid-preset').addEventListener('change', (e) => {
        const preset = FLUID_PRESETS[e.target.value];
        if (!preset) return;
        document.getElementById('input-fluid-name').value = preset.nome;
        document.getElementById('input-fluid-density').value = preset.densidade;
        document.getElementById('input-fluid-viscosity').value = preset.viscosidadeDinamicaPaS;
        document.getElementById('input-fluid-temp').value = preset.temperatura;
        document.getElementById('input-fluid-vapor').value = preset.pressaoVaporBar;
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
    const propContent = getPropContent();
    ENGINE.ensureConnectionProperties(conn);
    const state = ENGINE.getConnectionState(conn);
    const labels = getConnectionDisplay(conn);
    const geometry = ENGINE.getConnectionGeometry(conn);

    propContent.innerHTML = `
        <div class="prop-group">
            <label>Conexao</label>
            <input type="text" value="${labels.sourceLabel} -> ${labels.targetLabel}" disabled>
        </div>
        <div class="prop-group">
            <label>Diametro Interno (m)</label>
            <input type="number" id="input-pipe-diameter" value="${conn.diameterM}" step="0.005" min="0.01" max="1">
        </div>
        <div class="prop-group">
            <label>Comprimento Extra (m)</label>
            <input type="number" id="input-pipe-extra-length" value="${conn.extraLengthM || 0}" step="0.1" min="0" max="500">
        </div>
        <div class="prop-group">
            <label>Rugosidade Absoluta (mm)</label>
            <input type="number" id="input-pipe-roughness" value="${conn.roughnessMm || 0.045}" step="0.005" min="0.001" max="5">
        </div>
        <div class="prop-group">
            <label>Perda Local K</label>
            <input type="number" id="input-pipe-loss-k" value="${conn.perdaLocalK}" step="0.1" min="0" max="100">
        </div>
        <div class="prop-group">
            <label>Vazao Atual (L/s)</label>
            <input type="text" id="disp-pipe-flow" value="${state.flowLps.toFixed(2)}" disabled>
        </div>
        <div class="prop-group">
            <label>Vazao Alvo (L/s)</label>
            <input type="text" id="disp-pipe-target-flow" value="${state.targetFlowLps.toFixed(2)}" disabled>
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
            <label>DeltaP no Trecho (bar)</label>
            <input type="text" id="disp-pipe-deltap" value="${state.deltaPBar.toFixed(3)}" disabled>
        </div>
        <div class="prop-group">
            <label>Comprimento Total (m)</label>
            <input type="text" id="disp-pipe-length" value="${(state.lengthM || geometry.lengthM).toFixed(2)}" disabled>
        </div>
        <div class="prop-group">
            <label>Resposta Hidraulica (s)</label>
            <input type="text" id="disp-pipe-response" value="${state.responseTimeS.toFixed(2)}" disabled>
        </div>
    `;

    document.getElementById('input-pipe-diameter').addEventListener('change', (e) => {
        conn.diameterM = Math.max(0.01, parseFloat(e.target.value) || 0.08);
    });
    document.getElementById('input-pipe-extra-length').addEventListener('change', (e) => {
        conn.extraLengthM = Math.max(0, parseFloat(e.target.value) || 0);
    });
    document.getElementById('input-pipe-roughness').addEventListener('change', (e) => {
        conn.roughnessMm = Math.max(0.001, parseFloat(e.target.value) || 0.045);
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
        <div class="prop-group">
            <label>Tag (Nome)</label>
            <input type="text" id="input-tag" value="${component.tag}">
        </div>
        ${spec.propriedadesAdicionais(component)}
    `;

    document.getElementById('input-tag').addEventListener('input', (e) => {
        component.tag = e.target.value;
        component.notify({ tipo: 'tag_update' });
    });

    if (spec.setupProps) spec.setupProps(component);
}

function refreshChartSelection(component, connection) {
    if (component instanceof TanqueLogico) {
        if (chartedTankId !== component.id) {
            chartedTankId = component.id;
            volumeChart.data.labels = [Math.round(ENGINE.elapsedTime)];
            volumeChart.data.datasets[0].data = [component.volumeAtual];
            volumeChart.data.datasets[0].label = `Volume: ${component.tag}`;
            volumeChart.update();
        }
        return;
    }

    if (connection || !(component instanceof TanqueLogico)) {
        chartedTankId = null;
        volumeChart.data.labels = [Math.round(ENGINE.elapsedTime)];
        volumeChart.data.datasets[0].data = [0];
        volumeChart.data.datasets[0].label = 'Selecione um Tanque';
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
            const component = dados.componente;
            const connection = dados.conexao;

            refreshChartSelection(component, connection);

            if (connection) {
                renderConnectionProperties(connection);
                return;
            }

            if (!component) {
                renderDefaultProperties();
                return;
            }

            renderComponentProperties(component);
            return;
        }

        if (dados.tipo === 'update_painel') {
            const component = ENGINE.selectedComponent;
            const connection = ENGINE.selectedConnection;

            if (connection) {
                const state = ENGINE.getConnectionState(connection);
                if (document.getElementById('disp-pipe-flow')) document.getElementById('disp-pipe-flow').value = state.flowLps.toFixed(2);
                if (document.getElementById('disp-pipe-target-flow')) document.getElementById('disp-pipe-target-flow').value = state.targetFlowLps.toFixed(2);
                if (document.getElementById('disp-pipe-velocity')) document.getElementById('disp-pipe-velocity').value = state.velocityMps.toFixed(2);
                if (document.getElementById('disp-pipe-reynolds')) document.getElementById('disp-pipe-reynolds').value = Math.round(state.reynolds);
                if (document.getElementById('disp-pipe-friction')) document.getElementById('disp-pipe-friction').value = state.frictionFactor.toFixed(4);
                if (document.getElementById('disp-pipe-regime')) document.getElementById('disp-pipe-regime').value = state.regime;
                if (document.getElementById('disp-pipe-deltap')) document.getElementById('disp-pipe-deltap').value = state.deltaPBar.toFixed(3);
                if (document.getElementById('disp-pipe-length')) document.getElementById('disp-pipe-length').value = state.lengthM.toFixed(2);
                if (document.getElementById('disp-pipe-response')) document.getElementById('disp-pipe-response').value = state.responseTimeS.toFixed(2);
            }

            if (component instanceof FonteLogica) {
                if (document.getElementById('disp-vazao-fonte'))
                    document.getElementById('disp-vazao-fonte').value = component.fluxoReal.toFixed(2);
            }

            if (component instanceof DrenoLogico) {
                if (document.getElementById('disp-vazao-dreno'))
                    document.getElementById('disp-vazao-dreno').value = component.vazaoRecebidaLps.toFixed(2);
            }

            if (component instanceof TanqueLogico) {
                if (document.getElementById('input-volume-tanque') && document.activeElement !== document.getElementById('input-volume-tanque')) {
                    document.getElementById('input-volume-tanque').value = component.volumeAtual.toFixed(1);
                }
                if (document.getElementById('disp-pressao-tanque')) document.getElementById('disp-pressao-tanque').value = component.pressaoFundoBar.toFixed(2);
                if (document.getElementById('disp-nivel-tanque')) document.getElementById('disp-nivel-tanque').value = component.getAlturaLiquidoM().toFixed(2);
                if (document.getElementById('disp-qin-tanque')) document.getElementById('disp-qin-tanque').value = component.lastQin.toFixed(2);
                if (document.getElementById('disp-qout-tanque')) document.getElementById('disp-qout-tanque').value = component.lastQout.toFixed(2);
            }

            if (component instanceof ValvulaLogica) {
                const abEl = document.getElementById('input-abertura');
                const numInput = document.getElementById('val-abertura');
                if (abEl && document.activeElement !== numInput && document.activeElement !== abEl) {
                    abEl.value = Math.round(component.grauAbertura);
                    if (numInput) numInput.value = Math.round(component.grauAbertura);
                }
                if (document.getElementById('disp-abertura-efetiva-valvula')) document.getElementById('disp-abertura-efetiva-valvula').value = component.aberturaEfetiva.toFixed(1);
                if (document.getElementById('disp-vazao-valvula')) document.getElementById('disp-vazao-valvula').value = component.fluxoReal.toFixed(2);
                if (document.getElementById('disp-deltap-valvula')) document.getElementById('disp-deltap-valvula').value = component.deltaPAtualBar.toFixed(2);
            }

            if (component instanceof BombaLogica) {
                const acEl = document.getElementById('input-acionamento');
                const numInput = document.getElementById('val-acionamento');
                if (acEl && document.activeElement !== numInput && document.activeElement !== acEl) {
                    acEl.value = Math.round(component.grauAcionamento);
                    if (numInput) numInput.value = Math.round(component.grauAcionamento);
                }
                if (document.getElementById('disp-acionamento-real-bomba')) document.getElementById('disp-acionamento-real-bomba').value = component.acionamentoEfetivo.toFixed(1);
                if (document.getElementById('disp-vazao-bomba')) document.getElementById('disp-vazao-bomba').value = component.fluxoReal.toFixed(2);
                if (document.getElementById('disp-succao-bomba')) document.getElementById('disp-succao-bomba').value = component.pressaoSucaoAtualBar.toFixed(2);
                if (document.getElementById('disp-descarga-bomba')) document.getElementById('disp-descarga-bomba').value = component.pressaoDescargaAtualBar.toFixed(2);
                if (document.getElementById('disp-cavitacao-bomba')) document.getElementById('disp-cavitacao-bomba').value = (component.fatorCavitacaoAtual * 100).toFixed(0) + '%';
                if (document.getElementById('disp-npsh-bomba')) document.getElementById('disp-npsh-bomba').value = component.npshDisponivelM.toFixed(2);
                if (document.getElementById('disp-eficiencia-bomba')) document.getElementById('disp-eficiencia-bomba').value = (component.eficienciaAtual * 100).toFixed(0) + '%';
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

    ENGINE.selectComponent(null);
}

export function updatePipesVisualUI() {
    ENGINE.updatePipesVisual();
}
