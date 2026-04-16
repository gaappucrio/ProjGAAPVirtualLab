export function renderPropertyTabs({
    basicContent = '',
    advancedContent = '',
    advancedDescription = '',
    basicLabel = 'Geral',
    advancedLabel = 'Avançado'
} = {}) {
    const basicMarkup = (basicContent || '').trim();
    const advancedMarkup = (advancedContent || '').trim();

    if (!advancedMarkup) return basicMarkup;

    const descriptionMarkup = advancedDescription
        ? `<p class="prop-tab-description">${advancedDescription}</p>`
        : '';

    return `
        <div class="prop-tabs" data-active-tab="basic">
            <div class="prop-tab-bar" role="tablist" aria-label="Seções de propriedades">
                <button type="button" class="prop-tab-button is-active" data-tab-target="basic" aria-selected="true">${basicLabel}</button>
                <button type="button" class="prop-tab-button" data-tab-target="advanced" aria-selected="false">${advancedLabel}</button>
            </div>
            <div class="prop-tab-panel is-active" data-tab-panel="basic">
                ${basicMarkup}
            </div>
            <div class="prop-tab-panel" data-tab-panel="advanced" hidden>
                ${descriptionMarkup}
                ${advancedMarkup}
            </div>
        </div>
    `;
}

export function bindPropertyTabs(root = document) {
    root.querySelectorAll('.prop-tabs').forEach((tabsEl) => {
        if (tabsEl.dataset.bound === 'true') return;
        tabsEl.dataset.bound = 'true';

        const buttons = [...tabsEl.querySelectorAll('.prop-tab-button')];
        const panels = [...tabsEl.querySelectorAll('.prop-tab-panel')];

        const activateTab = (target) => {
            buttons.forEach((button) => {
                const active = button.dataset.tabTarget === target;
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-selected', active ? 'true' : 'false');
            });

            panels.forEach((panel) => {
                const active = panel.dataset.tabPanel === target;
                panel.classList.toggle('is-active', active);
                panel.hidden = !active;
            });

            tabsEl.dataset.activeTab = target;
        };

        buttons.forEach((button) => {
            button.addEventListener('click', () => activateTab(button.dataset.tabTarget));
        });
    });
}
