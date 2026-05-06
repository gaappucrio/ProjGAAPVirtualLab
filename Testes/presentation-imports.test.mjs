import assert from 'node:assert/strict';
import test from 'node:test';

const PRESENTATION_MODULES = [
    '../js/presentation/controllers/PresentationController.js',
    '../js/presentation/controllers/HelpController.js',
    '../js/presentation/controllers/MonitorController.js',
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

test('prefixos das fronteiras usam inlet e outlet como tags estaveis', async () => {
    const {
        getComponentTagPrefix,
        setLanguage,
        translateDefaultComponentTag
    } = await import('../js/utils/I18n.js');

    setLanguage('pt');
    assert.equal(getComponentTagPrefix('source'), 'inlet');
    assert.equal(getComponentTagPrefix('sink'), 'outlet');
    assert.equal(translateDefaultComponentTag('Entrada-01'), 'inlet-01');
    assert.equal(translateDefaultComponentTag('Sa\u00edda-01'), 'outlet-01');

    setLanguage('en');
    assert.equal(getComponentTagPrefix('source'), 'inlet');
    assert.equal(getComponentTagPrefix('sink'), 'outlet');
    assert.equal(translateDefaultComponentTag('Source-01'), 'inlet-01');
    assert.equal(translateDefaultComponentTag('Sink-01'), 'outlet-01');

    setLanguage('pt');
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
