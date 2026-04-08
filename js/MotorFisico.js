// ==================================
// MODELO: Logica e Fisica do Sistema
// Ficheiro: js/MotorFisico.js
// ==================================

let portStateUpdater = null;
let connectionFlowGetter = null;

const BAR_TO_PA = 100000;
const GRAVITY = 9.81;
const LPS_TO_M3S = 0.001;
const M3S_TO_LPS = 1000;
const EPSILON_FLOW = 0.0001;
const DEFAULT_PIPE_DIAMETER_M = 0.08;
const DEFAULT_PIPE_FRICTION = 0.028;
const DEFAULT_PIPE_ROUGHNESS_MM = 0.045;
const DEFAULT_PIPE_EXTRA_LENGTH_M = 0;
const DEFAULT_PIPE_MINOR_LOSS = 0.8;
const DEFAULT_ENTRY_LOSS = 0.35;
const DEFAULT_FLUID_VISCOSITY_PA_S = 0.00089;
const DEFAULT_FLUID_VAPOR_PRESSURE_BAR = 0.0317;
const DEFAULT_ATMOSPHERIC_PRESSURE_BAR = 1.01325;
const PIXELS_PER_METER = 80;
const MAX_NETWORK_FLOW_LPS = 500;
const MAX_QUEUE_STEPS = 512;
const MAX_COMPONENT_VISITS = 8;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (start, end, t) => start + ((end - start) * t);
const lpsToM3s = (value) => value * LPS_TO_M3S;
const m3sToLps = (value) => value * M3S_TO_LPS;
const areaFromDiameter = (diameterM) => Math.PI * Math.pow(diameterM / 2, 2);
const pressureFromHeadBar = (headM, density) => (density * GRAVITY * headM) / BAR_TO_PA;
const safeLossCoeff = (lossCoeff) => Math.max(0.1, lossCoeff);
const safeViscosity = (value) => Math.max(0.00001, value || DEFAULT_FLUID_VISCOSITY_PA_S);
const smoothFirstOrder = (current, target, dt, timeConstantS) => {
    if (dt <= 0) return target;
    if (!Number.isFinite(timeConstantS) || timeConstantS <= 0.001) return target;
    const alpha = 1 - Math.exp(-dt / timeConstantS);
    return current + ((target - current) * alpha);
};

function flowFromBernoulli(deltaPBar, areaM2, density, lossCoeff) {
    if (deltaPBar <= 0 || areaM2 <= 0) return 0;
    const velocity = Math.sqrt((2 * deltaPBar * BAR_TO_PA) / (density * safeLossCoeff(lossCoeff)));
    return m3sToLps(areaM2 * velocity);
}

function pressureLossFromFlow(flowLps, areaM2, density, lossCoeff) {
    if (flowLps <= 0 || areaM2 <= 0) return 0;
    const velocity = lpsToM3s(flowLps) / areaM2;
    return ((density * velocity * velocity * safeLossCoeff(lossCoeff)) / 2) / BAR_TO_PA;
}

function reynoldsFromFlow(flowLps, diameterM, areaM2, density, viscosityPaS) {
    if (flowLps <= 0 || diameterM <= 0 || areaM2 <= 0) return 0;
    const velocity = lpsToM3s(flowLps) / areaM2;
    return (density * velocity * diameterM) / safeViscosity(viscosityPaS);
}

function darcyFrictionFactor(reynolds, relativeRoughness) {
    if (!Number.isFinite(reynolds) || reynolds <= 0) return DEFAULT_PIPE_FRICTION;
    if (reynolds < 2300) return clamp(64 / reynolds, 0.008, 0.15);

    const turbulent = 0.25 / Math.pow(
        Math.log10((relativeRoughness / 3.7) + (5.74 / Math.pow(reynolds, 0.9))),
        2
    );

    if (reynolds < 4000) {
        const laminar = 64 / reynolds;
        const blend = (reynolds - 2300) / (4000 - 2300);
        return clamp(lerp(laminar, turbulent, blend), 0.008, 0.15);
    }

    return clamp(turbulent, 0.008, 0.15);
}

function classifyFlowRegime(reynolds) {
    if (reynolds <= 0) return 'sem fluxo';
    if (reynolds < 2300) return 'laminar';
    if (reynolds < 4000) return 'transicao';
    return 'turbulento';
}

