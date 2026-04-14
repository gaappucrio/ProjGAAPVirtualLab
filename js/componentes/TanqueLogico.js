// ==================================
// MODELO: Logica e Fisica do Sistema
// Ficheiro: js/componentes/TanqueLogico.js
// ==================================
import { BombaLogica } from './BombaLogica.js';
import { clamp, ComponenteFisico, flowFromBernoulli } from './BaseComponente.js';
import { ValvulaLogica } from './ValvulaLogica.js';
import { ENGINE } from '../MotorFisico.js';
import { pressureFromHeadBar } from '../utils/Units.js';


export class TanqueLogico extends ComponenteFisico {
    constructor(id, tag, x, y) {
        super(id, tag, x, y);
        this.capacidadeMaxima = 1000.0;
        this.volumeAtual = 0;
        this.lastQin = 0;
        this.lastQout = 0;
        this.alturaUtilMetros = 2.4;
        this.coeficienteSaida = 0.82;
        this.perdaEntradaK = 1.0;
        this.alturaBocalEntradaM = 2.2;
        this.alturaBocalSaidaM = 0.1;
        this.volumeInicial = 0;
        this.pressaoFundoBar = 0;
        this.setpointAtivo = false;
        this.setpoint = 50;
        this.kp = 250;
        this.ki = 25;
        this._ctrlIntegral = 0;
        this._lastErro = 0;
        this._valvulasControleNivel = new Set();
    }

    getNivelNormalizado() {
        return this.capacidadeMaxima > 0 ? clamp(this.volumeAtual / this.capacidadeMaxima, 0, 1) : 0;
    }

    getAlturaLiquidoM() {
        return this.getNivelNormalizado() * this.alturaUtilMetros;
    }

    normalizarAlturasBocais() {
        this.alturaBocalEntradaM = clamp(this.alturaBocalEntradaM, 0, this.alturaUtilMetros);
        this.alturaBocalSaidaM = clamp(this.alturaBocalSaidaM, 0, this.alturaUtilMetros);
    }

    getPressaoHidrostaticaBar(fluido) {
        return pressureFromHeadBar(this.getAlturaLiquidoM(), fluido.densidade);
    }

    getPressaoDisponivelSaidaBar(fluido, considerarAlturaBocal = true) {
        this.normalizarAlturasBocais();
        const availableHeadM = considerarAlturaBocal
            ? Math.max(0, this.getAlturaLiquidoM() - this.alturaBocalSaidaM)
            : Math.max(0, this.getAlturaLiquidoM());
        return pressureFromHeadBar(availableHeadM, fluido.densidade);
    }

    getBackPressureAtInletBar(fluido, considerarAlturaBocal = true) {
        this.normalizarAlturasBocais();
        if (!considerarAlturaBocal) return 0;
        const submergedHeightM = Math.max(0, this.getAlturaLiquidoM() - this.alturaBocalEntradaM);
        return pressureFromHeadBar(submergedHeightM, fluido.densidade);
    }

    _coletarAtuadoresDaPerna(componentes) {
        const valvulas = new Set();
        const bombas = new Set();
        const registrar = (componente) => {
            if (componente instanceof ValvulaLogica) valvulas.add(componente);
            else if (componente instanceof BombaLogica) bombas.add(componente);
        };

        componentes.forEach(componente => {
            registrar(componente);

            if (componente instanceof ValvulaLogica || componente instanceof BombaLogica) {
                componente.inputs.forEach(registrar);
                componente.outputs.forEach(registrar);
            }
        });

        return { valvulas, bombas };
    }

    getAtuadoresControleNivel() {
        const entrada = this._coletarAtuadoresDaPerna(this.inputs);
        const saida = this._coletarAtuadoresDaPerna(this.outputs);

        return {
            valvulasEntrada: [...entrada.valvulas],
            valvulasSaida: [...saida.valvulas],
            bombas: [...new Set([...entrada.bombas, ...saida.bombas])]
        };
    }

    isBombaControladaPorSetpoint(bomba) {
        if (!this.setpointAtivo || !(bomba instanceof BombaLogica)) return false;
        return this.getAtuadoresControleNivel().bombas.includes(bomba);
    }

    isValvulaControladaPorSetpoint(valvula) {
        if (!this.setpointAtivo || !(valvula instanceof ValvulaLogica)) return false;
        const atuadores = this.getAtuadoresControleNivel();
        return atuadores.valvulasEntrada.includes(valvula) || atuadores.valvulasSaida.includes(valvula);
    }

    _manterBombasControleLigadas(bombas = this.getAtuadoresControleNivel().bombas) {
        bombas.forEach(bomba => {
            if (bomba.grauAcionamento < 100) bomba.setAcionamento(100);
        });
    }

    _sincronizarValvulasControleNivel(valvulas) {
        const valvulasAtuais = new Set(valvulas);
        this._valvulasControleNivel.forEach(valvula => {
            if (!valvulasAtuais.has(valvula)) valvula.liberarControleNivel(this.id);
        });
        this._valvulasControleNivel = valvulasAtuais;
    }

