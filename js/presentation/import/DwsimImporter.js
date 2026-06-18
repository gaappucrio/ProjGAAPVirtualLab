// =============================================
// IMPORT: Tradutor de simulações DWSIM (.dwxmz / .dwxm) para o workspace GAAP
// Arquivo: js/presentation/import/DwsimImporter.js
// =============================================
//
// O formato .dwxmz é um arquivo ZIP contendo um arquivo .xml (fluxograma)
// e um arquivo .db (banco de dados de compostos). Este módulo:
//   1. Lê o arquivo (ZIP ou XML puro).
//   2. Extrai o XML interno (via DecompressionStream 'deflate-raw').
//   3. Faz o parse dos SimulationObjects (propriedades) e GraphicObjects (layout/conexões).
//   4. Traduz a topologia para o modelo do GAAP:
//        - DWSIM Pump                            -> GAAP Bomba (pump)
//        - DWSIM Valve                           -> GAAP Válvula (valve)
//        - DWSIM Tank                            -> GAAP Tanque (tank)
//        - DWSIM MaterialStream sem upstream     -> GAAP Fonte (source)
//        - DWSIM MaterialStream sem downstream   -> GAAP Dreno (sink)
//        - DWSIM Pipe (PipeSegment)              -> parâmetros do Cano GAAP
//                                                   (diâmetro, comprimento, rugosidade)
//        - Demais tipos (EnergyStream, PIDController, LevelGauge, etc.) são ignorados.
//   5. Monta um workspace snapshot compatível com restoreWorkspaceSnapshot().

import {
    DEFAULT_PIPE_DIAMETER_M,
    DEFAULT_PIPE_EXTRA_LENGTH_M,
    DEFAULT_PIPE_MINOR_LOSS,
    DEFAULT_PIPE_ROUGHNESS_MM,
    DEFAULT_DESIGN_VELOCITY_MPS,
    DEFAULT_SOURCE_MAX_FLOW_LPS,
    DEFAULT_SOURCE_PRESSURE_BAR
} from '../../domain/units/HydraulicUnits.js';

// ----- Conversões de unidade DWSIM -> GAAP -----
const PA_TO_BAR = 1e-5;
const M3S_TO_LPS = 1000;
const M3_TO_L = 1000;
const M_TO_MM = 1000;
const INCH_TO_M = 0.0254;
const KV_PER_CV = 0.8649786130809; // 1 Cv = 1.156 Kv  -> Kv = Cv * 0.865

// ----- Offset de posicionamento (evita componentes colados no canto) -----
const POSITION_ORIGIN_X = 120;
const POSITION_ORIGIN_Y = 120;

// ----- Tipos DWSIM que viram componentes GAAP -----
const DWSIM_EQUIPMENT_MAP = {
    Pump: 'pump',
    Valve: 'valve',
    Tank: 'tank'
};

const SOURCE_COMPONENT_TYPE = 'source';
const SINK_COMPONENT_TYPE = 'sink';

// ============================================================
// LEITURA DE ARQUIVO
// ============================================================

/**
 * Lê um arquivo DWSIM (.dwxmz ZIP ou .dwxm XML puro) e devolve o XML interno como texto.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function readDwsimFile(file) {
    if (!file) throw new Error('Nenhum arquivo fornecido.');

    const buffer = await file.arrayBuffer();

    // Detecta ZIP pela assinatura PK\x03\x04 (independente da extensão).
    const view = new DataView(buffer);
    let isZip = false;
    if (view.byteLength >= 4) {
        const signature = view.getUint32(0, true);
        isZip = signature === 0x04034b50;
    }

    if (isZip) {
        return await extractXmlFromZip(buffer);
    }
    // Caso contrário, trata como XML puro.
    return new TextDecoder('utf-8').decode(new Uint8Array(buffer));
}

/**
 * Percorre os local file headers de um ZIP e devolve o conteúdo do primeiro .xml encontrado.
 * Suporta armazenamento (method=0) e DEFLATE (method=8) via DecompressionStream.
 */
