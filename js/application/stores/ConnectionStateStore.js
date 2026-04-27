export class ConnectionStateStore {
    constructor() {
        this.states = new Map();
    }

    clear() {
        this.states.clear();
    }

    has(connection) {
        return this.states.has(connection);
    }

    get(connection) {
        return this.states.get(connection);
    }

    set(connection, state) {
        this.states.set(connection, state);
        return state;
    }

    getOrCreate(connection, factory) {
        if (!this.states.has(connection)) {
            this.states.set(connection, factory(connection));
        }

        return this.states.get(connection);
    }
}
