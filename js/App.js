// =============================================
// CONTROLLER MAIN: Interface, Câmara e Ligações
// Ficheiro: js/App.js
// =============================================

const GRID_SIZE = 40; /* Tamanho da grade de fundo para alinhamento dos componentes */

// ==========================================
// 1. UX DOS PAINÉIS E MAXIMIZAÇÃO DO GRÁFICO
// ==========================================
const toggleLeft = document.getElementById('toggle-left'); /* Botão para colapsar/expandir o painel esquerdo (paleta) */
const panelLeft = document.getElementById('palette'); /* Painel esquerdo que contém a paleta de componentes */
toggleLeft.addEventListener('click', () => /* Evento de clique para colapsar ou expandir o painel esquerdo */ {
    const isCollapsed = panelLeft.classList.toggle('collapsed');
    toggleLeft.classList.toggle('collapsed');
    toggleLeft.textContent = isCollapsed ? '▶' : '◀';
});

const toggleRight = document.getElementById('toggle-right'); /* Botão para colapsar/expandir o painel direito (propriedades) */
const panelRight = document.getElementById('properties'); /* Painel direito que contém as propriedades dos componentes */
toggleRight.addEventListener('click', () => /* Evento de clique para colapsar ou expandir o painel direito */ {
    const isCollapsed = panelRight.classList.toggle('collapsed');
    toggleRight.classList.toggle('collapsed');
    toggleRight.textContent = isCollapsed ? '◀' : '▶';
});

const btnMaxChart = document.getElementById('btn-max-chart'); /* Botão para maximizar o gráfico */
const chartWrapper = document.getElementById('chart-wrapper'); /* Container que envolve o gráfico de monitoramento */
const chartMaxHeader = document.getElementById('chart-max-header'); /* Cabeçalho do gráfico maximizado */
const btnCloseMaxChart = document.getElementById('btn-close-max-chart'); /* Botão para fechar o gráfico maximizado */
let volumeChart;  /* Variável para armazenar a instância do gráfico de volume, permitindo redimensionamento quando maximizado */

function toggleChartMaximize() /* Função para alternar entre o estado maximizado e normal do gráfico de monitoramento */ {
    const isMax = chartWrapper.classList.toggle('maximized');
    btnMaxChart.textContent = isMax ? "✖ Fechar" : "⛶ Expandir";
    chartMaxHeader.style.display = isMax ? "flex" : "none";
    if (volumeChart) volumeChart.resize();
}

btnMaxChart.addEventListener('click', toggleChartMaximize); /* Evento de clique para maximizar o gráfico */
btnCloseMaxChart.addEventListener('click', toggleChartMaximize);/* Evento de clique para fechar o gráfico maximizado */

if (window.innerWidth > 800) /* Se a largura da janela for maior que 800px, os painéis começam expandidos por padrão */ {
    panelLeft.classList.remove('collapsed');
    toggleLeft.classList.remove('collapsed');
    toggleLeft.textContent = '◀';

    panelRight.classList.remove('collapsed');
    toggleRight.classList.remove('collapsed');
    toggleRight.textContent = '▶';
}

// ==================================
// 2. NAVEGAÇÃO ESPACIAL (ZOOM E PAN)
// ==================================
const workspaceContainer = document.getElementById('workspace');/* Container principal do workspace onde os componentes são colocados e onde o usuário pode navegar com zoom e pan. */
const workspaceCanvas = document.getElementById('workspace-canvas');/* Canvas onde os componentes são desenhados. */

const camera = { scale: 1, x: 0, y: 0, isPanning: false, startX: 0, startY: 0 };
let spacePressed = false;

document.addEventListener('keydown', e => { if (e.code === 'Space' && e.target.tagName !== 'INPUT') spacePressed = true; });
document.addEventListener('keyup', e => { if (e.code === 'Space') spacePressed = false; });

workspaceContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const direction = Math.sign(e.deltaY) > 0 ? -1 : 1;
    let newScale = camera.scale + (direction * zoomIntensity);
    newScale = Math.max(0.4, Math.min(newScale, 3));

    const rect = workspaceContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    camera.x = mouseX - ((mouseX - camera.x) * (newScale / camera.scale));
    camera.y = mouseY - ((mouseY - camera.y) * (newScale / camera.scale));
    camera.scale = newScale;
    updateCameraTransform();
});

workspaceContainer.addEventListener('mousedown', (e) => {
    if (e.button === 1 || spacePressed) {
        e.preventDefault();
        camera.isPanning = true;
        camera.startX = e.clientX - camera.x;
        camera.startY = e.clientY - camera.y;
        workspaceContainer.style.cursor = 'grabbing';
    }
});

window.addEventListener('mousemove', (e) => {
    if (!camera.isPanning) return;
    camera.x = e.clientX - camera.startX;
    camera.y = e.clientY - camera.startY;
    updateCameraTransform();
});

window.addEventListener('mouseup', () => {
    camera.isPanning = false;
    workspaceContainer.style.cursor = 'default';
});

/* A função updateCameraTransform é responsável por atualizar a posição e o zoom do workspace
com base nas propriedades da câmera.
Ela ajusta a posição de fundo para criar o efeito de grade,
redimensiona o fundo para manter a consistência da grade durante o zoom,
e aplica uma transformação CSS ao canvas para refletir a posição e o zoom atuais. */
function updateCameraTransform() {
    workspaceContainer.style.backgroundPosition = `${camera.x}px ${camera.y}px`;
    workspaceContainer.style.backgroundSize = `${40 * camera.scale}px ${40 * camera.scale}px`;
    workspaceCanvas.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
}


// ========================================
// 3. UI, CHART.JS E PAINEL DE PROPRIEDADES
// ========================================
/* Esta seção é responsável por configurar a interface do usuário,
       incluindo o painel de propriedades e o gráfico de volume.*/

const propContent = document.getElementById('prop-content');

const ctx = document.getElementById('gaap-volume-chart').getContext('2d');
/* O gráfico de volume é configurado para exibir o volume do tanque ao longo do tempo. 
Ele é inicialmente configurado com um único ponto e atualizado dinamicamente quando um tanque é selecionado.
As opções do gráfico incluem tooltips personalizados para mostrar o tempo e o volume, 
e escalas adequadas para representar os dados de forma clara. */
volumeChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [0],
        datasets: [{
            label: 'Selecione um Tanque', data: [0], borderColor: '#3498db', backgroundColor: 'rgba(52, 152, 219, 0.2)', borderWidth: 2, fill: true, pointRadius: 0, pointHoverRadius: 6, hitRadius: 15, tension: 0.1
        }]
    },
    options: {
        responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
        plugins: {
            tooltip: {
                backgroundColor: 'rgba(44, 62, 80, 0.9)', titleFont: { size: 14 }, bodyFont: { size: 14, weight: 'bold' }, padding: 10,
                callbacks: { title: ctx => 'Tempo: ' + ctx[0].label + 's', label: ctx => 'Volume: ' + ctx.parsed.y.toFixed(1) + ' Litros' }
            }
        },
        scales: { x: { title: { display: true, text: 'Tempo (s)' } }, y: { min: 0, max: 1000, title: { display: true, text: 'Volume (L)' } } }
    }
});

let chartUpdateTimer = 0;
let chartedTankId = null;

document.getElementById('workspace').addEventListener('mousedown', (e) => {
    if (e.target === workspaceContainer || e.target === workspaceCanvas || e.target.id === 'pipe-layer') {
        ENGINE.selectComponent(null);
        document.querySelectorAll('.placed-component').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.pipe-line').forEach(el => el.classList.remove('selected'));
    }
});

        /* O ENGINE.subscribe é utilizado para escutar eventos relacionados à seleção de componentes e atualizações do painel.
        Quando um componente é selecionado, o painel de propriedades é atualizado para mostrar as informações relevantes*/BombaLogica
