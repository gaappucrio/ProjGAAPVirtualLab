// Solver hidráulico global: resolve pressões nodais e vazões de todos os ramos simultaneamente
// a cada passo de tempo (algoritmo de gradiente global de Todini-Pilati, o mesmo do EPANET).
//
// Paradigma alinhado ao modo dinâmico do DWSIM: vazão quase estática em cada passo, com
// equipamentos de acúmulo (tanques) atuando como fronteiras de pressão e integrados no tempo.
// Diferente do DWSIM, o sistema é resolvido de forma simultânea (sem atraso de um passo),
// os tubos têm perda de carga distribuída e a inércia do fluido nos tubos é integrada de forma
// implícita: ΔP = Φ(Q) + (ρL/A)·dQ/dt.
//
// Convenções: pressões manométricas em bar, vazões em L/s, ramos unidirecionais (um ramo cuja
// força motriz se inverte fecha, como uma válvula de retenção; o DWSIM dinâmico também não
// modela fluxo reverso).

import { BombaLogica } from '../components/BombaLogica.js';
import { DrenoLogico } from '../components/DrenoLogico.js';
import { FonteLogica } from '../components/FonteLogica.js';
import { TanqueLogico } from '../components/TanqueLogico.js';
import { TrocadorCalorLogico } from '../components/TrocadorCalorLogico.js';
import { ValvulaLogica } from '../components/ValvulaLogica.js';
import { referenciaPerdaBocal } from '../components/BocalHidraulico.js';
import { cloneFluido, mixFluidos } from '../components/Fluido.js';
import {
    BAR_TO_PA,
    DEFAULT_ATMOSPHERIC_PRESSURE_BAR,
    DEFAULT_ENTRY_LOSS,
    DEFAULT_FLUID_DENSITY_KG_M3,
    EPSILON_FLOW,
    GRAVITY,
    lpsToM3s,
    pressureFromHeadBar
} from '../units/HydraulicUnits.js';

const MAX_NEWTON_ITERATIONS = 60;
const MAX_STATUS_PASSES = 12;
const FLOW_TOLERANCE_LPS = 1e-7;
const RELATIVE_FLOW_TOLERANCE = 1e-7;
const MIN_LINK_DERIVATIVE_BAR_PER_LPS = 1e-6;
const STATUS_FLOW_TOLERANCE_LPS = 1e-6;
const STATUS_PRESSURE_TOLERANCE_BAR = 1e-7;
const INITIAL_GUESS_VELOCITY_MPS = 1;
const CAVITATION_TOLERANCE = 1e-3;
const CAVITATION_LOCAL_BRACKET = 0.05;
// Coeficiente de perda na entrada de um tanque: a energia cinética do jato é dissipada no reservatório.
const TANK_INLET_EXIT_LOSS_K = 1;
const TANK_OUTLET_CUSHION_L = EPSILON_FLOW * 10;
// Vaso fechado: resistência desprezível dos ramos internos bocal ↔ gás (só para manter o sistema
// nodal regular).
const TANK_INTERNAL_RESISTANCE_BAR_PER_LPS = 1e-6;
// Resistência da retenção da bomba ao fluxo reverso durante o Newton (bar por L/s).
const PUMP_REVERSE_RESISTANCE_BAR_PER_LPS = 1e3;
// Inclinação mínima da curva do colchão fora da faixa de volume (bar/L), para ela nunca ficar plana.
const MIN_TANK_GAS_SLOPE_BAR_PER_L = 1e-3;

function isStream2Port(portId) {
    return portId === 'in2' || portId === 'out2' || portId === '2';
}

function finiteNumber(value, fallback = 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

function positiveNumber(value, fallback) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : fallback;
}

function kineticPressureBar(flowLps, areaM2, density) {
    if (!(areaM2 > 0)) return 0;
    const velocityMps = lpsToM3s(flowLps) / areaM2;
    return (density * velocityMps * velocityMps) / 2 / BAR_TO_PA;
}

function inputNodeId(component) {
    return `${component.id}:in`;
}

function outputNodeId(component) {
    return `${component.id}:out`;
}

// Fatoração de Cholesky para o sistema simétrico positivo definido do gradiente global.
// Retorna null se a matriz não for positiva definida (o chamador recorre à eliminação de Gauss).
function solveCholesky(matrix, rhs, size) {
    const lower = new Float64Array(size * size);
    for (let row = 0; row < size; row += 1) {
        for (let column = 0; column <= row; column += 1) {
            let sum = matrix[(row * size) + column];
            for (let k = 0; k < column; k += 1) {
                sum -= lower[(row * size) + k] * lower[(column * size) + k];
            }
            if (row === column) {
                if (!(sum > 0)) return null;
                lower[(row * size) + row] = Math.sqrt(sum);
            } else {
                lower[(row * size) + column] = sum / lower[(column * size) + column];
            }
        }
    }

    const intermediate = new Float64Array(size);
    for (let row = 0; row < size; row += 1) {
        let sum = rhs[row];
        for (let k = 0; k < row; k += 1) sum -= lower[(row * size) + k] * intermediate[k];
        intermediate[row] = sum / lower[(row * size) + row];
    }

    const solution = new Float64Array(size);
    for (let row = size - 1; row >= 0; row -= 1) {
        let sum = intermediate[row];
        for (let k = row + 1; k < size; k += 1) sum -= lower[(k * size) + row] * solution[k];
        solution[row] = sum / lower[(row * size) + row];
    }
    return solution;
}

function solveGaussian(matrix, rhs, size) {
    const augmented = Array.from({ length: size }, (_, row) => {
        const values = new Float64Array(size + 1);
        for (let column = 0; column < size; column += 1) values[column] = matrix[(row * size) + column];
        values[size] = rhs[row];
        return values;
    });

    for (let pivot = 0; pivot < size; pivot += 1) {
        let best = pivot;
        for (let row = pivot + 1; row < size; row += 1) {
            if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[best][pivot])) best = row;
        }
        if (Math.abs(augmented[best][pivot]) < 1e-14) return null;
        if (best !== pivot) [augmented[pivot], augmented[best]] = [augmented[best], augmented[pivot]];

        for (let row = pivot + 1; row < size; row += 1) {
            const factor = augmented[row][pivot] / augmented[pivot][pivot];
            if (factor === 0) continue;
            for (let column = pivot; column <= size; column += 1) {
                augmented[row][column] -= factor * augmented[pivot][column];
            }
        }
    }

    const solution = new Float64Array(size);
    for (let row = size - 1; row >= 0; row -= 1) {
        let sum = augmented[row][size];
        for (let column = row + 1; column < size; column += 1) sum -= augmented[row][column] * solution[column];
        solution[row] = sum / augmented[row][row];
    }
    return solution;
}

export class GlobalHydraulicSolver {
    constructor(hydraulicContext, hydraulicModel) {
        this.context = hydraulicContext;
        this.hydraulicModel = hydraulicModel;
        this.previousComponentLinkFlows = new Map();
        this.previousNodePressures = new Map();
        this.metrics = {
            mode: 'global',
            lastIterations: 0,
            lastStatusPasses: 0,
            lastError: 0,
            maxIterationsHit: 0,
            convergedCount: 0,
            totalSolverCalls: 0,
            lastDiagnostics: []
        };
    }

    getMetrics() {
        return { ...this.metrics, lastDiagnostics: [...this.metrics.lastDiagnostics] };
    }

    resolve(dt, analysis = null) {
        this.metrics.totalSolverCalls += 1;
        this.metrics.lastDiagnostics = [...(analysis?.diagnostics || [])];

        const network = this.buildNetwork(dt);
        const solution = this.solveNetwork(network);

        this.writeConnectionStates(network, solution, dt);
        this.propagateConnectionFluids(network, solution);
        this.hydraulicModel.rebuildComponentHydraulicStateFromConnections();
        this.storeNodePressuresOnComponents(network, solution);
        this.applyPumpMetrics(network, solution);
        this.reportVaporPressureViolations(network, solution);
        this.reportBlockedFloatingLoops(network, analysis);

        network.links.forEach((link) => {
            if (link.kind !== 'connection' && !link.tankInternal) this.previousComponentLinkFlows.set(link.id, Math.max(0, solution.flows[link.index]));
        });
        network.nodes.forEach((node) => {
            this.previousNodePressures.set(node.id, solution.pressures.get(node.id));
        });
    }

    // ------------------------------------------------------------------
    // Montagem da rede
    // ------------------------------------------------------------------

