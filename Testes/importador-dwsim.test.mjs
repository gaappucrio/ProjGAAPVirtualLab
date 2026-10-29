// Fidelidade do importador DWSIM: cada teste cobre um bug do plano de validação (passo 3).
// Os casos com template usam os .dwxmz de `Testes/plantas dwsim/`, resolvidos no DWSIM 9.0.5;
// os demais montam um XML mínimo com a mesma estrutura que o DWSIM grava.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
    parseDwsimXml,
    readDwsimFile,
    translateDwsimToWorkspace
} from '../js/presentation/import/DwsimImporter.js';

const TEMPLATE_BOMBA_TANQUE = path.resolve('Testes/plantas dwsim/entradaBombaTanqueValvulaSPsaidacompipes.dwxmz');

function approx(actual, expected, tolerance, label) {
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `${label}: esperado ${expected} +/- ${tolerance}, obtido ${actual}`
    );
}

async function importarTemplate(arquivo) {
    const buffer = fs.readFileSync(arquivo);
    const xml = await readDwsimFile({
        arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    });
    return translateDwsimToWorkspace(parseDwsimXml(xml));
}

function importarXml(xml) {
    return translateDwsimToWorkspace(parseDwsimXml(xml));
}

function componentePorTag(workspace, tag) {
    const component = workspace.components.find((c) => c.snapshot.tag === tag);
    assert.ok(component, `componente ${tag} deve existir`);
    return component.snapshot.properties;
}

// ----- Montagem de XML mínimo no formato do DWSIM -----

function conectores(lista, tipo) {
    return lista.map(([alvo, indice = 0]) => (tipo === 'in'
        ? `<Connector IsAttached="true" ConnType="ConIn" AttachedFromObjID="${alvo}" AttachedFromConnIndex="${indice}" />`
        : `<Connector IsAttached="true" ConnType="ConOut" AttachedToObjID="${alvo}" AttachedToConnIndex="${indice}" />`)).join('');
}

function grafico(nome, objectType, { entradas = [], saidas = [] } = {}) {
    return `<GraphicObject><Type>Graphic</Type><ObjectType>${objectType}</ObjectType><Name>${nome}</Name><Tag>${nome}</Tag>`
        + `<X>0</X><Y>0</Y><InputConnectors>${conectores(entradas, 'in')}</InputConnectors>`
        + `<OutputConnectors>${conectores(saidas, 'out')}</OutputConnectors></GraphicObject>`;
}

function simulacao(nome, tipo, corpo) {
    return `<SimulationObject><Type>${tipo}</Type><ComponentName>${nome}</ComponentName>${corpo}</SimulationObject>`;
}

// Corrente com a fase 0 como o DWSIM grava: o <Compound> vem antes do <Properties> e traz
// <VolumetricFlow> com o dobro da vazão da corrente (VolumetricFraction = 2 no XML real).
function corrente(nome, { pressaoPa = 101325, vazaoM3s = 0.005 } = {}) {
    return simulacao(nome, 'DWSIM.Thermodynamics.Streams.MaterialStream',
        '<Phases><Phase><ID>0</ID><Compounds><Compound><Name>Water</Name>'
        + `<VolumetricFlow>${2 * vazaoM3s}</VolumetricFlow></Compound></Compounds>`
        + '<Properties>DWSIM.Thermodynamics.BaseClasses.PhaseProperties</Properties>'
        + `<Properties><pressure>${pressaoPa}</pressure><temperature>298.15</temperature>`
        + `<volumetric_flow>${vazaoM3s}</volumetric_flow><density>996.3</density>`
        + `<massflow>${vazaoM3s * 996.3}</massflow><viscosity>0.0009</viscosity></Properties>`
        + '</Phase></Phases>');
}

function secao(campos) {
    return `<Section ID="1">${Object.entries(campos).map(([tag, valor]) => `<${tag}>${valor}</${tag}>`).join('')}</Section>`;
}

