import { BombaLogica } from '../components/BombaLogica.js';
import { DrenoLogico } from '../components/DrenoLogico.js';
import { FonteLogica } from '../components/FonteLogica.js';
import { TanqueLogico } from '../components/TanqueLogico.js';
import { TrocadorCalorLogico } from '../components/TrocadorCalorLogico.js';
import { ValvulaLogica } from '../components/ValvulaLogica.js';
import { clamp, flowFromBernoulli, pressureLossFromFlow, smoothFirstOrder } from '../components/BaseComponente.js';
import {
    BAR_TO_PA,
    DEFAULT_ENTRY_LOSS,
    DEFAULT_FLUID_VISCOSITY_PA_S,
    DEFAULT_PIPE_DIAMETER_M,
    DEFAULT_PIPE_FRICTION,
    EPSILON_FLOW,
    GRAVITY,
    MAX_NETWORK_FLOW_LPS,
    areaFromDiameter,
    lpsToM3s,
    pressureFromHeadBar
} from '../../utils/Units.js';
import { getConnectionResponseTimeS as calculateConnectionResponseTimeS } from './PipeHydraulics.js';

export class HydraulicBranchModel {
    constructor(hydraulicContext) {
        this.context = hydraulicContext;
    }

    ensureConnectionProperties(conn) {
        return this.context.ensureConnectionProperties(conn);
    }

    getConnectionResponseTimeS(conn, geometry, fluid = this.context.getConnectionFluid(conn)) {
        return calculateConnectionResponseTimeS(conn, geometry, fluid || this.context.fluidoOperante);
    }

    applyConnectionDynamics(conn, targetFlowLps, dt, geometry, isPassThrough = false, fluid = this.context.getConnectionFluid(conn)) {
        const responseTimeS = this.getConnectionResponseTimeS(conn, geometry, fluid);
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
        this.context.conexoes.forEach(conn => {
            if (conn._activeTick) return;

            this.ensureConnectionProperties(conn);
            const geometry = this.context.getConnectionGeometry(conn);
            const { flowLps, responseTimeS } = this.applyConnectionDynamics(conn, 0, dt, geometry);
            const state = this.context.getConnectionState(conn);

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

            const fluid = this.context.getConnectionFluid(conn);
            const pipeHydraulics = this.context.getPipeHydraulics(conn, geometry, conn.areaM2, flowLps, fluid);
            state.flowLps = flowLps;
            state.fluid = fluid;
            state.fluidName = fluid?.nome || '';
            state.velocityMps = pipeHydraulics.velocityMps;
            state.reynolds = pipeHydraulics.reynolds;
            state.frictionFactor = pipeHydraulics.frictionFactor;
            state.relativeRoughness = pipeHydraulics.relativeRoughness;
            state.regime = pipeHydraulics.regime;
            state.deltaPBar = pressureLossFromFlow(
                flowLps,
                conn.areaM2,
                fluid.densidade,
                1 + conn.perdaLocalK + pipeHydraulics.distributedLossCoeff
            );
            state.totalLossBar = state.deltaPBar;
        });
    }

    scaleConnectionState(conn, ratio) {
        const safeRatio = clamp(Number(ratio) || 0, 0, 1);
        const state = this.context.getConnectionState(conn);
        const pressureRatio = safeRatio * safeRatio;

        state.flowLps *= safeRatio;
        state.targetFlowLps *= safeRatio;
        state.velocityMps *= safeRatio;
        state.reynolds *= safeRatio;
        state.deltaPBar *= pressureRatio;
        state.totalLossBar *= pressureRatio;
        state.targetLossBar *= pressureRatio;
        conn.transientFlowLps = state.flowLps;
        conn.lastResolvedFlowLps = state.targetFlowLps;

        if (state.flowLps <= EPSILON_FLOW) {
            state.flowLps = 0;
            state.targetFlowLps = 0;
            state.velocityMps = 0;
            state.reynolds = 0;
            state.deltaPBar = 0;
            state.totalLossBar = 0;
            state.targetLossBar = 0;
            state.regime = 'sem fluxo';
            conn.transientFlowLps = 0;
            conn.lastResolvedFlowLps = 0;
        }
    }

