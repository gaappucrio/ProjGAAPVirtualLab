export function createMonitorSlotHistory({ maxEntries = 2, onRemove = () => {} } = {}) {
    const entries = [];

    function snapshot() {
        return entries.map((entry) => ({ ...entry }));
    }

    function remember(entry) {
        if (!entry?.id || !entry?.kind) {
            return { changed: false, entries: snapshot() };
        }

        const existingIndex = entries.findIndex((candidate) => candidate.id === entry.id);
        if (existingIndex >= 0) {
            return { changed: false, entries: snapshot() };
        }

        entries.push({ id: entry.id, kind: entry.kind });

        while (entries.length > maxEntries) {
            onRemove(entries.shift());
        }

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

    function getEntries() {
        return snapshot();
    }

    return {
        remember,
        prune,
        getEntries
    };
}