async function extractXmlFromZip(buffer) {
    const view = new DataView(buffer);
    let offset = 0;
    const decoder = new TextDecoder('utf-8');

    while (offset + 30 <= view.byteLength) {
        const signature = view.getUint32(offset, true);
        if (signature !== 0x04034b50) break; // Não é mais um local file header

        const compressionMethod = view.getUint16(offset + 8, true);
        const compressedSize = view.getUint32(offset + 18, true);
        const filenameLength = view.getUint16(offset + 26, true);
        const extraFieldLength = view.getUint16(offset + 28, true);

        const filenameStart = offset + 30;
        const filename = decoder.decode(new Uint8Array(buffer, filenameStart, filenameLength));

        const dataStart = filenameStart + filenameLength + extraFieldLength;
        const compressedData = new Uint8Array(buffer, dataStart, compressedSize);

        if (filename.toLowerCase().endsWith('.xml')) {
            let bytes;
            if (compressionMethod === 0) {
                bytes = compressedData;
            } else if (compressionMethod === 8) {
                bytes = await decompressDeflateRaw(compressedData);
            } else {
                throw new Error(`Método de compressão não suportado: ${compressionMethod}`);
            }
            return decoder.decode(bytes);
        }

        offset = dataStart + compressedSize;
    }

    throw new Error('Nenhum arquivo XML encontrado dentro do .dwxmz.');
}

async function decompressDeflateRaw(compressedData) {
    if (typeof globalThis.DecompressionStream === 'undefined') {
        throw new Error('DecompressionStream não disponível neste navegador.');
    }
    const stream = new DecompressionStream('deflate-raw');
    const writer = stream.writable.getWriter();
    writer.write(compressedData);
    writer.close();

    const reader = stream.readable.getReader();
    const chunks = [];
    let totalLength = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLength += value.length;
    }
    const result = new Uint8Array(totalLength);
    let pos = 0;
    for (const chunk of chunks) {
        result.set(chunk, pos);
        pos += chunk.length;
    }
    return result;
}

// ============================================================
// PARSE DO XML
// ============================================================

function queryNumeric(parent, tag, fallback = 0) {
    if (!parent || typeof parent.querySelector !== 'function') return fallback;
    const el = parent.querySelector(`:scope > ${tag}`);
    if (!el) return fallback;
    const value = Number(el.textContent);
    return Number.isFinite(value) ? value : fallback;
}

function queryString(parent, tag, fallback = '') {
    if (!parent || typeof parent.querySelector !== 'function') return fallback;
    const el = parent.querySelector(`:scope > ${tag}`);
    return el ? String(el.textContent || '') : fallback;
}

function queryAllDirect(parent, tag) {
    if (!parent || typeof parent.querySelectorAll !== 'function') return [];
    return Array.from(parent.querySelectorAll(`:scope > ${tag}`));
}

/**
 * Extrai todas as SimulationObjects e devolve um mapa ComponentName -> { element, type, name, componentName }.
 * A chave de ligação com GraphicObject é <ComponentName> (ID estável) — cai para o último <Name> se ausente.
 */
function extractSimulationObjects(doc) {
    const map = new Map();
    const blocks = doc.querySelectorAll('SimulationObjects > SimulationObject, SimulationObject');
    blocks.forEach((el) => {
        const type = queryString(el, 'Type');
        const componentName = queryString(el, 'ComponentName');
        const names = queryAllDirect(el, 'Name').map((n) => n.textContent);
        const lastName = names.length ? names[names.length - 1] : '';
        const key = componentName || lastName;
        if (!key) return;
        if (map.has(key)) return; // mantém a primeira ocorrência (versão base)
        map.set(key, {
            element: el,
            type,
            componentName,
            name: lastName
        });
    });
    return map;
}

/**
 * Extrai os GraphicObjects (canvas): posição, tamanho e conectores.
 *
 * Convenção DWSIM:
 *   InputConnectors usam ConnType="ConIn" com atributo AttachedFromObjID (origem).
 *   OutputConnectors usam ConnType="ConOut" com atributo AttachedToObjID (destino).
 *   ConType="ConEn" (energia) é ignorado — o GAAP não tem fluxo de energia.
 */