function cano(nome, secoes) {
    return simulacao(nome, 'DWSIM.UnitOperations.UnitOperations.Pipe', `<Sections>OK${secoes.join('')}</Sections>`);
}

function documento(graficos, simulacoes) {
    return `<?xml version="1.0" encoding="utf-8"?><DWSIM_Simulation_Data>`
        + `<SimulationObjects>${simulacoes.join('')}</SimulationObjects>`
        + `<GraphicObjects>${graficos.join('')}</GraphicObjects></DWSIM_Simulation_Data>`;
}

// Fonte -> válvula -> dreno, sem canos, para testar só os parâmetros da válvula.
function plantaValvula(corpoValvula) {
    return documento([
        grafico('F', 'MaterialStream', { saidas: [['V']] }),
        grafico('V', 'Valve', { entradas: [['F']], saidas: [['D']] }),
        grafico('D', 'MaterialStream', { entradas: [['V']] })
    ], [
        corrente('F'),
        simulacao('V', 'DWSIM.UnitOperations.UnitOperations.Valve', corpoValvula),
        corrente('D')
    ]);
}

// ----- Testes -----

test('bug 1: bomba importada chega comandada a 100%, como no fluxograma do DWSIM', async () => {
    const { workspace } = await importarTemplate(TEMPLATE_BOMBA_TANQUE);
    const bomba = componentePorTag(workspace, 'PUMP-1');
    assert.equal(bomba.grauAcionamento, 100);
    assert.equal(bomba.acionamentoEfetivo, 0, 'o efetivo sobe pela rampa ao iniciar a simulação');
});

test('tanque importado é vaso fechado: no regime permanente ele passa a vazão como o tanque do DWSIM', async () => {
    const { workspace } = await importarTemplate(TEMPLATE_BOMBA_TANQUE);
    assert.equal(componentePorTag(workspace, 'TANK-1').tipoTanque, 'fechado');
});

test('bomba em modo Curves: parâmetros vêm do ajuste das curvas, não do ponto de operação', async () => {
    // As curvas do template foram exportadas pelo GAAP a partir de 5 bar de shutoff, 45 L/s
    // de vazão máxima e NPSHr de 2,5 m. O ponto de operação do DWSIM é 4,83 bar a 8,89 L/s.
    const { workspace } = await importarTemplate(TEMPLATE_BOMBA_TANQUE);
    const bomba = componentePorTag(workspace, 'PUMP-1');
    approx(bomba.pressaoMaxima, 5.0, 1e-4, 'shutoff (bar)');
    approx(bomba.vazaoNominal, 45, 1e-3, 'vazão máxima (L/s)');
    approx(bomba.npshRequeridoM, 2.5, 1e-4, 'NPSHr na vazão máxima (m)');
    approx(bomba.eficienciaHidraulica, 0.78, 1e-3, 'eficiência no BEP');
    approx(bomba.fracaoMelhorEficiencia, 0.72, 0.01, 'vazão do BEP / vazão máxima');
});

test('bug 2: vazão da fonte vem da fase 0, não do <Compound> que o DWSIM grava dobrado', async () => {
    const { workspace } = await importarTemplate(TEMPLATE_BOMBA_TANQUE);
    approx(componentePorTag(workspace, '10').vazaoMaxima, 8.8889, 1e-3, 'fonte 10 (L/s)');
    approx(componentePorTag(workspace, '11').vazaoMaxima, 0.25833, 1e-4, 'fonte 11 (L/s)');

    const sintetico = importarXml(documento([
        grafico('F', 'MaterialStream', { saidas: [['D']] }),
        grafico('D', 'MaterialStream', { entradas: [['F']] })
    ], [corrente('F', { vazaoM3s: 0.004 }), corrente('D')]));
    approx(componentePorTag(sintetico.workspace, 'F').vazaoMaxima, 4, 1e-9, 'XML mínimo (L/s)');
});

