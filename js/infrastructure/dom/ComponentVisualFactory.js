// ===========================================
// INFRAESTRUTURA: Fábrica visual de equipamentos
// Arquivo: js/infrastructure/dom/ComponentVisualFactory.js
// ===========================================

import { ENGINE } from '../../application/engine/SimulationEngine.js';
import { getComponentDefinition } from '../../presentation/registry/ComponentDefinitionRegistry.js';
import { getComponentVisualSpec } from './ComponentVisualSpecs.js';
import { registerComponentVisual } from './ComponentVisualRegistry.js';
export { updatePortStates } from '../../utils/PortStateManager.js';

/* A função obterProximaTag é responsável por gerar uma nova tag única para um componente do mesmo tipo,
garantindo que não haja duplicatas. Ela verifica as tags existentes dos componentes no ENGINE,
filtra aquelas que começam com o mesmo prefixo (indicando o mesmo tipo de componente),
extrai os números sequenciais, e retorna a próxima tag disponível no formato "Prefixo-XX". */
export function obterProximaTag(prefixo) {
    const numeros = ENGINE.componentes.map(c => c.tag).filter(t => t.startsWith(prefixo + '-')).map(t => parseInt(t.split('-')[1]));
    let i = 1; while (numeros.includes(i)) i++;
    return `${prefixo}-${String(i).padStart(2, '0')}`;
}

// Função Global para gerenciar as animações das portas e indicar visualmente quais estão conectadas ou não.
// Ela percorre todas as portas no canvas e adiciona a classe 'unconnected' para aquelas que não estão conectadas a nenhuma linha.
// Em seguida, ela verifica as conexões ativas no ENGINE e remove a classe 'unconnected' das portas que estão conectadas,
// proporcionando um feedback visual claro sobre o estado de cada porta.
// Essa função deve ser chamada sempre que uma nova conexão for feita ou removida para manter a interface atualizada.

/* A classe FabricaDeEquipamentos é uma fábrica centralizada para criar os elementos visuais dos componentes.
Ela combina os metadados estáveis do registry com as specs visuais da infraestrutura DOM. */
export class FabricaDeEquipamentos {
    /* O método criar é responsável por criar o elemento visual de um componente com base no tipo,
    posição e se é para a paleta.
    Ele consulta o registry para obter as especificações do componente,
    cria o elemento div que conterá o SVG, e instancia a lógica do componente.
    O SVG é construído usando a spec visual do componente
    e os eventos de interação são configurados de acordo com as necessidades do componente
    (por exemplo, seleção, duplo clique para alternar estado, etc.).
    O método também define os atributos de dados necessários para a lógica do componente
    e retorna o elemento visual completo para ser adicionado ao workspace ou à paleta. */
    static criar(tipo, x, y, isPalette = false) {
        const spec = getComponentDefinition(tipo);
        const visualSpec = getComponentVisualSpec(tipo);
        if (!spec || !visualSpec) return console.error("Componente não registrado:", tipo);

        const id = tipo + '-' + Date.now();
        const visual = document.createElement('div');
        visual.className = 'placed-component';
        visual.style.left = `${x}px`; visual.style.top = `${y}px`; visual.style.zIndex = '10';
        visual.dataset.id = id;
        visual.dataset.logW = spec.w; visual.dataset.logH = spec.h;

        let tag = isPalette ? spec.prefixoTag : obterProximaTag(spec.prefixoTag);
        const logica = new spec.Classe(id, tag, x, y);

        visual.innerHTML = `
                    <svg viewBox="0 0 ${spec.w + 40} ${spec.h + 80}" width="${spec.w + 40}" height="${spec.h + 80}" style="left:${spec.offX}px; top:${spec.offY}px; position:absolute;">
                        ${visualSpec.svg(id, tag)}
                    </svg>`;

        if (!isPalette) {
            if (visualSpec.setup) visualSpec.setup(visual, logica, id);
            ENGINE.add(logica);
            registerComponentVisual(logica, visual);
            visual.addEventListener('mousedown', () => {
                ENGINE.selectComponent(logica);
                document.querySelectorAll('.placed-component').forEach(el => el.classList.remove('selected'));
                document.querySelectorAll('.pipe-line').forEach(el => {
                    el.classList.remove('selected');
                    if (el.classList.contains('active')) el.setAttribute("marker-end", "url(#arrow-active)");
                    else el.setAttribute("marker-end", "url(#arrow)");
                });
                visual.classList.add('selected');
            });
        }

        visual.style.width = `${spec.w}px`; visual.style.height = `${spec.h}px`;
        visual.logica = logica;
        return visual;
    }
}

