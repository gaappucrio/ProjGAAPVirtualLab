// =============================================
// DEBUG: troca temporária de métodos para instrumentação
// Arquivo: js/debug/MethodWrap.js
// Várias ferramentas podem envolver o mesmo método (rastreador, medidor de
// fases, checagens). Cada (objeto, método) recebe um único despachante com uma
// lista de camadas; ligar/desligar só adiciona ou remove camadas, em qualquer
// ordem. Quando a última camada sai, o método original volta sem resíduos.
// =============================================

const chainsByTarget = new WeakMap();

function rebuild(chain) {
    chain.composed = chain.layers.reduce((fn, layer) => layer.createWrapper(fn), chain.original);
}

function getOrCreateChain(target, name) {
    let chains = chainsByTarget.get(target);
    if (!chains) {
        chains = new Map();
        chainsByTarget.set(target, chains);
    }

    let chain = chains.get(name);
    if (!chain) {
        chain = {
            hadOwnProperty: Object.prototype.hasOwnProperty.call(target, name),
            original: target[name],
            layers: [],
            composed: null,
            dispatcher: null
        };
        chain.dispatcher = function dispatchWrappedMethod(...args) {
            return chain.composed.apply(this, args);
        };
        target[name] = chain.dispatcher;
        chains.set(name, chain);
    }
    return { chain, chains };
}

export function wrapMethod(target, name, createWrapper) {
    const { chain, chains } = getOrCreateChain(target, name);
    const layer = { createWrapper };
    chain.layers.push(layer);
    rebuild(chain);

    return function restore() {
        const index = chain.layers.indexOf(layer);
        if (index < 0) return false;

        chain.layers.splice(index, 1);
        if (chain.layers.length > 0) {
            rebuild(chain);
            return true;
        }

        // Só desfaz se ninguém de fora trocou o método depois de nós.
        if (target[name] === chain.dispatcher) {
            if (chain.hadOwnProperty) target[name] = chain.original;
            else delete target[name];
        }
        chains.delete(name);
        return true;
    };
}
