import assert from 'node:assert/strict';
import test from 'node:test';

import { SistemaSimulacao } from '../js/application/engine/SimulationEngine.js';
import { DrenoLogico } from '../js/domain/components/DrenoLogico.js';
import { FonteLogica } from '../js/domain/components/FonteLogica.js';
import { ConnectionModel } from '../js/domain/models/ConnectionModel.js';
import { createDebugApi, isDebugEnabled, setupDebugConsole } from '../js/debug/DebugConsole.js';

const silentLogger = {};

function createPlant() {
    const engine = new SistemaSimulacao();
    engine.isRunning = true;
    engine.usarAlturaRelativa = false;

    const fonte = new FonteLogica('F-01', 'inlet-01', 0, 0);
    const dreno = new DrenoLogico('D-01', 'outlet-01', 160, 0);
    fonte.pressaoFonteBar = 2;
    fonte.vazaoMaxima = 40;
    dreno.pressaoSaidaBar = 0;
    fonte.conectarSaida(dreno);

    const connection = new ConnectionModel({ sourceId: fonte.id, targetId: dreno.id });
    engine.add(fonte);
    engine.add(dreno);
    engine.addConnection(connection);
    return { engine, fonte, dreno, connection };
}

test('debug: flag ?debug liga e desliga o modo debug', () => {
    assert.equal(isDebugEnabled(''), false);
    assert.equal(isDebugEnabled('?debug=1'), true);
    assert.equal(isDebugEnabled('?debug'), true);
    assert.equal(isDebugEnabled('?debug=0'), false);
    assert.equal(isDebugEnabled('?debug=false'), false);
});

test('debug: setupDebugConsole expõe __GAAP no alvo informado', () => {
    const { engine } = createPlant();
    const target = {};
    const api = setupDebugConsole({ engine, target, logger: silentLogger });

    assert.equal(target.__GAAP, api);
    assert.equal(api.engine, engine);
});

test('debug: tabelas de componentes e conexões refletem a planta', () => {
    const { engine, connection } = createPlant();
    const api = createDebugApi({ engine, logger: silentLogger });

    engine.resolveHydraulicNetwork(0.1);

    const components = api.componentes();
    assert.deepEqual(components.map((row) => row.tipo), ['FonteLogica', 'DrenoLogico']);

    const [row] = api.conexoes();
    assert.equal(row.id, connection.id);
    assert.equal(row.de, 'inlet-01 (F-01)');
    assert.equal(row.para, 'outlet-01 (D-01)');
    assert.ok(row.vazaoLps > 0, 'a conexão deve mostrar a vazão resolvida');
});

test('debug: conexoes() não cria estado novo para conexões ainda não resolvidas', () => {
    const { engine, connection } = createPlant();
    const api = createDebugApi({ engine, logger: silentLogger });

    const [row] = api.conexoes();
    assert.equal(row.regime, 'sem estado');
    assert.equal(engine.connectionStateStore.has(connection), false);
});

test('debug: selecionado() cobre seleção única, múltipla, conexão e vazia', () => {
    const { engine, fonte, dreno, connection } = createPlant();
    const api = createDebugApi({ engine, logger: silentLogger });

    assert.equal(api.selecionado(), null);

    engine.selectComponent(fonte);
    assert.equal(api.selecionado(), fonte);

    engine.selectComponents([fonte, dreno]);
    assert.deepEqual(api.selecionado(), [fonte, dreno]);

    engine.selectConnection(connection);
    assert.equal(api.selecionado(), connection);
});

test('debug: find e conexoesDe aceitam tag ou id', () => {
    const { engine, fonte, connection } = createPlant();
    const api = createDebugApi({ engine, logger: silentLogger });

    assert.equal(api.find('inlet-01'), fonte);
    assert.equal(api.find('F-01'), fonte);
    assert.equal(api.find('inexistente'), null);

    const { entradas, saidas } = api.conexoesDe('outlet-01');
    assert.equal(saidas.length, 0);
    assert.deepEqual(entradas.map((row) => row.id), [connection.id]);
});
