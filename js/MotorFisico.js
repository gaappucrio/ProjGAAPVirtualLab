// ==================================
// MODELO: Logica e Fisica do Sistema
// Ficheiro: js/MotorFisico.js
// ==================================

import {
    areaFromDiameter,
    BAR_TO_PA,
    clamp,
    ComponenteFisico,
    DEFAULT_ENTRY_LOSS,
    DEFAULT_FLUID_VISCOSITY_PA_S,
    DEFAULT_PIPE_DIAMETER_M,
    DEFAULT_PIPE_EXTRA_LENGTH_M,
    DEFAULT_PIPE_FRICTION,
    DEFAULT_PIPE_MINOR_LOSS,
    EPSILON_FLOW,
    flowFromBernoulli,
    GRAVITY,
    MAX_NETWORK_FLOW_LPS,
    Observable,
    pressureFromHeadBar,
    pressureLossFromFlow,
    smoothFirstOrder
} from './componentes/BaseComponente.js';
import { BombaLogica } from './componentes/BombaLogica.js';
import { Fluido } from './componentes/Fluido.js';
import { DrenoLogico } from './componentes/DrenoLogico.js';
import { FonteLogica } from './componentes/FonteLogica.js';
import { TanqueLogico } from './componentes/TanqueLogico.js';
import { ValvulaLogica } from './componentes/ValvulaLogica.js';
import { formatUnitValue, getUnitSymbol } from './utils/Units.js';
import { profiler } from './utils/PerformanceProfiler.js';
import { getConnectionGeometry, getPipeHydraulics } from './utils/PipeHydraulics.js';

export {
    clamp,
    ComponenteFisico,
    EPSILON_FLOW,
    flowFromBernoulli,
    MAX_NETWORK_FLOW_LPS,
    Observable,
    pressureFromHeadBar,
    pressureLossFromFlow,
    smoothFirstOrder
} from './componentes/BaseComponente.js';

let portStateUpdater = null;
let connectionFlowGetter = null;

const PIXELS_PER_METER = 80;
const MAX_QUEUE_STEPS = 512;
const MAX_COMPONENT_VISITS = 8;

// Rastreamento de estabilidade numérica do solver
const DEBUG_PHYSICS = false; // Ativa logs detalhados do solver
let solverMetrics = {
    lastIterations: 0,
    lastError: 0,
    maxIterationsHit: 0,
    convergedCount: 0,
    totalSolverCalls: 0
};

const safeViscosity = (value) => Math.max(0.00001, value || DEFAULT_FLUID_VISCOSITY_PA_S);

