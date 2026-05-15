import { BombaLogica } from '../components/BombaLogica.js';
import { clamp, pressureLossFromFlow } from '../components/BaseComponente.js';
import { DrenoLogico } from '../components/DrenoLogico.js';
import { FonteLogica } from '../components/FonteLogica.js';
import { TanqueLogico } from '../components/TanqueLogico.js';
import { TrocadorCalorLogico } from '../components/TrocadorCalorLogico.js';
import { ValvulaLogica } from '../components/ValvulaLogica.js';
import {
    BAR_TO_PA,
    DEFAULT_ENTRY_LOSS,
    DEFAULT_PIPE_FRICTION,
    EPSILON_FLOW,
    GRAVITY,
    MAX_NETWORK_FLOW_LPS,
    lpsToM3s,
    pressureFromHeadBar
} from '../units/HydraulicUnits.js';

const MAX_NODAL_ITERATIONS = 42;
const NODAL_TOLERANCE_LPS = 0.0005;
const JACOBIAN_STEP_BAR = 0.0001;
const MAX_PRESSURE_BAR = 100;
const MIN_PRESSURE_BAR = -0.98;
const MAX_BISECTION_STEPS = 34;
const DEBUG_NODAL_SOLVER = false;

function inputNodeId(component) {
    return `${component.id}:in`;
}

function outputNodeId(component) {
    return `${component.id}:out`;
}

function finiteNumber(value, fallback = 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

function positiveNumber(value, fallback) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : fallback;
}

function getNodePressure(pressureByNodeId, nodeId, fallback = 0) {
    const pressure = pressureByNodeId.get(nodeId);
    return Number.isFinite(pressure) ? pressure : fallback;
}

function maxAbs(values) {
    return values.reduce((maxValue, value) => Math.max(maxValue, Math.abs(value)), 0);
}

function solveLinearSystem(matrix, rhs) {
    const size = rhs.length;
    const augmented = matrix.map((row, rowIndex) => [...row, rhs[rowIndex]]);

    for (let pivotIndex = 0; pivotIndex < size; pivotIndex += 1) {
        let bestRow = pivotIndex;
        for (let row = pivotIndex + 1; row < size; row += 1) {
            if (Math.abs(augmented[row][pivotIndex]) > Math.abs(augmented[bestRow][pivotIndex])) {
                bestRow = row;
            }
        }

        if (Math.abs(augmented[bestRow][pivotIndex]) < 1e-10) return null;

        if (bestRow !== pivotIndex) {
            const swap = augmented[pivotIndex];
            augmented[pivotIndex] = augmented[bestRow];
            augmented[bestRow] = swap;
        }

        const pivot = augmented[pivotIndex][pivotIndex];
        for (let column = pivotIndex; column <= size; column += 1) {
            augmented[pivotIndex][column] /= pivot;
        }

        for (let row = 0; row < size; row += 1) {
            if (row === pivotIndex) continue;
            const factor = augmented[row][pivotIndex];
            if (Math.abs(factor) < 1e-14) continue;

            for (let column = pivotIndex; column <= size; column += 1) {
                augmented[row][column] -= factor * augmented[pivotIndex][column];
            }
        }
    }

    return augmented.map((row) => row[size]);
}

export class NodalHydraulicSolver {
    constructor(hydraulicContext, hydraulicModel) {
        this.context = hydraulicContext;
        this.hydraulicModel = hydraulicModel;
        this.nodePressureGuesses = new Map();
        this.metrics = {
            mode: 'nodal',
            lastIterations: 0,
            lastError: 0,
            maxIterationsHit: 0,
            convergedCount: 0,
            totalSolverCalls: 0,
            lastDiagnostics: []
        };
    }