    rebuildComponentHydraulicStateFromConnections() {
        this.context.componentes.forEach((component) => component.resetEstadoHidraulico());

        this.context.conexoes.forEach((conn) => {
            const state = this.context.getConnectionState(conn);
            if (state.flowLps <= EPSILON_FLOW) return;

            const source = this.context.getComponentById(conn.sourceId);
            const target = this.context.getComponentById(conn.targetId);
            if (!source || !target) return;

            const fluid = state.fluid || this.context.getConnectionFluid(conn);
            source.registrarSaida(state.flowLps, state.sourcePressureBar || state.pressureBar || 0, fluid);
            target.registrarEntrada(state.flowLps, state.outletPressureBar || state.pressureBar || 0, fluid);
        });
    }

    getTargetBackPressureBar(target, fluid = this.context.getComponentFluid(target)) {
        if (target instanceof TanqueLogico) {
            return target.getBackPressureAtInletBar(fluid, this.context.usarAlturaRelativa);
        }
        if (target instanceof DrenoLogico) return target.pressaoSaidaBar;
        return 0;
    }

    getLocalLossReynoldsCorrection(pipeHydraulics, fluid) {
        const reynolds = Number(pipeHydraulics?.reynolds);
        if (!Number.isFinite(reynolds) || reynolds <= 0) return 1;

        const viscosityRatio = Math.max(
            1,
            (Number(fluid?.viscosidadeDinamicaPaS) || DEFAULT_FLUID_VISCOSITY_PA_S) / DEFAULT_FLUID_VISCOSITY_PA_S
        );
        const viscosityWeight = clamp(1 + (Math.log10(viscosityRatio) * 0.18), 1, 1.4);
        const reynoldsPenalty = (120 / Math.sqrt(Math.max(reynolds, 1))) * viscosityWeight;

        return clamp(1 + reynoldsPenalty, 1, 4);
    }

    composeBranchLossCoefficients(conn, supply, baseTargetEntryLossCoeff, pipeHydraulics, fluid) {
        const localLossCorrection = this.getLocalLossReynoldsCorrection(pipeHydraulics, fluid);
        const upstreamLocalLossCoeff = (
            (supply.connectionBaseLossCoeff ?? 1)
            + conn.perdaLocalK
            + (supply.localLossCoeff || 0)
        ) * localLossCorrection;
        const effectiveTargetEntryLossCoeff = baseTargetEntryLossCoeff * localLossCorrection;
        const upstreamLossCoeff = upstreamLocalLossCoeff + pipeHydraulics.distributedLossCoeff;

        return {
            upstreamLossCoeff,
            targetEntryLossCoeff: effectiveTargetEntryLossCoeff,
            totalLossCoeff: upstreamLossCoeff + effectiveTargetEntryLossCoeff
        };
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
        return target instanceof ValvulaLogica || target instanceof BombaLogica || target instanceof TrocadorCalorLogico;
    }

    isPassThroughComponent(component) {
        return component instanceof ValvulaLogica || component instanceof BombaLogica || component instanceof TrocadorCalorLogico;
    }

    balancePassThroughMass() {
        const componentsFromDownstream = [...this.context.componentes].reverse();

        for (let iteration = 0; iteration < componentsFromDownstream.length; iteration += 1) {
            let adjusted = false;

            componentsFromDownstream.forEach((component) => {
                if (!this.isPassThroughComponent(component)) return;

                const inputConnections = this.context.getInputConnections(component);
                const outputConnections = this.context.getOutputConnections(component);
                const inputFlowLps = inputConnections.reduce((sum, conn) => sum + this.context.getConnectionState(conn).flowLps, 0);
                const outputFlowLps = outputConnections.reduce((sum, conn) => sum + this.context.getConnectionState(conn).flowLps, 0);
                const imbalanceLps = Math.max(0, inputFlowLps - outputFlowLps);

                if (imbalanceLps <= EPSILON_FLOW) return;

                const ratio = outputFlowLps > EPSILON_FLOW ? outputFlowLps / inputFlowLps : 0;
                inputConnections.forEach((conn) => this.scaleConnectionState(conn, ratio));
                adjusted = true;
            });

            if (!adjusted) break;
        }

        const residualImbalanceLps = componentsFromDownstream.reduce((maxImbalance, component) => {
            if (!this.isPassThroughComponent(component)) return maxImbalance;

            const inputFlowLps = this.context.getInputConnections(component)
                .reduce((sum, conn) => sum + this.context.getConnectionState(conn).flowLps, 0);
            const outputFlowLps = this.context.getOutputConnections(component)
                .reduce((sum, conn) => sum + this.context.getConnectionState(conn).flowLps, 0);

            return Math.max(maxImbalance, Math.max(0, inputFlowLps - outputFlowLps));
        }, 0);

        this.rebuildComponentHydraulicStateFromConnections();
        return residualImbalanceLps;
    }

