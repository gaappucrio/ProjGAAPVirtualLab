import { BombaLogica } from '../../domain/components/BombaLogica.js';
import { TanqueLogico } from '../../domain/components/TanqueLogico.js';
import { ValvulaLogica } from '../../domain/components/ValvulaLogica.js';
import { ComponentEventPayloads, EngineEventPayloads } from '../events/EventPayloads.js';

const MAX_FRAME_DT_SECONDS = 0.1;

export class SimulationTickPipeline {
    constructor({ engine, profiler }) {
        this.engine = engine;
        this.profiler = profiler;
    }

    calculateDeltaTime(timestamp) {
        let dt = ((timestamp - this.engine.lastTime) / 1000.0) * this.engine.velocidade;
        this.engine.lastTime = timestamp;
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
            component.atualizarDinamica(dt, this.engine.fluidoOperante);
        });
    }

    solveHydraulicNetwork(dt) {
        this.engine.resolvePushBasedNetwork(dt);
    }

    syncPhysicalMetrics(dt) {
        this.engine.componentes.forEach((component) => {
            if (component instanceof TanqueLogico) component.atualizarFisica(dt, this.engine.fluidoOperante);
            else component.sincronizarMetricasFisicas(this.engine.fluidoOperante);
        });
    }

    notifySetpointActuators() {
        if (!this.engine.isRunning) return;

        this.engine.componentes.forEach((component) => {
            if (!(component instanceof TanqueLogico) || !component.setpointAtivo) return;

            const notificarEstado = (equipment) => {
                if (equipment instanceof ValvulaLogica) {
                    equipment.notify(ComponentEventPayloads.state({
                        aberta: equipment.aberta,
                        grau: equipment.grauAbertura
                    }));
                    return;
                }

                if (equipment instanceof BombaLogica) {
                    equipment.notify(ComponentEventPayloads.state({
                        isOn: equipment.isOn,
                        grau: equipment.grauAcionamento
                    }));
                }
            };

            component.inputs.forEach(notificarEstado);
            component.outputs.forEach(notificarEstado);
        });
    }

    run(timestamp) {
        if (!this.engine.isRunning) return;

        this.profiler.startTick();

        const dt = this.calculateDeltaTime(timestamp);
        this.engine.elapsedTime += dt;

        this.updateHighLevelControls(dt);
        this.updateComponentDynamics(dt);
        this.solveHydraulicNetwork(dt);
        this.syncPhysicalMetrics(dt);

        this.engine.updatePipesVisual();
        this.engine.notify(EngineEventPayloads.panelUpdate(dt));

        this.profiler.endTick(this.engine.getSolverMetrics());
    }
}