test('bug 3: pressão das correntes é absoluta no DWSIM e vira manométrica no GAAP, inclusive abaixo da atmosfera', async () => {
    const { workspace } = await importarTemplate(TEMPLATE_BOMBA_TANQUE);
    approx(componentePorTag(workspace, '10').pressaoFonteBar, 0.5 - 1.01325, 1e-6, 'fonte a 50 kPa abs');
    approx(componentePorTag(workspace, '11').pressaoFonteBar, 1.5 - 1.01325, 1e-4, 'fonte a 150 kPa abs');
    approx(componentePorTag(workspace, '6').pressaoSaidaBar, 4.1884, 1e-4, 'dreno acima da atmosfera');

    const sintetico = importarXml(documento([
        grafico('F', 'MaterialStream', { saidas: [['D']] }),
        grafico('D', 'MaterialStream', { entradas: [['F']] })
    ], [corrente('F', { pressaoPa: 101325 }), corrente('D', { pressaoPa: 38000 })]));
    approx(componentePorTag(sintetico.workspace, 'F').pressaoFonteBar, 0, 1e-9, 'fonte a 1 atm = 0 barg');
    approx(componentePorTag(sintetico.workspace, 'D').pressaoSaidaBar, 0.38 - 1.01325, 1e-9, 'dreno sob vácuo');
});

test('bug 4: Kv e Cv seguem <FlowCoefficient> como no Valve.vb do DWSIM', async () => {
    // Template: <Kv>220</Kv> com <FlowCoefficient>Cv</FlowCoefficient> -> o número já é Cv.
    const { workspace } = await importarTemplate(TEMPLATE_BOMBA_TANQUE);
    const valvula = componentePorTag(workspace, 'VALVE-1');
    assert.equal(valvula.cv, 220);
    assert.equal(valvula.tipoCaracteristica, 'linear');
    assert.equal(valvula.grauAbertura, 50);

    const emKv = importarXml(plantaValvula('<Kv>190.3</Kv><OpeningPct>40</OpeningPct>'
        + '<FlowCoefficient>Kv</FlowCoefficient><DefinedOpeningKvRelationShipType>EqualPercentage</DefinedOpeningKvRelationShipType>'
        + '<CharacteristicParameter>50</CharacteristicParameter><EnableOpeningKvRelationship>true</EnableOpeningKvRelationship>'));
    const v1 = componentePorTag(emKv.workspace, 'V');
    approx(v1.cv, 190.3 / 0.8649786130809, 1e-9, 'Kv convertido para Cv');
    assert.equal(v1.tipoCaracteristica, 'equal_percentage');
    assert.equal(v1.rangeabilidade, 50, 'rangeabilidade = CharacteristicParameter do DWSIM');

    const enumNumerico = importarXml(plantaValvula('<Kv>100</Kv><OpeningPct>40</OpeningPct><FlowCoefficient>1</FlowCoefficient>'));
    assert.equal(componentePorTag(enumNumerico.workspace, 'V').cv, 100, 'FlowCoefficient = 1 é Cv');

    const semRelacao = importarXml(plantaValvula('<Kv>100</Kv><OpeningPct>40</OpeningPct><FlowCoefficient>Cv</FlowCoefficient>'
        + '<DefinedOpeningKvRelationShipType>EqualPercentage</DefinedOpeningKvRelationShipType>'
        + '<EnableOpeningKvRelationship>false</EnableOpeningKvRelationship>'));
    const v2 = componentePorTag(semRelacao.workspace, 'V');
    assert.equal(v2.grauAbertura, 100, 'sem relação abertura/Kv o DWSIM usa o coeficiente cheio');
    assert.equal(v2.tipoCaracteristica, 'linear');
});

