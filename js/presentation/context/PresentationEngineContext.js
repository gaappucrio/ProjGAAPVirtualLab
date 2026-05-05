let presentationEngine = null;

export function setPresentationEngine(engine) {
    presentationEngine = engine || null;
}

export function getPresentationEngine() {
    if (!presentationEngine) {
        throw new Error('Engine de apresentação não foi injetado. Inicialize a UI pelo App.js.');
    }

    return presentationEngine;
}