    buildNetwork(dt) {
        const nodes = new Map();
        const links = [];
        const componentById = new Map(this.context.componentes.map((component) => [component.id, component]));
        const usarAlturaRelativa = this.context.usarAlturaRelativa;

        const addNode = (id, component, port) => {
            if (!nodes.has(id)) {
                nodes.set(id, {
                    id,
                    component,
                    port,
                    fixedPressureBar: null,
                    boundaryKind: null,
                    flowCapLps: null
                });
            }
            return nodes.get(id);
        };

        const addLink = (link) => {
            link.index = links.length;
            links.push(link);
            return link;
        };

        this.context.componentes.forEach((component) => {
            if (component instanceof TrocadorCalorLogico) {
                [1, 2].forEach((streamId) => {
                    const inletPort = this.resolveHeatExchangerInletPort(component, streamId);
                    const outletPort = inletPort === `in${streamId}` ? `out${streamId}` : `in${streamId}`;
                    const inletNode = addNode(`${component.id}:${inletPort}`, component, inletPort);
                    const outletNode = addNode(`${component.id}:${outletPort}`, component, outletPort);
                    addLink(this.createHeatExchangerLink(component, streamId, inletNode.id, outletNode.id));
                });
                return;
            }

            const inputNode = addNode(inputNodeId(component), component, 'in');
            const outputNode = addNode(outputNodeId(component), component, 'out');

            if (component instanceof FonteLogica) {
                outputNode.fixedPressureBar = finiteNumber(component.pressaoFonteBar, 0);
                outputNode.boundaryKind = 'source';
                outputNode.flowCapLps = Math.max(0, finiteNumber(component.vazaoMaxima, 0));
            } else if (component instanceof DrenoLogico) {
                inputNode.fixedPressureBar = finiteNumber(component.pressaoSaidaBar, 0);
                inputNode.boundaryKind = 'sink';
            } else if (component instanceof TanqueLogico) {
                const fluid = component.getFluidoConteudo?.() || this.context.fluidoOperante;
                const inletPressureBar = component.getPressaoBocalEntradaBar(fluid, usarAlturaRelativa);
                const outletPressureBar = component.getPressaoBocalSaidaBar(fluid, usarAlturaRelativa);
                inputNode.boundaryKind = 'tank-inlet';
                outputNode.boundaryKind = 'tank-outlet';
                if (component.tipoTanque === 'fechado' && dt > 0) {
                    this.addClosedTankCushion(component, fluid, inputNode, outputNode, {
                        addNode, addLink, dt, usarAlturaRelativa, inletPressureBar, outletPressureBar
                    });
                    return;
                }
                inputNode.fixedPressureBar = inletPressureBar;
                outputNode.fixedPressureBar = outletPressureBar;
                const availableVolumeL = component.getVolumeDisponivelSaidaL?.(usarAlturaRelativa)
                    ?? Math.max(0, component.volumeAtual);
                outputNode.availableVolumeL = availableVolumeL;
                outputNode.flowCapLps = dt > 0
                    ? availableVolumeL / dt
                    : Number.POSITIVE_INFINITY;
            } else if (component instanceof ValvulaLogica) {
                addLink(this.createValveLink(component, inputNode.id, outputNode.id));
            } else if (component instanceof BombaLogica) {
                addLink(this.createPumpLink(component, inputNode.id, outputNode.id));
            }
        });

        this.context.conexoes.forEach((connection) => {
            const source = componentById.get(connection.sourceId);
            const target = componentById.get(connection.targetId);
            if (!source || !target) return;
            addLink(this.createConnectionLink(connection, source, target, dt));
        });

        this.reconcilePreviousFlows(links);

        return { nodes, links, componentById, dt };
    }

    // Vaso fechado: em vez de pressões fixas no início do passo, os bocais se ligam a um nó de gás cuja
    // pressão é a de Boyle no FIM do passo, P_gás(V₀ + Q_líquido·Δt) (Euler implícito). Assim o colchão
    // endurece dentro do próprio passo e a vazão para no equilíbrio, sem ultrapassá-lo. Os limites de
    // inventário (gás no piso, líquido no bocal de saída) são tetos de vazão desse ramo (updateStatuses).
    addClosedTankCushion(tank, fluid, inputNode, outputNode, options) {
        const { addNode, addLink, dt, usarAlturaRelativa, inletPressureBar, outletPressureBar } = options;
        const gasPressureBar = tank.getPressaoGasBar(fluid);
        const gasNode = addNode(`${tank.id}:gas`, tank, 'gas');
        const referenceNode = addNode(`${tank.id}:gas-ref`, tank, 'gas-ref');
        referenceNode.fixedPressureBar = gasPressureBar;

        const baseLink = (id, from, to) => ({
            id: `${id}:${tank.id}`,
            component: tank,
            from,
            to,
            fluid,
            tankInternal: true,
            bidirectional: true,
            previousFlowLps: 0,
            forcedClosed: false,
            open: true
        });
        // P_bocal − P_gás = coluna de líquido no bocal (entrada: bocal → gás; saída: gás → bocal).
        const inletLink = addLink({ ...baseLink('tank-in', inputNode.id, gasNode.id), kind: 'tank-offset', offsetBar: inletPressureBar - gasPressureBar });
        addLink({
            ...baseLink('tank-out', gasNode.id, outputNode.id),
            kind: 'tank-offset',
            offsetBar: gasPressureBar - outletPressureBar,
            // Teto de saída (como no tanque aberto): o disponível acima do bocal mais o que entra.
            inletLink,
            availableVolumeL: tank.getVolumeDisponivelSaidaL?.(usarAlturaRelativa) ?? Math.max(0, tank.volumeAtual)
        });

        const volumeL = Math.max(0, finiteNumber(tank.volumeAtual, 0));
        const maxVolumeL = tank.getVolumeMaximoLiquidoL?.() ?? tank.capacidadeMaxima;
        const minVolumeL = tank.getVolumeMinimoSaidaL?.(usarAlturaRelativa) ?? 0;
        // Limites relativos ao volume atual: o vaso não é forçado a sair de onde já está.
        const highVolumeL = Math.max(maxVolumeL, volumeL);
        addLink({
            ...baseLink('tank-gas', gasNode.id, referenceNode.id),
            kind: 'tank-gas',
            dt,
            volumeL,
            highVolumeL,
            maxVolumeL,
            lowVolumeL: Math.min(minVolumeL, volumeL),
            maxNetInflowLps: (highVolumeL - volumeL) / dt,
            basePressureBar: gasPressureBar
        });
    }

    // Subida P_gás(fim do passo) − P_gás(início) para a vazão líquida que entra no vaso. Fora da faixa
    // de volume, a curva segue pela tangente da borda (sempre crescente): um patamar plano faria o Newton
    // saltar entre os dois lados da borda sem convergir. O limite em si é o teto de vazão do ramo.
    tankGasPressureRiseBar(link, netInflowLps) {
        const tank = link.component;
        const capacityL = Math.max(EPSILON_FLOW, finiteNumber(tank.capacidadeMaxima, 0));
        const gasAt = (volumeL) => tank.getPressaoGasParaNivelBar(link.fluid, volumeL / capacityL);
        const endVolumeL = link.volumeL + (netInflowLps * link.dt);
        const edgeVolumeL = Math.min(link.highVolumeL, Math.max(link.lowVolumeL, endVolumeL));
        const edgePressureBar = gasAt(edgeVolumeL);
        if (edgeVolumeL === endVolumeL) return edgePressureBar - link.basePressureBar;

        // A tangente é medida dentro da faixa física: acima de maxVolumeL a curva já está no piso do gás.
        const stepL = Math.max(1e-3, capacityL * 1e-6);
        const slopeVolumeL = Math.min(edgeVolumeL, link.maxVolumeL);
        const insideVolumeL = endVolumeL > edgeVolumeL ? slopeVolumeL - stepL : slopeVolumeL + stepL;
        const slopeBarPerL = Math.max(
            MIN_TANK_GAS_SLOPE_BAR_PER_L,
            Math.abs(gasAt(slopeVolumeL) - gasAt(insideVolumeL)) / stepL
        );
        return edgePressureBar + (slopeBarPerL * (endVolumeL - edgeVolumeL)) - link.basePressureBar;
    }

