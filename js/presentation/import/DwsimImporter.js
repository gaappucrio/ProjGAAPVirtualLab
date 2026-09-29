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
import { createFluidoFromProperties } from '../../domain/components/Fluido.js';

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
    Tank: 'tank',
    HeatExchanger: 'heat_exchanger',
    Cooler: 'heat_exchanger',
    Heater: 'heat_exchanger',
    AirCooler: 'heat_exchanger',
    ShellAndTubeHeatExchanger: 'heat_exchanger',
    PlateHeatExchanger: 'heat_exchanger',
    FiredHeater: 'heat_exchanger'
};

function resolveDwsimComponentType(objectType, simType = '') {
    const raw = String(objectType || simType || '').trim();
    if (!raw) return null;
    if (DWSIM_EQUIPMENT_MAP[raw]) return DWSIM_EQUIPMENT_MAP[raw];
    const norm = raw.toLowerCase().replace(/[\s_-]/g, '');
    if (norm === 'pump' || norm === 'bombahidraulica' || norm === 'bomba') return 'pump';
    if (norm === 'valve' || norm === 'valvula') return 'valve';
    if (norm === 'tank' || norm === 'tanque' || norm === 'separatorvessel' || norm === 'vessel') return 'tank';
    if (
        norm === 'heatexchanger' ||
        norm === 'heater' ||
        norm === 'cooler' ||
        norm === 'aircooler' ||
        norm === 'shellandtubeheatexchanger' ||
        norm === 'plateheatexchanger' ||
        norm === 'firedheater' ||
        norm === 'trocadordecalor' ||
        norm === 'aquecedor' ||
        norm === 'resfriador'
    ) {
        return 'heat_exchanger';
    }
    return null;
}

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

class SimpleElement {
    constructor(tagName, textContent = '', rawXml = '') {
        this.tagName = tagName;
        this.textContent = textContent;
        this.rawXml = rawXml;
        this.children = [];
        this.attributes = new Map();
        this.parentElement = null;
    }

    getAttribute(name) {
        return this.attributes.get(name) || null;
    }

    hasAttribute(name) {
        return this.attributes.has(name);
    }

    querySelector(selector) {
        const isScopeDirect = selector.startsWith(':scope > ');
        const targetTag = (isScopeDirect ? selector.replace(':scope > ', '') : selector).replace(/.*>\s*/, '').trim().toLowerCase();

        if (isScopeDirect) {
            for (const child of this.children) {
                if (child.tagName.toLowerCase() === targetTag) return child;
            }
            return null;
        }

        for (const child of this.children) {
            if (child.tagName.toLowerCase() === targetTag) return child;
            const found = child.querySelector(targetTag);
            if (found) return found;
        }
        return null;
    }

    querySelectorAll(selector) {
        const parts = selector.split(',').map((s) => s.trim());
        if (parts.length > 1) {
            const set = new Set();
            for (const part of parts) {
                for (const el of this.querySelectorAll(part)) {
                    set.add(el);
                }
            }
            return Array.from(set);
        }

        const isScopeDirect = selector.startsWith(':scope > ');
        const targetTag = (isScopeDirect ? selector.replace(':scope > ', '') : selector).replace(/.*>\s*/, '').trim().toLowerCase();
        const results = [];

        if (isScopeDirect) {
            for (const child of this.children) {
                if (child.tagName.toLowerCase() === targetTag) results.push(child);
            }
            return results;
        }

        function walk(node) {
            for (const child of node.children) {
                if (child.tagName.toLowerCase() === targetTag) results.push(child);
                walk(child);
            }
        }
        walk(this);
        return results;
    }
}

/**
 * Fallback de parser XML leve para ambientes sem DOMParser (como suites de teste Node.js).
 */
export function parseXmlFallback(xmlText) {
    const root = new SimpleElement('root', '', xmlText);
    const stack = [root];
    const re = /<!--[\s\S]*?-->|<([a-zA-Z0-9_:-]+)([^>]*?)(\/?)>|([^<]+)|<\/([a-zA-Z0-9_:-]+)>/g;
    let m;
    while ((m = re.exec(xmlText)) !== null) {
        if (m[0].startsWith('<!--')) continue;
        if (m[1]) {
            const tagName = m[1];
            const attrStr = m[2] || '';
            const isSelfClosing = m[3] === '/' || attrStr.endsWith('/');
            const el = new SimpleElement(tagName);

            const attrRe = /([a-zA-Z0-9_:-]+)=(?:"([^"]*)"|'([^']*)')/g;
            let am;
            while ((am = attrRe.exec(attrStr)) !== null) {
                el.attributes.set(am[1], am[2] !== undefined ? am[2] : am[3]);
            }

            const parent = stack[stack.length - 1];
            el.parentElement = parent;
            parent.children.push(el);

            if (!isSelfClosing) {
                stack.push(el);
            }
        } else if (m[4]) {
            const text = m[4].trim();
            if (text && stack.length > 0) {
                stack[stack.length - 1].textContent += (stack[stack.length - 1].textContent ? ' ' : '') + text;
            }
        } else if (m[5]) {
            if (stack.length > 1 && stack[stack.length - 1].tagName.toLowerCase() === m[5].toLowerCase()) {
                stack.pop();
            }
        }
    }
    return root;
}

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
    return el ? String(el.textContent || '').trim() : fallback;
}

function queryNumericDeep(parent, tagNames, fallback = 0) {
    if (!parent) return fallback;
    const candidates = [];
    const list = Array.isArray(tagNames) ? tagNames : [tagNames];
    list.forEach((t) => {
        candidates.push(t);
        candidates.push(t.toLowerCase());
        candidates.push(t.toUpperCase());
        candidates.push(t.charAt(0).toUpperCase() + t.slice(1));
    });
    const uniqueTags = [...new Set(candidates)];

    if (typeof parent.querySelector === 'function') {
        for (const tag of uniqueTags) {
            try {
                const el = parent.querySelector(`:scope > ${tag}`) || parent.querySelector(tag);
                if (el) {
                    const val = Number(el.textContent);
                    if (Number.isFinite(val)) return val;
                }
            } catch {}
        }
    }

    const xml = serializeXml(parent);
    if (xml) {
        for (const tag of list) {
            const val = matchTag(xml, tag);
            if (val !== null && Number.isFinite(val)) return val;
        }
    }

    return fallback;
}