ENGINE.subscribe((dados) => {
    if (dados.tipo === 'selecao') {
        const comp = dados.componente;

        if (comp instanceof TanqueLogico) {
            if (chartedTankId !== comp.id) {
                chartedTankId = comp.id;
                volumeChart.data.labels = [Math.round(ENGINE.elapsedTime)];
                volumeChart.data.datasets[0].data = [comp.volumeAtual];
                volumeChart.data.datasets[0].label = `Volume: ${comp.tag}`;
                volumeChart.update();
            }
        } else {
            chartedTankId = null;
            volumeChart.data.labels = [Math.round(ENGINE.elapsedTime)];
            volumeChart.data.datasets[0].data = [0];
            volumeChart.data.datasets[0].label = 'Selecione um Tanque';
            volumeChart.update();
        }

        if (!comp) {
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

        const tipoMap = { [FonteLogica.name]: 'source', [DrenoLogico.name]: 'sink', [BombaLogica.name]: 'pump', [ValvulaLogica.name]: 'valve', [TanqueLogico.name]: 'tank' };
        const spec = REGISTRO_COMPONENTES[tipoMap[comp.constructor.name]];

        propContent.innerHTML = `
                    <div class="prop-group">
                        <label>Tag (Nome)</label>
                        <input type="text" id="input-tag" value="${comp.tag}">
                    </div>
                    ${spec.propriedadesAdicionais(comp)}
                `;

        document.getElementById('input-tag').addEventListener('input', e => { comp.tag = e.target.value; comp.notify({ tipo: 'tag_update' }); });
        if (spec.setupProps) spec.setupProps(comp);
    }
    else if (dados.tipo === 'update_painel') {
        const comp = ENGINE.selectedComponent;

        if (comp instanceof TanqueLogico && document.getElementById('disp-vol')) document.getElementById('disp-vol').value = comp.volumeAtual.toFixed(1);

        if (comp instanceof ValvulaLogica) {
            const abEl = document.getElementById('input-abertura');
            const numInput = document.getElementById('val-abertura');
            if (abEl && document.activeElement !== numInput && document.activeElement !== abEl) {
                abEl.value = Math.round(comp.grauAbertura);
                if (numInput) numInput.value = Math.round(comp.grauAbertura);
            }
            if (document.getElementById('disp-vazao-valvula')) document.getElementById('disp-vazao-valvula').value = comp.fluxoReal.toFixed(2);
        }

        if (comp instanceof BombaLogica) {
            const acEl = document.getElementById('input-acionamento');
            const numInput = document.getElementById('val-acionamento');
            if (acEl && document.activeElement !== numInput && document.activeElement !== acEl) {
                acEl.value = Math.round(comp.grauAcionamento);
                if (numInput) numInput.value = Math.round(comp.grauAcionamento);
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

/* O ENGINE.selectComponent(null) é chamado para garantir que nenhum componente esteja selecionado inicialmente quando a aplicação é carregada.*/
ENGINE.selectComponent(null);

// ==========================
// 4. MOTOR VETORIAL DE TUBOS
// ==========================
/* Esta seção implementa a funcionalidade de arrastar e soltar para criar conexões entre os componentes usando tubos SVG.
Ela inclui funções para calcular as coordenadas das portas, desenhar curvas de Bézier para os tubos
e atualizar as conexões dinamicamente à medida que os componentes são movidos. */

const pipeLayer = document.getElementById('pipe-layer');
let tempPipe = null;
let dragSourcePort = null;

/* A função getPortCoords calcula as coordenadas centrais de uma porta específicaem relação ao canvas de trabalho.
Ela leva em consideração a posição da porta na tela e a escala atual da câmera
para garantir que os tubos sejam desenhados corretamente entre os componentes,
mesmo quando a visualização é ampliada ou reduzida. */
function getPortCoords(portEl) {
    const rect = portEl.getBoundingClientRect();
    const canvasRect = workspaceCanvas.getBoundingClientRect();
    return {
        x: (rect.left + (rect.width / 2) - canvasRect.left) / camera.scale,
        y: (rect.top + (rect.height / 2) - canvasRect.top) / camera.scale
    };
}

/* A função drawCurve gera um caminho SVG para uma curva de Bézier cúbica entre dois pontos.
Ela calcula um ponto de controle intermediário para criar uma curva suave
que se afasta dos pontos de conexão, melhorando a estética visual dos tubos entre os componentes. */
function drawCurve(x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1) * 0.5;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

/* A função getConnectionFlow é responsável por determinar o fluxo atual em uma conexão específica entre dois componentes.
Ela analisa os componentes de origem e destino da conexão, verifica seus tipos e estados atuais para calcular o fluxo real que está passando pela conexão.
Isso é crucial para atualizar as etiquetas de fluxo nos tubos e fornecer feedback visual preciso sobre o estado do sistema. */
function getConnectionFlow(conn) {
    const sourceLogic = ENGINE.componentes.find(c => c.id === conn.sourceEl.dataset.compId);
    const targetLogic = ENGINE.componentes.find(c => c.id === conn.targetEl.dataset.compId);
    if (!sourceLogic || !ENGINE.isRunning) return null;
    if (sourceLogic instanceof FonteLogica) return Infinity;
    if (sourceLogic instanceof BombaLogica || sourceLogic instanceof ValvulaLogica) return sourceLogic.fluxoReal || 0;
    if (sourceLogic instanceof TanqueLogico) {
        const nv = sourceLogic.capacidadeMaxima > 0 ? sourceLogic.volumeAtual / sourceLogic.capacidadeMaxima : 0;
        if (targetLogic && typeof targetLogic.getFluxoSaidaFromTank === 'function') return targetLogic.getFluxoSaidaFromTank(nv > 0 ? nv : 0);
        return sourceLogic.getFluxoSaida();
    }
    return 0;
}

/* A função updateAllPipes percorre todas as conexões ativas no sistema
e atualiza a posição e o caminho de cada tubo SVG para refletir as posições atuais dos componentes conectados.
Ela também atualiza as etiquetas de fluxo associadas a cada conexão, 
garantindo que as informações exibidas sejam precisas e correspondam ao estado atual do sistema. 
Esta função é chamada sempre que um componente é movido ou quando o fluxo em uma conexão muda,
mantendo a interface visual consistente e informativa. */
function updateAllPipes() {
    ENGINE.conexoes.forEach(conn => {
        const p1 = getPortCoords(conn.sourceEl);
        const p2 = getPortCoords(conn.targetEl);
        conn.path.setAttribute('d', drawCurve(p1.x, p1.y, p2.x, p2.y));
        if (conn.label) {
            conn.label.setAttribute('x', (p1.x + p2.x) / 2);
            conn.label.setAttribute('y', (p1.y + p2.y) / 2 - 10);
        }
    });
}

workspaceContainer.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('port-node') && e.target.dataset.type === 'out') {
        dragSourcePort = e.target;
        const p1 = getPortCoords(dragSourcePort);
        tempPipe = document.createElementNS("http://www.w3.org/2000/svg", "path");
        tempPipe.setAttribute("class", "pipe-line " + (ENGINE.isRunning ? "active" : ""));
        tempPipe.setAttribute("marker-end", "url(#arrow)");
        tempPipe.setAttribute("d", drawCurve(p1.x, p1.y, p1.x, p1.y));
        pipeLayer.appendChild(tempPipe);
        e.stopPropagation();
    }
});

workspaceContainer.addEventListener('mousemove', (e) => {
    if (tempPipe && dragSourcePort) {
        const p1 = getPortCoords(dragSourcePort);
        const canvasRect = workspaceCanvas.getBoundingClientRect();
        const mouseX = (e.clientX - canvasRect.left) / camera.scale;
        const mouseY = (e.clientY - canvasRect.top) / camera.scale;
        tempPipe.setAttribute("d", drawCurve(p1.x, p1.y, mouseX, mouseY));
    }
});

window.addEventListener('mouseup', (e) => {
    if (tempPipe) {
        let dropTarget = e.target;
        if (dropTarget.classList.contains('port-node') && dropTarget.dataset.type === 'in') {
            const sourceLogic = ENGINE.componentes.find(c => c.id === dragSourcePort.dataset.compId);
            const targetLogic = ENGINE.componentes.find(c => c.id === dropTarget.dataset.compId);

            if (sourceLogic && targetLogic && sourceLogic !== targetLogic) {
                sourceLogic.conectarSaida(targetLogic);
                const finalPipe = tempPipe;

                const labelEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
                labelEl.setAttribute("class", "pipe-flow-label");
                labelEl.setAttribute("text-anchor", "middle");
                pipeLayer.appendChild(labelEl);

                finalPipe.addEventListener('mousedown', function (ev) {
                    ENGINE.selectComponent(null);
                    document.querySelectorAll('.placed-component').forEach(el => el.classList.remove('selected'));
                    document.querySelectorAll('.pipe-line').forEach(el => el.classList.remove('selected'));
                    this.classList.add('selected');
                    ev.stopPropagation();
                });

                finalPipe.addEventListener('dblclick', function (ev) {
                    sourceLogic.desconectarSaida(targetLogic);
                    const ci = ENGINE.conexoes.findIndex(c => c.path === finalPipe);
                    if (ci !== -1) {
                        if (ENGINE.conexoes[ci].label) ENGINE.conexoes[ci].label.remove();
                        ENGINE.conexoes.splice(ci, 1);
                    }
                    finalPipe.remove();
                    updatePortStates();
                    ev.stopPropagation();
                });

                ENGINE.conexoes.push({ sourceEl: dragSourcePort, targetEl: dropTarget, path: finalPipe, label: labelEl });
                updateAllPipes();
                updatePortStates();
            } else { tempPipe.remove(); }
        } else { tempPipe.remove(); }
        tempPipe = null; dragSourcePort = null;
    }
});

// ===============================
// 5. DRAG AND DROP E MOVIMENTAÇÃO
// ===============================
/* Esta seção implementa a funcionalidade de arrastar e soltar para adicionar novos componentes ao workspace,
bem como a capacidade de mover os componentes já colocados. Ela inclui a configuração dos eventos de drag and drop para os itens da paleta,
a lógica para calcular as posições de drop com base na escala da câmera e o grid snapping para facilitar o alinhamento dos componentes. 
Além disso, a função makeDraggable é responsável por tornar os componentes movíveis dentro do workspace, 
permitindo que os usuários reorganizem seus layouts conforme necessário. */

document.querySelectorAll('.palette-item').forEach(item => {
    const t = item.getAttribute('data-type');

    item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', t);
        const icon = item.querySelector('.palette-icon');
        if (icon) {
            e.dataTransfer.setDragImage(icon, 30, 30);
        }
    });
});

workspaceContainer.addEventListener('dragover', e => e.preventDefault());
workspaceContainer.addEventListener('drop', e => {
    e.preventDefault();
    const t = e.dataTransfer.getData('text/plain');
    if (!t) return;

    const spec = REGISTRO_COMPONENTES[t];
    if (!spec) return;

    const canvasRect = workspaceCanvas.getBoundingClientRect();

    let dropX = (e.clientX - canvasRect.left) / camera.scale - (spec.w / 2);
    let dropY = (e.clientY - canvasRect.top) / camera.scale - (spec.h / 2);

    const snapX = Math.round(dropX / GRID_SIZE) * GRID_SIZE;
    const snapY = Math.round(dropY / GRID_SIZE) * GRID_SIZE;

    const novoVisual = FabricaDeEquipamentos.criar(t, snapX, snapY);
    workspaceCanvas.appendChild(novoVisual);
    makeDraggable(novoVisual);

    updatePortStates();
});

/* A função makeDraggable é responsável por adicionar a funcionalidade de arrastar e soltar a um elemento específico.
Ela gerencia o estado de arrasto, calcula as novas posições com base no movimento do mouse
e aplica o grid snapping para garantir que os componentes se alinhem corretamente no workspace.
Além disso, quando o arrasto é concluído, a função atualiza as coordenadas lógicas do componente para refletir sua nova posição,
garantindo que a simulação funcione corretamente com os componentes movidos. */
function makeDraggable(element) {
    let isDragging = false, startX, startY, initX, initY;
    element.addEventListener('mousedown', e => {
        if (e.target.classList.contains('port-node')) return;
        isDragging = true; startX = e.clientX; startY = e.clientY;
        initX = parseInt(element.style.left); initY = parseInt(element.style.top);
    });
    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        const newX = initX + (e.clientX - startX) / camera.scale;
        const newY = initY + (e.clientY - startY) / camera.scale;

        element.style.left = `${Math.round(newX / GRID_SIZE) * GRID_SIZE}px`;
        element.style.top = `${Math.round(newY / GRID_SIZE) * GRID_SIZE}px`;
        updateAllPipes();
    });
    document.addEventListener('mouseup', () => {
        if (isDragging) { isDragging = false; element.logica.x = parseInt(element.style.left); element.logica.y = parseInt(element.style.top); }
    });
}

