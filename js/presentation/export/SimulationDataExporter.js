import { BombaLogica } from '../../domain/components/BombaLogica.js';
import { DrenoLogico } from '../../domain/components/DrenoLogico.js';
import { FonteLogica } from '../../domain/components/FonteLogica.js';
import { TanqueLogico } from '../../domain/components/TanqueLogico.js';
import { TrocadorCalorLogico } from '../../domain/components/TrocadorCalorLogico.js';
import { ValvulaLogica } from '../../domain/components/ValvulaLogica.js';
import { getFluidVisualStyle } from '../../infrastructure/rendering/FluidVisualStyle.js';
import { formatUnitValue, getUnitPreferences, getUnitSymbol } from '../../utils/Units.js';

const EXPORT_METADATA_COLUMNS = [
    'Data da exportação',
    'Altura relativa'
];

const COMPONENT_COLUMNS = [
    'Nome do componente',
    'Tipo do componente',
    'ID',
    'Posição X',
    'Posição Y',
    'Entradas conectadas',
    'Saídas conectadas',
    'Diâmetro de conexão (m)',
    'Pressão de entrada atual (bar)',
    'Pressão de saída atual (bar)',
    'Vazão de entrada atual (L/s)',
    'Vazão de saída atual (L/s)',
    'Pressão de alimentação (bar)',
    'Vazão máxima da fonte (L/s)',
    'Vazão entregue pela fonte (L/s)',
    'Preset do fluido',
    'Nome do fluido',
    'Densidade do fluido (kg/m³)',
    'Temperatura do fluido (°C)',
    'Viscosidade dinâmica (Pa.s)',
    'Calor específico (J/kg.K)',
    'Pressão de vapor (bar)',
    'Pressão atmosférica (bar)',
    'Cor visual do fluido',
    'Pressão de descarga (bar)',
    'Perda de entrada K',
    'Vazão recebida (L/s)',
    'Bomba ligada',
    'Acionamento desejado (%)',
    'Acionamento efetivo (%)',
    'Vazão nominal da bomba (L/s)',
    'Pressão máxima da bomba (bar)',
    'Eficiência hidráulica nominal',
    'Eficiência atual',
    'NPSHr referência (m)',
    'NPSHr atual (m)',
    'NPSHa atual (m)',
    'Margem NPSH (m)',
    'Fator de cavitação',
    'Tempo de rampa (s)',
    'Carga gerada (bar)',
    'Pressão de sucção (bar)',
    'Pressão de descarga da bomba (bar)',
    'Válvula aberta',
    'Abertura desejada (%)',
    'Abertura efetiva (%)',
    'Coeficiente Cv',
    'Coeficiente de perda K',
    'Perfil da válvula',
    'Característica da válvula',
    'Rangeabilidade',
    'Tempo de curso (s)',
    'Queda de pressão na válvula (bar)',
    'Temperatura de serviço do trocador (°C)',
    'UA do trocador (W/K)',
    'Perda local do trocador K',
    'Efetividade máxima do trocador',
    'Efetividade atual do trocador',
    'Temperatura de entrada do trocador (°C)',
    'Temperatura de saída do trocador (°C)',
    'Delta T do trocador (°C)',
    'Carga térmica do trocador (W)',
    'Vazão no trocador (L/s)',
    'Queda de pressão no trocador (bar)',
    'Capacidade máxima do tanque (L)',
    'Volume atual do tanque (L)',
    'Nível do tanque (%)',
    'Altura útil do tanque (m)',
    'Altura líquida atual (m)',
    'Elevação do bocal de entrada (m)',
    'Elevação do bocal de saída (m)',
    'Coeficiente de descarga do tanque',
    'Perda de entrada do tanque K',
    'Pressão no fundo do tanque (bar)',
    'Vazão de entrada do tanque (L/s)',
    'Vazão de saída do tanque (L/s)',
    'Fluido no tanque',
    'Densidade do fluido no tanque (kg/m³)',
    'Temperatura do fluido no tanque (°C)',
    'Viscosidade do fluido no tanque (Pa.s)',
    'Cor visual do fluido no tanque',
    'Set point ativo',
    'Set point (%)',
    'Ganho proporcional Kp',
    'Ganho integral Ki',
    'Alerta de saturação ativo'
];

