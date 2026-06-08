import assert from 'node:assert/strict';
import test from 'node:test';

const PRESENTATION_MODULES = [
    '../js/presentation/controllers/ClipboardController.js',
    '../js/presentation/controllers/ComponentRotationController.js',
    '../js/presentation/controllers/DeleteSelectionController.js',
    '../js/presentation/controllers/DragDropController.js',
    '../js/presentation/controllers/FlowchartController.js',
    '../js/presentation/controllers/HelpController.js',
    '../js/presentation/controllers/MonitorController.js',
    '../js/presentation/controllers/NetworkDiagnosticsController.js',
    '../js/presentation/controllers/TankSaturationAlertController.js',
    '../js/presentation/export/SimulationDataExporter.js',
    '../js/presentation/export/PumpDwsimJsonExporter.js',
    '../js/presentation/flowchart/FlowchartPersistence.js',
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
    const { ValvulaLogica } = await import('../js/domain/components/ValvulaLogica.js');

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

    const valvula = new ValvulaLogica('valve-export', 'V-Export', 180, 40);
    valvula.aplicarPerfilCaracteristica('custom');
    valvula.setCoeficienteVazao(280);
    valvula.setUnidadeCoeficienteVazao('kv');
    valvula.setConsiderarPerdaEstrangulamento(true);

    const html = buildExportHtml({
        componentes: [tanque, bomba, valvula],
        conexoes: [],
        usarAlturaRelativa: true
    });

    assert.match(html, /Resumo da exporta\u00e7\u00e3o/);
    assert.match(html, /Data da exporta\u00e7\u00e3o/);
    assert.match(html, /Altura relativa/);
    assert.match(html, /Ligada/);
    assert.match(html, /Tanque-01/);
    assert.match(html, /Bomba-01/);
    assert.match(html, /Unidade do coeficiente da v\u00e1lvula/);
    assert.match(html, /Coeficiente exibido da v\u00e1lvula/);
    assert.match(html, /Coeficiente Kv/);
    assert.match(html, /Perda de estrangulamento ativa/);
    assert.match(html, /K f\u00edsico do Cv efetivo/);
    assert.match(html, /K de estrangulamento aplicado/);
    assert.match(html, /KV/);
    assert.doesNotMatch(html, /Gr\u00e1ficos dos componentes/);
    assert.doesNotMatch(html, /export-chart-svg/);
});

test('exportação JSON de bomba usa o formato de CurveSet do DWSIM', async () => {
    const { buildPumpDwsimJsonData } = await import('../js/presentation/export/PumpDwsimJsonExporter.js');
    const { BombaLogica } = await import('../js/domain/components/BombaLogica.js');

    const bomba = new BombaLogica('pump-json', 'Bomba JSON', 0, 0);
    bomba.vazaoNominal = 40;
    bomba.pressaoMaxima = 4;
    bomba.eficienciaHidraulica = 0.75;
    bomba.npshRequeridoM = 2.2;
    const data = buildPumpDwsimJsonData({
        hydraulicContext: {
            getComponentFluid: () => ({
                nome: 'Água teste',
                densidade: 1000,
                temperatura: 25,
                viscosidadeDinamicaPaS: 0.001,
                pressaoVaporBar: 0.0317,
                pressaoAtmosfericaBar: 1.01325
            })
        }
    }, bomba);

    assert.deepEqual(Object.keys(data), [
        'Name',
        'Description',
        'ImpellerDiameter',
        'ImpellerSpeed',
        'ImpellerDiameterUnit',
        'CurveHead',
        'CurvePower',
        'CurveEfficiency',
        'CurveNPSHr'
    ]);
    assert.equal(data.Name, 'Bomba JSON');
    assert.equal(data.ImpellerDiameter, 200);
    assert.equal(data.ImpellerSpeed, 1450);
    assert.equal(data.ImpellerDiameterUnit, 'mm');

    for (const curveName of ['CurveHead', 'CurvePower', 'CurveEfficiency', 'CurveNPSHr']) {
        assert.equal(data[curveName].Enabled, true);
        assert.equal(data[curveName].CvType, 0);
        assert.equal(data[curveName].xunit, 'm3/s');
        assert.equal(data[curveName].X.length, 33);
        assert.equal(data[curveName].Y.length, 33);
        assert.equal(data[curveName].X[0], 0);
        assert.equal(data[curveName].X.at(-1), 0.04);
    }

    assert.equal(data.CurveHead.yunit, 'm');
    assert.equal(data.CurvePower.yunit, 'kW');
    assert.equal(data.CurveEfficiency.yunit, '%');
    assert.equal(data.CurveNPSHr.yunit, 'm');
    assert.ok(data.CurveHead.Y[0] > data.CurveHead.Y.at(-1));
    assert.ok(data.CurvePower.Y.some((value) => value > 0));
    assert.ok(data.CurveEfficiency.Y.every((value) => value > 0));
    assert.ok(data.CurveNPSHr.Y.at(-1) > data.CurveNPSHr.Y[0]);
});

