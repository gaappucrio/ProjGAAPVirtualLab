// ==================================
// APPLICATION: Motor de Simulação
// Arquivo: js/application/engine/SimulationEngine.js
// ==================================

import {
    clamp,
    ComponenteFisico,
    flowFromBernoulli,
    Observable,
    pressureLossFromFlow,
    smoothFirstOrder
} from '../../domain/components/BaseComponente.js';
import { createFluidoFromProperties } from '../../domain/components/Fluido.js';
import { HydraulicBranchModel } from '../../domain/services/HydraulicBranchModel.js';
import { HydraulicNetworkSolver } from '../../domain/services/HydraulicNetworkSolver.js';
import { ensureConnectionProperties as ensurePipeConnectionProperties } from '../../domain/services/PipeHydraulics.js';
import { TanqueLogico } from '../../domain/components/TanqueLogico.js';
import { createSimulationContext } from '../../domain/context/SimulationContext.js';
import {
    DEFAULT_PIPE_FRICTION,
    EPSILON_FLOW,
    MAX_NETWORK_FLOW_LPS,
    pressureFromHeadBar
} from '../../domain/units/HydraulicUnits.js';
import { FLUID_PRESETS } from '../config/FluidPresets.js';
import { EngineEventPayloads } from '../events/EventPayloads.js';
import { HydraulicNetworkContext } from './HydraulicNetworkContext.js';
import { SimulationTickPipeline } from './SimulationTickPipeline.js';
import { ConnectionGeometryService } from '../services/ConnectionGeometryService.js';
import { ConnectionStateStore } from '../stores/ConnectionStateStore.js';
import { SelectionStore } from '../stores/SelectionStore.js';
import { SimulationConfigStore } from '../stores/SimulationConfigStore.js';
import { TopologyGraph } from '../stores/TopologyGraph.js';

export {
    clamp,
    ComponenteFisico,
    flowFromBernoulli,
    Observable,
    pressureLossFromFlow,
    smoothFirstOrder,
    EPSILON_FLOW,
    MAX_NETWORK_FLOW_LPS,
    pressureFromHeadBar
};

let portStateUpdater = null;
let connectionVisualUpdater = null;
let connectionFlowGetter = null;
let componentVisualPositionResolver = (component) => ({
    x: typeof component?.x === 'number' ? component.x : 0,
    y: typeof component?.y === 'number' ? component.y : 0
});
let unregisterComponentVisualHandler = null;
let clearComponentVisualRegistryHandler = null;

// Rastreamento de estabilidade numerica do solver

export { FLUID_PRESETS };

export function setPortStateUpdater(fn) {
    portStateUpdater = fn;
}

export function setConnectionVisualUpdater(fn) {
    connectionVisualUpdater = fn;
}

export function setConnectionFlowGetter(fn) {
    connectionFlowGetter = fn;
}

export function setComponentVisualPositionResolver(fn) {
    componentVisualPositionResolver = typeof fn === 'function'
        ? fn
        : ((component) => ({
            x: typeof component?.x === 'number' ? component.x : 0,
            y: typeof component?.y === 'number' ? component.y : 0
        }));
}

export function setComponentVisualCleanupHooks({ unregister, clearAll } = {}) {
    unregisterComponentVisualHandler = typeof unregister === 'function' ? unregister : null;
    clearComponentVisualRegistryHandler = typeof clearAll === 'function' ? clearAll : null;
}

export class SistemaSimulacao extends Observable {
    constructor() {
        super();
        this.configStore = new SimulationConfigStore();
        const fluidoPadrao = FLUID_PRESETS.agua;
        this.fluidoOperante = createFluidoFromProperties(fluidoPadrao);
        this.selectionStore = new SelectionStore();
        this.topology = new TopologyGraph();
        this.connectionStateStore = new ConnectionStateStore();
        this.connectionGeometryService = new ConnectionGeometryService({
            topology: this.topology,
            getUsarAlturaRelativa: () => this.usarAlturaRelativa,
            getComponentVisualPosition: (component) => componentVisualPositionResolver(component)
        });
        this.hydraulicContext = new HydraulicNetworkContext(this);
        this.hydraulicBranchModel = new HydraulicBranchModel(this.hydraulicContext);
        this.hydraulicSolver = new HydraulicNetworkSolver(this.hydraulicContext, this.hydraulicBranchModel);
        this.tickPipeline = new SimulationTickPipeline({ engine: this });
        this.isRunning = false;
        this.lastTime = 0;
        this.elapsedTime = 0;
        this.selectedComponent = null;
        this.selectedConnection = null;
        this.usarAlturaRelativa = false;
    }

