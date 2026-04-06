// =========================================
// CONTROLLER: Drag & Drop de Componentes
// Ficheiro: js/controllers/DragDropController.js
// =========================================

import { REGISTRO_COMPONENTES } from '../RegistroComponentes.js'
import { FabricaDeEquipamentos, updatePortStates } from '../FabricaEquipamentos.js'
import { camera } from './CameraController.js'
import { updateAllPipes } from './PipeController.js'
import { GRID_SIZE } from '../Config.js'

export function setupDragDrop() {
    const workspaceContainer = document.getElementById('workspace');
    const workspaceCanvas = document.getElementById('workspace-canvas');

    // Setup drag start para itens da paleta
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

    // Drag over e drop no workspace
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

    // Funções auxiliares
    function makeDraggable(element) {
        let isDragging = false, startX, startY, initX, initY;
        element.addEventListener('mousedown', e => {
            if (e.target.classList.contains('port-node')) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initX = parseInt(element.style.left);
            initY = parseInt(element.style.top);
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
            if (isDragging) {
                isDragging = false;
                element.logica.x = parseInt(element.style.left);
                element.logica.y = parseInt(element.style.top);
            }
        });
    }

    // Aplicar drag aos componentes na paleta também
    document.querySelectorAll('.palette-item').forEach(item => {
        const cliffComponent = item.cloneNode(true);
        makeDraggable(cliffComponent);
    });
}