    resolve(dt, analysis = null) {
        this.metrics.totalSolverCalls++;
        this.metrics.lastDiagnostics = [...(analysis?.diagnostics || [])];

        this.context.resetHydraulicState();
        this.context.conexoes.forEach((connection) => {
            this.hydraulicModel.ensureConnectionProperties(connection);
            connection._activeTick = false;
        });

        const network = this.buildNetwork(dt, analysis);
        if (network.branches.length === 0) {
            this.metrics.lastIterations = 0;
            this.metrics.lastError = 0;
            this.metrics.convergedCount++;
            return;
        }

        if (this.tryResolveFloatingSeriesLoops(network, analysis, dt)) {
            return;
        }

        const pressureByNodeId = this.createInitialPressures(network);
        const unknownNodeIds = [...network.nodes.values()]
            .filter((node) => node.fixedPressureBar === null)
            .map((node) => node.id);

        let branchResults = this.calculateBranchResults(network, pressureByNodeId);
        let residual = this.calculateResidualVector(network, branchResults, unknownNodeIds);
        let residualNorm = maxAbs(residual);
        let converged = residualNorm <= NODAL_TOLERANCE_LPS;
        let iterations = 0;

        while (!converged && iterations < MAX_NODAL_ITERATIONS && unknownNodeIds.length > 0) {
            iterations += 1;
            const jacobian = this.calculateJacobian(network, pressureByNodeId, unknownNodeIds, residual);
            const correction = solveLinearSystem(jacobian, residual.map((value) => -value));

            if (!correction) {
                this.metrics.lastDiagnostics.push({
                    code: 'nodal_singular_matrix',
                    severity: 'warning',
                    message: 'O solver nodal encontrou uma matriz singular; a ultima estimativa fisicamente limitada foi mantida.'
                });
                break;
            }

            let accepted = false;
            let bestPressureByNodeId = pressureByNodeId;
            let bestBranchResults = branchResults;
            let bestResidual = residual;
            let bestResidualNorm = residualNorm;

            for (let trial = 0; trial < 8; trial += 1) {
                const damping = 1 / (2 ** trial);
                const candidatePressureByNodeId = new Map(pressureByNodeId);

                unknownNodeIds.forEach((nodeId, index) => {
                    const nextPressure = getNodePressure(pressureByNodeId, nodeId)
                        + (correction[index] * damping);
                    candidatePressureByNodeId.set(nodeId, clamp(nextPressure, MIN_PRESSURE_BAR, MAX_PRESSURE_BAR));
                });

                const candidateBranchResults = this.calculateBranchResults(network, candidatePressureByNodeId);
                const candidateResidual = this.calculateResidualVector(network, candidateBranchResults, unknownNodeIds);
                const candidateResidualNorm = maxAbs(candidateResidual);

                if (candidateResidualNorm < bestResidualNorm || trial === 7) {
                    bestPressureByNodeId = candidatePressureByNodeId;
                    bestBranchResults = candidateBranchResults;
                    bestResidual = candidateResidual;
                    bestResidualNorm = candidateResidualNorm;
                    accepted = true;
                    if (candidateResidualNorm < residualNorm) break;
                }
            }

            if (!accepted) break;

            pressureByNodeId.clear();
            bestPressureByNodeId.forEach((value, key) => pressureByNodeId.set(key, value));
            branchResults = bestBranchResults;
            residual = bestResidual;
            residualNorm = bestResidualNorm;
            converged = residualNorm <= NODAL_TOLERANCE_LPS;
        }

        this.enforceBoundaryFlowLimits(network, branchResults, dt);
        this.applySolvedConnectionStates(network, branchResults, pressureByNodeId, dt);
        const balanceError = this.hydraulicModel.balancePassThroughMass();
        this.applyPumpMetrics(network, branchResults, pressureByNodeId);
        this.hydraulicModel.relaxIdleConnections(dt);

        pressureByNodeId.forEach((pressureBar, nodeId) => {
            this.nodePressureGuesses.set(nodeId, pressureBar);
        });

        this.metrics.lastIterations = iterations;
        this.metrics.lastError = Math.max(residualNorm, balanceError);
        if (converged || unknownNodeIds.length === 0) {
            this.metrics.convergedCount++;
        } else {
            this.metrics.maxIterationsHit++;
            this.metrics.lastDiagnostics.push({
                code: 'nodal_not_converged',
                severity: 'warning',
                message: 'O solver nodal atingiu o limite de iteracoes antes da tolerancia final.'
            });
        }

        if (DEBUG_NODAL_SOLVER) {
            console.log('[NodalSolver]', {
                iterations,
                residualNorm,
                balanceError,
                diagnostics: this.metrics.lastDiagnostics
            });
        }
    }

    tryResolveFloatingSeriesLoops(network, analysis, dt) {
        const floatingIslands = analysis?.floatingCyclicIslands || [];
        if (floatingIslands.length !== 1) return false;

        const island = floatingIslands[0];
        const loop = this.buildFloatingSeriesLoop(network, island);
        if (!loop) return false;

        const highLimitLps = loop.pumpBranches.reduce((limit, branch) => {
            const pumpLimit = Math.max(0, branch.component.vazaoNominal * branch.component.getDriveAtual());
            return Math.min(limit, pumpLimit);
        }, MAX_NETWORK_FLOW_LPS);

        let flowLps = 0;
        if (highLimitLps > EPSILON_FLOW && this.evaluateSeriesLoopAtFlow(loop, 0).netPressureBar > EPSILON_FLOW) {
            const highEvaluation = this.evaluateSeriesLoopAtFlow(loop, highLimitLps);
            if (highEvaluation.netPressureBar >= 0) {
                flowLps = highLimitLps;
            } else {
                let low = 0;
                let high = highLimitLps;
                for (let step = 0; step < MAX_BISECTION_STEPS; step += 1) {
                    const mid = (low + high) / 2;
                    if (this.evaluateSeriesLoopAtFlow(loop, mid).netPressureBar >= 0) low = mid;
                    else high = mid;
                }
                flowLps = low;
            }
        }

        const evaluation = this.evaluateSeriesLoopAtFlow(loop, flowLps);
        const branchResults = network.branches.map((branch) => evaluation.resultByBranchId.get(branch.id)
            || this.createZeroBranchResult(
                branch,
                getNodePressure(evaluation.pressureByNodeId, branch.fromNodeId),
                getNodePressure(evaluation.pressureByNodeId, branch.toNodeId)
            ));

        this.applySolvedConnectionStates(network, branchResults, evaluation.pressureByNodeId, dt);
        const balanceError = this.hydraulicModel.balancePassThroughMass();
        this.applyPumpMetrics(network, branchResults, evaluation.pressureByNodeId);
        this.hydraulicModel.relaxIdleConnections(dt);

        evaluation.pressureByNodeId.forEach((pressureBar, nodeId) => {
            this.nodePressureGuesses.set(nodeId, pressureBar);
        });

        this.metrics.lastIterations = flowLps > EPSILON_FLOW ? MAX_BISECTION_STEPS : 0;
        this.metrics.lastError = balanceError;
        this.metrics.convergedCount++;
        return true;
    }

