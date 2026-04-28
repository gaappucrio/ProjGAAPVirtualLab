// ==================================
// APPLICATION: Motor de Simulacao
// Ficheiro: js/application/engine/SimulationEngine.js
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
import { DrenoLogico } from '../../domain/components/DrenoLogico.js';
import { FonteLogica } from '../../domain/components/FonteLogica.js';
import { HydraulicNetworkSolver } from '../../domain/services/HydraulicNetworkSolver.js';
import { TanqueLogico } from '../../domain/components/TanqueLogico.js';
import { ValvulaLogica } from '../../domain/components/ValvulaLogica.js';
import { createSimulationContext } from '../../domain/context/SimulationContext.js';
import {
    areaFromDiameter,
    BAR_TO_PA,
    DEFAULT_ENTRY_LOSS,
    DEFAULT_FLUID_VAPOR_PRESSURE_BAR,
    DEFAULT_FLUID_VISCOSITY_PA_S,
    DEFAULT_PIPE_DIAMETER_M,
    DEFAULT_PIPE_EXTRA_LENGTH_M,
    DEFAULT_PIPE_FRICTION,
    DEFAULT_PIPE_MINOR_LOSS,
    DEFAULT_PIPE_ROUGHNESS_MM,
    EPSILON_FLOW,
    GRAVITY,
    lpsToM3s,
    MAX_NETWORK_FLOW_LPS,
    pressureFromHeadBar
} from '../../utils/Units.js';
import { profiler } from '../../utils/PerformanceProfiler.js';
import { getPipeHydraulics, getConnectionGeometryFromPoints } from '../../utils/PipeHydraulics.js';
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

