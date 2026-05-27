import { FLOWCHART_DOCUMENT_TYPE, FLOWCHART_DOCUMENT_VERSION } from './FlowchartPersistence.js';

function component(id, type, tag, x, y, properties = {}) {
    return {
        id,
        snapshot: {
            type,
            tag,
            x,
            y,
            properties
        }
    };
}

function connection(id, sourceId, targetId, extra = {}) {
    return {
        id,
        sourceId,
        targetId,
        sourceEndpoint: { portType: 'out', offsetX: 0, offsetY: 0, floorOffsetY: 0, dynamicHeight: null },
        targetEndpoint: { portType: 'in', offsetX: 0, offsetY: 0, floorOffsetY: 0, dynamicHeight: null },
        diameterM: 0.05,
        roughnessMm: 0.045,
        extraLengthM: 1,
        perdaLocalK: 0.5,
        designVelocityMps: 1.5,
        designFlowLps: 0,
        transientFlowLps: 0,
        lastResolvedFlowLps: 0,
        ...extra
    };
}

function scenario(id, name, description, workspace) {
    return {
        id,
        name,
        description,
        document: {
            type: FLOWCHART_DOCUMENT_TYPE,
            version: FLOWCHART_DOCUMENT_VERSION,
            name,
            app: 'GAAP Virtual Lab',
            exportedAt: 'scenario-template',
            language: 'pt',
            workspace
        }
    };
}

const setpointTwoValve = scenario(
    'setpoint-duas-valvulas',
    'Tanque com PA e duas valvulas',
    'Entrada, valvula de alimentacao, tanque com set point e valvula de saida.',
    {
        config: { usarAlturaRelativa: false },
        components: [
            component('sc-sp-source', 'source', 'Entrada-01', 40, 160, {
                pressaoFonteBar: 2,
                vazaoMaxima: 80
            }),
            component('sc-sp-vin', 'valve', 'V-01', 200, 160, {
                aberta: false,
                grauAbertura: 0,
                aberturaEfetiva: 0,
                perfilCaracteristica: 'quick_opening',
                tipoCaracteristica: 'quick_opening',
                cv: 10,
                perdaLocalK: 0.35,
                rangeabilidade: 15,
                tempoCursoSegundos: 2
            }),
            component('sc-sp-tank', 'tank', 'T-01', 380, 120, {
                capacidadeMaxima: 1000,
                volumeAtual: 450,
                alturaUtilMetros: 2.4,
                setpointAtivo: true,
                setpoint: 50,
                kp: 250,
                ki: 25
            }),
            component('sc-sp-vout', 'valve', 'V-02', 590, 160, {
                aberta: false,
                grauAbertura: 0,
                aberturaEfetiva: 0,
                perfilCaracteristica: 'quick_opening',
                tipoCaracteristica: 'quick_opening',
                cv: 10,
                perdaLocalK: 0.35,
                rangeabilidade: 15,
                tempoCursoSegundos: 2
            }),
            component('sc-sp-sink', 'sink', 'Saida-01', 750, 160, {
                pressaoSaidaBar: 0
            })
        ],
        connections: [
            connection('sc-sp-c1', 'sc-sp-source', 'sc-sp-vin'),
            connection('sc-sp-c2', 'sc-sp-vin', 'sc-sp-tank'),
            connection('sc-sp-c3', 'sc-sp-tank', 'sc-sp-vout'),
            connection('sc-sp-c4', 'sc-sp-vout', 'sc-sp-sink')
        ],
        selection: { componentIds: ['sc-sp-tank'], connectionId: null }
    }
);

const pumpFeedTank = scenario(
    'bomba-para-tanque',
    'Bomba alimentando tanque',
    'Fonte pressurizada, bomba centrifuga, tanque e saida com valvula.',
    {
        config: { usarAlturaRelativa: true },
        components: [
            component('sc-pump-source', 'source', 'Entrada-01', 40, 210, {
                pressaoFonteBar: 0.8,
                vazaoMaxima: 120
            }),
            component('sc-pump-pump', 'pump', 'P-01', 210, 210, {
                isOn: true,
                vazaoNominal: 45,
                grauAcionamento: 100,
                acionamentoEfetivo: 100,
                pressaoMaxima: 4,
                eficienciaHidraulica: 0.72,
                npshRequeridoM: 2.5
            }),
            component('sc-pump-tank', 'tank', 'T-01', 410, 140, {
                capacidadeMaxima: 1500,
                volumeAtual: 300,
                alturaUtilMetros: 3,
                alturaBocalEntradaM: 2.4,
                alturaBocalSaidaM: 0.2
            }),
            component('sc-pump-valve', 'valve', 'V-01', 640, 230, {
                aberta: true,
                grauAbertura: 70,
                aberturaEfetiva: 70,
                perfilCaracteristica: 'linear',
                tipoCaracteristica: 'linear',
                cv: 6,
                perdaLocalK: 0.75,
                rangeabilidade: 50,
                tempoCursoSegundos: 4
            }),
            component('sc-pump-sink', 'sink', 'Saida-01', 800, 230, {
                pressaoSaidaBar: 0
            })
        ],
        connections: [
            connection('sc-pump-c1', 'sc-pump-source', 'sc-pump-pump'),
            connection('sc-pump-c2', 'sc-pump-pump', 'sc-pump-tank'),
            connection('sc-pump-c3', 'sc-pump-tank', 'sc-pump-valve'),
            connection('sc-pump-c4', 'sc-pump-valve', 'sc-pump-sink')
        ],
        selection: { componentIds: ['sc-pump-pump'], connectionId: null }
    }
);

const closedLoopDiagnostic = scenario(
    'malha-fechada-experimental',
    'Malha fechada experimental',
    'Circuito bomba-valvula para demonstrar o aviso de solver nodal experimental.',
    {
        config: { usarAlturaRelativa: false },
        components: [
            component('sc-loop-pump', 'pump', 'P-Loop', 300, 170, {
                isOn: true,
                vazaoNominal: 60,
                grauAcionamento: 100,
                acionamentoEfetivo: 100,
                pressaoMaxima: 4
            }),
            component('sc-loop-valve', 'valve', 'V-Loop', 520, 170, {
                aberta: true,
                grauAbertura: 100,
                aberturaEfetiva: 100,
                perfilCaracteristica: 'quick_opening',
                tipoCaracteristica: 'quick_opening',
                cv: 10,
                perdaLocalK: 0.35,
                rangeabilidade: 15,
                tempoCursoSegundos: 2
            })
        ],
        connections: [
            connection('sc-loop-c1', 'sc-loop-pump', 'sc-loop-valve'),
            connection('sc-loop-c2', 'sc-loop-valve', 'sc-loop-pump')
        ],
        selection: { componentIds: ['sc-loop-pump'], connectionId: null }
    }
);

export const READY_SCENARIOS = Object.freeze([
    setpointTwoValve,
    pumpFeedTank,
    closedLoopDiagnostic
]);

export function listReadyScenarios() {
    return READY_SCENARIOS.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description
    }));
}

export function getReadyScenario(id) {
    return READY_SCENARIOS.find((item) => item.id === id) || null;
}