    get velocidade() {
        return this.configStore.velocidade;
    }

    set velocidade(value) {
        this.configStore.velocidade = Number(value) || 1.0;
    }

    get usarAlturaRelativa() {
        return this.configStore.usarAlturaRelativa;
    }

    set usarAlturaRelativa(value) {
        this.configStore.usarAlturaRelativa = value !== false;
    }

    get componentes() {
        return this.topology.components;
    }

    set componentes(value) {
        this.topology.components = value;
        this.topology.components.forEach((component) => this.attachComponentContext(component));
    }

    get conexoes() {
        return this.topology.connections;
    }

    set conexoes(value) {
        this.topology.connections = value;
    }

    get selectedComponent() {
        return this.selectionStore.selectedComponent;
    }

    set selectedComponent(value) {
        this.selectionStore.selectedComponent = value || null;
    }

    get selectedConnection() {
        return this.selectionStore.selectedConnection;
    }

    set selectedConnection(value) {
        this.selectionStore.selectedConnection = value || null;
    }

    get selectedComponents() {
        return [...this.selectionStore.selectedComponents];
    }

    get connectionStates() {
        return this.connectionStateStore.states;
    }

    createSimulationContext(overrides = {}) {
        return createSimulationContext({
            isRunning: this.isRunning,
            fluidoOperante: this.fluidoOperante,
            usarAlturaRelativa: this.usarAlturaRelativa,
            elapsedTime: this.elapsedTime,
            queries: {
                isBombaBloqueadaPorSetpoint: (bomba) => this.isBombaBloqueadaPorSetpoint(bomba),
                isValvulaBloqueadaPorSetpoint: (valvula) => this.isValvulaBloqueadaPorSetpoint(valvula),
                getComponentFluid: (component) => this.hydraulicContext.getComponentFluid(component)
            },
            ...overrides
        });
    }

    attachComponentContext(component) {
        if (component && typeof component.setSimulationContextProvider === 'function') {
            component.setSimulationContextProvider(() => this.createSimulationContext());
        }
    }

    detachComponentContext(component) {
        if (component && typeof component.clearSimulationContextProvider === 'function') {
            component.clearSimulationContextProvider();
        }
    }

    add(comp) {
        this.topology.addComponent(comp);
        this.attachComponentContext(comp);
    }

    addConnection(connection) {
        this.topology.addConnection(connection);
        this.notify(EngineEventPayloads.connectionCommitted(connection));
        return connection;
    }

    removeConnection(connection) {
        this.topology.removeConnection(connection);
        this.connectionStateStore.delete(connection);
        this.notify(EngineEventPayloads.connectionRemoved(connection));
        return connection;
    }

    removeComponent(comp) {
        if (!comp) return;
        if (this.isRunning) comp.onSimulationStop();

        const relatedConnections = this.conexoes.filter((conn) =>
            conn.sourceId === comp.id || conn.targetId === comp.id
        );

        relatedConnections.forEach((connection) => {
            this.removeConnection(connection);
        });

        this.detachComponentContext(comp);
        comp.destroy();
        unregisterComponentVisualHandler?.(comp);
        this.topology.removeComponent(comp);

        this.componentes.forEach((component) => {
            if (typeof component?.garantirConsistenciaControleNivel === 'function') {
                component.garantirConsistenciaControleNivel();
            }
        });

        if (this.selectedComponent === comp) {
            this.selectedComponent = null;
        }

        this.notify(EngineEventPayloads.panelUpdate(0));
    }

    getSolverMetrics() {
        return this.hydraulicSolver.getMetrics();
    }

    clear() {
        this.clearConnectionDynamics();
        [...this.conexoes].forEach((connection) => {
            this.removeConnection(connection);
        });
        this.componentes.forEach((component) => {
            this.detachComponentContext(component);
            unregisterComponentVisualHandler?.(component);
        });
        this.topology.clear();
        clearComponentVisualRegistryHandler?.();
        this.connectionStateStore.clear();
        this.isRunning = false;
        this.elapsedTime = 0;
        this.selectionStore.clear();
        this.notify(EngineEventPayloads.selection(null, null));
        if (portStateUpdater) portStateUpdater();
    }

