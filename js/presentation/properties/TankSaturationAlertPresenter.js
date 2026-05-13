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

function formatPumpSizingText(alerta) {
    const ajustes = alerta.ajustesBomba || [];
    if (ajustes.length === 0) return '';

    return t('saturation.pumpSizing', {
        count: ajustes.length,
        flow: formatMeasuredValue('flow', ajustes[0].vazaoNominalRecomendadaLps, 2),
        pressure: formatMeasuredValue('pressure', ajustes[0].pressaoMaximaRecomendadaBar, 2)
    });
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
    const textoDimensionamento = formatPumpSizingText(alerta);

    setDisplay('painel-alerta-saturacao', 'block');
    setHtml('texto-alerta-saturacao', t('saturation.message', {
        setpoint: component.setpoint,
        flow: formatMeasuredValue('flow', alerta.vazaoSaidaLimiteSetpointLps, 2),
        heightText: textoModoAltura,
        pumpText: textoBombas,
        sizingText: textoDimensionamento
    }));

    if (btnAjuste) {
        const quantidadeBombasAjustaveis = alerta.ajustesBomba?.length ?? 0;
        btnAjuste.style.display = quantidadeBombasAjustaveis > 0 ? 'inline-flex' : 'none';
        btnAjuste.disabled = quantidadeBombasAjustaveis === 0;
        btnAjuste.textContent = quantidadeBombasAjustaveis > 1
            ? t('saturation.applyMany', { count: quantidadeBombasAjustaveis })
            : t('saturation.applyOne');
    }

    if (feedbackAjuste && !feedbackAjuste.dataset.state) {
        setText(
            'texto-acao-alerta-saturacao',
            alerta.ajustesBomba?.length > 0
                ? t('saturation.pumpSizingAvailable')
                : (alerta.possuiBombasMontante ? t('saturation.pumpLimited') : t('saturation.valveOnly'))
        );
        feedbackAjuste.style.color = '#a84300';
    }
}

export function bindTankSaturationAlertActions(component, { onAdjustmentApplied } = {}) {
    if (!(component instanceof TanqueLogico)) return;

    const btnAjuste = byId('btn-aplicar-alerta-saturacao');
    const feedbackAjuste = byId('texto-acao-alerta-saturacao');
    if (!btnAjuste || !feedbackAjuste) return;

    bind('btn-aplicar-alerta-saturacao', 'click', () => {
        const resultado = component.aplicarAjustePressaoSetpoint();
        feedbackAjuste.textContent = resultado.aplicado
            ? t(resultado.quantidadeBombas > 1 ? 'saturation.successMany' : 'saturation.successOne', {
                count: resultado.quantidadeBombas
            })
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
