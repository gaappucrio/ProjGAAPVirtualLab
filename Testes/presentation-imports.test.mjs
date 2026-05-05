import assert from 'node:assert/strict';
import test from 'node:test';

const PRESENTATION_MODULES = [
    '../js/presentation/controllers/PresentationController.js',
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
