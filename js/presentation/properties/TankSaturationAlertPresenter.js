import { TanqueLogico } from '../../domain/components/TanqueLogico.js';
import {
    byId,
    setHtml
} from './PropertyDomAdapter.js';
import { t, translateLiteral } from '../i18n/LanguageManager.js';
import { formatMeasuredValue } from './PropertyValueFormatters.js';
import { TOOLTIPS } from './PropertyTooltips.js';

const ignoredSaturationAlerts = new WeakMap();

function formatAlertSignatureNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue.toFixed(4) : String(value ?? '');
}

function formatPumpAdjustmentSignature(adjustments = []) {
    return adjustments.map(adjustment => [
        formatAlertSignatureNumber(adjustment?.vazaoNominalRecomendadaLps),
        formatAlertSignatureNumber(adjustment?.pressaoMaximaRecomendadaBar)
    ].join(':')).join(';');
}

function formatSourceAdjustmentSignature(adjustments = []) {
    return adjustments.map(adjustment => (
        formatAlertSignatureNumber(adjustment?.pressaoRecomendadaBar)
    )).join(';');
}

function getSaturationAlertSignature(component, alert) {
    return [
        component?.id,
        formatAlertSignatureNumber(component?.setpoint),
        alert?.usarAlturaRelativa ? 'height-on' : 'height-off',
        formatAlertSignatureNumber(alert?.vazaoSaidaLimiteSetpointLps),
        formatAlertSignatureNumber(alert?.pressaoBaseEntradaSetpointBar),
        formatAlertSignatureNumber(alert?.pressaoSaidaSetpointBar),
        alert?.possuiBombasMontante ? 'pumps-on' : 'pumps-off',
        alert?.quantidadeBombasMontante ?? 0,
        formatPumpAdjustmentSignature(alert?.ajustesBomba),
        formatSourceAdjustmentSignature(alert?.ajustesFonte)
    ].join('|');
}

function setTankSaturationAlertVisible(panel, visible) {
    if (!panel) return;

    const popup = panel.closest('.tank-saturation-popup');
    window.clearTimeout(panel._hideTimer);
    panel.style.transition = 'opacity 0.5s ease, transform 0.5s ease, max-height 0.5s ease, margin 0.5s ease, padding 0.5s ease';
    panel.style.overflow = popup ? 'auto' : 'hidden';

    if (visible) {
        panel.dataset.visible = 'true';
        panel.style.display = 'block';
        popup?.classList.add('is-visible');

        if (!popup) {
            panel.style.paddingLeft = '10px';
            panel.style.paddingRight = '10px';
        }

        window.requestAnimationFrame(() => {
            panel.style.opacity = '1';
            panel.style.transform = 'translateY(0)';
            panel.style.maxHeight = popup ? 'calc(100vh - 120px)' : `${Math.max(panel.scrollHeight, 160)}px`;
            panel.style.margin = popup ? '0' : '0 0 12px';
            if (!popup) {
                panel.style.paddingTop = '10px';
                panel.style.paddingBottom = '10px';
            }
            panel.style.pointerEvents = 'auto';
        });
        return;
    }

    popup?.classList.remove('is-visible');
    panel.dataset.visible = 'false';
    panel.style.opacity = '0';
    panel.style.transform = 'translateY(-6px)';
    panel.style.maxHeight = '0px';
    panel.style.margin = '0';
    panel.style.paddingTop = '0';
    panel.style.paddingBottom = '0';
    panel.style.pointerEvents = 'none';
    panel.style.display = 'none';
}

export function hideTankSaturationAlert() {
    const panel = byId('painel-alerta-saturacao');
    const feedback = byId('texto-acao-alerta-saturacao');
    setTankSaturationAlertVisible(panel, false);
    if (feedback) {
        feedback.textContent = '';
        feedback.dataset.state = '';
    }
}

function formatPumpSizingText(alerta) {
    const ajustes = alerta.ajustesBomba || [];
    if (ajustes.length === 0) return '';

    return t('saturation.pumpSizing', {
        count: ajustes.length,
        flow: formatMeasuredValue('flow', ajustes[0].vazaoNominalRecomendadaLps, 2),
        pressure: formatMeasuredValue('pressure', ajustes[0].pressaoMaximaRecomendadaBar, 2)
    });
}

function formatSourcePressureText(alerta) {
    const ajustes = alerta.ajustesFonte || [];
    if (ajustes.length === 0) return '';

    return t('saturation.sourcePressureSizing', {
        count: ajustes.length,
        pressure: formatMeasuredValue('pressure', ajustes[0].pressaoRecomendadaBar, 2)
    });
}