    // Garante que as vazões anteriores (usadas no termo de inércia dQ/dt) respeitem a continuidade
    // através de equipamentos passantes sem volume acumulado, evitando picos artificiais de golpe de
    // aríete quando um snapshot legado ou uma edição de topologia traz vazões em série incompatíveis.
    reconcilePreviousFlows(links) {
        const internalLinks = links.filter((link) => link.kind !== 'connection' && !link.tankInternal);
        if (internalLinks.length === 0) return;

        const scalePreviousFlows = (group, targetSum) => {
            const currentSum = group.reduce((sum, link) => sum + link.previousFlowLps, 0);
            if (currentSum <= targetSum + EPSILON_FLOW) return false;
            const scale = currentSum > EPSILON_FLOW ? targetSum / currentSum : 0;
            group.forEach((link) => {
                link.previousFlowLps *= scale;
            });
            return true;
        };

        for (let pass = 0; pass < internalLinks.length; pass += 1) {
            let changed = false;
            internalLinks.forEach((internalLink) => {
                const incoming = links.filter((link) => link.kind === 'connection' && link.open && link.to === internalLink.from);
                const outgoing = links.filter((link) => link.kind === 'connection' && link.open && link.from === internalLink.to);
                if (incoming.length === 0 && outgoing.length === 0) return;

                if (!internalLink.open) {
                    if (scalePreviousFlows(incoming, 0)) changed = true;
                    if (scalePreviousFlows(outgoing, 0)) changed = true;
                    return;
                }

                if (incoming.length === 0 || outgoing.length === 0) return;
                const sumIn = incoming.reduce((sum, link) => sum + link.previousFlowLps, 0);
                const sumOut = outgoing.reduce((sum, link) => sum + link.previousFlowLps, 0);
                const consistentFlow = Math.min(sumIn, sumOut);
                if (scalePreviousFlows(incoming, consistentFlow)) changed = true;
                if (scalePreviousFlows(outgoing, consistentFlow)) changed = true;
            });
            if (!changed) break;
        }
    }

    // O sentido hidráulico de cada corrente do trocador vem das portas efetivamente ligadas: a porta que
    // recebe uma conexão de entrada é a admissão (em contracorrente, a Corrente 2 entra por out2).
    resolveHeatExchangerInletPort(exchanger, streamId) {
        const inPort = `in${streamId}`;
        const outPort = `out${streamId}`;
        const belongsToStream = (portId) => (streamId === 2 ? isStream2Port(portId) : !isStream2Port(portId));
        const incoming = this.context.getInputConnections(exchanger)
            .map((connection) => connection.targetEndpoint?.portId)
            .filter(belongsToStream);
        if (incoming.includes(outPort)) return outPort;
        if (incoming.includes(inPort)) return inPort;

        const outgoing = this.context.getOutputConnections(exchanger)
            .map((connection) => connection.sourceEndpoint?.portId)
            .filter(belongsToStream);
        if (outgoing.includes(inPort)) return outPort;
        return inPort;
    }

    resolveConnectionSourceNodeId(source, connection) {
        if (source instanceof TrocadorCalorLogico) {
            const portId = connection.sourceEndpoint?.portId;
            if (isStream2Port(portId)) return `${source.id}:${portId === 'in2' ? 'in2' : 'out2'}`;
            return `${source.id}:${portId === 'in1' ? 'in1' : 'out1'}`;
        }
        return outputNodeId(source);
    }

    resolveConnectionTargetNodeId(target, connection) {
        if (target instanceof TrocadorCalorLogico) {
            const portId = connection.targetEndpoint?.portId;
            if (isStream2Port(portId)) return `${target.id}:${portId === 'out2' ? 'out2' : 'in2'}`;
            return `${target.id}:${portId === 'out1' ? 'out1' : 'in1'}`;
        }
        return inputNodeId(target);
    }

    resolveConnectionFluid(connection, source) {
        const state = this.context.getConnectionState(connection);
        if (state?.fluid) return state.fluid;
        if (source instanceof FonteLogica) return source.fluidoEntrada || this.context.fluidoOperante;
        if (source instanceof TanqueLogico) return source.getFluidoSaidaAtual?.(this.context.fluidoOperante) || this.context.fluidoOperante;
        return this.context.getConnectionFluid(connection) || this.context.fluidoOperante;
    }

    createConnectionLink(connection, source, target, dt) {
        this.hydraulicModel.ensureConnectionProperties(connection);
        const geometry = this.context.getConnectionGeometry(connection);
        const fluid = this.resolveConnectionFluid(connection, source);
        const density = positiveNumber(fluid?.densidade, DEFAULT_FLUID_DENSITY_KG_M3);
        const pipeAreaM2 = positiveNumber(connection.areaM2, 1e-6);
        const lengthM = Math.max(0, finiteNumber(geometry?.lengthM, 0));

        // Bocais de tanque e dreno: K na velocidade do cano (DWSIM) ou do bocal (aba Avançado).
        let sourceLoss = { areaM2: pipeAreaM2, lossCoeff: 0 };
        if (source instanceof FonteLogica) sourceLoss.lossCoeff = Math.max(0, DEFAULT_ENTRY_LOSS);
        if (source instanceof TanqueLogico) {
            const cd = Math.max(0.15, finiteNumber(source.coeficienteSaida, 1));
            const kBocal = source.considerarPerdasBocais !== false ? 1 / (cd * cd) : 0;
            // 1/Cd² = 1 (energia cinética que segue no cano) + perda no bocal.
            sourceLoss = referenciaPerdaBocal(source, kBocal, pipeAreaM2, 'saida', { kEnergiaCinetica: kBocal > 0 ? 1 : 0 });
        }

        let targetLoss = { areaM2: pipeAreaM2, lossCoeff: 0 };
        if (target instanceof DrenoLogico) {
            targetLoss = referenciaPerdaBocal(target, finiteNumber(target.perdaEntradaK, 0), pipeAreaM2, 'entrada');
        }
        if (target instanceof TanqueLogico) {
            const kBocal = target.considerarPerdasBocais !== false ? TANK_INLET_EXIT_LOSS_K : 0;
            targetLoss = referenciaPerdaBocal(target, kBocal, pipeAreaM2, 'entrada');
        }

        const inertanceBarPerLpsPerS = (density * lengthM) / (pipeAreaM2 * 1e8);
        const forcedClosed = (source instanceof TanqueLogico
            && source.temLiquidoDisponivelSaida?.(this.context.usarAlturaRelativa) === false)
            || (source instanceof FonteLogica && !(finiteNumber(source.vazaoMaxima, 0) > EPSILON_FLOW));

        return {
            id: `connection:${connection.id}`,
            kind: 'connection',
            connection,
            source,
            target,
            from: this.resolveConnectionSourceNodeId(source, connection),
            to: this.resolveConnectionTargetNodeId(target, connection),
            geometry,
            fluid,
            density,
            pipeAreaM2,
            sourceAreaM2: positiveNumber(sourceLoss.areaM2, pipeAreaM2),
            targetAreaM2: positiveNumber(targetLoss.areaM2, pipeAreaM2),
            sourceLossCoeff: sourceLoss.lossCoeff,
            targetLossCoeff: targetLoss.lossCoeff,
            staticHeadBar: pressureFromHeadBar(finiteNumber(geometry?.headGainM, 0), density),
            inertanceBarPerLpsPerS,
            inertiaCoeff: dt > 0 ? inertanceBarPerLpsPerS / dt : 0,
            previousFlowLps: Math.max(0, finiteNumber(connection.transientFlowLps, 0)),
            forcedClosed,
            open: !forcedClosed
        };
    }

    createValveLink(valve, from, to) {
        const parametros = valve.getParametrosHidraulicos();
        const fluid = this.context.getComponentFluid(valve) || this.context.fluidoOperante;
        const forcedClosed = parametros.opening <= 0;
        return {
            id: `valve:${valve.id}`,
            kind: 'valve',
            component: valve,
            from,
            to,
            fluid,
            density: positiveNumber(fluid?.densidade, DEFAULT_FLUID_DENSITY_KG_M3),
            areaM2: positiveNumber(parametros.hydraulicAreaM2, 1e-6),
            lossCoeff: Math.max(0, finiteNumber(parametros.localLossCoeff, 0)),
            previousFlowLps: this.previousComponentLinkFlows.get(`valve:${valve.id}`) || 0,
            forcedClosed,
            open: !forcedClosed
        };
    }

