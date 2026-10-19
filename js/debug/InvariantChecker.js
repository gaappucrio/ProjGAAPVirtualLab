// =============================================
// DEBUG: checagens físicas automáticas a cada tick
// Arquivo: js/debug/InvariantChecker.js
// Tolerâncias calibradas rodando as plantas de Testes/plantas teste por 1800
// ticks sem nenhuma violação. Se uma regra disparar, é sinal de bug real ou de
// cenário fora do previsto: vale investigar com __GAAP.passo() e __GAAP.rastrear().
// =============================================

import { DrenoLogico } from '../domain/components/DrenoLogico.js';
import { FonteLogica } from '../domain/components/FonteLogica.js';
import { TanqueLogico } from '../domain/components/TanqueLogico.js';
import { TrocadorCalorLogico } from '../domain/components/TrocadorCalorLogico.js';
import { DEFAULT_ATMOSPHERIC_PRESSURE_BAR } from '../domain/units/HydraulicUnits.js';
import { wrapMethod } from './MethodWrap.js';

const FLOW_ABS_TOLERANCE_LPS = 1e-3;
const FLOW_REL_TOLERANCE = 0.01;
const TEMPERATURE_TOLERANCE_C = 0.01;
const NEGATIVE_FLOW_TOLERANCE_LPS = 1e-6;
const CONNECTION_PRESSURE_FIELDS = ['pressureBar', 'outletPressureBar', 'pipeInletPressureBar', 'pipeOutletPressureBar', 'sourcePressureBar'];
// Pressões de estado dos componentes (entrada, saída, sucção, descarga, por corrente...).
const COMPONENT_PRESSURE_FIELD = /^pressao\w*AtualBar$|^pressaoFundoBar$/;

export const INVARIANT_RULES = Object.freeze({
    NAO_FINITO: 'valor NaN ou infinito',
    PRESSAO_ABAIXO_VACUO: 'pressão manométrica abaixo do vácuo absoluto (< -1,013 bar)',
    VAZAO_NEGATIVA: 'vazão negativa numa conexão (o modelo é direcional)',
    BALANCO_PASSANTE: 'vazão de entrada ≠ saída em componente sem inventário',
    BALANCO_TANQUE: 'vazão registrada no tanque ≠ soma das conexões',
    VOLUME_FORA_LIMITES: 'volume do tanque fora de [0, capacidade]',
    TEMPERATURA_TROCADOR: 'temperatura de saída do trocador fora da faixa das entradas (2ª lei)',
    SOLVER_NAO_CONVERGIU: 'solver atingiu o limite de iterações'
});

function round(value, digits = 6) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function flowTolerance(...flows) {
    return FLOW_ABS_TOLERANCE_LPS + FLOW_REL_TOLERANCE * Math.max(0, ...flows.map(Math.abs));
}

function streamOfPort(portId) {
    return String(portId || '').endsWith('2') ? 2 : 1;
}