    start() {
        this.isRunning = true;
        this.lastTime = performance.now();
        requestAnimationFrame(this.tick.bind(this));
        this.notify(EngineEventPayloads.motorState(true));
    }

    stop() {
        this.isRunning = false;
        this.notify(EngineEventPayloads.motorState(false));
        this.updatePipesVisual();
    }

    selectComponent(comp) {
        this.selectionStore.selectComponent(comp);
        this.notify(EngineEventPayloads.selection(comp, null, this.selectedComponents));
    }

    selectComponents(components = []) {
        this.selectionStore.selectComponents(components);
        this.notify(EngineEventPayloads.selection(this.selectedComponent, null, this.selectedComponents));
    }

    toggleComponentSelection(component) {
        this.selectionStore.toggleComponent(component);
        this.notify(EngineEventPayloads.selection(this.selectedComponent, null, this.selectedComponents));
    }

    selectConnection(conn) {
        this.selectionStore.selectConnection(conn);
        this.notify(EngineEventPayloads.selection(null, conn, []));
    }

    setUsarAlturaRelativa(ativo) {
        this.usarAlturaRelativa = ativo !== false;
        this.clearConnectionDynamics();
        if (!this.isRunning) this.resetHydraulicState();
        this.updatePipesVisual();
        this.notify(EngineEventPayloads.simulationConfig(this.usarAlturaRelativa));
    }

    tick(timestamp) {
        if (!this.isRunning) return;

        this.tickPipeline.run(timestamp);
        requestAnimationFrame(this.tick.bind(this));
    }

    resetHydraulicState() {
        this.connectionStateStore.clear();
        this.componentes.forEach(c => c.resetEstadoHidraulico());
    }

    clearConnectionDynamics() {
        this.conexoes.forEach(conn => {
            if (!conn) return;
            conn.transientFlowLps = 0;
            conn.lastResolvedFlowLps = 0;
            conn._activeTick = false;
        });
    }

    getConnectionState(conn) {
        return this.connectionStateStore.getOrCreate(conn, () => ({
                flowLps: 0,
                pressureBar: 0,
                outletPressureBar: 0,
                sourcePressureBar: 0,
                backPressureBar: 0,
                velocityMps: 0,
                deltaPBar: 0,
                totalLossBar: 0,
                targetLossBar: 0,
                lengthM: 0,
                straightLengthM: 0,
                headGainM: 0,
                targetFlowLps: 0,
                responseTimeS: 0,
                reynolds: 0,
                frictionFactor: DEFAULT_PIPE_FRICTION,
                relativeRoughness: 0,
                regime: 'sem fluxo',
                fluid: null,
                fluidName: ''
            }));
    }

    resolveConnectionDisplayFlow(conn) {
        if (typeof connectionFlowGetter === 'function') {
            return connectionFlowGetter(conn);
        }

        const state = this.getConnectionState(conn);
        return state.flowLps;
    }

    getComponentById(id) {
        return this.topology.getComponentById(id);
    }

    getOutputConnections(comp) {
        return this.topology.getOutputConnections(comp);
    }

    getInputConnections(comp) {
        return this.topology.getInputConnections(comp);
    }

    isBombaBloqueadaPorSetpoint(bomba) {
        return this.componentes.some(comp =>
            comp instanceof TanqueLogico &&
            typeof comp.isBombaControladaPorSetpoint === 'function' &&
            comp.isBombaControladaPorSetpoint(bomba)
        );
    }

    isValvulaBloqueadaPorSetpoint(valvula) {
        return this.componentes.some(comp =>
            comp instanceof TanqueLogico &&
            typeof comp.isValvulaControladaPorSetpoint === 'function' &&
            comp.isValvulaControladaPorSetpoint(valvula)
        );
    }

    ensureConnectionProperties(conn) {
        return ensurePipeConnectionProperties(conn);
    }

    // Mantém o contrato público do motor e delega a geometria para um serviço dedicado.
    getConnectionGeometry(conn) {
        return this.connectionGeometryService.getConnectionGeometry(conn);
    }

    resolvePushBasedNetwork(dt) {
        return this.hydraulicSolver.resolve(dt);
    }

    updatePipesVisual() {
        connectionVisualUpdater?.();
        this.tickPipeline.notifySetpointActuators();
    }
}

export const ENGINE = new SistemaSimulacao();