    createHeatExchangerLink(exchanger, streamId, from, to) {
        const parametros = exchanger.getParametrosHidraulicos();
        const fluid = exchanger.getFluidoEntradaMisturadoPorPorta?.(streamId === 2 ? 'in2' : 'in1', null)
            || this.context.getComponentFluid(exchanger)
            || this.context.fluidoOperante;
        const id = `hx:${exchanger.id}:${streamId}`;
        return {
            id,
            kind: 'hx',
            component: exchanger,
            streamId,
            from,
            to,
            fluid,
            density: positiveNumber(fluid?.densidade, DEFAULT_FLUID_DENSITY_KG_M3),
            areaM2: positiveNumber(parametros.hydraulicAreaM2, 1e-6),
            lossCoeff: Math.max(0, finiteNumber(parametros.localLossCoeff, 0)),
            previousFlowLps: this.previousComponentLinkFlows.get(id) || 0,
            forcedClosed: false,
            open: true
        };
    }

    createPumpLink(pump, from, to) {
        const fluid = this.context.getComponentFluid(pump) || this.context.fluidoOperante;
        const drive = pump.getDriveAtual();
        const forcedClosed = !(drive > EPSILON_FLOW);
        return {
            id: `pump:${pump.id}`,
            kind: 'pump',
            component: pump,
            from,
            to,
            fluid,
            density: positiveNumber(fluid?.densidade, DEFAULT_FLUID_DENSITY_KG_M3),
            drive,
            areaM2: positiveNumber(pump.getAreaConexaoM2?.(), 1e-6),
            // Fator de cavitação é tratado como incógnita própria (ver solveCavitation), partindo do passo anterior.
            initialCavitationFactor: Math.min(1, Math.max(0, finiteNumber(pump.fatorCavitacaoAtual, 1))),
            cavitationFactor: Math.min(1, Math.max(0, finiteNumber(pump.fatorCavitacaoAtual, 1))),
            previousFlowLps: this.previousComponentLinkFlows.get(`pump:${pump.id}`) || 0,
            forcedClosed,
            open: !forcedClosed
        };
    }

    // ------------------------------------------------------------------
    // Equações dos ramos: P_from − P_to = Φ(Q)
    // ------------------------------------------------------------------

    connectionLossBar(link, flowLps) {
        const q = Math.abs(flowLps);
        if (!(q > 1e-12)) return 0;
        const hydraulics = this.context.getPipeHydraulics(
            link.connection,
            link.geometry,
            link.pipeAreaM2,
            q,
            link.fluid
        );
        const pipeCoeff = Math.max(0, finiteNumber(link.connection.perdaLocalK, 0)) + hydraulics.distributedLossCoeff;
        return (link.sourceLossCoeff * kineticPressureBar(q, link.sourceAreaM2, link.density))
            + (pipeCoeff * kineticPressureBar(q, link.pipeAreaM2, link.density))
            + (link.targetLossCoeff * kineticPressureBar(q, link.targetAreaM2, link.density));
    }

    // NPSH disponível na sucção e o fator de cavitação que ele impõe à curva da bomba.
    evaluatePumpSuction(link, flowLps, suctionPressureBar) {
        const pump = link.component;
        const q = Math.max(0, flowLps);
        const atmosphericBar = finiteNumber(link.fluid?.pressaoAtmosfericaBar, DEFAULT_ATMOSPHERIC_PRESSURE_BAR);
        const vaporBar = Math.max(0, finiteNumber(link.fluid?.pressaoVaporBar, 0));
        const velocityMps = lpsToM3s(q) / link.areaM2;
        // A pressão estática não pode cair abaixo da pressão de vapor: abaixo dela o líquido vaporiza
        // na própria linha de sucção (separação de coluna) e não sobra NPSH algum, mesmo com carga cinética.
        const staticMarginBar = atmosphericBar + suctionPressureBar - vaporBar;
        const npshAvailableM = staticMarginBar > 0
            ? ((staticMarginBar * BAR_TO_PA) / (link.density * GRAVITY)) + ((velocityMps * velocityMps) / (2 * GRAVITY))
            : 0;
        const npshRequiredM = pump.getCurvaNpshRequeridoM(q, link.drive);
        return {
            npshAvailableM,
            npshRequiredM,
            cavitationFactor: pump.calcularFatorCavitacao(npshAvailableM, npshRequiredM)
        };
    }

    // Sem nenhum ramo aberto chegando à sucção, a bomba não tem líquido para bombear.
    pumpHasOpenSupply(network, pumpLink) {
        return network.links.some((link) => link.open && link.to === pumpLink.from);
    }

    pumpBoostBar(link, flowLps, cavitationFactor = link.cavitationFactor) {
        return link.component.getCurvaPressaoBar(Math.max(0, flowLps), link.drive, link.density) * cavitationFactor;
    }

    evaluateLink(link, flowLps) {
        if (link.kind === 'connection') {
            return (Math.sign(flowLps) * this.connectionLossBar(link, flowLps))
                - link.staticHeadBar
                + (link.inertiaCoeff * (flowLps - link.previousFlowLps));
        }
        if (link.kind === 'pump') {
            // Abaixo de zero a curva é plana (derivada nula) e o Newton trataria a bomba como um curto;
            // a retenção da bomba resiste ao fluxo reverso (o ramo ainda fecha por status se Q < 0).
            if (flowLps < 0) return -this.pumpBoostBar(link, 0) + (PUMP_REVERSE_RESISTANCE_BAR_PER_LPS * flowLps);
            return -this.pumpBoostBar(link, flowLps);
        }
        if (link.kind === 'tank-offset') return link.offsetBar + (TANK_INTERNAL_RESISTANCE_BAR_PER_LPS * flowLps);
        if (link.kind === 'tank-gas') return this.tankGasPressureRiseBar(link, flowLps);
        return Math.sign(flowLps) * link.lossCoeff * kineticPressureBar(Math.abs(flowLps), link.areaM2, link.density);
    }

    evaluateLinkWithDerivative(link, flowLps) {
        const value = this.evaluateLink(link, flowLps);
        const step = Math.max(1e-6, Math.abs(flowLps) * 1e-4);
        const derivative = (this.evaluateLink(link, flowLps + step)
            - this.evaluateLink(link, flowLps - step)) / (2 * step);
        return { value, derivative: Math.max(MIN_LINK_DERIVATIVE_BAR_PER_LPS, derivative) };
    }

    initialFlowGuess(link) {
        if (link.tankInternal) return 0;
        if (link.previousFlowLps > EPSILON_FLOW) return link.previousFlowLps;
        if (link.kind === 'pump') {
            return Math.max(EPSILON_FLOW, 0.5 * link.component.vazaoNominal * link.drive);
        }
        const areaM2 = link.kind === 'connection' ? link.pipeAreaM2 : link.areaM2;
        return Math.max(EPSILON_FLOW, areaM2 * INITIAL_GUESS_VELOCITY_MPS * 1000);
    }

    // ------------------------------------------------------------------
    // Solução: gradiente global com estados ativos (retenção, tetos de vazão)
    // ------------------------------------------------------------------

    solveNetwork(network) {
        const flows = new Float64Array(network.links.length);
        network.links.forEach((link) => {
            flows[link.index] = link.open ? this.initialFlowGuess(link) : 0;
        });

        const nodeState = new Map();
        network.nodes.forEach((node) => {
            nodeState.set(node.id, {
                fixed: node.fixedPressureBar !== null,
                pressureBar: node.fixedPressureBar ?? finiteNumber(this.previousNodePressures.get(node.id), 0),
                injectionLps: 0,
                capped: false
            });
        });
        // Vaso fechado já no limite (gás no piso): sem espaço, o colchão começa travado. Partir dele
        // aberto deixa o Newton, linearizado em canos quase parados, achar fluxo reverso e alternar a
        // bomba entre aberta e fechada. O teto solta se a rede puxar líquido do vaso.
        network.links.forEach((link) => {
            if (link.kind !== 'tank-gas' || link.maxNetInflowLps > STATUS_FLOW_TOLERANCE_LPS) return;
            link.appliedCapLps = link.maxNetInflowLps;
            link.open = false;
            flows[link.index] = 0;
            nodeState.get(link.from).injectionLps -= link.appliedCapLps;
            nodeState.get(link.to).injectionLps += link.appliedCapLps;
        });

        let pressures = new Map();
        let totalIterations = 0;
        let converged = false;
        let passes = 0;

        for (; passes < MAX_STATUS_PASSES; passes += 1) {
            network.links.forEach((link) => {
                if (link.kind === 'pump') link.cavitationFactor = link.initialCavitationFactor;
            });
            const references = this.assignReferenceNodes(network, nodeState);
            let result = this.runNewton(network, flows, nodeState);
            totalIterations += result.iterations;
            result = this.resolvePumpCavitation(network, flows, nodeState, result);
            totalIterations += result.extraIterations || 0;
            pressures = result.pressures;
            converged = result.converged;
            references.forEach((nodeId) => {
                nodeState.get(nodeId).fixed = false;
            });

            if (!this.updateStatuses(network, flows, pressures, nodeState)) break;
        }

        this.metrics.lastIterations = totalIterations;
        this.metrics.lastStatusPasses = passes + 1;
        this.metrics.lastError = this.calculateMassResidual(network, flows, nodeState);
        if (converged) {
            this.metrics.convergedCount += 1;
        } else {
            this.metrics.maxIterationsHit += 1;
            this.metrics.lastDiagnostics.push({
                code: 'global_not_converged',
                severity: 'warning',
                message: 'O solver global atingiu o limite de iterações antes da tolerância final; a última estimativa foi mantida.'
            });
        }

        return { flows, pressures, nodeState };
    }

