import { findConnectionByPath } from '../../infrastructure/rendering/ConnectionVisualRegistry.js';
import { updatePortStates } from '../../infrastructure/dom/PortStateManager.js';

function isEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    const tagName = target.tagName.toLowerCase();
    return tagName === 'input'
        || tagName === 'textarea'
        || tagName === 'select'
        || target.isContentEditable;
}

export function setupDeleteSelectionController({ engine, connectionService } = {}) {
    document.addEventListener('keydown', (event) => {
        if (isEditableTarget(event.target)) return;
        if (event.key !== 'Delete' && event.key !== 'Backspace') return;

        const selectedComponentDivs = [...document.querySelectorAll('.placed-component.selected')];
        if (selectedComponentDivs.length > 0) {
            selectedComponentDivs.forEach((selectedCompDiv) => {
                const compId = selectedCompDiv.dataset.id;
                const comp = engine.componentes.find((component) => component.id === compId);
                if (comp) {
                    engine.removeComponent(comp);
                    selectedCompDiv.remove();
                }
            });
            engine.selectComponent(null);
            updatePortStates();
            return;
        }

        const selectedPipe = document.querySelector('.pipe-line.selected');
        if (!selectedPipe) return;

        const connection = findConnectionByPath(selectedPipe);
        if (!connection) return;

        connectionService.remove(connection);
        engine.selectComponent(null);
        updatePortStates();
    });
}
