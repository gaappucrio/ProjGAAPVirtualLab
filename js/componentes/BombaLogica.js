import { clamp, ComponenteFisico, rampToTarget } from './BaseComponente.js';
import { ENGINE } from '../MotorFisico.js';
import { EPSILON_FLOW } from '../utils/Units.js';


export class BombaLogica extends ComponenteFisico {
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.isOn = false;
        this.vazaoNominal = 45.0;
        this.grauAcionamento = 0;
        this.acionamentoEfetivo = 0;
        this.pressaoMaxima = 5.0;
        this.eficienciaHidraulica = 0.78;
        this.eficienciaAtual = this.eficienciaHidraulica;
        this.npshRequeridoM = 2.5;
        this.npshRequeridoAtualM = this.npshRequeridoM;
        this.npshDisponivelM = 0;
        this.margemNpshM = 0;
        this.fatorCavitacaoAtual = 1;
        this.tempoRampaSegundos = 1.6;
        this.fracaoMelhorEficiencia = 0.72;
        this.fluxoReal = 0;
        this.pressaoSucaoAtualBar = 0;
        this.pressaoDescargaAtualBar = 0;
        this.cargaGeradaBar = 0;
    }

    calcularFatorCavitacao(npshDisponivelM, npshRequeridoM = this.npshRequeridoAtualM ?? this.npshRequeridoM) {
        const npshRequeridoSeguroM = Math.max(0.05, npshRequeridoM);
        if (npshDisponivelM >= npshRequeridoSeguroM) return 1;
        return clamp(Math.pow(npshDisponivelM / npshRequeridoSeguroM, 1.7), 0.12, 1);
    }

    toggle() {
        this.setAcionamento(this.grauAcionamento > 0 ? 0 : 100);
    }

    getDriveAtual() {
        return clamp(this.acionamentoEfetivo / 100.0, 0, 1);
    }

    getCurvaPressaoBar(flowLps, drive = 1) {
        const driveClamped = clamp(drive, 0, 1);
        const qMax = Math.max(EPSILON_FLOW, this.vazaoNominal * Math.max(driveClamped, 0.05));
        const curveFrac = 1 - Math.pow(clamp(flowLps / qMax, 0, 1), 2);
        return this.pressaoMaxima * driveClamped * driveClamped * Math.max(0, curveFrac);
    }

    getEficienciaInstantanea(flowLps = this.fluxoReal) {
        const drive = this.getDriveAtual();
        const qMax = this.vazaoNominal * drive;
        if (qMax <= EPSILON_FLOW) return Math.max(0.2, this.eficienciaHidraulica * 0.6);

        const qBep = Math.max(EPSILON_FLOW, qMax * this.fracaoMelhorEficiencia);
        const deviation = (flowLps - qBep) / qBep;
        const efficiencyShape = 1 - (0.32 * deviation * deviation);
        return clamp(this.eficienciaHidraulica * efficiencyShape, 0.22, this.eficienciaHidraulica);
    }

    getCurvaEficiencia(flowLps, drive = 1) {
        const driveClamped = clamp(drive, 0, 1);
        const qMax = Math.max(EPSILON_FLOW, this.vazaoNominal * Math.max(driveClamped, 0.05));
        const qBep = Math.max(EPSILON_FLOW, qMax * this.fracaoMelhorEficiencia);
        const deviation = (flowLps - qBep) / qBep;
        const efficiencyShape = 1 - (0.32 * deviation * deviation);
        return clamp(this.eficienciaHidraulica * efficiencyShape, 0.18, this.eficienciaHidraulica);
    }

    getCurvaNpshRequeridoM(flowLps, drive = 1) {
        const driveClamped = clamp(drive, 0, 1);
        const qMax = Math.max(EPSILON_FLOW, this.vazaoNominal * Math.max(driveClamped, 0.05));
        const normalizedFlow = clamp(flowLps / qMax, 0, 1);
        const ratio = 0.42 + (0.58 * Math.pow(normalizedFlow, 1.8));
        const speedFactor = Math.max(0.05, driveClamped * driveClamped);
        return Math.max(0.02, this.npshRequeridoM * speedFactor * ratio);
    }

    getMargemNpshAtualM() {
        return this.margemNpshM;
    }

    getCondicaoSucaoAtual() {
        if (this.getDriveAtual() <= 0.01 && Math.abs(this.fluxoReal) <= EPSILON_FLOW) {
            return 'Sem bombeamento';
        }
        if (this.margemNpshM < 0) return 'Risco de cavitação';
        if (this.margemNpshM < 0.5) return 'No limite';
        return 'Com folga';
    }

    setAcionamento(valor) {
        const comandoSolicitado = clamp(Number(valor) || 0, 0, 100);
        const bloqueadaPorSetpoint = ENGINE.isBombaBloqueadaPorSetpoint?.(this) === true;

        this.grauAcionamento = bloqueadaPorSetpoint ? 100 : comandoSolicitado;
        if (!ENGINE.isRunning) this.acionamentoEfetivo = 0;
        this.isOn = ENGINE.isRunning && this.acionamentoEfetivo > 0.5;
        this.notify({
            tipo: 'estado',
            isOn: this.isOn,
            grau: this.grauAcionamento,
            grauEfetivo: this.acionamentoEfetivo,
            bloqueadaPorSetpoint
        });
    }

    atualizarDinamica(dt) {
        const previousDrive = this.acionamentoEfetivo;
        this.acionamentoEfetivo = rampToTarget(previousDrive, this.grauAcionamento, dt, this.tempoRampaSegundos);
        this.isOn = this.acionamentoEfetivo > 0.5;

        if (Math.abs(this.acionamentoEfetivo - previousDrive) > 0.05) {
            this.notify({
                tipo: 'estado',
                isOn: this.isOn,
                grau: this.grauAcionamento,
                grauEfetivo: this.acionamentoEfetivo,
                bloqueadaPorSetpoint: ENGINE.isBombaBloqueadaPorSetpoint?.(this) === true
            });
        }
    }

    onSimulationStop() {
        this.acionamentoEfetivo = 0;
        this.isOn = false;
        this.fluxoReal = 0;
        this.pressaoSucaoAtualBar = 0;
        this.pressaoDescargaAtualBar = 0;
        this.cargaGeradaBar = 0;
        this.npshRequeridoAtualM = this.npshRequeridoM;
        this.npshDisponivelM = 0;
        this.margemNpshM = 0;
        this.fatorCavitacaoAtual = 1;
        this.notify({
            tipo: 'estado',
            isOn: false,
            grau: this.grauAcionamento,
            grauEfetivo: 0,
            bloqueadaPorSetpoint: ENGINE.isBombaBloqueadaPorSetpoint?.(this) === true
        });
    }

    sincronizarMetricasFisicas() {
        super.sincronizarMetricasFisicas();
        this.fluxoReal = this.estadoHidraulico.saidaVazaoLps;
        this.pressaoSucaoAtualBar = this.getPressaoEntradaBar();
        const drive = this.getDriveAtual();
        const qMax = this.vazaoNominal * drive;
        const curveFrac = qMax > EPSILON_FLOW ? 1 - Math.pow(clamp(this.fluxoReal / qMax, 0, 1), 2) : 0;
        this.eficienciaAtual = this.getEficienciaInstantanea(this.fluxoReal);
        this.npshRequeridoAtualM = this.getCurvaNpshRequeridoM(this.fluxoReal, drive);
        this.margemNpshM = this.npshDisponivelM - this.npshRequeridoAtualM;
        this.cargaGeradaBar = drive > 0 ? this.pressaoMaxima * drive * drive * Math.max(0.05, curveFrac) * this.fatorCavitacaoAtual : 0;
        this.pressaoDescargaAtualBar = this.pressaoSucaoAtualBar + this.cargaGeradaBar;
        this.pressaoSaidaAtualBar = this.pressaoDescargaAtualBar;
    }

    getFluxoSaidaFromTank() {
        return this.fluxoReal;
    }
}
