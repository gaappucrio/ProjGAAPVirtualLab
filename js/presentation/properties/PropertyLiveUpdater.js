import { BombaLogica } from '../../domain/components/BombaLogica.js';
import { DrenoLogico } from '../../domain/components/DrenoLogico.js';
import { FonteLogica } from '../../domain/components/FonteLogica.js';
import { TanqueLogico } from '../../domain/components/TanqueLogico.js';
import { TrocadorCalorLogico } from '../../domain/components/TrocadorCalorLogico.js';
import { ValvulaLogica } from '../../domain/components/ValvulaLogica.js';
import { getSuggestedDiameterForConnection } from '../../domain/services/PipeHydraulics.js';
import { toDisplayValue } from '../../utils/Units.js';
import { localizeElement, translateLiteral } from '../../utils/LanguageManager.js';
import { byId, isActive, setValue } from './PropertyDomAdapter.js';
import { setFieldValue } from './PropertyValueFormatters.js';
import {
    updateTankControlAvailabilityUI,
    updateTankSaturationAlert
} from './TankSaturationAlertPresenter.js';

function getPumpNpshMargin(component) {
    const npshRequeridoAtualM = component.npshRequeridoAtualM ?? component.npshRequeridoM ?? 0;
    return component.getMargemNpshAtualM?.() ?? (component.npshDisponivelM - npshRequeridoAtualM);
}

function getPumpNpshCondition(component) {
    return component.getCondicaoSucaoAtual?.() ?? 'Sem leitura';
}

function updateConnectionValues(engine, connection) {
    if (!connection) return;

    const state = engine.getConnectionState(connection);
    const fluid = state.fluid || engine.hydraulicContext?.getConnectionFluid?.(connection);
    setFieldValue('disp-pipe-flow', state.flowLps, 'flow', 2);
    setFieldValue('disp-pipe-target-flow', state.targetFlowLps, 'flow', 2);
    setValue('disp-pipe-velocity', state.velocityMps.toFixed(2));
    setValue('disp-pipe-reynolds', Math.round(state.reynolds));
    setValue('disp-pipe-friction', state.frictionFactor.toFixed(4));
    setValue('disp-pipe-regime', translateLiteral(state.regime));
    setValue('disp-pipe-fluid', fluid?.nome || '-');
    setValue('disp-pipe-fluid-density', fluid?.densidade ? fluid.densidade.toFixed(1) : '0.0');
    setValue('disp-pipe-fluid-viscosity', fluid?.viscosidadeDinamicaPaS ? fluid.viscosidadeDinamicaPaS.toFixed(5) : '0.00000');
    setFieldValue('disp-pipe-deltap', state.deltaPBar, 'pressure', 3);
    setFieldValue('disp-pipe-length', state.lengthM, 'length', 2);
    setValue('disp-pipe-response', state.responseTimeS.toFixed(2));

    const suggestedDiameterM = getSuggestedDiameterForConnection(connection, state);
    setFieldValue('disp-pipe-suggested-diameter', suggestedDiameterM, 'length', 4);
    const applySuggestedButton = byId('btn-apply-pipe-suggested-diameter');
    if (applySuggestedButton) applySuggestedButton.disabled = suggestedDiameterM <= 0;
}

function updateTankValues(component) {
    const volumeInput = byId('input-volume-tanque');
    if (volumeInput && !isActive(volumeInput)) {
        volumeInput.value = toDisplayValue('volume', component.volumeAtual).toFixed(2);
    }

    setFieldValue('disp-pressao-tanque', component.pressaoFundoBar, 'pressure', 2);
    setFieldValue('disp-nível-tanque', component.getAlturaLiquidoM(), 'length', 2);
    setFieldValue('disp-qin-tanque', component.lastQin, 'flow', 2);
    setFieldValue('disp-qout-tanque', component.lastQout, 'flow', 2);
    const fluid = component.getFluidoConteudo?.() || component.fluidoConteudo;
    setValue('disp-tank-fluid', fluid?.nome || '-');
    setValue('disp-tank-fluid-density', fluid?.densidade ? fluid.densidade.toFixed(1) : '0.0');
    updateTankSaturationAlert(component);
    updateTankControlAvailabilityUI(component);
}

