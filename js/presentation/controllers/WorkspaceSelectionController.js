function clearVisualSelection() {
    document.querySelectorAll('.placed-component').forEach((element) => {
        element.classList.remove('selected');
    });

    document.querySelectorAll('.pipe-line').forEach((element) => {
        element.classList.remove('selected');
        element.setAttribute(
            'marker-end',
            element.classList.contains('active') ? 'url(#arrow-active)' : 'url(#arrow)'
        );
    });
}

export function setupWorkspaceSelectionController({ engine }) {
    const workspaceContainer = document.getElementById('workspace');
    const workspaceCanvas = document.getElementById('workspace-canvas');

    workspaceContainer?.addEventListener('mousedown', (event) => {
        const clickedEmptyWorkspace = event.target === workspaceContainer
            || event.target === workspaceCanvas
            || event.target.id === 'pipe-layer';

        if (!clickedEmptyWorkspace) return;

        engine.selectComponent(null);
        clearVisualSelection();
    });
}
