import { BombaLogica } from '../components/BombaLogica.js';
import { DrenoLogico } from '../components/DrenoLogico.js';
import { FonteLogica } from '../components/FonteLogica.js';
import { TanqueLogico } from '../components/TanqueLogico.js';
import { TrocadorCalorLogico } from '../components/TrocadorCalorLogico.js';
import { ValvulaLogica } from '../components/ValvulaLogica.js';
import { clamp, pressureLossFromFlow, smoothFirstOrder } from '../components/BaseComponente.js';
import {
    BAR_TO_PA,
    DEFAULT_ENTRY_LOSS,
    DEFAULT_FLUID_VISCOSITY_PA_S,
    DEFAULT_PIPE_DIAMETER_M,
    EPSILON_FLOW,
    GRAVITY,
    MAX_NETWORK_FLOW_LPS,
    areaFromDiameter,
    lpsToM3s,
    pressureFromHeadBar
} from '../units/HydraulicUnits.js';
import {
    getConnectionResponseTimeS as calculateConnectionResponseTimeS
} from './PipeHydraulics.js';

function applyConnectionStartupRamp(conn, targetFlowLps, dt) {
    const rampDurationS = Number(conn?.startupRampDurationS) || 0;
    const safeTargetFlowLps = Math.max(0, targetFlowLps);

    if (rampDurationS <= 0 || safeTargetFlowLps <= EPSILON_FLOW) return safeTargetFlowLps;
    if (dt <= 0) return 0;

    const nextElapsedS = Math.min(
        rampDurationS,
        Math.max(0, Number(conn.startupRampElapsedS) || 0) + dt
    );
    const rampScale = clamp(nextElapsedS / rampDurationS, 0, 1);
    conn.startupRampElapsedS = nextElapsedS;

    if (nextElapsedS >= rampDurationS) {
        conn.startupRampDurationS = 0;
        conn.startupRampElapsedS = 0;
        return safeTargetFlowLps;
    }

    return safeTargetFlowLps * rampScale;
}