const CONNECTION_COLUMNS = [
    'Nome do trecho',
    'Componente de origem',
    'Tipo de origem',
    'Componente de destino',
    'Tipo de destino',
    'ID da conexão',
    'ID de origem',
    'ID de destino',
    'Diâmetro interno (m)',
    'Rugosidade absoluta (mm)',
    'Comprimento extra (m)',
    'Perda local K',
    'Velocidade de projeto (m/s)',
    'Vazão de projeto (L/s)',
    'Vazão atual (L/s)',
    'Vazão alvo (L/s)',
    'Velocidade atual (m/s)',
    'Delta P no trecho (bar)',
    'Perda total (bar)',
    'Pressão na origem (bar)',
    'Pressão de chegada (bar)',
    'Contrapressão (bar)',
    'Comprimento hidráulico total (m)',
    'Comprimento reto/esquemático (m)',
    'Desnível hidráulico (m)',
    'Tempo de resposta (s)',
    'Reynolds',
    'Fator de atrito Darcy',
    'Rugosidade relativa',
    'Regime',
    'Fluido no trecho',
    'Densidade do fluido (kg/m³)',
    'Viscosidade do fluido (Pa.s)',
    'Cor visual do fluido'
];

function numberValue(value, digits = null) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return '';
    return digits === null ? numericValue : numericValue.toFixed(digits);
}

function decimalPlaces(value) {
    const text = String(value ?? '');
    const [, decimals = ''] = text.split('.');
    return decimals.length || null;
}

function getUnitRule(column) {
    if (column.includes('(L/s)')) return { category: 'flow', sourceToBase: (value) => value };
    if (column.includes('(bar)')) return { category: 'pressure', sourceToBase: (value) => value };
    if (column.includes('(mm)')) return { category: 'length', sourceToBase: (value) => value / 1000 };
    if (column.includes('(m)')) return { category: 'length', sourceToBase: (value) => value };
    if (column.includes('(L)')) return { category: 'volume', sourceToBase: (value) => value };
    if (column.includes('(°C)')) {
        return {
            category: 'temperature',
            sourceToBase: (value) => value,
            isDelta: column.includes('Delta T')
        };
    }

    return null;
}

function displayColumnName(column) {
    const rule = getUnitRule(column);
    if (!rule) return column;

    return column.replace(/\((L\/s|bar|mm|m|L|°C)\)/, `(${getUnitSymbol(rule.category)})`);
}

function formatTemperatureDelta(value, digits) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return '';

    const convertedValue = getUnitPreferences().temperature === 'f'
        ? numericValue * (9 / 5)
        : numericValue;

    return convertedValue.toFixed(digits ?? 2);
}

function displayCellValue(column, value) {
    const rule = getUnitRule(column);
    if (!rule || value === '') return value;

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return value;

    const digits = decimalPlaces(value);
    if (rule.isDelta) return formatTemperatureDelta(numericValue, digits);
    return formatUnitValue(rule.category, rule.sourceToBase(numericValue), digits);
}

function displayUnitRows(rows) {
    return rows.map((row) => Object.fromEntries(
        Object.entries(row).map(([column, value]) => [
            displayColumnName(column),
            displayCellValue(column, value)
        ])
    ));
}

function displayUnitColumns(columns) {
    return columns.map((column) => displayColumnName(column));
}

function booleanValue(value) {
    return value ? 'Sim' : 'Não';
}

function heightModeValue(value) {
    return value ? 'Ligada' : 'Desligada';
}

function buildExportMetadataRows(engine, timestamp) {
    return [{
        'Data da exportação': timestamp.toLocaleString('pt-BR'),
        'Altura relativa': heightModeValue(engine?.usarAlturaRelativa === true)
    }];
}

function listTags(components = []) {
    return components.map((component) => component?.tag || component?.id).filter(Boolean).join(', ');
}

function getComponentType(component) {
    if (component instanceof FonteLogica) return 'Entrada';
    if (component instanceof DrenoLogico) return 'Saída';
    if (component instanceof BombaLogica) return 'Bomba';
    if (component instanceof ValvulaLogica) return 'Válvula';
    if (component instanceof TrocadorCalorLogico) return 'Trocador de calor';
    if (component instanceof TanqueLogico) return 'Tanque';
    return 'Componente';
}

