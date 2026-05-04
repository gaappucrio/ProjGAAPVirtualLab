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
import { BombaLogica } from '../../domain/components/BombaLogica.js';
import { Fluido } from '../../domain/components/Fluido.js';
import { HydraulicBranchModel } from '../../domain/services/HydraulicBranchModel.js';
import { HydraulicNetworkSolver } from '../../domain/services/HydraulicNetworkSolver.js';
import {
    ensureConnectionProperties as ensurePipeConnectionProperties,
    getConnectionGeometryFromPoints,
    getPipeHydraulics as calculatePipeHydraulics
} from '../../domain/services/PipeHydraulics.js';
import { TanqueLogico } from '../../domain/components/TanqueLogico.js';
import { ValvulaLogica } from '../../domain/components/ValvulaLogica.js';
import { createSimulationContext } from '../../domain/context/SimulationContext.js';
import {
    DEFAULT_FLUID_VAPOR_PRESSURE_BAR,
    DEFAULT_FLUID_VISCOSITY_PA_S,
    DEFAULT_PIPE_FRICTION,
    EPSILON_FLOW,
    MAX_NETWORK_FLOW_LPS,
    pressureFromHeadBar
} from '../../utils/Units.js';
import { profiler } from '../../utils/PerformanceProfiler.js';
import { calculatePortPosition } from '../../domain/services/PortPositionCalculator.js';
import { ENGINE_EVENTS } from '../events/EventTypes.js';
import { ComponentEventPayloads, EngineEventPayloads } from '../events/EventPayloads.js';
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

const safeViscosity = (value) => Math.max(0.00001, value || DEFAULT_FLUID_VISCOSITY_PA_S);