function finiteNumber(value, fallback = 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

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
        const dynamicTargetFlowLps = applyConnectionStartupRamp(conn, targetFlowLps, dt);
        const actualFlowLps = isPassThrough ? dynamicTargetFlowLps : smoothFirstOrder(
            Math.max(0, conn.transientFlowLps || 0),
            dynamicTargetFlowLps,
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

    isClosedValve(component) {
        return component instanceof ValvulaLogica && component.getAberturaNormalizadaAtual() <= 0;
    }

    isInactivePump(component) {
        return component instanceof BombaLogica && component.getDriveAtual() <= EPSILON_FLOW;
    }

    isShutoffComponent(component) {
        return this.isClosedValve(component) || this.isInactivePump(component);
    }

    isConnectionBlockedByShutoff(conn) {
        const source = this.context.getComponentById(conn.sourceId);
        const target = this.context.getComponentById(conn.targetId);
        return this.isShutoffComponent(source) || this.isShutoffComponent(target);
    }

    clearConnectionFlow(conn, state = this.context.getConnectionState(conn)) {
        conn.transientFlowLps = 0;
        conn.lastResolvedFlowLps = 0;
        state.flowLps = 0;
        state.pressureBar = 0;
        state.outletPressureBar = 0;
        state.sourcePressureBar = 0;
        state.backPressureBar = 0;
        state.velocityMps = 0;
        state.deltaPBar = 0;
        state.pipePressureDropBar = 0;
        state.pipeInletPressureBar = 0;
        state.pipeOutletPressureBar = 0;
        state.pipeDistributedLossBar = 0;
        state.pipeLocalLossBar = 0;
        state.totalLossBar = 0;
        state.targetLossBar = 0;
        state.targetFlowLps = 0;
        state.reynolds = 0;
        state.regime = 'sem fluxo';
    }

    relaxIdleConnections(dt) {
        this.context.conexoes.forEach(conn => {
            if (conn._activeTick) return;

            this.ensureConnectionProperties(conn);
            const geometry = this.context.getConnectionGeometry(conn);
            const state = this.context.getConnectionState(conn);

            state.lengthM = geometry.lengthM;
            state.straightLengthM = geometry.straightLengthM;
            state.headGainM = geometry.headGainM;
            state.targetFlowLps = 0;

            if (this.isConnectionBlockedByShutoff(conn)) {
                this.clearConnectionFlow(conn, state);
                state.responseTimeS = this.getConnectionResponseTimeS(conn, geometry);
                return;
            }

            const { flowLps, responseTimeS } = this.applyConnectionDynamics(conn, 0, dt, geometry);
            state.responseTimeS = responseTimeS;

            if (flowLps <= EPSILON_FLOW) {
                this.clearConnectionFlow(conn, state);
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
            state.pipeInletPressureBar = state.sourcePressureBar;
            state.pipePressureDropBar = pressureLossFromFlow(
                flowLps,
                conn.areaM2,
                fluid.densidade,
                conn.perdaLocalK + pipeHydraulics.distributedLossCoeff
            );
            state.pipeOutletPressureBar = Math.max(0, state.pipeInletPressureBar - state.pipePressureDropBar);
            state.pipeDistributedLossBar = pressureLossFromFlow(
                flowLps,
                conn.areaM2,
                fluid.densidade,
                pipeHydraulics.distributedLossCoeff
            );
            state.pipeLocalLossBar = pressureLossFromFlow(
                flowLps,
                conn.areaM2,
                fluid.densidade,
                conn.perdaLocalK
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
        state.pipePressureDropBar *= pressureRatio;
        state.pipeDistributedLossBar *= pressureRatio;
        state.pipeLocalLossBar *= pressureRatio;
        state.pipeOutletPressureBar = Math.max(0, state.pipeInletPressureBar - state.pipePressureDropBar);
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
            state.pipePressureDropBar = 0;
            state.pipeInletPressureBar = 0;
            state.pipeOutletPressureBar = 0;
            state.pipeDistributedLossBar = 0;
            state.pipeLocalLossBar = 0;
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
            source.registrarSaida(state.flowLps, finiteNumber(state.sourcePressureBar, finiteNumber(state.pressureBar, 0)), fluid);
            target.registrarEntrada(state.flowLps, finiteNumber(state.outletPressureBar, finiteNumber(state.pressureBar, 0)), fluid);
        });

        this.context.componentes.forEach((component) => {
            if (!(component instanceof BombaLogica)) return;
            if (component.getDriveAtual() <= 0.01) {
                component.limparSucaoSemLiquido?.();
                return;
            }
            if (component.estadoHidraulico.entradaVazaoLps > EPSILON_FLOW) {
                component.limparSucaoSemLiquido?.();
                return;
            }
            const hasLiquidSupply = component.inputs.some((input) => this.componentCanSupplyLiquidToPump(input));
            if (!hasLiquidSupply) component.marcarSucaoSemLiquido?.();
        });
    }

    componentCanSupplyLiquidToPump(component) {
        if (!component) return false;
        if (component instanceof FonteLogica) return component.vazaoMaxima > EPSILON_FLOW;
        if (component instanceof TanqueLogico) {
            return component.temLiquidoDisponivelSaida?.(this.context.usarAlturaRelativa) ?? component.volumeAtual > EPSILON_FLOW;
        }
        return (component.estadoHidraulico?.saidaVazaoLps || 0) > EPSILON_FLOW
            || (component.getFluxoPendenteLps?.() || 0) > EPSILON_FLOW;
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

    calculateBranchLossBreakdown(conn, supply, target, baseTargetEntryLossCoeff, geometry, flowLps, fluid) {
        const pipeAreaM2 = conn.areaM2;
        const sourceAreaM2 = Math.max(1e-9, supply.hydraulicAreaM2 || pipeAreaM2);
        const targetAreaM2 = Math.max(1e-9, this.getTargetEntranceArea(target) || pipeAreaM2);
        const density = fluid.densidade;
        const pipeHydraulics = this.context.getPipeHydraulics(conn, geometry, pipeAreaM2, flowLps, fluid);
        const localLossCorrection = this.getLocalLossReynoldsCorrection(pipeHydraulics, fluid);
        const sourceLossCoeff = Math.max(0, (
            (supply.connectionBaseLossCoeff ?? 1)
            + (supply.localLossCoeff || 0)
        ) * localLossCorrection);
        const pipeLocalLossCoeff = Math.max(0, (conn.perdaLocalK || 0) * localLossCorrection);
        const pipeDistributedLossCoeff = Math.max(0, pipeHydraulics.distributedLossCoeff);
        const pipeLossCoeff = pipeLocalLossCoeff + pipeDistributedLossCoeff;
        const targetEntryLossCoeff = Math.max(0, baseTargetEntryLossCoeff * localLossCorrection);
        const sourceLossBar = pressureLossFromFlow(flowLps, sourceAreaM2, density, sourceLossCoeff);
        const pipeLocalLossBar = pressureLossFromFlow(flowLps, pipeAreaM2, density, pipeLocalLossCoeff);
        const pipeDistributedLossBar = pressureLossFromFlow(flowLps, pipeAreaM2, density, pipeDistributedLossCoeff);
        const pipeLossBar = pipeLocalLossBar + pipeDistributedLossBar;
        const targetEntryLossBar = pressureLossFromFlow(flowLps, targetAreaM2, density, targetEntryLossCoeff);

        return {
            sourceAreaM2,
            pipeAreaM2,
            targetAreaM2,
            sourceLossCoeff,
            pipeLocalLossCoeff,
            pipeDistributedLossCoeff,
            pipeLossCoeff,
            targetEntryLossCoeff,
            sourceLossBar,
            pipeLocalLossBar,
            pipeDistributedLossBar,
            pipeLossBar,
            targetEntryLossBar,
            upstreamLossBar: sourceLossBar + pipeLossBar,
            totalLossBar: sourceLossBar + pipeLossBar + targetEntryLossBar,
            pipeHydraulics
        };
    }

    solveBranchFlowForPressure(conn, supply, target, baseTargetEntryLossCoeff, geometry, fluid, pressureBar, maxFlowLps) {
        const maxFlow = Math.max(0, Math.min(MAX_NETWORK_FLOW_LPS, Number(maxFlowLps) || MAX_NETWORK_FLOW_LPS));
        if (pressureBar <= EPSILON_FLOW || maxFlow <= EPSILON_FLOW) return 0;

        const lossAt = (flowLps) => this.calculateBranchLossBreakdown(
            conn,
            supply,
            target,
            baseTargetEntryLossCoeff,
            geometry,
            flowLps,
            fluid
        ).totalLossBar;

        let high = Math.min(maxFlow, Math.max(1, conn.lastResolvedFlowLps || 1));
        while (high < maxFlow && lossAt(high) < pressureBar) {
            high = Math.min(maxFlow, high * 2);
        }

        if (lossAt(high) <= pressureBar) return high;

        let low = 0;
        for (let step = 0; step < 28; step += 1) {
            const mid = (low + high) / 2;
            if (lossAt(mid) <= pressureBar) low = mid;
            else high = mid;
        }

        return low;
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

                if (imbalanceLps > EPSILON_FLOW) {
                    const ratio = outputFlowLps > EPSILON_FLOW ? outputFlowLps / inputFlowLps : 0;
                    inputConnections.forEach((conn) => this.scaleConnectionState(conn, ratio));
                    adjusted = true;
                    return;
                }

                const generatedFlowLps = Math.max(0, outputFlowLps - inputFlowLps);
                if (generatedFlowLps <= EPSILON_FLOW) return;

                const ratio = inputFlowLps > EPSILON_FLOW ? inputFlowLps / outputFlowLps : 0;
                outputConnections.forEach((conn) => this.scaleConnectionState(conn, ratio));
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

            return Math.max(maxImbalance, Math.abs(inputFlowLps - outputFlowLps));
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
                connectionBaseLossCoeff: 0,
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
            comp.limparSucaoSemLiquido?.();

            const inletPressure = inletPressureBar ?? comp.getPressaoEntradaBar();
            const fluid = inletFluid || comp.getFluidoEntradaMisturado?.(this.context.getComponentFluid(comp)) || this.context.getComponentFluid(comp);
            const referenceFlow = clamp(
                Math.max(comp.estadoHidraulico.saidaVazaoLps, incomingFlow),
                0,
                qMax
            );
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
            const boostBar = comp.getCurvaPressaoBar(referenceFlow, drive) * cavitationFactor;
            const effectiveQRemaining = qRemaining * cavitationFactor;

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
        const branchAreaM2 = conn.areaM2;
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
                pipeHydraulics: this.context.getPipeHydraulics(conn, geometry, conn.areaM2, 0, fluid),
                lossBreakdown: this.calculateBranchLossBreakdown(conn, supply, target, baseTargetEntryLossCoeff, geometry, 0, fluid),
                geometry
            };
        }

        const density = fluid.densidade;
        let pressureCapacityLps = targetIsActivePump
            ? target.vazaoNominal * target.getDriveAtual()
            : this.solveBranchFlowForPressure(
                conn,
                supply,
                target,
                baseTargetEntryLossCoeff,
                geometry,
                fluid,
                availableDeltaPBar,
                MAX_NETWORK_FLOW_LPS
            );
        let capacityLps = targetIsActivePump
            ? Math.min(supply.availableFlowLps, target.vazaoNominal * target.getDriveAtual())
            : Math.min(supply.availableFlowLps, pressureCapacityLps);
        let lossBreakdown = this.calculateBranchLossBreakdown(
            conn,
            supply,
            target,
            baseTargetEntryLossCoeff,
            geometry,
            capacityLps,
            fluid
        );
        let pipeHydraulics = lossBreakdown.pipeHydraulics;
        let upstreamLossCoeff = lossBreakdown.sourceLossCoeff + lossBreakdown.pipeLossCoeff;
        let targetEntryLossCoeff = lossBreakdown.targetEntryLossCoeff;
        let totalLossCoeff = upstreamLossCoeff + targetEntryLossCoeff;

        for (let i = 0; i < 4; i += 1) {
            if (!targetIsActivePump) {
                pressureCapacityLps = this.solveBranchFlowForPressure(
                    conn,
                    supply,
                    target,
                    baseTargetEntryLossCoeff,
                    geometry,
                    fluid,
                    availableDeltaPBar,
                    MAX_NETWORK_FLOW_LPS
                );
                capacityLps = Math.min(supply.availableFlowLps, pressureCapacityLps);
            }
            lossBreakdown = this.calculateBranchLossBreakdown(
                conn,
                supply,
                target,
                baseTargetEntryLossCoeff,
                geometry,
                capacityLps,
                fluid
            );
            pipeHydraulics = lossBreakdown.pipeHydraulics;
            upstreamLossCoeff = lossBreakdown.sourceLossCoeff + lossBreakdown.pipeLossCoeff;
            targetEntryLossCoeff = lossBreakdown.targetEntryLossCoeff;
            totalLossCoeff = upstreamLossCoeff + targetEntryLossCoeff;
        }

        let provisionalUpstreamLossBar = 0;
        let inletPressureBar = backPressureBar;
        let targetEntryLossBar = 0;
        let outletPressureBar = backPressureBar;

        const recalculateBranchPressures = () => {
            lossBreakdown = this.calculateBranchLossBreakdown(
                conn,
                supply,
                target,
                baseTargetEntryLossCoeff,
                geometry,
                capacityLps,
                fluid
            );
            pipeHydraulics = lossBreakdown.pipeHydraulics;
            upstreamLossCoeff = lossBreakdown.sourceLossCoeff + lossBreakdown.pipeLossCoeff;
            targetEntryLossCoeff = lossBreakdown.targetEntryLossCoeff;
            totalLossCoeff = upstreamLossCoeff + targetEntryLossCoeff;
            provisionalUpstreamLossBar = lossBreakdown.upstreamLossBar;
            const rawInletPressureBar = supply.pressureBar + staticHeadBar - provisionalUpstreamLossBar;
            inletPressureBar = targetIsActivePump
                ? rawInletPressureBar
                : Math.max(backPressureBar, rawInletPressureBar);
            targetEntryLossBar = lossBreakdown.targetEntryLossBar;
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
            pressureCapacityLps,
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
        const baseTargetEntryLossCoeff = estimate.baseTargetEntryLossCoeff ?? estimate.targetEntryLossCoeff;
        const lossBreakdown = this.calculateBranchLossBreakdown(
            conn,
            supply,
            target,
            baseTargetEntryLossCoeff,
            estimate.geometry,
            actualFlowLps,
            fluid
        );
        const pipeHydraulics = lossBreakdown.pipeHydraulics;
        const upstreamLossBar = lossBreakdown.upstreamLossBar;
        const staticHeadBar = pressureFromHeadBar(estimate.geometry.headGainM, density);
        const targetIsActivePump = target instanceof BombaLogica && target.getDriveAtual() > EPSILON_FLOW;
        const targetEntryLossBar = lossBreakdown.targetEntryLossBar;
        const targetIsPressureBoundary = target instanceof TanqueLogico || target instanceof DrenoLogico;
        const sourceCanBackCalculateBoundaryPressure = !this.isPassThroughComponent(comp);
        const hydraulicCapacityLps = estimate.pressureCapacityLps ?? estimate.capacityLps ?? 0;
        const branchWasFlowLimited = flowLps + EPSILON_FLOW < hydraulicCapacityLps;
        let effectiveSupplyPressureBar = supply.pressureBar;
        let inletPressureBar;
        let arrivalPressureBar;
        let pipeInletPressureBar;

        if (sourceCanBackCalculateBoundaryPressure && branchWasFlowLimited && targetIsPressureBoundary && !targetIsActivePump) {
            arrivalPressureBar = estimate.backPressureBar;
            inletPressureBar = arrivalPressureBar + targetEntryLossBar;
            pipeInletPressureBar = Math.max(0, inletPressureBar + lossBreakdown.pipeLossBar - staticHeadBar);
            effectiveSupplyPressureBar = Math.max(0, pipeInletPressureBar + lossBreakdown.sourceLossBar);
        } else {
            pipeInletPressureBar = Math.max(0, effectiveSupplyPressureBar - lossBreakdown.sourceLossBar);
            const rawInletPressureBar = pipeInletPressureBar + staticHeadBar - lossBreakdown.pipeLossBar;
            inletPressureBar = targetIsActivePump
                ? rawInletPressureBar
                : Math.max(estimate.backPressureBar, rawInletPressureBar);
            arrivalPressureBar = targetIsActivePump
                ? inletPressureBar - targetEntryLossBar
                : Math.max(estimate.backPressureBar, inletPressureBar - targetEntryLossBar);
        }
        const pipeOutletPressureBar = inletPressureBar;
        const totalLossBar = lossBreakdown.totalLossBar;

        comp.registrarSaida(actualFlowLps, pipeInletPressureBar, fluid);
        target.registrarEntrada(actualFlowLps, arrivalPressureBar, fluid);

        const flowBefore = state.flowLps;
        state.flowLps += actualFlowLps;
        state.pressureBar = state.flowLps > EPSILON_FLOW
            ? ((state.pressureBar * flowBefore) + (inletPressureBar * actualFlowLps)) / state.flowLps
            : inletPressureBar;
        state.outletPressureBar = arrivalPressureBar;
        state.sourcePressureBar = Math.max(state.sourcePressureBar, pipeInletPressureBar);
        state.backPressureBar = Math.max(state.backPressureBar, estimate.backPressureBar);
        state.velocityMps = Math.max(state.velocityMps, pipeHydraulics.velocityMps);
        state.deltaPBar = Math.max(state.deltaPBar, Math.max(0, effectiveSupplyPressureBar + staticHeadBar - inletPressureBar));
        state.pipeInletPressureBar = Math.max(state.pipeInletPressureBar, pipeInletPressureBar);
        state.pipeOutletPressureBar = state.flowLps > EPSILON_FLOW
            ? ((state.pipeOutletPressureBar * flowBefore) + (pipeOutletPressureBar * actualFlowLps)) / state.flowLps
            : pipeOutletPressureBar;
        state.pipePressureDropBar = Math.max(state.pipePressureDropBar, lossBreakdown.pipeLossBar);
        state.pipeDistributedLossBar = Math.max(state.pipeDistributedLossBar, lossBreakdown.pipeDistributedLossBar);
        state.pipeLocalLossBar = Math.max(state.pipeLocalLossBar, lossBreakdown.pipeLocalLossBar);
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