    // A carga da bomba depende do NPSH disponível, que depende da pressão de sucção resolvida pela rede.
    // Para cada bomba, o fator de cavitação c é a raiz de g(c) = f(c) − c, em que f(c) é o fator
    // implicado pela sucção quando a rede é resolvida com c. Como g é monótona (g(0) ≥ 0, g(1) ≤ 0),
    // a bisseção converge sempre — iteração de ponto fixo simples oscilaria entre 0 e 1.
    resolvePumpCavitation(network, flows, nodeState, initialResult) {
        let result = initialResult;
        let extraIterations = 0;
        const pumps = network.links.filter((link) => link.kind === 'pump' && link.open);
        const targetFactor = (link, pressures) => (this.pumpHasOpenSupply(network, link)
            ? this.evaluatePumpSuction(link, flows[link.index], pressures.get(link.from) ?? 0).cavitationFactor
            : 0);

        // g(c) = f(c) − c avaliada resolvendo a rede com o fator c.
        const residualAt = (link, factor) => {
            link.cavitationFactor = factor;
            result = this.runNewton(network, flows, nodeState);
            extraIterations += result.iterations;
            return targetFactor(link, result.pressures) - factor;
        };

        for (let sweep = 0; sweep < 3; sweep += 1) {
            let adjusted = false;
            pumps.forEach((link) => {
                const startFactor = link.cavitationFactor;
                const startResidual = targetFactor(link, result.pressures) - startFactor;
                if (Math.abs(startResidual) <= CAVITATION_TOLERANCE) return;
                adjusted = true;

                // Intervalo inicial estreito em torno do passo anterior (a cavitação varia pouco entre passos);
                // se não isolar a raiz, usa [0, 1], onde g(0) ≥ 0 e g(1) ≤ 0 sempre.
                let low = startResidual > 0 ? startFactor : Math.max(0, startFactor - CAVITATION_LOCAL_BRACKET);
                let high = startResidual > 0 ? Math.min(1, startFactor + CAVITATION_LOCAL_BRACKET) : startFactor;
                let lowResidual = startResidual > 0 ? startResidual : residualAt(link, low);
                let highResidual = startResidual > 0 ? residualAt(link, high) : startResidual;
                if (lowResidual < 0) {
                    low = 0;
                    lowResidual = residualAt(link, 0);
                }
                if (highResidual > 0) {
                    high = 1;
                    highResidual = residualAt(link, 1);
                }

                // Regula falsi (Illinois): mantém o intervalo como a bisseção, mas converge bem mais rápido.
                let side = 0;
                let factor = (low + high) / 2;
                for (let step = 0; step < 30; step += 1) {
                    const span = lowResidual - highResidual;
                    factor = span > 0 ? low + ((lowResidual * (high - low)) / span) : (low + high) / 2;
                    const residual = residualAt(link, factor);
                    if (Math.abs(residual) <= CAVITATION_TOLERANCE || (high - low) <= CAVITATION_TOLERANCE) break;
                    if (residual > 0) {
                        low = factor;
                        lowResidual = residual;
                        if (side === 1) highResidual /= 2;
                        side = 1;
                    } else {
                        high = factor;
                        highResidual = residual;
                        if (side === -1) lowResidual /= 2;
                        side = -1;
                    }
                }
                if (link.cavitationFactor !== factor) residualAt(link, factor);
            });
            if (!adjusted) break;
        }

        return { ...result, extraIterations };
    }

    // Componentes conexos sem nenhuma pressão imposta (malhas fechadas isoladas) recebem uma
    // referência manométrica para que o sistema linear seja bem posto.
    assignReferenceNodes(network, nodeState) {
        const parent = new Map();
        const find = (id) => {
            let root = id;
            while (parent.get(root) !== root) root = parent.get(root);
            let current = id;
            while (parent.get(current) !== root) {
                const next = parent.get(current);
                parent.set(current, root);
                current = next;
            }
            return root;
        };
        network.nodes.forEach((node) => parent.set(node.id, node.id));
        network.links.forEach((link) => {
            if (!link.open || !parent.has(link.from) || !parent.has(link.to)) return;
            const rootA = find(link.from);
            const rootB = find(link.to);
            if (rootA !== rootB) parent.set(rootA, rootB);
        });

        const groups = new Map();
        network.nodes.forEach((node) => {
            const root = find(node.id);
            if (!groups.has(root)) groups.set(root, []);
            groups.get(root).push(node.id);
        });

        const references = [];
        groups.forEach((nodeIds) => {
            if (nodeIds.some((nodeId) => nodeState.get(nodeId).fixed)) return;
            const referenceId = nodeIds[0];
            const state = nodeState.get(referenceId);
            state.fixed = true;
            state.pressureBar = finiteNumber(this.previousNodePressures.get(referenceId), 0);
            references.push(referenceId);

            const hasOpenPump = network.links.some((link) =>
                link.open && link.kind === 'pump' && nodeIds.includes(link.from));
            if (hasOpenPump && !this.metrics.lastDiagnostics.some((d) => d.code === 'global_floating_reference')) {
                this.metrics.lastDiagnostics.push({
                    code: 'global_floating_reference',
                    severity: 'warning',
                    message: 'Malha fechada sem fonte, dreno ou tanque: as pressões são relativas a uma referência manométrica arbitrária.'
                });
            }
        });
        return references;
    }

