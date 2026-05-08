// =========================================
// CONTROLADOR: Arrastar e soltar componentes
// Arquivo: js/presentation/controllers/DragDropController.js
// =========================================

import { FabricaDeEquipamentos, updatePortStates } from '../../infrastructure/dom/ComponentVisualFactory.js';
import { getComponentDefinition } from '../registry/ComponentDefinitionRegistry.js';
import { ComponentEventPayloads } from '../../application/events/EventPayloads.js';
import { camera } from './CameraController.js';
import { updateAllPipes } from './PipeController.js';
import { GRID_SIZE } from '../../Config.js';

export function makeComponentDraggable(element) {
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
        const snappedX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
        const snappedY = Math.round(newY / GRID_SIZE) * GRID_SIZE;

        element.style.left = `${snappedX}px`;
        element.style.top = `${snappedY}px`;
        element.logica.x = snappedX;
        element.logica.y = snappedY;
        element.logica.notify(ComponentEventPayloads.positionUpdate());
        updateAllPipes();
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            element.logica.x = parseInt(element.style.left);
            element.logica.y = parseInt(element.style.top);
            element.logica.notify(ComponentEventPayloads.positionUpdate());
            updateAllPipes();
        }
    });
}

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

        const spec = getComponentDefinition(t);
        if (!spec) return;

        const canvasRect = workspaceCanvas.getBoundingClientRect();

        let dropX = (e.clientX - canvasRect.left) / camera.scale - (spec.w / 2);
        let dropY = (e.clientY - canvasRect.top) / camera.scale - (spec.h / 2);

        const snapX = Math.round(dropX / GRID_SIZE) * GRID_SIZE;
        const snapY = Math.round(dropY / GRID_SIZE) * GRID_SIZE;

        const novoVisual = FabricaDeEquipamentos.criar(t, snapX, snapY);
        workspaceCanvas.appendChild(novoVisual);
        makeComponentDraggable(novoVisual);

        updatePortStates();
    });
}