    buildFloatingSeriesLoop(network, island) {
        if (!island?.isFloating || !island.hasActivePump) return null;

        const componentIdSet = new Set(island.componentIds);
        const components = island.componentIds
            .map((componentId) => network.componentById.get(componentId))
            .filter(Boolean);
        if (components.some((component) =>
            component instanceof FonteLogica
            || component instanceof DrenoLogico
            || component instanceof TanqueLogico
        )) {
            return null;
        }

        const connectionBySourceId = new Map();
        const connectionByTargetId = new Map();
        this.context.conexoes.forEach((connection) => {
            if (!componentIdSet.has(connection.sourceId) || !componentIdSet.has(connection.targetId)) return;
            connectionBySourceId.set(connection.sourceId, [
                ...(connectionBySourceId.get(connection.sourceId) || []),
                connection
            ]);
            connectionByTargetId.set(connection.targetId, [
                ...(connectionByTargetId.get(connection.targetId) || []),
                connection
            ]);
        });

        if (components.some((component) =>
            (connectionBySourceId.get(component.id) || []).length !== 1
            || (connectionByTargetId.get(component.id) || []).length !== 1
        )) {
            return null;
        }

        const startComponent = components.find((component) =>
            component instanceof BombaLogica && component.getDriveAtual() > EPSILON_FLOW
        );
        if (!startComponent) return null;

        const branchByConnection = new Map(network.branches
            .filter((branch) => branch.kind === 'connection')
            .map((branch) => [branch.connection, branch]));
        const internalBranchByComponentId = new Map(network.branches
            .filter((branch) => branch.kind === 'internal' || branch.kind === 'pump')
            .map((branch) => [branch.component.id, branch]));

        const orderedComponents = [];
        const orderedConnectionBranches = [];
        let current = startComponent;

        for (let step = 0; step <= components.length; step += 1) {
            if (orderedComponents.includes(current)) {
                if (current !== startComponent || orderedComponents.length !== components.length) return null;
                break;
            }

            orderedComponents.push(current);
            const nextConnection = (connectionBySourceId.get(current.id) || [])[0];
            const nextBranch = branchByConnection.get(nextConnection);
            const nextComponent = network.componentById.get(nextConnection?.targetId);
            if (!nextBranch || !nextComponent) return null;
            orderedConnectionBranches.push(nextBranch);
            current = nextComponent;
        }

        const orderedInternalBranches = orderedComponents.map((component) => internalBranchByComponentId.get(component.id));
        if (orderedInternalBranches.some((branch) => !branch)) return null;

        const pumpBranches = orderedInternalBranches.filter((branch) => branch.kind === 'pump' && !branch.disabled);
        if (pumpBranches.length === 0) return null;

        return {
            startComponent,
            orderedComponents,
            orderedInternalBranches,
            orderedConnectionBranches,
            pumpBranches
        };
    }

    evaluateSeriesLoopAtFlow(loop, flowLps) {
        const pressureByNodeId = new Map();
        const resultByBranchId = new Map();
        let pressureBar = 0;

        pressureByNodeId.set(inputNodeId(loop.startComponent), pressureBar);

        loop.orderedComponents.forEach((component, index) => {
            const internalBranch = loop.orderedInternalBranches[index];
            const inputId = inputNodeId(component);
            const outputId = outputNodeId(component);
            pressureByNodeId.set(inputId, pressureBar);

            if (internalBranch.kind === 'pump') {
                const pumpState = this.evaluatePumpAtFlow(internalBranch, flowLps, pressureBar);
                const nextPressureBar = pressureBar + pumpState.boostBar - pumpState.lossBar;
                const result = {
                    branch: internalBranch,
                    flowLps,
                    fromPressureBar: pressureBar,
                    toPressureBar: nextPressureBar,
                    availablePressureBar: Math.max(0, pumpState.boostBar),
                    lossBar: pumpState.lossBar,
                    totalLossCoeff: pumpState.lossCoeff,
                    pipeHydraulics: this.getBranchHydraulics(internalBranch, flowLps),
                    fluid: internalBranch.fluid,
                    pumpState
                };
                resultByBranchId.set(internalBranch.id, result);
                pressureBar = nextPressureBar;
            } else {
                const lossBar = this.getBranchLossBar(internalBranch, flowLps);
                const nextPressureBar = pressureBar - lossBar;
                resultByBranchId.set(internalBranch.id, this.createPassiveResultAtFlow(
                    internalBranch,
                    flowLps,
                    pressureBar,
                    nextPressureBar
                ));
                pressureBar = nextPressureBar;
            }

            pressureByNodeId.set(outputId, pressureBar);

            const connectionBranch = loop.orderedConnectionBranches[index];
            const nextComponent = loop.orderedComponents[(index + 1) % loop.orderedComponents.length];
            const connectionLossBar = this.getBranchLossBar(connectionBranch, flowLps);
            const nextPressureBar = pressureBar + connectionBranch.staticHeadBar - connectionLossBar;
            resultByBranchId.set(connectionBranch.id, this.createPassiveResultAtFlow(
                connectionBranch,
                flowLps,
                pressureBar,
                nextPressureBar
            ));
            pressureBar = nextPressureBar;
            pressureByNodeId.set(inputNodeId(nextComponent), pressureBar);
        });

        return {
            pressureByNodeId,
            resultByBranchId,
            netPressureBar: pressureBar
        };
    }

