// ===================================
// UTILS: Gerenciador de Estado de Portas
// Ficheiro: js/utils/PortStateManager.js
// ===================================

import { ENGINE } from '../MotorFisico.js'

export function updatePortStates() {
    const allPorts = document.querySelectorAll('#workspace-canvas .port-node');
    allPorts.forEach(port => port.classList.add('unconnected'));

    ENGINE.conexoes.forEach(conn => {
        if (conn.sourceEl) conn.sourceEl.classList.remove('unconnected');
        if (conn.targetEl) conn.targetEl.classList.remove('unconnected');
    });
}
