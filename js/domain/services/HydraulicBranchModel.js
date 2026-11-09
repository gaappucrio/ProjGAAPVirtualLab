import { BombaLogica } from '../components/BombaLogica.js';
import { FonteLogica } from '../components/FonteLogica.js';
import { TanqueLogico } from '../components/TanqueLogico.js';
import { TrocadorCalorLogico } from '../components/TrocadorCalorLogico.js';
import { EPSILON_FLOW } from '../units/HydraulicUnits.js';

function finiteNumber(value, fallback = 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

// Ponte entre o estado das conexões resolvido pelo solver global e o estado hidráulico de cada
// componente (vazões e pressões registradas nas portas).
export class HydraulicBranchModel {
    constructor(hydraulicContext) {
        this.context = hydraulicContext;
    }

    ensureConnectionProperties(conn) {
        return this.context.ensureConnectionProperties(conn);
    }

    rebuildComponentHydraulicStateFromConnections() {
        this.context.componentes.forEach((component) => {
            if (component instanceof TrocadorCalorLogico && typeof component.resetEstadoHidraulicoStream === 'function') {
                const conns = this.context.conexoes;
                const isStream2 = (portId) => portId === 'in2' || portId === 'out2' || portId === '2';
                const hasStream1 = conns.some((c) => !isStream2(c.targetEndpoint?.portId) && !isStream2(c.sourceEndpoint?.portId));
                const hasStream2 = conns.some((c) => isStream2(c.targetEndpoint?.portId) || isStream2(c.sourceEndpoint?.portId));
                if (hasStream1 && !hasStream2) {
                    component.resetEstadoHidraulicoStream(1);
                    return;
                }
                if (hasStream2 && !hasStream1) {
                    component.resetEstadoHidraulicoStream(2);
                    return;
                }
            }
            component.resetEstadoHidraulico();
        });

        this.context.conexoes.forEach((conn) => {
            const state = this.context.getConnectionState(conn);
            if (state.flowLps <= EPSILON_FLOW) return;

            const source = this.context.getComponentById(conn.sourceId);
            const target = this.context.getComponentById(conn.targetId);
            if (!source || !target) return;

            const fluid = state.fluid || this.context.getConnectionFluid(conn);
            source.registrarSaida(state.flowLps, finiteNumber(state.sourcePressureBar, finiteNumber(state.pressureBar, 0)), fluid, conn.sourceEndpoint?.portId);
            target.registrarEntrada(state.flowLps, finiteNumber(state.outletPressureBar, finiteNumber(state.pressureBar, 0)), fluid, conn.targetEndpoint?.portId);
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
}
