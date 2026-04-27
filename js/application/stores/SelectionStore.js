export class SelectionStore {
    constructor() {
        this.selectedComponent = null;
        this.selectedConnection = null;
    }

    selectComponent(component) {
        this.selectedComponent = component || null;
        this.selectedConnection = null;
    }

    selectConnection(connection) {
        this.selectedComponent = null;
        this.selectedConnection = connection || null;
    }

    clear() {
        this.selectedComponent = null;
        this.selectedConnection = null;
    }
}
