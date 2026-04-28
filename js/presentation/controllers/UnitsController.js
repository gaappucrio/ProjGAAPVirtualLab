export function renderUnitsPanel({ getUnitOptions, getUnitPreferences, tooltips }) {
    const prefs = getUnitPreferences();
    const categories = [
        { id: 'pressure', label: 'Pressão', hint: 'Unidade usada para exibir e editar pressão.' },
        { id: 'flow', label: 'Vazão', hint: 'Unidade usada para exibir e editar vazão.' },
        { id: 'length', label: 'Comprimento', hint: 'Unidade usada para exibir e editar comprimentos e cotas.' },
        { id: 'volume', label: 'Volume', hint: 'Unidade usada para exibir e editar volumes e capacidades.' },
        { id: 'temperature', label: 'Temperatura', hint: 'Unidade usada para exibir e editar temperatura.' }
    ];

    const selectors = categories.map(({ id, label, hint }) => {
        const options = getUnitOptions(id)
            .map((option) => `<option value="${option.id}" ${prefs[id] === option.id ? 'selected' : ''}>${option.label}</option>`)
            .join('');

        return `
            <div>
                <label title="${hint}" style="font-size:11px; color:#7f8c8d; margin-bottom:4px;">${label}</label>
                <select id="unit-pref-${id}" title="${hint}">
                    ${options}
                </select>
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
        const select = document.getElementById(`unit-pref-${category}`);
        if (!select) return;
        select.addEventListener('change', (event) => {
            setUnitPreference(category, event.target.value);
            onChange?.(category, event.target.value);
        });
    });
}
