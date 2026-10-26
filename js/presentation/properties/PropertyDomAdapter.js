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

export function bind(id, eventName, handler) {
    byId(id)?.addEventListener(eventName, handler);
}

export function setHtml(id, html) {
    const element = byId(id);
    if (element) element.innerHTML = html;
    return element;
}

export function isActive(element) {
    return document.activeElement === element;
}