function getTankControlVisualState(active, available) {
    if (active) return 'active';
    return available ? 'ready' : 'blocked';
}

function syncTankControlVisualState(groupEl, state) {
    if (!groupEl) return;

    groupEl.dataset.controlState = state;
    groupEl.classList.toggle('is-active', state === 'active');
    groupEl.classList.toggle('is-ready', state === 'ready');
    groupEl.classList.toggle('is-blocked', state === 'blocked');
}

export function updateTankSaturationAlert(component) {
    const painelAlerta = byId('painel-alerta-saturacao');
    const textoAlerta = byId('texto-alerta-saturacao');
    const btnAjuste = byId('btn-aplicar-alerta-saturacao');
    const btnIgnorar = byId('btn-ignorar-alerta-saturacao');
    const feedbackAjuste = byId('texto-acao-alerta-saturacao');

    if (!painelAlerta || !textoAlerta || !(component instanceof TanqueLogico)) return;

    // Update colors based on current theme
    const isDark = document.body.classList.contains('theme-dark');
    painelAlerta.classList.add('gaap-alert', 'gaap-alert--danger', 'tank-saturation-alert');
    painelAlerta.dataset.alertSeverity = 'danger';
    painelAlerta.style.backgroundColor = isDark ? '#2d1b1b' : '#fdeaea';
    painelAlerta.style.borderLeftColor = '#e74c3c';
    painelAlerta.style.borderColor = '#e74c3c';

    const titleEl = painelAlerta.querySelector('h4');
    if (titleEl) {
        titleEl.classList.add('gaap-alert__title');
        titleEl.textContent = translateLiteral('Sa\u00edda Saturada no Set Point');
        titleEl.title = TOOLTIPS.painel.alertaSaturacao;
        titleEl.style.color = isDark ? '#ff6b6b' : '#c0392b';
    }

    if (textoAlerta) {
        textoAlerta.classList.add('gaap-alert__body');
        textoAlerta.style.color = isDark ? '#d8e4ec' : '#333';
    }

    if (btnAjuste) {
        btnAjuste.classList.add('gaap-alert__action');
        btnAjuste.title = TOOLTIPS.painel.aplicarAjusteSaturacao;
        btnAjuste.style.borderColor = isDark ? '#e74c3c' : '#c0392b';
        btnAjuste.style.backgroundColor = isDark ? '#2d1b1b' : '#fff';
        btnAjuste.style.color = isDark ? '#ff6b6b' : '#c0392b';
    }

    if (btnIgnorar) {
        btnIgnorar.classList.remove('gaap-alert__action', 'gaap-alert__action--secondary');
        btnIgnorar.classList.add('gaap-alert__close');
        btnIgnorar.title = translateLiteral('Ocultar aviso');
        btnIgnorar.setAttribute('aria-label', translateLiteral('Ocultar aviso'));
        btnIgnorar.textContent = '\u2716';
        btnIgnorar.style.borderColor = isDark ? '#e74c3c' : '#d9a09a';
        btnIgnorar.style.backgroundColor = isDark ? '#2d1b1b' : '#fff';
        btnIgnorar.style.color = isDark ? '#f7d8d4' : '#922b21';
    }

    if (feedbackAjuste) {
        feedbackAjuste.classList.add('gaap-alert__feedback');
        feedbackAjuste.hidden = true;
    }

    const alerta = component.alertaSaturacao;
    if (!alerta?.ativo) {
        ignoredSaturationAlerts.delete(component);
        setTankSaturationAlertVisible(painelAlerta, false);
        if (feedbackAjuste) {
            feedbackAjuste.textContent = '';
            feedbackAjuste.dataset.state = '';
        }
        return;
    }

    const alertSignature = getSaturationAlertSignature(component, alerta);
    if (ignoredSaturationAlerts.get(component) === alertSignature) {
        setTankSaturationAlertVisible(painelAlerta, false);
        return;
    }

    const textoModoAltura = alerta.usarAlturaRelativa
        ? t('saturation.heightOn', {
            baseInlet: formatMeasuredValue('pressure', alerta.pressaoBaseEntradaSetpointBar, 2),
            outlet: formatMeasuredValue('pressure', alerta.pressaoSaidaSetpointBar, 2)
        })
        : t('saturation.heightOff', {
            outlet: formatMeasuredValue('pressure', alerta.pressaoSaidaSetpointBar, 2)
        });
    const textoBombas = alerta.possuiBombasMontante
        ? t('saturation.pumps', { count: alerta.quantidadeBombasMontante })
        : '';
    const textoDimensionamento = formatPumpSizingText(alerta) || formatSourcePressureText(alerta);

    setHtml('texto-alerta-saturacao', t('saturation.message', {
        setpoint: component.setpoint,
        flow: formatMeasuredValue('flow', alerta.vazaoSaidaLimiteSetpointLps, 2),
        heightText: textoModoAltura,
        pumpText: textoBombas,
        sizingText: textoDimensionamento
    }));

    if (btnAjuste) {
        const quantidadeBombasAjustaveis = alerta.ajustesBomba?.length ?? 0;
        const quantidadeFontesAjustaveis = alerta.ajustesFonte?.length ?? 0;
        const possuiAjuste = quantidadeBombasAjustaveis > 0 || quantidadeFontesAjustaveis > 0;
        btnAjuste.style.display = possuiAjuste ? 'inline-flex' : 'none';
        btnAjuste.disabled = !possuiAjuste;
        btnAjuste.textContent = quantidadeBombasAjustaveis > 0
            ? (quantidadeBombasAjustaveis > 1
                ? t('saturation.applyMany', { count: quantidadeBombasAjustaveis })
                : t('saturation.applyOne'))
            : (quantidadeFontesAjustaveis > 1
                ? t('saturation.applySourceMany', { count: quantidadeFontesAjustaveis })
                : t('saturation.applySourceOne'));
    }

    setTankSaturationAlertVisible(painelAlerta, true);
}