    getMetrics() {
        return { ...this.metrics, lastDiagnostics: [...this.metrics.lastDiagnostics] };
    }

    buildNetwork(dt, analysis) {
        const nodes = new Map();
        const branches = [];
        const componentById = new Map(this.context.componentes.map((component) => [component.id, component]));

        const addNode = (id, component, port) => {
            if (!nodes.has(id)) {
                nodes.set(id, {
                    id,
                    component,
                    port,
                    fixedPressureBar: null,
                    floatingReference: false
                });
            }
            return nodes.get(id);
        };

        this.context.componentes.forEach((component) => {
            const inputNode = addNode(inputNodeId(component), component, 'in');
            const outputNode = addNode(outputNodeId(component), component, 'out');
            const fluid = this.resolveComponentFluid(component);

            if (component instanceof FonteLogica) {
                outputNode.fixedPressureBar = Math.max(0, finiteNumber(component.pressaoFonteBar, 0));
            } else if (component instanceof DrenoLogico) {
                inputNode.fixedPressureBar = Math.max(0, finiteNumber(component.pressaoSaidaBar, 0));
            } else if (component instanceof TanqueLogico) {
                inputNode.fixedPressureBar = component.getBackPressureAtInletBar(fluid, this.context.usarAlturaRelativa);
                outputNode.fixedPressureBar = component.temLiquidoDisponivelSaida?.(this.context.usarAlturaRelativa) === false
                    ? 0
                    : component.getPressaoDisponivelSaidaBar(fluid, this.context.usarAlturaRelativa);
            }

            const internalBranch = this.createInternalBranch(component, inputNode.id, outputNode.id, fluid);
            if (internalBranch) branches.push(internalBranch);
        });

        this.context.conexoes.forEach((connection) => {
            const source = componentById.get(connection.sourceId);
            const target = componentById.get(connection.targetId);
            if (!source || !target) return;

            const branch = this.createConnectionBranch(connection, source, target);
            if (branch) branches.push(branch);
        });

        this.addFloatingReferences(nodes, analysis);

        return {
            nodes,
            branches,
            componentById
        };
    }

    addFloatingReferences(nodes, analysis) {
        const islands = analysis?.islands || [];
        islands.forEach((island) => {
            if (!island.isFloating) return;

            const candidateNodes = island.componentIds
                .flatMap((componentId) => [`${componentId}:in`, `${componentId}:out`])
                .map((nodeId) => nodes.get(nodeId))
                .filter(Boolean);

            if (candidateNodes.some((node) => node.fixedPressureBar !== null)) return;

            const referenceNode = candidateNodes[0];
            if (!referenceNode) return;
            referenceNode.fixedPressureBar = 0;
            referenceNode.floatingReference = true;
        });
    }

    createInitialPressures(network) {
        const fixedPressures = [...network.nodes.values()]
            .map((node) => node.fixedPressureBar)
            .filter((pressure) => pressure !== null && Number.isFinite(pressure));
        const fallbackPressure = fixedPressures.length > 0
            ? fixedPressures.reduce((sum, pressure) => sum + pressure, 0) / fixedPressures.length
            : 0;
        const pressureByNodeId = new Map();

        network.nodes.forEach((node) => {
            if (node.fixedPressureBar !== null) {
                pressureByNodeId.set(node.id, node.fixedPressureBar);
                return;
            }

            const previousPressure = this.nodePressureGuesses.get(node.id);
            pressureByNodeId.set(
                node.id,
                clamp(Number.isFinite(previousPressure) ? previousPressure : fallbackPressure, MIN_PRESSURE_BAR, MAX_PRESSURE_BAR)
            );
        });

        this.seedPumpDrivenPressures(network, pressureByNodeId);
        return pressureByNodeId;
    }

