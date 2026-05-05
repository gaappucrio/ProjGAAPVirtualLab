export function byId(id) {
    return document.getElementById(id);
}

export function valueOf(id, fallback = '') {
    return byId(id)?.value ?? fallback;
}

export function setValue(id, value) {
    const element = byId(id);
    if (element) element.value = value;
    return element;
}

export function setValueWhenBlurred(id, value) {
    const element = byId(id);
    if (element && document.activeElement !== element) element.value = value;
    return element;
}

export function bind(id, eventName, handler) {
    byId(id)?.addEventListener(eventName, handler);
}

export function setText(id, text) {
    const element = byId(id);
    if (element) element.textContent = text;
    return element;
}

export function setHtml(id, html) {
    const element = byId(id);
    if (element) element.innerHTML = html;
    return element;
}

export function setDisplay(id, display) {
    const element = byId(id);
    if (element) element.style.display = display;
    return element;
}

export function setDisabled(id, disabled) {
    const element = byId(id);
    if (element) element.disabled = disabled;
    return element;
}

export function isActive(element) {
    return document.activeElement === element;
}
