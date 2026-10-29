// Placar de regime permanente GAAP × DWSIM.
//
// Importa cada template .dwxmz de `Testes/plantas dwsim/` pelo mesmo caminho do navegador
// (readDwsimFile → parseDwsimXml → translateDwsimToWorkspace → restoreFlowchartDocument),
// simula até o indicador de regime permanente e compara cada equipamento com os resultados
// que o próprio DWSIM gravou no XML. Não faz parte do `npm test`: o placar mede o quanto o
// GAAP ainda se afasta do DWSIM e deve virar teste quando tudo estiver dentro da tolerância.
//
// Uso: npm run validar:dwsim [-- arquivo.dwxmz ...]

import fs from 'node:fs';
import path from 'node:path';

import { SistemaSimulacao } from '../js/application/engine/SimulationEngine.js';
import { BombaLogica } from '../js/domain/components/BombaLogica.js';
import { TanqueLogico } from '../js/domain/components/TanqueLogico.js';
import { ValvulaLogica } from '../js/domain/components/ValvulaLogica.js';
import { restoreFlowchartDocument } from '../js/presentation/flowchart/FlowchartPersistence.js';
import {
    parseDwsimXml,
    readDwsimFile,
    translateDwsimToWorkspace
} from '../js/presentation/import/DwsimImporter.js';

const PLANTAS_DIR = path.resolve('Testes/plantas dwsim');
const PRESSAO_ATMOSFERICA_PA = 101325;
const PA_TO_BAR = 1e-5;
const DT_S = 0.1;
const TEMPO_MAXIMO_S = 1800;

// Tolerâncias: relativa (2%) com piso absoluto por unidade, para grandezas próximas de zero.
// Temperatura (°C) tem zero de escala arbitrário: só diferença absoluta. Pressão manométrica
// (barg) também, então os 2% incidem sobre a pressão ABSOLUTA, que tem zero físico.
const TOLERANCIA_RELATIVA = 0.02;
const PRESSAO_ATMOSFERICA_BAR = PRESSAO_ATMOSFERICA_PA * 1e-5;
// Abaixo disto a vazão é tratada como nula ao decidir se uma pressão do GAAP é comparável.
const VAZAO_NULA_LPS = 0.01;
// Densidade abaixo da qual a corrente do DWSIM é gás/vapor (líquidos usuais ficam acima de 500 kg/m³).
const DENSIDADE_MINIMA_LIQUIDO_KG_M3 = 100;
const TOLERANCIA_ABSOLUTA = {
    'L/s': 0.01,
    bar: 0.005,
    barg: 0.01,
    m: 0.05,
    kW: 0.05,
    '°C': 0.5
};

// ------------------------------------------------------------------
// Leitura dos resultados gravados pelo DWSIM
// ------------------------------------------------------------------

function filho(element, tag) {
    return element?.children?.find((child) => child.tagName === tag) || null;
}

function numeroFilho(element, tag) {
    const texto = String(filho(element, tag)?.textContent ?? '').trim();
    const value = texto ? Number(texto) : NaN;
    return Number.isFinite(value) ? value : null;
}

// Conversões que preservam a ausência do dado (null * k ou null - k viraria um número falso).
function escalar(valor, fator) {
    return valor === null ? null : valor * fator;
}

function kelvinParaCelsius(valor) {
    return valor === null ? null : valor - 273.15;
}

// Fase 0 da corrente (mistura): pressão absoluta (Pa), temperatura (K), vazão mássica e densidade.
function estadoCorrente(simObjects, streamName) {
    const element = simObjects.get(streamName)?.element;
    const fase = filho(filho(element, 'Phases'), 'Phase');
    // A fase traz mais de um bloco <Properties>; os resultados ficam no que contém a pressão.
    const props = fase?.children?.find((child) => child.tagName === 'Properties' && numeroFilho(child, 'pressure') !== null) || null;
    if (!props) return null;
    const massflow = numeroFilho(props, 'massflow');
    const density = numeroFilho(props, 'density');
    const pressurePa = numeroFilho(props, 'pressure');
    const temperatureK = numeroFilho(props, 'temperature');
    return {
        vazaoLps: massflow !== null && density > 0 ? (massflow / density) * 1000 : null,
        pressaoBarg: pressurePa !== null ? (pressurePa - PRESSAO_ATMOSFERICA_PA) * PA_TO_BAR : null,
        temperaturaC: kelvinParaCelsius(temperatureK),
        densidadeKgM3: density
    };
}