function extractGraphicObjects(doc) {
    const map = new Map();
    const blocks = doc.querySelectorAll('GraphicObjects > GraphicObject, GraphicObject');
    blocks.forEach((el) => {
        const type = queryString(el, 'Type');
        const name = queryString(el, 'Name');
        if (!name) return;

        const objectType = queryString(el, 'ObjectType');
        const x = queryNumeric(el, 'X', 0);
        const y = queryNumeric(el, 'Y', 0);
        const width = queryNumeric(el, 'Width', 20);
        const height = queryNumeric(el, 'Height', 20);
        const tag = queryString(el, 'Tag');

        const inputs = [];
        const outputs = [];

        const inputConnectors = el.querySelector(':scope > InputConnectors');
        if (inputConnectors) {
            inputConnectors.querySelectorAll(':scope > Connector').forEach((conn) => {
                if (conn.getAttribute('IsAttached') !== 'true') return;
                const connType = conn.getAttribute('ConnType') || 'ConIn';
                if (connType === 'ConEn') return; // ignora energia
                const sourceName = conn.getAttribute('AttachedFromObjID');
                if (!sourceName) return;
                inputs.push({
                    sourceName,
                    connIndex: parseInt(conn.getAttribute('AttachedFromConnIndex') || '0', 10)
                });
            });
        }

        const outputConnectors = el.querySelector(':scope > OutputConnectors');
        if (outputConnectors) {
            outputConnectors.querySelectorAll(':scope > Connector').forEach((conn) => {
                if (conn.getAttribute('IsAttached') !== 'true') return;
                const connType = conn.getAttribute('ConnType') || 'ConOut';
                if (connType === 'ConEn') return; // ignora energia
                const targetName = conn.getAttribute('AttachedToObjID');
                if (!targetName) return;
                outputs.push({
                    targetName,
                    connIndex: parseInt(conn.getAttribute('AttachedToConnIndex') || '0', 10)
                });
            });
        }

        map.set(name, {
            name,
            type,
            objectType,
            x,
            y,
            width,
            height,
            tag,
            inputs,
            outputs,
            element: el
        });
    });
    return map;
}

/**
 * Ponto de entrada para o parse: devolve { graphicObjects, simObjects }.
 */
export function parseDwsimXml(xmlText) {
    if (typeof globalThis.DOMParser === 'undefined') {
        throw new Error('DOMParser não disponível neste ambiente.');
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) {
        throw new Error('XML DWSIM inválido: ' + parseError.textContent.slice(0, 200));
    }

    const graphicObjects = extractGraphicObjects(doc);
    const simObjects = extractSimulationObjects(doc);

    return { graphicObjects, simObjects };
}

// ============================================================
// EXTRAÇÃO DE PARÂMETROS POR TIPO
// ============================================================

function findDimensionValue(simEl, dimensionName) {
    if (!simEl) return null;
    const dimensions = simEl.querySelector(':scope > Dimensions');
    if (!dimensions) return null;
    const dimensionEls = dimensions.querySelectorAll(':scope > Dimension');
    for (const dim of dimensionEls) {
        const name = queryString(dim, 'Name');
        if (name === dimensionName) {
            const value = Number(queryString(dim, 'Value'));
            if (Number.isFinite(value)) return value;
        }
    }
    return null;
}

function findDynamicProperty(simEl, propertyName) {
    if (!simEl) return null;
    const dyn = simEl.querySelector(':scope > DynamicProperties');
    if (!dyn) return null;
    // Itens podem estar como <Item>...</Item> direto ou dentro de estruturas aninhadas.
    const candidates = dyn.querySelectorAll('Item');
    for (const item of candidates) {
        const name = queryString(item, 'Name');
        if (name === propertyName) {
            const data = queryString(item, 'Data');
            const numeric = Number(data);
            if (Number.isFinite(numeric)) return numeric;
        }
    }
    return null;
}

