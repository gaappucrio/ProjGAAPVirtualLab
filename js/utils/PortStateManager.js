// ===================================
// UTILS: Gerenciador de Estado de Portas
// Arquivo: js/utils/PortStateManager.js
// ===================================

import { ENGINE } from '../application/engine/SimulationEngine.js';
import { getComponentPortElement } from '../infrastructure/dom/ComponentVisualRegistry.js';

/**
 * Atualiza o estado visual das portas com base nas conexões atuais
 */
export function updatePortStates() {
    const allPorts = document.querySelectorAll('#workspace-canvas .port-node');
    allPorts.forEach(port => port.classList.add('unconnected'));

    ENGINE.conexoes.forEach((conn) => {
        const sourcePort = getComponentPortElement(conn.sourceId, conn.sourceEndpoint?.portType || 'out');
        const targetPort = getComponentPortElement(conn.targetId, conn.targetEndpoint?.portType || 'in');
        if (sourcePort) sourcePort.classList.remove('unconnected');
        if (targetPort) targetPort.classList.remove('unconnected');
    });
}