test('alerta global de saturacao independe do painel de propriedades selecionado', async () => {
    const hadDocument = Object.hasOwn(globalThis, 'document');
    const hadWindow = Object.hasOwn(globalThis, 'window');
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;

    class FakeClassList {
        constructor() {
            this.values = new Set();
        }

        add(...classes) {
            classes.forEach((className) => this.values.add(className));
        }

        remove(...classes) {
            classes.forEach((className) => this.values.delete(className));
        }

        toggle(className, force) {
            if (force === false) this.values.delete(className);
            else this.values.add(className);
        }

        contains(className) {
            return this.values.has(className);
        }
    }

    const createElement = () => ({
        style: {},
        dataset: {},
        attributes: {},
        classList: new FakeClassList(),
        textContent: '',
        innerHTML: '',
        value: '',
        disabled: false,
        hidden: false,
        scrollHeight: 180,
        setAttribute(name, value) {
            this.attributes[name] = value;
        },
        closest() {
            return null;
        },
        querySelector() {
            return null;
        }
    });

    const popup = createElement();
    const panel = createElement();
    const title = createElement();
    const text = createElement();
    const applyButton = createElement();
    const closeButton = createElement();
    const feedback = createElement();
    panel.closest = (selector) => (selector === '.tank-saturation-popup' ? popup : null);
    panel.querySelector = (selector) => (selector === 'h4' ? title : null);

    const elements = new Map([
        ['painel-alerta-saturacao', panel],
        ['texto-alerta-saturacao', text],
        ['btn-aplicar-alerta-saturacao', applyButton],
        ['btn-ignorar-alerta-saturacao', closeButton],
        ['texto-acao-alerta-saturacao', feedback]
    ]);

    globalThis.document = {
        body: { classList: new FakeClassList() },
        getElementById: (id) => elements.get(id) || null
    };
    globalThis.window = {
        clearTimeout: () => {},
        requestAnimationFrame: (callback) => callback()
    };

    try {
        const { TanqueLogico } = await import('../js/domain/components/TanqueLogico.js');
        const { refreshTankSaturationAlertForComponents } = await import('../js/presentation/properties/TankSaturationAlertPresenter.js');

        const tank = new TanqueLogico('tank-alert', 'Tank Alert', 0, 0);
        tank.setpoint = 72;
        tank.setpointAtivo = true;
        const createAlert = (overrides = {}) => ({
            ativo: true,
            usarAlturaRelativa: false,
            vazaoSaidaLimiteSetpointLps: 12.5,
            pressaoBaseEntradaSetpointBar: 0,
            pressaoSaidaSetpointBar: 0.14,
            possuiBombasMontante: true,
            quantidadeBombasMontante: 1,
            ajustesBomba: [{
                vazaoNominalRecomendadaLps: 10,
                pressaoMaximaRecomendadaBar: 2.5
            }],
            ajustesFonte: [],
            ...overrides
        });
        tank.alertaSaturacao = createAlert();

        const visibleTank = refreshTankSaturationAlertForComponents([tank]);

        assert.equal(visibleTank, tank);
        assert.equal(panel.dataset.visible, 'true');
        assert.equal(popup.classList.contains('is-visible'), true);
        assert.match(text.innerHTML, /Set point/);

        closeButton.onclick();
        assert.equal(panel.dataset.visible, 'false');
        assert.equal(panel.style.display, 'none');

        tank.alertaSaturacao = createAlert({
            vazaoSaidaLimiteSetpointLps: 12.1,
            pressaoSaidaSetpointBar: 0.13,
            ajustesBomba: [{
                vazaoNominalRecomendadaLps: 9.8,
                pressaoMaximaRecomendadaBar: 2.45
            }]
        });
        const hiddenAfterDynamicChange = refreshTankSaturationAlertForComponents([tank]);

        assert.equal(hiddenAfterDynamicChange, null);
        assert.equal(panel.dataset.visible, 'false');

        tank.setpoint = 75;
        const visibleAfterSetpointChange = refreshTankSaturationAlertForComponents([tank]);

        assert.equal(visibleAfterSetpointChange, tank);
        assert.equal(panel.dataset.visible, 'true');

        tank.alertaSaturacao = null;
        const hiddenTank = refreshTankSaturationAlertForComponents([tank]);

        assert.equal(hiddenTank, null);
        assert.equal(panel.dataset.visible, 'false');
        assert.equal(panel.style.display, 'none');
    } finally {
        if (hadDocument) globalThis.document = originalDocument;
        else Reflect.deleteProperty(globalThis, 'document');
        if (hadWindow) globalThis.window = originalWindow;
        else Reflect.deleteProperty(globalThis, 'window');
    }
});

