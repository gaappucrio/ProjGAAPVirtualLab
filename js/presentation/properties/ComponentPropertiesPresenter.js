import { BombaLogica } from '../../domain/components/BombaLogica.js';
import { DrenoLogico } from '../../domain/components/DrenoLogico.js';
import { TanqueLogico } from '../../domain/components/TanqueLogico.js';
import { ValvulaLogica } from '../../domain/components/ValvulaLogica.js';
import { ComponentEventPayloads } from '../../application/events/EventPayloads.js';
import { bindPropertyTabs } from '../../utils/PropertyTabs.js';
import { TOOLTIPS } from '../../utils/Tooltips.js';
import { getComponentPropertyPresenter } from './component/ComponentPropertyPresenterRegistry.js';
import { bind } from './PropertyDomAdapter.js';
import { bindUnitControls, renderUnitControls } from './PropertyUnitsPresenter.js';
import { bindTankSaturationAlertActions } from './TankSaturationAlertPresenter.js';

export function getComponentTypeKey(component) {
    if (component instanceof DrenoLogico) return 'sink';
    if (component instanceof BombaLogica) return 'pump';
    if (component instanceof ValvulaLogica) return 'valve';
    if (component instanceof TanqueLogico) return 'tank';
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
        <div id="painel-alerta-saturacao" style="display: none; background-color: #fdeaea; border-left: 4px solid #e74c3c; padding: 10px; margin-bottom: 15px; border-radius: 4px;">
            <h4 title="${TOOLTIPS.painel.alertaSaturacao}" style="margin: 0 0 5px 0; color: #c0392b; font-size: 13px;">Saída Saturada no Set Point</h4>
            <p id="texto-alerta-saturacao" style="margin: 0; font-size: 11px; color: #333;"></p>
            <button id="btn-aplicar-alerta-saturacao" type="button" title="${TOOLTIPS.painel.aplicarAjusteSaturacao}" style="display:none; margin-top:10px; padding:7px 10px; border:1px solid #c0392b; border-radius:4px; background:#fff; color:#c0392b; font-size:12px; font-weight:600; cursor:pointer;"></button>
            <p id="texto-acao-alerta-saturacao" style="margin:8px 0 0; font-size:11px;"></p>
        </div>
        ${renderUnitControls()}
        <div class="prop-group">
            <label title="${TOOLTIPS.painel.tagComponente}">Tag (Nome)</label>
            <input type="text" id="input-tag" title="${TOOLTIPS.painel.tagComponente}" value="${component.tag}">
        </div>
        ${propertiesPresenter.render(component)}
    `;

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
