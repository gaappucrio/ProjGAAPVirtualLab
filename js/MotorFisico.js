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
const DEFAULT_PIPE_MINOR_LOSS = 0.8;
const DEFAULT_ENTRY_LOSS = 0.35;
const PIXELS_PER_METER = 80;
const MAX_NETWORK_FLOW_LPS = 500;
const MAX_QUEUE_STEPS = 512;
const MAX_COMPONENT_VISITS = 8;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lpsToM3s = (value) => value * LPS_TO_M3S;
const m3sToLps = (value) => value * M3S_TO_LPS;
const areaFromDiameter = (diameterM) => Math.PI * Math.pow(diameterM / 2, 2);
const pressureFromHeadBar = (headM, density) => (density * GRAVITY * headM) / BAR_TO_PA;
const safeLossCoeff = (lossCoeff) => Math.max(0.1, lossCoeff);

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
    constructor(nome, densidade, pressao, temperatura) {
        this.nome = nome;
        this.densidade = densidade;
        this.pressao = pressao; // bar(g)
        this.temperatura = temperatura;
    }
}

export class SistemaSimulacao extends Observable {
    constructor() {
        super();
        this.velocidade = 1.0;
        this.fluidoOperante = new Fluido("Agua", 1000.0, 1.0, 25.0);
        this.componentes = [];
        this.conexoes = [];
        this.connectionStates = new Map();
        this.isRunning = false;
        this.lastTime = 0;
        this.elapsedTime = 0;
        this.selectedComponent = null;
    }

    add(comp) {
        this.componentes.push(comp);
    }

    clear() {
        this.componentes = [];
        this.conexoes.forEach(c => {
            c.path.remove();
            if (c.label) c.label.remove();
        });
        this.conexoes = [];
        this.connectionStates.clear();
        this.isRunning = false;
        this.elapsedTime = 0;
        this.notify({ tipo: 'selecao', componente: null });
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
        this.resetHydraulicState();
        this.notify({ tipo: 'estado_motor', rodando: false });
        this.updatePipesVisual();
    }