function pumpParameters(simEl) {
    // DWSIM: Pressão em Pa, vazão em m³/s.
    // GAAP:  Pressão em bar, vazão em L/s.
    const pressureIncreasePa = queryNumeric(simEl, 'PressureIncrease', 0)
        || queryNumeric(simEl, 'DeltaP', 0);
    const curveFlowM3s = queryNumeric(simEl, 'CurveFlow', 0)
        || findDimensionValue(simEl, 'Flow')
        || 0;
    const efficiency = queryNumeric(simEl, 'Efficiency', 0)
        || queryNumeric(simEl, 'CurveEff', 0)
        || findDimensionValue(simEl, 'Efficiency')
        || 0;
    const curveNpshrM = queryNumeric(simEl, 'CurveNPSHr', 0)
        || queryNumeric(simEl, 'NPSH', 0)
        || 0;

    const pressaoMaximaBar = Math.max(0.05, pressureIncreasePa * PA_TO_BAR);
    const vazaoNominalLps = Math.max(0.1, curveFlowM3s * M3S_TO_LPS);
    const eficienciaHidraulica = clamp(efficiency / 100, 0.18, 0.95) || 0.78;
    const npshRequeridoM = Math.max(0.05, curveNpshrM) || 2.5;

    return {
        isOn: false,
        grauAcionamento: 0,
        acionamentoEfetivo: 0,
        vazaoNominal: vazaoNominalLps,
        pressaoMaxima: pressaoMaximaBar,
        eficienciaHidraulica,
        eficienciaAtual: eficienciaHidraulica,
        npshRequeridoM,
        npshRequeridoAtualM: npshRequeridoM,
        tempoRampaSegundos: 1.6,
        fracaoMelhorEficiencia: 0.72
    };
}

function valveParameters(simEl) {
    // DWSIM usa Kv; GAAP usa Cv internamente (Cv = Kv / 0.865).
    const kv = queryNumeric(simEl, 'Kv', 0) || queryNumeric(simEl, 'ActualKv', 0);
    const openingPct = queryNumeric(simEl, 'OpeningPct', 0)
        || queryNumeric(simEl, 'OutputAbs', 0)
        || 0;
    const characteristic = queryString(simEl, 'DefinedOpeningKvRelationShipType', 'EqualPercentage');

    const cv = kv > 0 ? kv / KV_PER_CV : 160;
    const tipoCaracteristica = mapValveCharacteristic(characteristic);
    const grauAbertura = clamp(openingPct, 0, 100);

    return {
        aberta: grauAbertura > 0.5,
        grauAbertura,
        aberturaEfetiva: grauAbertura,
        cv: Math.max(0.05, cv),
        unidadeCoeficienteVazao: 'cv',
        perdaLocalK: 0,
        considerarPerdaEstrangulamento: false,
        perfilCaracteristica: 'custom',
        tipoCaracteristica,
        rangeabilidade: 30,
        tempoCursoSegundos: 6.0
    };
}

function mapValveCharacteristic(dwsimCharacteristic) {
    const normalized = String(dwsimCharacteristic || '').toLowerCase().replace(/[^a-z]/g, '');
    if (normalized.includes('quick')) return 'quick_opening';
    if (normalized.includes('linear')) return 'linear';
    return 'equal_percentage';
}

function tankParameters(simEl) {
    // DWSIM Volume em m³; GAAP capacidadeMaxima em litros.
    const volumeM3 = queryNumeric(simEl, 'Volume', 0)
        || findDimensionValue(simEl, 'Volume')
        || 0;
    const alturaM = findDynamicProperty(simEl, 'Height')
        || queryNumeric(simEl, 'TankHeight', 0)
        || 2.4;
    const liquidLevelM = findDynamicProperty(simEl, 'Liquid Level')
        || queryNumeric(simEl, 'LiquidLevel', 0)
        || 0;

    const capacidadeMaximaL = Math.max(10, volumeM3 * M3_TO_L);
    const alturaUtilMetros = Math.max(0.5, alturaM);
    const alturaBocalEntradaM = Math.min(alturaUtilMetros * 0.9, alturaUtilMetros - 0.2);
    const alturaBocalSaidaM = Math.min(0.2, alturaUtilMetros * 0.1);
    const volumeAtualL = (clamp(liquidLevelM, 0, alturaUtilMetros) / alturaUtilMetros) * capacidadeMaximaL;

    return {
        capacidadeMaxima: capacidadeMaximaL,
        volumeAtual: volumeAtualL,
        volumeInicial: volumeAtualL,
        alturaUtilMetros,
        coeficienteSaida: 0.82,
        alturaBocalEntradaM,
        alturaBocalSaidaM,
        setpointAtivo: false,
        setpoint: 50,
        kp: 4,
        ki: 0.6,
        kd: 0
    };
}

