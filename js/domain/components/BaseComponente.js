import {
    BAR_TO_PA,
    DEFAULT_PIPE_DIAMETER_M,
    EPSILON_FLOW,
    areaFromDiameter,
    lpsToM3s,
    m3sToLps
} from '../units/HydraulicUnits.js';
import { ComponentEventPayloads } from '../events/ComponentEventPayloads.js';
import { mergeSimulationContext } from '../context/SimulationContext.js';
import { mixFluidos } from './Fluido.js';

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const MIN_SOLVER_LOSS_COEFF = 0.1;

const positiveDensity = (density) => {
    const numericDensity = Number(density);
    return Number.isFinite(numericDensity) && numericDensity > 0 ? numericDensity : null;
};

const nonNegativeLossCoeff = (lossCoeff) => {
    const numericLossCoeff = Number(lossCoeff);
    return Number.isFinite(numericLossCoeff) ? Math.max(0, numericLossCoeff) : 0;
};

const solverLossCoeff = (lossCoeff) => Math.max(MIN_SOLVER_LOSS_COEFF, nonNegativeLossCoeff(lossCoeff));

export const smoothFirstOrder = (current, target, dt, timeConstantS) => {
    if (dt <= 0) return current;
    if (!Number.isFinite(timeConstantS) || timeConstantS <= 0.001) return target;
    const alpha = 1 - Math.exp(-dt / timeConstantS);
    return current + ((target - current) * alpha);
};

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
    const safeDensity = positiveDensity(density);
    if (deltaPBar <= 0 || areaM2 <= 0 || !safeDensity) return 0;
    const velocity = Math.sqrt((2 * deltaPBar * BAR_TO_PA) / (safeDensity * solverLossCoeff(lossCoeff)));
    return m3sToLps(areaM2 * velocity);
}

export function pressureLossFromFlow(flowLps, areaM2, density, lossCoeff) {
    const safeDensity = positiveDensity(density);
    const safeLossCoeff = nonNegativeLossCoeff(lossCoeff);
    if (flowLps <= 0 || areaM2 <= 0 || !safeDensity || safeLossCoeff <= 0) return 0;
    const velocity = lpsToM3s(flowLps) / areaM2;
    return ((safeDensity * velocity * velocity * safeLossCoeff) / 2) / BAR_TO_PA;
}

export class Observable {
    constructor() {
        this.listeners = [];
    }

    subscribe(fn) {
        this.listeners.push(fn);
        return () => this.unsubscribe(fn);
    }

    unsubscribe(fn) {
        this.listeners = this.listeners.filter((listener) => listener !== fn);
    }

    notify(data) {
        [...this.listeners].forEach((fn) => fn(data));
    }

    destroy() {
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
        this.rotacaoVisualGraus = 0;
        this.inputs = [];
        this.outputs = [];
        this.diametroConexaoM = DEFAULT_PIPE_DIAMETER_M;
        this._simulationContextProvider = null;
        this.resetEstadoHidraulico();
    }

    setSimulationContextProvider(provider) {
        this._simulationContextProvider = typeof provider === 'function' ? provider : null;
    }

    clearSimulationContextProvider() {
        this._simulationContextProvider = null;
    }

    getSimulationContext(overrides = {}) {
        const baseContext = this._simulationContextProvider ? this._simulationContextProvider() : {};
        return mergeSimulationContext(baseContext, overrides);
    }

