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
import { BombaLogica } from '../js/domain/components/BombaLogica.js';
import { ValvulaLogica } from '../js/domain/components/ValvulaLogica.js';
import { buildPumpDwsimJsonData } from '../js/presentation/export/PumpDwsimJsonExporter.js';

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
    assert.equal(v1.unidadeCoeficienteVazao, 'kv', 'arquivo em Kv: o painel mostra Kv');
    assert.equal(valvula.unidadeCoeficienteVazao, 'cv', 'arquivo em Cv: o painel mostra Cv');
    const restaurada = Object.assign(new ValvulaLogica('V', 'V', 0, 0), { cv: v1.cv, unidadeCoeficienteVazao: v1.unidadeCoeficienteVazao });
    approx(restaurada.getCoeficienteVazaoNaUnidade(), 190.3, 1e-9, 'o painel mostra o mesmo Kv do arquivo');
    assert.equal(v1.tipoCaracteristica, 'equal_percentage');
    assert.equal(v1.rangeabilidade, 50, 'rangeabilidade = CharacteristicParameter do DWSIM');

    const enumNumerico = importarXml(plantaValvula('<Kv>100</Kv><OpeningPct>40</OpeningPct><FlowCoefficient>1</FlowCoefficient>'));
    assert.equal(componentePorTag(enumNumerico.workspace, 'V').cv, 100, 'FlowCoefficient = 1 é Cv');
    assert.equal(componentePorTag(enumNumerico.workspace, 'V').unidadeCoeficienteVazao, 'cv');
    const semUnidade = componentePorTag(importarXml(plantaValvula('<Kv>100</Kv><OpeningPct>40</OpeningPct>')).workspace, 'V');
    assert.equal(semUnidade.unidadeCoeficienteVazao, 'kv', 'sem <FlowCoefficient>, o número é tratado como Kv');
    // Valve.vb: EnableOpeningKvRelationship = False e CharacteristicParameter = 50 quando a tag falta.
    assert.equal(semUnidade.grauAbertura, 100, 'sem <EnableOpeningKvRelationship>, o DWSIM usa o coeficiente cheio');
    const semParametro = componentePorTag(importarXml(plantaValvula('<Kv>100</Kv><OpeningPct>40</OpeningPct>'
        + '<DefinedOpeningKvRelationShipType>EqualPercentage</DefinedOpeningKvRelationShipType>'
        + '<EnableOpeningKvRelationship>true</EnableOpeningKvRelationship>')).workspace, 'V');
    assert.equal(semParametro.grauAbertura, 40);
    assert.equal(semParametro.rangeabilidade, 50, 'sem <CharacteristicParameter>, a rangeabilidade do DWSIM é 50');

    // `aberta` segue o limiar de vedação do domínio (0,05%), e não 0,5%.
    const comRelacao = (abertura) => componentePorTag(importarXml(plantaValvula(`<Kv>100</Kv><OpeningPct>${abertura}</OpeningPct>`
        + '<FlowCoefficient>Kv</FlowCoefficient><EnableOpeningKvRelationship>true</EnableOpeningKvRelationship>')).workspace, 'V');
    const quaseFechada = comRelacao(0.3);
    assert.equal(quaseFechada.grauAbertura, 0.3);
    assert.equal(quaseFechada.aberta, true, 'a 0,3% a válvula já deixa passar vazão');
    const vedada = comRelacao(0.03);
    assert.equal(vedada.grauAbertura, 0, 'abaixo de 0,05% a abertura é zerada, como em setAbertura');
    assert.equal(vedada.aberta, false);

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
            secao({ TipoSegmento: 'Curva Normal 45° [1]', Quantidade: 2, Material: 'Aço Bruto', Comprimento: 0.1, DI: 3.149608 }),
            secao({ TipoSegmento: 'Delta P fixo [27]', Quantidade: 1, Material: 'Aço Bruto', Comprimento: 0.1, DI: 0.2 })
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

    // 3 m (P1) + 2 curvas 45° com L/D = 16 (Pipe.vb, Kfit [1]) + 2 m (P2); o GAAP já soma 1 m esquemático.
    const curvaM = 2 * 16 * 3.149608 * 0.0254;
    approx(fonteValvula.extraLengthM, 3 + curvaM + 2 - 1, 1e-9, 'comprimento extra (m)');
    approx(fonteValvula.diameterM, 0.08, 1e-6, 'diâmetro (m)');
    approx(fonteValvula.roughnessMm, ((3 + curvaM) * 0.0457 + 2 * 0.1) / (5 + curvaM), 1e-9, 'rugosidade média ponderada (mm)');
    assert.equal(fonteValvula.perdaLocalK, 0, 'acessório L/D não vira K');
    assert.equal(stats.skipped, 1, 'só o ΔP fixo [27] fica sem tradução');
    assert.ok(stats.skippedTypes.has('PipeFitting'), 'acessório não traduzido fica registrado');

    // Ligação direta por corrente: no DWSIM não há perda; no GAAP sobra só o trecho esquemático.
    assert.equal(valvulaDreno.extraLengthM, 0);
});