function sourceParameters(simEl) {
    const pressurePa = findDimensionValue(simEl, 'Pressure')
        || queryNumeric(simEl, 'Pressure', 0)
        || 0;
    const flowM3s = findDimensionValue(simEl, 'Flow')
        || queryNumeric(simEl, 'VolumetricFlow', 0)
        || 0;

    const pressaoFonteBar = pressurePa > 0
        ? Math.max(0.01, pressurePa * PA_TO_BAR)
        : DEFAULT_SOURCE_PRESSURE_BAR;
    const vazaoMaximaLps = flowM3s > 0
        ? Math.max(0.1, flowM3s * M3S_TO_LPS)
        : DEFAULT_SOURCE_MAX_FLOW_LPS;

    return {
        pressaoFonteBar,
        vazaoMaxima: vazaoMaximaLps,
        fluidoEntradaPresetId: 'agua'
    };
}

function sinkParameters() {
    return {
        pressaoSaidaBar: 0,
        perdaEntradaK: 0
    };
}

function pipeParameters(simEl) {
    // DWSIM Pipe: seções serializadas dentro de <Sections>.
    // Campos: <Comprimento> (m), <DI> (pol), <DE> (pol), <PipeWallRugosity> (m).
    let totalLengthM = 0;
    let diM = DEFAULT_PIPE_DIAMETER_M;
    let roughnessM = DEFAULT_PIPE_ROUGHNESS_MM / M_TO_MM;

    if (simEl) {
        const sectionsEl = simEl.querySelector(':scope > Sections');
        if (sectionsEl) {
            // Tenta primeiro os elementos <Section> como filhos diretos do DOM.
            const sectionEls = sectionsEl.querySelectorAll(':scope > Section');
            if (sectionEls.length > 0) {
                sectionEls.forEach((section) => {
                    const compr = parseFloat(section.querySelector(':scope > Comprimento')?.textContent || '0');
                    if (Number.isFinite(compr) && compr > 0) totalLengthM += compr;

                    const di = parseFloat(section.querySelector(':scope > DI')?.textContent || '0');
                    if (Number.isFinite(di) && di > 0) diM = di * INCH_TO_M;

                    const rug = parseFloat(section.querySelector(':scope > PipeWallRugosity')?.textContent || '0');
                    if (Number.isFinite(rug) && rug > 0) roughnessM = rug;
                });
            } else {
                // Fallback: serializa e aplica regex (para arquivos onde as Sections
                // vêm como texto inline ao invés de elementos DOM).
                const sectionsXml = serializeXml(sectionsEl);
                const sectionMatches = sectionsXml.match(/<Section[\s\S]*?<\/Section>/g) || [];
                sectionMatches.forEach((sectionXml) => {
                    const compr = matchTag(sectionXml, 'Comprimento');
                    const di = matchTag(sectionXml, 'DI');
                    const rug = matchTag(sectionXml, 'PipeWallRugosity');
                    if (compr !== null && compr > 0) totalLengthM += compr;
                    if (di !== null && di > 0) diM = di * INCH_TO_M;
                    if (rug !== null && rug > 0) roughnessM = rug;
                });
            }
        }
    }

    // Fallback: campos diretos quando não há Sections.
    if (totalLengthM === 0) {
        totalLengthM = queryNumeric(simEl, 'TotalLength', 0)
            || queryNumeric(simEl, 'Length', 0)
            || 1;
    }
    if (diM === DEFAULT_PIPE_DIAMETER_M) {
        const directDi = queryNumeric(simEl, 'InternalDiameter', 0)
            || queryNumeric(simEl, 'Diameter', 0);
        if (directDi > 0) diM = directDi * INCH_TO_M;
    }

    return {
        diameterM: Math.max(0.005, diM),
        roughnessMm: Math.max(0.001, roughnessM * M_TO_MM),
        extraLengthM: Math.max(0, totalLengthM),
        perdaLocalK: 0
    };
}