export const FLUID_PRESETS = {
    agua: {
        nome: 'Água',
        densidade: 997,
        temperatura: 25,
        viscosidadeDinamicaPaS: 0.00089,
        pressaoVaporBar: 0.0317
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

export function setConnectionFlowGetter(fn) {
    connectionFlowGetter = fn;
}

export class SistemaSimulacao extends Observable {
    constructor() {
        super();
        this.velocidade = 1.0;
        this.fluidoOperante = new Fluido("Agua", 997.0, 1.0, 25.0);
        this.componentes = [];
        this.conexoes = [];
        this.connectionStates = new Map();
        this.isRunning = false;
        this.lastTime = 0;
        this.elapsedTime = 0;
        this.selectedComponent = null;
        this.selectedConnection = null;
        this.usarAlturaRelativa = true;
    }

    add(comp) {
        this.componentes.push(comp);
    }

    removeComponent(comp) {
        // Remove componente da simulação com limpeza apropriada
        if (!comp) return;
        
        // Desativa o componente se simulação estiver rodando
        if (this.isRunning) comp.onSimulationStop();
        
        // Remove de conexões
        this.conexoes = this.conexoes.filter(conn => {
            if (conn.sourceEl.dataset.compId === comp.id || conn.targetEl.dataset.compId === comp.id) {
                if (conn.label) conn.label.remove();
                conn.path.remove();
                return false;
            }
            return true;
        });
        
        // Limpa estado e listeners
        comp.destroy();
        
        // Remove do array de componentes
        this.componentes = this.componentes.filter(c => c.id !== comp.id);
        
        // Desseleciona se era o componente selecionado
        if (this.selectedComponent === comp) {
            this.selectedComponent = null;
        }
    }

    getSolverMetrics() {
        return { ...solverMetrics };
    }

    clear() {
        this.clearConnectionDynamics();
        this.componentes = [];
        this.conexoes.forEach(c => {
            c.path.remove();
            if (c.label) c.label.remove();
        });
        this.conexoes = [];
        this.connectionStates.clear();
        this.isRunning = false;
        this.elapsedTime = 0;
        this.selectedComponent = null;
        this.selectedConnection = null;
        this.notify({ tipo: 'selecao', componente: null, conexao: null });
        if (portStateUpdater) portStateUpdater();
    }

    start() {
        this.isRunning = true;
        this.lastTime = performance.now();
        requestAnimationFrame(this.tick.bind(this));
        this.notify({ tipo: 'estado_motor', rodando: true });
    }

    stop() {
        this.isRunning = false;
        this.clearConnectionDynamics();
        this.resetHydraulicState();
        this.componentes.forEach(c => c.onSimulationStop());
        this.notify({ tipo: 'estado_motor', rodando: false });
        this.updatePipesVisual();
    }

    selectComponent(comp) {
        this.selectedComponent = comp;
        this.selectedConnection = null;
        this.notify({ tipo: 'selecao', componente: comp, conexao: null });
    }

    selectConnection(conn) {
        this.selectedComponent = null;
        this.selectedConnection = conn;
        this.notify({ tipo: 'selecao', componente: null, conexao: conn });
    }

    setUsarAlturaRelativa(ativo) {
        this.usarAlturaRelativa = ativo !== false;
        this.clearConnectionDynamics();
        if (!this.isRunning) this.resetHydraulicState();
        this.updatePipesVisual();
        this.notify({ tipo: 'config_simulacao', usarAlturaRelativa: this.usarAlturaRelativa });
    }

    atualizarFluido(dados) {
        this.fluidoOperante.nome = dados.nome ?? this.fluidoOperante.nome;
        this.fluidoOperante.densidade = Math.max(1, Number(dados.densidade) || this.fluidoOperante.densidade);
        this.fluidoOperante.temperatura = Number(dados.temperatura) || this.fluidoOperante.temperatura;
        this.fluidoOperante.viscosidadeDinamicaPaS = safeViscosity(dados.viscosidadeDinamicaPaS ?? this.fluidoOperante.viscosidadeDinamicaPaS);
        this.fluidoOperante.pressaoVaporBar = Math.max(0.0001, Number(dados.pressaoVaporBar) || this.fluidoOperante.pressaoVaporBar);
        this.fluidoOperante.pressaoAtmosfericaBar = Math.max(0.5, Number(dados.pressaoAtmosfericaBar) || this.fluidoOperante.pressaoAtmosfericaBar);
        this.notify({ tipo: 'fluido_update', fluido: this.fluidoOperante });
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
        this.notify({ tipo: 'update_painel', dt: dt });

        profiler.endTick(this.getSolverMetrics());

        requestAnimationFrame(this.tick.bind(this));
    }

    resetHydraulicState() {
        this.connectionStates.clear();
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
        if (!this.connectionStates.has(conn)) {
            this.connectionStates.set(conn, {
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
            });
        }
        return this.connectionStates.get(conn);
    }

    getComponentById(id) {
        return this.componentes.find(c => c.id === id);
    }

    getOutputConnections(comp) {
        return this.conexoes.filter(conn => conn.sourceEl.dataset.compId === comp.id);
    }

    getInputConnections(comp) {
        return this.conexoes.filter(conn => conn.targetEl.dataset.compId === comp.id);
    }

    ensureConnectionProperties(conn) {
        if (typeof conn.diameterM !== 'number') conn.diameterM = DEFAULT_PIPE_DIAMETER_M;
        if (typeof conn.roughnessMm !== 'number') conn.roughnessMm = 0.045; // DEFAULT_PIPE_ROUGHNESS_MM
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

    // Usa utilitário importado PipeHydraulics.getConnectionGeometry
    getConnectionGeometry(conn) {
        return getConnectionGeometry(conn, conn.sourceEl, conn.targetEl, this.usarAlturaRelativa);
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
            if (opening <= 0) return 1e6;
            const cvFactor = Math.max(0.2, target.cv);
            const characteristicFactor = target.getCharacteristicFactor(opening);
            return target.perdaLocalK + (1.0 / Math.max(0.025, Math.pow(characteristicFactor, 2.1) * cvFactor));
        }
        if (target instanceof BombaLogica) return 0;
        if (target instanceof TanqueLogico) return target.perdaEntradaK;
        if (target instanceof DrenoLogico) return target.perdaEntradaK;
        return 0;
    }

    getTargetEntranceArea(target) {
        if (target && typeof target.getAreaConexaoM2 === 'function') return target.getAreaConexaoM2();
        return areaFromDiameter(DEFAULT_PIPE_DIAMETER_M);
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
            const absSuctionBar = this.fluidoOperante.pressaoAtmosfericaBar + inletPressure;
            const npshAvailableM = Math.max(
                0,
                ((absSuctionBar - this.fluidoOperante.pressaoVaporBar) * BAR_TO_PA) / (this.fluidoOperante.densidade * GRAVITY)
            );
            const cavitationFactor = comp.calcularFatorCavitacao(npshAvailableM);
            const boostBar = comp.pressaoMaxima * drive * drive * Math.max(0.05, curveFrac) * cavitationFactor;
            const effectiveQRemaining = qRemaining * Math.max(0.25, cavitationFactor);

            comp.npshDisponivelM = npshAvailableM;
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
            const opening = comp.getAberturaNormalizadaAtual();
            if (opening <= 0) return null;

            const availableFlow = estimating ? MAX_NETWORK_FLOW_LPS : comp.getFluxoPendenteLps();
            if (availableFlow <= EPSILON_FLOW) return null;

            const cvFactor = Math.max(0.2, comp.cv);
            const characteristicFactor = comp.getCharacteristicFactor(opening);
            const hydraulicAreaM2 = areaM2 * Math.max(0.08, characteristicFactor);
            const localLossCoeff = comp.perdaLocalK + (1.0 / Math.max(0.025, Math.pow(characteristicFactor, 2.1) * cvFactor));

            return {
                availableFlowLps: availableFlow,
                pressureBar: inletPressureBar ?? comp.getPressaoEntradaBar(),
                hydraulicAreaM2,
                localLossCoeff,
                characteristicFactor
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

        const target = this.getComponentById(conn.targetEl.dataset.compId);
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

        let provisionalUpstreamLossBar = pressureLossFromFlow(capacityLps, branchAreaM2, density, upstreamLossCoeff);
        let inletPressureBar = Math.max(backPressureBar, supply.pressureBar + staticHeadBar - provisionalUpstreamLossBar);
        let targetEntryLossBar = pressureLossFromFlow(capacityLps, branchAreaM2, density, targetEntryLossCoeff);
        let outletPressureBar = Math.max(backPressureBar, inletPressureBar - targetEntryLossBar);

        // A valvula agora repassa seu proprio coeficiente de perda, entao podemos usar 
        // a pressao residual provisoria normal sem medo de zerar o fluxo indevidamente.
        const downstreamInletPressureBar = inletPressureBar;
        const downstreamLimit = this.estimateComponentPotential(
            target,
            downstreamInletPressureBar,
            dt,
            new Set(visited)
        );

        if (Number.isFinite(downstreamLimit)) {
            capacityLps = Math.min(capacityLps, downstreamLimit);
            pipeHydraulics = this.getPipeHydraulics(conn, geometry, branchAreaM2, capacityLps);
            upstreamLossCoeff = 1 + conn.perdaLocalK + pipeHydraulics.distributedLossCoeff + (supply.localLossCoeff || 0);
            totalLossCoeff = upstreamLossCoeff + targetEntryLossCoeff;
            provisionalUpstreamLossBar = pressureLossFromFlow(capacityLps, branchAreaM2, density, upstreamLossCoeff);
            inletPressureBar = Math.max(backPressureBar, supply.pressureBar + staticHeadBar - provisionalUpstreamLossBar);
            targetEntryLossBar = pressureLossFromFlow(capacityLps, branchAreaM2, density, targetEntryLossCoeff);
            outletPressureBar = Math.max(backPressureBar, inletPressureBar - targetEntryLossBar);
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

        const target = this.getComponentById(conn.targetEl.dataset.compId);
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
        target.registrarEntrada(actualFlowLps, inletPressureBar);

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
        solverMetrics.totalSolverCalls++;
        this.resetHydraulicState();
        this.conexoes.forEach(conn => {
            this.ensureConnectionProperties(conn);
            conn._activeTick = false;
        });

        const queue = [];
        const visits = new Map();
        const enqueue = (comp) => {
            if (!comp) return;
            const nextVisits = (visits.get(comp.id) || 0) + 1;
            if (nextVisits > MAX_COMPONENT_VISITS) return;
            visits.set(comp.id, nextVisits);
            queue.push(comp);
        };

        this.componentes.forEach(comp => {
            if (comp instanceof FonteLogica) enqueue(comp);
            else if (comp instanceof TanqueLogico && comp.volumeAtual > EPSILON_FLOW) enqueue(comp);
        });

        let steps = 0;
        if (DEBUG_PHYSICS) console.log(`[Solver] Iniciando com ${this.componentes.length} componentes, máx ${MAX_QUEUE_STEPS} iterações`);
        
        while (queue.length > 0 && steps < MAX_QUEUE_STEPS) {
            steps += 1;
            const comp = queue.shift();
            if (!this.hasPendingEmission(comp, dt)) continue;

            const outputs = this.getOutputConnections(comp);
            if (outputs.length === 0) continue;

            const supply = this.buildSupplyState(comp, dt);
            if (!supply || supply.availableFlowLps <= EPSILON_FLOW) continue;

            const visited = new Set([comp.id]);
            const estimates = outputs
                .map(conn => ({ conn, estimate: this.estimateBranch(comp, conn, supply, dt, visited) }))
                .filter(item => item.estimate.capacityLps > EPSILON_FLOW);

            if (estimates.length === 0) {
                if (comp instanceof FonteLogica || comp instanceof TanqueLogico) comp.marcarEmissaoIntrinseca();
                continue;
            }

            const totalCapacity = estimates.reduce((sum, item) => sum + item.estimate.capacityLps, 0);
            const totalFlow = Math.min(supply.availableFlowLps, totalCapacity);
            if (totalFlow <= EPSILON_FLOW) {
                if (comp instanceof FonteLogica || comp instanceof TanqueLogico) comp.marcarEmissaoIntrinseca();
                continue;
            }

            let emittedFlowLps = 0;

            estimates.forEach(item => {
                const share = totalCapacity > EPSILON_FLOW ? item.estimate.capacityLps / totalCapacity : 0;
                const branchFlow = totalFlow * share;
                if (branchFlow <= EPSILON_FLOW) return;

                const deliveredFlow = this.applyBranchFlow(comp, item.conn, supply, item.estimate, branchFlow, dt);
                emittedFlowLps += deliveredFlow;
                const target = this.getComponentById(item.conn.targetEl.dataset.compId);
                if (deliveredFlow > EPSILON_FLOW && (target instanceof BombaLogica || target instanceof ValvulaLogica)) enqueue(target);
            });

            if (comp instanceof FonteLogica || comp instanceof TanqueLogico) comp.marcarEmissaoIntrinseca();
            else if (emittedFlowLps > EPSILON_FLOW) comp.consumirEntrada(emittedFlowLps);
        }

        // Rastreamento de convergência do solver
        solverMetrics.lastIterations = steps;
        if (steps === MAX_QUEUE_STEPS) {
            solverMetrics.maxIterationsHit++;
            if (DEBUG_PHYSICS) console.warn(`[Solver] ⚠️ Limite de iterações atingido (${MAX_QUEUE_STEPS}). Queue final: ${queue.length} componentes pendentes.`);
        } else {
            solverMetrics.convergedCount++;
            if (DEBUG_PHYSICS) console.log(`[Solver] Convergiu em ${steps} iterações com sucesso.`);
        }

        this.relaxIdleConnections(dt);
    }

    updatePipesVisual() {
        this.conexoes.forEach(conn => {
            const state = this.getConnectionState(conn);
            const flow = this.isRunning ? state.flowLps : 0;

            if (flow > 0.05) {
                conn.path.classList.add('active');
                if (!conn.path.classList.contains('selected')) {
                    conn.path.setAttribute("marker-end", "url(#arrow-active)");
                }
            } else {
                conn.path.classList.remove('active');
                if (!conn.path.classList.contains('selected')) {
                    conn.path.setAttribute("marker-end", "url(#arrow)");
                }
            }

            const labelFlow = connectionFlowGetter ? connectionFlowGetter(conn) : flow;
            if (conn.label) {
                if (!this.isRunning || labelFlow === null || labelFlow === undefined || labelFlow <= EPSILON_FLOW) {
                    conn.label.textContent = '';
                } else {
                    conn.label.textContent = `${formatUnitValue('flow', labelFlow, 2)} ${getUnitSymbol('flow')}`;
                }
            }

            conn.path.setAttribute(
                'data-hydraulic-state',
                `${formatUnitValue('flow', flow, 2)} ${getUnitSymbol('flow')} | ${state.velocityMps.toFixed(2)} m/s | Re ${Math.round(state.reynolds)} | ${state.regime}`
            );
        });

        if (this.isRunning) {
            this.componentes.forEach(c => {
                if (c instanceof TanqueLogico && c.setpointAtivo) {
                    const notificarEstado = (equipamento) => {
                        if (equipamento instanceof ValvulaLogica) {
                            equipamento.notify({ tipo: 'estado', aberta: equipamento.aberta, grau: equipamento.grauAbertura });
                        } else if (equipamento instanceof BombaLogica) {
                            equipamento.notify({ tipo: 'estado', isOn: equipamento.isOn, grau: equipamento.grauAcionamento });
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