/* Chamada para atualizar o estado das portas*/
updatePortStates();

// ==========================================
// 6. CONTROLES GERAIS
// ==========================================
/* Esta seção implementa os controles gerais para iniciar, pausar e limpar a simulação.
O botão de iniciar/pausar alterna o estado do motor de simulação e atualiza seu texto e estilo para refletir a ação atual.
O botão de limpar remove todos os componentes do workspace e reseta o estado do motor.
Além disso, um listener de teclado é adicionado para permitir a exclusão rápida de componentes selecionados usando as teclas Delete ou Backspace,
melhorando a usabilidade da interface. */

const btnRun = document.getElementById('btn-run');
btnRun.addEventListener('click', () => {
    if (ENGINE.isRunning) {
        ENGINE.stop();
        btnRun.innerHTML = "▶ Iniciar Simulação Física";
        btnRun.style.background = "#2ecc71";
        btnRun.style.borderColor = "#27ae60";
    } else {
        ENGINE.start();
        btnRun.innerHTML = "⏸ Pausar Simulação";
        btnRun.style.background = "#e74c3c";
        btnRun.style.borderColor = "#c0392b";
    }
});

document.getElementById('btn-clear').addEventListener('click', () => {
    document.querySelectorAll('#workspace-canvas .placed-component').forEach(item => item.remove());
    ENGINE.clear();
});

