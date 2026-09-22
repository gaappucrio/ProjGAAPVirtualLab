const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const escapeAttr = (value) => escapeHtml(value);

let globalDropdownListenerBound = false;

function ensureGlobalDropdownListener() {
    if (globalDropdownListenerBound || typeof document === 'undefined') return;
    document.addEventListener('click', (event) => {
        const openWrappers = document.querySelectorAll('.custom-select-wrapper.open');
        openWrappers.forEach((wrapper) => {
            if (!wrapper.contains(event.target)) {
                wrapper.classList.remove('open');
            }
        });
    });
    globalDropdownListenerBound = true;
}

export function renderCustomSelectHtml({
    id,
    value,
    options = [],
    title = '',
    disabled = false,
    wrapperClass = ''
}) {
    const stringValue = String(value ?? '');
    const selectedOption = options.find((opt) => String(opt.value) === stringValue) || options[0];
    const selectedLabel = selectedOption?.label ?? stringValue;
    const titleAttr = title ? `title="${escapeAttr(title)}"` : '';
    const disabledClass = disabled ? ' disabled' : '';
    const extraClass = wrapperClass ? ` ${wrapperClass}` : '';

    const optionsHtml = options.map((opt) => {
        const isSelected = String(opt.value) === stringValue;
        const optTitle = opt.hint ? ` title="${escapeAttr(opt.hint)}"` : '';
        const optSelectedClass = isSelected ? ' selected' : '';
        return `<li class="custom-select-option${optSelectedClass}" data-value="${escapeAttr(String(opt.value))}"${optTitle}>${escapeHtml(opt.label)}</li>`;
    }).join('\n                    ');

    return `
        <div class="custom-select-wrapper${disabledClass}${extraClass}" id="${id}-wrapper">
            <input type="hidden" id="${id}" value="${escapeAttr(stringValue)}">
            <div class="custom-select-trigger" id="${id}-trigger" ${titleAttr}>
                <span id="${id}-label">${escapeHtml(selectedLabel)}</span>
                <span class="custom-select-arrow">▼</span>
            </div>
            <ul class="custom-select-options" id="${id}-options">
                ${optionsHtml}
            </ul>
        </div>
    `.trim();
}

export function bindCustomSelect(id, onChange = null) {
    if (typeof document === 'undefined') return;
    ensureGlobalDropdownListener();

    const hiddenInput = document.getElementById(id);
    const trigger = document.getElementById(`${id}-trigger`);
    const wrapper = document.getElementById(`${id}-wrapper`);
    const label = document.getElementById(`${id}-label`);
    const options = document.querySelectorAll(`#${id}-options .custom-select-option`);

    if (!hiddenInput || !trigger || !wrapper) return;

    trigger.addEventListener('click', (event) => {
        event.stopPropagation();
        if (wrapper.classList.contains('disabled')) return;
        document.querySelectorAll('.custom-select-wrapper.open').forEach((w) => {
            if (w !== wrapper) w.classList.remove('open');
        });
        wrapper.classList.toggle('open');
    });

    options.forEach((opt) => {
        opt.addEventListener('click', (event) => {
            event.stopPropagation();
            if (wrapper.classList.contains('disabled')) return;
            const val = opt.dataset.value;
            hiddenInput.value = val;
            if (label) label.textContent = opt.textContent.trim();
            options.forEach((o) => o.classList.remove('selected'));
            opt.classList.add('selected');
            wrapper.classList.remove('open');
            hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
            hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
            onChange?.(val);
        });
    });
}

export function syncCustomSelectValue(id, value, displayLabel = null) {
    if (typeof document === 'undefined') return;
    const hiddenInput = document.getElementById(id);
    const label = document.getElementById(`${id}-label`);
    if (!hiddenInput) return;

    const stringVal = String(value ?? '');
    if (hiddenInput.value !== stringVal) {
        hiddenInput.value = stringVal;
        const options = document.querySelectorAll(`#${id}-options .custom-select-option`);
        let matchedText = '';
        options.forEach((opt) => {
            const matches = opt.dataset.value === stringVal;
            opt.classList.toggle('selected', matches);
            if (matches) matchedText = opt.textContent.trim();
        });
        if (label) {
            label.textContent = displayLabel ?? matchedText ?? stringVal;
        }
    }
}