    _liberarValvulasControleNivel(valvulasExtras = []) {
        const valvulas = new Set([...this._valvulasControleNivel, ...valvulasExtras]);
        valvulas.forEach(valvula => valvula.liberarControleNivel(this.id));
        this._valvulasControleNivel.clear();
    }

    setSetpointAtivo(ativo) {
        const atuadoresAntes = this.getAtuadoresControleNivel();
        this.setpointAtivo = ativo === true;
        this.resetControlador();

        if (this.setpointAtivo) {
            this._manterBombasControleLigadas(atuadoresAntes.bombas);
        } else {
            this._liberarValvulasControleNivel([
                ...atuadoresAntes.valvulasEntrada,
                ...atuadoresAntes.valvulasSaida
            ]);
        }

        this.notify({ tipo: 'sp_update', ativo: this.setpointAtivo });
    }

    _rodarControlador(dt) {
        if (!this.setpointAtivo) return;

        const erro = (this.setpoint / 100) - this.getNivelNormalizado();
        if (this._lastErro !== undefined && (this._lastErro * erro < 0)) this._ctrlIntegral = 0;
        this._lastErro = erro;
        this._ctrlIntegral += erro * dt;

        const clampInt = this.ki > 0 ? 1 / this.ki : 1;
        this._ctrlIntegral = Math.max(-clampInt, Math.min(clampInt, this._ctrlIntegral));

        const u = Math.max(-1, Math.min(1, this.kp * erro + this.ki * this._ctrlIntegral));
        const grauEntrada = Math.max(0, u * 100);
        const grauSaida = Math.max(0, -u * 100);
        const intensidadeEntrada = grauEntrada / 100;
        const intensidadeSaida = grauSaida / 100;
        const atuadores = this.getAtuadoresControleNivel();
        const valvulasControle = [...atuadores.valvulasEntrada, ...atuadores.valvulasSaida];

        this._sincronizarValvulasControleNivel(valvulasControle);
        this._manterBombasControleLigadas(atuadores.bombas);
        atuadores.valvulasEntrada.forEach(valvula => valvula.aplicarControleNivel({
            abertura: grauEntrada,
            intensidade: intensidadeEntrada,
            ownerId: this.id
        }));
        atuadores.valvulasSaida.forEach(valvula => valvula.aplicarControleNivel({
            abertura: grauSaida,
            intensidade: intensidadeSaida,
            ownerId: this.id
        }));

        this.notify({
            tipo: 'ctrl_update',
            grau: u * 100,
            erro,
            grauEntrada,
            grauSaida,
            intensidadeEntrada,
            intensidadeSaida,
            bombasLigadas: atuadores.bombas.length
        });
    }

    resetControlador() {
        this._ctrlIntegral = 0;
        this._lastErro = 0;
    }

    atualizarFisica(dt, fluido) {
        this.normalizarAlturasBocais();
        this.lastQin = this.estadoHidraulico.entradaVazaoLps;
        this.lastQout = this.estadoHidraulico.saidaVazaoLps;
        this.volumeAtual += (this.lastQin - this.lastQout) * dt;
        this.volumeAtual = clamp(this.volumeAtual, 0, this.capacidadeMaxima);
        this.pressaoFundoBar = this.getPressaoHidrostaticaBar(fluido);
        this.sincronizarMetricasFisicas(fluido);

        this.notify({
            tipo: 'volume',
            perc: this.capacidadeMaxima > 0 ? this.volumeAtual / this.capacidadeMaxima : 0,
            abs: this.volumeAtual,
            qIn: this.lastQin,
            qOut: this.lastQout,
            pBottom: this.pressaoFundoBar
        });
    }

    sincronizarMetricasFisicas(fluido) {
        this.normalizarAlturasBocais();
        super.sincronizarMetricasFisicas(fluido);
        this.pressaoFundoBar = this.getPressaoHidrostaticaBar(fluido || ENGINE.fluidoOperante);
    }

    getFluxoSaida() {
        return this.lastQout || 0;
    }

    getFluxoSaidaFromTank(nivelMontante) {
        const headBar = pressureFromHeadBar(
            Math.max(0, (nivelMontante * this.alturaUtilMetros) - this.alturaBocalSaidaM),
            ENGINE.fluidoOperante.densidade
        );
        return flowFromBernoulli(
            headBar,
            this.getAreaConexaoM2(),
            ENGINE.fluidoOperante.densidade,
            1.0 / Math.max(0.15, this.coeficienteSaida * this.coeficienteSaida)
        );
    }

    destroy() {
        const atuadores = this.getAtuadoresControleNivel();
        this._liberarValvulasControleNivel([
            ...atuadores.valvulasEntrada,
            ...atuadores.valvulasSaida
        ]);
        super.destroy();
    }
}
