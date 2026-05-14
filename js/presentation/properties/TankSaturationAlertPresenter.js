import { TanqueLogico } from '../../domain/components/TanqueLogico.js';
import {
    bind,
    byId,
    setHtml,
    setText
} from './PropertyDomAdapter.js';
import { t, translateLiteral } from '../i18n/LanguageManager.js';
import { formatMeasuredValue } from './PropertyValueFormatters.js';

function setTankSaturationAlertVisible(panel, visible) {
    if (!panel) return;

    window.clearTimeout(panel._hideTimer);
    panel.style.transition = 'opacity 0.5s ease, transform 0.5s ease, max-height 0.5s ease, margin 0.5s ease, padding 0.5s ease';
    panel.style.overflow = 'hidden';

    if (visible) {
        panel.dataset.visible = 'true';
        panel.style.display = 'block';
        panel.style.paddingLeft = '10px';
        panel.style.paddingRight = '10px';

        window.requestAnimationFrame(() => {
            panel.style.opacity = '1';
            panel.style.transform = 'translateY(0)';
            panel.style.maxHeight = `${Math.max(panel.scrollHeight, 160)}px`;
            panel.style.margin = '0 0 12px';
            panel.style.paddingTop = '10px';
            panel.style.paddingBottom = '10px';
            panel.style.pointerEvents = 'auto';
        });
        return;
    }

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

export function updateTankSaturationAlert(component) {
    const painelAlerta = byId('painel-alerta-saturacao');
    const textoAlerta = byId('texto-alerta-saturacao');
    const btnAjuste = byId('btn-aplicar-alerta-saturacao');
    const feedbackAjuste = byId('texto-acao-alerta-saturacao');

    if (!painelAlerta || !textoAlerta || !(component instanceof TanqueLogico)) return;

    // Update colors based on current theme
    const isDark = document.body.classList.contains('theme-dark');
    painelAlerta.style.backgroundColor = isDark ? '#2d1b1b' : '#fdeaea';
    painelAlerta.style.borderLeftColor = '#e74c3c';
    painelAlerta.style.borderColor = '#e74c3c';

    const titleEl = painelAlerta.querySelector('h4');
    if (titleEl) titleEl.style.color = isDark ? '#ff6b6b' : '#c0392b';

    if (textoAlerta) textoAlerta.style.color = isDark ? '#d8e4ec' : '#333';

    if (btnAjuste) {
        btnAjuste.style.borderColor = isDark ? '#e74c3c' : '#c0392b';
        btnAjuste.style.backgroundColor = isDark ? '#2d1b1b' : '#fff';
        btnAjuste.style.color = isDark ? '#ff6b6b' : '#c0392b';
    }

    const alerta = component.alertaSaturacao;
    if (!alerta?.ativo) {
        setTankSaturationAlertVisible(painelAlerta, false);
        if (feedbackAjuste) {
            feedbackAjuste.textContent = '';
            feedbackAjuste.dataset.state = '';
        }
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

    if (feedbackAjuste && !feedbackAjuste.dataset.state) {
        setText(
            'texto-acao-alerta-saturacao',
            alerta.ajustesBomba?.length > 0
                ? t('saturation.pumpSizingAvailable')
                : alerta.ajustesFonte?.length > 0
                    ? t('saturation.sourcePressureAvailable')
                    : (alerta.possuiBombasMontante ? t('saturation.pumpLimited') : t('saturation.valveOnly'))
        );
        feedbackAjuste.style.color = isDark ? '#f0b36b' : '#a84300';
    }

    setTankSaturationAlertVisible(painelAlerta, true);
}

export function bindTankSaturationAlertActions(component, { onAdjustmentApplied } = {}) {
    if (!(component instanceof TanqueLogico)) return;

    const btnAjuste = byId('btn-aplicar-alerta-saturacao');
    const feedbackAjuste = byId('texto-acao-alerta-saturacao');
    if (!btnAjuste || !feedbackAjuste) return;

    bind('btn-aplicar-alerta-saturacao', 'click', () => {
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