    combineSerialFlowLimits(upstreamLimitLps, downstreamLimitLps) {
        if (upstreamLimitLps <= EPSILON_FLOW || downstreamLimitLps <= EPSILON_FLOW) return 0;

        const upstreamResistance = 1 / (upstreamLimitLps * upstreamLimitLps);
        const downstreamResistance = 1 / (downstreamLimitLps * downstreamLimitLps);
        return 1 / Math.sqrt(upstreamResistance + downstreamResistance);
    }

    hasPendingEmission(comp) {
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
        if (comp instanceof TrocadorCalorLogico) return comp.getFluxoPendenteLps() > EPSILON_FLOW;
        return false;
    }

    buildSupplyState(comp, dt, options = {}) {
        const { inletPressureBar = null, estimating = false, flowLimitLps = null, inletFluid = null } = options;
        const areaM2 = comp.getAreaConexaoM2();
        const limitedFlow = (flowLps) => {
            const numericLimit = Number(flowLimitLps);
            if (!estimating || !Number.isFinite(numericLimit)) return flowLps;
            return Math.min(flowLps, Math.max(0, numericLimit));
        };

        if (comp instanceof FonteLogica) {
            if (!estimating && comp.jaEmitiuIntrinseco()) return null;
            return {
                availableFlowLps: comp.vazaoMaxima,
                pressureBar: comp.pressaoFonteBar,
                hydraulicAreaM2: areaM2,
                connectionBaseLossCoeff: 1,
                localLossCoeff: DEFAULT_ENTRY_LOSS,
                fluid: comp.fluidoEntrada || this.context.fluidoOperante
            };
        }

        if (comp instanceof TanqueLogico) {
            if (!estimating && comp.jaEmitiuIntrinseco()) return null;
            const fluid = comp.getFluidoSaidaAtual?.(this.context.getComponentFluid(comp)) || this.context.getComponentFluid(comp);
            const availableFromInventory = dt > 0 ? comp.volumeAtual / dt : MAX_NETWORK_FLOW_LPS;
            const hydrostaticPressureBar = comp.getPressaoDisponivelSaidaBar(fluid, this.context.usarAlturaRelativa);
            const localLossCoeff = 1.0 / Math.max(0.15, comp.coeficienteSaida * comp.coeficienteSaida);
            return {
                availableFlowLps: availableFromInventory,
                pressureBar: hydrostaticPressureBar,
                hydraulicAreaM2: areaM2,
                connectionBaseLossCoeff: 1,
                localLossCoeff,
                fluid
            };
        }

        if (comp instanceof BombaLogica) {
            const drive = comp.getDriveAtual();
            if (drive <= 0) return null;

            const qMax = comp.vazaoNominal * drive;
            const qRemaining = Math.max(0, qMax - comp.estadoHidraulico.saidaVazaoLps);
            const incomingFlow = estimating ? limitedFlow(qRemaining) : comp.getFluxoPendenteLps();
            if (incomingFlow <= EPSILON_FLOW || qRemaining <= EPSILON_FLOW) return null;

            const inletPressure = inletPressureBar ?? comp.getPressaoEntradaBar();
            const fluid = inletFluid || comp.getFluidoEntradaMisturado?.(this.context.getComponentFluid(comp)) || this.context.getComponentFluid(comp);
            const referenceFlow = clamp(
                Math.max(comp.estadoHidraulico.saidaVazaoLps, incomingFlow),
                0,
                qMax
            );
            const curveFrac = qMax > EPSILON_FLOW ? 1 - Math.pow(referenceFlow / qMax, 2) : 0;
            const efficiency = comp.getEficienciaInstantanea(referenceFlow);
            const suctionFlowReference = clamp(
                Math.max(referenceFlow, estimating ? comp.estadoHidraulico.entradaVazaoLps : incomingFlow),
                0,
                qMax
            );
            const suctionVelocityMps = areaM2 > 0 ? lpsToM3s(suctionFlowReference) / areaM2 : 0;
            const suctionVelocityHeadM = (suctionVelocityMps * suctionVelocityMps) / (2 * GRAVITY);
            const absSuctionBar = fluid.pressaoAtmosfericaBar + inletPressure;
            const npshAvailableM = Math.max(
                0,
                (((absSuctionBar - fluid.pressaoVaporBar) * BAR_TO_PA) / (fluid.densidade * GRAVITY))
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
                connectionBaseLossCoeff: 0,
                localLossCoeff: 1.0 / Math.max(0.18, efficiency),
                boostBar,
                cavitationFactor,
                fluid
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
                connectionBaseLossCoeff: 0,
                localLossCoeff: parametros.localLossCoeff,
                characteristicFactor: parametros.characteristicFactor,
                effectiveCv: parametros.effectiveCv,
                fluid: inletFluid || comp.getFluidoEntradaMisturado?.(this.context.getComponentFluid(comp)) || this.context.getComponentFluid(comp)
            };
        }

        if (comp instanceof TrocadorCalorLogico) {
            const parametros = comp.getParametrosHidraulicos();
            const availableFlow = estimating ? MAX_NETWORK_FLOW_LPS : comp.getFluxoPendenteLps();
            if (availableFlow <= EPSILON_FLOW) return null;

            const fluidInlet = inletFluid || comp.getFluidoEntradaMisturado?.(this.context.fluidoOperante) || this.context.fluidoOperante;
            const outletFluid = comp.getFluidoSaidaPara(fluidInlet, availableFlow);

            return {
                availableFlowLps: availableFlow,
                pressureBar: inletPressureBar ?? comp.getPressaoEntradaBar(),
                hydraulicAreaM2: Math.min(areaM2, parametros.hydraulicAreaM2),
                connectionBaseLossCoeff: 0,
                localLossCoeff: parametros.localLossCoeff,
                fluid: outletFluid
            };
        }

        return null;
    }

