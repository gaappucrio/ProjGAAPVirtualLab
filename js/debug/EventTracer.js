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

export function createEventTracer({ engine, logger = console, now = () => globalThis.performance.now() } = {}) {
    let active = false;
    let restoreFns = [];
    let options = { ...DEFAULT_OPTIONS };
    let entries = [];
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
        if (options.tag && observable?.tag !== options.tag && observable?.id !== options.tag) return false;
        return true;
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

        sequence += 1;
        const entry = {
            n: sequence,
            tick: tickIndex,
            emTick: insideTick,
            origem: describeSource(this),
            tipo: data?.tipo ?? '?',
            resumo: summarizePayload(data),
            ouvintes: this.listeners?.length ?? 0,
            profundidade: depth,
            ms: null,
            payload: data
        };
        entries.push(entry);
        if (entries.length > options.max) entries.shift();
        printLive(entry);

        const start = now();
        depth += 1;
        try {
            return originalNotify.call(this, data);
        } finally {
            depth -= 1;
            entry.ms = round(now() - start);
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
            sequence = 0;
            depth = 0;

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

            logger.info?.(`[GAAP debug] rastreio desligado. ${entries.length} evento(s) registrados.`);
            const summary = tracer.summary();
            logger.table?.(summary);
            return summary;
        },

        entries({ tipo = null, tag = null, ultimos = 50 } = {}) {
            return entries
                .filter((entry) => !tipo || entry.tipo === tipo)
                .filter((entry) => !tag || entry.origem.startsWith(`${tag} (`) || entry.origem.includes(`(${tag})`))
                .slice(-ultimos);
        },

        summary() {
            const groups = new Map();
            entries.forEach((entry) => {
                const key = `${entry.origem}|${entry.tipo}`;
                const group = groups.get(key) || { origem: entry.origem, tipo: entry.tipo, qtd: 0, emTick: 0, msTotal: 0 };
                group.qtd += 1;
                if (entry.emTick) group.emTick += 1;
                group.msTotal = round(group.msTotal + (entry.ms || 0));
                groups.set(key, group);
            });
            return [...groups.values()].sort((a, b) => b.qtd - a.qtd);
        }
    };

    return tracer;
}
