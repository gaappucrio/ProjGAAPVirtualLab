const BAR_TO_PA = 100000;
const GRAVITY = 9.81;
const LPS_TO_M3S = 0.001;
const M3S_TO_LPS = 1000;

export const EPSILON_FLOW = 0.0001; // Valor mínimo para considerar fluxo significativo
export const DEFAULT_PIPE_DIAMETER_M = 0.08; // 80mm
export const DEFAULT_PIPE_FRICTION = 0.028; //
export const DEFAULT_PIPE_ROUGHNESS_MM = 0.045;
export const DEFAULT_PIPE_EXTRA_LENGTH_M = 0;
export const DEFAULT_PIPE_MINOR_LOSS = 0.8;
export const DEFAULT_ENTRY_LOSS = 0.35;
export const DEFAULT_FLUID_VISCOSITY_PA_S = 0.00089;
export const DEFAULT_FLUID_VAPOR_PRESSURE_BAR = 0.0317;
export const DEFAULT_ATMOSPHERIC_PRESSURE_BAR = 1.01325;
export const MAX_NETWORK_FLOW_LPS = 500;

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lpsToM3s = (value) => value * LPS_TO_M3S; // Converte litros por segundo para metros cúbicos por segundo
export const m3sToLps = (value) => value * M3S_TO_LPS; // Converte metros cúbicos por segundo para litros por segundo
export const areaFromDiameter = (diameterM) => Math.PI * Math.pow(diameterM / 2, 2); // Calcula a área de um círculo a partir do diâmetro
export const pressureFromHeadBar = (headM, density) => (density * GRAVITY * headM) / BAR_TO_PA; // Converte altura de coluna de fluido para pressão em bar

const safeLossCoeff = (lossCoeff) => Math.max(0.1, lossCoeff); // Garante que o coeficiente de perda seja razoável para evitar resultados extremos

export const smoothFirstOrder = (current, target, dt, timeConstantS) => {
    if (dt <= 0) return target;
    if (!Number.isFinite(timeConstantS) || timeConstantS <= 0.001) return target;
    const alpha = 1 - Math.exp(-dt / timeConstantS);
    return current + ((target - current) * alpha);
};

export function flowFromBernoulli(deltaPBar, areaM2, density, lossCoeff) {
    if (deltaPBar <= 0 || areaM2 <= 0) return 0;
    const velocity = Math.sqrt((2 * deltaPBar * BAR_TO_PA) / (density * safeLossCoeff(lossCoeff)));
    return m3sToLps(areaM2 * velocity);
}

export function pressureLossFromFlow(flowLps, areaM2, density, lossCoeff) {
    if (flowLps <= 0 || areaM2 <= 0) return 0;
    const velocity = lpsToM3s(flowLps) / areaM2;
    return ((density * velocity * velocity * safeLossCoeff(lossCoeff)) / 2) / BAR_TO_PA;
}

export class Observable {
    constructor() {
        this.listeners = [];
    }

    subscribe(fn) {
        this.listeners.push(fn);
    }

    notify(data) {
        this.listeners.forEach(fn => fn(data));
    }

    destroy() {
        // Limpa todos os listeners para evitar vazamento de memória
        this.listeners = [];
    }
}

export class ComponenteFisico extends Observable {
    constructor(id, tag, x, y) {
        super();
        this.id = id;
        this.tag = tag;
        this.x = x;
        this.y = y;
        this.inputs = [];
        this.outputs = [];
        this.diametroConexaoM = DEFAULT_PIPE_DIAMETER_M;
        this.resetEstadoHidraulico();
    }

    resetEstadoHidraulico() {
        this.estadoHidraulico = {
            entradaVazaoLps: 0,
            entradaPressaoPonderadaBar: 0,
            entradaConsumidaLps: 0,
            saidaVazaoLps: 0,
            saidaPressaoPonderadaBar: 0,
            emissaoIntrinsecaConsumida: false
        };
        this.pressaoEntradaAtualBar = 0;
        this.pressaoSaidaAtualBar = 0;
    }

    getAreaConexaoM2() {
        return areaFromDiameter(this.diametroConexaoM);
    }

    getPressaoEntradaBar() {
        if (this.estadoHidraulico.entradaVazaoLps <= EPSILON_FLOW) return 0;
        return this.estadoHidraulico.entradaPressaoPonderadaBar / this.estadoHidraulico.entradaVazaoLps;
    }

    getPressaoSaidaBar() {
        if (this.estadoHidraulico.saidaVazaoLps <= EPSILON_FLOW) return 0;
        return this.estadoHidraulico.saidaPressaoPonderadaBar / this.estadoHidraulico.saidaVazaoLps;
    }

    getFluxoPendenteLps() {
        return Math.max(0, this.estadoHidraulico.entradaVazaoLps - this.estadoHidraulico.entradaConsumidaLps);
    }

    registrarEntrada(flowLps, pressureBar) {
        if (flowLps <= EPSILON_FLOW) return;
        this.estadoHidraulico.entradaVazaoLps += flowLps;
        this.estadoHidraulico.entradaPressaoPonderadaBar += pressureBar * flowLps;
    }

    registrarSaida(flowLps, pressureBar) {
        if (flowLps <= EPSILON_FLOW) return;
        this.estadoHidraulico.saidaVazaoLps += flowLps;
        this.estadoHidraulico.saidaPressaoPonderadaBar += pressureBar * flowLps;
    }

    consumirEntrada(flowLps) {
        if (flowLps <= EPSILON_FLOW) return;
        this.estadoHidraulico.entradaConsumidaLps += flowLps;
    }

    marcarEmissaoIntrinseca() {
        this.estadoHidraulico.emissaoIntrinsecaConsumida = true;
    }

    jaEmitiuIntrinseco() {
        return this.estadoHidraulico.emissaoIntrinsecaConsumida;
    }

    sincronizarMetricasFisicas() {
        this.pressaoEntradaAtualBar = this.getPressaoEntradaBar();
        this.pressaoSaidaAtualBar = this.getPressaoSaidaBar();
    }

    atualizarDinamica() {}

    onSimulationStop() {}

    conectarSaida(destino) {
        if (!this.outputs.includes(destino)) {
            this.outputs.push(destino);
            destino.inputs.push(this);
            this.notify({ tipo: 'conexao', source: this, target: destino });
        }
    }

    desconectarSaida(destino) {
        this.outputs = this.outputs.filter(out => out !== destino);
        destino.inputs = destino.inputs.filter(inp => inp !== this);
    }

    getFluxoSaida() {
        return this.estadoHidraulico.saidaVazaoLps || 0;
    }

    destroy() {
        // Remove todas as conexões referentes a este componente
        this.outputs.forEach(out => this.desconectarSaida(out));
        this.inputs.forEach(inp => inp.desconectarSaida(this));
        this.inputs = [];
        this.outputs = [];
        // Limpa listeners e estado
        super.destroy();
        this.resetEstadoHidraulico();
    }
}

export {
    BAR_TO_PA,
    GRAVITY
};
