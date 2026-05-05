import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ConnectionModel } from '../js/domain/models/ConnectionModel.js';
import {
    ensureConnectionProperties,
    getConnectionResponseTimeS,
    getPipeHydraulics
} from '../js/domain/services/PipeHydraulics.js';
import { listComponentDefinitions } from '../js/presentation/registry/ComponentDefinitionRegistry.js';
import { getComponentVisualSpec } from '../js/infrastructure/dom/ComponentVisualSpecs.js';
import { InputValidator } from '../js/presentation/validation/InputValidator.js';

const REGISTRY_ROOT = path.resolve('js/presentation/registry');
const REGISTRY_SPECS_ROOT = path.resolve('js/presentation/registry/specs');
const PRESENTATION_ROOT = path.resolve('js/presentation');
const DOMAIN_SERVICES_ROOT = path.resolve('js/domain/services');
const additionalPropsHook = ['propriedades', 'Adicionais'].join('');
const setupPropsHook = ['setup', 'Props'].join('');
const removedFiles = [
    ['js', ['Motor', 'Fisico.js'].join('')],
    ['js', ['Registro', 'Componentes.js'].join('')],
    ['js', ['Fabrica', 'Equipamentos.js'].join('')],
    ['js', 'utils', ['Flow', 'Solver.js'].join('')],
    ['js', 'utils', 'InputValidator.js'],
    ['js', 'utils', 'PipeHydraulics.js'],
    ['js', 'presentation', 'properties', 'component', 'PumpValveComponentPropertiesPresenter.js']
];

function listSpecFiles(dirPath) {
    return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) return listSpecFiles(fullPath);
        return entry.isFile() && fullPath.endsWith('.js') ? [fullPath] : [];
    });
}

function listJsFiles(dirPath) {
    return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) return listJsFiles(fullPath);
        return entry.isFile() && fullPath.endsWith('.js') ? [fullPath] : [];
    });
}

test('validação de input vive somente na apresentação', () => {
    const validFlow = InputValidator.validateFlow('12.5', 500, 'Vazão');
    assert.deepEqual(validFlow, { valid: true, value: 12.5 });

    const invalidPressure = InputValidator.validatePressure('-1', 10, 'Pressão');
    assert.equal(invalidPressure.valid, false);
});

test('hidráulica de tubos vive somente no domínio', () => {
    const connection = ensureConnectionProperties(new ConnectionModel({ sourceId: 'F-01', targetId: 'D-01' }));
    const geometry = { lengthM: 12, straightLengthM: 10, headGainM: 0.5 };
    const hydraulics = getPipeHydraulics(connection, geometry, connection.areaM2, 10, 997, 0.001);
    const responseTimeS = getConnectionResponseTimeS(connection, geometry, {
        densidade: 997,
        viscosidadeDinamicaPaS: 0.001
    });

    assert.ok(connection.areaM2 > 0, 'Conexão deve receber área hidráulica padrão');
    assert.ok(hydraulics.velocityMps > 0, 'Vazão positiva deve gerar velocidade positiva');
    assert.ok(hydraulics.reynolds > 0, 'Vazão positiva deve gerar Reynolds positivo');
    assert.ok(responseTimeS >= 0.05 && responseTimeS <= 2.8, 'Resposta deve respeitar faixa física limitada');
});

test('specs de componentes não carregam mais presenters de propriedades', () => {
    listSpecFiles(REGISTRY_SPECS_ROOT).forEach((filePath) => {
        const content = fs.readFileSync(filePath, 'utf8');

        assert.ok(!content.includes('svg:'), `${filePath} não deve renderizar SVG/HTML`);
        assert.ok(!content.includes('setup:'), `${filePath} não deve vincular eventos visuais`);
        assert.ok(!content.includes('<'), `${filePath} não deve conter markup`);
        assert.ok(!content.includes(additionalPropsHook), `${filePath} não deve renderizar painel de propriedades`);
        assert.ok(!content.includes(setupPropsHook), `${filePath} não deve vincular eventos do painel de propriedades`);
        assert.ok(!content.includes('InputValidator'), `${filePath} não deve validar inputs de apresentação`);
        assert.ok(!content.includes('renderPropertyTabs'), `${filePath} não deve montar abas de propriedades`);
    });
});

test('registry de componentes retorna apenas metadados estáveis', () => {
    listComponentDefinitions().forEach(({ type, definition }) => {
        assert.equal(typeof definition.svg, 'undefined', `${type} não deve expor renderer no registry`);
        assert.equal(typeof definition.setup, 'undefined', `${type} não deve expor setup visual no registry`);
        assert.equal(typeof definition.Classe, 'function', `${type} deve manter a classe lógica`);
        assert.equal(typeof definition.prefixoTag, 'string', `${type} deve manter o prefixo de tag`);

        const visualSpec = getComponentVisualSpec(type);
        assert.equal(typeof visualSpec?.svg, 'function', `${type} deve ter renderer na infraestrutura DOM`);
        assert.equal(typeof visualSpec?.setup, 'function', `${type} deve ter setup visual na infraestrutura DOM`);
    });
});

test('registry de apresentação não depende de helpers do painel de propriedades', () => {
    listSpecFiles(REGISTRY_ROOT).forEach((filePath) => {
        const content = fs.readFileSync(filePath, 'utf8');

        assert.ok(!content.includes('InputValidator'), `${filePath} não deve importar validadores de painel`);
        assert.ok(!content.includes('renderPropertyTabs'), `${filePath} não deve importar abas de propriedades`);
        assert.ok(!content.includes('PropertyPresenterShared'), `${filePath} não deve depender de helpers de presenters`);
    });
});

test('apresentação recebe engine por injeção, não por singleton global', () => {
    listJsFiles(PRESENTATION_ROOT).forEach((filePath) => {
        const content = fs.readFileSync(filePath, 'utf8');

        assert.ok(
            !content.includes('application/engine/SimulationEngine'),
            `${filePath} não deve importar o singleton do motor diretamente`
        );
        assert.ok(
            !/import\s*\{\s*ENGINE(?:\s|,|\})/.test(content),
            `${filePath} deve receber o engine por injeção/contexto de apresentação`
        );
    });
});

test('solver de domínio depende de contexto hidráulico estreito', () => {
    [
        path.join(DOMAIN_SERVICES_ROOT, 'HydraulicNetworkSolver.js'),
        path.join(DOMAIN_SERVICES_ROOT, 'HydraulicBranchModel.js')
    ].forEach((filePath) => {
        const content = fs.readFileSync(filePath, 'utf8');

        assert.ok(!content.includes('this.engine'), `${filePath} não deve depender do objeto engine inteiro`);
        assert.ok(!content.includes('constructor(engine)'), `${filePath} não deve receber engine cru no construtor`);
    });
});

test('fachadas e wrappers legados foram removidos', () => {
    removedFiles.forEach((fileParts) => {
        const filePath = path.resolve(...fileParts);
        assert.equal(fs.existsSync(filePath), false, `${filePath} não deve voltar como compatibilidade legada`);
    });
});