test('bug 5: efetividade máxima do trocador não copia a eficiência térmica resolvida pelo DWSIM', async () => {
    // Template em CalcBothTemp_UA: <ThermalEfficiency>51,58</ThermalEfficiency> é resultado.
    const { workspace } = await importarTemplate(TEMPLATE_BOMBA_TANQUE);
    assert.equal(componentePorTag(workspace, 'HX-1').efetividadeMaxima, 1);

    const especificada = importarXml(documento([
        grafico('F', 'MaterialStream', { saidas: [['HX']] }),
        grafico('HX', 'HeatExchanger', { entradas: [['F']], saidas: [['D']] }),
        grafico('D', 'MaterialStream', { entradas: [['HX']] })
    ], [
        corrente('F'),
        simulacao('HX', 'DWSIM.UnitOperations.UnitOperations.HeatExchanger',
            '<CalculationMode>ThermalEfficiency</CalculationMode><ThermalEfficiency>60</ThermalEfficiency>'
            + '<OverallCoefficient>1000</OverallCoefficient><Area>2</Area>'),
        corrente('D')
    ]));
    approx(componentePorTag(especificada.workspace, 'HX').efetividadeMaxima, 0.6, 1e-9, 'modo ThermalEfficiency');
});

test('canos: trechos em série somam, Quantidade multiplica, rugosidade sai do material e o trecho esquemático é descontado', () => {
    const { workspace, stats } = importarXml(documento([
        grafico('F', 'MaterialStream', { saidas: [['P1']] }),
        grafico('P1', 'Pipe', { entradas: [['F']], saidas: [['S1']] }),
        grafico('S1', 'MaterialStream', { entradas: [['P1']], saidas: [['P2']] }),
        grafico('P2', 'Pipe', { entradas: [['S1']], saidas: [['V']] }),
        grafico('V', 'Valve', { entradas: [['P2']], saidas: [['D']] }),
        grafico('D', 'MaterialStream', { entradas: [['V']] })
    ], [
        corrente('F'),
        cano('P1', [
            secao({ TipoSegmento: 'Tubulaosimples', Quantidade: 3, Material: 'Aço Bruto', Comprimento: 1, DI: 3.149608, PipeWallRugosity: 0 }),
            secao({ TipoSegmento: 'Curva 90 graus, raio curto [1]', Quantidade: 1, Material: 'Aço Bruto', Comprimento: 0.1, DI: 3.149608 })
        ]),
        corrente('S1'),
        cano('P2', [
            secao({ TipoSegmento: 'Tubulaosimples', Quantidade: 1, Material: 'UserDefined', Comprimento: 2, DI: 3.149608, PipeWallRugosity: 0.0001 })
        ]),
        simulacao('V', 'DWSIM.UnitOperations.UnitOperations.Valve', '<Kv>100</Kv><OpeningPct>50</OpeningPct>'),
        corrente('D')
    ]));

    const idFonte = workspace.components.find((c) => c.snapshot.tag === 'F').id;
    const idValvula = workspace.components.find((c) => c.snapshot.tag === 'V').id;
    const idDreno = workspace.components.find((c) => c.snapshot.tag === 'D').id;
    const fonteValvula = workspace.connections.find((c) => c.sourceId === idFonte && c.targetId === idValvula);
    const valvulaDreno = workspace.connections.find((c) => c.sourceId === idValvula && c.targetId === idDreno);

    // 3 m (P1) + 2 m (P2) = 5 m de tubo; o GAAP já soma 1 m de trecho esquemático.
    approx(fonteValvula.extraLengthM, 4, 1e-9, 'comprimento extra (m)');
    approx(fonteValvula.diameterM, 0.08, 1e-6, 'diâmetro (m)');
    approx(fonteValvula.roughnessMm, (3 * 0.0457 + 2 * 0.1) / 5, 1e-9, 'rugosidade média ponderada (mm)');
    assert.ok(stats.skippedTypes.has('PipeFitting'), 'acessório não traduzido fica registrado');

    // Ligação direta por corrente: no DWSIM não há perda; no GAAP sobra só o trecho esquemático.
    assert.equal(valvulaDreno.extraLengthM, 0);
});