function assignFluidColumns(row, prefix, fluid) {
    if (!fluid) return;

    row[`${prefix}Nome do fluido`] = fluid.nome || '';
    row[`${prefix}Densidade do fluido (kg/m³)`] = numberValue(fluid.densidade, 3);
    row[`${prefix}Temperatura do fluido (°C)`] = numberValue(fluid.temperatura, 3);
    row[`${prefix}Viscosidade dinâmica (Pa.s)`] = numberValue(fluid.viscosidadeDinamicaPaS, 6);
    row[`${prefix}Calor específico (J/kg.K)`] = numberValue(fluid.calorEspecificoJkgK, 3);
    row[`${prefix}Pressão de vapor (bar)`] = numberValue(fluid.pressaoVaporBar, 5);
    row[`${prefix}Pressão atmosférica (bar)`] = numberValue(fluid.pressaoAtmosfericaBar, 5);
    row[`${prefix}Cor visual do fluido`] = getFluidVisualStyle(fluid).stroke;
}

function buildBaseComponentRow(component) {
    return {
        'Nome do componente': component.tag || '',
        'Tipo do componente': getComponentType(component),
        ID: component.id || '',
        'Posição X': numberValue(component.x, 2),
        'Posição Y': numberValue(component.y, 2),
        'Entradas conectadas': listTags(component.inputs),
        'Saídas conectadas': listTags(component.outputs),
        'Diâmetro de conexão (m)': numberValue(component.diametroConexaoM, 5),
        'Pressão de entrada atual (bar)': numberValue(component.pressaoEntradaAtualBar, 5),
        'Pressão de saída atual (bar)': numberValue(component.pressaoSaidaAtualBar, 5),
        'Vazão de entrada atual (L/s)': numberValue(component.estadoHidraulico?.entradaVazaoLps, 5),
        'Vazão de saída atual (L/s)': numberValue(component.estadoHidraulico?.saidaVazaoLps, 5)
    };
}

