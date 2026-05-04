import { BombaLogica } from '../../domain/components/BombaLogica.js';
import { DrenoLogico } from '../../domain/components/DrenoLogico.js';
import { FonteLogica } from '../../domain/components/FonteLogica.js';
import { TanqueLogico } from '../../domain/components/TanqueLogico.js';
import { ValvulaLogica } from '../../domain/components/ValvulaLogica.js';
import { toDisplayValue } from '../../utils/Units.js';
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
    setFieldValue('disp-pipe-flow', state.flowLps, 'flow', 2);
    setFieldValue('disp-pipe-target-flow', state.targetFlowLps, 'flow', 2);
    if (document.getElementById('disp-pipe-velocity')) document.getElementById('disp-pipe-velocity').value = state.velocityMps.toFixed(2);
    if (document.getElementById('disp-pipe-reynolds')) document.getElementById('disp-pipe-reynolds').value = Math.round(state.reynolds);
    if (document.getElementById('disp-pipe-friction')) document.getElementById('disp-pipe-friction').value = state.frictionFactor.toFixed(4);
    if (document.getElementById('disp-pipe-regime')) document.getElementById('disp-pipe-regime').value = state.regime;
    setFieldValue('disp-pipe-deltap', state.deltaPBar, 'pressure', 3);
    setFieldValue('disp-pipe-length', state.lengthM, 'length', 2);
    if (document.getElementById('disp-pipe-response')) document.getElementById('disp-pipe-response').value = state.responseTimeS.toFixed(2);
}

function updateTankValues(component) {
    const volumeInput = document.getElementById('input-volume-tanque');
    if (volumeInput && document.activeElement !== volumeInput) {
        volumeInput.value = toDisplayValue('volume', component.volumeAtual).toFixed(2);
    }

    setFieldValue('disp-pressao-tanque', component.pressaoFundoBar, 'pressure', 2);
    setFieldValue('disp-nível-tanque', component.getAlturaLiquidoM(), 'length', 2);
    setFieldValue('disp-qin-tanque', component.lastQin, 'flow', 2);
    setFieldValue('disp-qout-tanque', component.lastQout, 'flow', 2);
    updateTankSaturationAlert(component);
    updateTankControlAvailabilityUI(component);
}

function updateValveValues(engine, component) {
    const abEl = document.getElementById('input-abertura');
    const numInput = document.getElementById('val-abertura');
    const cvInput = document.getElementById('input-cv');
    const perdaInput = document.getElementById('input-perda-k');
    const perfilInput = document.getElementById('input-perfil-valvula');
    const caracteristicaInput = document.getElementById('input-caracteristica-valvula');
    const rangeabilidadeInput = document.getElementById('input-rangeabilidade-valvula');
    const cursoInput = document.getElementById('input-curso-valvula');
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

    if (abEl && document.activeElement !== numInput && document.activeElement !== abEl) {
        abEl.value = Math.round(component.grauAbertura);
        if (numInput) numInput.value = Math.round(component.grauAbertura);
    }
    if (perfilInput && document.activeElement !== perfilInput) perfilInput.value = perfilAtual;
    if (caracteristicaInput && document.activeElement !== caracteristicaInput) caracteristicaInput.value = component.tipoCaracteristica;
    if (cvInput && document.activeElement !== cvInput) cvInput.value = component.cv.toFixed(2);
    if (perdaInput && document.activeElement !== perdaInput) perdaInput.value = component.perdaLocalK.toFixed(3);
    if (rangeabilidadeInput && document.activeElement !== rangeabilidadeInput) rangeabilidadeInput.value = component.rangeabilidade;
    if (cursoInput && document.activeElement !== cursoInput) cursoInput.value = component.tempoCursoSegundos;
    if (document.getElementById('disp-abertura-efetiva-valvula')) document.getElementById('disp-abertura-efetiva-valvula').value = component.aberturaEfetiva.toFixed(1);
    setFieldValue('disp-vazao-valvula', component.fluxoReal, 'flow', 2);
    setFieldValue('disp-deltap-valvula', component.deltaPAtualBar, 'pressure', 2);
}

function updatePumpValues(component, { monitorController } = {}) {
    const acEl = document.getElementById('input-acionamento');
    const numInput = document.getElementById('val-acionamento');
    if (acEl && document.activeElement !== numInput && document.activeElement !== acEl) {
        acEl.value = Math.round(component.grauAcionamento);
        if (numInput) numInput.value = Math.round(component.grauAcionamento);
    }
    if (document.getElementById('disp-acionamento-real-bomba')) document.getElementById('disp-acionamento-real-bomba').value = component.acionamentoEfetivo.toFixed(1);
    setFieldValue('disp-vazao-bomba', component.fluxoReal, 'flow', 2);
    setFieldValue('disp-succao-bomba', component.pressaoSucaoAtualBar, 'pressure', 2);
    setFieldValue('disp-descarga-bomba', component.pressaoDescargaAtualBar, 'pressure', 2);
    if (document.getElementById('disp-cavitacao-bomba')) document.getElementById('disp-cavitacao-bomba').value = `${(component.fatorCavitacaoAtual * 100).toFixed(0)}%`;
    setFieldValue('disp-npsha-bomba', component.npshDisponivelM, 'length', 2);
    setFieldValue('disp-npshr-atual-bomba', component.npshRequeridoAtualM ?? component.npshRequeridoM, 'length', 2);
    setFieldValue('disp-margem-npsh-bomba', getPumpNpshMargin(component), 'length', 2);
    if (document.getElementById('disp-condicao-npsh-bomba')) document.getElementById('disp-condicao-npsh-bomba').value = getPumpNpshCondition(component);
    if (document.getElementById('disp-eficiencia-bomba')) document.getElementById('disp-eficiencia-bomba').value = `${(component.eficienciaAtual * 100).toFixed(0)}%`;
    monitorController?.refreshPump(component);
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
}
