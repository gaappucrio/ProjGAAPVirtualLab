import { ComponentEventPayloads } from '../../application/events/EventPayloads.js';
import { BombaLogica } from '../../domain/components/BombaLogica.js';
import { DrenoLogico } from '../../domain/components/DrenoLogico.js';
import { FonteLogica } from '../../domain/components/FonteLogica.js';
import { cloneFluido } from '../../domain/components/Fluido.js';
import { TanqueLogico } from '../../domain/components/TanqueLogico.js';
import { ValvulaLogica } from '../../domain/components/ValvulaLogica.js';
import { FabricaDeEquipamentos, updatePortStates } from '../../infrastructure/dom/ComponentVisualFactory.js';
import { GRID_SIZE } from '../../Config.js';
import { isEnglishLanguage } from '../../utils/LanguageManager.js';
import { makeComponentDraggable } from './DragDropController.js';

const PASTE_OFFSET = GRID_SIZE;

const COMMON_CLONEABLE_PROPERTIES = [
    'diametroConexaoM'
];

const CLONEABLE_PROPERTIES_BY_TYPE = {
    source: [
        'pressaoFonteBar',
        'vazaoMaxima',
        'fluidoEntrada',
        'fluidoEntradaPresetId'
    ],
    sink: [
        'pressaoSaidaBar',
        'perdaEntradaK'
    ],
    pump: [
        'isOn',
        'vazaoNominal',
        'grauAcionamento',
        'acionamentoEfetivo',
        'pressaoMaxima',
        'eficienciaHidraulica',
        'eficienciaAtual',
        'npshRequeridoM',
        'npshRequeridoAtualM',
        'tempoRampaSegundos',
        'fracaoMelhorEficiencia'
    ],
    valve: [
        'aberta',
        'grauAbertura',
        'aberturaEfetiva',
        'cv',
        'perdaLocalK',
        'perfilCaracteristica',
        'tipoCaracteristica',
        'rangeabilidade',
        'tempoCursoSegundos'
    ],
    tank: [
        'capacidadeMaxima',
        'volumeAtual',
        'alturaUtilMetros',
        'coeficienteSaida',
        'perdaEntradaK',
        'alturaBocalEntradaM',
        'alturaBocalSaidaM',
        'volumeInicial',
        'fluidoConteudo',
        'setpointAtivo',
        'setpoint',
        'kp',
        'ki'
    ]
};

function getComponentTypeKey(component) {
    if (component instanceof DrenoLogico) return 'sink';
    if (component instanceof BombaLogica) return 'pump';
    if (component instanceof ValvulaLogica) return 'valve';
    if (component instanceof TanqueLogico) return 'tank';
    if (component instanceof FonteLogica) return 'source';
    return null;
}

function isFluidLike(value) {
    return value
        && typeof value === 'object'
        && 'densidade' in value
        && 'viscosidadeDinamicaPaS' in value
        && 'pressaoVaporBar' in value;
}

function cloneSnapshotValue(value) {
    if (isFluidLike(value)) return cloneFluido(value);
    if (Array.isArray(value)) return value.map((item) => cloneSnapshotValue(item));
    if (value && typeof value === 'object') {
        if (value instanceof Set) return new Set([...value].map((item) => cloneSnapshotValue(item)));
        if (value instanceof Map) {
            return new Map([...value].map(([key, item]) => [key, cloneSnapshotValue(item)]));
        }

        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, cloneSnapshotValue(item)])
        );
    }

    return value;
}

function getCloneablePropertyKeys(type) {
    return [
        ...COMMON_CLONEABLE_PROPERTIES,
        ...(CLONEABLE_PROPERTIES_BY_TYPE[type] || [])
    ];
}

export function buildClonedComponentTag(originalTag) {
    const suffix = isEnglishLanguage() ? 'copy' : 'copia';
    return `${String(originalTag || '').trim()} - ${suffix}`.trim();
}

export function createComponentClipboardSnapshot(component) {
    const type = getComponentTypeKey(component);
    if (!type) return null;

    const properties = {};
    getCloneablePropertyKeys(type).forEach((key) => {
        if (!Object.hasOwn(component, key)) return;
        properties[key] = cloneSnapshotValue(component[key]);
    });

    return {
        type,
        tag: component.tag,
        x: Number(component.x) || 0,
        y: Number(component.y) || 0,
        properties
    };
}

export function applyComponentClipboardSnapshot(snapshot, component, { tag } = {}) {
    if (!snapshot || !component) return component;

    Object.entries(snapshot.properties || {}).forEach(([key, value]) => {
        component[key] = cloneSnapshotValue(value);
    });

    if (tag !== undefined) component.tag = tag;
    component.x = Number(component.x) || 0;
    component.y = Number(component.y) || 0;

    return component;
}