export const FLUID_PRESETS = {
    agua: {
        nome: 'Agua',
        densidade: 997,
        temperatura: 25,
        viscosidadeDinamicaPaS: 0.00089,
        pressaoVaporBar: 0.0317
    },
    oleo_leve: {
        nome: 'Oleo leve',
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

export class Observable {
    constructor() {
        this.listeners = [];
    }

    subscribe(fn) {
        this.listeners.push(fn);
    }

    notify(data) {
        this.listeners.forEach(fn => fn(data));
    }
}

export class Fluido {
    constructor(
        nome,
        densidade,
        pressao,
        temperatura,
        viscosidadeDinamicaPaS = DEFAULT_FLUID_VISCOSITY_PA_S,
        pressaoVaporBar = DEFAULT_FLUID_VAPOR_PRESSURE_BAR,
        pressaoAtmosfericaBar = DEFAULT_ATMOSPHERIC_PRESSURE_BAR
    ) {
        this.nome = nome;
        this.densidade = densidade;
        this.pressao = pressao; // bar(g)
        this.temperatura = temperatura;
        this.viscosidadeDinamicaPaS = viscosidadeDinamicaPaS;
        this.pressaoVaporBar = pressaoVaporBar;
        this.pressaoAtmosfericaBar = pressaoAtmosfericaBar;
    }
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
    }

    add(comp) {
        this.componentes.push(comp);
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

    getConnectionGeometry(conn) {
        const p1 = this.getLogicalPortPosition(conn.sourceEl);
        const p2 = this.getLogicalPortPosition(conn.targetEl);
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const straightLengthM = Math.max(0.35, Math.sqrt(dx * dx + dy * dy) / PIXELS_PER_METER);
        const extraLengthM = Math.max(0, conn.extraLengthM || 0);

        return {
            straightLengthM,
            lengthM: straightLengthM + extraLengthM,
            headGainM: (p2.y - p1.y) / PIXELS_PER_METER
        };
    }

    getPipeHydraulics(conn, geometry, areaM2, flowLps) {
        const density = this.fluidoOperante.densidade;
        const viscosityPaS = this.fluidoOperante.viscosidadeDinamicaPaS;
        const reynolds = reynoldsFromFlow(flowLps, conn.diameterM, areaM2, density, viscosityPaS);
        const relativeRoughness = conn.diameterM > 0 ? (Math.max(0, conn.roughnessMm || 0) / 1000) / conn.diameterM : 0;
        const frictionFactor = darcyFrictionFactor(reynolds, relativeRoughness);
        const velocityMps = areaM2 > 0 ? lpsToM3s(flowLps) / areaM2 : 0;

        return {
            velocityMps,
            reynolds,
            relativeRoughness,
            frictionFactor,
            regime: classifyFlowRegime(reynolds),
            distributedLossCoeff: frictionFactor * (geometry.lengthM / Math.max(conn.diameterM, 0.001))
        };
    }

    getConnectionResponseTimeS(conn, geometry) {
        this.ensureConnectionProperties(conn);
        const lineVolumeL = geometry.lengthM * conn.areaM2 * 1000;
        const densityFactor = clamp(this.fluidoOperante.densidade / 997, 0.55, 1.8);
        const viscosityFactor = clamp(this.fluidoOperante.viscosidadeDinamicaPaS / DEFAULT_FLUID_VISCOSITY_PA_S, 0.5, 8);
        const baseTimeS = 0.08 + (geometry.lengthM * 0.035) + (lineVolumeL * 0.018 * densityFactor);
        return clamp(baseTimeS * Math.pow(viscosityFactor, 0.12), 0.05, 2.8);
    }

    applyConnectionDynamics(conn, targetFlowLps, dt, geometry) {
        const responseTimeS = this.getConnectionResponseTimeS(conn, geometry);
        const actualFlowLps = smoothFirstOrder(
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
        if (target instanceof TanqueLogico) return target.getBackPressureAtInletBar(this.fluidoOperante);
        if (target instanceof DrenoLogico) return target.pressaoSaidaBar;
        return 0;
    }

    getTargetEntryLossCoeff(target) {
        if (target instanceof ValvulaLogica) return 0;
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
            const hydrostaticPressureBar = comp.getPressaoDisponivelSaidaBar(this.fluidoOperante);
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
            const localLossCoeff = comp.perdaLocalK / Math.max(0.025, Math.pow(characteristicFactor, 2.1) * cvFactor);

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

        const downstreamLimit = this.estimateComponentPotential(
            target,
            inletPressureBar,
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

        const dynamics = this.applyConnectionDynamics(conn, flowLps, dt, estimate.geometry);
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
                    conn.label.textContent = labelFlow.toFixed(1) + ' L/s';
                }
            }

            conn.path.setAttribute(
                'data-hydraulic-state',
                `${flow.toFixed(2)} L/s | ${state.velocityMps.toFixed(2)} m/s | Re ${Math.round(state.reynolds)} | ${state.regime}`
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

export class ComponenteFisico extends Observable {
    constructor(id, tag, x, y) {
        super();
        this.id = id;
        this.tag = tag;
        this.x = x;
        this.y = y;
        this.inputs = [];
        this.outputs = [];
        this.diametroConexaoM = DEFAULT_PIPE_DIAMETER_M;
        this.resetEstadoHidraulico();
    }

    resetEstadoHidraulico() {
        this.estadoHidraulico = {
            entradaVazaoLps: 0,
            entradaPressaoPonderadaBar: 0,
            entradaConsumidaLps: 0,
            saidaVazaoLps: 0,
            saidaPressaoPonderadaBar: 0,
            emissaoIntrinsecaConsumida: false
        };
        this.pressaoEntradaAtualBar = 0;
        this.pressaoSaidaAtualBar = 0;
    }

    getAreaConexaoM2() {
        return areaFromDiameter(this.diametroConexaoM);
    }

    getPressaoEntradaBar() {
        if (this.estadoHidraulico.entradaVazaoLps <= EPSILON_FLOW) return 0;
        return this.estadoHidraulico.entradaPressaoPonderadaBar / this.estadoHidraulico.entradaVazaoLps;
    }

    getPressaoSaidaBar() {
        if (this.estadoHidraulico.saidaVazaoLps <= EPSILON_FLOW) return 0;
        return this.estadoHidraulico.saidaPressaoPonderadaBar / this.estadoHidraulico.saidaVazaoLps;
    }

    getFluxoPendenteLps() {
        return Math.max(0, this.estadoHidraulico.entradaVazaoLps - this.estadoHidraulico.entradaConsumidaLps);
    }

    registrarEntrada(flowLps, pressureBar) {
        if (flowLps <= EPSILON_FLOW) return;
        this.estadoHidraulico.entradaVazaoLps += flowLps;
        this.estadoHidraulico.entradaPressaoPonderadaBar += pressureBar * flowLps;
    }

    registrarSaida(flowLps, pressureBar) {
        if (flowLps <= EPSILON_FLOW) return;
        this.estadoHidraulico.saidaVazaoLps += flowLps;
        this.estadoHidraulico.saidaPressaoPonderadaBar += pressureBar * flowLps;
    }

    consumirEntrada(flowLps) {
        if (flowLps <= EPSILON_FLOW) return;
        this.estadoHidraulico.entradaConsumidaLps += flowLps;
    }

    marcarEmissaoIntrinseca() {
        this.estadoHidraulico.emissaoIntrinsecaConsumida = true;
    }

    jaEmitiuIntrinseco() {
        return this.estadoHidraulico.emissaoIntrinsecaConsumida;
    }

    sincronizarMetricasFisicas() {
        this.pressaoEntradaAtualBar = this.getPressaoEntradaBar();
        this.pressaoSaidaAtualBar = this.getPressaoSaidaBar();
    }

    atualizarDinamica() {}

    conectarSaida(destino) {
        if (!this.outputs.includes(destino)) {
            this.outputs.push(destino);
            destino.inputs.push(this);
            this.notify({ tipo: 'conexao', source: this, target: destino });
        }
    }

    desconectarSaida(destino) {
        this.outputs = this.outputs.filter(out => out !== destino);
        destino.inputs = destino.inputs.filter(inp => inp !== this);
    }

    getFluxoSaida() {
        return this.estadoHidraulico.saidaVazaoLps || 0;
    }
}

export class FonteLogica extends ComponenteFisico {
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.pressaoFonteBar = 1.0;
        this.vazaoMaxima = MAX_NETWORK_FLOW_LPS;
        this.fluxoReal = 0;
    }

    sincronizarMetricasFisicas() {
        super.sincronizarMetricasFisicas();
        this.pressaoSaidaAtualBar = this.pressaoFonteBar;
        this.fluxoReal = this.estadoHidraulico.saidaVazaoLps;
    }
}

export class DrenoLogico extends ComponenteFisico {
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.pressaoSaidaBar = 0.0;
        this.perdaEntradaK = 1.1;
        this.vazaoRecebidaLps = 0;
    }

    sincronizarMetricasFisicas() {
        super.sincronizarMetricasFisicas();
        this.vazaoRecebidaLps = this.estadoHidraulico.entradaVazaoLps;
    }

    getFluxoSaidaFromTank(nivelNormalizado) {
        const headBar = pressureFromHeadBar(Math.max(0, nivelNormalizado) * 2.4, ENGINE.fluidoOperante.densidade);
        return flowFromBernoulli(headBar, this.getAreaConexaoM2(), ENGINE.fluidoOperante.densidade, 1 + this.perdaEntradaK);
    }
}

export class BombaLogica extends ComponenteFisico {
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.isOn = false;
        this.vazaoNominal = 45.0;
        this.grauAcionamento = 0;
        this.acionamentoEfetivo = 0;
        this.pressaoMaxima = 5.0;
        this.eficienciaHidraulica = 0.78;
        this.eficienciaAtual = this.eficienciaHidraulica;
        this.npshRequeridoM = 2.5;
        this.npshDisponivelM = 0;
        this.fatorCavitacaoAtual = 1;
        this.tempoRampaSegundos = 1.6;
        this.fracaoMelhorEficiencia = 0.72;
        this.fluxoReal = 0;
        this.pressaoSucaoAtualBar = 0;
        this.pressaoDescargaAtualBar = 0;
        this.cargaGeradaBar = 0;
    }

    calcularFatorCavitacao(npshDisponivelM) {
        if (npshDisponivelM >= this.npshRequeridoM * 1.1) return 1;
        return clamp(Math.pow(npshDisponivelM / Math.max(0.1, this.npshRequeridoM), 1.7), 0.12, 1);
    }

    toggle() {
        this.setAcionamento(this.grauAcionamento > 0 ? 0 : 100);
    }

    getDriveAtual() {
        return clamp(this.acionamentoEfetivo / 100.0, 0, 1);
    }

    getEficienciaInstantanea(flowLps = this.fluxoReal) {
        const drive = this.getDriveAtual();
        const qMax = this.vazaoNominal * drive;
        if (qMax <= EPSILON_FLOW) return Math.max(0.2, this.eficienciaHidraulica * 0.6);

        const qBep = Math.max(EPSILON_FLOW, qMax * this.fracaoMelhorEficiencia);
        const deviation = (flowLps - qBep) / qBep;
        const efficiencyShape = 1 - (0.32 * deviation * deviation);
        return clamp(this.eficienciaHidraulica * efficiencyShape, 0.22, this.eficienciaHidraulica);
    }

    setAcionamento(valor) {
        this.grauAcionamento = clamp(Number(valor) || 0, 0, 100);
        if (!ENGINE.isRunning) this.acionamentoEfetivo = this.grauAcionamento;
        this.isOn = this.acionamentoEfetivo > 0.5;
        this.notify({ tipo: 'estado', isOn: this.isOn, grau: this.grauAcionamento, grauEfetivo: this.acionamentoEfetivo });
    }

    atualizarDinamica(dt) {
        const previousDrive = this.acionamentoEfetivo;
        this.acionamentoEfetivo = smoothFirstOrder(previousDrive, this.grauAcionamento, dt, this.tempoRampaSegundos);
        this.isOn = this.acionamentoEfetivo > 0.5;

        if (Math.abs(this.acionamentoEfetivo - previousDrive) > 0.05) {
            this.notify({ tipo: 'estado', isOn: this.isOn, grau: this.grauAcionamento, grauEfetivo: this.acionamentoEfetivo });
        }
    }

    sincronizarMetricasFisicas() {
        super.sincronizarMetricasFisicas();
        this.fluxoReal = this.estadoHidraulico.saidaVazaoLps;
        this.pressaoSucaoAtualBar = this.getPressaoEntradaBar();
        const drive = this.getDriveAtual();
        const qMax = this.vazaoNominal * drive;
        const curveFrac = qMax > EPSILON_FLOW ? 1 - Math.pow(clamp(this.fluxoReal / qMax, 0, 1), 2) : 0;
        this.eficienciaAtual = this.getEficienciaInstantanea(this.fluxoReal);
        this.cargaGeradaBar = drive > 0 ? this.pressaoMaxima * drive * drive * Math.max(0.05, curveFrac) * this.fatorCavitacaoAtual : 0;
        this.pressaoDescargaAtualBar = this.pressaoSucaoAtualBar + this.cargaGeradaBar;
        this.pressaoSaidaAtualBar = this.pressaoDescargaAtualBar;
    }

    getFluxoSaidaFromTank() {
        return this.fluxoReal;
    }
}

export class ValvulaLogica extends ComponenteFisico {
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.aberta = false;
        this.grauAbertura = 0;
        this.aberturaEfetiva = 0;
        this.fluxoReal = 0;
        this.cv = 4.0;
        this.perdaLocalK = 6.0;
        this.tipoCaracteristica = 'equal_percentage';
        this.rangeabilidade = 30;
        this.deltaPAtualBar = 0;
        this.tempoCursoSegundos = 0.85;
    }

    getCharacteristicFactor(opening) {
        const safeOpening = clamp(opening, 0, 1);
        if (this.tipoCaracteristica === 'linear') return safeOpening;
        if (this.tipoCaracteristica === 'quick_opening') return Math.sqrt(safeOpening);
        const minFactor = 1 / Math.max(2, this.rangeabilidade);
        const normalized = (Math.pow(this.rangeabilidade, safeOpening) - 1) / (this.rangeabilidade - 1);
        return clamp(minFactor + ((1 - minFactor) * normalized), minFactor, 1);
    }

    toggle() {
        this.setAbertura(this.grauAbertura > 0 ? 0 : 100);
    }

    getAberturaNormalizadaAtual() {
        return clamp(this.aberturaEfetiva / 100.0, 0, 1);
    }

    setAbertura(valor) {
        this.grauAbertura = clamp(Number(valor) || 0, 0, 100);
        if (!ENGINE.isRunning) this.aberturaEfetiva = this.grauAbertura;
        this.aberta = this.aberturaEfetiva > 0.5;
        this.notify({ tipo: 'estado', aberta: this.aberta, grau: this.grauAbertura, grauEfetivo: this.aberturaEfetiva });
    }

    atualizarDinamica(dt) {
        const previousOpening = this.aberturaEfetiva;
        this.aberturaEfetiva = smoothFirstOrder(previousOpening, this.grauAbertura, dt, this.tempoCursoSegundos);
        this.aberta = this.aberturaEfetiva > 0.5;

        if (Math.abs(this.aberturaEfetiva - previousOpening) > 0.05) {
            this.notify({ tipo: 'estado', aberta: this.aberta, grau: this.grauAbertura, grauEfetivo: this.aberturaEfetiva });
        }
    }

    sincronizarMetricasFisicas() {
        super.sincronizarMetricasFisicas();
        this.fluxoReal = this.estadoHidraulico.saidaVazaoLps;
        const opening = this.getAberturaNormalizadaAtual();
        const cvFactor = Math.max(0.2, this.cv);
        const characteristicFactor = this.getCharacteristicFactor(opening);
        const areaM2 = this.getAreaConexaoM2() * Math.max(0.08, characteristicFactor);
        const localLossCoeff = this.perdaLocalK / Math.max(0.025, Math.pow(Math.max(characteristicFactor, 0.01), 2.1) * cvFactor);
        this.deltaPAtualBar = opening > 0
            ? pressureLossFromFlow(this.fluxoReal, areaM2, ENGINE.fluidoOperante.densidade, localLossCoeff)
            : 0;
        this.pressaoSaidaAtualBar = Math.max(0, this.pressaoEntradaAtualBar - this.deltaPAtualBar);
    }

    getFluxoSaidaFromTank() {
        return this.fluxoReal;
    }
}

export class TanqueLogico extends ComponenteFisico {
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.capacidadeMaxima = 1000.0;
        this.volumeAtual = 0;
        this.lastQin = 0;
        this.lastQout = 0;
        this.alturaUtilMetros = 2.4;
        this.coeficienteSaida = 0.82;
        this.perdaEntradaK = 1.0;
        this.alturaBocalEntradaM = 2.2;
        this.alturaBocalSaidaM = 0.1;
        this.volumeInicial = 0;
        this.pressaoFundoBar = 0;
        this.setpointAtivo = false;
        this.setpoint = 50;
        this.kp = 250;
        this.ki = 25;
        this._ctrlIntegral = 0;
        this._lastErro = 0;
    }

    getNivelNormalizado() {
        return this.capacidadeMaxima > 0 ? clamp(this.volumeAtual / this.capacidadeMaxima, 0, 1) : 0;
    }

    getAlturaLiquidoM() {
        return this.getNivelNormalizado() * this.alturaUtilMetros;
    }

    normalizarAlturasBocais() {
        this.alturaBocalEntradaM = clamp(this.alturaBocalEntradaM, 0, this.alturaUtilMetros);
        this.alturaBocalSaidaM = clamp(this.alturaBocalSaidaM, 0, this.alturaUtilMetros);
    }

    getPressaoHidrostaticaBar(fluido) {
        return pressureFromHeadBar(this.getAlturaLiquidoM(), fluido.densidade);
    }

    getPressaoDisponivelSaidaBar(fluido) {
        this.normalizarAlturasBocais();
        const availableHeadM = Math.max(0, this.getAlturaLiquidoM() - this.alturaBocalSaidaM);
        return pressureFromHeadBar(availableHeadM, fluido.densidade);
    }

    getBackPressureAtInletBar(fluido) {
        this.normalizarAlturasBocais();
        const submergedHeightM = Math.max(0, this.getAlturaLiquidoM() - this.alturaBocalEntradaM);
        return pressureFromHeadBar(submergedHeightM, fluido.densidade);
    }

    _rodarControlador(dt) {
        if (!this.setpointAtivo) return;

        const erro = (this.setpoint / 100) - this.getNivelNormalizado();
        if (this._lastErro !== undefined && (this._lastErro * erro < 0)) this._ctrlIntegral = 0;
        this._lastErro = erro;
        this._ctrlIntegral += erro * dt;

        const clampInt = this.ki > 0 ? 1 / this.ki : 1;
        this._ctrlIntegral = Math.max(-clampInt, Math.min(clampInt, this._ctrlIntegral));

        const u = Math.max(-1, Math.min(1, this.kp * erro + this.ki * this._ctrlIntegral));
        const grauEntrada = Math.max(0, u * 100);
        const grauSaida = Math.max(0, -u * 100);

        this.inputs.forEach(c => {
            if (c instanceof ValvulaLogica) c.setAbertura(grauEntrada);
            else if (c instanceof BombaLogica) c.setAcionamento(grauEntrada);
        });

        this.outputs.forEach(c => {
            if (c instanceof ValvulaLogica) c.setAbertura(grauSaida);
            else if (c instanceof BombaLogica) c.setAcionamento(grauSaida);
        });

        this.notify({ tipo: 'ctrl_update', grau: u * 100, erro: erro });
    }

    resetControlador() {
        this._ctrlIntegral = 0;
        this._lastErro = 0;
    }

    atualizarFisica(dt, fluido) {
        this.normalizarAlturasBocais();
        this.lastQin = this.estadoHidraulico.entradaVazaoLps;
        this.lastQout = this.estadoHidraulico.saidaVazaoLps;
        this.volumeAtual += (this.lastQin - this.lastQout) * dt;
        this.volumeAtual = clamp(this.volumeAtual, 0, this.capacidadeMaxima);
        this.pressaoFundoBar = this.getPressaoHidrostaticaBar(fluido);
        this.sincronizarMetricasFisicas(fluido);

        this.notify({
            tipo: 'volume',
            perc: this.capacidadeMaxima > 0 ? this.volumeAtual / this.capacidadeMaxima : 0,
            abs: this.volumeAtual,
            qIn: this.lastQin,
            qOut: this.lastQout,
            pBottom: this.pressaoFundoBar
        });
    }

    sincronizarMetricasFisicas(fluido) {
        this.normalizarAlturasBocais();
        super.sincronizarMetricasFisicas(fluido);
        this.pressaoFundoBar = this.getPressaoHidrostaticaBar(fluido || ENGINE.fluidoOperante);
    }

    getFluxoSaida() {
        return this.lastQout || 0;
    }

    getFluxoSaidaFromTank(nivelMontante) {
        const headBar = pressureFromHeadBar(
            Math.max(0, (nivelMontante * this.alturaUtilMetros) - this.alturaBocalSaidaM),
            ENGINE.fluidoOperante.densidade
        );
        return flowFromBernoulli(
            headBar,
            this.getAreaConexaoM2(),
            ENGINE.fluidoOperante.densidade,
            1.0 / Math.max(0.15, this.coeficienteSaida * this.coeficienteSaida)
        );
    }
}
