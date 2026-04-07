// ========================================
// CONTROLLER: Navegação Espacial (Câmera)
// Ficheiro: js/controllers/CameraController.js
// ========================================

export const camera = {
    scale: 1,
    x: 0,
    y: 0,
    isPanning: false,
    startX: 0,
    startY: 0
};

let spacePressed = false;


export function updateCameraTransform() {
    const workspaceContainer = document.getElementById('workspace');
    const workspaceCanvas = document.getElementById('workspace-canvas');

    workspaceContainer.style.backgroundPosition = `${camera.x}px ${camera.y}px`;
    workspaceContainer.style.backgroundSize = `${40 * camera.scale}px ${40 * camera.scale}px`;
    workspaceCanvas.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
}


export function setupCameraControl() {
    const workspaceContainer = document.getElementById('workspace');

    // Eventos de teclado para espaço
    document.addEventListener('keydown', e => {
        if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
            spacePressed = true;
        }
    });

    document.addEventListener('keyup', e => {
        if (e.code === 'Space') spacePressed = false;
    });

    // Zoom com scroll
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

    // Pan com mouse
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
}


export function getCameraState() {
    return {
        scale: camera.scale,
        x: camera.x,
        y: camera.y
    };
}
