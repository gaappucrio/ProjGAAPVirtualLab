import { BombaLogica } from '../../domain/components/BombaLogica.js';
import { TanqueLogico } from '../../domain/components/TanqueLogico.js';
import { ValvulaLogica } from '../../domain/components/ValvulaLogica.js';
import { ComponentEventPayloads, EngineEventPayloads } from '../events/EventPayloads.js';

const MAX_FRAME_DT_SECONDS = 0.1;

export class SimulationTickPipeline {
    constructor({ engine }) {
        this.engine = engine;
    }

    calculateDeltaTime(timestamp) {
        let dt = ((timestamp - this.engine.lastTime) / 1000.0) * this.engine.velocidade;
        this.engine.lastTime = timestamp;
        if (!Number.isFinite(dt) || dt < 0) dt = 0;
        if (dt > MAX_FRAME_DT_SECONDS) dt = MAX_FRAME_DT_SECONDS;
        return dt;
    }

    updateHighLevelControls(dt) {
        this.engine.componentes.forEach((component) => {
            if (component instanceof TanqueLogico) component._rodarControlador(dt);
        });
    }

    updateComponentDynamics(dt) {
        this.engine.componentes.forEach((component) => {
            component.atualizarDinamica(dt, this.engine.hydraulicContext.getComponentFluid(component));
        });
    }

    solveHydraulicNetwork(dt) {
        this.engine.resolveHydraulicNetwork(dt);
    }

    syncPhysicalMetrics(dt) {
        this.engine.componentes.forEach((component) => {
            const fluid = this.engine.hydraulicContext.getComponentFluid(component);
            if (component instanceof TanqueLogico) component.atualizarFisica(dt, fluid);
            else component.sincronizarMetricasFisicas(fluid);
        });
    }

    notifySetpointActuators() {
        if (!this.engine.isRunning) return;

        this.engine.componentes.forEach((component) => {
            if (!(component instanceof TanqueLogico) || !component.setpointAtivo) return;

            const notificarEstado = (equipment) => {
                if (!(equipment instanceof ValvulaLogica)) return;
                equipment.notify(ComponentEventPayloads.state({
                    aberta: equipment.aberta,
                    grau: equipment.grauAbertura
                }));
            };
            const notificarBombaMantida = (equipment) => {
                if (!(equipment instanceof BombaLogica)) return;
                equipment.notify(ComponentEventPayloads.state({
                    isOn: equipment.isOn,
                    grau: equipment.getAcionamentoAlvo?.() ?? 100,
                    grauManual: equipment.grauAcionamento,
                    grauEfetivo: equipment.acionamentoEfetivo,
                    bloqueadaPorSetpoint: true
                }));
            };

            component.inputs.forEach(notificarEstado);
            component.outputs.forEach(notificarEstado);
            component.getAtuadoresControleNivel?.().bombas.forEach(notificarBombaMantida);
        });
    }

    run(timestamp) {
        if (!this.engine.isRunning) return;

        const dt = this.calculateDeltaTime(timestamp);
        this.engine.elapsedTime += dt;

        this.updateHighLevelControls(dt);
        this.updateComponentDynamics(dt);
        this.solveHydraulicNetwork(dt);
        this.syncPhysicalMetrics(dt);

        this.engine.updatePipesVisual();
        this.engine.notify(EngineEventPayloads.panelUpdate(dt));

    }
}
