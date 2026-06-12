import { getPipeMonitorEntryIds, isPipeMonitorEntry } from './PipeMonitorGrouping.js';

export function createMonitorSlotHistory({ maxEntries = 2, onRemove = () => {} } = {}) {
    const entries = Array.from({ length: maxEntries }, () => null);

    function getEntryIds(entry) {
        return isPipeMonitorEntry(entry)
            ? getPipeMonitorEntryIds(entry)
            : [entry?.id].filter(Boolean);
    }

    function makePipeGroupId(ids) {
        return `pipe-group:${ids.join('|')}`;
    }

    function normalizeEntry(entry) {
        if (entry?.kind === 'pipeGroup') {
            const ids = [...new Set(getEntryIds(entry))];
            return ids.length > 0
                ? { id: makePipeGroupId(ids), kind: 'pipeGroup', ids }
                : null;
        }

        if (!entry?.id || !entry?.kind) return null;
        return { id: entry.id, kind: entry.kind };
    }

    function findEntryMatchIndex(entry) {
        return entries.findIndex((candidate) => {
            if (!candidate) return false;
            return candidate.kind === entry.kind && candidate.id === entry.id;
        });
    }

    function snapshot() {
        return entries.map((entry) => entry
            ? {
                ...entry,
                ...(Array.isArray(entry.ids) ? { ids: [...entry.ids] } : {})
            }
            : null);
    }

    function remember(entry) {
        const normalizedEntry = normalizeEntry(entry);
        if (!normalizedEntry) {
            return { changed: false, entries: snapshot() };
        }

        const existingIndex = findEntryMatchIndex(normalizedEntry);
        if (existingIndex >= 0) {
            return { changed: false, entries: snapshot() };
        }

        const emptyIndex = entries.findIndex((candidate) => !candidate);
        if (emptyIndex < 0) {
            return { changed: false, entries: snapshot() };
        }

        entries[emptyIndex] = normalizedEntry;
        return { changed: true, entries: snapshot() };
    }

    function swapAt(sourceIndex, targetIndex) {
        const source = Number(sourceIndex);
        const target = Number(targetIndex);
        if (
            !Number.isInteger(source)
            || !Number.isInteger(target)
            || source < 0
            || target < 0
            || source >= entries.length
            || target >= entries.length
            || !entries[source]
            || !entries[target]
            || source === target
        ) {
            return { changed: false, entries: snapshot() };
        }

        [entries[source], entries[target]] = [entries[target], entries[source]];
        return { changed: true, entries: snapshot() };
    }

    function canMergeAsPipeGroup(sourceEntry, targetEntry) {
        return isPipeMonitorEntry(sourceEntry) && isPipeMonitorEntry(targetEntry);
    }

    function mergePipesAt(sourceIndex, targetIndex) {
        const source = Number(sourceIndex);
        const target = Number(targetIndex);
        if (
            !Number.isInteger(source)
            || !Number.isInteger(target)
            || source < 0
            || target < 0
            || source >= entries.length
            || target >= entries.length
            || source === target
            || !canMergeAsPipeGroup(entries[source], entries[target])
        ) {
            return { changed: false, entries: snapshot() };
        }

        const ids = [...new Set([
            ...getEntryIds(entries[target]),
            ...getEntryIds(entries[source])
        ])];
        const mergedEntry = {
            id: makePipeGroupId(ids),
            kind: 'pipeGroup',
            ids
        };

        entries[target] = mergedEntry;
        entries[source] = null;

        return { changed: true, entries: snapshot() };
    }

    function prune(isValidEntry) {
        let changed = false;
        for (let index = entries.length - 1; index >= 0; index -= 1) {
            if (!entries[index]) continue;
            if (isValidEntry(entries[index])) continue;

            onRemove(entries[index]);
            entries[index] = null;
            changed = true;
        }

        return { changed, entries: snapshot() };
    }

    function removeAt(index) {
        const numericIndex = Number(index);
        if (!Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= entries.length) {
            return { changed: false, entries: snapshot() };
        }

        const removedEntry = entries[numericIndex];
        if (!removedEntry) {
            return { changed: false, entries: snapshot() };
        }

        entries[numericIndex] = null;
        onRemove(removedEntry);

        return { changed: true, entries: snapshot() };
    }

    function getEntries() {
        return snapshot();
    }

    return {
        remember,
        swapAt,
        mergePipesAt,
        prune,
        removeAt,
        getEntries
    };
}
