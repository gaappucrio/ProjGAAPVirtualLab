// =========================================
// CONTROLLER: Motor Vetorial de Tubos
// Ficheiro: js/controllers/PipeController.js
// =========================================

import { ENGINE } from '../MotorFisico.js'
import { camera } from './CameraController.js'
import { updatePortStates } from '../utils/PortStateManager.js'

const pipeLayer = document.getElementById('pipe-layer');
let tempPipe = null;
let dragSourcePort = null;

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

export function updateAllPipes() {
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
                    const finalPipe = tempPipe;

                    const labelEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    labelEl.setAttribute("class", "pipe-flow-label");
                    labelEl.setAttribute("text-anchor", "middle");
                    pipeLayer.appendChild(labelEl);

                    finalPipe.addEventListener('mousedown', function (ev) {
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
                        this.classList.add('selected');
                        this.setAttribute("marker-end", "url(#arrow-selected)");
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
