// =============================================
// DEBUG: rastreador de eventos (Observable.notify)
// Arquivo: js/debug/EventTracer.js
// Intercepta o notify de todos os Observables (engine e componentes) sem alterar
// o domínio: o protótipo é trocado só enquanto o rastreio está ativo.
// =============================================

import { Observable } from '../domain/components/BaseComponente.js';
import { wrapMethod } from './MethodWrap.js';

const DEFAULT_OPTIONS = Object.freeze({
    tipos: null,
    ignorar: ['update_painel'],
    tag: null,
    incluirTick: false,
    pilha: true,
    aoVivo: true,
    max: 2000
});

function round(value, digits = 3) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function describeValue(value) {
    if (value === null || value === undefined) return String(value);
    if (typeof value === 'number') return Number.isFinite(value) ? String(round(value, 4)) : String(value);
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(describeValue).join(', ')}]`;
    if ('tag' in value) return value.tag;
    if ('sourceId' in value && 'targetId' in value) return value.id;
    return '{…}';
}

export function summarizePayload(payload) {
    if (!payload || typeof payload !== 'object') return '';
    return Object.entries(payload)
        .filter(([key]) => key !== 'tipo')
        .map(([key, value]) => `${key}: ${describeValue(value)}`)
        .join(', ');
}

// Opção com grafia errada (ex.: incluirtick) seria ignorada em silêncio.
function warnUnknownOptions(userOptions, logger) {
    const knownKeys = Object.keys(DEFAULT_OPTIONS);
    Object.keys(userOptions).forEach((key) => {
        if (knownKeys.includes(key)) return;
        const suggestion = knownKeys.find((known) => known.toLowerCase() === key.toLowerCase());
        logger.warn?.(
            `[GAAP debug] opção desconhecida "${key}" foi ignorada.` +
            (suggestion ? ` Você quis dizer "${suggestion}"?` : ` Opções válidas: ${knownKeys.join(', ')}.`)
        );
    });
}

export function createEventTracer({
    engine,
    logger = console,
    now = () => globalThis.performance.now(),
    isInsideStep = () => false
} = {}) {
    let active = false;
    let restoreFns = [];
    let options = { ...DEFAULT_OPTIONS };
    let entries = [];
    let counts = new Map();
    let sequence = 0;
    let depth = 0;
    let tickIndex = 0;
    let insideTick = false;

    const describeSource = (observable) => {
        if (observable === engine) return 'engine';
        if (observable && 'tag' in observable) return `${observable.tag} (${observable.id})`;
        return observable?.constructor?.name || '?';
    };

    const matchesFilters = (observable, data) => {
        const tipo = data?.tipo;
        if (options.tipos && !options.tipos.includes(tipo)) return false;
        if (options.ignorar?.includes(tipo)) return false;
        if (!options.tag) return true;
        if (options.tag === 'engine') return observable === engine;
        return observable?.tag === options.tag || observable?.id === options.tag;
    };

    // Contagem de todos os eventos que passam no filtro, inclusive os de tick
    // que não vão para o buffer (assim eles não expulsam as ações do usuário).
    const countEvent = (origem, tipo, emTick, ms) => {
        const key = `${origem}|${tipo}`;
        const group = counts.get(key) || { origem, tipo, qtd: 0, emTick: 0, msTotal: 0 };
        group.qtd += 1;
        if (emTick) group.emTick += 1;
        group.msTotal += ms;
        counts.set(key, group);
    };

    const printLive = (entry) => {
        if (!options.aoVivo || (entry.emTick && !options.incluirTick)) return;

        const indent = entry.profundidade > 0 ? `${'  '.repeat(entry.profundidade)}↳ ` : '';
        const tickLabel = entry.emTick ? `tick ${entry.tick}` : 'fora do tick';
        const line = `${indent}#${entry.n} [${tickLabel}] ${entry.origem} → ${entry.tipo}` +
            (entry.resumo ? ` {${entry.resumo}}` : '') + ` · ${entry.ouvintes} ouvinte(s)`;

        if (options.pilha && logger.groupCollapsed) {
            logger.groupCollapsed(line);
            logger.log?.('payload:', entry.payload);
            logger.trace?.('quem chamou notify:');
            logger.groupEnd?.();
        } else {
            logger.log?.(line);
        }
    };

    const createTracedNotify = (originalNotify) => function tracedNotify(data) {
        if (!active || !matchesFilters(this, data)) return originalNotify.call(this, data);

        const origem = describeSource(this);
        const tipo = data?.tipo ?? '?';
        // Eventos de um __GAAP.passo() contam como tick mesmo fora do run() (ex.: o stop() final).
        const emTick = insideTick || isInsideStep();
        let entry = null;

        if (!emTick || options.incluirTick) {
            sequence += 1;
            entry = {
                n: sequence,
                tick: tickIndex,
                emTick,
                origem,
                tipo,
                resumo: summarizePayload(data),
                ouvintes: this.listeners?.length ?? 0,
                profundidade: depth,
                ms: null,
                payload: data
            };
            entries.push(entry);
            if (entries.length > options.max) entries.shift();
            printLive(entry);
        }

        const start = now();
        depth += 1;
        try {
            return originalNotify.call(this, data);
        } finally {
            depth -= 1;
            const ms = now() - start;
            if (entry) entry.ms = round(ms);
            countEvent(origem, tipo, emTick, ms);
        }
    };

    const createTracedRun = (originalRun) => function tracedRun(timestamp) {
        if (!active) return originalRun.call(this, timestamp);

        if (engine.isRunning) tickIndex += 1;
        insideTick = true;
        try {
            return originalRun.call(this, timestamp);
        } finally {
            insideTick = false;
        }
    };

    const tracer = {
        get ativo() {
            return active;
        },

        start(userOptions = {}) {
            warnUnknownOptions(userOptions, logger);
            options = { ...DEFAULT_OPTIONS, ...userOptions };
            entries = [];
            counts = new Map();
            sequence = 0;
            depth = 0;
            tickIndex = 0;
            insideTick = false;

            if (!active) {
                active = true;
                restoreFns = [wrapMethod(Observable.prototype, 'notify', createTracedNotify)];
                if (engine?.tickPipeline) restoreFns.push(wrapMethod(engine.tickPipeline, 'run', createTracedRun));
            }
            logger.info?.('[GAAP debug] rastreio de eventos ligado.', options);
        },

        stop() {
            if (!active) return tracer.summary();

            active = false;
            restoreFns.forEach((restore) => restore());
            restoreFns = [];

            const total = [...counts.values()].reduce((sum, group) => sum + group.qtd, 0);
            logger.info?.(`[GAAP debug] rastreio desligado. ${total} evento(s), ${entries.length} no buffer.`);
            const summary = tracer.summary();
            logger.table?.(summary);
            return summary;
        },

        entries({ tipo = null, tag = null, ultimos = 50 } = {}) {
            return entries
                .filter((entry) => !tipo || entry.tipo === tipo)
                .filter((entry) => !tag || entry.origem === tag
                    || entry.origem.startsWith(`${tag} (`) || entry.origem.includes(`(${tag})`))
                .slice(-ultimos);
        },

        summary() {
            // Arredonda só na saída: somar valores já arredondados zeraria eventos de < 0,0005 ms.
            return [...counts.values()]
                .map((group) => ({ ...group, msTotal: round(group.msTotal) }))
                .sort((a, b) => b.qtd - a.qtd);
        }
    };

    return tracer;
}