function updateValveValues(engine, component) {
    const abEl = byId('input-abertura');
    const numInput = byId('val-abertura');
    const cvInput = byId('input-cv');
    const perdaInput = byId('input-perda-k');
    const perfilInput = byId('input-perfil-valvula');
    const caracteristicaInput = byId('input-caracteristica-valvula');
    const rangeabilidadeInput = byId('input-rangeabilidade-valvula');
    const cursoInput = byId('input-curso-valvula');
    const bloqueadaPorSetpoint = engine.isValvulaBloqueadaPorSetpoint?.(component) === true
        || component.estaControladaPorSetpoint?.() === true;
    const perfilAtual = component.perfilCaracteristica ?? 'custom';
    const bloqueioParametros = bloqueadaPorSetpoint || perfilAtual !== 'custom';

    [abEl, numInput, perfilInput]
        .forEach((input) => {
            if (input) input.disabled = bloqueadaPorSetpoint;
        });
    [cvInput, perdaInput, caracteristicaInput, rangeabilidadeInput, cursoInput]
        .forEach((input) => {
            if (input) input.disabled = bloqueioParametros;
        });

    if (abEl && !isActive(numInput) && !isActive(abEl)) {
        abEl.value = Math.round(component.grauAbertura);
        if (numInput) numInput.value = Math.round(component.grauAbertura);
    }
    if (perfilInput && !isActive(perfilInput)) perfilInput.value = perfilAtual;
    if (caracteristicaInput && !isActive(caracteristicaInput)) caracteristicaInput.value = component.tipoCaracteristica;
    if (cvInput && !isActive(cvInput)) cvInput.value = component.cv.toFixed(2);
    if (perdaInput && !isActive(perdaInput)) perdaInput.value = component.perdaLocalK.toFixed(3);
    if (rangeabilidadeInput && !isActive(rangeabilidadeInput)) rangeabilidadeInput.value = component.rangeabilidade;
    if (cursoInput && !isActive(cursoInput)) cursoInput.value = component.tempoCursoSegundos;
    setValue('disp-abertura-efetiva-valvula', component.aberturaEfetiva.toFixed(1));
    setFieldValue('disp-vazao-valvula', component.fluxoReal, 'flow', 2);
    setFieldValue('disp-deltap-valvula', component.deltaPAtualBar, 'pressure', 2);
}

function updatePumpValues(component, { monitorController } = {}) {
    const acEl = byId('input-acionamento');
    const numInput = byId('val-acionamento');
    if (acEl && !isActive(numInput) && !isActive(acEl)) {
        acEl.value = Math.round(component.grauAcionamento);
        if (numInput) numInput.value = Math.round(component.grauAcionamento);
    }
    setValue('disp-acionamento-real-bomba', component.acionamentoEfetivo.toFixed(1));
    setFieldValue('disp-vazao-bomba', component.fluxoReal, 'flow', 2);
    setFieldValue('disp-succao-bomba', component.pressaoSucaoAtualBar, 'pressure', 2);
    setFieldValue('disp-descarga-bomba', component.pressaoDescargaAtualBar, 'pressure', 2);
    setValue('disp-cavitacao-bomba', `${(component.fatorCavitacaoAtual * 100).toFixed(0)}%`);
    setFieldValue('disp-npsha-bomba', component.npshDisponivelM, 'length', 2);
    setFieldValue('disp-npshr-atual-bomba', component.npshRequeridoAtualM ?? component.npshRequeridoM, 'length', 2);
    setFieldValue('disp-margem-npsh-bomba', getPumpNpshMargin(component), 'length', 2);
    setValue('disp-condicao-npsh-bomba', translateLiteral(getPumpNpshCondition(component)));
    setValue('disp-eficiencia-bomba', `${(component.eficienciaAtual * 100).toFixed(0)}%`);
    monitorController?.refreshPump(component);
}

function updateHeatExchangerValues(component) {
    setFieldValue('disp-hx-temp-in', component.temperaturaEntradaC, 'temperature', 2);
    setFieldValue('disp-hx-temp-out', component.temperaturaSaidaC, 'temperature', 2);
    setValue('disp-hx-delta-t', component.deltaTemperaturaC.toFixed(2));
    setValue('disp-hx-duty', `${(component.cargaTermicaW / 1000).toFixed(2)} kW`);
    setFieldValue('disp-hx-flow', component.fluxoReal, 'flow', 2);
    setValue('disp-hx-effectiveness', `${(component.efetividadeAtual * 100).toFixed(1)}%`);
    setFieldValue('disp-hx-deltap', component.deltaPAtualBar, 'pressure', 2);
}

export function updatePropertyPanelValues({
    engine,
    component,
    connection,
    monitorController
}) {
    updateConnectionValues(engine, connection);

    if (component instanceof FonteLogica) {
        setFieldValue('disp-vazao-fonte', component.fluxoReal, 'flow', 2);
    }

    if (component instanceof DrenoLogico) {
        setFieldValue('disp-vazao-dreno', component.vazaoRecebidaLps, 'flow', 2);
    }

    if (component instanceof TanqueLogico) {
        updateTankValues(component);
    }

    if (component instanceof ValvulaLogica) {
        updateValveValues(engine, component);
    }

    if (component instanceof BombaLogica) {
        updatePumpValues(component, { monitorController });
    }

    if (component instanceof TrocadorCalorLogico) {
        updateHeatExchangerValues(component);
    }

    if (typeof document !== 'undefined') {
        localizeElement(document.getElementById('prop-content'));
    }
}
