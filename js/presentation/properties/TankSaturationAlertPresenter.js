import { TanqueLogico } from '../../domain/components/TanqueLogico.js';
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

    return `${formatMeasuredValue('pressure', menor, 2)} a ${formatMeasuredValue('pressure', maior, 2)}`;
}

export function updateTankSaturationAlert(component) {
    const painelAlerta = document.getElementById('painel-alerta-saturacao');
    const textoAlerta = document.getElementById('texto-alerta-saturacao');
    const btnAjuste = document.getElementById('btn-aplicar-alerta-saturacao');
    const feedbackAjuste = document.getElementById('texto-acao-alerta-saturacao');

    if (!painelAlerta || !textoAlerta || !(component instanceof TanqueLogico)) return;

    const alerta = component.alertaSaturacao;
    if (!alerta?.ativo) {
        painelAlerta.style.display = 'none';
        if (feedbackAjuste) {
            feedbackAjuste.textContent = '';
            feedbackAjuste.dataset.state = '';
        }
        return;
    }

    const pressaoRecomendada = getRecommendedSourcePressureText(alerta);
    const textoModoAltura = alerta.usarAlturaRelativa
        ? `Com a altura relativa ativa, a recomendação considera a contrapressão no bocal de entrada no set point (${formatMeasuredValue('pressure', alerta.pressaoBaseEntradaSetpointBar, 2)}) e a pressão disponível de saída nesse mesmo nível (${formatMeasuredValue('pressure', alerta.pressaoSaidaSetpointBar, 2)}).`
        : `Com a altura relativa desativada, a entrada do tanque não considera contrapressão hidrostática; o ajuste usa somente a capacidade de saída estimada para o set point (${formatMeasuredValue('pressure', alerta.pressaoSaidaSetpointBar, 2)}).`;
    const textoPressao = pressaoRecomendada
        ? `Para estabilizar no set point de <b>${component.setpoint}%</b>, ajuste a pressão de alimentação para <b>${pressaoRecomendada}</b>.`
        : 'Nenhuma fonte de entrada foi encontrada para aplicar o ajuste automaticamente.';
    const textoBombas = alerta.possuiBombasMontante
        ? ` Há ${alerta.quantidadeBombasMontante} bomba(s) no trecho de entrada; o ajuste automático atua apenas nas fontes de alimentação.`
        : '';

    painelAlerta.style.display = 'block';
    textoAlerta.innerHTML = `
        A saída do tanque atingiu o limite físico para o controle de nível.
        ${textoPressao}
        A vazão máxima estimada de saída no set point é <b>${formatMeasuredValue('flow', alerta.vazaoSaidaLimiteSetpointLps, 2)}</b>.
        ${textoModoAltura}${textoBombas}
    `;

    if (btnAjuste) {
        btnAjuste.style.display = 'inline-flex';
        btnAjuste.disabled = !alerta.autoAjustavel;
        btnAjuste.textContent = alerta.autoAjustavel
            ? (alerta.ajustesFonte.length === 1
                ? 'Aplicar na fonte de entrada'
                : `Aplicar nas ${alerta.ajustesFonte.length} fontes de entrada`)
            : 'Ajuste automático indisponível';
    }

    if (feedbackAjuste && !alerta.autoAjustavel && !feedbackAjuste.dataset.state) {
        feedbackAjuste.textContent = 'Conecte uma fonte de entrada para permitir o ajuste automático.';
        feedbackAjuste.style.color = '#a84300';
    } else if (feedbackAjuste && alerta.autoAjustavel && !feedbackAjuste.dataset.state) {
        feedbackAjuste.textContent = '';
    }
}

export function bindTankSaturationAlertActions(component, { onAdjustmentApplied } = {}) {
    if (!(component instanceof TanqueLogico)) return;

    const btnAjuste = document.getElementById('btn-aplicar-alerta-saturacao');
    const feedbackAjuste = document.getElementById('texto-acao-alerta-saturacao');
    if (!btnAjuste || !feedbackAjuste) return;

    btnAjuste.addEventListener('click', () => {
        const resultado = component.aplicarAjustePressaoSetpoint();
        if (resultado.aplicado) {
            feedbackAjuste.textContent = resultado.quantidadeFontes === 1
                ? 'Pressão de alimentação ajustada automaticamente.'
                : `Pressão ajustada automaticamente em ${resultado.quantidadeFontes} fontes de entrada.`;
            feedbackAjuste.style.color = '#1e8449';
            feedbackAjuste.dataset.state = 'success';
        } else {
            feedbackAjuste.textContent = resultado.motivo;
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
    const spAtivoEl = document.getElementById('input-sp-ativo');
    const statusEl = document.getElementById('tank-sp-status-text');
    const grp = document.getElementById('grp-sp-main');
    const kpGroup = document.getElementById('group-ctrl-params');
    const kiGroup = document.getElementById('group-ctrl-ki');

    if (spAtivoEl) {
        spAtivoEl.disabled = !diagnostico.podeAtivar;
        spAtivoEl.checked = component.setpointAtivo;
    }

    if (statusEl) {
        statusEl.textContent = diagnostico.podeAtivar
            ? 'O controlador usa a válvula de saída para modular o escoamento e estabilizar o nível.'
            : diagnostico.motivoBloqueio;
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