test('canos em série com diâmetros diferentes viram comprimento equivalente no diâmetro do trecho mais longo', () => {
    const { workspace } = importarXml(documento([
        grafico('F', 'MaterialStream', { saidas: [['P1']] }),
        grafico('P1', 'Pipe', { entradas: [['F']], saidas: [['D']] }),
        grafico('D', 'MaterialStream', { entradas: [['P1']] })
    ], [
        corrente('F'),
        cano('P1', [
            secao({ TipoSegmento: 'Tubulaosimples', Quantidade: 1, Material: 'Steel', Comprimento: 10, DI: 4 }),
            secao({ TipoSegmento: 'Tubulaosimples', Quantidade: 1, Material: 'Steel', Comprimento: 1, DI: 2 })
        ]),
        corrente('D')
    ]));
    const conexao = workspace.connections[0];
    approx(conexao.diameterM, 4 * 0.0254, 1e-9, 'diâmetro de referência');
    // 1 m em 2" equivale a 1·(4/2)^5 = 32 m em 4": 10 + 32 − 1 (esquemático) = 41 m.
    approx(conexao.extraLengthM, 41, 1e-9, 'comprimento equivalente (m)');
});

test('canos: rugosidade média pesa pelo comprimento equivalente e aceita nome de material com espaço', () => {
    const { workspace } = importarXml(documento([
        grafico('F', 'MaterialStream', { saidas: [['P1']] }),
        grafico('P1', 'Pipe', { entradas: [['F']], saidas: [['D']] }),
        grafico('D', 'MaterialStream', { entradas: [['P1']] })
    ], [
        corrente('F'),
        cano('P1', [
            secao({ TipoSegmento: 'Tubulaosimples', Quantidade: 1, Material: 'PVC', Comprimento: 10, DI: 4 }),
            secao({ TipoSegmento: 'Tubulaosimples', Quantidade: 1, Material: 'Cast Iron', Comprimento: 1, DI: 2, PipeWallRugosity: 0.009 })
        ]),
        corrente('D')
    ]));
    // PVC 1,5e-6 m em 10 m equivalentes; ferro fundido 2,59e-4 m em 32 m equivalentes.
    approx(workspace.connections[0].roughnessMm, ((10 * 0.0015) + (32 * 0.259)) / 42, 1e-9, 'rugosidade (mm)');
});

test('bomba: pontos H = 0 depois da vazão máxima não puxam o ajuste da curva', () => {
    const pontos = [0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06];
    const head = pontos.map((q) => Math.max(0, 40 * (1 - (q / 0.04) ** 2)));
    const curva = (tag, ys, unidade) => `<${tag}><X>${pontos.map((q) => `<Item>${q}</Item>`).join('')}</X>`
        + `<Y>${ys.map((y) => `<Item>${y}</Item>`).join('')}</Y><Enabled>true</Enabled>`
        + `<yunit>${unidade}</yunit><xunit>m3/s</xunit></${tag}>`;
    const { workspace } = importarXml(documento([
        grafico('F', 'MaterialStream', { saidas: [['B']] }),
        grafico('B', 'Pump', { entradas: [['F']], saidas: [['D']] }),
        grafico('D', 'MaterialStream', { entradas: [['B']] })
    ], [
        corrente('F'),
        simulacao('B', 'DWSIM.UnitOperations.UnitOperations.Pump',
            `<PumpCurveSet>${curva('CurveHead', head, 'm')}</PumpCurveSet><CalcMode>Curves</CalcMode>`),
        corrente('D')
    ]));
    const bomba = componentePorTag(workspace, 'B');
    approx(bomba.vazaoNominal, 40, 1e-6, 'vazão máxima (L/s)');
    approx(bomba.pressaoMaxima, 40 * 997 * 9.81 * 1e-5, 1e-9, 'shutoff (bar)');
});