test('exportação em inglês localiza rótulos sem alterar nomes definidos pelo usuário', async () => {
    const { buildExportHtml } = await import('../js/presentation/export/SimulationDataExporter.js');
    const { BombaLogica } = await import('../js/domain/components/BombaLogica.js');
    const { FonteLogica } = await import('../js/domain/components/FonteLogica.js');
    const { setLanguage } = await import('../js/presentation/i18n/LanguageManager.js');

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
    } = await import('../js/presentation/i18n/LanguageManager.js');

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

test('registro visual executa limpezas ao remover componentes do canvas', async () => {
    const {
        clearComponentVisualRegistry,
        registerComponentVisual,
        removeAllComponentVisualElements,
        unregisterComponentVisual
    } = await import('../js/infrastructure/dom/ComponentVisualRegistry.js');
    const { BombaLogica } = await import('../js/domain/components/BombaLogica.js');

    clearComponentVisualRegistry();

    const bomba = new BombaLogica('pump-cleanup', 'P-Clean', 0, 0);
    let cleanupCount = 0;
    const visualEl = {
        __gaapCleanupFns: [() => { cleanupCount += 1; }],
        querySelector: () => null
    };

    registerComponentVisual(bomba, visualEl);
    unregisterComponentVisual(bomba);

    assert.equal(cleanupCount, 1);
    assert.equal(visualEl.__gaapCleanupFns.length, 0);

    const bombaRemovida = new BombaLogica('pump-remove-all', 'P-All', 0, 0);
    let removed = false;
    const visualRemovivel = {
        __gaapCleanupFns: [() => { cleanupCount += 1; }],
        querySelector: () => null,
        remove: () => { removed = true; }
    };

    registerComponentVisual(bombaRemovida, visualRemovivel);
    removeAllComponentVisualElements();

    assert.equal(cleanupCount, 2);
    assert.equal(removed, true);
});

test('binds de propriedades retornam unsubscribe para listeners de componente', async () => {
    const originalDocument = globalThis.document;
    const hadDocument = Object.hasOwn(globalThis, 'document');
    const { setPresentationEngine } = await import('../js/presentation/context/PresentationEngineContext.js');
    const { BombaLogica } = await import('../js/domain/components/BombaLogica.js');
    const { TanqueLogico } = await import('../js/domain/components/TanqueLogico.js');
    const { ValvulaLogica } = await import('../js/domain/components/ValvulaLogica.js');
    const { PUMP_PROPERTIES_PRESENTER } = await import('../js/presentation/properties/component/PumpComponentPropertiesPresenter.js');
    const { TANK_PROPERTIES_PRESENTER } = await import('../js/presentation/properties/component/TankComponentPropertiesPresenter.js');
    const { VALVE_PROPERTIES_PRESENTER } = await import('../js/presentation/properties/component/ValveComponentPropertiesPresenter.js');

    globalThis.document = {
        activeElement: null,
        body: { classList: { contains: () => false } },
        getElementById: () => null
    };
    setPresentationEngine({
        isBombaBloqueadaPorSetpoint: () => false,
        isValvulaBloqueadaPorSetpoint: () => false,
        notify: () => {}
    });

    try {
        const bomba = new BombaLogica('pump-props-cleanup', 'P-Props', 0, 0);
        const valvula = new ValvulaLogica('valve-props-cleanup', 'V-Props', 0, 0);
        const tanque = new TanqueLogico('tank-props-cleanup', 'T-Props', 0, 0);

        const cleanupPump = PUMP_PROPERTIES_PRESENTER.bind(bomba);
        assert.equal(bomba.listeners.length, 1);
        cleanupPump();
        assert.equal(bomba.listeners.length, 0);

        const cleanupValve = VALVE_PROPERTIES_PRESENTER.bind(valvula);
        assert.equal(valvula.listeners.length, 1);
        cleanupValve();
        assert.equal(valvula.listeners.length, 0);

        const cleanupTank = TANK_PROPERTIES_PRESENTER.bind(tanque);
        assert.equal(tanque.listeners.length, 1);
        cleanupTank();
        assert.equal(tanque.listeners.length, 0);
    } finally {
        setPresentationEngine(null);
        if (hadDocument) globalThis.document = originalDocument;
        else Reflect.deleteProperty(globalThis, 'document');
    }
});

test('clipboard de componentes preserva propriedades clonaveis e sufixo por idioma', async () => {
    const {
        applyComponentClipboardSnapshot,
        buildClonedComponentTag,
        createComponentClipboardSnapshot
    } = await import('../js/presentation/controllers/ClipboardController.js');
    const { FonteLogica } = await import('../js/domain/components/FonteLogica.js');
    const { BombaLogica } = await import('../js/domain/components/BombaLogica.js');
    const { ValvulaLogica } = await import('../js/domain/components/ValvulaLogica.js');
    const { TanqueLogico } = await import('../js/domain/components/TanqueLogico.js');
    const { TrocadorCalorLogico } = await import('../js/domain/components/TrocadorCalorLogico.js');
    const { setLanguage } = await import('../js/presentation/i18n/LanguageManager.js');

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

    const valvula = new ValvulaLogica('valve-clipboard-01', 'V-01', 0, 0);
    valvula.setUnidadeCoeficienteVazao('kv');
    valvula.aplicarPerfilCaracteristica('custom');
    valvula.setCoeficienteVazao(240);
    valvula.setConsiderarPerdaEstrangulamento(true);

    const valvulaSnapshot = createComponentClipboardSnapshot(valvula);
    const valvulaClone = new ValvulaLogica('valve-clipboard-02', 'V-02', 0, 0);
    applyComponentClipboardSnapshot(valvulaSnapshot, valvulaClone, {
        tag: buildClonedComponentTag(valvulaSnapshot.tag)
    });

    assert.equal(valvulaSnapshot.properties.unidadeCoeficienteVazao, 'kv');
    assert.equal(valvulaSnapshot.properties.considerarPerdaEstrangulamento, true);
    assert.equal(valvulaClone.unidadeCoeficienteVazao, 'kv');
    assert.equal(valvulaClone.cv, 240);
    assert.equal(valvulaClone.considerarPerdaEstrangulamento, true);

    const tanque = new TanqueLogico('tank-01', 'T-01', 0, 0);
    tanque.setpointAtivo = true;
    tanque.setpoint = 62;
    tanque.controladorNivelModo = 'fuzzy';
    tanque.kp = 5.5;
    tanque.ki = 0.7;
    tanque.kd = 0.3;

    const tanqueSnapshot = createComponentClipboardSnapshot(tanque);
    const tanqueClone = new TanqueLogico('tank-02', 'T-02', 0, 0);
    applyComponentClipboardSnapshot(tanqueSnapshot, tanqueClone, {
        tag: buildClonedComponentTag(tanqueSnapshot.tag)
    });

    assert.equal(tanqueClone.tag, 'T-01 - copia');
    assert.equal(tanqueClone.setpointAtivo, true);
    assert.equal(tanqueClone.setpoint, 62);
    assert.equal(tanqueClone.controladorNivelModo, 'fuzzy');
    assert.equal(tanqueClone.kp, 5.5);
    assert.equal(tanqueClone.ki, 0.7);
    assert.equal(tanqueClone.kd, 0.3);

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

test('historico de workspace refaz alteracoes apos desfazer', async () => {
    const { createUndoRedoHistory } = await import('../js/presentation/controllers/UndoController.js');

    let currentState = { value: 'A' };
    const capture = () => JSON.parse(JSON.stringify(currentState));
    const restoredStates = [];
    const history = createUndoRedoHistory({
        captureSnapshot: capture,
        restoreSnapshot: (snapshot) => {
            currentState = JSON.parse(JSON.stringify(snapshot));
            restoredStates.push(currentState.value);
            return true;
        }
    });

    history.record('initial');
    currentState = { value: 'B' };
    history.record('second');
    currentState = { value: 'C' };

    assert.equal(history.undo(), true);
    assert.equal(currentState.value, 'B');
    assert.equal(history.undo(), true);
    assert.equal(currentState.value, 'A');
    assert.equal(history.redo(), true);
    assert.equal(currentState.value, 'B');
    assert.deepEqual(restoredStates, ['B', 'A', 'B']);

    currentState = { value: 'D' };
    assert.equal(history.record('branch'), true);
    assert.equal(history.redo(), false, 'Novo registro deve limpar a pilha de redo');
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

test('perfil de pressao do pipe usa pressao resolvida ao longo da distancia', async () => {
    const { ConnectionModel } = await import('../js/domain/models/ConnectionModel.js');
    const { buildPipePressureProfile } = await import('../js/infrastructure/charts/PipePressureChartAdapter.js');
    const { setUnitPreference } = await import('../js/presentation/units/DisplayUnits.js');

    setUnitPreference('pressure', 'kpa');
    setUnitPreference('length', 'm');

    const connection = new ConnectionModel({
        sourceId: 'F-01',
        targetId: 'D-01',
        extraLengthM: 2
    });
    const profile = buildPipePressureProfile(
        connection,
        {
            sourcePressureBar: 2.4,
            pressureBar: 0.8,
            outletPressureBar: 0,
            lengthM: 12
        },
        { lengthM: 10 }
    );

    assert.equal(profile.pressureUnit, 'kPa');
    assert.equal(profile.lengthUnit, 'm');
    assert.equal(profile.pressurePoints[0].x, 0);
    assert.equal(profile.pressurePoints[0].y, 240);
    assert.equal(profile.pressurePoints.at(-1).x, 12);
    assert.equal(profile.pressurePoints.at(-1).y, 80);
    assert.deepEqual(profile.endpointPoints, [
        { x: 0, y: 240 },
        { x: 12, y: 80 }
    ]);
});

test('perfil de pressao do pipe pode usar pressao fisica de saida da origem', async () => {
    const { ConnectionModel } = await import('../js/domain/models/ConnectionModel.js');
    const { buildPipePressureProfile } = await import('../js/infrastructure/charts/PipePressureChartAdapter.js');
    const { setUnitPreference } = await import('../js/presentation/units/DisplayUnits.js');

    setUnitPreference('pressure', 'kpa');
    setUnitPreference('length', 'm');

    const connection = new ConnectionModel({
        sourceId: 'V-01',
        targetId: 'D-01'
    });
    const profile = buildPipePressureProfile(
        connection,
        {
            sourcePressureBar: 0.1094,
            pressureBar: 0.0294,
            deltaPBar: 0.08,
            outletPressureBar: 0,
            lengthM: 1
        },
        { lengthM: 1 },
        {
            sourcePressureBar: 0.3928,
            pressureDropBar: 0.08
        }
    );

    assert.ok(Math.abs(profile.pressurePoints[0].y - 39.28) < 1e-9);
    assert.ok(Math.abs(profile.pressurePoints.at(-1).y - 31.28) < 1e-9);
    assert.deepEqual(profile.endpointPoints.map((point) => ({
        x: point.x,
        y: Number(point.y.toFixed(2))
    })), [
        { x: 0, y: 39.28 },
        { x: 1, y: 31.28 }
    ]);
});

test('monitor de pipe desconta perda propria da valvula na origem', async () => {
    const { resolvePipePressureProfileOptions } = await import('../js/presentation/monitoring/PipePressureProfile.js');

    const options = resolvePipePressureProfileOptions({
        source: {
            pressaoEntradaAtualBar: 0.42518,
            pressaoSaidaAtualBar: 0.13317,
            deltaPAtualBar: 0.05235
        },
        state: {
            flowLps: 8.65916,
            sourcePressureBar: 0.13317,
            pressureBar: 0.03517,
            deltaPBar: 0.09799
        }
    });

    assert.ok(Math.abs(options.sourcePressureBar - 0.37283) < 1e-9);
    assert.ok(Math.abs(options.pressureDropBar - 0.04564) < 1e-9);
});

test('monitor de pipe prioriza perda real separada do Cano', async () => {
    const { resolvePipePressureProfileOptions } = await import('../js/presentation/monitoring/PipePressureProfile.js');

    const options = resolvePipePressureProfileOptions({
        source: {
            pressaoEntradaAtualBar: 0.4367,
            pressaoSaidaAtualBar: 0.3928,
            deltaPAtualBar: 0.0439
        },
        state: {
            flowLps: 7.908,
            sourcePressureBar: 0.1094,
            pressureBar: 0.0296,
            deltaPBar: 0.0798,
            pipeInletPressureBar: 0.3928,
            pipePressureDropBar: 0.0063,
            pipeOutletPressureBar: 0.3865
        }
    });

    assert.equal(options.sourcePressureBar, 0.3928);
    assert.equal(options.pressureDropBar, 0.0063);
});

test('grafico de valvula usa perfil selecionado e ponto operacional', async () => {
    const { ValvulaLogica, cvToKv } = await import('../js/domain/components/ValvulaLogica.js');
    const { buildValveCurveDatasets } = await import('../js/infrastructure/charts/ValveChartAdapter.js');
    const { setUnitPreference } = await import('../js/presentation/units/DisplayUnits.js');

    setUnitPreference('pressure', 'kpa');
    setUnitPreference('flow', 'm3h');

    const fluido = {
        nome: 'Agua teste',
        densidade: 997,
        viscosidadeDinamicaPaS: 0.00089
    };
    const valvula = new ValvulaLogica('valve-chart', 'V-Chart', 0, 0);
    valvula.setSimulationContextProvider(() => ({
        fluidoOperante: fluido,
        queries: {
            getComponentFluid: () => fluido,
            isValvulaBloqueadaPorSetpoint: () => false
        }
    }));
    valvula.aplicarPerfilCaracteristica('quick_opening');
    valvula.setUnidadeCoeficienteVazao('kv');
    valvula.setAbertura(50);
    valvula.fluxoReal = 7.908;
    valvula.deltaPAtualBar = 0.0437;

    const datasets = buildValveCurveDatasets(valvula);
    const quarterOpening = datasets.cvPoints.find((point) => point.x === 25);

    assert.equal(datasets.pressureUnit, 'kPa');
    assert.equal(datasets.coefficientUnit, 'kv');
    assert.equal(datasets.coefficientUnitLabel, 'Kv');
    assert.equal(datasets.currentOpeningPercent, 50);
    assert.equal(Number(datasets.currentPressureDrop.toFixed(2)), 4.37);
    assert.ok(quarterOpening.y > cvToKv(valvula.cv * 0.25), 'perfil de abertura rapida deve liberar Kv acima da curva linear');
    assert.ok(datasets.currentEffectiveCv > valvula.cv * 0.5);
    assert.ok(datasets.currentEffectiveCv < valvula.cv);
    assert.equal(Number(datasets.currentEffectiveFlowCoefficient.toFixed(6)), Number(cvToKv(datasets.currentEffectiveCv).toFixed(6)));
    assert.ok(datasets.pressureDropPoints.some((point) => Number(point.y) > 0));
    assert.ok(datasets.lossCoeffPoints.some((point) => Number(point.y) > valvula.perdaLocalK));
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

test('presenter da saida exibe pressao final calculada', async () => {
    const { DrenoLogico } = await import('../js/domain/components/DrenoLogico.js');
    const { SINK_PROPERTIES_PRESENTER } = await import('../js/presentation/properties/component/BoundaryComponentPropertiesPresenter.js');
    const { setPresentationEngine } = await import('../js/presentation/context/PresentationEngineContext.js');
    const { setUnitPreference } = await import('../js/presentation/units/DisplayUnits.js');

    setUnitPreference('pressure', 'kpa');
    const dreno = new DrenoLogico('D-01', 'Saida-01', 0, 0);
    dreno.pressaoSaidaBar = 0.0296;
    dreno.pressaoEntradaAtualBar = 0.0296;
    const inputConnection = { id: 'conn-out', targetId: dreno.id };
    setPresentationEngine({
        getInputConnections: () => [inputConnection],
        getConnectionState: () => ({
            flowLps: 7.9,
            pipeOutletPressureBar: 0.35,
            pressureBar: 0.35
        }),
        notify: () => {}
    });

    try {
        const html = SINK_PROPERTIES_PRESENTER.render(dreno);

        assert.match(html, /Press\u00e3o final da rede/);
        assert.match(html, /id="disp-pressao-final-dreno"/);
        assert.match(html, /value="35\.00"/);
        assert.match(html, /id="disp-deltap-entrada-dreno"/);
        assert.match(html, /value="32\.04"/);
        assert.match(html, /Perda de entrada \(K\)/);
    } finally {
        setPresentationEngine(null);
    }
});