document.addEventListener('keydown', (e) => {
    if (e.target.tagName.toLowerCase() === 'input') return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
        const selectedCompDiv = document.querySelector('.placed-component.selected');
        if (selectedCompDiv) {
            const compId = selectedCompDiv.dataset.id;
            ENGINE.conexoes = ENGINE.conexoes.filter(conn => {
                if (conn.sourceEl.dataset.compId === compId || conn.targetEl.dataset.compId === compId) {
                    const src = ENGINE.componentes.find(c => c.id === conn.sourceEl.dataset.compId);
                    const tgt = ENGINE.componentes.find(c => c.id === conn.targetEl.dataset.compId);
                    if (src && tgt) src.desconectarSaida(tgt);
                    if (conn.label) conn.label.remove();
                    conn.path.remove();
                    return false;
                }
                return true;
            });
            ENGINE.componentes = ENGINE.componentes.filter(c => c.id !== compId);
            selectedCompDiv.remove();
            ENGINE.selectComponent(null);
            updatePortStates();
        }

        const selectedPipe = document.querySelector('.pipe-line.selected');
        if (selectedPipe) {
            const connIndex = ENGINE.conexoes.findIndex(c => c.path === selectedPipe);
            if (connIndex !== -1) {
                const conn = ENGINE.conexoes[connIndex];
                const src = ENGINE.componentes.find(c => c.id === conn.sourceEl.dataset.compId);
                const tgt = ENGINE.componentes.find(c => c.id === conn.targetEl.dataset.compId);
                if (src && tgt) src.desconectarSaida(tgt);
                if (conn.label) conn.label.remove();
                ENGINE.conexoes.splice(connIndex, 1);
                selectedPipe.remove();
                updatePortStates();
            }
        }
    }
});
