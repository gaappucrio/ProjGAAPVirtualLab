import { getPresentationEngine } from '../context/PresentationEngineContext.js';
import { localizeElement } from '../../utils/I18n.js';
import { TOOLTIPS } from '../../utils/Tooltips.js';
import {
    bind,
    setValue
} from './PropertyDomAdapter.js';
import { bindUnitControls, renderUnitControls } from './PropertyUnitsPresenter.js';

export function renderDefaultProperties({
    propContent,
    onRerender
}) {
    const engine = getPresentationEngine();

    propContent.innerHTML = `
        ${renderUnitControls()}
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.velocidadeSimulacao}">Velocidade da Simulação</label>
            <select id="sel-vel" title="${TOOLTIPS.fluido.velocidadeSimulacao}">
                <option value="1">1x (Tempo real)</option>
                <option value="2">2x (Acelerado)</option>
                <option value="5">5x (Rápido)</option>
            </select>
        </div>
        <p title="${TOOLTIPS.painel.estadoVazio}" style="font-size: 12px; color:#95a5a6; text-align:center;">${TOOLTIPS.painel.estadoVazio}</p>
    `;
    localizeElement(propContent);

    bindUnitControls({ onChange: onRerender });
    setValue('sel-vel', engine.velocidade);
    bind('sel-vel', 'change', (event) => {
        engine.velocidade = parseFloat(event.target.value);
    });
}
