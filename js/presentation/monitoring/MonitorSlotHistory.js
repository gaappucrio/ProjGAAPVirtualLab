import { getPipeMonitorEntryIds, isPipeMonitorEntry } from './PipeMonitorGrouping.js';

export function createMonitorSlotHistory({ maxEntries = 2, onRemove = () => {} } = {}) {
    const entries = [];

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

    function hasEntry(entry) {
        const ids = getEntryIds(entry);
        return entries.some((candidate) => {
            if (candidate.kind === 'pipeGroup' && entry.kind === 'pipe') {
                return getEntryIds(candidate).includes(entry.id);
            }

            if (entry.kind === 'pipeGroup' && candidate.kind === 'pipe') {
                return ids.includes(candidate.id);
            }

            return candidate.id === entry.id;
        });
    }

    function snapshot() {
        return entries.map((entry) => ({
            ...entry,
            ...(Array.isArray(entry.ids) ? { ids: [...entry.ids] } : {})
        }));
    }

    function remember(entry) {
        const normalizedEntry = normalizeEntry(entry);
        if (!normalizedEntry) {
            return { changed: false, entries: snapshot() };
        }

        if (hasEntry(normalizedEntry)) {
            return { changed: false, entries: snapshot() };
        }

        entries.push(normalizedEntry);

        while (entries.length > maxEntries) {
            onRemove(entries.shift());
        }

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
        const targetAfterRemoval = source < target ? target - 1 : target;

        entries.splice(source, 1);
        entries[targetAfterRemoval] = mergedEntry;

        return { changed: true, entries: snapshot() };
    }

    function prune(isValidEntry) {
        let changed = false;
        for (let index = entries.length - 1; index >= 0; index -= 1) {
            if (isValidEntry(entries[index])) continue;

            onRemove(entries[index]);
            entries.splice(index, 1);
            changed = true;
        }

        return { changed, entries: snapshot() };
    }

    function removeAt(index) {
        const numericIndex = Number(index);
        if (!Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= entries.length) {
            return { changed: false, entries: snapshot() };
        }

        const [removedEntry] = entries.splice(numericIndex, 1);
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