    estimateComponentPotential(comp, inletPressureBar, dt, visited = new Set(), flowLimitLps = null, inletFluid = null) {
        if (!comp || visited.has(comp.id)) return 0;

        if (comp instanceof DrenoLogico) return MAX_NETWORK_FLOW_LPS;

        if (comp instanceof TanqueLogico) {
            const inflowAccepted = comp.estadoHidraulico.entradaVazaoLps * dt;
            const freeVolume = Math.max(0, comp.capacidadeMaxima - comp.volumeAtual - inflowAccepted);
            return dt > 0 ? freeVolume / dt : MAX_NETWORK_FLOW_LPS;
        }

        const outputs = this.context.getOutputConnections(comp);
        if (outputs.length === 0) return 0;

        const supply = this.buildSupplyState(comp, dt, {
            inletPressureBar,
            estimating: true,
            flowLimitLps,
            inletFluid
        });
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

        const target = this.context.getComponentById(conn.targetId);
        const geometry = this.context.getConnectionGeometry(conn);
        const branchAreaM2 = Math.min(
            conn.areaM2,
            supply.hydraulicAreaM2 || conn.areaM2,
            this.getTargetEntranceArea(target)
        );
        const baseTargetEntryLossCoeff = this.getTargetEntryLossCoeff(target);
        const fluid = supply.fluid || this.context.getComponentFluid(comp);
        const backPressureBar = this.getTargetBackPressureBar(target, this.context.getComponentFluid(target));
        const staticHeadBar = pressureFromHeadBar(geometry.headGainM, fluid.densidade);
        const targetIsActivePump = target instanceof BombaLogica && target.getDriveAtual() > EPSILON_FLOW;
        const availableDeltaPBar = Math.max(0, supply.pressureBar + staticHeadBar - backPressureBar);

        if (!target || (!targetIsActivePump && availableDeltaPBar <= EPSILON_FLOW)) {
            return {
                capacityLps: 0,
                areaM2: branchAreaM2,
                backPressureBar,
                upstreamLossCoeff: 0,
                baseTargetEntryLossCoeff,
                targetEntryLossCoeff: baseTargetEntryLossCoeff,
                totalLossCoeff: 0,
                inletPressureBar: 0,
                outletPressureBar: 0,
                pipeHydraulics: this.context.getPipeHydraulics(conn, geometry, branchAreaM2, 0, fluid),
                geometry
            };
        }

        const density = fluid.densidade;
        const baseLossCoeff = (supply.connectionBaseLossCoeff ?? 1) + conn.perdaLocalK + (supply.localLossCoeff || 0) + baseTargetEntryLossCoeff + DEFAULT_PIPE_FRICTION * (geometry.lengthM / Math.max(conn.diameterM, 0.001));
        let capacityLps = targetIsActivePump
            ? Math.min(supply.availableFlowLps, target.vazaoNominal * target.getDriveAtual())
            : Math.min(supply.availableFlowLps, flowFromBernoulli(availableDeltaPBar, branchAreaM2, density, baseLossCoeff));
        let pipeHydraulics = this.context.getPipeHydraulics(conn, geometry, branchAreaM2, capacityLps, fluid);
        let lossCoefficients = this.composeBranchLossCoefficients(conn, supply, baseTargetEntryLossCoeff, pipeHydraulics, fluid);
        let upstreamLossCoeff = lossCoefficients.upstreamLossCoeff;
        let targetEntryLossCoeff = lossCoefficients.targetEntryLossCoeff;
        let totalLossCoeff = lossCoefficients.totalLossCoeff;

        for (let i = 0; i < 4; i += 1) {
            if (!targetIsActivePump) {
                capacityLps = Math.min(supply.availableFlowLps, flowFromBernoulli(availableDeltaPBar, branchAreaM2, density, totalLossCoeff));
            }
            pipeHydraulics = this.context.getPipeHydraulics(conn, geometry, branchAreaM2, capacityLps, fluid);
            lossCoefficients = this.composeBranchLossCoefficients(conn, supply, baseTargetEntryLossCoeff, pipeHydraulics, fluid);
            upstreamLossCoeff = lossCoefficients.upstreamLossCoeff;
            targetEntryLossCoeff = lossCoefficients.targetEntryLossCoeff;
            totalLossCoeff = lossCoefficients.totalLossCoeff;
        }

        let provisionalUpstreamLossBar = 0;
        let inletPressureBar = backPressureBar;
        let targetEntryLossBar = 0;
        let outletPressureBar = backPressureBar;

        const recalculateBranchPressures = () => {
            pipeHydraulics = this.context.getPipeHydraulics(conn, geometry, branchAreaM2, capacityLps, fluid);
            lossCoefficients = this.composeBranchLossCoefficients(conn, supply, baseTargetEntryLossCoeff, pipeHydraulics, fluid);
            upstreamLossCoeff = lossCoefficients.upstreamLossCoeff;
            targetEntryLossCoeff = lossCoefficients.targetEntryLossCoeff;
            totalLossCoeff = lossCoefficients.totalLossCoeff;
            provisionalUpstreamLossBar = pressureLossFromFlow(capacityLps, branchAreaM2, density, upstreamLossCoeff);
            const rawInletPressureBar = supply.pressureBar + staticHeadBar - provisionalUpstreamLossBar;
            inletPressureBar = targetIsActivePump
                ? rawInletPressureBar
                : Math.max(backPressureBar, rawInletPressureBar);
            targetEntryLossBar = pressureLossFromFlow(capacityLps, branchAreaM2, density, targetEntryLossCoeff);
            outletPressureBar = targetIsActivePump
                ? inletPressureBar - targetEntryLossBar
                : Math.max(backPressureBar, inletPressureBar - targetEntryLossBar);
        };

        recalculateBranchPressures();

        const targetForwardsPressure = this.isPressureForwardingTarget(target);

        if (targetIsActivePump) {
            const highLimitLps = Math.min(supply.availableFlowLps, target.vazaoNominal * target.getDriveAtual());
            let lowLps = 0;
            let highLps = Math.max(0, highLimitLps);
            let bestLps = 0;

            for (let i = 0; i < 12; i += 1) {
                capacityLps = (lowLps + highLps) / 2;
                recalculateBranchPressures();

                const downstreamLimit = this.estimateComponentPotential(
                    target,
                    inletPressureBar,
                    dt,
                    new Set(visited),
                    capacityLps,
                    fluid
                );

                if (Number.isFinite(downstreamLimit) && downstreamLimit + EPSILON_FLOW >= capacityLps) {
                    bestLps = capacityLps;
                    lowLps = capacityLps;
                } else {
                    highLps = capacityLps;
                }
            }

            capacityLps = bestLps;
            recalculateBranchPressures();
        } else {
            const downstreamInletPressureBar = targetForwardsPressure
                ? Math.max(backPressureBar, supply.pressureBar + staticHeadBar)
                : inletPressureBar;
            const downstreamLimit = this.estimateComponentPotential(
                target,
                downstreamInletPressureBar,
                dt,
                new Set(visited),
                capacityLps,
                fluid
            );

            if (Number.isFinite(downstreamLimit)) {
                capacityLps = targetForwardsPressure
                    ? this.combineSerialFlowLimits(capacityLps, downstreamLimit)
                    : Math.min(capacityLps, downstreamLimit);
                recalculateBranchPressures();
            }
        }

        return {
            capacityLps,
            areaM2: branchAreaM2,
            backPressureBar,
            upstreamLossCoeff,
            baseTargetEntryLossCoeff,
            targetEntryLossCoeff,
            totalLossCoeff,
            inletPressureBar,
            outletPressureBar,
            pipeHydraulics,
            geometry,
            fluid
        };
    }