    selectComponent(comp) {
        this.selectedComponent = comp;
        this.notify({ tipo: 'selecao', componente: comp });
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

    getConnectionState(conn) {
        if (!this.connectionStates.has(conn)) {
            this.connectionStates.set(conn, {
                flowLps: 0,
                pressureBar: 0,
                sourcePressureBar: 0,
                backPressureBar: 0,
                velocityMps: 0,
                deltaPBar: 0,
                lengthM: 0,
                headGainM: 0
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
        if (typeof conn.fatorAtrito !== 'number') conn.fatorAtrito = DEFAULT_PIPE_FRICTION;
        if (typeof conn.perdaLocalK !== 'number') conn.perdaLocalK = DEFAULT_PIPE_MINOR_LOSS;
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

        return {
            lengthM: Math.max(0.35, Math.sqrt(dx * dx + dy * dy) / PIXELS_PER_METER),
            headGainM: (p2.y - p1.y) / PIXELS_PER_METER
        };
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
            const drive = clamp(comp.grauAcionamento / 100.0, 0, 1);
            return drive > 0 && comp.getFluxoPendenteLps() > EPSILON_FLOW;
        }
        if (comp instanceof ValvulaLogica) {
            return comp.grauAbertura > 0 && comp.getFluxoPendenteLps() > EPSILON_FLOW;
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
                localLossCoeff: 1.0
            };
        }

        if (comp instanceof TanqueLogico) {
            if (!estimating && comp.jaEmitiuIntrinseco()) return null;
            const availableFromInventory = dt > 0 ? comp.volumeAtual / dt : MAX_NETWORK_FLOW_LPS;
            const hydrostaticPressureBar = comp.getPressaoHidrostaticaBar(this.fluidoOperante);
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
            const drive = clamp(comp.grauAcionamento / 100.0, 0, 1);
            if (drive <= 0) return null;

            const qMax = comp.vazaoNominal * drive;
            const qRemaining = Math.max(0, qMax - comp.estadoHidraulico.saidaVazaoLps);
            const incomingFlow = estimating ? qRemaining : comp.getFluxoPendenteLps();
            if (incomingFlow <= EPSILON_FLOW || qRemaining <= EPSILON_FLOW) return null;

            const referenceFlow = clamp(comp.estadoHidraulico.saidaVazaoLps, 0, qMax);
            const curveFrac = qMax > EPSILON_FLOW ? 1 - Math.pow(referenceFlow / qMax, 2) : 0;
            const boostBar = comp.pressaoMaxima * drive * Math.max(0.08, curveFrac);
            const inletPressure = inletPressureBar ?? comp.getPressaoEntradaBar();

            return {
                availableFlowLps: Math.min(incomingFlow, qRemaining),
                pressureBar: inletPressure + boostBar,
                hydraulicAreaM2: areaM2,
                localLossCoeff: 1.0 / Math.max(0.2, comp.eficienciaHidraulica),
                boostBar
            };
        }

        if (comp instanceof ValvulaLogica) {
            const opening = clamp(comp.grauAbertura / 100.0, 0, 1);
            if (opening <= 0) return null;

            const availableFlow = estimating ? MAX_NETWORK_FLOW_LPS : comp.getFluxoPendenteLps();
            if (availableFlow <= EPSILON_FLOW) return null;

            const cvFactor = Math.max(0.2, comp.cv);
            const hydraulicAreaM2 = areaM2 * Math.max(0.12, opening);
            const localLossCoeff = comp.perdaLocalK / Math.max(0.04, Math.pow(opening, 2.2) * cvFactor);

            return {
                availableFlowLps: availableFlow,
                pressureBar: inletPressureBar ?? comp.getPressaoEntradaBar(),
                hydraulicAreaM2,
                localLossCoeff
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
        const pipeLossCoeff = 1 + conn.perdaLocalK + (conn.fatorAtrito * (geometry.lengthM / conn.diameterM));
        const upstreamLossCoeff = pipeLossCoeff + (supply.localLossCoeff || 0);
        const targetEntryLossCoeff = this.getTargetEntryLossCoeff(target);
        const totalLossCoeff = upstreamLossCoeff + targetEntryLossCoeff;
        const backPressureBar = this.getTargetBackPressureBar(target);
        const staticHeadBar = pressureFromHeadBar(geometry.headGainM, this.fluidoOperante.densidade);
        const availableDeltaPBar = Math.max(0, supply.pressureBar + staticHeadBar - backPressureBar);

        if (!target || availableDeltaPBar <= EPSILON_FLOW) {
            return {
                capacityLps: 0,
                areaM2: branchAreaM2,
                backPressureBar,
                totalLossCoeff,
                geometry
            };
        }

        let capacityLps = flowFromBernoulli(
            availableDeltaPBar,
            branchAreaM2,
            this.fluidoOperante.densidade,
            totalLossCoeff
        );

        const provisionalUpstreamLossBar = pressureLossFromFlow(
            capacityLps,
            branchAreaM2,
            this.fluidoOperante.densidade,
            upstreamLossCoeff
        );

        const inletPressureBar = Math.max(
            backPressureBar,
            supply.pressureBar + staticHeadBar - provisionalUpstreamLossBar
        );

        const downstreamLimit = this.estimateComponentPotential(
            target,
            inletPressureBar,
            dt,
            new Set(visited)
        );

        if (Number.isFinite(downstreamLimit)) capacityLps = Math.min(capacityLps, downstreamLimit);

        return {
            capacityLps,
            areaM2: branchAreaM2,
            backPressureBar,
            upstreamLossCoeff,
            targetEntryLossCoeff,
            totalLossCoeff,
            geometry
        };
    }

    applyBranchFlow(comp, conn, supply, estimate, flowLps) {
        if (flowLps <= EPSILON_FLOW) return;

        const target = this.getComponentById(conn.targetEl.dataset.compId);
        const upstreamLossBar = pressureLossFromFlow(
            flowLps,
            estimate.areaM2,
            this.fluidoOperante.densidade,
            estimate.upstreamLossCoeff
        );
        const inletPressureBar = Math.max(
            estimate.backPressureBar,
            supply.pressureBar + pressureFromHeadBar(estimate.geometry.headGainM, this.fluidoOperante.densidade) - upstreamLossBar
        );
        const targetEntryLossBar = pressureLossFromFlow(
            flowLps,
            estimate.areaM2,
            this.fluidoOperante.densidade,
            estimate.targetEntryLossCoeff
        );
        const arrivalPressureBar = Math.max(
            estimate.backPressureBar,
            inletPressureBar - targetEntryLossBar
        );
        const velocityMps = estimate.areaM2 > 0 ? lpsToM3s(flowLps) / estimate.areaM2 : 0;

        comp.registrarSaida(flowLps, supply.pressureBar);
        target.registrarEntrada(flowLps, inletPressureBar);

        const state = this.getConnectionState(conn);
        const flowBefore = state.flowLps;
        state.flowLps += flowLps;
        state.pressureBar = state.flowLps > EPSILON_FLOW
            ? ((state.pressureBar * flowBefore) + (inletPressureBar * flowLps)) / state.flowLps
            : inletPressureBar;
        state.sourcePressureBar = Math.max(state.sourcePressureBar, supply.pressureBar);
        state.backPressureBar = Math.max(state.backPressureBar, estimate.backPressureBar);
        state.velocityMps = Math.max(state.velocityMps, velocityMps);
        state.deltaPBar = Math.max(state.deltaPBar, Math.max(0, supply.pressureBar - inletPressureBar));
        state.lengthM = estimate.geometry.lengthM;
        state.headGainM = estimate.geometry.headGainM;
    }

    resolvePushBasedNetwork(dt) {
        this.resetHydraulicState();

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

            if (!(comp instanceof FonteLogica) && !(comp instanceof TanqueLogico)) comp.consumirEntrada(totalFlow);
            else comp.marcarEmissaoIntrinseca();

            estimates.forEach(item => {
                const share = totalCapacity > EPSILON_FLOW ? item.estimate.capacityLps / totalCapacity : 0;
                const branchFlow = totalFlow * share;
                if (branchFlow <= EPSILON_FLOW) return;

                this.applyBranchFlow(comp, item.conn, supply, item.estimate, branchFlow);
                const target = this.getComponentById(item.conn.targetEl.dataset.compId);
                if (target instanceof BombaLogica || target instanceof ValvulaLogica) enqueue(target);
            });
        }
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
                `${flow.toFixed(2)} L/s | ${state.pressureBar.toFixed(2)} bar`
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
        this.pressaoMaxima = 5.0;
        this.eficienciaHidraulica = 0.78;
        this.fluxoReal = 0;
        this.pressaoSucaoAtualBar = 0;
        this.pressaoDescargaAtualBar = 0;
        this.cargaGeradaBar = 0;
    }

    toggle() {
        this.setAcionamento(this.isOn ? 0 : 100);
    }

    setAcionamento(valor) {
        this.grauAcionamento = clamp(Number(valor) || 0, 0, 100);
        this.isOn = this.grauAcionamento > 0;
        this.notify({ tipo: 'estado', isOn: this.isOn, grau: this.grauAcionamento });
    }

    sincronizarMetricasFisicas() {
        super.sincronizarMetricasFisicas();
        this.fluxoReal = this.estadoHidraulico.saidaVazaoLps;
        this.pressaoSucaoAtualBar = this.getPressaoEntradaBar();
        const drive = clamp(this.grauAcionamento / 100.0, 0, 1);
        const qMax = this.vazaoNominal * drive;
        const curveFrac = qMax > EPSILON_FLOW ? 1 - Math.pow(clamp(this.fluxoReal / qMax, 0, 1), 2) : 0;
        this.cargaGeradaBar = drive > 0 ? this.pressaoMaxima * drive * Math.max(0.08, curveFrac) : 0;
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
        this.fluxoReal = 0;
        this.cv = 4.0;
        this.perdaLocalK = 6.0;
        this.deltaPAtualBar = 0;
    }

    toggle() {
        this.setAbertura(this.aberta ? 0 : 100);
    }

    setAbertura(valor) {
        this.grauAbertura = clamp(Number(valor) || 0, 0, 100);
        this.aberta = this.grauAbertura > 0;
        this.notify({ tipo: 'estado', aberta: this.aberta, grau: this.grauAbertura });
    }

    sincronizarMetricasFisicas() {
        super.sincronizarMetricasFisicas();
        this.fluxoReal = this.estadoHidraulico.saidaVazaoLps;
        const opening = clamp(this.grauAbertura / 100.0, 0, 1);
        const cvFactor = Math.max(0.2, this.cv);
        const areaM2 = this.getAreaConexaoM2() * Math.max(0.12, opening);
        const localLossCoeff = this.perdaLocalK / Math.max(0.04, Math.pow(Math.max(opening, 0.01), 2.2) * cvFactor);
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

    getPressaoHidrostaticaBar(fluido) {
        return pressureFromHeadBar(this.getAlturaLiquidoM(), fluido.densidade);
    }

    getBackPressureAtInletBar(fluido) {
        const inletHeightM = this.alturaUtilMetros;
        const submergedHeightM = Math.max(0, this.getAlturaLiquidoM() - inletHeightM);
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
        super.sincronizarMetricasFisicas(fluido);
        this.pressaoFundoBar = this.getPressaoHidrostaticaBar(fluido || ENGINE.fluidoOperante);
    }

    getFluxoSaida() {
        return this.lastQout || 0;
    }

    getFluxoSaidaFromTank(nivelMontante) {
        const headBar = pressureFromHeadBar(Math.max(0, nivelMontante) * this.alturaUtilMetros, ENGINE.fluidoOperante.densidade);
        return flowFromBernoulli(
            headBar,
            this.getAreaConexaoM2(),
            ENGINE.fluidoOperante.densidade,
            1.0 / Math.max(0.15, this.coeficienteSaida * this.coeficienteSaida)
        );
    }
}
