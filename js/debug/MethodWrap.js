// =============================================
// DEBUG: troca temporária de métodos para instrumentação
// Arquivo: js/debug/MethodWrap.js
// Várias ferramentas podem envolver o mesmo método (rastreador, medidor de fases).
// Para que possam ser desligadas em qualquer ordem, cada wrapper deve virar um
// repasse simples quando inativo; a restauração só acontece se ninguém envolveu
// o método por cima depois.
// =============================================

export function wrapMethod(target, name, createWrapper) {
    const hadOwnProperty = Object.prototype.hasOwnProperty.call(target, name);
    const previous = target[name];
    const wrapper = createWrapper(previous);
    target[name] = wrapper;

    return function restore() {
        if (target[name] !== wrapper) return false;
        if (hadOwnProperty) target[name] = previous;
        else delete target[name];
        return true;
    };
}