function tipoEquipamento(gObj) {
    const norm = String(gObj.objectType || '').toLowerCase();
    if (norm === 'pump') return 'pump';
    if (norm === 'valve') return 'valve';
    if (norm === 'tank') return 'tank';
    if (norm === 'heatexchanger') return 'heat_exchanger';
    if (norm === 'materialstream') {
        const temEntrada = gObj.inputs.length > 0;
        const temSaida = gObj.outputs.length > 0;
        if (temEntrada && !temSaida) return 'sink';
        if (!temEntrada && temSaida) return 'source';
    }
    return null;
}

// Para cada equipamento do DWSIM, as grandezas de referência que o GAAP também calcula.
function referenciasDwsim(parsed) {
    const { graphicObjects, simObjects } = parsed;
    const referencias = [];

    graphicObjects.forEach((gObj) => {
        const tipo = tipoEquipamento(gObj);
        if (!tipo) return;
        const sim = simObjects.get(gObj.name)?.element;
        const entrada = (indice = 0) => estadoCorrente(simObjects, gObj.inputs[indice]?.sourceName);
        const saida = (indice = 0) => estadoCorrente(simObjects, gObj.outputs[indice]?.targetName);
        const valores = {};

        if (tipo === 'pump') {
            valores.vazaoLps = entrada()?.vazaoLps;
            valores.deltaPBar = escalar(numeroFilho(sim, 'PressureIncrease'), PA_TO_BAR);
            valores.npshDisponivelM = numeroFilho(sim, 'NPSH');
            valores.pressaoSaidaBarg = saida()?.pressaoBarg;
        } else if (tipo === 'valve') {
            valores.vazaoLps = entrada()?.vazaoLps;
            valores.deltaPBar = escalar(numeroFilho(sim, 'DeltaP'), PA_TO_BAR);
            valores.pressaoSaidaBarg = saida()?.pressaoBarg;
        } else if (tipo === 'tank') {
            // No modo estacionário do DWSIM o tanque não acumula nem transborda.
            valores.vazaoLps = entrada()?.vazaoLps;
            valores.vazaoSaidaLps = saida()?.vazaoLps;
            valores.vazaoTransbordoLps = 0;
            valores.pressaoEntradaBarg = entrada()?.pressaoBarg;
            valores.pressaoSaidaBarg = saida()?.pressaoBarg;
        } else if (tipo === 'heat_exchanger') {
            // O importador liga o conector de entrada 0 do DWSIM à Corrente 1 do GAAP e o 1 à Corrente 2.
            valores.vazaoCorrente1Lps = entrada(0)?.vazaoLps;
            valores.vazaoCorrente2Lps = entrada(1)?.vazaoLps;
            valores.cargaTermicaKw = numeroFilho(sim, 'HeatDuty');
            valores.temperaturaSaidaQuenteC = kelvinParaCelsius(numeroFilho(sim, 'HotSideOutletTemperature'));
            valores.temperaturaSaidaFriaC = kelvinParaCelsius(numeroFilho(sim, 'ColdSideOutletTemperature'));
        } else if (tipo === 'source') {
            const propria = estadoCorrente(simObjects, gObj.name);
            valores.vazaoLps = propria?.vazaoLps;
            valores.vazaoMaximaFonteLps = propria?.vazaoLps;
            valores.pressaoFonteBarg = propria?.pressaoBarg;
        } else {
            const propria = estadoCorrente(simObjects, gObj.name);
            valores.vazaoLps = propria?.vazaoLps;
            valores.pressaoDrenoBarg = propria?.pressaoBarg;
        }

        // O GAAP só modela líquido. Uma corrente que o DWSIM resolveu como vapor (densidade de gás)
        // não é referência válida, mesmo que a vazão volumétrica coincida.
        const correntes = tipo === 'source' || tipo === 'sink'
            ? [gObj.name]
            : [...gObj.inputs.map((input) => input.sourceName), ...gObj.outputs.map((output) => output.targetName)];
        const faseVapor = correntes.some((nome) => {
            const densidade = estadoCorrente(simObjects, nome)?.densidadeKgM3;
            return densidade !== null && densidade !== undefined && densidade < DENSIDADE_MINIMA_LIQUIDO_KG_M3;
        });

        referencias.push({ tag: gObj.tag, tipo, valores, faseVapor });
    });

    return referencias;
}