function serializeXml(element) {
    if (typeof globalThis.XMLSerializer === 'undefined') return '';
    return new XMLSerializer().serializeToString(element);
}

function matchTag(xml, tag) {
    const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i');
    const m = xml.match(re);
    if (!m) return null;
    const value = Number(m[1]);
    return Number.isFinite(value) ? value : null;
}

function clamp(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.max(min, Math.min(max, numeric));
}

// ============================================================
// TRADUÇÃO DA TOPOLOGIA
// ============================================================

let componentIdCounter = 0;
function nextComponentId() {
    componentIdCounter += 1;
    return `dwsim-${Date.now()}-${componentIdCounter}`;
}

function defaultSourceEndpoint(componentType = 'pump') {
    return defaultEndpointFor(componentType, 'out');
}

function defaultTargetEndpoint(componentType = 'pump') {
    return defaultEndpointFor(componentType, 'in');
}

/**
 * Devolve o endpoint padrão para um tipo de componente GAAP e direção de porta.
 * Estes offsets correspondem às posições dos <circle class="port-node"> em ComponentVisualSpecs,
 * somados aos offsets do SVG (spec.offX/offY).
 */
function defaultEndpointFor(componentType, portType) {
    const map = {
        source: {
            out: { offsetX: 45, offsetY: 20, floorOffsetY: 0, dynamicHeight: null }
        },
        sink: {
            in: { offsetX: -5, offsetY: 20, floorOffsetY: 0, dynamicHeight: null }
        },
        pump: {
            in: { offsetX: 0, offsetY: 40, floorOffsetY: 0, dynamicHeight: null },
            out: { offsetX: 80, offsetY: 40, floorOffsetY: 0, dynamicHeight: null }
        },
        valve: {
            in: { offsetX: 0, offsetY: 20, floorOffsetY: 0, dynamicHeight: null },
            out: { offsetX: 40, offsetY: 20, floorOffsetY: 0, dynamicHeight: null }
        },
        tank: {
            in: { offsetX: 80, offsetY: -40, floorOffsetY: 200, dynamicHeight: 'tank_inlet' },
            out: { offsetX: 80, offsetY: 200, floorOffsetY: 200, dynamicHeight: 'tank_outlet' }
        },
        heat_exchanger: {
            in: { offsetX: -10, offsetY: 30, floorOffsetY: 0, dynamicHeight: null },
            out: { offsetX: 90, offsetY: 30, floorOffsetY: 0, dynamicHeight: null }
        }
    };

    const defaults = map[componentType]?.[portType] || { offsetX: 0, offsetY: 0, floorOffsetY: 0, dynamicHeight: null };
    return {
        portType,
        offsetX: defaults.offsetX,
        offsetY: defaults.offsetY,
        floorOffsetY: defaults.floorOffsetY,
        dynamicHeight: defaults.dynamicHeight
    };
}

function pickDisplayTag(graphicObj, fallbackPrefix) {
    const tag = (graphicObj && graphicObj.tag) || '';
    if (tag && String(tag).trim()) return String(tag).trim();
    return fallbackPrefix;
}

function defaultTagFor(gaapType) {
    switch (gaapType) {
        case 'pump': return 'P';
        case 'valve': return 'V';
        case 'tank': return 'T';
        case 'source': return 'Entrada';
        case 'sink': return 'Saída';
        default: return 'Cmp';
    }
}

function extractPropertiesFor(gaapType, simObj) {
    const element = simObj?.element || null;
    if (gaapType === 'pump') return pumpParameters(element);
    if (gaapType === 'valve') return valveParameters(element);
    if (gaapType === 'tank') return tankParameters(element);
    if (gaapType === 'source') return sourceParameters(element);
    if (gaapType === 'sink') return sinkParameters();
    return null;
}