function isTextEditingTarget(target) {
    const tagName = target?.tagName?.toLowerCase?.();
    return tagName === 'input'
        || tagName === 'textarea'
        || tagName === 'select'
        || target?.isContentEditable === true;
}

function snapToGrid(value) {
    return Math.round((Number(value) || 0) / GRID_SIZE) * GRID_SIZE;
}

function clearVisualSelection() {
    document.querySelectorAll('.placed-component').forEach((element) => {
        element.classList.remove('selected');
    });

    document.querySelectorAll('.pipe-line').forEach((element) => {
        element.classList.remove('selected');
        element.setAttribute(
            'marker-end',
            element.classList.contains('active') ? 'url(#arrow-active)' : 'url(#arrow)'
        );
    });
}

function syncClonedComponentVisual(component) {
    component.notify(ComponentEventPayloads.tagUpdate());

    if (component instanceof FonteLogica) {
        component.notify(ComponentEventPayloads.state({ fluidUpdate: true }));
        return;
    }

    if (component instanceof BombaLogica) {
        component.notify(ComponentEventPayloads.state({
            isOn: component.isOn,
            grau: component.grauAcionamento,
            grauEfetivo: component.acionamentoEfetivo
        }));
        return;
    }

    if (component instanceof ValvulaLogica) {
        component.notify(ComponentEventPayloads.state({
            aberta: component.aberta,
            grau: component.grauAbertura,
            grauEfetivo: component.aberturaEfetiva,
            cv: component.cv,
            perdaLocalK: component.perdaLocalK,
            perfilCaracteristica: component.perfilCaracteristica,
            tipoCaracteristica: component.tipoCaracteristica,
            rangeabilidade: component.rangeabilidade,
            tempoCursoSegundos: component.tempoCursoSegundos
        }));
        return;
    }

    if (component instanceof TanqueLogico) {
        component.sincronizarMetricasFisicas?.();
        const fluidoConteudo = component.getFluidoConteudo?.() || component.fluidoConteudo;
        component.notify(ComponentEventPayloads.volumeUpdate({
            perc: component.capacidadeMaxima > 0 ? component.volumeAtual / component.capacidadeMaxima : 0,
            abs: component.volumeAtual,
            qIn: component.lastQin || 0,
            qOut: component.lastQout || 0,
            pBottom: component.pressaoFundoBar,
            fluidoConteudo
        }));
        component.notify(ComponentEventPayloads.setpointUpdate());
    }
}

function getSelectedComponent(engine) {
    if (engine.selectedComponent) return engine.selectedComponent;
    const selectedVisual = document.querySelector('.placed-component.selected');
    return selectedVisual?.logica || null;
}

function pasteComponentFromSnapshot({ engine, snapshot, pasteCount }) {
    const workspaceCanvas = document.getElementById('workspace-canvas');
    if (!workspaceCanvas || !snapshot) return null;

    const x = snapToGrid(snapshot.x + (PASTE_OFFSET * pasteCount));
    const y = snapToGrid(snapshot.y + (PASTE_OFFSET * pasteCount));
    const tag = buildClonedComponentTag(snapshot.tag);
    const visual = FabricaDeEquipamentos.criar(snapshot.type, x, y, false, { tag });

    if (!visual?.logica) return null;

    applyComponentClipboardSnapshot(snapshot, visual.logica, { tag });
    visual.logica.x = x;
    visual.logica.y = y;
    visual.style.left = `${x}px`;
    visual.style.top = `${y}px`;

    workspaceCanvas.appendChild(visual);
    makeComponentDraggable(visual);
    syncClonedComponentVisual(visual.logica);

    clearVisualSelection();
    visual.classList.add('selected');
    engine.selectComponent(visual.logica);
    updatePortStates();

    return visual.logica;
}

export function setupClipboardController({ engine } = {}) {
    if (!engine || typeof document === 'undefined') return;

    let copiedSnapshot = null;
    let pasteCount = 0;

    document.addEventListener('keydown', (event) => {
        if (isTextEditingTarget(event.target)) return;
        if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

        const key = String(event.key || '').toLowerCase();

        if (key === 'c') {
            const component = getSelectedComponent(engine);
            if (!component) return;

            copiedSnapshot = createComponentClipboardSnapshot(component);
            pasteCount = 0;
            if (copiedSnapshot) event.preventDefault();
            return;
        }

        if (key === 'v') {
            if (!copiedSnapshot) return;

            event.preventDefault();
            pasteCount += 1;
            pasteComponentFromSnapshot({ engine, snapshot: copiedSnapshot, pasteCount });
        }
    });
}
