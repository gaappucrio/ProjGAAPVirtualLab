import { TanqueLogico } from '../../domain/components/TanqueLogico.js';
import {
    bind,
    byId,
    setDisplay,
    setHtml,
    setText
} from './PropertyDomAdapter.js';
import { t, translateLiteral } from '../../utils/LanguageManager.js';
import { formatMeasuredValue } from './PropertyValueFormatters.js';

function getRecommendedSourcePressureText(alerta) {
    if (!alerta?.autoAjustavel || !Array.isArray(alerta.ajustesFonte) || alerta.ajustesFonte.length === 0) {
        return null;
    }

    const valores = alerta.ajustesFonte.map((ajuste) => ajuste.pressaoRecomendadaBar);
    const menor = Math.min(...valores);
    const maior = Math.max(...valores);

    if (Math.abs(maior - menor) < 0.0005) {
        return formatMeasuredValue('pressure', maior, 2);
    }

    return `${formatMeasuredValue('pressure', menor, 2)}${t('common.rangeSeparator')}${formatMeasuredValue('pressure', maior, 2)}`;
}

export function updateTankSaturationAlert(component) {
    const painelAlerta = byId('painel-alerta-saturacao');
    const textoAlerta = byId('texto-alerta-saturacao');
    const btnAjuste = byId('btn-aplicar-alerta-saturacao');
    const feedbackAjuste = byId('texto-acao-alerta-saturacao');

    if (!painelAlerta || !textoAlerta || !(component instanceof TanqueLogico)) return;

    const alerta = component.alertaSaturacao;
    if (!alerta?.ativo) {
        setDisplay('painel-alerta-saturacao', 'none');
        if (feedbackAjuste) {
            feedbackAjuste.textContent = '';
            feedbackAjuste.dataset.state = '';
        }
        return;
    }

    const pressaoRecomendada = getRecommendedSourcePressureText(alerta);
    const textoModoAltura = alerta.usarAlturaRelativa
        ? t('saturation.heightOn', {
            baseInlet: formatMeasuredValue('pressure', alerta.pressaoBaseEntradaSetpointBar, 2),
            outlet: formatMeasuredValue('pressure', alerta.pressaoSaidaSetpointBar, 2)
        })
        : t('saturation.heightOff', {
            outlet: formatMeasuredValue('pressure', alerta.pressaoSaidaSetpointBar, 2)
        });
    const textoPressao = pressaoRecomendada
        ? t('saturation.pressure', { setpoint: component.setpoint, pressure: pressaoRecomendada })
        : t('saturation.noSource');
    const textoBombas = alerta.possuiBombasMontante
        ? t('saturation.pumps', { count: alerta.quantidadeBombasMontante })
        : '';

    setDisplay('painel-alerta-saturacao', 'block');
    setHtml('texto-alerta-saturacao', t('saturation.message', {
        pressureText: textoPressao,
        flow: formatMeasuredValue('flow', alerta.vazaoSaidaLimiteSetpointLps, 2),
        heightText: textoModoAltura,
        pumpText: textoBombas
    }));

    if (btnAjuste) {
        btnAjuste.style.display = 'inline-flex';
        btnAjuste.disabled = !alerta.autoAjustavel;
        btnAjuste.textContent = alerta.autoAjustavel
            ? (alerta.ajustesFonte.length === 1
                ? t('saturation.applyOne')
                : t('saturation.applyMany', { count: alerta.ajustesFonte.length }))
            : t('saturation.unavailable');
    }

    if (feedbackAjuste && !alerta.autoAjustavel && !feedbackAjuste.dataset.state) {
        setText('texto-acao-alerta-saturacao', t('saturation.connectSource'));
        feedbackAjuste.style.color = '#a84300';
    } else if (feedbackAjuste && alerta.autoAjustavel && !feedbackAjuste.dataset.state) {
        setText('texto-acao-alerta-saturacao', '');
    }
}

export function bindTankSaturationAlertActions(component, { onAdjustmentApplied } = {}) {
    if (!(component instanceof TanqueLogico)) return;

    const btnAjuste = byId('btn-aplicar-alerta-saturacao');
    const feedbackAjuste = byId('texto-acao-alerta-saturacao');
    if (!btnAjuste || !feedbackAjuste) return;

    bind('btn-aplicar-alerta-saturacao', 'click', () => {
        const resultado = component.aplicarAjustePressaoSetpoint();
        if (resultado.aplicado) {
            feedbackAjuste.textContent = resultado.quantidadeFontes === 1
                ? t('saturation.successOne')
                : t('saturation.successMany', { count: resultado.quantidadeFontes });
            feedbackAjuste.style.color = '#1e8449';
            feedbackAjuste.dataset.state = 'success';
        } else {
            feedbackAjuste.textContent = translateLiteral(resultado.motivo);
            feedbackAjuste.style.color = '#a84300';
            feedbackAjuste.dataset.state = 'warning';
        }

        onAdjustmentApplied?.(resultado);
    });

    updateTankSaturationAlert(component);
}

export function updateTankControlAvailabilityUI(component) {
    if (!(component instanceof TanqueLogico)) return;

    const diagnostico = component.getDiagnosticoControleNivel?.() ?? {
        podeAtivar: true,
        motivoBloqueio: ''
    };
    const spAtivoEl = byId('input-sp-ativo');
    const statusEl = byId('tank-sp-status-text');
    const grp = byId('grp-sp-main');
    const kpGroup = byId('group-ctrl-params');
    const kiGroup = byId('group-ctrl-ki');

    if (spAtivoEl) {
        spAtivoEl.disabled = !diagnostico.podeAtivar;
        spAtivoEl.checked = component.setpointAtivo;
    }

    if (statusEl) {
        statusEl.textContent = diagnostico.podeAtivar
            ? translateLiteral('O controlador usa a válvula de saída para modular o escoamento e estabilizar o nível.')
            : translateLiteral(diagnostico.motivoBloqueio);
        statusEl.style.color = diagnostico.podeAtivar ? '#5f6f7f' : '#c0392b';
    }

    if (grp) {
        grp.style.borderColor = component.setpointAtivo
            ? '#e74c3c'
            : (diagnostico.podeAtivar ? '#eee' : '#f39c12');
        grp.style.background = component.setpointAtivo
            ? '#fdf5f4'
            : (diagnostico.podeAtivar ? '#f9fbfb' : '#fff8ee');
    }

    const mostrarParametros = component.setpointAtivo ? 'block' : 'none';
    if (kpGroup) kpGroup.style.display = mostrarParametros;
    if (kiGroup) kiGroup.style.display = mostrarParametros;
}