// ------------------------------------------------------------------
// Grandezas equivalentes no GAAP
// ------------------------------------------------------------------

function valoresGaap(tipo, comp) {
    if (tipo === 'pump') {
        return {
            vazaoLps: comp.fluxoReal,
            deltaPBar: comp.cargaGeradaBar,
            npshDisponivelM: comp.npshDisponivelM,
            pressaoSaidaBarg: comp.pressaoDescargaAtualBar
        };
    }
    if (tipo === 'valve') {
        return {
            vazaoLps: comp.fluxoReal,
            // pressaoSaidaAtualBar é limitada a 0 barg; o ΔP próprio da válvula não sofre esse corte.
            deltaPBar: comp.deltaPAtualBar,
            pressaoSaidaBarg: comp.pressaoSaidaAtualBar
        };
    }
    if (tipo === 'tank') {
        return {
            vazaoLps: comp.lastQin,
            vazaoSaidaLps: comp.lastQout,
            vazaoTransbordoLps: comp.vazaoTransbordoLps,
            pressaoEntradaBarg: comp.pressaoEntradaAtualBar,
            pressaoSaidaBarg: comp.pressaoSaidaAtualBar
        };
    }
    if (tipo === 'heat_exchanger') {
        // O DWSIM identifica os lados por temperatura; no GAAP, o lado quente é o de maior entrada.
        // Só é confiável com as duas correntes escoando (ver motivoIncomparavel).
        const lado1Quente = comp.temperaturaEntradaC >= comp.temperaturaEntrada2C;
        return {
            vazaoCorrente1Lps: comp.vazao1Lps,
            vazaoCorrente2Lps: comp.vazao2Lps,
            cargaTermicaKw: comp.cargaTermicaW / 1000,
            temperaturaSaidaQuenteC: lado1Quente ? comp.temperaturaSaidaC : comp.temperaturaSaida2C,
            temperaturaSaidaFriaC: lado1Quente ? comp.temperaturaSaida2C : comp.temperaturaSaidaC
        };
    }
    if (tipo === 'source') {
        return {
            vazaoLps: comp.fluxoReal,
            vazaoMaximaFonteLps: comp.vazaoMaxima,
            pressaoFonteBarg: comp.pressaoFonteBar
        };
    }
    return { vazaoLps: comp.vazaoRecebidaLps, pressaoDrenoBarg: comp.pressaoSaidaBar };
}

// [nome, unidade, dado]. "entrada" = parâmetro que o importador traduz do DWSIM para o GAAP;
// "resultado" = grandeza que o solver do GAAP calcula. No modo estacionário o DWSIM especifica
// vazão e pressão da carga e calcula as pressões a jusante; o GAAP é dirigido por pressão, então
// recebe a pressão final do DWSIM como contorno do dreno e precisa reproduzir a vazão.
const GRANDEZAS = {
    vazaoLps: ['Vazão', 'L/s', 'resultado'],
    vazaoSaidaLps: ['Vazão de saída', 'L/s', 'resultado'],
    vazaoTransbordoLps: ['Transbordo', 'L/s', 'resultado'],
    vazaoCorrente1Lps: ['Vazão corrente 1', 'L/s', 'resultado'],
    vazaoCorrente2Lps: ['Vazão corrente 2', 'L/s', 'resultado'],
    deltaPBar: ['ΔP', 'bar', 'resultado'],
    npshDisponivelM: ['NPSH disponível', 'm', 'resultado'],
    pressaoEntradaBarg: ['P entrada', 'barg', 'resultado'],
    pressaoSaidaBarg: ['P saída', 'barg', 'resultado'],
    cargaTermicaKw: ['Carga térmica', 'kW', 'resultado'],
    temperaturaSaidaQuenteC: ['T saída quente', '°C', 'resultado'],
    temperaturaSaidaFriaC: ['T saída fria', '°C', 'resultado'],
    vazaoMaximaFonteLps: ['Vazão máxima da fonte', 'L/s', 'entrada'],
    pressaoFonteBarg: ['Pressão da fonte', 'barg', 'entrada'],
    pressaoDrenoBarg: ['Pressão do dreno', 'barg', 'entrada']
};

// ------------------------------------------------------------------
// Execução
// ------------------------------------------------------------------