export function bindTankSaturationAlertActions(component, { onAdjustmentApplied } = {}) {
    if (!(component instanceof TanqueLogico)) return;

    const btnAjuste = byId('btn-aplicar-alerta-saturacao');
    const btnIgnorar = byId('btn-ignorar-alerta-saturacao');
    const feedbackAjuste = byId('texto-acao-alerta-saturacao');
    if (!btnAjuste || !feedbackAjuste) return;

    btnAjuste.onclick = () => {
        const resultado = component.aplicarAjustePressaoSetpoint();
        feedbackAjuste.textContent = resultado.aplicado
            ? (resultado.tipoAjuste === 'pressao_fonte'
                ? t(resultado.quantidadeFontes > 1 ? 'saturation.successSourceMany' : 'saturation.successSourceOne', {
                    count: resultado.quantidadeFontes
                })
                : t(resultado.quantidadeBombas > 1 ? 'saturation.successMany' : 'saturation.successOne', {
                    count: resultado.quantidadeBombas
                }))
            : translateLiteral(resultado.motivo);
        feedbackAjuste.style.color = resultado.aplicado ? '#1e8449' : '#a84300';
        feedbackAjuste.dataset.state = resultado.aplicado ? 'success' : 'warning';

        onAdjustmentApplied?.(resultado);
    };

    if (btnIgnorar) {
        btnIgnorar.onclick = () => {
            const alerta = component.alertaSaturacao;
            if (alerta?.ativo) {
                ignoredSaturationAlerts.set(component, getSaturationAlertSignature(component, alerta));
            }
            hideTankSaturationAlert();
        };
    }

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
    const isDark = document.body.classList.contains('theme-dark');

    if (spAtivoEl) {
        spAtivoEl.disabled = !diagnostico.podeAtivar;
        spAtivoEl.checked = component.setpointAtivo;
    }

    if (statusEl) {
        statusEl.textContent = diagnostico.podeAtivar
            ? translateLiteral('O controlador usa a válvula de saída para modular o escoamento e estabilizar o nível.')
            : translateLiteral(diagnostico.motivoBloqueio);
        statusEl.style.color = diagnostico.podeAtivar
            ? (isDark ? '#a8bbc9' : '#5f6f7f')
            : (isDark ? '#ffd08a' : '#c0392b');
    }

    if (grp) {
        syncTankControlVisualState(grp, getTankControlVisualState(component.setpointAtivo, diagnostico.podeAtivar));
        grp.style.borderColor = component.setpointAtivo
            ? '#e74c3c'
            : (diagnostico.podeAtivar ? (isDark ? '#3b4e5d' : '#eee') : '#f39c12');
        grp.style.background = component.setpointAtivo
            ? (isDark ? '#3a1d1d' : '#fdf5f4')
            : (diagnostico.podeAtivar ? (isDark ? '#1d2a35' : '#f9fbfb') : (isDark ? '#332613' : '#fff8ee'));
    }

    const mostrarParametros = component.setpointAtivo ? 'block' : 'none';
    if (kpGroup) kpGroup.style.display = mostrarParametros;
    if (kiGroup) kiGroup.style.display = mostrarParametros;
}
