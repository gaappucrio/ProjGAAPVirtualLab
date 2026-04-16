import {
    BAR_TO_PA,
    DEFAULT_PIPE_DIAMETER_M,
    EPSILON_FLOW,
    areaFromDiameter,
    lpsToM3s,
    m3sToLps
} from '../utils/Units.js';

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value)); // Retorna o valor fornecido entre min e max ou o limite min ou max caso extrapole

const safeLossCoeff = (lossCoeff) => Math.max(0.1, lossCoeff); // Garante que o coeficiente de perda seja razoável para evitar resultados extremos

// Suaviza mudanças bruscas usando um sistema de primeira ordem.
export const smoothFirstOrder = (current, target, dt, timeConstantS) => {
    if (dt <= 0) return target;
    if (!Number.isFinite(timeConstantS) || timeConstantS <= 0.001) return target;
    const alpha = 1 - Math.exp(-dt / timeConstantS);
    return current + ((target - current) * alpha);
};

// Aplica uma rampa linear limitada por tempo total de curso.
export const rampToTarget = (current, target, dt, fullScaleTimeS, fullScaleRange = 100) => {
    if (dt <= 0) return current;
    if (!Number.isFinite(fullScaleTimeS) || fullScaleTimeS <= 0) return target;

    const range = Math.max(Number.EPSILON, Math.abs(fullScaleRange));
    const maxDelta = (range / fullScaleTimeS) * dt;
    const delta = target - current;

    if (Math.abs(delta) <= maxDelta) return target;
    return current + (Math.sign(delta) * maxDelta);
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
        // Limpa todos os listeners para evitar vazamento de memória.
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
        // Remove todas as conexões referentes a este componente.
        this.outputs.forEach(out => this.desconectarSaida(out));
        this.inputs.forEach(inp => inp.desconectarSaida(this));
        this.inputs = [];
        this.outputs = [];
        // Limpa listeners e estado.
        super.destroy();
        this.resetEstadoHidraulico();
    }
}