async function lerTemplate(arquivo) {
    const buffer = fs.readFileSync(arquivo);
    const xml = await readDwsimFile({
        arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    });
    return parseDwsimXml(xml);
}

function simularAteRegime(engine) {
    engine.isRunning = true;
    let tempoS = 0;
    while (tempoS < TEMPO_MAXIMO_S) {
        engine.tickPipeline.advance(DT_S);
        tempoS += DT_S;
        if (engine.getSteadyStateStatus()?.steady) return { tempoS, regime: true };
    }
    return { tempoS, regime: false };
}

// Linhas que não podem ser julgadas: a grandeza do GAAP existe, mas não representa o mesmo
// estado que o DWSIM. Sem vazão, a pressão de um equipamento só copia o contorno vizinho; sem
// as duas correntes, o lado quente do trocador não é identificável.
function motivoIncomparavel(chave, gaap, valores, faseVapor) {
    if (faseVapor) return 'vapor no DWSIM';
    const ehPressao = chave === 'pressaoEntradaBarg' || chave === 'pressaoSaidaBarg';
    if (ehPressao && gaap.vazaoLps <= VAZAO_NULA_LPS && valores.vazaoLps > VAZAO_NULA_LPS) {
        return 'sem vazão no GAAP';
    }
    const ehTemperaturaTrocador = chave === 'temperaturaSaidaQuenteC' || chave === 'temperaturaSaidaFriaC';
    if (ehTemperaturaTrocador
        && !(gaap.vazaoCorrente1Lps > VAZAO_NULA_LPS && gaap.vazaoCorrente2Lps > VAZAO_NULA_LPS)) {
        return 'corrente sem vazão no GAAP';
    }
    return null;
}

function avaliar(gaap, dwsim, unidade) {
    if (!Number.isFinite(gaap) || !Number.isFinite(dwsim)) return { erro: '—', ok: false };
    const diferenca = gaap - dwsim;
    const absoluta = TOLERANCIA_ABSOLUTA[unidade] ?? 0;
    if (unidade === '°C') {
        return { erro: `${diferenca >= 0 ? '+' : ''}${diferenca.toFixed(2)} °C`, ok: Math.abs(diferenca) <= absoluta };
    }
    if (unidade === 'barg') {
        const pressaoAbsolutaBar = Math.abs(dwsim + PRESSAO_ATMOSFERICA_BAR);
        return {
            erro: `${diferenca >= 0 ? '+' : ''}${diferenca.toFixed(4)} bar`,
            ok: Math.abs(diferenca) <= Math.max(absoluta, TOLERANCIA_RELATIVA * pressaoAbsolutaBar)
        };
    }
    const ok = Math.abs(diferenca) <= Math.max(absoluta, TOLERANCIA_RELATIVA * Math.abs(dwsim));
    if (Math.abs(dwsim) <= 1e-12) {
        return { erro: `${diferenca >= 0 ? '+' : ''}${diferenca.toFixed(4)} ${unidade}`, ok };
    }
    const relativa = diferenca / Math.abs(dwsim);
    return { erro: `${relativa >= 0 ? '+' : ''}${(relativa * 100).toFixed(1)}%`, ok };
}

function formatar(valor) {
    return Number.isFinite(valor) ? valor.toFixed(4) : '—';
}

// O placar mede a importação como ela é; esta lista só deixa explícito com que configuração
// o GAAP rodou (por exemplo, o PID do DWSIM vira controle de nível ativo no GAAP, enquanto o
// modo estacionário do DWSIM mantém a abertura gravada da válvula).
function imprimirConfiguracao(engine) {
    console.log(`Solver: ${engine.modoSolver} | altura relativa: ${engine.usarAlturaRelativa ? 'sim' : 'não'}`);
    engine.componentes.forEach((comp) => {
        if (comp instanceof TanqueLogico) {
            const controle = comp.setpointAtivo ? `controle de nível ATIVO (SP ${comp.setpoint}%)` : 'sem controle de nível';
            console.log(`  ${comp.tag}: tanque ${comp.tipoTanque}, ${controle}, volume final ${comp.volumeAtual.toFixed(1)}/${comp.capacidadeMaxima} L`);
        } else if (comp instanceof BombaLogica) {
            console.log(`  ${comp.tag}: bomba ${comp.isOn ? 'ligada' : 'desligada'}, acionamento efetivo ${(comp.getDriveAtual() * 100).toFixed(0)}%`);
        } else if (comp instanceof ValvulaLogica) {
            console.log(`  ${comp.tag}: válvula, abertura comandada ${comp.grauAbertura}%, efetiva ${Number(comp.aberturaEfetiva).toFixed(1)}%`);
        }
    });
}