function buildComponentRow(component) {
    const row = buildBaseComponentRow(component);

    if (component instanceof FonteLogica) {
        row['Pressão de alimentação (bar)'] = numberValue(component.pressaoFonteBar, 5);
        row['Vazão máxima da fonte (L/s)'] = numberValue(component.vazaoMaxima, 5);
        row['Vazão entregue pela fonte (L/s)'] = numberValue(component.fluxoReal, 5);
        row['Preset do fluido'] = component.fluidoEntradaPresetId || '';
        assignFluidColumns(row, '', component.fluidoEntrada);
    }

    if (component instanceof DrenoLogico) {
        row['Pressão de descarga (bar)'] = numberValue(component.pressaoSaidaBar, 5);
        row['Perda de entrada K'] = numberValue(component.perdaEntradaK, 5);
        row['Vazão recebida (L/s)'] = numberValue(component.vazaoRecebidaLps, 5);
    }

    if (component instanceof BombaLogica) {
        row['Bomba ligada'] = booleanValue(component.isOn);
        row['Acionamento desejado (%)'] = numberValue(component.grauAcionamento, 3);
        row['Acionamento efetivo (%)'] = numberValue(component.acionamentoEfetivo, 3);
        row['Vazão nominal da bomba (L/s)'] = numberValue(component.vazaoNominal, 5);
        row['Pressão máxima da bomba (bar)'] = numberValue(component.pressaoMaxima, 5);
        row['Eficiência hidráulica nominal'] = numberValue(component.eficienciaHidraulica, 5);
        row['Eficiência atual'] = numberValue(component.eficienciaAtual, 5);
        row['NPSHr referência (m)'] = numberValue(component.npshRequeridoM, 5);
        row['NPSHr atual (m)'] = numberValue(component.npshRequeridoAtualM, 5);
        row['NPSHa atual (m)'] = numberValue(component.npshDisponivelM, 5);
        row['Margem NPSH (m)'] = numberValue(component.margemNpshM, 5);
        row['Fator de cavitação'] = numberValue(component.fatorCavitacaoAtual, 5);
        row['Tempo de rampa (s)'] = numberValue(component.tempoRampaSegundos, 5);
        row['Carga gerada (bar)'] = numberValue(component.cargaGeradaBar, 5);
        row['Pressão de sucção (bar)'] = numberValue(component.pressaoSucaoAtualBar, 5);
        row['Pressão de descarga da bomba (bar)'] = numberValue(component.pressaoDescargaAtualBar, 5);
    }

    if (component instanceof ValvulaLogica) {
        row['Válvula aberta'] = booleanValue(component.aberta);
        row['Abertura desejada (%)'] = numberValue(component.grauAbertura, 3);
        row['Abertura efetiva (%)'] = numberValue(component.aberturaEfetiva, 3);
        row['Coeficiente Cv'] = numberValue(component.cv, 5);
        row['Coeficiente de perda K'] = numberValue(component.perdaLocalK, 5);
        row['Perfil da válvula'] = component.perfilCaracteristica || '';
        row['Característica da válvula'] = component.tipoCaracteristica || '';
        row.Rangeabilidade = numberValue(component.rangeabilidade, 5);
        row['Tempo de curso (s)'] = numberValue(component.tempoCursoSegundos, 5);
        row['Queda de pressão na válvula (bar)'] = numberValue(component.deltaPAtualBar, 5);
    }

    if (component instanceof TrocadorCalorLogico) {
        row['Temperatura de serviço do trocador (°C)'] = numberValue(component.temperaturaServicoC, 3);
        row['UA do trocador (W/K)'] = numberValue(component.uaWPorK, 3);
        row['Perda local do trocador K'] = numberValue(component.perdaLocalK, 5);
        row['Efetividade máxima do trocador'] = numberValue(component.efetividadeMaxima, 5);
        row['Efetividade atual do trocador'] = numberValue(component.efetividadeAtual, 5);
        row['Temperatura de entrada do trocador (°C)'] = numberValue(component.temperaturaEntradaC, 3);
        row['Temperatura de saída do trocador (°C)'] = numberValue(component.temperaturaSaidaC, 3);
        row['Delta T do trocador (°C)'] = numberValue(component.deltaTemperaturaC, 3);
        row['Carga térmica do trocador (W)'] = numberValue(component.cargaTermicaW, 3);
        row['Vazão no trocador (L/s)'] = numberValue(component.fluxoReal, 5);
        row['Queda de pressão no trocador (bar)'] = numberValue(component.deltaPAtualBar, 5);
    }

    if (component instanceof TanqueLogico) {
        const fluid = component.getFluidoConteudo?.() || component.fluidoConteudo;
        row['Capacidade máxima do tanque (L)'] = numberValue(component.capacidadeMaxima, 5);
        row['Volume atual do tanque (L)'] = numberValue(component.volumeAtual, 5);
        row['Nível do tanque (%)'] = numberValue(component.getNivelNormalizado?.() * 100, 3);
        row['Altura útil do tanque (m)'] = numberValue(component.alturaUtilMetros, 5);
        row['Altura líquida atual (m)'] = numberValue(component.getAlturaLiquidoM?.(), 5);
        row['Elevação do bocal de entrada (m)'] = numberValue(component.alturaBocalEntradaM, 5);
        row['Elevação do bocal de saída (m)'] = numberValue(component.alturaBocalSaidaM, 5);
        row['Coeficiente de descarga do tanque'] = numberValue(component.coeficienteSaida, 5);
        row['Perda de entrada do tanque K'] = numberValue(component.perdaEntradaK, 5);
        row['Pressão no fundo do tanque (bar)'] = numberValue(component.pressaoFundoBar, 5);
        row['Vazão de entrada do tanque (L/s)'] = numberValue(component.lastQin, 5);
        row['Vazão de saída do tanque (L/s)'] = numberValue(component.lastQout, 5);
        row['Fluido no tanque'] = fluid?.nome || '';
        row['Densidade do fluido no tanque (kg/m³)'] = numberValue(fluid?.densidade, 3);
        row['Temperatura do fluido no tanque (°C)'] = numberValue(fluid?.temperatura, 3);
        row['Viscosidade do fluido no tanque (Pa.s)'] = numberValue(fluid?.viscosidadeDinamicaPaS, 6);
        row['Cor visual do fluido no tanque'] = fluid ? getFluidVisualStyle(fluid).stroke : '';
        row['Set point ativo'] = booleanValue(component.setpointAtivo);
        row['Set point (%)'] = numberValue(component.setpoint, 3);
        row['Ganho proporcional Kp'] = numberValue(component.kp, 5);
        row['Ganho integral Ki'] = numberValue(component.ki, 5);
        row['Alerta de saturação ativo'] = booleanValue(component.alertaSaturacao?.ativo);
    }

    return row;
}