    resetEstadoHidraulico() {
        this.estadoHidraulico = {
            entradaVazaoLps: 0,
            entradaPressaoPonderadaBar: 0,
            entradaFluidoContribuicoes: [],
            entradaConsumidaLps: 0,
            saidaVazaoLps: 0,
            saidaPressaoPonderadaBar: 0,
            saidaFluidoContribuicoes: [],
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

    registrarEntrada(flowLps, pressureBar, fluido = null, portId = null) {
        if (flowLps <= EPSILON_FLOW) return;
        this.estadoHidraulico.entradaVazaoLps += flowLps;
        this.estadoHidraulico.entradaPressaoPonderadaBar += pressureBar * flowLps;
        this.estadoHidraulico.entradaFluidoContribuicoes.push({
            flowLps,
            pressureBar,
            fluido,
            portId
        });
    }

    registrarSaida(flowLps, pressureBar, fluido = null, portId = null) {
        if (flowLps <= EPSILON_FLOW) return;
        this.estadoHidraulico.saidaVazaoLps += flowLps;
        this.estadoHidraulico.saidaPressaoPonderadaBar += pressureBar * flowLps;
        this.estadoHidraulico.saidaFluidoContribuicoes.push({
            flowLps,
            pressureBar,
            fluido,
            portId
        });
    }

    consumirEntrada(flowLps) {
        if (flowLps <= EPSILON_FLOW) return;
        this.estadoHidraulico.entradaConsumidaLps += flowLps;
    }

    getFluidoEntradaMisturado(fallback = null) {
        return mixFluidos(this.estadoHidraulico.entradaFluidoContribuicoes, fallback);
    }

    getFluidoEntradaMisturadoPorPorta(portId, fallback = null) {
        if (!portId) return this.getFluidoEntradaMisturado(fallback);
        const targetStream = (portId === 'in2' || portId === 'out2' || portId === '2') ? 2 : 1;
        const isMatch = (c) => {
            const cStream = (c.portId === 'in2' || c.portId === 'out2' || c.portId === '2') ? 2 : 1;
            return cStream === targetStream;
        };
        const contribuicoes = this.estadoHidraulico.entradaFluidoContribuicoes.filter(isMatch);
        if (contribuicoes.length === 0) return fallback;
        return mixFluidos(contribuicoes, fallback);
    }

    getVazaoEntradaPorPorta(portId) {
        if (!portId) return this.estadoHidraulico.entradaVazaoLps;
        const targetStream = (portId === 'in2' || portId === 'out2' || portId === '2') ? 2 : 1;
        const isMatch = (c) => {
            const cStream = (c.portId === 'in2' || c.portId === 'out2' || c.portId === '2') ? 2 : 1;
            return cStream === targetStream;
        };
        return this.estadoHidraulico.entradaFluidoContribuicoes
            .filter(isMatch)
            .reduce((acc, c) => acc + c.flowLps, 0);
    }

    getVazaoSaidaPorPorta(portId) {
        if (!portId) return this.estadoHidraulico.saidaVazaoLps;
        const targetStream = (portId === 'in2' || portId === 'out2' || portId === '2') ? 2 : 1;
        const isMatch = (c) => {
            const cStream = (c.portId === 'in2' || c.portId === 'out2' || c.portId === '2') ? 2 : 1;
            return cStream === targetStream;
        };
        return this.estadoHidraulico.saidaFluidoContribuicoes
            .filter(isMatch)
            .reduce((acc, c) => acc + c.flowLps, 0);
    }

    getPressaoEntradaPortaBar(portId) {
        if (!portId) return this.getPressaoEntradaBar();
        const targetStream = (portId === 'in2' || portId === 'out2' || portId === '2') ? 2 : 1;
        const isMatch = (c) => {
            const cStream = (c.portId === 'in2' || c.portId === 'out2' || c.portId === '2') ? 2 : 1;
            return cStream === targetStream;
        };
        const matches = this.estadoHidraulico.entradaFluidoContribuicoes.filter(isMatch);
        const totalFlow = matches.reduce((acc, c) => acc + c.flowLps, 0);
        if (totalFlow <= EPSILON_FLOW) return 0;
        const weightedPressure = matches.reduce((acc, c) => acc + (Number(c.pressureBar) || 0) * c.flowLps, 0) / totalFlow;
        return Number.isFinite(weightedPressure) && weightedPressure > 0 ? weightedPressure : 0;
    }

    getPressaoSaidaPortaBar(portId) {
        if (!portId) return this.getPressaoSaidaBar();
        const targetStream = (portId === 'in2' || portId === 'out2' || portId === '2') ? 2 : 1;
        const isMatch = (c) => {
            const cStream = (c.portId === 'in2' || c.portId === 'out2' || c.portId === '2') ? 2 : 1;
            return cStream === targetStream;
        };
        const matches = this.estadoHidraulico.saidaFluidoContribuicoes.filter(isMatch);
        const totalFlow = matches.reduce((acc, c) => acc + c.flowLps, 0);
        if (totalFlow <= EPSILON_FLOW) return 0;
        const weightedPressure = matches.reduce((acc, c) => acc + (Number(c.pressureBar) || 0) * c.flowLps, 0) / totalFlow;
        return Number.isFinite(weightedPressure) && weightedPressure > 0 ? weightedPressure : 0;
    }

    resetEstadoHidraulicoStream(streamId = 1) {
        const targetStream = Number(streamId) === 2 ? 2 : 1;
        const isMatch = (c) => {
            const cStream = (c.portId === 'in2' || c.portId === 'out2' || c.portId === '2') ? 2 : 1;
            return cStream === targetStream;
        };

        this.estadoHidraulico.entradaFluidoContribuicoes = this.estadoHidraulico.entradaFluidoContribuicoes.filter((c) => !isMatch(c));
        this.estadoHidraulico.saidaFluidoContribuicoes = this.estadoHidraulico.saidaFluidoContribuicoes.filter((c) => !isMatch(c));

        this.estadoHidraulico.entradaVazaoLps = this.estadoHidraulico.entradaFluidoContribuicoes.reduce((acc, c) => acc + c.flowLps, 0);
        this.estadoHidraulico.entradaPressaoPonderadaBar = this.estadoHidraulico.entradaFluidoContribuicoes.reduce((acc, c) => acc + (Number(c.pressureBar) || 0) * c.flowLps, 0);
        this.estadoHidraulico.saidaVazaoLps = this.estadoHidraulico.saidaFluidoContribuicoes.reduce((acc, c) => acc + c.flowLps, 0);
        this.estadoHidraulico.saidaPressaoPonderadaBar = this.estadoHidraulico.saidaFluidoContribuicoes.reduce((acc, c) => acc + (Number(c.pressureBar) || 0) * c.flowLps, 0);
    }

    getFluidoSaidaMisturado(fallback = null) {
        return mixFluidos(this.estadoHidraulico.saidaFluidoContribuicoes, fallback);
    }

    getFluidoSaidaMisturadoPorPorta(portId, fallback = null) {
        if (!portId) return this.getFluidoSaidaMisturado(fallback);
        const targetStream = (portId === 'in2' || portId === 'out2' || portId === '2') ? 2 : 1;
        const isMatch = (c) => {
            const cStream = (c.portId === 'in2' || c.portId === 'out2' || c.portId === '2') ? 2 : 1;
            return cStream === targetStream;
        };
        const contribuicoes = this.estadoHidraulico.saidaFluidoContribuicoes.filter(isMatch);
        if (contribuicoes.length === 0) return fallback;
        return mixFluidos(contribuicoes, fallback);
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
            this.notify(ComponentEventPayloads.connection(this, destino));
        }
    }

    desconectarSaida(destino) {
        this.outputs = this.outputs.filter((out) => out !== destino);
        destino.inputs = destino.inputs.filter((inp) => inp !== this);
    }

    getFluxoSaida() {
        return this.estadoHidraulico.saidaVazaoLps || 0;
    }

    destroy() {
        this.outputs.forEach((out) => this.desconectarSaida(out));
        this.inputs.forEach((inp) => inp.desconectarSaida(this));
        this.inputs = [];
        this.outputs = [];
        this.clearSimulationContextProvider();
        super.destroy();
        this.resetEstadoHidraulico();
    }
}
