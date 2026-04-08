// ====================================
// CONTROLLER: Interface e Propriedades
// Ficheiro: js/controllers/UIController.js
// ====================================

import { ENGINE, TanqueLogico, BombaLogica, ValvulaLogica, FonteLogica, DrenoLogico } from '../MotorFisico.js'
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
        btnMaxChart.textContent = isMax ? "✖ Fechar" : "⛶ Expandir";
        chartMaxHeader.style.display = isMax ? "flex" : "none";
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
                        title: ctx => 'Tempo: ' + ctx[0].label + 's',
                        label: ctx => 'Volume: ' + ctx.parsed.y.toFixed(1) + ' Litros'
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

function setupSubscriptions() {
    const propContent = document.getElementById('prop-content');
    const workspaceContainer = document.getElementById('workspace');
    const workspaceCanvas = document.getElementById('workspace-canvas');

    // Clique no workspace sem componentes
    document.getElementById('workspace').addEventListener('mousedown', (e) => {
        if (e.target === workspaceContainer || e.target === workspaceCanvas || e.target.id === 'pipe-layer') {
            ENGINE.selectComponent(null);
            document.querySelectorAll('.placed-component').forEach(el => el.classList.remove('selected'));
            document.querySelectorAll('.pipe-line').forEach(el => {
                el.classList.remove('selected');
                // Restaurar marker para o estado anterior (cinza ou azul dependendo do fluxo)
                if (el.classList.contains('active')) {
                    el.setAttribute("marker-end", "url(#arrow-active)");
                } else {
                    el.setAttribute("marker-end", "url(#arrow)");
                }
            });
        }
    });

    // Subscrição do ENGINE
    ENGINE.subscribe((dados) => {
        if (dados.tipo === 'selecao') {
            const component_data = dados.componente;

            if (component_data instanceof TanqueLogico) {
                if (chartedTankId !== component_data.id) {
                    chartedTankId = component_data.id;
                    volumeChart.data.labels = [Math.round(ENGINE.elapsedTime)];
                    volumeChart.data.datasets[0].data = [component_data.volumeAtual];
                    volumeChart.data.datasets[0].label = `Volume: ${component_data.tag}`;
                    volumeChart.update();
                }
            } else {
                chartedTankId = null;
                volumeChart.data.labels = [Math.round(ENGINE.elapsedTime)];
                volumeChart.data.datasets[0].data = [0];
                volumeChart.data.datasets[0].label = 'Selecione um Tanque';
                volumeChart.update();
            }

            if (!component_data) {
                propContent.innerHTML = `
                    <div class="prop-group">
                        <label>Velocidade da Simulação</label>
                        <select id="sel-vel">
                            <option value="1">1x (Tempo Real)</option>
                            <option value="2">2x (Acelerado)</option>
                            <option value="5">5x (Rápido)</option>
                        </select>
                    </div>
                    <p style="font-size: 12px; color:#95a5a6; text-align:center;">Para ver as propriedades de um componente, clique nele.</p>
                `;
                document.getElementById('sel-vel').value = ENGINE.velocidade;
                document.getElementById('sel-vel').addEventListener('change', e => ENGINE.velocidade = parseFloat(e.target.value));
                return;
            }

            let tipoChave = 'source';
            if (component_data instanceof DrenoLogico) tipoChave = 'sink';
            else if (component_data instanceof BombaLogica) tipoChave = 'pump';
            else if (component_data instanceof ValvulaLogica) tipoChave = 'valve';
            else if (component_data instanceof TanqueLogico) tipoChave = 'tank';

            const spec = REGISTRO_COMPONENTES[tipoChave];

            propContent.innerHTML = `
                <div class="prop-group">
                    <label>Tag (Nome)</label>
                    <input type="text" id="input-tag" value="${component_data.tag}">
                </div>
                ${spec.propriedadesAdicionais(component_data)}
            `;

            document.getElementById('input-tag').addEventListener('input', e => {
                component_data.tag = e.target.value;
                component_data.notify({ tipo: 'tag_update' });
            });
            if (spec.setupProps) spec.setupProps(component_data);
        } else if (dados.tipo === 'update_painel') {
            const component = ENGINE.selectedComponent;

            if (component instanceof FonteLogica) {
                if (document.getElementById('disp-vazao-fonte'))
                    document.getElementById('disp-vazao-fonte').value = component.fluxoReal.toFixed(2);
            }

            if (component instanceof DrenoLogico) {
                if (document.getElementById('disp-vazao-dreno'))
                    document.getElementById('disp-vazao-dreno').value = component.vazaoRecebidaLps.toFixed(2);
            }

            if (component instanceof TanqueLogico) {
                if (document.getElementById('disp-vol'))
                    document.getElementById('disp-vol').value = component.volumeAtual.toFixed(1);
                if (document.getElementById('disp-pressao-tanque'))
                    document.getElementById('disp-pressao-tanque').value = component.pressaoFundoBar.toFixed(2);
                if (document.getElementById('disp-qin-tanque'))
                    document.getElementById('disp-qin-tanque').value = component.lastQin.toFixed(2);
                if (document.getElementById('disp-qout-tanque'))
                    document.getElementById('disp-qout-tanque').value = component.lastQout.toFixed(2);
            }

            if (component instanceof ValvulaLogica) {
                const abEl = document.getElementById('input-abertura');
                const numInput = document.getElementById('val-abertura');
                if (abEl && document.activeElement !== numInput && document.activeElement !== abEl) {
                    abEl.value = Math.round(component.grauAbertura);
                    if (numInput) numInput.value = Math.round(component.grauAbertura);
                }
                if (document.getElementById('disp-vazao-valvula'))
                    document.getElementById('disp-vazao-valvula').value = component.fluxoReal.toFixed(2);
                if (document.getElementById('disp-deltap-valvula'))
                    document.getElementById('disp-deltap-valvula').value = component.deltaPAtualBar.toFixed(2);
            }

            if (component instanceof BombaLogica) {
                const acEl = document.getElementById('input-acionamento');
                const numInput = document.getElementById('val-acionamento');
                if (acEl && document.activeElement !== numInput && document.activeElement !== acEl) {
                    acEl.value = Math.round(component.grauAcionamento);
                    if (numInput) numInput.value = Math.round(component.grauAcionamento);
                }
                if (document.getElementById('disp-vazao-bomba'))
                    document.getElementById('disp-vazao-bomba').value = component.fluxoReal.toFixed(2);
                if (document.getElementById('disp-succao-bomba'))
                    document.getElementById('disp-succao-bomba').value = component.pressaoSucaoAtualBar.toFixed(2);
                if (document.getElementById('disp-descarga-bomba'))
                    document.getElementById('disp-descarga-bomba').value = component.pressaoDescargaAtualBar.toFixed(2);
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
    ENGINE.conexoes.forEach(conn => {
        const sourceLogic = ENGINE.componentes.find(c => c.id === conn.sourceEl.dataset.compId);
        let flow = 0;
        if (sourceLogic && ENGINE.isRunning) {
            if (sourceLogic instanceof TanqueLogico)
                flow = sourceLogic.volumeAtual > 0 ? 1 : 0;
            else if (sourceLogic.fluxoReal !== undefined)
                flow = sourceLogic.fluxoReal;
            else if (sourceLogic instanceof FonteLogica)
                flow = 1;
        }

        if (flow > 0.1) {
            conn.path.classList.add('active');
            // Não alterar marker se o pipe estiver selecionado
            if (!conn.path.classList.contains('selected')) {
                conn.path.setAttribute("marker-end", "url(#arrow-active)");
            }
        } else {
            conn.path.classList.remove('active');
            // Não alterar marker se o pipe estiver selecionado
            if (!conn.path.classList.contains('selected')) {
                conn.path.setAttribute("marker-end", "url(#arrow)");
            }
        }

        if (conn.label) {
            const flowVal = getConnectionFlow(conn);
            if (flowVal === null || flowVal === undefined) {
                conn.label.textContent = '';
            } else if (flowVal === Infinity) {
                conn.label.textContent = '∞ L/s';
            } else {
                conn.label.textContent = flowVal.toFixed(1) + ' L/s';
            }
        }
    });

    if (ENGINE.isRunning) {
        ENGINE.componentes.forEach(c => {
            if (c instanceof TanqueLogico && c.setpointAtivo) {
                const notificarEstado = (equipamento) => {
                    if (equipamento instanceof ValvulaLogica)
                        equipamento.notify({ tipo: 'estado', aberta: equipamento.aberta, grau: equipamento.grauAbertura });
                    else if (equipamento instanceof BombaLogica)
                        equipamento.notify({ tipo: 'estado', isOn: equipamento.isOn, grau: equipamento.grauAcionamento });
                };
                c.inputs.forEach(notificarEstado);
                c.outputs.forEach(notificarEstado);
            }
        });
    }
}
