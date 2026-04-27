// =========================================
// CONTROLLER: Motor Vetorial de Tubos
// Ficheiro: js/controllers/PipeController.js
// =========================================

import { ENGINE } from '../MotorFisico.js';
import { camera } from './CameraController.js';
import { updatePortStates } from '../utils/PortStateManager.js';
import {
    DEFAULT_PIPE_DIAMETER_M,
    DEFAULT_PIPE_EXTRA_LENGTH_M,
    DEFAULT_PIPE_MINOR_LOSS,
    DEFAULT_PIPE_ROUGHNESS_MM
} from '../utils/Units.js';

const pipeLayer = document.getElementById('pipe-layer');
let tempPipe = null;
let dragSourcePort = null;

function validarControleNivelDosComponentes(...componentes) {
    componentes.forEach((componente) => {
        if (typeof componente?.garantirConsistenciaControleNivel === 'function') {
            componente.garantirConsistenciaControleNivel();
        }
    });
}

export function getPortCoords(portEl) {
    const rect = portEl.getBoundingClientRect();
    const canvasRect = document.getElementById('workspace-canvas').getBoundingClientRect();
    return {
        x: (rect.left + (rect.width / 2) - canvasRect.left) / camera.scale,
        y: (rect.top + (rect.height / 2) - canvasRect.top) / camera.scale
    };
}

export function drawCurve(x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1) * 0.5;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export function getConnectionFlow(conn) {
    if (!ENGINE.isRunning) return null;

    const state = ENGINE.getConnectionState(conn);
    if (!state || state.flowLps <= 0.0001) return 0;
    return state.flowLps;
}

export function updateAllPipes() {
    ENGINE.conexoes.forEach(conn => {
        const p1 = getPortCoords(conn.sourceEl);
        const p2 = getPortCoords(conn.targetEl);
        conn.path.setAttribute('d', drawCurve(p1.x, p1.y, p2.x, p2.y));

        if (conn.label) {
            conn.label.setAttribute('x', (p1.x + p2.x) / 2);
            conn.label.setAttribute('y', (p1.y + p2.y) / 2 - 10);
        }

        // Atualiza a posição e o texto da diferença de cota.
        if (conn.labelHeight) {
            conn.labelHeight.setAttribute('x', (p1.x + p2.x) / 2);
            conn.labelHeight.setAttribute('y', (p1.y + p2.y) / 2 + 15); // 15px abaixo do meio

            if (ENGINE.usarAlturaRelativa) {
                const geom = ENGINE.getConnectionGeometry(conn);
                const dy = geom.headGainM;

                // Exibir apenas se houver desnível significativo
                if (Math.abs(dy) > 0.01) {
                    const signal = dy > 0 ? '+' : '';
                    conn.labelHeight.textContent = `Δy: ${signal}${dy.toFixed(2)} m`;
                } else {
                    conn.labelHeight.textContent = '';
                }
            } else {
                conn.labelHeight.textContent = '';
            }
        }
    });
}

export function setupPipeControl() {
    const workspaceContainer = document.getElementById('workspace');
    const workspaceCanvas = document.getElementById('workspace-canvas');

    // Mouse down para iniciar pipe
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

    // Mouse move para atualizar pipe temporário
    workspaceContainer.addEventListener('mousemove', (e) => {
        if (tempPipe && dragSourcePort) {
            const p1 = getPortCoords(dragSourcePort);
            const canvasRect = workspaceCanvas.getBoundingClientRect();
            const mouseX = (e.clientX - canvasRect.left) / camera.scale;
            const mouseY = (e.clientY - canvasRect.top) / camera.scale;
            tempPipe.setAttribute("d", drawCurve(p1.x, p1.y, mouseX, mouseY));
        }
    });

    // Mouse up para finalizar conexão
    window.addEventListener('mouseup', (e) => {
        if (tempPipe) {
            let dropTarget = e.target;
            if (dropTarget.classList.contains('port-node') && dropTarget.dataset.type === 'in') {
                const sourceLogic = ENGINE.componentes.find(c => c.id === dragSourcePort.dataset.compId);
                const targetLogic = ENGINE.componentes.find(c => c.id === dropTarget.dataset.compId);

                if (sourceLogic && targetLogic && sourceLogic !== targetLogic) {
                    sourceLogic.conectarSaida(targetLogic);
                    validarControleNivelDosComponentes(sourceLogic, targetLogic);
                    const finalPipe = tempPipe;
                    const connection = {
                        sourceEl: dragSourcePort,
                        targetEl: dropTarget,
                        path: finalPipe,
                        label: null,
                        diameterM: DEFAULT_PIPE_DIAMETER_M,
                        roughnessMm: DEFAULT_PIPE_ROUGHNESS_MM,
                        extraLengthM: DEFAULT_PIPE_EXTRA_LENGTH_M,
                        perdaLocalK: DEFAULT_PIPE_MINOR_LOSS
                    };

                    const labelEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    labelEl.setAttribute("class", "pipe-flow-label");
                    labelEl.setAttribute("text-anchor", "middle");
                    pipeLayer.appendChild(labelEl);
                    connection.label = labelEl;
                    const labelHeightEl = document.createElementNS("http://www.w3.org/2000/svg", "text");

                    //Altura do grafo
                    labelHeightEl.setAttribute("class", "pipe-flow-label");
                    labelHeightEl.setAttribute("fill", "#e67e22");
                    labelHeightEl.setAttribute("text-anchor", "middle");
                    pipeLayer.appendChild(labelHeightEl);
                    connection.labelHeight = labelHeightEl;

                    finalPipe.addEventListener('mousedown', function (ev) {
                        ENGINE.selectConnection(connection);
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
                        this.classList.add('selected');
                        this.setAttribute("marker-end", "url(#arrow-selected)");
                        ev.stopPropagation();
                    });

                    finalPipe.addEventListener('dblclick', function (ev) {
                        sourceLogic.desconectarSaida(targetLogic);
                        validarControleNivelDosComponentes(sourceLogic, targetLogic);
                        const ci = ENGINE.conexoes.findIndex(c => c === connection);
                        
                        if (ci !== -1) {
                            // 1. Remove os dois textos do SVG PRIMEIRO
                            if (ENGINE.conexoes[ci].label) ENGINE.conexoes[ci].label.remove();
                            if (ENGINE.conexoes[ci].labelHeight) ENGINE.conexoes[ci].labelHeight.remove();
                            
                            // 2. Remove o cano da array UMA ÚNICA VEZ
                            ENGINE.removeConnection(connection);
                        }
                        
                        if (ENGINE.selectedConnection === connection) ENGINE.selectComponent(null);
                        finalPipe.remove();
                        updatePortStates();
                        ENGINE.notify({ tipo: 'update_painel', dt: 0 });
                        ev.stopPropagation();
                    });

                    ENGINE.addConnection(connection);
                    updateAllPipes();
                    updatePortStates();
                    ENGINE.notify({ tipo: 'update_painel', dt: 0 });
                } else {
                    tempPipe.remove();
                }
            } else {
                tempPipe.remove();
            }
            tempPipe = null;
            dragSourcePort = null;
        }
    });
}