// Rastreamento de estabilidade num�rica do solver

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
        this.fluidoOperante = new Fluido("Água", 997.0, 1.0, 25.0);
        this.selectionStore = new SelectionStore();
        this.topology = new TopologyGraph();
        this.connectionStateStore = new ConnectionStateStore();
        this.hydraulicSolver = new HydraulicNetworkSolver(this);
        this.isRunning = false;
        this.lastTime = 0;
        this.elapsedTime = 0;
        this.selectedComponent = null;
        this.selectedConnection = null;
        this.usarAlturaRelativa = true;
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
        if (typeof conn.diameterM !== 'number') conn.diameterM = DEFAULT_PIPE_DIAMETER_M;
        if (typeof conn.roughnessMm !== 'number') conn.roughnessMm = DEFAULT_PIPE_ROUGHNESS_MM;
        if (typeof conn.extraLengthM !== 'number') conn.extraLengthM = DEFAULT_PIPE_EXTRA_LENGTH_M;
        if (typeof conn.perdaLocalK !== 'number') conn.perdaLocalK = DEFAULT_PIPE_MINOR_LOSS;
        if (typeof conn.transientFlowLps !== 'number') conn.transientFlowLps = 0;
        if (typeof conn.lastResolvedFlowLps !== 'number') conn.lastResolvedFlowLps = 0;
        conn.areaM2 = areaFromDiameter(conn.diameterM);
        return conn;
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

    // Calcula geometria da conexão sem depender de DOM
    // Busca componentes pela topologia e calcula posições dos portos
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

    // Usa utilitário importado PipeHydraulics.getPipeHydraulics
    getPipeHydraulics(conn, geometry, areaM2, flowLps) {
        const density = this.fluidoOperante.densidade;
        const viscosityPaS = this.fluidoOperante.viscosidadeDinamicaPaS;
        return getPipeHydraulics(conn, geometry, areaM2, flowLps, density, viscosityPaS);
    }

    getConnectionResponseTimeS(conn, geometry) {
        this.ensureConnectionProperties(conn);
        const lineVolumeL = geometry.lengthM * conn.areaM2 * 1000;
        const densityFactor = clamp(this.fluidoOperante.densidade / 997, 0.55, 1.8);
        const viscosityFactor = clamp(this.fluidoOperante.viscosidadeDinamicaPaS / DEFAULT_FLUID_VISCOSITY_PA_S, 0.5, 8);
        const baseTimeS = 0.08 + (geometry.lengthM * 0.035) + (lineVolumeL * 0.018 * densityFactor);
        return clamp(baseTimeS * Math.pow(viscosityFactor, 0.12), 0.05, 2.8);
    }

    applyConnectionDynamics(conn, targetFlowLps, dt, geometry, isPassThrough = false) {
        const responseTimeS = this.getConnectionResponseTimeS(conn, geometry);
        const actualFlowLps = isPassThrough ? targetFlowLps : smoothFirstOrder(
            Math.max(0, conn.transientFlowLps || 0),
            Math.max(0, targetFlowLps),
            dt,
            responseTimeS
        );

        conn.transientFlowLps = actualFlowLps <= EPSILON_FLOW ? 0 : actualFlowLps;
        conn.lastResolvedFlowLps = Math.max(0, targetFlowLps);

        return {
            flowLps: conn.transientFlowLps,
            responseTimeS
        };
    }

    relaxIdleConnections(dt) {
        this.conexoes.forEach(conn => {
            if (conn._activeTick) return;

            this.ensureConnectionProperties(conn);
            const geometry = this.getConnectionGeometry(conn);
            const { flowLps, responseTimeS } = this.applyConnectionDynamics(conn, 0, dt, geometry);
            const state = this.getConnectionState(conn);

            state.lengthM = geometry.lengthM;
            state.straightLengthM = geometry.straightLengthM;
            state.headGainM = geometry.headGainM;
            state.targetFlowLps = 0;
            state.responseTimeS = responseTimeS;

            if (flowLps <= EPSILON_FLOW) {
                conn.transientFlowLps = 0;
                conn.lastResolvedFlowLps = 0;
                return;
            }

            const pipeHydraulics = this.getPipeHydraulics(conn, geometry, conn.areaM2, flowLps);
            state.flowLps = flowLps;
            state.velocityMps = pipeHydraulics.velocityMps;
            state.reynolds = pipeHydraulics.reynolds;
            state.frictionFactor = pipeHydraulics.frictionFactor;
            state.relativeRoughness = pipeHydraulics.relativeRoughness;
            state.regime = pipeHydraulics.regime;
            state.deltaPBar = pressureLossFromFlow(
                flowLps,
                conn.areaM2,
                this.fluidoOperante.densidade,
                1 + conn.perdaLocalK + pipeHydraulics.distributedLossCoeff
            );
            state.totalLossBar = state.deltaPBar;
        });
    }

    getTargetBackPressureBar(target) {
        if (target instanceof TanqueLogico) return target.getBackPressureAtInletBar(this.fluidoOperante, this.usarAlturaRelativa);
        if (target instanceof DrenoLogico) return target.pressaoSaidaBar;
        return 0;
    }

    getTargetEntryLossCoeff(target) {
        if (target instanceof ValvulaLogica) {
            const opening = target.getAberturaNormalizadaAtual();
            return opening <= 0 ? 1e6 : 0;
        }
        if (target instanceof BombaLogica) return 0;
        if (target instanceof TanqueLogico) return target.perdaEntradaK;
        if (target instanceof DrenoLogico) return target.perdaEntradaK;
        return 0;
    }

    getTargetEntranceArea(target) {
        if (target instanceof ValvulaLogica) {
            return target.getParametrosHidraulicos().hydraulicAreaM2;
        }
        if (target && typeof target.getAreaConexaoM2 === 'function') return target.getAreaConexaoM2();
        return areaFromDiameter(DEFAULT_PIPE_DIAMETER_M);
    }

    isPressureForwardingTarget(target) {
        return target instanceof ValvulaLogica || target instanceof BombaLogica;
    }

    combineSerialFlowLimits(upstreamLimitLps, downstreamLimitLps) {
        if (upstreamLimitLps <= EPSILON_FLOW || downstreamLimitLps <= EPSILON_FLOW) return 0;

        // Para componentes passantes, a queda de pressão precisa ser dividida
        // entre o trecho a montante e o restante da rede, em vez de ser gasta
        // integralmente antes da válvula/bomba.
        const upstreamResistance = 1 / (upstreamLimitLps * upstreamLimitLps);
        const downstreamResistance = 1 / (downstreamLimitLps * downstreamLimitLps);
        return 1 / Math.sqrt(upstreamResistance + downstreamResistance);
    }

    hasPendingEmission(comp, dt) {
        if (comp instanceof FonteLogica) return !comp.jaEmitiuIntrinseco();
        if (comp instanceof TanqueLogico) {
            return !comp.jaEmitiuIntrinseco() && comp.volumeAtual > EPSILON_FLOW && comp.capacidadeMaxima > 0;
        }
        if (comp instanceof BombaLogica) {
            const drive = comp.getDriveAtual();
            return drive > 0 && comp.getFluxoPendenteLps() > EPSILON_FLOW;
        }
        if (comp instanceof ValvulaLogica) {
            return comp.getAberturaNormalizadaAtual() > 0 && comp.getFluxoPendenteLps() > EPSILON_FLOW;
        }
        return false;
    }

    buildSupplyState(comp, dt, options = {}) {
        const { inletPressureBar = null, estimating = false } = options;
        const areaM2 = comp.getAreaConexaoM2();

        if (comp instanceof FonteLogica) {
            if (!estimating && comp.jaEmitiuIntrinseco()) return null;
            return {
                availableFlowLps: comp.vazaoMaxima,
                pressureBar: comp.pressaoFonteBar,
                hydraulicAreaM2: areaM2,
                localLossCoeff: DEFAULT_ENTRY_LOSS
            };
        }

        if (comp instanceof TanqueLogico) {
            if (!estimating && comp.jaEmitiuIntrinseco()) return null;
            const availableFromInventory = dt > 0 ? comp.volumeAtual / dt : MAX_NETWORK_FLOW_LPS;
            const hydrostaticPressureBar = comp.getPressaoDisponivelSaidaBar(this.fluidoOperante, this.usarAlturaRelativa);
            const localLossCoeff = 1.0 / Math.max(0.15, comp.coeficienteSaida * comp.coeficienteSaida);
            const hydraulicCapacity = flowFromBernoulli(
                hydrostaticPressureBar,
                areaM2,
                this.fluidoOperante.densidade,
                localLossCoeff
            );

            return {
                availableFlowLps: Math.min(availableFromInventory, hydraulicCapacity),
                pressureBar: hydrostaticPressureBar,
                hydraulicAreaM2: areaM2,
                localLossCoeff
            };
        }

        if (comp instanceof BombaLogica) {
            const drive = comp.getDriveAtual();
            if (drive <= 0) return null;

            const qMax = comp.vazaoNominal * drive;
            const qRemaining = Math.max(0, qMax - comp.estadoHidraulico.saidaVazaoLps);
            const incomingFlow = estimating ? qRemaining : comp.getFluxoPendenteLps();
            if (incomingFlow <= EPSILON_FLOW || qRemaining <= EPSILON_FLOW) return null;

            const referenceFlow = clamp(comp.estadoHidraulico.saidaVazaoLps, 0, qMax);
            const curveFrac = qMax > EPSILON_FLOW ? 1 - Math.pow(referenceFlow / qMax, 2) : 0;
            const inletPressure = inletPressureBar ?? comp.getPressaoEntradaBar();
            const efficiency = comp.getEficienciaInstantanea(referenceFlow);
            const suctionFlowReference = clamp(
                Math.max(referenceFlow, estimating ? comp.estadoHidraulico.entradaVazaoLps : incomingFlow),
                0,
                qMax
            );
            const suctionVelocityMps = areaM2 > 0 ? lpsToM3s(suctionFlowReference) / areaM2 : 0;
            const suctionVelocityHeadM = (suctionVelocityMps * suctionVelocityMps) / (2 * GRAVITY);
            const absSuctionBar = this.fluidoOperante.pressaoAtmosfericaBar + inletPressure;
            const npshAvailableM = Math.max(
                0,
                (((absSuctionBar - this.fluidoOperante.pressaoVaporBar) * BAR_TO_PA) / (this.fluidoOperante.densidade * GRAVITY))
                + suctionVelocityHeadM
            );
            const npshRequiredM = comp.getCurvaNpshRequeridoM(suctionFlowReference, drive);
            const cavitationFactor = comp.calcularFatorCavitacao(npshAvailableM, npshRequiredM);
            const boostBar = comp.pressaoMaxima * drive * drive * Math.max(0.05, curveFrac) * cavitationFactor;
            const effectiveQRemaining = qRemaining * Math.max(0.25, cavitationFactor);

            comp.npshDisponivelM = npshAvailableM;
            comp.npshRequeridoAtualM = npshRequiredM;
            comp.fatorCavitacaoAtual = cavitationFactor;
            comp.eficienciaAtual = efficiency;

            return {
                availableFlowLps: Math.min(incomingFlow, effectiveQRemaining),
                pressureBar: inletPressure + boostBar,
                hydraulicAreaM2: areaM2,
                localLossCoeff: 1.0 / Math.max(0.18, efficiency),
                boostBar,
                cavitationFactor
            };
        }

        if (comp instanceof ValvulaLogica) {
            const parametros = comp.getParametrosHidraulicos();
            if (parametros.opening <= 0) return null;

            const availableFlow = estimating ? MAX_NETWORK_FLOW_LPS : comp.getFluxoPendenteLps();
            if (availableFlow <= EPSILON_FLOW) return null;

            return {
                availableFlowLps: availableFlow,
                pressureBar: inletPressureBar ?? comp.getPressaoEntradaBar(),
                hydraulicAreaM2: Math.min(areaM2, parametros.hydraulicAreaM2),
                localLossCoeff: parametros.localLossCoeff,
                characteristicFactor: parametros.characteristicFactor,
                effectiveCv: parametros.effectiveCv
            };
        }

        return null;
    }

    estimateComponentPotential(comp, inletPressureBar, dt, visited = new Set()) {
        if (!comp || visited.has(comp.id)) return 0;

        if (comp instanceof DrenoLogico) return MAX_NETWORK_FLOW_LPS;

        if (comp instanceof TanqueLogico) {
            const inflowAccepted = comp.estadoHidraulico.entradaVazaoLps * dt;
            const freeVolume = Math.max(0, comp.capacidadeMaxima - comp.volumeAtual - inflowAccepted);
            return dt > 0 ? freeVolume / dt : MAX_NETWORK_FLOW_LPS;
        }

        const outputs = this.getOutputConnections(comp);
        if (outputs.length === 0) return 0;

        const supply = this.buildSupplyState(comp, dt, { inletPressureBar, estimating: true });
        if (!supply || supply.availableFlowLps <= EPSILON_FLOW) return 0;

        const nextVisited = new Set(visited);
        nextVisited.add(comp.id);

        const totalPotential = outputs.reduce((sum, conn) => {
            const estimate = this.estimateBranch(comp, conn, supply, dt, nextVisited);
            return sum + estimate.capacityLps;
        }, 0);

        const alreadyAccepted = comp.estadoHidraulico.entradaVazaoLps;
        return Math.max(0, Math.min(supply.availableFlowLps, totalPotential) - alreadyAccepted);
    }

    estimateBranch(comp, conn, supply, dt, visited = new Set()) {
        this.ensureConnectionProperties(conn);

        const target = this.getComponentById(conn.targetId);
        const geometry = this.getConnectionGeometry(conn);
        const branchAreaM2 = Math.min(
            conn.areaM2,
            supply.hydraulicAreaM2 || conn.areaM2,
            this.getTargetEntranceArea(target)
        );
        const targetEntryLossCoeff = this.getTargetEntryLossCoeff(target);
        const backPressureBar = this.getTargetBackPressureBar(target);
        const staticHeadBar = pressureFromHeadBar(geometry.headGainM, this.fluidoOperante.densidade);
        const availableDeltaPBar = Math.max(0, supply.pressureBar + staticHeadBar - backPressureBar);

        if (!target || availableDeltaPBar <= EPSILON_FLOW) {
            return {
                capacityLps: 0,
                areaM2: branchAreaM2,
                backPressureBar,
                upstreamLossCoeff: 0,
                targetEntryLossCoeff,
                totalLossCoeff: 0,
                inletPressureBar: 0,
                outletPressureBar: 0,
                pipeHydraulics: this.getPipeHydraulics(conn, geometry, branchAreaM2, 0),
                geometry
            };
        }

        const density = this.fluidoOperante.densidade;
        const baseLossCoeff = 1 + conn.perdaLocalK + (supply.localLossCoeff || 0) + targetEntryLossCoeff + DEFAULT_PIPE_FRICTION * (geometry.lengthM / Math.max(conn.diameterM, 0.001));
        let capacityLps = Math.min(supply.availableFlowLps, flowFromBernoulli(availableDeltaPBar, branchAreaM2, density, baseLossCoeff));
        let pipeHydraulics = this.getPipeHydraulics(conn, geometry, branchAreaM2, capacityLps);
        let upstreamLossCoeff = 1 + conn.perdaLocalK + pipeHydraulics.distributedLossCoeff + (supply.localLossCoeff || 0);
        let totalLossCoeff = upstreamLossCoeff + targetEntryLossCoeff;

        for (let i = 0; i < 4; i += 1) {
            capacityLps = Math.min(supply.availableFlowLps, flowFromBernoulli(availableDeltaPBar, branchAreaM2, density, totalLossCoeff));
            pipeHydraulics = this.getPipeHydraulics(conn, geometry, branchAreaM2, capacityLps);
            upstreamLossCoeff = 1 + conn.perdaLocalK + pipeHydraulics.distributedLossCoeff + (supply.localLossCoeff || 0);
            totalLossCoeff = upstreamLossCoeff + targetEntryLossCoeff;
        }

        let provisionalUpstreamLossBar = 0;
        let inletPressureBar = backPressureBar;
        let targetEntryLossBar = 0;
        let outletPressureBar = backPressureBar;

        const recalculateBranchPressures = () => {
            pipeHydraulics = this.getPipeHydraulics(conn, geometry, branchAreaM2, capacityLps);
            upstreamLossCoeff = 1 + conn.perdaLocalK + pipeHydraulics.distributedLossCoeff + (supply.localLossCoeff || 0);
            totalLossCoeff = upstreamLossCoeff + targetEntryLossCoeff;
            provisionalUpstreamLossBar = pressureLossFromFlow(capacityLps, branchAreaM2, density, upstreamLossCoeff);
            inletPressureBar = Math.max(backPressureBar, supply.pressureBar + staticHeadBar - provisionalUpstreamLossBar);
            targetEntryLossBar = pressureLossFromFlow(capacityLps, branchAreaM2, density, targetEntryLossCoeff);
            outletPressureBar = Math.max(backPressureBar, inletPressureBar - targetEntryLossBar);
        };

        recalculateBranchPressures();

        const targetForwardsPressure = this.isPressureForwardingTarget(target);
        const downstreamInletPressureBar = targetForwardsPressure
            ? Math.max(backPressureBar, supply.pressureBar + staticHeadBar)
            : inletPressureBar;
        const downstreamLimit = this.estimateComponentPotential(
            target,
            downstreamInletPressureBar,
            dt,
            new Set(visited)
        );

        if (Number.isFinite(downstreamLimit)) {
            capacityLps = targetForwardsPressure
                ? this.combineSerialFlowLimits(capacityLps, downstreamLimit)
                : Math.min(capacityLps, downstreamLimit);
            recalculateBranchPressures();
        }

        return {
            capacityLps,
            areaM2: branchAreaM2,
            backPressureBar,
            upstreamLossCoeff,
            targetEntryLossCoeff,
            totalLossCoeff,
            inletPressureBar,
            outletPressureBar,
            pipeHydraulics,
            geometry
        };
    }

    applyBranchFlow(comp, conn, supply, estimate, flowLps, dt) {
        if (flowLps <= EPSILON_FLOW) return 0;

        const target = this.getComponentById(conn.targetId);
        if (!target) return 0;

        const isPassThrough = !(comp instanceof FonteLogica || comp instanceof TanqueLogico);
        const dynamics = this.applyConnectionDynamics(conn, flowLps, dt, estimate.geometry, isPassThrough);
        const actualFlowLps = dynamics.flowLps;
        const state = this.getConnectionState(conn);
        state.targetFlowLps = flowLps;
        state.responseTimeS = dynamics.responseTimeS;
        state.lengthM = estimate.geometry.lengthM;
        state.straightLengthM = estimate.geometry.straightLengthM;
        state.headGainM = estimate.geometry.headGainM;

        if (actualFlowLps <= EPSILON_FLOW) return 0;

        const density = this.fluidoOperante.densidade;
        const pipeHydraulics = this.getPipeHydraulics(conn, estimate.geometry, estimate.areaM2, actualFlowLps);
        const upstreamLossCoeff = 1 + conn.perdaLocalK + pipeHydraulics.distributedLossCoeff + (supply.localLossCoeff || 0);
        const upstreamLossBar = pressureLossFromFlow(actualFlowLps, estimate.areaM2, density, upstreamLossCoeff);
        const inletPressureBar = Math.max(estimate.backPressureBar, supply.pressureBar + pressureFromHeadBar(estimate.geometry.headGainM, density) - upstreamLossBar);
        const targetEntryLossBar = pressureLossFromFlow(
            actualFlowLps,
            estimate.areaM2,
            density,
            estimate.targetEntryLossCoeff
        );
        const arrivalPressureBar = Math.max(estimate.backPressureBar, inletPressureBar - targetEntryLossBar);
        const totalLossBar = upstreamLossBar + targetEntryLossBar;

        comp.registrarSaida(actualFlowLps, supply.pressureBar);
        target.registrarEntrada(actualFlowLps, arrivalPressureBar);

        const flowBefore = state.flowLps;
        state.flowLps += actualFlowLps;
        state.pressureBar = state.flowLps > EPSILON_FLOW
            ? ((state.pressureBar * flowBefore) + (inletPressureBar * actualFlowLps)) / state.flowLps
            : inletPressureBar;
        state.outletPressureBar = arrivalPressureBar;
        state.sourcePressureBar = Math.max(state.sourcePressureBar, supply.pressureBar);
        state.backPressureBar = Math.max(state.backPressureBar, estimate.backPressureBar);
        state.velocityMps = Math.max(state.velocityMps, pipeHydraulics.velocityMps);
        state.deltaPBar = Math.max(state.deltaPBar, Math.max(0, supply.pressureBar - inletPressureBar));
        state.totalLossBar = Math.max(state.totalLossBar, totalLossBar);
        state.targetLossBar = Math.max(state.targetLossBar, targetEntryLossBar);
        state.lengthM = estimate.geometry.lengthM;
        state.straightLengthM = estimate.geometry.straightLengthM;
        state.headGainM = estimate.geometry.headGainM;
        state.reynolds = Math.max(state.reynolds, pipeHydraulics.reynolds);
        state.frictionFactor = pipeHydraulics.frictionFactor;
        state.relativeRoughness = pipeHydraulics.relativeRoughness;
        state.regime = pipeHydraulics.regime;
        conn._activeTick = true;
        return actualFlowLps;
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