function queryStringDeep(parent, tagNames, fallback = '') {
    if (!parent) return fallback;
    const candidates = [];
    const list = Array.isArray(tagNames) ? tagNames : [tagNames];
    list.forEach((t) => {
        candidates.push(t);
        candidates.push(t.toLowerCase());
        candidates.push(t.toUpperCase());
        candidates.push(t.charAt(0).toUpperCase() + t.slice(1));
    });
    const uniqueTags = [...new Set(candidates)];

    if (typeof parent.querySelector === 'function') {
        for (const tag of uniqueTags) {
            try {
                const el = parent.querySelector(`:scope > ${tag}`) || parent.querySelector(tag);
                if (el) {
                    const text = String(el.textContent || '').trim();
                    if (text) return text;
                }
            } catch {}
        }
    }

    const xml = serializeXml(parent);
    if (xml) {
        for (const tag of list) {
            const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
            const m = xml.match(re);
            if (m && m[1] && m[1].trim()) return m[1].trim();
        }
    }

    return fallback;
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
        const type = queryString(el, 'Type') || queryStringDeep(el, ['Type']);
        const componentName = queryString(el, 'ComponentName') || queryStringDeep(el, ['ComponentName']);
        const names = queryAllDirect(el, 'Name').map((n) => n.textContent);
        const lastName = names.length ? names[names.length - 1] : '';
        const key = componentName || lastName;
        if (!key) return;

        const entry = {
            element: el,
            type,
            componentName,
            name: lastName
        };

        if (!map.has(key)) map.set(key, entry);
        if (lastName && !map.has(lastName)) map.set(lastName, entry);
        if (componentName && !map.has(componentName)) map.set(componentName, entry);
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
        const type = queryString(el, 'Type') || queryStringDeep(el, ['Type']);
        const name = queryString(el, 'Name') || queryStringDeep(el, ['Name']);
        if (!name) return;

        const objectType = queryString(el, 'ObjectType') || queryStringDeep(el, ['ObjectType']);
        const x = queryNumeric(el, 'X', 0);
        const y = queryNumeric(el, 'Y', 0);
        const width = queryNumeric(el, 'Width', 20);
        const height = queryNumeric(el, 'Height', 20);
        const tag = queryString(el, 'Tag') || queryStringDeep(el, ['Tag']);

        const inputs = [];
        const outputs = [];

        const inputConnectors = el.querySelector(':scope > InputConnectors') || el.querySelector('InputConnectors');
        if (inputConnectors) {
            const connList = inputConnectors.querySelectorAll(':scope > Connector') || inputConnectors.querySelectorAll('Connector');
            connList.forEach((conn, index) => {
                if (conn.getAttribute('IsAttached') !== 'true') return;
                const connType = conn.getAttribute('ConnType') || 'ConIn';
                if (connType === 'ConEn') return; // ignora energia
                const sourceName = conn.getAttribute('AttachedFromObjID');
                if (!sourceName) return;
                const localIndex = conn.hasAttribute('Index') ? parseInt(conn.getAttribute('Index'), 10) : index;
                const attachedConnIndex = parseInt(conn.getAttribute('AttachedFromConnIndex') || '0', 10);
                inputs.push({
                    sourceName,
                    sourceConnIndex: attachedConnIndex,
                    targetConnIndex: localIndex,
                    connIndex: localIndex,
                    localConnIndex: localIndex
                });
            });
        }

        const outputConnectors = el.querySelector(':scope > OutputConnectors') || el.querySelector('OutputConnectors');
        if (outputConnectors) {
            const connList = outputConnectors.querySelectorAll(':scope > Connector') || outputConnectors.querySelectorAll('Connector');
            connList.forEach((conn, index) => {
                if (conn.getAttribute('IsAttached') !== 'true') return;
                const connType = conn.getAttribute('ConnType') || 'ConOut';
                if (connType === 'ConEn') return; // ignora energia
                const targetName = conn.getAttribute('AttachedToObjID');
                if (!targetName) return;
                const localIndex = conn.hasAttribute('Index') ? parseInt(conn.getAttribute('Index'), 10) : index;
                const attachedConnIndex = parseInt(conn.getAttribute('AttachedToConnIndex') || '0', 10);
                outputs.push({
                    targetName,
                    sourceConnIndex: localIndex,
                    targetConnIndex: attachedConnIndex,
                    connIndex: localIndex,
                    localConnIndex: localIndex
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
    let doc;
    if (typeof globalThis.DOMParser !== 'undefined') {
        const parser = new DOMParser();
        doc = parser.parseFromString(xmlText, 'application/xml');

        const parseError = doc.querySelector('parsererror');
        if (parseError) {
            throw new Error('XML DWSIM inválido: ' + parseError.textContent.slice(0, 200));
        }
    } else {
        doc = parseXmlFallback(xmlText);
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
    const dimensions = simEl.querySelector(':scope > Dimensions') || simEl.querySelector('Dimensions');
    if (!dimensions) return null;
    const dimensionEls = dimensions.querySelectorAll(':scope > Dimension') || dimensions.querySelectorAll('Dimension');
    for (const dim of dimensionEls) {
        const name = queryString(dim, 'Name') || queryStringDeep(dim, ['Name']);
        if (name === dimensionName) {
            const value = Number(queryString(dim, 'Value') || queryStringDeep(dim, ['Value']));
            if (Number.isFinite(value)) return value;
        }
    }
    return null;
}

function findDynamicProperty(simEl, propertyName) {
    if (!simEl) return null;
    const dyn = simEl.querySelector(':scope > DynamicProperties') || simEl.querySelector('DynamicProperties');
    if (!dyn) return null;
    const candidates = dyn.querySelectorAll('Item');
    for (const item of candidates) {
        const name = queryString(item, 'Name') || queryStringDeep(item, ['Name']);
        if (name === propertyName) {
            const data = queryString(item, 'Data') || queryStringDeep(item, ['Data']);
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
        || queryNumeric(simEl, 'DeltaP', 0)
        || findDimensionValue(simEl, 'PressureDifference')
        || queryNumericDeep(simEl, ['PressureIncrease', 'DeltaP', 'PressureDifference'], 0);
    const curveFlowM3s = queryNumeric(simEl, 'CurveFlow', 0)
        || findDimensionValue(simEl, 'Flow')
        || queryNumericDeep(simEl, ['CurveFlow'], 0)
        || 0;
    const efficiency = queryNumeric(simEl, 'Efficiency', 0)
        || queryNumeric(simEl, 'CurveEff', 0)
        || queryNumeric(simEl, 'Eficiencia', 0)
        || findDimensionValue(simEl, 'Efficiency')
        || queryNumericDeep(simEl, ['Efficiency', 'CurveEff', 'Eficiencia'], 0)
        || 0;
    const curveNpshrM = queryNumeric(simEl, 'CurveNPSHr', 0)
        || queryNumeric(simEl, 'NPSH', 0)
        || queryNumericDeep(simEl, ['CurveNPSHr', 'NPSH'], 0)
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
    const rawCoeff = queryNumeric(simEl, 'Kv', 0)
        || queryNumeric(simEl, 'ActualKv', 0)
        || queryNumericDeep(simEl, ['Kv', 'ActualKv', 'Cv'], 0);
    const openingPct = queryNumeric(simEl, 'OpeningPct', 0)
        || queryNumeric(simEl, 'OutputAbs', 0)
        || queryNumericDeep(simEl, ['OpeningPct', 'OutputAbs', 'Opening'], 0);
    const characteristic = queryString(simEl, 'DefinedOpeningKvRelationShipType', '')
        || queryStringDeep(simEl, ['DefinedOpeningKvRelationShipType', 'Characteristic'], 'EqualPercentage');
    const flowCoeffUnit = queryString(simEl, 'FlowCoefficient', '')
        || queryStringDeep(simEl, ['FlowCoefficient', 'CoeffUnit'], '');

    let cv = 160;
    if (rawCoeff > 0) {
        if (flowCoeffUnit.toLowerCase().includes('cv')) {
            cv = rawCoeff;
        } else {
            cv = rawCoeff / KV_PER_CV;
        }
    }

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

function normalizeSetpointToPercentage(spValue, maxLevel = 2.4) {
    const sp = Number(spValue);
    if (!Number.isFinite(sp) || sp <= 0) return 50;
    if (maxLevel > 0 && sp <= maxLevel) {
        return clamp(Math.round((sp / maxLevel) * 1000) / 10, 1, 99);
    }
    if (sp <= 1.0) {
        return clamp(Math.round(sp * 1000) / 10, 1, 99);
    }
    return clamp(Math.round(sp * 10) / 10, 1, 99);
}

function findTankControlInfo(tankName, tankTag, simObjects) {
    if (!simObjects || simObjects.size === 0) return null;

    let associatedLevelGauge = null;
    let levelGaugeMax = null;

    for (const obj of simObjects.values()) {
        const simType = String(obj.type || '').toLowerCase();
        if (simType.includes('levelgauge')) {
            const el = obj.element;
            const selectedObjId = queryString(el, 'SelectedObjectID')
                || queryString(el, 'SelectedObject')
                || queryStringDeep(el, ['SelectedObjectID', 'SelectedObject']);
            if (selectedObjId && (selectedObjId === tankName || (tankTag && selectedObjId === tankTag))) {
                associatedLevelGauge = obj;
                const maxVal = queryNumericDeep(el, ['MaximumValue', 'MaxValue']);
                if (maxVal > 0) levelGaugeMax = maxVal;
                break;
            }
        }
    }

    for (const obj of simObjects.values()) {
        const simType = String(obj.type || '').toLowerCase();
        if (simType.includes('pidcontroller') || simType.includes('controller')) {
            const el = obj.element;
            let controlledId = '';
            let controlledName = '';

            const controlledDataEl = el?.querySelector?.('ControlledObjectData');
            if (controlledDataEl) {
                controlledId = controlledDataEl.getAttribute?.('ID') || '';
                controlledName = controlledDataEl.getAttribute?.('Name') || '';
            }
            if (!controlledId && el) {
                const xmlStr = serializeXml(el);
                const idMatch = xmlStr.match(/<ControlledObjectData[^>]*\bID="([^"]+)"/i);
                if (idMatch) controlledId = idMatch[1];
                const nameMatch = xmlStr.match(/<ControlledObjectData[^>]*\bName="([^"]+)"/i);
                if (nameMatch) controlledName = nameMatch[1];
            }
            if (!controlledId) {
                controlledId = queryStringDeep(el, ['ControlledObject', 'ControlledObjectID']);
            }

            const isDirectMatch = (controlledId && (controlledId === tankName || (tankTag && controlledId === tankTag)))
                || (controlledName && (controlledName === tankName || (tankTag && controlledName === tankTag)));

            const isLevelGaugeMatch = associatedLevelGauge && (
                (controlledId && (controlledId === associatedLevelGauge.componentName || controlledId === associatedLevelGauge.name))
                || (controlledName && (controlledName === associatedLevelGauge.componentName || controlledName === associatedLevelGauge.name))
                || (queryString(associatedLevelGauge.element, 'AttachedAdjustId') === (obj.componentName || obj.name))
            );

            if (isDirectMatch || isLevelGaugeMatch) {
                const spValue = queryNumericDeep(el, ['SetPoint', 'SPValue', 'AdjustValue'], 0);
                const kp = queryNumericDeep(el, ['Kp'], 4);
                const ki = queryNumericDeep(el, ['Ki'], 0.6);
                const kd = queryNumericDeep(el, ['Kd'], 0);
                const activeStr = queryStringDeep(el, ['Active', 'IsActive'], 'true').toLowerCase();
                const active = activeStr !== 'false' && activeStr !== '0';

                return {
                    found: true,
                    active,
                    setpointRaw: spValue,
                    maxLevel: levelGaugeMax,
                    kp,
                    ki,
                    kd
                };
            }
        }
    }

    return null;
}

function tankParameters(simEl, tankName = '', simObjects = null, tankTag = '') {
    // DWSIM Volume em m³; GAAP capacidadeMaxima em litros.
    const volumeM3 = queryNumeric(simEl, 'Volume', 0)
        || findDimensionValue(simEl, 'Volume')
        || queryNumericDeep(simEl, ['Volume'], 0)
        || 0;
    let alturaM = findDynamicProperty(simEl, 'Height')
        || queryNumeric(simEl, 'TankHeight', 0)
        || queryNumericDeep(simEl, ['TankHeight', 'Height'], 0);
    const liquidLevelM = findDynamicProperty(simEl, 'Liquid Level')
        || queryNumeric(simEl, 'LiquidLevel', 0)
        || queryNumericDeep(simEl, ['LiquidLevel', 'Level'], 0);

    const controlInfo = findTankControlInfo(tankName, tankTag, simObjects);
    if (!alturaM && controlInfo?.maxLevel) {
        alturaM = controlInfo.maxLevel;
    }
    if (!alturaM || alturaM <= 0) {
        alturaM = 2.4;
    }

    const capacidadeMaximaL = Math.max(10, volumeM3 * M3_TO_L);
    const alturaUtilMetros = Math.max(0.5, alturaM);
    const alturaBocalEntradaM = Math.min(alturaUtilMetros * 0.9, alturaUtilMetros - 0.2);
    const alturaBocalSaidaM = Math.min(0.2, alturaUtilMetros * 0.1);
    const volumeAtualL = (clamp(liquidLevelM, 0, alturaUtilMetros) / alturaUtilMetros) * capacidadeMaximaL;

    let setpointAtivo = false;
    let setpoint = 50;
    let kp = 4;
    let ki = 0.6;
    let kd = 0;

    if (controlInfo?.found) {
        setpointAtivo = controlInfo.active;
        setpoint = normalizeSetpointToPercentage(controlInfo.setpointRaw, alturaUtilMetros);
        if (Number.isFinite(controlInfo.kp) && controlInfo.kp > 0) kp = controlInfo.kp;
        if (Number.isFinite(controlInfo.ki) && controlInfo.ki >= 0) ki = controlInfo.ki;
        if (Number.isFinite(controlInfo.kd) && controlInfo.kd >= 0) kd = controlInfo.kd;
    } else {
        const directSp = findDynamicProperty(simEl, 'Level Setpoint')
            || queryNumericDeep(simEl, ['SetPoint', 'LevelSetPoint', 'SPValue'], 0);
        if (directSp > 0) {
            setpointAtivo = true;
            setpoint = normalizeSetpointToPercentage(directSp, alturaUtilMetros);
        }
    }

    return {
        capacidadeMaxima: capacidadeMaximaL,
        volumeAtual: volumeAtualL,
        volumeInicial: volumeAtualL,
        alturaUtilMetros,
        coeficienteSaida: 0.82,
        alturaBocalEntradaM,
        alturaBocalSaidaM,
        setpointAtivo,
        setpoint,
        kp,
        ki,
        kd
    };
}

function kelvinToCelsius(kelvinOrCelsius, fallbackC = 25) {
    const val = Number(kelvinOrCelsius);
    if (!Number.isFinite(val)) return fallbackC;
    if (val > 150) {
        return Math.round((val - 273.15) * 100) / 100;
    }
    return val;
}

function sourceParameters(simEl) {
    const pressurePa = findDimensionValue(simEl, 'Pressure')
        || queryNumeric(simEl, 'Pressure', 0)
        || queryNumericDeep(simEl, ['pressure', 'Pressure'], 0);
    const flowM3s = findDimensionValue(simEl, 'Flow')
        || queryNumeric(simEl, 'VolumetricFlow', 0)
        || queryNumeric(simEl, 'Flow', 0)
        || queryNumericDeep(simEl, ['VolumetricFlow', 'volumetric_flow', 'Flow', 'flow'], 0);
    const tempK = findDimensionValue(simEl, 'Temperature')
        || queryNumeric(simEl, 'Temperature', 0)
        || queryNumericDeep(simEl, ['temperature', 'Temperature'], 0);

    const pressaoFonteBar = pressurePa > 0
        ? Math.max(0.01, pressurePa * PA_TO_BAR)
        : DEFAULT_SOURCE_PRESSURE_BAR;
    const vazaoMaximaLps = flowM3s > 0
        ? Math.max(0.1, flowM3s * M3S_TO_LPS)
        : DEFAULT_SOURCE_MAX_FLOW_LPS;
    const temperaturaC = tempK > 0 ? kelvinToCelsius(tempK, 25) : 25;
    const isCustomTemp = Math.abs(temperaturaC - 25.0) > 0.05;

    return {
        pressaoFonteBar,
        vazaoMaxima: vazaoMaximaLps,
        fluidoEntradaPresetId: isCustomTemp ? 'custom' : 'agua',
        fluidoEntrada: createFluidoFromProperties({
            temperatura: temperaturaC
        })
    };
}

function sinkParameters(simEl = null) {
    let pressaoSaidaBar = 0;
    if (simEl) {
        const pressurePa = findDimensionValue(simEl, 'Pressure')
            || queryNumeric(simEl, 'Pressure', 0)
            || queryNumericDeep(simEl, ['pressure', 'Pressure'], 0);
        if (pressurePa > 101325) {
            pressaoSaidaBar = Math.max(0, (pressurePa - 101325) * PA_TO_BAR);
        }
    }
    return {
        pressaoSaidaBar,
        perdaEntradaK: 0
    };
}

function heatExchangerParameters(simEl, dwsimType = '') {
    const normType = String(dwsimType || '').toLowerCase();
    const isCooler = normType.includes('cooler') || normType.includes('resfriador');
    const isHeater = normType.includes('heater') || normType.includes('aquecedor');

    // 1. Área de troca térmica (m²)
    const areaM2 = queryNumeric(simEl, 'Area', 0)
        || queryNumeric(simEl, 'ExchangeArea', 0)
        || queryNumeric(simEl, 'HeatExchangeArea', 0)
        || queryNumeric(simEl, 'SurfaceArea', 0)
        || findDimensionValue(simEl, 'Area')
        || queryNumericDeep(simEl, ['Area', 'ExchangeArea', 'HeatExchangeArea', 'SurfaceArea'], 0)
        || 1.0;

    // 2. Coeficiente global de transferência de calor U (W/(m²·K))
    const overallU = queryNumeric(simEl, 'OverallHTC', 0)
        || queryNumeric(simEl, 'OverallCoefficient', 0)
        || queryNumeric(simEl, 'OverallHeatTransferCoefficient', 0)
        || queryNumeric(simEl, 'U', 0)
        || findDimensionValue(simEl, 'OverallHeatTransferCoefficient')
        || queryNumericDeep(simEl, ['OverallHTC', 'OverallCoefficient', 'OverallHeatTransferCoefficient', 'U'], 0)
        || 0;

    // 3. Capacitância térmica global UA (W/K)
    let ua = queryNumeric(simEl, 'UA', 0)
        || queryNumeric(simEl, 'OverallHTC_Area', 0)
        || queryNumeric(simEl, 'OverallHeatTransferCoefficientTimesArea', 0)
        || queryNumericDeep(simEl, ['UA', 'OverallHTC_Area'], 0);

    if (!ua || ua <= 0) {
        if (overallU > 0 && areaM2 > 0) {
            ua = overallU * areaM2;
        } else if (isCooler || isHeater) {
            ua = 5000;
        } else {
            ua = 2500;
        }
    }

    // 4. Temperatura de serviço (°C)
    const defaultTemp = isCooler ? 15 : 80;
    const rawTemp = queryNumeric(simEl, 'OutletTemperature', 0)
        || queryNumeric(simEl, 'ServiceTemperature', 0)
        || queryNumeric(simEl, 'UtilityTemperature', 0)
        || queryNumeric(simEl, 'TargetTemperature', 0)
        || queryNumeric(simEl, 'ColdInletTemperature', 0)
        || queryNumeric(simEl, 'HotInletTemperature', 0)
        || queryNumericDeep(simEl, ['OutletTemperature', 'ServiceTemperature', 'UtilityTemperature', 'TargetTemperature', 'ColdInletTemperature', 'HotInletTemperature'], 0);

    const tempServico = rawTemp > 0 ? kelvinToCelsius(rawTemp, defaultTemp) : defaultTemp;

    // 5. Perda de carga local K
    const perdaK = queryNumeric(simEl, 'MinorLoss', 0)
        || queryNumeric(simEl, 'LocalLossK', 0)
        || queryNumericDeep(simEl, ['MinorLoss', 'LocalLossK'], 0)
        || 0;

    // 6. Efetividade máxima
    const rawEff = queryNumeric(simEl, 'MaximumEffectiveness', 0)
        || queryNumeric(simEl, 'Effectiveness', 0)
        || queryNumeric(simEl, 'ThermalEfficiency', 0)
        || queryNumeric(simEl, 'Efficiency', 0)
        || queryNumericDeep(simEl, ['MaximumEffectiveness', 'Effectiveness', 'ThermalEfficiency', 'Efficiency'], 0)
        || 0.95;
    const efetividadeMaxima = clamp(rawEff > 1 ? rawEff / 100 : rawEff, 0.1, 0.999);

    return {
        temperaturaServicoC: tempServico,
        areaM2: Math.max(0.01, areaM2),
        uaWPorK: Math.max(10, ua),
        perdaLocalK: Math.max(0, perdaK),
        efetividadeMaxima,
        tipoPerfilGrafico: 'position'
    };
}

function isCounterCurrentExchanger(simObj) {
    if (!simObj?.element) return false;
    const flowDirStr = queryString(simObj.element, 'FlowDirection', '')
        || queryString(simObj.element, 'FlowDir', '')
        || queryStringDeep(simObj.element, ['FlowDirection', 'FlowDir'], '');
    if (!flowDirStr) return false;
    const norm = flowDirStr.trim().toLowerCase();
    return norm === '0' || norm === 'countercurrent' || norm === 'counter_current' || norm === 'counter' || norm === 'contracorrente';
}

function pipeParameters(simEl) {
    // DWSIM Pipe: seções serializadas dentro de <Sections>.
    // Campos: <Comprimento> (m), <DI> (pol), <DE> (pol), <PipeWallRugosity> (m).
    let totalLengthM = 0;
    let diM = DEFAULT_PIPE_DIAMETER_M;
    let roughnessM = DEFAULT_PIPE_ROUGHNESS_MM / M_TO_MM;

    if (simEl) {
        const sectionsEl = simEl.querySelector(':scope > Sections')
            || simEl.querySelector('Sections');
        if (sectionsEl) {
            const sectionEls = sectionsEl.querySelectorAll(':scope > Section')
                || sectionsEl.querySelectorAll('Section');
            if (sectionEls && sectionEls.length > 0) {
                sectionEls.forEach((section) => {
                    const compr = parseFloat(section.querySelector(':scope > Comprimento')?.textContent || section.querySelector('Comprimento')?.textContent || '0');
                    if (Number.isFinite(compr) && compr > 0) totalLengthM += compr;

                    const di = parseFloat(section.querySelector(':scope > DI')?.textContent || section.querySelector('DI')?.textContent || '0');
                    if (Number.isFinite(di) && di > 0) diM = di * INCH_TO_M;

                    const rug = parseFloat(section.querySelector(':scope > PipeWallRugosity')?.textContent || section.querySelector('PipeWallRugosity')?.textContent || '0');
                    if (Number.isFinite(rug) && rug > 0) roughnessM = rug;
                });
            } else {
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
            || queryNumericDeep(simEl, ['TotalLength', 'Length'], 0)
            || 1;
    }
    if (diM === DEFAULT_PIPE_DIAMETER_M) {
        const directDi = queryNumeric(simEl, 'InternalDiameter', 0)
            || queryNumeric(simEl, 'Diameter', 0)
            || queryNumericDeep(simEl, ['InternalDiameter', 'Diameter'], 0);
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
    if (!element) return '';
    if (element.rawXml) return element.rawXml;
    if (typeof globalThis.XMLSerializer !== 'undefined') {
        try {
            return new XMLSerializer().serializeToString(element);
        } catch {}
    }
    return '';
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
            out: { offsetX: 45, offsetY: 20, floorOffsetY: 0, dynamicHeight: null, portType: 'out' }
        },
        sink: {
            in: { offsetX: -5, offsetY: 20, floorOffsetY: 0, dynamicHeight: null, portType: 'in' }
        },
        pump: {
            in: { offsetX: 0, offsetY: 40, floorOffsetY: 0, dynamicHeight: null, portType: 'in' },
            out: { offsetX: 80, offsetY: 40, floorOffsetY: 0, dynamicHeight: null, portType: 'out' }
        },
        valve: {
            in: { offsetX: 0, offsetY: 20, floorOffsetY: 0, dynamicHeight: null, portType: 'in' },
            out: { offsetX: 40, offsetY: 20, floorOffsetY: 0, dynamicHeight: null, portType: 'out' }
        },
        tank: {
            in: { offsetX: 80, offsetY: -40, floorOffsetY: 200, dynamicHeight: 'tank_inlet', portType: 'in' },
            out: { offsetX: 80, offsetY: 200, floorOffsetY: 200, dynamicHeight: 'tank_outlet', portType: 'out' }
        },
        heat_exchanger: {
            in: { offsetX: 0, offsetY: 24, floorOffsetY: 0, dynamicHeight: null, portType: 'in' },
            out: { offsetX: 200, offsetY: 24, floorOffsetY: 0, dynamicHeight: null, portType: 'out' },
            in1: { offsetX: 0, offsetY: 24, floorOffsetY: 0, dynamicHeight: null, portType: 'in' },
            out1: { offsetX: 200, offsetY: 24, floorOffsetY: 0, dynamicHeight: null, portType: 'out' },
            in2: { offsetX: 0, offsetY: 76, floorOffsetY: 0, dynamicHeight: null, portType: 'inout' },
            out2: { offsetX: 200, offsetY: 76, floorOffsetY: 0, dynamicHeight: null, portType: 'inout' }
        }
    };

    const defaults = map[componentType]?.[portType] || { offsetX: 0, offsetY: 0, floorOffsetY: 0, dynamicHeight: null, portType };
    return {
        portId: portType,
        portType: defaults.portType || ((portType === 'in1' || portType === 'in') ? 'in' : ((portType === 'out1' || portType === 'out') ? 'out' : ((portType === 'in2' || portType === 'out2') ? 'inout' : portType))),
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

function defaultTagFor(gaapType, dwsimType = '') {
    const norm = String(dwsimType || '').toLowerCase();
    if (gaapType === 'heat_exchanger') {
        if (norm.includes('cooler') || norm.includes('resfriador')) return 'RF';
        if (norm.includes('heater') || norm.includes('aquecedor')) return 'AQ';
        return 'TC';
    }
    switch (gaapType) {
        case 'pump': return 'P';
        case 'valve': return 'V';
        case 'tank': return 'T';
        case 'heat_exchanger': return 'TC';
        case 'source': return 'Entrada';
        case 'sink': return 'Saída';
        default: return 'Cmp';
    }
}

function extractPropertiesFor(gaapType, simObj, gObj = null, simObjects = null) {
    const element = simObj?.element || null;
    const dwsimType = gObj?.objectType || simObj?.type || '';
    if (gaapType === 'pump') return pumpParameters(element);
    if (gaapType === 'valve') return valveParameters(element);
    if (gaapType === 'tank') return tankParameters(element, gObj?.name, simObjects, gObj?.tag);
    if (gaapType === 'heat_exchanger') return heatExchangerParameters(element, dwsimType);
    if (gaapType === 'source') return sourceParameters(element);
    if (gaapType === 'sink') return sinkParameters(element);
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

    // ---- 1. Equipamentos reais (Pump / Valve / Tank / HeatExchanger / Cooler / Heater) ----
    graphicObjects.forEach((gObj) => {
        const simObj = simObjects.get(gObj.name) || null;
        const gaapType = resolveDwsimComponentType(gObj.objectType, simObj?.type);
        if (!gaapType) return;
        const properties = extractPropertiesFor(gaapType, simObj, gObj, simObjects);
        if (!properties) {
            stats.skipped += 1;
            stats.skippedTypes.add(gObj.objectType);
            return;
        }
        const tag = pickDisplayTag(gObj, defaultTagFor(gaapType, gObj.objectType));
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
        const properties = extractPropertiesFor(gaapType, simObj, gObj, simObjects);
        const tag = pickDisplayTag(gObj, defaultTagFor(gaapType, gObj.objectType));
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
        const startGObj = graphicObjects.get(startName);
        if (!startGObj) return results;

        startGObj.outputs.forEach((initialOutput) => {
            const sourceConnIndex = Number.isFinite(initialOutput.sourceConnIndex)
                ? initialOutput.sourceConnIndex
                : (Number.isFinite(initialOutput.connIndex) ? initialOutput.connIndex : 0);
            const queue = [{
                current: initialOutput.targetName,
                previous: startName,
                pipes: [],
                lastOutput: initialOutput
            }];
            const localVisited = new Set([startName, initialOutput.targetName]);

            while (queue.length > 0) {
                const { current, previous, pipes, lastOutput } = queue.shift();
                const nextGObj = graphicObjects.get(current);
                if (!nextGObj) continue;

                if (equipmentNames.has(current) && current !== startName) {
                    const targetConn = nextGObj.inputs.find((inp) => inp.sourceName === previous);
                    const targetConnIndex = targetConn
                        ? (Number.isFinite(targetConn.targetConnIndex)
                            ? targetConn.targetConnIndex
                            : (Number.isFinite(targetConn.connIndex) ? targetConn.connIndex : 0))
                        : (Number.isFinite(lastOutput?.targetConnIndex) ? lastOutput.targetConnIndex : 0);
                    results.push({
                        target: current,
                        pipes: [...pipes],
                        sourceConnIndex,
                        targetConnIndex
                    });
                    continue; // não atravessa o equipamento
                }

                const newPipes = [...pipes];
                if (nextGObj.objectType === 'Pipe') {
                    const simObj = simObjects.get(current);
                    if (simObj) newPipes.push(simObj);
                }

                for (const output of nextGObj.outputs) {
                    const next = output.targetName;
                    if (localVisited.has(next)) continue;
                    localVisited.add(next);
                    queue.push({
                        current: next,
                        previous: current,
                        pipes: newPipes,
                        lastOutput: output
                    });
                }
            }
        });

        return results;
    };

    equipmentNames.forEach((startName) => {
        const reachable = findReachableEquipment(startName);
        const sourceId = componentByDwsimName.get(startName);
        const sourceType = componentTypeByDwsimName.get(startName);
        if (!sourceId) return;

        reachable.forEach(({ target, pipes, sourceConnIndex = 0, targetConnIndex = 0 }) => {
            const targetId = componentByDwsimName.get(target);
            const targetType = componentTypeByDwsimName.get(target);
            if (!targetId) return;

            const pairKey = `${sourceId}:${sourceConnIndex}->${targetId}:${targetConnIndex}`;
            if (visitedPairs.has(pairKey)) return;
            visitedPairs.add(pairKey);

            const pipeParams = pipes.length > 0
                ? pipeParameters(pipes[0].element)
                : defaultPipeParams();

            let sourcePort = 'out';
            if (sourceType === 'heat_exchanger') {
                const sourceSimObj = simObjects.get(startName);
                const isCounter = isCounterCurrentExchanger(sourceSimObj);
                if (sourceConnIndex === 1) {
                    sourcePort = isCounter ? 'in2' : 'out2';
                } else {
                    sourcePort = 'out1';
                }
            }

            let targetPort = 'in';
            if (targetType === 'heat_exchanger') {
                const targetSimObj = simObjects.get(target);
                const isCounter = isCounterCurrentExchanger(targetSimObj);
                if (targetConnIndex === 1) {
                    targetPort = isCounter ? 'out2' : 'in2';
                } else {
                    targetPort = 'in1';
                }
            }

            connections.push({
                sourceId,
                targetId,
                sourceEndpoint: defaultEndpointFor(sourceType, sourcePort),
                targetEndpoint: defaultEndpointFor(targetType, targetPort),
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
    arrangeDwsimLayout(components, connections);

    const workspace = {
        config: { usarAlturaRelativa: false },
        components,
        connections,
        selection: { componentIds: [], connectionId: null }
    };

    return { workspace, stats };
}

export function normalizePositions(components) {
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


// Dimensões visuais dos componentes GAAP para cálculo de espaçamento e prevenção de colisões
const COMPONENT_VISUAL_FOOTPRINT = {
    source: { width: 60, height: 60 },
    sink: { width: 60, height: 60 },
    pump: { width: 80, height: 80 },
    valve: { width: 60, height: 60 },
    tank: { width: 160, height: 240 },
    heat_exchanger: { width: 200, height: 160 }
};

const MIN_PIPE_GAP_X = 120;
const MIN_COMPONENT_GAP_Y = 60;

/**
 * Organiza e distribui os componentes importados do DWSIM no canvas do GAAP:
 * - Agrupa em circuitos/ilhas conexas e processa de cima para baixo.
 * - Calcula níveis topológicos (DAG ranks) ao longo do fluxo de processo (esquerda -> direita).
 * - Detecta e isola ciclos de reciclo/retroalimentação via DFS para garantir aciclicidade no ranking.
 * - Garante espaçamento confortável entre componentes conectados (mínimo de 120px de tubulação visível).
 * - Elimina 100% de colisões e sobreposições de caixas delimitadoras (bounding boxes).
 * - Alinha componentes conectados na vertical (ex: válvula com saída inferior de tanque, correntes de trocador).
 * - Alinha todas as posições à grade padrão do GAAP (múltiplos de 40px).
 */
export function arrangeDwsimLayout(components, connections = []) {
    if (!components || components.length === 0) return;

    if (!connections || connections.length === 0) {
        normalizePositions(components);
        return;
    }

    // 1. Grafo de adjacência (não-direcionado para ilhas, direcionado para fluxo)
    const adj = new Map();
    const outEdges = new Map();
    const inDegree = new Map();
    components.forEach((c) => {
        adj.set(c.id, []);
        outEdges.set(c.id, []);
        inDegree.set(c.id, 0);
    });

    connections.forEach((conn) => {
        adj.get(conn.sourceId)?.push(conn.targetId);
        adj.get(conn.targetId)?.push(conn.sourceId);
        outEdges.get(conn.sourceId)?.push(conn.targetId);
        inDegree.set(conn.targetId, (inDegree.get(conn.targetId) || 0) + 1);
    });

    // 2. Particionamento em ilhas conexas
    const visited = new Set();
    const rawIslands = [];
    components.forEach((c) => {
        if (!visited.has(c.id)) {
            const island = [];
            const queue = [c.id];
            visited.add(c.id);
            while (queue.length > 0) {
                const id = queue.shift();
                const comp = components.find((x) => x.id === id);
                if (comp) island.push(comp);
                for (const neighbor of (adj.get(id) || [])) {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        queue.push(neighbor);
                    }
                }
            }
            rawIslands.push(island);
        }
    });

    const connectedIslands = [];
    const isolatedComponents = [];
    rawIslands.forEach((isl) => {
        if (isl.length === 1 && (adj.get(isl[0].id) || []).length === 0) {
            isolatedComponents.push(isl[0]);
        } else {
            connectedIslands.push(isl);
        }
    });

    // Ordena circuitos conectados pelo Y original mínimo
    connectedIslands.sort((a, b) => {
        const minYa = Math.min(...a.map((c) => c.snapshot.y));
        const minYb = Math.min(...b.map((c) => c.snapshot.y));
        return minYa - minYb;
    });

    let currentIslandY = POSITION_ORIGIN_Y;

    // 3. Layout de cada circuito
    for (const island of connectedIslands) {
        const islandCompIds = new Set(island.map((c) => c.id));
        const islandConns = connections.filter((conn) => islandCompIds.has(conn.sourceId) && islandCompIds.has(conn.targetId));

        // Detecção de arestas de reciclo / ciclos via DFS
        const visitedState = new Map(); // 0: unvisited, 1: visiting, 2: visited
        const backEdges = new Set();

        function dfs(nodeId) {
            visitedState.set(nodeId, 1);
            for (const targetId of (outEdges.get(nodeId) || [])) {
                if (!islandCompIds.has(targetId)) continue;
                const state = visitedState.get(targetId) || 0;
                if (state === 1) {
                    backEdges.add(`${nodeId}->${targetId}`);
                } else if (state === 0) {
                    dfs(targetId);
                }
            }
            visitedState.set(nodeId, 2);
        }

        let roots = island.filter((c) => (inDegree.get(c.id) || 0) === 0);
        if (roots.length === 0) {
            roots = [[...island].sort((a, b) => a.snapshot.x - b.snapshot.x)[0]];
        }
        roots.forEach((r) => {
            if ((visitedState.get(r.id) || 0) === 0) dfs(r.id);
        });
        island.forEach((c) => {
            if ((visitedState.get(c.id) || 0) === 0) dfs(c.id);
        });

        // Níveis topológicos por caminho mais longo em grafo acíclico
        const ranks = new Map();
        roots.forEach((r) => ranks.set(r.id, 0));

        let changed = true;
        let iter = 0;
        while (changed && iter < island.length * 2) {
            changed = false;
            iter++;
            for (const conn of islandConns) {
                if (backEdges.has(`${conn.sourceId}->${conn.targetId}`)) continue;
                const srcRank = ranks.get(conn.sourceId);
                if (srcRank !== undefined) {
                    const tgtRank = ranks.get(conn.targetId);
                    if (tgtRank === undefined || tgtRank < srcRank + 1) {
                        ranks.set(conn.targetId, srcRank + 1);
                        changed = true;
                    }
                }
            }
        }

        island.forEach((c) => {
            if (ranks.get(c.id) === undefined) ranks.set(c.id, 0);
        });

        const minRank = Math.min(...island.map((c) => ranks.get(c.id)));
        if (minRank > 0) {
            island.forEach((c) => ranks.set(c.id, ranks.get(c.id) - minRank));
        }

        const maxRank = Math.max(...island.map((c) => ranks.get(c.id)));
        const rankColumns = [];
        for (let r = 0; r <= maxRank; r++) {
            rankColumns.push(island.filter((c) => ranks.get(c.id) === r));
        }

        // Ordena cada coluna verticalmente preservando intenção original
        rankColumns.forEach((col) => {
            col.sort((a, b) => a.snapshot.y - b.snapshot.y);
        });

        // Determina a posição X das colunas
        let currentX = POSITION_ORIGIN_X;
        const colPositionsX = [];
        for (let r = 0; r <= maxRank; r++) {
            colPositionsX.push(currentX);
            const col = rankColumns[r];
            const maxColWidth = col.length > 0
                ? Math.max(...col.map((c) => (COMPONENT_VISUAL_FOOTPRINT[c.snapshot.type] || { width: 80 }).width))
                : 80;
            currentX += Math.round((maxColWidth + MIN_PIPE_GAP_X) / 40) * 40;
        }

        // Posiciona componentes em Y
        let maxIslandY = currentIslandY;

        for (let r = 0; r <= maxRank; r++) {
            const col = rankColumns[r];
            const colX = colPositionsX[r];

            let curY = currentIslandY;
            col.forEach((c) => {
                const footprint = COMPONENT_VISUAL_FOOTPRINT[c.snapshot.type] || { width: 80, height: 80 };
                c.snapshot.x = colX;

                const preds = islandConns.filter((cn) => cn.targetId === c.id);
                if (preds.length === 1) {
                    const predComp = island.find((x) => x.id === preds[0].sourceId);
                    if (predComp && c.snapshot.type !== 'tank') {
                        if (predComp.snapshot.type === 'tank') {
                            curY = Math.max(curY, predComp.snapshot.y + 160);
                        } else {
                            curY = Math.max(curY, predComp.snapshot.y);
                        }
                    }
                } else if (preds.length === 0) {
                    const origMinY = Math.min(...col.map((x) => x.snapshot.y));
                    const relY = c.snapshot.y - origMinY;
                    curY = Math.max(curY, currentIslandY + relY);
                }

                c.snapshot.y = Math.round(curY / 40) * 40;
                curY = c.snapshot.y + footprint.height + MIN_COMPONENT_GAP_Y;
                maxIslandY = Math.max(maxIslandY, c.snapshot.y + footprint.height);
            });
        }

        // Alinhamentos específicos:
        // 1. Tanque -> Válvula / Tubulação de saída
        for (const conn of islandConns) {
            const src = island.find((x) => x.id === conn.sourceId);
            const tgt = island.find((x) => x.id === conn.targetId);
            if (src && tgt && src.snapshot.type === 'tank' && tgt.snapshot.type === 'valve') {
                tgt.snapshot.y = src.snapshot.y + 160;
                const afterValve = islandConns.filter((cn) => cn.sourceId === tgt.id);
                afterValve.forEach((cn) => {
                    const nextComp = island.find((x) => x.id === cn.targetId);
                    if (nextComp) nextComp.snapshot.y = tgt.snapshot.y;
                });
                maxIslandY = Math.max(maxIslandY, tgt.snapshot.y + (COMPONENT_VISUAL_FOOTPRINT[tgt.snapshot.type] || { height: 80 }).height);
            }
        }

        // 2. Trocador de calor com duas correntes
        for (const c of island) {
            if (c.snapshot.type === 'heat_exchanger') {
                const inConns = islandConns.filter((cn) => cn.targetId === c.id);
                const outConns = islandConns.filter((cn) => cn.sourceId === c.id);

                inConns.forEach((cn) => {
                    const src = island.find((x) => x.id === cn.sourceId);
                    if (src) {
                        if (cn.targetEndpoint?.portId === 'in2' || cn.targetConnIndex === 1) {
                            src.snapshot.y = c.snapshot.y + 80;
                        } else {
                            src.snapshot.y = c.snapshot.y;
                        }
                    }
                });
                outConns.forEach((cn) => {
                    const tgt = island.find((x) => x.id === cn.targetId);
                    if (tgt) {
                        if (cn.sourceEndpoint?.portId === 'out2' || cn.sourceConnIndex === 1) {
                            tgt.snapshot.y = c.snapshot.y + 80;
                        } else {
                            tgt.snapshot.y = c.snapshot.y;
                        }
                    }
                });
                maxIslandY = Math.max(maxIslandY, c.snapshot.y + 80 + 60);
            }
        }

        currentIslandY = Math.round((maxIslandY + 120) / 40) * 40;
    }

    // 4. Posiciona componentes avulsos (isolados) em linha organizada
    if (isolatedComponents.length > 0) {
        let curX = POSITION_ORIGIN_X;
        isolatedComponents.forEach((comp) => {
            const footprint = COMPONENT_VISUAL_FOOTPRINT[comp.snapshot.type] || { width: 80, height: 80 };
            comp.snapshot.x = curX;
            comp.snapshot.y = currentIslandY;
            curX += Math.round((footprint.width + MIN_PIPE_GAP_X) / 40) * 40;
        });
    }
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