    seedPumpDrivenPressures(network, pressureByNodeId) {
        const setIfUnknownAndHigher = (nodeId, pressureBar) => {
            const node = network.nodes.get(nodeId);
            if (!node || node.fixedPressureBar !== null) return;

            const currentPressure = getNodePressure(pressureByNodeId, nodeId);
            if (pressureBar <= currentPressure) return;
            pressureByNodeId.set(nodeId, clamp(pressureBar, MIN_PRESSURE_BAR, MAX_PRESSURE_BAR));
        };

        for (let pass = 0; pass < Math.max(1, network.branches.length); pass += 1) {
            network.branches.forEach((branch) => {
                if (branch.disabled) return;

                const fromPressureBar = getNodePressure(pressureByNodeId, branch.fromNodeId);
                if (branch.kind === 'pump') {
                    const drive = branch.component.getDriveAtual();
                    const seedBoostBar = branch.component.getCurvaPressaoBar(0, drive) * 0.85;
                    setIfUnknownAndHigher(branch.toNodeId, fromPressureBar + seedBoostBar);
                    return;
                }

                const seedLossBar = branch.kind === 'connection' ? 0.08 : 0.04;
                setIfUnknownAndHigher(
                    branch.toNodeId,
                    fromPressureBar + branch.staticHeadBar - seedLossBar
                );
            });
        }
    }

    createConnectionBranch(connection, source, target) {
        this.hydraulicModel.ensureConnectionProperties(connection);

        const geometry = this.context.getConnectionGeometry(connection);
        const fluid = this.resolveComponentFluid(source) || this.context.getConnectionFluid(connection);
        const sourceArea = positiveNumber(source.getAreaConexaoM2?.(), connection.areaM2);
        const targetArea = positiveNumber(target.getAreaConexaoM2?.(), connection.areaM2);
        const areaM2 = Math.min(connection.areaM2, sourceArea, targetArea);
        const sourceOutletLossCoeff = this.getSourceOutletLossCoeff(source);
        const targetEntryLossCoeff = this.getBoundaryTargetEntryLossCoeff(target);
        const disabled = source instanceof TanqueLogico
            && source.temLiquidoDisponivelSaida?.(this.context.usarAlturaRelativa) === false;

        return {
            id: `connection:${connection.id}`,
            kind: 'connection',
            connection,
            fromNodeId: outputNodeId(source),
            toNodeId: inputNodeId(target),
            source,
            target,
            areaM2,
            geometry,
            baseLossCoeff: Math.max(0, 1 + connection.perdaLocalK + sourceOutletLossCoeff + targetEntryLossCoeff),
            staticHeadBar: pressureFromHeadBar(geometry.headGainM, fluid.densidade),
            fluid,
            disabled,
            maxFlowLps: MAX_NETWORK_FLOW_LPS
        };
    }

    createInternalBranch(component, fromNodeId, toNodeId, fluid) {
        if (component instanceof ValvulaLogica) {
            const parametros = component.getParametrosHidraulicos();
            return {
                id: `internal:${component.id}`,
                kind: 'internal',
                component,
                fromNodeId,
                toNodeId,
                areaM2: parametros.hydraulicAreaM2,
                geometry: null,
                baseLossCoeff: parametros.localLossCoeff,
                staticHeadBar: 0,
                fluid,
                disabled: parametros.opening <= EPSILON_FLOW,
                maxFlowLps: MAX_NETWORK_FLOW_LPS
            };
        }

        if (component instanceof TrocadorCalorLogico) {
            const parametros = component.getParametrosHidraulicos();
            return {
                id: `internal:${component.id}`,
                kind: 'internal',
                component,
                fromNodeId,
                toNodeId,
                areaM2: parametros.hydraulicAreaM2,
                geometry: null,
                baseLossCoeff: parametros.localLossCoeff,
                staticHeadBar: 0,
                fluid,
                disabled: false,
                maxFlowLps: MAX_NETWORK_FLOW_LPS
            };
        }

        if (component instanceof BombaLogica) {
            const drive = component.getDriveAtual();
            return {
                id: `internal:${component.id}`,
                kind: 'pump',
                component,
                fromNodeId,
                toNodeId,
                areaM2: component.getAreaConexaoM2(),
                geometry: null,
                baseLossCoeff: 0,
                staticHeadBar: 0,
                fluid,
                disabled: drive <= EPSILON_FLOW,
                maxFlowLps: Math.max(0, component.vazaoNominal * drive)
            };
        }

        return null;
    }

    getSourceOutletLossCoeff(source) {
        if (source instanceof FonteLogica) return DEFAULT_ENTRY_LOSS;
        if (source instanceof TanqueLogico) {
            return 1.0 / Math.max(0.15, source.coeficienteSaida * source.coeficienteSaida);
        }
        return 0;
    }

    getBoundaryTargetEntryLossCoeff(target) {
        if (target instanceof TanqueLogico || target instanceof DrenoLogico) {
            return Math.max(0, target.perdaEntradaK || 0);
        }
        return 0;
    }

    resolveComponentFluid(component) {
        if (component instanceof FonteLogica) return component.fluidoEntrada || this.context.fluidoOperante;
        if (component instanceof TanqueLogico) {
            return component.getFluidoSaidaAtual?.(this.context.fluidoOperante) || component.getFluidoConteudo?.() || this.context.fluidoOperante;
        }
        return this.context.getComponentFluid(component) || this.context.fluidoOperante;
    }

