import { getPresentationEngine } from '../context/PresentationEngineContext.js';
import { localizeElement } from '../i18n/LanguageManager.js';
import { TOOLTIPS } from './PropertyTooltips.js';
import { bindUnitControls, renderUnitControls } from './PropertyUnitsPresenter.js';
import { bindCustomSelect, renderCustomSelectHtml } from './PropertyPresenterShared.js';

export function renderDefaultProperties({
    propContent,
    onRerender
}) {
    const engine = getPresentationEngine();

    const speedOptions = [
        { value: 1, label: '1x (Tempo real)' },
        { value: 2, label: '2x (Acelerado)' },
        { value: 5, label: '5x (Rápido)' },
        { value: 10, label: '10x (Muito rápido)' }
    ];

    propContent.innerHTML = `
        ${renderUnitControls()}
        <div class="prop-group">
            <label title="${TOOLTIPS.fluido.velocidadeSimulacao}">Velocidade da Simulação</label>
            ${renderCustomSelectHtml({
                id: 'sel-vel',
                value: engine.velocidade || 1,
                title: TOOLTIPS.fluido.velocidadeSimulacao,
                options: speedOptions
            })}
        </div>
        <p title="${TOOLTIPS.painel.estadoVazio}" style="font-size: 12px; color:#95a5a6; text-align:center;">${TOOLTIPS.painel.estadoVazio}</p>
    `;
    localizeElement(propContent);

    bindUnitControls({ onChange: onRerender });
    bindCustomSelect('sel-vel', (val) => {
        engine.velocidade = parseFloat(val);
    });
}