async function validarTemplate(arquivo) {
    const parsed = await lerTemplate(arquivo);
    const { workspace } = translateDwsimToWorkspace(parsed);
    const engine = new SistemaSimulacao();
    restoreFlowchartDocument(engine, workspace);
    const { tempoS, regime } = simularAteRegime(engine);

    console.log(`\n=== ${path.basename(arquivo)} ===`);
    console.log(regime
        ? `Regime permanente em t = ${tempoS.toFixed(1)} s`
        : `⚠ Sem regime permanente até t = ${TEMPO_MAXIMO_S} s; valores do último passo`);
    imprimirConfiguracao(engine);

    const linhas = [];
    const comparados = new Set();
    referenciasDwsim(parsed).forEach(({ tag, tipo, valores, faseVapor }) => {
        const candidatos = engine.componentes.filter((comp) => comp.tag === tag);
        if (candidatos.length !== 1) {
            linhas.push({ Equipamento: `${tag} (${tipo})`, Dado: '—', Grandeza: `(${candidatos.length} componentes com esta tag no GAAP)`, GAAP: '—', DWSIM: '—', Erro: '—', OK: '❓' });
            return;
        }
        comparados.add(candidatos[0]);
        const gaap = valoresGaap(tipo, candidatos[0]);
        Object.entries(valores).forEach(([chave, referencia]) => {
            const [nome, unidade, dado] = GRANDEZAS[chave];
            const motivo = motivoIncomparavel(chave, gaap, valores, faseVapor);
            const { erro, ok } = motivo ? { erro: motivo, ok: false } : avaliar(gaap[chave], referencia, unidade);
            linhas.push({
                Equipamento: `${tag} (${tipo})`,
                Dado: dado,
                Grandeza: `${nome} [${unidade}]`,
                GAAP: formatar(gaap[chave]),
                DWSIM: formatar(referencia),
                Erro: erro,
                OK: motivo ? '❓' : (ok ? '✅' : '❌')
            });
        });
    });

    console.table(linhas);
    const naoComparados = engine.componentes.filter((comp) => !comparados.has(comp));
    if (naoComparados.length > 0) {
        console.log(`⚠ Componentes do GAAP fora do placar: ${naoComparados.map((comp) => comp.tag).join(', ')}`);
    }
    const resultados = linhas.filter((linha) => linha.Dado === 'resultado');
    const entradas = linhas.filter((linha) => linha.Dado === 'entrada');
    const contar = (lista) => lista.filter((linha) => linha.OK === '✅').length;
    const indefinidos = resultados.filter((linha) => linha.OK === '❓').length;
    console.log(`Resultados dentro da tolerância: ${contar(resultados)}/${resultados.length}${indefinidos ? ` (${indefinidos} ❓ não comparáveis)` : ''}`);
    console.log(`Dados de entrada traduzidos corretamente: ${contar(entradas)}/${entradas.length}`);
    return {
        resultados: contar(resultados),
        totalResultados: resultados.length,
        entradas: contar(entradas),
        totalEntradas: entradas.length
    };
}

const argumentos = process.argv.slice(2);
const arquivos = argumentos.length > 0
    ? argumentos.map((arquivo) => path.resolve(arquivo))
    : fs.readdirSync(PLANTAS_DIR)
        .filter((nome) => nome.toLowerCase().endsWith('.dwxmz'))
        .map((nome) => path.join(PLANTAS_DIR, nome));

console.log(`Tolerância: ${TOLERANCIA_RELATIVA * 100}% (pisos absolutos: ${JSON.stringify(TOLERANCIA_ABSOLUTA)})`);
const placar = { resultados: 0, totalResultados: 0, entradas: 0, totalEntradas: 0 };
for (const arquivo of arquivos) {
    const resultado = await validarTemplate(arquivo);
    Object.keys(placar).forEach((chave) => {
        placar[chave] += resultado[chave];
    });
}
console.log(`\nPlacar geral: resultados ${placar.resultados}/${placar.totalResultados}, entradas ${placar.entradas}/${placar.totalEntradas}`);