    calculateBranchResults(network, pressureByNodeId) {
        return network.branches.map((branch) => {
            if (branch.kind === 'pump') return this.calculatePumpBranchResult(branch, pressureByNodeId);
            return this.calculatePassiveBranchResult(branch, pressureByNodeId);
        });
    }

    calculatePassiveBranchResult(branch, pressureByNodeId) {
        const fromPressureBar = getNodePressure(pressureByNodeId, branch.fromNodeId);
        const toPressureBar = getNodePressure(pressureByNodeId, branch.toNodeId);
        const availablePressureBar = fromPressureBar + branch.staticHeadBar - toPressureBar;

        if (branch.disabled || availablePressureBar <= EPSILON_FLOW) {
            return this.createZeroBranchResult(branch, fromPressureBar, toPressureBar);
        }

        const flowLps = this.solvePassiveFlowForPressure(branch, availablePressureBar);
        const hydraulics = this.getBranchHydraulics(branch, flowLps);
        const totalLossCoeff = branch.baseLossCoeff + hydraulics.distributedLossCoeff;
        const lossBar = pressureLossFromFlow(flowLps, branch.areaM2, branch.fluid.densidade, totalLossCoeff);

        return {
            branch,
            flowLps,
            fromPressureBar,
            toPressureBar,
            availablePressureBar,
            lossBar,
            totalLossCoeff,
            pipeHydraulics: hydraulics,
            fluid: branch.fluid
        };
    }

    calculatePumpBranchResult(branch, pressureByNodeId) {
        const pump = branch.component;
        const fromPressureBar = getNodePressure(pressureByNodeId, branch.fromNodeId);
        const toPressureBar = getNodePressure(pressureByNodeId, branch.toNodeId);
        const drive = pump.getDriveAtual();
        const qMax = Math.min(branch.maxFlowLps, pump.vazaoNominal * drive);

        if (branch.disabled || drive <= EPSILON_FLOW || qMax <= EPSILON_FLOW) {
            return this.createZeroBranchResult(branch, fromPressureBar, toPressureBar);
        }

        const residualAt = (flowLps) => {
            const pumpState = this.evaluatePumpAtFlow(branch, flowLps, fromPressureBar);
            return fromPressureBar + pumpState.boostBar - pumpState.lossBar - toPressureBar;
        };

        if (residualAt(0) <= EPSILON_FLOW) {
            return {
                ...this.createZeroBranchResult(branch, fromPressureBar, toPressureBar),
                pumpState: this.evaluatePumpAtFlow(branch, 0, fromPressureBar)
            };
        }

        let flowLps = qMax;
        if (residualAt(qMax) < 0) {
            let low = 0;
            let high = qMax;

            for (let step = 0; step < MAX_BISECTION_STEPS; step += 1) {
                const mid = (low + high) / 2;
                if (residualAt(mid) >= 0) low = mid;
                else high = mid;
            }

            flowLps = low;
        }

        const pumpState = this.evaluatePumpAtFlow(branch, flowLps, fromPressureBar);

        return {
            branch,
            flowLps,
            fromPressureBar,
            toPressureBar,
            availablePressureBar: Math.max(0, fromPressureBar + pumpState.boostBar - toPressureBar),
            lossBar: pumpState.lossBar,
            totalLossCoeff: pumpState.lossCoeff,
            pipeHydraulics: this.getBranchHydraulics(branch, flowLps),
            fluid: branch.fluid,
            pumpState
        };
    }

    createZeroBranchResult(branch, fromPressureBar, toPressureBar) {
        return {
            branch,
            flowLps: 0,
            fromPressureBar,
            toPressureBar,
            availablePressureBar: 0,
            lossBar: 0,
            totalLossCoeff: branch.baseLossCoeff,
            pipeHydraulics: this.getBranchHydraulics(branch, 0),
            fluid: branch.fluid
        };
    }

    createPassiveResultAtFlow(branch, flowLps, fromPressureBar, toPressureBar) {
        const hydraulics = this.getBranchHydraulics(branch, flowLps);
        const totalLossCoeff = branch.baseLossCoeff + hydraulics.distributedLossCoeff;
        const lossBar = pressureLossFromFlow(flowLps, branch.areaM2, branch.fluid.densidade, totalLossCoeff);

        return {
            branch,
            flowLps,
            fromPressureBar,
            toPressureBar,
            availablePressureBar: Math.max(0, fromPressureBar + branch.staticHeadBar - toPressureBar),
            lossBar,
            totalLossCoeff,
            pipeHydraulics: hydraulics,
            fluid: branch.fluid
        };
    }

    solvePassiveFlowForPressure(branch, pressureBar) {
        const maxFlowLps = Math.max(0, branch.maxFlowLps || MAX_NETWORK_FLOW_LPS);
        if (maxFlowLps <= EPSILON_FLOW) return 0;

        let high = Math.min(maxFlowLps, Math.max(1, branch.connection?.lastResolvedFlowLps || 1));
        while (high < maxFlowLps && this.getBranchLossBar(branch, high) < pressureBar) {
            high = Math.min(maxFlowLps, high * 2);
        }

        if (this.getBranchLossBar(branch, high) <= pressureBar) return high;

        let low = 0;
        for (let step = 0; step < MAX_BISECTION_STEPS; step += 1) {
            const mid = (low + high) / 2;
            if (this.getBranchLossBar(branch, mid) <= pressureBar) low = mid;
            else high = mid;
        }

        return low;
    }

