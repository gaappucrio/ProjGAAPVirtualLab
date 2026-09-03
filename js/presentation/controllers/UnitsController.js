export function renderUnitsPanel({ getUnitOptions, getUnitPreferences, tooltips }) {
    const prefs = getUnitPreferences();
    const categories = [
        {
            id: 'pressure',
            label: tooltips?.unidades?.categorias?.pressure?.label || 'Pressão',
            hint: tooltips?.unidades?.categorias?.pressure?.hint || 'Unidade usada para exibir e editar pressão.'
        },
        {
            id: 'flow',
            label: tooltips?.unidades?.categorias?.flow?.label || 'Vazão',
            hint: tooltips?.unidades?.categorias?.flow?.hint || 'Unidade usada para exibir e editar vazão.'
        },
        {
            id: 'length',
            label: tooltips?.unidades?.categorias?.length?.label || 'Comprimento',
            hint: tooltips?.unidades?.categorias?.length?.hint || 'Unidade usada para exibir e editar comprimentos e cotas.'
        },
        {
            id: 'volume',
            label: tooltips?.unidades?.categorias?.volume?.label || 'Volume',
            hint: tooltips?.unidades?.categorias?.volume?.hint || 'Unidade usada para exibir e editar volumes e capacidades.'
        },
        {
            id: 'temperature',
            label: tooltips?.unidades?.categorias?.temperature?.label || 'Temperatura',
            hint: tooltips?.unidades?.categorias?.temperature?.hint || 'Unidade usada para exibir e editar temperatura.'
        }
    ];

    const selectors = categories.map(({ id, label, hint }) => {
        const optionsData = getUnitOptions(id);
        const selectedOption = optionsData.find(opt => prefs[id] === opt.id) || optionsData[0];
        
        const optionsHTML = optionsData
            .map((option) => `<li class="custom-select-option ${prefs[id] === option.id ? 'selected' : ''}" data-value="${option.id}">${option.label}</li>`)
            .join('');

        return `
            <div>
                <label title="${hint}" style="font-size:11px; color:#7f8c8d; margin-bottom:4px; display:block;">${label}</label>
                <div class="custom-select-wrapper" id="unit-pref-${id}-wrapper">
                    <input type="hidden" id="unit-pref-${id}" value="${selectedOption.id}">
                    <div class="custom-select-trigger" id="unit-pref-${id}-trigger" title="${hint}">
                        <span id="unit-pref-${id}-label">${selectedOption.label}</span>
                        <span class="custom-select-arrow">▼</span>
                    </div>
                    <ul class="custom-select-options" id="unit-pref-${id}-options">
                        ${optionsHTML}
                    </ul>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="prop-group">
            <label title="${tooltips.unidades.painel}">Unidades de Exibição</label>
            <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px;">
                ${selectors}
            </div>
            <p style="margin:8px 0 0; font-size:11px; color:#7f8c8d;">${tooltips.unidades.resumoSi}</p>
        </div>
    `;
}

export function bindUnitsPanel({ setUnitPreference, onChange }) {
    ['pressure', 'flow', 'length', 'volume', 'temperature'].forEach((category) => {
        const hiddenInput = document.getElementById(`unit-pref-${category}`);
        if (!hiddenInput) return;

        const trigger = document.getElementById(`unit-pref-${category}-trigger`);
        const wrapper = document.getElementById(`unit-pref-${category}-wrapper`);
        const label = document.getElementById(`unit-pref-${category}-label`);
        const options = document.querySelectorAll(`#unit-pref-${category}-options .custom-select-option`);

        function updateLabel(value) {
            const selectedOpt = Array.from(options).find(opt => opt.dataset.value === String(value));
            if (selectedOpt) {
                label.textContent = selectedOpt.textContent;
                options.forEach(opt => opt.classList.remove('selected'));
                selectedOpt.classList.add('selected');
            }
        }

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.custom-select-wrapper.open').forEach(w => {
                if (w !== wrapper) w.classList.remove('open');
            });
            wrapper.classList.toggle('open');
        });

        options.forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = opt.dataset.value;
                hiddenInput.value = val;
                updateLabel(val);
                wrapper.classList.remove('open');
                
                setUnitPreference(category, val);
                onChange?.(category, val);
            });
        });
    });

    if (!window.__globalCustomSelectListenerAdded) {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.custom-select-wrapper')) {
                document.querySelectorAll('.custom-select-wrapper.open').forEach(w => {
                    w.classList.remove('open');
                });
            }
        });
        window.__globalCustomSelectListenerAdded = true;
    }
}
