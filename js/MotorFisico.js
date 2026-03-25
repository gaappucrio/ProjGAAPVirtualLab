// ==========================================
// PADRÃO OBSERVER E CLASSES LÓGICAS
// ==========================================
class Observable {
    constructor() { this.listeners = []; }
    subscribe(fn) { this.listeners.push(fn); }
    notify(data) { this.listeners.forEach(fn => fn(data)); }
}

class ComponenteFisico extends Observable {
    constructor(id) { super(); this.id = id; this.inputs = []; this.outputs = []; }
    conectarSaida(d) { this.outputs.push(d); d.inputs.push(this); }
}

class BombaLogica extends ComponenteFisico {
    constructor(id) { super(id); this.isOn = false; this.maxFlow = 45.0; }
    toggle() { this.isOn = !this.isOn; this.notify({ tipo: 'estado', isOn: this.isOn }); }
    getVazao() { return this.isOn ? this.maxFlow : 0; }
}

class ValvulaLogica extends ComponenteFisico {
    constructor(id) { super(id); this.aberta = false; this.k_v = 6.5; }
    toggle() { this.aberta = !this.aberta; this.notify({ tipo: 'estado', aberta: this.aberta }); }
    getVazao(nivelNormalizado) { return (!this.aberta || nivelNormalizado <= 0) ? 0 : this.k_v * Math.sqrt(nivelNormalizado); }
}

class TanqueLogico extends ComponenteFisico {
    constructor(id) { super(id); this.maxVolume = 1000.0; this.volume = 0; }
    dVdt(V) {
        let qIn = 0, qOut = 0;
        this.inputs.forEach(c => { if (c instanceof BombaLogica) qIn += c.getVazao(); });
        const nv = V / this.maxVolume;
        this.outputs.forEach(c => { if (c instanceof ValvulaLogica) qOut += c.getVazao(nv * this.maxVolume); });
        return qIn - qOut;
    }
    atualizarFisica(dt) {
        const k1 = this.dVdt(this.volume), k2 = this.dVdt(this.volume + 0.5 * k1 * dt), k3 = this.dVdt(this.volume + 0.5 * k2 * dt), k4 = this.dVdt(this.volume + k3 * dt);
        this.volume += (1 / 6) * (k1 + 2 * k2 + 2 * k3 + k4) * dt;
        if (this.volume < 0) this.volume = 0; if (this.volume > this.maxVolume) this.volume = this.maxVolume;
        this.notify({ tipo: 'volume', perc: this.volume / this.maxVolume });
    }
}

class MotorSimulacao {
    constructor() { this.componentes = []; this.lastTime = 0; this.isRunning = false; }
    add(comp) { this.componentes.push(comp); }
    clear() { this.componentes = []; this.isRunning = false; }
    start() { this.isRunning = true; this.lastTime = performance.now(); requestAnimationFrame(this.tick.bind(this)); }
    tick(timestamp) {
        if (!this.isRunning) return;
        let dt = (timestamp - this.lastTime) / 1000.0; this.lastTime = timestamp; if (dt > 0.1) dt = 0.1;
        this.componentes.forEach(c => { if (c instanceof TanqueLogico) c.atualizarFisica(dt); });
        requestAnimationFrame(this.tick.bind(this));
    }
}

// Instância global do motor
const ENGINE = new MotorSimulacao();