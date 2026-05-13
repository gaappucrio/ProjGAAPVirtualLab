import assert from 'node:assert/strict';
import test from 'node:test';

const PRESENTATION_MODULES = [
    '../js/presentation/controllers/PresentationController.js',
    '../js/presentation/controllers/ClipboardController.js',
    '../js/presentation/controllers/ComponentRotationController.js',
    '../js/presentation/controllers/DeleteSelectionController.js',
    '../js/presentation/controllers/DragDropController.js',
    '../js/presentation/controllers/HelpController.js',
    '../js/presentation/controllers/MonitorController.js',
    '../js/presentation/export/SimulationDataExporter.js',
    '../js/presentation/controllers/PropertyPanelController.js',
    '../js/presentation/properties/ComponentPropertiesPresenter.js',
    '../js/presentation/properties/ConnectionPropertiesPresenter.js',
    '../js/presentation/properties/DefaultPropertiesPresenter.js',
    '../js/presentation/properties/TankSaturationAlertPresenter.js',
    '../js/presentation/properties/component/BoundaryComponentPropertiesPresenter.js',
    '../js/presentation/properties/component/HeatExchangerComponentPropertiesPresenter.js',
    '../js/presentation/properties/component/PumpComponentPropertiesPresenter.js',
    '../js/presentation/properties/component/TankComponentPropertiesPresenter.js',
    '../js/presentation/properties/component/ValveComponentPropertiesPresenter.js'
];

test('módulos de apresentação carregam sem DOM global no import', async () => {
    const hadDocument = Object.hasOwn(globalThis, 'document');
    const originalDocument = globalThis.document;

    Reflect.deleteProperty(globalThis, 'document');

    try {
        for (const modulePath of PRESENTATION_MODULES) {
            const module = await import(modulePath);
            assert.ok(module, `${modulePath} deve ser importável sem DOM global`);
        }

        assert.equal(globalThis.document, undefined);
    } finally {
        if (hadDocument) globalThis.document = originalDocument;
    }
});

test('exportação registra altura relativa sem anexar gráficos', async () => {
    const { buildExportHtml } = await import('../js/presentation/export/SimulationDataExporter.js');
    const { BombaLogica } = await import('../js/domain/components/BombaLogica.js');
    const { TanqueLogico } = await import('../js/domain/components/TanqueLogico.js');

    const tanque = new TanqueLogico('tank-01', 'Tanque-01', 10, 20);
    tanque.capacidadeMaxima = 1000;
    tanque.volumeAtual = 420;
    tanque.lastQin = 12.5;
    tanque.lastQout = 7.25;

    const bomba = new BombaLogica('pump-01', 'Bomba-01', 100, 40);
    bomba.vazaoNominal = 45;
    bomba.pressaoMaxima = 5;
    bomba.fluxoReal = 18;
    bomba.cargaGeradaBar = 3.2;

    const html = buildExportHtml({
        componentes: [tanque, bomba],
        conexoes: [],
        usarAlturaRelativa: true
    });

    assert.match(html, /Resumo da exporta\u00e7\u00e3o/);
    assert.match(html, /Data da exporta\u00e7\u00e3o/);
    assert.match(html, /Altura relativa/);
    assert.match(html, /Ligada/);
    assert.match(html, /Tanque-01/);
    assert.match(html, /Bomba-01/);
    assert.doesNotMatch(html, /Gr\u00e1ficos dos componentes/);
    assert.doesNotMatch(html, /export-chart-svg/);
});

test('exportação em inglês localiza rótulos sem alterar nomes definidos pelo usuário', async () => {
    const { buildExportHtml } = await import('../js/presentation/export/SimulationDataExporter.js');
    const { BombaLogica } = await import('../js/domain/components/BombaLogica.js');
    const { FonteLogica } = await import('../js/domain/components/FonteLogica.js');
    const { setLanguage } = await import('../js/utils/LanguageManager.js');

    setLanguage('en');

    try {
        const bomba = new BombaLogica('pump-custom', 'Minha Bomba', 0, 0);
        bomba.isOn = true;

        const fonte = new FonteLogica('source-custom', 'Fonte Customizada', 80, 0);
        fonte.atualizarFluidoEntrada({
            nome: 'Fluido Azul',
            densidade: 998,
            temperatura: 25,
            viscosidadeDinamicaPaS: 0.001,
            pressaoVaporBar: 0.031,
            corVisual: '#3366ff'
        }, { presetId: 'custom' });

        const html = buildExportHtml({
            componentes: [bomba, fonte],
            conexoes: [],
            usarAlturaRelativa: true
        });

        assert.match(html, /Data Export - GAAP Virtual Lab/);
        assert.match(html, /Export summary/);
        assert.match(html, /Component name/);
        assert.match(html, /Component type/);
        assert.match(html, /Pump on/);
        assert.match(html, /Enabled/);
        assert.match(html, /Yes/);
        assert.match(html, /Pump/);
        assert.match(html, /Minha Bomba/);
        assert.match(html, /Fonte Customizada/);
        assert.match(html, /Fluido Azul/);
        assert.doesNotMatch(html, /Resumo da exporta\u00e7\u00e3o/);
        assert.doesNotMatch(html, /Nome do componente/);
        assert.doesNotMatch(html, /Bomba ligada/);
    } finally {
        setLanguage('pt');
    }
});

