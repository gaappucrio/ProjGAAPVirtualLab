// ==================================
// APPLICATION: Detector de regime permanente
// Arquivo: js/application/engine/SteadyStateMonitor.js
// ==================================

import { TanqueLogico } from '../../domain/components/TanqueLogico.js';
import { TrocadorCalorLogico } from '../../domain/components/TrocadorCalorLogico.js';

// Critério de bancada: todas as leituras com taxa de variação abaixo da resolução prática
// dos instrumentos, sem interrupção, por um intervalo de observação.
export const STEADY_STATE_FLOW_RATE_TOLERANCE_LPS_PER_S = 1e-3;
export const STEADY_STATE_VOLUME_RATE_TOLERANCE_LPS = 1e-3;
export const STEADY_STATE_TEMPERATURE_RATE_TOLERANCE_C_PER_S = 1e-3;
export const STEADY_STATE_HOLD_TIME_S = 10;

function finiteOrNull(value) {
    return Number.isFinite(value) ? value : null;
}

export class SteadyStateMonitor {
    constructor({
        flowRateTolerance = STEADY_STATE_FLOW_RATE_TOLERANCE_LPS_PER_S,
        volumeRateTolerance = STEADY_STATE_VOLUME_RATE_TOLERANCE_LPS,
        temperatureRateTolerance = STEADY_STATE_TEMPERATURE_RATE_TOLERANCE_C_PER_S,
        holdTimeS = STEADY_STATE_HOLD_TIME_S
    } = {}) {
        this.tolerances = {
            flow: flowRateTolerance,
            volume: volumeRateTolerance,
            temperature: temperatureRateTolerance
        };
        this.holdTimeS = holdTimeS;
        this.reset();
    }

    reset() {
        this.previousSamples = null;
        this.stableTimeS = 0;
        this.steady = false;
        this.steadySinceS = null;
        this.dominantVariation = null;
    }

    collectSamples(engine) {
        const samples = new Map();
        const add = (key, kind, label, value) => {
            const numericValue = finiteOrNull(value);
            if (numericValue !== null) samples.set(key, { kind, label, value: numericValue });
        };

        engine.conexoes.forEach((connection) => {
            const source = engine.getComponentById?.(connection.sourceId);
            const target = engine.getComponentById?.(connection.targetId);
            const label = `${source?.tag || connection.sourceId} → ${target?.tag || connection.targetId}`;
            add(`flow:${connection.id}`, 'flow', label, engine.getConnectionState(connection).flowLps);
        });

        engine.componentes.forEach((component) => {
            if (component instanceof TanqueLogico) {
                add(`volume:${component.id}`, 'volume', component.tag, component.volumeAtual);
                add(`temperature:${component.id}`, 'temperature', component.tag, component.fluidoConteudo?.temperatura);
            } else if (component instanceof TrocadorCalorLogico) {
                add(`temperature:${component.id}:1`, 'temperature', `${component.tag} (1)`, component.temperaturaSaidaC);
                add(`temperature:${component.id}:2`, 'temperature', `${component.tag} (2)`, component.temperaturaSaida2C);
            }
        });

        return samples;
    }

    update(engine, dt) {
        if (!(dt > 0)) return this.getStatus();

        const samples = this.collectSamples(engine);
        const previous = this.previousSamples;
        this.previousSamples = samples;

        // Sem histórico ou com a topologia alterada não há como medir taxa: reinicia a observação.
        const sameTopology = previous
            && previous.size === samples.size
            && [...samples.keys()].every((key) => previous.has(key));
        if (!sameTopology) {
            this.stableTimeS = 0;
            this.steady = false;
            this.steadySinceS = null;
            this.dominantVariation = null;
            return this.getStatus();
        }

        let dominant = null;
        samples.forEach((sample, key) => {
            const rate = Math.abs(sample.value - previous.get(key).value) / dt;
            const ratio = rate / this.tolerances[sample.kind];
            if (!dominant || ratio > dominant.ratio) {
                dominant = { kind: sample.kind, label: sample.label, rate, ratio };
            }
        });
        this.dominantVariation = dominant;

        if (!dominant || dominant.ratio <= 1) {
            this.stableTimeS += dt;
        } else {
            this.stableTimeS = 0;
        }

        const elapsedS = Number.isFinite(engine.elapsedTime) ? engine.elapsedTime : 0;
        const steady = this.stableTimeS >= this.holdTimeS;
        if (steady && !this.steady) this.steadySinceS = Math.max(0, elapsedS - this.stableTimeS);
        if (!steady) this.steadySinceS = null;
        this.steady = steady;

        return this.getStatus();
    }

    getStatus() {
        return {
            steady: this.steady,
            steadySinceS: this.steadySinceS,
            stableTimeS: this.stableTimeS,
            holdTimeS: this.holdTimeS,
            observing: this.previousSamples !== null,
            dominantVariation: this.dominantVariation ? { ...this.dominantVariation } : null
        };
    }
}
