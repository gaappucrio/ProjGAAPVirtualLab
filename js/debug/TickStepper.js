// =============================================
// DEBUG: avançar a simulação tick a tick e medir fases
// Arquivo: js/debug/TickStepper.js
// O passo usa o próprio SimulationTickPipeline.run(), então executa exatamente
// o que roda no navegador, só que com dt fixo e sob demanda.
// =============================================

import { diffSnapshots, snapshotState } from './StateSnapshot.js';
import { createTickProfiler } from './TickProfiler.js';

const DEFAULT_DT_S = 1 / 60;
const MAX_PIPELINE_DT_S = 0.1;

export function createTickStepper({
    engine,
    logger = console,
    now = () => globalThis.performance.now(),
    schedule = (fn, ms) => globalThis.setTimeout(fn, ms),
    shouldHalt = () => false
} = {}) {
    const profiler = createTickProfiler({ engine, now });

    const runOneTick = (dt) => {
        // calculateDeltaTime multiplica pela velocidade; compensa para o dt pedido.
        const timestamp = engine.lastTime + (dt * 1000) / engine.velocidade;
        engine.isRunning = true;
        try {
            engine.tickPipeline.run(timestamp);
        } finally {
            engine.isRunning = false;
        }
    };

    return {
        step(n = 1, { dt = DEFAULT_DT_S } = {}) {
            const count = Math.max(1, Math.floor(Number(n) || 1));
            if (engine.isRunning) {
                engine.stop();
                logger.info?.('[GAAP debug] simulação pausada para avançar tick a tick.');
            }
            if (dt > MAX_PIPELINE_DT_S) {
                logger.warn?.(`[GAAP debug] dt=${dt}s é limitado a ${MAX_PIPELINE_DT_S}s pelo pipeline.`);
            }

            const before = snapshotState(engine);
            const startTime = engine.elapsedTime;
            let executed = 0;
            let halted = false;
            shouldHalt(); // descarta pedido de parada antigo, de antes deste passo
            profiler.start();
            try {
                while (executed < count && !halted) {
                    runOneTick(dt);
                    executed += 1;
                    halted = shouldHalt();
                }
            } finally {
                profiler.stop();
            }

            const result = {
                ticks: executed,
                interrompido: halted,
                tempoSimuladoS: engine.elapsedTime - startTime,
                tempoTotalS: engine.elapsedTime,
                fases: profiler.report(),
                mudancas: diffSnapshots(before, snapshotState(engine))
            };

            if (halted) logger.warn?.(`[GAAP debug] passo interrompido na violação após ${executed} de ${count} tick(s).`);
            logger.info?.(
                `[GAAP debug] +${executed} tick(s) · +${result.tempoSimuladoS.toFixed(3)} s simulados · ` +
                `t = ${result.tempoTotalS.toFixed(3)} s · ${result.mudancas.length} valor(es) mudaram`
            );
            logger.groupCollapsed?.('tempo por fase (ms)');
            logger.table?.(result.fases);
            logger.groupEnd?.();
            logger.table?.(result.mudancas);
            return result;
        },

        measure(seconds = 3) {
            if (!engine.isRunning) {
                logger.warn?.('[GAAP debug] dê play na simulação antes de medir (ou use __GAAP.passo()).');
                return Promise.resolve([]);
            }

            profiler.start();
            logger.info?.(`[GAAP debug] medindo fases por ${seconds} s...`);
            return new Promise((resolve) => {
                schedule(() => {
                    const rows = profiler.stop();
                    logger.table?.(rows);
                    resolve(rows);
                }, seconds * 1000);
            });
        }
    };
}