    runNewton(network, flows, nodeState) {
        const unknownIds = [];
        const indexById = new Map();
        nodeState.forEach((state, nodeId) => {
            if (state.fixed) return;
            indexById.set(nodeId, unknownIds.length);
            unknownIds.push(nodeId);
        });
        const size = unknownIds.length;

        const pressures = new Map();
        nodeState.forEach((state, nodeId) => pressures.set(nodeId, state.pressureBar));

        let converged = false;
        let iterations = 0;
        const values = new Float64Array(network.links.length);
        const conductances = new Float64Array(network.links.length);

        for (; iterations < MAX_NEWTON_ITERATIONS; iterations += 1) {
            network.links.forEach((link) => {
                if (!link.open) return;
                const { value, derivative } = this.evaluateLinkWithDerivative(link, flows[link.index]);
                values[link.index] = value;
                conductances[link.index] = 1 / derivative;
            });

            if (size > 0) {
                const matrix = new Float64Array(size * size);
                const rhs = new Float64Array(size);
                network.links.forEach((link) => {
                    if (!link.open) return;
                    const conductance = conductances[link.index];
                    const base = flows[link.index] - (conductance * values[link.index]);
                    const fromIndex = indexById.get(link.from);
                    const toIndex = indexById.get(link.to);

                    if (fromIndex !== undefined) {
                        matrix[(fromIndex * size) + fromIndex] += conductance;
                        rhs[fromIndex] -= base;
                        if (toIndex !== undefined) matrix[(fromIndex * size) + toIndex] -= conductance;
                        else rhs[fromIndex] += conductance * pressures.get(link.to);
                    }
                    if (toIndex !== undefined) {
                        matrix[(toIndex * size) + toIndex] += conductance;
                        rhs[toIndex] += base;
                        if (fromIndex !== undefined) matrix[(toIndex * size) + fromIndex] -= conductance;
                        else rhs[toIndex] += conductance * pressures.get(link.from);
                    }
                });
                unknownIds.forEach((nodeId, index) => {
                    rhs[index] += nodeState.get(nodeId).injectionLps;
                    // Nó sem nenhum ramo aberto: fixa a pressão anterior para manter o sistema regular.
                    if (matrix[(index * size) + index] === 0) {
                        matrix[(index * size) + index] = 1;
                        rhs[index] = pressures.get(nodeId);
                    }
                });

                const solution = solveCholesky(matrix, rhs, size) || solveGaussian(matrix, rhs, size);
                if (!solution || !solution.every(Number.isFinite)) {
                    this.metrics.lastDiagnostics.push({
                        code: 'global_singular_matrix',
                        severity: 'warning',
                        message: 'O solver global encontrou uma matriz singular; a última estimativa foi mantida.'
                    });
                    break;
                }
                unknownIds.forEach((nodeId, index) => pressures.set(nodeId, solution[index]));
            }

            let maxChange = 0;
            let maxFlow = 0;
            network.links.forEach((link) => {
                if (!link.open) {
                    flows[link.index] = 0;
                    return;
                }
                const conductance = conductances[link.index];
                const base = flows[link.index] - (conductance * values[link.index]);
                const rawNextFlow = base + (conductance * (pressures.get(link.from) - pressures.get(link.to)));
                if (!Number.isFinite(rawNextFlow)) return;
                const nextFlow = Math.abs(rawNextFlow) < 1e-12 ? 0 : rawNextFlow;
                maxChange = Math.max(maxChange, Math.abs(nextFlow - flows[link.index]));
                maxFlow = Math.max(maxFlow, Math.abs(nextFlow));
                flows[link.index] = nextFlow;
            });

            if (maxChange <= FLOW_TOLERANCE_LPS + (RELATIVE_FLOW_TOLERANCE * maxFlow)) {
                converged = true;
                iterations += 1;
                break;
            }
        }

        unknownIds.forEach((nodeId) => {
            nodeState.get(nodeId).pressureBar = pressures.get(nodeId);
        });
        return { pressures, converged, iterations };
    }

    getEffectiveNodeFlowCapLps(network, node, flows) {
        if (node.flowCapLps === null) return null;
        if (node.boundaryKind !== 'tank-outlet' || !(network.dt > 0) || !Number.isFinite(node.flowCapLps)) {
            return node.flowCapLps;
        }
        const inletId = inputNodeId(node.component);
        const inflowLps = network.links
            .filter((link) => link.open && link.to === inletId)
            .reduce((sum, link) => sum + Math.max(0, flows[link.index]), 0);
        if (!(inflowLps > EPSILON_FLOW)) return node.flowCapLps;
        const availableAboveCushionL = Math.max(0, (node.availableVolumeL ?? 0) - TANK_OUTLET_CUSHION_L);
        return (availableAboveCushionL / network.dt) + inflowLps;
    }

    // Atualiza estados ativos; retorna true se algum estado mudou e a rede precisa ser resolvida de novo.
    updateStatuses(network, flows, pressures, nodeState) {
        let changed = false;

        network.links.forEach((link) => {
            if (link.forcedClosed || link.appliedCapLps != null) return;
            const flow = flows[link.index];
            if (link.open) {
                if (!link.bidirectional && flow < -STATUS_FLOW_TOLERANCE_LPS) {
                    link.open = false;
                    flows[link.index] = 0;
                    changed = true;
                }
                return;
            }

            const fromPressure = pressures.get(link.from) ?? 0;
            const toPressure = pressures.get(link.to) ?? 0;
            let drivingBar = fromPressure - toPressure;
            if (link.kind === 'connection') drivingBar += link.staticHeadBar;
            if (link.kind === 'pump') drivingBar += this.pumpBoostBar(link, 0, 1);
            if (drivingBar > STATUS_PRESSURE_TOLERANCE_BAR) {
                link.open = true;
                flows[link.index] = this.initialFlowGuess(link);
                changed = true;
            }
        });

        network.nodes.forEach((node) => {
            const effectiveCapLps = this.getEffectiveNodeFlowCapLps(network, node, flows);
            if (effectiveCapLps === null) return;
            const state = nodeState.get(node.id);
            const outflow = network.links
                .filter((link) => link.open && link.from === node.id)
                .reduce((sum, link) => sum + Math.max(0, flows[link.index]), 0);

            if (!state.capped && outflow > effectiveCapLps + STATUS_FLOW_TOLERANCE_LPS) {
                // A fronteira não sustenta a pressão nominal com essa vazão: passa a impor a vazão máxima.
                state.capped = true;
                state.fixed = false;
                state.injectionLps = effectiveCapLps;
                changed = true;
            } else if (state.capped && state.pressureBar > node.fixedPressureBar + STATUS_PRESSURE_TOLERANCE_BAR) {
                state.capped = false;
                state.fixed = true;
                state.pressureBar = node.fixedPressureBar;
                state.injectionLps = 0;
                changed = true;
            } else if (state.capped && Math.abs(state.injectionLps - effectiveCapLps) > STATUS_FLOW_TOLERANCE_LPS) {
                state.injectionLps = effectiveCapLps;
                changed = true;
            }
        });

        if (this.updateTankCushionCaps(network, flows, pressures, nodeState)) changed = true;
        if (this.releaseConflictingCaps(network, flows, nodeState)) changed = true;
        return changed;
    }

    // Num grupo de nós ligados sem nenhuma pressão fixa, as vazões impostas pelos tetos (fonte injetando
    // 50 L/s, vaso travado absorvendo 0) precisam fechar o balanço, senão não há solução. Se sobra entrada
    // imposta, soltam-se os tetos que impõem entrada no grupo (fontes, saída de um vaso a montante); se
    // sobra saída, os que impõem saída. Os soltos são reavaliados no passe seguinte. Grupos com alguma
    // pressão fixa não são mexidos, o que evita ping-pong entre ramos independentes.
    releaseConflictingCaps(network, flows, nodeState) {
        const hasCaps = network.links.some((link) => link.appliedCapLps != null)
            || [...nodeState.values()].some((state) => state.capped);
        if (!hasCaps) return false;
        const neighbors = new Map();
        const connect = (a, b) => {
            if (!neighbors.has(a)) neighbors.set(a, []);
            neighbors.get(a).push(b);
        };
        network.links.forEach((link) => {
            if (!link.open) return;
            connect(link.from, link.to);
            connect(link.to, link.from);
        });
        const visited = new Set();
        let changed = false;

        network.nodes.forEach((startNode) => {
            if (visited.has(startNode.id)) return;
            const group = new Set();
            const queue = [startNode.id];
            visited.add(startNode.id);
            while (queue.length > 0) {
                const nodeId = queue.pop();
                group.add(nodeId);
                (neighbors.get(nodeId) || []).forEach((nextId) => {
                    if (visited.has(nextId)) return;
                    visited.add(nextId);
                    queue.push(nextId);
                });
            }
            if ([...group].some((nodeId) => nodeState.get(nodeId).fixed)) return;

            // Tetos de nó só impõem entrada no grupo (fontes, saída de tanque aberto). Ramo no teto
            // impõe entrada no grupo da ponta "to" e saída no da ponta "from" (só se a outra ponta é de fora).
            const cappedNodeIds = [...group].filter((nodeId) => nodeState.get(nodeId).capped);
            const cappedLinks = network.links.filter((link) => link.appliedCapLps != null);
            const inflowLinks = cappedLinks.filter((link) =>
                group.has(link.to) && !group.has(link.from) && link.appliedCapLps > 0);
            const outflowLinks = cappedLinks.filter((link) =>
                group.has(link.from) && !group.has(link.to) && link.appliedCapLps > 0);
            const releaseNodes = (nodeIds) => nodeIds.forEach((nodeId) => {
                const state = nodeState.get(nodeId);
                state.capped = false;
                state.fixed = true;
                state.pressureBar = network.nodes.get(nodeId).fixedPressureBar;
                state.injectionLps = 0;
                changed = true;
            });
            const releaseLinks = (links) => links.forEach((link) => {
                nodeState.get(link.from).injectionLps += link.appliedCapLps;
                nodeState.get(link.to).injectionLps -= link.appliedCapLps;
                flows[link.index] = link.appliedCapLps;
                link.appliedCapLps = null;
                link.open = true;
                changed = true;
            });

            const imbalanceLps = [...group].reduce((sum, nodeId) => sum + nodeState.get(nodeId).injectionLps, 0);
            if (imbalanceLps > STATUS_FLOW_TOLERANCE_LPS) {
                releaseNodes(cappedNodeIds);
                releaseLinks(inflowLinks);
            } else if (imbalanceLps < -STATUS_FLOW_TOLERANCE_LPS) {
                releaseLinks(outflowLinks);
            } else if (cappedNodeIds.length > 0 || inflowLinks.length > 0) {
                // O balanço fecha, mas os tetos deixam o grupo sem referência de pressão (dois tetos
                // iguais, por exemplo): solta-se quem impõe entrada.
                releaseNodes(cappedNodeIds);
                releaseLinks(inflowLinks);
            } else {
                // Vaso travado que ficou isolado: sem quem empurre, o colchão volta à pressão do gás,
                // em vez de guardar a pressão da trava do passo anterior.
                releaseLinks(cappedLinks.filter((link) => link.kind === 'tank-gas' && group.has(link.from)));
            }
        });
        return changed;
    }

