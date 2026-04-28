import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { SistemaSimulacao } from '../js/MotorFisico.js';
import { ConnectionModel } from '../js/domain/models/ConnectionModel.js';
import { DrenoLogico } from '../js/domain/components/DrenoLogico.js';
import { FonteLogica } from '../js/domain/components/FonteLogica.js';
import { ValvulaLogica } from '../js/domain/components/ValvulaLogica.js';

const DOMAIN_ROOT = path.resolve('js/domain');

function createEngine() {
    const engine = new SistemaSimulacao();
    engine.isRunning = true;
    engine.usarAlturaRelativa = false;
    return engine;
}

function runSinglePhysicsStep(engine, dt = 0.1) {
    engine.componentes.forEach((component) => component.atualizarDinamica(dt, engine.fluidoOperante));
    engine.resolvePushBasedNetwork(dt);
    engine.componentes.forEach((component) => component.sincronizarMetricasFisicas(engine.fluidoOperante));
}

function listDomainFiles(dirPath) {
    return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) return listDomainFiles(fullPath);
        return entry.isFile() && fullPath.endsWith('.js') ? [fullPath] : [];
    });
}

test('módulos de domínio não importam engine global, DOM, Chart ou controllers', () => {
    const domainFiles = listDomainFiles(DOMAIN_ROOT);
    const forbiddenImportPatterns = [
        /from\s+['"][^'"]*MotorFisico\.js['"]/,
        /from\s+['"][^'"]*controllers\/[^'"]*['"]/,
        /from\s+['"][^'"]*Chart[^'"]*['"]/,
        /from\s+['"][^'"]*document[^'"]*['"]/
    ];

    domainFiles.forEach((filePath) => {
        const content = fs.readFileSync(filePath, 'utf8');
        forbiddenImportPatterns.forEach((pattern) => {
            assert.ok(
                !pattern.test(content),
                `Import indevido encontrado em ${filePath}: ${pattern}`
            );
        });

        assert.ok(!content.includes('document.'), `Referência direta a document encontrada em ${filePath}`);
        assert.ok(!content.includes('Chart('), `Referência direta a Chart encontrada em ${filePath}`);
    });
});

test('topologia indexa componentes e conexões sem depender de DOM', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-01', 'Fonte-01', 0, 0);
    const valvula = new ValvulaLogica('V-01', 'Valvula-01', 80, 0);
    const dreno = new DrenoLogico('D-01', 'Dreno-01', 160, 0);

    engine.add(fonte);
    engine.add(valvula);
    engine.add(dreno);

    const conn1 = new ConnectionModel({ sourceId: fonte.id, targetId: valvula.id });
    const conn2 = new ConnectionModel({ sourceId: valvula.id, targetId: dreno.id });

    engine.addConnection(conn1);
    engine.addConnection(conn2);

    assert.equal(engine.getComponentById('F-01'), fonte, 'Lookup de componente deve vir do índice da topologia');
    assert.deepEqual(engine.getOutputConnections(fonte).map((conn) => conn.id), [conn1.id], 'Fonte deve enxergar a conexão de saída');
    assert.deepEqual(engine.getInputConnections(dreno).map((conn) => conn.id), [conn2.id], 'Dreno deve enxergar a conexão de entrada');

    engine.removeConnection(conn1);
    assert.equal(engine.getOutputConnections(fonte).length, 0, 'Remoção de conexão deve atualizar o índice de saída');

    engine.removeComponent(valvula);
    assert.equal(engine.getComponentById(valvula.id), null, 'Componente removido não deve permanecer no índice');
    assert.equal(engine.conexoes.length, 0, 'Conexões remanescentes do componente removido devem ser eliminadas');
});

test('solver mantém fluxo em série com conexão puramente lógica', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-01', 'Fonte-01', 0, 0);
    const valvula = new ValvulaLogica('V-01', 'Valvula-01', 80, 0);
    const dreno = new DrenoLogico('D-01', 'Dreno-01', 160, 0);

    fonte.pressaoFonteBar = 1.8;
    fonte.vazaoMaxima = 40;
    valvula.setAbertura(100);
    dreno.pressaoSaidaBar = 0;

    fonte.conectarSaida(valvula);
    valvula.conectarSaida(dreno);

    engine.add(fonte);
    engine.add(valvula);
    engine.add(dreno);
    engine.addConnection(new ConnectionModel({ sourceId: fonte.id, targetId: valvula.id }));
    engine.addConnection(new ConnectionModel({ sourceId: valvula.id, targetId: dreno.id }));

    runSinglePhysicsStep(engine);

    assert.ok(fonte.fluxoReal > 0, 'A fonte deve fornecer vazão');
    assert.ok(valvula.fluxoReal > 0, 'A válvula deve receber vazão na malha em série');
    assert.ok(dreno.vazaoRecebidaLps > 0, 'O dreno deve receber vazão na malha em série');
    assert.ok(engine.conexoes.every((conn) => conn.lastResolvedFlowLps >= 0), 'As conexões devem registrar vazões resolvidas válidas');
});

test('solver distribui fluxo em bifurcação simples', () => {
    const engine = createEngine();
    const fonte = new FonteLogica('F-01', 'Fonte-01', 0, 0);
    const drenoA = new DrenoLogico('D-01', 'Dreno-01', 120, -40);
    const drenoB = new DrenoLogico('D-02', 'Dreno-02', 120, 40);

    fonte.pressaoFonteBar = 2.0;
    fonte.vazaoMaxima = 60;

    fonte.conectarSaida(drenoA);
    fonte.conectarSaida(drenoB);

    engine.add(fonte);
    engine.add(drenoA);
    engine.add(drenoB);
    engine.addConnection(new ConnectionModel({ sourceId: fonte.id, targetId: drenoA.id }));
    engine.addConnection(new ConnectionModel({ sourceId: fonte.id, targetId: drenoB.id }));

    runSinglePhysicsStep(engine);

    assert.ok(drenoA.vazaoRecebidaLps > 0, 'O primeiro ramo da bifurcação deve receber fluxo');
    assert.ok(drenoB.vazaoRecebidaLps > 0, 'O segundo ramo da bifurcação deve receber fluxo');
    assert.ok(fonte.fluxoReal >= drenoA.vazaoRecebidaLps + drenoB.vazaoRecebidaLps - 1e-9, 'A fonte deve suprir a soma dos ramos');
});