    applyBranchFlow(comp, conn, supply, estimate, flowLps, dt) {
        if (flowLps <= EPSILON_FLOW) return 0;

        const target = this.context.getComponentById(conn.targetId);
        if (!target) return 0;

        const isPassThrough = !(comp instanceof FonteLogica || comp instanceof TanqueLogico);
        const fluid = estimate.fluid || supply.fluid || this.context.getConnectionFluid(conn);
        const dynamics = this.applyConnectionDynamics(conn, flowLps, dt, estimate.geometry, isPassThrough, fluid);
        const actualFlowLps = dynamics.flowLps;
        const state = this.context.getConnectionState(conn);
        state.targetFlowLps = flowLps;
        state.fluid = fluid;
        state.fluidName = fluid?.nome || '';
        state.responseTimeS = dynamics.responseTimeS;
        state.lengthM = estimate.geometry.lengthM;
        state.straightLengthM = estimate.geometry.straightLengthM;
        state.headGainM = estimate.geometry.headGainM;

        if (actualFlowLps <= EPSILON_FLOW) return 0;

        const density = fluid.densidade;
        const pipeHydraulics = this.context.getPipeHydraulics(conn, estimate.geometry, estimate.areaM2, actualFlowLps, fluid);
        const lossCoefficients = this.composeBranchLossCoefficients(
            conn,
            supply,
            estimate.baseTargetEntryLossCoeff ?? estimate.targetEntryLossCoeff,
            pipeHydraulics,
            fluid
        );
        const upstreamLossCoeff = lossCoefficients.upstreamLossCoeff;
        const upstreamLossBar = pressureLossFromFlow(actualFlowLps, estimate.areaM2, density, upstreamLossCoeff);
        const targetIsActivePump = target instanceof BombaLogica && target.getDriveAtual() > EPSILON_FLOW;
        const rawInletPressureBar = supply.pressureBar + pressureFromHeadBar(estimate.geometry.headGainM, density) - upstreamLossBar;
        const inletPressureBar = targetIsActivePump
            ? rawInletPressureBar
            : Math.max(estimate.backPressureBar, rawInletPressureBar);
        const targetEntryLossBar = pressureLossFromFlow(
            actualFlowLps,
            estimate.areaM2,
            density,
            lossCoefficients.targetEntryLossCoeff
        );
        const arrivalPressureBar = targetIsActivePump
            ? inletPressureBar - targetEntryLossBar
            : Math.max(estimate.backPressureBar, inletPressureBar - targetEntryLossBar);
        const totalLossBar = upstreamLossBar + targetEntryLossBar;

        comp.registrarSaida(actualFlowLps, supply.pressureBar, fluid);
        target.registrarEntrada(actualFlowLps, arrivalPressureBar, fluid);

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
}