test('prefixos visuais das fronteiras acompanham o idioma atual', async () => {
    const {
        getComponentTagPrefix,
        setLanguage,
        translateDefaultComponentTag
    } = await import('../js/utils/LanguageManager.js');

    setLanguage('pt');
    assert.equal(getComponentTagPrefix('source'), 'Entrada');
    assert.equal(getComponentTagPrefix('sink'), 'Sa\u00edda');
    assert.equal(translateDefaultComponentTag('inlet-01'), 'Entrada-01');
    assert.equal(translateDefaultComponentTag('outlet-01'), 'Sa\u00edda-01');

    setLanguage('en');
    assert.equal(getComponentTagPrefix('source'), 'inlet');
    assert.equal(getComponentTagPrefix('sink'), 'outlet');
    assert.equal(translateDefaultComponentTag('Source-01'), 'inlet-01');
    assert.equal(translateDefaultComponentTag('Sink-01'), 'outlet-01');
    assert.equal(translateDefaultComponentTag('Entrada-01'), 'inlet-01');
    assert.equal(translateDefaultComponentTag('Sa\u00edda-01'), 'outlet-01');

    setLanguage('pt');
});

test('rotação visual de componentes normaliza graus sem afetar propriedades físicas', async () => {
    const {
        applyComponentVisualRotation,
        normalizeRotationDegrees,
        rotateComponentVisualBy
    } = await import('../js/infrastructure/dom/ComponentVisualTransform.js');
    const {
        registerComponentVisual,
        unregisterComponentVisual
    } = await import('../js/infrastructure/dom/ComponentVisualRegistry.js');
    const {
        rotateComponentsByWheelSteps
    } = await import('../js/presentation/controllers/ComponentRotationController.js');
    const { BombaLogica } = await import('../js/domain/components/BombaLogica.js');

    const bomba = new BombaLogica('pump-rotation', 'P-Rot', 0, 0);
    bomba.pressaoMaxima = 6;
    bomba.vazaoNominal = 42;
    const tagAttributes = { x: '40', y: '88' };
    const tagEl = {
        getAttribute: (name) => tagAttributes[name],
        setAttribute: (name, value) => { tagAttributes[name] = value; },
        removeAttribute: (name) => { delete tagAttributes[name]; }
    };
    const visualEl = {
        style: {},
        dataset: {},
        querySelector: (selector) => (selector === `[id="tag-${bomba.id}"]` ? tagEl : null)
    };

    assert.equal(normalizeRotationDegrees(-90), 270);
    assert.equal(normalizeRotationDegrees(450), 90);

    registerComponentVisual(bomba, visualEl);
    applyComponentVisualRotation(bomba, 45);
    assert.equal(visualEl.style.transform, 'rotate(45deg)');
    assert.equal(tagAttributes.transform, 'rotate(-45 40 88)');

    rotateComponentVisualBy(bomba, -90);

    assert.equal(bomba.rotacaoVisualGraus, 315);
    assert.equal(bomba.pressaoMaxima, 6);
    assert.equal(bomba.vazaoNominal, 42);

    applyComponentVisualRotation(bomba, 0);
    assert.equal(visualEl.style.transform, '');
    assert.equal(tagAttributes.transform, undefined);
    rotateComponentsByWheelSteps([bomba], 1);
    assert.equal(bomba.rotacaoVisualGraus, 45);
    unregisterComponentVisual(bomba);
});