test('canos: acessórios K do DWSIM viram perda local na velocidade do cano, com Quantidade', () => {
    const planta = (secoes) => importarXml(documento([
        grafico('F', 'MaterialStream', { saidas: [['P1']] }),
        grafico('P1', 'Pipe', { entradas: [['F']], saidas: [['D']] }),
        grafico('D', 'MaterialStream', { entradas: [['P1']] })
    ], [corrente('F'), cano('P1', secoes), corrente('D')]));
    const conexao = ({ workspace }) => workspace.connections[0];

    // Cano de 4" com entrada normal (K 0,78, Kfit [18]) e 2 saídas normais (K 1, [26]) no mesmo 4",
    // mais uma redução 2:1 (K 5,67, [23]) de 2": na velocidade do cano de 4" ela pesa (4/2)⁴ = 16×.
    const comK = planta([
        secao({ TipoSegmento: 'Tubulaosimples', Quantidade: 1, Material: 'Steel', Comprimento: 10, DI: 4 }),
        secao({ TipoSegmento: 'Entrada Normal [18]', Quantidade: 1, Material: 'Steel', Comprimento: 0.1, DI: 4 }),
        secao({ TipoSegmento: 'Saida Normal [26]', Quantidade: 2, Material: 'Steel', Comprimento: 0.1, DI: 4 }),
        secao({ TipoSegmento: 'Reducao Normal 2:1 [23]', Quantidade: 1, Material: 'Steel', Comprimento: 0.1, DI: 2 })
    ]);
    approx(conexao(comK).perdaLocalK, 0.78 + (2 * 1) + (5.67 * 16), 1e-9, 'Σ K na velocidade do cano');
    approx(conexao(comK).extraLengthM, 10 - 1, 1e-9, 'acessório K não soma comprimento');
    assert.equal(comK.stats.skipped, 0);

    // Só acessórios K, sem tubo reto: o cano fica com o diâmetro do acessório e o K dele.
    const soK = planta([secao({ TipoSegmento: 'Saida Borda [25]', Quantidade: 1, Material: 'Steel', Comprimento: 0.1, DI: 2 })]);
    approx(conexao(soK).perdaLocalK, 1, 1e-9);
    approx(conexao(soK).diameterM, 2 * 0.0254, 1e-9);

    // Válvula globo de 2" (L/D 340 → 17,3 m) num cano de 4" com 1 m de tubo reto: o diâmetro
    // continua o do tubo reto, e a válvula entra como comprimento equivalente em 4" (× (4/2)⁵).
    const globo = planta([
        secao({ TipoSegmento: 'Tubulaosimples', Quantidade: 1, Material: 'Steel', Comprimento: 1, DI: 4 }),
        secao({ TipoSegmento: 'Valvula Globo [7]', Quantidade: 1, Material: 'Steel', Comprimento: 0.1, DI: 2 })
    ]);
    approx(conexao(globo).diameterM, 4 * 0.0254, 1e-9, 'referência no tubo reto, não no acessório');
    approx(conexao(globo).extraLengthM, 1 + (340 * 2 * 0.0254 * 32) - 1, 1e-9);

    // Índice desconhecido não é inventado.
    const desconhecido = planta([
        secao({ TipoSegmento: 'Tubulaosimples', Quantidade: 1, Material: 'Steel', Comprimento: 5, DI: 4 }),
        secao({ TipoSegmento: 'Acessorio novo [99]', Quantidade: 1, Material: 'Steel', Comprimento: 0.1, DI: 4 })
    ]);
    assert.equal(desconhecido.stats.skipped, 1);
    assert.equal(conexao(desconhecido).perdaLocalK, 0);
});