    getBranchHydraulics(branch, flowLps) {
        if (branch.kind !== 'connection' || !branch.connection || !branch.geometry) {
            return {
                velocityMps: branch.areaM2 > 0 ? lpsToM3s(flowLps) / branch.areaM2 : 0,
                reynolds: 0,
                relativeRoughness: 0,
                frictionFactor: DEFAULT_PIPE_FRICTION,
                regime: flowLps > EPSILON_FLOW ? 'interno' : 'sem fluxo',
                distributedLossCoeff: 0
            };
        }

        return this.context.getPipeHydraulics(
            branch.connection,
            branch.geometry,
            branch.areaM2,
            flowLps,
            branch.fluid
        );
    }

    getBranchLossBar(branch, flowLps) {
        const hydraulics = this.getBranchHydraulics(branch, flowLps);
        const totalLossCoeff = branch.baseLossCoeff + hydraulics.distributedLossCoeff;
        return pressureLossFromFlow(flowLps, branch.areaM2, branch.fluid.densidade, totalLossCoeff);
    }

    evaluatePumpAtFlow(branch, flowLps, suctionPressureBar) {
        const pump = branch.component;
        const fluid = branch.fluid || this.context.fluidoOperante;
        const drive = pump.getDriveAtual();
        const velocityMps = branch.areaM2 > 0 ? lpsToM3s(flowLps) / branch.areaM2 : 0;
        const suctionVelocityHeadM = (velocityMps * velocityMps) / (2 * GRAVITY);
        const absoluteSuctionBar = (fluid.pressaoAtmosfericaBar || 1.01325) + suctionPressureBar;
        const npshAvailableM = Math.max(
            0,
            (((absoluteSuctionBar - (fluid.pressaoVaporBar || 0)) * BAR_TO_PA) / (fluid.densidade * GRAVITY))
            + suctionVelocityHeadM
        );
        const npshRequiredM = pump.getCurvaNpshRequeridoM(flowLps, drive);
        const cavitationFactor = pump.calcularFatorCavitacao(npshAvailableM, npshRequiredM);
        const boostBar = pump.getCurvaPressaoBar(flowLps, drive) * cavitationFactor;
        const efficiency = pump.getEficienciaInstantanea(flowLps);
        const lossCoeff = 1.0 / Math.max(0.18, efficiency);
        const lossBar = pressureLossFromFlow(flowLps, branch.areaM2, fluid.densidade, lossCoeff);

        return {
            boostBar,
            lossBar,
            lossCoeff,
            npshAvailableM,
            npshRequiredM,
            cavitationFactor,
            efficiency
        };
    }

    calculateResidualVector(network, branchResults, unknownNodeIds) {
        const residualByNodeId = new Map(unknownNodeIds.map((nodeId) => [nodeId, 0]));

        branchResults.forEach((result) => {
            const { branch, flowLps } = result;
            if (flowLps <= EPSILON_FLOW) return;

            if (residualByNodeId.has(branch.fromNodeId)) {
                residualByNodeId.set(branch.fromNodeId, residualByNodeId.get(branch.fromNodeId) - flowLps);
            }
            if (residualByNodeId.has(branch.toNodeId)) {
                residualByNodeId.set(branch.toNodeId, residualByNodeId.get(branch.toNodeId) + flowLps);
            }
        });

        return unknownNodeIds.map((nodeId) => residualByNodeId.get(nodeId) || 0);
    }

    calculateJacobian(network, pressureByNodeId, unknownNodeIds, baseResidual) {
        return unknownNodeIds.map((_, rowIndex) => {
            return unknownNodeIds.map((nodeId) => {
                const perturbedPressures = new Map(pressureByNodeId);
                perturbedPressures.set(nodeId, getNodePressure(pressureByNodeId, nodeId) + JACOBIAN_STEP_BAR);
                const perturbedResults = this.calculateBranchResults(network, perturbedPressures);
                const perturbedResidual = this.calculateResidualVector(network, perturbedResults, unknownNodeIds);
                return (perturbedResidual[rowIndex] - baseResidual[rowIndex]) / JACOBIAN_STEP_BAR;
            });
        });
    }