export const FLUID_PRESETS = {
    agua: {
        nome: 'Água',
        densidade: 997,
        temperatura: 25,
        viscosidadeDinamicaPaS: DEFAULT_FLUID_VISCOSITY_PA_S,
        pressaoVaporBar: DEFAULT_FLUID_VAPOR_PRESSURE_BAR
    },
    oleo_leve: {
        nome: 'Óleo leve',
        densidade: 860,
        temperatura: 25,
        viscosidadeDinamicaPaS: 0.035,
        pressaoVaporBar: 0.003
    },
    glicol_30: {
        nome: 'Glicol 30%',
        densidade: 1045,
        temperatura: 25,
        viscosidadeDinamicaPaS: 0.0035,
        pressaoVaporBar: 0.02
    }
};

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
        this.fluidoOperante = new Fluido(
            fluidoPadrao.nome,
            fluidoPadrao.densidade,
            fluidoPadrao.viscosidadeDinamicaPaS,
            fluidoPadrao.temperatura
        );
        this.fluidoOperante.viscosidadeDinamicaPaS = fluidoPadrao.viscosidadeDinamicaPaS;
        this.fluidoOperante.pressaoVaporBar = fluidoPadrao.pressaoVaporBar;
        this.selectionStore = new SelectionStore();
        this.topology = new TopologyGraph();
        this.connectionStateStore = new ConnectionStateStore();
        this.hydraulicBranchModel = new HydraulicBranchModel(this);
        this.hydraulicSolver = new HydraulicNetworkSolver(this);
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
                isValvulaBloqueadaPorSetpoint: (valvula) => this.isValvulaBloqueadaPorSetpoint(valvula)
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
        this.clearConnectionDynamics();
        this.resetHydraulicState();
        this.componentes.forEach(c => c.onSimulationStop());
        this.notify(EngineEventPayloads.motorState(false));
        this.updatePipesVisual();
    }

    selectComponent(comp) {
        this.selectionStore.selectComponent(comp);
        this.notify(EngineEventPayloads.selection(comp, null));
    }

    selectConnection(conn) {
        this.selectionStore.selectConnection(conn);
        this.notify(EngineEventPayloads.selection(null, conn));
    }

    setUsarAlturaRelativa(ativo) {
        this.usarAlturaRelativa = ativo !== false;
        this.clearConnectionDynamics();
        if (!this.isRunning) this.resetHydraulicState();
        this.updatePipesVisual();
        this.notify(EngineEventPayloads.simulationConfig(this.usarAlturaRelativa));
    }

    atualizarFluido(dados) {
        this.fluidoOperante.nome = dados.nome ?? this.fluidoOperante.nome;
        this.fluidoOperante.densidade = Math.max(1, Number(dados.densidade) || this.fluidoOperante.densidade);
        this.fluidoOperante.temperatura = Number(dados.temperatura) || this.fluidoOperante.temperatura;
        this.fluidoOperante.viscosidadeDinamicaPaS = safeViscosity(dados.viscosidadeDinamicaPaS ?? this.fluidoOperante.viscosidadeDinamicaPaS);
        this.fluidoOperante.pressaoVaporBar = Math.max(0.0001, Number(dados.pressaoVaporBar) || this.fluidoOperante.pressaoVaporBar);
        this.fluidoOperante.pressaoAtmosfericaBar = Math.max(0.5, Number(dados.pressaoAtmosfericaBar) || this.fluidoOperante.pressaoAtmosfericaBar);
        this.notify(EngineEventPayloads.fluidUpdate(this.fluidoOperante));
    }

    tick(timestamp) {
        if (!this.isRunning) return;

        profiler.startTick();

        let dt = ((timestamp - this.lastTime) / 1000.0) * this.velocidade;
        this.lastTime = timestamp;
        if (dt > 0.1) dt = 0.1;

        this.elapsedTime += dt;

        this.componentes.forEach(c => {
            if (c instanceof TanqueLogico) c._rodarControlador(dt);
        });

        this.componentes.forEach(c => c.atualizarDinamica(dt, this.fluidoOperante));
        this.resolvePushBasedNetwork(dt);

        this.componentes.forEach(c => {
            if (c instanceof TanqueLogico) c.atualizarFisica(dt, this.fluidoOperante);
            else c.sincronizarMetricasFisicas(this.fluidoOperante);
        });

        this.updatePipesVisual();
        this.notify(EngineEventPayloads.panelUpdate(dt));

        profiler.endTick(this.getSolverMetrics());

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
                regime: 'sem fluxo'
            }));
    }

    resolveConnectionDisplayFlow(conn) {
        if (typeof connectionFlowGetter === 'function') {
            return connectionFlowGetter(conn);
        }

        const state = this.getConnectionState(conn);
        return this.isRunning ? state.flowLps : null;
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

    getLogicalPortPosition(portEl) {
        if (!portEl) return { x: 0, y: 0 };

        const parentComponent = portEl.closest('.placed-component');
        const svgEl = portEl.ownerSVGElement;
        const compX = parentComponent ? parseFloat(parentComponent.style.left || '0') : 0;
        const compY = parentComponent ? parseFloat(parentComponent.style.top || '0') : 0;
        const svgX = svgEl ? parseFloat(svgEl.style.left || '0') : 0;
        const svgY = svgEl ? parseFloat(svgEl.style.top || '0') : 0;
        const localX = parseFloat(portEl.getAttribute('cx') || '0');
        const localY = parseFloat(portEl.getAttribute('cy') || '0');

        return {
            x: compX + svgX + localX,
            y: compY + svgY + localY
        };
    }

    // Calcula a geometria da conexão sem depender de DOM.
    // Busca componentes pela topologia e calcula as posições dos portos.
    getConnectionGeometry(conn) {
        const sourceComponent = this.topology.getComponentById(conn.sourceId);
        const targetComponent = this.topology.getComponentById(conn.targetId);

        if (!sourceComponent || !targetComponent) {
            return { straightLengthM: 1.0, lengthM: 1.0 + (conn.extraLengthM || 0), headGainM: 0 };
        }

        const resolvedSourceVisualPos = componentVisualPositionResolver(sourceComponent);
        const resolvedTargetVisualPos = componentVisualPositionResolver(targetComponent);

        const resolvedSourcePoint = calculatePortPosition(
            sourceComponent,
            conn.sourceEndpoint.portType,
            {
                offsetX: conn.sourceEndpoint.offsetX,
                offsetY: conn.sourceEndpoint.offsetY,
                floorOffsetY: conn.sourceEndpoint.floorOffsetY || 0
            },
            resolvedSourceVisualPos,
            this.usarAlturaRelativa
        );

        const resolvedTargetPoint = calculatePortPosition(
            targetComponent,
            conn.targetEndpoint.portType,
            {
                offsetX: conn.targetEndpoint.offsetX,
                offsetY: conn.targetEndpoint.offsetY,
                floorOffsetY: conn.targetEndpoint.floorOffsetY || 0
            },
            resolvedTargetVisualPos,
            this.usarAlturaRelativa
        );

        return getConnectionGeometryFromPoints(resolvedSourcePoint, resolvedTargetPoint, conn, this.usarAlturaRelativa);
    }

    // Usa PipeHydraulics.getPipeHydraulics
    getPipeHydraulics(conn, geometry, areaM2, flowLps) {
        const density = this.fluidoOperante.densidade;
        const viscosityPaS = this.fluidoOperante.viscosidadeDinamicaPaS;
        return calculatePipeHydraulics(conn, geometry, areaM2, flowLps, density, viscosityPaS);
    }

    resolvePushBasedNetwork(dt) {
        return this.hydraulicSolver.resolve(dt);
    }

    updatePipesVisual() {
        connectionVisualUpdater?.();

        if (this.isRunning) {
            this.componentes.forEach(c => {
                if (c instanceof TanqueLogico && c.setpointAtivo) {
                    const notificarEstado = (equipamento) => {
                        if (equipamento instanceof ValvulaLogica) {
                            equipamento.notify(ComponentEventPayloads.state({
                                aberta: equipamento.aberta,
                                grau: equipamento.grauAbertura
                            }));
                        } else if (equipamento instanceof BombaLogica) {
                            equipamento.notify(ComponentEventPayloads.state({
                                isOn: equipamento.isOn,
                                grau: equipamento.grauAcionamento
                            }));
                        }
                    };
                    c.inputs.forEach(notificarEstado);
                    c.outputs.forEach(notificarEstado);
                }
            });
        }
    }
}

export const ENGINE = new SistemaSimulacao();


