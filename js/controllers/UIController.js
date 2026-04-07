// ====================================
// CONTROLLER: Interface e Propriedades
// Ficheiro: js/controllers/UIController.js
// ====================================

import { ENGINE, TanqueLogico, BombaLogica, ValvulaLogica, DrenoLogico } from '../MotorFisico.js'
import { REGISTRO_COMPONENTES } from '../RegistroComponentes.js'

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

            if (component instanceof TanqueLogico && document.getElementById('disp-vol'))
                document.getElementById('disp-vol').value = component.volumeAtual.toFixed(1);

            if (component instanceof ValvulaLogica) {
                const abEl = document.getElementById('input-abertura');
                const numInput = document.getElementById('val-abertura');
                if (abEl && document.activeElement !== numInput && document.activeElement !== abEl) {
                    abEl.value = Math.round(component.grauAbertura);
                    if (numInput) numInput.value = Math.round(component.grauAbertura);
                }
                if (document.getElementById('disp-vazao-valvula'))
                    document.getElementById('disp-vazao-valvula').value = component.fluxoReal.toFixed(2);
            }

            if (component instanceof BombaLogica) {
                const acEl = document.getElementById('input-acionamento');
                const numInput = document.getElementById('val-acionamento');
                if (acEl && document.activeElement !== numInput && document.activeElement !== acEl) {
                    acEl.value = Math.round(component.grauAcionamento);
                    if (numInput) numInput.value = Math.round(component.grauAcionamento);
                }
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
