import { BombaLogica } from '../components/BombaLogica.js';
import { DrenoLogico } from '../components/DrenoLogico.js';
import { FonteLogica } from '../components/FonteLogica.js';
import { TanqueLogico } from '../components/TanqueLogico.js';
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
    constructor(engine) {
        this.engine = engine;
    }

    ensureConnectionProperties(conn) {
        return this.engine.ensureConnectionProperties(conn);
    }

    getConnectionResponseTimeS(conn, geometry) {
        return calculateConnectionResponseTimeS(conn, geometry, this.engine.fluidoOperante);
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
        this.engine.conexoes.forEach(conn => {
            if (conn._activeTick) return;

            this.ensureConnectionProperties(conn);
            const geometry = this.engine.getConnectionGeometry(conn);
            const { flowLps, responseTimeS } = this.applyConnectionDynamics(conn, 0, dt, geometry);
            const state = this.engine.getConnectionState(conn);

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

            const pipeHydraulics = this.engine.getPipeHydraulics(conn, geometry, conn.areaM2, flowLps);
            state.flowLps = flowLps;
            state.velocityMps = pipeHydraulics.velocityMps;
            state.reynolds = pipeHydraulics.reynolds;
            state.frictionFactor = pipeHydraulics.frictionFactor;
            state.relativeRoughness = pipeHydraulics.relativeRoughness;
            state.regime = pipeHydraulics.regime;
            state.deltaPBar = pressureLossFromFlow(
                flowLps,
                conn.areaM2,
                this.engine.fluidoOperante.densidade,
                1 + conn.perdaLocalK + pipeHydraulics.distributedLossCoeff
            );
            state.totalLossBar = state.deltaPBar;
        });
    }

    getTargetBackPressureBar(target) {
        if (target instanceof TanqueLogico) {
            return target.getBackPressureAtInletBar(this.engine.fluidoOperante, this.engine.usarAlturaRelativa);
        }
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
            const hydrostaticPressureBar = comp.getPressaoDisponivelSaidaBar(this.engine.fluidoOperante, this.engine.usarAlturaRelativa);
            const localLossCoeff = 1.0 / Math.max(0.15, comp.coeficienteSaida * comp.coeficienteSaida);
            const hydraulicCapacity = flowFromBernoulli(
                hydrostaticPressureBar,
                areaM2,
                this.engine.fluidoOperante.densidade,
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
            const absSuctionBar = this.engine.fluidoOperante.pressaoAtmosfericaBar + inletPressure;
            const npshAvailableM = Math.max(
                0,
                (((absSuctionBar - this.engine.fluidoOperante.pressaoVaporBar) * BAR_TO_PA) / (this.engine.fluidoOperante.densidade * GRAVITY))
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

        const outputs = this.engine.getOutputConnections(comp);
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

        const target = this.engine.getComponentById(conn.targetId);
        const geometry = this.engine.getConnectionGeometry(conn);
        const branchAreaM2 = Math.min(
            conn.areaM2,
            supply.hydraulicAreaM2 || conn.areaM2,
            this.getTargetEntranceArea(target)
        );
        const targetEntryLossCoeff = this.getTargetEntryLossCoeff(target);
        const backPressureBar = this.getTargetBackPressureBar(target);
        const staticHeadBar = pressureFromHeadBar(geometry.headGainM, this.engine.fluidoOperante.densidade);
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
                pipeHydraulics: this.engine.getPipeHydraulics(conn, geometry, branchAreaM2, 0),
                geometry
            };
        }

        const density = this.engine.fluidoOperante.densidade;
        const baseLossCoeff = 1 + conn.perdaLocalK + (supply.localLossCoeff || 0) + targetEntryLossCoeff + DEFAULT_PIPE_FRICTION * (geometry.lengthM / Math.max(conn.diameterM, 0.001));
        let capacityLps = Math.min(supply.availableFlowLps, flowFromBernoulli(availableDeltaPBar, branchAreaM2, density, baseLossCoeff));
        let pipeHydraulics = this.engine.getPipeHydraulics(conn, geometry, branchAreaM2, capacityLps);
        let upstreamLossCoeff = 1 + conn.perdaLocalK + pipeHydraulics.distributedLossCoeff + (supply.localLossCoeff || 0);
        let totalLossCoeff = upstreamLossCoeff + targetEntryLossCoeff;

        for (let i = 0; i < 4; i += 1) {
            capacityLps = Math.min(supply.availableFlowLps, flowFromBernoulli(availableDeltaPBar, branchAreaM2, density, totalLossCoeff));
            pipeHydraulics = this.engine.getPipeHydraulics(conn, geometry, branchAreaM2, capacityLps);
            upstreamLossCoeff = 1 + conn.perdaLocalK + pipeHydraulics.distributedLossCoeff + (supply.localLossCoeff || 0);
            totalLossCoeff = upstreamLossCoeff + targetEntryLossCoeff;
        }

        let provisionalUpstreamLossBar = 0;
        let inletPressureBar = backPressureBar;
        let targetEntryLossBar = 0;
        let outletPressureBar = backPressureBar;

        const recalculateBranchPressures = () => {
            pipeHydraulics = this.engine.getPipeHydraulics(conn, geometry, branchAreaM2, capacityLps);
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

        const target = this.engine.getComponentById(conn.targetId);
        if (!target) return 0;

        const isPassThrough = !(comp instanceof FonteLogica || comp instanceof TanqueLogico);
        const dynamics = this.applyConnectionDynamics(conn, flowLps, dt, estimate.geometry, isPassThrough);
        const actualFlowLps = dynamics.flowLps;
        const state = this.engine.getConnectionState(conn);
        state.targetFlowLps = flowLps;
        state.responseTimeS = dynamics.responseTimeS;
        state.lengthM = estimate.geometry.lengthM;
        state.straightLengthM = estimate.geometry.straightLengthM;
        state.headGainM = estimate.geometry.headGainM;

        if (actualFlowLps <= EPSILON_FLOW) return 0;

        const density = this.engine.fluidoOperante.densidade;
        const pipeHydraulics = this.engine.getPipeHydraulics(conn, estimate.geometry, estimate.areaM2, actualFlowLps);
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
}