    // Teto de vazão dos ramos internos do vaso fechado: no colchão (gás no piso: só entra o que sai,
    // trava hidráulica) e no bocal de saída (líquido no bocal: sai no máximo o disponível mais o que
    // entra). Ramo no teto vira vazão imposta (injeções iguais e opostas nas pontas, sem criar nem perder
    // massa) e a pressão sai livre da rede. Solta quando a queda da rede ficaria abaixo da do teto.
    getTankLinkFlowCapLps(link, flows, dt) {
        if (link.kind === 'tank-gas') return link.maxNetInflowLps;
        if (link.kind !== 'tank-offset' || !link.inletLink) return null;
        const availableAboveCushionL = Math.max(0, link.availableVolumeL - TANK_OUTLET_CUSHION_L);
        return (availableAboveCushionL / dt) + Math.max(0, flows[link.inletLink.index]);
    }

    updateTankCushionCaps(network, flows, pressures, nodeState) {
        let changed = false;
        const applyInjection = (link, flowLps) => {
            nodeState.get(link.from).injectionLps -= flowLps;
            nodeState.get(link.to).injectionLps += flowLps;
        };
        network.links.forEach((link) => {
            if (!link.tankInternal || !(network.dt > 0)) return;
            const capLps = this.getTankLinkFlowCapLps(link, flows, network.dt);
            if (capLps === null) return;
            if (link.appliedCapLps == null) {
                if (!(flows[link.index] > capLps + STATUS_FLOW_TOLERANCE_LPS)) return;
                link.appliedCapLps = capLps;
                link.open = false;
                flows[link.index] = 0;
                applyInjection(link, capLps);
                changed = true;
                return;
            }
            const dropBar = (pressures.get(link.from) ?? 0) - (pressures.get(link.to) ?? 0);
            if (dropBar < this.evaluateLink(link, link.appliedCapLps) - STATUS_PRESSURE_TOLERANCE_BAR) {
                applyInjection(link, -link.appliedCapLps);
                flows[link.index] = link.appliedCapLps;
                link.appliedCapLps = null;
                link.open = true;
                changed = true;
            } else if (Math.abs(link.appliedCapLps - capLps) > STATUS_FLOW_TOLERANCE_LPS) {
                applyInjection(link, capLps - link.appliedCapLps);
                link.appliedCapLps = capLps;
                changed = true;
            }
        });
        return changed;
    }

    calculateMassResidual(network, flows, nodeState) {
        const balance = new Map();
        network.links.forEach((link) => {
            if (!link.open) return;
            const flow = flows[link.index];
            balance.set(link.from, (balance.get(link.from) || 0) - flow);
            balance.set(link.to, (balance.get(link.to) || 0) + flow);
        });
        let maxResidual = 0;
        nodeState.forEach((state, nodeId) => {
            if (state.fixed) return;
            maxResidual = Math.max(maxResidual, Math.abs((balance.get(nodeId) || 0) + state.injectionLps));
        });
        return maxResidual;
    }

    // ------------------------------------------------------------------
    // Escrita dos resultados no contrato de estado consumido pela interface
    // ------------------------------------------------------------------

    getTargetBoundaryPressureBar(link, pressures) {
        if (link.target instanceof DrenoLogico) return finiteNumber(link.target.pressaoSaidaBar, 0);
        return pressures.get(link.to) ?? 0;
    }

    writeConnectionStates(network, solution, dt) {
        const { flows, pressures } = solution;
        network.links.forEach((link) => {
            if (link.kind !== 'connection') return;
            const connection = link.connection;
            const state = this.context.getConnectionState(connection);
            const flowLps = link.open ? Math.max(0, flows[link.index]) : 0;
            const activeFlowLps = flowLps > EPSILON_FLOW ? flowLps : 0;
            const fromPressureBar = pressures.get(link.from) ?? 0;
            const toPressureBar = pressures.get(link.to) ?? 0;
            const hydraulics = this.context.getPipeHydraulics(
                connection,
                link.geometry,
                link.pipeAreaM2,
                activeFlowLps,
                link.fluid
            );
            const sourceLossBar = link.sourceLossCoeff * kineticPressureBar(activeFlowLps, link.sourceAreaM2, link.density);
            const targetLossBar = link.targetLossCoeff * kineticPressureBar(activeFlowLps, link.targetAreaM2, link.density);
            const distributedLossBar = hydraulics.distributedLossCoeff * kineticPressureBar(activeFlowLps, link.pipeAreaM2, link.density);
            const localLossBar = Math.max(0, finiteNumber(connection.perdaLocalK, 0))
                * kineticPressureBar(activeFlowLps, link.pipeAreaM2, link.density);
            const pipeInletPressureBar = fromPressureBar - sourceLossBar;
            const pipeOutletPressureBar = toPressureBar + targetLossBar;
            // Inclui a parcela inercial (aceleração do fluido); em regime permanente é só atrito e perdas locais.
            const pipePressureDropBar = activeFlowLps > 0
                ? pipeInletPressureBar + link.staticHeadBar - pipeOutletPressureBar
                : 0;
            const lossSlope = activeFlowLps > 0
                ? (this.connectionLossBar(link, activeFlowLps * 1.001) - this.connectionLossBar(link, activeFlowLps * 0.999))
                    / (activeFlowLps * 0.002)
                : 0;

            connection.transientFlowLps = activeFlowLps;
            connection.lastResolvedFlowLps = activeFlowLps;
            connection._activeTick = activeFlowLps > 0;

            state.flowLps = activeFlowLps;
            state.targetFlowLps = activeFlowLps;
            state.pressureBar = activeFlowLps > 0 ? pipeOutletPressureBar : toPressureBar;
            state.outletPressureBar = toPressureBar;
            state.sourcePressureBar = fromPressureBar;
            state.backPressureBar = this.getTargetBoundaryPressureBar(link, pressures);
            state.velocityMps = hydraulics.velocityMps;
            state.deltaPBar = activeFlowLps > 0 ? sourceLossBar + pipePressureDropBar : 0;
            state.pipeInletPressureBar = activeFlowLps > 0 ? pipeInletPressureBar : fromPressureBar;
            state.pipePressureDropBar = pipePressureDropBar;
            state.pipeOutletPressureBar = activeFlowLps > 0 ? pipeOutletPressureBar : toPressureBar;
            state.pipeDistributedLossBar = distributedLossBar;
            state.pipeLocalLossBar = localLossBar;
            state.totalLossBar = activeFlowLps > 0 ? sourceLossBar + pipePressureDropBar + targetLossBar : 0;
            state.targetLossBar = targetLossBar;
            state.lengthM = link.geometry.lengthM;
            state.straightLengthM = link.geometry.straightLengthM;
            state.headGainM = link.geometry.headGainM;
            // Constante de tempo física do trecho: inertância / (dΔP/dQ) no ponto de operação.
            state.responseTimeS = lossSlope > 0 ? link.inertanceBarPerLpsPerS / lossSlope : 0;
            state.reynolds = hydraulics.reynolds;
            state.frictionFactor = hydraulics.frictionFactor;
            state.relativeRoughness = hydraulics.relativeRoughness;
            state.regime = hydraulics.regime;
            state.fluid = state.fluid || link.fluid;
            state.fluidName = state.fluid?.nome || '';
        });
    }

