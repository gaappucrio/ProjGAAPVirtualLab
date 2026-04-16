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

export function activatePropertyTab(tabsEl, target = 'basic') {
    if (!tabsEl) return 'basic';

    const buttons = [...tabsEl.querySelectorAll('.prop-tab-button')];
    const panels = [...tabsEl.querySelectorAll('.prop-tab-panel')];
    const availableTargets = buttons.map((button) => button.dataset.tabTarget);
    const resolvedTarget = availableTargets.includes(target)
        ? target
        : (availableTargets[0] || 'basic');

    buttons.forEach((button) => {
        const active = button.dataset.tabTarget === resolvedTarget;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    panels.forEach((panel) => {
        const active = panel.dataset.tabPanel === resolvedTarget;
        panel.classList.toggle('is-active', active);
        panel.hidden = !active;
    });

    tabsEl.dataset.activeTab = resolvedTarget;
    return resolvedTarget;
}

export function getPropertyTabsState(root = document) {
    return [...root.querySelectorAll('.prop-tabs')]
        .map((tabsEl) => tabsEl.dataset.activeTab || 'basic');
}

export function restorePropertyTabsState(root = document, tabStates = []) {
    return [...root.querySelectorAll('.prop-tabs')]
        .map((tabsEl, index) => activatePropertyTab(tabsEl, tabStates[index] || tabsEl.dataset.activeTab || 'basic'));
}

export function bindPropertyTabs(root = document) {
    root.querySelectorAll('.prop-tabs').forEach((tabsEl) => {
        if (tabsEl.dataset.bound === 'true') return;
        tabsEl.dataset.bound = 'true';

        const buttons = [...tabsEl.querySelectorAll('.prop-tab-button')];

        buttons.forEach((button) => {
            button.addEventListener('click', () => activatePropertyTab(tabsEl, button.dataset.tabTarget));
        });
    });
}
