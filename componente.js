// ==========================================
// FASE 2: MOTOR LÓGICO ORIENTADO A OBJETOS
// ==========================================

// 1. CLASSE BASE: Todos os equipamentos herdam daqui
class Componente {
    constructor(id, x, y) {
        this.id = id;       // Ex: "tank-1"
        this.x = x;         // Posição no Grid (ex: 120)
        this.y = y;
        this.inputs = [];   // O que está conectado na entrada
        this.outputs = [];  // O que está conectado na saída
    }

    // Método genérico para conectar tubos
    conectarSaida(componenteDestino) {
        this.outputs.push(componenteDestino);
        componenteDestino.inputs.push(this);
    }
}

// 2. CLASSE BOMBA (Geradora de Fluxo)
class Bomba extends Componente {
    constructor(id, x, y, maxFlow = 45.0) {
        super(id, x, y);
        this.maxFlow = maxFlow;
        this.isOn = false;
        this.intensity = 0; // 0 a 100%
    }

    // Calcula quanto de água está saindo da bomba neste instante
    getVazaoSaida() {
        if (!this.isOn) return 0;
        return (this.intensity / 100.0) * this.maxFlow;
    }
}

// 3. CLASSE VÁLVULA (Restritora de Fluxo)
class Valvula extends Componente {
    constructor(id, x, y, k_v = 6.5) {
        super(id, x, y);
        this.k_v = k_v;
        this.abertura = 0; // 0 a 100%
    }

    // A válvula não gera água, ela calcula o fluxo baseado na pressão (Nível) de quem está antes dela
    getVazaoSaida(nivelMontante) {
        if (this.abertura === 0 || nivelMontante <= 0) return 0;
        return (this.abertura / 100.0) * this.k_v * Math.sqrt(nivelMontante);
    }
}

// 4. CLASSE TANQUE (Acumulador - Onde a mágica do RK4 acontece)
class Tanque extends Componente {
    constructor(id, x, y, maxVolume = 1000.0) {
        super(id, x, y);
        this.maxVolume = maxVolume;
        this.volume = 0; // Estado inicial
    }

    // Calcula o dV/dt baseado nas conexões reais do usuário!
    dVdt() {
        let qIn = 0;
        let qOut = 0;

        // 1. Soma tudo que está entrando (Puxa das Bombas conectadas)
        this.inputs.forEach(comp => {
            if (comp instanceof Bomba) {
                qIn += comp.getVazaoSaida();
            }
        });

        // 2. Soma tudo que está saindo (Empurra para Válvulas conectadas)
        const nivelNormalizado = this.volume / this.maxVolume;
        this.outputs.forEach(comp => {
            if (comp instanceof Valvula) {
                qOut += comp.getVazaoSaida(nivelNormalizado * this.maxVolume);
            }
        });

        return { net: qIn - qOut, qIn: qIn, qOut: qOut };
    }

    // O Runge-Kutta agora é um método interno do Tanque
    atualizarFisica(dt) {
        const V0 = this.volume;

        const k1 = this.dVdt(V0).net;
        const k2 = this.dVdt(V0 + 0.5 * k1 * dt).net;
        const k3 = this.dVdt(V0 + 0.5 * k2 * dt).net;
        const k4 = this.dVdt(V0 + k3 * dt).net;

        let novoVolume = V0 + (1/6) * (k1 + 2*k2 + 2*k3 + k4) * dt;

        // Limites físicos
        if (novoVolume < 0) novoVolume = 0;
        if (novoVolume > this.maxVolume) novoVolume = this.maxVolume;

        this.volume = novoVolume;
    }
}

// 5. O MOTOR DA SIMULAÇÃO (Gerenciador da Rede)
class SimulationEngine {
    constructor() {
        this.componentes = [];
        this.lastTime = 0;
        this.isRunning = false;
    }

    adicionarComponente(comp) {
        this.componentes.push(comp);
    }

    // Loop principal (o antigo requestAnimationFrame)
    tick(timestamp) {
        if (!this.lastTime) this.lastTime = timestamp;
        let dt = (timestamp - this.lastTime) / 1000.0;
        this.lastTime = timestamp;
        if (dt > 0.1) dt = 0.1;

        if (this.isRunning) {
            // Atualiza a física de todos os tanques na tela
            this.componentes.forEach(comp => {
                if (comp instanceof Tanque) {
                    comp.atualizarFisica(dt);
                }
            });
        }
        // requestAnimationFrame(this.tick.bind(this)); // Chama o próximo frame
    }
}