test('clipboard de componentes preserva propriedades clonaveis e sufixo por idioma', async () => {
    const {
        applyComponentClipboardSnapshot,
        buildClonedComponentTag,
        createComponentClipboardSnapshot
    } = await import('../js/presentation/controllers/ClipboardController.js');
    const { FonteLogica } = await import('../js/domain/components/FonteLogica.js');
    const { BombaLogica } = await import('../js/domain/components/BombaLogica.js');
    const { TrocadorCalorLogico } = await import('../js/domain/components/TrocadorCalorLogico.js');
    const { setLanguage } = await import('../js/utils/LanguageManager.js');

    setLanguage('pt');

    const fonte = new FonteLogica('source-01', 'Entrada-01', 20, 40);
    fonte.rotacaoVisualGraus = 90;
    fonte.pressaoFonteBar = 4.2;
    fonte.vazaoMaxima = 88;
    fonte.atualizarFluidoEntrada({
        nome: 'Fluido teste',
        densidade: 910,
        viscosidadeDinamicaPaS: 0.002,
        pressaoVaporBar: 0.045,
        corVisual: '#00aa99'
    }, { presetId: 'custom' });

    const fonteSnapshot = createComponentClipboardSnapshot(fonte);
    const fonteClone = new FonteLogica('source-02', 'Entrada-02', 80, 120);
    applyComponentClipboardSnapshot(fonteSnapshot, fonteClone, {
        tag: buildClonedComponentTag(fonteSnapshot.tag)
    });

    assert.equal(fonteClone.tag, 'Entrada-01 - copia');
    assert.equal(fonteSnapshot.properties.rotacaoVisualGraus, 90);
    assert.equal(fonteClone.rotacaoVisualGraus, 90);
    assert.equal(fonteClone.pressaoFonteBar, 4.2);
    assert.equal(fonteClone.vazaoMaxima, 88);
    assert.equal(fonteClone.fluidoEntrada.nome, 'Fluido teste');
    assert.equal(fonteClone.fluidoEntrada.densidade, 910);
    assert.notEqual(fonteClone.fluidoEntrada, fonte.fluidoEntrada);

    fonteClone.fluidoEntrada.nome = 'Clone alterado';
    assert.equal(fonte.fluidoEntrada.nome, 'Fluido teste');

    const bomba = new BombaLogica('pump-01', 'P-01', 0, 0);
    bomba.grauAcionamento = 75;
    bomba.vazaoNominal = 123;
    bomba.pressaoMaxima = 6.5;
    bomba.tempoRampaSegundos = 2.75;

    const bombaSnapshot = createComponentClipboardSnapshot(bomba);
    const bombaClone = new BombaLogica('pump-02', 'P-02', 0, 0);
    applyComponentClipboardSnapshot(bombaSnapshot, bombaClone, {
        tag: buildClonedComponentTag(bombaSnapshot.tag)
    });

    assert.equal(bombaClone.tag, 'P-01 - copia');
    assert.equal(bombaClone.grauAcionamento, 75);
    assert.equal(bombaClone.vazaoNominal, 123);
    assert.equal(bombaClone.pressaoMaxima, 6.5);
    assert.equal(bombaClone.tempoRampaSegundos, 2.75);

    const trocador = new TrocadorCalorLogico('hx-01', 'TC-01', 0, 0);
    trocador.temperaturaServicoC = 12;
    trocador.uaWPorK = 4500;
    trocador.perdaLocalK = 2.2;
    trocador.efetividadeMaxima = 0.8;

    const trocadorSnapshot = createComponentClipboardSnapshot(trocador);
    const trocadorClone = new TrocadorCalorLogico('hx-02', 'TC-02', 0, 0);
    applyComponentClipboardSnapshot(trocadorSnapshot, trocadorClone, {
        tag: buildClonedComponentTag(trocadorSnapshot.tag)
    });

    assert.equal(trocadorClone.tag, 'TC-01 - copia');
    assert.equal(trocadorClone.temperaturaServicoC, 12);
    assert.equal(trocadorClone.uaWPorK, 4500);
    assert.equal(trocadorClone.perdaLocalK, 2.2);
    assert.equal(trocadorClone.efetividadeMaxima, 0.8);

    setLanguage('en');
    assert.equal(buildClonedComponentTag('Pump-01'), 'Pump-01 - copy');

    setLanguage('pt');
});

test('clipboard de grupo preserva componentes selecionados e conexoes internas', async () => {
    const {
        createComponentGroupClipboardSnapshot
    } = await import('../js/presentation/controllers/ClipboardController.js');
    const { ConnectionModel } = await import('../js/domain/models/ConnectionModel.js');
    const { FonteLogica } = await import('../js/domain/components/FonteLogica.js');
    const { ValvulaLogica } = await import('../js/domain/components/ValvulaLogica.js');
    const { DrenoLogico } = await import('../js/domain/components/DrenoLogico.js');

    const fonte = new FonteLogica('source-01', 'Entrada-01', 20, 40);
    const valvula = new ValvulaLogica('valve-01', 'V-01', 120, 40);
    const dreno = new DrenoLogico('sink-01', 'Saida-01', 220, 40);
    const conexaoInterna = new ConnectionModel({
        sourceId: fonte.id,
        targetId: valvula.id,
        diameterM: 0.12,
        roughnessMm: 0.02,
        extraLengthM: 3,
        perdaLocalK: 0.4
    });
    const conexaoExterna = new ConnectionModel({
        sourceId: valvula.id,
        targetId: dreno.id
    });

    const snapshot = createComponentGroupClipboardSnapshot(
        [fonte, valvula],
        [conexaoInterna, conexaoExterna]
    );

    assert.equal(snapshot.kind, 'component-group');
    assert.equal(snapshot.components.length, 2);
    assert.equal(snapshot.connections.length, 1);
    assert.equal(snapshot.connections[0].sourceId, fonte.id);
    assert.equal(snapshot.connections[0].targetId, valvula.id);
    assert.equal(snapshot.connections[0].diameterM, 0.12);
    assert.equal(snapshot.connections[0].extraLengthM, 3);
});