    enforceBoundaryFlowLimits(network, branchResults, dt) {
        const scaleResults = (results, limitLps) => {
            const totalFlowLps = results.reduce((sum, result) => sum + Math.max(0, result.flowLps), 0);
            if (totalFlowLps <= limitLps + EPSILON_FLOW) return;
            const ratio = limitLps > EPSILON_FLOW ? limitLps / totalFlowLps : 0;
            results.forEach((result) => {
                result.flowLps *= ratio;
                result.cappedByBoundary = true;
            });
        };

        this.context.componentes.forEach((component) => {
            const outgoing = branchResults.filter((result) =>
                result.branch.kind === 'connection'
                && result.branch.source === component
                && result.flowLps > EPSILON_FLOW
            );
            const incoming = branchResults.filter((result) =>
                result.branch.kind === 'connection'
                && result.branch.target === component
                && result.flowLps > EPSILON_FLOW
            );

            if (component instanceof FonteLogica) {
                scaleResults(outgoing, Math.max(0, component.vazaoMaxima || 0));
            } else if (component instanceof TanqueLogico) {
                const inventoryLimitLps = dt > 0 ? Math.max(0, component.volumeAtual) / dt : MAX_NETWORK_FLOW_LPS;
                scaleResults(outgoing, inventoryLimitLps);

                const outgoingFlowLps = outgoing.reduce((sum, result) => sum + Math.max(0, result.flowLps), 0);
                const freeVolumeL = Math.max(0, component.capacidadeMaxima - component.volumeAtual);
                const netInputLimitLps = outgoingFlowLps + (dt > 0 ? freeVolumeL / dt : MAX_NETWORK_FLOW_LPS);
                scaleResults(incoming, netInputLimitLps);
            }
        });
    }

    applySolvedConnectionStates(network, branchResults, pressureByNodeId, dt) {
        branchResults.forEach((result) => {
            const branch = result.branch;
            if (branch.kind !== 'connection' || !branch.connection) return;

            const connection = branch.connection;
            const state = this.context.getConnectionState(connection);
            const flowLps = Math.max(0, result.flowLps);
            const fluid = this.resolveConnectionFluid(branch, flowLps);
            const pipeHydraulics = this.context.getPipeHydraulics(
                connection,
                branch.geometry,
                branch.areaM2,
                flowLps,
                fluid
            );
            const totalLossCoeff = branch.baseLossCoeff + pipeHydraulics.distributedLossCoeff;
            const totalLossBar = pressureLossFromFlow(flowLps, branch.areaM2, fluid.densidade, totalLossCoeff);
            const responseTimeS = this.hydraulicModel.getConnectionResponseTimeS(connection, branch.geometry, fluid);
            const fromPressureBar = getNodePressure(pressureByNodeId, branch.fromNodeId, result.fromPressureBar);
            const toPressureBar = getNodePressure(pressureByNodeId, branch.toNodeId, result.toPressureBar);

            connection.transientFlowLps = flowLps;
            connection.lastResolvedFlowLps = flowLps;
            connection._activeTick = flowLps > EPSILON_FLOW;

            state.flowLps = flowLps;
            state.targetFlowLps = flowLps;
            state.pressureBar = toPressureBar;
            state.outletPressureBar = toPressureBar;
            state.sourcePressureBar = fromPressureBar;
            state.backPressureBar = toPressureBar;
            state.velocityMps = pipeHydraulics.velocityMps;
            state.deltaPBar = Math.max(0, fromPressureBar + branch.staticHeadBar - toPressureBar);
            state.totalLossBar = totalLossBar;
            state.targetLossBar = 0;
            state.lengthM = branch.geometry.lengthM;
            state.straightLengthM = branch.geometry.straightLengthM;
            state.headGainM = branch.geometry.headGainM;
            state.responseTimeS = responseTimeS;
            state.reynolds = pipeHydraulics.reynolds;
            state.frictionFactor = pipeHydraulics.frictionFactor;
            state.relativeRoughness = pipeHydraulics.relativeRoughness;
            state.regime = pipeHydraulics.regime;
            state.fluid = fluid;
            state.fluidName = fluid?.nome || '';
        });
    }

    resolveConnectionFluid(branch, flowLps) {
        const source = branch.source;
        const fallback = branch.fluid || this.context.fluidoOperante;

        if (source instanceof FonteLogica) return source.fluidoEntrada || fallback;
        if (source instanceof TanqueLogico) return source.getFluidoSaidaAtual?.(fallback) || fallback;
        if (source instanceof TrocadorCalorLogico) {
            const inletFluid = source.getFluidoEntradaMisturado?.(fallback) || fallback;
            return source.getFluidoSaidaPara(inletFluid, flowLps);
        }
        if (typeof source?.getFluidoEntradaMisturado === 'function') {
            return source.getFluidoEntradaMisturado(fallback) || fallback;
        }

        return fallback;
    }

    applyPumpMetrics(network, branchResults, pressureByNodeId) {
        branchResults
            .filter((result) => result.branch.kind === 'pump')
            .forEach((result) => {
                const pump = result.branch.component;
                const flowLps = this.context.getOutputConnections(pump)
                    .reduce((sum, connection) => sum + this.context.getConnectionState(connection).flowLps, 0);
                const suctionPressureBar = getNodePressure(pressureByNodeId, result.branch.fromNodeId, pump.getPressaoEntradaBar());
                const pumpState = this.evaluatePumpAtFlow(result.branch, flowLps, suctionPressureBar);

                pump.npshDisponivelM = pumpState.npshAvailableM;
                pump.npshRequeridoAtualM = pumpState.npshRequiredM;
                pump.fatorCavitacaoAtual = pumpState.cavitationFactor;
                pump.eficienciaAtual = pumpState.efficiency;
                if (flowLps > EPSILON_FLOW) pump.limparSucaoSemLiquido?.();
            });
    }
}
