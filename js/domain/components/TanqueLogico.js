import { BombaLogica } from './BombaLogica.js';
import { clamp, ComponenteFisico, flowFromBernoulli } from './BaseComponente.js';
import { ComponentEventPayloads } from '../events/ComponentEventPayloads.js';
import { FonteLogica } from './FonteLogica.js';
import { ValvulaLogica } from './ValvulaLogica.js';
import { cloneFluido, createFluidoFromProperties, mixFluidos } from './Fluido.js';
import { EPSILON_FLOW, pressureFromHeadBar } from '../units/HydraulicUnits.js';

const TOLERANCIA_ERRO_SATURACAO = -0.02;
const FATOR_EXCESSO_ENTRADA = 1.02;
const U_SAIDA_TOTALMENTE_ABERTA = -0.99;
const ALTURA_UTIL_MINIMA_M = 0.5;
const FATOR_SEGURANCA_VAZAO_BOMBA_SETPOINT = 0.98;
const FATOR_SEGURANCA_VAZAO_FONTE_SETPOINT = 0.98;
const FATOR_DRENAGEM_TRANSITORIA_SETPOINT = 1.01;
const PRESSAO_MINIMA_DIMENSIONAMENTO_BOMBA_BAR = 0.5;
const PRESSAO_MAXIMA_DIMENSIONAMENTO_BOMBA_BAR = 20;
const PRESSAO_MAXIMA_AJUSTE_FONTE_BAR = 20;

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
        this.fluidoConteudo = createFluidoFromProperties();
        this.setpointAtivo = false;
        this.setpoint = 50;
        this.kp = 250;
        this.ki = 25;
        this.alertaSaturacao = null;
        this._ctrlIntegral = 0;
        this._lastErro = 0;
        this._ultimoEstadoControle = { u: 0, erro: 0 };
        this._valvulasControleNivel = new Set();
        this._bombasMantidasControleNivel = new Map();
    }

    getNivelNormalizado() {
        return this.capacidadeMaxima > 0 ? clamp(this.volumeAtual / this.capacidadeMaxima, 0, 1) : 0;
    }

    getSetpointNormalizado() {
        return clamp(this.setpoint / 100, 0, 1);
    }

    normalizarAlturaUtil() {
        const alturaUtil = Number(this.alturaUtilMetros);
        this.alturaUtilMetros = Number.isFinite(alturaUtil) && alturaUtil >= ALTURA_UTIL_MINIMA_M
            ? alturaUtil
            : ALTURA_UTIL_MINIMA_M;
        return this.alturaUtilMetros;
    }

    getAlturaLiquidoParaNivelM(nivelNormalizado) {
        return clamp(nivelNormalizado, 0, 1) * this.normalizarAlturaUtil();
    }

    getAlturaLiquidoM() {
        return this.getAlturaLiquidoParaNivelM(this.getNivelNormalizado());
    }

    temLiquidoDisponivelSaida(considerarAlturaBocal = true) {
        if (this.volumeAtual <= EPSILON_FLOW || this.capacidadeMaxima <= 0) return false;
        if (!considerarAlturaBocal) return true;
        this.normalizarAlturasBocais();
        return this.getAlturaLiquidoM() > this.alturaBocalSaidaM;
    }

    normalizarAlturasBocais() {
        const alturaUtil = this.normalizarAlturaUtil();
        const alturaEntrada = Number(this.alturaBocalEntradaM);
        const alturaSaida = Number(this.alturaBocalSaidaM);
        this.alturaBocalEntradaM = clamp(Number.isFinite(alturaEntrada) ? alturaEntrada : 0, 0, alturaUtil);
        this.alturaBocalSaidaM = clamp(Number.isFinite(alturaSaida) ? alturaSaida : 0, 0, alturaUtil);
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

    getFluidoConteudo() {
        return this.fluidoConteudo || createFluidoFromProperties();
    }

    getFluidoSaidaAtual(fallback = null) {
        if (this.volumeAtual > EPSILON_FLOW) return this.getFluidoConteudo();
        return this.getFluidoEntradaMisturado(fallback || this.getFluidoConteudo());
    }

    atualizarMisturaConteudo(dt, fluidoEntrada = null, volumeAnteriorL = this.volumeAtual) {
        const entradaVolumeL = Math.max(0, this.lastQin * dt);
        if (entradaVolumeL <= EPSILON_FLOW) return;

        const entrada = fluidoEntrada || this.getFluidoEntradaMisturado(this.getFluidoConteudo());
        const volumeConteudoAnteriorL = Math.max(0, volumeAnteriorL);
        const volumeFinalL = Math.max(0, this.volumeAtual);
        const volumeAntigoRetidoL = clamp(volumeFinalL - entradaVolumeL, 0, volumeConteudoAnteriorL);
        const entradaRetidaL = Math.max(0, volumeFinalL - volumeAntigoRetidoL);

        if (entradaRetidaL <= EPSILON_FLOW) return;

        if (volumeAntigoRetidoL <= EPSILON_FLOW) {
            this.fluidoConteudo = cloneFluido(entrada);
            return;
        }

        this.fluidoConteudo = mixFluidos([
            { fluido: this.getFluidoConteudo(), volumeL: volumeAntigoRetidoL },
            { fluido: entrada, volumeL: entradaRetidaL }
        ], this.getFluidoConteudo());
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

    _criarAjustesDimensionamentoBombas(bombas, resumoBase) {
        const vazaoLimiteSetpointLps = Math.max(0, resumoBase.vazaoSaidaLimiteSetpointLps);
        if (bombas.length === 0 || vazaoLimiteSetpointLps <= EPSILON_FLOW) return [];

        const vazaoTotalAlvoLps = Math.max(
            EPSILON_FLOW,
            vazaoLimiteSetpointLps * FATOR_SEGURANCA_VAZAO_BOMBA_SETPOINT
        );
        const vazaoPorBombaLps = vazaoTotalAlvoLps / bombas.length;
        const pressaoMinimaPorAlturaBar = Math.max(
            PRESSAO_MINIMA_DIMENSIONAMENTO_BOMBA_BAR,
            resumoBase.pressaoBaseEntradaSetpointBar * 1.2
        );

        return bombas.map((bomba) => {
            const vazaoNominalAtualLps = Math.max(EPSILON_FLOW, Number(bomba.vazaoNominal) || 0);
            const pressaoMaximaAtualBar = Math.max(0, Number(bomba.pressaoMaxima) || 0);
            const pressaoMaximaRecomendadaBar = clamp(
                Math.max(pressaoMaximaAtualBar, pressaoMinimaPorAlturaBar),
                PRESSAO_MINIMA_DIMENSIONAMENTO_BOMBA_BAR,
                PRESSAO_MAXIMA_DIMENSIONAMENTO_BOMBA_BAR
            );

            return {
                bomba,
                bombaId: bomba.id,
                tag: bomba.tag,
                vazaoNominalAtualLps,
                vazaoNominalRecomendadaLps: clamp(vazaoPorBombaLps, EPSILON_FLOW, 500),
                pressaoMaximaAtualBar,
                pressaoMaximaRecomendadaBar,
                acionamentoOperacional: 100,
                motivo: 'A bomba fica operacionalmente fixa em 100%; o dimensionamento limita a vazao que ela consegue entregar ao tanque, sem transformar a bomba em atuador do PA.'
            };
        });
    }

    _criarAjustesPressaoFontes(fontes, resumoBase) {
        if (
            fontes.length === 0
            || resumoBase.possuiBombasMontante
            || resumoBase.vazaoEntradaAtualLps <= EPSILON_FLOW
        ) {
            return [];
        }

        const vazaoAlvoEntradaLps = Math.max(
            0,
            resumoBase.vazaoSaidaLimiteSetpointLps * FATOR_SEGURANCA_VAZAO_FONTE_SETPOINT
        );
        const fatorVazao = clamp(vazaoAlvoEntradaLps / resumoBase.vazaoEntradaAtualLps, 0, 1);
        if (fatorVazao >= 0.999) return [];

        return fontes.map((fonte) => {
            const pressaoAtualBar = Math.max(0, Number(fonte.pressaoFonteBar) || 0);
            const pressaoMotoraAtualBar = Math.max(
                0,
                pressaoAtualBar - resumoBase.pressaoBaseEntradaAtualBar
            );
            const pressaoMotoraRecomendadaBar = pressaoMotoraAtualBar * fatorVazao * fatorVazao;
            const pressaoRecomendadaBar = clamp(
                resumoBase.pressaoBaseEntradaSetpointBar + pressaoMotoraRecomendadaBar,
                0,
                Math.min(pressaoAtualBar, PRESSAO_MAXIMA_AJUSTE_FONTE_BAR)
            );

            return {
                fonte,
                fonteId: fonte.id,
                tag: fonte.tag,
                pressaoAtualBar,
                pressaoRecomendadaBar,
                fatorReducaoEntrada: fatorVazao,
                vazaoAlvoEntradaLps,
                motivo: 'Sem bomba a montante, o ajuste didatico reduz a pressao da fonte uma unica vez para aproximar a entrada da capacidade fisica de saida no set point.'
            };
        }).filter((ajuste) => ajuste.pressaoRecomendadaBar < ajuste.pressaoAtualBar - 1e-6);
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
        fluido = this.getSimulationContext().queries.getComponentFluid?.(this) || this.getSimulationContext().fluidoOperante,
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
        const possuiBombasMontante = bombas.length > 0;
        const fatorReducaoSaida = pressaoSaidaAtualBar > EPSILON_FLOW
            ? Math.sqrt(Math.max(0, pressaoSaidaSetpointBar / pressaoSaidaAtualBar))
            : 0;
        const vazaoSaidaLimiteSetpointLps = qSaidaAtualLps * fatorReducaoSaida;
        const fatorReducaoEntrada = qEntradaAtualLps > EPSILON_FLOW
            ? clamp(vazaoSaidaLimiteSetpointLps / qEntradaAtualLps, 0, 1)
            : 0;

        const resumoBase = {
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
            possuiBombasMontante,
            quantidadeBombasMontante: bombas.length,
            quantidadeFontesMontante: fontes.length
        };
        const ajustesBomba = this._criarAjustesDimensionamentoBombas(bombas, resumoBase);
        const ajustesFonte = ajustesBomba.length > 0
            ? []
            : this._criarAjustesPressaoFontes(fontes, resumoBase);
        const autoAjustavel = ajustesBomba.length > 0 || ajustesFonte.length > 0;

        return {
            ...resumoBase,
            ajustesFonte,
            ajustesBomba,
            autoAjustavel,
            motivoAutoAjuste: ajustesBomba.length > 0
                ? 'Dimensionamento didatico disponivel: o PA continua atuando somente nas valvulas, e a bomba a montante permanece operacionalmente em 100%, mas sua vazao nominal pode ser ajustada para a capacidade fisica da saida no set point.'
                : ajustesFonte.length > 0
                    ? 'Ajuste didatico disponivel: sem bomba a montante, a pressao da fonte pode ser reduzida uma unica vez para aproximar a entrada da capacidade fisica da saida no set point.'
                    : 'O set point atua somente nas valvulas. Para estabilizar, conecte uma bomba dimensionavel a montante, adicione uma valvula de entrada controlavel ou aumente a capacidade de saida.'
        };
    }

    aplicarAjustePressaoSetpoint() {
        const resumo = this.getResumoAjustePressaoSetpoint();
        if (resumo.ajustesBomba?.length > 0) {
            resumo.ajustesBomba.forEach((ajuste) => {
                ajuste.bomba.vazaoNominal = ajuste.vazaoNominalRecomendadaLps;
                ajuste.bomba.pressaoMaxima = ajuste.pressaoMaximaRecomendadaBar;
                ajuste.bomba.recalcularMetricasDerivadasCurva?.();
                ajuste.bomba.notify(ComponentEventPayloads.state({
                    isOn: ajuste.bomba.isOn,
                    grau: ajuste.bomba.getAcionamentoAlvo?.() ?? ajuste.bomba.grauAcionamento,
                    grauManual: ajuste.bomba.grauAcionamento,
                    grauEfetivo: ajuste.bomba.acionamentoEfetivo,
                    bloqueadaPorSetpoint: ajuste.bomba.estaBloqueadaPorSetpoint?.() === true
                }));
            });

            this.notify(ComponentEventPayloads.setpointAutoPressure({
                tipoAjuste: 'dimensionamento_bomba',
                quantidadeBombas: resumo.ajustesBomba.length
            }));

            return {
                aplicado: true,
                tipoAjuste: 'dimensionamento_bomba',
                quantidadeBombas: resumo.ajustesBomba.length,
                quantidadeFontes: 0,
                motivo: resumo.ajustesBomba.length === 1
                    ? 'Bomba dimensionada para a capacidade fisica de saida no set point.'
                    : 'Bombas dimensionadas para a capacidade fisica de saida no set point.',
                resumo
            };
        }

        if (resumo.ajustesFonte?.length > 0) {
            resumo.ajustesFonte.forEach((ajuste) => {
                ajuste.fonte.pressaoFonteBar = ajuste.pressaoRecomendadaBar;
                ajuste.fonte.sincronizarMetricasFisicas?.();
                ajuste.fonte.notify(ComponentEventPayloads.state({
                    pressaoFonteBar: ajuste.fonte.pressaoFonteBar
                }));
            });

            this.notify(ComponentEventPayloads.setpointAutoPressure({
                tipoAjuste: 'pressao_fonte',
                quantidadeFontes: resumo.ajustesFonte.length
            }));

            return {
                aplicado: true,
                tipoAjuste: 'pressao_fonte',
                quantidadeBombas: 0,
                quantidadeFontes: resumo.ajustesFonte.length,
                motivo: resumo.ajustesFonte.length === 1
                    ? 'Pressao da fonte ajustada para a capacidade fisica de saida no set point.'
                    : 'Pressoes das fontes ajustadas para a capacidade fisica de saida no set point.',
                resumo
            };
        }

        return {
            aplicado: false,
            tipoAjuste: 'nenhum',
            quantidadeBombas: 0,
            quantidadeFontes: 0,
            motivo: resumo.motivoAutoAjuste,
            resumo
        };
    }

    _atualizarAlertaSaturacao(fluido) {
        if (!this.setpointAtivo) {
            this.alertaSaturacao = null;
            return;
        }

        const { u, erro } = this._ultimoEstadoControle;
        const resumo = this.getResumoAjustePressaoSetpoint(
            fluido,
            this.getSimulationContext().usarAlturaRelativa
        );
        const entradaExcedeCapacidadeNoSetpoint = resumo.vazaoEntradaAtualLps
            > (resumo.vazaoSaidaLimiteSetpointLps * FATOR_EXCESSO_ENTRADA);
        const drenandoEmDirecaoAoSetpoint = erro < TOLERANCIA_ERRO_SATURACAO
            && resumo.vazaoSaidaAtualLps > (resumo.vazaoEntradaAtualLps * FATOR_DRENAGEM_TRANSITORIA_SETPOINT);
        const saturado = u <= U_SAIDA_TOTALMENTE_ABERTA
            && erro < TOLERANCIA_ERRO_SATURACAO
            && entradaExcedeCapacidadeNoSetpoint
            && !drenandoEmDirecaoAoSetpoint;

        this.alertaSaturacao = saturado
            ? {
                ativo: true,
                drenandoEmDirecaoAoSetpoint,
                ...resumo
            }
            : null;
    }

    isBombaControladaPorSetpoint(bomba) {
        if (!this.setpointAtivo || !(bomba instanceof BombaLogica)) return false;
        return this._bombasMantidasControleNivel.has(bomba.id);
    }

    isValvulaControladaPorSetpoint(valvula) {
        if (!this.setpointAtivo || !(valvula instanceof ValvulaLogica)) return false;
        const atuadores = this.getAtuadoresControleNivel();
        return atuadores.valvulasEntrada.includes(valvula) || atuadores.valvulasSaida.includes(valvula);
    }

    _sincronizarValvulasControleNivel(valvulas) {
        const valvulasAtuais = new Set(valvulas);
        this._valvulasControleNivel.forEach((valvula) => {
            if (!valvulasAtuais.has(valvula)) valvula.liberarControleNivel(this.id);
        });
        this._valvulasControleNivel = valvulasAtuais;
    }

    _sincronizarBombasMantidasControleNivel(bombas) {
        const bombasAtuais = new Set(bombas.map((bomba) => bomba.id));
        [...this._bombasMantidasControleNivel.keys()].forEach((bombaId) => {
            if (!bombasAtuais.has(bombaId)) this._bombasMantidasControleNivel.delete(bombaId);
        });

        bombas.forEach((bomba) => {
            if (this._bombasMantidasControleNivel.has(bomba.id)) return;
            this._bombasMantidasControleNivel.set(bomba.id, true);
            bomba.notify(ComponentEventPayloads.state({
                isOn: bomba.isOn,
                grau: bomba.getAcionamentoAlvo?.() ?? 100,
                grauManual: bomba.grauAcionamento,
                grauEfetivo: bomba.acionamentoEfetivo,
                bloqueadaPorSetpoint: true
            }));
        });
    }

    _liberarValvulasControleNivel(valvulasExtras = []) {
        const valvulas = new Set([...this._valvulasControleNivel, ...valvulasExtras]);
        valvulas.forEach((valvula) => valvula.liberarControleNivel(this.id));
        this._valvulasControleNivel.clear();
    }

    _liberarBombasControleNivel() {
        const bombas = this.getAtuadoresControleNivel().bombas;
        this._bombasMantidasControleNivel.clear();
        bombas.forEach((bomba) => bomba.notify(ComponentEventPayloads.state({
            isOn: bomba.isOn,
            grau: bomba.grauAcionamento,
            grauManual: bomba.grauAcionamento,
            grauEfetivo: bomba.acionamentoEfetivo,
            bloqueadaPorSetpoint: false
        })));
    }

    _desativarControleNivel(atuadoresAntes = this.getAtuadoresControleNivel(), payload = {}) {
        this.setpointAtivo = false;
        this.resetControlador();
        this._liberarValvulasControleNivel([
            ...atuadoresAntes.valvulasEntrada,
            ...atuadoresAntes.valvulasSaida
        ]);
        this._liberarBombasControleNivel();

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
            this._sincronizarBombasMantidasControleNivel(atuadoresAntes.bombas);
        } else {
            this._liberarValvulasControleNivel([
                ...atuadoresAntes.valvulasEntrada,
                ...atuadoresAntes.valvulasSaida
            ]);
            this._liberarBombasControleNivel();
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
        this._sincronizarBombasMantidasControleNivel(atuadores.bombas);

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
            bombasFixas100: atuadores.bombas.length
        }));
    }

    resetControlador() {
        this._ctrlIntegral = 0;
        this._lastErro = 0;
        this._ultimoEstadoControle = { u: 0, erro: 0 };
        this.alertaSaturacao = null;
    }

    _notificarVolume() {
        const fluidoConteudo = this.getFluidoConteudo();
        this.notify(ComponentEventPayloads.volumeUpdate({
            perc: this.capacidadeMaxima > 0 ? this.volumeAtual / this.capacidadeMaxima : 0,
            abs: this.volumeAtual,
            qIn: this.lastQin,
            qOut: this.lastQout,
            pBottom: this.pressaoFundoBar,
            fluidoConteudo,
            fluidoEntrada: this.lastQin > EPSILON_FLOW
                ? this.getFluidoEntradaMisturado(fluidoConteudo)
                : null
        }));
    }

    atualizarFisica(dt, fluido) {
        this.normalizarAlturasBocais();
        const volumeAnteriorL = this.volumeAtual;
        this.lastQin = this.estadoHidraulico.entradaVazaoLps;
        this.lastQout = this.estadoHidraulico.saidaVazaoLps;
        const fluidoEntrada = this.getFluidoEntradaMisturado(this.getFluidoConteudo());
        this.volumeAtual += (this.lastQin - this.lastQout) * dt;
        this.volumeAtual = clamp(this.volumeAtual, 0, this.capacidadeMaxima);
        this.atualizarMisturaConteudo(dt, fluidoEntrada, volumeAnteriorL);
        const fluidoAtual = this.getFluidoConteudo();
        this.pressaoFundoBar = this.getPressaoHidrostaticaBar(fluidoAtual);
        this.sincronizarMetricasFisicas(fluidoAtual);
        this._atualizarAlertaSaturacao(fluidoAtual);

        this._notificarVolume();
    }

    onSimulationStop() {
        this.lastQin = 0;
        this.lastQout = 0;
        this.resetEstadoHidraulico();
        this._notificarVolume();
    }

    sincronizarMetricasFisicas(fluido) {
        this.normalizarAlturasBocais();
        super.sincronizarMetricasFisicas(fluido);
        const context = this.getSimulationContext();
        const fluidoAtual = fluido || context.queries.getComponentFluid?.(this) || context.fluidoOperante;
        this.pressaoFundoBar = this.getPressaoHidrostaticaBar(fluidoAtual);
    }

    getFluxoSaida() {
        return this.lastQout || 0;
    }

    getFluxoSaidaFromTank(
        nivelMontante,
        fluido = this.getSimulationContext().queries.getComponentFluid?.(this) || this.getSimulationContext().fluidoOperante,
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
        this._liberarBombasControleNivel();
        super.destroy();
    }
}
