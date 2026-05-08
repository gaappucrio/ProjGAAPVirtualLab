export class SelectionStore {
    constructor() {
        this.selectedComponent = null;
        this.selectedConnection = null;
        this.selectedComponents = new Set();
    }

    selectComponent(component) {
        this.selectedComponent = component || null;
        this.selectedConnection = null;
        this.selectedComponents.clear();
        if (component) this.selectedComponents.add(component);
    }

    selectComponents(components = []) {
        const normalized = components.filter(Boolean);
        this.selectedComponents = new Set(normalized);
        this.selectedComponent = normalized.length === 1 ? normalized[0] : null;
        this.selectedConnection = null;
    }

    toggleComponent(component) {
        if (!component) return;
        this.selectedConnection = null;

        if (this.selectedComponents.has(component)) {
            this.selectedComponents.delete(component);
        } else {
            this.selectedComponents.add(component);
        }

        const selectedList = [...this.selectedComponents];
        this.selectedComponent = selectedList.length === 1 ? selectedList[0] : null;
    }

    selectConnection(connection) {
        this.selectedComponent = null;
        this.selectedConnection = connection || null;
        this.selectedComponents.clear();
    }

    clear() {
        this.selectedComponent = null;
        this.selectedConnection = null;
        this.selectedComponents.clear();
    }
}
