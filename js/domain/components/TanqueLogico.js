import { BombaLogica } from './BombaLogica.js';
import { clamp, ComponenteFisico, flowFromBernoulli } from './BaseComponente.js';
import { ComponentEventPayloads } from '../../application/events/EventPayloads.js';
import { FonteLogica } from './FonteLogica.js';
import { ValvulaLogica } from './ValvulaLogica.js';
import { EPSILON_FLOW, pressureFromHeadBar } from '../../utils/Units.js';

const TOLERANCIA_ERRO_SATURACAO = -0.02;
const FATOR_EXCESSO_ENTRADA = 1.02;
const U_SAIDA_TOTALMENTE_ABERTA = -0.99;

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
        this.alertaSaturacao = null;
        this._ctrlIntegral = 0;
        this._lastErro = 0;
        this._ultimoEstadoControle = { u: 0, erro: 0 };
        this._valvulasControleNivel = new Set();
    }

    getNivelNormalizado() {
        return this.capacidadeMaxima > 0 ? clamp(this.volumeAtual / this.capacidadeMaxima, 0, 1) : 0;
    }

    getSetpointNormalizado() {
        return clamp(this.setpoint / 100, 0, 1);
    }

    getAlturaLiquidoParaNivelM(nivelNormalizado) {
        return clamp(nivelNormalizado, 0, 1) * this.alturaUtilMetros;
    }

    getAlturaLiquidoM() {
        return this.getAlturaLiquidoParaNivelM(this.getNivelNormalizado());
    }

    normalizarAlturasBocais() {
        this.alturaBocalEntradaM = clamp(this.alturaBocalEntradaM, 0, this.alturaUtilMetros);
        this.alturaBocalSaidaM = clamp(this.alturaBocalSaidaM, 0, this.alturaUtilMetros);
    }

    getPressaoHidrostaticaParaNivelBar(fluido, nivelNormalizado) {
        return pressureFromHeadBar(this.getAlturaLiquidoParaNivelM(nivelNormalizado), fluido.densidade);
    }

    getPressaoHidrostaticaBar(fluido) {
        return this.getPressaoHidrostaticaParaNivelBar(fluido, this.getNivelNormalizado());
    }

    getPressaoDisponivelSaidaParaNivelBar(fluido, nivelNormalizado, considerarAlturaBocal = true) {
        this.normalizarAlturasBocais();
        const alturaLiquidoM = this.getAlturaLiquidoParaNivelM(nivelNormalizado);
        const headDisponivelM = considerarAlturaBocal
            ? Math.max(0, alturaLiquidoM - this.alturaBocalSaidaM)
            : Math.max(0, alturaLiquidoM);
        return pressureFromHeadBar(headDisponivelM, fluido.densidade);
    }

    getPressaoDisponivelSaidaBar(fluido, considerarAlturaBocal = true) {
        return this.getPressaoDisponivelSaidaParaNivelBar(
            fluido,
            this.getNivelNormalizado(),
            considerarAlturaBocal
        );
    }

    getBackPressureAtInletParaNivelBar(fluido, nivelNormalizado, considerarAlturaBocal = true) {
        this.normalizarAlturasBocais();
        if (!considerarAlturaBocal) return 0;

        const alturaLiquidoM = this.getAlturaLiquidoParaNivelM(nivelNormalizado);
        const alturaSubmersaM = Math.max(0, alturaLiquidoM - this.alturaBocalEntradaM);
        return pressureFromHeadBar(alturaSubmersaM, fluido.densidade);
    }

    getBackPressureAtInletBar(fluido, considerarAlturaBocal = true) {
        return this.getBackPressureAtInletParaNivelBar(
            fluido,
            this.getNivelNormalizado(),
            considerarAlturaBocal
        );
    }

    _coletarAtuadoresDaPerna(componentes) {
        const valvulas = new Set();
        const bombas = new Set();
        const registrar = (componente) => {
            if (componente instanceof ValvulaLogica) valvulas.add(componente);
            else if (componente instanceof BombaLogica) bombas.add(componente);
        };

        componentes.forEach((componente) => {
            registrar(componente);

            if (componente instanceof ValvulaLogica || componente instanceof BombaLogica) {
                componente.inputs.forEach(registrar);
                componente.outputs.forEach(registrar);
            }
        });

        return { valvulas, bombas };
    }

    _coletarComponentesMontanteEntrada() {
        const visitados = new Set();
        const fila = [...this.inputs];
        const fontes = new Set();
        const bombas = new Set();

        while (fila.length > 0) {
            const componente = fila.shift();
            if (!componente || visitados.has(componente.id)) continue;
            visitados.add(componente.id);

            if (componente instanceof FonteLogica) {
                fontes.add(componente);
                continue;
            }

            if (componente instanceof BombaLogica) bombas.add(componente);
            componente.inputs.forEach((entrada) => {
                if (entrada && !visitados.has(entrada.id)) fila.push(entrada);
            });
        }

        return {
            fontes: [...fontes],
            bombas: [...bombas]
        };
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

    getValvulasDiretasSaidaControleNivel() {
        return this.outputs.filter((componente) => componente instanceof ValvulaLogica);
    }

    getDiagnosticoControleNivel() {
        const valvulasDiretasSaida = this.getValvulasDiretasSaidaControleNivel();
        const podeAtivar = valvulasDiretasSaida.length > 0;

        return {
            podeAtivar,
            valvulasDiretasSaida,
            quantidadeValvulasDiretasSaida: valvulasDiretasSaida.length,
            motivoBloqueio: podeAtivar
                ? ''
                : 'Conecte uma válvula diretamente à saída do tanque para habilitar o controlador de nível.'
        };
    }

    getResumoAjustePressaoSetpoint(
        fluido = this.getSimulationContext().fluidoOperante,
        usarAlturaRelativa = this.getSimulationContext().usarAlturaRelativa
    ) {
        const nivelAtual = this.getNivelNormalizado();
        const nivelSetpoint = this.getSetpointNormalizado();
        const qEntradaAtualLps = Math.max(0, this.lastQin);
        const qSaidaAtualLps = Math.max(0, this.lastQout);
        const pressaoSaidaAtualBar = this.getPressaoDisponivelSaidaParaNivelBar(
            fluido,
            nivelAtual,
            usarAlturaRelativa
        );
        const pressaoSaidaSetpointBar = this.getPressaoDisponivelSaidaParaNivelBar(
            fluido,
            nivelSetpoint,
            usarAlturaRelativa
        );
        const pressaoBaseEntradaAtualBar = this.getBackPressureAtInletParaNivelBar(
            fluido,
            nivelAtual,
            usarAlturaRelativa
        );
        const pressaoBaseEntradaSetpointBar = this.getBackPressureAtInletParaNivelBar(
            fluido,
            nivelSetpoint,
            usarAlturaRelativa
        );
        const { fontes, bombas } = this._coletarComponentesMontanteEntrada();
        const fatorReducaoSaida = pressaoSaidaAtualBar > EPSILON_FLOW
            ? Math.sqrt(Math.max(0, pressaoSaidaSetpointBar / pressaoSaidaAtualBar))
            : 0;
        const vazaoSaidaLimiteSetpointLps = qSaidaAtualLps * fatorReducaoSaida;
        const fatorReducaoEntrada = qEntradaAtualLps > EPSILON_FLOW
            ? clamp(vazaoSaidaLimiteSetpointLps / qEntradaAtualLps, 0, 1)
            : 0;
        const fatorPressao = fatorReducaoEntrada * fatorReducaoEntrada;
        const ajustesFonte = fontes.map((fonte) => {
            const pressaoExcedenteAtualBar = Math.max(0, fonte.pressaoFonteBar - pressaoBaseEntradaAtualBar);
            const pressaoRecomendadaBar = clamp(
                pressaoBaseEntradaSetpointBar + (pressaoExcedenteAtualBar * fatorPressao),
                0,
                100
            );

            return {
                fonte,
                id: fonte.id,
                tag: fonte.tag,
                pressaoAtualBar: fonte.pressaoFonteBar,
                pressaoRecomendadaBar
            };
        });

        return {
            usarAlturaRelativa: usarAlturaRelativa === true,
            nivelAtual,
            nivelSetpoint,
            alturaAtualM: this.getAlturaLiquidoParaNivelM(nivelAtual),
            alturaSetpointM: this.getAlturaLiquidoParaNivelM(nivelSetpoint),
            vazaoEntradaAtualLps: qEntradaAtualLps,
            vazaoSaidaAtualLps: qSaidaAtualLps,
            vazaoSaidaLimiteSetpointLps,
            pressaoSaidaAtualBar,
            pressaoSaidaSetpointBar,
            pressaoBaseEntradaAtualBar,
            pressaoBaseEntradaSetpointBar,
            fatorReducaoEntrada,
            ajustesFonte,
            autoAjustavel: ajustesFonte.length > 0,
            possuiBombasMontante: bombas.length > 0,
            quantidadeBombasMontante: bombas.length
        };
    }

    aplicarAjustePressaoSetpoint() {
        const resumo = this.getResumoAjustePressaoSetpoint();
        if (!resumo.autoAjustavel) {
            return {
                aplicado: false,
                motivo: 'Nenhuma fonte de entrada foi encontrada para aplicar o ajuste automaticamente.',
                resumo
            };
        }

        resumo.ajustesFonte.forEach(({ fonte, pressaoRecomendadaBar }) => {
            fonte.pressaoFonteBar = pressaoRecomendadaBar;
            fonte.notify(ComponentEventPayloads.pressureUpdate({
                pressaoFonteBar: fonte.pressaoFonteBar
            }));
        });

        this.notify(ComponentEventPayloads.setpointAutoPressure({
            quantidadeFontes: resumo.ajustesFonte.length
        }));

        return {
            aplicado: true,
            quantidadeFontes: resumo.ajustesFonte.length,
            resumo
        };
    }

    _atualizarAlertaSaturacao(fluido) {
        if (!this.setpointAtivo) {
            this.alertaSaturacao = null;
            return;
        }

        const { u, erro } = this._ultimoEstadoControle;
        const saturado = u <= U_SAIDA_TOTALMENTE_ABERTA
            && erro < TOLERANCIA_ERRO_SATURACAO
            && this.lastQin > (this.lastQout * FATOR_EXCESSO_ENTRADA);

        this.alertaSaturacao = saturado
            ? {
                ativo: true,
                ...this.getResumoAjustePressaoSetpoint(fluido, this.getSimulationContext().usarAlturaRelativa)
            }
            : null;
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
        bombas.forEach((bomba) => {
            if (bomba.grauAcionamento < 100) bomba.setAcionamento(100);
        });
    }

    _sincronizarValvulasControleNivel(valvulas) {
        const valvulasAtuais = new Set(valvulas);
        this._valvulasControleNivel.forEach((valvula) => {
            if (!valvulasAtuais.has(valvula)) valvula.liberarControleNivel(this.id);
        });
        this._valvulasControleNivel = valvulasAtuais;
    }

    _liberarValvulasControleNivel(valvulasExtras = []) {
        const valvulas = new Set([...this._valvulasControleNivel, ...valvulasExtras]);
        valvulas.forEach((valvula) => valvula.liberarControleNivel(this.id));
        this._valvulasControleNivel.clear();
    }

    _desativarControleNivel(atuadoresAntes = this.getAtuadoresControleNivel(), payload = {}) {
        this.setpointAtivo = false;
        this.resetControlador();
        this._liberarValvulasControleNivel([
            ...atuadoresAntes.valvulasEntrada,
            ...atuadoresAntes.valvulasSaida
        ]);

        this.notify(ComponentEventPayloads.setpointUpdate({
            ativo: false,
            ...payload
        }));

        return {
            ativado: false,
            ...payload
        };
    }

    garantirConsistenciaControleNivel() {
        const diagnostico = this.getDiagnosticoControleNivel();
        if (!this.setpointAtivo || diagnostico.podeAtivar) return diagnostico;

        const atuadoresAntes = this.getAtuadoresControleNivel();
        this._desativarControleNivel(atuadoresAntes, {
            bloqueado: true,
            motivoControle: diagnostico.motivoBloqueio
        });

        return diagnostico;
    }

    setSetpointAtivo(ativo) {
        const atuadoresAntes = this.getAtuadoresControleNivel();
        const desejaAtivar = ativo === true;
        const diagnostico = this.getDiagnosticoControleNivel();

        if (desejaAtivar && !diagnostico.podeAtivar) {
            return this._desativarControleNivel(atuadoresAntes, {
                bloqueado: true,
                motivoControle: diagnostico.motivoBloqueio
            });
        }

        this.setpointAtivo = desejaAtivar;
        this.resetControlador();

        if (this.setpointAtivo) {
            this._manterBombasControleLigadas(atuadoresAntes.bombas);
        } else {
            this._liberarValvulasControleNivel([
                ...atuadoresAntes.valvulasEntrada,
                ...atuadoresAntes.valvulasSaida
            ]);
        }

        this.notify(ComponentEventPayloads.setpointUpdate({
            ativo: this.setpointAtivo,
            bloqueado: false,
            motivoControle: ''
        }));

        return {
            ativado: this.setpointAtivo,
            bloqueado: false,
            motivoControle: ''
        };
    }

    _rodarControlador(dt) {
        this.garantirConsistenciaControleNivel();
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

        this._ultimoEstadoControle = { u, erro };
        this._sincronizarValvulasControleNivel(valvulasControle);
        this._manterBombasControleLigadas(atuadores.bombas);

        atuadores.valvulasEntrada.forEach((valvula) => valvula.aplicarControleNivel({
            abertura: grauEntrada,
            intensidade: intensidadeEntrada,
            ownerId: this.id
        }));
        atuadores.valvulasSaida.forEach((valvula) => valvula.aplicarControleNivel({
            abertura: grauSaida,
            intensidade: intensidadeSaida,
            ownerId: this.id
        }));

        this.notify(ComponentEventPayloads.controlUpdate({
            grau: u * 100,
            erro,
            grauEntrada,
            grauSaida,
            intensidadeEntrada,
            intensidadeSaida,
            bombasLigadas: atuadores.bombas.length
        }));
    }

    resetControlador() {
        this._ctrlIntegral = 0;
        this._lastErro = 0;
        this._ultimoEstadoControle = { u: 0, erro: 0 };
        this.alertaSaturacao = null;
    }

    atualizarFisica(dt, fluido) {
        this.normalizarAlturasBocais();
        this.lastQin = this.estadoHidraulico.entradaVazaoLps;
        this.lastQout = this.estadoHidraulico.saidaVazaoLps;
        this.volumeAtual += (this.lastQin - this.lastQout) * dt;
        this.volumeAtual = clamp(this.volumeAtual, 0, this.capacidadeMaxima);
        this.pressaoFundoBar = this.getPressaoHidrostaticaBar(fluido);
        this.sincronizarMetricasFisicas(fluido);
        this._atualizarAlertaSaturacao(fluido);

        this.notify(ComponentEventPayloads.volumeUpdate({
            perc: this.capacidadeMaxima > 0 ? this.volumeAtual / this.capacidadeMaxima : 0,
            abs: this.volumeAtual,
            qIn: this.lastQin,
            qOut: this.lastQout,
            pBottom: this.pressaoFundoBar
        }));
    }

    sincronizarMetricasFisicas(fluido) {
        this.normalizarAlturasBocais();
        super.sincronizarMetricasFisicas(fluido);
        const fluidoAtual = fluido || this.getSimulationContext().fluidoOperante;
        this.pressaoFundoBar = this.getPressaoHidrostaticaBar(fluidoAtual);
    }

    getFluxoSaida() {
        return this.lastQout || 0;
    }

    getFluxoSaidaFromTank(
        nivelMontante,
        fluido = this.getSimulationContext().fluidoOperante,
        usarAlturaRelativa = this.getSimulationContext().usarAlturaRelativa
    ) {
        const headBar = this.getPressaoDisponivelSaidaParaNivelBar(
            fluido,
            nivelMontante,
            usarAlturaRelativa
        );

        return flowFromBernoulli(
            headBar,
            this.getAreaConexaoM2(),
            fluido.densidade,
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