test('cores visuais acompanham os presets de fluido', async () => {
    const { FLUID_PRESETS } = await import('../js/application/config/FluidPresets.js');
    const { createFluidoFromProperties, mixFluidos } = await import('../js/domain/components/Fluido.js');
    const {
        CUSTOM_FLUID_COLOR_OPTIONS,
        getFluidVisualStyle
    } = await import('../js/infrastructure/rendering/FluidVisualStyle.js');

    assert.equal(CUSTOM_FLUID_COLOR_OPTIONS.length, 10);
    assert.equal(CUSTOM_FLUID_COLOR_OPTIONS.some((option) => option.id === 'branco'), false);
    assert.equal(CUSTOM_FLUID_COLOR_OPTIONS.some((option) => option.id === 'preto'), false);
    assert.ok(CUSTOM_FLUID_COLOR_OPTIONS.some((option) => option.id === 'cinza'));
    assert.ok(CUSTOM_FLUID_COLOR_OPTIONS.some((option) => option.id === 'verde_escuro'));
    assert.equal(getFluidVisualStyle(FLUID_PRESETS.agua).stroke, '#3498db');
    assert.equal(getFluidVisualStyle(FLUID_PRESETS.oleo_leve).stroke, '#f1c40f');
    assert.equal(getFluidVisualStyle(FLUID_PRESETS.glicol_30).stroke, '#8b5a2b');
    const customFluid = createFluidoFromProperties({
        nome: 'Fluido custom',
        corVisual: '#ff00ff'
    });
    assert.equal(getFluidVisualStyle(customFluid).stroke, '#ff00ff');

    const mistura = mixFluidos([
        { fluido: FLUID_PRESETS.agua, flowLps: 1 },
        { fluido: FLUID_PRESETS.oleo_leve, flowLps: 1 }
    ]);

    assert.notEqual(getFluidVisualStyle(mistura).stroke, '#3498db');
    assert.notEqual(getFluidVisualStyle(mistura).stroke, '#f1c40f');

    const misturaCustomizada = mixFluidos([
        { fluido: FLUID_PRESETS.agua, volumeL: 1 },
        { fluido: customFluid, volumeL: 3 }
    ]);
    assert.notEqual(getFluidVisualStyle(misturaCustomizada).stroke, '#3498db');
    assert.notEqual(getFluidVisualStyle(misturaCustomizada).stroke, '#ff00ff');
});

test('gráfico de tanque usa a cor do fluido armazenado', async () => {
    const { TanqueLogico } = await import('../js/domain/components/TanqueLogico.js');
    const { createFluidoFromProperties } = await import('../js/domain/components/Fluido.js');
    const { resolveTankChartColors } = await import('../js/infrastructure/charts/TankChartAdapter.js');

    const tanque = new TanqueLogico('tank-color', 'T-Color', 0, 0);
    tanque.fluidoConteudo = createFluidoFromProperties({
        nome: 'Fluido magenta',
        corVisual: '#ff00ff'
    });

    const colors = resolveTankChartColors(tanque);

    assert.equal(colors.lineColor, '#ff00ff');
    assert.equal(colors.fillColor, 'rgba(255, 0, 255, 0.2)');
});

test('presenter da fonte preserva custom selecionado mesmo com valores de preset', async () => {
    const { FonteLogica } = await import('../js/domain/components/FonteLogica.js');
    const { SOURCE_PROPERTIES_PRESENTER } = await import('../js/presentation/properties/component/BoundaryComponentPropertiesPresenter.js');

    const fonte = new FonteLogica('F-01', 'inlet-01', 0, 0);
    fonte.atualizarFluidoEntrada({
        nome: '\u00c1gua',
        densidade: 997,
        temperatura: 25,
        viscosidadeDinamicaPaS: 0.00089,
        pressaoVaporBar: 0.0317
    }, { presetId: 'custom' });

    const html = SOURCE_PROPERTIES_PRESENTER.render(fonte);

    assert.match(html, /<option value="custom" selected>Personalizado<\/option>/);
    assert.doesNotMatch(html, /<option value="agua" selected>/);
});
