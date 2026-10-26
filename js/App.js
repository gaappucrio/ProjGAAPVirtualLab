// =============================================
// ENTRYPOINT: inicializa o runtime da aplicação
// Arquivo: js/App.js
// =============================================

import { ENGINE } from './application/engine/SimulationEngine.js';
import { setupVirtualLabRuntime } from './VirtualLabRuntime.js';
import { isDebugEnabled, setupDebugConsole } from './debug/DebugConsole.js';

const runtime = setupVirtualLabRuntime({ engine: ENGINE });

if (isDebugEnabled()) setupDebugConsole({ engine: ENGINE, runtime });
