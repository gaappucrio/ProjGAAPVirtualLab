function createDefaultDraft() {
    return {
        active: false,
        sourceComponentId: null,
        sourcePortType: null,
        sourceEndpoint: null,
        sourcePoint: null,
        previewPoint: null
    };
}

export class TransientConnectionStore {
    constructor() {
        this.state = createDefaultDraft();
    }

    begin({ sourceComponentId, sourcePortType = 'out', sourceEndpoint, sourcePoint }) {
        this.state = {
            active: true,
            sourceComponentId,
            sourcePortType,
            sourceEndpoint,
            sourcePoint: sourcePoint ? { ...sourcePoint } : null,
            previewPoint: sourcePoint ? { ...sourcePoint } : null
        };

        return this.snapshot();
    }

    updatePreview(previewPoint) {
        if (!this.state.active) return this.snapshot();
        this.state.previewPoint = previewPoint ? { ...previewPoint } : null;
        return this.snapshot();
    }

    cancel() {
        const previous = this.snapshot();
        this.clear();
        return previous;
    }

    clear() {
        this.state = createDefaultDraft();
        return this.snapshot();
    }

    snapshot() {
        return {
            active: this.state.active,
            sourceComponentId: this.state.sourceComponentId,
            sourcePortType: this.state.sourcePortType,
            sourceEndpoint: this.state.sourceEndpoint ? { ...this.state.sourceEndpoint } : null,
            sourcePoint: this.state.sourcePoint ? { ...this.state.sourcePoint } : null,
            previewPoint: this.state.previewPoint ? { ...this.state.previewPoint } : null
        };
    }
}