    // Propaga fluido e temperatura em ordem topológica pelos ramos com escoamento, já com as vazões
    // resolvidas neste passo (mistura nos nós, conteúdo dos tanques, saída do trocador de calor).
    propagateConnectionFluids(network) {
        const connectionLinks = network.links.filter((link) => link.kind === 'connection');
        const flowingLinks = connectionLinks.filter((link) => this.context.getConnectionState(link.connection).flowLps > 0);
        const incomingByComponent = new Map();
        const outgoingByComponent = new Map();
        flowingLinks.forEach((link) => {
            if (!incomingByComponent.has(link.target.id)) incomingByComponent.set(link.target.id, []);
            if (!outgoingByComponent.has(link.source.id)) outgoingByComponent.set(link.source.id, []);
            incomingByComponent.get(link.target.id).push(link);
            outgoingByComponent.get(link.source.id).push(link);
        });

        const resolved = new Set();
        const pendingInputs = new Map();
        this.context.componentes.forEach((component) => {
            pendingInputs.set(component.id, (incomingByComponent.get(component.id) || []).length);
        });

        const mixIncoming = (component, filter = () => true) => {
            const contributions = (incomingByComponent.get(component.id) || [])
                .filter(filter)
                .map((link) => {
                    const state = this.context.getConnectionState(link.connection);
                    return { fluido: state.fluid || link.fluid, flowLps: state.flowLps };
                });
            if (contributions.length === 0) return null;
            return mixFluidos(contributions, contributions[0].fluido);
        };

        const assignOutlets = (component) => {
            const outgoing = outgoingByComponent.get(component.id) || [];
            if (outgoing.length === 0) return;

            let fluidForLink;
            if (component instanceof FonteLogica) {
                const fluid = component.fluidoEntrada || this.context.fluidoOperante;
                fluidForLink = () => fluid;
            } else if (component instanceof TanqueLogico) {
                const fluid = component.getFluidoSaidaAtual?.(this.context.fluidoOperante) || this.context.fluidoOperante;
                fluidForLink = () => fluid;
            } else if (component instanceof TrocadorCalorLogico) {
                const isStream2Link = (link) => isStream2Port(link.connection.targetEndpoint?.portId);
                const inlet1 = mixIncoming(component, (link) => !isStream2Link(link))
                    || component.getFluidoEntradaMisturadoPorPorta?.('in1', null);
                const inlet2 = mixIncoming(component, isStream2Link)
                    || component.getFluidoEntradaMisturadoPorPorta?.('in2', null);
                const flow1 = (incomingByComponent.get(component.id) || [])
                    .filter((link) => !isStream2Link(link))
                    .reduce((sum, link) => sum + this.context.getConnectionState(link.connection).flowLps, 0);
                const flow2 = (incomingByComponent.get(component.id) || [])
                    .filter(isStream2Link)
                    .reduce((sum, link) => sum + this.context.getConnectionState(link.connection).flowLps, 0);
                const result = component.calcularTrocaTermicaGlobal(inlet1, flow1, inlet2, flow2);
                const outletTemperature = (streamId, targetC, inlet) => (
                    component.getTemperaturaSaidaEfetivaC?.(streamId, targetC, inlet?.temperatura) ?? targetC
                );
                const outlet1 = inlet1 ? cloneFluido(inlet1, { temperatura: outletTemperature(1, result.t1Out, inlet1) }) : null;
                const outlet2 = inlet2 ? cloneFluido(inlet2, { temperatura: outletTemperature(2, result.t2Out, inlet2) }) : null;
                fluidForLink = (link) => (isStream2Port(link.connection.sourceEndpoint?.portId) ? outlet2 : outlet1);
            } else {
                const fluid = mixIncoming(component)
                    || this.context.getComponentFluid(component)
                    || this.context.fluidoOperante;
                fluidForLink = () => fluid;
            }

            outgoing.forEach((link) => {
                const state = this.context.getConnectionState(link.connection);
                const fluid = fluidForLink(link) || state.fluid || link.fluid;
                state.fluid = fluid;
                state.fluidName = fluid?.nome || '';
            });
        };

        const queue = this.context.componentes.filter((component) => pendingInputs.get(component.id) === 0);
        const processComponent = (component) => {
            if (resolved.has(component.id)) return;
            resolved.add(component.id);
            assignOutlets(component);
            (outgoingByComponent.get(component.id) || []).forEach((link) => {
                const remaining = (pendingInputs.get(link.target.id) || 0) - 1;
                pendingInputs.set(link.target.id, remaining);
                if (remaining === 0) queue.push(link.target);
            });
        };

        while (queue.length > 0) processComponent(queue.shift());
        // Componentes em ciclos usam o fluido do passo anterior nas entradas ainda não resolvidas.
        this.context.componentes.forEach((component) => processComponent(component));
    }

    storeNodePressuresOnComponents(network, solution) {
        network.nodes.forEach((node) => {
            const component = node.component;
            if (!component?.estadoHidraulico) return;
            const pressureBar = solution.pressures.get(node.id);
            if (!Number.isFinite(pressureBar)) return;
            const estado = component.estadoHidraulico;
            if (!estado.pressaoNoPorta) estado.pressaoNoPorta = {};
            estado.pressaoNoPorta[node.port] = pressureBar;
        });

        network.links.forEach((link) => {
            if (link.kind !== 'hx') return;
            const estado = link.component.estadoHidraulico;
            if (!estado.pressaoNoEntradaPorCorrente) estado.pressaoNoEntradaPorCorrente = {};
            estado.pressaoNoEntradaPorCorrente[link.streamId] = solution.pressures.get(link.from);
        });
    }

    applyPumpMetrics(network, solution) {
        network.links.forEach((link) => {
            if (link.kind !== 'pump') return;
            const pump = link.component;
            const flowLps = link.open ? Math.max(0, solution.flows[link.index]) : 0;
            const suctionPressureBar = solution.pressures.get(link.from) ?? 0;
            pump.densidadeOperacaoKgM3 = link.density;
            if (link.forcedClosed) return;
            const suction = this.evaluatePumpSuction(link, flowLps, suctionPressureBar);
            const hasSupply = this.pumpHasOpenSupply(network, link);
            pump.npshDisponivelM = hasSupply ? suction.npshAvailableM : 0;
            pump.npshRequeridoAtualM = suction.npshRequiredM;
            if (!hasSupply) pump.fatorCavitacaoAtual = 0;
            else pump.fatorCavitacaoAtual = link.open ? link.cavitationFactor : suction.cavitationFactor;
            pump.eficienciaAtual = pump.getEficienciaInstantanea(flowLps);
            if (flowLps > EPSILON_FLOW) pump.limparSucaoSemLiquido?.();
        });
    }

    reportBlockedFloatingLoops(network, analysis) {
        (analysis?.floatingCyclicIslands || []).forEach((island) => {
            if (!island.hasActivePump) return;
            const componentIds = new Set(island.componentIds);
            const blocked = network.links.some((link) =>
                link.forcedClosed && link.kind !== 'connection' && componentIds.has(link.component?.id));
            if (!blocked) return;
            this.metrics.lastDiagnostics.push({
                code: 'floating_closed_loop_blocked',
                severity: 'info',
                componentIds: [...island.componentIds],
                message: 'Malha fechada bloqueada por válvula ou bomba parada: a vazão física é zero.'
            });
        });
    }

    // Pressão absoluta abaixo da pressão de vapor indica separação de coluna/cavitação: o modelo
    // monofásico deixa de valer naquele ponto, então o motivo é sinalizado em vez de omitido.
    reportVaporPressureViolations(network, solution) {
        const offending = [];
        network.links.forEach((link) => {
            if (!link.open || link.kind === 'pump') return;
            const pressureBar = solution.pressures.get(link.from);
            const atmosphericBar = finiteNumber(link.fluid?.pressaoAtmosfericaBar, DEFAULT_ATMOSPHERIC_PRESSURE_BAR);
            const vaporBar = Math.max(0, finiteNumber(link.fluid?.pressaoVaporBar, 0));
            if (Number.isFinite(pressureBar) && pressureBar + atmosphericBar < vaporBar) {
                const tag = link.source?.tag || link.component?.tag;
                if (tag && !offending.includes(tag)) offending.push(tag);
            }
        });
        if (offending.length > 0) {
            this.metrics.lastDiagnostics.push({
                code: 'global_below_vapor_pressure',
                severity: 'warning',
                componentTags: offending,
                message: `Pressão absoluta abaixo da pressão de vapor em ${offending.join(', ')}: haveria cavitação ou separação de coluna.`
            });
        }
    }
}