test('canos: elevação do DWSIM não é importada, mas fica registrada para o aviso da importação', async () => {
    const { setLanguage, t } = await import('../js/presentation/i18n/LanguageManager.js');
    const planta = (secoes) => importarXml(documento([
        grafico('F', 'MaterialStream', { saidas: [['P1']] }),
        grafico('P1', 'Pipe', { entradas: [['F']], saidas: [['D']] }),
        grafico('D', 'MaterialStream', { entradas: [['P1']] })
    ], [corrente('F'), cano('P1', secoes), corrente('D')]));

    // Elevação × Quantidade só no tubo reto; o DWSIM zera a do acessório (Pipe.vb).
    const { stats, workspace } = planta([
        secao({ TipoSegmento: 'Tubulaosimples', Quantidade: 2, Material: 'Steel', Comprimento: 5, DI: 4, Elevacao: 1.5 }),
        secao({ TipoSegmento: 'Joelho em 90° [22]', Quantidade: 1, Material: 'Steel', Comprimento: 0.1, DI: 4, Elevacao: 9 })
    ]);
    assert.equal(stats.ignoredElevations.length, 1);
    assert.deepEqual(stats.ignoredElevations[0].pipeTags, ['P1']);
    approx(stats.ignoredElevations[0].elevationM, 3, 1e-12);
    assert.equal(workspace.config.usarAlturaRelativa, false, 'a importação segue sem altura relativa');

    setLanguage('pt');
    const aviso = t('toolbar.importDwsimElevationIgnored', { pipes: 'P1', elevationM: 3, headBar: 0.294 });
    // A suíte roda num processo só: um teste anterior deixa o PropertyPanelController inscrito na troca
    // de idioma, com o DOM falso já removido. setLanguage troca o idioma antes de avisar os inscritos,
    // então o erro desse inscrito é tolerado e o idioma volta a PT no finally.
    const trocarIdioma = (idioma) => { try { setLanguage(idioma); } catch { /* inscrito vazado de outro teste */ } };
    try {
        trocarIdioma('en');
        assert.match(t('toolbar.importDwsimElevationIgnored', { pipes: 'P1', elevationM: -2, headBar: 0.196 }),
            /Pipe P1.*drops 2\.00 m.*0\.196 bar.*lower/);
        assert.match(t('toolbar.importDwsimElevationHint'), /Relative Height/);
        assert.doesNotThrow(() => t('toolbar.importDwsimElevationIgnored'), 'parâmetros ausentes não quebram o alerta');
    } finally {
        trocarIdioma('pt');
    }
    assert.match(aviso, /P1.*sobe 3\.00 m.*0\.294 bar.*mais alta/);

    const plano = planta([secao({ TipoSegmento: 'Tubulaosimples', Quantidade: 1, Material: 'Steel', Comprimento: 5, DI: 4, Elevacao: 0 })]);
    assert.equal(plano.stats.ignoredElevations.length, 0, 'sem desnível, sem aviso');
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

test('bomba sem curva de NPSHr: o <NPSH> do DWSIM é o disponível e não vira NPSHr', () => {
    const planta = (corpoBomba) => importarXml(documento([
        grafico('F', 'MaterialStream', { saidas: [['B']] }),
        grafico('B', 'Pump', { entradas: [['F']], saidas: [['D']] }),
        grafico('D', 'MaterialStream', { entradas: [['B']] })
    ], [
        corrente('F'),
        simulacao('B', 'DWSIM.UnitOperations.UnitOperations.Pump', corpoBomba),
        corrente('D')
    ]));
    // Pump.vb: NPSH = (Pi − Pbub)/(ρ·9,81); sem curva habilitada, CurveNPSHr = 0.
    const semCurva = componentePorTag(planta('<CalcMode>Delta_P</CalcMode><NPSH>10.3</NPSH><CurveNPSHr>0</CurveNPSHr>').workspace, 'B');
    approx(semCurva.npshRequeridoM, 2.5, 1e-9, 'NPSHr padrão quando o DWSIM não tem NPSHr');
    const comCurva = componentePorTag(planta('<CalcMode>Delta_P</CalcMode><NPSH>10.3</NPSH><CurveNPSHr>3.2</CurveNPSHr>').workspace, 'B');
    approx(comCurva.npshRequeridoM, 3.2, 1e-9, 'NPSHr do CurveNPSHr');
});

// Interpolante racional de 1ª ordem (Berrut, Floater-Hormann com d = 0): reproduz a carga, a
// eficiência e a potência que o DWSIM grava para as bombas em modo Curves.
function interpolarComoDwsim(xs, ys, x) {
    let numerador = 0;
    let denominador = 0;
    for (let k = 0; k < xs.length; k += 1) {
        if (x === xs[k]) return ys[k];
        const termo = (k % 2 === 0 ? 1 : -1) / (x - xs[k]);
        numerador += termo * ys[k];
        denominador += termo;
    }
    return numerador / denominador;
}

test('curva exportada para o DWSIM tem pontos suficientes para a interpolacao dele seguir a parabola do GAAP', () => {
    const bomba = new BombaLogica('P-exp', 'P-exp', 0, 0);
    bomba.vazaoNominal = 45;
    bomba.pressaoMaxima = 5;
    const dados = buildPumpDwsimJsonData(null, bomba);
    const { X, Y } = dados.CurveHead;
    const cargaShutoffM = Y[0];

    // Até metade da vazão máxima (faixa usual de operação), a cada 0,1 L/s.
    let erroMaximo = 0;
    for (let vazaoLps = 0.1; vazaoLps <= 22.5; vazaoLps += 0.1) {
        const vazaoM3s = vazaoLps / 1000;
        const exata = cargaShutoffM * (1 - ((vazaoLps / 45) ** 2));
        erroMaximo = Math.max(erroMaximo, Math.abs(interpolarComoDwsim(X, Y, vazaoM3s) - exata) / exata);
    }
    assert.ok(erroMaximo < 1e-3, `Erro da carga interpolada pelo DWSIM: ${(erroMaximo * 100).toFixed(3)}%`);
});