function defaultPipeParams() {
    return {
        diameterM: DEFAULT_PIPE_DIAMETER_M,
        roughnessMm: DEFAULT_PIPE_ROUGHNESS_MM,
        extraLengthM: DEFAULT_PIPE_EXTRA_LENGTH_M,
        perdaLocalK: DEFAULT_PIPE_MINOR_LOSS
    };
}

/**
 * Traduz o grafo DWSIM em um workspace snapshot GAAP.
 * Retorna { workspace, stats } onde stats contém contadores para feedback ao usuário.
 */
export function translateDwsimToWorkspace(parsed) {
    const { graphicObjects, simObjects } = parsed;
    componentIdCounter = 0;

    const components = [];
    const connections = [];
    const componentByDwsimName = new Map();
    const componentTypeByDwsimName = new Map();
    const equipmentNames = new Set(); // nomes DWSIM que viraram componentes
    const stats = {
        created: 0,
        skipped: 0,
        skippedTypes: new Set()
    };

    // ---- 1. Equipamentos reais (Pump / Valve / Tank) ----
    graphicObjects.forEach((gObj) => {
        const gaapType = DWSIM_EQUIPMENT_MAP[gObj.objectType];
        if (!gaapType) return;
        const simObj = simObjects.get(gObj.name) || null;
        const properties = extractPropertiesFor(gaapType, simObj);
        if (!properties) {
            stats.skipped += 1;
            stats.skippedTypes.add(gObj.objectType);
            return;
        }
        const tag = pickDisplayTag(gObj, defaultTagFor(gaapType));
        const id = nextComponentId();
        components.push({
            id,
            snapshot: {
                type: gaapType,
                tag,
                x: gObj.x,
                y: gObj.y,
                properties
            }
        });
        componentByDwsimName.set(gObj.name, id);
        componentTypeByDwsimName.set(gObj.name, gaapType);
        equipmentNames.add(gObj.name);
        stats.created += 1;
    });

    // ---- 2. MaterialStreams de fronteira ----
    // Source: sem InputConnector conectado (feed).
    // Sink:   sem OutputConnector conectado (produto final).
    // Streams intermediárias viram Canos implicitamente ao conectarmos os equipamentos.
    graphicObjects.forEach((gObj) => {
        if (gObj.objectType !== 'MaterialStream') return;
        const hasInput = gObj.inputs.length > 0;
        const hasOutput = gObj.outputs.length > 0;
        if (hasInput && hasOutput) return; // stream intermediária
        if (!hasInput && !hasOutput) {
            stats.skipped += 1;
            stats.skippedTypes.add('IsolatedStream');
            return;
        }

        const simObj = simObjects.get(gObj.name) || null;
        const gaapType = hasInput ? SINK_COMPONENT_TYPE : SOURCE_COMPONENT_TYPE;
        const properties = extractPropertiesFor(gaapType, simObj);
        const tag = pickDisplayTag(gObj, defaultTagFor(gaapType));
        const id = nextComponentId();
        components.push({
            id,
            snapshot: {
                type: gaapType,
                tag,
                x: gObj.x,
                y: gObj.y,
                properties
            }
        });
        componentByDwsimName.set(gObj.name, id);
        componentTypeByDwsimName.set(gObj.name, gaapType);
        equipmentNames.add(gObj.name);
        stats.created += 1;
    });

    // ---- 3. Conexões (Canos) ----
    // Para cada equipamento GAAP, faz BFS pelos GraphicObjects intermediários
    // (streams e pipes) até alcançar outro equipamento. Em cada caminho, coleta
    // parâmetros de qualquer Pipe encontrado.
    const visitedPairs = new Set();

    const findReachableEquipment = (startName) => {
        const results = [];
        const queue = [{ current: startName, pipes: [] }];
        const localVisited = new Set([startName]);

        while (queue.length > 0) {
            const { current, pipes } = queue.shift();
            const gObj = graphicObjects.get(current);
            if (!gObj) continue;

            for (const output of gObj.outputs) {
                const next = output.targetName;
                if (localVisited.has(next)) continue;
                localVisited.add(next);

                const nextGObj = graphicObjects.get(next);
                if (!nextGObj) continue;

                if (equipmentNames.has(next) && next !== startName) {
                    results.push({ target: next, pipes: [...pipes] });
                    continue; // não atravessa o equipamento
                }

                const newPipes = [...pipes];
                if (nextGObj.objectType === 'Pipe') {
                    const simObj = simObjects.get(next);
                    if (simObj) newPipes.push(simObj);
                }
                queue.push({ current: next, pipes: newPipes });
            }
        }
        return results;
    };

    equipmentNames.forEach((startName) => {
        const reachable = findReachableEquipment(startName);
        const sourceId = componentByDwsimName.get(startName);
        const sourceType = componentTypeByDwsimName.get(startName);
        if (!sourceId) return;

        reachable.forEach(({ target, pipes }) => {
            const targetId = componentByDwsimName.get(target);
            const targetType = componentTypeByDwsimName.get(target);
            if (!targetId) return;

            const pairKey = `${sourceId}->${targetId}`;
            if (visitedPairs.has(pairKey)) return;
            visitedPairs.add(pairKey);

            const pipeParams = pipes.length > 0
                ? pipeParameters(pipes[0].element)
                : defaultPipeParams();

            connections.push({
                sourceId,
                targetId,
                sourceEndpoint: defaultSourceEndpoint(sourceType),
                targetEndpoint: defaultTargetEndpoint(targetType),
                diameterM: pipeParams.diameterM,
                roughnessMm: pipeParams.roughnessMm,
                extraLengthM: pipeParams.extraLengthM,
                perdaLocalK: pipeParams.perdaLocalK,
                designVelocityMps: DEFAULT_DESIGN_VELOCITY_MPS,
                designFlowLps: 0,
                transientFlowLps: 0,
                lastResolvedFlowLps: 0
            });
        });
    });

    // ---- 4. Normalização de posições ----
    // DWSIM usa sistema de coordenadas com Y crescente para cima; o GAAP usa Y
    // crescente para baixo. Aplica-se offset para evitar componentes negativos.
    normalizePositions(components);

    const workspace = {
        config: { usarAlturaRelativa: false },
        components,
        connections,
        selection: { componentIds: [], connectionId: null }
    };

    return { workspace, stats };
}