function buildConnectionRow(engine, connection, index) {
    const source = engine.getComponentById(connection.sourceId);
    const target = engine.getComponentById(connection.targetId);
    const state = engine.getConnectionState(connection);
    const geometry = engine.getConnectionGeometry(connection);
    const fluid = state?.fluid || engine.hydraulicContext?.getConnectionFluid?.(connection);

    return {
        'Nome do trecho': `Trecho ${index + 1}`,
        'Componente de origem': source?.tag || connection.sourceId || '',
        'Tipo de origem': source ? getComponentType(source) : '',
        'Componente de destino': target?.tag || connection.targetId || '',
        'Tipo de destino': target ? getComponentType(target) : '',
        'ID da conexão': connection.id || '',
        'ID de origem': connection.sourceId || '',
        'ID de destino': connection.targetId || '',
        'Diâmetro interno (m)': numberValue(connection.diameterM, 5),
        'Rugosidade absoluta (mm)': numberValue(connection.roughnessMm, 5),
        'Comprimento extra (m)': numberValue(connection.extraLengthM, 5),
        'Perda local K': numberValue(connection.perdaLocalK, 5),
        'Velocidade de projeto (m/s)': numberValue(connection.designVelocityMps, 5),
        'Vazão de projeto (L/s)': numberValue(connection.designFlowLps, 5),
        'Vazão atual (L/s)': numberValue(state?.flowLps, 5),
        'Vazão alvo (L/s)': numberValue(state?.targetFlowLps, 5),
        'Velocidade atual (m/s)': numberValue(state?.velocityMps, 5),
        'Delta P no trecho (bar)': numberValue(state?.deltaPBar, 5),
        'Perda total (bar)': numberValue(state?.totalLossBar, 5),
        'Pressão na origem (bar)': numberValue(state?.sourcePressureBar, 5),
        'Pressão de chegada (bar)': numberValue(state?.outletPressureBar, 5),
        'Contrapressão (bar)': numberValue(state?.backPressureBar, 5),
        'Comprimento hidráulico total (m)': numberValue(geometry?.lengthM ?? state?.lengthM, 5),
        'Comprimento reto/esquemático (m)': numberValue(geometry?.straightLengthM ?? state?.straightLengthM, 5),
        'Desnível hidráulico (m)': numberValue(geometry?.headGainM ?? state?.headGainM, 5),
        'Tempo de resposta (s)': numberValue(state?.responseTimeS, 5),
        Reynolds: numberValue(state?.reynolds, 2),
        'Fator de atrito Darcy': numberValue(state?.frictionFactor, 6),
        'Rugosidade relativa': numberValue(state?.relativeRoughness, 8),
        Regime: state?.regime || '',
        'Fluido no trecho': fluid?.nome || '',
        'Densidade do fluido (kg/m³)': numberValue(fluid?.densidade, 3),
        'Viscosidade do fluido (Pa.s)': numberValue(fluid?.viscosidadeDinamicaPaS, 6),
        'Cor visual do fluido': fluid ? getFluidVisualStyle(fluid).stroke : ''
    };
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderTable(title, columns, rows) {
    const header = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('');
    const body = rows.length > 0
        ? rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join('')}</tr>`).join('')
        : `<tr>${columns.map(() => '<td></td>').join('')}</tr>`;

    return `
        <h2>${escapeHtml(title)}</h2>
        <table>
            <thead><tr>${header}</tr></thead>
            <tbody>${body}</tbody>
        </table>
    `;
}

export function buildExportHtml(engine) {
    const timestamp = new Date();
    const metadataRows = buildExportMetadataRows(engine, timestamp);
    const componentRows = displayUnitRows(engine.componentes.map(buildComponentRow));
    const connectionRows = displayUnitRows(engine.conexoes.map((connection, index) => buildConnectionRow(engine, connection, index)));
    const componentColumns = displayUnitColumns(COMPONENT_COLUMNS);
    const connectionColumns = displayUnitColumns(CONNECTION_COLUMNS);

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; color: #1f2d3a; }
        h1 { font-size: 18px; }
        h2 { font-size: 15px; margin-top: 22px; }
        table { border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid #b8c7d3; padding: 5px 8px; font-size: 11px; vertical-align: top; }
        th { background: #eaf2f8; font-weight: 700; }
    </style>
</head>
<body>
    <h1>Exportação de Dados - GAAP Virtual Lab</h1>
    ${renderTable('Resumo da exportação', EXPORT_METADATA_COLUMNS, metadataRows)}
    ${renderTable('Componentes', componentColumns, componentRows)}
    ${renderTable('Conexões', connectionColumns, connectionRows)}
</body>
</html>`;
}

function buildFilename() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `gaap-virtual-lab-dados-${stamp}.xls`;
}

export function exportSimulationData(engine) {
    if (!engine || typeof document === 'undefined') return false;

    const html = buildExportHtml(engine);
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = buildFilename();
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return true;
}
