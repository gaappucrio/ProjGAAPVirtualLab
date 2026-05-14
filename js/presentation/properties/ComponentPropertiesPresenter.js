import { BombaLogica } from '../../domain/components/BombaLogica.js';
import { DrenoLogico } from '../../domain/components/DrenoLogico.js';
import { TanqueLogico } from '../../domain/components/TanqueLogico.js';
import { TrocadorCalorLogico } from '../../domain/components/TrocadorCalorLogico.js';
import { ValvulaLogica } from '../../domain/components/ValvulaLogica.js';
import { ComponentEventPayloads } from '../../application/events/EventPayloads.js';
import { bindPropertyTabs } from './PropertyTabs.js';
import { TOOLTIPS } from './PropertyTooltips.js';
import { localizeElement } from '../i18n/LanguageManager.js';
import { getComponentPropertyPresenter } from './component/ComponentPropertyPresenterRegistry.js';
import { bind } from './PropertyDomAdapter.js';
import { bindUnitControls, renderUnitControls } from './PropertyUnitsPresenter.js';
import { bindTankSaturationAlertActions } from './TankSaturationAlertPresenter.js';

export function getComponentTypeKey(component) {
    if (component instanceof DrenoLogico) return 'sink';
    if (component instanceof BombaLogica) return 'pump';
    if (component instanceof ValvulaLogica) return 'valve';
    if (component instanceof TanqueLogico) return 'tank';
    if (component instanceof TrocadorCalorLogico) return 'heat_exchanger';
    return 'source';
}

export function renderComponentProperties({
    propContent,
    component,
    onTankAdjustmentApplied
}) {
    const tipoChave = getComponentTypeKey(component);
    const propertiesPresenter = getComponentPropertyPresenter(tipoChave);

    propContent.innerHTML = `
        ${renderUnitControls()}
        <div class="prop-group">
            <label title="${TOOLTIPS.painel.tagComponente}">Tag (Nome)</label>
            <input type="text" id="input-tag" title="${TOOLTIPS.painel.tagComponente}" value="${component.tag}">
        </div>
        ${propertiesPresenter.render(component)}
    `;
    localizeElement(propContent);

    bindUnitControls();
    bindPropertyTabs(propContent);
    bind('input-tag', 'input', (event) => {
        component.tag = event.target.value;
        component.notify(ComponentEventPayloads.tagUpdate());
    });

    propertiesPresenter.bind(component);

    if (component instanceof TanqueLogico) {
        bindTankSaturationAlertActions(component, {
            onAdjustmentApplied: onTankAdjustmentApplied
        });
    }
}