function normalizePositions(components) {
    if (components.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    components.forEach((c) => {
        minX = Math.min(minX, c.snapshot.x);
        minY = Math.min(minY, c.snapshot.y);
    });

    const offsetX = (minX < POSITION_ORIGIN_X) ? (POSITION_ORIGIN_X - minX) : 0;
    const offsetY = (minY < POSITION_ORIGIN_Y) ? (POSITION_ORIGIN_Y - minY) : 0;

    if (offsetX === 0 && offsetY === 0) return;

    components.forEach((c) => {
        c.snapshot.x += offsetX;
        c.snapshot.y += offsetY;
    });
}

// ============================================================
// RESTAURAÇÃO NO ENGINE
// ============================================================

/**
 * Importa um arquivo DWSIM, criando componentes e conexões no engine.
 * Usa restoreWorkspaceSnapshot para reaproveitar toda a maquinaria de undo/redo.
 */
export async function importDwsimDocument(engine, file, { undoManager } = {}) {
    const xmlText = await readDwsimFile(file);
    const parsed = parseDwsimXml(xmlText);
    const { workspace, stats } = translateDwsimToWorkspace(parsed);

    if (workspace.components.length === 0) {
        return { workspace, stats, restored: false };
    }

    const { restoreWorkspaceSnapshot } = await import('../controllers/UndoController.js');
    if (engine?.componentes?.length || engine?.conexoes?.length) {
        undoManager?.record('import-dwsim');
    }
    const restored = restoreWorkspaceSnapshot(engine, workspace, { undoManager });

    return { workspace, stats, restored };
}