export function checkInvariants(engine, { solverHitsThisTick = 0 } = {}) {
    const violations = [];
    // `campo` identifica a violação para agrupar repetições; `detalhe` pode conter valores que mudam a cada tick.
    const report = (regra, onde, campo, detalhe, valor) => violations.push({ regra, onde, campo, detalhe, valor: round(valor) });

    const flowOf = (connection) => engine.connectionStateStore.get(connection)?.flowLps || 0;
    const sumFlows = (connections) => connections.reduce((sum, connection) => sum + flowOf(connection), 0);

    const checkFinite = (source, onde) => {
        if (!source) return;
        Object.entries(source).forEach(([field, value]) => {
            if (typeof value === 'number' && !Number.isFinite(value)) report('NAO_FINITO', onde, field, field, value);
        });
    };

    engine.conexoes.forEach((connection) => {
        const state = engine.connectionStateStore.get(connection);
        if (!state) return;
        checkFinite(state, connection.id);

        if (state.flowLps < -NEGATIVE_FLOW_TOLERANCE_LPS) {
            report('VAZAO_NEGATIVA', connection.id, 'flowLps', 'flowLps', state.flowLps);
        }
        CONNECTION_PRESSURE_FIELDS.forEach((field) => {
            if (state[field] < -DEFAULT_ATMOSPHERIC_PRESSURE_BAR) report('PRESSAO_ABAIXO_VACUO', connection.id, field, field, state[field]);
        });
    });

    engine.componentes.forEach((component) => {
        const onde = component.tag;
        checkFinite(component, onde);
        checkFinite(component.estadoHidraulico, onde);

        Object.keys(component).filter((field) => COMPONENT_PRESSURE_FIELD.test(field)).forEach((field) => {
            if (component[field] < -DEFAULT_ATMOSPHERIC_PRESSURE_BAR) report('PRESSAO_ABAIXO_VACUO', onde, field, field, component[field]);
        });

        if (component instanceof FonteLogica || component instanceof DrenoLogico) return;

        const inputs = engine.getInputConnections(component);
        const outputs = engine.getOutputConnections(component);

        if (component instanceof TanqueLogico) {
            const qIn = sumFlows(inputs);
            const qOut = sumFlows(outputs);
            if (Math.abs(component.lastQin - qIn) > flowTolerance(component.lastQin, qIn)) {
                report('BALANCO_TANQUE', onde, 'entrada', `entrada: tanque ${round(component.lastQin, 4)} × conexões ${round(qIn, 4)} L/s`, component.lastQin - qIn);
            }
            if (Math.abs(component.lastQout - qOut) > flowTolerance(component.lastQout, qOut)) {
                report('BALANCO_TANQUE', onde, 'saida', `saída: tanque ${round(component.lastQout, 4)} × conexões ${round(qOut, 4)} L/s`, component.lastQout - qOut);
            }
            if (component.volumeAtual < 0 || component.volumeAtual > component.capacidadeMaxima + 1e-9) {
                report('VOLUME_FORA_LIMITES', onde, 'volumeAtual', `volumeAtual (capacidade ${component.capacidadeMaxima} L)`, component.volumeAtual);
            }
            return;
        }

        if (component instanceof TrocadorCalorLogico) {
            [1, 2].forEach((stream) => {
                const qIn = sumFlows(inputs.filter((connection) => streamOfPort(connection.targetEndpoint?.portId) === stream));
                const qOut = sumFlows(outputs.filter((connection) => streamOfPort(connection.sourceEndpoint?.portId) === stream));
                if (Math.abs(qIn - qOut) > flowTolerance(qIn, qOut)) {
                    report('BALANCO_PASSANTE', onde, `corrente${stream}`, `corrente ${stream}: entra ${round(qIn, 4)} × sai ${round(qOut, 4)} L/s`, qIn - qOut);
                }
            });
            checkHeatExchangerTemperatures(engine, component, report);
            return;
        }

        const qIn = sumFlows(inputs);
        const qOut = sumFlows(outputs);
        if (Math.abs(qIn - qOut) > flowTolerance(qIn, qOut)) {
            report('BALANCO_PASSANTE', onde, 'vazao', `entra ${round(qIn, 4)} × sai ${round(qOut, 4)} L/s`, qIn - qOut);
        }
    });

    if (solverHitsThisTick > 0) {
        report('SOLVER_NAO_CONVERGIU', `solver ${engine.activeHydraulicSolverMode}`, 'maxIterationsHit', 'chamadas no limite neste tick', solverHitsThisTick);
    }

    return violations;
}

// Lê o contador acumulado de cada solver persistente do engine (qualquer
// propriedade *Solver com getMetrics, então um solver novo entra sozinho) e o
// contador das ilhas, cujos solvers são recriados a cada tick.
export function readSolverIterationState(engine) {
    const instances = {};
    Object.entries(engine).forEach(([key, value]) => {
        if (key.endsWith('Solver') && typeof value?.getMetrics === 'function') {
            instances[key] = value.getMetrics().maxIterationsHit || 0;
        }
    });
    return {
        instances,
        scopedHits: engine.lastScopedSolverMetrics ? (engine.lastScopedSolverMetrics.maxIterationsHit || 0) : null
    };
}

// Delta por instância: independe de o modo ter mudado (push → nodal, rede única ↔ ilhas).
export function solverHitsDuringTick(before, after) {
    const persistentHits = Object.entries(after.instances).reduce((sum, [key, hits]) =>
        sum + Math.max(0, hits - (before.instances[key] ?? hits)), 0);
    return persistentHits + (after.scopedHits ?? 0);
}

// Com o atraso térmico (branch de refatoração), a saída real pode ficar fora da
// faixa durante um transitório; a 2ª lei vale para a temperatura de equilíbrio (alvo).
function outletTemperature(exchanger, stream) {
    return stream === 1
        ? (exchanger.temperaturaSaidaAlvoC ?? exchanger.temperaturaSaidaC)
        : (exchanger.temperaturaSaida2AlvoC ?? exchanger.temperaturaSaida2C);
}

