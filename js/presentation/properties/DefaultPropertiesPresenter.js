import { getPresentationEngine } from '../context/PresentationEngineContext.js';
import { localizeElement } from '../i18n/LanguageManager.js';
import { TOOLTIPS } from './PropertyTooltips.js';
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
            <div class="custom-select-wrapper" id="sel-vel-wrapper">
                <input type="hidden" id="sel-vel" value="1">
                <div class="custom-select-trigger" id="sel-vel-trigger" title="${TOOLTIPS.fluido.velocidadeSimulacao}">
                    <span id="sel-vel-label">1x (Tempo real)</span>
                    <span class="custom-select-arrow">▼</span>
                </div>
                <ul class="custom-select-options" id="sel-vel-options">
                    <li class="custom-select-option" data-value="1">1x (Tempo real)</li>
                    <li class="custom-select-option" data-value="2">2x (Acelerado)</li>
                    <li class="custom-select-option" data-value="5">5x (Rápido)</li>
                    <li class="custom-select-option" data-value="10">10x (Muito rápido)</li>
                </ul>
            </div>
        </div>
        <p title="${TOOLTIPS.painel.estadoVazio}" style="font-size: 12px; color:#95a5a6; text-align:center;">${TOOLTIPS.painel.estadoVazio}</p>
    `;
    localizeElement(propContent);

    bindUnitControls({ onChange: onRerender });
    
    // Custom dropdown logic
    const hiddenInput = document.getElementById('sel-vel');
    const trigger = document.getElementById('sel-vel-trigger');
    const wrapper = document.getElementById('sel-vel-wrapper');
    const label = document.getElementById('sel-vel-label');
    const options = document.querySelectorAll('#sel-vel-options .custom-select-option');

    function updateLabel(value) {
        const selectedOpt = Array.from(options).find(opt => opt.dataset.value === String(value));
        if (selectedOpt) {
            label.textContent = selectedOpt.textContent;
            options.forEach(opt => opt.classList.remove('selected'));
            selectedOpt.classList.add('selected');
        }
    }

    // Initialize value
    hiddenInput.value = engine.velocidade;
    updateLabel(engine.velocidade);

    // Toggle dropdown
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        wrapper.classList.toggle('open');
    });

    const closeDropdown = (e) => {
        if (!document.body.contains(wrapper)) {
            document.removeEventListener('click', closeDropdown);
            return;
        }
        if (!wrapper.contains(e.target)) {
            wrapper.classList.remove('open');
        }
    };
    document.addEventListener('click', closeDropdown);

    // Select option
    options.forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const val = opt.dataset.value;
            hiddenInput.value = val;
            updateLabel(val);
            wrapper.classList.remove('open');
            
            // Trigger change manually
            engine.velocidade = parseFloat(val);
        });
    });
}

