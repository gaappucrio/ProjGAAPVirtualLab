// =============================================
// ENTRYPOINT: inicializa o runtime da aplicação
// Arquivo: js/App.js
// =============================================

import { ENGINE } from './application/engine/SimulationEngine.js';
import { setupVirtualLabRuntime } from './VirtualLabRuntime.js';

setupVirtualLabRuntime({ engine: ENGINE });

console.log('App.js carregado - todos os controladores inicializados');