// Cada corrente com vazão é checada contra [entrada própria, referência], onde a
// referência é a entrada da outra corrente (duas correntes) ou a temperatura de
// serviço (utilidade, inclusive quando só a corrente 2 está ligada).
function checkHeatExchangerTemperatures(engine, exchanger, report) {
    const dual = engine.isTrocadorComDuasCorrentes?.(exchanger) === true;
    const streams = [
        { stream: 1, flow: exchanger.vazao1Lps, inlet: exchanger.temperaturaEntradaC, otherInlet: exchanger.temperaturaEntrada2C },
        { stream: 2, flow: exchanger.vazao2Lps, inlet: exchanger.temperaturaEntrada2C, otherInlet: exchanger.temperaturaEntradaC }
    ];

    streams.forEach(({ stream, flow, inlet, otherInlet }) => {
        if (!(flow > 1e-6)) return;

        const reference = dual ? otherInlet : exchanger.temperaturaServicoC;
        const low = Math.min(inlet, reference);
        const high = Math.max(inlet, reference);
        const temperature = outletTemperature(exchanger, stream);
        if (temperature < low - TEMPERATURE_TOLERANCE_C || temperature > high + TEMPERATURE_TOLERANCE_C) {
            report('TEMPERATURA_TROCADOR', exchanger.tag, `corrente${stream}`,
                `saída da corrente ${stream} fora de [${round(low, 2)}, ${round(high, 2)}] °C`, temperature);
        }
    });
}

export function createInvariantMonitor({ engine, logger = console } = {}) {
    let active = false;
    let restore = null;
    let options = { pausarNoErro: false };
    let tickIndex = 0;
    let haltRequested = false;
    const occurrences = new Map();

    const record = (violation) => {
        const key = `${violation.regra}|${violation.onde}|${violation.campo}`;
        const existing = occurrences.get(key);
        if (existing) {
            existing.vezes += 1;
            existing.ultimoTick = tickIndex;
            existing.ultimoValor = violation.valor;
            return false;
        }

        occurrences.set(key, {
            regra: violation.regra,
            descricao: INVARIANT_RULES[violation.regra],
            onde: violation.onde,
            detalhe: violation.detalhe,
            valor: violation.valor,
            ultimoValor: violation.valor,
            vezes: 1,
            primeiroTick: tickIndex,
            tempoS: round(engine.elapsedTime, 3),
            ultimoTick: tickIndex
        });
        return true;
    };

    const afterTick = (solverHitsThisTick) => {
        tickIndex += 1;
        const violations = checkInvariants(engine, { solverHitsThisTick });
        const fresh = violations.filter(record);

        fresh.forEach((violation) => {
            logger.warn?.(
                `[GAAP debug] ⚠ ${INVARIANT_RULES[violation.regra]} · ${violation.onde} · ${violation.detalhe}` +
                ` = ${violation.valor} · tick ${tickIndex}, t = ${engine.elapsedTime.toFixed(3)} s`
            );
        });

        if (fresh.length > 0 && options.pausarNoErro) {
            haltRequested = true;
            if (engine.isRunning) engine.stop();
            logger.info?.('[GAAP debug] simulação pausada na violação. Use __GAAP.passo() para avançar.');
        }
    };

    const createCheckedRun = (original) => function checkedRun(...args) {
        if (!active || !engine.isRunning) return original.apply(this, args);

        const solverBefore = readSolverIterationState(engine);
        const result = original.apply(this, args);
        afterTick(solverHitsDuringTick(solverBefore, readSolverIterationState(engine)));
        return result;
    };

    const monitor = {
        get ativo() {
            return active;
        },

        start(userOptions = {}) {
            options = { pausarNoErro: false, ...userOptions };
            if (active) return;
            active = true;
            restore = wrapMethod(engine.tickPipeline, 'run', createCheckedRun);
        },

        stop() {
            active = false;
            restore?.();
            restore = null;
        },

        reset() {
            occurrences.clear();
            tickIndex = 0;
            haltRequested = false;
        },

        // Lido pelo passo a passo para interromper um passo(n) longo na violação.
        consumeHalt() {
            const halted = haltRequested;
            haltRequested = false;
            return halted;
        },

        report() {
            return [...occurrences.values()];
        }
    };

    return monitor;
}
