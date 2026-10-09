// =============================================
// DEBUG: comandos de inspeção no console do navegador
// Arquivo: js/debug/DebugConsole.js
// Ativação: abrir a página com ?debug=1 e digitar __GAAP.ajuda() no console
// =============================================

import { setupDebugPanel } from './DebugPanel.js';
import { createEventTracer } from './EventTracer.js';
import { checkInvariants, createInvariantMonitor } from './InvariantChecker.js';
import { createTickStepper } from './TickStepper.js';

const DISABLED_FLAG_VALUES = new Set(['0', 'false', 'off']);

export function isDebugEnabled(search = globalThis.location?.search || '') {
    const flag = new URLSearchParams(search).get('debug');
    return flag !== null && !DISABLED_FLAG_VALUES.has(flag.toLowerCase());
}

function round(value, digits = 4) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return value;
    const factor = 10 ** digits;
    return Math.round(numericValue * factor) / factor;
}

function describeComponent(component) {
    return component ? `${component.tag} (${component.id})` : '?';
}

export function createDebugApi({ engine, runtime = {}, logger = console } = {}) {
    const findComponent = (tagOrId) => engine.componentes.find((component) =>
        component.id === tagOrId || component.tag === tagOrId
    ) || null;

    const componentRow = (component) => ({
        id: component.id,
        tag: component.tag,
        tipo: component.constructor.name,
        qEntradaLps: round(component.estadoHidraulico?.entradaVazaoLps),
        qSaidaLps: round(component.estadoHidraulico?.saidaVazaoLps),
        pEntradaBar: round(component.getPressaoEntradaBar?.()),
        pSaidaBar: round(component.getPressaoSaidaBar?.())
    });

    // Lê o estado sem criar entradas novas no store (getConnectionState criaria).
    const connectionRow = (connection) => {
        const state = engine.connectionStateStore.get(connection) || {};
        return {
            id: connection.id,
            de: describeComponent(engine.getComponentById(connection.sourceId)),
            para: describeComponent(engine.getComponentById(connection.targetId)),
            vazaoLps: round(state.flowLps ?? 0),
            pEntradaBar: round(state.pipeInletPressureBar ?? 0),
            pSaidaBar: round(state.pipeOutletPressureBar ?? 0),
            perdaBar: round(state.totalLossBar ?? 0),
            regime: state.regime ?? 'sem estado'
        };
    };

    const tracer = createEventTracer({ engine, logger });
    const monitor = createInvariantMonitor({ engine, logger });
    const stepper = createTickStepper({ engine, logger, shouldHalt: () => monitor.consumeHalt() });

    const api = {
        engine,
        runtime,
        tracer,
        monitor,

        vigiar(opcoes = {}) {
            monitor.start(opcoes);
            logger.info?.('[GAAP debug] checagens físicas ligadas.', opcoes);
        },

        pararVigia() {
            monitor.stop();
            logger.info?.('[GAAP debug] checagens físicas desligadas.');
        },

        checagens() {
            const rows = monitor.report();
            if (rows.length === 0) logger.info?.('[GAAP debug] ✔ nenhuma violação registrada.');
            else logger.table?.(rows);
            return rows;
        },

        limparChecagens() {
            monitor.reset();
        },

        checarAgora() {
            const rows = checkInvariants(engine);
            if (rows.length === 0) logger.info?.('[GAAP debug] ✔ estado atual sem violações.');
            else logger.table?.(rows);
            return rows;
        },

        passo(n = 1, opcoes = {}) {
            return stepper.step(n, opcoes);
        },

        medir(segundos = 3) {
            return stepper.measure(segundos);
        },

        rastrear(opcoes = {}) {
            tracer.start(opcoes);
        },

        pararRastreio() {
            return tracer.stop();
        },

        eventos(filtro = {}) {
            const rows = tracer.entries(filtro);
            logger.table?.(rows.map(({ payload, ...row }) => row));
            return rows;
        },

        resumoEventos() {
            const rows = tracer.summary();
            logger.table?.(rows);
            return rows;
        },

        componentes() {
            const rows = engine.componentes.map(componentRow);
            logger.table?.(rows);
            return rows;
        },

        conexoes() {
            const rows = engine.conexoes.map(connectionRow);
            logger.table?.(rows);
            return rows;
        },

        find(tagOrId) {
            const component = findComponent(tagOrId);
            if (!component) logger.warn?.(`[GAAP debug] componente "${tagOrId}" não encontrado`);
            return component;
        },

        conexoesDe(tagOrId) {
            const component = findComponent(tagOrId);
            if (!component) {
                logger.warn?.(`[GAAP debug] componente "${tagOrId}" não encontrado`);
                return { entradas: [], saidas: [] };
            }
            const result = {
                entradas: engine.getInputConnections(component).map(connectionRow),
                saidas: engine.getOutputConnections(component).map(connectionRow)
            };
            logger.table?.([
                ...result.entradas.map((row) => ({ sentido: 'entrada', ...row })),
                ...result.saidas.map((row) => ({ sentido: 'saída', ...row }))
            ]);
            return result;
        },

        solver() {
            const metrics = engine.getSolverMetrics();
            logger.log?.(metrics);
            return metrics;
        },

        analise() {
            const analysis = engine.lastHydraulicAnalysis;
            if (!analysis) logger.info?.('[GAAP debug] nenhuma análise ainda: rode a simulação ao menos 1 tick');
            else logger.log?.(analysis);
            return analysis;
        },

        // Com seleção múltipla o engine zera selectedComponent e usa selectedComponents.
        selecionado() {
            const selectedComponents = engine.selectedComponents;
            if (selectedComponents.length > 1) {
                logger.table?.(selectedComponents.map(componentRow));
                return selectedComponents;
            }

            const selected = engine.selectedComponent || engine.selectedConnection || null;
            logger.log?.(selected);
            return selected;
        },

        ajuda() {
            logger.table?.([
                { comando: '__GAAP.componentes()', descricao: 'tabela de componentes: tipo, vazões e pressões' },
                { comando: '__GAAP.conexoes()', descricao: 'tabela de conexões: origem, destino, vazão, perdas, regime' },
                { comando: '__GAAP.find("tag ou id")', descricao: 'retorna o objeto do componente' },
                { comando: '__GAAP.conexoesDe("tag ou id")', descricao: 'conexões de entrada e saída do componente' },
                { comando: '__GAAP.selecionado()', descricao: 'componente ou conexão selecionado na tela (vários → tabela)' },
                { comando: '__GAAP.solver()', descricao: 'modo do solver (push/nodal) e métricas de convergência' },
                { comando: '__GAAP.analise()', descricao: 'última análise topológica da rede (ilhas, malhas)' },
                { comando: '__GAAP.rastrear()', descricao: 'liga o rastreio de eventos (mostra ações fora do tick, com pilha)' },
                { comando: '__GAAP.rastrear({ incluirTick: true })', descricao: 'mostra também os eventos disparados a cada tick' },
                { comando: '__GAAP.rastrear({ tag: "tag", tipos: ["estado"] })', descricao: 'filtra por componente e/ou tipo de evento' },
                { comando: '__GAAP.pararRastreio()', descricao: 'desliga o rastreio e mostra quantos eventos de cada tipo' },
                { comando: '__GAAP.eventos({ tipo, tag, ultimos })', descricao: 'tabela dos últimos eventos registrados' },
                { comando: '__GAAP.resumoEventos()', descricao: 'contagem por origem e tipo, sem parar o rastreio' },
                { comando: '__GAAP.passo(n)', descricao: 'pausa e avança n ticks (padrão 1); mostra o que mudou e o tempo de cada fase' },
                { comando: '__GAAP.passo(n, { dt: 0.05 })', descricao: 'idem, com passo de tempo escolhido em segundos (máx. 0.1)' },
                { comando: '__GAAP.medir(3)', descricao: 'com a simulação rodando, mede o tempo de cada fase por 3 s' },
                { comando: '__GAAP.checagens()', descricao: 'violações físicas registradas (checagem automática a cada tick)' },
                { comando: '__GAAP.vigiar({ pausarNoErro: true })', descricao: 'pausa a simulação na primeira violação nova' },
                { comando: '__GAAP.checarAgora()', descricao: 'roda as checagens uma vez no estado atual' },
                { comando: '__GAAP.limparChecagens()', descricao: 'zera o registro de violações' },
                { comando: '__GAAP.pararVigia()', descricao: 'desliga as checagens automáticas' },
                { comando: '__GAAP.engine', descricao: 'acesso direto ao SistemaSimulacao' }
            ]);
        }
    };

    return api;
}

export function setupDebugConsole({ engine, runtime, target = globalThis, logger = console, doc = globalThis.document } = {}) {
    if (!engine) return null;

    const api = createDebugApi({ engine, runtime, logger });
    target.__GAAP = api;
    api.monitor.start();
    setupDebugPanel({ api, engine, doc });
    logger.info?.('[GAAP debug] modo debug ativo. Digite __GAAP.ajuda() no console.');
    return api;
}
