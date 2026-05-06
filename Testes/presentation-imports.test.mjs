import assert from 'node:assert/strict';
import test from 'node:test';

const PRESENTATION_MODULES = [
    '../js/presentation/controllers/PresentationController.js',
    '../js/presentation/controllers/HelpController.js',
    '../js/presentation/controllers/MonitorController.js',
    '../js/presentation/export/SimulationDataExporter.js',
    '../js/presentation/properties/ComponentPropertiesPresenter.js',
    '../js/presentation/properties/ConnectionPropertiesPresenter.js',
    '../js/presentation/properties/DefaultPropertiesPresenter.js',
    '../js/presentation/properties/TankSaturationAlertPresenter.js',
    '../js/presentation/properties/component/BoundaryComponentPropertiesPresenter.js',
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
