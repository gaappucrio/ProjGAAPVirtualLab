// ==========================================
// CONTROLLER: UI & DRAG AND DROP
// ==========================================
const GRID_SIZE = 40;
const paletteItems = document.querySelectorAll('.palette-item');
const workspace = document.getElementById('workspace');
let draggedType = null;

// 1. Inicializa Paleta
paletteItems.forEach(item => {
    const t = item.getAttribute('data-type');
    const dummy = FabricaDeEquipamentos.criar(t, 0, 0, true);

    dummy.style.position = 'relative';
    dummy.style.transform = 'scale(0.5)';
    dummy.style.transformOrigin = 'center';
    dummy.style.margin = '20px auto';

    item.insertBefore(dummy, item.firstChild);

    item.addEventListener('dragstart', (e) => {
        draggedType = t;
        e.dataTransfer.setData('text/plain', draggedType);
    });
});

// 2. Lógica de Soltar (Drop)
workspace.addEventListener('dragover', e => e.preventDefault());

workspace.addEventListener('drop', e => {
    e.preventDefault();
    if (!draggedType) return;

    const novoVisual = FabricaDeEquipamentos.criar(draggedType, 0, 0);
    const w = parseInt(novoVisual.dataset.logW);
    const h = parseInt(novoVisual.dataset.logH);

    const rect = workspace.getBoundingClientRect();
    const rawX = e.clientX - rect.left - (w / 2);
    const rawY = e.clientY - rect.top - (h / 2);
    const snapX = Math.round(rawX / GRID_SIZE) * GRID_SIZE;
    const snapY = Math.round(rawY / GRID_SIZE) * GRID_SIZE;

    novoVisual.style.left = `${snapX}px`;
    novoVisual.style.top = `${snapY}px`;

    workspace.appendChild(novoVisual);
    makeDraggable(novoVisual);
    draggedType = null;
});

// 3. Lógica de Arrastar Livremento
function makeDraggable(element) {
    let isDragging = false, startX, startY, initX, initY;

    element.addEventListener('mousedown', e => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initX = parseInt(element.style.left);
        initY = parseInt(element.style.top);
        e.stopPropagation();
    });

    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        const snapX = Math.round((initX + e.clientX - startX) / GRID_SIZE) * GRID_SIZE;
        const snapY = Math.round((initY + e.clientY - startY) / GRID_SIZE) * GRID_SIZE;
        element.style.left = `${snapX}px`;
        element.style.top = `${snapY}px`;
    });

    document.addEventListener('mouseup', () => isDragging = false);
    document.addEventListener('mouseleave', () => isDragging = false);
}

// 4. Controles Globais da Simulação
document.getElementById('btn-run').addEventListener('click', () => {
    let bomba = ENGINE.componentes.find(c => c instanceof BombaLogica);
    let tanque = ENGINE.componentes.find(c => c instanceof TanqueLogico);
    let valvula = ENGINE.componentes.find(c => c instanceof ValvulaLogica);

    if (!bomba || !tanque) {
        alert("Coloque pelo menos 1 Bomba e 1 Tanque na tela!");
        return;
    }

    // Conexão fantasma (a ser substituída na Fase 3)
    bomba.conectarSaida(tanque);
    if (valvula) tanque.conectarSaida(valvula);

    ENGINE.start();
});

document.getElementById('btn-clear').addEventListener('click', () => {
    const items = workspace.querySelectorAll('.placed-component');
    items.forEach(item => item.remove());
    ENGINE.clear();
});